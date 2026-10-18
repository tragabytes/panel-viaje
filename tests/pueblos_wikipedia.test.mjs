// Pueblos cercanos desde Wikipedia cuando Overpass no contesta (PENDIENTES n.º 2).
//
// Se ejecutan con: node --test
//
// Las respuestas de tests/datos/ son reales (es.wikipedia.org, búsqueda por
// coordenadas a 10 km con la descripción corta de cada artículo), del 18/10/2026.

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
const datos = (n) => JSON.parse(readFileSync(new URL(`./datos/wikipedia-geosearch-${n}.json`, import.meta.url), 'utf8'));
const titulosAceptados = (d) => d.query.pages.filter((p) => POIFuentes.esPuebloWikipedia(p.title, p.description)).map((p) => p.title);

// Impide: "Cofradía de la Entrada de Jesús en Jerusalén (Astorga)", "Sitios de
// Astorga" o "País Leonés" como pueblos cercanos (vistos el 30/09 y el 18/10).
test('en Astorga pasan los pueblos y no las cofradías, edificios ni batallas', () => {
  const si = titulosAceptados(datos('astorga'));
  for (const pueblo of ['Astorga', 'Villaobispo de Otero', 'San Justo de la Vega', 'Castrillo de los Polvazares',
    'Valdeviejas', 'Murias de Rechivaldo', 'Celada (San Justo de la Vega)', 'Fontoria de Cepeda', 'La Carrera (León)']) {
    assert.ok(si.includes(pueblo), `falta ${pueblo}`);
  }
  for (const no of ['Sitios de Astorga', 'País Leonés', 'Cofradía de la Entrada de Jesús en Jerusalén (Astorga)',
    'Hermandad de la Santa Cena (Astorga)', 'Palacio Episcopal de Astorga', 'Asturica Augusta', 'Río Jerga',
    'Estación de Nistal', 'Batalla de las Babias', 'Museo de los Caminos', 'Termas romanas de Asturica Augusta']) {
    assert.ok(!si.includes(no), `se coló ${no}`);
  }
});

test('en Galapagar pasan los municipios y las localidades, no estaciones ni embalses', () => {
  const si = titulosAceptados(datos('galapagar'));
  for (const pueblo of ['Galapagar', 'Torrelodones', 'Colmenarejo', 'Hoyo de Manzanares', 'Alpedrete',
    'Collado Villalba', 'Los Negrales', 'Navalquejigo', 'Las Matas']) {
    assert.ok(si.includes(pueblo), `falta ${pueblo}`);
  }
  for (const no of ['Estación de Las Matas', 'Embalse de Valmayor', 'Cuenca del Guadarrama', 'Atalaya de Torrelodones',
    'Puerto de Galapagar', 'Partido judicial de Collado Villalba', 'Ayuntamiento de Galapagar', 'M-505',
    'Sierra de Hoyo de Manzanares', 'La Berzosa', 'Hospital de Madrid Torrelodones']) {
    assert.ok(!si.includes(no), `se coló ${no}`);
  }
});

test('la descripción manda sobre el título: «Estación de Baeza» puede ser un pueblo', () => {
  assert.equal(POIFuentes.esPuebloWikipedia('Estación de Baeza', 'localidad del municipio de Baeza, provincia de Jaén'), true);
  assert.equal(POIFuentes.esPuebloWikipedia('Torre Pacheco', 'municipio de la Región de Murcia, España'), true);
  assert.equal(POIFuentes.esPuebloWikipedia('San Ildefonso (Granada)', 'barrio de Granada, España'), false);
  assert.equal(POIFuentes.esPuebloWikipedia('Parroquia de San José', 'parroquia católica en Madrid'), false);
  assert.equal(POIFuentes.esPuebloWikipedia('Leboreiro (La Coruña)', 'parroquia civil del municipio de Mellid, Galicia, España'), true);
  assert.equal(POIFuentes.esPuebloWikipedia('Bedoña', 'anteiglesia española del municipio de Mondragón'), true);
});

test('salen los cinco más cercanos, con su distancia calculada', () => {
  const { pueblos, descartados } = POIFuentes.parsearPueblosWikipedia(datos('astorga'), 42.4587, -6.0558);
  assert.equal(pueblos.length, POIFuentes.MAX_PUEBLOS);
  assert.equal(pueblos[0].nombre, 'Astorga');
  for (let i = 1; i < pueblos.length; i++) assert.ok(pueblos[i].distKm >= pueblos[i - 1].distKm);
  assert.ok(descartados >= 20, `descartados: ${descartados}`);
  for (const p of pueblos) assert.ok(typeof p.lat === 'number' && typeof p.lon === 'number' && p.distKm < 10.5);
});

test('una respuesta vacía o rara no rompe nada', () => {
  assert.deepEqual(POIFuentes.parsearPueblosWikipedia({}, 40, -4).pueblos, []);
  assert.deepEqual(POIFuentes.parsearPueblosWikipedia({ query: { pages: [{ title: 'Sin coordenadas', description: 'municipio' }] } }, 40, -4).pueblos, []);
});

// Impide: un pueblo vecino como "punto de interés" ("Pedredo" en la tira de
// POIs de Murias de Pedredo, visto el 18/10), o un asedio o una cofradía.
test('los POIs de Wikipedia no son pueblos ni cosas que no se visitan', () => {
  const si = datos('astorga').query.pages
    .filter((p) => POIFuentes.esPoiWikipedia(p.title, p.description, 'Astorga')).map((p) => p.title);
  for (const poi of ['Catedral de Astorga', 'Palacio Episcopal de Astorga', 'Muralla de Astorga',
    'Museo de los Caminos', 'Termas romanas de Asturica Augusta', 'Asturica Augusta']) {
    assert.ok(si.includes(poi), `falta ${poi}`);
  }
  for (const no of ['Astorga', 'Valdeviejas', 'Murias de Rechivaldo', 'Sitios de Astorga', 'País Leonés',
    'Hermandad de la Santa Cena (Astorga)', 'Batalla de las Babias', 'Estación de Astorga', 'Río Jerga']) {
    assert.ok(!si.includes(no), `se coló ${no}`);
  }
});

test('los POIs salen en el orden de la búsqueda, como mucho dos por pueblo', () => {
  const r = POIFuentes.parsearPOIsWikipedia(datos('astorga'), 'Astorga');
  assert.equal(r.length, POIFuentes.MAX_POIS_POR_PUEBLO);
  assert.deepEqual(r.map((p) => p.nombre), ['Palacio Episcopal de Astorga', 'Catedral de Astorga']);
  assert.ok(r.every((p) => typeof p.pageid === 'number' && typeof p.lat === 'number'));
});
