// El nombre que acompaña a la pastilla de la vía (PENDIENTES n.º 3).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Carreteras = require('../js/carreteras.js');
const etiqueta = Carreteras.etiquetaVia;

// Impide: "LE-142 · Carretera de LE-142 por El Ganso a LE-142 (Rabanal del
// Camino)", cortado a media frase. Visto el 18/10 en el simulador.
test('si el nombre repite el código, solo la pastilla', () => {
  assert.equal(etiqueta('LE-142', 'Carretera de LE-142 por El Ganso a LE-142 (Rabanal del Camino)'), '');
  assert.equal(etiqueta('A-6', 'A-6'), '');
  assert.equal(etiqueta('N-6', 'Travesía N6'), '');
  assert.equal(etiqueta('M-505', 'carretera m 505'), '');
});

test('el código entre paréntesis al final se quita y queda el nombre', () => {
  assert.equal(etiqueta('A-6', 'Autovía del Noroeste (A-6)'), 'Autovía del Noroeste');
});

test('un nombre que no repite el código se queda igual', () => {
  assert.equal(etiqueta('A-6', 'Autovía del Noroeste'), 'Autovía del Noroeste');
  assert.equal(etiqueta('N-VI', 'Calle Real'), 'Calle Real');
  assert.equal(etiqueta(null, 'Calle Mayor'), 'Calle Mayor');
});

test('un código que contiene a otro no cuenta como repetido', () => {
  assert.equal(etiqueta('A-6', 'Enlace con la A-60'), 'Enlace con la A-60');
  assert.equal(etiqueta('A-6', 'Ronda LA-6'), 'Ronda LA-6');
});

test('sin nombre, nada', () => {
  assert.equal(etiqueta('A-6', null), '');
  assert.equal(etiqueta('A-6', '   '), '');
});

// Impide: preguntar al servidor de mapas por el código de cada calle (13 veces en
// un cuarto de hora por Las Rozas el 18/10): las calles no tienen código (D40).
// Nominatim, 19/10/2026: "Calle Luarca" es residential; "Carretera de El
// Escorial" (la M-505, que llega sin código y se rescata) es trunk.
test('a las calles no se les busca código; a las carreteras con nombre, sí', () => {
  for (const tipo of ['residential', 'living_street', 'pedestrian', 'service']) {
    assert.equal(Carreteras.esCalle(tipo), true, tipo);
  }
  for (const tipo of ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'motorway', null, undefined]) {
    assert.equal(Carreteras.esCalle(tipo), false, String(tipo));
  }
});
