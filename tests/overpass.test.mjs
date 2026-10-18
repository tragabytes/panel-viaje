// Overpass: un servidor que no contesta no puede frenar la vía (DECISIONES D7).
//
// Se ejecutan con: node --test
//
// Los servidores son falsos (un fetch de mentira) y el reloj también (mock.timers):
// así se prueba la espera de 8 s sin esperar y sin mandar ni una petición real.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RUTA = require.resolve('../js/overpass.js');

// Overpass guarda estado (servidores apartados, fila): cada test lo carga de cero.
function cargarOverpass() {
  delete require.cache[RUTA];
  delete globalThis.Overpass;
  return require(RUTA);
}

// fetch falso: el servidor `muerto` no contesta nunca (solo se rinde cuando el
// panel corta la espera); los demás contestan cuando se llama a `responder`.
function servidoresFalsos({ muerto, alInstante = true }) {
  const llamadas = [];
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    const host = url.split('/')[2];
    const query = decodeURIComponent(opts.body.slice('data='.length));
    const responder = () => resolve({ ok: true, status: 200, json: async () => ({ elements: [] }) });
    llamadas.push({ host, query, responder });
    opts.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
    if (host !== muerto && alInstante) responder();
  });
  return llamadas;
}

const vaciarMicrotareas = () => new Promise((r) => setImmediate(r));

async function avanzar(ms) {
  for (let t = 0; t < ms; t += 100) {
    mock.timers.tick(100);
    await vaciarMicrotareas();
  }
}

// Impide: con un servidor callado, cada consulta vuelve a esperarle 8 s y la vía
// tarda más de un minuto en salir (medido en la ruta M-505 del simulador, D7).
test('con un servidor que no contesta, la vía sale en menos de 10 s', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  servidoresFalsos({ muerto: Overpass.MIRRORS[0].split('/')[2] });

  // Lo que pasa al arrancar: pueblos y puntos de interés piden a la vez que la vía.
  for (const nombre of ['POI-pueblos', 'POI-gasolineras', 'POI-cultura']) {
    Overpass.query(`[${nombre}]`, nombre).catch(() => {});
  }
  let viaEn = null;
  Overpass.query('[RoadRef]', 'RoadRef').then(() => { viaEn = Date.now(); });

  await avanzar(20000);
  assert.ok(viaEn !== null, 'la vía no ha salido en 20 s');
  assert.ok(viaEn < 10000, `la vía ha tardado ${viaEn / 1000} s`);
});

// Impide: la consulta de la vía (la más ligera y la más importante) esperando en
// la fila detrás de las de pueblos y puntos de interés (23 s en la M-505, D7).
test('la consulta de la vía se cuela en la fila', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  const llamadas = servidoresFalsos({ muerto: null, alInstante: false });

  for (const nombre of ['POI-pueblos', 'POI-gasolineras', 'POI-cultura']) {
    Overpass.query(`[${nombre}]`, nombre).catch(() => {});
  }
  Overpass.query('[RoadRef]', 'RoadRef').catch(() => {});
  await vaciarMicrotareas();
  assert.deepEqual(llamadas.map((l) => l.query), ['[POI-pueblos]', '[POI-gasolineras]']);

  llamadas[0].responder();
  await vaciarMicrotareas();
  assert.equal(llamadas[2].query, '[RoadRef]');
});
