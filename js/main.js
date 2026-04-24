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
    const $municipio        = document.getElementById('municipio');
    const $admin            = document.getElementById('admin');
    const $datosMunicipio   = document.getElementById('datosMunicipio');
    const $municipioInfo    = document.getElementById('municipioInfo');
    const $municipioFoto    = document.getElementById('municipioFoto');
    const $municipioDesc    = document.getElementById('municipioDesc');
    const $poiBloque        = document.getElementById('poiBloque');
    const $poiScroll        = document.getElementById('poiScroll');
    const $poiV1Lista       = document.getElementById('poiV1Lista');
    const $v3Gasolineras    = document.getElementById('v3Gasolineras');
    const $v3GasolinerasL   = document.getElementById('v3GasolinerasLista');
    const $v1Gasolineras    = document.getElementById('v1Gasolineras');
    const $meteoTemp        = document.getElementById('meteoTemp');
    const $meteoDescripcion = document.getElementById('meteoDescripcion');
    const $meteoViento      = document.getElementById('meteoViento');
    const $meteoHumedad     = document.getElementById('meteoHumedad');
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
    const $vista2           = document.getElementById('vista2');
    const $v2Municipio      = document.getElementById('v2Municipio');
    const $v2Admin          = document.getElementById('v2Admin');
    const $v2MeteoIcono     = document.getElementById('v2MeteoIcono');
    const $v2MeteoTemp      = document.getElementById('v2MeteoTemp');
    const $v2MeteoDesc      = document.getElementById('v2MeteoDesc');
    const $v2MeteoViento    = document.getElementById('v2MeteoViento');
    const $v2MeteoHumedad   = document.getElementById('v2MeteoHumedad');
    const $v2MeteoPrevision = document.getElementById('v2MeteoPrevision');
    const $v2MeteoStory     = document.getElementById('v2MeteoStory');
    const $v2MeteoTimeline  = document.getElementById('v2MeteoTimeline');
    const $v2Velocidad      = document.getElementById('v2Velocidad');

    const $v1Velocidad      = document.getElementById('v1Velocidad');

    // Vista 3 elements
    const $v3Carretera      = document.getElementById('v3Carretera');
    const $v3Ubicacion      = document.getElementById('v3Ubicacion');
    const $v3Grid           = document.getElementById('v3Grid');

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

    // IU-20 V2: timeline vertical de 6 horas. Cada fila tiene hora, temp y
    // una barra horizontal cuyo ancho = precipProbabilidad (0-100 → 0-100%).
    // El peso tipográfico crece con la intensidad (300 en seco → 800 a 100%),
    // y el color fósforo gana alpha — así la tormenta salta a la vista.
    function renderTimelineV2(horas) {
      if (!horas || horas.length === 0) return '';
      const n = Math.min(6, horas.length);
      return horas.slice(0, n).map(h => {
        const intensity = Math.min(1, Math.max(0, (h.precipProbabilidad || 0) / 100));
        const fontWeight = Math.round(300 + intensity * 500);
        const alpha = (0.4 + intensity * 0.6).toFixed(2);
        const hora = h.hora ? h.hora.slice(11, 13) + 'h' : '';
        const temp = h.temperatura != null ? Math.round(h.temperatura) + '°' : '—';
        const widthPct = Math.round(intensity * 100);
        const color = `rgba(125, 255, 160, ${alpha})`;
        return `<div class="p2-hr" style="font-weight:${fontWeight}; color:${color}">
          <span class="p2-hr-hour">${escapar(hora)}</span>
          <span class="p2-hr-temp">${escapar(temp)}</span>
          <div class="p2-hr-bar" style="width:${widthPct}%"></div>
        </div>`;
      }).join('');
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

    // --- Pintado ---

    function pintarCarretera(info) {
      // V1 HUD (IU-19): etiqueta "VÍA" + escudo fósforo + textoCrudo como label.
      // Nombre oficial, destino y PK no están disponibles hoy — se añadirán si
      // se consulta tags Overpass en una tarjeta futura.
      // V3 mantiene el patrón clásico (pastilla + chip) hasta IU-21.
      if (info && info.codigo) {
        const claseShield = info.tipo === 'autonomica' ? ' p1-road-shield--autonomica' : '';
        const claseExtra  = info.tipo === 'autonomica' ? ' autonomica' : '';
        const chipMax = (maxspeedActual != null)
          ? `<span class="maxspeed-chip" title="Velocidad límite">${maxspeedActual}</span>`
          : '';
        const label = info.textoCrudo && info.textoCrudo !== info.codigo
          ? `<span class="p1-road-label">${escapar(info.textoCrudo)}</span>`
          : '';
        $carreteraBloque.innerHTML =
          `<div class="p1-road-tag u-caps u-dim">VÍA</div>
           <div class="p1-road-name">
             <span class="p1-road-shield${claseShield}">${escapar(info.codigo)}</span>
             ${label}
           </div>`;
        // V3 cabecera
        $v3Carretera.innerHTML =
          `<span class="pastilla${claseExtra}">${escapar(info.codigo)}</span>${chipMax}`;
      } else if (info && info.textoCrudo) {
        $carreteraBloque.innerHTML =
          `<div class="p1-road-tag u-caps u-dim">VÍA</div>
           <div class="p1-road-name">
             <span class="p1-road-shield p1-road-shield--empty">—</span>
             <span class="p1-road-label">${escapar(info.textoCrudo)}</span>
           </div>`;
        $v3Carretera.textContent = info.textoCrudo;
      } else {
        $carreteraBloque.innerHTML =
          `<div class="p1-road-tag u-caps u-dim">VÍA</div>
           <div class="p1-road-name">
             <span class="p1-road-shield p1-road-shield--empty">—</span>
             <span class="p1-road-label">Sin vía identificada</span>
           </div>`;
        $v3Carretera.textContent = '';
      }
    }

    // Construye el resumen de previsión horaria con icono de la categoría
    // más severa del tramo y texto de min→max de temperatura + lluvia.
    function construirResumenPrevision(horas) {
      if (!horas || horas.length === 0) {
        return { icono: 'meteo-desconocido', texto: 'Sin previsión' };
      }
      const n = horas.length;
      const tempInicio = Math.round(horas[0].temperatura);
      const tempFin = Math.round(horas[n - 1].temperatura);
      const unidad = horas[0].temperaturaUnidad || '°C';

      let maxLluvia = 0;
      for (let i = 0; i < n; i++) {
        const p = horas[i].precipProbabilidad;
        if (typeof p === 'number' && p > maxLluvia) maxLluvia = p;
      }

      const categoria = MeteoCodigos.categoriaMasSevera(horas);
      const icono = MeteoCodigos.iconoDeCategoria(categoria);

      const partes = [`Próx. ${n}h: ${tempInicio}${unidad} → ${tempFin}${unidad}`];
      if (maxLluvia > 0) {
        partes.push(`lluvia máx ${maxLluvia}%`);
      } else {
        partes.push('sin lluvia prevista');
      }
      return { icono: icono, texto: partes.join(' · ') };
    }

    function pintarPlaceholderPOI() {
      const html = '<div class="poi-cargando">Buscando pueblos cercanos…</div>';
      $poiScroll.innerHTML = html;
      $poiBloque.style.display = '';
      $v3Grid.innerHTML = html;
    }

    function pintarPOIs(resultado) {
      poiPrimerResultadoPintado = true;
      // Datos del municipio actual (población, altitud)
      const dm = resultado.datosMunicipio;
      if (dm) {
        const partes = [];
        if (dm.comarca   != null) partes.push(dm.comarca);
        if (dm.poblacion != null) partes.push(dm.poblacion.toLocaleString('es') + ' hab');
        if (dm.altitud   != null) partes.push(dm.altitud + ' m');
        $datosMunicipio.textContent = partes.join(' · ');
        if (dm.descripcion || dm.foto) {
          if (dm.foto) {
            $municipioFoto.src = dm.foto;
            $municipioFoto.style.display = '';
          } else {
            $municipioFoto.style.display = 'none';
          }
          $municipioDesc.textContent = dm.descripcion || '';
          $municipioInfo.style.display = '';
        } else {
          $municipioInfo.style.display = 'none';
        }
      } else {
        $datosMunicipio.textContent = '';
        $municipioInfo.style.display = 'none';
      }

      const pueblos = resultado.pueblosCercanos || [];
      if (pueblos.length === 0) {
        $poiScroll.innerHTML = '';
        $poiBloque.style.display = 'none';
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
        const todosPois = [];
        for (const p of pueblos) {
          for (const poi of (p.pois || [])) {
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

      // V3: grid de tarjetas de pueblo con hasta 2 POIs cada una
      $v3Grid.innerHTML = pueblos.map(pueblo => {
        const dist = pueblo.distKm < 1
          ? Math.round(pueblo.distKm * 1000) + ' m'
          : pueblo.distKm.toFixed(1) + ' km';

        const poisV3 = pueblo.pois.slice(0, 2).map(poi =>
          `<div class="v3-poi">
            <span class="v3-poi-icono">${escapar(poi.icono)}</span>
            <span class="v3-poi-nombre">${escapar(poi.nombre)}</span>
          </div>`
        ).join('');

        return `<div class="v3-pueblo">
          <div class="v3-pueblo-cab">
            <span class="v3-pueblo-nombre">${escapar(pueblo.nombre)}</span>
            <span class="v3-pueblo-dist">${escapar(dist)}</span>
          </div>
          ${poisV3}
        </div>`;
      }).join('');
    }

    // FN-01: pinta lista de gasolineras en V3. FN-09 / IU-19: 3 primeras en V1
    // con estilo HUD fósforo (distancia en verde, marca en dim).
    function pintarGasolineras(lista) {
      const $v1FuelList = $v1Gasolineras.querySelector('.p1-fuel-list');
      if (!lista || lista.length === 0) {
        $v3Gasolineras.style.display = 'none';
        $v3GasolinerasL.innerHTML = '';
        $v1Gasolineras.style.display = 'none';
        if ($v1FuelList) $v1FuelList.innerHTML = '';
        return;
      }
      const fmtDist = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
      $v3Gasolineras.style.display = '';
      $v3GasolinerasL.innerHTML = lista.map(g => {
        const marca = escapar(g.marca || g.nombre || 'Gasolinera');
        return `<div class="v3-gasolinera"><span class="v3-gasolinera-marca">${marca}</span><span class="v3-gasolinera-dist">${fmtDist(g.distM)}</span></div>`;
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

    async function actualizarUbicacionAdministrativa(lat, lon) {
      try {
        const info = await LocationModule.obtenerUbicacion(lat, lon);
        const clave = `${info.municipio}|${info.provincia}|${info.ccaa}`;
        if (clave === ultimaUbicacionMostrada) return;
        ultimaUbicacionMostrada = clave;

        municipioActual = info.municipio || null;
        $municipio.textContent = info.municipio || '(municipio desconocido)';
        $admin.innerHTML = formatearAdminV1Html(info);
        // V2
        $v2Municipio.textContent = info.municipio || '(municipio desconocido)';
        $v2Admin.textContent = formatearAdmin(info);
        // V3 cabecera
        const adminCorto = info.provincia || info.ccaa || '';
        $v3Ubicacion.textContent = adminCorto
          ? `${info.municipio || '—'} · ${adminCorto}`
          : info.municipio || '—';
        debug.log(`Ubicación [${info.fuente}]: ${info.municipio} · ${formatearAdmin(info)}`);
      } catch (err) {
        debug.error(`LocationModule.ubicacion: ${err.message}`);
      }
    }

    async function actualizarCarretera(lat, lon) {
      try {
        const info = await LocationModule.obtenerCarretera(lat, lon);

        // Caso A: Nominatim ya dio código. FN-06: lanzamos RoadRef en paralelo
        // para conseguir maxspeed.
        if (info.codigo) {
          const clave = `${info.codigo}|${info.tipo}|${info.textoCrudo}`;
          if (clave === ultimaCarreteraMostrada) return;
          ultimaCarreteraMostrada = clave;
          roadRefActual = info.codigo;
          roadRefActualPos = { lat, lon };
          pintarCarretera(info);
          debug.log(`Carretera [${info.fuente}]: ${info.codigo} (${info.tipo}, crudo: "${info.textoCrudo}")`);
          if (window.RoadRef) {
            RoadRef.consultar(lat, lon).then((rr) => {
              if (rr && rr.maxspeedKmh !== maxspeedActual) {
                maxspeedActual = rr.maxspeedKmh;
                ultimaCarreteraMostrada = null;
                pintarCarretera(info);
                ultimaCarreteraMostrada = clave;
              }
            }).catch(() => {});
          }
          return;
        }

        // Caso B: Nominatim dio nombre de vía pero sin código reconocible.
        // Decisión 22, sesión 9.8.
        if (info.textoCrudo && window.RoadRef) {
          const rr = await RoadRef.consultar(lat, lon);
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
              if (clave === ultimaCarreteraMostrada) return;
              ultimaCarreteraMostrada = clave;
              roadRefActual = infoRescatada.codigo;
              roadRefActualPos = { lat, lon };
              maxspeedActual = (rr && rr.maxspeedKmh != null) ? rr.maxspeedKmh : maxspeedActual;
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
        const clave = `${meteo.hora}|${meteo.weatherCode}`;
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

        // V2 sigue usando $meteoHumedad (oculto en V1 por .p1-off).
        $meteoHumedad.textContent = `${meteo.humedad}${meteo.humedadUnidad}`;

        $meteoPrevision.innerHTML = renderMiniForecast4h(meteo.previsionHoraria || []);

        // Resumen textual se sigue generando para V2.
        const resumen = construirResumenPrevision(meteo.previsionHoraria);

        // V2 HUD expresivo (IU-20): palabra gigante + temperatura + story + timeline.
        // Los elementos clásicos (icono, viento, humedad, previsión) siguen
        // recibiendo datos pero están ocultos con .p2-off — así no se pierde
        // la retrocompatibilidad con otros consumidores (debug, tests).
        $v2MeteoDesc.innerHTML = renderPalabraGigante(meteo.etiqueta || meteo.descripcion);
        $v2MeteoTemp.textContent = `${Math.round(meteo.temperatura)}°`;
        $v2MeteoStory.innerHTML = renderStoryV2(meteo, meteo.previsionHoraria || []);
        $v2MeteoTimeline.innerHTML = renderTimelineV2(meteo.previsionHoraria || []);
        // Retrocompatibilidad — ocultos por CSS:
        $v2MeteoIcono.innerHTML = MeteoCodigos.iconoSVG(meteo.icono);
        $v2MeteoViento.textContent = `Viento ${Math.round(meteo.vientoVelocidad)} ${meteo.vientoUnidad}`;
        $v2MeteoHumedad.textContent = `Humedad ${meteo.humedad}${meteo.humedadUnidad}`;
        $v2MeteoPrevision.innerHTML =
          `${MeteoCodigos.iconoSVG(resumen.icono)} ${escapar(resumen.texto)}`;
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
        $meteoHumedad.textContent = '—';
        $meteoLluvia.textContent = '—';
        $meteoVisib.textContent = '—';
        $meteoPrevision.innerHTML = '';
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
            $salidaDestinos.textContent = r.proxima.destinos;
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
      const velTexto = velEfectivaKmh != null
        ? `${fuenteVelocidad === 'fallback' ? '~' : ''}${Math.round(velEfectivaKmh)} km/h`
        : '';
      $v1Velocidad.textContent = velNum;
      $v1VelocidadLimite.textContent = maxspeedActual != null ? String(maxspeedActual) : '';
      // V2 HUD (IU-20): la V2 ya no muestra velocidad (dedicada a meteo).
      // Mantenemos el textContent por retrocompatibilidad (debug/tests)
      // pero la className no se actualiza: el elemento sigue con .p2-off.
      $v2Velocidad.textContent = velTexto;
      // FN-06: color de velocidad según exceso sobre maxspeedActual.
      let claseExceso = '';
      if (maxspeedActual != null && velEfectivaKmh != null) {
        const exceso = velEfectivaKmh - maxspeedActual;
        if (exceso > 15) claseExceso = 'exceso-grave';
        else if (exceso > 5) claseExceso = 'exceso';
      }
      $v1Velocidad.className = 'p1-speed-num u-tab' + (claseExceso ? ' ' + claseExceso : '');
      // FN-08: invertir los chips .maxspeed-chip cuando hay exceso.
      document.querySelectorAll('.maxspeed-chip').forEach(chip => {
        chip.classList.toggle('exceso', !!claseExceso);
      });

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
        actualizarUbicacionAdministrativa(c.latitude, c.longitude);
        actualizarCarretera(c.latitude, c.longitude);
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

    function actualizarAppHeight() {
      document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
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
    window.addEventListener('resize', () => {
      actualizarAppHeight();
      realinearScrollVisor();
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
