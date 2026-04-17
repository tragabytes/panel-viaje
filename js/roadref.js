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
//   · Fallback entre mirrors: delegado a Overpass.query() (overpass.js).
//   · Caché por proximidad: 300 m. Una carretera interurbana es larga y un
//     cambio de ref real no ocurre a menos de 300 m del punto anterior.
//   · Timeout de cliente: 8 s por mirror (configurado en overpass.js).
//   · Se llama SOLO como fallback cuando Nominatim no ha dado código, no
//     por cada tick del GPS. El rate limiter vive en index.html (por el
//     dedupe + filtro de desplazamiento), aquí no hay cola.
//
// API pública:
//   RoadRef.consultar(lat, lon) → Promise<{ ref: string|null, maxspeedKmh: number|null }>
//     ref: código de carretera normalizado (mayúsculas) o null si no hay.
//     maxspeedKmh: límite de velocidad de la vía en km/h, o null si OSM no lo
//       informa o el formato no es interpretable. FN-06.
//
// Dependencia: overpass.js debe cargarse antes que este archivo.

const __global__ = (typeof window !== 'undefined') ? window : globalThis;

__global__.RoadRef = (() => {
  const RADIO_CACHE_M = 300;
  const RADIO_BUSQUEDA_M = 25;

  // La misma regex que carreteras.js usa internamente, replicada aquí
  // para no crear un acoplamiento circular. Si algún día la movemos a
  // un sitio común, basta con cambiarla en dos archivos — coste mínimo.
  const REGEX_CODIGO = /^[A-Z]{1,3}-?\d{1,4}$/i;

  let cache = null; // { lat, lon, ref, maxspeedKmh }

  // Construye la query QL. Pedimos solo tags de ways con highway y ref.
  // `out tags 3` = solo campo tags, sin coordenadas ni nodos, máximo 3
  // elementos. La respuesta típica está por debajo de 1 KB.
  function construirQuery(lat, lon) {
    return `[out:json][timeout:10];way(around:${RADIO_BUSQUEDA_M},${lat},${lon})[highway][ref];out tags 3;`;
  }

  // FN-06: parsea el tag maxspeed de OSM en km/h. Casos cubiertos:
  //   "90", "120"           → número directo en km/h
  //   "90 mph", "30 mph"    → conversión mph→km/h
  //   "ES:urban"            → 50
  //   "ES:rural"            → 90
  //   "ES:trunk"            → 100
  //   "ES:motorway"         → 120
  //   "ES:living_street"    → 20
  //   "walk"                → 6 (peatonal)
  //   "none"                → null (sin límite, no útil para alertar)
  //   ausente / vacío / otros → null
  // Devuelve un entero o null.
  const MAPA_ES = {
    'urban': 50,
    'rural': 90,
    'trunk': 100,
    'motorway': 120,
    'living_street': 20,
    'walk': 6,
  };
  function parsearMaxspeed(valor) {
    if (valor == null) return null;
    if (typeof valor === 'number' && isFinite(valor)) return Math.round(valor);
    if (typeof valor !== 'string') return null;
    const v = valor.trim().toLowerCase();
    if (!v || v === 'none' || v === 'signals' || v === 'variable') return null;
    if (v === 'walk') return MAPA_ES.walk;
    const mphMatch = v.match(/^(\d{1,3})\s*mph$/);
    if (mphMatch) return Math.round(parseInt(mphMatch[1], 10) * 1.609);
    const numMatch = v.match(/^(\d{1,3})(\s*km\/h)?$/);
    if (numMatch) return parseInt(numMatch[1], 10);
    const esMatch = v.match(/^[a-z]{2,3}:(.+)$/);
    if (esMatch && MAPA_ES[esMatch[1]] != null) return MAPA_ES[esMatch[1]];
    return null;
  }

  // Recorre los elements devueltos por Overpass, extrae la primera ref que
  // case con REGEX_CODIGO y, del mismo elemento, lee maxspeed. Si hay varias
  // refs en partes distintas (M-505;M-503), elegimos la primera que case.
  function elegirInfo(datos) {
    if (!datos || !Array.isArray(datos.elements)) return { ref: null, maxspeedKmh: null };
    for (const el of datos.elements) {
      const tags = el && el.tags;
      const refRaw = tags && tags.ref;
      if (!refRaw || typeof refRaw !== 'string') continue;
      const partes = refRaw.split(/\s*;\s*/);
      for (const parte of partes) {
        if (REGEX_CODIGO.test(parte.trim())) {
          return {
            ref: parte.trim().toUpperCase(),
            maxspeedKmh: parsearMaxspeed(tags.maxspeed),
          };
        }
      }
    }
    return { ref: null, maxspeedKmh: null };
  }

  // Compat: la API antigua devolvía solo el ref. Mantenemos un helper
  // expuesto en _elegirRef (usado por tests) que extrae el ref de _elegirInfo.
  function elegirRef(datos) {
    return elegirInfo(datos).ref;
  }

  // API pública. Devuelve siempre { ref, maxspeedKmh } (cualquiera puede ser null).
  async function consultar(lat, lon) {
    // 1) Caché por proximidad
    if (cache) {
      const d = Overpass.distanciaMetros(lat, lon, cache.lat, cache.lon);
      if (d < RADIO_CACHE_M) {
        if (typeof debug !== 'undefined') {
          debug.log(`RoadRef caché reusada (dist ${Math.round(d)}m): ${cache.ref || 'null'}${cache.maxspeedKmh != null ? ' · ' + cache.maxspeedKmh + 'km/h' : ''}`);
        }
        return { ref: cache.ref, maxspeedKmh: cache.maxspeedKmh };
      }
    }

    const queryQL = construirQuery(lat, lon);

    // 2) Cascada de mirrors (delegada a overpass.js)
    try {
      const { datos } = await Overpass.query(queryQL, 'RoadRef');
      const info = elegirInfo(datos);
      if (typeof debug !== 'undefined') {
        const n = (datos.elements || []).length;
        debug.log(`RoadRef · ${n} ways · ref=${info.ref || 'null'}${info.maxspeedKmh != null ? ' · max ' + info.maxspeedKmh + 'km/h' : ''}`);
      }
      cache = { lat, lon, ref: info.ref, maxspeedKmh: info.maxspeedKmh };
      return info;
    } catch (err) {
      // Todos los mirrors fallaron. Cacheamos null para no martillear en
      // tics sucesivos dentro del radio; el próximo movimiento >300 m
      // volverá a intentar.
      cache = { lat, lon, ref: null, maxspeedKmh: null };
      return { ref: null, maxspeedKmh: null };
    }
  }

  return {
    consultar,
    // expuestos para test
    _construirQuery: construirQuery,
    _elegirRef: elegirRef,
    _elegirInfo: elegirInfo,
    _parsearMaxspeed: parsearMaxspeed,
  };
})();

// Compat Node para tests locales
if (typeof module !== 'undefined' && module.exports) {
  module.exports = __global__.RoadRef;
}
