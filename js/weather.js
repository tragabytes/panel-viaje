// js/weather.js
// WeatherModule — primera iteración (paso 1)
//
// Objetivo del paso 1: pedir el tiempo actual a Open-Meteo y devolver los
// campos crudos, sin caché, sin traducción de weather_code, sin previsión
// por horas. El caché llega en el paso 3, la previsión en el paso 2 y la
// traducción de códigos WMO en el paso 4.
//
// Expone el objeto global Weather con la función obtenerTiempoActual(lat, lon).
// Llama a debug.log para registrar entrada, salida, latencia y errores.

(function () {
  'use strict';

  // Endpoint validado en la ficha Open-Meteo de fase 1 (sesión 04).
  var URL_BASE = 'https://api.open-meteo.com/v1/forecast';

  // Campos current validados en la ficha de fase 1. Todos llegan en una
  // sola petición, tamaño típico 608 bytes.
  var CAMPOS_CURRENT = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'weather_code',
    'is_day',
    'wind_speed_10m',
    'wind_direction_10m'
  ].join(',');

  // Timeout por intento. La ficha usaba 30 s pero en un coche con datos
  // compartidos eso es demasiado. 10 s es suficiente según las latencias
  // medidas (mediana 821 ms, máx 1869 ms) dejando margen de sobra.
  var TIMEOUT_MS = 10000;

  // Reintento único. Los 504 transitorios documentados en la ficha se
  // resuelven casi siempre al primer reintento.
  var MAX_INTENTOS = 2;

  function construirUrl(lat, lon) {
    return URL_BASE +
      '?latitude=' + encodeURIComponent(lat.toFixed(5)) +
      '&longitude=' + encodeURIComponent(lon.toFixed(5)) +
      '&current=' + CAMPOS_CURRENT +
      '&timezone=auto';
  }

  // fetch con timeout usando AbortController. Si no responde en TIMEOUT_MS,
  // se cancela y se propaga un error marcado como timeout para diferenciarlo.
  function fetchConTimeout(url) {
    var controller = new AbortController();
    var id = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    return fetch(url, { signal: controller.signal })
      .then(function (res) {
        clearTimeout(id);
        return res;
      })
      .catch(function (err) {
        clearTimeout(id);
        if (err && err.name === 'AbortError') {
          var e = new Error('timeout');
          e.esTimeout = true;
          throw e;
        }
        throw err;
      });
  }

  // Intenta pedir la URL hasta MAX_INTENTOS veces. Cada error se loguea.
  function pedirConReintento(url) {
    var intento = 0;
    function unIntento() {
      intento++;
      var t0 = performance.now();
      return fetchConTimeout(url)
        .then(function (res) {
          var ms = Math.round(performance.now() - t0);
          if (!res.ok) {
            debug.warn('Weather intento ' + intento + ' HTTP ' + res.status + ' (' + ms + ' ms)');
            throw new Error('HTTP ' + res.status);
          }
          return res.text().then(function (txt) {
            var bytes = txt.length;
            var json;
            try {
              json = JSON.parse(txt);
            } catch (e) {
              debug.error('Weather respuesta no es JSON válido');
              throw e;
            }
            debug.log('Weather OK intento ' + intento + ' · ' + ms + ' ms · ' + bytes + ' B');
            return json;
          });
        })
        .catch(function (err) {
          if (intento < MAX_INTENTOS) {
            debug.warn('Weather reintento tras error: ' + (err.message || err));
            return unIntento();
          }
          debug.error('Weather fallo definitivo tras ' + intento + ' intentos: ' + (err.message || err));
          throw err;
        });
    }
    return unIntento();
  }

  // Normaliza la respuesta cruda de Open-Meteo al formato que devolvemos
  // al llamador. Mantiene los campos numéricos tal cual y añade las
  // unidades textuales que trae la propia API, por si luego el pintado
  // quiere usarlas.
  function normalizar(json) {
    if (!json || !json.current) {
      throw new Error('respuesta sin campo current');
    }
    var c = json.current;
    var u = json.current_units || {};
    return {
      temperatura: c.temperature_2m,
      temperaturaUnidad: u.temperature_2m || '°C',
      sensacion: c.apparent_temperature,
      sensacionUnidad: u.apparent_temperature || '°C',
      humedad: c.relative_humidity_2m,
      humedadUnidad: u.relative_humidity_2m || '%',
      weatherCode: c.weather_code,
      esDia: c.is_day === 1,
      vientoVelocidad: c.wind_speed_10m,
      vientoUnidad: u.wind_speed_10m || 'km/h',
      vientoDireccion: c.wind_direction_10m,
      hora: c.time,
      zonaHoraria: json.timezone
    };
  }

  // Función pública. Recibe lat/lon del GPS y devuelve una promesa con
  // el objeto normalizado, o rechaza con error si no se pudo obtener.
  function obtenerTiempoActual(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return Promise.reject(new Error('lat/lon no son números'));
    }
    var url = construirUrl(lat, lon);
    debug.log('Weather pidiendo ' + lat.toFixed(4) + ',' + lon.toFixed(4));
    return pedirConReintento(url).then(normalizar);
  }

  // Exposición global
  window.Weather = {
    obtenerTiempoActual: obtenerTiempoActual
  };
})();
