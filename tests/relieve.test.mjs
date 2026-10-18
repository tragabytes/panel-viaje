// Relieve del radar (specs/002-radar-relieve).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Relieve = require('../js/relieve.js');
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const cerca = (a, b, tol) => Math.abs(a - b) <= tol;

test('la proyección de las teselas cuadra con los valores conocidos', () => {
  const p = Relieve.pixelGlobal(0, 0, 0);
  assert.ok(cerca(p.x, 128, 1e-9) && cerca(p.y, 128, 1e-9));
  assert.ok(cerca(Relieve.pixelGlobal(40, -180, 10).x, 0, 1e-9));
  assert.ok(cerca(Relieve.metrosPorPixel(0, 0), 156543.03, 0.01));
  // A zoom 10 y latitud de Madrid, ~116 m por píxel.
  assert.ok(cerca(Relieve.metrosPorPixel(40.4, 10), 116.4, 0.5));
});

// Impide: bajar teselas de más (cada una ~135 KB de datos del móvil, regla 2).
test('un radar de 15 km necesita entre 1 y 4 teselas, incluida la de debajo', () => {
  const lista = Relieve.teselasParaVentana(40.4168, -3.7038, 15, 10);
  assert.ok(lista.length >= 1 && lista.length <= 4, `${lista.length} teselas`);
  const g = Relieve.pixelGlobal(40.4168, -3.7038, 10);
  const centro = { x: Math.floor(g.x / 256), y: Math.floor(g.y / 256) };
  assert.ok(lista.some((t) => t.x === centro.x && t.y === centro.y));
});

test('el zoom se elige por la escala del dibujo, entre 8 y 12', () => {
  assert.equal(Relieve.zoomPara(40, 10), 10);   // radar: 10 px por km
  assert.equal(Relieve.zoomPara(40, 25), 12);   // cuaderno: más cerca
  assert.equal(Relieve.zoomPara(40, 2), 8);
  assert.equal(Relieve.zoomPara(40, 500), 12);  // nunca más de 12
});

test('las alturas se leen del formato terrarium', () => {
  const rgba = new Uint8ClampedArray([128, 0, 0, 255, 128, 100, 128, 255, 127, 255, 0, 255]);
  const h = Relieve.decodificarTerrarium(rgba, 3, 1);
  assert.equal(h[0], 0);
  assert.equal(h[1], 100.5);
  assert.equal(h[2], -1); // mar: profundidad negativa
});

function terreno(ancho, alto, f) {
  const h = new Float32Array(ancho * alto);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) h[y * ancho + x] = f(x, y);
  return h;
}
const pixel = (rgba, ancho, x, y) => Array.from(rgba.slice((y * ancho + x) * 4, (y * ancho + x) * 4 + 3));
const brillo = (c) => c[0] + c[1] + c[2];

test('el llano es oscuro y uniforme, sin curvas', () => {
  const rgba = Relieve.sombrear(terreno(8, 8, () => 650), 8, 8, 117);
  const c0 = pixel(rgba, 8, 3, 3);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) assert.deepEqual(pixel(rgba, 8, x, y), c0);
  assert.ok(brillo(c0) < 60, `llano demasiado claro: ${c0}`);
});

test('la ladera que mira al noroeste se ve más clara que la que mira al sureste', () => {
  // Sube hacia el sureste: la ladera mira al noroeste (hacia la luz).
  const haciaLuz = Relieve.sombrear(terreno(8, 8, (x, y) => 600 + (x + y) * 15), 8, 8, 117);
  const contraLuz = Relieve.sombrear(terreno(8, 8, (x, y) => 600 - (x + y) * 15), 8, 8, 117);
  assert.ok(brillo(pixel(haciaLuz, 8, 3, 3)) > brillo(pixel(contraLuz, 8, 3, 3)) + 20);
});

test('las curvas de nivel aparecen donde se cruza un múltiplo de 100 m', () => {
  // De 950 a 1050 m de izquierda a derecha: la curva de 1000 m cae en medio.
  const rgba = Relieve.sombrear(terreno(11, 3, (x) => 950 + x * 10), 11, 3, 117);
  const enCurva = pixel(rgba, 11, 4, 1);   // 990 → su vecino derecho es 1000
  const fuera = pixel(rgba, 11, 1, 1);     // 960 → 970, sin cruzar
  assert.ok(enCurva[1] > fuera[1] + 10, `curva ${enCurva} vs fuera ${fuera}`);
});

// Impide: una raya oscura en la junta de cada tesela (cada ~30 km) sobre las
// montañas: en el borde, la pendiente salía a la mitad.
test('en el borde de la tesela, una ladera se ve igual que en el centro', () => {
  // Ladera uniforme; se comparan píxeles a la misma altura (x + y igual), porque
  // el color también se aclara un poco con la altitud.
  const rgba = Relieve.sombrear(terreno(8, 8, (x, y) => 600 + (x + y) * 15), 8, 8, 117);
  assert.deepEqual(pixel(rgba, 8, 0, 4), pixel(rgba, 8, 2, 2));   // borde izquierdo
  assert.deepEqual(pixel(rgba, 8, 7, 0), pixel(rgba, 8, 3, 4));   // esquina superior derecha
});

test('el mar se pinta como mar y la costa se marca', () => {
  const rgba = Relieve.sombrear(terreno(4, 1, (x) => (x < 2 ? -20 : 5)), 4, 1, 117);
  const mar = pixel(rgba, 4, 0, 0);
  const costa = pixel(rgba, 4, 1, 0); // mar con tierra a la derecha
  assert.ok(mar[2] > mar[1] && mar[2] > mar[0], `mar ${mar}`);
  assert.ok(brillo(costa) > brillo(mar) + 60, `costa ${costa}`);
});

// Impide: que el service worker meta cada tesela en su caché de la app, que no
// tiene tope y se borra entera en cada versión (las teselas viven en IndexedDB).
test('el service worker deja pasar las teselas de relieve sin cachearlas', () => {
  const sw = readFileSync(join(RAIZ, 'service-worker.js'), 'utf8');
  const fetchHandler = sw.slice(sw.indexOf("addEventListener('fetch'"));
  const salto = fetchHandler.indexOf('esTeselaRelieve(');
  assert.ok(salto !== -1, 'el manejador fetch no comprueba esTeselaRelieve');
  assert.ok(salto < fetchHandler.indexOf('cacheFirst('), 'la comprobación tiene que ir antes de cacheFirst');
  assert.match(sw, new RegExp(Relieve.RUTA.replace(/\//g, '\\/')));
});

test('solo el relieve conoce su base de datos', () => {
  for (const ruta of ['js/main.js', 'js/cuaderno.js', 'service-worker.js']) {
    assert.equal(readFileSync(join(RAIZ, ruta), 'utf8').includes(Relieve.DB_NAME), false, ruta);
  }
});
