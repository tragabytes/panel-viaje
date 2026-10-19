// Pueblos cercanos desde OpenStreetMap: junto a una ciudad, sin urbanizaciones
// ni fincas; en el campo, con sus aldeas (D40).
//
// Se ejecutan con: node --test
//
// Las respuestas de tests/datos/overpass-pueblos-*.json son reales (Overpass,
// la misma consulta que el panel, 15 km), del 19/10/2026.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
require('../js/geo.js');
require('../js/overpass.js');
require('../js/pois/match.js');
require('../js/pois/fuentes.js');
const POIFuentes = globalThis.POIFuentes;
const datos = (n) => JSON.parse(readFileSync(new URL(`./datos/overpass-pueblos-${n}.json`, import.meta.url), 'utf8'));
const nombres = (d, lat, lon) => POIFuentes.parsearPueblos(d, lat, lon).pueblos.map((p) => p.nombre);

// Impide: La Puentecilla y Los Majuelos (8 habitantes), Monte del Pilar (26) y
// El Mayorazgo (7) como pueblos cercanos en Las Rozas, en lugar de los pueblos
// de alrededor (18/10, Calle Luarca). Son núcleos de población oficiales, pero
// junto a una ciudad son urbanizaciones y fincas.
test('en Las Rozas salen los pueblos de alrededor, no las urbanizaciones', () => {
  assert.deepEqual(nombres(datos('las-rozas'), 40.48919, -3.87589),
    ['Las Rozas de Madrid', 'Majadahonda', 'Villanueva del Pardillo', 'Pozuelo de Alarcón', 'Boadilla del Monte']);
});

// Impide: perder las aldeas pequeñas en el campo, que Laureano quiere ver.
test('en el campo siguen saliendo las aldeas pequeñas (Cangas de Onís)', () => {
  assert.deepEqual(nombres(datos('cangas-de-onis'), 43.3507, -5.1286),
    ["Cangas de Onís / Cangues d'Onís", 'El Puente', 'Prestín', 'Caxidi', 'Helgueres']);
});

// La regla, caso a caso, con lugares inventados alrededor de (40, -4).
// 0,01° de latitud son 1,11 km.
const lugar = (name, place, lat, population) => ({
  type: 'node', lat, lon: -4, tags: population == null ? { name, place } : { name, place, population: String(population) },
});
const conCiudad = (ciudad, ...resto) => ({ elements: [ciudad, ...resto] });
const sale = (d, nombre) => POIFuentes.parsearPueblos(d, 40, -4).pueblos.some((p) => p.nombre === nombre);

test('junto a una ciudad, fuera los caseríos de menos de 50 habitantes (o sin dato)', () => {
  const ciudad = lugar('Ciudad', 'town', 40, 10000);
  assert.equal(sale(conCiudad(ciudad, lugar('Finca', 'hamlet', 40.05, 49)), 'Finca'), false, '49 hab. a 5,6 km');
  assert.equal(sale(conCiudad(ciudad, lugar('Sin dato', 'hamlet', 40.03)), 'Sin dato'), false, 'sin población, a 3,3 km');
  assert.equal(sale(conCiudad(ciudad, lugar('Aldea', 'hamlet', 40.05, 50)), 'Aldea'), true, '50 hab.');
  assert.equal(sale(conCiudad(ciudad, lugar('Lejos', 'hamlet', 40.055, 10)), 'Lejos'), true, 'a 6,1 km');
  assert.equal(sale(conCiudad(ciudad, lugar('Pueblo', 'village', 40.01, 10)), 'Pueblo'), true, 'un village pasa siempre');
});

test('una villa de menos de 10.000 habitantes no es una ciudad; una city sin dato, sí', () => {
  const finca = lugar('Finca', 'hamlet', 40.01, 8);
  assert.equal(sale(conCiudad(lugar('Villa', 'town', 40, 9999), finca), 'Finca'), true);
  assert.equal(sale(conCiudad(lugar('Capital', 'city', 40), finca), 'Finca'), false);
});
