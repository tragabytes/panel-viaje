// js/weather.js
// WeatherModule — segunda iteración (paso 2)
//
// Cambios sobre el paso 1: la petición incluye ahora 6 horas de previsión
// horaria (forecast_hours=6), con los mismos campos meteorológicos que
// current más precipitation_probability. El objeto devuelto añade un
// campo `previsionHoraria` con un array de objetos por hora.
//
// Sigue sin haber caché: el caché llega en el paso 3. Sigue sin haber
// traducción de weather_code a texto humano: eso llega en el paso 4.
//
// Expone el objeto global Weather con la función obtenerTiempoActual(lat, lon).

(function () {
  'use strict';

  // Endpoint validado en la ficha Open-Meteo de fase 1 (sesión 04).
  var URL_BASE = 'https://api.open-meteo.com/v1/forecast';

  // Campos current validados en la ficha de fase 1. 602 bytes medidos en
  // la prueba del paso 1 (sesión 09).
  var CAMPOS_CURRENT = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'weather_code',
    'is_day',
    'wind_speed_10m',
    'wind_direction_10m'
  ].join(',');

  // Campos hourly. Mismos que current + precipitation_probability (solo
  // existe en hourly, no en current). No incluimos is_day en hourly porque
  // no aporta nada útil a una línea de previsión textual.
  var CAMPOS_HOURLY = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'precipitation_probability'
  ].join(',');

  // Número de horas de previsión a pedir. 6 cubre cualquier trayecto
  // razonable del panel (viaje típico 2-3 h). Ampliar a 12 sería trivial.
  var HORAS_PREVISION = 6;

  // Timeout por intento. 10 s es el umbral razonable para conexión móvil.
  var TIMEOUT_MS = 10000;

  // Reintento único. Los 504 transitorios documentados en la ficha se
  // resuelven casi siempre al primer reintento.
  var MAX_INTENTOS = 2;

  function construirUrl(lat, lon) {
    return URL_BASE +
      '?latitude=' + encodeURIComponent(lat.toFixed(5)) +
      '&longitude=' + encodeURIComponent(lon.toFixed(5)) +
      '&current=' + CAMPOS_CURRENT +
      '&hourly=' + CAMPOS_HOURLY +
      '&forecast_hours=' + HORAS_PREVISION +
      '&timezone=auto';
  }

  // fetch con timeout usando AbortController. Si no responde en TIMEOUT_MS,
  // se cancela y se propaga un error marcado como timeout.
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

  // Convierte el hourly de Open-Meteo (columnas paralelas) en un array de
  // objetos, uno por hora, más cómodo de usar en el pintado.
  function transformarHourly(hourly, unidades) {
    if (!hourly || !Array.isArray(hourly.time)) return [];
    var horas = [];
    for (var i = 0; i < hourly.time.length; i++) {
      horas.push({
        hora: hourly.time[i],
        temperatura: hourly.temperature_2m ? hourly.temperature_2m[i] : null,
        temperaturaUnidad: unidades.temperature_2m || '°C',
        sensacion: hourly.apparent_temperature ? hourly.apparent_temperature[i] : null,
        sensacionUnidad: unidades.apparent_temperature || '°C',
        humedad: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
        humedadUnidad: unidades.relative_humidity_2m || '%',
        weatherCode: hourly.weather_code ? hourly.weather_code[i] : null,
        vientoVelocidad: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
        vientoUnidad: unidades.wind_speed_10m || 'km/h',
        vientoDireccion: hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : null,
        precipProbabilidad: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null
      });
    }
    return horas;
  }

  // Normaliza la respuesta cruda de Open-Meteo. Campos de current + array
  // previsionHoraria con las próximas N horas.
  function normalizar(json) {
    if (!json || !json.current) {
      throw new Error('respuesta sin campo current');
    }
    var c = json.current;
    var u = json.current_units || {};
    var uHourly = json.hourly_units || {};
    return {
      // Tiempo actual (igual que en paso 1)
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
      zonaHoraria: json.timezone,
      // Previsión horaria (nuevo en paso 2)
      previsionHoraria: transformarHourly(json.hourly, uHourly)
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
