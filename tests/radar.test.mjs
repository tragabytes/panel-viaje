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

// Impide: ecos que se encienden a destiempo del barrido (al resincronizar un
// eco ya en marcha, el retraso nuevo no reinicia su animación).
test('el eco se enciende cuando el barrido pasa por su rumbo, también si ya estaba en marcha', () => {
  const T = 8000;
  // Cuánto falta (ms) para el próximo encendido del eco con el retraso calculado.
  const falta = (rumbo, fase, local) => {
    const activo = (local || 0) - Radar.retrasoEco(rumbo, fase, T, local);
    return (T - (activo % T)) % T;
  };
  assert.ok(cerca(falta(90, 0, 0), 2000, 0.5));          // barrido en 0°, pueblo a 90°: en 2 s
  assert.ok(cerca(falta(45, 45, 0), 0, 0.5));            // justo encima: ahora
  assert.ok(cerca(falta(90, 100, 0), T - 222.2, 0.5));   // recién pasado: casi una vuelta
  assert.ok(cerca(falta(90, 0, 5300), 2000, 0.5));       // eco que llevaba 5,3 s: igual
  assert.ok(cerca(falta(90, 0, 123456), 2000, 0.5));     // y si llevaba minutos
  assert.ok(Radar.retrasoEco(90, 0, T, 5300) <= 0);       // nunca un retraso positivo (eco apagado)
});

test('el relieve se recompone al salirse del margen o cambiar de escala', () => {
  const comp = { lat: AQUI.lat, lon: AQUI.lon, pxPorKm: 10 };
  const m = Radar.MARGEN_KM; // 1,5 km
  assert.equal(Radar.debeRecomponer(null, AQUI.lat, AQUI.lon, 10, m), true);
  assert.equal(Radar.debeRecomponer(comp, AQUI.lat + 0.01, AQUI.lon, 10, m), false);   // ~1,1 km
  assert.equal(Radar.debeRecomponer(comp, AQUI.lat + 0.016, AQUI.lon, 10, m), true);   // ~1,8 km
  assert.equal(Radar.debeRecomponer(comp, AQUI.lat, AQUI.lon, 12, m), true);
});

// Impide: bajar teselas de más (cada una ~135 KB de datos del móvil, regla 2).
// Con el cuadrado de 19 km de la primera versión salían 4-9 (media 5,2).
test('el radar compone solo su círculo: casi siempre 4 teselas, nunca más de 6', () => {
  let n = 0, suma = 0, max = 0;
  for (let lat = 36.2; lat <= 43.6; lat += 0.11) {
    for (let lon = -9.2; lon <= 3.2; lon += 0.13) {
      const k = Relieve.teselasParaVentana(lat, lon, Radar.RADIO_KM + Radar.MARGEN_KM, 10, true).length;
      n++; suma += k; max = Math.max(max, k);
    }
  }
  assert.ok(max <= 6, `máximo ${max}`);
  assert.ok(suma / n < 4.5, `media ${(suma / n).toFixed(2)}`);
});

// Lo mismo en ciudad (6 km, un nivel más de detalle): no más datos que en carretera.
test('en ciudad, también casi siempre 4 teselas y nunca más de 6', () => {
  let n = 0, suma = 0, max = 0;
  for (let lat = 36.2; lat <= 43.6; lat += 0.11) {
    for (let lon = -9.2; lon <= 3.2; lon += 0.13) {
      const k = Relieve.teselasParaVentana(lat, lon, Radar.RADIO_CERCA_KM + Radar.MARGEN_KM, Radar.ZOOM_CERCA, true).length;
      n++; suma += k; max = Math.max(max, k);
    }
  }
  assert.ok(max <= 6, `máximo ${max}`);
  assert.ok(suma / n < 4.5, `media ${(suma / n).toFixed(2)}`);
});

// Impide: un radar que se acerca y se aleja en cada semáforo (y recompone el
// relieve cada vez), o que se queda en la escala de ciudad al salir a la autovía.
test('la escala del radar: 6 km tras un minuto despacio, 15 km a los 20 s deprisa', () => {
  const e = Radar.crearEscala();
  assert.equal(e.actualizar(30, 0), 15, 'empieza en 15 km');
  assert.equal(e.actualizar(30, 59000), 15);
  assert.equal(e.actualizar(30, 60000), 6);
  assert.equal(e.actualizar(0, 120000), 6, 'parado en un semáforo, sigue en 6');
  assert.equal(e.actualizar(null, 125000), 6, 'sin velocidad, se queda como está');
  assert.equal(e.actualizar(80, 130000), 6);
  assert.equal(e.actualizar(80, 149000), 6);
  assert.equal(e.actualizar(80, 150000), 15);
});

test('una velocidad intermedia (45-55 km/h) no cambia la escala ni cuenta para cambiarla', () => {
  const e = Radar.crearEscala();
  e.actualizar(30, 0);
  e.actualizar(50, 40000);   // corta la cuenta de "despacio"
  assert.equal(e.actualizar(30, 70000), 15);
  assert.equal(e.actualizar(30, 130000), 6);
  assert.equal(e.actualizar(50, 500000), 6);
});

test('girar a pantalla: con rumbo 90° (hacia el este), lo del este queda arriba', () => {
  const s = Radar.girarAPantalla(100, 0, 90);
  assert.ok(cerca(s.x, 0, 1e-9) && cerca(s.y, -100, 1e-9));
  const n = Radar.girarAPantalla(0, -100, 90); // el norte queda a la izquierda
  assert.ok(cerca(n.x, -100, 1e-9) && cerca(n.y, 0, 1e-9));
});

// Impide: nombres de pueblos montados unos sobre otros o sobre el coche.
test('las etiquetas no se pisan: derecha, izquierda, encima, debajo o sin nombre', () => {
  const items = [
    { clave: 'a', x: 30, y: 0, ancho: 80, alto: 26 },
    { clave: 'b', x: 30, y: 20, ancho: 80, alto: 26 },  // su derecha choca con «a»: a la izquierda
    { clave: 'c', x: 30, y: 10, ancho: 80, alto: 26 },  // a los lados no cabe: encima a la izquierda
  ];
  assert.deepEqual(Radar.colocarEtiquetas(items, [], null), { a: 'derecha', b: 'izquierda', c: 'izquierda-arriba' });
  // Si no cabe en ninguno de los seis sitios, solo el punto.
  const encerrado = [{ clave: 'a', x: 0, y: 0, ancho: 80, alto: 26 }];
  assert.deepEqual(Radar.colocarEtiquetas(encerrado, [], { x0: -40, y0: -40, x1: 40, y1: 40 }), { a: 'oculta' });
  // Y ninguna etiqueta tapa el punto de otro pueblo.
  const tapado = [{ clave: 'a', x: 30, y: 0, ancho: 80, alto: 26 }, { clave: 'b', x: 60, y: 4, ancho: 80, alto: 26 }];
  assert.equal(Radar.colocarEtiquetas(tapado, [], null).a, 'izquierda');
});

// Impide: etiquetas que saltan de lado a cada tick (regla 3).
test('una etiqueta se queda en el lado que tenía mientras quepa', () => {
  const items = [{ clave: 'a', x: 30, y: 0, ancho: 60, alto: 26, preferido: 'izquierda' }];
  assert.deepEqual(Radar.colocarEtiquetas(items, [], null), { a: 'izquierda' });
  const sinPreferencia = [{ clave: 'a', x: 30, y: 0, ancho: 60, alto: 26 }];
  assert.deepEqual(Radar.colocarEtiquetas(sinPreferencia, [], null), { a: 'derecha' });
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
