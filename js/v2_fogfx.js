// js/v2_fogfx.js
// FogFX — niebla volumétrica SVG para la Vista 2 (IU-15).
//
// Dos capas rectangulares teñidas con un filtro feTurbulence +
// feDisplacementMap que deforma el rectángulo con ruido fractal. Las
// capas se desplazan lentamente con CSS transform en direcciones
// opuestas (animaciones de ~60 s y ~80 s) para producir sensación de
// niebla moviéndose. Los colores se ajustan por momento del día (IU-12)
// aplicando el atributo 'fill' a los <rect>.
//
// Fallback: si la URL lleva ?fogfallback=1, si el navegador no soporta
// feDisplacementMap, o si el watchdog de FPS (DT-15) degradó en un
// arranque anterior (localStorage 'fogfx-fallback'), saltamos a dos
// capas radiales CSS (las originales de IU-11) controladas con una
// clase en #vista2.
//
// Watchdog de FPS (DT-15): con niebla activa y V2 en viewport, un
// sampler rAF mide los FPS reales; si caen por debajo de UMBRAL_FPS
// durante VENTANA_SEG segundos seguidos, se degrada en caliente al
// fallback CSS y se persiste la decisión en localStorage.
//
// Opacidad pico <= 0.4 (regla full-inmersión).
//
// API pública:
//   FogFX.init({ vista2? })
//   FogFX.setMomento(str)
//   FogFX._setUmbralFps(n)   → hook de test para el watchdog

