// La próxima salida (js/motorwayexit.js).
//
// Se ejecutan con: node --test

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../js/geo.js');
const Overpass = require('../js/overpass.js');
const Salidas = require('../js/motorwayexit.js');

// En la A-6 hacia el oeste: la salida 31 delante (~2,5 km) y la 30 detrás (~0,85 km).
const AQUI = { lat: 40.5, lon: -4.0 };
const DELANTE = { type: 'node', id: 31, lat: 40.5, lon: -4.03, tags: { ref: '31' } };
const DETRAS = { type: 'node', id: 30, lat: 40.5, lon: -3.99, tags: { ref: '30' } };

async function enMarcha(t) {
  mock.timers.enable({ apis: ['Date'], now: 1000000 });
  t.after(() => mock.timers.reset());
  Overpass.query = async () => ({ datos: { elements: [DELANTE, DETRAS] }, dt: 1 });
  Salidas.reset();
  const fix = (rumbo) => Object.assign({ rumbo, velocidadKmh: 100, roadRef: 'A-6' }, AQUI);
  Salidas.actualizar(fix(270));
  mock.timers.tick(31000);                 // 30 s por encima de 50 km/h: en marcha
  Salidas.actualizar(fix(270));            // lanza la consulta de las salidas
  await new Promise((r) => setImmediate(r));
  return fix;
}

test('con rumbo, la próxima salida es la de delante', async (t) => {
  const fix = await enMarcha(t);
  const r = Salidas.actualizar(fix(270));
  assert.equal(r.estado, 'ok');
  assert.equal(r.proxima.ref, '31');
});

// Impide: que sin rumbo (el móvil viejo no lo da y el calculado caduca con mala
// precisión) el cartel enseñe la salida que acabas de dejar atrás.
test('sin rumbo, no se enseña ninguna salida', async (t) => {
  const fix = await enMarcha(t);
  const r = Salidas.actualizar(fix(null));
  assert.equal(r.activo, false);
  assert.equal(r.estado, 'sin_rumbo');
  assert.equal(r.proxima, null);
});
