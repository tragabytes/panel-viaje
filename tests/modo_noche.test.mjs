// Modo noche: el brillo del panel según el sol (js/modo_noche.js).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ModoNoche = require('../js/modo_noche.js');
const PaisajeFX = require('../js/v2_paisaje.js');

const MIN = 60000;
const SALIDA = Date.UTC(2026, 9, 18, 6, 25);   // 8:25 en Madrid
const PUESTA = Date.UTC(2026, 9, 18, 17, 25);  // 19:25
const b = (ahora) => ModoNoche.brillo(ahora, SALIDA, PUESTA);
const cerca = (x, y) => Math.abs(x - y) < 1e-9;

test('de día, brillo entero', () => {
  assert.equal(b(SALIDA), 1);
  assert.equal(b(Date.UTC(2026, 9, 18, 12, 0)), 1);
  assert.equal(b(PUESTA), 1);
});

// Impide: que el panel deslumbre de noche en la cabina a oscuras, y que el
// cambio sea de golpe (se notaría conduciendo).
test('tras la puesta baja poco a poco hasta el 70 % en 40 minutos', () => {
  assert.ok(cerca(b(PUESTA + 20 * MIN), 0.85));
  assert.ok(cerca(b(PUESTA + 40 * MIN), 0.7));
  assert.ok(cerca(b(PUESTA + 5 * 60 * MIN), 0.7));
  for (let m = 0; m < 40; m++) {
    assert.ok(b(PUESTA + m * MIN) - b(PUESTA + (m + 1) * MIN) <= 0.0076, 'escalones de menos de un 1 %');
  }
});

test('antes del amanecer vuelve a subir', () => {
  assert.ok(cerca(b(SALIDA - 3 * 60 * MIN), 0.7));
  assert.ok(cerca(b(SALIDA - 20 * MIN), 0.85));
});

test('con datos raros del sol, brillo entero', () => {
  assert.equal(ModoNoche.brillo(Date.now(), null, null), 1);
  assert.equal(ModoNoche.brillo(Date.now(), PUESTA, SALIDA), 1);
});

test('con la salida y la puesta del paisaje: noche a medianoche en Astorga, día a mediodía', () => {
  const dia = (h) => new Date(2026, 9, 18, h, 0).getTime();
  const sol = PaisajeFX.salidaPuesta(dia(12), 42.4587, -6.0558);
  assert.equal(ModoNoche.brillo(dia(12), sol.salida, sol.puesta), 1);
  const solNoche = PaisajeFX.salidaPuesta(dia(1), 42.4587, -6.0558);
  assert.ok(cerca(ModoNoche.brillo(dia(1), solNoche.salida, solNoche.puesta), 0.7));
});

// Impide: que el modo noche apague el aviso rojo de exceso de velocidad.
test('el rojo del exceso no depende del brillo', () => {
  const estilo = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const danger = estilo.match(/--danger:\s*([^;]+);/g) || [];
  assert.ok(danger.length > 0);
  for (const d of danger) assert.ok(!d.includes('brillo'), d);
});
