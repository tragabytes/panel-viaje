// Reglas de CLAUDE.md que pueden romperse sin que nadie se entere.
//
// Cada test dice qué fallo concreto impide. Se ejecutan con: node --test
//
// Cada comprobación es una función pura sobre el texto, y va acompañada de un
// caso roto a propósito: así se sabe que el test detecta el fallo, no solo que
// hoy pasa.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

// ---------------------------------------------------------------- regla 7

function scriptsLocales(html) {
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((src) => !/^https?:/.test(src));
}

function listaPrecache(sw) {
  const bloque = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  if (!bloque) return [];
  return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, ''));
}

function scriptsSinPrecache(html, sw) {
  const precache = new Set(listaPrecache(sw));
  return scriptsLocales(html).filter((src) => !precache.has(src));
}

// Impide: un .js nuevo que se carga en index.html pero no se precarga, así que
// el panel muere sin cobertura (o se queda con una versión vieja) sin avisar.
test('todo script de index.html está en el precache del service worker', () => {
  const faltan = scriptsSinPrecache(leer('index.html'), leer('service-worker.js'));
  assert.deepEqual(faltan, [], `Añadir a PRECACHE en service-worker.js: ${faltan.join(', ')}`);
});

test('todo lo precargado existe en el repo', () => {
  const faltan = listaPrecache(leer('service-worker.js'))
    .filter((ruta) => ruta !== '' && !existsSync(join(RAIZ, ruta)));
  assert.deepEqual(faltan, [], `PRECACHE apunta a ficheros que no existen: ${faltan.join(', ')}`);
});

test('(control) la comprobación del precache detecta un script olvidado', () => {
  const html = '<script src="js/a.js"></script><script src="js/nuevo.js"></script>';
  const sw = "const PRECACHE = [\n  './js/a.js',\n];";
  assert.deepEqual(scriptsSinPrecache(html, sw), ['js/nuevo.js']);
});

function precargaPideFicherosNuevos(sw) {
  const install = sw.match(/addEventListener\('install'[\s\S]*?\n\}\);/);
  return !!install && /cache:\s*'reload'/.test(install[0]);
}

// Impide: que una versión nueva del service worker se instale con los ficheros
// viejos de la caché normal del navegador (10 min en GitHub Pages), y el panel
// se quede con la versión anterior hasta la siguiente publicación (D15).
test('al instalarse, el service worker baja los ficheros de nuevo', () => {
  assert.ok(precargaPideFicherosNuevos(leer('service-worker.js')),
    "La precarga del evento install tiene que pedir cada fichero con { cache: 'reload' }");
});

test('(control) la comprobación de la precarga detecta un addAll directo', () => {
  const sw = "self.addEventListener('install', (event) => {\n  event.waitUntil(caches.open(C).then((c) => c.addAll(PRECACHE)));\n});";
  assert.equal(precargaPideFicherosNuevos(sw), false);
});

// ---------------------------------------------------------------- regla 8

function stubAntesDeScripts(html) {
  const stub = html.search(/window\.debug\s*=\s*\{/);
  const primerScript = html.search(/<script\s+src="/);
  return stub !== -1 && primerScript !== -1 && stub < primerScript;
}

// Impide: que un fallo al cargar debug.js (3G con cortes, primera visita) tumbe
// el arranque entero con un ReferenceError (P18, DT-17).
test('index.html crea el sustituto de debug antes de cargar ningún script', () => {
  assert.ok(stubAntesDeScripts(leer('index.html')),
    'window.debug = { ... } tiene que estar en un <script> en línea antes del primer <script src>');
});

test('(control) la comprobación del sustituto detecta que falta', () => {
  assert.equal(stubAntesDeScripts('<script src="js/main.js"></script><script>window.debug = {}</script>'), false);
});

// ---------------------------------------------------------------- HTTPS

function ficherosJs(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return ficherosJs(ruta);
    return nombre.endsWith('.js') ? [ruta] : [];
  });
}

