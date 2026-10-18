// v4_radar.js — La vista 4 como un radar con relieve (specs/002-radar-relieve).
//
// Lo que tienes delante, arriba: el disco gira con el rumbo de la marcha. Debajo,
// el relieve (js/relieve.js); encima, anillos cada 5 km, un barrido lento y los
// pueblos cercanos como ecos que se iluminan cuando el barrido pasa por ellos.
// Las marcas del cuaderno que caen dentro aparecen como rombos.
//
// Coste (CLAUDE.md, regla 1): casi todo lo mueve el compositor (giro del
// relieve con la propiedad rotate, barrido, latido de los ecos, desplazamiento).
// JS recoloca unos pocos ecos por tick de GPS, ya girados (si girasen con el
// disco, en una media vuelta se descompasaban de las etiquetas), y recompone
// el relieve cada ~1,5 km a partir de lo que ya tiene en memoria.
// Datos (regla 2): el relieve solo se pide con la vista 4 en pantalla y solo
// el círculo que se ve (casi siempre 4 teselas).
//
// API pública (RadarV4):
//   RadarV4.init()                                   → busca sus elementos en #vista4
//   RadarV4.posicion({ lat, lon, rumbo, velocidadKmh })  cada tick de GPS
//   RadarV4.pueblos([{ nombre, lat, lon }])
//   RadarV4.marcas([{ id, lat, lon }])
//   Puras (probadas en Node): aPantalla, desenrollar, retrasoEco,
//       debeRecomponer, formatoDistancia, cardinal

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const RADIO_KM = 15;
  // El relieve se compone con un poco de margen para poder desplazarlo sin
  // recomponer, y solo el círculo (el radar es un disco): con 4 km y el
  // cuadrado entero se bajaban 4-9 teselas; así, casi siempre 4.
  const MARGEN_KM = 1.5;
  const KM_POR_GRADO = 111.32;
  const PERIODO_BARRIDO_MS = 8000;
  // Por debajo de esta velocidad el rumbo del GPS no vale: el disco se queda quieto.
  const VEL_MIN_GIRO_KMH = 5;
  // Por debajo de esto no se gira: el rumbo calculado entre posiciones tiene
  // un ruido de ±2-7° y el disco se balanceaba en plena recta.
  const GIRO_MIN_GRADOS = 4;
  // Un giro mayor (media vuelta, un cruce) se aplica de golpe: durante la
  // transición el relieve gira en arco y los ecos van en línea recta, y se
  // separaban hasta 40 px a mitad de camino.
  const GIRO_BRUSCO_GRADOS = 30;
  const MAX_PUEBLOS = 8;

  // --- Puras ---

  // Posición en el disco (px, norte arriba) de (lat, lon) vista desde `desde`.
  // Misma aproximación local que el lienzo del relieve, así que casan.
  function aPantalla(desde, lat, lon, pxPorKm) {
    const kmX = (lon - desde.lon) * KM_POR_GRADO * Math.cos(desde.lat * Math.PI / 180);
    const kmY = (lat - desde.lat) * KM_POR_GRADO;
    const distKm = Math.sqrt(kmX * kmX + kmY * kmY);
    const rumbo = (Math.atan2(kmX, kmY) * 180 / Math.PI + 360) % 360;
    return { x: kmX * pxPorKm, y: -kmY * pxPorKm, distKm, rumbo };
  }

  // Ángulo acumulado: sumar siempre el giro corto, sin saltos de 359° a 0°.
  function desenrollar(acumulado, nuevo) {
    const actual = ((acumulado % 360) + 360) % 360;
    const delta = ((nuevo - actual + 540) % 360) - 180;
    return acumulado + delta;
  }

  // animation-delay (ms, negativo) para que el eco de un pueblo en `rumbo` se
  // encienda justo cuando el barrido, que va por `fase`, pase por él.
  // `localMs` es lo que lleva corriendo la animación del eco (0 si es nueva):
  // cambiar el retraso de una animación en marcha no la reinicia, así que hay
  // que contarlo o el eco queda a destiempo.
  function retrasoEco(rumbo, fase, periodoMs, localMs) {
    const desdeQuePaso = ((((fase - rumbo) % 360) + 360) % 360) / 360 * periodoMs;
    const resto = ((((localMs || 0) - desdeQuePaso) % periodoMs) + periodoMs) % periodoMs;
    return resto - periodoMs;
  }

  // El disco visible (RADIO_KM alrededor de la posición) sigue dentro del
  // círculo compuesto (RADIO_KM + margen alrededor de su centro) mientras el
  // coche no se aleje del centro más que el margen.
  function debeRecomponer(comp, lat, lon, pxPorKm, margenKm) {
    if (!comp) return true;
    if (Math.abs(comp.pxPorKm - pxPorKm) > 0.01) return true;
    const p = aPantalla(comp, lat, lon, 1);
    return p.distKm > margenKm;
  }

  // Punto del disco (marco del mapa, norte arriba) a la pantalla, con el disco
  // girado −rumbo (CSS rotate: positivo = horario, y hacia abajo).
  function girarAPantalla(x, y, rumbo) {
    const a = -rumbo * Math.PI / 180;
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  }

  function solapan(a, b) {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  }

  // Etiquetas sin pisarse: del más cercano al más lejano, cada una prueba a la
  // derecha de su punto, a la izquierda, y luego encima y debajo de cada lado
  // (primero el sitio que ya tenía, `preferido`, para no saltar a cada tick);
  // si no cabe en ninguno (o se sale de los límites), se queda solo el punto.
  // Con pueblos apiñados a 2-3 km, con solo dos sitios salía un nombre de cinco.
  //   items: [{ clave, x, y, ancho, alto, preferido? }] relativos al centro
  //   obstaculos: [{ x0, y0, x1, y1 }]   limites: { x0, y0, x1, y1 }
  function colocarEtiquetas(items, obstaculos, limites) {
    // Todos los puntos ocupan sitio desde el principio: ninguna etiqueta tapa un punto.
    const ocupado = (obstaculos || []).concat(items.map((it) => ({ x0: it.x - 5, y0: it.y - 5, x1: it.x + 5, y1: it.y + 5 })));
    const lados = {};
    for (const it of items) {
      const der = { x0: it.x + 8, x1: it.x + 8 + it.ancho };
      const izq = { x0: it.x - 8 - it.ancho, x1: it.x - 8 };
      const centro = { y0: it.y - 9, y1: it.y - 9 + it.alto };
      const arriba = { y0: it.y - 4 - it.alto, y1: it.y - 4 };
      const abajo = { y0: it.y + 5, y1: it.y + 5 + it.alto };
      const opciones = [
        ['derecha', Object.assign({}, der, centro)],
        ['izquierda', Object.assign({}, izq, centro)],
        ['derecha-arriba', Object.assign({}, der, arriba)],
        ['izquierda-arriba', Object.assign({}, izq, arriba)],
        ['derecha-abajo', Object.assign({}, der, abajo)],
        ['izquierda-abajo', Object.assign({}, izq, abajo)],
      ];
      const i = opciones.findIndex(([lado]) => lado === it.preferido);
      if (i > 0) opciones.unshift(opciones.splice(i, 1)[0]);
      lados[it.clave] = 'oculta';
      for (const [lado, caja] of opciones) {
        const dentro = !limites || (caja.x0 >= limites.x0 && caja.x1 <= limites.x1 && caja.y0 >= limites.y0 && caja.y1 <= limites.y1);
        if (dentro && !ocupado.some((o) => solapan(o, caja))) {
          lados[it.clave] = lado;
          ocupado.push(caja);
          break;
        }
      }
    }
    return lados;
  }

  function formatoDistancia(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    return km.toFixed(1).replace('.', ',') + ' km';
  }

  function cardinal(grados) {
    const puntos = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return puntos[Math.round((((grados % 360) + 360) % 360) / 45) % 8];
  }

  // --- Estado ---

  let raiz = null, disco = null, lienzo = null, barrido = null, capaPins = null, norte = null, rotulo15 = null;
  let $rumbo = null, $altitud = null;
  let visible = false;
  let pos = null;
  let pxPorKm = 0, radioPx = 0;
  let rumboAcum = 0, rumboConocido = false;
  let comp = null, componiendo = false;
  let listaPueblos = [];
  let listaMarcas = [];
  const nodos = new Map(); // clave → { el, dist, rumboEco }
  let reducido = false;

  function escapar(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let limites = null; // dónde pueden ir las etiquetas, relativo al centro del disco

  function medir() {
    if (!disco) return;
    const r = disco.clientWidth / 2;
    if (r <= 0) return;
    radioPx = r;
    pxPorKm = r / RADIO_KM;
    // Medido en pantalla y relativo a la vista (vale con el visor desplazado
    // y con el disco movido por transform, como en vertical).
    const vista = raiz.parentElement;
    const rv = vista.getBoundingClientRect();
    const rr = raiz.getBoundingClientRect();
    const cx = rr.left - rv.left + rr.width / 2;
    const cy = rr.top - rv.top + rr.height / 2;
    const cab = document.getElementById('appHeader');
    const arriba = cab ? cab.offsetHeight : 0;
    limites = {
      x0: -(cx - (vista.clientWidth * 0.40)), // sin invadir la columna de datos
      x1: vista.clientWidth - cx - 6,
      y0: -(cy - arriba - 4),
      y1: vista.clientHeight - cy - 14,       // los puntos de página van abajo
    };
  }

  function faseBarrido() {
    try {
      const a = barrido && barrido.getAnimations ? barrido.getAnimations()[0] : null;
      if (a && a.currentTime != null) return (a.currentTime % PERIODO_BARRIDO_MS) / PERIODO_BARRIDO_MS * 360;
    } catch (e) { /* sin Web Animations: los ecos laten igual, sin sincronía */ }
    return 0;
  }

  // --- Relieve ---

  function colocarRelieve() {
    if (!comp || !pos || !lienzo) return;
    const p = aPantalla(pos, comp.lat, comp.lon, pxPorKm);
    raiz.style.setProperty('--rx', p.x.toFixed(1) + 'px');
    raiz.style.setProperty('--ry', p.y.toFixed(1) + 'px');
  }

  function quizaRecomponer() {
    if (!visible || !pos || componiendo || !window.Relieve || pxPorKm <= 0) return;
    const incompleto = comp && comp.faltan && Date.now() >= comp.reintentarEn;
    if (!incompleto && !debeRecomponer(comp, pos.lat, pos.lon, pxPorKm, MARGEN_KM)) return;
    componiendo = true;
    const centro = { lat: pos.lat, lon: pos.lon };
    const escala = pxPorKm;
    Relieve.componer({ lat: centro.lat, lon: centro.lon, radioKm: RADIO_KM + MARGEN_KM, pxPorKm: escala, red: visible, circulo: true })
      .then((r) => {
        const lado = r.canvas.width;
        lienzo.width = lado;
        lienzo.height = lado;
        lienzo.getContext('2d').drawImage(r.canvas, 0, 0);
        lienzo.style.width = lado + 'px';
        lienzo.style.height = lado + 'px';
        // Sin transición en el salto de centro: el lienzo nuevo ya está centrado.
        // (Solo el relieve: el giro, si lo hay, sigue su curso.)
        raiz.classList.add('p4-recomponiendo');
        // Si faltaron teselas (sin cobertura), se reintenta pasado un rato,
        // no en cada tick: relieve.js tampoco vuelve a pedirlas antes de 60 s.
        comp = { lat: centro.lat, lon: centro.lon, pxPorKm: escala, faltan: r.faltan, reintentarEn: Date.now() + 30000 };
        colocarRelieve();
        void lienzo.offsetWidth;
        raiz.classList.remove('p4-recomponiendo');
        lienzo.classList.add('p4-relieve--listo');
        pintarAltitud();
      })
      .catch((err) => {
        if (typeof debug !== 'undefined') debug.warn(`Radar: relieve sin componer (${err && err.message})`);
      })
      .finally(() => { componiendo = false; });
  }

  function pintarAltitud() {
    if (!$altitud || !pos || !window.Relieve) return;
    const alt = Relieve.altitud(pos.lat, pos.lon);
    $altitud.textContent = alt != null ? alt.toLocaleString('es') + ' m' : '—';
  }

  // --- Ecos ---

  function claveDe(tipo, item) {
    return tipo === 'marca' ? 'm:' + item.id : `p:${item.nombre}|${Number(item.lat).toFixed(3)},${Number(item.lon).toFixed(3)}`;
  }

  function crearNodo(tipo, item) {
    const el = document.createElement('div');
    el.className = 'p4-blip p4-blip--' + tipo;
    if (tipo === 'pueblo') {
      el.innerHTML =
        '<div class="p4-blip-dot"></div>' +
        '<div class="p4-blip-label">' +
          `<div class="p4-blip-name">${escapar(item.nombre)}</div>` +
          '<div class="p4-blip-dist"></div>' +
        '</div>';
    } else {
      el.innerHTML = '<div class="p4-blip-dot"></div>';
    }
    capaPins.appendChild(el);
    return { el, dist: el.querySelector('.p4-blip-dist'), punto: el.querySelector('.p4-blip-dot'), rumboEco: null, textoDist: '', lejos: null, lado: null };
  }

  function colocarEcos() {
    if (!capaPins || !pos || pxPorKm <= 0) return;
    const deseados = new Map();
    for (const p of listaPueblos) {
      if (p && p.nombre && p.lat != null && p.lon != null) deseados.set(claveDe('pueblo', p), ['pueblo', p]);
    }
    for (const m of listaMarcas) {
      if (m && m.lat != null && m.lon != null) {
        const d = aPantalla(pos, m.lat, m.lon, 1).distKm;
        if (d <= RADIO_KM) deseados.set(claveDe('marca', m), ['marca', m]);
      }
    }
    for (const [clave, n] of nodos) {
      if (!deseados.has(clave)) { n.el.remove(); nodos.delete(clave); }
    }
    const fase = faseBarrido();
    const etiquetas = [];
    for (const [clave, [tipo, item]] of deseados) {
      let n = nodos.get(clave);
      if (!n) { n = crearNodo(tipo, item); nodos.set(clave, n); }
      const p = aPantalla(pos, item.lat, item.lon, pxPorKm);
      // Fuera del disco: pegado al borde y apagado, como en un radar.
      const lejos = p.distKm > RADIO_KM;
      const f = lejos ? (radioPx * 0.97) / Math.hypot(p.x, p.y) : 1;
      // Ya girado: el disco de relieve gira −rumbo; los ecos van encima sin girar.
      const s = girarAPantalla(p.x * f, p.y * f, rumboAcum);
      n.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      if (lejos !== n.lejos) {
        n.el.classList.toggle('p4-blip--lejos', lejos);
        n.lejos = lejos;
        n.rumboEco = null; // su animación vuelve a empezar: resincronizar
      }
      if (n.dist) {
        const txt = formatoDistancia(p.distKm);
        if (txt !== n.textoDist) { n.dist.textContent = txt; n.textoDist = txt; }
      }
      if (!reducido && !lejos && (n.rumboEco === null || Math.abs(desenrollar(n.rumboEco, p.rumbo) - n.rumboEco) > 3)) {
        n.punto.style.animationDelay = Math.round(retrasoEco(p.rumbo, fase, PERIODO_BARRIDO_MS, tiempoEco(n))) + 'ms';
        n.rumboEco = p.rumbo;
      }
      if (tipo === 'pueblo') {
        const largo = Math.max(item.nombre.length, (n.textoDist || '').length);
        etiquetas.push({ clave, x: s.x, y: s.y, ancho: largo * 6.4 + 4, alto: 26, distKm: p.distKm, nodo: n, preferido: n.lado });
      }
    }
    etiquetas.sort((a, b) => a.distKm - b.distKm);
    const lados = colocarEtiquetas(etiquetas, obstaculos(), limites);
    for (const e of etiquetas) {
      const lado = lados[e.clave];
      e.nodo.lado = lado;
      e.nodo.el.classList.toggle('p4-blip--izq', lado.startsWith('izquierda'));
      e.nodo.el.classList.toggle('p4-blip--arr', lado.endsWith('arriba'));
      e.nodo.el.classList.toggle('p4-blip--aba', lado.endsWith('abajo'));
      e.nodo.el.classList.toggle('p4-blip--sin-nombre', lado === 'oculta');
    }
  }

  // Lo que lleva corriendo la animación de un eco (0 si acaba de empezar).
  function tiempoEco(n) {
    try {
      const a = n.punto.getAnimations ? n.punto.getAnimations()[0] : null;
      return a && a.currentTime != null ? a.currentTime : 0;
    } catch (e) {
      return 0;
    }
  }

  // El coche del centro, la «N» y los rótulos de los anillos: ninguna etiqueta
  // debe taparlos.
  const COCHE = { x0: -10, y0: -16, x1: 10, y1: 8 };
  function obstaculos() {
    const lista = [COCHE];
    if (radioPx > 0) {
      const n = girarAPantalla(0, -radioPx, rumboAcum);
      lista.push({ x0: n.x - 9, y0: n.y - 9, x1: n.x + 9, y1: n.y + 9 });
      for (const r of [1 / 3, 2 / 3, 1]) {
        lista.push({ x0: radioPx * r - 28, y0: 0, x1: radioPx * r, y1: 24 });
      }
    }
    return lista;
  }

  // La «N» en el borde del disco, donde queda el norte con el giro actual.
  function colocarNorte() {
    if (!norte || radioPx <= 0) return;
    const s = girarAPantalla(0, -radioPx, rumboAcum);
    norte.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    // Con el norte a la derecha, la «N» cae sobre el rótulo de 15 km: se oculta.
    if (rotulo15) rotulo15.classList.toggle('p4-anillo-txt--oculto', s.x > radioPx * 0.8 && Math.abs(s.y) < 36);
  }

  // --- Giro ---

  // Devuelve cuántos grados ha girado el disco (0 si no ha girado).
  function aplicarRumbo(r, velocidadKmh) {
    if (r == null || isNaN(r)) return 0;
    if (velocidadKmh != null && velocidadKmh < VEL_MIN_GIRO_KMH) return 0;
    // También el primero por el camino corto (desde 0): con 300°, el disco
    // daba 300° de vuelta en vez de −60°.
    const nuevo = desenrollar(rumboAcum, r);
    if (rumboConocido && Math.abs(nuevo - rumboAcum) < GIRO_MIN_GRADOS) return 0;
    const giro = nuevo - rumboAcum;
    if (Math.abs(giro) > GIRO_BRUSCO_GRADOS) raiz.classList.add('p4-sin-transicion');
    rumboAcum = nuevo;
    rumboConocido = true;
    raiz.style.setProperty('--rumbo', rumboAcum.toFixed(1) + 'deg');
    colocarNorte();
    if ($rumbo) $rumbo.textContent = `${cardinal(r)} · ${Math.round(((r % 360) + 360) % 360)}°`;
    return giro;
  }

  // --- API ---

  function init() {
    const vista = document.getElementById('vista4');
    raiz = document.getElementById('v4Radar');
    if (!vista || !raiz) return;
    disco = raiz.querySelector('.p4-disco');
    lienzo = document.getElementById('v4Relieve');
    barrido = raiz.querySelector('.p4-barrido');
    capaPins = document.getElementById('v4Pins');
    norte = raiz.querySelector('.p4-norte');
    const rotulos = raiz.querySelectorAll('.p4-anillo-txt');
    rotulo15 = rotulos.length ? rotulos[rotulos.length - 1] : null;
    $rumbo = document.getElementById('v4Rumbo');
    $altitud = document.getElementById('v4Altitud');
    reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    medir();
    colocarNorte();
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((entradas) => {
        for (const e of entradas) {
          visible = e.intersectionRatio >= 0.5;
          vista.classList.toggle('p4-inactiva', !visible);
          if (visible) { medir(); colocarNorte(); colocarEcos(); quizaRecomponer(); }
        }
      }, { threshold: [0, 0.5, 1] }).observe(vista);
    } else {
      visible = true;
    }
    window.addEventListener('resize', () => {
      const antes = pxPorKm;
      medir();
      if (antes !== pxPorKm) { colocarNorte(); colocarEcos(); quizaRecomponer(); }
    });
  }

  function posicion(p) {
    if (!raiz || !p || p.lat == null || p.lon == null) return;
    pos = { lat: p.lat, lon: p.lon };
    const giro = aplicarRumbo(p.rumbo, p.velocidadKmh);
    if (pxPorKm <= 0) medir();
    colocarRelieve();
    colocarEcos();
    if (Math.abs(giro) > GIRO_BRUSCO_GRADOS) {
      // Giro grande aplicado de golpe; las transiciones vuelven para el siguiente tick.
      void raiz.offsetWidth;
      raiz.classList.remove('p4-sin-transicion');
    }
    quizaRecomponer();
    pintarAltitud();
  }

  function pueblos(lista) {
    listaPueblos = (lista || []).slice(0, MAX_PUEBLOS);
    colocarEcos();
  }

  function marcas(lista) {
    listaMarcas = lista || [];
    colocarEcos();
  }

  __global__.RadarV4 = {
    init,
    posicion,
    pueblos,
    marcas,
    aPantalla,
    desenrollar,
    retrasoEco,
    debeRecomponer,
    MARGEN_KM,
    girarAPantalla,
    colocarEtiquetas,
    formatoDistancia,
    cardinal,
    RADIO_KM,
    PERIODO_BARRIDO_MS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.RadarV4;
  }
})();
