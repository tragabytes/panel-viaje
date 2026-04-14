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

  function diferenciaAngular(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

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

  async function query(queryQL, etiqueta) {
    for (let i = 0; i < MIRRORS.length; i++) {
      const url = MIRRORS[i];
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
