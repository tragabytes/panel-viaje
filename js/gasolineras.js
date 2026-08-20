// gasolineras.js — GasolinerasModule: gasolineras cercanas (FN-01)
//
// Qué hace:
//   Dado un fix (lat, lon), devuelve hasta 5 gasolineras Overpass amenity=fuel
//   en un radio de 5 km, ordenadas por distancia. Cada elemento incluye marca
//   (brand o name) y distancia en metros.
//
// Diseño:
//   · Una consulta Overpass por entrada en zona. Refresco solo cuando el
//     usuario se aleja >REFRESCO_KM del centro de la última consulta. Las
//     gasolineras no se mueven, no hace falta refresco por tiempo.
//   · Caché solo en memoria. El IDB se reserva para POIs (más caros).
//   · Si la cascada de mirrors falla, devolvemos lista vacía silenciosa.
//     No hay alarmas: la información es complementaria.
//
// API pública:
//   Gasolineras.actualizar(lat, lon) → Promise<Array<{nombre, marca, distM, lat, lon}>>
//     Devuelve siempre un array (vacío si no hay datos o falló la consulta).
//
//   Gasolineras.reset() — vacía caché, para tests.
//
// Dependencia: overpass.js debe cargarse antes que este archivo.

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;
  // Alias para que tests Node (donde Overpass no es global aunque viva en
  // window) y navegador (donde sí lo es) funcionen igual.
  const O = (typeof Overpass !== 'undefined') ? Overpass : __global__.Overpass;

  const RADIO_KM = 5;
  const REFRESCO_KM = 2;
  const MAX_RESULTADOS = 5;
  // DT-05 (sesión 33): TTL 2h como red de seguridad. Las gasolineras no
  // cambian con frecuencia pero precios/aperturas sí; si el coche se queda
  // parado mucho, no queremos mostrar datos de hace medio día.
  const TTL_CACHE_MS = 2 * 60 * 60 * 1000;
  // RA-04: TTL corto para cachés nacidas de un fallo de red (patrón TTL_NULL
  // de roadref.js): no martillear mirrors en cada tick, pero permitir
  // recuperación rápida cuando la red vuelva.
  const TTL_FALLO_MS = 30 * 1000;

  let cache = null; // { lat, lon, lista, ts, fallo }
  let enVuelo = null; // Promise compartida si ya hay una consulta en curso

  function construirQuery(lat, lon) {
    const radio = RADIO_KM * 1000;
    return (
      `[out:json][timeout:25];` +
      `node(around:${radio},${lat},${lon})[amenity=fuel];` +
      `out body ${MAX_RESULTADOS * 4};`
    );
  }

  function parsear(datos, lat, lon) {
    if (!datos || !Array.isArray(datos.elements)) return [];
    const lista = [];
    for (const el of datos.elements) {
      if (!el || el.type !== 'node') continue;
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;
      const tags = el.tags || {};
      const marca = (tags.brand || tags.operator || '').trim();
      const nombre = (tags.name || '').trim();
      const etiqueta = marca || nombre || 'Gasolinera';
      const distM = O.distanciaMetros(lat, lon, el.lat, el.lon);
      lista.push({
        id: el.id,
        nombre: nombre || etiqueta,
        marca: marca || null,
        distM,
        lat: el.lat,
        lon: el.lon,
      });
    }
    lista.sort((a, b) => a.distM - b.distM);
    return lista.slice(0, MAX_RESULTADOS);
  }

  async function consultar(lat, lon) {
    const queryQL = construirQuery(lat, lon);
    try {
      const { datos } = await O.query(queryQL, 'Gasolineras');
      const lista = parsear(datos, lat, lon);
      if (typeof debug !== 'undefined') {
        debug.log(`Gasolineras: ${lista.length} encontradas en ${RADIO_KM}km`);
      }
      return lista;
    } catch (err) {
      if (typeof debug !== 'undefined') {
        debug.log(`Gasolineras: fallo (${err.message}) → sin cachear`);
      }
      return null;
    }
  }

  // Recalcula distancias de cada gasolinera desde la posición dada y
  // reordena por cercanía. Extraído como helper (DT-06, sesión 33) para
  // usarlo también en el path de "petición en vuelo": antes, cuando B
  // llegaba mientras A estaba en curso, B recibía la promesa de A tal
  // cual y las distancias eran las calculadas por consultar() respecto
  // a la posición de A, no de B.
  function recalcularDistancias(lista, lat, lon) {
    return lista
      .map(g => ({ ...g, distM: O.distanciaMetros(lat, lon, g.lat, g.lon) }))
      .sort((a, b) => a.distM - b.distM);
  }

  async function actualizar(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return [];

    if (cache) {
      // DT-05: invalidar por TTL si lleva demasiado tiempo. RA-04: si la
      // caché nació de un fallo de red, el TTL es el corto (TTL_FALLO_MS).
      const edadMs = Date.now() - (cache.ts || 0);
      const ttl = cache.fallo ? TTL_FALLO_MS : TTL_CACHE_MS;
      if (edadMs > ttl) {
        if (typeof debug !== 'undefined') {
          debug.log(`Gasolineras cache expirada por TTL (edad ${Math.round(edadMs / 60000)}min)`);
        }
        cache = null;
      } else {
        const dKm = O.distanciaMetros(lat, lon, cache.lat, cache.lon) / 1000;
        if (dKm < REFRESCO_KM) {
          // Caché válida: recalcular distancias desde la posición actual y devolver.
          return recalcularDistancias(cache.lista, lat, lon);
        }
      }
    }

    if (enVuelo) {
      // DT-06: recomputar con lat/lon del llamante actual, no reusar las
      // distancias tal cual venían de la consulta original.
      return enVuelo.then(lista => recalcularDistancias(lista, lat, lon));
    }

    enVuelo = (async () => {
      const lista = await consultar(lat, lon);
      if (lista === null) {
        // RA-04: fallo de red → caché vacía marcada con `fallo` para que
        // expire por TTL_FALLO_MS. El contrato público sigue devolviendo array.
        cache = { lat, lon, lista: [], ts: Date.now(), fallo: true };
        enVuelo = null;
        return [];
      }
      cache = { lat, lon, lista, ts: Date.now(), fallo: false };
      enVuelo = null;
      return lista;
    })();

    return enVuelo;
  }

  function reset() {
    cache = null;
    enVuelo = null;
  }

  __global__.Gasolineras = {
    actualizar,
    reset,
    _construirQuery: construirQuery,
    _parsear: parsear,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Gasolineras;
  }
})();
