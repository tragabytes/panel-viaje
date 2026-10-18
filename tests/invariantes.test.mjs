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
    .filter((url) => !url.startsWith('http://www.w3.org/')); // espacios de nombres SVG, no son peticiones
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
