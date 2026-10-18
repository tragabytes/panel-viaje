// Cuaderno de viaje, H1: marcar un momento sin mirar (specs/001-cuaderno-de-viaje).
//
// Se ejecutan con: node --test
//
// El gesto se prueba con un reloj falso (mock.timers). Que las marcas sobrevivan
// se prueba sobre el texto del código: ningún otro módulo puede tocar su base de
// datos. Cada comprobación sobre texto lleva su caso roto a propósito.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Cuaderno = require('../js/cuaderno.js');
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

// ---------------------------------------------------------------- el gesto

function detectorConReloj(t) {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  let marcas = 0;
  const d = Cuaderno.crearDetectorToqueLargo(() => { marcas++; });
  return { d, marcas: () => marcas };
}

// Deslizamiento normal entre vistas: el dedo recorre 300 px en 300 ms.
function deslizar(d, id, { esperaAntesMs = 0 } = {}) {
  d.down(id, 400, 200, true);
  mock.timers.tick(esperaAntesMs);
  for (let i = 1; i <= 10; i++) {
    d.move(id, 400 - i * 30, 200);
    mock.timers.tick(30);
  }
  d.up(id);
}

test('mantener el dedo quieto 1 s marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(1000);
  assert.equal(marcas(), 1);
  d.up(1);
  assert.equal(marcas(), 1);
});

test('un temblor de pocos píxeles no cancela', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(400);
  d.move(1, 304, 203);
  mock.timers.tick(600);
  assert.equal(marcas(), 1);
});

// Impide: marcas falsas al pasar de una vista a otra (R-005, E-003).
test('deslizar entre las 4 vistas no marca nunca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  for (let id = 1; id <= 6; id++) deslizar(d, id);
  // Dedo apoyado un rato antes de deslizar: el caso más traicionero.
  deslizar(d, 7, { esperaAntesMs: 900 });
  mock.timers.tick(5000);
  assert.equal(marcas(), 0);
});

test('soltar antes de 1 s no marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(900);
  d.up(1);
  mock.timers.tick(2000);
  assert.equal(marcas(), 0);
});

test('si el navegador empieza a desplazar la vista, no marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(500);
  d.up(1); // pointercancel
  mock.timers.tick(2000);
  assert.equal(marcas(), 0);
});

test('con un segundo dedo, no marca', (t) => {
  const { d, marcas } = detectorConReloj(t);
  d.down(1, 300, 200, true);
  mock.timers.tick(300);
  d.down(2, 500, 200, false);
  mock.timers.tick(2000);
  assert.equal(marcas(), 0);
});

// ---------------------------------------------------------------- la marca

const POS = { lat: 42.4597, lon: -6.1964, precision: 6, rumbo: 270, velocidadKmh: 90, ts: 1000 };

test('la marca guarda hora, posición, precisión, sentido y velocidad', () => {
  const m = Cuaderno.construirMarca(POS, 3000, null);
  assert.deepEqual(m, {
    id: 3000, lat: 42.4597, lon: -6.1964, precisionM: 6, rumbo: 270,
    velocidadKmh: 90, posicionTs: 1000, aproximada: false,
  });
});

// Impide: dos marcas por un doble toque nervioso (criterio 4 de H1).
test('dos marcas en menos de 10 s son una', () => {
  assert.equal(Cuaderno.construirMarca(POS, 9999, 1000), null);
  assert.notEqual(Cuaderno.construirMarca(POS, 11000, 1000), null);
});

test('parado, el sentido de la marcha queda desconocido', () => {
  const m = Cuaderno.construirMarca({ ...POS, velocidadKmh: 0 }, 3000, null);
  assert.equal(m.rumbo, null);
});

test('con la última posición de hace rato (túnel), la marca es aproximada', () => {
  assert.equal(Cuaderno.construirMarca(POS, 1000 + 31000, null).aproximada, true);
});

test('sin GPS todavía, se guarda igual: la hora, sin posición, aproximada', () => {
  const m = Cuaderno.construirMarca(null, 3000, null);
  assert.equal(m.id, 3000);
  assert.equal(m.lat, null);
  assert.equal(m.aproximada, true);
});

// ---------------------------------------------------------------- H2: lo que había alrededor

