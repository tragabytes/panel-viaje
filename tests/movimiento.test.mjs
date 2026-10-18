// Velocidad y rumbo de cada posición del GPS (js/movimiento.js).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Movimiento = require('../js/movimiento.js');

const GALAPAGAR = { lat: 40.5786, lon: -4.0016 };
// 1 m al norte ≈ 0,000008993° de latitud; al este, dividido por cos(lat).
const alNorte = (m) => ({ latitude: GALAPAGAR.lat + m * 0.000008993, longitude: GALAPAGAR.lon });
const alEste = (m) => ({ latitude: GALAPAGAR.lat, longitude: GALAPAGAR.lon + m * 0.000008993 / Math.cos(GALAPAGAR.lat * Math.PI / 180) });
const fix = (p, extra) => Object.assign({ accuracy: 5, speed: null, heading: null }, p, extra);

test('si el GPS da el rumbo, manda el del GPS', () => {
  const m = Movimiento.crear();
  const r = m.actualizar(fix(alNorte(0), { heading: 123 }), 0);
  assert.equal(r.rumbo, 123);
  assert.equal(r.fuenteRumbo, 'gps');
});

// Impide: en el móvil viejo (heading null) la próxima salida no sabía hacia
// dónde ibas y podía enseñar la que dejabas atrás (PENDIENTES n.º 6).
test('sin rumbo del GPS, se calcula entre posiciones', () => {
  const m = Movimiento.crear();
  m.actualizar(fix(alNorte(0)), 0);
  const r = m.actualizar(fix(alNorte(30)), 1000);
  assert.equal(r.fuenteRumbo, 'calculado');
  assert.ok(Math.abs(r.rumbo) < 1 || Math.abs(r.rumbo - 360) < 1, `rumbo ${r.rumbo}`);
  const e = Movimiento.crear();
  e.actualizar(fix(alEste(0)), 0);
  assert.ok(Math.abs(e.actualizar(fix(alEste(40)), 1000).rumbo - 90) < 1);
});

test('con menos de 25 m entre posiciones no hay rumbo (sería ruido)', () => {
  const m = Movimiento.crear();
  m.actualizar(fix(alNorte(0)), 0);
  assert.equal(m.actualizar(fix(alNorte(15)), 1000).rumbo, null);
});

test('con mala precisión no se calcula: el radar no gira en un semáforo', () => {
  const m = Movimiento.crear();
  m.actualizar(fix(alNorte(0), { accuracy: 30 }), 0);
  assert.equal(m.actualizar(fix(alNorte(40), { accuracy: 30 }), 1000).rumbo, null);
});

test('un rumbo calculado caduca a los 15 s sin moverse', () => {
  const m = Movimiento.crear();
  m.actualizar(fix(alNorte(0)), 0);
  m.actualizar(fix(alNorte(30)), 1000);
  assert.notEqual(m.actualizar(fix(alNorte(31)), 15000).rumbo, null);
  assert.equal(m.actualizar(fix(alNorte(32)), 16001).rumbo, null);
});

test('sin velocidad del GPS, se calcula con distancia y tiempo', () => {
  const m = Movimiento.crear();
  assert.equal(m.actualizar(fix(alNorte(0)), 0).velKmh, null);
  const r = m.actualizar(fix(alNorte(100)), 4000);
  assert.equal(r.fuenteVel, 'calculada');
  assert.ok(Math.abs(r.velKmh - 90) < 1, `${r.velKmh}`);
});

test('tras un hueco de más de un minuto, la velocidad media no vale', () => {
  const m = Movimiento.crear();
  m.actualizar(fix(alNorte(0)), 0);
  assert.equal(m.actualizar(fix(alNorte(2000)), 61000).velKmh, null);
});

test('si el GPS da la velocidad, manda la del GPS', () => {
  const m = Movimiento.crear();
  const r = m.actualizar(fix(alNorte(0), { speed: 25 }), 0);
  assert.equal(r.velKmh, 90);
  assert.equal(r.fuenteVel, 'gps');
});
