// js/weather.js
// WeatherModule — tercera iteración (paso 3)
//
// Cambios sobre el paso 2: añadido caché en memoria con dos criterios
// combinados (proximidad geográfica + TTL temporal) y rate limiter interno.
//
// Criterios de reutilización del caché: la petición se reutiliza si la nueva
// coordenada está a menos de 1 km de la cacheada Y el caché tiene menos de
// 15 minutos. Si falla cualquiera de los dos, se pide de nuevo.
//
// Sigue sin haber traducción de weather_code a texto humano: eso llega en
// el paso 4.
//
// Expone el objeto global Weather con la función obtenerTiempoActual(lat, lon).

(function () {
  'use strict';

  // --- Configuración de API ---
  var URL_BASE = 'https://api.open-meteo.com/v1/forecast';

  var CAMPOS_CURRENT = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'weather_code',
    'is_day',
    'wind_speed_10m',
    'wind_direction_10m'
  ].join(',');

  var CAMPOS_HOURLY = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'precipitation_probability'
  ].join(',');

  var HORAS_PREVISION = 6;
  var TIMEOUT_MS = 10000;
  var MAX_INTENTOS = 2;

  // --- Configuración del caché ---
  // Radio dentro del cual se considera válido reutilizar el caché.
  // 1 km es permisivo porque los modelos meteorológicos trabajan con celdas
  // de rejilla de 2 km o más. El dato no varía punto a punto.
  var RADIO_CACHE_M = 1000;

  // Tiempo de vida máximo del caché. Open-Meteo actualiza el bloque current
  // cada 15 minutos, no tiene sentido pedir más a menudo.
  var TTL_CACHE_MS = 15 * 60 * 1000;

  // Mínimo entre peticiones reales. No hay límite oficial en Open-Meteo
  // pero mantenemos buena ciudadanía.
  var RATE_LIMIT_MS = 2000;

  // --- Estado interno ---
  // Un solo slot de caché: {lat, lon, timestamp, datos}
  var cacheActual = null;
  // Timestamp de la última petición real, para el rate limiter
  var ultimaPeticion = 0;

  // --- Utilidades ---
  function distanciaMetros(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var toRad = function (g) { return g * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function construirUrl(lat, lon) {
    return URL_BASE +
      '?latitude=' + encodeURIComponent(lat.toFixed(5)) +
      '&longitude=' + encodeURIComponent(lon.toFixed(5)) +
      '&current=' + CAMPOS_CURRENT +
      '&hourly=' + CAMPOS_HOURLY +
      '&forecast_hours=' + HORAS_PREVISION +
      '&timezone=auto';
  }

  // --- Red ---
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

  // --- Normalización ---
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

  function normalizar(json) {
    if (!json || !json.current) {
      throw new Error('respuesta sin campo current');
    }
    var c = json.current;
    var u = json.current_units || {};
    var uHourly = json.hourly_units || {};
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
      zonaHoraria: json.timezone,
      previsionHoraria: transformarHourly(json.hourly, uHourly),
      deCache: false  // se sobreescribe a true cuando se devuelve desde caché
    };
  }

  // --- Lógica de caché ---
  // Devuelve los datos cacheados si cumplen los dos criterios, o null.
  function intentarCache(lat, lon) {
    if (!cacheActual) return null;

    var edadMs = Date.now() - cacheActual.timestamp;
    if (edadMs > TTL_CACHE_MS) {
      debug.warn('Weather caché expirada (edad ' + Math.round(edadMs / 60000) + 'min)');
      cacheActual = null;
      return null;
    }

    var dist = distanciaMetros(lat, lon, cacheActual.lat, cacheActual.lon);
    if (dist > RADIO_CACHE_M) {
      debug.log('Weather caché fuera de radio (' + Math.round(dist) + 'm > ' + RADIO_CACHE_M + 'm)');
      return null;
    }

    debug.warn('Weather caché reusada (dist ' + Math.round(dist) + 'm, edad ' + Math.round(edadMs / 60000) + 'min)');
    // Clonamos el objeto cacheado y marcamos deCache=true en la copia,
    // para no mutar el original.
    var copia = {};
    for (var k in cacheActual.datos) {
      if (Object.prototype.hasOwnProperty.call(cacheActual.datos, k)) {
        copia[k] = cacheActual.datos[k];
      }
    }
    copia.deCache = true;
    return copia;
  }

  function guardarCache(lat, lon, datos) {
    cacheActual = {
      lat: lat,
      lon: lon,
      timestamp: Date.now(),
      datos: datos
    };
  }

  // --- Rate limiter ---
  // Devuelve una promesa que se resuelve cuando haya pasado el tiempo mínimo
  // desde la última petición real. Si ya ha pasado suficiente, es instantáneo.
  function esperarRateLimit() {
    var ahora = Date.now();
    var transcurrido = ahora - ultimaPeticion;
    if (transcurrido >= RATE_LIMIT_MS) {
      return Promise.resolve();
    }
    var espera = RATE_LIMIT_MS - transcurrido;
    debug.log('Weather rate limit: esperando ' + espera + 'ms');
    return new Promise(function (resolve) {
      setTimeout(resolve, espera);
    });
  }

  // --- Función pública ---
  function obtenerTiempoActual(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return Promise.reject(new Error('lat/lon no son números'));
    }

    // Intentar caché primero
    var desdeCache = intentarCache(lat, lon);
    if (desdeCache) {
      return Promise.resolve(desdeCache);
    }

    // Sin caché válido: petición real con rate limit
    var url = construirUrl(lat, lon);
    debug.log('Weather pidiendo ' + lat.toFixed(4) + ',' + lon.toFixed(4));
    return esperarRateLimit()
      .then(function () {
        ultimaPeticion = Date.now();
        return pedirConReintento(url);
      })
      .then(normalizar)
      .then(function (datos) {
        guardarCache(lat, lon, datos);
        return datos;
      });
  }

  // Exposición global
  window.Weather = {
    obtenerTiempoActual: obtenerTiempoActual,
    // Método auxiliar para pruebas: limpia el caché manualmente.
    limpiarCache: function () {
      cacheActual = null;
      debug.log('Weather caché limpiado manualmente');
    }
  };
})();
