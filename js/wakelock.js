// js/wakelock.js
// WakeLockModule — mantiene la pantalla encendida mientras el panel está visible.
//
// Usa la Screen Wake Lock API estándar (Chrome 84+). Cuando la pestaña pasa a
// segundo plano (cambias de app, bloqueas el móvil con el botón), el lock se
// libera solo. Cuando la pestaña vuelve al primer plano, lo recuperamos.
//
// Loguea en el panel de debug las activaciones, liberaciones y reactivaciones,
// para poder verificar en vivo que está funcionando.
//
// API pública:
//   WakeLock.activar()  → pide el lock por primera vez
//   WakeLock.estado()   → 'activo' | 'liberado' | 'no-soportado' | 'error'
//
// Uso típico desde index.html: llamar a WakeLock.activar() una vez al arrancar.
// El módulo se encarga solo de reactivarlo cuando vuelves del segundo plano.

(function () {
  'use strict';

  var lock = null;
  var soportado = ('wakeLock' in navigator);
  var estadoActual = soportado ? 'liberado' : 'no-soportado';

  // D40: al volver con el móvil bloqueado, Chrome dice "visible" antes de
  // desbloquear, Android niega el lock ("The requesting page is not visible")
  // y al desbloquear no llega otro aviso: la pantalla se apagaba sola (logs
  // del 18/10 a las 16:29 y del 19/10 a las 7:30). Mientras el panel esté
  // visible y sin lock, se vuelve a pedir cada REINTENTO_MS.
  var REINTENTO_MS = 5000;
  var reintento = null;
  var avisadoFallo = false;

  function programarReintento() {
    if (reintento) return;
    reintento = setTimeout(function () {
      reintento = null;
      if (document.visibilityState === 'visible' && (!lock || lock.released)) activar();
    }, REINTENTO_MS);
  }

  function activar() {
    if (!soportado) {
      debug.warn('WakeLock no soportado por este navegador');
      return Promise.resolve(false);
    }
    // Si ya tenemos un lock vivo, no pedimos otro.
    if (lock && !lock.released) {
      return Promise.resolve(true);
    }
    return navigator.wakeLock.request('screen')
      .then(function (sentinel) {
        lock = sentinel;
        estadoActual = 'activo';
        avisadoFallo = false;
        debug.log('WakeLock activo: pantalla no se apagará');
        // Cuando el sistema lo libera (por ejemplo al pasar a segundo plano),
        // se dispara este evento. Lo registramos para saberlo en el log.
        sentinel.addEventListener('release', function () {
          estadoActual = 'liberado';
          debug.warn('WakeLock liberado por el sistema');
        });
        return true;
      })
      .catch(function (err) {
        estadoActual = 'error';
        // Solo el primer fallo al log: los reintentos callados hasta que salga.
        if (!avisadoFallo) {
          debug.error('WakeLock error: ' + (err && err.message ? err.message : err) + ' · se reintenta cada ' + (REINTENTO_MS / 1000) + ' s');
          avisadoFallo = true;
        }
        if (document.visibilityState === 'visible') programarReintento();
        return false;
      });
  }

  // Cuando la pestaña vuelve al primer plano tras haber estado oculta,
  // hay que volver a pedir el lock porque el sistema lo libera al ocultarse.
  function alCambiarVisibilidad() {
    if (document.visibilityState === 'visible') {
      // Solo intentamos reactivar si el lock está liberado o nunca activado.
      if (!lock || lock.released) {
        debug.log('WakeLock: pestaña visible de nuevo, reactivando…');
        activar();
      }
    }
  }

  document.addEventListener('visibilitychange', alCambiarVisibilidad);

  window.WakeLock = {
    activar: activar,
    estado: function () { return estadoActual; }
  };
})();
