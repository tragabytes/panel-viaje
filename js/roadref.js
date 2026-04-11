// roadref.js — Rescate de ref de carretera vía Overpass API
//
// Problema que resuelve:
//   Nominatim reverse a zoom 17 NO siempre expone extratags.ref. En
//   carreteras autonómicas con nombre popular ("Carretera de El Escorial"
//   para la M-505), devuelve solo el nombre descriptivo en address.road
//   y no la ref. Resultado: el panel caía al modo "texto discreto" aunque
//   la vía sí tenga código oficial en OSM.
//
// Qué hace:
//   RoadRef.consultar(lat, lon) → Promise<string|null>
//     Pregunta a Overpass por los ways con highway y ref en un radio de
//     25 m alrededor del punto y devuelve la primera ref que parezca un
//     código de carretera española (casa con REGEX_CODIGO de carreteras.js).
//     Devuelve null si no hay ways con ref, si Overpass falla, o si lo que
//     devuelve no casa con ningún formato de código conocido.
//
// Diseño (decisión 22, sesión 9.8):
//   · Query mínima: way(around:25)[highway][ref]; out tags 3;
//     Solo tags, máximo 3 ways, sin geometría. Respuesta por debajo de 1 KB.
//   · Fallback entre mirrors: overpass-api.de → kumi.systems → private.coffee.
//     Aprendizaje de sesiones 05/06: los mirrors de Overpass son inestables,
//     hay que poder saltar al siguiente.
//   · Caché por proximidad: 300 m. Una carretera interurbana es larga y un
//     cambio de ref real no ocurre a menos de 300 m del punto anterior.
//   · Timeout de cliente: 8 s por mirror. Aprendizaje del P09: no confiar
//     en que Overpass responda rápido siempre.
//   · Se llama SOLO como fallback cuando Nominatim no ha dado código, no
//     por cada tick del GPS. El rate limiter vive en index.html (por el
//     dedupe + filtro de desplazamiento), aquí no hay cola.
//
// API pública:
//   RoadRef.consultar(lat, lon) → Promise<string|null>

const RoadRef = (() => {
  const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  const TIMEOUT_MS = 8000;
  const RADIO_CACHE_M = 300;
  const RADIO_BUSQUEDA_M = 25;

  // La misma regex que carreteras.js usa internamente, replicada aquí
  // para no crear un acoplamiento circular. Si algún día la movemos a
  // un sitio común, basta con cambiarla en dos archivos — coste mínimo.
  const REGEX_CODIGO = /^[A-Z]{1,3}-?\d{1,4}$/i;

  let cache = null; // { lat, lon, ref }

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

  // Construye la query QL. Pedimos solo tags de ways con highway y ref.
  // `out tags 3` = solo campo tags, sin coordenadas ni nodos, máximo 3
  // elementos. La respuesta típica está por debajo de 1 KB.
  function construirQuery(lat, lon) {
    return `[out:json][timeout:10];way(around:${RADIO_BUSQUEDA_M},${lat},${lon})[highway][ref];out tags 3;`;
  }

  // Llama a un mirror concreto con timeout. Devuelve el JSON parseado
  // si todo va bien, o lanza error.
  async function llamarMirror(url, query) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

  // Recorre los elements devueltos por Overpass, extrae la primera ref
  // que case con REGEX_CODIGO. Si hay varias, se queda con la primera:
  // la estrategia "mejor de varias" se puede refinar después si hace falta.
  function elegirRef(datos) {
    if (!datos || !Array.isArray(datos.elements)) return null;
    for (const el of datos.elements) {
      const ref = el && el.tags && el.tags.ref;
      if (!ref || typeof ref !== 'string') continue;
      // Una ref puede venir como "M-505" o como "M-505;M-503" (cuando dos
      // carreteras comparten way). Tomamos la primera que case.
      const partes = ref.split(/\s*;\s*/);
      for (const parte of partes) {
        if (REGEX_CODIGO.test(parte.trim())) {
          return parte.trim().toUpperCase();
        }
      }
    }
    return null;
  }

  // API pública.
  async function consultar(lat, lon) {
    // 1) Caché por proximidad
    if (cache) {
      const d = distanciaMetros(lat, lon, cache.lat, cache.lon);
      if (d < RADIO_CACHE_M) {
        if (typeof debug !== 'undefined') {
          debug.log(`RoadRef caché reusada (dist ${Math.round(d)}m): ${cache.ref || 'null'}`);
        }
        return cache.ref;
      }
    }

    const query = construirQuery(lat, lon);

    // 2) Cascada de mirrors
    for (let i = 0; i < MIRRORS.length; i++) {
      const url = MIRRORS[i];
      const nombreMirror = url.split('/')[2];
      try {
        const { datos, dt } = await llamarMirror(url, query);
        const ref = elegirRef(datos);
        if (typeof debug !== 'undefined') {
          const n = (datos.elements || []).length;
          debug.log(`RoadRef ${nombreMirror} OK en ${dt}ms · ${n} ways · ref=${ref || 'null'}`);
        }
        cache = { lat, lon, ref };
        return ref;
      } catch (err) {
        if (typeof debug !== 'undefined') {
          debug.log(`RoadRef ${nombreMirror} fallo: ${err.message}`);
        }
        // Probamos el siguiente mirror
      }
    }

    // 3) Todos los mirrors fallaron. Cacheamos null para no martillear en
    //    tics sucesivos dentro del radio; el próximo movimiento >300 m
    //    volverá a intentar.
    if (typeof debug !== 'undefined') {
      debug.error('RoadRef: todos los mirrors fallaron');
    }
    cache = { lat, lon, ref: null };
    return null;
  }

  return {
    consultar,
    // expuestos para test
    _construirQuery: construirQuery,
    _elegirRef: elegirRef,
  };
})();

// Compat Node para tests locales
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoadRef;
}
