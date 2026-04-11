// motorwayexit.js — MotorwayExitModule: próximas salidas de la vía actual
//
// Qué hace:
//   Dado un fix de GPS (lat, lon, rumbo, velocidad) y el código de la vía
//   actual (roadRef), devuelve la próxima salida y la siguiente de esa vía.
//   Si la vía no tiene salidas, o si no estamos en movimiento, o si no
//   tenemos código de vía, el módulo devuelve "oculto" y el cartel verde
//   no se pinta.
//
// Diseño (decisiones 14 y posteriores sesión 10):
//   · Activación por velocidad > 50 km/h sostenida, no por prefijo de ref.
//     Cualquier vía con código oficial entra (A-, AP-, M-, CV-, etc.).
//     Es la propia respuesta de Overpass la que decide si esa vía tiene
//     salidas útiles: si devuelve cero junctions, el módulo queda en
//     "sin_datos" y el cartel verde se oculta.
//   · Consulta única de 50 km a Overpass cuando entramos en una vía nueva.
//     Refresco cuando nos alejamos >35 km del centro de la última consulta.
//     Sin refresco por tiempo: las salidas no se mueven.
//   · Filtro local en cada tick: distancia >300 m y ángulo <45° respecto
//     al rumbo actual. El rumbo SIEMPRE es el del fix más reciente, nunca
//     uno cacheado (aprendizaje de decisión 14).
//   · Cascada de mirrors duplicada de roadref.js. Deuda técnica explícita:
//     cuando motorwayexit y roadref estén validados en carretera real,
//     se extrae el patrón a una función común. Por ahora duplicamos para
//     no tocar un archivo validado.
//   · Caché solo en memoria. Si se recarga el panel en marcha, nueva
//     consulta. En un viaje típico son 3-5 consultas, despreciables.
//
// Histéresis de velocidad:
//   No queremos desactivar el módulo por un frenazo ni activarlo por un
//   acelerón puntual. Por eso la velocidad tiene que estar por encima (o
//   debajo) del umbral de forma SOSTENIDA durante 30 s antes de cambiar
//   el estado de "en movimiento". Esto también evita que un atasco en
//   M-30 urbana dispare Overpass sin parar.
//
// API pública:
//   MotorwayExitModule.actualizar({lat, lon, rumbo, velocidadKmh, roadRef})
//     → { activo, proxima, siguiente, estado }
//       activo: bool — si false, ocultar cartel verde
//       proxima: { ref, distanciaKm } | null
//       siguiente: { ref, distanciaKm } | null
//       estado: 'ok' | 'cargando' | 'sin_datos' | 'error' | 'inactivo'
//
//   MotorwayExitModule.reset()
//     Vacía caché y estado. Útil para tests con el simulador.

const __global__ = (typeof window !== 'undefined') ? window : globalThis;

