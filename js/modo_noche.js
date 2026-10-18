// js/modo_noche.js — De noche, el panel baja el brillo.
//
// Conduciendo de noche, el blanco y el verde fósforo del panel deslumbran en la
// cabina a oscuras. Desde la puesta del sol el brillo baja poco a poco hasta el
// 70 % en 40 minutos (lo que dura el crepúsculo en España), y vuelve a subir en
// los 40 minutos antes de la salida: en escalones de un 1 %, que no se notan.
// Sin internet: la salida y la puesta se calculan en el móvil
// (PaisajeFX.salidaPuesta) con la posición del GPS; hasta el primer GPS, Madrid.
//
// Qué baja (css/style.css e index.html, con la variable --brillo): las letras,
// los verdes, el relieve del radar y las fotos. El rojo del exceso de velocidad
// no baja: es un aviso. ?hora=HH:MM lo pinta a esa hora, como el paisaje.
//
// API pública (ModoNoche):
//   ModoNoche.iniciar()          → aplica el brillo de ahora y lo revisa cada minuto
//   ModoNoche.posicion(lat, lon) → en cada tick de GPS
//   Pura (probada en Node): brillo(ahoraMs, salidaMs, puestaMs) → 0,7 … 1

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const BRILLO_NOCHE = 0.7;
  const CREPUSCULO_MS = 40 * 60 * 1000;
  const REVISION_MS = 60 * 1000;

  function brillo(ahora, salida, puesta) {
    if (!(salida < puesta)) return 1;
    if (ahora >= salida && ahora <= puesta) return 1;
    const desdeLaLuz = ahora > puesta ? ahora - puesta : salida - ahora;
    return 1 - (1 - BRILLO_NOCHE) * Math.min(1, desdeLaLuz / CREPUSCULO_MS);
  }

  let pos = { lat: 40.42, lon: -3.70 };
  let conGps = false;
  let desfaseHora = 0;
  let aplicado = null;
  let objetivo = null;
  let paso = null;

  function leerHora() {
    try {
      const h = new URLSearchParams(location.search).get('hora');
      if (h && /^\d{1,2}:\d{2}$/.test(h)) {
        const [hh, mm] = h.split(':').map(Number);
        const d = new Date();
        desfaseHora = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime() - Date.now();
      }
    } catch (e) { /* sin bandera */ }
  }

  function pintar(pct) {
    aplicado = pct;
    const raiz = document.documentElement;
    raiz.style.setProperty('--brillo', pct + '%');
    raiz.classList.toggle('panel-noche', pct < 100);
    if (pct === objetivo && typeof debug !== 'undefined') debug.log(`Modo noche: brillo ${pct} %`);
  }

  // Hacia el brillo que toca, de punto en punto cada segundo: hasta el primer
  // GPS se calcula con el sol de Madrid, y en Vigo o Girona al anochecer la
  // posición de verdad podía cambiarlo 20 puntos de golpe.
  function acercar() {
    if (aplicado === objetivo) { clearInterval(paso); paso = null; return; }
    pintar(aplicado + Math.sign(objetivo - aplicado));
  }

  function aplicar() {
    if (!__global__.PaisajeFX) return;
    const ahora = Date.now() + desfaseHora;
    const sol = PaisajeFX.salidaPuesta(ahora, pos.lat, pos.lon);
    objetivo = Math.round(brillo(ahora, sol.salida, sol.puesta) * 100);
    if (aplicado == null) { pintar(objetivo); return; } // al encender, directo
    if (objetivo !== aplicado && !paso) paso = setInterval(acercar, 1000);
  }

  function iniciar() {
    leerHora();
    aplicar();
    setInterval(aplicar, REVISION_MS);
  }

  function posicion(lat, lon) {
    pos = { lat, lon };
    if (!conGps) { conGps = true; aplicar(); }
  }

  __global__.ModoNoche = { iniciar, posicion, brillo, BRILLO_NOCHE, CREPUSCULO_MS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.ModoNoche;
  }
})();
