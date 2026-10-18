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
//   Si IndexedDB falla al marcar, la marca va a un respaldo en localStorage y
//   pasa a la base de datos en cuanto se puede (listar() y cada marca lo intentan).
//   Puras (probadas en Node)
//     construirMarca, construirContexto, necesitaCompletar, completarContexto,
//     aplicarRevision, candidatos, agruparPorViaje, fusionarImportacion,
//     leerCopia, sanearMarca, textoParaCompartir, urlMapa, urlWikipedia,
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
  // Si el pueblo más cercano de los que el panel conocía está más lejos que
  // esto, la lista es de otro sitio (sin cobertura se quedan los de donde hubo
  // red): la marca se completará con los de verdad.
  const PUEBLO_LEJOS_KM = 8;
  // Mismo nombre a menos de esto = el mismo sitio (iglesias de Santa María
  // hay en cada pueblo: más lejos son sitios distintos).
  const MISMO_SITIO_KM = 0.5;
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
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  // --- La marca (pura) ---

  function construirMarca(pos, ahora, ultimaMarcaTs) {
    // Si el reloj del móvil se corrige hacia atrás, (ahora − última) sale
    // negativo: no es una marca repetida (si no, se perderían todas una hora).
    const desde = ultimaMarcaTs != null ? ahora - ultimaMarcaTs : null;
    if (desde != null && desde >= 0 && desde < DEDUPE_MS) return null;
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

    const pueblosViejos = !!f.ubicacionVieja ||
      (pueblos.length > 0 && pueblos[0].distKm !== null && pueblos[0].distKm > PUEBLO_LEJOS_KM);
    return {
      municipio,
      provincia: (u && u.provincia) || null,
      ccaa: (u && u.ccaa) || null,
      ubicacionVieja: !!f.ubicacionVieja,
      via,
      viaVieja: !!f.viaVieja,
      pueblos,
      pueblosViejos,
      pois: pois.slice(0, MAX_POIS),
      meteo,
      pendiente: !municipio || !!f.ubicacionVieja || pueblos.length === 0 || pueblosViejos,
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
    if (Array.isArray(datos.pueblos) && datos.pueblos.length && (!c.pueblos || !c.pueblos.length || c.pueblosViejos)) {
      c.pueblos = construirContexto({ pueblos: datos.pueblos }, pos).pueblos;
      // Los puntos de interés eran de aquellos pueblos viejos: fuera los lejanos.
      if (c.pueblosViejos && Array.isArray(c.pois)) {
        c.pois = c.pois.filter((q) => q.distKm !== null && q.distKm <= PUEBLO_LEJOS_KM);
      }
      c.pueblosViejos = false;
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
    c.pendiente = !c.municipio || !!c.ubicacionVieja || !c.pueblos || c.pueblos.length === 0 || !!c.pueblosViejos;
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
    const c = (marca && marca.contexto) || {};
    const pos = hayPosicion(marca) ? marca : null;
    const lista = [];
    const meter = (item, tipo, fuente) => {
      if (!item || typeof item.nombre !== 'string') return;
      const clave = normalizarNombre(item.nombre);
      if (!clave) return;
      const medida = medir(pos, item.lat, item.lon);
      // Mismo nombre y a menos de MISMO_SITIO_KM: es el mismo; se queda el
      // primero (el del panel) con lo que traiga el otro (enlace, foto).
      const igual = lista.find((x) => normalizarNombre(x.nombre) === clave &&
        (x.lat === null || num(item.lat) === null ||
          _Geo.distanciaMetros(x.lat, x.lon, item.lat, item.lon) / 1000 < MISMO_SITIO_KM));
      if (igual) {
        if (!igual.pageid && item.pageid) igual.pageid = item.pageid;
        if (!igual.foto && item.foto) igual.foto = item.foto;
        return;
      }
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
    const comoLista = (v) => (Array.isArray(v) ? v : []);
    for (const p of comoLista(c.pueblos)) meter(p, 'pueblo', 'panel');
    for (const q of comoLista(c.pois)) meter(q, (q && q.tipo) || 'sitio', 'panel');
    for (const s of comoLista(c.sitios)) meter(s, 'sitio', 'wikipedia');
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

  function texto(v) { return typeof v === 'string' && v ? v : null; }
  function bool(v) { return v === true; }

  function sanearLugar(x) {
    if (!x || typeof x !== 'object' || typeof x.nombre !== 'string' || !x.nombre) return null;
    return {
      nombre: x.nombre, lat: num(x.lat), lon: num(x.lon),
      distKm: num(x.distKm), rumbo: num(x.rumbo),
      tipo: texto(x.tipo), pueblo: texto(x.pueblo), foto: texto(x.foto), pageid: num(x.pageid),
    };
  }

  function sanearLugares(v, max) {
    return (Array.isArray(v) ? v : []).map(sanearLugar).filter(Boolean).slice(0, max);
  }

  // Deja una marca con la forma exacta que espera el cuaderno, campo a campo.
  function sanearMarca(m) {
    if (!esMarcaValida(m)) return null;
    const limpia = {
      id: m.id, lat: num(m.lat), lon: num(m.lon),
      precisionM: num(m.precisionM), rumbo: num(m.rumbo), velocidadKmh: num(m.velocidadKmh),
      posicionTs: num(m.posicionTs), aproximada: m.aproximada !== false,
    };
    const c = m.contexto;
    if (c && typeof c === 'object') {
      const met = c.meteo && typeof c.meteo === 'object' ? c.meteo : null;
      limpia.contexto = {
        municipio: texto(c.municipio), provincia: texto(c.provincia), ccaa: texto(c.ccaa),
        ubicacionVieja: bool(c.ubicacionVieja),
        via: c.via && typeof c.via === 'object' && (texto(c.via.codigo) || texto(c.via.texto))
          ? { codigo: texto(c.via.codigo), texto: texto(c.via.texto) } : null,
        viaVieja: bool(c.viaVieja),
        pueblos: sanearLugares(c.pueblos, MAX_PUEBLOS),
        pueblosViejos: bool(c.pueblosViejos),
        pois: sanearLugares(c.pois, MAX_POIS),
        meteo: met ? {
          temperatura: num(met.temperatura), descripcion: texto(met.descripcion),
          categoria: texto(met.categoria), codigo: num(met.codigo), vientoKmh: num(met.vientoKmh),
          vientoDir: num(met.vientoDir), esDia: typeof met.esDia === 'boolean' ? met.esDia : null,
          hora: texto(met.hora),
        } : null,
        pendiente: bool(c.pendiente),
      };
      if (Array.isArray(c.sitios)) limpia.contexto.sitios = sanearLugares(c.sitios, MAX_SITIOS);
      if (num(c.completado) !== null) limpia.contexto.completado = c.completado;
    }
    const r = m.revision;
    if (r && typeof r === 'object') {
      const e = sanearLugar(r.elegido);
      limpia.revision = {
        elegido: e ? { nombre: e.nombre, lat: e.lat, lon: e.lon, tipo: e.tipo, pageid: e.pageid } : null,
        nota: typeof r.nota === 'string' ? r.nota.slice(0, MAX_NOTA) : '',
        editado: num(r.editado),
      };
    }
    return limpia;
  }

  // Acepta la copia que genera exportar() o una lista suelta de marcas.
  function leerCopia(entrada) {
    let datos = entrada;
    if (typeof datos === 'string') datos = JSON.parse(datos);
    const lista = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.marcas) ? datos.marcas : null);
    if (!lista) throw new Error('El archivo no es una copia del cuaderno');
    return lista.map(sanearMarca).filter(Boolean);
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
      if (m.revision && typeof m.revision.nota === 'string' && m.revision.nota) partes.push(m.revision.nota.replace(/\s+/g, ' '));
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
  //
  // Las escrituras van con durabilidad "strict": el aviso de guardado llega con
  // la marca ya en disco. Desde Chrome 121 lo normal es "relaxed", que la deja
  // un momento en memoria: con un corte de corriente al quitar el contacto se
  // perdería la última marca.
  const ESCRITURA = { durability: 'strict' };
  // Si IndexedDB falla al guardar (móvil lleno, conexión cerrada por Chrome),
  // la marca va a este respaldo en localStorage y pasa a la base de datos en
  // cuanto se pueda. Solo se quita de aquí cuando ya está guardada allí.
  const CLAVE_RESPALDO = 'cuaderno-sin-guardar';

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
      req.onsuccess = () => {
        const db = req.result;
        // Si Chrome cierra la conexión, la siguiente operación abre otra en vez
        // de fallar hasta recargar la página.
        db.onclose = () => { dbPromise = null; };
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB open falló'));
    });
    // Si falla, que el siguiente intento vuelva a probar en vez de heredar el error.
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  // Una operación con la base de datos, con un reintento sobre una conexión
  // nueva si la primera falla (conexión cerrada, transacción rota).
  async function conDb(fn) {
    try {
      return await fn(await abrirDb());
    } catch (err) {
      dbPromise = null;
      return await fn(await abrirDb());
    }
  }

  function esperarTx(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('transacción fallida'));
      t.onabort = () => reject(t.error || new Error('transacción abortada'));
    });
  }

  function escribir(db) {
    return db.transaction(STORE, 'readwrite', ESCRITURA);
  }

  function guardar(db, marcas) {
    const t = escribir(db);
    const s = t.objectStore(STORE);
    for (const m of marcas) s.put(m);
    return esperarTx(t);
  }

  function leerRespaldo() {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_RESPALDO) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function escribirRespaldo(lista) {
    try {
      if (lista.length) localStorage.setItem(CLAVE_RESPALDO, JSON.stringify(lista));
      else localStorage.removeItem(CLAVE_RESPALDO);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Pasa a la base de datos las marcas que quedaron en el respaldo.
  async function rescatar() {
    const pendientes = leerRespaldo();
    if (!pendientes.length) return 0;
    await conDb((db) => guardar(db, pendientes));
    // Solo ahora, ya guardadas, salen del respaldo (y solo esas: puede haber
    // llegado otra mientras tanto).
    const ids = new Set(pendientes.map((m) => m.id));
    escribirRespaldo(leerRespaldo().filter((m) => !ids.has(m.id)));
    if (typeof debug !== 'undefined') debug.log(`Cuaderno: ${pendientes.length} marcas pasadas del respaldo a la base de datos`);
    return pendientes.length;
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
      await conDb((db) => guardar(db, [marca]));
      pedirPersistencia();
      rescatar().catch(() => {});
      return { guardada: true, duplicada: false, marca };
    } catch (err) {
      const motivo = err && err.message ? err.message : String(err);
      if (escribirRespaldo(leerRespaldo().concat([marca]))) {
        return { guardada: true, duplicada: false, marca, respaldo: true, error: motivo };
      }
      // Que el siguiente intento no se tome por un duplicado de esta.
      ultimaMarcaTs = null;
      return { guardada: false, duplicada: false, marca, error: motivo };
    }
  }

  function leerTodas(db) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Las de la base de datos más las que sigan en el respaldo. Si la base de
  // datos no responde y hay marcas en el respaldo, al menos se ven esas.
  async function listar() {
    try { await rescatar(); } catch (e) { /* siguen en el respaldo */ }
    let enDb;
    try {
      enDb = await conDb(leerTodas);
    } catch (err) {
      const respaldo = leerRespaldo();
      if (respaldo.length) return respaldo;
      throw err;
    }
    const ids = new Set(enDb.map((m) => m.id));
    return enDb.concat(leerRespaldo().filter((m) => !ids.has(m.id)));
  }

  // Lee y reescribe una marca en la misma transacción: si fn devuelve null, no
  // cambia nada. El id no se puede cambiar.
  async function actualizar(id, fn) {
    return conDb(async (db) => {
      const t = escribir(db);
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
    });
  }

  async function borrar(id) {
    await conDb((db) => {
      const t = escribir(db);
      t.objectStore(STORE).delete(id);
      return esperarTx(t);
    });
    // Por si estaba también en el respaldo: si no, volvería a aparecer.
    escribirRespaldo(leerRespaldo().filter((m) => m.id !== id));
  }

  async function importar(entrada) {
    const importadas = leerCopia(entrada);
    const nuevas = fusionarImportacion(await listar(), importadas);
    if (nuevas.length) {
      await conDb((db) => guardar(db, nuevas));
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
    sanearMarca,
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
