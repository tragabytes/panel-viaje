// Overpass: un servidor que no contesta no puede frenar la vía (DECISIONES D7).
//
// Se ejecutan con: node --test
//
// Los servidores son falsos (un fetch de mentira) y el reloj también (mock.timers):
// así se prueba la espera de 8 s sin esperar y sin mandar ni una petición real.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RUTA = require.resolve('../js/overpass.js');

// Overpass guarda estado (servidores apartados, fila): cada test lo carga de cero.
function cargarOverpass() {
  delete require.cache[RUTA];
  delete globalThis.Overpass;
  return require(RUTA);
}

// fetch falso: el servidor `muerto` no contesta nunca (solo se rinde cuando el
// panel corta la espera); los demás contestan cuando se llama a `responder`.
function servidoresFalsos({ muerto, alInstante = true }) {
  const llamadas = [];
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    const host = url.split('/')[2];
    const query = decodeURIComponent(opts.body.slice('data='.length));
    const responder = () => resolve({ ok: true, status: 200, json: async () => ({ elements: [] }) });
    llamadas.push({ host, query, responder });
    opts.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
    if (host !== muerto && alInstante) responder();
  });
  return llamadas;
}

const vaciarMicrotareas = () => new Promise((r) => setImmediate(r));

async function avanzar(ms) {
  for (let t = 0; t < ms; t += 100) {
    mock.timers.tick(100);
    await vaciarMicrotareas();
  }
}

// Impide: con un servidor callado, cada consulta vuelve a esperarle 8 s y la vía
// tarda más de un minuto en salir (medido en la ruta M-505 del simulador, D7).
test('con un servidor que no contesta, la vía sale en menos de 10 s', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  servidoresFalsos({ muerto: Overpass.MIRRORS[0].split('/')[2] });

  // Lo que pasa al arrancar: pueblos y puntos de interés piden a la vez que la vía.
  for (const nombre of ['POI-pueblos', 'POI-gasolineras', 'POI-cultura']) {
    Overpass.query(`[${nombre}]`, nombre).catch(() => {});
  }
  let viaEn = null;
  Overpass.query('[RoadRef]', 'RoadRef').then(() => { viaEn = Date.now(); });

  await avanzar(20000);
  assert.ok(viaEn !== null, 'la vía no ha salido en 20 s');
  assert.ok(viaEn < 10000, `la vía ha tardado ${viaEn / 1000} s`);
});

// Impide: la consulta de la vía (la más ligera y la más importante) esperando en
// la fila detrás de las de pueblos y puntos de interés (23 s en la M-505, D7).
test('la consulta de la vía se cuela en la fila', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  const llamadas = servidoresFalsos({ muerto: null, alInstante: false });

  for (const nombre of ['POI-pueblos', 'POI-gasolineras', 'POI-cultura']) {
    Overpass.query(`[${nombre}]`, nombre).catch(() => {});
  }
  Overpass.query('[RoadRef]', 'RoadRef').catch(() => {});
  await vaciarMicrotareas();
  assert.deepEqual(llamadas.map((l) => l.query), ['[POI-pueblos]', '[POI-gasolineras]']);

  llamadas[0].responder();
  await vaciarMicrotareas();
  assert.equal(llamadas[2].query, '[RoadRef]');
});

// --- 19/10/2026: el principal tardaba 22 s en todo y el de reserva estaba roto ---

// fetch falso con un comportamiento por servidor:
//   'ok'            contesta en el acto
//   'muerto'        no contesta nunca
//   'roto'          falla en el acto como "Failed to fetch" (un 500 sin cabeceras CORS)
//   { tarda: ms }   contesta pasado ese tiempo
//   { status: n }   contesta en el acto con ese error HTTP
function servidores(comportamiento) {
  const llamadas = [];
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    const host = url.split('/')[2];
    const c = comportamiento[host] || 'ok';
    const llamada = { host, en: Date.now(), cortada: false };
    llamadas.push(llamada);
    const ok = () => resolve({ ok: true, status: 200, json: async () => ({ elements: [], host }) });
    opts.signal.addEventListener('abort', () => {
      llamada.cortada = true;
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
    if (c === 'ok') ok();
    else if (c === 'roto') reject(new TypeError('Failed to fetch'));
    else if (c.status) resolve({ ok: false, status: c.status, json: async () => ({}) });
    else if (c.tarda) setTimeout(ok, c.tarda);
  });
  return llamadas;
}

