// js/simulator.js — Simulador de GPS para desarrollo
//
// Permite probar el panel sin conducir: sustituye navigator.geolocation por
// un generador que recorre una ruta predefinida y entrega posiciones al
// mismo callback que usaría el GPS real.
//
// Activación por parámetros en la URL:
//   ?sim=nombreRuta       → activa simulación con la ruta indicada
//   ?sim=nombreRuta&speed=5  → velocidad x5 (default x10 para modo rápido)
//
// Rutas disponibles (definidas en js/rutas.js):
//   urbano-lasrozas, a6, m505, cruce-a6-m505
//
// Dependencias:
//   - js/debug.js (para el log)
//   - js/rutas.js (para el catálogo de rutas)
//
// API pública:
//   Simulator.estaActivo()     → boolean
//   Simulator.nombreRuta()     → string | null
//   Simulator.iniciar(cb)      → arranca el ticking y llama cb(posicion) cada intervalo
//   Simulator.detener()        → para el ticking
//
// El cb(posicion) recibe un objeto con la MISMA forma que lo que da
// navigator.geolocation.watchPosition: { coords: { latitude, longitude,
// accuracy, speed, heading } }

(function () {
  'use strict';

  // --- Parseo de parámetros ---
  const params = new URLSearchParams(window.location.search);
  const nombreRuta = params.get('sim');
  const speedParam = parseFloat(params.get('speed'));
  const factor = (isNaN(speedParam) || speedParam <= 0) ? 10 : speedParam;  // default x10

  // Banco de pruebas: emula un GPS Android viejo que no reporta coords.speed.
  // Activar con ?simSpeedNull=1 para validar el fallback de velocidad.
  const forzarSpeedNull = params.get('simSpeedNull') === '1';

  // --- Configuración de tiempos ---
  //
  // Filosofía del intervalo entre ticks:
  //   Los puntos de las rutas están espaciados ~500 m a ~3 km entre sí.
  //   Si hiciéramos un tick por segundo, la "velocidad percibida" sería
  //   absurda (miles de km/h). Lo que queremos es que el panel vea
  //   movimiento a velocidad de coche normal, pero en modo simulación
  //   queremos poder acelerar.
  //
  //   Solución: fijamos una velocidad objetivo realista (100 km/h) para el
  //   factor x1. El intervalo entre ticks se calcula en cada tick según
  //   la distancia al siguiente punto, dividida por esa velocidad.
  //   Con factor x10, el intervalo se divide entre 10 (tarda 1/10 del
  //   tiempo real en recorrer cada tramo).
  //
  //   Así, para factor x10 y puntos separados ~2 km, el tick llega
  //   aproximadamente cada 7 segundos (2 km / 100 km/h / 10 = 7.2 s).
  //   Y la velocidad que reportamos al panel sigue siendo ~100 km/h
  //   (la velocidad del coche simulado, no la del reloj acelerado).
  const VELOCIDAD_OBJETIVO_KMH = 100;
  const VELOCIDAD_OBJETIVO_MS = VELOCIDAD_OBJETIVO_KMH / 3.6;
  const INTERVALO_MIN_MS = 200;        // nunca más rápido que 5 ticks/s
  const INTERVALO_MAX_MS = 15000;      // nunca más lento que 15 s/tick

  const activo = !!nombreRuta;

  // --- Estado interno ---
  let timerId = null;
  let indicePunto = 0;
  let rutaPuntos = null;
  let callbackPosicion = null;

  // --- Utilidades geográficas ---
  function distanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (g) => g * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Rumbo geográfico entre dos puntos, en grados (0=N, 90=E, 180=S, 270=W)
  function rumboGrados(lat1, lon1, lat2, lon2) {
    const toRad = (g) => g * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    let deg = toDeg(Math.atan2(y, x));
    return (deg + 360) % 360;
  }

  // --- Banner visual de simulación ---
  function mostrarBanner() {
    const banner = document.createElement('div');
    banner.id = 'sim-banner';
    banner.style.cssText = `
      position: fixed;
      top: 4px;
      left: 4px;
      z-index: 10000;
      background: rgba(220, 140, 20, 0.92);
      color: #000;
      font-family: monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      letter-spacing: 0.5px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    `;
    banner.textContent = `SIM · ${nombreRuta} · x${factor}`;
    document.body.appendChild(banner);
  }

  // --- Resolver la ruta desde el catálogo ---
  function cargarRuta() {
    // Nota: accedemos a Rutas directamente, NO window.Rutas, porque rutas.js
    // declara `const Rutas = ...` en el scope del script. Los const/let de
    // nivel superior de un <script> no se adjuntan al objeto global, pero sí
    // son visibles entre scripts del mismo documento. Error descubierto en
    // sesión 9.7 tras el primer deploy del simulador.
    if (typeof Rutas === 'undefined' || typeof Rutas.obtener !== 'function') {
      debug.error('[SIM] Rutas no disponible: falta js/rutas.js');
      return null;
    }
    const r = Rutas.obtener(nombreRuta);
    if (!r) {
      debug.error(`[SIM] Ruta desconocida: "${nombreRuta}". Disponibles: ${Rutas.listar().join(', ')}`);
      return null;
    }
    if (!r.puntos || r.puntos.length < 2) {
      debug.error(`[SIM] Ruta "${nombreRuta}" no tiene suficientes puntos (${r.puntos ? r.puntos.length : 0})`);
      return null;
    }
    debug.log(`[SIM] Ruta "${nombreRuta}" cargada: ${r.puntos.length} puntos, factor x${factor}`);
    if (r.descripcion) debug.log(`[SIM] ${r.descripcion}`);
    return r.puntos;
  }

  // --- Construir una "posición" con el mismo formato que navigator.geolocation ---
  // Ahora devuelve también el intervalo hasta el siguiente tick (en ms),
  // basado en la distancia y la velocidad objetivo aceleradas por el factor.
  function construirPosicion(i) {
    const p = rutaPuntos[i];
    const siguiente = rutaPuntos[Math.min(i + 1, rutaPuntos.length - 1)];
    const esUltimo = (p === siguiente);

    let heading = null;
    let distSiguiente = 0;
    if (!esUltimo) {
      distSiguiente = distanciaMetros(p.lat, p.lon, siguiente.lat, siguiente.lon);
      heading = rumboGrados(p.lat, p.lon, siguiente.lat, siguiente.lon);
    }

    // La velocidad reportada al panel es constante: la "velocidad del coche
    // simulado", no la del reloj acelerado. Así Maps/Nominatim ven un coche
    // circulando a 100 km/h, no a 1000.
    const speed = forzarSpeedNull
      ? null
      : (esUltimo ? 0 : VELOCIDAD_OBJETIVO_MS);

    // Intervalo hasta el siguiente tick: tiempo real que tardaría un coche
    // a VELOCIDAD_OBJETIVO en recorrer esa distancia, DIVIDIDO por el factor
    // de aceleración (speed=10 → tarda 1/10 del tiempo real).
    let intervaloMs = INTERVALO_MIN_MS;
    if (!esUltimo && distSiguiente > 0) {
      const tiempoReal = (distSiguiente / VELOCIDAD_OBJETIVO_MS) * 1000;
      intervaloMs = Math.round(tiempoReal / factor);
      intervaloMs = Math.max(INTERVALO_MIN_MS, Math.min(INTERVALO_MAX_MS, intervaloMs));
    }

    return {
      pos: {
        coords: {
          latitude: p.lat,
          longitude: p.lon,
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: heading,
          speed: speed
        },
        timestamp: Date.now()
      },
      intervaloMs: intervaloMs,
      distSiguiente: distSiguiente
    };
  }

  function tick() {
    if (!callbackPosicion || !rutaPuntos) return;
    const resultado = construirPosicion(indicePunto);
    const { pos, intervaloMs, distSiguiente } = resultado;
    debug.log(`[SIM] Punto ${indicePunto + 1}/${rutaPuntos.length}: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} · ${Math.round(pos.coords.speed * 3.6)} km/h · próx en ${Math.round(intervaloMs/1000)}s (${Math.round(distSiguiente)}m)`);
    callbackPosicion(pos);

    indicePunto++;
    if (indicePunto >= rutaPuntos.length) {
      debug.warn('[SIM] Fin de ruta. Reiniciando desde el principio.');
      indicePunto = 0;
    }

    // Programar el siguiente tick con el intervalo calculado (variable)
    timerId = setTimeout(tick, intervaloMs);
  }

  function iniciar(cb) {
    if (!activo) {
      debug.error('[SIM] iniciar() llamado pero el simulador no está activo');
      return false;
    }
    rutaPuntos = cargarRuta();
    if (!rutaPuntos) return false;

    callbackPosicion = cb;
    mostrarBanner();

    debug.log(`[SIM] Arrancando (velocidad objetivo ${VELOCIDAD_OBJETIVO_KMH} km/h, factor x${factor})`);
    // Primer tick inmediato; el propio tick programa el siguiente
    tick();
    return true;
  }

  function detener() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
      debug.log('[SIM] Detenido');
    }
  }

  window.Simulator = {
    estaActivo: () => activo,
    nombreRuta: () => nombreRuta,
    iniciar: iniciar,
    detener: detener
  };
})();
