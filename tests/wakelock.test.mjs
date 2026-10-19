// La pantalla siempre encendida, también al volver con el móvil bloqueado (D40).
//
// Se ejecutan con: node --test
//
// Logs del 18/10 (16:29) y del 19/10 (7:30): al volver al panel con el móvil
// bloqueado, Chrome avisa de que la página está visible antes de desbloquear,
// Android niega la pantalla encendida ("The requesting page is not visible") y
// al desbloquear no llega otro aviso: la pantalla se apagaba sola al rato.
// Aquí el navegador es de mentira y el reloj también (mock.timers).

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RUTA = require.resolve('../js/wakelock.js');
const vaciarMicrotareas = () => new Promise((r) => setImmediate(r));

function montar() {
  const oyentes = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener: (ev, fn) => { (oyentes[ev] = oyentes[ev] || []).push(fn); },
  };
  const estado = { concede: false, peticiones: 0 };
  const nav = {
    wakeLock: {
      request: () => {
        estado.peticiones++;
        if (!estado.concede) return Promise.reject(new Error('The requesting page is not visible'));
        return Promise.resolve({ released: false, addEventListener() {} });
      },
    },
  };
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.debug = { log() {}, warn() {}, error() {} };
  delete require.cache[RUTA];
  require(RUTA);
  const avisar = async (visibilidad) => {
    doc.visibilityState = visibilidad;
    for (const fn of oyentes.visibilitychange || []) fn();
    await vaciarMicrotareas();
  };
  return { estado, avisar };
}

async function avanzar(ms) {
  for (let t = 0; t < ms; t += 500) {
    mock.timers.tick(500);
    await vaciarMicrotareas();
  }
}

test('si Android la niega al volver, se vuelve a pedir hasta conseguirla', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const { estado, avisar } = montar();

  await avisar('visible');
  assert.equal(estado.peticiones, 1);
  assert.equal(globalThis.WakeLock.estado(), 'error');

  await avanzar(5000);
  assert.equal(estado.peticiones, 2, 'a los 5 s se pide otra vez');

  estado.concede = true; // desbloqueado
  await avanzar(5000);
  assert.equal(estado.peticiones, 3);
  assert.equal(globalThis.WakeLock.estado(), 'activo');

  await avanzar(20000);
  assert.equal(estado.peticiones, 3, 'conseguida, no se insiste más');
});

test('con el panel oculto no se insiste', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const { estado, avisar } = montar();

  await avisar('visible');
  await avisar('hidden');
  await avanzar(20000);
  assert.equal(estado.peticiones, 1);
});
