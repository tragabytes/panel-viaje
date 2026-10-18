// js/logs_vista.js — Modo aparte ?logs=1: los viajes guardados (js/trayectos.js),
// para descargarlos o borrarlos. No aparece en marcha.
//
// API pública (LogsVista):
//   LogsVista.arrancar() → esconde el panel y pinta la lista de viajes

(function () {
  'use strict';

  function arrancar() {
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

  window.LogsVista = { arrancar };
})();
