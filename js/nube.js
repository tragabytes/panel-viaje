// js/nube.js — Los logs del viaje, en la nube (specs/005-logs-en-la-nube).
//
// Al dejar el panel en segundo plano o cerrarlo, el log del viaje (el mismo
// .txt que se descarga en ?logs=1) se sube comprimido a un repositorio privado
// de GitHub de Laureano; al abrirlo, los que quedaran pendientes (la primera
// vez, todos los que guarda el móvil). Así Claude los lee desde el ordenador.
// El borrado de los 30 días lo hace el propio repositorio cada noche
// (infra/repositorio-logs).
//
// La clave (un token de GitHub limitado a ese repositorio, con permiso de
// escribir) la pega Laureano en ?logs=1 y vive solo en el móvil: nunca en el
// código publicado (R-003, lo vigila un test).
//
// Datos (regla 2): ~10-30 KB por viaje, y un viaje ya subido y sin cambios no
// se reenvía. Red (regla 4): solo cuenta como subido lo que GitHub confirma; lo
// demás sigue pendiente. Un fallo aquí nunca afecta al panel (R-006).
//
// API pública (Nube):
//   Nube.iniciar()                → al arrancar el panel (sin clave, no hace nada)
//   Nube.subirPendientes(todos)   → Promise<{ subidos, fallidos, motivo }>
//                                   (todos: también el viaje en curso)
//   Nube.clave() · Nube.guardarClave(texto) → bool · Nube.quitarClave()
//   Nube.estado() → { [idViaje]: { firma, sha, ts } } · Nube.ultimoError() → 'clave' | 'red' | null
//   Puras (probadas en Node): firma, pendientes, apuntar, podar, nombreFichero,
//       nombreMovil, pareceClave

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const REPO = 'tragabytes/panel-viaje-logs';
  const API = 'https://api.github.com/repos/' + REPO + '/contents/';
  const CLAVE_TOKEN = 'nube-clave';
  const CLAVE_ESTADO = 'nube-subidos';
  const CLAVE_ERROR = 'nube-error';
  // Al abrir el panel, los pendientes esperan a que cargue lo demás (pueblo,
  // vía, tiempo): subir logs no puede retrasar lo que se mira conduciendo.
  const ESPERA_ARRANQUE_MS = 30000;
  // Un envío pequeño sale con keepalive, que sobrevive al cierre de la app (el
  // límite del navegador son 64 KB); uno mayor, al abrirla la próxima vez.
  const MAX_KEEPALIVE = 60000;

  // --- Puras ---

  // Cambia si el viaje ha crecido desde que se subió.
  function firma(t) {
    return (t.nMensajes || 0) + ':' + (t.nTrack || 0);
  }

  // Viajes por subir: los que no se han subido o han crecido desde entonces.
  // `excluirId`: el viaje que acaba de empezar (al arrancar no se sube).
  function pendientes(trayectos, estado, excluirId) {
    const e = estado || {};
    return (trayectos || []).filter((t) => t && t.id !== excluirId && (!e[t.id] || e[t.id].firma !== firma(t)));
  }

  // Solo se apunta lo que GitHub confirmó (regla 4): tras un fallo, pendiente.
  function apuntar(estado, t, resultado, ahora) {
    if (!resultado || !resultado.ok) return estado;
    return Object.assign({}, estado, { [t.id]: { firma: firma(t), sha: resultado.sha || null, ts: ahora } });
  }

  // Se olvida lo apuntado de los viajes que el móvil ya ha rotado.
  function podar(estado, trayectos) {
    const vivos = new Set((trayectos || []).map((t) => String(t.id)));
    const r = {};
    for (const k of Object.keys(estado || {})) if (vivos.has(k)) r[k] = estado[k];
    return r;
  }

  const dos = (n) => (n < 10 ? '0' : '') + n;

  // logs/AAAA-MM-DD_HH-MM-SS_movil[_sim].txt.gz, con la hora del móvil al
  // empezar el viaje: un fichero por viaje, que se sustituye si crece.
  function nombreFichero(id, movil, sim) {
    const d = new Date(id);
    const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_` +
      `${dos(d.getHours())}-${dos(d.getMinutes())}-${dos(d.getSeconds())}`;
    const m = String(movil || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'movil';
    return `logs/${fecha}_${m}${sim ? '_sim' : ''}.txt.gz`;
  }

  // El modelo del móvil si el navegador lo da (Chrome lo esconde en el user
  // agent, donde pone "K"); si no, algo que distinga el del panel del S22.
  function nombreMovil(ua, modelo) {
    if (modelo && modelo !== 'K') return modelo;
    const m = /Android [\d.]+; ([^;)]+)/.exec(ua || '');
    if (m && m[1].trim() !== 'K') return m[1].trim();
    if (/Android/.test(ua || '')) return 'android';
    if (/Windows|Macintosh|X11/.test(ua || '')) return 'pc';
    return 'movil';
  }

  // Las claves de GitHub: las de grano fino (github_pat_) y las clásicas.
  function pareceClave(texto) {
    return /^(github_pat_[A-Za-z0-9_]{40,}|gh[pousr]_[A-Za-z0-9]{30,})$/.test(String(texto || '').trim());
  }

  // --- Lo guardado en el móvil (localStorage: si falla, como mucho se resube algo) ---

  function leerLS(k, porDefecto) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? porDefecto : JSON.parse(v);
    } catch (e) {
      return porDefecto;
    }
  }
  function guardarLS(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* solo en memoria */ }
  }

  function clave() {
    try { return localStorage.getItem(CLAVE_TOKEN) || null; } catch (e) { return null; }
  }
  function guardarClave(texto) {
    const t = String(texto || '').trim();
    if (!pareceClave(t)) return false;
    try {
      localStorage.setItem(CLAVE_TOKEN, t);
      localStorage.removeItem(CLAVE_ERROR);
      return true;
    } catch (e) {
      return false;
    }
  }
  function quitarClave() {
    try { localStorage.removeItem(CLAVE_TOKEN); localStorage.removeItem(CLAVE_ERROR); } catch (e) { /* nada */ }
  }
  function estado() { return leerLS(CLAVE_ESTADO, {}) || {}; }
  function ultimoError() { return leerLS(CLAVE_ERROR, null); }

  // --- La subida ---

  async function aBase64Gzip(texto) {
    const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(flujo).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function cabeceras(token) {
    return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  let promesaMovil = null;
  function movil() {
    if (!promesaMovil) {
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      const uad = typeof navigator !== 'undefined' ? navigator.userAgentData : null;
      const modelo = uad && uad.getHighEntropyValues
        ? uad.getHighEntropyValues(['model']).then((v) => v.model).catch(() => '')
        : Promise.resolve('');
      promesaMovil = modelo.then((m) => nombreMovil(ua, m));
    }
    return promesaMovil;
  }

  async function shaActual(ruta, token) {
    const r = await fetch(API + ruta, { headers: cabeceras(token), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).sha || null;
  }

  function poner(ruta, contenido, sha, token, keepalive) {
    const cuerpo = JSON.stringify(Object.assign({ message: 'Log ' + ruta.slice(5), content: contenido }, sha ? { sha } : {}));
    return fetch(API + ruta, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, cabeceras(token)),
      body: cuerpo,
      keepalive: !!keepalive && cuerpo.length < MAX_KEEPALIVE,
    });
  }

  // Un viaje: su .txt de ?logs=1, comprimido. → { ok, sha } | { ok: false, motivo }
  async function subirViaje(t, token, keepalive) {
    try {
      const texto = await Trayectos.exportarTxt(t.id);
      if (!texto) return { ok: false, motivo: 'vacio' };
      const ruta = nombreFichero(t.id, await movil(), texto.includes('Modo simulación activo'));
      const contenido = await aBase64Gzip(texto);
      const anterior = estado()[t.id];
      let r = await poner(ruta, contenido, anterior && anterior.sha, token, keepalive);
      // Sin el sha bueno (se perdió lo apuntado, o el fichero cambió), GitHub
      // contesta 409 o 422: se pide el de ahora y se reintenta una vez.
      if (r.status === 409 || r.status === 422) r = await poner(ruta, contenido, await shaActual(ruta, token), token, false);
      if (r.status === 401 || r.status === 403 || r.status === 404) return { ok: false, motivo: 'clave' };
      if (!r.ok) return { ok: false, motivo: 'red' };
      const j = await r.json();
      return { ok: true, sha: j.content && j.content.sha };
    } catch (e) {
      return { ok: false, motivo: 'red' };
    }
  }

  let enCurso = null;
  function subirPendientes(todos, keepalive) {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const r = { subidos: 0, fallidos: 0, motivo: null };
      const token = clave();
      if (!token || !__global__.Trayectos) return r;
      try { if (Trayectos.guardarYa) await Trayectos.guardarYa(); } catch (e) { /* se sube lo que haya */ }
      const viajes = await Trayectos.listar();
      let est = podar(estado(), viajes);
      const actual = Trayectos.idActual ? Trayectos.idActual() : null;
      for (const t of pendientes(viajes, est, todos ? null : actual)) {
        const res = await subirViaje(t, token, keepalive);
        est = apuntar(est, t, res, Date.now());
        guardarLS(CLAVE_ESTADO, est);
        if (res.ok) {
          r.subidos++;
        } else {
          r.fallidos++;
          r.motivo = res.motivo;
          if (res.motivo === 'clave') break; // con la clave mal, los demás fallarían igual
        }
      }
      guardarLS(CLAVE_ESTADO, est);
      guardarLS(CLAVE_ERROR, r.fallidos ? r.motivo : null);
      return r;
    })().catch(() => ({ subidos: 0, fallidos: 1, motivo: 'red' })).finally(() => { enCurso = null; });
    return enCurso;
  }

  function iniciar() {
    if (!clave()) return;
    // Al abrir: los viajes anteriores que falten (el de ahora acaba de empezar).
    setTimeout(() => {
      subirPendientes(false, false).then((r) => {
        if (typeof debug === 'undefined') return;
        if (r.subidos) debug.log(`Nube: ${r.subidos} viaje(s) subido(s) a GitHub`);
        if (r.fallidos) debug.warn(`Nube: ${r.fallidos} viaje(s) sin subir (${r.motivo === 'clave' ? 'la clave no vale' : 'sin red'}); se reintenta`);
      });
    }, ESPERA_ARRANQUE_MS);
    // Al dejar el panel (pantalla apagada, otra app o cerrarlo): el viaje en
    // curso también. Sin apuntar en el log el éxito: si no, el viaje "crecería"
    // con esa línea y se resubiría la siguiente vez sin motivo.
    const alDejar = () => {
      subirPendientes(true, true).then((r) => {
        if (r.fallidos && typeof debug !== 'undefined') debug.warn(`Nube: no se pudo subir el viaje (${r.motivo}); se reintenta al abrir`);
      });
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') alDejar(); });
    window.addEventListener('pagehide', alDejar);
  }

  __global__.Nube = {
    iniciar, subirPendientes, clave, guardarClave, quitarClave, estado, ultimoError,
    firma, pendientes, apuntar, podar, nombreFichero, nombreMovil, pareceClave, REPO,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Nube;
  }
})();
