// cuaderno.js — El cuaderno de viaje: marcar, guardar y revisar (specs/001-cuaderno-de-viaje).
//
// Lo que ves no está donde estás: marcar no guarda "el pueblo en el que
// estoy" sino el momento (hora, posición, sentido, velocidad) y lo que el
// panel ya sabía alrededor (H2). Qué era se decide después, con calma (H3).
//
// Las marcas son de Laureano (CLAUDE.md, regla 9): viven en su propia base de
// datos, que ningún otro módulo abre, rota ni limpia. Cachés y logs se pueden
// volver a bajar; una marca perdida no vuelve. Lo vigila tests/cuaderno.test.mjs.
// Por eso aquí solo hay borrado de UNA marca, y solo porque Laureano lo pide
// desde el cuaderno (R-006); importar solo añade, nunca pisa ni quita.
//
// API pública (Cuaderno):
//   Guardado
//     Cuaderno.marcar(pos, contexto?) → Promise<{ guardada, duplicada, marca, error? }>
//         pos = { lat, lon, precision, rumbo, velocidadKmh, ts }, o null sin GPS.
//     Cuaderno.listar()               → Promise<Array<marca>> por orden de hora
//     Cuaderno.actualizar(id, fn)     → Promise<marca|null>  fn(marca) → marca nueva
//     Cuaderno.borrar(id)             → Promise<void>        una sola marca
//     Cuaderno.importar(texto|objeto) → Promise<number>      cuántas añadió
//     Cuaderno.exportar()             → Promise<objeto>      copia de seguridad
//   Puras (probadas en Node)
//     construirMarca, construirContexto, necesitaCompletar, completarContexto,
//     aplicarRevision, candidatos, agruparPorViaje, fusionarImportacion,
//     leerCopia, textoParaCompartir, urlMapa, urlWikipedia,
//     crearDetectorToqueLargo

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const _Geo = (typeof Geo !== 'undefined') ? Geo : (typeof require !== 'undefined' ? require('./geo.js') : null);
  if (!_Geo) {
    throw new Error('cuaderno.js requiere que js/geo.js esté cargado antes');
  }

  const DB_NAME = 'panel-viaje-cuaderno';
  const DB_VERSION = 1;
  const STORE = 'marcas';
  const FORMATO_COPIA = 'panel-viaje-cuaderno';

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

  // H2: lo que se guarda de alrededor. El panel conoce 5 pueblos y 2 puntos de
  // interés por pueblo; los topes dejan margen sin que una marca pese más de
  // unos pocos KB.
  const MAX_PUEBLOS = 8;
  const MAX_POIS = 12;
  const MAX_SITIOS = 20;
  const MAX_CANDIDATOS = 24;
  const MAX_NOTA = 2000;
  // H3: marcas separadas más de esto son de viajes distintos.
  const HUECO_VIAJE_MS = 4 * 3600 * 1000;

  // --- Utilidades puras ---

  function redondear(n, decimales) {
    const f = Math.pow(10, decimales);
    return Math.round(n * f) / f;
  }

  function num(v) {
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }

  function hayPosicion(p) {
    return !!p && num(p.lat) !== null && num(p.lon) !== null;
  }

  // Distancia (km) y rumbo (°) desde `desde` hasta (lat, lon); null si falta algo.
  function medir(desde, lat, lon) {
    if (!hayPosicion(desde) || num(lat) === null || num(lon) === null) {
      return { distKm: null, rumbo: null };
    }
    return {
      distKm: redondear(_Geo.distanciaMetros(desde.lat, desde.lon, lat, lon) / 1000, 2),
      rumbo: Math.round(_Geo.rumboHacia(desde.lat, desde.lon, lat, lon)) % 360,
    };
  }

  function porDistancia(a, b) {
    if (a.distKm === null && b.distKm === null) return 0;
    if (a.distKm === null) return 1;
    if (b.distKm === null) return -1;
    return a.distKm - b.distKm;
  }

  function normalizarNombre(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // --- La marca (pura) ---

  function construirMarca(pos, ahora, ultimaMarcaTs) {
    if (ultimaMarcaTs != null && ahora - ultimaMarcaTs < DEDUPE_MS) return null;
    const hayPos = hayPosicion(pos);
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

  // --- H2: lo que había alrededor (pura) ---
  //
  // `f` es lo que el panel tiene pintado en el momento de marcar:
  //   { ubicacion: {municipio, provincia, ccaa}, ubicacionVieja,
  //     via: {codigo, textoCrudo}, viaVieja,
  //     pueblos: [{nombre, lat, lon, pois: [{nombre, tipo, lat, lon, foto}]}],
  //     meteo: (objeto de Weather) }
  // Las distancias y rumbos se calculan desde la posición de la marca, no desde
  // donde el panel hizo la consulta. Nada de esto pide nada a internet (R-003).

  function construirContexto(f, pos) {
    f = f || {};
    const u = f.ubicacion || null;
    const municipio = (u && u.municipio) || null;

    const via = f.via && (f.via.codigo || f.via.textoCrudo)
      ? { codigo: f.via.codigo || null, texto: f.via.textoCrudo || null }
      : null;

    const pueblos = (f.pueblos || [])
      .filter((p) => p && p.nombre)
      .map((p) => Object.assign(
        { nombre: p.nombre, lat: num(p.lat), lon: num(p.lon) },
        medir(pos, p.lat, p.lon)
      ))
      .sort(porDistancia)
      .slice(0, MAX_PUEBLOS);

    const pois = [];
    const vistos = new Set();
    for (const p of f.pueblos || []) {
      for (const q of (p && p.pois) || []) {
        if (!q || !q.nombre) continue;
        const clave = normalizarNombre(q.nombre) + '|' +
          (num(q.lat) !== null ? q.lat.toFixed(4) : '') + ',' +
          (num(q.lon) !== null ? q.lon.toFixed(4) : '');
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        pois.push(Object.assign(
          { nombre: q.nombre, tipo: q.tipo || null, lat: num(q.lat), lon: num(q.lon),
            pueblo: p.nombre || null, foto: q.foto || null },
          medir(pos, q.lat, q.lon)
        ));
      }
    }
    pois.sort(porDistancia);

    const m = f.meteo || null;
    const meteo = m ? {
      temperatura: num(m.temperatura),
      descripcion: m.descripcion || null,
      categoria: m.categoria || null,
      codigo: num(m.weatherCode),
      vientoKmh: num(m.vientoVelocidad),
      vientoDir: num(m.vientoDireccion),
      esDia: (typeof m.esDia === 'boolean') ? m.esDia : null,
      hora: m.hora || null,
    } : null;

    return {
      municipio,
      provincia: (u && u.provincia) || null,
      ccaa: (u && u.ccaa) || null,
      ubicacionVieja: !!f.ubicacionVieja,
      via,
      viaVieja: !!f.viaVieja,
      pueblos,
      pois: pois.slice(0, MAX_POIS),
      meteo,
      pendiente: !municipio || !!f.ubicacionVieja || pueblos.length === 0,
    };
  }

  // H2, criterio 2: sin datos al marcar, se completa después con red. Las
  // marcas de la primera versión (H1) no tienen contexto: también.
  function necesitaCompletar(marca) {
    if (!marca || !hayPosicion(marca)) return false;
    return !marca.contexto || !!marca.contexto.pendiente;
  }

  // Mezcla lo bajado en el cuaderno con lo que ya tenía la marca. `datos`:
  //   { ubicacion: {municipio, provincia, ccaa} | null,
  //     via: {codigo, textoCrudo} | null,
  //     pueblos: [{nombre, lat, lon}] | null,
  //     sitios: [{nombre, lat, lon, pageid}] | null }
  // Un null es "esa consulta falló": no borra nada de lo que hubiera (regla 4).
  // Lo que el panel vio en el momento manda sobre lo bajado después, salvo que
  // estuviera atenuado por viejo.
  function completarContexto(marca, datos, ahora) {
    const pos = hayPosicion(marca) ? marca : null;
    const previo = marca.contexto || construirContexto({}, pos);
    const c = Object.assign({}, previo);
    datos = datos || {};

    if (datos.ubicacion && datos.ubicacion.municipio && (!c.municipio || c.ubicacionVieja)) {
      c.municipio = datos.ubicacion.municipio;
      c.provincia = datos.ubicacion.provincia || null;
      c.ccaa = datos.ubicacion.ccaa || null;
      c.ubicacionVieja = false;
    }
    if (datos.via && (datos.via.codigo || datos.via.textoCrudo) && (!c.via || c.viaVieja)) {
      c.via = { codigo: datos.via.codigo || null, texto: datos.via.textoCrudo || null };
      c.viaVieja = false;
    }
    if (Array.isArray(datos.pueblos) && datos.pueblos.length && (!c.pueblos || !c.pueblos.length)) {
      c.pueblos = construirContexto({ pueblos: datos.pueblos }, pos).pueblos;
    }
    if (Array.isArray(datos.sitios)) {
      c.sitios = datos.sitios
        .filter((s) => s && s.nombre)
        .map((s) => Object.assign(
          { nombre: s.nombre, lat: num(s.lat), lon: num(s.lon), pageid: s.pageid || null },
          medir(pos, s.lat, s.lon)
        ))
        .sort(porDistancia)
        .slice(0, MAX_SITIOS);
    }
    c.pendiente = !c.municipio || !!c.ubicacionVieja || !c.pueblos || c.pueblos.length === 0;
    c.completado = ahora;
    return Object.assign({}, marca, { contexto: c });
  }

  // H3: "era esto" y la nota. No toca nada más de la marca.
  function aplicarRevision(marca, cambios, ahora) {
    const previa = marca.revision || { elegido: null, nota: '' };
    const r = Object.assign({}, previa);
    if (cambios && 'elegido' in cambios) {
      const e = cambios.elegido;
      r.elegido = e && e.nombre ? {
        nombre: String(e.nombre),
        lat: num(e.lat),
        lon: num(e.lon),
        tipo: e.tipo || null,
        pageid: e.pageid || null,
      } : null;
    }
    if (cambios && 'nota' in cambios) {
      r.nota = String(cambios.nota || '').trim().slice(0, MAX_NOTA);
    }
    r.editado = ahora;
    return Object.assign({}, marca, { revision: r });
  }

  // H3: qué pudo ser. Pueblos, puntos de interés y sitios de Wikipedia, sin
  // repetir, con su distancia, su rumbo y a qué lado quedaban según el sentido
  // de la marcha (también atrás: a 120 km/h, entre verlo y marcar pasan 100 m).
  function lado(rumboCandidato, rumboMarcha) {
    if (rumboCandidato == null || rumboMarcha == null) return null;
    const rel = ((rumboCandidato - rumboMarcha) % 360 + 360) % 360;
    if (rel < 45 || rel >= 315) return 'delante';
    if (rel < 135) return 'derecha';
    if (rel < 225) return 'detrás';
    return 'izquierda';
  }

  function candidatos(marca) {
    const c = marca.contexto || {};
    const pos = hayPosicion(marca) ? marca : null;
    const lista = [];
    const vistos = new Set();
    const meter = (item, tipo, fuente) => {
      const clave = normalizarNombre(item.nombre);
      if (!clave || vistos.has(clave)) return;
      vistos.add(clave);
      const medida = medir(pos, item.lat, item.lon);
      lista.push({
        nombre: item.nombre,
        lat: num(item.lat),
        lon: num(item.lon),
        tipo,
        fuente,
        pageid: item.pageid || null,
        foto: item.foto || null,
        distKm: medida.distKm,
        rumbo: medida.rumbo,
        lado: lado(medida.rumbo, marca.rumbo),
      });
    };
    for (const p of c.pueblos || []) meter(p, 'pueblo', 'panel');
    for (const q of c.pois || []) meter(q, q.tipo || 'sitio', 'panel');
    for (const s of c.sitios || []) meter(s, 'sitio', 'wikipedia');
    return lista.sort(porDistancia).slice(0, MAX_CANDIDATOS);
  }

  // H3: marcas por viaje. Más de 4 h sin marcar = otro viaje. Los viajes más
  // recientes primero; dentro de cada uno, en el orden en que se recorrió.
  function agruparPorViaje(marcas, huecoMs) {
    const hueco = huecoMs || HUECO_VIAJE_MS;
    const ordenadas = (marcas || []).slice().sort((a, b) => a.id - b.id);
    const viajes = [];
    let actual = null;
    for (const m of ordenadas) {
      if (!actual || m.id - actual.fin > hueco) {
        actual = { inicio: m.id, fin: m.id, marcas: [] };
        viajes.push(actual);
      }
      actual.marcas.push(m);
      actual.fin = m.id;
    }
    return viajes.reverse();
  }

  // --- Copia de seguridad (pura) ---

  function esMarcaValida(m) {
    return !!m && typeof m === 'object' && num(m.id) !== null &&
      (m.lat === null || num(m.lat) !== null) &&
      (m.lon === null || num(m.lon) !== null);
  }

  // Acepta la copia que genera exportar() o una lista suelta de marcas.
  function leerCopia(entrada) {
    let datos = entrada;
    if (typeof datos === 'string') datos = JSON.parse(datos);
    const lista = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.marcas) ? datos.marcas : null);
    if (!lista) throw new Error('El archivo no es una copia del cuaderno');
    return lista.filter(esMarcaValida);
  }

  // Solo añade las que no existen: una copia vieja nunca pisa una marca
  // revisada después ni resucita nada borrado a propósito... salvo que se
  // importe a sabiendas la copia que la contenía.
  function fusionarImportacion(locales, importadas) {
    const ids = new Set((locales || []).map((m) => m.id));
    const nuevas = [];
    for (const m of importadas || []) {
      if (!esMarcaValida(m) || ids.has(m.id)) continue;
      ids.add(m.id);
      nuevas.push(m);
    }
    return nuevas;
  }

  // --- Enlaces y texto para compartir (pura) ---

  function urlMapa(lat, lon) {
    if (num(lat) === null || num(lon) === null) return null;
    return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}`;
  }

  function urlWikipedia(item) {
    if (!item || !item.nombre) return null;
    if (item.pageid) return `https://es.wikipedia.org/?curid=${item.pageid}`;
    return `https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(item.nombre)}`;
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function textoParaCompartir(marcas) {
    const lineas = ['Cuaderno de viaje'];
    for (const m of (marcas || []).slice().sort((a, b) => a.id - b.id)) {
      const d = new Date(m.id);
      const partes = [`${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`];
      const c = m.contexto || {};
      const lugar = [c.municipio, c.via && (c.via.codigo || c.via.texto)].filter(Boolean).join(', ');
      if (lugar) partes.push(lugar);
      const e = m.revision && m.revision.elegido;
      if (e) partes.push('era: ' + e.nombre);
      if (m.revision && m.revision.nota) partes.push(m.revision.nota.replace(/\s+/g, ' '));
      const url = e && num(e.lat) !== null ? urlMapa(e.lat, e.lon) : urlMapa(m.lat, m.lon);
      lineas.push('• ' + partes.join(' · ') + (url ? '\n  ' + url : ''));
    }
    return lineas.join('\n');
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

  function esperarTx(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('transacción fallida'));
      t.onabort = () => reject(t.error || new Error('transacción abortada'));
    });
  }

  function guardar(db, marcas) {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const m of marcas) s.put(m);
    return esperarTx(t);
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

  async function marcar(pos, contexto) {
    const ahora = Date.now();
    const marca = construirMarca(pos, ahora, ultimaMarcaTs);
    if (!marca) return { guardada: true, duplicada: true, marca: null };
    if (contexto) marca.contexto = contexto;
    ultimaMarcaTs = ahora;
    try {
      const db = await abrirDb();
      await guardar(db, [marca]);
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

  // Lee y reescribe una marca en la misma transacción: si fn devuelve null, no
  // cambia nada. El id no se puede cambiar.
  async function actualizar(id, fn) {
    const db = await abrirDb();
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    let resultado = null;
    const req = s.get(id);
    req.onsuccess = () => {
      const actual = req.result;
      if (!actual) return;
      const nueva = fn(actual);
      if (!nueva) return;
      nueva.id = actual.id;
      s.put(nueva);
      resultado = nueva;
    };
    await esperarTx(t);
    return resultado;
  }

  async function borrar(id) {
    const db = await abrirDb();
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(id);
    await esperarTx(t);
  }

  async function importar(entrada) {
    const importadas = leerCopia(entrada);
    const nuevas = fusionarImportacion(await listar(), importadas);
    if (nuevas.length) {
      await guardar(await abrirDb(), nuevas);
      pedirPersistencia();
    }
    return nuevas.length;
  }

  async function exportar() {
    return {
      formato: FORMATO_COPIA,
      version: 1,
      exportado: new Date().toISOString(),
      marcas: await listar(),
    };
  }

  __global__.Cuaderno = {
    marcar,
    listar,
    actualizar,
    borrar,
    importar,
    exportar,
    construirMarca,
    construirContexto,
    necesitaCompletar,
    completarContexto,
    aplicarRevision,
    candidatos,
    lado,
    agruparPorViaje,
    leerCopia,
    fusionarImportacion,
    textoParaCompartir,
    urlMapa,
    urlWikipedia,
    crearDetectorToqueLargo,
    DB_NAME,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Cuaderno;
  }
})();