// El panel en la LE-142, pasando por Santa Colomba de Somoza hacia el oeste.
const PANEL = {
  ubicacion: { municipio: 'Santa Colomba de Somoza', provincia: 'León', ccaa: 'Castilla y León' },
  via: { codigo: 'LE-142', textoCrudo: 'Carretera de Astorga a Foncebadón', tipo: 'provincial' },
  pueblos: [
    { nombre: 'Rabanal del Camino', lat: 42.4813, lon: -6.2840,
      pois: [{ nombre: 'Iglesia de Santa María', tipo: 'church', lat: 42.4815, lon: -6.2845, foto: null }] },
    { nombre: 'Santa Colomba de Somoza', lat: 42.4436, lon: -6.2442,
      pois: [{ nombre: 'Iglesia de Santa María', tipo: 'church', lat: 42.4815, lon: -6.2845, foto: null }] },
    { nombre: 'El Ganso', lat: 42.4630, lon: -6.2105, pois: [] },
  ],
  meteo: { temperatura: 11.4, descripcion: 'Lluvia ligera', categoria: 'lluvia', weatherCode: 61,
    vientoVelocidad: 14, vientoDireccion: 280, esDia: true, hora: '2026-10-18T12:00' },
};
const AQUI = { lat: 42.4600, lon: -6.2300, precision: 5, rumbo: 270, velocidadKmh: 80, ts: 1000 };

test('la marca guarda municipio, vía, pueblos, puntos de interés y tiempo', () => {
  const c = Cuaderno.construirContexto(PANEL, AQUI);
  assert.equal(c.municipio, 'Santa Colomba de Somoza');
  assert.deepEqual(c.via, { codigo: 'LE-142', texto: 'Carretera de Astorga a Foncebadón' });
  assert.equal(c.pueblos.length, 3);
  assert.equal(c.meteo.categoria, 'lluvia');
  assert.equal(c.meteo.temperatura, 11.4);
  assert.equal(c.pendiente, false);
});

// Impide: guardar la distancia desde donde el panel consultó, no desde la marca.
test('distancias y rumbos se miden desde la marca, y van del más cerca al más lejos', () => {
  const c = Cuaderno.construirContexto(PANEL, AQUI);
  assert.deepEqual(c.pueblos.map((p) => p.nombre), ['El Ganso', 'Santa Colomba de Somoza', 'Rabanal del Camino']);
  const ganso = c.pueblos[0];
  assert.ok(ganso.distKm > 1.5 && ganso.distKm < 2.0, `El Ganso a ${ganso.distKm} km`);
  assert.ok(ganso.rumbo > 45 && ganso.rumbo < 90, `El Ganso al ${ganso.rumbo}° (al nordeste)`);
});

test('un punto de interés compartido por dos pueblos se guarda una vez', () => {
  assert.equal(Cuaderno.construirContexto(PANEL, AQUI).pois.length, 1);
});

test('sin municipio, con el municipio atenuado o sin pueblos, queda pendiente de completar', () => {
  assert.equal(Cuaderno.construirContexto({ ...PANEL, ubicacion: null }, AQUI).pendiente, true);
  assert.equal(Cuaderno.construirContexto({ ...PANEL, ubicacionVieja: true }, AQUI).pendiente, true);
  assert.equal(Cuaderno.construirContexto({ ...PANEL, pueblos: [] }, AQUI).pendiente, true);
});

test('sin GPS se guarda lo que haya, sin distancias', () => {
  const c = Cuaderno.construirContexto(PANEL, null);
  assert.equal(c.pueblos.length, 3);
  assert.equal(c.pueblos[0].distKm, null);
});

test('las marcas de la primera versión (sin contexto) también se completan', () => {
  const m = Cuaderno.construirMarca(AQUI, 3000, null);
  assert.equal(Cuaderno.necesitaCompletar(m), true);
  assert.equal(Cuaderno.necesitaCompletar({ ...m, lat: null, lon: null }), false);
});

