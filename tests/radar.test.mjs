// Radar de la vista 4 (specs/002-radar-relieve).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Radar = require('../js/v4_radar.js');
const Relieve = require('../js/relieve.js');
const Geo = require('../js/geo.js');

const cerca = (a, b, tol) => Math.abs(a - b) <= tol;
const AQUI = { lat: 40.5786, lon: -4.0016 }; // Galapagar

test('un pueblo al norte sale arriba y uno al este, a la derecha', () => {
  const norte = Radar.aPantalla(AQUI, AQUI.lat + 0.05, AQUI.lon, 10);
  assert.ok(cerca(norte.x, 0, 0.01) && norte.y < 0);
  assert.ok(cerca(norte.rumbo, 0, 0.01));
  const este = Radar.aPantalla(AQUI, AQUI.lat, AQUI.lon + 0.05, 10);
  assert.ok(este.x > 0 && cerca(este.y, 0, 0.01));
  assert.ok(cerca(este.rumbo, 90, 0.01));
});

test('la distancia del radar coincide con la de Geo a menos de un 1 %', () => {
  const lat = 40.65, lon = -3.90;
  const r = Radar.aPantalla(AQUI, lat, lon, 1);
  const g = Geo.distanciaMetros(AQUI.lat, AQUI.lon, lat, lon) / 1000;
  assert.ok(Math.abs(r.distKm - g) / g < 0.01, `${r.distKm} vs ${g}`);
});

// Impide: ecos desplazados respecto a los montes que tienen debajo.
test('los ecos y el relieve usan la misma escala', () => {
  const pxPorKm = 10, z = 10;
  const lat = AQUI.lat + 0.08, lon = AQUI.lon + 0.11;
  const c = Relieve.pixelGlobal(AQUI.lat, AQUI.lon, z);
  const p = Relieve.pixelGlobal(lat, lon, z);
  const escala = pxPorKm * Relieve.metrosPorPixel(AQUI.lat, z) / 1000;
  const r = Radar.aPantalla(AQUI, lat, lon, pxPorKm);
  assert.ok(cerca((p.x - c.x) * escala, r.x, 0.5), `x ${((p.x - c.x) * escala).toFixed(2)} vs ${r.x.toFixed(2)}`);
  assert.ok(cerca((p.y - c.y) * escala, r.y, 1.5), `y ${((p.y - c.y) * escala).toFixed(2)} vs ${r.y.toFixed(2)}`);
});

// Impide: que el disco dé una vuelta entera al pasar de 359° a 1°.
test('el giro va siempre por el camino corto', () => {
  assert.equal(Radar.desenrollar(359, 1), 361);
  assert.equal(Radar.desenrollar(361, 359), 359);
  assert.equal(Radar.desenrollar(720, 90), 810);
  assert.equal(Radar.desenrollar(10, 190), -170); // media vuelta: cualquiera de los dos sentidos
});

test('el eco se enciende cuando el barrido pasa por su rumbo', () => {
  const T = 8000;
  // Barrido en 0°, pueblo a 90°: le alcanza dentro de 2 s → la animación va por 6 s.
  assert.equal(Radar.retrasoEco(90, 0, T), -6000);
  // Justo encima: arranca ahora.
  assert.equal(Radar.retrasoEco(45, 45, T), 0);
  // Barrido ya pasado (fase 100°, pueblo 90°): falta casi una vuelta.
  assert.ok(cerca(Radar.retrasoEco(90, 100, T), -222.2, 0.1));
});

test('el relieve se recompone al alejarse del centro o cambiar de escala', () => {
  const comp = { lat: AQUI.lat, lon: AQUI.lon, pxPorKm: 10 };
  assert.equal(Radar.debeRecomponer(null, AQUI.lat, AQUI.lon, 10, 4), true);
  assert.equal(Radar.debeRecomponer(comp, AQUI.lat + 0.01, AQUI.lon, 10, 4), false); // ~1,1 km
  assert.equal(Radar.debeRecomponer(comp, AQUI.lat + 0.03, AQUI.lon, 10, 4), true);  // ~3,3 km
  assert.equal(Radar.debeRecomponer(comp, AQUI.lat, AQUI.lon, 12, 4), true);
});

test('girar a pantalla: con rumbo 90° (hacia el este), lo del este queda arriba', () => {
  const s = Radar.girarAPantalla(100, 0, 90);
  assert.ok(cerca(s.x, 0, 1e-9) && cerca(s.y, -100, 1e-9));
  const n = Radar.girarAPantalla(0, -100, 90); // el norte queda a la izquierda
  assert.ok(cerca(n.x, -100, 1e-9) && cerca(n.y, 0, 1e-9));
});

// Impide: nombres de pueblos montados unos sobre otros o sobre el coche.
test('las etiquetas no se pisan: a la derecha, si no a la izquierda, si no sin nombre', () => {
  const items = [
    { clave: 'a', x: 30, y: 0, ancho: 80, alto: 26 },
    { clave: 'b', x: 30, y: 20, ancho: 80, alto: 26 },  // su derecha choca con «a»: a la izquierda
    { clave: 'c', x: 30, y: 10, ancho: 80, alto: 26 },  // no cabe a ningún lado: sin nombre
  ];
  assert.deepEqual(Radar.colocarEtiquetas(items, [], null), { a: 'derecha', b: 'izquierda', c: 'oculta' });
  // Y ninguna etiqueta tapa el punto de otro pueblo.
  const tapado = [{ clave: 'a', x: 30, y: 0, ancho: 80, alto: 26 }, { clave: 'b', x: 60, y: 4, ancho: 80, alto: 26 }];
  assert.equal(Radar.colocarEtiquetas(tapado, [], null).a, 'izquierda');
});

test('una etiqueta que se saldría de la pantalla por la derecha va a la izquierda', () => {
  const items = [{ clave: 'a', x: 140, y: 0, ancho: 80, alto: 26 }];
  assert.deepEqual(Radar.colocarEtiquetas(items, [], { x0: -200, y0: -150, x1: 180, y1: 150 }), { a: 'izquierda' });
});

test('ninguna etiqueta tapa el coche del centro', () => {
  const items = [{ clave: 'a', x: -20, y: 2, ancho: 60, alto: 26 }];
  const coche = { x0: -10, y0: -16, x1: 10, y1: 8 };
  assert.deepEqual(Radar.colocarEtiquetas(items, [coche], null), { a: 'izquierda' });
});

test('distancias y rumbos se escriben a la española', () => {
  assert.equal(Radar.formatoDistancia(0.42), '420 m');
  assert.equal(Radar.formatoDistancia(4.25), '4,3 km');
  assert.equal(Radar.cardinal(312), 'NO');
  assert.equal(Radar.cardinal(-10), 'N');
  assert.equal(Radar.cardinal(181), 'S');
});
