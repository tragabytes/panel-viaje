// location.js — LocationModule: geocodificación inversa con Nominatim
//
// Qué hace:
//   Dada una posición GPS (lat, lon), devuelve municipio, provincia y CCAA
//   consultando Nominatim (OpenStreetMap) a zoom 14.
//
// Respeta las reglas de Nominatim:
//   - Máximo 1 petición por segundo (usamos 1100 ms por seguridad)
//   - Parámetro email como identificación del cliente
//   - Caché por proximidad: si la nueva posición está a <200 m de la
//     última consultada, reutilizamos la respuesta anterior sin llamar.
//
// API pública:
//   LocationModule.obtenerUbicacion(lat, lon)
//     → devuelve una Promise que resuelve con un objeto:
//       { municipio, provincia, ccaa, fuente }
//     fuente puede ser "nominatim" (petición nueva) o "cache" (reutilizada).
//     Si Nominatim falla, la Promise se rechaza con el error.

const LocationModule = (() => {
  const EMAIL = 'panel-viaje@tragabytes.github.io';
  const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
  const INTERVALO_MIN_MS = 1100;   // 1 req/s con margen
  const RADIO_CACHE_M = 200;       // si te mueves menos, reusamos caché
  const TIMEOUT_MS = 10000;

  let ultimaPeticionTs = 0;
  let cacheUltima = null;  // { lat, lon, resultado }

  // Distancia Haversine en metros
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

  // Espera hasta que haya pasado INTERVALO_MIN_MS desde la última petición
  async function respetarLimite() {
    const ahora = Date.now();
    const transcurrido = ahora - ultimaPeticionTs;
    if (transcurrido < INTERVALO_MIN_MS) {
      const esperaMs = INTERVALO_MIN_MS - transcurrido;
      debug.log(`Esperando ${esperaMs}ms por límite Nominatim`);
      await new Promise(r => setTimeout(r, esperaMs));
    }
    ultimaPeticionTs = Date.now();
  }

  // Normaliza la respuesta cruda de Nominatim al formato que usamos.
  // Ojo con uniprovinciales (Madrid, Asturias, Cantabria, Navarra, La Rioja,
  // Murcia, Baleares): Nominatim no devuelve `province` porque la CCAA y la
  // provincia son administrativamente lo mismo. En esos casos, usamos la CCAA
  // como provincia.
  function normalizar(datos) {
    const addr = datos.address || {};
    const municipio =
      addr.city || addr.town || addr.village ||
      addr.hamlet || addr.municipality || null;
    const ccaa = addr.state || null;
    // Provincia: primero la explícita; si no, la CCAA (uniprovinciales).
    // NO usamos addr.county porque devuelve cosas como "Área metropolitana".
    const provincia = addr.province || ccaa || null;
    return { municipio, provincia, ccaa };
  }

  async function llamarNominatim(lat, lon) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lon);
    url.searchParams.set('format', 'json');
    url.searchParams.set('accept-language', 'es');
    url.searchParams.set('zoom', '14');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('email', EMAIL);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const t0 = performance.now();
    try {
      const resp = await fetch(url.toString(), { signal: controller.signal });
      if (!resp.ok) {
        throw new Error(`Nominatim HTTP ${resp.status}`);
      }
      const datos = await resp.json();
      const dt = Math.round(performance.now() - t0);
      debug.log(`Nominatim OK en ${dt}ms`);
      return normalizar(datos);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Nominatim timeout');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function obtenerUbicacion(lat, lon) {
    // ¿Podemos servir desde caché?
    if (cacheUltima) {
      const dist = distanciaMetros(lat, lon, cacheUltima.lat, cacheUltima.lon);
      if (dist < RADIO_CACHE_M) {
        return { ...cacheUltima.resultado, fuente: 'cache' };
      }
    }

    // Nueva petición
    await respetarLimite();
    const resultado = await llamarNominatim(lat, lon);
    cacheUltima = { lat, lon, resultado };
    return { ...resultado, fuente: 'nominatim' };
  }

  return { obtenerUbicacion };
})();
