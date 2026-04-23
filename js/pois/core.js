// js/pois/core.js — DT-10 (sesión 33)
//
// Orquestador del POIModule. Responsable de:
//   · Caches en memoria (sesión).
//   · Coordinar los 4 pasos: pueblos → POIs → enriquecimiento → municipio.
//   · Race contra timeout global (BPC-05).
//
// Consume: POIMatch, POIIdb, POIFuentes, Overpass.
// Expone: window.POIModule.

(function () {
  'use strict';

  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  // --- Constantes ---
  const UMBRAL_REFRESCO_PUEBLOS_KM = 5;
  const MAX_POIS_POR_PUEBLO = POIFuentes.MAX_POIS_POR_PUEBLO;
  // BPC-05: timeout global de actualizar(). Si todos los mirrors Overpass
  // están saturados, el peor caso secuencial puede llegar a 3 min
  // (3 mirrors × 8 s × ~7 queries). Cortamos a 90 s y devolvemos lo parcial
  // que llevemos para no bloquear futuras actualizaciones.
  const TIMEOUT_GLOBAL_ACTUALIZAR_MS = 90000;

  // Orden de prioridad visual (castle > cathedral > ... > peak)
  const PRIORIDAD = [
    'castle', 'cathedral', 'monastery', 'church', 'chapel',
    'fort', 'city_gate', 'monument', 'memorial', 'ruins',
    'archaeological_site', 'attraction', 'viewpoint', 'peak',
  ];

  const ICONOS = {
    castle: '🏰', fort: '🏯', city_gate: '🏯',
    cathedral: '⛪', monastery: '⛪', church: '⛪', chapel: '⛪',
    monument: '🗿', memorial: '🗿',
    ruins: '🏛️', archaeological_site: '🏛️',
    viewpoint: '👁️', attraction: '⭐', peak: '⛰️',
  };

  function iconoPorTipo(tipo) {
    return ICONOS[tipo] || '📍';
  }

  // --- Caché en memoria (sesión) ---

  let cachePueblosCercanos = null;  // { centroLat, centroLon, pueblos }
  const cachePOIs = new Map();       // nombre → [{nombre, tipo, lat, lon}]
  const cacheEnriq = new Map();      // key → {foto, texto, icono, fuente}
  const cacheMunicipio = new Map();  // nombre → {nombre, poblacion, altitud, superficie}

  let ultimoResultado = null;
  let enActualizacion = false;

  // --- Paso 1: pueblos cercanos ---

  async function obtenerPueblosCercanos(lat, lon) {
    if (cachePueblosCercanos) {
      const dist = Overpass.distanciaMetros(
        lat, lon,
        cachePueblosCercanos.centroLat, cachePueblosCercanos.centroLon
      );
      if (dist < UMBRAL_REFRESCO_PUEBLOS_KM * 1000) {
        // BPC-11: recalcular distancias desde la posición actual.
        const pueblosActualizados = cachePueblosCercanos.pueblos.map(p => ({
          ...p,
          distKm: Overpass.distanciaMetros(lat, lon, p.lat, p.lon) / 1000,
        })).sort((a, b) => a.distKm - b.distKm);
        if (typeof debug !== 'undefined') {
          debug.log(`POI pueblos: caché OK (centro a ${(dist / 1000).toFixed(1)}km) · ${pueblosActualizados.length} pueblos`);
        }
        return pueblosActualizados;
      }
    }

    // IDB: buscar por coordenadas redondeadas a 2 decimales (~1km)
    const idbKey = `pueblos:${lat.toFixed(2)}:${lon.toFixed(2)}`;
    const idbDatos = await POIIdb.leer(idbKey);
    if (idbDatos) {
      const pueblosIdb = idbDatos.map(p => ({
        ...p,
        distKm: Overpass.distanciaMetros(lat, lon, p.lat, p.lon) / 1000,
      })).sort((a, b) => a.distKm - b.distKm);
      cachePueblosCercanos = { centroLat: lat, centroLon: lon, pueblos: pueblosIdb };
      if (typeof debug !== 'undefined') {
        debug.log(`POI pueblos [IDB]: ${pueblosIdb.length} pueblos · más cercano: ${pueblosIdb[0] ? pueblosIdb[0].nombre : 'ninguno'}`);
      }
      return pueblosIdb;
    }

    let pueblos;
    try {
      const { datos, dt } = await Overpass.query(POIFuentes.construirQueryPueblos(lat, lon), 'POI-pueblos');
      pueblos = (datos.elements || [])
        .filter(el => el.tags && el.tags.name && typeof el.lat === 'number')
        .map(el => ({
          nombre: el.tags.name,
          lat: el.lat,
          lon: el.lon,
          distKm: Overpass.distanciaMetros(lat, lon, el.lat, el.lon) / 1000,
        }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, POIFuentes.MAX_PUEBLOS);
      if (typeof debug !== 'undefined') {
        debug.log(`POI pueblos: ${pueblos.length} en ${dt}ms · más cercano: ${pueblos[0] ? pueblos[0].nombre + ' (' + pueblos[0].distKm.toFixed(1) + 'km)' : 'ninguno'}`);
      }
    } catch (e) {
      if (typeof debug !== 'undefined') {
        debug.warn(`POI pueblos: Overpass falló (${e.message}), probando Wikipedia geosearch`);
      }
      pueblos = await POIFuentes.obtenerPueblosWikipedia(lat, lon);
    }

    cachePueblosCercanos = { centroLat: lat, centroLon: lon, pueblos };
    POIIdb.guardar(idbKey, pueblos);
    return pueblos;
  }

  // --- Paso 2: POIs por pueblo ---

  async function obtenerPOIsPueblo(nombre, lat, lon) {
    if (cachePOIs.has(nombre)) {
      const cached = cachePOIs.get(nombre);
      if (typeof debug !== 'undefined') {
        debug.log(`POI [${nombre}]: caché OK · ${cached.length} POIs`);
      }
      return cached;
    }

    const idbKey = `pois:${nombre}`;
    const idbDatos = await POIIdb.leer(idbKey);
    if (idbDatos) {
      cachePOIs.set(nombre, idbDatos);
      if (typeof debug !== 'undefined') {
        debug.log(`POI [${nombre}] [IDB]: ${idbDatos.length} POIs`);
      }
      return idbDatos;
    }

    let pois = [];
    try {
      const { datos, dt } = await Overpass.query(POIFuentes.construirQueryPOIs(lat, lon), `POI-${nombre}`);
      pois = POIFuentes.parsearPOIs(datos, lat, lon, PRIORIDAD);
      if (typeof debug !== 'undefined') {
        const top = pois.slice(0, 3).map(p => `${p.tipo}:${p.nombre}`).join(', ');
        debug.log(`POI [${nombre}]: ${pois.length} POIs reales en ${dt}ms${pois.length ? ' · ' + top : ' (ninguno en OSM)'}`);
      }
    } catch (e) {
      if (typeof debug !== 'undefined') {
        debug.warn(`POI [${nombre}]: Overpass falló (${e.message})`);
      }
    }

    // PO-12: cascada de fallbacks. Si Overpass viene vacío o falló, probar
    // Wikipedia geosearch. Si también viene vacía, probar Photon.
    if (pois.length === 0) {
      try {
        pois = await POIFuentes.obtenerPOIsWikipedia(nombre, lat, lon);
      } catch (e) {
        if (typeof debug !== 'undefined') {
          debug.warn(`POI [${nombre}]: Wikipedia falló (${e.message})`);
        }
      }
    }
    if (pois.length === 0) {
      try {
        pois = await POIFuentes.obtenerPOIsPhoton(nombre, lat, lon);
      } catch (e) {
        if (typeof debug !== 'undefined') {
          debug.warn(`POI [${nombre}]: Photon falló (${e.message})`);
        }
      }
    }

    cachePOIs.set(nombre, pois);
    POIIdb.guardar(idbKey, pois);
    return pois;
  }

  // --- Paso 3: enriquecimiento ---

  async function enriquecerPOI(poi) {
    const key = `${poi.nombre}|${poi.lat != null ? poi.lat.toFixed(4) : ''}|${poi.lon != null ? poi.lon.toFixed(4) : ''}`;
    if (cacheEnriq.has(key)) {
      return { ...poi, ...cacheEnriq.get(key) };
    }

    const idbKey = `enriq:${key}`;
    const idbDatos = await POIIdb.leer(idbKey);
    if (idbDatos) {
      cacheEnriq.set(key, idbDatos);
      return { ...poi, ...idbDatos };
    }

    const base = { foto: null, texto: null, icono: iconoPorTipo(poi.tipo), fuente: 'icono' };

    // Intento 0: si el POI trae pageid (fallback Wikipedia, RA-02), pedir
    // extracto+foto directamente por pageid. Más fiable que por título.
    if (poi.pageid) {
      try {
        const url = `https://es.wikipedia.org/w/api.php?action=query&pageids=${poi.pageid}` +
          `&prop=extracts|pageimages&exintro&explaintext&pithumbsize=100&format=json&origin=*`;
        const datos = await (async () => {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 8000);
          try {
            const r = await fetch(url, { signal: controller.signal });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
          } finally { clearTimeout(id); }
        })();
        const page = datos.query && datos.query.pages && datos.query.pages[poi.pageid];
        if (page && (page.extract || page.thumbnail)) {
          const enriq = {
            foto: page.thumbnail ? page.thumbnail.source : null,
            texto: page.extract || null,
            icono: iconoPorTipo(poi.tipo),
            fuente: 'wikipedia-pageid',
          };
          cacheEnriq.set(key, enriq);
          POIIdb.guardar(idbKey, enriq);
          if (typeof debug !== 'undefined') {
            debug.log(`POI enriq [${poi.nombre}]: pageid ${poi.pageid} OK${enriq.foto ? ' + foto' : ''}`);
          }
          return { ...poi, ...enriq };
        }
      } catch (e) {
        if (typeof debug !== 'undefined') {
          debug.log(`POI enriq [${poi.nombre}]: pageid fallo (${e.message})`);
        }
      }
    }

    // Intento 1: Wikipedia REST por título
    try {
      const wiki = await POIFuentes.consultarWikipedia(poi.nombre);
      const enriq = { foto: wiki.foto, texto: wiki.texto, icono: iconoPorTipo(poi.tipo), fuente: 'wikipedia' };
      cacheEnriq.set(key, enriq);
      POIIdb.guardar(idbKey, enriq);
      if (typeof debug !== 'undefined') {
        debug.log(`POI enriq [${poi.nombre}]: Wikipedia OK${wiki.foto ? ' + foto' : ''}`);
      }
      return { ...poi, ...enriq };
    } catch (e) {
      if (typeof debug !== 'undefined') {
        debug.log(`POI enriq [${poi.nombre}]: Wikipedia fallo (${e.message})`);
      }
    }

    // Intento 2: Wikidata SPARQL por proximidad
    if (poi.lat != null && poi.lon != null) {
      try {
        const wd = await POIFuentes.consultarWikidataProximidad(poi);
        if (wd) {
          const enriq = { foto: wd.foto, texto: null, icono: iconoPorTipo(poi.tipo), fuente: 'wikidata' };
          cacheEnriq.set(key, enriq);
          POIIdb.guardar(idbKey, enriq);
          if (typeof debug !== 'undefined') {
            debug.log(`POI enriq [${poi.nombre}]: Wikidata OK (Jaccard ${wd.sim.toFixed(2)})${wd.foto ? ' + foto' : ''}`);
          }
          return { ...poi, ...enriq };
        }
        if (typeof debug !== 'undefined') {
          debug.log(`POI enriq [${poi.nombre}]: Wikidata sin match (Jaccard < ${POIMatch.JACCARD_MIN_POI}) → icono`);
        }
      } catch (e) {
        if (typeof debug !== 'undefined') {
          debug.log(`POI enriq [${poi.nombre}]: Wikidata fallo (${e.message}) → icono`);
        }
      }
    }

    // Fallback final: solo icono
    cacheEnriq.set(key, base);
    POIIdb.guardar(idbKey, base);
    return { ...poi, ...base };
  }

  // --- Paso 4: datos del municipio ---

  async function obtenerDatosMunicipio(nombre, lat, lon) {
    if (cacheMunicipio.has(nombre)) {
      if (typeof debug !== 'undefined') {
        debug.log(`POI municipio [${nombre}]: caché OK`);
      }
      return cacheMunicipio.get(nombre);
    }

    const idbKey = `muni:${nombre}`;
    const idbDatos = await POIIdb.leer(idbKey);
    if (idbDatos !== null) {
      cacheMunicipio.set(nombre, idbDatos);
      if (typeof debug !== 'undefined') {
        debug.log(`POI municipio [${nombre}] [IDB]: OK`);
      }
      return idbDatos;
    }

    let resultado = null;
    let falloRed = false;

    // Capa 1: municipio oficial de España (Q2074737)
    try {
      resultado = await POIFuentes.buscarMunicipioEnWikidata(nombre, lat, lon, 'Q2074737', POIMatch.JACCARD_MIN_MUNICIPIO);
    } catch (e) {
      if (typeof debug !== 'undefined') {
        debug.log(`POI municipio [${nombre}] (Q2074737): fallo (${e.message})`);
      }
      falloRed = true;
    }

    // Capa 2 (pedanías): entidad singular de población (Q3055118)
    if (!resultado) {
      try {
        resultado = await POIFuentes.buscarMunicipioEnWikidata(nombre, lat, lon, 'Q3055118', POIMatch.JACCARD_MIN_PEDANIA);
      } catch (e) {
        if (typeof debug !== 'undefined') {
          debug.log(`POI municipio [${nombre}] (Q3055118): fallo (${e.message})`);
        }
        falloRed = true;
      }
    }

    // Capa 3: descripción y foto vía Wikipedia REST (no crítico)
    try {
      const wiki = await POIFuentes.consultarWikipedia(nombre);
      if (wiki) {
        if (!resultado) resultado = { nombre, poblacion: null, altitud: null, superficie: null, comarca: null };
        resultado.descripcion = wiki.texto ? wiki.texto.split('. ')[0] + '.' : null;
        resultado.foto = wiki.foto || null;
      }
    } catch (e) {
      if (typeof debug !== 'undefined') {
        debug.log(`POI municipio [${nombre}] Wikipedia: fallo (${e.message})`);
      }
    }

    // BPC-08: solo cachear si hay resultado O ninguna capa falló por red.
    if (resultado !== null || !falloRed) {
      cacheMunicipio.set(nombre, resultado);
      POIIdb.guardar(idbKey, resultado);
    }
    return resultado;
  }

  // --- API pública ---

  async function actualizar(lat, lon, municipioActual) {
    // Evitar llamadas paralelas: si hay una en curso devolvemos el último
    // resultado conocido pero recalculamos distancias desde la posición
    // actual (BPC-11) para que la UI no quede congelada.
    if (enActualizacion) {
      if (ultimoResultado && ultimoResultado.pueblosCercanos) {
        const pueblosFrescos = ultimoResultado.pueblosCercanos.map(p => ({
          ...p,
          distKm: Overpass.distanciaMetros(lat, lon, p.lat, p.lon) / 1000,
        })).sort((a, b) => a.distKm - b.distKm);
        return { ...ultimoResultado, pueblosCercanos: pueblosFrescos };
      }
      return ultimoResultado;
    }
    enActualizacion = true;

    // BPC-05: estado parcial que se va rellenando. Si el timeout gana la
    // carrera, devolvemos esto.
    const parcial = { pueblosCercanos: [], datosMunicipio: null };

    const flujo = (async () => {
      // Paso 1: pueblos cercanos
      const pueblos = await obtenerPueblosCercanos(lat, lon);
      parcial.pueblosCercanos = pueblos.map(p => ({ ...p, pois: [] }));

      // Pasos 2 y 3: POIs + enriquecimiento por pueblo (secuencial).
      const pueblosConPOIs = [];
      for (const pueblo of pueblos) {
        try {
          const pois = await obtenerPOIsPueblo(pueblo.nombre, pueblo.lat, pueblo.lon);
          const poisEnriquecidos = [];
          for (const poi of pois.slice(0, MAX_POIS_POR_PUEBLO)) {
            try {
              poisEnriquecidos.push(await enriquecerPOI(poi));
            } catch (e) {
              poisEnriquecidos.push({
                ...poi,
                foto: null, texto: null,
                icono: iconoPorTipo(poi.tipo),
                fuente: 'icono',
              });
            }
          }
          pueblosConPOIs.push({ ...pueblo, pois: poisEnriquecidos });
        } catch (e) {
          if (typeof debug !== 'undefined') {
            debug.log(`POI [${pueblo.nombre}]: fallo al obtener POIs (${e.message})`);
          }
          pueblosConPOIs.push({ ...pueblo, pois: [] });
        }
        parcial.pueblosCercanos = pueblosConPOIs;
      }

      // Paso 4: datos del municipio actual
      let datosMunicipio = null;
      if (municipioActual) {
        try {
          datosMunicipio = await obtenerDatosMunicipio(municipioActual, lat, lon);
          parcial.datosMunicipio = datosMunicipio;
        } catch (e) {
          if (typeof debug !== 'undefined') {
            debug.log(`POI municipio [${municipioActual}]: fallo (${e.message})`);
          }
        }
      }

      const resultado = { pueblosCercanos: pueblosConPOIs, datosMunicipio };

      if (typeof debug !== 'undefined') {
        const totalPOIs = pueblosConPOIs.reduce((n, p) => n + p.pois.length, 0);
        debug.log(`POI: resultado listo · ${pueblosConPOIs.length} pueblos · ${totalPOIs} POIs`);
      }
      return resultado;
    })();

    const TIMEOUT_SENTINEL = { _timeout: true };
    const timeout = new Promise(resolve =>
      setTimeout(() => resolve(TIMEOUT_SENTINEL), TIMEOUT_GLOBAL_ACTUALIZAR_MS)
    );

    try {
      const ganador = await Promise.race([flujo, timeout]);
      if (ganador === TIMEOUT_SENTINEL) {
        if (typeof debug !== 'undefined') {
          debug.warn(`POI: timeout global ${TIMEOUT_GLOBAL_ACTUALIZAR_MS}ms, devolviendo parcial (${parcial.pueblosCercanos.length} pueblos)`);
        }
        ultimoResultado = { ...parcial };
        flujo.catch(() => {});
        return ultimoResultado;
      }
      ultimoResultado = ganador;
      return ganador;
    } finally {
      enActualizacion = false;
    }
  }

  function reset() {
    cachePueblosCercanos = null;
    cachePOIs.clear();
    cacheEnriq.clear();
    cacheMunicipio.clear();
    ultimoResultado = null;
    enActualizacion = false;
    if (typeof debug !== 'undefined') {
      debug.log('POIModule: reset');
    }
  }

  __global__.POIModule = {
    actualizar,
    obtenerResultado: () => ultimoResultado,
    reset,
    // Expuestos para tests / debugging
    _iconoPorTipo: iconoPorTipo,
    _PRIORIDAD: PRIORIDAD,
  };
})();
