// overpass.js — Cascada de mirrors Overpass + utilidades geodésicas compartidas
//
// Extraído de roadref.js y motorwayexit.js (PO-05, sesión 14) para evitar
// triplicar el código con POIModule.
//
// API pública:
//   Overpass.query(queryQL, etiqueta)
//     → Promise<{ datos, mirror, dt }>
//     Envía la query QL a la cascada de mirrors con timeout y fallback.
//     etiqueta es un string para los logs de debug ("RoadRef", "MotorwayExit"...).
//     Lanza Error('todos_mirrors_fallaron') si ninguno responde.
//
//   Overpass.distanciaMetros(lat1, lon1, lat2, lon2) → number
//   Overpass.rumboHacia(lat1, lon1, lat2, lon2) → number [0-360]
//   Overpass.diferenciaAngular(a, b) → number [0-180]

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  // overpass.kumi.systems ya no está: es el mismo servidor que
  // overpass.private.coffee (misma IP), así que caído uno, caían los dos (D7).
  // maps.mail.ru (D40): el tercero, con datos de todo el mundo y CORS abierto;
  // el 19/10/2026 contestó una consulta en 14 s y la siguiente dio 504.
  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  // D40: lo más que se espera a un servidor. Era 8 s, y el 19/10/2026 el
  // principal tardaba 22 s en contestar cualquier cosa (hasta su página de
  // estado) y 28-34 s la consulta de pueblos: con 8 s no llegaba nunca.
  const TIMEOUT_MS = 45000;
  // D7 + D40: si a los 8 s uno no ha contestado, se pregunta también al
  // siguiente sin cortar al primero, y gana el que conteste antes. Así un
  // servidor callado no frena la vía, y uno lento pero vivo sí llega.
  const RELEVO_MS = 8000;

  // DT-03 (sesión 33): rate-limiter global y mirror-penalty.
  //   · MAX_CONCURRENTES: cuántas queries Overpass pueden estar en vuelo
  //     a la vez a través de este módulo. Todas las queries de RoadRef,
  //     MotorwayExit, Gasolineras y POIs pasan por aquí, así que el burst
  //     del primer tick queda acotado.
  //   · COLA_TIMEOUT_MS: tiempo máximo que una query espera en cola antes
  //     de rendirse con un error (no bloquea el panel indefinidamente). Dos
  //     esperas largas (D40).
  //   · PENALTY_MS: un servidor que falla (error 429 o 5xx, sin respuesta,
  //     se calla o tarda más que otro) se aparta este tiempo: no se le
  //     pregunta hasta que pase (D40; antes se le preguntaba el último).
  const MAX_CONCURRENTES = 2;
  const COLA_TIMEOUT_MS = 2 * TIMEOUT_MS;
  const PENALTY_MS = 60000;

  // D7: la vía es la consulta más ligera y la que más se mira; no espera en
  // la fila detrás de pueblos y puntos de interés.
  const PRIORITARIAS = new Set(['RoadRef']);

  let enVueloCount = 0;
  const cola = [];  // array de { resolve, reject, etiqueta, tsEncolado }
  const penalizadoHasta = Object.create(null); // mirrorUrl → timestamp fin

  function esperarTurno(etiqueta) {
    if (enVueloCount < MAX_CONCURRENTES) {
      enVueloCount++;
      return Promise.resolve();
    }
    if (typeof debug !== 'undefined') {
      debug.log(`Overpass cola: ${etiqueta} esperando (${enVueloCount} activas, ${cola.length} en cola)`);
    }
    return new Promise((resolve, reject) => {
      const entrada = { resolve, reject, etiqueta, tsEncolado: Date.now() };
      if (PRIORITARIAS.has(etiqueta)) {
        // D40: con un servidor lento se amontonaban en la fila consultas de la
        // vía que, al llegarles el turno, eran de otro sitio. La nueva sustituye
        // a la que esperaba.
        const vieja = cola.findIndex((e) => e.etiqueta === etiqueta);
        if (vieja !== -1) {
          const [quitada] = cola.splice(vieja, 1);
          clearTimeout(quitada.timerId);
          quitada.reject(new Error('reemplazada'));
        }
        cola.unshift(entrada);
      } else {
        cola.push(entrada);
      }
      // Timeout anti-bloqueo: si llevan demasiado en cola, rechazar.
      entrada.timerId = setTimeout(() => {
        const i = cola.indexOf(entrada);
        if (i !== -1) {
          cola.splice(i, 1);
          if (typeof debug !== 'undefined') {
            debug.warn(`Overpass cola: ${etiqueta} timeout en cola (${COLA_TIMEOUT_MS / 1000}s)`);
          }
          reject(new Error('cola_timeout'));
        }
      }, COLA_TIMEOUT_MS);
    });
  }

  function liberarTurno() {
    if (cola.length > 0) {
      const siguiente = cola.shift();
      clearTimeout(siguiente.timerId);
      // enVueloCount no baja; el turno se pasa directamente al siguiente.
      siguiente.resolve();
    } else {
      enVueloCount = Math.max(0, enVueloCount - 1);
    }
  }

  // D40: los mirrors no apartados, en su orden natural. A un apartado no se
  // le pregunta: el 18/10 se llamó 31 veces en un cuarto de hora a uno roto.
  function mirrorsLibres() {
    const ahora = Date.now();
    return MIRRORS.filter((m) => !(penalizadoHasta[m] && ahora < penalizadoHasta[m]));
  }

  function penalizarMirror(url, motivo) {
    penalizadoHasta[url] = Date.now() + PENALTY_MS;
    if (typeof debug !== 'undefined') {
      const host = url.split('/')[2];
      debug.warn(`Overpass penaliza ${host} ${PENALTY_MS / 1000}s (${motivo})`);
    }
  }

  // --- Utilidades geodésicas ---
  //
  // DT-02 (sesión 33): las 3 funciones viven ahora en js/geo.js. Aquí las
  // exponemos como alias (Overpass.distanciaMetros, etc.) para no romper
  // consumidores existentes. Nuevo código debería usar Geo.* directamente.
  const _Geo = (typeof Geo !== 'undefined') ? Geo : (typeof require !== 'undefined' ? require('./geo.js') : null);
  if (!_Geo) {
    throw new Error('overpass.js requiere que js/geo.js esté cargado antes');
  }
  const distanciaMetros = _Geo.distanciaMetros;
  const rumboHacia = _Geo.rumboHacia;
  const diferenciaAngular = _Geo.diferenciaAngular;

  // --- Cascada de mirrors ---

  // `cancelar` (AbortSignal) corta la petición sin apartar al servidor: es que
  // otro ya ha contestado.
  async function llamarMirror(url, queryQL, cancelar) {
    const controller = new AbortController();
    let porTiempo = false;
    const timeoutId = setTimeout(() => { porTiempo = true; controller.abort(); }, TIMEOUT_MS);
    const alCancelar = () => controller.abort();
    if (cancelar) cancelar.addEventListener('abort', alCancelar);
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(queryQL),
        signal: controller.signal,
      });
      if (!resp.ok) {
        // DT-03: errores que indican saturación o avería del mirror → penalizar.
        if (resp.status === 429 || resp.status >= 500) {
          penalizarMirror(url, `HTTP ${resp.status}`);
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const datos = await resp.json();
      const dt = Math.round(
        ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0
      );
      return { datos, dt };
    } catch (err) {
      // D7: un servidor que se calla se aparta igual que uno que dice
      // "saturado"; si no, cada consulta le vuelve a esperar.
      if (err.name === 'AbortError') {
        if (!porTiempo) throw new Error('cancelada');
        penalizarMirror(url, 'timeout');
        throw new Error('timeout');
      }
      // D40: un servidor roto que contesta 500 sin cabeceras CORS llega aquí
      // como "Failed to fetch", igual que sin red. Se aparta igual.
      if (err instanceof TypeError) penalizarMirror(url, 'sin respuesta');
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (cancelar) cancelar.removeEventListener('abort', alCancelar);
    }
  }

  // D7 + D40: se pregunta al primero; si a los RELEVO_MS no ha contestado,
  // también al siguiente (sin cortar al primero), y si uno falla, al siguiente
  // en el acto. Gana la primera respuesta; a los que llevaban RELEVO_MS o más
  // sin contestar se les aparta por lentos, para no esperarles en la próxima.
  function carrera(mirrors, queryQL, etiqueta) {
    return new Promise((resolve, reject) => {
      const cancelar = new AbortController();
      const preguntados = new Map(); // url en vuelo → cuándo se le preguntó
      let siguiente = 0;
      let relevo = null;
      let terminado = false;

      function preguntar(porRelevo) {
        clearTimeout(relevo);
        if (terminado || siguiente >= mirrors.length) return;
        const url = mirrors[siguiente++];
        const host = url.split('/')[2];
        if (porRelevo && typeof debug !== 'undefined') {
          debug.log(`${etiqueta}: sin respuesta en ${RELEVO_MS / 1000} s, pregunto también a ${host}`);
        }
        preguntados.set(url, Date.now());
        if (siguiente < mirrors.length) relevo = setTimeout(() => preguntar(true), RELEVO_MS);
        llamarMirror(url, queryQL, cancelar.signal).then(({ datos, dt }) => {
          preguntados.delete(url);
          if (terminado) return;
          terminado = true;
          clearTimeout(relevo);
          const ahora = Date.now();
          for (const [otro, desde] of preguntados) {
            if (ahora - desde >= RELEVO_MS) penalizarMirror(otro, 'lento');
          }
          cancelar.abort();
          if (typeof debug !== 'undefined') debug.log(`${etiqueta} ${host} OK en ${dt}ms`);
          resolve({ datos, mirror: host, dt });
        }, (err) => {
          preguntados.delete(url);
          if (terminado) return;
          if (typeof debug !== 'undefined') debug.log(`${etiqueta} ${host} fallo: ${err.message}`);
          if (siguiente < mirrors.length) {
            preguntar(false);
          } else if (preguntados.size === 0) {
            terminado = true;
            if (typeof debug !== 'undefined') debug.error(`${etiqueta}: todos los mirrors fallaron`);
            reject(new Error('todos_mirrors_fallaron'));
          }
        });
      }

      preguntar(false);
    });
  }

  async function query(queryQL, etiqueta) {
    // DT-03: esperar turno en el rate-limiter global antes de tocar mirrors.
    await esperarTurno(etiqueta);
    try {
      const mirrors = mirrorsLibres();
      if (mirrors.length === 0) {
        if (typeof debug !== 'undefined') {
          debug.log(`${etiqueta}: todos los servidores apartados por fallos recientes; no se pregunta`);
        }
        throw new Error('todos_mirrors_fallaron');
      }
      return await carrera(mirrors, queryQL, etiqueta);
    } finally {
      liberarTurno();
    }
  }

  __global__.Overpass = {
    query,
    distanciaMetros,
    rumboHacia,
    diferenciaAngular,
    // Constantes expuestas para que los consumidores puedan referenciarlas
    MIRRORS,
    TIMEOUT_MS,
    RELEVO_MS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Overpass;
  }
})();
