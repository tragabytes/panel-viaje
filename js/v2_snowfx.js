// js/v2_snowfx.js
// SnowFX — motor Canvas 2D de nieve para la Vista 2 (IU-15).
//
// Reutiliza el mismo patrón que RainFX (IU-13): canvas a dpr*0.75, 30 fps,
// tintado por momento del día (IU-12) y ciclo de vida rAF de DT-15 (el
// bucle solo corre con nieve y V2 en viewport; en cualquier otro caso
// tick() se detiene con cancelAnimationFrame y lo rearman setMeteo o el
// IntersectionObserver).
//
// Copos "blobby" compuestos por 4 elipses superpuestas rotadas, con
// rotación lenta propia y oscilación senoidal horizontal. Velocidad y
// densidad escalan con weather_code (71/73/75 = snow fall; 77 = grains;
// 85/86 = snow showers) y la componente horizontal del viento real.
// De noche se añade un halo frío azulado sutil.
//
// API pública:
//   SnowFX.init({ vista2? })
//   SnowFX.setMeteo(meteo)
//   SnowFX.setMomento(str)

(function () {
  'use strict';

  var FRAME_MS = 1000 / 30;
  var SCALE = 0.75;

  var PALETA = {
    dia:       { copo: 'rgba(245, 248, 253, 0.40)', halo: null },
    amanecer:  { copo: 'rgba(255, 230, 210, 0.38)', halo: 'rgba(255, 210, 180, 0.14)' },
    atardecer: { copo: 'rgba(255, 212, 200, 0.38)', halo: 'rgba(255, 190, 175, 0.14)' },
    noche:     { copo: 'rgba(215, 230, 250, 0.40)', halo: 'rgba(175, 205, 245, 0.18)' }
  };

  var canvas = null, ctx = null;
  var vista2 = null;
  var dpr = 1, cssW = 0, cssH = 0;

  var copos = [];
  var poolObjetivo = 0;
  var meteoActual = null;
  var momentoActual = 'dia';

  var reducedMotion = false;
  var visibleEnViewport = true;
  var running = false;
  var raf = null;
  var lastFrame = 0;
  var tiempoSim = 0;

  function densidadObjetivo(m) {
    var wc = m && m.weatherCode;
    if (wc === 75 || wc === 86) return 35;   // intensa
    if (wc === 73 || wc === 85) return 28;   // moderada
    if (wc === 71 || wc === 77) return 22;   // leve / grains
    return 22;
  }

  function caidaPxS(m) {
    var wc = m && m.weatherCode;
    if (wc === 75 || wc === 86) return 150;
    if (wc === 73 || wc === 85) return 120;
    return 95;
  }

  function vientoVxPxS(m) {
    if (!m) return 0;
    var kmh = (typeof m.vientoVelocidad === 'number') ? m.vientoVelocidad : 0;
    var dirDeg = (typeof m.vientoDireccion === 'number') ? m.vientoDireccion : 0;
    var ms = kmh / 3.6;
    // Factor menor que en lluvia: los copos son ligeros pero menos sensibles
    // al empuje horizontal porque su velocidad vertical es baja.
    var magnitud = ms * 12;
    var dirRad = dirDeg * Math.PI / 180;
    return -Math.sin(dirRad) * magnitud;
  }

  function spawn(c, nuevo) {
    c.x = Math.random() * cssW;
    c.y = nuevo ? Math.random() * cssH : -20 - Math.random() * 40;
    c.size = 1.6 + Math.random() * 2.4;
    c.vy = (caidaPxS(meteoActual) * (0.8 + Math.random() * 0.5)) / 30;
    c.vxBase = (vientoVxPxS(meteoActual) * (0.8 + Math.random() * 0.5)) / 30;
    c.rot = Math.random() * Math.PI * 2;
    c.vrot = (Math.random() - 0.5) * 0.04;
    c.fase = Math.random() * Math.PI * 2;
    c.ampl = 8 + Math.random() * 16;
    c.freq = 0.35 + Math.random() * 0.7;   // ciclos / s
  }

  function ajustarPool(n) {
    while (copos.length < n) {
      var c = {};
      spawn(c, true);
      copos.push(c);
    }
    if (copos.length > n) copos.length = n;
  }

  function step() {
    tiempoSim += 1 / 30;
    var yLim = cssH + 20;
    for (var i = 0; i < copos.length; i++) {
      var c = copos[i];
      var oscilVx = Math.cos(tiempoSim * c.freq * 2 * Math.PI + c.fase) * c.ampl / 30;
      c.x += c.vxBase + oscilVx;
      c.y += c.vy;
      c.rot += c.vrot;
      if (c.y > yLim) spawn(c, false);
      else if (c.x < -30 || c.x > cssW + 30) spawn(c, false);
    }
  }

  function renderCopo(c, pal) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);

    // Halo nocturno / crepuscular: círculo suave detrás del blob.
    if (pal.halo) {
      ctx.fillStyle = pal.halo;
      ctx.beginPath();
      ctx.arc(0, 0, c.size * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cuerpo blobby: 4 elipses rotadas que dan una forma tipo "estrella
    // borrosa". Más barato que un SVG y más orgánico que un círculo.
    ctx.fillStyle = pal.copo;
    for (var k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, c.size, c.size * 0.38, k * Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr * SCALE, dpr * SCALE);
    var pal = PALETA[momentoActual] || PALETA.dia;
    for (var i = 0; i < copos.length; i++) renderCopo(copos[i], pal);
    ctx.restore();
  }

  function debeAnimar() {
    return !!(meteoActual && meteoActual.categoria === 'nieve');
  }

  // DT-15: cancela el rAF y limpia pool y canvas. El bucle no vuelve a
  // correr hasta que start() lo rearme (setMeteo / IntersectionObserver).
  function stop() {
    if (!running && !raf) return;
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    copos.length = 0;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (typeof debug !== 'undefined') debug.log('SnowFX: rAF detenido');
  }

  function tick(now) {
    // Condición de parada ANTES de reprogramar: sin nieve o con V2 fuera
    // de viewport no queda ningún callback pendiente (DT-15).
    if (!visibleEnViewport || !debeAnimar()) { stop(); return; }
    raf = requestAnimationFrame(tick);
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    ajustarPool(poolObjetivo);
    step();
    render();
  }

  function start() {
    if (running || reducedMotion || !visibleEnViewport || !debeAnimar()) return;
    running = true;
    lastFrame = 0;
    raf = requestAnimationFrame(tick);
    if (typeof debug !== 'undefined') debug.log('SnowFX: rAF armado');
  }

  function renderEstatico() {
    if (!debeAnimar()) {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ajustarPool(poolObjetivo);
    for (var i = 0; i < copos.length; i++) {
      copos[i].y = Math.random() * cssH * 0.9;
    }
    render();
  }

  function resize() {
    if (!canvas || !vista2) return;
    var rect = vista2.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = Math.round(cssW * dpr * SCALE);
    canvas.height = Math.round(cssH * dpr * SCALE);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }

  function init(opts) {
    opts = opts || {};
    vista2 = opts.vista2 || document.getElementById('vista2');
    if (!vista2) {
      if (typeof debug !== 'undefined') debug.warn('SnowFX: no hay #vista2');
      return false;
    }
    reducedMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    canvas = document.createElement('canvas');
    canvas.className = 'v2-snow-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    vista2.insertBefore(canvas, vista2.firstChild || null);
    ctx = canvas.getContext('2d');
    if (!ctx) {
      if (typeof debug !== 'undefined') debug.error('SnowFX: sin contexto 2D');
      return false;
    }

    resize();
    window.addEventListener('resize', resize);

    if (typeof IntersectionObserver === 'function') {
      var iobs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visibleEnViewport = e.intersectionRatio >= 0.5;
        });
        // DT-15: rearme al volver al viewport (la parada al ocultarse la
        // hace el propio tick). start() se autoprotege si no toca animar.
        if (visibleEnViewport) start();
      }, { threshold: [0, 0.5, 1] });
      iobs.observe(vista2);
    }

    if (typeof debug !== 'undefined') {
      debug.log('SnowFX init · dpr=' + dpr.toFixed(2) +
        ' · scale=' + SCALE + ' · reducedMotion=' + reducedMotion);
    }

    if (!reducedMotion) start();
    return true;
  }

  function setMeteo(m) {
    var cambia = !meteoActual ||
      meteoActual.categoria !== (m && m.categoria) ||
      densidadObjetivo(meteoActual) !== densidadObjetivo(m);
    meteoActual = m || null;
    poolObjetivo = densidadObjetivo(meteoActual);
    if (reducedMotion) renderEstatico();
    if (cambia && typeof debug !== 'undefined') {
      debug.log('SnowFX meteo · cat=' + (m && m.categoria) +
        ' · wc=' + (m && m.weatherCode) +
        ' · pool=' + poolObjetivo);
    }
    // DT-15: rearme del bucle si esta meteo trae nieve (start() se
    // autoprotege si no toca animar).
    if (!reducedMotion) start();
  }

  function setMomento(mom) {
    if (typeof mom === 'string' && PALETA[mom]) momentoActual = mom;
  }

  window.SnowFX = {
    init: init,
    setMeteo: setMeteo,
    setMomento: setMomento
  };
})();
