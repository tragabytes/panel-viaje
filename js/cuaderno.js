// cuaderno.js — Marcar "este momento" sin mirar (specs/001-cuaderno-de-viaje, H1).
//
// Lo que ves no está donde estás: marcar no guarda "el pueblo en el que
// estoy" sino el momento (hora, posición, sentido, velocidad). Qué era se
// decide después, con calma.
//
// Las marcas son de Laureano (CLAUDE.md, regla 9): viven en su propia base de
// datos, que ningún otro módulo abre, rota ni limpia. Cachés y logs se pueden
// volver a bajar; una marca perdida no vuelve. Lo vigila tests/cuaderno.test.mjs.
//
// API pública (Cuaderno):
//   Cuaderno.marcar(pos)    → Promise<{ guardada, duplicada, marca, error? }>
//       pos = { lat, lon, precision, rumbo, velocidadKmh, ts }, o null sin GPS.
//   Cuaderno.listar()       → Promise<Array<marca>> por orden de hora
//   Cuaderno.construirMarca(pos, ahora, ultimaMarcaTs) → marca | null (pura)
//   Cuaderno.crearDetectorToqueLargo(alMarcar) → { down, move, up } (puro)

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const DB_NAME = 'panel-viaje-cuaderno';
  const DB_VERSION = 1;
  const STORE = 'marcas';

  // Criterio 4 de H1: un doble toque nervioso es una sola marca.
  const DEDUPE_MS = 10000;
  // Posición de hace más de esto (túnel, GPS perdido): la marca es aproximada.
  const POS_VIEJA_MS = 30000;
  // Por debajo de esto el rumbo del GPS no significa nada (semáforo).
  const VEL_PARADO_KMH = 3;

  // El gesto: 1 s quieto. Más de TOLERANCIA_PX de movimiento es un
  // deslizamiento entre vistas, no un toque largo (R-005).
  const TOQUE_LARGO_MS = 1000;
  const TOLERANCIA_PX = 10;

  // --- La marca (pura) ---

  function construirMarca(pos, ahora, ultimaMarcaTs) {
    if (ultimaMarcaTs != null && ahora - ultimaMarcaTs < DEDUPE_MS) return null;
    const hayPos = !!pos && pos.lat != null && pos.lon != null;
    const enMarcha = hayPos && pos.velocidadKmh != null && pos.velocidadKmh >= VEL_PARADO_KMH;
    return {
      id: ahora,
      lat: hayPos ? pos.lat : null,
      lon: hayPos ? pos.lon : null,
      precisionM: hayPos && pos.precision != null ? pos.precision : null,
      rumbo: enMarcha && pos.rumbo != null ? pos.rumbo : null,
      velocidadKmh: hayPos && pos.velocidadKmh != null ? pos.velocidadKmh : null,
      posicionTs: hayPos ? pos.ts : null,
      aproximada: !hayPos || ahora - pos.ts > POS_VIEJA_MS,
    };
  }

  // --- El gesto (puro: recibe los eventos ya traducidos) ---
  //
  // down(id, x, y, esPrimario) · move(id, x, y) · up(id) — up sirve también
  // para pointercancel, que llega cuando el navegador empieza a desplazar.
  // Marca al cumplirse el segundo, sin esperar a que se suelte el dedo.

  function crearDetectorToqueLargo(alMarcar) {
    let activo = null; // { id, x, y, timer }

    function cancelar() {
      if (!activo) return;
      clearTimeout(activo.timer);
      activo = null;
    }

    return {
      down(id, x, y, esPrimario) {
        cancelar();
        if (!esPrimario) return; // segundo dedo: no es un toque largo
        activo = {
          id, x, y,
          timer: setTimeout(() => { activo = null; alMarcar(); }, TOQUE_LARGO_MS),
        };
      },
      move(id, x, y) {
        if (!activo || activo.id !== id) return;
        if (Math.hypot(x - activo.x, y - activo.y) > TOLERANCIA_PX) cancelar();
      },
      up(id) {
        if (activo && activo.id === id) cancelar();
      },
    };
  }

  // --- Guardado ---

  let dbPromise = null;
  let ultimaMarcaTs = null;

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
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open falló'));
    });
    // Si falla, que el siguiente intento vuelva a probar en vez de heredar el error.
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function guardar(db, marca) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(marca);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('no se pudo guardar'));
      t.onabort = () => reject(t.error || new Error('guardado abortado'));
    });
  }

  // Sin esto, Chrome puede borrar los datos del sitio si el móvil anda justo de
  // espacio. persist() no pregunta nada: Chrome decide según el uso.
  let persistenciaPedida = false;
  function pedirPersistencia() {
    if (persistenciaPedida) return;
    persistenciaPedida = true;
    const s = (typeof navigator !== 'undefined') ? navigator.storage : null;
    if (!s || !s.persist) return;
    s.persisted()
      .then((ya) => ya || s.persist())
      .then((ok) => {
        if (typeof debug !== 'undefined') debug.log(`Cuaderno: almacenamiento persistente ${ok ? 'concedido' : 'denegado'}`);
      })
      .catch(() => {});
  }

  async function marcar(pos) {
    const ahora = Date.now();
    const marca = construirMarca(pos, ahora, ultimaMarcaTs);
    if (!marca) return { guardada: true, duplicada: true, marca: null };
    ultimaMarcaTs = ahora;
    try {
      const db = await abrirDb();
      await guardar(db, marca);
      pedirPersistencia();
      return { guardada: true, duplicada: false, marca };
    } catch (err) {
      // Que el siguiente intento no se tome por un duplicado de esta.
      ultimaMarcaTs = null;
      return { guardada: false, duplicada: false, marca, error: err && err.message ? err.message : String(err) };
    }
  }

  async function listar() {
    const db = await abrirDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  __global__.Cuaderno = {
    marcar,
    listar,
    construirMarca,
    crearDetectorToqueLargo,
    DB_NAME,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Cuaderno;
  }
})();
