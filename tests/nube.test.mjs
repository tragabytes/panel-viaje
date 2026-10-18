// Los logs del viaje en la nube (specs/005-logs-en-la-nube).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Nube = require('../js/nube.js');

const viaje = (id, nMensajes, nTrack) => ({ id, nMensajes, nTrack });
const AYER = new Date(2026, 9, 17, 18, 5, 9).getTime();
const HOY = new Date(2026, 9, 18, 19, 20, 5).getTime();

test('un viaje sin subir está pendiente', () => {
  assert.deepEqual(Nube.pendientes([viaje(AYER, 300, 12)], {}).map((t) => t.id), [AYER]);
});

// Impide: gastar datos reenviando en bucle lo que ya está en la nube (regla 2).
test('un viaje ya subido y sin cambios no se reenvía', () => {
  const v = viaje(AYER, 300, 12);
  const estado = Nube.apuntar({}, v, { ok: true, sha: 'abc' }, HOY);
  assert.deepEqual(Nube.pendientes([v], estado), []);
});

test('un viaje que ha crecido desde que se subió vuelve a estar pendiente', () => {
  const estado = Nube.apuntar({}, viaje(HOY, 50, 2), { ok: true, sha: 'abc' }, HOY);
  assert.deepEqual(Nube.pendientes([viaje(HOY, 80, 3)], estado).map((t) => t.id), [HOY]);
  assert.equal(estado[HOY].sha, 'abc', 'se guarda el sha para sustituir el fichero, no duplicarlo');
});

// Impide: dar por subido un log que no llegó y perderlo para siempre (regla 4).
test('tras un fallo, el viaje sigue pendiente', () => {
  const v = viaje(AYER, 300, 12);
  for (const fallo of [{ ok: false, motivo: 'red' }, { ok: false, motivo: 'clave' }, null]) {
    const estado = Nube.apuntar({}, v, fallo, HOY);
    assert.deepEqual(Nube.pendientes([v], estado).map((t) => t.id), [AYER]);
  }
});

test('al arrancar no se sube el viaje que acaba de empezar', () => {
  assert.deepEqual(Nube.pendientes([viaje(AYER, 300, 12), viaje(HOY, 5, 0)], {}, HOY).map((t) => t.id), [AYER]);
});

test('lo apuntado de viajes que ya no están en el móvil se olvida', () => {
  let estado = Nube.apuntar({}, viaje(AYER, 300, 12), { ok: true, sha: 'a' }, HOY);
  estado = Nube.apuntar(estado, viaje(HOY, 30, 1), { ok: true, sha: 'b' }, HOY);
  assert.deepEqual(Object.keys(Nube.podar(estado, [viaje(HOY, 30, 1)])), [String(HOY)]);
});

test('el nombre del fichero: fecha y hora del viaje, móvil y si fue simulación', () => {
  assert.equal(Nube.nombreFichero(HOY, 'SM-S901B', false), 'logs/2026-10-18_19-20-05_SM-S901B.txt.gz');
  assert.equal(Nube.nombreFichero(AYER, 'Redmi Note 8/Pro', true), 'logs/2026-10-17_18-05-09_Redmi-Note-8-Pro_sim.txt.gz');
  assert.equal(Nube.nombreFichero(AYER, '', false), 'logs/2026-10-17_18-05-09_movil.txt.gz');
});

test('el nombre del móvil: el modelo si lo da, si no el del navegador', () => {
  assert.equal(Nube.nombreMovil('Mozilla/5.0 (Linux; Android 10; K) Chrome/146', 'SM-S901B'), 'SM-S901B');
  assert.equal(Nube.nombreMovil('Mozilla/5.0 (Linux; Android 10; Redmi Note 8) Chrome/120', ''), 'Redmi Note 8');
  assert.equal(Nube.nombreMovil('Mozilla/5.0 (Linux; Android 10; K) Chrome/146', ''), 'android');
  assert.equal(Nube.nombreMovil('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/146', ''), 'pc');
});

test('una clave de GitHub se reconoce; otra cosa, no', () => {
  assert.equal(Nube.pareceClave('github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTU'), true);
  assert.equal(Nube.pareceClave('  ghp_0123456789abcdefghijklmnopqrstuvwxyzAB  '), true);
  assert.equal(Nube.pareceClave('mi contraseña'), false);
  assert.equal(Nube.pareceClave(''), false);
});
