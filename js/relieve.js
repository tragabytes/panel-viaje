// relieve.js — El relieve de España, sombreado y con curvas de nivel (specs/002-radar-relieve).
//
// Fuente: Terrain Tiles de AWS, formato "terrarium": gratis, sin clave y con
// CORS (Access-Control-Allow-Origin: *). Probadas con llamadas reales el 30/09
// y el 18/10/2026: ~135 KB por tesela, ~0,5 s. Cada píxel codifica la altura:
// metros = R·256 + G + B/256 − 32768. El mar trae profundidades (negativas).
// A zoom 10 una tesela cubre ~30 km con píxeles de ~120 m: lo justo para un
// radar de 15 km sin bajar de más.
//
// Caché (CLAUDE.md, regla 2): las teselas en bruto se guardan en su propia base
// de datos SIN caducidad — el relieve no cambia (los datos son de 2017) — con un
// tope de MAX_TESELAS_IDB (~40 MB): al pasarlo se borran las que hace más que no
// se usan. Así la zona ya recorrida no vuelve a gastar datos. Un fallo de red
// no se guarda nunca (regla 4): solo PNG que se han podido decodificar, y tras
// un fallo esa tesela no se reintenta hasta pasado REINTENTO_MS.
//
// API pública (Relieve):
//   Relieve.componer({ lat, lon, radioKm, pxPorKm, zoom?, red?, circulo? })
//       → Promise<{ canvas, lat, lon, radioKm, pxPorKm, faltan }>
//       Lienzo cuadrado, norte arriba, centrado en (lat, lon). red:false = solo
//       lo que ya esté guardado (no gasta datos). circulo:true = solo las teselas
//       que tocan el círculo de radioKm (para el radar, que es un disco).
//   Relieve.altitud(lat, lon) → metros | null   (si la tesela está en memoria)
//   Puras (probadas en Node): pixelGlobal, metrosPorPixel, zoomPara,
//       teselasParaVentana, decodificarTerrarium, sombrear, colorRelieve

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const URL_TESELA = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
  const TAM = 256;
  const ZOOM_RADAR = 10;
  const CIRCUNFERENCIA_M = 40075016.686;

  const DB_NAME = 'panel-viaje-relieve';
  const DB_VERSION = 1;
  const STORE = 'teselas';
  // ~135 KB cada una: 300 ≈ 40 MB. Media España recorrida cabe de sobra.
  const MAX_TESELAS_IDB = 300;
  // En memoria: las procesadas (alturas + dibujo), para no recalcular.
  const MAX_TESELAS_MEMORIA = 16;
  const TIMEOUT_MS = 15000;
  // Descargas a la vez como mucho: con 4-6 en paralelo en una conexión lenta,
  // el plazo de cada una corría mientras esperaba a las otras y fallaban todas.
  const MAX_DESCARGAS = 2;
  // Tras un fallo (sin cobertura), no reintentar esa tesela hasta pasado esto.
  const REINTENTO_MS = 60000;

  // Estilo: fondo casi negro verdoso, laderas iluminadas desde el noroeste,
  // curvas cada 100 m (maestras cada 500 m) en fósforo, mar azul muy oscuro.
  const ESTILO = {
    fondo: [6, 14, 10],
    sombra: [3, 8, 6],
    luz: [38, 64, 48],
    mar: [3, 12, 20],
    costa: [61, 200, 160],
    curva: [61, 255, 110],
    alfaCurva: 0.10,
    alfaMaestra: 0.24,
    alfaCosta: 0.45,
    equidistancia: 100,
    maestra: 500,
    exageracion: 2.2,
  };

  // --- Geometría (pura) ---

  // Píxel global en la proyección de las teselas (Web Mercator) a un zoom.
  function pixelGlobal(lat, lon, zoom) {
    const n = Math.pow(2, zoom) * TAM;
    const latRad = lat * Math.PI / 180;
    return {
      x: (lon + 180) / 360 * n,
      y: (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n,
    };
  }

  function metrosPorPixel(lat, zoom) {
    return CIRCUNFERENCIA_M * Math.cos(lat * Math.PI / 180) / (Math.pow(2, zoom) * TAM);
  }

  // El zoom cuya resolución se acerca más a la del dibujo (sin pasar de 12:
  // los datos de origen no tienen más detalle en España).
  function zoomPara(lat, pxPorKm) {
    const mppObjetivo = 1000 / pxPorKm;
    const z = Math.round(Math.log2(CIRCUNFERENCIA_M * Math.cos(lat * Math.PI / 180) / (TAM * mppObjetivo)));
    return Math.max(8, Math.min(12, z));
  }

  // Qué teselas cubren un cuadrado de lado 2·radioKm centrado en (lat, lon),
  // o solo el círculo de ese radio si `circulo` (el radar es un disco: las
  // teselas de las esquinas no se verían nunca).
  function teselasParaVentana(lat, lon, radioKm, zoom, circulo) {
    const c = pixelGlobal(lat, lon, zoom);
    const medio = radioKm * 1000 / metrosPorPixel(lat, zoom);
    const max = Math.pow(2, zoom) - 1;
    const x0 = Math.max(0, Math.floor((c.x - medio) / TAM));
    const x1 = Math.min(max, Math.floor((c.x + medio) / TAM));
    const y0 = Math.max(0, Math.floor((c.y - medio) / TAM));
    const y1 = Math.min(max, Math.floor((c.y + medio) / TAM));
    const lista = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (circulo) {
          // Punto de la tesela más cercano al centro: ¿cae dentro del círculo?
          const px = Math.max(x * TAM, Math.min(c.x, (x + 1) * TAM));
          const py = Math.max(y * TAM, Math.min(c.y, (y + 1) * TAM));
          if (Math.hypot(px - c.x, py - c.y) > medio) continue;
        }
        lista.push({ z: zoom, x, y });
      }
    }
    return lista;
  }

  // --- Píxeles (pura) ---

  function decodificarTerrarium(rgba, ancho, alto) {
    const n = ancho * alto;
    const alturas = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      alturas[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768;
    }
    return alturas;
  }

  function mezclar(a, b, t) {
    return a + (b - a) * t;
  }

  // Color de un píxel de tierra según su iluminación (0..1) y su altura.
  function colorRelieve(luz, altura) {
    const realce = Math.max(0, Math.min(1, altura / 2500)) * 0.25;
    const t = Math.max(0, Math.min(1, luz + realce));
    return [
      mezclar(ESTILO.sombra[0], ESTILO.luz[0], t),
      mezclar(ESTILO.sombra[1], ESTILO.luz[1], t),
      mezclar(ESTILO.sombra[2], ESTILO.luz[2], t),
    ];
  }

  // Sombreado de Horn con luz del noroeste (315°, 45° de altura) + curvas de
  // nivel + línea de costa. Devuelve RGBA opaco. mpp: metros por píxel.
  function sombrear(alturas, ancho, alto, mpp) {
    const out = new Uint8ClampedArray(ancho * alto * 4);
    const cenit = 45 * Math.PI / 180;
    const azimut = (360 - 315 + 90) * Math.PI / 180; // a convención matemática
    const cosC = Math.cos(cenit);
    const sinC = Math.sin(cenit);
    const k = ESTILO.exageracion / (8 * mpp);
    const eq = ESTILO.equidistancia;
    const ma = ESTILO.maestra;
    const dentro = (x, y) => alturas[y * ancho + x];
    const at = (x, y) => {
      let xx = x, yy = y, fx = 0, fy = 0;
      if (x < 0) { xx = 0; fx = 1; } else if (x >= ancho) { xx = ancho - 1; fx = -1; }
      if (y < 0) { yy = 0; fy = 1; } else if (y >= alto) { yy = alto - 1; fy = -1; }
      let v = dentro(xx, yy);
      if (fx && ancho > 1) v = 2 * v - dentro(xx + fx, yy);
      if (fy && alto > 1) v = 2 * v - dentro(xx, yy + fy);
      return v;
    };
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const i = y * ancho + x;
        const p = i * 4;
        const e = alturas[i];
        const der = at(x + 1, y);
        const aba = at(x, y + 1);
        let r, g, b;
        if (e <= 0) {
          [r, g, b] = ESTILO.mar;
          // Costa: mar que toca tierra a la derecha o abajo.
          if (der > 0 || aba > 0) {
            const a = ESTILO.alfaCosta;
            r = mezclar(r, ESTILO.costa[0], a);
            g = mezclar(g, ESTILO.costa[1], a);
            b = mezclar(b, ESTILO.costa[2], a);
          }
        } else {
          const a1 = at(x - 1, y - 1), a2 = at(x, y - 1), a3 = at(x + 1, y - 1);
          const b1 = at(x - 1, y), b3 = der;
          const c1 = at(x - 1, y + 1), c2 = aba, c3 = at(x + 1, y + 1);
          const dzdx = ((a3 + 2 * b3 + c3) - (a1 + 2 * b1 + c1)) * k;
          const dzdy = ((c1 + 2 * c2 + c3) - (a1 + 2 * a2 + a3)) * k;
          const pendiente = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
          const orientacion = Math.atan2(dzdy, -dzdx);
          let luz = cosC * Math.cos(pendiente) + sinC * Math.sin(pendiente) * Math.cos(azimut - orientacion);
          luz = Math.max(0, Math.min(1, luz));
          // El llano queda a media luz (cos 45° ≈ 0,71): se reescala para que
          // el llano sea oscuro y solo las laderas al noroeste se iluminen.
          luz = Math.max(0, Math.min(1, (luz - 0.65) / 0.35));
          [r, g, b] = colorRelieve(luz, e);
          // Curva de nivel donde cambia el escalón con el vecino.
          const esc = Math.floor(e / eq);
          if (esc !== Math.floor(der / eq) || esc !== Math.floor(aba / eq)) {
            const maestra = Math.floor(e / ma) !== Math.floor(der / ma) || Math.floor(e / ma) !== Math.floor(aba / ma);
            const a = maestra ? ESTILO.alfaMaestra : ESTILO.alfaCurva;
            r = mezclar(r, ESTILO.curva[0], a);
            g = mezclar(g, ESTILO.curva[1], a);
            b = mezclar(b, ESTILO.curva[2], a);
          }
        }
        out[p] = r;
        out[p + 1] = g;
        out[p + 2] = b;
        out[p + 3] = 255;
      }
    }
    return out;
  }

  // --- Guardado de teselas en bruto ---

  let dbPromise = null;

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
          const s = db.createObjectStore(STORE, { keyPath: 'clave' });
          s.createIndex('usado', 'usado');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open falló'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function leerIdb(clave) {
    return abrirDb().then((db) => new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(clave);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    })).catch(() => null);
  }

  // Guarda y, si se pasa del tope, borra las que hace más que no se usan.
  function guardarIdb(clave, png) {
    return abrirDb().then((db) => new Promise((resolve) => {
      const t = db.transaction(STORE, 'readwrite');
      const s = t.objectStore(STORE);
      s.put({ clave, png, usado: Date.now() });
      const req = s.index('usado').getAllKeys();
      req.onsuccess = () => {
        const claves = req.result || [];
        for (let i = 0; i < claves.length - MAX_TESELAS_IDB; i++) s.delete(claves[i]);
      };
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    })).catch(() => {});
  }

  // Apunta que se ha usado (una vez por sesión basta para el criterio de borrado).
  const usadasEnSesion = new Set();
  function tocarIdb(registro) {
    if (usadasEnSesion.has(registro.clave)) return;
    usadasEnSesion.add(registro.clave);
    abrirDb().then((db) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put({ clave: registro.clave, png: registro.png, usado: Date.now() });
    }).catch(() => {});
  }

  // --- Red ---

  const fallos = new Map();     // clave → ts del último fallo
  const enCurso = new Map();    // clave → Promise<Blob|null>
  let descargando = 0;
  const esperando = [];

  async function turnoDescarga() {
    if (descargando < MAX_DESCARGAS) { descargando++; return; }
    await new Promise((resolve) => esperando.push(resolve));
  }

  function soltarDescarga() {
    const siguiente = esperando.shift();
    if (siguiente) siguiente(); else descargando--;
  }

  function bajarPng(t) {
    const clave = `${t.z}/${t.x}/${t.y}`;
    if (enCurso.has(clave)) return enCurso.get(clave);
    const p = (async () => {
      await turnoDescarga();
      try {
        return await descargar(clave);
      } finally {
        soltarDescarga();
      }
    })();
    enCurso.set(clave, p);
    p.finally(() => enCurso.delete(clave)).catch(() => {});
    return p;
  }

  function descargar(clave) {
    return (async () => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const resp = await fetch(`${URL_TESELA}/${clave}.png`, { mode: 'cors', signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.blob();
      } finally {
        clearTimeout(id);
      }
    })();
  }

  function borrarIdb(clave) {
    abrirDb().then((db) => {
      db.transaction(STORE, 'readwrite').objectStore(STORE).delete(clave);
    }).catch(() => {});
  }

  // --- Decodificar y procesar ---

  async function blobAPixeles(blob) {
    // Sin gestión de color ni premultiplicar: los bytes SON la altura.
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return ctx.getImageData(0, 0, c.width, c.height);
  }

  function procesar(t, imagen) {
    const alturas = decodificarTerrarium(imagen.data, imagen.width, imagen.height);
    // Latitud del centro de la tesela para los metros por píxel.
    const n = Math.pow(2, t.z);
    const latCentro = Math.atan(Math.sinh(Math.PI * (1 - 2 * (t.y + 0.5) / n))) * 180 / Math.PI;
    const rgba = sombrear(alturas, imagen.width, imagen.height, metrosPorPixel(latCentro, t.z));
    const canvas = document.createElement('canvas');
    canvas.width = imagen.width;
    canvas.height = imagen.height;
    canvas.getContext('2d').putImageData(new ImageData(rgba, imagen.width, imagen.height), 0, 0);
    return { alturas, canvas, ancho: imagen.width, alto: imagen.height };
  }

  const memoria = new Map(); // clave → procesada (orden de inserción = LRU)

  function recordar(clave, procesada) {
    memoria.delete(clave);
    memoria.set(clave, procesada);
    while (memoria.size > MAX_TESELAS_MEMORIA) {
      memoria.delete(memoria.keys().next().value);
    }
  }

  async function obtenerTesela(t, red) {
    const clave = `${t.z}/${t.x}/${t.y}`;
    if (memoria.has(clave)) {
      const m = memoria.get(clave);
      recordar(clave, m);
      return m;
    }
    let blob = null;
    let registro = await leerIdb(clave);
    if (registro && registro.png) {
      blob = registro.png;
      try {
        const procesada = procesar(t, await blobAPixeles(blob));
        recordar(clave, procesada);
        tocarIdb(registro);
        return procesada;
      } catch (err) {
        // Guardada pero ilegible (corrupta): fuera, y se baja de nuevo.
        if (typeof debug !== 'undefined') debug.warn(`Relieve ${clave}: guardada pero ilegible, se vuelve a bajar`);
        borrarIdb(clave);
        registro = null;
        blob = null;
      }
    }
    if (!blob) {
      if (!red) return null;
      const ultimoFallo = fallos.get(clave);
      if (ultimoFallo && Date.now() - ultimoFallo < REINTENTO_MS) return null;
      try {
        blob = await bajarPng(t);
      } catch (err) {
        fallos.set(clave, Date.now());
        if (typeof debug !== 'undefined') debug.log(`Relieve ${clave}: sin bajar (${err.message})`);
        return null;
      }
    }
    try {
      const procesada = procesar(t, await blobAPixeles(blob));
      recordar(clave, procesada);
      // Solo se guarda lo que se ha podido decodificar (regla 4).
      if (!registro) {
        guardarIdb(clave, blob);
        if (typeof debug !== 'undefined') debug.log(`Relieve ${clave}: bajada y guardada (${Math.round(blob.size / 1024)} KB)`);
      }
      return procesada;
    } catch (err) {
      fallos.set(clave, Date.now());
      if (typeof debug !== 'undefined') debug.warn(`Relieve ${clave}: no se pudo leer (${err.message})`);
      return null;
    }
  }

  // Regla 4: un hueco sin relieve se ve como tal (un rayado tenue), no como
  // una llanura, que es lo que parecería con el fondo liso.
  function rayarHueco(ctx, x, y, lado) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, lado, lado);
    ctx.clip();
    ctx.strokeStyle = 'rgba(61, 255, 110, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = -lado; d < lado; d += 7) {
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d + lado, y + lado);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --- API ---

  async function componer(op) {
    const lat = op.lat, lon = op.lon, radioKm = op.radioKm, pxPorKm = op.pxPorKm;
    const zoom = op.zoom || ZOOM_RADAR;
    const red = op.red !== false;
    const teselas = teselasParaVentana(lat, lon, radioKm, zoom, !!op.circulo);
    const procesadas = await Promise.all(teselas.map((t) => obtenerTesela(t, red)));
    const lado = Math.ceil(2 * radioKm * pxPorKm);
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgb(${ESTILO.fondo.join(',')})`;
    ctx.fillRect(0, 0, lado, lado);
    ctx.imageSmoothingEnabled = true;
    const c = pixelGlobal(lat, lon, zoom);
    const escala = pxPorKm * metrosPorPixel(lat, zoom) / 1000; // px del lienzo por px de tesela
    let faltan = 0;
    teselas.forEach((t, i) => {
      const p = procesadas[i];
      if (!p) {
        faltan++;
        rayarHueco(ctx, (t.x * TAM - c.x) * escala + lado / 2, (t.y * TAM - c.y) * escala + lado / 2, TAM * escala);
        return;
      }
      ctx.drawImage(p.canvas,
        (t.x * TAM - c.x) * escala + lado / 2,
        (t.y * TAM - c.y) * escala + lado / 2,
        TAM * escala + 0.5, TAM * escala + 0.5);
    });
    return { canvas, lat, lon, radioKm, pxPorKm, faltan };
  }

  // Con la tesela más detallada que haya en memoria: en ciudad el radar usa
  // z11 y puede no tener la z10 (salía "—").
  function altitud(lat, lon) {
    for (const z of [12, 11, ZOOM_RADAR]) {
      const g = pixelGlobal(lat, lon, z);
      const tx = Math.floor(g.x / TAM);
      const ty = Math.floor(g.y / TAM);
      const m = memoria.get(`${z}/${tx}/${ty}`);
      if (!m) continue;
      const px = Math.min(m.ancho - 1, Math.max(0, Math.floor(g.x - tx * TAM)));
      const py = Math.min(m.alto - 1, Math.max(0, Math.floor(g.y - ty * TAM)));
      const e = m.alturas[py * m.ancho + px];
      return e > 0 ? Math.round(e) : null;
    }
    return null;
  }

  __global__.Relieve = {
    componer,
    altitud,
    _recordar: recordar, // para los tests
    pixelGlobal,
    metrosPorPixel,
    zoomPara,
    teselasParaVentana,
    decodificarTerrarium,
    sombrear,
    colorRelieve,
    DB_NAME,
    HOST: 's3.amazonaws.com',
    RUTA: '/elevation-tiles-prod/',
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Relieve;
  }
})();
