// pois.js — POIModule: puntos de interés de pueblos cercanos
//
// Qué hace:
//   POIModule.actualizar(lat, lon, municipioActual)
//     → Promise<{ pueblosCercanos, datosMunicipio }>
//
//   Dado un fix de GPS devuelve los pueblos en un radio de 15 km con sus
//   POIs principales (hasta 2 por pueblo) enriquecidos con foto y texto, y
//   los datos básicos del municipio actual (población, altitud, superficie).
//
// Arquitectura (decisión 13, sesiones 06-07):
//   Paso 1 — Pueblos cercanos: Overpass node[place] en radio 15 km.
//             Tags: village|town|city|hamlet (pedanías incluidas).
//             Caché por desplazamiento > 5 km del centro de la última consulta.
//   Paso 2 — Inventario POIs: Overpass en radio 1500 m del centro de cada pueblo.
//             Tags: historic=castle|cathedral|monastery|church|chapel|fort|
//             city_gate|monument|memorial|ruins|archaeological_site,
//             tourism=viewpoint|attraction, natural=peak.
//             Priorización por tipo antes de enriquecer.
//             Caché por nombre de pueblo, sin expiración (sesión).
//   Paso 3 — Enriquecimiento: Wikipedia REST por nombre del POI →
//             fallback Wikidata SPARQL por proximidad (radio 100 m,
//             Jaccard ≥ 0.5 sobre palabras significativas) →
//             fallback icono por tipo.
//             Caché por POI (nombre+coords), sin expiración.
//   Paso 4 — Datos del municipio: Wikidata SPARQL por proximidad (radio 10 km).
//             Capa 1: wd:Q2074737 (municipio de España), Jaccard ≥ 0.3.
//             Capa 2 (pedanías): wd:Q56061 (entidad singular de población),
//             solo si capa 1 falla, Jaccard ≥ 0.5. Campos: población (P1082),
//             altitud (P2044), superficie (P2046). Caché por nombre, sin expiración.
//
// API pública:
//   POIModule.actualizar(lat, lon, municipioActual)
//     → Promise<{ pueblosCercanos: [{nombre, distKm, lat, lon, pois}],
//                  datosMunicipio: {nombre, poblacion, altitud, superficie} | null }>
//   POIModule.obtenerResultado()
//     → último resultado (sincrónico, puede ser null)
//   POIModule.reset()
//     → vacía toda la caché
//
// Dependencia: overpass.js debe cargarse antes que este archivo.

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  __global__.POIModule = (() => {

    // --- Constantes ---

    const RADIO_PUEBLOS_M         = 15000;
    const UMBRAL_REFRESCO_PUEBLOS_KM = 5;
    const RADIO_POIS_M            = 1500;
    const RADIO_WIKIDATA_KM       = 0.1;   // 100 m para enriquecimiento de POI
    const RADIO_MUNICIPIO_KM      = 10;
    const MAX_PUEBLOS             = 5;
    const MAX_POIS_POR_PUEBLO     = 2;
    const TIMEOUT_WIKIPEDIA_MS    = 8000;
    const TIMEOUT_WIKIDATA_MS     = 12000;
    const JACCARD_MIN_POI         = 0.5;
    const JACCARD_MIN_MUNICIPIO   = 0.3;
    const JACCARD_MIN_PEDANIA     = 0.5;   // más estricto para Q56061 (entidades singulares)

    const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
    const WIKIPEDIA_ENDPOINT = 'https://es.wikipedia.org/api/rest_v1/page/summary';

    // Orden de prioridad (castle > cathedral > ... > peak)
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

    // Stopwords de dominio (decisión 13)
    const STOPWORDS = new Set([
      'de','del','la','el','los','las','y','a','en',
      'san','santa','santo','nuestra','señora','virgen',
      'iglesia','ermita','castillo','torre','convento',
      'monasterio','catedral','capilla',
    ]);

    // --- Caché en memoria (sesión) ---

    let cachePueblosCercanos = null;  // { centroLat, centroLon, pueblos }
    const cachePOIs    = new Map();   // nombre → [{nombre, tipo, lat, lon}]
    const cacheEnriq   = new Map();   // key → {foto, texto, icono, fuente}
    const cacheMunicipio = new Map(); // nombre → {nombre, poblacion, altitud, superficie}

    let ultimoResultado = null;
    let enActualizacion = false;

    // --- Utilidades ---

    function jaccardSim(a, b) {
      const palabras = s => new Set(
        s.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .split(/\W+/)
          .filter(w => w.length > 1 && !STOPWORDS.has(w))
      );
      const wa = palabras(a);
      const wb = palabras(b);
      let interseccion = 0;
      for (const w of wa) if (wb.has(w)) interseccion++;
      const union = wa.size + wb.size - interseccion;
      return union === 0 ? 0 : interseccion / union;
    }

    function iconoPorTipo(tipo) {
      return ICONOS[tipo] || '📍';
    }

    async function fetchConTimeout(url, opciones, timeoutMs) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(url, { ...opciones, signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('timeout');
        throw err;
      } finally {
        clearTimeout(id);
      }
    }

    // --- Paso 1: Pueblos cercanos (Overpass) ---

    function construirQueryPueblos(lat, lon) {
      return (
        `[out:json][timeout:20];` +
        `node(around:${RADIO_PUEBLOS_M},${lat},${lon})` +
        `[place~"^(village|town|city|hamlet)$"]["name"];` +
        `out body;`
      );
    }

    async function obtenerPueblosCercanos(lat, lon) {
      if (cachePueblosCercanos) {
        const dist = Overpass.distanciaMetros(
          lat, lon,
          cachePueblosCercanos.centroLat, cachePueblosCercanos.centroLon
        );
        if (dist < UMBRAL_REFRESCO_PUEBLOS_KM * 1000) {
          if (typeof debug !== 'undefined') {
            debug.log(`POI pueblos: caché OK (centro a ${(dist / 1000).toFixed(1)}km) · ${cachePueblosCercanos.pueblos.length} pueblos`);
          }
          return cachePueblosCercanos.pueblos;
        }
      }
      const { datos, dt } = await Overpass.query(construirQueryPueblos(lat, lon), 'POI-pueblos');
      const pueblos = (datos.elements || [])
        .filter(el => el.tags && el.tags.name && typeof el.lat === 'number')
        .map(el => ({
          nombre: el.tags.name,
          lat: el.lat,
          lon: el.lon,
          distKm: Overpass.distanciaMetros(lat, lon, el.lat, el.lon) / 1000,
        }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, MAX_PUEBLOS);
      cachePueblosCercanos = { centroLat: lat, centroLon: lon, pueblos };
      if (typeof debug !== 'undefined') {
        debug.log(`POI pueblos: ${pueblos.length} en ${dt}ms · más cercano: ${pueblos[0] ? pueblos[0].nombre + ' (' + pueblos[0].distKm.toFixed(1) + 'km)' : 'ninguno'}`);
      }
      return pueblos;
    }

    // --- Paso 2: POIs por pueblo (Overpass) ---

    function construirQueryPOIs(lat, lon) {
      const tags = 'castle|cathedral|monastery|church|chapel|fort|city_gate|monument|memorial|ruins|archaeological_site';
      return (
        `[out:json][timeout:20];` +
        `(` +
        `node(around:${RADIO_POIS_M},${lat},${lon})[historic~"^(${tags})$"]["name"];` +
        `way(around:${RADIO_POIS_M},${lat},${lon})[historic~"^(${tags})$"]["name"];` +
        `node(around:${RADIO_POIS_M},${lat},${lon})[tourism~"^(viewpoint|attraction)$"]["name"];` +
        `way(around:${RADIO_POIS_M},${lat},${lon})[tourism~"^(viewpoint|attraction)$"]["name"];` +
        `node(around:${RADIO_POIS_M},${lat},${lon})[natural=peak]["name"];` +
        `);` +
        `out center;`
      );
    }

    function parsearPOIs(datos) {
      return (datos.elements || [])
        .filter(el => el.tags && el.tags.name)
        .map(el => {
          const tipo = el.tags.historic || el.tags.tourism || el.tags.natural || 'attraction';
          const lat = el.lat != null ? el.lat : (el.center ? el.center.lat : null);
          const lon = el.lon != null ? el.lon : (el.center ? el.center.lon : null);
          return { nombre: el.tags.name, tipo, lat, lon };
        })
        .filter(p => p.lat != null && p.lon != null)
        .sort((a, b) => {
          const ia = PRIORIDAD.indexOf(a.tipo);
          const ib = PRIORIDAD.indexOf(b.tipo);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
    }

    async function obtenerPOIsPueblo(nombre, lat, lon) {
      if (cachePOIs.has(nombre)) {
        const cached = cachePOIs.get(nombre);
        if (typeof debug !== 'undefined') {
          debug.log(`POI [${nombre}]: caché OK · ${cached.length} POIs`);
        }
        return cached;
      }
      // Si Overpass.query() lanza (todos_mirrors_fallaron u otro error de red),
      // la excepción se propaga SIN llegar a cachePOIs.set(). El caller recibe
      // el error, no cachea nada, y el próximo ciclo reintentará esta query.
      // Solo se cachea cuando Overpass responde correctamente (aunque sea con 0 elementos).
      const { datos, dt } = await Overpass.query(construirQueryPOIs(lat, lon), `POI-${nombre}`);
      const pois = parsearPOIs(datos);
      cachePOIs.set(nombre, pois);
      if (typeof debug !== 'undefined') {
        const top = pois.slice(0, 3).map(p => `${p.tipo}:${p.nombre}`).join(', ');
        debug.log(`POI [${nombre}]: ${pois.length} POIs reales en ${dt}ms${pois.length ? ' · ' + top : ' (ninguno en OSM)'}`);
      }
      return pois;
    }

    // --- Paso 3a: Enriquecimiento vía Wikipedia REST ---

    async function consultarWikipedia(nombre) {
      const url = `${WIKIPEDIA_ENDPOINT}/${encodeURIComponent(nombre)}`;
      const datos = await fetchConTimeout(url, {}, TIMEOUT_WIKIPEDIA_MS);
      if (datos.type === 'disambiguation') throw new Error('disambiguation');
      if (datos.type === 'no-extract' || !datos.extract) throw new Error('sin-texto');
      return {
        texto: datos.extract || null,
        foto:  datos.thumbnail ? datos.thumbnail.source : null,
      };
    }

    // --- Paso 3b: Enriquecimiento vía Wikidata SPARQL (fallback) ---

    async function consultarWikidataProximidad(poi) {
      const sparql = `SELECT ?item ?itemLabel ?image WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coords.
    bd:serviceParam wikibase:center "Point(${poi.lon} ${poi.lat})"^^geo:wktLiteral.
    bd:serviceParam wikibase:radius "${RADIO_WIKIDATA_KM}".
  }
  ?item wdt:P18 ?image.
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q2074737. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
} LIMIT 10`;

      const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
      const datos = await fetchConTimeout(url, {}, TIMEOUT_WIKIDATA_MS);
      const bindings = (datos.results && datos.results.bindings) || [];
      let mejorSim = -1, mejorB = null;
      for (const b of bindings) {
        const label = b.itemLabel ? b.itemLabel.value : '';
        const sim = jaccardSim(poi.nombre, label);
        if (sim > mejorSim) { mejorSim = sim; mejorB = b; }
      }
      if (!mejorB || mejorSim < JACCARD_MIN_POI) return null;
      return {
        foto: mejorB.image ? mejorB.image.value : null,
        texto: null,  // Wikidata no da resumen; solo foto
        sim: mejorSim,
      };
    }

    async function enriquecerPOI(poi) {
      const key = `${poi.nombre}|${poi.lat != null ? poi.lat.toFixed(4) : ''}|${poi.lon != null ? poi.lon.toFixed(4) : ''}`;
      if (cacheEnriq.has(key)) {
        return { ...poi, ...cacheEnriq.get(key) };
      }

      const base = { foto: null, texto: null, icono: iconoPorTipo(poi.tipo), fuente: 'icono' };

      // Intento 1: Wikipedia REST
      try {
        const wiki = await consultarWikipedia(poi.nombre);
        const enriq = { foto: wiki.foto, texto: wiki.texto, icono: iconoPorTipo(poi.tipo), fuente: 'wikipedia' };
        cacheEnriq.set(key, enriq);
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
          const wd = await consultarWikidataProximidad(poi);
          if (wd) {
            const enriq = { foto: wd.foto, texto: null, icono: iconoPorTipo(poi.tipo), fuente: 'wikidata' };
            cacheEnriq.set(key, enriq);
            if (typeof debug !== 'undefined') {
              debug.log(`POI enriq [${poi.nombre}]: Wikidata OK (Jaccard ${wd.sim.toFixed(2)})${wd.foto ? ' + foto' : ''}`);
            }
            return { ...poi, ...enriq };
          }
          if (typeof debug !== 'undefined') {
            debug.log(`POI enriq [${poi.nombre}]: Wikidata sin match (Jaccard < ${JACCARD_MIN_POI}) → icono`);
          }
        } catch (e) {
          if (typeof debug !== 'undefined') {
            debug.log(`POI enriq [${poi.nombre}]: Wikidata fallo (${e.message}) → icono`);
          }
        }
      }

      // Fallback final: solo icono
      cacheEnriq.set(key, base);
      return { ...poi, ...base };
    }

    // --- Paso 4: Datos del municipio (Wikidata, dos capas) ---

    // Helper compartido por las dos capas de búsqueda.
    // filtroQ: 'Q2074737' (municipio oficial) o 'Q56061' (entidad singular).
    // umbral:  Jaccard mínimo para aceptar el match.
    // Devuelve {nombre, poblacion, altitud, superficie} o null.
    async function _buscarEnWikidata(nombre, lat, lon, filtroQ, umbral) {
      const sparql = (
        `SELECT ?item ?itemLabel ?poblacion ?altitud ?superficie WHERE {` +
        `  SERVICE wikibase:around {` +
        `    ?item wdt:P625 ?coords.` +
        `    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral.` +
        `    bd:serviceParam wikibase:radius "${RADIO_MUNICIPIO_KM}".` +
        `  }` +
        `  ?item wdt:P31 wd:${filtroQ}.` +
        `  OPTIONAL { ?item wdt:P1082 ?poblacion. }` +
        `  OPTIONAL { ?item wdt:P2044 ?altitud. }` +
        `  OPTIONAL { ?item wdt:P2046 ?superficie. }` +
        `  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }` +
        `} LIMIT 5`
      );
      const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
      const t0 = Date.now();
      const datos = await fetchConTimeout(url, {}, TIMEOUT_WIKIDATA_MS);
      const dt = Date.now() - t0;
      const bindings = (datos.results && datos.results.bindings) || [];

      let mejorSim = -1, mejorB = null;
      for (const b of bindings) {
        const label = b.itemLabel ? b.itemLabel.value : '';
        const sim = jaccardSim(nombre, label);
        if (sim > mejorSim) { mejorSim = sim; mejorB = b; }
      }

      if (!mejorB || mejorSim < umbral) {
        if (typeof debug !== 'undefined') {
          debug.log(`POI municipio [${nombre}] (${filtroQ}): sin match (${bindings.length} cands, Jaccard ${mejorSim >= 0 ? mejorSim.toFixed(2) : 'n/a'})`);
        }
        return null;
      }

      const resultado = {
        nombre:     mejorB.itemLabel ? mejorB.itemLabel.value : nombre,
        poblacion:  mejorB.poblacion  ? Math.round(Number(mejorB.poblacion.value))  : null,
        altitud:    mejorB.altitud    ? Math.round(Number(mejorB.altitud.value))    : null,
        superficie: mejorB.superficie ? Math.round(Number(mejorB.superficie.value)) : null,
      };
      if (typeof debug !== 'undefined') {
        debug.log(
          `POI municipio [${nombre}] (${filtroQ}): OK en ${dt}ms Jaccard ${mejorSim.toFixed(2)} · ` +
          `${resultado.poblacion != null ? resultado.poblacion + ' hab' : ''}` +
          `${resultado.altitud   != null ? ' · ' + resultado.altitud + 'm' : ''}`
        );
      }
      return resultado;
    }

    async function obtenerDatosMunicipio(nombre, lat, lon) {
      if (cacheMunicipio.has(nombre)) {
        if (typeof debug !== 'undefined') {
          debug.log(`POI municipio [${nombre}]: caché OK`);
        }
        return cacheMunicipio.get(nombre);
      }

      let resultado = null;
      let falloRed = false;

      // Capa 1: municipio oficial de España (Q2074737)
      try {
        resultado = await _buscarEnWikidata(nombre, lat, lon, 'Q2074737', JACCARD_MIN_MUNICIPIO);
      } catch (e) {
        if (typeof debug !== 'undefined') {
          debug.log(`POI municipio [${nombre}] (Q2074737): fallo (${e.message})`);
        }
        falloRed = true;
      }

      // Capa 2 (pedanías): entidad singular de población de España (Q56061)
      if (!resultado) {
        try {
          resultado = await _buscarEnWikidata(nombre, lat, lon, 'Q56061', JACCARD_MIN_PEDANIA);
        } catch (e) {
          if (typeof debug !== 'undefined') {
            debug.log(`POI municipio [${nombre}] (Q56061): fallo (${e.message})`);
          }
          falloRed = true;
        }
      }

      // Solo cachear si tenemos un resultado, O si ninguna capa falló por red
      // (resultado null legítimo = Wikidata respondió pero no hay datos).
      // Si al menos una capa falló por red con resultado null, no cachear:
      // el próximo tick fuera del radio de caché lo reintentará.
      if (resultado !== null || !falloRed) {
        cacheMunicipio.set(nombre, resultado);
      }
      return resultado;
    }

    // --- API pública ---

    async function actualizar(lat, lon, municipioActual) {
      // Evitar llamadas paralelas: si hay una en curso devolvemos el último
      // resultado conocido sin bloquear el tick del GPS.
      if (enActualizacion) return ultimoResultado;
      enActualizacion = true;

      try {
        // Paso 1: pueblos cercanos (con caché)
        const pueblos = await obtenerPueblosCercanos(lat, lon);

        // Pasos 2 y 3: POIs + enriquecimiento por pueblo (secuencial para no
        // martillear Wikidata; las llamadas están cacheadas tras la primera vez)
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
        }

        // Paso 4: datos del municipio actual
        let datosMunicipio = null;
        if (municipioActual) {
          try {
            datosMunicipio = await obtenerDatosMunicipio(municipioActual, lat, lon);
          } catch (e) {
            if (typeof debug !== 'undefined') {
              debug.log(`POI municipio [${municipioActual}]: fallo (${e.message})`);
            }
          }
        }

        ultimoResultado = { pueblosCercanos: pueblosConPOIs, datosMunicipio };

        if (typeof debug !== 'undefined') {
          const totalPOIs = pueblosConPOIs.reduce((n, p) => n + p.pois.length, 0);
          debug.log(`POI: resultado listo · ${pueblosConPOIs.length} pueblos · ${totalPOIs} POIs`);
        }

        return ultimoResultado;
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

    return {
      actualizar,
      obtenerResultado: () => ultimoResultado,
      reset,
      // Expuestos para tests
      _jaccardSim: jaccardSim,
      _parsearPOIs: parsearPOIs,
      _iconoPorTipo: iconoPorTipo,
    };

  })();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.POIModule;
  }
})();
