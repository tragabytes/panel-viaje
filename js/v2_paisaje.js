// v2_paisaje.js — La vista 2 como un paisaje que respira el tiempo de verdad (specs/003-meteo-chillout).
//
// Un paisaje lo-fi por capas: cielo que cambia de color de forma continua con
// la hora real de salida y puesta del sol, el sol recorriendo su arco, de noche
// la luna con su fase real y estrellas que titilan despacio, tres cordilleras
// con perspectiva atmosférica (con pinos y casas que encienden la luz de
// noche), nubes según la nubosidad que se mueven con el viento real, niebla en
// los valles, y la lluvia y la nieve de siempre (v2_rainfx.js, v2_snowfx.js).
// Las montañas se deslizan muy despacio solo cuando el coche se mueve.
//
// Se mira conduciendo (CLAUDE.md, regla 3): todo es lento y nada destella. La
// tormenta es un resplandor suave dentro de las nubes, sin rayos.
//
// Coste (regla 1): cada capa se dibuja UNA vez en un lienzo (al cambiar el
// tiempo o cada pocos minutos con la luz) y luego solo se desplaza con
// transform, que lo mueve el compositor sin JS por fotograma. Pausado con la
// vista fuera de pantalla. Si el móvil no llega a 24 fps, se queda quieto
// (modo ligero, recordado en localStorage; ?paisaje=ligero lo fuerza y
// ?paisaje=completo lo quita). ?hora=HH:MM pinta el paisaje a esa hora.
//
// API pública (PaisajeFX):
//   PaisajeFX.init()
//   PaisajeFX.setMeteo(meteo | null)     el objeto de Weather; null = sin datos
//   PaisajeFX.setVelocidad(kmh | null)
//   Puras (probadas en Node): posicionSol, faseLunar, paleta, ajustarPorTiempo,
//       nubosidadDe, nieblaDe, perfil, mezclar