function urlsSinHttps(texto) {
  return [...texto.matchAll(/['"`](http:\/\/[^'"`\s]+)/g)]
    .map((m) => m[1])
    // Espacios de nombres (SVG, KML del cuaderno): identificadores, no peticiones.
    .filter((url) => !url.startsWith('http://www.w3.org/') && !url.startsWith('http://www.opengis.net/'));
}

// Impide: una petición por http:// que el navegador bloquea en una página HTTPS
// (el bloque afectado se queda vacío sin error visible).
test('ningún módulo pide nada por http://', () => {
  const malas = [...ficherosJs(join(RAIZ, 'js')), join(RAIZ, 'index.html')]
    .flatMap((ruta) => urlsSinHttps(readFileSync(ruta, 'utf8')).map((url) => `${ruta}: ${url}`));
  assert.deepEqual(malas, []);
});

test('(control) la comprobación de HTTPS detecta una URL insegura', () => {
  assert.deepEqual(urlsSinHttps("fetch('http://api.ejemplo.es/x')"), ['http://api.ejemplo.es/x']);
});

// ---------------------------------------------------------------- DT-11

// El service worker cargado tal cual, con un `self` de mentira: sus funciones
// quedan a mano para probarlas.
function cargarServiceWorker() {
  const ctx = { self: { addEventListener() {} }, URL, console };
  vm.createContext(ctx);
  vm.runInContext(leer('service-worker.js'), ctx);
  return ctx;
}

// Impide: que cada búsqueda de Wikipedia por coordenadas (una URL distinta por
// sitio) se guarde en la caché del service worker y la llene sin servir nunca.
// La de pueblos cambió de forma el 18/10 (list= → generator=) y se colaba.
test('las búsquedas de Wikipedia por coordenadas no se guardan en la caché', () => {
  const sw = cargarServiceWorker();
  assert.equal(sw.esApiCacheable('https://es.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=40|-4'), false);
  assert.equal(sw.esApiCacheable('https://es.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=40|-4'), false);
  assert.equal(sw.esApiCacheable('https://es.wikipedia.org/api/rest_v1/page/summary/Astorga'), true);
});

// ---------------------------------------------------------------- tick del GPS

// Las llamadas opcionales del tick que no van protegidas por sinRomper().
const OPCIONALES_TICK = ['RadarV4.posicion(', 'PaisajeFX.setVelocidad(', 'PaisajeFX.setPosicion(',
  'ModoNoche.posicion(', 'Actualizacion.gps(', 'comprobarAquiMarcaste(', 'actualizarPostales('];
function opcionalesSinProteger(main) {
  const ini = main.indexOf('function alRecibirPosicion(');
  const fin = main.indexOf('\n    }\n', ini);
  if (ini < 0 || fin < 0) return ['(no encuentro alRecibirPosicion)'];
  const malas = [];
  let dentro = false; // dentro de un sinRomper('…', () => { … });
  for (const linea of main.slice(ini, fin).split('\n')) {
    if (/sinRomper\(.*=>\s*\{\s*$/.test(linea)) { dentro = true; continue; }
    if (dentro && /^\s*\}\);\s*$/.test(linea)) { dentro = false; continue; }
    for (const op of OPCIONALES_TICK) {
      const i = linea.indexOf(op);
      if (i < 0) continue;
      if (!dentro && linea.lastIndexOf('sinRomper(', i) < 0) malas.push(linea.trim());
    }
  }
  return malas;
}

// Impide: que un fallo en el radar, el paisaje o un aviso corte el tick del
// GPS y deje el panel sin pueblo, vía ni tiempo (lo de después no corre).
test('en el tick del GPS, lo opcional va protegido', () => {
  assert.deepEqual(opcionalesSinProteger(leer('js/main.js')), []);
});

test('(control) la comprobación detecta una llamada opcional sin proteger', () => {
  const main = "    function alRecibirPosicion(pos) {\n      sinRomper('Radar', () => RadarV4.posicion(p));\n      ModoNoche.posicion(1, 2);\n    }\n";
  assert.deepEqual(opcionalesSinProteger(main), ['ModoNoche.posicion(1, 2);']);
});

// ---------------------------------------------------------------- spec 005: la clave fuera del código

// Algo con forma de clave de GitHub (las de grano fino y las clásicas).
const FORMA_DE_CLAVE = /github_pat_[A-Za-z0-9_]{60,}|gh[pousr]_[A-Za-z0-9]{36,}/;
function ficherosPublicados() {
  const raiz = ['index.html', 'manifest.webmanifest', 'service-worker.js'].map((f) => join(RAIZ, f));
  return raiz.concat(ficherosJs(join(RAIZ, 'js')), readdirSync(join(RAIZ, 'css')).map((f) => join(RAIZ, 'css', f)));
}

// Impide: una clave pegada por error en el código publicado, que sería de
// cualquiera (R-003). La clave vive solo en el móvil.
test('ningún fichero publicado contiene algo con forma de clave de GitHub', () => {
  const con = ficherosPublicados().filter((ruta) => FORMA_DE_CLAVE.test(readFileSync(ruta, 'utf8')));
  assert.deepEqual(con, []);
});

test('(control) la comprobación de claves detecta una pegada en el código', () => {
  assert.equal(FORMA_DE_CLAVE.test("const t = 'ghp_0123456789abcdefghijklmnopqrstuvwxyzAB';"), true);
  assert.equal(FORMA_DE_CLAVE.test("if (pareceClave(texto)) guardar(texto);"), false);
});

// Impide: que el service worker guarde en su caché respuestas de la API de
// GitHub (pedidas con la clave): saldrían viejas o se quedarían en el móvil.
test('el service worker deja pasar la API de GitHub sin guardarla', () => {
  const sw = cargarServiceWorker();
  assert.equal(sw.esNube('https://api.github.com/repos/tragabytes/panel-viaje-logs/contents/logs/x.txt.gz'), true);
  assert.equal(sw.esNube('https://es.wikipedia.org/w/api.php'), false);
  const fetchHandler = leer('service-worker.js').slice(leer('service-worker.js').indexOf("addEventListener('fetch'"));
  assert.ok(fetchHandler.indexOf('esNube(') !== -1 && fetchHandler.indexOf('esNube(') < fetchHandler.indexOf('cacheFirst('));
});
