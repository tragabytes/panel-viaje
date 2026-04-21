// js/v2_rainfx.js
// RainFX — motor Canvas 2D de lluvia realista para la Vista 2 (IU-13).
//
// Sustituye a la lluvia CSS de IU-10. Crea un <canvas> absoluto dentro
// de #vista2, pool de 18-50 gotas según intensidad real (mm/h), con
// inclinación derivada del viento, impactos elípticos al tocar el borde
// inferior, y tintado por momento del día (IU-12). Respeta
// prefers-reduced-motion (único frame estático) y pausa el RAF cuando
// V2 sale del viewport.
//
// API pública:
//   RainFX.init({ vista2? })  → crea canvas y arranca (o estático si RM)
//   RainFX.setMeteo(meteo)    → actualiza densidad, velocidad, viento
//   RainFX.setMomento(str)    → 'dia' | 'amanecer' | 'atardecer' | 'noche'

(function () {
  'use strict';

  var FRAME_MS = 1000 / 30;            // 30 fps fijo
  var SCALE = 0.75;                    // resolución canvas = dpr * 0.75

  // Paletas por momento del día. Opacidad <= 0.4 (regla full-inmersión).
  var PALETA = {
    dia:       { gota: 'rgba(200, 220, 240, 0.38)', brillo: 'rgba(255, 255, 255, 0.40)', splash: 'rgba(220, 230, 240, ' },
    amanecer:  { gota: 'rgba(255, 210, 180, 0.35)', brillo: 'rgba(255, 230, 200, 0.40)', splash: 'rgba(255, 220, 195, ' },
    atardecer: { gota: 'rgba(255, 190, 170, 0.35)', brillo: 'rgba(255, 215, 200, 0.40)', splash: 'rgba(255, 200, 185, ' },
    noche:     { gota: 'rgba(170, 200, 240, 0.38)', brillo: 'rgba(220, 230, 250, 0.35)', splash: 'rgba(200, 220, 240, ' }
  };

  var canvas = null, ctx = null;
  var vista2 = null;
  var dpr = 1, cssW = 0, cssH = 0;

  var gotas = [];
  var splashes = [];
  var poolObjetivo = 0;

  var meteoActual = null;
  var momentoActual = 'dia';

  var reducedMotion = false;
  var visibleEnViewport = true;
  var running = false;
  var raf = null;
  var lastFrame = 0;

  // --- Derivaciones meteo ---

  function mmPorHora(m) {
    if (!m) return 0;
    if (typeof m.precipitacion === 'number' && m.precipitacion > 0) {
      return m.precipitacion;
    }
    // Fallback por weather_code WMO cuando Open-Meteo aún no reporta mm/h.
    switch (m.weatherCode) {
      case 51: return 0.5;  case 53: return 1.5;  case 55: return 3;
      case 56: return 1.5;  case 57: return 3;
      case 61: return 2;    case 63: return 5;    case 65: return 12;
      case 66: return 2;    case 67: return 12;
      case 80: return 3;    case 81: return 6;    case 82: return 15;
      case 95: case 96: case 99: return 10;
      default: return 2;
    }
  }

  function densidadObjetivo(mmH) {
    if (mmH < 1)  return 18;
    if (mmH < 3)  return 28;
    if (mmH < 8)  return 40;
    return 50;
  }

  function velocidadCaidaPxS(mmH) {
    if (mmH < 1) return 450;
    if (mmH < 3) return 600;
    if (mmH < 8) return 800;
    return 1000;
  }

  // Componente horizontal del viento en px/s. La convención meteo dice
  // wind_direction = dirección DESDE donde sopla (0° = N, 90° = E).
  // Así que viento desde 90° empuja hacia el oeste: vx negativo.
  function vientoVxPxS(m) {
    if (!m || typeof m.vientoVelocidad !== 'number') return 0;
    var kmh = m.vientoVelocidad;
    var dirDeg = (typeof m.vientoDireccion === 'number') ? m.vientoDireccion : 0;
    var ms = kmh / 3.6;
    var magnitud = ms * 22;
    var dirRad = dirDeg * Math.PI / 180;
    return -Math.sin(dirRad) * magnitud;
  }

  // --- Pool de gotas ---

  function spawn(gota, nuevo) {
    gota.x = Math.random() * cssW;
    gota.y = nuevo
      ? Math.random() * cssH
      : -20 - Math.random() * 40;
    gota.len = 10 + Math.random() * 14;
    var mmH = mmPorHora(meteoActual);
    var baseVyS = velocidadCaidaPxS(mmH);
    gota.vy = (baseVyS * (0.85 + Math.random() * 0.35)) / 30;
    var vxS = vientoVxPxS(meteoActual);
    gota.vx = (vxS * (0.85 + Math.random() * 0.35)) / 30;
  }

  function ajustarPool(n) {
    while (gotas.length < n) {
      var g = { x: 0, y: 0, vx: 0, vy: 0, len: 0 };
      spawn(g, true);
      gotas.push(g);
    }
    if (gotas.length > n) gotas.length = n;
  }

  function addSplash(x, y) {
    if (splashes.length >= 16) return;
    splashes.push({ x: x, y: y, t: 0 });
  }

  // --- Simulación ---

  function step() {
    var yImpacto = cssH * 0.97;
    for (var i = 0; i < gotas.length; i++) {
      var g = gotas[i];
      g.x += g.vx;
      g.y += g.vy;
      if (g.y >= yImpacto) {
        addSplash(g.x, yImpacto);
        spawn(g, false);
      } else if (g.x < -30 || g.x > cssW + 30) {
        spawn(g, false);
      }
    }
    for (var j = splashes.length - 1; j >= 0; j--) {
      splashes[j].t += 1;
      if (splashes[j].t > 12) splashes.splice(j, 1);
    }
  }

  // --- Render ---

  function renderGota(g, pal) {
    var x0 = g.x, y0 = g.y;
    var x1 = g.x - g.vx * 2, y1 = g.y - g.len;
    var grad = ctx.createLinearGradient(x1, y1, x0, y0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, pal.gota);
    grad.addColorStop(1, pal.gota);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.95;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x0, y0);
    ctx.stroke();

    // Brillo superior sutil
    ctx.fillStyle = pal.brillo;
    ctx.beginPath();
    ctx.arc(
      x1 + (x0 - x1) * 0.18,
      y1 + (y0 - y1) * 0.18,
      0.75, 0, Math.PI * 2
    );
    ctx.fill();
  }

  function renderSplash(s, pal) {
    var ttotal = 12;
    var t = s.t / ttotal;
    if (t >= 1) return;
    var alpha = (1 - t) * 0.32;
    var rx = 4 + t * 10;
    var ry = 1 + t * 2;
    ctx.strokeStyle = pal.splash + alpha.toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr * SCALE, dpr * SCALE);
    var pal = PALETA[momentoActual] || PALETA.dia;
    for (var i = 0; i < gotas.length; i++) renderGota(gotas[i], pal);
    for (var j = 0; j < splashes.length; j++) renderSplash(splashes[j], pal);
    ctx.restore();
  }

  // --- Ciclo ---

  function debeAnimar() {
    if (!meteoActual) return false;
    var cat = meteoActual.categoria;
    return cat === 'lluvia' || cat === 'tormenta';
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!visibleEnViewport) return;
    if (!debeAnimar()) {
      if (gotas.length > 0 || splashes.length > 0) {
        gotas.length = 0;
        splashes.length = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    ajustarPool(poolObjetivo);
    step();
    render();
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    lastFrame = 0;
    raf = requestAnimationFrame(tick);
  }

  function renderEstatico() {
    if (!debeAnimar()) {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ajustarPool(poolObjetivo);
    for (var i = 0; i < gotas.length; i++) {
      gotas[i].y = Math.random() * cssH * 0.9;
    }
    render();
  }

  // --- Layout ---

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

  // --- API pública ---

  function init(opts) {
    opts = opts || {};
    vista2 = opts.vista2 || document.getElementById('vista2');
    if (!vista2) {
      if (typeof debug !== 'undefined') debug.warn('RainFX: no hay #vista2');
      return false;
    }

    reducedMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    canvas = document.createElement('canvas');
    canvas.className = 'v2-rain-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    // Lo insertamos al principio de #vista2, por detrás del contenido
    // (el contenido lleva z-index:1 por el selector de IU-12).
    vista2.insertBefore(canvas, vista2.firstChild || null);
    ctx = canvas.getContext('2d');
    if (!ctx) {
      if (typeof debug !== 'undefined') debug.error('RainFX: sin contexto 2D');
      return false;
    }

    resize();
    window.addEventListener('resize', resize);

    if (typeof IntersectionObserver === 'function') {
      var iobs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visibleEnViewport = e.intersectionRatio >= 0.5;
        });
      }, { threshold: [0, 0.5, 1] });
      iobs.observe(vista2);
    }

    if (typeof debug !== 'undefined') {
      debug.log('RainFX init · dpr=' + dpr.toFixed(2) +
        ' · scale=' + SCALE +
        ' · reducedMotion=' + reducedMotion);
    }

    if (!reducedMotion) start();
    return true;
  }

  function setMeteo(m) {
    var cambia = !meteoActual ||
      meteoActual.categoria !== (m && m.categoria) ||
      mmPorHora(meteoActual) !== mmPorHora(m);
    meteoActual = m || null;
    poolObjetivo = densidadObjetivo(mmPorHora(meteoActual));
    if (reducedMotion) renderEstatico();
    if (cambia && typeof debug !== 'undefined') {
      debug.log('RainFX meteo · cat=' + (m && m.categoria) +
        ' · mm/h=' + mmPorHora(meteoActual).toFixed(1) +
        ' · pool=' + poolObjetivo);
    }
  }

  function setMomento(mom) {
    if (typeof mom === 'string' && PALETA[mom]) momentoActual = mom;
  }

  window.RainFX = {
    init: init,
    setMeteo: setMeteo,
    setMomento: setMomento
  };
})();
