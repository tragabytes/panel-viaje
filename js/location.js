// location.js — LocationModule: geocodificación inversa con Nominatim
//
// Qué hace:
//   - obtenerUbicacion(lat, lon): municipio, provincia, CCAA (zoom 14)
//   - obtenerCarretera(lat, lon): código de carretera si estás en una (zoom 17)
//
// Respeta las reglas de Nominatim:
//   - Máximo 1 petición por segundo (1100 ms por seguridad). DT-13: el reloj
//     es una COLA serializada global — dos llamadas concurrentes ya no pueden
//     dormir sobre la misma foto del reloj y disparar a la vez.
//   - Parámetro email como identificación del cliente.
//   - Una sola petición en vuelo por función (dedupe, patrón weather.js).
//   - Caché por proximidad independiente para cada función, con radio
//     DINÁMICO según velocidad (DT-13): en marcha el radio crece hasta
//     velocidad × segundos-objetivo (ubicación ~30 s, carretera ~12 s), con
//     el radio base como suelo para el caso urbano lento o a pie.
//       · Ubicación: base 200 m (un municipio cubre un área grande)
//       · Carretera: base 80 m (un tramo cambia rápido, radio menor)
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
  // DT-05 (sesión 33): TTL de red de seguridad. Si el coche se queda
  // parado durante mucho rato (atasco, aparcamiento) las caches solo por
  // radio no expiran nunca. 30 min es conservador; los municipios/vías
  // no suelen cambiar dentro de esa ventana, pero fuerza re-chequeo.
  const TTL_CACHE_MS = 30 * 60 * 1000;

  let ultimaPeticionTs = 0;
  let cacheUbicacion = null;
  let cacheCarretera = null;
  // DT-13: dedupe de petición en vuelo por función (patrón weather.js).
  let peticionUbicacion = null;
  let peticionCarretera = null;

  // --- Utilidades ---
  //
  // DT-02 (sesión 33): distanciaMetros vive en js/geo.js.
  const distanciaMetros = Geo.distanciaMetros;

  // DT-13: cola serializada. Antes, dos llamadas concurrentes leían la misma
  // foto de ultimaPeticionTs, dormían lo mismo y disparaban A LA VEZ,
  // violando el máximo de 1 req/s de Nominatim. Ahora cada turno espera a
  // que el anterior haya fijado el reloj.
  let colaNominatim = Promise.resolve();
  function respetarLimite() {
    const turno = colaNominatim.then(async () => {
      const espera = INTERVALO_MIN_MS - (Date.now() - ultimaPeticionTs);
      if (espera > 0) await new Promise(r => setTimeout(r, espera));
      ultimaPeticionTs = Date.now();
    });
    colaNominatim = turno.catch(() => {});
    return turno;
  }

  // DT-13: radio de caché escalado con la velocidad. Objetivo de cadencia:
  // ubicación ~1 req/30 s y carretera ~1 req/12 s a velocidad sostenida
  // (a 120 km/h → radios de ~1000 m y ~400 m). Con velocidad baja o
  // desconocida manda el radio base, que preserva la precisión urbana.
  function radioDinamico(baseM, velKmh, segundosObjetivo) {
    if (typeof velKmh !== 'number' || !(velKmh > 0)) return baseM;
    return Math.max(baseM, (velKmh / 3.6) * segundosObjetivo);
  }

  async function llamarNominatim(lat, lon, zoom, conExtratags) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lon);
    url.searchParams.set('format', 'json');
    url.searchParams.set('accept-language', 'es');
    url.searchParams.set('zoom', String(zoom));
    url.searchParams.set('addressdetails', '1');
    // DT-13: extratags solo lo consume normalizarCarretera (extratags.ref,
    // zoom 17); namedetails no lo consume nadie. Pedirlos engordaba cada
    // respuesta unas centenas de bytes con el volumen sostenido del panel.
    if (conExtratags) url.searchParams.set('extratags', '1');
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

  // DT-05: invalida el cache si lleva más del TTL. Devuelve true si debe
  // re-consultarse; false si la cache es válida por tiempo.
  function cacheExpiradoPorTTL(cache, etiqueta) {
    if (!cache) return true;
    const edadMs = Date.now() - (cache.ts || 0);
    if (edadMs > TTL_CACHE_MS) {
      debug.log(`Location cache ${etiqueta} expirada por TTL (edad ${Math.round(edadMs / 60000)}min)`);
      return true;
    }
    return false;
  }

  async function obtenerUbicacion(lat, lon, velKmh) {
    if (cacheUbicacion && !cacheExpiradoPorTTL(cacheUbicacion, 'ubicación')) {
      const dist = distanciaMetros(lat, lon, cacheUbicacion.lat, cacheUbicacion.lon);
      if (dist < radioDinamico(RADIO_CACHE_UBICACION_M, velKmh, 30)) {
        return { ...cacheUbicacion.resultado, fuente: 'cache' };
      }
    }
    // DT-13: si ya hay una petición en vuelo, la reutilizamos. Con red lenta
    // los ticks se acumulaban y cada uno lanzaba su propia petición idéntica.
    if (peticionUbicacion) return peticionUbicacion;
    peticionUbicacion = (async () => {
      try {
        await respetarLimite();
        const datos = await llamarNominatim(lat, lon, 14, false);
        const resultado = normalizarUbicacion(datos);
        cacheUbicacion = { lat, lon, resultado, ts: Date.now() };
        return { ...resultado, fuente: 'nominatim' };
      } finally {
        peticionUbicacion = null;
      }
    })();
    return peticionUbicacion;
  }

  async function obtenerCarretera(lat, lon, velKmh) {
    if (cacheCarretera && !cacheExpiradoPorTTL(cacheCarretera, 'carretera')) {
      const dist = distanciaMetros(lat, lon, cacheCarretera.lat, cacheCarretera.lon);
      if (dist < radioDinamico(RADIO_CACHE_CARRETERA_M, velKmh, 12)) {
        return { ...cacheCarretera.resultado, fuente: 'cache' };
      }
    }
    if (peticionCarretera) return peticionCarretera;
    peticionCarretera = (async () => {
      try {
        await respetarLimite();
        const datos = await llamarNominatim(lat, lon, 17, true);
        const resultado = normalizarCarretera(datos);
        cacheCarretera = { lat, lon, resultado, ts: Date.now() };
        return { ...resultado, fuente: 'nominatim' };
      } finally {
        peticionCarretera = null;
      }
    })();
    return peticionCarretera;
  }

  return { obtenerUbicacion, obtenerCarretera };
})();
