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

const debug = (() => {
  const activo = new URLSearchParams(window.location.search).get('debug') === '1';
  let panel = null;
  const maxMensajes = 50;
  const mensajes = [];

  function crearPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 40vh;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.4;
      padding: 8px 10px;
      border-top: 1px solid #444;
      z-index: 9999;
    `;
    document.body.appendChild(panel);
  }

  function escribir(texto, color) {
    if (!activo) return;
    if (!panel) crearPanel();
    const hora = new Date().toTimeString().slice(0, 8);
    mensajes.push({ hora, texto, color });
    if (mensajes.length > maxMensajes) mensajes.shift();
    panel.innerHTML = mensajes
      .map(m => `<div style="color:${m.color}">[${m.hora}] ${m.texto}</div>`)
      .join('');
    panel.scrollTop = panel.scrollHeight;
  }

  return {
    log:   (texto) => escribir(texto, '#fff'),
    warn:  (texto) => escribir(texto, '#ffcc00'),
    error: (texto) => escribir(texto, '#ff5555'),
    activo: () => activo,
  };
})();
