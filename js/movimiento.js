// js/movimiento.js — Velocidad y rumbo de cada posición del GPS.
//
// Los Android viejos dan speed y heading a null. La velocidad se estima con la
// distancia y el tiempo entre posiciones; el rumbo, entre posiciones separadas
// al menos RUMBO_MIN_M (por debajo, el ruido del GPS da rumbos al azar). Lo
// usan el radar, las marcas del cuaderno y la próxima salida: un solo rumbo
// para todo el panel (PENDIENTES n.º 6: la próxima salida leía solo el del
// GPS y, sin él, no filtraba por sentido y podía enseñar la que dejabas atrás).
//
// API pública (Movimiento):
//   Movimiento.crear() → { actualizar(coords, ahoraMs) }
//     coords: { latitude, longitude, accuracy, speed, heading } (pos.coords)
//     → { velKmh, fuenteVel: 'gps' | 'calculada' | null,
//         rumbo, fuenteRumbo: 'gps' | 'calculado' | null,
//         edadRumboMs: 0 el del GPS, lo que lleva el calculado, null sin rumbo }

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;
  const Geo = __global__.Geo || (typeof require !== 'undefined' ? require('./geo.js') : null);

  const RUMBO_MIN_M = 25;
  // Un rumbo calculado de hace más de esto ya no dice hacia dónde vas: parado
  // en un semáforo, la marca no debe llevar el sentido del último tramo.
  const RUMBO_CALCULADO_MS = 15000;
  // Con peor precisión que esto, la deriva del GPS parado supera los 25 m y
  // daría un rumbo al azar (el radar giraría en un semáforo).
  const RUMBO_PRECISION_MAX_M = 20;
  // Entre dos posiciones más separadas que esto (túnel, GPS dormido) la
  // velocidad media ya no es la de ahora.
  const VEL_HUECO_MAX_S = 60;

  const valido = (v) => v != null && !isNaN(v);

  function crear() {
    let ultimoFixVelocidad = null; // { lat, lon, ts }
    let ultimoFixRumbo = null;     // { lat, lon }
    let rumboCalculado = null;
    let rumboCalculadoTs = 0;

    function actualizar(c, ahora) {
      const lat = c.latitude, lon = c.longitude;

      const velGps = valido(c.speed) ? c.speed * 3.6 : null;
      let velKmh = velGps;
      let fuenteVel = velGps != null ? 'gps' : null;
      if (velGps == null && ultimoFixVelocidad) {
        const dtS = (ahora - ultimoFixVelocidad.ts) / 1000;
        if (dtS >= 1 && dtS <= VEL_HUECO_MAX_S) {
          velKmh = (Geo.distanciaMetros(lat, lon, ultimoFixVelocidad.lat, ultimoFixVelocidad.lon) / dtS) * 3.6;
          fuenteVel = 'calculada';
        }
      }
      ultimoFixVelocidad = { lat, lon, ts: ahora };

      const precisionOk = c.accuracy == null || c.accuracy <= RUMBO_PRECISION_MAX_M;
      if (!ultimoFixRumbo || !precisionOk) {
        if (precisionOk) ultimoFixRumbo = { lat, lon };
      } else if (Geo.distanciaMetros(ultimoFixRumbo.lat, ultimoFixRumbo.lon, lat, lon) >=
                 Math.max(RUMBO_MIN_M, 2 * (c.accuracy || 0))) {
        rumboCalculado = Geo.rumboHacia(ultimoFixRumbo.lat, ultimoFixRumbo.lon, lat, lon);
        rumboCalculadoTs = ahora;
        ultimoFixRumbo = { lat, lon };
      }

      let rumbo = valido(c.heading) ? c.heading : null;
      let fuenteRumbo = rumbo != null ? 'gps' : null;
      let edadRumboMs = rumbo != null ? 0 : null;
      if (rumbo == null && rumboCalculado != null && ahora - rumboCalculadoTs < RUMBO_CALCULADO_MS) {
        rumbo = rumboCalculado;
        fuenteRumbo = 'calculado';
        edadRumboMs = ahora - rumboCalculadoTs;
      }
      return { velKmh, fuenteVel, rumbo, fuenteRumbo, edadRumboMs };
    }

    return { actualizar };
  }

  __global__.Movimiento = { crear, RUMBO_MIN_M, RUMBO_CALCULADO_MS, RUMBO_PRECISION_MAX_M };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Movimiento;
  }
})();
