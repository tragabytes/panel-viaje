// Datos viejos sin cobertura (DECISIONES D8).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Frescura = require('../js/frescura.js');

const LAS_ROZAS = [40.4929, -3.8737];
const GALAPAGAR = [40.5786, -4.0016];
// 1 km al norte ≈ 0,008993° de latitud.
const alNorte = ([lat, lon], km) => [lat + km * 0.008993, lon];

// Impide: sin cobertura, el panel siguió diciendo "Las Rozas de Madrid · A-6"
// ya en Galapagar por la M-505, como si fuera actual (D8).
test('lejos de donde se confirmó, el dato es viejo', () => {
  const f = Frescura.crear();
  f.confirmar(...LAS_ROZAS);
  assert.equal(f.esViejo(...GALAPAGAR), true);
});

test('el umbral es de 2 km', () => {
  const f = Frescura.crear();
  f.confirmar(...LAS_ROZAS);
  assert.equal(f.esViejo(...alNorte(LAS_ROZAS, 1.9)), false);
  assert.equal(f.esViejo(...alNorte(LAS_ROZAS, 2.1)), true);
});

test('una respuesta nueva lo vuelve a dar por bueno', () => {
  const f = Frescura.crear();
  f.confirmar(...LAS_ROZAS);
  f.confirmar(...GALAPAGAR);
  assert.equal(f.esViejo(...GALAPAGAR), false);
});

test('sin ninguna respuesta todavía, no hay nada que atenuar', () => {
  assert.equal(Frescura.crear().esViejo(...GALAPAGAR), false);
});
