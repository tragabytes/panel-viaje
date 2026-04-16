// trayectos.js — persistencia de logs y track GPS por trayecto (FN-02a).
//
// Qué hace:
//   Agrupa cada ejecución del panel en un "trayecto" con id = timestamp de
//   inicio. Persiste en IndexedDB todos los mensajes de debug y una traza
//   ligera de posición GPS. Permite luego listar, leer y exportar trayectos
//   desde una pantalla de administración (FN-02b).
//
// API pública (Trayectos):
//   Trayectos.iniciar()                 → Promise<id|null>
//   Trayectos.log(nivel, texto)         fire-and-forget (bufferizado)
//   Trayectos.agregarTrack(lat, lon, speedKmh)   fire-and-forget
//   Trayectos.listar()                  → Promise<Array<{id, inicio, nMensajes, nTrack, userAgent}>>
//   Trayectos.leer(id)                  → Promise<{id, inicio, mensajes, track} | null>
//   Trayectos.borrar(id)                → Promise<void>
//   Trayectos.borrarTodos()             → Promise<void>
//
// Diseño:
//   · Tres object stores separados: trayectos (keyPath id), mensajes y track
//     (keyPath autoIncrement, con índice trayectoId). Escribir un mensaje es
//     un solo add(); no hay rewrite del trayecto completo.
//   · Buffer en memoria con flush cada 3 s o cuando el buffer llega a 20
//     mensajes o 5 puntos de track. Evita saturar IDB con un put por cada
//     línea.
//   · Flush adicional en visibilitychange=hidden y pagehide para no perder
//     datos al cerrar la pestaña o bloquear el móvil.
//   · El track se agrega cada 30 s o cada 500 m (lo que llegue antes).
//   · Rotación a 10 trayectos: al iniciar uno nuevo, si hay más, se borran
//     los más antiguos con sus mensajes y track asociados.
//   · Funciona sin ?debug=1. Debug.js llama a Trayectos.log en cada escritura
//     para que los logs se persistan aunque el panel visible no esté activo.
//   · Todos los fallos de IDB son silenciosos (best effort); nunca rompen el
//     panel. Si IDB no está disponible, Trayectos.* se convierten en no-op.

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const DB_NAME = 'panel-viaje-trayectos';
  const DB_VERSION = 1;
  const MAX_TRAYECTOS = 10;
  const TRACK_MIN_INTERVALO_MS = 30000;
  const TRACK_MIN_DISTANCIA_M = 500;
  const FLUSH_MS = 3000;
  const FLUSH_MIN_MSG = 20;
  const FLUSH_MIN_TRACK = 5;

  let dbPromise = null;
  let trayectoActualId = null;

  const bufferMsg = [];
  const bufferTrack = [];
  let ultimoTrackTs = 0;
  let ultimoTrackLat = null;
  let ultimoTrackLon = null;
  let flushTimer = null;

  // --- Utilidades ---

  function distanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (g) => g * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function abrirDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in __global__)) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('trayectos')) {
          db.createObjectStore('trayectos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('mensajes')) {
          const s = db.createObjectStore('mensajes', { keyPath: 'auto', autoIncrement: true });
          s.createIndex('trayectoId', 'trayectoId', { unique: false });
        }
        if (!db.objectStoreNames.contains('track')) {
          const s = db.createObjectStore('track', { keyPath: 'auto', autoIncrement: true });
          s.createIndex('trayectoId', 'trayectoId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(err => {
      dbPromise = null;
      throw err;
    });
    return dbPromise;
  }

  function tx(db, stores, mode) {
    return db.transaction(stores, mode);
  }

  function esperarTx(txn) {
    return new Promise((resolve, reject) => {
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
      txn.onabort = () => reject(txn.error || new Error('tx abortada'));
    });
  }

  // --- Inicio y rotación ---

  async function iniciar() {
    if (trayectoActualId) return trayectoActualId;
    // Asignar ID síncrono para que los primeros logs ya tengan dónde ir.
    // Si la apertura de IDB falla después, el flush descartará silenciosamente.
    const id = Date.now();
    trayectoActualId = id;
    try {
      const db = await abrirDb();
      const t = tx(db, ['trayectos'], 'readwrite');
      t.objectStore('trayectos').put({
        id,
        inicio: new Date(id).toISOString(),
        userAgent: (typeof navigator !== 'undefined') ? navigator.userAgent : '',
      });
      await esperarTx(t);
      rotar().catch(() => {});
      return id;
    } catch (err) {
      // Sin IDB, trayectoActualId queda asignado: los logs se bufferean pero
      // los flushes fallan silenciosamente.
      return id;
    }
  }

  async function rotar() {
    try {
      const db = await abrirDb();
      const ids = await new Promise((resolve, reject) => {
        const t = tx(db, ['trayectos'], 'readonly');
        const req = t.objectStore('trayectos').getAllKeys();
        req.onsuccess = () => resolve(req.result.slice().sort((a, b) => a - b));
        req.onerror = () => reject(req.error);
      });
      if (ids.length <= MAX_TRAYECTOS) return;
      const aBorrar = ids.slice(0, ids.length - MAX_TRAYECTOS);
      for (const id of aBorrar) {
        if (id === trayectoActualId) continue;
        await borrarInterno(id).catch(() => {});
      }
    } catch (e) { /* silencioso */ }
  }

  // --- Escritura (log y track) ---

  function log(nivel, texto) {
    if (!trayectoActualId) return;
    bufferMsg.push({
      trayectoId: trayectoActualId,
      ts: Date.now(),
      nivel,
      texto,
    });
    programarFlush();
  }

  function agregarTrack(lat, lon, speedKmh) {
    if (!trayectoActualId) return;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    const ahora = Date.now();
    const porTiempo = (ahora - ultimoTrackTs) >= TRACK_MIN_INTERVALO_MS;
    let porDistancia = ultimoTrackLat === null;
    if (!porDistancia) {
      const d = distanciaMetros(lat, lon, ultimoTrackLat, ultimoTrackLon);
      porDistancia = d >= TRACK_MIN_DISTANCIA_M;
    }
    if (!porTiempo && !porDistancia) return;
    bufferTrack.push({
      trayectoId: trayectoActualId,
      ts: ahora,
      lat,
      lon,
      speedKmh: (typeof speedKmh === 'number' ? speedKmh : null),
    });
    ultimoTrackTs = ahora;
    ultimoTrackLat = lat;
    ultimoTrackLon = lon;
    programarFlush();
  }

  function programarFlush() {
    if (bufferMsg.length >= FLUSH_MIN_MSG || bufferTrack.length >= FLUSH_MIN_TRACK) {
      flushAhora();
      return;
    }
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushAhora();
      }, FLUSH_MS);
    }
  }

  async function flushAhora() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (bufferMsg.length === 0 && bufferTrack.length === 0) return;
    const msgs = bufferMsg.splice(0);
    const track = bufferTrack.splice(0);
    try {
      const db = await abrirDb();
      const stores = [];
      if (msgs.length) stores.push('mensajes');
      if (track.length) stores.push('track');
      if (stores.length === 0) return;
      const t = tx(db, stores, 'readwrite');
      if (msgs.length) {
        const s = t.objectStore('mensajes');
        for (const m of msgs) s.add(m);
      }
      if (track.length) {
        const s = t.objectStore('track');
        for (const p of track) s.add(p);
      }
      await esperarTx(t);
    } catch (e) {
      // silencioso: si IDB falla, perdemos este chunk pero el panel sigue ok
    }
  }

  // --- Lectura y borrado ---

  async function listar() {
    try {
      const db = await abrirDb();
      const trayectos = await new Promise((resolve, reject) => {
        const t = tx(db, ['trayectos'], 'readonly');
        const req = t.objectStore('trayectos').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      const resultados = [];
      for (const tr of trayectos) {
        const [nMensajes, nTrack] = await Promise.all([
          contarPorIndice('mensajes', tr.id),
          contarPorIndice('track', tr.id),
        ]);
        resultados.push({ ...tr, nMensajes, nTrack });
      }
      return resultados.sort((a, b) => b.id - a.id);
    } catch (e) {
      return [];
    }
  }

  function contarPorIndice(store, trayectoId) {
    return abrirDb().then(db => new Promise((resolve, reject) => {
      const t = tx(db, [store], 'readonly');
      const req = t.objectStore(store).index('trayectoId').count(trayectoId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  async function leer(id) {
    try {
      const db = await abrirDb();
      const trayecto = await new Promise((resolve, reject) => {
        const t = tx(db, ['trayectos'], 'readonly');
        const req = t.objectStore('trayectos').get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!trayecto) return null;
      const mensajes = await leerPorIndice('mensajes', id);
      const track = await leerPorIndice('track', id);
      return { ...trayecto, mensajes, track };
    } catch (e) {
      return null;
    }
  }

  function leerPorIndice(store, trayectoId) {
    return abrirDb().then(db => new Promise((resolve, reject) => {
      const t = tx(db, [store], 'readonly');
      const req = t.objectStore(store).index('trayectoId').getAll(trayectoId);
      req.onsuccess = () => {
        const arr = req.result || [];
        arr.sort((a, b) => a.ts - b.ts);
        resolve(arr);
      };
      req.onerror = () => reject(req.error);
    }));
  }

  async function borrar(id) {
    return borrarInterno(id);
  }

  async function borrarInterno(id) {
    const db = await abrirDb();
    // Borrar por índice en mensajes y track, y luego el meta de trayectos.
    await new Promise((resolve, reject) => {
      const t = tx(db, ['mensajes', 'track', 'trayectos'], 'readwrite');
      borrarPorIndiceEnTx(t, 'mensajes', id);
      borrarPorIndiceEnTx(t, 'track', id);
      t.objectStore('trayectos').delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('tx abortada'));
    });
  }

  function borrarPorIndiceEnTx(t, storeName, trayectoId) {
    const store = t.objectStore(storeName);
    const idx = store.index('trayectoId');
    const req = idx.openKeyCursor(IDBKeyRange.only(trayectoId));
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        store.delete(cur.primaryKey);
        cur.continue();
      }
    };
  }

  async function borrarTodos() {
    try {
      const db = await abrirDb();
      const t = tx(db, ['mensajes', 'track', 'trayectos'], 'readwrite');
      t.objectStore('mensajes').clear();
      t.objectStore('track').clear();
      t.objectStore('trayectos').clear();
      await esperarTx(t);
      // Reset de estado para que el trayecto actual no quede huérfano:
      // el caller puede invocar iniciar() de nuevo.
      trayectoActualId = null;
    } catch (e) { /* silencioso */ }
  }

  // --- Exportador a texto (FN-02c) ---

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function formatearFechaISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function formatearHora(d) {
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function formatearDuracion(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return h + 'h ' + pad2(m) + 'm ' + pad2(sec) + 's';
    if (m) return m + 'm ' + pad2(sec) + 's';
    return sec + 's';
  }

  function etiquetaNivel(nivel) {
    if (nivel === 'warn') return '[WARN] ';
    if (nivel === 'error') return '[ERROR] ';
    return '';
  }

  async function exportarTxt(id) {
    const t = await leer(id);
    if (!t) return null;

    const inicio = new Date(t.id);
    const tsUltimo = t.mensajes.length
      ? t.mensajes[t.mensajes.length - 1].ts
      : (t.track.length ? t.track[t.track.length - 1].ts : t.id);
    const fin = new Date(tsUltimo);

    // Conteo por nivel.
    const conteo = { log: 0, warn: 0, error: 0 };
    for (const m of t.mensajes) {
      conteo[m.nivel] = (conteo[m.nivel] || 0) + 1;
    }

    // Distancia aproximada: suma de segmentos del track.
    let distM = 0;
    for (let i = 1; i < t.track.length; i++) {
      const p0 = t.track[i - 1], p1 = t.track[i];
      distM += distanciaMetros(p0.lat, p0.lon, p1.lat, p1.lon);
    }

    const posIni = t.track[0] || null;
    const posFin = t.track.length ? t.track[t.track.length - 1] : null;

    // Errores y avisos para la cabecera (primeros 5 de cada tipo).
    const erroresTodos = t.mensajes.filter(m => m.nivel === 'error');
    const warnsTodos = t.mensajes.filter(m => m.nivel === 'warn');

    // Cabecera.
    const lineasCab = [];
    lineasCab.push('=== Panel de viaje — trayecto ' + t.id + ' ===');
    lineasCab.push('Fecha inicio: ' + formatearFechaISO(inicio));
    lineasCab.push('Duración: ' + formatearDuracion(fin - inicio));
    lineasCab.push('Mensajes: ' + t.mensajes.length + ' (log=' + conteo.log + ', warn=' + conteo.warn + ', error=' + conteo.error + ')');
    lineasCab.push('Puntos de track: ' + t.track.length);
    lineasCab.push('Distancia aprox.: ' + (distM / 1000).toFixed(2) + ' km');
    if (posIni) lineasCab.push('Pos inicial: ' + posIni.lat.toFixed(5) + ', ' + posIni.lon.toFixed(5));
    if (posFin) lineasCab.push('Pos final:   ' + posFin.lat.toFixed(5) + ', ' + posFin.lon.toFixed(5));
    if (erroresTodos.length) {
      lineasCab.push('Errores (' + erroresTodos.length + '):');
      for (const e of erroresTodos.slice(0, 5)) {
        lineasCab.push('  - [' + formatearHora(new Date(e.ts)) + '] ' + e.texto);
      }
      if (erroresTodos.length > 5) {
        lineasCab.push('  ... (' + (erroresTodos.length - 5) + ' más en el log)');
      }
    }
    if (warnsTodos.length) {
      lineasCab.push('Avisos (' + warnsTodos.length + '):');
      for (const w of warnsTodos.slice(0, 3)) {
        lineasCab.push('  - [' + formatearHora(new Date(w.ts)) + '] ' + w.texto);
      }
      if (warnsTodos.length > 3) {
        lineasCab.push('  ... (' + (warnsTodos.length - 3) + ' más en el log)');
      }
    }
    if (t.userAgent) lineasCab.push('User-Agent: ' + t.userAgent);
    lineasCab.push('======================================');
    lineasCab.push('');

    // Cuerpo con compresión de repetidos consecutivos.
    const lineasLog = [];
    let i = 0;
    while (i < t.mensajes.length) {
      const cur = t.mensajes[i];
      let j = i + 1;
      while (j < t.mensajes.length
             && t.mensajes[j].texto === cur.texto
             && t.mensajes[j].nivel === cur.nivel) {
        j++;
      }
      const run = j - i;
      if (run >= 3) {
        const hIni = formatearHora(new Date(cur.ts));
        const hFin = formatearHora(new Date(t.mensajes[j - 1].ts));
        lineasLog.push('[' + hIni + '–' + hFin + '] ' + etiquetaNivel(cur.nivel) + cur.texto + ' (×' + run + ')');
      } else {
        for (let k = i; k < j; k++) {
          const m = t.mensajes[k];
          lineasLog.push('[' + formatearHora(new Date(m.ts)) + '] ' + etiquetaNivel(m.nivel) + m.texto);
        }
      }
      i = j;
    }

    return lineasCab.join('\n') + lineasLog.join('\n');
  }

  // --- Flush oportunista al esconderse o cerrar la pestaña ---

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushAhora();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { flushAhora(); });
  }

  __global__.Trayectos = {
    iniciar,
    log,
    agregarTrack,
    listar,
    leer,
    borrar,
    borrarTodos,
    exportarTxt,
    _flushAhora: flushAhora,
  };
})();