(function () {
  'use strict';

  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const CLAVE_LIGERO = 'paisaje-ligero';
  const CLAVE_LENTO = 'paisaje-medidas-lentas';
  const FPS_MINIMO = 24;
  const MUESTREO_MS = 4000;
  const REPINTAR_LUZ_MS = 2 * 60 * 1000;
  // Velocidad de deslizamiento a 100 km/h (px/s) de cada cordillera.
  const PX_S = { lejos: 0.7, medio: 2.0, cerca: 4.8 };

  // --- Utilidades puras ---

  function mezclar(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function suave(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  function rgba(c, a) {
    return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a == null ? 1 : a})`;
  }

  function gris(c) {
    const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    return [l, l, l];
  }

  // Aleatorio con semilla (mulberry32): el paisaje es siempre el mismo.
  function aleatorio(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- Sol y luna ---

  // Dónde está el sol: fracción del día (o de la noche) recorrida y una
  // "altura" de −1 (medianoche) a 1 (mediodía) que gobierna la luz.
  function posicionSol(ahora, salidaMs, puestaMs) {
    let salida = salidaMs, puesta = puestaMs;
    if (!salida || !puesta || puesta <= salida) {
      const d = new Date(ahora);
      salida = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7, 45).getTime();
      puesta = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 15).getTime();
    }
    const DIA = 86400000;
    if (ahora >= salida && ahora <= puesta) {
      const t = (ahora - salida) / (puesta - salida);
      return { dia: true, t, altura: Math.sin(Math.PI * t) };
    }
    const inicio = ahora > puesta ? puesta : puesta - DIA;
    const fin = ahora > puesta ? salida + DIA : salida;
    const t = Math.max(0, Math.min(1, (ahora - inicio) / (fin - inicio)));
    return { dia: false, t, altura: -Math.sin(Math.PI * t) };
  }

  // 0 = luna nueva, 0,5 = llena. Referencia: luna nueva del 6/1/2000 18:14 UTC.
  function faseLunar(ms) {
    const SINODICO = 29.530588853;
    const REF = Date.UTC(2000, 0, 6, 18, 14);
    const dias = (ms - REF) / 86400000;
    return (((dias % SINODICO) + SINODICO) % SINODICO) / SINODICO;
  }

  // --- Paleta: cielos oscuros (se mira de noche y conduciendo) ---

  const PALETAS = {
    noche: {
      arriba: [4, 8, 20], medio: [8, 16, 34], horizonte: [18, 30, 56],
      resplandor: [60, 90, 150], monte: [6, 10, 20], astro: [220, 228, 245],
      nubeLuz: [70, 82, 110], nubeSombra: [14, 18, 30], niebla: [120, 135, 165],
    },
    alba: {
      arriba: [16, 22, 52], medio: [62, 48, 88], horizonte: [196, 112, 86],
      resplandor: [255, 150, 100], monte: [26, 20, 40], astro: [255, 214, 160],
      nubeLuz: [240, 160, 140], nubeSombra: [50, 36, 66], niebla: [220, 180, 175],
    },
    dia: {
      arriba: [10, 34, 60], medio: [26, 70, 104], horizonte: [70, 128, 156],
      resplandor: [255, 230, 180], monte: [14, 30, 44], astro: [255, 244, 214],
      nubeLuz: [190, 205, 220], nubeSombra: [64, 84, 104], niebla: [175, 192, 205],
    },
    ocaso: {
      arriba: [22, 18, 52], medio: [92, 44, 84], horizonte: [214, 96, 70],
      resplandor: [255, 130, 80], monte: [30, 16, 34], astro: [255, 190, 120],
      nubeLuz: [250, 140, 110], nubeSombra: [60, 30, 60], niebla: [215, 160, 160],
    },
  };
  const CAMPOS = ['arriba', 'medio', 'horizonte', 'resplandor', 'monte', 'astro', 'nubeLuz', 'nubeSombra', 'niebla'];

  function mezclarPaleta(a, b, t) {
    const p = {};
    for (const k of CAMPOS) p[k] = mezclar(a[k], b[k], t);
    return p;
  }

  // Luz continua: crepúsculo junto al horizonte, día pleno a partir de un
  // tercio de altura, noche cerrada unos 45 min después de la puesta.
  function paleta(sol) {
    let p, estrellas, resplandorAlfa;
    if (sol.dia) {
      const crep = sol.t < 0.5 ? PALETAS.alba : PALETAS.ocaso;
      const k = suave(0, 0.32, sol.altura);
      p = mezclarPaleta(crep, PALETAS.dia, k);
      estrellas = 0;
      resplandorAlfa = 0.45 - 0.25 * k;
    } else {
      const crep = sol.t < 0.5 ? PALETAS.ocaso : PALETAS.alba;
      const k = suave(0, 0.2, -sol.altura);
      p = mezclarPaleta(crep, PALETAS.noche, k);
      estrellas = suave(0.06, 0.24, -sol.altura);
      resplandorAlfa = 0.4 * (1 - k) + 0.12;
    }
    return Object.assign(p, { estrellas, resplandorAlfa });
  }

  // De 0 (despejado) a 1 (cubierto), según el código WMO.
  function nubosidadDe(codigo) {
    if (codigo == null) return 0;
    if (codigo === 0) return 0;
    if (codigo === 1) return 0.15;
    if (codigo === 2) return 0.45;
    if (codigo === 3) return 0.85;
    if (codigo === 45 || codigo === 48) return 0.55;
    if (codigo >= 51 && codigo <= 57) return 0.8;
    if (codigo >= 61 && codigo <= 67) return 0.92;
    if (codigo >= 71 && codigo <= 77) return 0.88;
    if (codigo >= 80 && codigo <= 82) return 0.78;
    if (codigo === 85 || codigo === 86) return 0.8;
    if (codigo >= 95) return 1;
    return 0.3;
  }

  // Niebla en los valles: la de verdad, la de las mañanas húmedas y la bruma
  // de la lluvia o de poca visibilidad.
  function nieblaDe(meteo, sol) {
    if (!meteo) return 0;
    const c = meteo.weatherCode;
    let n = 0;
    if (c === 45 || c === 48) n = 0.72;
    else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) n = 0.22;
    if (meteo.humedad != null && meteo.humedad >= 93 && (!sol.dia || sol.altura < 0.3)) n = Math.max(n, 0.35);
    if (meteo.visibilidad != null && meteo.visibilidad < 3000) n = Math.max(n, 0.55);
    return n;
  }

  // El tiempo apaga y agrisa el cielo; la tormenta lo oscurece más.
  function ajustarPorTiempo(p, meteo) {
    const q = Object.assign({}, p);
    const codigo = meteo ? meteo.weatherCode : null;
    const cat = meteo ? meteo.categoria : null;
    const nub = nubosidadDe(codigo);
    const agrisar = nub * 0.6;
    // Un cielo que ya es oscuro (noche) se oscurece menos: si no, de noche la
    // tormenta lo deja negro y las montañas desaparecen.
    const claridad = Math.max(0.25, Math.min(1, (p.arriba[0] + p.arriba[1] + p.arriba[2]) / 110));
    const oscurecer = (cat === 'tormenta' ? 0.45 : (cat === 'lluvia' ? 0.25 : nub * 0.15)) * claridad;
    for (const k of ['arriba', 'medio', 'horizonte', 'monte']) {
      q[k] = mezclar(mezclar(p[k], gris(p[k]), agrisar), [0, 0, 0], oscurecer);
    }
    if (cat === 'nieve') {
      for (const k of ['arriba', 'medio', 'horizonte']) q[k] = mezclar(q[k], [70, 82, 100], 0.25);
    }
    if (cat === 'niebla') {
      q.horizonte = mezclar(q.horizonte, q.niebla, 0.35);
      q.medio = mezclar(q.medio, q.niebla, 0.18);
    }
    q.estrellas = p.estrellas * (1 - Math.min(1, nub * 1.15));
    q.resplandorAlfa = p.resplandorAlfa * (1 - nub * 0.8);
    q.nubosidad = nub;
    q.categoria = cat;
    return q;
  }

  // --- Perfiles de montaña periódicos ---
  //
  // Suma de senos con frecuencias enteras: h(x) = h(x + ancho), así la capa
  // puede deslizarse en bucle sin costura. Devuelve valores en [−1, 1].
  function perfil(semilla, armonicos, ancho) {
    const r = aleatorio(semilla);
    const ondas = armonicos.map(([k, a]) => ({ k, a, f: r() * Math.PI * 2 }));
    const total = ondas.reduce((s, o) => s + o.a, 0) || 1;
    return function (x) {
      let h = 0;
      for (const o of ondas) h += o.a * Math.sin(2 * Math.PI * o.k * x / ancho + o.f);
      return h / total;
    };
  }

  // --- Estado ---

  let vista2 = null, raiz = null;
  const capas = {};          // nombre → { el, canvas, anim }
  let ancho = 0, alto = 0, escala = 1;
  let meteoActual = null;
  let velocidad = 0;
  let visible = true;
  let reducido = false;
  let ligero = false;
  let claveEscena = '';
  let tormentaTimer = null;
  let desfaseHora = 0;
  let midiendo = false;

  function ahora() { return Date.now() + desfaseHora; }

  function leerOpciones() {
    try {
      const q = new URLSearchParams(location.search);
      const h = q.get('hora');
      if (h && /^\d{1,2}:\d{2}$/.test(h)) {
        const [hh, mm] = h.split(':').map(Number);
        const d = new Date();
        desfaseHora = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime() - Date.now();
      }
      const modo = q.get('paisaje');
      if (modo === 'ligero') localStorage.setItem(CLAVE_LIGERO, '1');
      if (modo === 'completo') { localStorage.removeItem(CLAVE_LIGERO); localStorage.removeItem(CLAVE_LENTO); }
      ligero = localStorage.getItem(CLAVE_LIGERO) === '1';
    } catch (e) { /* sin localStorage: modo completo */ }
  }

  // --- Construcción de capas ---

  const ORDEN = ['estrellasA', 'estrellasB', 'astro', 'nubesLejos', 'montesLejos', 'niebla1',
    'montesMedio', 'niebla2', 'montesCerca', 'nubesCerca'];

  function crearCapas() {
    raiz.innerHTML = '';
    const cielo = document.createElement('div');
    cielo.className = 'v2p-cielo';
    raiz.appendChild(cielo);
    capas.cielo = { el: cielo };
    for (const nombre of ORDEN) {
      const el = document.createElement('div');
      el.className = 'v2p-capa v2p-' + nombre;
      const canvas = document.createElement('canvas');
      el.appendChild(canvas);
      raiz.appendChild(el);
      capas[nombre] = { el, canvas, anim: null };
    }
    const resplandor = document.createElement('div');
    resplandor.className = 'v2p-resplandor';
    raiz.appendChild(resplandor);
    capas.resplandor = { el: resplandor };
    const velo = document.createElement('div');
    velo.className = 'v2p-velo';
    raiz.appendChild(velo);
  }

  function prepararLienzo(nombre, anchoCss, altoCss, topCss) {
    const c = capas[nombre];
    c.el.style.top = topCss + 'px';
    c.el.style.height = altoCss + 'px';
    c.el.style.width = anchoCss + 'px';
    c.canvas.width = Math.max(1, Math.round(anchoCss * escala));
    c.canvas.height = Math.max(1, Math.round(altoCss * escala));
    c.canvas.style.width = anchoCss + 'px';
    c.canvas.style.height = altoCss + 'px';
    const ctx = c.canvas.getContext('2d');
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.clearRect(0, 0, anchoCss, altoCss);
    return ctx;
  }

  // --- Dibujo ---

  // El arco del sol y de la luna va por la mitad derecha del cielo, la que
  // no tapa el texto (la palabra y la temperatura van a la izquierda).
  function posicionAstro(sol) {
    const yH = alto * 0.66;
    return {
      x: ancho * (0.5 + 0.42 * sol.t),
      y: yH - Math.sin(Math.PI * sol.t) * (yH - alto * 0.36),
    };
  }

  function pintarCielo(p, sol) {
    const yH = alto * 0.66;
    const a = posicionAstro(sol);
    const sx = a.x / ancho * 100;
    const sy = a.y / alto * 100;
    capas.cielo.el.style.background =
      `radial-gradient(ellipse 60% 45% at ${sx.toFixed(1)}% ${sy.toFixed(1)}%, ${rgba(p.resplandor, p.resplandorAlfa)}, transparent 70%),` +
      `linear-gradient(to bottom, ${rgba(p.arriba)} 0%, ${rgba(p.medio)} ${Math.round(yH / alto * 55)}%, ${rgba(p.horizonte)} ${Math.round(yH / alto * 100)}%, ${rgba(mezclar(p.horizonte, [0, 0, 0], 0.6))} 100%)`;
  }

  function pintarEstrellas(p) {
    const alturaCielo = alto * 0.68;
    for (const [nombre, semilla, n, brillo] of [['estrellasA', 11, 150, 0.75], ['estrellasB', 23, 45, 1]]) {
      const ctx = prepararLienzo(nombre, ancho, alturaCielo, 0);
      const r = aleatorio(semilla);
      if (nombre === 'estrellasA') {
        // Vía Láctea: una banda diagonal muy tenue hecha de polvo de estrellas.
        for (let i = 0; i < 420; i++) {
          const u = r();
          const x = u * ancho;
          const y = alturaCielo * (0.85 - u * 0.75) + (r() - 0.5) * alturaCielo * 0.22;
          ctx.fillStyle = `rgba(200, 210, 255, ${0.05 + r() * 0.12})`;
          ctx.fillRect(x, y, 0.8, 0.8);
        }
      }
      for (let i = 0; i < n; i++) {
        const x = r() * ancho;
        const y = Math.pow(r(), 1.3) * alturaCielo;
        const tam = 0.4 + r() * (nombre === 'estrellasB' ? 1.2 : 0.9);
        const tono = r();
        const color = tono < 0.15 ? [255, 220, 190] : (tono < 0.3 ? [190, 210, 255] : [235, 240, 255]);
        ctx.fillStyle = rgba(color, (0.35 + r() * 0.65) * brillo);
        ctx.beginPath();
        ctx.arc(x, y, tam, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const alfa = p.estrellas.toFixed(3);
    capas.estrellasA.el.style.opacity = alfa;
    capas.estrellasB.el.style.opacity = alfa;
  }

  function dibujarLuna(ctx, x, y, r, fase, color) {
    // Disco apagado, apenas visible, y la parte iluminada según la fase.
    ctx.fillStyle = 'rgba(40, 50, 70, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const crece = fase < 0.5;
    const k = Math.cos(2 * Math.PI * fase); // 1 nueva, −1 llena
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = rgba(color, 0.95);
    // Media luna iluminada (derecha si crece, izquierda si mengua).
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !crece);
    // Terminador: elipse de semieje |k|·r, de abajo arriba. Pasa por el lado
    // derecho en creciente-menguante fina (k>0 creciendo) y en gibosa menguante;
    // por el izquierdo en los otros dos casos.
    ctx.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === crece);
    ctx.fill();
    // Mares lunares, muy suaves.
    ctx.fillStyle = 'rgba(120, 130, 150, 0.18)';
    for (const [dx, dy, rr] of [[0.25, -0.2, 0.22], [-0.15, 0.25, 0.18], [0.35, 0.3, 0.12]]) {
      ctx.beginPath();
      ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function pintarAstro(p, sol) {
    const tam = 240;
    const ctx = prepararLienzo('astro', tam, tam, 0);
    const c = tam / 2;
    const { x, y } = posicionAstro(sol);
    if (sol.dia) {
      const bajo = 1 - suave(0, 0.35, sol.altura);
      const r = 15 + bajo * 6;
      const halo = ctx.createRadialGradient(c, c, r * 0.6, c, c, c);
      halo.addColorStop(0, rgba(p.astro, 0.38));
      halo.addColorStop(0.35, rgba(p.resplandor, 0.12));
      halo.addColorStop(1, rgba(p.resplandor, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, tam, tam);
      const disco = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, 1, c, c, r);
      disco.addColorStop(0, '#fffaf0');
      disco.addColorStop(1, rgba(p.astro));
      ctx.fillStyle = disco;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const halo = ctx.createRadialGradient(c, c, 8, c, c, c * 0.8);
      halo.addColorStop(0, 'rgba(170, 195, 240, 0.20)');
      halo.addColorStop(1, 'rgba(170, 195, 240, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, tam, tam);
      dibujarLuna(ctx, c, c, 12, faseLunar(ahora()), p.astro);
    }
    const el = capas.astro.el;
    el.style.transform = `translate(${(x - c).toFixed(1)}px, ${(y - c).toFixed(1)}px)`;
    // Con el cielo cubierto, el astro se intuye apenas.
    el.style.opacity = (1 - Math.min(0.92, p.nubosidad * 1.05)).toFixed(2);
  }

  function pintarMontes(nombre, p, cfg) {
    const top = cfg.base - cfg.amp - cfg.extra;
    const altoCapa = alto - top;
    const ctx = prepararLienzo(nombre, ancho * 2, altoCapa, top);
    const h = perfil(cfg.semilla, cfg.armonicos, ancho);
    const yDe = (x) => cfg.base - top + cfg.amp * h(x % ancho);
    // Relleno con un degradado vertical: la cresta algo más clara (volumen).
    const g = ctx.createLinearGradient(0, cfg.extra, 0, altoCapa);
    g.addColorStop(0, rgba(cfg.color));
    g.addColorStop(1, rgba(mezclar(cfg.color, [0, 0, 0], 0.45)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, altoCapa);
    for (let x = 0; x <= ancho * 2; x += 3) ctx.lineTo(x, yDe(x));
    ctx.lineTo(ancho * 2, altoCapa);
    ctx.closePath();
    ctx.fill();
    // Luz en la cresta, del lado del sol o de la luna.
    ctx.strokeStyle = rgba(mezclar(cfg.color, p.astro, 0.45), cfg.borde);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= ancho * 2; x += 3) {
      if (x === 0) ctx.moveTo(x, yDe(x)); else ctx.lineTo(x, yDe(x));
    }
    ctx.stroke();
    if (cfg.pinos) pintarPinos(ctx, yDe, cfg);
    if (cfg.casas) pintarCasas(ctx, yDe, cfg, p);
  }

  function pintarPinos(ctx, yDe, cfg) {
    const r = aleatorio(cfg.semilla + 7);
    const bosque = perfil(cfg.semilla + 3, [[3, 1], [7, 0.6], [13, 0.3]], ancho);
    ctx.fillStyle = rgba(mezclar(cfg.color, [0, 0, 0], 0.25));
    const posiciones = [];
    for (let x = 0; x < ancho; x += 7 + r() * 9) {
      if (bosque(x) > 0.05) posiciones.push([x, 6 + r() * 9]);
    }
    for (const [x0, alt] of posiciones) {
      for (const x of [x0, x0 + ancho]) {
        const y = yDe(x) + 2;
        const a = alt * 0.42;
        ctx.beginPath();
        ctx.moveTo(x, y - alt);
        ctx.lineTo(x + a, y - alt * 0.35);
        ctx.lineTo(x + a * 0.55, y - alt * 0.38);
        ctx.lineTo(x + a * 1.1, y);
        ctx.lineTo(x - a * 1.1, y);
        ctx.lineTo(x - a * 0.55, y - alt * 0.38);
        ctx.lineTo(x - a, y - alt * 0.35);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function pintarCasas(ctx, yDe, cfg, p) {
    const r = aleatorio(cfg.semilla + 19);
    const noche = p.estrellas > 0.3 || p.resplandorAlfa < 0.2;
    for (let i = 0; i < 3; i++) {
      const x0 = ancho * (0.15 + 0.3 * i + r() * 0.12);
      for (const x of [x0, x0 + ancho]) {
        const y = yDe(x) + 3;
        ctx.fillStyle = rgba(mezclar(cfg.color, [0, 0, 0], 0.15));
        ctx.fillRect(x - 5, y - 6, 10, 6);
        ctx.beginPath();
        ctx.moveTo(x - 6.5, y - 6);
        ctx.lineTo(x, y - 10);
        ctx.lineTo(x + 6.5, y - 6);
        ctx.closePath();
        ctx.fill();
        if (noche) {
          // Una ventana encendida: cálida, quieta, sin parpadeo.
          ctx.save();
          ctx.shadowColor = 'rgba(255, 190, 90, 0.9)';
          ctx.shadowBlur = 5;
          ctx.fillStyle = 'rgba(255, 205, 120, 0.95)';
          ctx.fillRect(x - 2.5, y - 4.5, 2, 2);
          ctx.restore();
        }
      }
    }
  }

  function pintarNubes(nombre, p, cfg) {
    const ctx = prepararLienzo(nombre, ancho * 2, cfg.alto, cfg.top);
    if (cfg.cantidad <= 0) return;
    const r = aleatorio(cfg.semilla);
    const nube = (cx, cy, rad) => {
      const piezas = 5 + Math.floor(r() * 5);
      const bolas = [];
      for (let i = 0; i < piezas; i++) {
        bolas.push([cx + (r() - 0.5) * rad * 2.6, cy - r() * rad * 0.55, rad * (0.55 + r() * 0.6)]);
      }
      for (const dx of [0, ancho, -ancho]) {
        // Primero la sombra (abajo), después la luz (arriba): volumen.
        for (const [x, y, rr] of bolas) {
          const g = ctx.createRadialGradient(x + dx, y + rr * 0.25, 0, x + dx, y + rr * 0.25, rr);
          g.addColorStop(0, rgba(p.nubeSombra, cfg.alfa));
          g.addColorStop(1, rgba(p.nubeSombra, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + dx, y + rr * 0.25, rr, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const [x, y, rr] of bolas) {
          const g = ctx.createRadialGradient(x + dx, y - rr * 0.2, 0, x + dx, y - rr * 0.2, rr * 0.85);
          g.addColorStop(0, rgba(p.nubeLuz, cfg.alfa * 0.55));
          g.addColorStop(1, rgba(p.nubeLuz, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + dx, y - rr * 0.2, rr * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    for (let i = 0; i < cfg.cantidad; i++) {
      nube(r() * ancho, cfg.alto * (0.3 + r() * 0.5), cfg.tam * (0.6 + r() * 0.7));
    }
    if (cfg.techo > 0) {
      // Cielo cubierto: un techo de nubes con la panza oscura.
      const g = ctx.createLinearGradient(0, 0, 0, cfg.alto);
      g.addColorStop(0, rgba(p.nubeSombra, cfg.techo));
      g.addColorStop(0.7, rgba(p.nubeSombra, cfg.techo * 0.55));
      g.addColorStop(1, rgba(p.nubeSombra, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ancho * 2, cfg.alto);
    }
  }

  function pintarNiebla(nombre, p, cfg) {
    const ctx = prepararLienzo(nombre, ancho * 2, cfg.alto, cfg.top);
    if (cfg.alfa <= 0) return;
    const r = aleatorio(cfg.semilla);
    for (let i = 0; i < 26; i++) {
      const x = r() * ancho;
      const y = cfg.alto * (0.35 + r() * 0.4);
      const rx = 60 + r() * 140;
      const ry = 8 + r() * 16;
      for (const dx of [0, ancho, -ancho]) {
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rx);
        g.addColorStop(0, rgba(p.niebla, cfg.alfa * (0.35 + r() * 0.3)));
        g.addColorStop(1, rgba(p.niebla, 0));
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(x + dx, y);
        ctx.scale(1, ry / rx);
        ctx.translate(-(x + dx), -y);
        ctx.beginPath();
        ctx.arc(x + dx, y, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // --- Movimiento (compositor) ---

  function animar(nombre, pxPorSegundo, sentido) {
    const c = capas[nombre];
    // Al repintar, cada capa sigue por donde iba: sin saltos.
    let avance = Math.random();
    if (c.anim) {
      if (c.anim.baseDuracion && c.anim.currentTime != null) {
        avance = (c.anim.currentTime % c.anim.baseDuracion) / c.anim.baseDuracion;
        if (c.anim.sentido !== sentido) avance = 1 - avance;
      }
      c.anim.cancel();
      c.anim = null;
    }
    c.el.style.transform = '';
    if (reducido || ligero || !c.el.animate) return;
    const duracion = (ancho / Math.max(0.05, Math.abs(pxPorSegundo))) * 1000;
    const desde = sentido > 0 ? `translateX(${-ancho}px)` : 'translateX(0px)';
    const hasta = sentido > 0 ? 'translateX(0px)' : `translateX(${-ancho}px)`;
    c.anim = c.el.animate([{ transform: desde }, { transform: hasta }], { duration: duracion, iterations: Infinity });
    c.anim.currentTime = avance * duracion;
    c.anim.baseDuracion = duracion;
    c.anim.sentido = sentido;
    if (!visible) c.anim.pause();
  }

  function factorVelocidad() {
    return Math.max(0, Math.min(1.3, (velocidad || 0) / 100));
  }

  function aplicarVelocidad() {
    const f = factorVelocidad();
    for (const nombre of ['montesLejos', 'montesMedio', 'montesCerca']) {
      const a = capas[nombre] && capas[nombre].anim;
      if (!a) continue;
      if (f < 0.02) { a.pause(); continue; }
      if (a.updatePlaybackRate) a.updatePlaybackRate(f); else a.playbackRate = f;
      if (visible && a.playState !== 'running') a.play();
    }
  }

  function animarTodo() {
    const m = meteoActual;
    const viento = m && m.vientoVelocidad != null ? m.vientoVelocidad : 5;
    // Viento del oeste (270°): las nubes van hacia la izquierda; del este, a la derecha.
    const sentidoViento = m && m.vientoDireccion != null && Math.sin(m.vientoDireccion * Math.PI / 180) > 0 ? 1 : -1;
    animar('nubesLejos', 1.2 + viento * 0.05, sentidoViento);
    animar('nubesCerca', 2.4 + viento * 0.11, sentidoViento);
    animar('niebla1', 1.1, 1);
    animar('niebla2', 1.6, -1);
    animar('montesLejos', PX_S.lejos, -1);
    animar('montesMedio', PX_S.medio, -1);
    animar('montesCerca', PX_S.cerca, -1);
    aplicarVelocidad();
  }

  // --- Escena ---

  function escenaActual() {
    const m = meteoActual;
    const salida = m && m.sunrise ? new Date(m.sunrise).getTime() : null;
    const puesta = m && m.sunset ? new Date(m.sunset).getTime() : null;
    const sol = posicionSol(ahora(), salida, puesta);
    const p = ajustarPorTiempo(paleta(sol), m);
    return { sol, p, niebla: nieblaDe(m, sol) };
  }

  let pendiente = false;

  function pintarEscena(forzar) {
    if (!raiz) return;
    // Fuera de pantalla no se gasta CPU: se pinta al volver a la vista 2.
    if (!forzar && !visible) { pendiente = true; return; }
    pendiente = false;
    ancho = vista2.clientWidth;
    alto = vista2.clientHeight;
    if (ancho <= 0 || alto <= 0) return;
    const { sol, p, niebla } = escenaActual();
    const m = meteoActual;
    // Clave: lo que cambia el dibujo. La luz se cuantiza para no repintar a cada rato.
    const clave = [ancho, alto, m ? m.weatherCode : '-', sol.dia ? 'd' : 'n', sol.t < 0.5 ? 'a' : 'b',
      Math.round(sol.altura * 20), Math.round(niebla * 10)].join('|');
    if (!forzar && clave === claveEscena) return;
    claveEscena = clave;
    escala = Math.min(1.5, (window.devicePixelRatio || 1) * 0.75);

    const yH = alto * 0.66;
    pintarCielo(p, sol);
    pintarEstrellas(p);
    pintarAstro(p, sol);

    const nub = p.nubosidad;
    const cat = p.categoria;
    const cubierto = nub >= 0.75;
    pintarNubes('nubesLejos', p, {
      semilla: 31, top: alto * 0.04, alto: alto * 0.42,
      cantidad: Math.round(nub * 7 + (nub > 0 ? 1 : 0)), tam: 26, alfa: 0.22 + nub * 0.3, techo: 0,
    });
    pintarNubes('nubesCerca', p, {
      semilla: 57, top: 0, alto: alto * 0.4,
      cantidad: cubierto ? 9 : Math.round(nub * 4), tam: 44, alfa: 0.3 + nub * 0.35,
      techo: cubierto ? (cat === 'tormenta' ? 0.75 : 0.5) : 0,
    });
    const montes = {
      lejos: mezclar(p.horizonte, p.monte, 0.42),
      medio: mezclar(p.horizonte, p.monte, 0.72),
      cerca: mezclar(mezclar(p.horizonte, p.monte, 0.9), [0, 0, 0], 0.35),
    };
    pintarMontes('montesLejos', p, {
      semilla: 101, base: yH - alto * 0.07, amp: alto * 0.1, extra: 2, color: montes.lejos, borde: 0.18,
      armonicos: [[1, 1], [2, 0.7], [3, 0.5], [5, 0.3], [8, 0.18], [13, 0.08], [21, 0.04]],
    });
    pintarNiebla('niebla1', p, { semilla: 5, top: yH - alto * 0.08, alto: alto * 0.16, alfa: niebla });
    pintarMontes('montesMedio', p, {
      semilla: 202, base: yH + alto * 0.04, amp: alto * 0.07, extra: 4, color: montes.medio, borde: 0.14,
      armonicos: [[2, 1], [3, 0.6], [4, 0.45], [7, 0.3], [11, 0.15], [17, 0.08]],
    });
    pintarNiebla('niebla2', p, { semilla: 9, top: yH + alto * 0.06, alto: alto * 0.16, alfa: niebla * 0.8 });
    pintarMontes('montesCerca', p, {
      semilla: 303, base: yH + alto * 0.18, amp: alto * 0.045, extra: 16, color: montes.cerca, borde: 0.1,
      armonicos: [[3, 1], [5, 0.55], [9, 0.3], [14, 0.15], [23, 0.06]], pinos: true, casas: true,
    });
    animarTodo();
    programarTormenta();
  }

  // --- Tormenta: resplandor suave, nunca un destello ---

  function programarTormenta() {
    clearTimeout(tormentaTimer);
    if (!meteoActual || meteoActual.categoria !== 'tormenta' || reducido) return;
    tormentaTimer = setTimeout(() => {
      const el = capas.resplandor && capas.resplandor.el;
      if (el && visible && el.animate) {
        el.style.setProperty('--rx', (12 + Math.random() * 76).toFixed(0) + '%');
        el.animate(
          [{ opacity: 0 }, { opacity: 0.55, offset: 0.18 }, { opacity: 0.18, offset: 0.4 }, { opacity: 0.4, offset: 0.55 }, { opacity: 0 }],
          { duration: 2600, easing: 'ease-in-out' }
        );
      }
      programarTormenta();
    }, 14000 + Math.random() * 22000);
  }

  // --- Vigilante de fluidez ---

  // Una mala medida deja el paisaje quieto en esta sesión; dos seguidas (en
  // sesiones distintas), para siempre en este móvil.
  function medirFluidez() {
    if (midiendo || ligero || reducido || !visible || document.visibilityState !== 'visible') return;
    midiendo = true;
    let fotogramas = 0;
    const t0 = performance.now();
    const paso = (t) => {
      fotogramas++;
      if (t - t0 < MUESTREO_MS) { requestAnimationFrame(paso); return; }
      midiendo = false;
      const fps = fotogramas / ((t - t0) / 1000);
      if (document.visibilityState !== 'visible') return; // medida no válida
      if (fps < FPS_MINIMO) {
        ligero = true;
        let veces = 1;
        try {
          veces = Number(localStorage.getItem(CLAVE_LENTO) || 0) + 1;
          localStorage.setItem(CLAVE_LENTO, String(veces));
          if (veces >= 2) localStorage.setItem(CLAVE_LIGERO, '1');
        } catch (e) { /* nada */ }
        animarTodo();
        if (typeof debug !== 'undefined') debug.warn(`Paisaje: ${fps.toFixed(0)} fps, se queda quieto (modo ligero${veces >= 2 ? ', recordado' : ', esta sesión'})`);
      } else {
        try { localStorage.removeItem(CLAVE_LENTO); } catch (e) { /* nada */ }
        if (typeof debug !== 'undefined') debug.log(`Paisaje: ${fps.toFixed(0)} fps`);
      }
    };
    requestAnimationFrame(paso);
  }

  // --- API ---

  let medidas = 0;

  function init() {
    vista2 = document.getElementById('vista2');
    raiz = document.getElementById('v2Paisaje');
    if (!vista2 || !raiz) return;
    reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    leerOpciones();
    crearCapas();
    pintarEscena(true);
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((entradas) => {
        for (const e of entradas) {
          visible = e.intersectionRatio >= 0.5;
          for (const nombre of ORDEN) {
            const a = capas[nombre] && capas[nombre].anim;
            if (!a) continue;
            if (visible) a.play(); else a.pause();
          }
          if (visible) {
            aplicarVelocidad();
            if (pendiente) pintarEscena(false);
            // Dos medidas por sesión bastan para saber si el móvil llega.
            if (medidas < 2) { medidas++; setTimeout(medirFluidez, 1500); }
          }
        }
      }, { threshold: [0, 0.5, 1] }).observe(vista2);
    }
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => pintarEscena(false), 300);
    });
    setInterval(() => pintarEscena(false), REPINTAR_LUZ_MS);
  }

  function setMeteo(meteo) {
    meteoActual = meteo || null;
    pintarEscena(false);
    programarTormenta();
  }

  function setVelocidad(kmh) {
    const v = kmh == null ? 0 : kmh;
    if (Math.abs(v - velocidad) < 3) return;
    velocidad = v;
    aplicarVelocidad();
  }

  __global__.PaisajeFX = {
    init,
    setMeteo,
    setVelocidad,
    posicionSol,
    faseLunar,
    paleta,
    ajustarPorTiempo,
    nubosidadDe,
    nieblaDe,
    perfil,
    mezclar,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.PaisajeFX;
  }
})();
