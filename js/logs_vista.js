// js/logs_vista.js — Modo aparte ?logs=1: los viajes guardados (js/trayectos.js),
// para descargarlos o borrarlos. No aparece en marcha. Aquí se pone también la
// clave de los logs en la nube y se ve qué viajes están subidos (spec 005).
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
    const $nube = document.getElementById('logsNube');

    const BOTON = 'border:none; border-radius:6px; padding:8px 14px; font-size:14px; cursor:pointer; color:#fff;';
    const CAJA = 'background:#11202a; border:1px solid #234253; border-radius:8px; padding:12px 14px; font-size:14px; line-height:1.45;';

    // Spec 005: la clave de GitHub (limitada al repositorio de los logs) y el
    // estado. La clave se guarda solo en este móvil.
    function pintarNube() {
      if (!$nube || !window.Nube) return;
      $nube.innerHTML = '';
      const caja = document.createElement('div');
      caja.style.cssText = CAJA;
      const titulo = document.createElement('div');
      titulo.style.cssText = 'font-weight:600; margin-bottom:6px;';
      titulo.textContent = '☁ Logs en la nube (GitHub, privado; se borran a los 30 días)';
      caja.appendChild(titulo);
      const texto = document.createElement('div');
      const acciones = document.createElement('div');
      acciones.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; align-items:center;';
      if (Nube.clave()) {
        const error = Nube.ultimoError();
        texto.textContent = error === 'clave'
          ? '⚠ La clave no vale (caducada o anulada): crea otra y pégala aquí.'
          : (error === 'red' ? 'Clave puesta. El último envío falló por la red: se reintenta solo.' : 'Clave puesta: los viajes se suben solos al dejar el panel.');
        const subir = document.createElement('button');
        subir.type = 'button';
        subir.textContent = 'Subir ahora';
        subir.style.cssText = BOTON + 'background:#1d4ed8;';
        subir.addEventListener('click', async () => {
          subir.disabled = true;
          subir.textContent = 'Subiendo…';
          const r = await Nube.subirPendientes(true, false);
          subir.disabled = false;
          subir.textContent = 'Subir ahora';
          estadoSubida.textContent = r.fallidos
            ? `No se pudo subir ${r.fallidos} (${r.motivo === 'clave' ? 'la clave no vale' : 'sin red'}).`
            : (r.subidos ? `Subidos ${r.subidos}.` : 'No había nada nuevo que subir.');
          pintarLista();
        });
        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.textContent = 'Quitar la clave';
        quitar.style.cssText = BOTON + 'background:#374151;';
        quitar.addEventListener('click', () => {
          if (!confirm('¿Quitar la clave de este móvil? Los viajes dejarán de subirse.')) return;
          Nube.quitarClave();
          pintarNube();
          pintarLista();
        });
        acciones.appendChild(subir);
        acciones.appendChild(quitar);
      } else {
        texto.textContent = 'Para que los viajes se suban solos, pega aquí la clave de GitHub (empieza por github_pat_).';
      }
      caja.appendChild(texto);
      if (!Nube.clave() || Nube.ultimoError() === 'clave') {
        const entrada = document.createElement('input');
        entrada.type = 'password';
        entrada.autocomplete = 'off';
        entrada.placeholder = 'github_pat_…';
        entrada.style.cssText = 'flex:1; min-width:200px; padding:8px; border-radius:6px; border:1px solid #334155; background:#0b1220; color:#fff; font-size:14px;';
        const guardar = document.createElement('button');
        guardar.type = 'button';
        guardar.textContent = 'Guardar la clave';
        guardar.style.cssText = BOTON + 'background:#15803d;';
        guardar.addEventListener('click', () => {
          if (!Nube.guardarClave(entrada.value)) {
            estadoSubida.textContent = 'Eso no parece una clave de GitHub (empieza por github_pat_).';
            return;
          }
          entrada.value = '';
          pintarNube();
          pintarLista();
        });
        acciones.insertBefore(guardar, acciones.firstChild);
        acciones.insertBefore(entrada, acciones.firstChild);
        const ayuda = document.createElement('details');
        ayuda.style.cssText = 'margin-top:10px; color:#cbd5e1;';
        ayuda.innerHTML =
          '<summary style="cursor:pointer;">Cómo crear la clave (5 minutos)</summary>' +
          '<ol style="margin:8px 0 0 18px; padding:0;">' +
          '<li>En Chrome, entra en github.com con tu cuenta y abre ' +
          '<b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> → <b>Generate new token</b>.</li>' +
          '<li>Nombre: «panel-viaje logs». Caducidad: 1 año.</li>' +
          '<li>Repository access: <b>Only select repositories</b> → <b>panel-viaje-logs</b>.</li>' +
          '<li>Permissions → Repository permissions → <b>Contents: Read and write</b> (nada más).</li>' +
          '<li><b>Generate token</b>, cópiala y pégala aquí arriba.</li>' +
          '</ol>' +
          '<p style="margin:8px 0 0;">Solo sirve para escribir logs en ese repositorio. Si pierdes el móvil, anúlala en esa misma página.</p>';
        caja.appendChild(acciones);
        caja.appendChild(ayuda);
      } else {
        caja.appendChild(acciones);
      }
      const estadoSubida = document.createElement('div');
      estadoSubida.style.cssText = 'margin-top:8px; color:#93c5fd;';
      caja.appendChild(estadoSubida);
      $nube.appendChild(caja);
    }

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
        // Spec 005: si el viaje está en la nube tal cual, o le falta lo último.
        let enNube = '';
        if (window.Nube && Nube.clave()) {
          const subido = Nube.estado()[t.id];
          enNube = subido && subido.firma === Nube.firma(t)
            ? ' · <span style="color:#7dffa0;">☁ subido</span>'
            : ' · <span style="color:#fbbf24;">pendiente de subir</span>';
        }
        info.innerHTML =
          '<div style="font-size:15px; font-weight:600;">'+fmtFecha(t.id)+'</div>'+
          '<div style="font-size:12px; color:#94a3b8; margin-top:2px;">'+
            t.nMensajes+' mensajes · '+t.nTrack+' puntos de track'+enNube+
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

    pintarNube();
    pintarLista();
  }

  window.LogsVista = { arrancar };
})();
