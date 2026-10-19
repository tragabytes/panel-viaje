// cuaderno_vista.js — El modo cuaderno: revisar las marcas con calma (spec 001, H3).
//
// Se abre aparte, con ?cuaderno=1 (o con el atajo del icono de la app, o desde
// ?logs=1), y nunca en marcha: el panel no tiene ningún botón que lleve aquí
// (criterio 3 de H3). Todo lo que se guarda pasa por Cuaderno.* (cuaderno.js):
// este módulo no abre la base de datos de las marcas.
//
// Gasta datos solo aquí, que se usa en casa o parado:
//   · completar las marcas guardadas sin datos (H2, criterio 2): Nominatim por
//     la fila de 1 petición/s de LocationModule, y una consulta a Overpass por
//     marca si le faltan los pueblos;
//   · los sitios de Wikipedia alrededor de la marca que se abre (una consulta);
//   · el relieve del mapa (js/relieve.js, que lo guarda para siempre).
// Un fallo de red no se guarda (regla 4): la marca sigue pendiente y se vuelve
// a intentar la próxima vez.
//
// API pública (CuadernoVista):
//   CuadernoVista.arrancar()

(function () {
  'use strict';

  const RADIO_MIN_KM = 2;
  const RADIO_MAX_KM = 12;
  const TIMEOUT_MS = 10000;
  const LADOS = { delante: 'delante', derecha: 'a la derecha', 'detrás': 'detrás', izquierda: 'a la izquierda' };
  // Para "¿qué era?" sirve casi todo lo que se ve desde la carretera (ríos,
  // embalses, sierras, estaciones, hasta "Hospital de Órbigo", que es un
  // pueblo). Fuera solo carreteras, polígonos y artículos que no son sitios.
  const EXCLUIR_SITIOS = /\b(Autov[ií]a|Autopista|Pol[ií]gono industrial|Centro comercial)\b|\((empresa|compañía|revista|banda|película|álbum)\)|^[A-Z]{1,3}-\d/i;

  let marcas = [];
  let seleccion = null;     // id de la marca abierta
  let resaltado = null;     // nombre del candidato resaltado en el mapa
  let completando = false;
  const $ = {};

  // --- Utilidades ---

  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function fechaLarga(ms) {
    return new Date(ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
      .replace(/\./g, '').replace(',', '').toUpperCase();
  }

  function hora(ms) {
    const d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function distancia(km) {
    if (km == null) return '';
    return window.RadarV4 ? RadarV4.formatoDistancia(km) : km.toFixed(1) + ' km';
  }

  function lugarDe(m) {
    const c = m.contexto || {};
    if (m.revision && m.revision.elegido) return m.revision.elegido.nombre;
    return c.municipio || (m.lat != null ? 'Sin nombre todavía' : 'Sin posición');
  }

  function avisar(texto, ms) {
    $.estado.textContent = texto;
    $.estado.hidden = !texto;
    clearTimeout(avisar.t);
    if (texto && ms) avisar.t = setTimeout(() => { $.estado.hidden = true; }, ms);
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      // D40: sin red, el 503 lo pone el service worker, marcado.
      if (!resp.ok) throw new Error(resp.headers && resp.headers.get('X-Panel-Sin-Red') ? 'sin conexión' : 'HTTP ' + resp.status);
      return await resp.json();
    } finally {
      clearTimeout(id);
    }
  }

  function marcaAbierta() {
    return marcas.find((m) => m.id === seleccion) || null;
  }

  function reemplazar(nueva) {
    if (!nueva) return;
    // Lo tecleado y aún no guardado manda sobre lo que trae la base de datos.
    if (notaPendiente && notaPendiente.id === nueva.id) {
      nueva.revision = Object.assign({ elegido: null }, nueva.revision, { nota: notaPendiente.texto });
    }
    const i = marcas.findIndex((x) => x.id === nueva.id);
    if (i !== -1) marcas[i] = nueva;
  }

  // --- Completar con red (H2, criterio 2) ---

  async function sitiosWikipedia(lat, lon) {
    const url = 'https://es.wikipedia.org/w/api.php?action=query&list=geosearch' +
      `&gscoord=${lat}|${lon}&gsradius=10000&gslimit=40&format=json&origin=*`;
    const datos = await fetchJson(url);
    if (!datos || !datos.query) throw new Error('Wikipedia sin datos'); // regla 4: no es "no hay sitios"
    return (datos.query.geosearch || [])
      .filter((r) => !EXCLUIR_SITIOS.test(r.title))
      .map((r) => ({ nombre: r.title, lat: r.lat, lon: r.lon, pageid: r.pageid }));
  }

  async function pueblosOverpass(lat, lon) {
    const { datos } = await Overpass.query(POIFuentes.construirQueryPueblos(lat, lon), 'Cuaderno');
    return POIFuentes.parsearPueblos(datos, lat, lon).pueblos;
  }

  // Cada consulta por separado: si una falla, su dato queda en null y
  // completarContexto no toca lo que hubiera.
  // `reintentar`: también los pueblos provisionales (de Wikipedia), por si
  // Overpass ya contesta. Solo al pedirlo a mano: Overpass falla a menudo y,
  // al abrir el cuaderno, repetirlo con cada marca lo haría lentísimo.
  async function bajarDatos(m, conSitios, reintentar) {
    const c = m.contexto || {};
    const intento = async (fn) => { try { return await fn(); } catch (e) { return null; } };
    const datos = { ubicacion: null, via: null, pueblos: null, sitios: null };
    if (!c.municipio || c.ubicacionVieja) {
      datos.ubicacion = await intento(() => LocationModule.obtenerUbicacion(m.lat, m.lon, null));
    }
    if (!c.via || c.viaVieja) {
      datos.via = await intento(() => LocationModule.obtenerCarretera(m.lat, m.lon, null));
    }
    if (!c.pueblos || !c.pueblos.length || c.pueblosViejos || (reintentar && c.pueblosProvisionales)) {
      // Si Overpass no contesta, el mismo respaldo que usa el panel: Wikipedia,
      // que queda como provisional (regla 4).
      datos.pueblos = await intento(() => pueblosOverpass(m.lat, m.lon));
      if (!datos.pueblos || !datos.pueblos.length) {
        datos.pueblos = await intento(() => POIFuentes.obtenerPueblosWikipedia(m.lat, m.lon));
        datos.pueblosProvisionales = true;
      }
    }
    if (conSitios && !c.sitios) {
      datos.sitios = await intento(() => sitiosWikipedia(m.lat, m.lon));
    }
    return datos;
  }

  async function guardarCompletado(m, datos) {
    const algo = datos.ubicacion || datos.via || (datos.pueblos && datos.pueblos.length) || datos.sitios;
    if (!algo) return null;
    const nueva = await Cuaderno.actualizar(m.id, (actual) => Cuaderno.completarContexto(actual, datos, Date.now()));
    reemplazar(nueva);
    return nueva;
  }

  async function completarPendientes(manual) {
    if (completando) return;
    if (navigator.onLine === false) {
      if (manual) avisar('Sin conexión: las marcas se completarán cuando haya internet.', 4000);
      return;
    }
    const pendientes = marcas.filter((m) => Cuaderno.necesitaCompletar(m) ||
      (manual && m.lat != null && m.contexto && m.contexto.pueblosProvisionales));
    if (!pendientes.length) {
      if (manual) avisar('No hay marcas pendientes de completar.', 3000);
      return;
    }
    completando = true;
    let hechas = 0;
    try {
      for (const [i, m] of pendientes.entries()) {
        avisar(`Completando marcas con internet… ${i + 1} de ${pendientes.length}`);
        const actualizada = await guardarCompletado(m, await bajarDatos(m, false, manual));
        if (actualizada && !Cuaderno.necesitaCompletar(actualizada)) hechas++;
        pintarLista();
        if (actualizada && actualizada.id === seleccion) pintarDetalle();
      }
      const faltan = pendientes.length - hechas;
      avisar(faltan ? `Completadas ${hechas}; ${faltan} siguen pendientes (lo intentaré la próxima vez).` : `Completadas ${hechas} marcas.`, 5000);
    } finally {
      completando = false;
    }
  }

  // Al abrir una marca: sus sitios de Wikipedia, si aún no los tiene.
  async function completarSitios(m) {
    if (!m || m.lat == null || (m.contexto && m.contexto.sitios) || navigator.onLine === false) return;
    try {
      const sitios = await sitiosWikipedia(m.lat, m.lon);
      await guardarCompletado(m, { ubicacion: null, via: null, pueblos: null, sitios });
      if (m.id === seleccion) pintarDetalle();
    } catch (e) {
      // Sin red: se queda sin sitios y se reintenta al volver a abrirla.
    }
  }

  // --- Lista ---

  let errorLectura = false;

  function pintarLista() {
    $.cuenta.textContent = errorLectura ? '' : (marcas.length === 1 ? '1 marca' : `${marcas.length} marcas`);
    $.vacio.hidden = marcas.length > 0 || errorLectura;
    $.cuerpo.hidden = marcas.length === 0;
    const viajes = Cuaderno.agruparPorViaje(marcas);
    $.lista.innerHTML = viajes.map((v) => {
      const lugares = v.marcas.map((m) => (m.contexto && m.contexto.municipio) || '').filter(Boolean);
      const ruta = lugares.length ? (lugares[0] === lugares[lugares.length - 1] ? lugares[0] : `${lugares[0]} → ${lugares[lugares.length - 1]}`) : '';
      const filas = v.marcas.map((m) => {
        const c = m.contexto || {};
        const via = c.via ? (c.via.codigo || c.via.texto) : '';
        const pend = Cuaderno.necesitaCompletar(m);
        const nota = m.revision && m.revision.nota;
        return `<button type="button" class="cu-fila${m.id === seleccion ? ' cu-fila--activa' : ''}" data-id="${m.id}">
          <span class="cu-fila-hora">${hora(m.id)}</span>
          <span class="cu-fila-txt">
            <span class="cu-fila-lugar">${m.revision && m.revision.elegido ? '<span class="cu-check">✓</span> ' : ''}${escapar(lugarDe(m))}</span>
            <span class="cu-fila-sub">${escapar([via, nota ? '✎ ' + nota : ''].filter(Boolean).join(' · ')) || '&nbsp;'}</span>
          </span>
          ${pend ? '<span class="cu-fila-pend" title="Pendiente de completar">•</span>' : ''}
        </button>`;
      }).join('');
      return `<section class="cu-viaje">
        <h2 class="cu-viaje-cab"><span>${escapar(fechaLarga(v.inicio))}</span><span class="cu-viaje-ruta">${escapar(ruta)}</span></h2>
        ${filas}
      </section>`;
    }).join('');
  }

  // --- Detalle ---

  function metaDe(m) {
    const c = m.contexto || {};
    const partes = [];
    if (c.via) partes.push(c.via.codigo || c.via.texto);
    if (c.meteo && (c.meteo.descripcion || c.meteo.temperatura != null)) {
      partes.push([c.meteo.descripcion, c.meteo.temperatura != null ? Math.round(c.meteo.temperatura) + '°' : ''].filter(Boolean).join(' · '));
    }
    if (m.rumbo != null && window.RadarV4) partes.push('hacia el ' + RadarV4.cardinal(m.rumbo));
    if (m.velocidadKmh != null) partes.push(Math.round(m.velocidadKmh) + ' km/h');
    return partes.join(' · ');
  }

  function avisosDe(m) {
    const c = m.contexto || {};
    const a = [];
    if (m.lat == null) a.push('No había GPS: solo se guardó la hora.');
    else if (m.aproximada) a.push('Posición aproximada: el GPS llevaba un rato sin dar señal.');
    if (c.ubicacionVieja || c.viaVieja) a.push('Sin cobertura al marcar: el pueblo o la vía que se veían eran de unos km antes.');
    if (Cuaderno.necesitaCompletar(m)) a.push('Pendiente de completar con internet.');
    return a;
  }

  function iconoTipo(tipo) {
    if (tipo === 'pueblo') return '<span class="cu-ico cu-ico--pueblo"></span>';
    return '<span class="cu-ico cu-ico--sitio"></span>';
  }

  function pintarDetalle() {
    // Una nota a medio escribir no se pierde si llega un repintado (sitios de
    // Wikipedia, una marca completada...): se conserva lo tecleado y el cursor.
    const activa = document.activeElement;
    const enEdicion = activa && activa.id === 'cuNota'
      ? { id: seleccion, valor: activa.value, inicio: activa.selectionStart, fin: activa.selectionEnd }
      : null;
    try {
      pintarDetalleSinNota();
    } catch (err) {
      $.detalle.innerHTML = '<p class="cu-elige">No se ha podido abrir esta marca.</p>';
      if (typeof debug !== 'undefined') debug.error(`Cuaderno: marca ${seleccion} sin pintar (${err && err.message})`);
      return;
    }
    const nota = document.getElementById('cuNota');
    if (enEdicion && nota && enEdicion.id === seleccion) {
      nota.value = enEdicion.valor;
      nota.focus();
      nota.setSelectionRange(enEdicion.inicio, enEdicion.fin);
    }
  }

  function pintarDetalleSinNota() {
    const m = marcaAbierta();
    if (!m) {
      $.detalle.innerHTML = marcas.length
        ? '<p class="cu-elige">Elige una marca de la lista.</p>'
        : '';
      return;
    }
    const cands = Cuaderno.candidatos(m);
    const elegido = m.revision && m.revision.elegido;
    const nota = (m.revision && m.revision.nota) || '';
    const urlMapa = elegido && elegido.lat != null ? Cuaderno.urlMapa(elegido.lat, elegido.lon) : Cuaderno.urlMapa(m.lat, m.lon);
    const urlWiki = elegido ? Cuaderno.urlWikipedia(elegido) : null;
    const avisos = avisosDe(m);
    $.detalle.innerHTML = `
      <button type="button" class="cu-atras">← Marcas</button>
      <header class="cu-det-cab">
        <div class="cu-det-hora">${escapar(fechaLarga(m.id))} · ${hora(m.id)}</div>
        <h2 class="cu-det-lugar">${escapar((m.contexto && m.contexto.municipio) || lugarDe(m))}</h2>
        <div class="cu-det-meta">${escapar(metaDe(m))}</div>
        ${elegido ? `<div class="cu-det-era">Era: <b>${escapar(elegido.nombre)}</b> <button type="button" class="cu-quitar">quitar</button></div>` : ''}
        ${avisos.map((a) => `<div class="cu-aviso">${escapar(a)}</div>`).join('')}
      </header>
      <div class="cu-det-cuerpo">
        ${m.lat != null ? `<figure class="cu-mapa">
          <canvas class="cu-mapa-lienzo" aria-label="Mapa de lo que había alrededor"></canvas>
          <figcaption class="cu-mapa-pie">${m.rumbo != null ? 'Arriba, hacia donde ibas' : 'Norte arriba'}</figcaption>
        </figure>` : ''}
        <div class="cu-cands">
          <div class="cu-sec">¿Qué era?</div>
          ${cands.length ? `<ul class="cu-cands-lista">${cands.map((c) => {
            const es = elegido && elegido.nombre === c.nombre;
            const donde = [distancia(c.distKm), c.lado ? LADOS[c.lado] : ''].filter(Boolean).join(' · ');
            return `<li class="cu-cand${es ? ' cu-cand--elegido' : ''}${resaltado === c.nombre ? ' cu-cand--resaltado' : ''}" data-nombre="${escapar(c.nombre)}">
              ${c.foto ? `<img class="cu-cand-foto" src="${escapar(c.foto)}" alt="" loading="lazy">` : iconoTipo(c.tipo)}
              <span class="cu-cand-txt"><span class="cu-cand-nombre">${escapar(c.nombre)}</span><span class="cu-cand-donde">${escapar(donde)}</span></span>
              <button type="button" class="cu-era" data-nombre="${escapar(c.nombre)}">${es ? '✓ Era esto' : 'Era esto'}</button>
            </li>`;
          }).join('')}</ul>` : `<p class="cu-nada">${m.lat == null ? 'Sin posición no hay alrededor.' : 'Todavía no hay nada alrededor: se completará con internet.'}</p>`}
        </div>
      </div>
      <label class="cu-sec" for="cuNota">Nota</label>
      <textarea id="cuNota" class="cu-nota" rows="3" maxlength="2000" placeholder="Lo que quieras recordar de este sitio…">${escapar(nota)}</textarea>
      <div class="cu-enlaces">
        ${urlMapa ? `<a class="cu-boton" href="${escapar(urlMapa)}" target="_blank" rel="noopener">Ver en el mapa</a>` : ''}
        ${urlWiki ? `<a class="cu-boton" href="${escapar(urlWiki)}" target="_blank" rel="noopener">Wikipedia</a>` : ''}
        <button type="button" class="cu-boton cu-boton--peligro cu-borrar">Borrar marca</button>
      </div>`;
    const lienzo = $.detalle.querySelector('.cu-mapa-lienzo');
    if (lienzo) dibujarMapa(lienzo, m, cands, elegido ? elegido.nombre : null, resaltado);
  }

  // --- Mapa de la marca ---

  async function dibujarMapa(lienzo, m, cands, destacado, resaltadoNombre) {
    const lado = lienzo.clientWidth || 220;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(lado * dpr);
    lienzo.height = Math.round(lado * dpr);
    lienzo.style.height = lado + 'px';
    const ctx = lienzo.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const conPos = cands.filter((c) => c.distKm != null);
    const cercanos = conPos.slice().sort((a, b) => a.distKm - b.distKm).slice(0, 8);
    const maxKm = cercanos.length ? cercanos[cercanos.length - 1].distKm : RADIO_MIN_KM;
    const radioKm = Math.min(RADIO_MAX_KM, Math.max(RADIO_MIN_KM, maxKm * 1.15));
    const pxPorKm = (lado / 2) / radioKm;
    const rumbo = m.rumbo != null ? m.rumbo : 0;

    const pintar = (relieve) => {
      if (!lienzo.isConnected) return; // ya se abrió otra marca
      ctx.clearRect(0, 0, lado, lado);
      ctx.fillStyle = '#020805';
      ctx.fillRect(0, 0, lado, lado);
      ctx.save();
      ctx.translate(lado / 2, lado / 2);
      ctx.rotate(-rumbo * Math.PI / 180);
      if (relieve) ctx.drawImage(relieve, -relieve.width / 2, -relieve.height / 2);
      ctx.restore();
      // Anillos y su distancia.
      ctx.strokeStyle = 'rgba(61, 255, 110, 0.22)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(138, 154, 149, 0.9)';
      ctx.font = '9px "JetBrains Mono", monospace';
      for (let i = 1; i <= 3; i++) {
        const r = (lado / 2) * i / 3;
        ctx.beginPath();
        ctx.arc(lado / 2, lado / 2, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(distancia(radioKm * i / 3), lado / 2 + 3, lado / 2 - r + 10);
      }
      // Lo que tenías delante: un cono suave hacia arriba si se sabe el rumbo.
      if (m.rumbo != null) {
        const g = ctx.createRadialGradient(lado / 2, lado / 2, 0, lado / 2, lado / 2, lado / 2);
        g.addColorStop(0, 'rgba(61, 255, 110, 0.10)');
        g.addColorStop(1, 'rgba(61, 255, 110, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(lado / 2, lado / 2);
        ctx.arc(lado / 2, lado / 2, lado / 2, -Math.PI / 2 - Math.PI / 4, -Math.PI / 2 + Math.PI / 4);
        ctx.closePath();
        ctx.fill();
      }
      // Candidatos y sus nombres, sin pisarse (misma regla que el radar).
      const items = [];
      for (const c of conPos) {
        if (c.lat == null) continue;
        const p = RadarV4.aPantalla(m, c.lat, c.lon, pxPorKm);
        const s = RadarV4.girarAPantalla(p.x, p.y, rumbo);
        if (Math.abs(s.x) > lado / 2 - 2 || Math.abs(s.y) > lado / 2 - 2) continue;
        items.push({ clave: c.nombre, x: s.x, y: s.y, ancho: Math.min(c.nombre.length, 22) * 5.6 + 4, alto: 13, c });
      }
      const prioridad = (it) => (it.clave === destacado ? 0 : (it.clave === resaltadoNombre ? 1 : 2));
      const orden = items.slice().sort((a, b) => prioridad(a) - prioridad(b));
      const lados = RadarV4.colocarEtiquetas(orden.map((it) => ({ ...it, y: it.y + 4 })),
        [{ x0: -8, y0: -12, x1: 8, y1: 8 }], { x0: -lado / 2 + 2, y0: -lado / 2 + 2, x1: lado / 2 - 2, y1: lado / 2 - 2 });
      ctx.save();
      ctx.translate(lado / 2, lado / 2);
      for (const it of orden.slice().reverse()) {
        const es = it.clave === destacado;
        ctx.fillStyle = es ? '#ffb547' : (it.c.tipo === 'pueblo' ? '#3dff6e' : '#c8ffd6');
        ctx.beginPath();
        if (it.c.tipo === 'pueblo') ctx.arc(it.x, it.y, es ? 4.5 : 3.2, 0, Math.PI * 2);
        else { ctx.moveTo(it.x, it.y - 3.6); ctx.lineTo(it.x + 3.6, it.y); ctx.lineTo(it.x, it.y + 3.6); ctx.lineTo(it.x - 3.6, it.y); ctx.closePath(); }
        ctx.fill();
        const res = !es && it.clave === resaltadoNombre;
        if (es || res) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = es ? 'rgba(255, 181, 71, 0.7)' : 'rgba(232, 243, 239, 0.8)';
          ctx.beginPath();
          ctx.arc(it.x, it.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        const ladoTxt = lados[it.clave];
        if (ladoTxt === 'oculta') continue;
        const texto = it.c.nombre.length > 22 ? it.c.nombre.slice(0, 21) + '…' : it.c.nombre;
        ctx.font = (es ? '600 ' : '') + '10px "Space Grotesk", system-ui, sans-serif';
        ctx.textAlign = ladoTxt === 'izquierda' ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        const tx = ladoTxt === 'izquierda' ? it.x - 7 : it.x + 7;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.strokeText(texto, tx, it.y);
        ctx.fillStyle = es ? '#ffd9a0' : '#e8f3ef';
        ctx.fillText(texto, tx, it.y);
      }
      ctx.restore();
      // El coche, en el centro, mirando hacia donde iba.
      ctx.save();
      ctx.translate(lado / 2, lado / 2);
      ctx.fillStyle = '#7dffa0';
      ctx.shadowColor = 'rgba(61, 255, 110, 0.7)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      if (m.rumbo != null) { ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); }
      else ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    pintar(null);
    if (!window.Relieve) return;
    try {
      // Con el giro, las esquinas del cuadrado quedan a radio·√2.
      const r = await Relieve.componer({
        lat: m.lat, lon: m.lon, radioKm: radioKm * 1.42, pxPorKm,
        zoom: Relieve.zoomPara(m.lat, pxPorKm),
        red: navigator.onLine !== false,
      });
      if (lienzo.isConnected) pintar(r.canvas);
    } catch (e) {
      // Sin relieve: se queda el mapa sin fondo.
    }
  }

  // --- Acciones ---

  async function abrir(id) {
    seleccion = id;
    resaltado = null;
    // En pantalla estrecha, la lista y el detalle no caben juntos: se pasa al detalle.
    $.raiz.classList.add('cu--detalle');
    pintarLista();
    pintarDetalle();
    $.detalle.scrollTop = 0;
    completarSitios(marcaAbierta());
  }

  async function elegir(nombre) {
    const m = marcaAbierta();
    if (!m) return;
    const actual = m.revision && m.revision.elegido;
    const c = nombre ? Cuaderno.candidatos(m).find((x) => x.nombre === nombre) : null;
    const elegido = (actual && actual.nombre === nombre) ? null : c; // segundo toque: quitar
    reemplazar(await Cuaderno.actualizar(m.id, (x) => Cuaderno.aplicarRevision(x, { elegido }, Date.now())));
    pintarLista();
    pintarDetalle();
  }

  let notaTimer = null;
  let notaPendiente = null; // { id, texto } tecleado y aún sin guardar

  function guardarNota(texto) {
    const m = marcaAbierta();
    if (m) m.revision = Object.assign({ elegido: null }, m.revision, { nota: texto });
    notaPendiente = { id: seleccion, texto };
    clearTimeout(notaTimer);
    notaTimer = setTimeout(guardarNotaYa, 600);
  }

  async function guardarNotaYa() {
    clearTimeout(notaTimer);
    const p = notaPendiente;
    if (!p) return;
    try {
      const nueva = await Cuaderno.actualizar(p.id, (x) => Cuaderno.aplicarRevision(x, { nota: p.texto }, Date.now()));
      if (notaPendiente === p) notaPendiente = null;
      if (nueva) {
        reemplazar(nueva);
        pintarLista();
      }
    } catch (err) {
      avisar('No se ha podido guardar la nota. Vuelve a intentarlo.', 5000);
    }
  }

  async function borrarAbierta() {
    const m = marcaAbierta();
    if (!m) return;
    if (!confirm(`¿Borrar la marca de las ${hora(m.id)} (${lugarDe(m)})? No se puede deshacer.`)) return;
    await Cuaderno.borrar(m.id);
    marcas = marcas.filter((x) => x.id !== m.id);
    seleccion = null;
    $.raiz.classList.remove('cu--detalle');
    pintarLista();
    pintarDetalle();
  }

  async function compartir() {
    if (!marcas.length) return;
    const texto = Cuaderno.textoParaCompartir(marcas);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Cuaderno de viaje', text: texto });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // cancelado por el usuario
    }
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Copiado: pégalo donde quieras (WhatsApp, correo, notas…).', 4000);
    } catch (e) {
      avisar('No se pudo compartir ni copiar en este navegador.', 4000);
    }
  }

  // Descarga un archivo con la fecha de hoy en el nombre (.json o .kml).
  function descargar(contenido, tipo, extension) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const d = new Date();
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuaderno-viaje-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportar() {
    const copia = await Cuaderno.exportar();
    descargar(JSON.stringify(copia, null, 1), 'application/json', 'json');
    avisar(`Copia descargada con ${copia.marcas.length} marcas.`, 4000);
  }

  // Para verlas en un mapa de Google: My Maps (Crear mapa → Importar) o
  // Google Earth. Es otra cosa que la copia de seguridad: no se puede volver a
  // importar aquí, y las marcas sin posición no van.
  function exportarKml() {
    const conPosicion = marcas.filter((m) => m.lat != null && m.lon != null).length;
    if (!conPosicion) { avisar('Ninguna marca tiene posición: no hay nada que llevar a un mapa.', 4000); return; }
    descargar(Cuaderno.aKML(marcas), 'application/vnd.google-earth.kml+xml', 'kml');
    const sin = marcas.length - conPosicion;
    avisar(`Mapa descargado con ${conPosicion} marcas${sin ? ` (${sin} sin posición no van)` : ''}. Ábrelo en Google My Maps (Crear mapa → Importar) o en Google Earth.`, 7000);
  }

  async function importar(archivo) {
    try {
      const n = await Cuaderno.importar(await archivo.text());
      marcas = await Cuaderno.listar();
      pintarLista();
      pintarDetalle();
      avisar(n ? `Añadidas ${n} marcas de la copia.` : 'La copia no tenía marcas nuevas.', 4000);
    } catch (e) {
      avisar('Ese archivo no es una copia del cuaderno.', 4000);
    }
  }

  function cerrarMenu() { $.menu.hidden = true; }

  // --- Arranque ---

  async function arrancar() {
    document.getElementById('visor').style.display = 'none';
    for (const id of ['appHeader', 'pageDots', 'btnFullscreen']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    $.raiz = document.getElementById('vistaCuaderno');
    $.raiz.hidden = false;
    document.body.classList.add('modo-cuaderno');
    for (const [k, id] of Object.entries({
      cuenta: 'cuCuenta', estado: 'cuEstado', cuerpo: 'cuCuerpo', lista: 'cuLista',
      detalle: 'cuDetalle', vacio: 'cuVacio', menu: 'cuMenu', archivo: 'cuArchivo',
    })) $[k] = document.getElementById(id);

    $.lista.addEventListener('click', (e) => {
      const fila = e.target.closest('.cu-fila');
      if (fila) abrir(Number(fila.dataset.id));
    });
    $.detalle.addEventListener('click', (e) => {
      if (e.target.closest('.cu-atras')) {
        $.raiz.classList.remove('cu--detalle');
        return;
      }
      const era = e.target.closest('.cu-era');
      if (era) { elegir(era.dataset.nombre); return; }
      if (e.target.closest('.cu-quitar')) { elegir(null); return; }
      if (e.target.closest('.cu-borrar')) { borrarAbierta(); return; }
      const cand = e.target.closest('.cu-cand');
      if (cand) {
        resaltado = resaltado === cand.dataset.nombre ? null : cand.dataset.nombre;
        pintarDetalle();
      }
    });
    $.detalle.addEventListener('input', (e) => {
      if (e.target.id === 'cuNota') guardarNota(e.target.value);
    });
    $.detalle.addEventListener('focusout', (e) => {
      if (e.target.id === 'cuNota') guardarNotaYa();
    });
    window.addEventListener('pagehide', () => { guardarNotaYa(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) guardarNotaYa(); });
    const volver = $.raiz.querySelector('.cu-volver');
    if (volver) {
      volver.addEventListener('click', (e) => {
        if (!notaPendiente) return;
        e.preventDefault();
        guardarNotaYa().finally(() => { location.href = volver.href; });
      });
    }
    document.getElementById('cuCompartir').addEventListener('click', compartir);
    document.getElementById('cuMas').addEventListener('click', (e) => {
      e.stopPropagation();
      $.menu.hidden = !$.menu.hidden;
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#cuMenu')) cerrarMenu(); });
    document.getElementById('cuExportar').addEventListener('click', () => { cerrarMenu(); exportar(); });
    document.getElementById('cuKml').addEventListener('click', () => { cerrarMenu(); exportarKml(); });
    document.getElementById('cuImportar').addEventListener('click', () => { cerrarMenu(); $.archivo.click(); });
    document.getElementById('cuCompletar').addEventListener('click', () => { cerrarMenu(); completarPendientes(true); });
    $.archivo.addEventListener('change', () => {
      if ($.archivo.files && $.archivo.files[0]) importar($.archivo.files[0]);
      $.archivo.value = '';
    });
    window.addEventListener('online', () => completarPendientes(false));

    try {
      marcas = await Cuaderno.listar();
    } catch (e) {
      marcas = [];
      errorLectura = true;
      avisar('No se ha podido leer el cuaderno. Tus marcas no se han borrado: cierra la app y vuelve a abrirla.', 0);
    }
    // Con pantalla ancha, se abre la marca más reciente.
    if (marcas.length && window.matchMedia('(min-width: 560px)').matches) {
      seleccion = marcas.reduce((a, b) => (b.id > a.id ? b : a)).id;
    }
    pintarLista();
    pintarDetalle();
    if (seleccion) completarSitios(marcaAbierta());
    completarPendientes(false);
  }

  window.CuadernoVista = { arrancar };
})();
