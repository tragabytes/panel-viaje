// location.js — LocationModule: geocodificación inversa con Nominatim
//
// Qué hace:
//   - obtenerUbicacion(lat, lon): municipio, provincia, CCAA (zoom 14)
//   - obtenerCarretera(lat, lon): código de carretera si estás en una (zoom 17)
//
// Respeta las reglas de Nominatim:
//   - Máximo 1 petición por segundo (usamos 1100 ms por seguridad), global
//     para todas las llamadas (las dos funciones comparten el mismo reloj).
//   - Parámetro email como identificación del cliente.
//   - Caché por proximidad independiente para cada función:
//       · Ubicación: 200 m (un municipio cubre un área grande)
//       · Carretera: 80 m (un tramo cambia rápido, radio menor)
//
// API pública:
//   LocationModule.obtenerUbicacion(lat, lon)
//     → Promise<{ municipio, provincia, ccaa, fuente }>
//
//   LocationModule.obtenerCarretera(lat, lon)
//     → Promise<{ codigo, tipo, textoCrudo, fuente }>
//       codigo: "A-2", "M-505"... o null si no estás en carretera identificable
//       tipo: 'estatal' | 'autonomica' | null   (para color de pastilla)
//       textoCrudo: lo que Nominatim devolvió en address.road, para debug

const LocationModule = (() => {
  const EMAIL = 'panel-viaje@tragabytes.github.io';
  const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
  const INTERVALO_MIN_MS = 1100;
  const TIMEOUT_MS = 10000;

  const RADIO_CACHE_UBICACION_M = 200;
  const RADIO_CACHE_CARRETERA_M = 80;

  let ultimaPeticionTs = 0;
  let cacheUbicacion = null;
  let cacheCarretera = null;

  // --- Utilidades ---

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

  async function respetarLimite() {
    const ahora = Date.now();
    const transcurrido = ahora - ultimaPeticionTs;
    if (transcurrido < INTERVALO_MIN_MS) {
      const esperaMs = INTERVALO_MIN_MS - transcurrido;
      await new Promise(r => setTimeout(r, esperaMs));
    }
    ultimaPeticionTs = Date.now();
  }

  async function llamarNominatim(lat, lon, zoom) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lon);
    url.searchParams.set('format', 'json');
    url.searchParams.set('accept-language', 'es');
    url.searchParams.set('zoom', String(zoom));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('email', EMAIL);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const t0 = performance.now();
    try {
      const resp = await fetch(url.toString(), { signal: controller.signal });
      if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
      const datos = await resp.json();
      const dt = Math.round(performance.now() - t0);
      debug.log(`Nominatim z${zoom} OK en ${dt}ms`);
      return datos;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Nominatim timeout');
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- Normalizadores ---

  function normalizarUbicacion(datos) {
    const addr = datos.address || {};
    const municipio =
      addr.city || addr.town || addr.village ||
      addr.hamlet || addr.municipality || null;
    const ccaa = addr.state || null;
    // Uniprovinciales (Madrid, Asturias, etc.): no hay province, usamos CCAA.
    const provincia = addr.province || ccaa || null;
    return { municipio, provincia, ccaa };
  }

  function normalizarCarretera(datos) {
    const addr = datos.address || {};
    // El campo road es el más habitual. extratags.ref es donde más a menudo
    // está el código limpio cuando OSM lo expone. Pasamos los dos a
    // extraerCodigo, que decide cuál usar.
    const textoCrudo = addr.road || addr.highway || null;
    const refExtra = (datos.extratags && datos.extratags.ref) || null;

    // extraerCodigo devuelve { codigo, tipo } o null.
    const resultado = Carreteras.extraerCodigo({ ref: refExtra, road: textoCrudo });

    return {
      codigo: resultado ? resultado.codigo : null,
      tipo:   resultado ? resultado.tipo   : null,  // 'estatal' | 'autonomica' | null
      textoCrudo: textoCrudo || refExtra || null
    };
  }

  // --- API pública ---

  async function obtenerUbicacion(lat, lon) {
    if (cacheUbicacion) {
      const dist = distanciaMetros(lat, lon, cacheUbicacion.lat, cacheUbicacion.lon);
      if (dist < RADIO_CACHE_UBICACION_M) {
        return { ...cacheUbicacion.resultado, fuente: 'cache' };
      }
    }
    await respetarLimite();
    const datos = await llamarNominatim(lat, lon, 14);
    const resultado = normalizarUbicacion(datos);
    cacheUbicacion = { lat, lon, resultado };
    return { ...resultado, fuente: 'nominatim' };
  }

  async function obtenerCarretera(lat, lon) {
    if (cacheCarretera) {
      const dist = distanciaMetros(lat, lon, cacheCarretera.lat, cacheCarretera.lon);
      if (dist < RADIO_CACHE_CARRETERA_M) {
        return { ...cacheCarretera.resultado, fuente: 'cache' };
      }
    }
    await respetarLimite();
    const datos = await llamarNominatim(lat, lon, 17);
    const resultado = normalizarCarretera(datos);
    cacheCarretera = { lat, lon, resultado };
    return { ...resultado, fuente: 'nominatim' };
  }

  return { obtenerUbicacion, obtenerCarretera };
})();
