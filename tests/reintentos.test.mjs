// Lo que acaba de fallar no se repite en cada tick (D40).
//
// Se ejecutan con: node --test
//
// El 18/10 por Las Rozas, con el servidor de mapas caído, el panel repetía cada
// 50 m las búsquedas que acababan de fallar: la de Monte del Pilar seis veces
// (con Wikipedia y Photon detrás), las gasolineras y el código de la vía cada
// 30 s. Gastan datos y cargan a servidores que ya van mal. Aquí, con servidores
// falsos y el reloj de mentira (mock.timers), sin ninguna petición real.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Geo = require('../js/geo.js');

const CINCO_MIN = 5 * 60 * 1000;
const cuentas = { overpass: 0, wikipedia: 0, photon: 0 };
globalThis.Overpass = {
  query: async () => { cuentas.overpass++; throw new Error('todos_mirrors_fallaron'); },
  distanciaMetros: Geo.distanciaMetros,
};
globalThis.POIIdb = { leer: async () => null, guardar: () => {} };
globalThis.POIFuentes = {
  MAX_POIS_POR_PUEBLO: 3,
  construirQueryPOIs: () => '[pois]',
  parsearPOIs: () => [],
  obtenerPOIsWikipedia: async () => { cuentas.wikipedia++; return []; },
  obtenerPOIsPhoton: async () => { cuentas.photon++; throw new Error('HTTP 503'); },
};
require('../js/pois/core.js');
const POIModule = globalThis.POIModule;
const Gasolineras = require('../js/gasolineras.js');
const RoadRef = require('../js/roadref.js');

function reloj(t) {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  t.after(() => mock.timers.reset());
  for (const k of Object.keys(cuentas)) cuentas[k] = 0;
}

// Impide: Monte del Pilar seis veces en siete minutos el 18/10.
test('los puntos de interés de un pueblo que fallaron no se buscan otra vez hasta pasados 5 minutos', async (t) => {
  reloj(t);
  POIModule.reset();
  assert.deepEqual(await POIModule._obtenerPOIsPueblo('Monte del Pilar', 40.46, -3.84), []);
  assert.deepEqual(cuentas, { overpass: 1, wikipedia: 1, photon: 1 });

  mock.timers.tick(CINCO_MIN - 1000);
  assert.deepEqual(await POIModule._obtenerPOIsPueblo('Monte del Pilar', 40.46, -3.84), []);
  assert.deepEqual(cuentas, { overpass: 1, wikipedia: 1, photon: 1 }, 'antes de 5 minutos no se pregunta');

  mock.timers.tick(1000);
  await POIModule._obtenerPOIsPueblo('Monte del Pilar', 40.46, -3.84);
  assert.deepEqual(cuentas, { overpass: 2, wikipedia: 2, photon: 2 }, 'pasados 5 minutos se vuelve a probar');
});

test('el plazo es de cada pueblo: otro pueblo se busca igual', async (t) => {
  reloj(t);
  POIModule.reset();
  await POIModule._obtenerPOIsPueblo('Monte del Pilar', 40.46, -3.84);
  await POIModule._obtenerPOIsPueblo('El Mayorazgo', 40.45, -3.83);
  assert.equal(cuentas.overpass, 2);
});

// Impide: las gasolineras otra vez a los 30 s, en el mismo sitio, tras un fallo.
test('tras un fallo, las gasolineras no se piden en el mismo sitio hasta pasados 5 minutos', async (t) => {
  reloj(t);
  Gasolineras.reset();
  await Gasolineras.actualizar(40.4892, -3.8759);
  mock.timers.tick(CINCO_MIN - 1000);
  await Gasolineras.actualizar(40.4893, -3.8760);
  assert.equal(cuentas.overpass, 1, 'antes de 5 minutos no se pregunta');
  mock.timers.tick(1000 + 1);
  await Gasolineras.actualizar(40.4893, -3.8760);
  assert.equal(cuentas.overpass, 2);
});

// Impide: el código de la vía otra vez a los 30 s, en el mismo sitio, tras un fallo.
test('tras un fallo, el código de la vía no se pide en el mismo sitio hasta pasados 5 minutos', async (t) => {
  reloj(t);
  await RoadRef.consultar(40.5111, -3.9237);
  mock.timers.tick(CINCO_MIN - 1000);
  await RoadRef.consultar(40.5112, -3.9238);
  assert.equal(cuentas.overpass, 1, 'antes de 5 minutos no se pregunta');
  mock.timers.tick(1000 + 1);
  await RoadRef.consultar(40.5112, -3.9238);
  assert.equal(cuentas.overpass, 2);
});

// Impide: tomar por fallo una consulta que se quitó de la fila porque llegó otra
// más nueva: se apuntaría como "sin código" cinco minutos en ese sitio.
test('una consulta de la vía sustituida en la fila no cuenta como fallo', async (t) => {
  reloj(t);
  const original = globalThis.Overpass.query;
  t.after(() => { globalThis.Overpass.query = original; });
  globalThis.Overpass.query = async () => { cuentas.overpass++; throw new Error('reemplazada'); };
  await RoadRef.consultar(40.6000, -3.9000);
  await RoadRef.consultar(40.6001, -3.9001);
  assert.equal(cuentas.overpass, 2, 'en el mismo sitio se vuelve a preguntar');
});
