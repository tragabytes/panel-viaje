// js/pois/fuentes.js — DT-10 (sesión 33)
//
// Consultas a fuentes externas para el POIModule. Expone POIFuentes con:
//   construirQueryPueblos(lat, lon) → string QL Overpass
//   construirQueryPOIs(lat, lon) → string QL Overpass
//   parsearPOIs(datos, centroLat, centroLon) → array de POIs
//   obtenerPueblosWikipedia(lat, lon) → Promise<array>
//   obtenerPOIsWikipedia(nombre, lat, lon) → Promise<array>
//   obtenerPOIsPhoton(nombre, lat, lon) → Promise<array>
//   consultarWikipedia(nombre) → Promise<{texto, foto}>
//   consultarWikidataProximidad(poi) → Promise<{foto, texto, sim}|null>
//   buscarMunicipioEnWikidata(nombre, lat, lon, filtroQ, umbral) → Promise<obj|null>
//
// Constantes de radios/timeouts y endpoints viven aquí para que el core
// no tenga que conocerlas. Todas las funciones asumen que Overpass, Geo
// y POIMatch están cargados globalmente.

(function () {
  'use strict';

  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  // --- Constantes de esta capa ---
  const RADIO_PUEBLOS_M = 15000;
  const RADIO_POIS_M = 1500;
  const RADIO_WIKIDATA_KM = 0.1;       // 100 m para enriquecimiento de POI
  const RADIO_MUNICIPIO_KM = 10;
  const MAX_PUEBLOS = 5;
  const MAX_POIS_POR_PUEBLO = 2;
  const TIMEOUT_WIKIPEDIA_MS = 8000;
  const TIMEOUT_WIKIDATA_MS = 12000;
  const TIMEOUT_PHOTON_MS = 8000;
  const PHOTON_RADIO_M = 3000;

  const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
  const WIKIPEDIA_ENDPOINT = 'https://es.wikipedia.org/api/rest_v1/page/summary';
  const PHOTON_ENDPOINT = 'https://photon.komoot.io/api';

  // --- Helpers ---

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

  // --- Paso 1: pueblos cercanos ---

  function construirQueryPueblos(lat, lon) {
    return (
      `[out:json][timeout:20];` +
      `node(around:${RADIO_PUEBLOS_M},${lat},${lon})` +
      `[place~"^(village|town|city|hamlet)$"]["name"];` +
      `out body;`
    );
  }

  // RA-01: Wikipedia geosearch para pueblos como fallback de Overpass.
  async function obtenerPueblosWikipedia(lat, lon) {
    const url = `https://es.wikipedia.org/w/api.php?action=query&list=geosearch` +
      `&gscoord=${lat}|${lon}&gsradius=10000&gslimit=50&format=json&origin=*`;
    const datos = await fetchConTimeout(url, {}, TIMEOUT_WIKIPEDIA_MS);
    const resultados = (datos.query && datos.query.geosearch) || [];
    const pueblos = resultados
      .filter(r => !POIMatch.EXCLUIR_GEOSEARCH.test(r.title))
      .map(r => ({
        nombre: r.title,
        lat: r.lat,
        lon: r.lon,
        distKm: r.dist / 1000,
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, MAX_PUEBLOS);
    if (typeof debug !== 'undefined') {
      debug.log(`POI pueblos [Wikipedia]: ${pueblos.length} de ${resultados.length} resultados · más cercano: ${pueblos[0] ? pueblos[0].nombre + ' (' + pueblos[0].distKm.toFixed(1) + 'km)' : 'ninguno'}`);
    }
    return pueblos;
  }

  // --- Paso 2: POIs por pueblo ---

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

  // PO-09: orden por (prioridad, distM) para que los POIs empaten por
  // cercanía al centro en municipios grandes como Medinaceli.
  function parsearPOIs(datos, centroLat, centroLon, PRIORIDAD) {
    return (datos.elements || [])
      .filter(el => el.tags && el.tags.name)
      .map(el => {
        const tipo = el.tags.historic || el.tags.tourism || el.tags.natural || 'attraction';
        const lat = el.lat != null ? el.lat : (el.center ? el.center.lat : null);
        const lon = el.lon != null ? el.lon : (el.center ? el.center.lon : null);
        const distM = (lat != null && lon != null && centroLat != null && centroLon != null)
          ? Overpass.distanciaMetros(centroLat, centroLon, lat, lon)
          : null;
        return { nombre: el.tags.name, tipo, lat, lon, distM };
      })
      .filter(p => p.lat != null && p.lon != null)
      .sort((a, b) => {
        const ia = PRIORIDAD.indexOf(a.tipo);
        const ib = PRIORIDAD.indexOf(b.tipo);
        const pa = ia === -1 ? 99 : ia;
        const pb = ib === -1 ? 99 : ib;
        if (pa !== pb) return pa - pb;
        return (a.distM ?? Infinity) - (b.distM ?? Infinity);
      });
  }

  // PO-12: Photon como fallback final cuando Overpass y Wikipedia vienen vacíos.
  async function obtenerPOIsPhoton(nombre, lat, lon) {
    // Photon acepta osm_tag pero se comporta errático con >5 valores
    // específicos (devuelve basura global). Usamos 5 tags clave que cubren
    // los tipos más frecuentes de patrimonio español.
    const tags = ['historic:castle','historic:church','historic:monastery',
                  'historic:chapel','historic:fort'];
    const filtros = tags.map(t => `osm_tag=${t}`).join('&');
    const url = `${PHOTON_ENDPOINT}?q=${encodeURIComponent(nombre)}&lat=${lat}&lon=${lon}&limit=10&${filtros}`;
    const datos = await fetchConTimeout(url, {}, TIMEOUT_PHOTON_MS);
    const feats = (datos.features || [])
      .filter(f => f.geometry && f.geometry.coordinates && f.properties && f.properties.name)
      .filter(f => f.properties.name.toLowerCase() !== nombre.toLowerCase())
      .map(f => {
        const [plon, plat] = f.geometry.coordinates;
        return {
          nombre: f.properties.name,
          tipo: f.properties.osm_value,
          lat: plat,
          lon: plon,
          distM: Overpass.distanciaMetros(lat, lon, plat, plon),
        };
      })
      .filter(p => p.distM <= PHOTON_RADIO_M)
      .sort((a, b) => a.distM - b.distM)
      .slice(0, MAX_POIS_POR_PUEBLO);
    if (typeof debug !== 'undefined') {
      const top = feats.map(p => `${p.tipo}:${p.nombre}`).join(', ');
      debug.log(`POI [${nombre}] [Photon]: ${feats.length} POIs${feats.length ? ' · ' + top : ''}`);
    }
    return feats;
  }

  // RA-02: Wikipedia geosearch fallback para POIs de un pueblo.
  async function obtenerPOIsWikipedia(nombre, lat, lon) {
    const url = `https://es.wikipedia.org/w/api.php?action=query&list=geosearch` +
      `&gscoord=${lat}|${lon}&gsradius=2000&gslimit=10&format=json&origin=*`;
    const datos = await fetchConTimeout(url, {}, TIMEOUT_WIKIPEDIA_MS);
    const resultados = (datos.query && datos.query.geosearch) || [];
    const nombreLower = nombre.toLowerCase();
    const pois = resultados
      .filter(r => r.title.toLowerCase() !== nombreLower && !POIMatch.EXCLUIR_GEOSEARCH.test(r.title))
      .map(r => ({ nombre: r.title, tipo: 'attraction', lat: r.lat, lon: r.lon, pageid: r.pageid }))
      .slice(0, MAX_POIS_POR_PUEBLO);
    if (typeof debug !== 'undefined') {
      const top = pois.map(p => p.nombre).join(', ');
      debug.log(`POI [${nombre}] [Wikipedia]: ${pois.length} de ${resultados.length} resultados${pois.length ? ' · ' + top : ''}`);
    }
    return pois;
  }

  // --- Paso 3: enriquecimiento ---

  async function consultarWikipedia(nombre) {
    const url = `${WIKIPEDIA_ENDPOINT}/${encodeURIComponent(nombre)}?width=100`;
    const datos = await fetchConTimeout(url, {}, TIMEOUT_WIKIPEDIA_MS);
    if (datos.type === 'disambiguation') throw new Error('disambiguation');
    if (datos.type === 'no-extract' || !datos.extract) throw new Error('sin-texto');
    return {
      texto: datos.extract || null,
      foto:  datos.thumbnail ? datos.thumbnail.source : null,
    };
  }

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
      const sim = POIMatch.matchLabels(poi.nombre, label, POIMatch.JACCARD_MIN_POI);
      if (sim > mejorSim) { mejorSim = sim; mejorB = b; }
    }
    if (!mejorB || mejorSim < POIMatch.JACCARD_MIN_POI) return null;
    return {
      foto: mejorB.image ? mejorB.image.value : null,
      texto: null,  // Wikidata no da resumen; solo foto
      sim: mejorSim,
    };
  }

  // --- Paso 4: datos del municipio ---

  async function buscarMunicipioEnWikidata(nombre, lat, lon, filtroQ, umbral) {
    const sparql = (
      `SELECT ?item ?itemLabel ?poblacion ?altitud ?superficie ?comarcaLabel WHERE {` +
      `  SERVICE wikibase:around {` +
      `    ?item wdt:P625 ?coords.` +
      `    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral.` +
      `    bd:serviceParam wikibase:radius "${RADIO_MUNICIPIO_KM}".` +
      `  }` +
      `  ?item wdt:P31 wd:${filtroQ}.` +
      `  OPTIONAL { ?item wdt:P1082 ?poblacion. }` +
      `  OPTIONAL { ?item wdt:P2044 ?altitud. }` +
      `  OPTIONAL { ?item wdt:P2046 ?superficie. }` +
      `  OPTIONAL { ?item wdt:P131 ?comarca. ?comarca wdt:P31 wd:Q56061. }` +
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
      const sim = POIMatch.matchLabels(nombre, label, umbral);
      if (sim > mejorSim) { mejorSim = sim; mejorB = b; }
    }

    if (!mejorB || mejorSim < umbral) {
      if (typeof debug !== 'undefined') {
        debug.log(`POI municipio [${nombre}] (${filtroQ}): sin match (${bindings.length} cands, Jaccard ${mejorSim >= 0 ? mejorSim.toFixed(2) : 'n/a'})`);
      }
      return null;
    }

    const resultado = {
      nombre:     mejorB.itemLabel    ? mejorB.itemLabel.value                     : nombre,
      poblacion:  mejorB.poblacion    ? Math.round(Number(mejorB.poblacion.value)) : null,
      altitud:    mejorB.altitud      ? Math.round(Number(mejorB.altitud.value))   : null,
      superficie: mejorB.superficie   ? Math.round(Number(mejorB.superficie.value)): null,
      comarca:    mejorB.comarcaLabel ? mejorB.comarcaLabel.value                  : null,
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

  __global__.POIFuentes = {
    // Overpass QL
    construirQueryPueblos,
    construirQueryPOIs,
    parsearPOIs,
    // fallbacks externos
    obtenerPueblosWikipedia,
    obtenerPOIsWikipedia,
    obtenerPOIsPhoton,
    // enriquecimiento
    consultarWikipedia,
    consultarWikidataProximidad,
    // municipio
    buscarMunicipioEnWikidata,
    // constantes útiles para el core
    RADIO_PUEBLOS_M,
    RADIO_POIS_M,
    MAX_PUEBLOS,
    MAX_POIS_POR_PUEBLO,
  };
})();
