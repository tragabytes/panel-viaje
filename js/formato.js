// js/formato.js — Cómo se escribe cada dato en pantalla.
//
// Funciones puras (texto o trozos de HTML a partir de los datos), sin tocar la
// pantalla, para poder probarlas en Node. main.js las usa al pintar cada vista.
//
// API pública (Formato):
//   escapar(texto)                         texto seguro dentro de HTML
//   distanciaKm(km)                        '850 m' | '3.2 km'
//   aplanarPOIs(pueblos)                   los POIs de todos los pueblos, sin repetir
//   metaMunicipio(datos, municipioActual)  ' · comarca · 99.037 hab · 718 m' | ''
//   claseExceso(velKmh, limite, viejo)     '' | 'exceso' | 'exceso-grave'
//   formatearAdmin, formatearAdminV1Html, gradosACardinal, formatearCoordsGMS,
//   calcularMomentoDia, iconoSvgPoi, renderPalabraGigante, renderStoryV2,
//   renderTimelineV2, renderMetricsV2, renderMiniForecast4h (de main.js)

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

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

  // Texto seguro dentro de HTML, también dentro de un atributo (src, data-tipo).
  function escapar(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      // Sin modo noche: ya es un verde tenue (40-100 %) y de noche, al 70 %,
      // las horas sin lluvia no se leían.
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

  function distanciaKm(km) {
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
  }

  // V1 (los 3 primeros) y V3 (los 6 primeros): los POIs de todos los pueblos en
  // una lista, en orden (los pueblos vienen del más cercano al más lejano), sin
  // repetir el que comparten dos pueblos vecinos (BPC-17) ni el mismo sitio con
  // dos nombres casi iguales ("Ermita Ecce Homo" de OpenStreetMap y "Ermita del
  // Ecce Homo" de Wikipedia): mismo nombre sin artículos ni tildes y a menos de
  // MISMO_POI_GRADOS (~300 m). La usan el pintado y el camino rápido de las
  // distancias (DT-18): antes eran tres copias que tenían que casar a mano.
  const MISMO_POI_GRADOS = 0.003;
  function nombreParaComparar(nombre) {
    return String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9ñ]+/).filter((w) => w && !['de', 'del', 'la', 'las', 'el', 'los', 'y'].includes(w)).join(' ');
  }
  function aplanarPOIs(pueblos) {
    const vistos = [];
    const lista = [];
    for (const p of pueblos || []) {
      for (const poi of (p.pois || [])) {
        const nombre = nombreParaComparar(poi.nombre);
        const repetido = vistos.some((v) => v.nombre === nombre &&
          (poi.lat == null || v.lat == null || (Math.abs(v.lat - poi.lat) < MISMO_POI_GRADOS && Math.abs(v.lon - poi.lon) < MISMO_POI_GRADOS)));
        if (repetido) continue;
        vistos.push({ nombre, lat: poi.lat, lon: poi.lon });
        lista.push({ nombre: poi.nombre, foto: poi.foto, tipo: poi.tipo, lat: poi.lat, lon: poi.lon, pueblo: p.nombre, distKm: p.distKm });
      }
    }
    return lista;
  }

  // PENDIENTES n.º 4: lo que va en gris tras el pueblo, en la cabecera. Los
  // datos llegan tarde (Wikidata) y al cambiar de pueblo se quedaban los del
  // anterior: solo se enseñan si son del municipio en el que estás.
  function metaMunicipio(datos, municipioActual) {
    if (!datos || !municipioActual || datos.municipio !== municipioActual) return '';
    const partes = [];
    if (datos.comarca != null) partes.push(datos.comarca);
    if (datos.poblacion != null) partes.push(datos.poblacion.toLocaleString('es') + ' hab');
    if (datos.altitud != null) partes.push(datos.altitud + ' m');
    return partes.length ? ' · ' + partes.join(' · ') : '';
  }

  // FN-06 / IU-23: color de la velocidad según el exceso sobre el límite.
  // PENDIENTES n.º 1: sin cobertura, el límite puede ser el de la carretera de
  // la que venías; con la vía sin confirmar no se avisa (un aviso falso en rojo
  // distrae más de lo que ayuda).
  function claseExceso(velKmh, limiteKmh, limiteViejo) {
    if (velKmh == null || limiteKmh == null || limiteViejo) return '';
    const exceso = velKmh - limiteKmh;
    if (exceso > 15) return 'exceso-grave';
    if (exceso > 5) return 'exceso';
    return '';
  }

  __global__.Formato = {
    escapar, distanciaKm, aplanarPOIs, metaMunicipio, claseExceso,
    formatearAdmin, formatearAdminV1Html, gradosACardinal, formatearCoordsGMS,
    calcularMomentoDia, iconoSvgPoi, renderPalabraGigante, renderStoryV2,
    renderTimelineV2, renderMetricsV2, renderMiniForecast4h,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Formato;
  }
})();
