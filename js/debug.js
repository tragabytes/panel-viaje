// debug.js — Panel de debug visible en pantalla
// Uso: añadir ?debug=1 a la URL para activarlo.
// Sin ese parámetro, no hace nada visible.
//
// API pública:
//   debug.log("mensaje")    → mensaje normal (blanco)
//   debug.warn("mensaje")   → aviso (amarillo)
//   debug.error("mensaje")  → error (rojo)
//
// Los mensajes se muestran en un panel fijo abajo del todo,
// con scroll automático. Guarda los últimos 50.
//
// Añadidos en sesión 09:
//   - El panel añade la clase 'debug-activo' al <body> al crearse, para
//     que el CSS del index reserve hueco al final con padding-bottom.
//   - max-height bajado de 40vh a 30vh para pantallas pequeñas.
//   - Barra superior con título "debug" y botón de colapsar/expandir.
//     El estado colapsado se persiste en localStorage bajo la clave
//     'debug-colapsado'. Mientras está colapsado, el body lleva además
//     la clase 'debug-colapsado' para que el padding-bottom se reduzca.
//   - Los mensajes se siguen acumulando aunque el panel esté colapsado;
//     al expandirlo se ven los últimos 50 como siempre.

const debug = (() => {
  const activo = new URLSearchParams(window.location.search).get('debug') === '1';
  const maxMensajes = 500;           // historial ampliado en sesión 9.6 (antes 50)
  const maxVisibles = 50;            // cuántos se pintan en pantalla a la vez
  const mensajes = [];
  const CLAVE_COLAPSADO = 'debug-colapsado';

  let panel = null;
  let cuerpo = null;   // el área scrollable con los logs
  let barra = null;    // la tira superior con título y botones
  let botonColapsar = null;
  let botonCopiar = null;
  let colapsado = false;

  function leerEstadoColapsado() {
    try {
      return localStorage.getItem(CLAVE_COLAPSADO) === '1';
    } catch (e) {
      return false;
    }
  }

  function guardarEstadoColapsado(valor) {
    try {
      localStorage.setItem(CLAVE_COLAPSADO, valor ? '1' : '0');
    } catch (e) {
      // silencioso: si no hay localStorage, seguimos funcionando sin persistencia
    }
  }

  function aplicarEstadoVisual() {
    if (!panel || !cuerpo || !botonColapsar) return;
    if (colapsado) {
      cuerpo.style.display = 'none';
      botonColapsar.textContent = '+';
      botonColapsar.setAttribute('aria-label', 'Expandir panel de debug');
      document.body.classList.add('debug-colapsado');
    } else {
      cuerpo.style.display = 'block';
      botonColapsar.textContent = '–';
      botonColapsar.setAttribute('aria-label', 'Colapsar panel de debug');
      document.body.classList.remove('debug-colapsado');
      // scroll al final al expandir, por si han entrado mensajes mientras estaba colapsado
      cuerpo.scrollTop = cuerpo.scrollHeight;
    }
  }

  function alternarColapsado() {
    colapsado = !colapsado;
    guardarEstadoColapsado(colapsado);
    aplicarEstadoVisual();
  }

  // Vuelca TODO el historial a texto plano y lo copia al portapapeles.
  // Añade una cabecera con la URL, fecha y número total de mensajes.
  function copiarAlPortapapeles() {
    const cabecera = [
      '=== Panel de viaje — log de debug ===',
      `URL: ${window.location.href}`,
      `Fecha: ${new Date().toISOString()}`,
      `Mensajes: ${mensajes.length} (máx ${maxMensajes})`,
      '======================================',
      ''
    ].join('\n');
    const cuerpoTexto = mensajes
      .map(m => `[${m.hora}] ${m.texto}`)
      .join('\n');
    const todo = cabecera + cuerpoTexto;

    const textoOriginal = botonCopiar ? botonCopiar.textContent : 'copiar';
    const marcarExito = () => {
      if (!botonCopiar) return;
      botonCopiar.textContent = 'copiado ✓';
      botonCopiar.style.background = 'rgba(100, 200, 100, 0.3)';
      setTimeout(() => {
        botonCopiar.textContent = textoOriginal;
        botonCopiar.style.background = 'rgba(255, 255, 255, 0.12)';
      }, 1500);
    };
    const marcarError = () => {
      if (!botonCopiar) return;
      botonCopiar.textContent = 'error';
      botonCopiar.style.background = 'rgba(200, 80, 80, 0.4)';
      setTimeout(() => {
        botonCopiar.textContent = textoOriginal;
        botonCopiar.style.background = 'rgba(255, 255, 255, 0.12)';
      }, 1500);
    };

    // API moderna (requiere HTTPS, que ya tenemos)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(todo)
        .then(marcarExito)
        .catch(() => {
          intentarFallbackCopia(todo) ? marcarExito() : marcarError();
        });
    } else {
      intentarFallbackCopia(todo) ? marcarExito() : marcarError();
    }
  }

  function intentarFallbackCopia(texto) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function crearPanel() {
    if (panel) return;

    // Contenedor principal: fijo abajo, ancho completo
    panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 30vh;
      background: rgba(0, 0, 0, 0.88);
      color: #fff;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.4;
      border-top: 1px solid #444;
      z-index: 9999;
      display: flex;
      flex-direction: column;
    `;

    // Barra superior: siempre visible, con título y botón de colapsar
    barra = document.createElement('div');
    barra.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      background: rgba(255, 255, 255, 0.06);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    `;

    const titulo = document.createElement('span');
    titulo.textContent = 'debug';
    titulo.style.cssText = `
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.6;
    `;

    // Contenedor de botones a la derecha
    const botonesDer = document.createElement('div');
    botonesDer.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: center;
    `;

    // Botón de copiar todo el log al portapapeles
    botonCopiar = document.createElement('button');
    botonCopiar.type = 'button';
    botonCopiar.textContent = 'copiar';
    botonCopiar.style.cssText = `
      height: 24px;
      padding: 0 10px;
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
    `;
    botonCopiar.addEventListener('click', copiarAlPortapapeles);

    botonColapsar = document.createElement('button');
    botonColapsar.type = 'button';
    botonColapsar.style.cssText = `
      width: 32px;
      height: 24px;
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      font-family: monospace;
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      padding: 0;
    `;
    botonColapsar.addEventListener('click', alternarColapsado);

    botonesDer.appendChild(botonCopiar);
    botonesDer.appendChild(botonColapsar);

    barra.appendChild(titulo);
    barra.appendChild(botonesDer);
    panel.appendChild(barra);

    // Cuerpo: área scrollable con los logs
    cuerpo = document.createElement('div');
    cuerpo.id = 'debug-cuerpo';
    cuerpo.style.cssText = `
      overflow-y: auto;
      padding: 8px 10px;
      flex: 1 1 auto;
    `;
    panel.appendChild(cuerpo);

    document.body.appendChild(panel);
    document.body.classList.add('debug-activo');

    // Aplicar estado inicial leído de localStorage
    colapsado = leerEstadoColapsado();
    aplicarEstadoVisual();
  }

  function escribir(texto, color) {
    // Persistencia a Trayectos siempre, independiente de ?debug=1 (FN-02a).
    if (typeof Trayectos !== 'undefined') {
      const nivel = color === '#ffcc00' ? 'warn' : (color === '#ff5555' ? 'error' : 'log');
      Trayectos.log(nivel, texto);
    }
    if (!activo) return;
    if (!panel) {
      // Crear el panel cuando el body ya exista. Si llamamos a debug antes
      // de que el DOM esté listo, diferimos la creación.
      if (document.body) {
        crearPanel();
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          crearPanel();
          // tras crear, pinta los mensajes acumulados
          repintar();
        });
      }
    }
    const hora = new Date().toTimeString().slice(0, 8);
    mensajes.push({ hora, texto, color });
    if (mensajes.length > maxMensajes) mensajes.shift();
    if (panel && cuerpo) {
      repintar();
    }
  }

  function repintar() {
    if (!cuerpo) return;
    // Mostrar solo los últimos `maxVisibles` en pantalla (para no ralentizar
    // el scroll del móvil). El historial completo (hasta `maxMensajes`) se
    // conserva en memoria y se vuelca entero al pulsar "copiar".
    const visibles = mensajes.slice(-maxVisibles);
    cuerpo.innerHTML = visibles
      .map(m => `<div style="color:${m.color}">[${m.hora}] ${m.texto}</div>`)
      .join('');
    // scroll automático al final solo si no está colapsado
    if (!colapsado) {
      cuerpo.scrollTop = cuerpo.scrollHeight;
    }
  }

  return {
    log:   (texto) => escribir(texto, '#fff'),
    warn:  (texto) => escribir(texto, '#ffcc00'),
    error: (texto) => escribir(texto, '#ff5555'),
    activo: () => activo,
  };
})();
