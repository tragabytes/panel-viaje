// service-worker.js — DT-01 (sesión 33)
//
// Estrategia:
//   · Assets propios (HTML, JS, iconos): CacheFirst con versión en el nombre
//     de la caché. Cambiar SW_VERSION invalida todo.
//   · APIs externas: NetworkFirst con fallback a cache si existe una
//     respuesta previa, y respuesta JSON vacía si no. No guardamos tiles
//     de mapas (no los usamos) ni datos personales del track.
//
// Para forzar actualización, subir SW_VERSION.

const SW_VERSION = 'v14-2026-08-20-s49';
const APP_CACHE = `panel-viaje-app-${SW_VERSION}`;
const API_CACHE = `panel-viaje-api-${SW_VERSION}`;

// Assets precargados al instalar. Incluye todos los JS actuales y los iconos.
// Si se añaden nuevos módulos, incluirlos aquí y subir SW_VERSION.
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/style.css',
  './fonts/JetBrainsMono-Variable.woff2',
  './fonts/SpaceGrotesk-Variable.woff2',
  './fonts/ArchivoBlack-Regular.woff2',
  './js/geo.js',
  './js/trayectos.js',
  './js/debug.js',
  './js/wakelock.js',
  './js/carreteras.js',
  './js/overpass.js',
  './js/roadref.js',
  './js/location.js',
  './js/meteo_codigos.js',
  './js/weather.js',
  './js/motorwayexit.js',
  './js/gasolineras.js',
  './js/pois/match.js',
  './js/pois/idb.js',
  './js/pois/fuentes.js',
  './js/pois/core.js',
  './js/rutas.js',
  './js/simulator.js',
  './js/v2_rainfx.js',
  './js/v2_lightningfx.js',
  './js/v2_snowfx.js',
  './js/v2_fogfx.js',
  './js/main.js',
];

// Hosts de APIs externas: NetworkFirst con fallback silencioso.
const API_HOSTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.private.coffee',
  'nominatim.openstreetmap.org',
  'api.open-meteo.com',
  'es.wikipedia.org',
  'query.wikidata.org',
  'photon.komoot.io',
];

// DT-11: hosts cuyas URLs llevan coordenadas casi únicas (Nominatim en float
// completo, Open-Meteo/Photon a 5 decimales, SPARQL de Wikidata con
// Point(lon lat)). Cachear sus respuestas llenaba API_CACHE sin que el
// fallback offline acertara nunca: cada petición era una clave nueva.
// Wikipedia REST (por título) y las queries por pageids sí se cachean; su
// geosearch (por coordenada) no.
const API_NO_CACHEAR_HOSTS = [
  'nominatim.openstreetmap.org',
  'api.open-meteo.com',
  'photon.komoot.io',
  'query.wikidata.org',
];

function esApiCacheable(url) {
  try {
    const u = new URL(url);
    if (API_NO_CACHEAR_HOSTS.some((h) => u.hostname === h)) return false;
    if (u.hostname === 'es.wikipedia.org' && u.search.includes('list=geosearch')) return false;
    return true;
  } catch (e) {
    return false;
  }
}

// DT-11: tope de entradas de API_CACHE. Cache API devuelve keys() en orden
// de inserción → borrar por delante ≈ FIFO. 100 entradas cubren de sobra
// los summaries/pageids de Wikipedia de un viaje largo.
const MAX_API_ENTRIES = 100;
async function recortarApiCache(cache) {
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - MAX_API_ENTRIES; i++) {
    await cache.delete(claves[i]);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Borrar caches de versiones anteriores.
  event.waitUntil(
    caches.keys().then((claves) => Promise.all(
      claves
        .filter((c) => c !== APP_CACHE && c !== API_CACHE)
        .map((c) => caches.delete(c))
    )).then(() => self.clients.claim())
  );
});

function esApiExterna(url) {
  try {
    const u = new URL(url);
    return API_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch (e) {
    return false;
  }
}

async function networkFirst(request) {
  try {
    const resp = await fetch(request);
    // Solo cacheamos respuestas OK y GET. POSTs de Overpass no se cachean.
    // DT-11: y solo endpoints cacheables (sin coordenadas únicas en la URL).
    if (resp && resp.ok && request.method === 'GET' && esApiCacheable(request.url)) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, resp.clone())
        .then(() => recortarApiCache(cache))
        .catch(() => {});
    }
    return resp;
  } catch (err) {
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fallback silencioso: JSON vacío para que los consumidores no rompan.
    return new Response('{}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  // DT-11: ignoreSearch como cinturón — si alguna URL propia vuelve a llevar
  // query (?v=...), seguirá casando con el precache (que lista URLs limpias).
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone()).catch(() => {});
    return resp;
  } catch (err) {
    // Sin red y sin caché: no podemos devolver nada útil.
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo interceptamos GET (Overpass usa POST, lo dejamos pasar directo a red).
  if (req.method !== 'GET') return;

  if (esApiExterna(req.url)) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
