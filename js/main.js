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

  // ===== Panel normal (modo por defecto) =====

  function arrancarPanel() {
    // Inicia el trayecto ANTES del primer debug.log para que todo quede
    // persistido en IDB desde la primera línea (FN-02a).
    if (window.Trayectos) Trayectos.iniciar();
    debug.log('Página cargada');

    // DT-01 + D24: service worker (sin cobertura, PWA) y actualizaciones que
    // entran solas con el coche parado, nunca en marcha (js/actualizacion.js).
    if (window.Actualizacion) {
      Actualizacion.iniciar();
    } else if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }

    // De noche, el panel baja el brillo poco a poco (js/modo_noche.js).
    if (window.ModoNoche) ModoNoche.iniciar();

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

    // DT-22: el radio de búsqueda de pueblos que ve el conductor sale de la
    // constante real del módulo, para que no vuelvan a divergir (el literal
    // decía "25 KM" cuando la búsqueda real es de 15 km).
    const RADIO_PUEBLOS_KM_TXT = (window.POIFuentes && POIFuentes.RADIO_PUEBLOS_M)
      ? Math.round(POIFuentes.RADIO_PUEBLOS_M / 1000)
      : 15;
    // El rótulo de la vista 4 (ENTORNO · RADIO N KM) lo escribe el radar: su
    // escala cambia con la velocidad (js/v4_radar.js).

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

    // Textos y trozos de HTML de cada vista: js/formato.js (puras, con tests).
    const {
      calcularMomentoDia, escapar, formatearAdmin, formatearAdminV1Html, gradosACardinal,
      renderPalabraGigante, renderStoryV2, renderTimelineV2, renderMetricsV2,
      formatearCoordsGMS, renderMiniForecast4h, iconoSvgPoi, distanciaKm, aplanarPOIs,
      postales, medirPostal,
    } = Formato;



    // DT-02 (sesión 33): distanciaMetros vive en js/geo.js.
    const distanciaMetros = Geo.distanciaMetros;

    function mostrarEstado(texto, clase) {
      // IU-19: $estado vive en el topbar V1 (.p1-estado). CSS esconde .ok y
      // deja error/aviso visibles en color. Se mantiene la API previa.
      $estado.textContent = texto;
      $estado.className = 'p1-estado ' + (clase || '');
    }








    // Spec 003: en el móvil apaisado no siempre caben las 6 horas (depende de
    // si la cabecera o la línea del viento ocupan una línea o dos). Se
    // esconden las últimas filas que no caben enteras, en vez de cortarlas.
    function ajustarPrevisionV2() {
      const filas = $v2MeteoTimeline.querySelectorAll('.p2-hr');
      if (!filas.length) return;
      filas.forEach((f) => { f.style.display = ''; });
      const inner = $v2MeteoTimeline.parentElement;
      const limite = inner.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(inner).paddingBottom) || 0);
      for (let i = filas.length - 1; i > 0; i--) {
        if (filas[i].getBoundingClientRect().bottom <= limite + 0.5) break;
        filas[i].style.display = 'none';
      }
    }



    // --- Efectos visuales de V2 ---

    // Spec 003: el tiempo como paisaje (cielo, astros, montañas, nubes, niebla).
    // Sustituye a las nubes SVG, los rayos, la niebla de filtro SVG y las
    // estrellas sueltas de IU-10..IU-15.
    if (window.PaisajeFX) PaisajeFX.init();
    // IU-13 / IU-15: lluvia y nieve en Canvas 2D, por delante del paisaje.
    if (window.RainFX) RainFX.init();
    if (window.SnowFX) SnowFX.init();

    // V4 (spec 002): radar con relieve. Las marcas del cuaderno que caigan
    // cerca salen en el radar como rombos (y sirven para «Aquí marcaste»).
    if (window.RadarV4) RadarV4.init();
    let marcasCuaderno = [];
    function recargarMarcas() {
      Cuaderno.listar().then((lista) => {
        marcasCuaderno = lista;
        if (window.RadarV4) RadarV4.marcas(lista);
      }).catch(() => {});
    }
    recargarMarcas();

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
    // D8: sin cobertura, pueblo y vía se quedaban los del último sitio con red,
    // como si fueran actuales. Se atenúan al alejarse 2 km de donde Nominatim
    // los confirmó (una respuesta de la caché no cuenta como confirmación).
    const frescuraUbicacion = Frescura.crear();
    const frescuraCarretera = Frescura.crear();
    let ubicacionVieja = false;
    let carreteraVieja = false;
    // Cuaderno (spec 001, H1): lo que se guarda al marcar. Se actualiza en
    // cada tick de GPS; marcar no pide nada a internet.
    let ultimaPosicionMarca = null;
    // Cuaderno, H2: lo que el panel tiene pintado ahora mismo. Cada pintado lo
    // apunta aquí; al marcar se copia en la marca tal cual se veía.
    const contextoPanel = { ubicacion: null, via: null, pueblos: [], meteo: null };

    // Velocidad y rumbo de cada posición, también en los Android viejos que
    // los dan a null (js/movimiento.js). Un solo rumbo para todo el panel.
    const movimiento = Movimiento.crear();
    const RUMBO_SALIDAS_MS = 5000;
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
    // Vista 3 (spec 004, «Postales»): los sitios pintados, para actualizar su
    // distancia y su flecha en cada tick sin repintar las fotos.
    const POSTALES = 3;
    let poisV3 = [];
    // Las flechas se quedan con el último rumbo conocido (parado en un
    // semáforo, el rumbo caduca, pero los sitios siguen donde estaban).
    let ultimoRumboConocido = null;

    // --- Pintado ---

    function pintarCarretera(info) {
      contextoPanel.via = info || null;
      // V1 HUD (IU-19): etiqueta "VÍA" + escudo fósforo + textoCrudo como label.
      // Nombre oficial, destino y PK no están disponibles hoy — se añadirán si
      // se consulta tags Overpass en una tarjeta futura.
      // DT-14: la pastilla de V3 y el chip de maxspeed se eliminaron — vivían en
      // #v3Carretera, oculto con display:none desde IU-21. El límite visible es
      // #v1VelocidadLimite en la cabecera (se escribe en cada tick GPS).
      if (info && info.codigo) {
        const claseShield = info.tipo === 'autonomica' ? ' p1-road-shield--autonomica' : '';
        // PENDIENTES n.º 3: sin repetir el código que ya dice la pastilla.
        const etiqueta = Carreteras.etiquetaVia(info.codigo, info.textoCrudo);
        const label = etiqueta
          ? `<span class="p1-road-label">${escapar(etiqueta)}</span>`
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
      contextoPanel.pueblos = resultado.pueblosCercanos || [];
      // IU-33: comarca · población · altitud van a la cabecera global, en gris,
      // tras el nombre del municipio. El prefijo " · " forma parte del valor
      // para que :empty oculte el span y su separador a la vez.
      // PENDIENTES n.º 4: solo si son del municipio en el que estás (mientras
      // llegan los del pueblo nuevo, POIModule devuelve los del anterior).
      const dm = resultado.datosMunicipio && resultado.datosMunicipio.municipio === municipioActual
        ? resultado.datosMunicipio : null;
      if (dm) {
        if ($globalPlaceMeta) $globalPlaceMeta.textContent = Formato.metaMunicipio(dm, municipioActual);
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
      // BPC-17: los POIs de todos los pueblos, sin repetir los compartidos.
      const pois = aplanarPOIs(pueblos);
      if (pueblos.length === 0) {
        $poiScroll.innerHTML = '';
        $poiBloque.style.display = 'none';
      } else {
        // V1 HUD: lista plana "distancia + nombre", 3 pueblos máximo (IU-19).
        $poiScroll.innerHTML = pueblos.slice(0, 3).map(pueblo => {
          return `<li>
            <span class="p1-near-dist u-tab u-phos">${escapar(distanciaKm(pueblo.distKm))}</span>
            <span class="p1-near-name">${escapar(pueblo.nombre)}</span>
          </li>`;
        }).join('');

        // V1 HUD: strip inferior con los 3 primeros POIs, con el nombre del
        // pueblo como pie atenuado (IU-19 ajuste).
        const top3 = pois.slice(0, 3);
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

      // V3 (spec 004, opción A «Postales»): los 3 sitios más cercanos, con la
      // foto grande, el nombre encima, el pueblo y hacia dónde quedan. Menos
      // datos que la cuadrícula de 6 de antes: 3 fotos.
      poisV3 = postales(pois, ultimaPosicionMarca, ultimoRumboConocido, POSTALES);
      if (poisV3.length === 0) {
        $v3Grid.innerHTML = '<div class="poi-cargando">Sin puntos de interés cerca</div>';
      } else {
        $v3Grid.innerHTML = poisV3.map(poi => {
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
          const imagen = fotoSrc
            ? `<img src="${escapar(fotoSrc)}" alt="" loading="lazy" draggable="false">`
            : iconoSvgPoi(poi.tipo);
          return `<div class="p3-postal">
            <div class="p3-v3-thumb${fotoSrc ? '' : ' p3-v3-icon'}" ${tipoAttr}>${imagen}
              <div class="p3-postal-nombre">${escapar(poi.nombre)}</div>
            </div>
            <div class="p3-postal-pie">
              <span class="p3-postal-pueblo">${escapar(poi.pueblo)}</span>
              <span class="p3-postal-dist u-tab"><svg class="p3-postal-flecha" viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -8 L6.5 6 L0 2.5 L-6.5 6 Z" fill="currentColor"/></svg><span class="p3-postal-km"></span></span>
            </div>
          </div>`;
        }).join('');
        actualizarPostales();
        // Si una foto falla (404, mixed content, archivo borrado), hacemos swap
        // al icono SVG temático del tipo de POI en vez de dejar hueco vacío.
        $v3Grid.querySelectorAll('.p3-v3-thumb img').forEach(img => {
          img.addEventListener('error', () => {
            const div = img.parentElement;
            if (div) {
              div.classList.add('p3-v3-icon');
              img.replaceWith(document.createRange().createContextualFragment(iconoSvgPoi(div.dataset.tipo || '')));
            }
          }, { once: true });
        });
      }
      // Contador del head: "8 EN 15 KM", todos los encontrados (el radio sale de POIFuentes)
      if ($v3PoiCounter) {
        $v3PoiCounter.innerHTML =
          `<span class="u-phos">${pois.length}</span> EN ${RADIO_PUEBLOS_KM_TXT} KM`;
      }
      // V4 (spec 002): ecos del radar. Las distancias las recalcula el radar
      // en cada tick desde la posición actual.
      if (window.RadarV4) RadarV4.pueblos(pueblos);
    }

    // DT-18: camino rápido de pintarPOIs — la estructura no cambió, solo las
    // distancias. Las de la vista 3 van aparte (actualizarPostales, cada tick).
    function actualizarDistanciasPOIs(pueblos) {
      const nodosNear = $poiScroll.querySelectorAll('.p1-near-dist');
      pueblos.slice(0, 3).forEach((p, i) => {
        if (nodosNear[i] && p.distKm != null) nodosNear[i].textContent = distanciaKm(p.distKm);
      });
    }

    // Vista 3: distancia y flecha de cada postal desde donde estás ahora. Va en
    // cada tick (son tres textos y tres giros); las postales no se reordenan
    // hasta el siguiente repintado (cambia la lista de pueblos).
    function actualizarPostales() {
      const postalesDom = $v3Grid.querySelectorAll('.p3-postal');
      poisV3.forEach((poi, i) => {
        const el = postalesDom[i];
        if (!el) return;
        const m = medirPostal(poi, ultimaPosicionMarca, ultimoRumboConocido);
        const km = el.querySelector('.p3-postal-km');
        const texto = m.distKm != null ? distanciaKm(m.distKm) : '';
        if (km && km.textContent !== texto) km.textContent = texto;
        const flecha = el.querySelector('.p3-postal-flecha');
        if (flecha) {
          flecha.style.visibility = m.desvio == null ? 'hidden' : '';
          if (m.desvio != null) {
            // Por el camino corto: con el sitio justo detrás, el desvío salta
            // entre +179 y −179 y, con la transición, la flecha daba la vuelta entera.
            const previo = flecha.dataset.giro != null ? Number(flecha.dataset.giro) : m.desvio;
            const giro = previo + ((((m.desvio - previo) % 360) + 540) % 360 - 180);
            flecha.dataset.giro = giro.toFixed(1);
            flecha.style.transform = `rotate(${Math.round(giro)}deg)`;
          }
        }
      });
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
      const fmtDist = d => distanciaKm(d / 1000);
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

    // D8: solo toca el DOM cuando cambia el estado, no en cada tick.
    function marcarDatosViejos(lat, lon) {
      const u = frescuraUbicacion.esViejo(lat, lon);
      if (u !== ubicacionVieja) {
        ubicacionVieja = u;
        for (const id of ['admin', 'globalPlace', 'globalPlaceMeta', 'v4Placename']) {
          const el = document.getElementById(id);
          if (el) el.classList.toggle('dato-viejo', u);
        }
        debug.log(u ? 'Ubicación vieja (>2 km sin confirmar): atenuada' : 'Ubicación confirmada de nuevo');
      }
      const c = frescuraCarretera.esViejo(lat, lon);
      if (c !== carreteraVieja) {
        carreteraVieja = c;
        $carreteraBloque.classList.toggle('dato-viejo', c);
        // PENDIENTES n.º 1: el límite es de esa vía; sin confirmarla, también se atenúa.
        $v1VelocidadLimite.classList.toggle('dato-viejo', c);
        debug.log(c ? 'Vía vieja (>2 km sin confirmar): atenuada' : 'Vía confirmada de nuevo');
      }
    }

    async function actualizarUbicacionAdministrativa(lat, lon, velKmh) {
      const miSeq = ++seqUbicacion;
      try {
        const info = await LocationModule.obtenerUbicacion(lat, lon, velKmh);
        if (miSeq !== seqUbicacion) return; // DT-13: hay una respuesta más nueva
        if (info.fuente !== 'cache') {
          frescuraUbicacion.confirmar(lat, lon);
          marcarDatosViejos(lat, lon);
        }
        contextoPanel.ubicacion = { municipio: info.municipio, provincia: info.provincia, ccaa: info.ccaa };
        const clave = `${info.municipio}|${info.provincia}|${info.ccaa}`;
        if (clave === ultimaUbicacionMostrada) return;
        ultimaUbicacionMostrada = clave;

        // PENDIENTES n.º 4: los datos del pueblo anterior se van con él.
        if ((info.municipio || null) !== municipioActual && $globalPlaceMeta) $globalPlaceMeta.textContent = '';
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
        if (info.fuente !== 'cache') {
          frescuraCarretera.confirmar(lat, lon);
          marcarDatosViejos(lat, lon);
        }

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

    // ?meteo=lluvia (o tormenta, nieve, niebla, nublado, cubierto, llovizna,
    // despejado): pinta ese tiempo en lugar del real, para ver cada paisaje en
    // el simulador. Solo cambia lo que se pinta; no toca la caché de Weather.
    const METEO_FORZADA = { despejado: 0, nublado: 2, cubierto: 3, niebla: 45, llovizna: 53,
      lluvia: 63, chubascos: 81, nieve: 73, tormenta: 95 }[new URLSearchParams(location.search).get('meteo')];
    function forzarMeteo(meteo) {
      if (METEO_FORZADA == null) return meteo;
      const tr = MeteoCodigos.traducir(METEO_FORZADA, meteo.esDia);
      return Object.assign({}, meteo, {
        weatherCode: METEO_FORZADA, descripcion: tr.texto, etiqueta: tr.etiqueta,
        categoria: tr.categoria, icono: tr.icono,
        precipitacion: tr.categoria === 'lluvia' || tr.categoria === 'tormenta' ? 3 : (tr.categoria === 'nieve' ? 1.5 : 0),
      });
    }

    async function actualizarMeteo(lat, lon) {
      try {
        const real = await Weather.obtenerTiempoActual(lat, lon);
        const meteo = forzarMeteo(real);
        // DT-12: la clave incluye la temperatura redondeada — sin ella, una
        // respuesta fresca ya pagada con el mismo bloque de 15 min y el mismo
        // código WMO se descartaba aunque la temperatura hubiera cambiado
        // (subir un puerto despejado: de 28° a 18° sin repintar).
        const clave = `${meteo.hora}|${meteo.weatherCode}|${Math.round(meteo.temperatura)}`;
        // Dedupe normal: si la clave coincide y NO venimos de error, salimos.
        contextoPanel.meteo = real; // a una marca va el tiempo real, nunca el de ?meteo=
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
        ajustarPrevisionV2();
        $vista2.setAttribute('data-meteo-cat', meteo.categoria || 'despejado');

        const momentoV2 = calcularMomentoDia(meteo.sunrise, meteo.sunset, Date.now());
        $vista2.setAttribute('data-momento', momentoV2);
        if (window.RainFX) {
          RainFX.setMomento(momentoV2);
          RainFX.setMeteo(meteo);
        }
        if (window.SnowFX) {
          SnowFX.setMomento(momentoV2);
          SnowFX.setMeteo(meteo);
        }
        if (window.PaisajeFX) PaisajeFX.setMeteo(meteo);

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
        contextoPanel.meteo = null;
        // Con DT-15, si solo cambiáramos el atributo el rAF seguiría vivo con
        // la meteo vieja: setMeteo(null) lo para de verdad.
        if (window.RainFX) RainFX.setMeteo(null);
        if (window.SnowFX) SnowFX.setMeteo(null);
        if (window.PaisajeFX) PaisajeFX.setMeteo(null);
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

    // Lo que no es imprescindible va protegido: un fallo en el radar, el
    // paisaje o un aviso no puede dejar el panel sin pueblo, vía ni tiempo (lo
    // que viene después en el tick no llegaría a correr). Se apunta una vez.
    const fallosAvisados = new Set();
    function sinRomper(nombre, fn) {
      try {
        fn();
      } catch (err) {
        if (!fallosAvisados.has(nombre)) debug.error(`${nombre} falló: ${err && err.message}`);
        fallosAvisados.add(nombre);
      }
    }

    function alRecibirPosicion(pos) {
      const c = pos.coords;
      const ahora = Date.now();

      if (!logueadoPrimerFixSpeed) {
        debug.log(`GPS fix inicial: c.speed=${c.speed} c.heading=${c.heading}`);
        logueadoPrimerFixSpeed = true;
      }

      // Velocidad y rumbo efectivos: los del GPS o, si no los da (Android
      // viejos), calculados entre posiciones.
      const mov = movimiento.actualizar(c, ahora);
      const velEfectivaKmh = mov.velKmh;
      const velCalculada = mov.fuenteVel === 'calculada';
      const rumboEfectivo = mov.rumbo;
      if (velCalculada && !logueadoFallbackVelocidad) {
        debug.log(`Velocidad fallback activa (GPS no reporta speed): ~${Math.round(velEfectivaKmh)} km/h`);
        logueadoFallbackVelocidad = true;
      }

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
        ? `${velEfectivaKmh.toFixed(1)} km/h${velCalculada ? ' (calc)' : ''}`
        : 'no disponible';
      $rumbo.textContent = rumboEfectivo != null
        ? `${rumboEfectivo.toFixed(0)}°${mov.fuenteRumbo === 'calculado' ? ' (calc)' : ''}`
        : 'no disponible';
      $hora.textContent = new Date().toTimeString().slice(0, 8);

      // V1 HUD (IU-19): número y unidad viven en nodos separados. Sólo el número
      // cambia aquí; "km/h" está en el HTML y no se retoca. Prefijo "~" si la
      // velocidad viene del fallback calculado (coord. previas).
      const velNum = velEfectivaKmh != null
        ? `${velCalculada ? '~' : ''}${Math.round(velEfectivaKmh)}`
        : '—';
      $v1Velocidad.textContent = velNum;
      $v1VelocidadLimite.textContent = maxspeedActual != null ? String(maxspeedActual) : '';
      // FN-06: color de velocidad según exceso sobre maxspeedActual (nunca
      // contra el límite de una vía sin confirmar: PENDIENTES n.º 1).
      const claseExceso = Formato.claseExceso(velEfectivaKmh, maxspeedActual, carreteraVieja);
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
      if (window.AyudaGPS) AyudaGPS.ocultar();
      marcarDatosViejos(c.latitude, c.longitude);
      ultimaPosicionMarca = {
        lat: c.latitude,
        lon: c.longitude,
        precision: c.accuracy,
        rumbo: rumboEfectivo,
        velocidadKmh: velEfectivaKmh,
        ts: ahora,
      };
      if (window.RadarV4) {
        sinRomper('Radar', () => RadarV4.posicion({ lat: c.latitude, lon: c.longitude, rumbo: rumboEfectivo, velocidadKmh: velEfectivaKmh }));
      }
      sinRomper('Aquí marcaste', () => comprobarAquiMarcaste(ultimaPosicionMarca, ahora));
      if (rumboEfectivo != null) ultimoRumboConocido = rumboEfectivo;
      sinRomper('Postales', () => actualizarPostales());
      // D24: una versión nueva solo entra con el coche parado.
      if (window.Actualizacion) sinRomper('Actualización', () => Actualizacion.gps(velEfectivaKmh));
      // Spec 003: las montañas de la vista 2 se deslizan solo en marcha; la
      // posición sirve para calcular la salida y la puesta del sol.
      if (window.PaisajeFX) {
        sinRomper('Paisaje', () => {
          PaisajeFX.setVelocidad(velEfectivaKmh);
          PaisajeFX.setPosicion(c.latitude, c.longitude);
        });
      }
      if (window.ModoNoche) sinRomper('Modo noche', () => ModoNoche.posicion(c.latitude, c.longitude));

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

      // MotorwayExit se evalúa en CADA tick, con el rumbo del GPS o el calculado
      // (PENDIENTES n.º 6), pero solo si es reciente: uno de hace 15 s, en una
      // curva, descartaba la salida que venía (decisión 14). Sin rumbo, sin cartel.
      const rumboSalidas = mov.edadRumboMs != null && mov.edadRumboMs <= RUMBO_SALIDAS_MS ? rumboEfectivo : null;
      actualizarProximasSalidas(c.latitude, c.longitude, rumboSalidas, velEfectivaKmh);
    }

    // D25: qué falla y dónde se arregla (js/ayuda_gps.js). Sin permiso o sin
    // señal desde el principio, una tarjeta; un corte con el GPS ya andando
    // (túnel) o un GPS que tarda, solo el aviso de la cabecera.
    function alFallarPosicion(err) {
      debug.error(`GPS error ${err.code}: ${err.message}`);
      const huboFix = ultimoTickGPS != null;
      if (!window.AyudaGPS) {
        mostrarEstado(`Error de GPS (${err.code})`, 'error');
        return;
      }
      mostrarEstado(AyudaGPS.estado(err.code, huboFix), err.code === 1 ? 'error' : 'aviso');
      const ayuda = AyudaGPS.decidir({ codigo: err.code, huboFix, enWebView: AyudaGPS.esWebView(navigator.userAgent) });
      if (ayuda) AyudaGPS.mostrar(ayuda, empezarGps);
    }

    // Pide la ubicación (y la vuelve a pedir al reintentar).
    let idVigilanciaGps = null;
    function empezarGps() {
      if (!('geolocation' in navigator)) return;
      if (idVigilanciaGps != null) navigator.geolocation.clearWatch(idVigilanciaGps);
      debug.log('Solicitando permiso de GPS…');
      idVigilanciaGps = navigator.geolocation.watchPosition(
        alRecibirPosicion,
        alFallarPosicion,
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 30000,
        }
      );
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
      ajustarPrevisionV2();
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

    // --- Cuaderno: marcar con un toque largo (spec 001, H1) ---
    //
    // Funciona igual en las 4 vistas: los eventos se escuchan en todo el
    // documento. Deslizar entre vistas lo descarta el detector (se mueve más
    // de 10 px, o el navegador manda pointercancel al empezar a desplazar).

    const $marcaAviso = document.getElementById('marcaAviso');
    let marcaAvisoTimer = null;
    function avisarMarca(texto, clase, duracionMs) {
      $marcaAviso.textContent = texto;
      $marcaAviso.className = 'marca-aviso u-caps' + (clase ? ' ' + clase : '');
      $marcaAviso.hidden = false;
      clearTimeout(marcaAvisoTimer);
      marcaAvisoTimer = setTimeout(() => { $marcaAviso.hidden = true; }, duracionMs || 2000);
    }

    // «Aquí marcaste»: al volver a pasar junto a una marca de otro momento, un
    // aviso de 8 s con lo que era (js/cuaderno.js, marcasAqui). Las ya
    // recordadas se apuntan en el móvil para no repetirlas en un mes (en un
    // trayecto de todos los días serían un aviso diario). Es una comodidad: si
    // localStorage falla, como mucho se repite un aviso.
    // Con el simulador no se apuntan en el móvil: una ruta simulada junto a las
    // marcas las dejaría "recordadas" y en el viaje de verdad no saldrían.
    const CLAVE_RECORDADAS = 'cuaderno-recordadas';
    const RECORDADAS_MS = 31 * 24 * 3600 * 1000;
    const simulando = !!(window.Simulator && Simulator.estaActivo());
    let recordadas = {};
    try { if (!simulando) recordadas = JSON.parse(localStorage.getItem(CLAVE_RECORDADAS)) || {}; } catch (e) { recordadas = {}; }
    // Marcas de las que ya te has alejado (más de 1 km desde que se abrió el
    // panel o desde que se hicieron): solo esas pueden recordarse al volver.
    const alejadas = new Set();
    function comprobarAquiMarcaste(pos, ahora) {
      Cuaderno.actualizarAlejadas(marcasCuaderno, pos, alejadas);
      const aqui = Cuaderno.marcasAqui(marcasCuaderno, pos, ahora, recordadas, alejadas);
      if (!aqui.length) return;
      for (const x of aqui) recordadas[x.marca.id] = ahora;
      for (const id of Object.keys(recordadas)) {
        const d = ahora - recordadas[id];
        if (d > RECORDADAS_MS || d < 0) delete recordadas[id];
      }
      if (!simulando) {
        try { localStorage.setItem(CLAVE_RECORDADAS, JSON.stringify(recordadas)); } catch (e) { /* solo en memoria */ }
      }
      const m = aqui[0].marca;
      avisarMarca(Cuaderno.textoAquiMarcaste(m, ahora, aqui.length - 1), 'recuerdo', 8000);
      debug.log(`Cuaderno: aquí marcaste (marca del ${new Date(m.id).toLocaleString('es')}, a ${Math.round(aqui[0].distM)} m${aqui.length > 1 ? `, y ${aqui.length - 1} más` : ''})`);
    }

    const detectorMarca = Cuaderno.crearDetectorToqueLargo(() => {
      // H2: lo que se veía, tal cual (atenuado incluido). Sin red no se pide nada.
      const contexto = Cuaderno.construirContexto({
        ubicacion: contextoPanel.ubicacion,
        ubicacionVieja,
        via: contextoPanel.via,
        viaVieja: carreteraVieja,
        pueblos: contextoPanel.pueblos,
        meteo: contextoPanel.meteo,
      }, ultimaPosicionMarca);
      Cuaderno.marcar(ultimaPosicionMarca, contexto).then((r) => {
        if (!r.guardada) {
          avisarMarca('✕ Sin guardar', 'error');
          debug.error(`Cuaderno: marca NO guardada (${r.error})`);
          return;
        }
        avisarMarca('◆ Marcado');
        if (r.respaldo) debug.warn(`Cuaderno: la base de datos no respondió (${r.error}); marca guardada en el respaldo`);
        if (r.duplicada) {
          debug.log('Cuaderno: marca repetida en menos de 10 s, se queda la anterior');
        } else {
          const m = r.marca;
          const c = m.contexto || {};
          debug.log(`Cuaderno: marca guardada · ${m.lat != null ? m.lat.toFixed(5) + ', ' + m.lon.toFixed(5) : 'sin posición'}${m.aproximada ? ' (aproximada)' : ''} · ${c.municipio || 'sin municipio'}${c.via ? ' · ' + (c.via.codigo || c.via.texto) : ''} · ${(c.pueblos || []).length} pueblos${c.pendiente ? ' · pendiente de completar' : ''}`);
          recargarMarcas();
        }
      });
    });

    // Los botones (pantalla completa, copiar del debug) siguen siendo botones.
    const esControl = (e) => !!(e.target.closest && e.target.closest('button, a, input, select, textarea'));
    document.addEventListener('pointerdown', (e) => {
      if (esControl(e)) return;
      detectorMarca.down(e.pointerId, e.clientX, e.clientY, e.isPrimary);
    }, { passive: true });
    document.addEventListener('pointermove', (e) => {
      detectorMarca.move(e.pointerId, e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('pointerup', (e) => detectorMarca.up(e.pointerId), { passive: true });
    document.addEventListener('pointercancel', (e) => detectorMarca.up(e.pointerId), { passive: true });
    // Chrome en Android abre un menú al mantener el dedo: aquí es el gesto de marcar.
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- Arranque: simulador o GPS real ---

    if (window.Simulator && Simulator.estaActivo()) {
      mostrarEstado(`Simulación: ${Simulator.nombreRuta()}`, 'ok');
      debug.log(`Modo simulación activo: ${Simulator.nombreRuta()}`);
      Simulator.iniciar(alRecibirPosicion);
    } else if (!('geolocation' in navigator)) {
      mostrarEstado('Este navegador no da la ubicación', 'error');
      debug.error('navigator.geolocation no disponible');
      if (window.AyudaGPS) AyudaGPS.mostrar(AyudaGPS.decidir({ sinApi: true, enWebView: AyudaGPS.esWebView(navigator.userAgent) }), () => location.reload());
    } else {
      empezarGps();
      // D25: al volver de los ajustes con el permiso dado, el panel arranca solo.
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then((permiso) => {
          permiso.onchange = () => {
            debug.log(`Permiso de ubicación: ${permiso.state}`);
            if (permiso.state === 'granted') empezarGps();
          };
        }).catch(() => {});
      }
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && window.AyudaGPS && AyudaGPS.visible()) empezarGps();
      });
    }
  }

  // ===== Entry point =====

  function arrancar() {
    configurarBotonFullscreen();
    configurarSafeAreaDev();
    const params = new URLSearchParams(location.search);
    if (params.get('logs') === '1') {
      // Nunca el panel en modo logs, aunque falte el módulo: si no cargó, dilo.
      if (window.LogsVista) {
        LogsVista.arrancar();
      } else {
        document.getElementById('visor').style.display = 'none';
        document.body.style.overflow = 'auto';
        const aviso = document.createElement('p');
        aviso.style.cssText = 'padding:24px; font-size:16px; color:#e8f3ef;';
        aviso.textContent = 'No se pudo cargar la vista de logs. Recarga la página con internet.';
        document.body.appendChild(aviso);
      }
    } else if (params.get('cuaderno') === '1' && window.CuadernoVista) {
      // Spec 001, H3: el cuaderno es un modo aparte; el panel no enlaza aquí.
      CuadernoVista.arrancar();
    } else {
      arrancarPanel();
    }
  }

  arrancar();
})();
