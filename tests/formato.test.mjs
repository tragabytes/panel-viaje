// Cómo se escribe cada dato en pantalla (js/formato.js).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Formato = require('../js/formato.js');

const LAS_ROZAS = { municipio: 'Las Rozas de Madrid', comarca: null, poblacion: 99037, altitud: 718 };

// Impide: "Galapagar · 99.037 hab · 718 m", con los datos de Las Rozas (18/10).
test('la cabecera solo enseña los datos del municipio en el que estás', () => {
  assert.equal(Formato.metaMunicipio(LAS_ROZAS, 'Las Rozas de Madrid'), ' · 99.037 hab · 718 m');
  assert.equal(Formato.metaMunicipio(LAS_ROZAS, 'Galapagar'), '');
  assert.equal(Formato.metaMunicipio({ poblacion: 99037 }, 'Galapagar'), '', 'sin saber de quién son, no se enseñan');
  assert.equal(Formato.metaMunicipio(null, 'Galapagar'), '');
});

test('la comarca va delante cuando la hay', () => {
  const astorga = { municipio: 'Astorga', comarca: 'Maragatería', poblacion: 10869, altitud: 868 };
  assert.equal(Formato.metaMunicipio(astorga, 'Astorga'), ' · Maragatería · 10.869 hab · 868 m');
  assert.equal(Formato.metaMunicipio({ municipio: 'X' }, 'X'), '');
});

test('exceso de velocidad: leve a más de 5 km/h, grave a más de 15', () => {
  assert.equal(Formato.claseExceso(95, 90, false), '');
  assert.equal(Formato.claseExceso(96, 90, false), 'exceso');
  assert.equal(Formato.claseExceso(106, 90, false), 'exceso-grave');
  assert.equal(Formato.claseExceso(null, 90, false), '');
  assert.equal(Formato.claseExceso(120, null, false), '');
});

// Impide: el aviso rojo de exceso calculado contra el límite de la carretera
// de la que venías, sin cobertura (PENDIENTES n.º 1).
test('con la vía sin confirmar no hay aviso de exceso', () => {
  assert.equal(Formato.claseExceso(120, 50, true), '');
});

// Impide: el mismo castillo dos veces en la vista 3 cuando cae entre dos
// pueblos vecinos (BPC-17), y que el camino rápido de las distancias (DT-18)
// ponga la distancia de una tarjeta en otra.
test('los POIs se aplanan en orden y sin repetir los compartidos', () => {
  const castillo = { nombre: 'Castillo de X', lat: 40.12345, lon: -4.5, foto: null, tipo: 'castle' };
  const pueblos = [
    { nombre: 'A', distKm: 1.2, pois: [castillo, { nombre: 'Ermita', lat: 40.2, lon: -4.6, tipo: 'chapel' }] },
    { nombre: 'B', distKm: 3.4, pois: [Object.assign({}, castillo), { nombre: 'Mirador', lat: 40.3, lon: -4.7, tipo: 'viewpoint' }] },
    { nombre: 'C', distKm: 5, pois: undefined },
  ];
  const lista = Formato.aplanarPOIs(pueblos);
  assert.deepEqual(lista.map((p) => p.nombre), ['Castillo de X', 'Ermita', 'Mirador']);
  assert.deepEqual(lista.map((p) => p.pueblo), ['A', 'A', 'B']);
  assert.deepEqual(lista.map((p) => p.distKm), [1.2, 1.2, 3.4]);
  assert.deepEqual(Formato.aplanarPOIs(null), []);
});

test('las distancias: metros por debajo de 1 km', () => {
  assert.equal(Formato.distanciaKm(0.85), '850 m');
  assert.equal(Formato.distanciaKm(3.21), '3.2 km');
});

test('escapar vale también dentro de un atributo', () => {
  assert.equal(Formato.escapar('a"b<c>&\'d'), 'a&quot;b&lt;c&gt;&amp;&#39;d');
  assert.equal(Formato.escapar(null), '');
  assert.equal(Formato.escapar(42), '42');
});

// Impide: "Ermita Ecce Homo" y "Ermita del Ecce Homo" como dos sitios en la
// vista 1 (el nombre de OpenStreetMap y el de Wikipedia; visto el 18/10).
test('el mismo sitio con dos nombres casi iguales sale una vez', () => {
  const pueblos = [{ nombre: 'Valdeviejas', distKm: 3.5, pois: [
    { nombre: 'Ermita Ecce Homo', lat: 42.4501, lon: -6.0902 },
    { nombre: 'Ermita del Ecce Homo', lat: 42.4503, lon: -6.0899 },
    { nombre: 'Ermita del Ecce Homo', lat: 42.6, lon: -6.3 },   // otra, lejos: se queda
    { nombre: 'Ermita de San Roque', lat: 42.4502, lon: -6.0900 }, // otro nombre: se queda
  ] }];
  assert.deepEqual(Formato.aplanarPOIs(pueblos).map((p) => p.nombre + '@' + p.lat),
    ['Ermita Ecce Homo@42.4501', 'Ermita del Ecce Homo@42.6', 'Ermita de San Roque@42.4502']);
});
