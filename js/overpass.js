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

  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  const TIMEOUT_MS = 8000;

  // DT-03 (sesión 33): rate-limiter global y mirror-penalty.
  //   · MAX_CONCURRENTES: cuántas queries Overpass pueden estar en vuelo
  //     a la vez a través de este módulo. Todas las queries de RoadRef,
  //     MotorwayExit, Gasolineras y POIs pasan por aquí, así que el burst
  //     del primer tick queda acotado.
  //   · COLA_TIMEOUT_MS: tiempo máximo que una query espera en cola antes
  //     de rendirse con un error (no bloquea el panel indefinidamente).
  //   · PENALTY_MS: si un mirror responde 429 o 504, lo penalizamos durante
  //     este tiempo. Sigue en el array pero se prueba el último en la
  //     cascada hasta que la penalización expire.
  const MAX_CONCURRENTES = 2;
  const COLA_TIMEOUT_MS = 30000;
  const PENALTY_MS = 60000;

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
      cola.push(entrada);
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

  // Devuelve la lista de mirrors ordenados: primero los no penalizados
  // en su orden natural, luego los penalizados al final.
  function mirrorsOrdenados() {
    const ahora = Date.now();
    const libres = [];
    const penalizados = [];
    for (const m of MIRRORS) {
      if (penalizadoHasta[m] && ahora < penalizadoHasta[m]) {
        penalizados.push(m);
      } else {
        libres.push(m);
      }
    }
    return libres.concat(penalizados);
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

  async function llamarMirror(url, queryQL) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(queryQL),
        signal: controller.signal,
      });
      if (!resp.ok) {
        // DT-03: errores que indican saturación del mirror → penalizar.
        if (resp.status === 429 || resp.status === 504 || resp.status === 503) {
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
      if (err.name === 'AbortError') throw new Error('timeout');
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function query(queryQL, etiqueta) {
    // DT-03: esperar turno en el rate-limiter global antes de tocar mirrors.
    await esperarTurno(etiqueta);
    try {
      const mirrors = mirrorsOrdenados();
      for (let i = 0; i < mirrors.length; i++) {
        const url = mirrors[i];
        const nombreMirror = url.split('/')[2];
        try {
          const { datos, dt } = await llamarMirror(url, queryQL);
          if (typeof debug !== 'undefined') {
            debug.log(`${etiqueta} ${nombreMirror} OK en ${dt}ms`);
          }
          return { datos, mirror: nombreMirror, dt };
        } catch (err) {
          if (typeof debug !== 'undefined') {
            debug.log(`${etiqueta} ${nombreMirror} fallo: ${err.message}`);
          }
        }
      }
      if (typeof debug !== 'undefined') {
        debug.error(`${etiqueta}: todos los mirrors fallaron`);
      }
      throw new Error('todos_mirrors_fallaron');
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
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Overpass;
  }
})();
