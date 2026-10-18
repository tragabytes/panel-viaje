// actualizacion.js — Que una versión nueva entre sola, sin recargar nunca en marcha (D24).
//
// Antes, una versión publicada no se veía en el móvil hasta cerrar la app del
// todo dos veces: Android reanuda la app sin recargarla (y así ni mira si hay
// versión nueva), y al arrancar de cero enseña la guardada mientras baja la
// nueva en segundo plano.
//
// Ahora:
//   · Al volver a la app se mira si hay versión nueva (como mucho cada 15 min:
//     cada comprobación es una petición pequeña al service worker).
//   · Cuando la versión nueva toma el control, la página se recarga sola, pero
//     solo con el coche parado: recién abierta (primer minuto) o tras 3 minutos
//     parado (más que un semáforo largo). Nunca en marcha, ni en un túnel (sin
//     GPS reciente no se sabe si va parado). Si no, espera.
//
// API pública (Actualizacion):
//   Actualizacion.iniciar()      registra el service worker y vigila
//   Actualizacion.gps(velKmh)    en cada tick de GPS
//   Actualizacion.debeRecargar(estado) → boolean   (pura, probada en Node)

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const VEL_PARADO_KMH = 5;
  // Parado al menos esto (con GPS reciente) para recargar a mitad de viaje.
  const PARADO_MS = 3 * 60 * 1000;
  // Recién abierta y parada: la versión nueva entra sin esperar.
  const ARRANQUE_MS = 60 * 1000;
  // Un tick de GPS de hace más no cuenta: en un túnel no se sabe si va parado.
  const TICK_RECIENTE_MS = 10 * 1000;
  // Nunca dos recargas seguidas (por si algo fallara: sin bucles).
  const ANTIRREBOTE_MS = 60 * 1000;
  const COMPROBAR_CADA_MS = 15 * 60 * 1000;
  const CLAVE_RECARGA = 'panel-recargado-por-actualizacion';

  // estado = { pendiente, ahora, arranque, hayGps, ultimoTick, paradoDesde, ultimaRecarga }
  //   paradoDesde: desde cuándo los ticks dicen parado (null = en marcha)
  function debeRecargar(e) {
    if (!e.pendiente) return false;
    if (e.ultimaRecarga != null && e.ahora - e.ultimaRecarga < ANTIRREBOTE_MS) return false;
    // Sin GPS en toda la sesión (en casa, sin permiso): no consta que vaya en marcha.
    if (!e.hayGps) return true;
    const reciente = e.ultimoTick != null && e.ahora - e.ultimoTick <= TICK_RECIENTE_MS;
    if (!reciente || e.paradoDesde == null) return false;
    if (e.ahora - e.arranque < ARRANQUE_MS) return true;
    return e.ahora - e.paradoDesde >= PARADO_MS;
  }

  // --- Estado de la sesión ---

  let registro = null;
  let pendiente = false;
  let habiaControlador = false;
  let arranque = 0;
  let hayGps = false;
  let ultimoTick = null;
  let paradoDesde = null;
  let ultimaRecarga = null;
  let ultimaComprobacion = 0;

  function log(nivel, texto) {
    if (typeof debug !== 'undefined' && debug[nivel]) debug[nivel](texto);
  }

  function quizaRecargar() {
    const estado = { pendiente, ahora: Date.now(), arranque, hayGps, ultimoTick, paradoDesde, ultimaRecarga };
    if (!debeRecargar(estado)) return;
    pendiente = false;
    try { sessionStorage.setItem(CLAVE_RECARGA, String(estado.ahora)); } catch (e) { /* sin sessionStorage */ }
    log('log', 'Actualización: recargando para entrar en la versión nueva');
    location.reload();
  }

  function comprobar() {
    if (!registro || Date.now() - ultimaComprobacion < COMPROBAR_CADA_MS) return;
    ultimaComprobacion = Date.now();
    registro.update().catch(() => { /* sin red: ya mirará la próxima vez */ });
  }

  function iniciar() {
    if (!('serviceWorker' in navigator)) {
      log('log', 'SW no soportado por este navegador');
      return;
    }
    arranque = Date.now();
    // Si nadie controlaba la página, es la primera instalación: lo cargado ya
    // es la última versión y su "cambio de control" no pide recargar.
    habiaControlador = !!navigator.serviceWorker.controller;
    try {
      const previa = Number(sessionStorage.getItem(CLAVE_RECARGA));
      ultimaRecarga = previa > 0 ? previa : null;
    } catch (e) { /* sin sessionStorage */ }

    // DT-01 (sesión 33): service worker para funcionar sin cobertura e
    // instalarse como PWA. Si falla el registro, el panel sigue (sin caché).
    navigator.serviceWorker.register('service-worker.js')
      .then((reg) => {
        registro = reg;
        ultimaComprobacion = Date.now(); // register() ya ha mirado si hay versión nueva
        log('log', 'SW registrado (scope: ' + reg.scope + ')');
      })
      .catch((err) => { log('warn', 'SW registro fallido: ' + (err && err.message ? err.message : err)); });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaControlador) { habiaControlador = true; return; }
      pendiente = true;
      log('log', 'Actualización: versión nueva lista; entrará con el coche parado');
      quizaRecargar();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      comprobar();
      quizaRecargar();
    });

    // Para los casos sin ticks de GPS (en casa, sin permiso).
    setInterval(quizaRecargar, 15000);
  }

  function gps(velKmh) {
    const ahora = Date.now();
    hayGps = true;
    ultimoTick = ahora;
    if (velKmh != null && velKmh >= VEL_PARADO_KMH) paradoDesde = null;
    else if (paradoDesde == null) paradoDesde = ahora;
    if (pendiente) quizaRecargar();
  }

  __global__.Actualizacion = { iniciar, gps, debeRecargar };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.Actualizacion;
  }
})();
