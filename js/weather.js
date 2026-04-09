// js/weather.js
// WeatherModule — cuarta iteración (paso 4)
//
// Cambios sobre el paso 3: los datos devueltos ahora incluyen los campos
// traducidos (descripcion, categoria, icono) tanto para current como para
// cada hora del array previsionHoraria. La traducción usa MeteoCodigos.
//
// Dependencia: requiere que js/meteo_codigos.js esté cargado antes que este
// archivo en el index.html.
//
// Mantiene del paso 3: caché por proximidad (1 km) + TTL (15 min), rate
// limiter interno (2 s), reintento único con timeout de 10 s.
//
// Expone el objeto global Weather con obtenerTiempoActual(lat, lon) y
// limpiarCache() para pruebas.

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
  var RADIO_CACHE_M = 1000;
  var TTL_CACHE_MS = 15 * 60 * 1000;
  var RATE_LIMIT_MS = 2000;

  // --- Estado interno ---
  var cacheActual = null;
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

  // --- Normalización + traducción ---
  function transformarHourly(hourly, unidades, esDiaRef) {
    if (!hourly || !Array.isArray(hourly.time)) return [];
    var horas = [];
    for (var i = 0; i < hourly.time.length; i++) {
      var wc = hourly.weather_code ? hourly.weather_code[i] : null;
      // Para la previsión horaria no tenemos is_day por hora (no lo pedimos).
      // Aproximamos con el is_day actual, que es razonable para 6 horas.
      // Si en el futuro queremos precisión día/noche por hora, basta con
      // añadir 'is_day' a CAMPOS_HOURLY.
      var traduccion = (wc != null && window.MeteoCodigos)
        ? MeteoCodigos.traducir(wc, esDiaRef)
        : { texto: '—', categoria: 'desconocido', icono: '❓' };
      horas.push({
        hora: hourly.time[i],
        temperatura: hourly.temperature_2m ? hourly.temperature_2m[i] : null,
        temperaturaUnidad: unidades.temperature_2m || '°C',
        sensacion: hourly.apparent_temperature ? hourly.apparent_temperature[i] : null,
        sensacionUnidad: unidades.apparent_temperature || '°C',
        humedad: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : null,
        humedadUnidad: unidades.relative_humidity_2m || '%',
        weatherCode: wc,
        vientoVelocidad: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
        vientoUnidad: unidades.wind_speed_10m || 'km/h',
        vientoDireccion: hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : null,
        precipProbabilidad: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null,
        // Campos traducidos
        descripcion: traduccion.texto,
        categoria: traduccion.categoria,
        icono: traduccion.icono
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
    var esDia = c.is_day === 1;

    // Traducción del current
    var traduccionCurrent = window.MeteoCodigos
      ? MeteoCodigos.traducir(c.weather_code, esDia)
      : { texto: '—', categoria: 'desconocido', icono: '❓' };

    return {
      temperatura: c.temperature_2m,
      temperaturaUnidad: u.temperature_2m || '°C',
      sensacion: c.apparent_temperature,
      sensacionUnidad: u.apparent_temperature || '°C',
      humedad: c.relative_humidity_2m,
      humedadUnidad: u.relative_humidity_2m || '%',
      weatherCode: c.weather_code,
      esDia: esDia,
      vientoVelocidad: c.wind_speed_10m,
      vientoUnidad: u.wind_speed_10m || 'km/h',
      vientoDireccion: c.wind_direction_10m,
      hora: c.time,
      zonaHoraria: json.timezone,
      previsionHoraria: transformarHourly(json.hourly, uHourly, esDia),
      // Campos traducidos del current
      descripcion: traduccionCurrent.texto,
      categoria: traduccionCurrent.categoria,
      icono: traduccionCurrent.icono,
      deCache: false
    };
  }

  // --- Lógica de caché ---
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

    var desdeCache = intentarCache(lat, lon);
    if (desdeCache) {
      return Promise.resolve(desdeCache);
    }

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

  window.Weather = {
    obtenerTiempoActual: obtenerTiempoActual,
    limpiarCache: function () {
      cacheActual = null;
      debug.log('Weather caché limpiado manualmente');
    }
  };
})();
