// Cuaderno de viaje, H1: marcar un momento sin mirar (specs/001-cuaderno-de-viaje).
//
// Se ejecutan con: node --test
//
// El gesto se prueba con un reloj falso (mock.timers). Que las marcas sobrevivan
// se prueba sobre el texto del código: ningún otro módulo puede tocar su base de
// datos. Cada comprobación sobre texto lleva su caso roto a propósito.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Cuaderno = require('../js/cuaderno.js');
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

// ---------------------------------------------------------------- el gesto

function detectorConReloj(t) {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  let marcas = 0;
  const d = Cuaderno.crearDetectorToqueLargo(() => { marcas++; });
  return { d, marcas: () => marcas };
}

// Deslizamiento normal entre vistas: el dedo recorre 300 px en 300 ms.
function deslizar(d, id, { esperaAntesMs = 0 } = {}) {
  d.down(id, 400, 200, true);
  mock.timers.tick(esperaAntesMs);
  for (let i = 1; i <= 10; i++) {
    d.move(id, 400 - i * 30, 200);
    mock.timers.tick(30);
  }
  d.up(id);
}

test('mantener el dedo quieto 1 s marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(1000);
  assert.equal(marcas(), 1);
  d.up(1);
  assert.equal(marcas(), 1);
});

test('un temblor de pocos píxeles no cancela', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(400);
  d.move(1, 304, 203);
  mock.timers.tick(600);
  assert.equal(marcas(), 1);
});

// Impide: marcas falsas al pasar de una vista a otra (R-005, E-003).
test('deslizar entre las 4 vistas no marca nunca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  for (let id = 1; id <= 6; id++) deslizar(d, id);
  // Dedo apoyado un rato antes de deslizar: el caso más traicionero.
  deslizar(d, 7, { esperaAntesMs: 900 });
  mock.timers.tick(5000);
  assert.equal(marcas(), 0);
});

test('soltar antes de 1 s no marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(900);
  d.up(1);
  mock.timers.tick(2000);
  assert.equal(marcas(), 0);
});

test('si el navegador empieza a desplazar la vista, no marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(500);
  d.up(1); // pointercancel
  mock.timers.tick(2000);
  assert.equal(marcas(), 0);
});

test('con un segundo dedo, no marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(300);
  d.down(2, 500, 200, false);
  mock.timers.tick(2000);
  assert.equal(marcas(), 0);
});

// ---------------------------------------------------------------- la marca

const POS = { lat: 42.4597, lon: -6.1964, precision: 6, rumbo: 270, velocidadKmh: 90, ts: 1000 };

test('la marca guarda hora, posición, precisión, sentido y velocidad', () => {
  const m = Cuaderno.construirMarca(POS, 3000, null);
  assert.deepEqual(m, {
    id: 3000, lat: 42.4597, lon: -6.1964, precisionM: 6, rumbo: 270,
    velocidadKmh: 90, posicionTs: 1000, aproximada: false,
  });
});

// Impide: dos marcas por un doble toque nervioso (criterio 4 de H1).
test('dos marcas en menos de 10 s son una', () => {
  assert.equal(Cuaderno.construirMarca(POS, 9999, 1000), null);
  assert.notEqual(Cuaderno.construirMarca(POS, 11000, 1000), null);
});

test('parado, el sentido de la marcha queda desconocido', () => {
  const m = Cuaderno.construirMarca({ ...POS, velocidadKmh: 0 }, 3000, null);
  assert.equal(m.rumbo, null);
});

test('con la última posición de hace rato (túnel), la marca es aproximada', () => {
  assert.equal(Cuaderno.construirMarca(POS, 1000 + 31000, null).aproximada, true);
});

test('sin GPS todavía, se guarda igual: la hora, sin posición, aproximada', () => {
  const m = Cuaderno.construirMarca(null, 3000, null);
  assert.equal(m.id, 3000);
  assert.equal(m.lat, null);
  assert.equal(m.aproximada, true);
});

// ---------------------------------------------------------------- que no se pierdan

function ficherosJs(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return ficherosJs(ruta);
    return nombre.endsWith('.js') ? [ruta] : [];
  });
}

function hacePeticiones(codigo) {
  return /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket/.test(codigo);
}

// Impide: que marcar gaste datos (R-003) y que, sin red, marcar se cuelgue.
test('el cuaderno no hace ninguna petición a internet', () => {
  assert.equal(hacePeticiones(leer('js/cuaderno.js')), false);
});

test('(control) la comprobación de peticiones detecta un fetch', () => {
  assert.equal(hacePeticiones("await fetch('https://nominatim.openstreetmap.org/x')"), true);
});

function quienNombra(nombre, ficheros) {
  return ficheros.filter(([, texto]) => texto.includes(nombre)).map(([ruta]) => ruta);
}

// Impide: que la rotación de logs, una limpieza de cachés o el service worker
// borren marcas (R-004, regla 9). Nadie más que cuaderno.js nombra su base.
test('solo el cuaderno conoce su base de datos', () => {
  const ficheros = [...ficherosJs(join(RAIZ, 'js')), join(RAIZ, 'service-worker.js')]
    .map((ruta) => [relative(RAIZ, ruta).replace(/\\/g, '/'), readFileSync(ruta, 'utf8')]);
  assert.deepEqual(quienNombra(Cuaderno.DB_NAME, ficheros), ['js/cuaderno.js']);
});

test('(control) la comprobación detecta otro módulo que abre la base', () => {
  const ficheros = [['js/cuaderno.js', "'panel-viaje-cuaderno'"], ['js/trayectos.js', "indexedDB.deleteDatabase('panel-viaje-cuaderno')"]];
  assert.deepEqual(quienNombra('panel-viaje-cuaderno', ficheros), ['js/cuaderno.js', 'js/trayectos.js']);
});

function borraEnBloque(codigo) {
  return /deleteDatabase|\.clear\s*\(/.test(codigo);
}

test('el cuaderno no tiene ningún borrado en bloque', () => {
  assert.equal(borraEnBloque(leer('js/cuaderno.js')), false);
});

test('(control) la comprobación de borrado en bloque detecta un clear()', () => {
  assert.equal(borraEnBloque("tx.objectStore('marcas').clear()"), true);
});

test('el service worker no toca IndexedDB', () => {
  assert.equal(/indexedDB/.test(leer('service-worker.js')), false);
});
