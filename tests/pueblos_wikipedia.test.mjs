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

// Impide: elegir los dos artículos más antiguos en vez de los dos más cercanos
// (el `index` de Wikipedia sigue el orden de pageid, no la distancia).
test('los POIs salen del más cercano al pueblo al más lejano, como mucho dos', () => {
  const r = POIFuentes.parsearPOIsWikipedia(datos('astorga'), 'Astorga', 42.4575, -6.05694444);
  assert.equal(r.length, POIFuentes.MAX_POIS_POR_PUEBLO);
  assert.deepEqual(r.map((p) => p.nombre), ['Catedral de Astorga', 'Palacio Episcopal de Astorga']);
  assert.ok(r.every((p) => typeof p.pageid === 'number' && typeof p.lat === 'number'));
});

// Impide: edificios y parques sin descripción como pueblos (M-30 en Méndez
// Álvaro, 18/10: la sede de la EMT, el parque Tierno Galván...).
test('sin descripción, un título de edificio, parque o castillo no es un pueblo', () => {
  for (const t of ['Sede de la EMT', 'Parque Tierno Galván', 'Polideportivo Daoíz y Velarde', 'Cementerio de San Nicolás',
    'Nave de motores de Pacífico', 'Castillo de Maya', 'Iglesia de San Pedro', 'Palacio de Liria', 'Basílica de Atocha']) {
    assert.equal(POIFuentes.esPuebloWikipedia(t, undefined), false, t);
  }
  assert.equal(POIFuentes.esPuebloWikipedia('Fontoria de Cepeda', undefined), true);
});

test('las entidades colectivas, las comunas francesas y las freguesias son pueblos (y no monumentos)', () => {
  const casos = [['Los Médicos (Cartagena)', 'entidad colectiva de población del municipio de Cartagena'],
    ['Alduides', 'comuna francesa del departamento de Pirineos Atlánticos'], ['Valença', 'freguesia de Portugal']];
  for (const [t, d] of casos) {
    assert.equal(POIFuentes.esPuebloWikipedia(t, d), true, t);
    assert.equal(POIFuentes.esPoiWikipedia(t, d, 'Otro'), false, t);
  }
});

// Impide: "La Carrera (León)" o "Fontoria de Cepeda" (pueblos sin descripción)
// como monumentos de un pueblo vecino, y "Partido judicial de…" como sitio.
test('sin descripción, un POI tiene que parecerlo por el título', () => {
  for (const t of ['La Carrera (León)', 'Fontoria de Cepeda', 'Partido judicial de Collado Villalba']) {
    assert.equal(POIFuentes.esPoiWikipedia(t, undefined, 'Otero de Escarpizo'), false, t);
  }
  for (const t of ['Iglesia de San Juan Bautista (Azcoaga)', 'Castillo de Maya', 'Ermita del Ecce Homo', 'Puente de Órbigo']) {
    assert.equal(POIFuentes.esPoiWikipedia(t, undefined, 'Otro'), true, t);
  }
});