test('completar rellena lo que faltaba y no pisa lo que el panel vio', () => {
  const m = { ...Cuaderno.construirMarca(AQUI, 3000, null),
    contexto: Cuaderno.construirContexto({ ...PANEL, ubicacion: null }, AQUI) };
  const datos = {
    ubicacion: { municipio: 'Otro', provincia: 'León', ccaa: 'Castilla y León' },
    via: { codigo: 'N-VI', textoCrudo: 'Otra' },
    pueblos: [{ nombre: 'Foncebadón', lat: 42.49, lon: -6.34 }],
    sitios: [{ nombre: 'Cruz de Ferro', lat: 42.4886, lon: -6.3614, pageid: 123 }],
  };
  const c = Cuaderno.completarContexto(m, datos, 5000).contexto;
  assert.equal(c.municipio, 'Otro');                 // faltaba: se rellena
  assert.equal(c.via.codigo, 'LE-142');              // el panel la vio: se queda
  assert.equal(c.pueblos.length, 3);                 // tenía pueblos: se quedan
  assert.equal(c.sitios[0].nombre, 'Cruz de Ferro');
  assert.equal(c.pendiente, false);
  assert.equal(c.completado, 5000);
});

// Impide: que un fallo de red borre datos de una marca (CLAUDE.md, regla 4).
test('una consulta fallida (null) no borra nada al completar', () => {
  const m = { ...Cuaderno.construirMarca(AQUI, 3000, null), contexto: Cuaderno.construirContexto(PANEL, AQUI) };
  const c = Cuaderno.completarContexto(m, { ubicacion: null, via: null, pueblos: null, sitios: null }, 5000).contexto;
  assert.equal(c.municipio, 'Santa Colomba de Somoza');
  assert.equal(c.pueblos.length, 3);
  assert.equal(c.sitios, undefined);
});

// ---------------------------------------------------------------- H3: revisar

test('"era esto" y la nota se guardan sin tocar el resto de la marca', () => {
  const m = { ...Cuaderno.construirMarca(AQUI, 3000, null), contexto: Cuaderno.construirContexto(PANEL, AQUI) };
  const r = Cuaderno.aplicarRevision(m, { elegido: { nombre: 'El Ganso', lat: 42.463, lon: -6.2105, tipo: 'pueblo' }, nota: '  volver en primavera  ' }, 9000);
  assert.equal(r.revision.elegido.nombre, 'El Ganso');
  assert.equal(r.revision.nota, 'volver en primavera');
  assert.deepEqual(r.contexto, m.contexto);
  assert.equal(r.lat, m.lat);
  const sinElegir = Cuaderno.aplicarRevision(r, { elegido: null }, 9500);
  assert.equal(sinElegir.revision.elegido, null);
  assert.equal(sinElegir.revision.nota, 'volver en primavera');
});

test('los candidatos dicen a qué lado quedaban, también detrás', () => {
  const m = { ...Cuaderno.construirMarca(AQUI, 3000, null), contexto: Cuaderno.construirContexto(PANEL, AQUI) };
  const lados = Object.fromEntries(Cuaderno.candidatos(m).map((c) => [c.nombre, c.lado]));
  // Hacia el oeste (270°): El Ganso (NE) queda detrás; Rabanal (NO), delante.
  assert.equal(lados['El Ganso'], 'detrás');
  assert.equal(lados['Rabanal del Camino'], 'delante');
  assert.equal(Cuaderno.lado(0, 270), 'derecha');
  assert.equal(Cuaderno.lado(180, 270), 'izquierda');
  assert.equal(Cuaderno.lado(90, null), null);
});

test('los candidatos no se repiten aunque vengan del panel y de Wikipedia', () => {
  const m = { ...Cuaderno.construirMarca(AQUI, 3000, null),
    contexto: { ...Cuaderno.construirContexto(PANEL, AQUI), sitios: [{ nombre: 'El Ganso', lat: 42.463, lon: -6.21 }] } };
  assert.equal(Cuaderno.candidatos(m).filter((c) => c.nombre === 'El Ganso').length, 1);
});

test('las marcas se agrupan por viaje: más de 4 h sin marcar es otro viaje', () => {
  const h = 3600 * 1000;
  const marcas = [0, 1 * h, 2.5 * h, 9 * h, 9.5 * h].map((id) => ({ id }));
  const viajes = Cuaderno.agruparPorViaje(marcas);
  assert.equal(viajes.length, 2);
  assert.deepEqual(viajes[0].marcas.map((m) => m.id), [9 * h, 9.5 * h]); // el más reciente primero
  assert.deepEqual(viajes[1].marcas.map((m) => m.id), [0, 1 * h, 2.5 * h]);
});

