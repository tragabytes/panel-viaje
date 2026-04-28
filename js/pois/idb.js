// js/pois/idb.js — DT-10 (sesión 33)
//
// Wrapper de IndexedDB para la caché persistente de POIs (RA-03).
// Expone window.POIIdb con:
//   POIIdb.leer(key) → Promise<any|null>
//   POIIdb.guardar(key, datos) → void (fire-and-forget)
//
// TTL 14 días para toda entrada. Si IndexedDB no está disponible o falla,
// todas las operaciones quedan en no-op silencioso.

(function () {
  'use strict';

  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const IDB_NOMBRE = 'panel-viaje-cache';
  const IDB_STORE = 'pois';
  // v2 (BPC-16): bump para purgar entradas pueblos:* contaminadas por el
  // fallback Wikipedia geosearch antes de ampliar EXCLUIR_PUEBLOS_GEOSEARCH.
  // Sin este bump, las entradas de IDB sobrevivirían 14 días y seguirían
  // mostrando palacios/conventos/ayuntamientos como pueblos.
  const IDB_VERSION = 2;
  const TTL_CACHE_IDB_MS = 14 * 24 * 60 * 60 * 1000;

  let dbPromise = null;
  let idbDisponible = true;

  function abrir() {
    if (!idbDisponible) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_NOMBRE, IDB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
          // BPC-16: migración v1→v2. Borra todas las entradas pueblos:*
          // porque el fallback Wikipedia geosearch antiguo persistió como
          // pueblos cosas que no lo son (palacios, conventos, ayuntamientos,
          // observatorios). Las entradas pois:* sobre esos fake-pueblos
          // quedan huérfanas y expirarán solas por TTL (14 días).
          if (e.oldVersion < 2) {
            try {
              const tx = e.target.transaction;
              const store = tx.objectStore(IDB_STORE);
              const cursorReq = store.openCursor();
              let borradas = 0;
              cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (!cursor) {
                  if (typeof debug !== 'undefined' && borradas > 0) {
                    debug.log(`IDB v1→v2 (BPC-16): ${borradas} entradas pueblos:* purgadas`);
                  }
                  return;
                }
                if (typeof cursor.key === 'string' && cursor.key.startsWith('pueblos:')) {
                  cursor.delete();
                  borradas++;
                }
                cursor.continue();
              };
            } catch (_) { /* silencioso: la app sigue funcionando con caché parcial */ }
          }
        };
        req.onsuccess = () => {
          if (typeof debug !== 'undefined') debug.log('IDB: abierta OK');
          // Limpieza best-effort de entradas expiradas, sin bloquear
          setTimeout(() => limpiarExpiradas(req.result), 5000);
          resolve(req.result);
        };
        req.onerror = () => {
          if (typeof debug !== 'undefined') debug.warn('IDB: fallo al abrir');
          idbDisponible = false;
          resolve(null);
        };
      } catch (e) {
        idbDisponible = false;
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function leer(key) {
    try {
      const db = await abrir();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => {
          const entry = req.result;
          if (!entry || !entry.ts) { resolve(null); return; }
          if (Date.now() - entry.ts > TTL_CACHE_IDB_MS) { resolve(null); return; }
          resolve(entry.datos);
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }

  async function guardar(key, datos) {
    try {
      const db = await abrir();
      if (!db) return;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ datos, ts: Date.now() }, key);
    } catch (e) { /* silencioso */ }
  }

  function limpiarExpiradas(db) {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      let borradas = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          if (borradas > 0 && typeof debug !== 'undefined') {
            debug.log(`IDB: limpieza — ${borradas} entradas expiradas borradas`);
          }
          return;
        }
        const entry = cursor.value;
        if (entry && entry.ts && Date.now() - entry.ts > TTL_CACHE_IDB_MS) {
          cursor.delete();
          borradas++;
        }
        cursor.continue();
      };
    } catch (e) { /* silencioso */ }
  }

  __global__.POIIdb = {
    leer,
    guardar,
    TTL_MS: TTL_CACHE_IDB_MS,
  };
})();
