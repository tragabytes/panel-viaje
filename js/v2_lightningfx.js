// js/v2_lightningfx.js
// LightningFX — rayos de tormenta para la Vista 2 (IU-14).
//
// Crea un SVG overlay dentro de #vista2 con 3 paths alternos en forma de
// rama bifurcada y un filtro feGaussianBlur para el glow. Dispara un rayo
// cada 15-35 s de forma aleatoria mientras la categoría sea 'tormenta'.
// Cada rayo dura 120 ms (fade in/out) e inmediatamente después se activa
// un eco cálido que baña la pantalla 300 ms más.
//
// La paleta del trazo y del eco se ajustan por momento del día (IU-12):
// noche más dramática, día gris-azul translúcida. Opacidad <= 0.4.
//
// Se pausa automáticamente cuando V2 sale del viewport.
//
// API pública:
//   LightningFX.init({ vista2? })  → crea SVG y eco, comienza el scheduler
//   LightningFX.setCategoria(cat)  → arranca/para según 'tormenta' vs otra
//   LightningFX.setMomento(str)    → 'dia' | 'amanecer' | 'atardecer' | 'noche'

(function () {
  'use strict';

  var INTERVALO_MIN_MS = 15000;
  var INTERVALO_MAX_MS = 35000;
  var FLASH_MS = 120;
  var ECO_MS   = 300;

  // 3 rayos distintos. viewBox 400x600, preserveAspectRatio 'none' los
  // estira al tamaño de V2. El x inicial se aleja del borde superior-
  // derecha (ocupado por la luminaria de IU-12) para no chocar visualmente.
  var PATHS = [
    'M 80 0 L 72 70 L 96 140 L 78 210 L 104 280 L 82 360 L 108 440 L 86 520 L 100 595 ' +
      'M 78 210 L 130 240 L 112 300 ' +
      'M 108 440 L 58 470 L 72 510',
    'M 250 0 L 238 60 L 262 130 L 240 200 L 268 270 L 244 350 L 274 430 L 250 520 L 266 595 ' +
      'M 262 130 L 200 170 L 218 220 ' +
      'M 244 350 L 300 380 L 282 430',
    'M 180 0 L 200 80 L 168 160 L 208 230 L 176 320 L 212 400 L 180 490 L 210 595 ' +
      'M 168 160 L 108 190 L 128 240 ' +
      'M 212 400 L 270 420 L 254 470'
  ];

  var PALETA = {
    dia:       { stroke: 'rgba(200, 215, 235, 0.40)', eco: 'rgba(255, 220, 180, 0.22)' },
    amanecer:  { stroke: 'rgba(255, 220, 200, 0.40)', eco: 'rgba(255, 190, 140, 0.30)' },
    atardecer: { stroke: 'rgba(255, 205, 190, 0.40)', eco: 'rgba(255, 175, 130, 0.30)' },
    noche:     { stroke: 'rgba(225, 240, 255, 0.40)', eco: 'rgba(255, 195, 130, 0.32)' }
  };

  var vista2 = null;
  var svg = null;
  var pathEls = [];
  var eco = null;

  var momentoActual = 'dia';
  var categoriaActual = null;
  var activo = false;
  var visibleEnViewport = true;
  var timer = null;
  var flashTimer = null;
  var ecoTimer = null;

  function aplicarPaleta() {
    var pal = PALETA[momentoActual] || PALETA.dia;
    for (var i = 0; i < pathEls.length; i++) {
      pathEls[i].setAttribute('stroke', pal.stroke);
    }
    if (eco) eco.style.background = 'radial-gradient(ellipse at 50% 40%, ' +
      pal.eco + ' 0%, transparent 65%)';
  }

  function lanzarRayo() {
    if (!visibleEnViewport || !activo) return;
    // Elegir uno de los 3 paths
    var idx = Math.floor(Math.random() * pathEls.length);
    var pathEl = pathEls[idx];

    // Flash principal: sube rápido, cae rápido
    pathEl.style.transition = 'opacity 30ms linear';
    pathEl.style.opacity = '1';
    flashTimer = setTimeout(function () {
      pathEl.style.transition = 'opacity ' + (FLASH_MS - 30) + 'ms ease-out';
      pathEl.style.opacity = '0';
    }, 30);

    // Eco cálido: arranca 20 ms después del flash, dura ECO_MS
    if (eco) {
      eco.style.transition = 'opacity 80ms ease-out';
      eco.style.opacity = '1';
      ecoTimer = setTimeout(function () {
        eco.style.transition = 'opacity ' + (ECO_MS - 80) + 'ms ease-out';
        eco.style.opacity = '0';
      }, 80);
    }

    if (typeof debug !== 'undefined') {
      debug.log('LightningFX · rayo #' + (idx + 1) + ' · momento=' + momentoActual);
    }
  }

  function programarSiguiente() {
    cancelarTimer();
    if (!activo) return;
    var espera = INTERVALO_MIN_MS + Math.random() * (INTERVALO_MAX_MS - INTERVALO_MIN_MS);
    timer = setTimeout(function () {
      lanzarRayo();
      programarSiguiente();
    }, espera);
  }

  function cancelarTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    if (ecoTimer) { clearTimeout(ecoTimer); ecoTimer = null; }
  }

  // --- Construcción del overlay ---

  function construirSvg() {
    var NS = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'v2-lightning');
    svg.setAttribute('viewBox', '0 0 400 600');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    var defs = document.createElementNS(NS, 'defs');
    var filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'v2-lightning-glow');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-5%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '110%');

    var blur = document.createElementNS(NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '2.5');
    blur.setAttribute('result', 'blur');

    var merge = document.createElementNS(NS, 'feMerge');
    var m1 = document.createElementNS(NS, 'feMergeNode');
    m1.setAttribute('in', 'blur');
    var m2 = document.createElementNS(NS, 'feMergeNode');
    m2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(m1);
    merge.appendChild(m2);

    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('filter', 'url(#v2-lightning-glow)');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke-width', '1.8');
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');

    for (var i = 0; i < PATHS.length; i++) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', PATHS[i]);
      p.style.opacity = '0';
      g.appendChild(p);
      pathEls.push(p);
    }
    svg.appendChild(g);
  }

  function construirEco() {
    eco = document.createElement('div');
    eco.className = 'v2-lightning-eco';
    eco.setAttribute('aria-hidden', 'true');
    eco.style.opacity = '0';
  }

  // --- API pública ---

  function init(opts) {
    opts = opts || {};
    vista2 = opts.vista2 || document.getElementById('vista2');
    if (!vista2) {
      if (typeof debug !== 'undefined') debug.warn('LightningFX: no hay #vista2');
      return false;
    }

    construirSvg();
    construirEco();
    // Insertar después del canvas de RainFX para que el rayo quede por
    // delante de las gotas pero detrás del contenido (z-index:1 del resto).
    var canvasLluvia = vista2.querySelector('.v2-rain-canvas');
    if (canvasLluvia && canvasLluvia.nextSibling) {
      vista2.insertBefore(eco, canvasLluvia.nextSibling);
      vista2.insertBefore(svg, canvasLluvia.nextSibling);
    } else {
      vista2.insertBefore(eco, vista2.firstChild);
      vista2.insertBefore(svg, vista2.firstChild);
    }

    aplicarPaleta();

    if (typeof IntersectionObserver === 'function') {
      var iobs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          visibleEnViewport = e.intersectionRatio >= 0.5;
        });
      }, { threshold: [0, 0.5, 1] });
      iobs.observe(vista2);
    }

    if (typeof debug !== 'undefined') {
      debug.log('LightningFX init · 3 paths · intervalo ' +
        (INTERVALO_MIN_MS / 1000) + '-' + (INTERVALO_MAX_MS / 1000) + 's');
    }
    return true;
  }

  function setCategoria(cat) {
    var antes = activo;
    categoriaActual = cat;
    activo = (cat === 'tormenta');
    if (activo && !antes) {
      programarSiguiente();
      if (typeof debug !== 'undefined') debug.log('LightningFX: scheduler activo');
    } else if (!activo && antes) {
      cancelarTimer();
      if (typeof debug !== 'undefined') debug.log('LightningFX: scheduler detenido');
    }
  }

  function setMomento(mom) {
    if (typeof mom === 'string' && PALETA[mom]) {
      momentoActual = mom;
      aplicarPaleta();
    }
  }

  window.LightningFX = {
    init: init,
    setCategoria: setCategoria,
    setMomento: setMomento
  };
})();