const HOSTS = () => globalThis.Overpass.MIRRORS.map((m) => m.split('/')[2]);

// Impide: rendirse a los 8 s con un servidor que sí contesta, pero tarde. El
// 18/10 por Las Rozas fallaron 49 de 54 consultas y el 19/10 el principal
// tardaba 22 s en contestar cualquier cosa (medido desde casa).
test('un servidor lento se espera si los demás fallan', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  const [lento, roto, saturado] = HOSTS();
  servidores({ [lento]: { tarda: 22000 }, [roto]: 'roto', [saturado]: { status: 504 } });

  let resultado = null;
  Overpass.query('[pueblos]', 'POI-pueblos').then((r) => { resultado = r; }, () => { resultado = 'fallo'; });
  await avanzar(25000);
  assert.equal(resultado && resultado.mirror, lento, `ha dado ${JSON.stringify(resultado)}`);
});

// Impide: llamar a la puerta de un servidor roto en cada consulta (31 veces en
// un cuarto de hora el 18/10): se aparta un minuto, como al que no contesta.
test('un servidor roto se aparta un minuto y luego se vuelve a probar', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  const [roto, bueno] = HOSTS();
  const llamadas = servidores({ [roto]: 'roto', [bueno]: 'ok' });

  await Overpass.query('[a]', 'POI-a');
  await avanzar(1000);
  await Overpass.query('[b]', 'POI-b');
  assert.deepEqual(llamadas.map((l) => l.host), [roto, bueno, bueno], 'la segunda no debía preguntar al roto');

  await avanzar(60000);
  await Overpass.query('[c]', 'POI-c');
  assert.equal(llamadas[3].host, roto, 'pasado el minuto se le vuelve a probar');
});

// Impide: con todos los servidores caídos (o sin red), seguir mandando consultas
// que van a fallar: gastan datos y retrasan lo demás.
test('con todos apartados no se pregunta a nadie', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  const llamadas = servidores(Object.fromEntries(HOSTS().map((h) => [h, 'roto'])));

  await assert.rejects(Overpass.query('[a]', 'POI-a'), /todos_mirrors_fallaron/);
  const tras1 = llamadas.length;
  await assert.rejects(Overpass.query('[b]', 'POI-b'), /todos_mirrors_fallaron/);
  assert.equal(llamadas.length, tras1, 'la segunda consulta no debía salir');
});

// Impide: esperar a uno callado sin preguntar a nadie más. A los 8 s se pregunta
// también al siguiente, se usa la primera respuesta y al callado se le aparta.
test('a los 8 s sin respuesta se pregunta también al siguiente', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  const [callado, siguiente] = HOSTS();
  const llamadas = servidores({ [callado]: 'muerto', [siguiente]: { tarda: 2000 } });

  let resultado = null;
  Overpass.query('[a]', 'POI-a').then((r) => { resultado = r; });
  await avanzar(11000);
  assert.equal(resultado && resultado.mirror, siguiente);
  assert.equal(llamadas[1].en - llamadas[0].en, Overpass.RELEVO_MS, 'al siguiente se le pregunta a los 8 s');
  assert.ok(llamadas[0].cortada, 'la petición al callado se corta');

  Overpass.query('[b]', 'POI-b').catch(() => {});
  await avanzar(3000);
  assert.equal(llamadas[2].host, siguiente, 'al callado no se le vuelve a esperar');
});

// Impide: con el servidor lento, las consultas de la vía amontonadas en la fila
// (7 en la prueba del 19/10 con el simulador): cuando les llega el turno ya no
// sirven, porque el coche está en otro sitio. La nueva sustituye a la vieja.
test('en la fila, la consulta nueva de la vía sustituye a la que esperaba', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  t.after(() => mock.timers.reset());
  const Overpass = cargarOverpass();
  const llamadas = servidoresFalsos({ muerto: null, alInstante: false });

  Overpass.query('[POI-pueblos]', 'POI-pueblos').catch(() => {});
  Overpass.query('[Gasolineras]', 'Gasolineras').catch(() => {});
  let vieja = null;
  Overpass.query('[RoadRef vieja]', 'RoadRef').catch((e) => { vieja = e.message; });
  Overpass.query('[RoadRef nueva]', 'RoadRef').catch(() => {});
  await vaciarMicrotareas();
  assert.equal(vieja, 'reemplazada');

  llamadas[0].responder();
  await vaciarMicrotareas();
  assert.equal(llamadas[2].query, '[RoadRef nueva]');
});
