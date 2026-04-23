// geo.js — Utilidades geodésicas compartidas (DT-02, sesión 33).
//
// Qué hace:
//   Expone funciones puras de cálculo geográfico que antes estaban
//   duplicadas en 6 archivos del proyecto (trayectos.js, location.js,
//   weather.js, simulator.js, overpass.js y el JS inline de index.html).
//
// API pública (window.Geo):
//   distanciaMetros(lat1, lon1, lat2, lon2)  → number (metros)
//     Distancia haversine entre dos puntos sobre la Tierra, en metros.
//   rumboHacia(lat1, lon1, lat2, lon2)       → number [0, 360)
//     Rumbo inicial (bearing) desde (lat1,lon1) hacia (lat2,lon2) en grados.
//     0° = Norte, 90° = Este, 180° = Sur, 270° = Oeste.
//   diferenciaAngular(a, b)                  → number [0, 180]
//     Diferencia angular mínima entre dos ángulos en grados.
//
// Dependencias: ninguna. Debe cargarse como PRIMER script en index.html
// para que overpass.js y el resto puedan consumirlo.

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

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

  __global__.Geo = {
    distanciaMetros,
    rumboHacia,
    diferenciaAngular,
  };

  // Compat Node para tests locales
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Geo;
  }
})();