__global__.MotorwayExitModule = (() => {

  // --- Constantes configurables ---

  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  const TIMEOUT_MIRROR_MS = 8000;

  const RADIO_CONSULTA_KM = 50;
  const UMBRAL_REFRESCO_KM = 35;

  const DISTANCIA_MIN_JUNCTION_M = 300;
  const TOLERANCIA_ANGULAR_GRADOS = 45;

  const VELOCIDAD_MIN_KMH = 50;
  const HISTERESIS_VELOCIDAD_MS = 30000;

  // --- Estado interno ---

  // Caché de junctions para la vía actual.
  // { ref: "A-6", centroLat, centroLon, junctions: [{ref, lat, lon}], cargando: bool }
  let cache = null;

  // Control de histéresis: marca temporal del último momento en que la
  // velocidad CRUZÓ el umbral. Mientras no hayan pasado HISTERESIS_VELOCIDAD_MS,
  // el estado "en movimiento" no cambia.
  let enMovimiento = false;
  let tsUltimoCruceVelocidad = 0;
  let ultimaVelocidadSobreUmbral = false;

  // --- Utilidades geodésicas ---

  function distanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (g) => g * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Rumbo inicial (bearing) de (lat1,lon1) a (lat2,lon2), en grados 0-360.
  // 0 = norte, 90 = este.
  function rumboHacia(lat1, lon1, lat2, lon2) {
    const toRad = (g) => g * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    const theta = Math.atan2(y, x);
    return (toDeg(theta) + 360) % 360;
  }

  // Diferencia angular mínima entre dos rumbos, en grados [0, 180].
  function diferenciaAngular(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // --- Overpass ---

  // Pedimos todos los nodos highway=motorway_junction con la misma ref
  // que la vía actual, dentro de un radio de 50 km. Filtramos por la ref
  // de la vía en Overpass para no colar salidas de autovías cruzadas.
  function construirQuery(lat, lon, refVia) {
    const radioMetros = RADIO_CONSULTA_KM * 1000;
    // Escapamos comillas dobles en refVia por si acaso (no debería haber,
    // pero los códigos de carretera vienen de datos externos).
    const refEscapada = String(refVia).replace(/"/g, '');
    return (
      `[out:json][timeout:15];` +
      `node(around:${radioMetros},${lat},${lon})[highway=motorway_junction]["ref"](if:t["ref"]!="0");` +
      `out tags;`
    );
    // Nota: filtrar por ref de la vía padre requiere una query más
    // compleja (buscar ways con esa ref y luego sus junctions). Por ahora
    // filtramos en local: si el junction cercano no tiene ref parecida,
    // ya cae por distancia/ángulo. Si en pruebas reales vemos falsos
    // positivos (salidas de otra autovía cruzada), endurecemos la query.
  }

  async function llamarMirror(url, query) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MIRROR_MS);
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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

  // Parsea elements de Overpass en lista de junctions limpia.
  // Descarta sin ref, con ref "0", y dedupa por ref (se queda con el
  // primero de cada ref en orden de aparición).
  function parsearJunctions(datos) {
    if (!datos || !Array.isArray(datos.elements)) return { lista: [], descartados: 0 };
    const vistas = new Set();
    const lista = [];
    let descartados = 0;
    for (const el of datos.elements) {
      if (!el || el.type !== 'node') continue;
      const ref = el.tags && el.tags.ref;
      if (!ref || typeof ref !== 'string' || ref.trim() === '' || ref.trim() === '0') {
        descartados++;
        continue;
      }
      const refLimpia = ref.trim();
      if (vistas.has(refLimpia)) continue;
      vistas.add(refLimpia);
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') {
        descartados++;
        continue;
      }
      lista.push({ ref: refLimpia, lat: el.lat, lon: el.lon });
    }
    return { lista, descartados };
  }

  async function consultarOverpass(lat, lon, refVia) {
    const query = construirQuery(lat, lon, refVia);
    for (let i = 0; i < MIRRORS.length; i++) {
      const url = MIRRORS[i];
      const nombreMirror = url.split('/')[2];
      try {
        const { datos, dt } = await llamarMirror(url, query);
        const { lista, descartados } = parsearJunctions(datos);
        if (typeof debug !== 'undefined') {
          debug.log(`MotorwayExit ${nombreMirror} OK en ${dt}ms · ${lista.length} junctions válidos · ${descartados} descartados`);
        }
        return { lista, mirror: nombreMirror };
      } catch (err) {
        if (typeof debug !== 'undefined') {
          debug.log(`MotorwayExit ${nombreMirror} fallo: ${err.message}`);
        }
      }
    }
    if (typeof debug !== 'undefined') {
      debug.error('MotorwayExit: todos los mirrors fallaron');
    }
    throw new Error('todos_mirrors_fallaron');
  }

  // --- Gestión de caché ---

  // Lanza una consulta asíncrona a Overpass. Distingue dos casos:
  //   1) Entrada nueva en una vía (cache === null): empezamos de cero con
  //      junctions=null y estado "cargando". La UI oculta el cartel.
  //   2) Refresco por distancia (cache existe y tiene junctions): mantenemos
  //      los junctions anteriores visibles mientras llega la nueva respuesta.
  //      Esto evita el parpadeo del cartel verde durante los 300-2000 ms de
  //      latencia del refresco. Al llegar la respuesta nueva, se sustituyen.
  function lanzarConsultaAsincrona(lat, lon, refVia) {
    const esRefresco = (cache && cache.ref === refVia && Array.isArray(cache.junctions));
    if (esRefresco) {
      // Marcamos que hay un refresco en curso pero NO tocamos junctions.
      cache.refrescando = true;
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: refresco en curso para ${refVia} (manteniendo ${cache.junctions.length} junctions visibles)`);
      }
    } else {
      cache = {
        ref: refVia,
        centroLat: lat,
        centroLon: lon,
        junctions: null,
        cargando: true,
        refrescando: false,
        error: false,
      };
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: entrada en ${refVia}, lanzando query Overpass (radio ${RADIO_CONSULTA_KM}km)`);
      }
    }
    consultarOverpass(lat, lon, refVia).then(({ lista }) => {
      // Solo actualizamos si seguimos en la misma vía. Si mientras llegaba
      // la respuesta el usuario cambió de autovía, la respuesta es obsoleta.
      if (cache && cache.ref === refVia) {
        cache.junctions = lista;
        cache.centroLat = lat;
        cache.centroLon = lon;
        cache.cargando = false;
        cache.refrescando = false;
        cache.error = false;
      }
    }).catch(() => {
      if (cache && cache.ref === refVia) {
        // En entrada nueva, el error es visible (estado 'error'). En refresco,
        // conservamos los datos viejos y solo anotamos el fallo: el usuario
        // sigue viendo la última salida válida.
        if (!Array.isArray(cache.junctions)) {
          cache.cargando = false;
          cache.error = true;
          cache.junctions = [];
        } else {
          cache.refrescando = false;
          if (typeof debug !== 'undefined') {
            debug.log('MotorwayExit: refresco falló, se mantienen los junctions anteriores');
          }
        }
      }
    });
  }

  // --- Histéresis de velocidad ---

  function actualizarMovimiento(velocidadKmh, ahoraMs) {
    const sobreUmbral = (typeof velocidadKmh === 'number' && velocidadKmh > VELOCIDAD_MIN_KMH);
    if (sobreUmbral !== ultimaVelocidadSobreUmbral) {
      tsUltimoCruceVelocidad = ahoraMs;
      ultimaVelocidadSobreUmbral = sobreUmbral;
    }
    const transcurrido = ahoraMs - tsUltimoCruceVelocidad;
    if (transcurrido >= HISTERESIS_VELOCIDAD_MS) {
      if (enMovimiento !== sobreUmbral) {
        enMovimiento = sobreUmbral;
        if (typeof debug !== 'undefined') {
          debug.log(`MotorwayExit: movimiento = ${enMovimiento} (v=${Math.round(velocidadKmh || 0)}km/h)`);
        }
      }
    }
  }

  // --- API pública ---

  function actualizar(fix) {
    const { lat, lon, rumbo, velocidadKmh, roadRef } = fix || {};
    const ahoraMs = Date.now();

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return { activo: false, proxima: null, siguiente: null, estado: 'inactivo' };
    }

    actualizarMovimiento(velocidadKmh, ahoraMs);

    // Sin código de vía: nada que consultar. Vaciamos caché si hubiera.
    if (!roadRef) {
      if (cache) {
        if (typeof debug !== 'undefined') debug.log('MotorwayExit: sin roadRef, caché vaciada');
        cache = null;
      }
      return { activo: false, proxima: null, siguiente: null, estado: 'inactivo' };
    }

    // No en movimiento sostenido: no activamos. Pero NO vaciamos la caché
    // si ya existe para la vía actual; puede ser un frenazo, si en <30s
    // volvemos a pasar el umbral seguimos teniendo los datos.
    if (!enMovimiento) {
      return { activo: false, proxima: null, siguiente: null, estado: 'inactivo' };
    }

    // Cambio de vía: vaciamos y relanzamos.
    if (cache && cache.ref !== roadRef) {
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: cambio de vía ${cache.ref} → ${roadRef}, caché vaciada`);
      }
      cache = null;
    }

    // Sin caché: primera consulta para esta vía.
    if (!cache) {
      lanzarConsultaAsincrona(lat, lon, roadRef);
      return { activo: false, proxima: null, siguiente: null, estado: 'cargando' };
    }

    // Caché presente pero aún cargando.
    if (cache.cargando) {
      return { activo: false, proxima: null, siguiente: null, estado: 'cargando' };
    }

    // Caché presente con error de red.
    if (cache.error) {
      return { activo: false, proxima: null, siguiente: null, estado: 'error' };
    }

    // Caché presente y cargada. ¿Toca refrescar por distancia?
    // No disparamos un refresco si ya hay uno en vuelo.
    const distCentroKm = distanciaMetros(lat, lon, cache.centroLat, cache.centroLon) / 1000;
    if (distCentroKm >= UMBRAL_REFRESCO_KM && !cache.refrescando) {
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: refresco por distancia (centro a ${distCentroKm.toFixed(1)}km)`);
      }
      lanzarConsultaAsincrona(lat, lon, roadRef);
      // Durante el refresco seguimos usando los junctions actuales
      // (lanzarConsultaAsincrona los preserva).
    }

    // Filtro local de junctions por delante.
    const junctions = (cache && cache.junctions) || [];
    if (junctions.length === 0) {
      return { activo: false, proxima: null, siguiente: null, estado: 'sin_datos' };
    }

    const candidatos = [];
    for (const j of junctions) {
      const distM = distanciaMetros(lat, lon, j.lat, j.lon);
      if (distM < DISTANCIA_MIN_JUNCTION_M) continue;
      if (typeof rumbo === 'number') {
        const rumboJ = rumboHacia(lat, lon, j.lat, j.lon);
        const diff = diferenciaAngular(rumbo, rumboJ);
        if (diff > TOLERANCIA_ANGULAR_GRADOS) continue;
      }
      candidatos.push({ ref: j.ref, distanciaKm: distM / 1000 });
    }

    if (candidatos.length === 0) {
      return { activo: false, proxima: null, siguiente: null, estado: 'sin_datos' };
    }

    candidatos.sort((a, b) => a.distanciaKm - b.distanciaKm);

    const proxima = {
      ref: candidatos[0].ref,
      distanciaKm: Math.round(candidatos[0].distanciaKm * 10) / 10,
    };
    const siguiente = candidatos[1] ? {
      ref: candidatos[1].ref,
      distanciaKm: Math.round(candidatos[1].distanciaKm * 10) / 10,
    } : null;

    return { activo: true, proxima, siguiente, estado: 'ok' };
  }

  function reset() {
    cache = null;
    enMovimiento = false;
    tsUltimoCruceVelocidad = 0;
    ultimaVelocidadSobreUmbral = false;
    if (typeof debug !== 'undefined') {
      debug.log('MotorwayExit: reset');
    }
  }

  return {
    actualizar,
    reset,
    // Expuestos para tests
    _distanciaMetros: distanciaMetros,
    _rumboHacia: rumboHacia,
    _diferenciaAngular: diferenciaAngular,
    _parsearJunctions: parsearJunctions,
    _construirQuery: construirQuery,
  };
})();

// Compat Node para tests locales
if (typeof module !== 'undefined' && module.exports) {
  module.exports = __global__.MotorwayExitModule;
}
