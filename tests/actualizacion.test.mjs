// Actualizaciones que entran solas, sin recargar nunca en marcha (DECISIONES D24).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const A = require('../js/actualizacion.js');

const S = 1000;
const MIN = 60 * S;
// Estado base: versión nueva lista, app abierta hace 10 min, GPS dando datos.
const base = (cambios) => Object.assign({
  pendiente: true, ahora: 100 * MIN, arranque: 90 * MIN,
  hayGps: true, ultimoTick: 100 * MIN - 1 * S, paradoDesde: null, ultimaRecarga: null,
}, cambios);

// Impide lo que pidió Laureano: que el panel se recargue en marcha.
test('en marcha no se recarga nunca', () => {
  assert.equal(A.debeRecargar(base({ paradoDesde: null })), false);
  // Ni recién abierta, si ya va en marcha.
  assert.equal(A.debeRecargar(base({ arranque: 100 * MIN - 20 * S, paradoDesde: null })), false);
});

// Impide recargar en un semáforo largo a mitad de viaje.
test('parado un rato corto (un semáforo) no se recarga; parado 3 minutos, sí', () => {
  assert.equal(A.debeRecargar(base({ paradoDesde: 100 * MIN - 90 * S })), false);
  assert.equal(A.debeRecargar(base({ paradoDesde: 100 * MIN - 3 * MIN - 1 * S })), true);
});

test('recién abierta y parada, se recarga enseguida (la versión nueva entra al arrancar)', () => {
  assert.equal(A.debeRecargar(base({ arranque: 100 * MIN - 25 * S, paradoDesde: 100 * MIN - 2 * S })), true);
});

// Impide recargar en un túnel: sin GPS reciente no se sabe si va parado.
test('sin datos recientes del GPS (túnel) no se recarga', () => {
  assert.equal(A.debeRecargar(base({ ultimoTick: 100 * MIN - 40 * S, paradoDesde: 100 * MIN - 10 * MIN })), false);
});

test('sin GPS en toda la sesión (en casa, sin permiso) sí se recarga', () => {
  assert.equal(A.debeRecargar(base({ hayGps: false, ultimoTick: null })), true);
});

// Impide un bucle de recargas si algo sale mal.
test('nunca dos recargas seguidas en menos de un minuto', () => {
  assert.equal(A.debeRecargar(base({ hayGps: false, ultimoTick: null, ultimaRecarga: 100 * MIN - 20 * S })), false);
});

test('sin versión nueva, nada', () => {
  assert.equal(A.debeRecargar(base({ pendiente: false, hayGps: false })), false);
});
