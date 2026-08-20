// js/main.js — Bootstrap del panel (DT-08, sesión 33).
//
// Este archivo concentra toda la orquestación que antes vivía inline en
// index.html: referencias DOM, funciones de pintado, actualización por
// datos, tick GPS, manejo del viewport y arranque del simulador o GPS real.
//
// El patrón anterior ("panelBlock: { ... break panelBlock; }") se sustituye
// por la función arrancar() que decide entre arrancarVistaLogs() y
// arrancarPanel() en función del parámetro ?logs=1.
//
// Debe cargarse DESPUÉS de todos los módulos (geo, debug, wakelock, etc.).

(function () {
  'use strict';

  // ===== Configuración común que usan ambos modos =====

  // IU-09: botón de pantalla completa. Se conecta siempre (en modo logs
  // también existe en el DOM aunque se oculta).
  function configurarBotonFullscreen() {
    const btn = document.getElementById('btnFullscreen');
    if (!btn) return;
    if (!document.documentElement.requestFullscreen) {
      btn.style.display = 'none';
      return;
    }
    btn.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (err) {
        if (typeof debug !== 'undefined') debug.warn(`Fullscreen: ${err.message}`);
      }
    });
    document.addEventListener('fullscreenchange', () => {
      document.body.classList.toggle('fullscreen-activo', !!document.fullscreenElement);
    });
    // Ocultar el botón en modo logs (no aplica).
    if (new URLSearchParams(location.search).get('logs') === '1') {
      btn.style.display = 'none';
    }
  }

  // BPC-13: parámetro ?safearea=N simula un inset extra en los laterales
  // derecho y superior para iterar desde escritorio. En móvil real, los
  // env(safe-area-inset-*) ya aportan los valores correctos con viewport-fit=cover.
  function configurarSafeAreaDev() {
    const extra = parseInt(new URLSearchParams(location.search).get('safearea') || '0', 10);
    if (extra > 0 && extra < 200) {
      document.documentElement.style.setProperty('--safe-extra', extra + 'px');
    }
  }

  // SVGs temáticos para POIs sin foto (V3 grid). Sustituyen al placeholder
  // de rayas cuando ni Wikipedia ni Wikidata identifican el POI. Heredan
  // currentColor del CSS (fósforo dim). viewBox 24x24 para todos.
  const SVG_CASTLE   = '<svg viewBox="0 0 24 24"><path d="M3 22V8l3 1V5l3 1V3l3-1 3 1v3l3-1v4l3-1v14z"/><path d="M9 22v-6h6v6"/></svg>';
  const SVG_CHURCH   = '<svg viewBox="0 0 24 24"><path d="M12 2v5"/><path d="M10 4h4"/><path d="M12 7l-7 5v10h14V12z"/><path d="M10 22v-5a2 2 0 0 1 4 0v5"/></svg>';
  const SVG_MONUMENT = '<svg viewBox="0 0 24 24"><path d="M9 22V8l3-6 3 6v14z"/><path d="M6 22h12"/></svg>';
  const SVG_RUINS    = '<svg viewBox="0 0 24 24"><path d="M3 22h18"/><path d="M5 22V9M10 22v-7M14 22v-9M19 22V11"/><path d="M3 6h18l-2 3H5z"/></svg>';
  const SVG_VIEW     = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const SVG_STAR     = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>';
  const SVG_PEAK     = '<svg viewBox="0 0 24 24"><path d="M2 22l7-12 4 6 3-4 6 10z"/></svg>';
  const SVG_PIN      = '<svg viewBox="0 0 24 24"><path d="M12 22s8-7 8-13a8 8 0 0 0-16 0c0 6 8 13 8 13z"/><circle cx="12" cy="9" r="3"/></svg>';
  const ICONOS_SVG_POI = {
    castle: SVG_CASTLE, fort: SVG_CASTLE, city_gate: SVG_CASTLE,
    cathedral: SVG_CHURCH, monastery: SVG_CHURCH, church: SVG_CHURCH, chapel: SVG_CHURCH,
    monument: SVG_MONUMENT, memorial: SVG_MONUMENT,
    ruins: SVG_RUINS, archaeological_site: SVG_RUINS,
    viewpoint: SVG_VIEW,
    attraction: SVG_STAR,
    peak: SVG_PEAK,
  };
  function iconoSvgPoi(tipo) {
    return ICONOS_SVG_POI[tipo] || SVG_PIN;
  }

  // ===== Vista logs (?logs=1): administración de trayectos persistidos =====

  function arrancarVistaLogs() {
    document.getElementById('visor').style.display = 'none';
    document.getElementById('vistaLogs').style.display = '';
    document.body.style.overflow = 'auto';

    const $lista = document.getElementById('logsLista');
    const $vacio = document.getElementById('logsVacio');
    const $borrarTodos = document.getElementById('logsBorrarTodos');

    function pad2(n){return n<10?'0'+n:''+n;}
    function fmtFecha(ms){
      const d = new Date(ms);
      return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+
             ' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
    }
    function fmtDuracion(ms){
      const s = Math.max(0, Math.floor(ms/1000));
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (h) return h+'h '+pad2(m)+'m';
      if (m) return m+'m '+pad2(sec)+'s';
      return sec+'s';
    }

    async function pintarLista() {
      $lista.innerHTML = '';
      const trayectos = await Trayectos.listar();
      if (!trayectos.length) {
        $vacio.style.display = '';
        return;
      }
      $vacio.style.display = 'none';
      for (const t of trayectos) {
        const card = document.createElement('div');
        card.style.cssText = 'background:#1a1f2e; border:1px solid #2a3142; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;';
        const info = document.createElement('div');
        info.style.cssText = 'flex:1; min-width:220px;';
        const duracionMs = t.fin ? (new Date(t.fin) - t.id) : 0; // fin no se marca; queda 0 por ahora
        info.innerHTML =
          '<div style="font-size:15px; font-weight:600;">'+fmtFecha(t.id)+'</div>'+
          '<div style="font-size:12px; color:#94a3b8; margin-top:2px;">'+
            t.nMensajes+' mensajes · '+t.nTrack+' puntos de track'+
          '</div>';
        const acciones = document.createElement('div');
        acciones.style.cssText = 'display:flex; gap:8px;';
        const btnDescargar = document.createElement('button');
        btnDescargar.type = 'button';
        btnDescargar.textContent = 'Descargar';
        btnDescargar.style.cssText = 'background:#1d4ed8; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer;';
        btnDescargar.addEventListener('click', () => descargar(t.id));
        const btnBorrar = document.createElement('button');
        btnBorrar.type = 'button';
        btnBorrar.textContent = 'Borrar';
        btnBorrar.style.cssText = 'background:#7f1d1d; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer;';
        btnBorrar.addEventListener('click', async () => {
          if (!confirm('¿Borrar este trayecto? No se puede deshacer.')) return;
          await Trayectos.borrar(t.id);
          await pintarLista();
        });
        acciones.appendChild(btnDescargar);
        acciones.appendChild(btnBorrar);
        card.appendChild(info);
        card.appendChild(acciones);
        $lista.appendChild(card);
      }
    }

    async function descargar(id) {
      const texto = await Trayectos.exportarTxt(id);
      if (!texto) { alert('No se pudo generar el archivo.'); return; }
      const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date(id);
      const nombre = 'panel-viaje-'+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'-'+
                     pad2(d.getHours())+pad2(d.getMinutes())+pad2(d.getSeconds())+'.txt';
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    $borrarTodos.addEventListener('click', async () => {
      if (!confirm('¿Borrar TODOS los trayectos? No se puede deshacer.')) return;
      await Trayectos.borrarTodos();
      await pintarLista();
    });

    pintarLista();
  }

  // ===== Panel normal (modo por defecto) =====

  function arrancarPanel() {
    // Inicia el trayecto ANTES del primer debug.log para que todo quede
    // persistido en IDB desde la primera línea (FN-02a).
    if (window.Trayectos) Trayectos.iniciar();
    debug.log('Página cargada');

    // DT-01 (sesión 33): registrar service worker para funcionamiento offline
    // e instalación como PWA. Fire-and-forget; si falla el registro, el
    // panel sigue funcionando normal (pero sin caché offline).
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js')
        .then(reg => { debug.log('SW registrado (scope: ' + reg.scope + ')'); })
        .catch(err => { debug.warn('SW registro fallido: ' + (err && err.message ? err.message : err)); });
    } else {
      debug.log('SW no soportado por este navegador');
    }

    // Pedir wake lock para que la pantalla no se apague durante el viaje.
    // El módulo se reactiva solo cuando la pestaña vuelve del segundo plano.
    if (window.WakeLock) {
      WakeLock.activar();
    }

    // --- Referencias DOM ---

    const $estado           = document.getElementById('estado');
    const $carreteraBloque  = document.getElementById('carreteraBloque');
    const $salidaBloque     = document.getElementById('salidaBloque');
    const $salidaNum        = document.getElementById('salidaNum');
    const $salidaDist       = document.getElementById('salidaDist');
    const $salidaSig        = document.getElementById('salidaSig');
    const $salidaDestinos   = document.getElementById('salidaDestinos');
    const $admin            = document.getElementById('admin');
    // IU-33: meta gris en cabecera global (comarca · HAB · M). Sustituye al
    // antiguo #datosMunicipio que vivía en .p1-place dentro de V1.
    const $globalPlaceMeta  = document.getElementById('globalPlaceMeta');
    const $poiBloque        = document.getElementById('poiBloque');
    const $poiScroll        = document.getElementById('poiScroll');
    const $poiV1Lista       = document.getElementById('poiV1Lista');
    const $v3Gasolineras    = document.getElementById('v3Gasolineras');
    const $v3GasolinerasL   = document.getElementById('v3GasolinerasLista');
    const $v1Gasolineras    = document.getElementById('v1Gasolineras');
    const $meteoTemp        = document.getElementById('meteoTemp');
    const $meteoDescripcion = document.getElementById('meteoDescripcion');
    const $meteoViento      = document.getElementById('meteoViento');
    const $meteoLluvia      = document.getElementById('meteoLluvia');
    const $meteoVisib       = document.getElementById('meteoVisib');
    const $meteoPrevision   = document.getElementById('meteoPrevision');
    const $v1VelocidadLimite = document.getElementById('v1VelocidadLimite');
    const $lat              = document.getElementById('lat');
    const $lon              = document.getElementById('lon');
    const $precision        = document.getElementById('precision');
    const $velocidad        = document.getElementById('velocidad');
    const $rumbo            = document.getElementById('rumbo');
    const $hora             = document.getElementById('hora');

    // Vista 2 elements
    const $vista1           = document.getElementById('vista1');
    const $vista2           = document.getElementById('vista2');
    const $v2MeteoTemp      = document.getElementById('v2MeteoTemp');
    const $v2MeteoDesc      = document.getElementById('v2MeteoDesc');
    const $v2MeteoStory     = document.getElementById('v2MeteoStory');
    const $v2MeteoMetrics   = document.getElementById('v2MeteoMetrics');
    const $v2MeteoTimeline  = document.getElementById('v2MeteoTimeline');

    const $v1Velocidad      = document.getElementById('v1Velocidad');

    // Vista 3 elements
    const $v3Grid           = document.getElementById('v3Grid');
    const $v3PoiCounter     = document.getElementById('v3PoiCounter');
    // IU-22: V4 Entorno (cartografía)
    const $v4Coords         = document.getElementById('v4Coords');
    const $v4Placename      = document.getElementById('v4Placename');
    const $v4Pins           = document.getElementById('v4Pins');

    // DT-22: el radio de búsqueda de pueblos que ve el conductor sale de la
    // constante real del módulo, para que no vuelvan a divergir (el literal
    // decía "25 KM" cuando la búsqueda real es de 15 km).
    const RADIO_PUEBLOS_KM_TXT = (window.POIFuentes && POIFuentes.RADIO_PUEBLOS_M)
      ? Math.round(POIFuentes.RADIO_PUEBLOS_M / 1000)
      : 15;
    const $v4RadioTag = document.getElementById('v4RadioTag');
    if ($v4RadioTag) $v4RadioTag.textContent = `ENTORNO · RADIO ${RADIO_PUEBLOS_KM_TXT} KM`;

    // IU-33: la cabecera global puede crecer si los crumbs envuelven (pueblo
    // largo + comarca + HAB + M no caben en una línea). Sincroniza el alto
    // real con --app-header-h para que las vistas dejen el padding correcto.
    const $appHeader = document.getElementById('appHeader');
    if ($appHeader && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(() => {
        const h = $appHeader.offsetHeight;
        if (h > 0) {
          document.documentElement.style.setProperty('--app-header-h', h + 'px');
        }
      });
      ro.observe($appHeader);
    }

    // --- Helpers ---

    // IU-12: estado del cielo (noche | amanecer | dia | atardecer).
    // amanecer y atardecer: ventanas de 45 min antes y 15 min después del
    // evento solar, para cubrir la hora azul + primer/último sol bajo.
    function calcularMomentoDia(sunriseISO, sunsetISO, nowMs) {
      if (!sunriseISO || !sunsetISO) return 'dia';
      const sunrise = new Date(sunriseISO).getTime();
      const sunset  = new Date(sunsetISO).getTime();
      if (isNaN(sunrise) || isNaN(sunset)) return 'dia';
      const m45 = 45 * 60 * 1000;
      const m15 = 15 * 60 * 1000;
      if (nowMs >= sunrise - m45 && nowMs <= sunrise + m15) return 'amanecer';
      if (nowMs >= sunset  - m45 && nowMs <= sunset  + m15) return 'atardecer';
      if (nowMs >  sunrise + m15 && nowMs <  sunset  - m45) return 'dia';
      return 'noche';
    }

    function escapar(texto) {
      const div = document.createElement('div');
      div.textContent = texto;
      return div.innerHTML;
    }

    // DT-02 (sesión 33): distanciaMetros vive en js/geo.js.
    const distanciaMetros = Geo.distanciaMetros;

    function mostrarEstado(texto, clase) {
      // IU-19: $estado vive en el topbar V1 (.p1-estado). CSS esconde .ok y
      // deja error/aviso visibles en color. Se mantiene la API previa.
      $estado.textContent = texto;
      $estado.className = 'p1-estado ' + (clase || '');
    }

    function formatearAdmin(info) {
      if (!info.ccaa && !info.provincia) return '—';
      if (info.provincia && info.ccaa && info.provincia !== info.ccaa) {
        return `${info.provincia} · ${info.ccaa}`;
      }
      return info.provincia || info.ccaa;
    }

    // V1 HUD (IU-19): crumbs territoriales con separador fósforo intermedio.
    // Usa HTML mínimo en lugar de textContent para poder atenuar el "·".
    function formatearAdminV1Html(info) {
      if (!info.ccaa && !info.provincia) return '';
      const partes = [];
      if (info.ccaa) partes.push(escapar(info.ccaa));
      if (info.provincia && info.provincia !== info.ccaa) partes.push(escapar(info.provincia));
      return partes.join(' <span class="p1-sep">·</span> ');
    }

    // Convierte grados (0-360) a punto cardinal castellano para V1.
    function gradosACardinal(deg) {
      if (deg == null || isNaN(deg)) return '';
      const puntos = ['N','NE','E','SE','S','SO','O','NO'];
      return puntos[Math.round(deg / 45) % 8];
    }

    // IU-20 V2: renderiza la palabra gigante letra a letra (una <span> por
    // carácter) para que el CSS .p2-word span pueda animar cada letra con un
    // wobble suave escalonado. Si etiqueta viene vacía o null, devuelve "".
    function renderPalabraGigante(etiqueta) {
      if (!etiqueta) return '';
      return String(etiqueta).split('').map(ch =>
        `<span>${escapar(ch)}</span>`
      ).join('');
    }

    // IU-20 V2: construye la "story line" debajo de la temperatura grande.
    // Prioriza el dato más útil al conducir:
    //   - si NO llueve ahora y hay lluvia >=30% en las próximas 6h: "Va a llover a las HH:00"
    //   - si SÍ llueve ahora: "Para hacia las HH:00" (primera hora con <30%)
    //   - si nada: "Sin lluvia prevista"
    // Añade "· ráfagas N km/h" cuando el viento actual es notable (>15 km/h).
    function renderStoryV2(meteo, horas) {
      const partes = [];
      const esAhoraLluvia = meteo.categoria === 'lluvia' || meteo.categoria === 'tormenta';
      const finestras = horas || [];
      if (esAhoraLluvia) {
        const paraEn = finestras.find(h => (h.precipProbabilidad || 0) < 30);
        if (paraEn && paraEn.hora) {
          partes.push(`Para hacia las <span class="u-phos u-tab">${escapar(paraEn.hora.slice(11, 16))}</span>`);
        } else {
          partes.push('Lluvia persistente');
        }
      } else {
        const empiezaEn = finestras.find(h => (h.precipProbabilidad || 0) >= 30);
        if (empiezaEn && empiezaEn.hora) {
          partes.push(`Va a llover a las <span class="u-phos u-tab">${escapar(empiezaEn.hora.slice(11, 16))}</span>`);
        } else {
          partes.push('Sin lluvia prevista');
        }
      }
      if (meteo.vientoVelocidad != null && Math.round(meteo.vientoVelocidad) > 15) {
        partes.push(
          `<span class="u-dim"> · ráfagas </span>` +
          `<span class="u-tab">${Math.round(meteo.vientoVelocidad)} ${escapar(meteo.vientoUnidad || 'km/h')}</span>`
        );
      }
      return partes.join('');
    }

    // IU-20 V2: timeline vertical de 6 horas. Cada fila tiene hora, temp,
    // una barra horizontal (ancho = precipProbabilidad 0-100%) y, si hay
    // lluvia, el valor numérico al final. El peso tipográfico crece con la
    // intensidad (300 en seco → 800 a 100%) y el fósforo gana alpha — así
    // la tormenta salta a la vista sin depender de leer el número.
    function renderTimelineV2(horas) {
      if (!horas || horas.length === 0) return '';
      const n = Math.min(6, horas.length);
      return horas.slice(0, n).map(h => {
        const pct = Math.min(100, Math.max(0, h.precipProbabilidad || 0));
        const intensity = pct / 100;
        const fontWeight = Math.round(300 + intensity * 500);
        const alpha = (0.4 + intensity * 0.6).toFixed(2);
        const hora = h.hora ? h.hora.slice(11, 13) + 'h' : '';
        const temp = h.temperatura != null ? Math.round(h.temperatura) + '°' : '—';
        const color = `rgba(125, 255, 160, ${alpha})`;
        const pctText = pct > 0 ? Math.round(pct) + '%' : '';
        // IU-32: icono meteo de la hora a la izquierda de la temperatura.
        // h.icono es el id del symbol del sprite (meteo-sol, meteo-lluvia, ...).
        const iconoHora = h.icono || 'meteo-desconocido';
        return `<div class="p2-hr" style="font-weight:${fontWeight}; color:${color}">
          <span class="p2-hr-hour">${escapar(hora)}</span>
          <span class="p2-hr-icon" aria-hidden="true">${MeteoCodigos.iconoSVG(iconoHora)}</span>
          <span class="p2-hr-temp">${escapar(temp)}</span>
          <div class="p2-hr-bar" style="width:${Math.round(pct)}%"></div>
          <span class="p2-hr-pct">${escapar(pctText)}</span>
        </div>`;
      }).join('');
    }

    // IU-20 V2 (ajuste): fila de métricas meteo complementarias — viento con
    // punto cardinal, humedad, visibilidad en km. Discretas, en una sola línea.
    function renderMetricsV2(meteo) {
      if (!meteo) return '';
      const partes = [];
      if (meteo.vientoVelocidad != null) {
        const cardinal = gradosACardinal(meteo.vientoDireccion);
        const vel = Math.round(meteo.vientoVelocidad);
        partes.push(
          `<span class="p2-metric">
            <span class="p2-metric-label u-caps">VIENTO</span>
            <span class="p2-metric-value">${vel} ${escapar(meteo.vientoUnidad || 'km/h')}${cardinal ? ' ' + cardinal : ''}</span>
          </span>`
        );
      }
      if (meteo.humedad != null) {
        partes.push(
          `<span class="p2-metric">
            <span class="p2-metric-label u-caps">HUMEDAD</span>
            <span class="p2-metric-value">${meteo.humedad}${escapar(meteo.humedadUnidad || '%')}</span>
          </span>`
        );
      }
      if (meteo.visibilidad != null) {
        const km = Math.round(meteo.visibilidad / 1000);
        partes.push(
          `<span class="p2-metric">
            <span class="p2-metric-label u-caps">VISIB.</span>
            <span class="p2-metric-value">${km} km</span>
          </span>`
        );
      }
      return partes.join('');
    }

    // IU-22 V4: pinta chinchetas de pueblos posicionadas geográficamente
    // respecto al usuario centrado. El radio visible cubre 25 km (radio fijo
    // 130px); los pueblos más lejanos quedan atenuados con .p4-pin-far.
    // DT-18: el cálculo de las chinchetas se separa del pintado para poder
    // reposicionarlas por estilo en cada tick sin reconstruir el DOM.
    function calcularPinsV4(pueblos, userLat, userLon) {
      // Elipse: más ancho horizontal que vertical, aprovecha el viewport
      // apaisado 640×360. AQUÍ queda centrado en (0,0).
      const RADIO_X = 270;
      const RADIO_Y = 155;
      const MIN_R  = 0.35;  // fracción mínima para no caer sobre AQUÍ
      const lista = pueblos.slice(0, 6);
      const distancias = lista.map(p => p.distKm != null ? p.distKm : 0);
      const maxDist = Math.max.apply(null, distancias);
      const escalaKm = Math.min(25, Math.max(5, maxDist * 1.05));

      // Distribución angular uniforme: los pueblos cercanos tienden a estar
      // en el mismo sector geográfico (ej. todos al norte), lo que amontona
      // las chinchetas. Cartografía abstracta: ordenamos por rumbo real y
      // los repartimos uniformemente en 360° partiendo del rumbo del primero.
      // Así cada pueblo ocupa su propio sector y el orden visual (horario)
      // sigue el orden geográfico real.
      const conRumbo = lista.map(p => {
        const rumbo = (p.lat != null && p.lon != null && window.Geo && Geo.rumboHacia)
          ? Geo.rumboHacia(userLat, userLon, p.lat, p.lon)
          : 0;
        return { p, rumbo };
      });
      const ordenados = conRumbo.slice().sort((a, b) => a.rumbo - b.rumbo);
      const stride = 360 / ordenados.length;
      const offset = ordenados[0] ? ordenados[0].rumbo : 0;
      const anguloVisual = new Map();
      ordenados.forEach((item, i) => {
        anguloVisual.set(item.p, (offset + i * stride) % 360);
      });
      return lista.map(p => {
        const distKm = p.distKm != null ? p.distKm : 0;
        const anguloDeg = anguloVisual.has(p) ? anguloVisual.get(p) : 0;
        const rad = anguloDeg * Math.PI / 180;
        const rNorm = Math.max(MIN_R, Math.min(distKm / escalaKm, 1.0));
        const dx = Math.sin(rad) * rNorm * RADIO_X;
        const dy = -Math.cos(rad) * rNorm * RADIO_Y;
        // Label al lado opuesto del centro: a la derecha si el pin está al
        // este del usuario, a la izquierda si al oeste. Así los nombres
        // "apuntan hacia afuera" y se pisan menos entre sí.
        return {
          nombre: p.nombre || '',
          dx, dy,
          side: (dx >= 0) ? 'right' : 'left',
          far: distKm > 25,
          distTxt: distKm < 1
            ? Math.round(distKm * 1000) + ' m'
            : distKm.toFixed(1) + ' km',
        };
      });
    }

    function pintarV4Mapa(pueblos, userLat, userLon) {
      if (!$v4Pins) return;
      if (!pueblos || pueblos.length === 0 || userLat == null || userLon == null) {
        $v4Pins.innerHTML = '';
        return;
      }
      $v4Pins.innerHTML = calcularPinsV4(pueblos, userLat, userLon).map(pin =>
        `<div class="p4-pin${pin.far ? ' p4-pin-far' : ''}" data-side="${pin.side}" style="left:calc(50% + ${pin.dx.toFixed(0)}px); top:calc(50% + ${pin.dy.toFixed(0)}px)">
          <div class="p4-pin-dot"></div>
          <div class="p4-pin-label">
            <div class="p4-pin-name">${escapar(pin.nombre)}</div>
            <div class="p4-pin-dist">${escapar(pin.distTxt)}</div>
          </div>
        </div>`
      ).join('');
    }

    // DT-18: mismo set de pueblos → los pins existen y en el mismo orden;
    // basta actualizar posición, lado, lejanía y texto de distancia.
    function reposicionarPinsV4(pueblos, userLat, userLon) {
      if (!$v4Pins || !$v4Pins.children.length) return;
      if (!pueblos || pueblos.length === 0 || userLat == null || userLon == null) return;
      const pins = calcularPinsV4(pueblos, userLat, userLon);
      const nodos = $v4Pins.children;
      for (let i = 0; i < nodos.length && i < pins.length; i++) {
        const nodo = nodos[i];
        const pin = pins[i];
        nodo.style.left = `calc(50% + ${pin.dx.toFixed(0)}px)`;
        nodo.style.top = `calc(50% + ${pin.dy.toFixed(0)}px)`;
        nodo.dataset.side = pin.side;
        nodo.classList.toggle('p4-pin-far', pin.far);
        const nodoDist = nodo.querySelector('.p4-pin-dist');
        if (nodoDist) nodoDist.textContent = pin.distTxt;
      }
    }

    // IU-22 V4: formatea coordenadas GPS a formato grados-minutos con
    // hemisferio (ej. "40°34′N · 3°54′O"). Se muestra en la esquina superior
    // derecha del mapa como cartografía.
    function formatearCoordsGMS(lat, lon) {
      const fmt = (v, pos, neg) => {
        const deg = Math.abs(Math.trunc(v));
        const min = Math.round(Math.abs(v - Math.trunc(v)) * 60);
        const m = (min === 60) ? 0 : min;
        const d = (min === 60) ? deg + 1 : deg;
        const h = v >= 0 ? pos : neg;
        return `${d}°${String(m).padStart(2, '0')}′${h}`;
      };
      return `${fmt(lat, 'N', 'S')} · ${fmt(lon, 'E', 'O')}`;
    }

    // Mini-forecast 4 horas para V1 (IU-19): columna con hora, barra proporcional
    // a la temperatura, temperatura numérica, marca si se esperan ≥0.1 mm de lluvia.
    function renderMiniForecast4h(horas) {
      if (!horas || horas.length === 0) return '';
      const n = Math.min(4, horas.length);
      const subset = horas.slice(0, n);
      const temps = subset.map(h => h.temperatura).filter(t => t != null);
      if (!temps.length) return '';
      const max = Math.max(...temps);
      const min = Math.min(...temps);
      const rango = max - min || 1;
      return subset.map(h => {
        const hora = h.hora ? h.hora.slice(11, 13) + 'h' : '';
        const temp = h.temperatura != null ? Math.round(h.temperatura) + '°' : '—';
        const pctBarra = h.temperatura != null ? 30 + ((h.temperatura - min) / rango) * 70 : 40;
        const pLluvia = h.precipProbabilidad;
        const marcaLluvia = (pLluvia != null && pLluvia >= 30)
          ? `<div class="p1-wx-fc-rain">${pLluvia}%</div>`
          : '';
        return `<div class="p1-wx-fc">
          <div class="p1-wx-fc-temp u-tab">${escapar(temp)}</div>
          <div class="p1-wx-fc-bar" style="height:${pctBarra.toFixed(0)}%"></div>
          ${marcaLluvia}
          <div class="p1-wx-fc-hour u-tab">${escapar(hora)}</div>
        </div>`;
      }).join('');
    }

    // --- Efectos visuales de V2 ---

    // IU-13: motor Canvas 2D de lluvia. Sustituye al sembrado CSS de IU-10.
    if (window.RainFX) RainFX.init();
    // IU-14: rayos SVG de tormenta con eco cálido.
    if (window.LightningFX) LightningFX.init();
    // IU-15: nieve Canvas 2D + niebla volumétrica SVG (con fallback CSS).
    if (window.SnowFX) SnowFX.init();
    if (window.FogFX)  FogFX.init();

    // IU-12: estrellas para noche despejada. Generadas una vez con posición
    // aleatoria y delay de twinkle desfasado. La visibilidad se controla
    // por la variable CSS --v2-star-alpha en el selector [data-momento="noche"].
    (function sembrarEstrellas() {
      const cont = document.getElementById('v2Estrellas');
      if (!cont) return;
      const n = 35;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const e = document.createElement('div');
        e.className = 'v2-estrella';
        e.style.left = (Math.random() * 100).toFixed(1) + '%';
        // Sembrar en 2/3 superiores del cielo, no sobre el contenido central
        e.style.top  = (Math.random() * 65).toFixed(1) + '%';
        e.style.animationDelay    = (-Math.random() * 8).toFixed(2) + 's';
        e.style.animationDuration = (5 + Math.random() * 6).toFixed(2) + 's';
        frag.appendChild(e);
      }
      cont.appendChild(frag);
    })();

    // IU-12: pausa las animaciones de V2 cuando no está visible en el
    // viewport para ahorrar batería. Basado en scroll horizontal de #visor.
    (function pausarV2FueraDeVista() {
      const v2 = document.getElementById('vista2');
      if (!v2 || typeof IntersectionObserver !== 'function') return;
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(ent => {
          v2.classList.toggle('v2-inactiva', ent.intersectionRatio < 0.5);
        });
      }, { threshold: [0, 0.5, 1] });
      obs.observe(v2);
    })();

    // --- Estado del panel ---

    const UMBRAL_DESPLAZAMIENTO_M = 50;

    let ultimaPosicionUbicacion = null;
    let ultimaUbicacionMostrada = null;
    let ultimaCarreteraMostrada = null;
    let ultimaMeteoMostrada     = null;
    // Código de vía actual (A-6, M-505...) o null. Se actualiza en los tres
    // caminos de actualizarCarretera() y lo consume MotorwayExitModule en
    // cada tick de GPS para saber en qué vía buscar próximas salidas.
    let roadRefActual           = null;
    // Posición del último tick donde tuvimos código de vía. Se usa para
    // aplicar histéresis a la pastilla: si Nominatim/Overpass fallan en un
    // tick pero el coche sigue a menos de RADIO_HISTERESIS_PASTILLA_M del
    // último punto con código, mantenemos la pastilla en vez de oscilar
    // entre pastilla y texto largo (BPC-09).
    let roadRefActualPos        = null; // { lat, lon }
    const RADIO_HISTERESIS_PASTILLA_M = 1500;
    // FN-06: velocidad límite de la vía actual (km/h) o null si no se conoce.
    let maxspeedActual          = null;
    // DT-16: re-consulta del límite DENTRO de la misma vía (120→100→80 en la
    // misma autovía). Criterio: 2 km desde la última consulta O 5 min, lo que
    // llegue antes. Coste acotado: cada re-consulta es una query de RoadRef
    // (<1 KB) que además amortigua con su radio de caché de 300 m y sus TTL
    // propios; a 120 km/h supone ~1 query por minuto.
    const MAXSPEED_RECONSULTA_M  = 2000;
    const MAXSPEED_RECONSULTA_MS = 5 * 60 * 1000;
    let maxspeedConsultaPos     = null; // { lat, lon } de la última consulta
    let maxspeedConsultaTs      = 0;
    let municipioActual         = null;
    // Si el último pintado del bloque meteo fue un estado de error, lo
    // guardamos aquí para forzar el repintado en cuanto llegue cualquier
    // dato válido (resuelve el "meteo fantasma" de sesión 9.6).
    let meteoEnError            = false;
    let ultimoTickGPS           = null;
    const UMBRAL_GPS_OBSOLETO_MS = 3 * 60 * 1000; // 3 minutos

    // Fallback de velocidad para móviles cuyo GPS reporta coords.speed=null
    // (común en Android antiguos).
    let ultimoFixVelocidad = null; // { lat, lon, ts }
    let logueadoPrimerFixSpeed = false;
    let logueadoFallbackVelocidad = false;

    // Dedupe del log y chequeos de módulo
    let ultimoLogSalidas = null;
    let motorwayExitChequeado = false;
    let gasolinerasChequeado = false;
    let poiChequeado = false;
    // BPC-04: placeholder de POIs antes del primer resultado
    let poiPrimerResultadoPintado = false;
    // DT-18: claves estructurales de la última UI pintada. Si la composición
    // (nombres+fotos, en orden) no cambia entre ticks, se conserva el DOM y
    // solo se actualizan las distancias por textContent.
    let clavePOIsUI = null;
    let claveGasUI = null;

    // --- Pintado ---

    function pintarCarretera(info) {
      // V1 HUD (IU-19): etiqueta "VÍA" + escudo fósforo + textoCrudo como label.
      // Nombre oficial, destino y PK no están disponibles hoy — se añadirán si
      // se consulta tags Overpass en una tarjeta futura.
      // DT-14: la pastilla de V3 y el chip de maxspeed se eliminaron — vivían en
      // #v3Carretera, oculto con display:none desde IU-21. El límite visible es
      // #v1VelocidadLimite en la cabecera (se escribe en cada tick GPS).
      if (info && info.codigo) {
        const claseShield = info.tipo === 'autonomica' ? ' p1-road-shield--autonomica' : '';
        const label = info.textoCrudo && info.textoCrudo !== info.codigo
          ? `<span class="p1-road-label">${escapar(info.textoCrudo)}</span>`
          : '';
        $carreteraBloque.innerHTML =
          `<div class="p1-road-tag u-caps u-dim">VÍA</div>
           <div class="p1-road-name">
             <span class="p1-road-shield${claseShield}">${escapar(info.codigo)}</span>
             ${label}
           </div>`;
      } else if (info && info.textoCrudo) {
        $carreteraBloque.innerHTML =
          `<div class="p1-road-tag u-caps u-dim">VÍA</div>
           <div class="p1-road-name">
             <span class="p1-road-shield p1-road-shield--empty">—</span>
             <span class="p1-road-label">${escapar(info.textoCrudo)}</span>
           </div>`;
      } else {
        $carreteraBloque.innerHTML =
          `<div class="p1-road-tag u-caps u-dim">VÍA</div>
           <div class="p1-road-name">
             <span class="p1-road-shield p1-road-shield--empty">—</span>
             <span class="p1-road-label">Sin vía identificada</span>
           </div>`;
      }
    }

    function pintarPlaceholderPOI() {
      const html = '<div class="poi-cargando">Buscando pueblos cercanos…</div>';
      $poiScroll.innerHTML = html;
      $poiBloque.style.display = '';
      $v3Grid.innerHTML = html;
    }

    function pintarPOIs(resultado) {
      poiPrimerResultadoPintado = true;
      // IU-33: comarca · población · altitud van a la cabecera global, en gris,
      // tras el nombre del municipio. El prefijo " · " forma parte del valor
      // para que :empty oculte el span y su separador a la vez.
      const dm = resultado.datosMunicipio;
      if (dm) {
        const partes = [];
        if (dm.comarca   != null) partes.push(dm.comarca);
        if (dm.poblacion != null) partes.push(dm.poblacion.toLocaleString('es') + ' hab');
        if (dm.altitud   != null) partes.push(dm.altitud + ' m');
        if ($globalPlaceMeta) {
          $globalPlaceMeta.textContent = partes.length ? ' · ' + partes.join(' · ') : '';
        }
        // DT-14: el bloque #municipioInfo (foto + descripción) se eliminó — era
        // invisible en todas las vistas (.p1-off !important desde IU-33) pero el
        // src de la foto seguía descargando un thumbnail de Commons por municipio.
        // dm.foto y dm.descripcion siguen disponibles por si una vista futura los usa.
        // DT-22: la comarca real viene de Wikidata (datosMunicipio); la
        // preferencia de V4 por comarca nunca aplicaba porque LocationModule no
        // devuelve ese campo. Cuando llega aquí, pisa el placename provisional
        // (provincia) que escribió actualizarUbicacionAdministrativa — carrera
        // asumida: dentro del mismo municipio no hay re-escrituras por dedupe.
        if (dm.comarca && $v4Placename) {
          $v4Placename.textContent = String(dm.comarca).toUpperCase();
        }
      } else {
        if ($globalPlaceMeta) $globalPlaceMeta.textContent = '';
      }

      const pueblos = resultado.pueblosCercanos || [];
      // DT-18: clave estructural. POIModule devuelve SIEMPRE un objeto nuevo
      // (recalcula distKm incluso desde caché), así que antes cada tick con
      // desplazamiento ≥50 m reconstruía por innerHTML el strip de V1, el grid
      // de V3 (6 <img> + listeners) y los pins de V4 aunque nada hubiera
      // cambiado. Un cambio de composición U ORDEN fuerza el repintado
      // completo; si la clave coincide, el camino rápido nunca desalinea.
      const claveUI = pueblos.map(p =>
        p.nombre + ':' + (p.pois || []).map(q => (q.nombre || '') + '|' + (q.foto || '')).join(',')
      ).join(';');
      if (claveUI === clavePOIsUI) {
        actualizarDistanciasPOIs(pueblos);
        return;
      }
      clavePOIsUI = claveUI;
      if (pueblos.length === 0) {
        $poiScroll.innerHTML = '';
        $poiBloque.style.display = 'none';
        $v3Grid.innerHTML = '<div class="poi-cargando">Sin puntos de interés cerca</div>';
        if ($v3PoiCounter) $v3PoiCounter.innerHTML = `<span class="u-phos">0</span> · RADIO ${RADIO_PUEBLOS_KM_TXT} KM`;
      } else {
        // V1 HUD: lista plana "distancia + nombre", 3 pueblos máximo (IU-19).
        $poiScroll.innerHTML = pueblos.slice(0, 3).map(pueblo => {
          const dist = pueblo.distKm < 1
            ? Math.round(pueblo.distKm * 1000) + ' m'
            : pueblo.distKm.toFixed(1) + ' km';
          return `<li>
            <span class="p1-near-dist u-tab u-phos">${escapar(dist)}</span>
            <span class="p1-near-name">${escapar(pueblo.nombre)}</span>
          </li>`;
        }).join('');

        // V1 HUD: strip inferior con 3 POIs primeros entre todos los pueblos.
        // Se guarda el nombre del pueblo junto con el POI para mostrarlo como
        // pie atenuado (IU-19 ajuste).
        // BPC-17: dedupe por nombre + coords. Cuando dos pueblos cercanos
        // comparten un POI cuya geometría cae cerca de ambos, solo quiero
        // verlo una vez en el strip.
        const todosPois = [];
        const vistosV1 = new Set();
        for (const p of pueblos) {
          for (const poi of (p.pois || [])) {
            const key = (poi.nombre || '').toLowerCase() + '|' +
                        (poi.lat != null ? poi.lat.toFixed(4) : '') + ',' +
                        (poi.lon != null ? poi.lon.toFixed(4) : '');
            if (vistosV1.has(key)) continue;
            vistosV1.add(key);
            todosPois.push({ nombre: poi.nombre, pueblo: p.nombre });
            if (todosPois.length >= 3) break;
          }
          if (todosPois.length >= 3) break;
        }
        const top3 = todosPois;
        if (top3.length) {
          // IU-19 (ajuste): sin miniatura — el ancho del strip se usa para
          // mostrar el nombre del POI (2 líneas) + pueblo al que pertenece.
          $poiV1Lista.innerHTML = top3.map(poi => {
            return `<div class="p1-poi-item">
              <div class="p1-poi-name">${escapar(poi.nombre)}</div>
              <div class="p1-poi-pueblo u-caps">${escapar(poi.pueblo)}</div>
            </div>`;
          }).join('');
          $poiBloque.style.display = '';
        } else {
          $poiV1Lista.innerHTML = '';
          $poiBloque.style.display = 'none';
        }
      }

      // V3 HUD (IU-21): grid 3x2 flat de POIs individuales. Se aplana la
      // jerarquía pueblo → pois, se toma foto del POI si existe y se usa el
      // nombre del pueblo como meta para dar contexto geográfico.
      // BPC-17: dedupe por nombre + coords (igual que V1 strip). El primer
      // pueblo gana — por convención el más cercano, dado que `pueblos` viene
      // ordenado por distancia.
      const poisV3 = [];
      const vistosV3 = new Set();
      for (const p of pueblos) {
        for (const poi of (p.pois || [])) {
          const key = (poi.nombre || '').toLowerCase() + '|' +
                      (poi.lat != null ? poi.lat.toFixed(4) : '') + ',' +
                      (poi.lon != null ? poi.lon.toFixed(4) : '');
          if (vistosV3.has(key)) continue;
          vistosV3.add(key);
          poisV3.push({
            nombre: poi.nombre,
            foto: poi.foto,
            tipo: poi.tipo,
            pueblo: p.nombre,
            distKm: p.distKm,
          });
        }
      }
      const top6 = poisV3.slice(0, 6);
      if (top6.length === 0) {
        $v3Grid.innerHTML = '<div class="poi-cargando">Sin puntos de interés cerca</div>';
      } else {
        $v3Grid.innerHTML = top6.map(poi => {
          const dist = poi.distKm < 1
            ? Math.round(poi.distKm * 1000) + ' m'
            : poi.distKm.toFixed(1) + ' km';
          // Wikidata P18 devuelve URLs gigantes en HTTP; normalizamos a HTTPS+thumbnail.
          // También cubrimos POIs cacheados en IDB antes del fix.
          const fotoSrc = POIFuentes.normalizarFotoCommons(poi.foto, 400);
          // DT-18: loading="lazy" (revierte la decisión anterior de precargar).
          // Sin lazy, cada refresco del set de pueblos descargaba 6 thumbs
          // (~100-300 KB) aunque V3 no se visitara nunca. Con lazy, Chrome
          // empieza a precargar ~1250 px antes de entrar en viewport: al estar
          // V3 a un deslizamiento, en la práctica llegan listas igualmente.
          // Regla dura "minimiza peticiones" > instantaneidad de vista secundaria.
          // El data-tipo permite al onerror swap a icono temático si la foto falla.
          const tipoAttr = `data-tipo="${escapar(poi.tipo || '')}"`;
          const thumb = fotoSrc
            ? `<div class="p3-v3-thumb" ${tipoAttr}><img src="${escapar(fotoSrc)}" alt="" loading="lazy"></div>`
            : `<div class="p3-v3-thumb p3-v3-icon" ${tipoAttr}>${iconoSvgPoi(poi.tipo)}</div>`;
          return `<div class="p3-v3-card">
            ${thumb}
            <div class="p3-v3-name">${escapar(poi.nombre)}</div>
            <div class="p3-v3-meta">
              <span class="p3-v3-meta-pueblo u-caps">${escapar(poi.pueblo)}</span>
              <span class="p3-v3-meta-dist u-tab">${escapar(dist)}</span>
            </div>
          </div>`;
        }).join('');
        // Si una foto falla (404, mixed content, archivo borrado), hacemos swap
        // al icono SVG temático del tipo de POI en vez de dejar hueco vacío.
        $v3Grid.querySelectorAll('.p3-v3-thumb img').forEach(img => {
          img.addEventListener('error', () => {
            const div = img.parentElement;
            if (div) {
              div.classList.add('p3-v3-icon');
              div.innerHTML = iconoSvgPoi(div.dataset.tipo || '');
            }
          }, { once: true });
        });
      }
      // Contador del head: "6 · RADIO 15 KM" (el radio sale de POIFuentes)
      if ($v3PoiCounter) {
        $v3PoiCounter.innerHTML =
          `<span class="u-phos">${top6.length}</span> · RADIO ${RADIO_PUEBLOS_KM_TXT} KM`;
      }
      // IU-22 V4: chinchetas de pueblos en cartografía
      if (ultimoFixVelocidad) {
        pintarV4Mapa(pueblos, ultimoFixVelocidad.lat, ultimoFixVelocidad.lon);
      }
    }

    // DT-18: camino rápido de pintarPOIs — la estructura no cambió, solo las
    // distancias. El re-aplanado de V3 replica el dedupe del pintado, así que
    // el orden de las cards coincide por construcción.
    function actualizarDistanciasPOIs(pueblos) {
      const fmtKm = km => km < 1
        ? Math.round(km * 1000) + ' m'
        : km.toFixed(1) + ' km';
      const nodosNear = $poiScroll.querySelectorAll('.p1-near-dist');
      pueblos.slice(0, 3).forEach((p, i) => {
        if (nodosNear[i] && p.distKm != null) nodosNear[i].textContent = fmtKm(p.distKm);
      });
      const nodosCard = $v3Grid.querySelectorAll('.p3-v3-meta-dist');
      if (nodosCard.length) {
        const vistos = new Set();
        const dists = [];
        for (const p of pueblos) {
          for (const poi of (p.pois || [])) {
            const key = (poi.nombre || '').toLowerCase() + '|' +
                        (poi.lat != null ? poi.lat.toFixed(4) : '') + ',' +
                        (poi.lon != null ? poi.lon.toFixed(4) : '');
            if (vistos.has(key)) continue;
            vistos.add(key);
            dists.push(p.distKm);
            if (dists.length >= 6) break;
          }
          if (dists.length >= 6) break;
        }
        dists.forEach((d, i) => {
          if (nodosCard[i] && d != null) nodosCard[i].textContent = fmtKm(d);
        });
      }
      if (ultimoFixVelocidad) {
        reposicionarPinsV4(pueblos, ultimoFixVelocidad.lat, ultimoFixVelocidad.lon);
      }
    }

    // FN-01: pinta lista de gasolineras en V3. FN-09 / IU-19: 3 primeras en V1
    // con estilo HUD fósforo (distancia en verde, marca en dim).
    function pintarGasolineras(lista) {
      const $v1FuelList = $v1Gasolineras.querySelector('.p1-fuel-list');
      if (!lista || lista.length === 0) {
        claveGasUI = null;
        $v3Gasolineras.style.display = 'none';
        $v3GasolinerasL.innerHTML = '';
        $v1Gasolineras.style.display = 'none';
        if ($v1FuelList) $v1FuelList.innerHTML = '';
        return;
      }
      const fmtDist = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
      // DT-18: mismas gasolineras en el mismo orden → solo distancias.
      const claveGas = lista.map(g => g.id).join(',');
      if (claveGas === claveGasUI) {
        const nodosV3 = $v3GasolinerasL.querySelectorAll('.p3-v3-fuel-dist');
        const nodosV1 = $v1FuelList ? $v1FuelList.querySelectorAll('.p1-fuel-dist') : [];
        lista.forEach((g, i) => {
          if (nodosV3[i]) nodosV3[i].textContent = fmtDist(g.distM);
          if (i < 3 && nodosV1[i]) nodosV1[i].textContent = fmtDist(g.distM);
        });
        return;
      }
      claveGasUI = claveGas;
      $v3Gasolineras.style.display = '';
      $v3GasolinerasL.innerHTML = lista.map(g => {
        const marca = escapar(g.marca || g.nombre || 'Gasolinera');
        return `<div class="p3-v3-fuel-item">
          <span class="p3-v3-fuel-dist u-tab">${fmtDist(g.distM)}</span>
          <span class="p3-v3-fuel-marca">${marca}</span>
        </div>`;
      }).join('');
      $v1Gasolineras.style.display = '';
      if ($v1FuelList) {
        $v1FuelList.innerHTML = lista.slice(0, 3).map(g => {
          const marca = escapar(g.marca || g.nombre || 'Gasolinera');
          return `<div class="p1-fuel-item">
            <span class="p1-fuel-dist u-tab">${fmtDist(g.distM)}</span>
            <span class="p1-fuel-marca">${marca}</span>
          </div>`;
        }).join('');
      }
    }

    // --- Actualización por datos ---

    // DT-13: tokens de secuencia. Con 3G lento, la respuesta del tick N puede
    // llegar DESPUÉS que la del tick N+1 y pisar municipio/vía más recientes.
    // Cada llamada toma un número; al volver del await, si ya no es el último,
    // descarta su respuesta.
    let seqUbicacion = 0;
    let seqCarretera = 0;

    async function actualizarUbicacionAdministrativa(lat, lon, velKmh) {
      const miSeq = ++seqUbicacion;
      try {
        const info = await LocationModule.obtenerUbicacion(lat, lon, velKmh);
        if (miSeq !== seqUbicacion) return; // DT-13: hay una respuesta más nueva
        const clave = `${info.municipio}|${info.provincia}|${info.ccaa}`;
        if (clave === ultimaUbicacionMostrada) return;
        ultimaUbicacionMostrada = clave;

        municipioActual = info.municipio || null;
        // IU-33: el span #municipio dentro de V1 se eliminó; el nombre del
        // municipio se escribe únicamente en #globalPlace (cabecera global).
        $admin.innerHTML = formatearAdminV1Html(info);
        // IU-31: header global con el municipio actual como tercer crumb.
        const $globalPlace = document.getElementById('globalPlace');
        if ($globalPlace) $globalPlace.textContent = info.municipio || '';
        // DT-14: los spans de compatibilidad #v2Municipio/#v2Admin/#v3Ubicacion
        // se eliminaron — llevaban ocultos desde IU-20/IU-31 y nadie los leía.
        // V4 placename (IU-22): provincia/ccaa como valor provisional. La
        // comarca (si existe) llega después vía datosMunicipio en pintarPOIs
        // (DT-22 — info.comarca no existe en LocationModule y la rama era muerta).
        if ($v4Placename) {
          const entorno = info.provincia || info.ccaa || info.municipio || '—';
          $v4Placename.textContent = String(entorno).toUpperCase();
        }
        debug.log(`Ubicación [${info.fuente}]: ${info.municipio} · ${formatearAdmin(info)}`);
      } catch (err) {
        debug.error(`LocationModule.ubicacion: ${err.message}`);
      }
    }

    // DT-16: refresco inmediato del "/ límite" de la cabecera. El tick GPS lo
    // repinta igualmente cada segundo, pero sin esto el número de la vía
    // anterior sobrevivía en pantalla hasta un tick tras el cambio de vía.
    function pintarLimiteVelocidad() {
      $v1VelocidadLimite.textContent = maxspeedActual != null ? String(maxspeedActual) : '';
    }

    // DT-16: decide si toca re-consultar el límite dentro de la misma vía.
    function deboReconsultarMaxspeed(lat, lon) {
      if (!maxspeedConsultaPos) return true;
      if (Date.now() - maxspeedConsultaTs >= MAXSPEED_RECONSULTA_MS) return true;
      const d = distanciaMetros(lat, lon, maxspeedConsultaPos.lat, maxspeedConsultaPos.lon);
      return d >= MAXSPEED_RECONSULTA_M;
    }

    // DT-16: lanza RoadRef y aplica el maxspeed SOLO si la vía pintada sigue
    // siendo la misma cuando llega la respuesta (la cascada de mirrors puede
    // tardar ~54 s en el peor caso y antes resucitaba el límite — y la
    // pastilla — de la vía anterior).
    function consultarMaxspeed(lat, lon, clave) {
      if (!window.RoadRef) return;
      maxspeedConsultaPos = { lat, lon };
      maxspeedConsultaTs = Date.now();
      RoadRef.consultar(lat, lon).then((rr) => {
        if (ultimaCarreteraMostrada !== clave) return;
        if (rr && rr.maxspeedKmh != null) {
          maxspeedActual = rr.maxspeedKmh;
        } else if (rr && rr.ref) {
          // Respuesta confirmada sin límite: la vía no lo informa.
          maxspeedActual = null;
        }
        // Con fallo de red (rr.ref null) conservamos el último límite
        // conocido de ESTA vía en vez de parpadear a vacío.
        pintarLimiteVelocidad();
      }).catch(() => {});
    }

    async function actualizarCarretera(lat, lon, velKmh) {
      const miSeq = ++seqCarretera;
      try {
        const info = await LocationModule.obtenerCarretera(lat, lon, velKmh);
        if (miSeq !== seqCarretera) return; // DT-13: hay una respuesta más nueva

        // Caso A: Nominatim ya dio código. FN-06: lanzamos RoadRef en paralelo
        // para conseguir maxspeed.
        if (info.codigo) {
          const clave = `${info.codigo}|${info.tipo}|${info.textoCrudo}`;
          if (clave === ultimaCarreteraMostrada) {
            // DT-16: misma vía — re-consulta periódica del límite.
            if (deboReconsultarMaxspeed(lat, lon)) consultarMaxspeed(lat, lon, clave);
            return;
          }
          ultimaCarreteraMostrada = clave;
          roadRefActual = info.codigo;
          roadRefActualPos = { lat, lon };
          // DT-16: el límite de la vía anterior deja de aplicar YA. Mejor unos
          // segundos sin límite que un aviso de exceso falso (o su ausencia)
          // calculado contra la vía de la que venimos.
          maxspeedActual = null;
          pintarLimiteVelocidad();
          pintarCarretera(info);
          debug.log(`Carretera [${info.fuente}]: ${info.codigo} (${info.tipo}, crudo: "${info.textoCrudo}")`);
          consultarMaxspeed(lat, lon, clave);
          return;
        }

        // Caso B: Nominatim dio nombre de vía pero sin código reconocible.
        // Decisión 22, sesión 9.8.
        if (info.textoCrudo && window.RoadRef) {
          const rr = await RoadRef.consultar(lat, lon);
          if (miSeq !== seqCarretera) return; // DT-13: respuesta obsoleta
          const refOverpass = rr && rr.ref;
          if (refOverpass) {
            const rescatado = Carreteras.extraerCodigo(refOverpass);
            if (rescatado && rescatado.codigo) {
              const infoRescatada = {
                codigo: rescatado.codigo,
                tipo: rescatado.tipo,
                textoCrudo: info.textoCrudo,
                fuente: 'overpass',
              };
              const clave = `${infoRescatada.codigo}|${infoRescatada.tipo}|${infoRescatada.textoCrudo}`;
              // DT-16: el await de arriba ya pagó la consulta — anotamos pos/ts
              // para que la re-consulta periódica cuente desde aquí.
              maxspeedConsultaPos = { lat, lon };
              maxspeedConsultaTs = Date.now();
              if (clave === ultimaCarreteraMostrada) {
                // Misma vía: refresca el límite desde la respuesta ya pagada.
                if (rr.maxspeedKmh != null) maxspeedActual = rr.maxspeedKmh;
                return;
              }
              ultimaCarreteraMostrada = clave;
              roadRefActual = infoRescatada.codigo;
              roadRefActualPos = { lat, lon };
              // DT-16: sin conservar el límite de la vía anterior — si esta vía
              // no lo informa, mejor vacío que un aviso calculado contra otra.
              maxspeedActual = (rr.maxspeedKmh != null) ? rr.maxspeedKmh : null;
              pintarLimiteVelocidad();
              pintarCarretera(infoRescatada);
              debug.log(`Carretera [overpass]: ${infoRescatada.codigo} (${infoRescatada.tipo}, rescatada · crudo Nominatim: "${info.textoCrudo}"${maxspeedActual != null ? ' · max ' + maxspeedActual + 'km/h' : ''})`);
              return;
            }
          }
        }

        // Caso C: ni Nominatim ni Overpass han dado código.
        // Histéresis BPC-09.
        if (roadRefActual && roadRefActualPos) {
          const d = distanciaMetros(lat, lon, roadRefActualPos.lat, roadRefActualPos.lon);
          if (d < RADIO_HISTERESIS_PASTILLA_M) {
            debug.log(`Carretera [histéresis]: mantengo ${roadRefActual} (a ${Math.round(d)}m del último código, Nominatim dio "${info.textoCrudo || 'nada'}")`);
            return;
          }
        }

        const clave = `${info.codigo}|${info.tipo}|${info.textoCrudo}`;
        if (clave === ultimaCarreteraMostrada) return;
        ultimaCarreteraMostrada = clave;
        roadRefActual = null;
        roadRefActualPos = null;
        maxspeedActual = null;
        pintarCarretera(info);
        if (info.textoCrudo) {
          debug.log(`Vía [${info.fuente}]: "${info.textoCrudo}" (sin código ni en Nominatim ni en Overpass)`);
        } else {
          debug.log(`Carretera [${info.fuente}]: sin vía en Nominatim`);
        }
      } catch (err) {
        debug.error(`LocationModule.carretera: ${err.message}`);
      }
    }

    async function actualizarMeteo(lat, lon) {
      try {
        const meteo = await Weather.obtenerTiempoActual(lat, lon);
        // DT-12: la clave incluye la temperatura redondeada — sin ella, una
        // respuesta fresca ya pagada con el mismo bloque de 15 min y el mismo
        // código WMO se descartaba aunque la temperatura hubiera cambiado
        // (subir un puerto despejado: de 28° a 18° sin repintar).
        const clave = `${meteo.hora}|${meteo.weatherCode}|${Math.round(meteo.temperatura)}`;
        // Dedupe normal: si la clave coincide y NO venimos de error, salimos.
        if (clave === ultimaMeteoMostrada && !meteoEnError) return;
        ultimaMeteoMostrada = clave;

        // V1 HUD (IU-19): temp compacta (sólo actual), icono, filas lluvia/viento/visib
        // y mini-forecast 4h. Humedad y sensación se muestran sólo en V2.
        $meteoTemp.textContent = `${Math.round(meteo.temperatura)}${meteo.temperaturaUnidad}`;

        $meteoDescripcion.innerHTML = MeteoCodigos.iconoSVG(meteo.icono);

        const mm = (meteo.precipitacion != null) ? meteo.precipitacion : 0;
        const unidadMm = meteo.precipitacionUnidad || 'mm';
        $meteoLluvia.textContent = `${mm.toFixed(1)} ${unidadMm}`;

        const cardinal = gradosACardinal(meteo.vientoDireccion);
        $meteoViento.textContent =
          `${Math.round(meteo.vientoVelocidad)} ${meteo.vientoUnidad}${cardinal ? ' ' + cardinal : ''}`;

        if (meteo.visibilidad != null) {
          const visibKm = Math.round(meteo.visibilidad / 1000);
          $meteoVisib.textContent = `${visibKm} km`;
        } else {
          $meteoVisib.textContent = '—';
        }

        $meteoPrevision.innerHTML = renderMiniForecast4h(meteo.previsionHoraria || []);

        // V2 HUD expresivo (IU-20): palabra gigante + temperatura + story + timeline.
        // DT-14: los spans de retrocompatibilidad (#meteoHumedad, #v2MeteoIcono,
        // #v2MeteoViento, #v2MeteoHumedad, #v2MeteoPrevision) se eliminaron junto
        // con construirResumenPrevision, que solo existía para alimentarlos.
        $v2MeteoDesc.innerHTML = renderPalabraGigante(meteo.etiqueta || meteo.descripcion);
        $v2MeteoTemp.textContent = `${Math.round(meteo.temperatura)}°`;
        $v2MeteoStory.innerHTML = renderStoryV2(meteo, meteo.previsionHoraria || []);
        $v2MeteoMetrics.innerHTML = renderMetricsV2(meteo);
        $v2MeteoTimeline.innerHTML = renderTimelineV2(meteo.previsionHoraria || []);
        $vista2.setAttribute('data-meteo-cat', meteo.categoria || 'despejado');

        const momentoV2 = calcularMomentoDia(meteo.sunrise, meteo.sunset, Date.now());
        $vista2.setAttribute('data-momento', momentoV2);
        if (window.RainFX) {
          RainFX.setMomento(momentoV2);
          RainFX.setMeteo(meteo);
        }
        if (window.LightningFX) {
          LightningFX.setMomento(momentoV2);
          LightningFX.setCategoria(meteo.categoria || null);
        }
        if (window.SnowFX) {
          SnowFX.setMomento(momentoV2);
          SnowFX.setMeteo(meteo);
        }
        if (window.FogFX) FogFX.setMomento(momentoV2);

        const nHoras = meteo.previsionHoraria ? meteo.previsionHoraria.length : 0;
        const etiqueta = meteo.deCache ? ' [cache]' : '';
        const recuperado = meteoEnError ? ' (recuperado de error)' : '';
        debug.log(`Meteo pintada${etiqueta}${recuperado}: ${Math.round(meteo.temperatura)}° ${meteo.categoria} (${meteo.descripcion}) + ${nHoras}h previsión`);

        meteoEnError = false;
      } catch (err) {
        $meteoTemp.textContent = '—';
        $meteoDescripcion.innerHTML = '';
        $meteoViento.textContent = '—';
        $meteoLluvia.textContent = '—';
        $meteoVisib.textContent = '—';
        $meteoPrevision.innerHTML = '';
        // DT-22: V2 también se resetea. Antes, con error sostenido, V1 pasaba
        // a rayas pero V2 seguía mostrando temperatura/story/timeline de hace
        // horas como actuales, con los efectos de la categoría vieja activos.
        // Mejor V2 neutra que datos viejos presentados como frescos.
        $v2MeteoTemp.textContent = '—';
        $v2MeteoDesc.innerHTML = '';
        $v2MeteoStory.innerHTML = '';
        $v2MeteoMetrics.innerHTML = '';
        $v2MeteoTimeline.innerHTML = '';
        $vista2.setAttribute('data-meteo-cat', 'despejado');
        // Con DT-15, si solo cambiáramos el atributo el rAF seguiría vivo con
        // la meteo vieja: setMeteo(null) lo para de verdad.
        if (window.RainFX) RainFX.setMeteo(null);
        if (window.SnowFX) SnowFX.setMeteo(null);
        if (window.LightningFX) LightningFX.setCategoria(null);
        meteoEnError = true;
        debug.error(`Weather: ${err.message}`);
      }
    }

    function actualizarPOIs(lat, lon) {
      if (!poiChequeado) {
        poiChequeado = true;
        if (window.POIModule) {
          debug.log('POIModule: cargado, primer tick recibido');
          if (!poiPrimerResultadoPintado) pintarPlaceholderPOI();
        } else {
          debug.error('POIModule: no disponible');
          return;
        }
      }
      if (!window.POIModule) return;
      POIModule.actualizar(lat, lon, municipioActual).then(resultado => {
        if (resultado) pintarPOIs(resultado);
      }).catch(err => {
        debug.error(`POIModule: ${err.message}`);
      });
    }

    function actualizarGasolineras(lat, lon) {
      if (!gasolinerasChequeado) {
        gasolinerasChequeado = true;
        if (!window.Gasolineras) {
          debug.error('Gasolineras: módulo no cargado');
          return;
        }
      }
      if (!window.Gasolineras) return;
      Gasolineras.actualizar(lat, lon).then(lista => {
        pintarGasolineras(lista);
      }).catch(err => {
        debug.error(`Gasolineras: ${err.message}`);
      });
    }

    function actualizarProximasSalidas(lat, lon, rumbo, velocidadKmh) {
      if (!motorwayExitChequeado) {
        motorwayExitChequeado = true;
        if (window.MotorwayExitModule) {
          debug.log('MotorwayExit: módulo cargado, primer tick recibido');
        } else {
          debug.error('MotorwayExit: window.MotorwayExitModule NO DISPONIBLE — módulo no cargado o falló al inicializar');
          return;
        }
      }
      if (!window.MotorwayExitModule) return;
      try {
        const r = MotorwayExitModule.actualizar({
          lat, lon, rumbo, velocidadKmh, roadRef: roadRefActual,
        });
        const proxRef = r.proxima ? r.proxima.ref : null;
        const proxKm  = r.proxima ? Math.round(r.proxima.distanciaKm * 2) / 2 : null;
        const sigRef  = r.siguiente ? r.siguiente.ref : null;
        const clave = `${r.estado}|${proxRef}|${proxKm}|${sigRef}`;
        if (clave !== ultimoLogSalidas) {
          ultimoLogSalidas = clave;
          if (r.estado === 'ok') {
            const sigTxt = r.siguiente
              ? `, luego ${r.siguiente.ref} a ${r.siguiente.distanciaKm}km`
              : '';
            debug.log(`MotorwayExit: próxima ${r.proxima.ref} a ${r.proxima.distanciaKm}km${sigTxt}`);
          } else {
            debug.log(`MotorwayExit: ${r.estado}${roadRefActual ? ' (vía ' + roadRefActual + ')' : ''}`);
          }
        }
        if (r.activo) {
          $salidaNum.textContent  = r.proxima.ref;
          $salidaDist.textContent = r.proxima.distanciaKm + ' km';
          $salidaSig.textContent  = r.siguiente ? 'luego ' + r.siguiente.ref : '';
          if (r.proxima.destinos) {
            // IU-35: 'vía de servicio' (case-insensitive, con/sin tilde) se
            // pinta en gris atenuado para diferenciarla de los destinos
            // reales que van en blanco. El resto del split por ' · ' se
            // escapa y se concatena tal cual.
            const PARTS_SEP = ' · ';
            const SVC_RE = /^v[ií]a de servicio$/i;
            $salidaDestinos.innerHTML = r.proxima.destinos
              .split(PARTS_SEP)
              .map(p => SVC_RE.test(p.trim())
                ? '<span class="p1-exit-svc">' + escapar(p) + '</span>'
                : escapar(p)
              )
              .join(PARTS_SEP);
            $salidaDestinos.classList.add('visible');
          } else {
            $salidaDestinos.textContent = '';
            $salidaDestinos.classList.remove('visible');
          }
          $salidaBloque.classList.add('visible');
        } else {
          $salidaDestinos.textContent = '';
          $salidaDestinos.classList.remove('visible');
          $salidaBloque.classList.remove('visible');
        }
      } catch (err) {
        debug.error(`MotorwayExit: ${err.message}`);
      }
    }

    // --- Tick GPS ---

    function alRecibirPosicion(pos) {
      const c = pos.coords;
      const ahora = Date.now();

      if (!logueadoPrimerFixSpeed) {
        debug.log(`GPS fix inicial: c.speed=${c.speed} c.heading=${c.heading}`);
        logueadoPrimerFixSpeed = true;
      }

      // Velocidad efectiva: si el GPS no la reporta (Android viejos devuelven
      // null), estimamos km/h desde distancia/tiempo entre fixes consecutivos.
      const velGpsKmh = (c.speed != null && !isNaN(c.speed)) ? c.speed * 3.6 : null;
      let velEfectivaKmh = velGpsKmh;
      let fuenteVelocidad = 'gps';
      if (velGpsKmh == null && ultimoFixVelocidad) {
        const dtS = (ahora - ultimoFixVelocidad.ts) / 1000;
        if (dtS >= 1 && dtS <= 60) {
          const distM = distanciaMetros(
            c.latitude, c.longitude,
            ultimoFixVelocidad.lat, ultimoFixVelocidad.lon
          );
          velEfectivaKmh = (distM / dtS) * 3.6;
          fuenteVelocidad = 'fallback';
          if (!logueadoFallbackVelocidad) {
            debug.log(`Velocidad fallback activa (GPS no reporta speed): ~${Math.round(velEfectivaKmh)} km/h`);
            logueadoFallbackVelocidad = true;
          }
        }
      }
      ultimoFixVelocidad = { lat: c.latitude, lon: c.longitude, ts: ahora };

      // FN-02a: registrar punto en el track del trayecto.
      if (window.Trayectos) {
        Trayectos.agregarTrack(c.latitude, c.longitude, velEfectivaKmh);
      }

      $lat.textContent = c.latitude.toFixed(6);
      $lon.textContent = c.longitude.toFixed(6);

      // IU-22 V4: coordenadas formato grados-minutos arriba derecha del mapa
      if ($v4Coords) $v4Coords.textContent = formatearCoordsGMS(c.latitude, c.longitude);
      $precision.textContent = c.accuracy != null ? `${c.accuracy.toFixed(1)} m` : '—';
      $velocidad.textContent = velEfectivaKmh != null
        ? `${velEfectivaKmh.toFixed(1)} km/h${fuenteVelocidad === 'fallback' ? ' (calc)' : ''}`
        : 'no disponible';
      $rumbo.textContent = c.heading != null && !isNaN(c.heading)
        ? `${c.heading.toFixed(0)}°`
        : 'no disponible';
      $hora.textContent = new Date().toTimeString().slice(0, 8);

      // V1 HUD (IU-19): número y unidad viven en nodos separados. Sólo el número
      // cambia aquí; "km/h" está en el HTML y no se retoca. Prefijo "~" si la
      // velocidad viene del fallback calculado (coord. previas).
      const velNum = velEfectivaKmh != null
        ? `${fuenteVelocidad === 'fallback' ? '~' : ''}${Math.round(velEfectivaKmh)}`
        : '—';
      $v1Velocidad.textContent = velNum;
      $v1VelocidadLimite.textContent = maxspeedActual != null ? String(maxspeedActual) : '';
      // FN-06: color de velocidad según exceso sobre maxspeedActual.
      let claseExceso = '';
      if (maxspeedActual != null && velEfectivaKmh != null) {
        const exceso = velEfectivaKmh - maxspeedActual;
        if (exceso > 15) claseExceso = 'exceso-grave';
        else if (exceso > 5) claseExceso = 'exceso';
      }
      $v1Velocidad.className = 'p1-speed-num u-tab' + (claseExceso ? ' ' + claseExceso : '');

      // IU-23: halo de exceso sobre V1. "leve" = 5-15 km/h (amarillo, sin pulso),
      // "grave" = >15 km/h sobre el límite (rojo + pulso). Sin data-speeding
      // cuando no hay exceso para que el panel quede limpio.
      const speedingAttr =
        claseExceso === 'exceso-grave' ? 'grave' :
        claseExceso === 'exceso'       ? 'leve'  : null;
      if (speedingAttr) {
        $vista1.setAttribute('data-speeding', speedingAttr);
      } else {
        $vista1.removeAttribute('data-speeding');
      }
      // DT-14: el bucle FN-08 sobre .maxspeed-chip se eliminó — el chip vivía en
      // #v3Carretera (invisible desde IU-21). La señal de exceso visible es la
      // className de $v1Velocidad y el halo data-speeding de arriba.

      ultimoTickGPS = ahora;
      mostrarEstado('GPS activo', 'ok');

      let hayQueActualizar = false;
      if (!ultimaPosicionUbicacion) {
        hayQueActualizar = true;
      } else {
        const dist = distanciaMetros(
          c.latitude, c.longitude,
          ultimaPosicionUbicacion.lat, ultimaPosicionUbicacion.lon
        );
        if (dist >= UMBRAL_DESPLAZAMIENTO_M) {
          hayQueActualizar = true;
          debug.log(`Movimiento detectado: ${dist.toFixed(0)}m`);
        }
      }

      if (hayQueActualizar) {
        debug.log(`Posición: ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)} (±${c.accuracy?.toFixed(0)}m)`);
        ultimaPosicionUbicacion = { lat: c.latitude, lon: c.longitude };
        // DT-13: la velocidad efectiva viaja hasta LocationModule para escalar
        // los radios de caché con ella.
        actualizarUbicacionAdministrativa(c.latitude, c.longitude, velEfectivaKmh);
        actualizarCarretera(c.latitude, c.longitude, velEfectivaKmh);
        actualizarMeteo(c.latitude, c.longitude);
        actualizarPOIs(c.latitude, c.longitude);
        actualizarGasolineras(c.latitude, c.longitude);
      }

      // MotorwayExit se evalúa en CADA tick.
      const rumboGrados  = (c.heading != null && !isNaN(c.heading)) ? c.heading : null;
      actualizarProximasSalidas(c.latitude, c.longitude, rumboGrados, velEfectivaKmh);
    }

    function alFallarPosicion(err) {
      const motivos = {
        1: 'Permiso denegado',
        2: 'Posición no disponible',
        3: 'Tiempo de espera agotado',
      };
      const motivo = motivos[err.code] || 'Error desconocido';
      mostrarEstado(`Error de GPS: ${motivo}`, 'error');
      debug.error(`GPS error ${err.code}: ${err.message}`);
    }

    // --- Viewport (BPC-12) ---

    const $visor = document.getElementById('visor');
    const $pageDots = document.querySelectorAll('#pageDots .page-dot');

    function actualizarAppHeight() {
      document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    }

    // IU-24: sincroniza el indicador de vistas con el scroll del visor.
    // rAF throttle para que no corra más de una vez por frame.
    let pageDotsRAF = null;
    function actualizarPageDots() {
      if (!$visor || $pageDots.length === 0) return;
      if (pageDotsRAF) return;
      pageDotsRAF = requestAnimationFrame(() => {
        pageDotsRAF = null;
        const w = $visor.clientWidth;
        if (w <= 0) return;
        const idx = Math.round($visor.scrollLeft / w);
        $pageDots.forEach((d, i) => d.classList.toggle('on', i === idx));
      });
    }

    function realinearScrollVisor() {
      if (!$visor) return;
      const w = $visor.clientWidth;
      if (w <= 0) return;
      const idx = Math.round($visor.scrollLeft / w);
      const objetivo = idx * w;
      if (Math.abs($visor.scrollLeft - objetivo) > 1) {
        $visor.scrollTo({ left: objetivo, behavior: 'instant' });
      }
    }

    actualizarAppHeight();
    actualizarPageDots();
    if ($visor) $visor.addEventListener('scroll', actualizarPageDots, { passive: true });
    window.addEventListener('resize', () => {
      actualizarAppHeight();
      realinearScrollVisor();
      actualizarPageDots();
    });
    window.addEventListener('orientationchange', () => {
      actualizarAppHeight();
      realinearScrollVisor();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        actualizarAppHeight();
        realinearScrollVisor();
      }
    });

    // --- Vigilante de datos obsoletos ---

    setInterval(() => {
      if (!ultimoTickGPS) return;
      const hace = Date.now() - ultimoTickGPS;
      if (hace > UMBRAL_GPS_OBSOLETO_MS) {
        const min = Math.floor(hace / 60000);
        const seg = Math.floor((hace % 60000) / 1000);
        const texto = min > 0 ? `Datos de hace ${min} min` : `Datos de hace ${seg} s`;
        mostrarEstado(texto, 'aviso');
      }
    }, 30000);

    // --- Arranque: simulador o GPS real ---

    if (window.Simulator && Simulator.estaActivo()) {
      mostrarEstado(`Simulación: ${Simulator.nombreRuta()}`, 'ok');
      debug.log(`Modo simulación activo: ${Simulator.nombreRuta()}`);
      Simulator.iniciar(alRecibirPosicion);
    } else if (!('geolocation' in navigator)) {
      mostrarEstado('Este navegador no soporta GPS', 'error');
      debug.error('navigator.geolocation no disponible');
    } else {
      debug.log('Solicitando permiso de GPS…');
      navigator.geolocation.watchPosition(
        alRecibirPosicion,
        alFallarPosicion,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 30000,
        }
      );
    }
  }

  // ===== Entry point =====

  function arrancar() {
    configurarBotonFullscreen();
    configurarSafeAreaDev();
    if (new URLSearchParams(location.search).get('logs') === '1') {
      arrancarVistaLogs();
    } else {
      arrancarPanel();
    }
  }

  arrancar();
})();
