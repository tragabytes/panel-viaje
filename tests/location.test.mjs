// Municipio, provincia y comunidad desde Nominatim (PENDIENTES n.º 5).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.Geo = require('../js/geo.js');
const LocationModule = require('../js/location.js');
const normalizar = (address) => LocationModule._normalizarUbicacion({ address });

// Direcciones reales de Nominatim (zoom 14, accept-language=es), consultadas el
// 18/10/2026. Nominatim pone la provincia en state_district, no en province.
const ASTORGA = { town: 'Astorga', state_district: 'León', 'ISO3166-2-lvl6': 'ES-LE', state: 'Castilla y León', 'ISO3166-2-lvl4': 'ES-CL', country: 'España', country_code: 'es' };
const TOLEDO = { isolated_dwelling: 'Cigarral de Santa Elena', city: 'Toledo', state_district: 'Toledo', 'ISO3166-2-lvl6': 'ES-TO', state: 'Castilla-La Mancha', 'ISO3166-2-lvl4': 'ES-CM' };
const GERONA = { neighbourhood: 'Eixample', city: 'Gerona', county: 'Gironés', state_district: 'Gerona', 'ISO3166-2-lvl6': 'ES-GI', state: 'Cataluña', 'ISO3166-2-lvl4': 'ES-CT' };
const GALAPAGAR = { quarter: 'El Congosto', hamlet: 'Las Columnas', town: 'Galapagar', state: 'Comunidad de Madrid', 'ISO3166-2-lvl4': 'ES-MD' };

// Impide: "Castilla y León" como provincia de Astorga. Pasaba en todas las
// comunidades con varias provincias: el panel leía un campo (province) que
// Nominatim ya no da, y caía a la comunidad.
test('la provincia sale de state_district', () => {
  assert.deepEqual(normalizar(ASTORGA), { municipio: 'Astorga', provincia: 'León', ccaa: 'Castilla y León' });
  assert.equal(normalizar(TOLEDO).provincia, 'Toledo');
});

// Impide: tomar la comarca por la provincia (en Cataluña y Galicia, county es la comarca).
test('county es la comarca, no la provincia', () => {
  assert.equal(normalizar(GERONA).provincia, 'Gerona');
});

test('en una comunidad de una sola provincia, la provincia es la comunidad', () => {
  const r = normalizar(GALAPAGAR);
  assert.equal(r.municipio, 'Galapagar');
  assert.equal(r.provincia, 'Comunidad de Madrid');
});

test('si alguna vez vuelve province, manda province', () => {
  assert.equal(normalizar({ town: 'X', province: 'León', state_district: 'Otra', state: 'Castilla y León' }).provincia, 'León');
});

// D40: el tipo de vía que da Nominatim (zoom 17) llega a quien decide si se
// busca el código. Respuesta real del 19/10/2026 en Las Rozas.
test('la vía lleva el tipo que da Nominatim', () => {
  globalThis.Carreteras = globalThis.Carreteras || require('../js/carreteras.js');
  const r = LocationModule._normalizarCarretera({ class: 'highway', type: 'residential', address: { road: 'Calle Luarca' } });
  assert.equal(r.tipoOsm, 'residential');
  assert.equal(r.textoCrudo, 'Calle Luarca');
  assert.equal(r.codigo, null);
  assert.equal(LocationModule._normalizarCarretera({ class: 'place', type: 'house', address: {} }).tipoOsm, null);
});