(function () {
  'use strict';

  var PALETA = {
    dia:       { c1: 'rgba(205, 215, 230, 0.38)', c2: 'rgba(185, 195, 215, 0.28)' },
    amanecer:  { c1: 'rgba(235, 205, 200, 0.36)', c2: 'rgba(215, 180, 190, 0.26)' },
    atardecer: { c1: 'rgba(225, 195, 190, 0.36)', c2: 'rgba(200, 170, 185, 0.26)' },
    noche:     { c1: 'rgba(155, 170, 200, 0.32)', c2: 'rgba(130, 145, 175, 0.24)' }
  };

  // DT-15: parámetros del watchdog de FPS.
  var UMBRAL_FPS = 25;
  var VENTANA_SEG = 5;
  var CLAVE_LS = 'fogfx-fallback';

  var vista2 = null;
  var svg = null, rect1 = null, rect2 = null;
  var usarFallback = false;
  var momentoActual = 'dia';

  // Estado del watchdog (DT-15).
  var reducedMotion = false;
  var visibleEnViewport = true;
  var samplerRaf = null;
  var frames = 0;
  var corteMs = 0;
  var segundosMalos = 0;
  var historialFps = [];

  function soportaDesplazamiento() {
    return typeof window.SVGFEDisplacementMapElement !== 'undefined';
  }

  function debeUsarFallback() {
    // DT-15: si el watchdog ya degradó en un arranque anterior, no
    // volvemos a pagar el filtro SVG.
    try { if (localStorage.getItem(CLAVE_LS) === '1') return true; } catch (e) {}
    var params = new URLSearchParams(window.location.search);
    if (params.get('fogfallback') === '1') return true;
    if (!soportaDesplazamiento()) return true;
    return false;
  }

  function construirSvg() {
    var NS = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'v2-fog');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('viewBox', '0 0 400 300');

    var defs = document.createElementNS(NS, 'defs');

    // Filtro 1: granulado medio, desplazamiento grande
    var f1 = document.createElementNS(NS, 'filter');
    f1.setAttribute('id', 'v2-fog-f1');
    f1.setAttribute('x', '-15%'); f1.setAttribute('y', '-15%');
    f1.setAttribute('width', '130%'); f1.setAttribute('height', '130%');
    var t1 = document.createElementNS(NS, 'feTurbulence');
    t1.setAttribute('type', 'fractalNoise');
    t1.setAttribute('baseFrequency', '0.006 0.014');
    t1.setAttribute('numOctaves', '2');
    t1.setAttribute('seed', '3');
    var d1 = document.createElementNS(NS, 'feDisplacementMap');
    d1.setAttribute('in', 'SourceGraphic');
    d1.setAttribute('scale', '42');
    f1.appendChild(t1); f1.appendChild(d1);
    defs.appendChild(f1);

    // Filtro 2: granulado más fino, desplazamiento mayor
    var f2 = document.createElementNS(NS, 'filter');
    f2.setAttribute('id', 'v2-fog-f2');
    f2.setAttribute('x', '-15%'); f2.setAttribute('y', '-15%');
    f2.setAttribute('width', '130%'); f2.setAttribute('height', '130%');
    var t2 = document.createElementNS(NS, 'feTurbulence');
    t2.setAttribute('type', 'fractalNoise');
    t2.setAttribute('baseFrequency', '0.012 0.022');
    t2.setAttribute('numOctaves', '3');
    t2.setAttribute('seed', '7');
    var d2 = document.createElementNS(NS, 'feDisplacementMap');
    d2.setAttribute('in', 'SourceGraphic');
    d2.setAttribute('scale', '58');
    f2.appendChild(t2); f2.appendChild(d2);
    defs.appendChild(f2);

    svg.appendChild(defs);

    rect1 = document.createElementNS(NS, 'rect');
    rect1.setAttribute('x', '-60'); rect1.setAttribute('y', '-60');
    rect1.setAttribute('width', '520'); rect1.setAttribute('height', '420');
    rect1.setAttribute('filter', 'url(#v2-fog-f1)');
    rect1.setAttribute('class', 'v2-fog-capa-1');
    svg.appendChild(rect1);

    rect2 = document.createElementNS(NS, 'rect');
    rect2.setAttribute('x', '-60'); rect2.setAttribute('y', '-60');
    rect2.setAttribute('width', '520'); rect2.setAttribute('height', '420');
    rect2.setAttribute('filter', 'url(#v2-fog-f2)');
    rect2.setAttribute('class', 'v2-fog-capa-2');
    svg.appendChild(rect2);
  }

  function aplicarPaleta() {
    var pal = PALETA[momentoActual] || PALETA.dia;
    if (rect1) rect1.setAttribute('fill', pal.c1);
    if (rect2) rect2.setAttribute('fill', pal.c2);
  }

  // --- Watchdog de FPS (DT-15) ---

  // Decide si el sampler debe estar armado. Solo medimos cuando el filtro
  // SVG está realmente trabajando: sin fallback, sin reduced-motion, con
  // V2 en viewport y con niebla activa. main.js setea data-meteo-cat en
  // #vista2 ANTES de llamar a setMomento, así que el valor leído aquí
  // siempre está fresco.
  function evaluarWatchdog() {
    if (!usarFallback && !reducedMotion && visibleEnViewport && vista2 &&
        vista2.getAttribute('data-meteo-cat') === 'niebla') {
      armarSampler();
    } else {
      desarmarSampler();
    }
  }

  function armarSampler() {
    if (samplerRaf) return;
    frames = 0;
    corteMs = 0;
    segundosMalos = 0;
    historialFps = [];
    samplerRaf = requestAnimationFrame(muestrearFps);
  }

  function desarmarSampler() {
    if (samplerRaf) { cancelAnimationFrame(samplerRaf); samplerRaf = null; }
    frames = 0;
    corteMs = 0;
    segundosMalos = 0;
  }

  // Bucle de muestreo: cuenta frames y cada ~1000 ms calcula los FPS
  // reales. VENTANA_SEG segundos seguidos por debajo de UMBRAL_FPS →
  // degradar(). Un segundo bueno resetea la racha.
  function muestrearFps(now) {
    samplerRaf = requestAnimationFrame(muestrearFps);
    if (!corteMs) { corteMs = now; return; }
    frames++;
    var delta = now - corteMs;
    if (delta < 1000) return;
    var fps = Math.round(frames * 1000 / delta);
    historialFps.push(fps);
    if (historialFps.length > 10) historialFps.shift();
    if (fps < UMBRAL_FPS) segundosMalos++;
    else segundosMalos = 0;
    frames = 0;
    corteMs = now;
    if (segundosMalos >= VENTANA_SEG) degradar();
  }

  // Degradación en caliente: la clase v2-fog-fallback hace el switch por
  // CSS (oculta el SVG y muestra las radiales de IU-11), así que no hace
  // falta destruir el SVG ya construido. Persistimos en localStorage para
  // que los siguientes arranques entren directos al fallback.
  function degradar() {
    usarFallback = true;
    vista2.classList.add('v2-fog-fallback');
    try { localStorage.setItem(CLAVE_LS, '1'); } catch (e) {}
    if (typeof debug !== 'undefined') {
      debug.log('FogFX: auto-degradado a fallback CSS (fps: ' +
        historialFps.join(',') + ')');
    }
    desarmarSampler();
  }

  function init(opts) {
    opts = opts || {};
    vista2 = opts.vista2 || document.getElementById('vista2');
    if (!vista2) {
      if (typeof debug !== 'undefined') debug.warn('FogFX: no hay #vista2');
      return false;
    }

    reducedMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    usarFallback = debeUsarFallback();
    if (usarFallback) {
      vista2.classList.add('v2-fog-fallback');
      if (typeof debug !== 'undefined') {
        debug.log('FogFX init · fallback CSS (radiales) activo');
      }
      return true;
    }

    construirSvg();
    vista2.insertBefore(svg, vista2.firstChild || null);
    aplicarPaleta();

    // DT-15: visibilidad de V2 para el watchdog (patrón de RainFX). Bajo
    // reduced-motion el CSS ya oculta la niebla, así que el watchdog no
    // se arma en absoluto.
    if (!reducedMotion && typeof IntersectionObserver === 'function') {
      var iobs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visibleEnViewport = e.intersectionRatio >= 0.5;
        });
        evaluarWatchdog();
      }, { threshold: [0, 0.5, 1] });
      iobs.observe(vista2);
    }

    if (typeof debug !== 'undefined') {
      debug.log('FogFX init · SVG feTurbulence+feDisplacementMap');
    }
    return true;
  }

  function setMomento(mom) {
    if (typeof mom === 'string' && PALETA[mom]) {
      momentoActual = mom;
      aplicarPaleta();
    }
    // DT-15: main.js llama aquí en cada refresco de meteo, es el punto
    // natural para reevaluar si el watchdog debe estar armado.
    evaluarWatchdog();
  }

  window.FogFX = {
    init: init,
    setMomento: setMomento,
    _setUmbralFps: function (n) { UMBRAL_FPS = n; }
  };
})();
