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

  let cache = null; // { lat, lon, lista, ts }
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
        debug.log(`Gasolineras: fallo (${err.message}), devolviendo vacío`);
      }
      return [];
    }
  }

  async function actualizar(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return [];

    if (cache) {
      const dKm = O.distanciaMetros(lat, lon, cache.lat, cache.lon) / 1000;
      if (dKm < REFRESCO_KM) {
        // Caché válida: recalcular distancias desde la posición actual y devolver.
        return cache.lista
          .map(g => ({ ...g, distM: O.distanciaMetros(lat, lon, g.lat, g.lon) }))
          .sort((a, b) => a.distM - b.distM);
      }
    }

    if (enVuelo) return enVuelo;

    enVuelo = (async () => {
      const lista = await consultar(lat, lon);
      cache = { lat, lon, lista, ts: Date.now() };
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