// Impide: que importar una copia vieja pise marcas revisadas después.
test('importar solo añade marcas que no existen', () => {
  const locales = [{ id: 1, lat: 1, lon: 1, revision: { nota: 'nueva' } }];
  const copia = [{ id: 1, lat: 1, lon: 1, revision: { nota: 'vieja' } }, { id: 2, lat: 2, lon: 2 }, { basura: true }];
  assert.deepEqual(Cuaderno.fusionarImportacion(locales, copia).map((m) => m.id), [2]);
});

test('la copia de seguridad se lee en su formato o como lista suelta', () => {
  const marcas = [{ id: 5, lat: null, lon: null }];
  assert.equal(Cuaderno.leerCopia(JSON.stringify({ formato: 'panel-viaje-cuaderno', marcas })).length, 1);
  assert.equal(Cuaderno.leerCopia(marcas).length, 1);
  assert.throws(() => Cuaderno.leerCopia('{"otra": 1}'));
});

test('el texto para compartir lleva lugar, lo elegido, la nota y el enlace al mapa', () => {
  const m = Cuaderno.aplicarRevision(
    { ...Cuaderno.construirMarca(AQUI, new Date(2026, 9, 18, 12, 10).getTime(), null), contexto: Cuaderno.construirContexto(PANEL, AQUI) },
    { elegido: { nombre: 'El Ganso', lat: 42.463, lon: -6.2105 }, nota: 'mirar la iglesia' }, 1);
  const texto = Cuaderno.textoParaCompartir([m]);
  assert.match(texto, /18\/10 12:10 · Santa Colomba de Somoza, LE-142 · era: El Ganso · mirar la iglesia/);
  assert.match(texto, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=42\.46300,-6\.21050/);
});

// ---------------------------------------------------------------- que no se pierdan

function ficherosJs(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return ficherosJs(ruta);
    return nombre.endsWith('.js') ? [ruta] : [];
  });
}

function hacePeticiones(codigo) {
  return /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket/.test(codigo);
}

// Impide: que marcar gaste datos (R-003) y que, sin red, marcar se cuelgue.
test('el cuaderno no hace ninguna petición a internet', () => {
  assert.equal(hacePeticiones(leer('js/cuaderno.js')), false);
});

test('(control) la comprobación de peticiones detecta un fetch', () => {
  assert.equal(hacePeticiones("await fetch('https://nominatim.openstreetmap.org/x')"), true);
});

function quienNombra(nombre, ficheros) {
  return ficheros.filter(([, texto]) => texto.includes(nombre)).map(([ruta]) => ruta);
}

// Impide: que la rotación de logs, una limpieza de cachés o el service worker
// borren marcas (R-004, regla 9). Nadie más que cuaderno.js nombra su base.
test('solo el cuaderno conoce su base de datos', () => {
  const ficheros = [...ficherosJs(join(RAIZ, 'js')), join(RAIZ, 'service-worker.js')]
    .map((ruta) => [relative(RAIZ, ruta).replace(/\\/g, '/'), readFileSync(ruta, 'utf8')]);
  assert.deepEqual(quienNombra(Cuaderno.DB_NAME, ficheros), ['js/cuaderno.js']);
});

test('(control) la comprobación detecta otro módulo que abre la base', () => {
  const ficheros = [['js/cuaderno.js', "'panel-viaje-cuaderno'"], ['js/trayectos.js', "indexedDB.deleteDatabase('panel-viaje-cuaderno')"]];
  assert.deepEqual(quienNombra('panel-viaje-cuaderno', ficheros), ['js/cuaderno.js', 'js/trayectos.js']);
});

function borraEnBloque(codigo) {
  return /deleteDatabase|\.clear\s*\(/.test(codigo);
}

test('el cuaderno no tiene ningún borrado en bloque', () => {
  assert.equal(borraEnBloque(leer('js/cuaderno.js')), false);
});

test('(control) la comprobación de borrado en bloque detecta un clear()', () => {
  assert.equal(borraEnBloque("tx.objectStore('marcas').clear()"), true);
});

test('el service worker no toca IndexedDB', () => {
  assert.equal(/indexedDB/.test(leer('service-worker.js')), false);
});
