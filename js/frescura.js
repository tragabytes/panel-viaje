// frescura.js — ¿Sigue valiendo un dato de internet que depende de dónde estás? (D8)
//
// Sin cobertura el GPS sigue, pero Nominatim no contesta y el panel seguía
// afirmando el pueblo y la vía del último sitio con red: a 9 km, ya en
// Galapagar, decía "Las Rozas de Madrid · A-6". Cada dato recuerda dónde se
// confirmó por última vez; más allá de DISTANCIA_VIEJO_M, es viejo y se atenúa.
//
// API pública:
//   Frescura.crear() → { confirmar(lat, lon), esViejo(lat, lon) }

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const _Geo = (typeof Geo !== 'undefined') ? Geo : (typeof require !== 'undefined' ? require('./geo.js') : null);
  if (!_Geo) {
    throw new Error('frescura.js requiere que js/geo.js esté cargado antes');
  }

  // Laureano, 18/10/2026: 2 km, unos 70 s a 100 km/h.
  const DISTANCIA_VIEJO_M = 2000;

  function crear() {
    let confirmadoEn = null; // { lat, lon } de la última respuesta de verdad
    return {
      confirmar(lat, lon) {
        confirmadoEn = { lat, lon };
      },
      esViejo(lat, lon) {
        if (!confirmadoEn) return false;
        return _Geo.distanciaMetros(lat, lon, confirmadoEn.lat, confirmadoEn.lon) > DISTANCIA_VIEJO_M;
      },
    };
  }

  __global__.Frescura = { crear, DISTANCIA_VIEJO_M };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Frescura;
  }
})();
