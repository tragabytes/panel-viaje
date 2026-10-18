// Paisaje de la vista 2 (specs/003-meteo-chillout).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../js/v2_paisaje.js');

const cerca = (a, b, tol) => Math.abs(a - b) <= tol;
const brillo = (c) => c[0] + c[1] + c[2];
const HOY = (h, m) => new Date(2026, 9, 18, h, m).getTime();
const SALIDA = HOY(8, 20);
const PUESTA = HOY(19, 10);

test('la fase de la luna cuadra con lunas nuevas y llenas conocidas', () => {
  const nueva = P.faseLunar(Date.UTC(2024, 3, 8, 18, 21));  // eclipse del 8/4/2024
  assert.ok(nueva < 0.02 || nueva > 0.98, `luna nueva: ${nueva}`);
  const llena = P.faseLunar(Date.UTC(2024, 3, 23, 23, 49));
  assert.ok(cerca(llena, 0.5, 0.02), `luna llena: ${llena}`);
});

test('el sol: arriba a mediodía, en el horizonte al salir, abajo a medianoche', () => {
  const mediodia = P.posicionSol((SALIDA + PUESTA) / 2, SALIDA, PUESTA);
  assert.equal(mediodia.dia, true);
  assert.ok(cerca(mediodia.altura, 1, 1e-9));
  assert.ok(cerca(P.posicionSol(SALIDA, SALIDA, PUESTA).altura, 0, 1e-9));
  const noche = P.posicionSol(HOY(1, 45), SALIDA, PUESTA);
  assert.equal(noche.dia, false);
  assert.ok(noche.altura < -0.9, `madrugada: ${noche.altura}`);
  // Sin datos de salida y puesta, se supone un día normal (no rompe).
  assert.equal(P.posicionSol(HOY(13, 0), null, null).dia, true);
});

// Impide: que sin cobertura el paisaje se invente la hora del ocaso (pintaba de
// noche a las 20:30 de junio y se hacía de día de golpe al volver la red).
test('la salida y la puesta del sol se calculan sin internet', () => {
  const utc = (ms) => new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes();
  const verano = P.salidaPuesta(new Date(2026, 5, 21, 12).getTime(), 40.4168, -3.7038);
  assert.ok(Math.abs(utc(verano.salida) - (4 * 60 + 44)) <= 4, 'salida 21/6 en Madrid: 6:44 peninsular');
  assert.ok(Math.abs(utc(verano.puesta) - (19 * 60 + 48)) <= 4, 'puesta 21/6 en Madrid: 21:48 peninsular');
  const invierno = P.salidaPuesta(new Date(2026, 11, 21, 12).getTime(), 40.4168, -3.7038);
  assert.ok(Math.abs(utc(invierno.salida) - (7 * 60 + 33)) <= 4, 'salida 21/12 en Madrid: 8:33 peninsular');
  assert.ok(Math.abs(utc(invierno.puesta) - (16 * 60 + 53)) <= 4, 'puesta 21/12 en Madrid: 17:53 peninsular');
  // Galicia, más al oeste, ve ponerse el sol más tarde que Madrid.
  const santiago = P.salidaPuesta(new Date(2026, 5, 21, 12).getTime(), 42.88, -8.54);
  assert.ok(santiago.puesta > verano.puesta + 15 * 60000);
});

// Impide: un cielo claro que deslumbre o se coma el texto al conducir (regla 3).
test('el cielo es oscuro también de día, y más de noche', () => {
  const dia = P.paleta(P.posicionSol((SALIDA + PUESTA) / 2, SALIDA, PUESTA));
  const noche = P.paleta(P.posicionSol(HOY(2, 0), SALIDA, PUESTA));
  assert.ok(brillo(dia.arriba) < 150, `cénit de día: ${dia.arriba}`);
  assert.ok(brillo(noche.arriba) < brillo(dia.arriba));
  assert.equal(dia.estrellas, 0);
  assert.ok(noche.estrellas > 0.9);
});

test('al atardecer el horizonte se calienta (más rojo que azul)', () => {
  const ocaso = P.paleta(P.posicionSol(PUESTA - 10 * 60000, SALIDA, PUESTA));
  assert.ok(ocaso.horizonte[0] > ocaso.horizonte[2] + 40, `horizonte ${ocaso.horizonte}`);
});

test('el tiempo agrisa y oscurece: más la tormenta que la lluvia', () => {
  const base = P.paleta(P.posicionSol((SALIDA + PUESTA) / 2, SALIDA, PUESTA));
  const lluvia = P.ajustarPorTiempo(base, { weatherCode: 63, categoria: 'lluvia' });
  const tormenta = P.ajustarPorTiempo(base, { weatherCode: 95, categoria: 'tormenta' });
  assert.ok(brillo(lluvia.arriba) < brillo(base.arriba));
  assert.ok(brillo(tormenta.arriba) < brillo(lluvia.arriba));
  const noche = P.paleta(P.posicionSol(HOY(2, 0), SALIDA, PUESTA));
  assert.equal(P.ajustarPorTiempo(noche, { weatherCode: 3, categoria: 'nublado' }).estrellas < 0.1, true);
  assert.equal(P.ajustarPorTiempo(noche, null).estrellas, noche.estrellas); // sin datos: cielo limpio
});

test('nubosidad y niebla según el código WMO y la humedad', () => {
  assert.equal(P.nubosidadDe(0), 0);
  assert.ok(P.nubosidadDe(2) > P.nubosidadDe(1));
  assert.equal(P.nubosidadDe(95), 1);
  assert.equal(P.nubosidadDe(null), 0);
  const dia = P.posicionSol((SALIDA + PUESTA) / 2, SALIDA, PUESTA);
  const alba = P.posicionSol(SALIDA + 20 * 60000, SALIDA, PUESTA);
  assert.ok(P.nieblaDe({ weatherCode: 45 }, dia) > 0.6);
  assert.equal(P.nieblaDe({ weatherCode: 0, humedad: 96 }, dia), 0);    // mediodía: no
  assert.ok(P.nieblaDe({ weatherCode: 0, humedad: 96 }, alba) > 0.3);   // mañana húmeda: sí
  assert.equal(P.nieblaDe(null, dia), 0);
  // Y se va despacio según sube el sol, sin desaparecer de golpe.
  const niebla = (altura) => P.nieblaDe({ weatherCode: 0, humedad: 96 }, { dia: true, t: 0.1, altura });
  assert.ok(niebla(0.25) < niebla(0.15) && niebla(0.25) > niebla(0.4));
});

// Impide: una costura visible cada vez que la capa de montañas da la vuelta.
test('las montañas encajan sin costura: el perfil se repite cada ancho', () => {
  const ancho = 640;
  const h = P.perfil(101, [[1, 1], [2, 0.7], [3, 0.5], [5, 0.3], [8, 0.18], [13, 0.08]], ancho);
  for (const x of [0, 13.7, 200, 639]) assert.ok(cerca(h(x), h(x + ancho), 1e-9), `x=${x}`);
  for (let x = 0; x < ancho; x += 10) assert.ok(h(x) >= -1 && h(x) <= 1);
  // Misma semilla, mismo paisaje: no cambia entre arranques.
  const h2 = P.perfil(101, [[1, 1], [2, 0.7], [3, 0.5], [5, 0.3], [8, 0.18], [13, 0.08]], ancho);
  assert.equal(h(123), h2(123));
});
