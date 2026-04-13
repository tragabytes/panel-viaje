// js/rutas.js — Catálogo de rutas simuladas para el modo desarrollo
//
// Origen de las coordenadas:
//   - a6, m505, cruce-a6-m505: extraídas de OpenStreetMap vía Overpass API
//     en sesión 9.7, usando el notebook obtener_rutas_osm.ipynb. Son puntos
//     reales de las ways con ref="A-6" y ref="M-505" en OSM, submuestreados
//     a ~12 muestras por ruta bien espaciadas por distancia acumulada.
//
//   - urbano-lasrozas: coordenadas aproximadas alrededor de las capturas
//     de sesión 9.5 (Las Rozas residencial, ~40.489, -3.866). No extraídas
//     de OSM porque el objetivo aquí no es una carretera concreta sino
//     "movimiento peatonal por calles urbanas". No es crítico que caigan
//     exactamente sobre calles reales.
//
// Las rutas tienen pocos puntos a propósito: el simulador no interpola, así
// que cada punto dispara una llamada a Nominatim y vale como "paso de
// simulación". Con 6-12 puntos por ruta tenemos de sobra para validar el
// panel en menos de un minuto a velocidad x10.

const Rutas = (() => {

  const RUTAS = {

    // ========================================================================
    // urbano-lasrozas — replica el escenario de sesión 9.5 (paseo peatonal)
    // Objetivo: ver el bloque meteo + municipio + texto discreto de calle
    // (no pastilla, porque son calles urbanas sin código)
    // ========================================================================
    'urbano-lasrozas': {
      descripcion: 'Paseo urbano por Las Rozas (zona residencial norte)',
      puntos: [
        // Zona residencial de Las Rozas, cerca de las coordenadas reportadas
        // en las capturas de sesión 9.5 (40.489xx, -3.866xx aprox.)
        { lat: 40.4893, lon: -3.8680, nota: 'Las Rozas, zona residencial (aprox. capturas sesión 9.5)' },
        { lat: 40.4898, lon: -3.8672, nota: 'Las Rozas, +80 m NE' },
        { lat: 40.4903, lon: -3.8664, nota: 'Las Rozas, +160 m NE' },
        { lat: 40.4908, lon: -3.8656, nota: 'Las Rozas, +240 m NE' },
        { lat: 40.4913, lon: -3.8648, nota: 'Las Rozas, +320 m NE' },
        { lat: 40.4918, lon: -3.8640, nota: 'Las Rozas, +400 m NE' },
        { lat: 40.4923, lon: -3.8632, nota: 'Las Rozas, +480 m NE' },
        { lat: 40.4928, lon: -3.8624, nota: 'Las Rozas, +560 m NE' }
      ]
    },

    // ========================================================================
    // a6 — tramo de la A-6 entre Torrelodones y Collado Villalba
    // Objetivo: ver pastilla AZUL "A-6" (estatal). Validado ya en sesión 9.6
    // pero el simulador nos permite reproducirlo sin conducir.
    // Datos extraídos de OSM vía Overpass (sesión 9.7). La A-6 al sur de
    // Torrelodones estaba mapeada con otro highway o ref distinto en OSM,
    // así que la ruta arranca aprox. en Torrelodones norte, no en Las Rozas.
    // Para validar la pastilla A-6 da igual porque cubre 7.3 km de autovía
    // continua con ref="A-6" en OSM.
    // ========================================================================
    'a6': {
      descripcion: 'A-6 Torrelodones → Collado Villalba (7.3 km, datos OSM)',
      puntos: [
        { lat: 40.54434, lon: -3.89385, nota: 'A-6 punto 1/12 · km 0.0 · OSM' },
        { lat: 40.55086, lon: -3.89703, nota: 'A-6 punto 2/12 · km 0.8 · OSM' },
        { lat: 40.55640, lon: -3.90011, nota: 'A-6 punto 3/12 · km 1.4 · OSM' },
        { lat: 40.56152, lon: -3.90299, nota: 'A-6 punto 4/12 · km 2.1 · OSM' },
        { lat: 40.56521, lon: -3.91019, nota: 'A-6 punto 5/12 · km 2.8 · OSM' },
        { lat: 40.56863, lon: -3.91735, nota: 'A-6 punto 6/12 · km 3.5 · OSM' },
        { lat: 40.57219, lon: -3.92406, nota: 'A-6 punto 7/12 · km 4.2 · OSM' },
        { lat: 40.57433, lon: -3.93005, nota: 'A-6 punto 8/12 · km 4.8 · OSM' },
        { lat: 40.57734, lon: -3.93682, nota: 'A-6 punto 9/12 · km 5.4 · OSM' },
        { lat: 40.57857, lon: -3.94352, nota: 'A-6 punto 10/12 · km 6.0 · OSM' },
        { lat: 40.58217, lon: -3.94889, nota: 'A-6 punto 11/12 · km 6.6 · OSM' },
        { lat: 40.58731, lon: -3.95384, nota: 'A-6 punto 12/12 · km 7.3 · OSM' }
      ]
    },

    // ========================================================================
    // m505 — tramo de la "carretera de El Escorial" (M-505)
    // Objetivo PRINCIPAL de esta sesión: ver si el fix de carreteras
    // autonómicas funciona y sale pastilla GRANATE "M-505".
    // Si sale "Carretera de El Escorial" como texto discreto, el fix no
    // cogió el ref de Nominatim y tendremos que ir al plan B.
    //
    // Datos extraídos de OSM vía Overpass (sesión 9.7). La query original
    // devolvió ways de las DOS calzadas (ida y vuelta), el algoritmo de
    // vecino más cercano las recorrió en zigzag. Nos quedamos solo con los
    // 6 primeros puntos que corresponden al sentido Las Rozas → El Escorial
    // (ida). 23.7 km totales.
    // ========================================================================
    'm505': {
      descripcion: 'M-505 Las Rozas → El Escorial (23.7 km, datos OSM)',
      puntos: [
        { lat: 40.49407, lon: -3.88353, nota: 'M-505 punto 1/6 · km 0.0 · Las Rozas · OSM' },
        { lat: 40.51663, lon: -3.93492, nota: 'M-505 punto 2/6 · km 5.0 · OSM' },
        { lat: 40.54557, lon: -3.95916, nota: 'M-505 punto 3/6 · km 8.8 · Galapagar · OSM' },
        { lat: 40.57202, lon: -3.99840, nota: 'M-505 punto 4/6 · km 13.3 · OSM' },
        { lat: 40.57802, lon: -4.06101, nota: 'M-505 punto 5/6 · km 18.6 · OSM' },
        { lat: 40.57947, lon: -4.12145, nota: 'M-505 punto 6/6 · km 23.7 · El Escorial · OSM' }
      ]
    },

    // ========================================================================
    // cruce-a6-m505 — primera mitad A-6, segunda mitad M-505
    // Objetivo: ver el CAMBIO de pastilla AZUL (A-6 estatal) a pastilla
    // GRANATE (M-505 autonómica) en vivo. Es la prueba más completa.
    //
    // NOTA IMPORTANTE: entre el último punto de la A-6 (Torrelodones/Galapagar)
    // y el primer punto de la M-505 (Las Rozas) hay un SALTO espacial de
    // ~6 km porque son carreteras distintas y no las une físicamente ninguna
    // way continua. El simulador verá un "teletransporte" al cambiar de ruta,
    // pero para validar el cambio de color de pastilla funciona perfectamente:
    // el panel procesará el cambio de ubicación como cualquier otro.
    // ========================================================================
    'cruce-a6-m505': {
      descripcion: 'A-6 (primera mitad) + M-505 (Las Rozas → El Escorial) — con salto intencional',
      puntos: [
        // A-6: primeros 6 puntos, pastilla azul esperada
        { lat: 40.54434, lon: -3.89385, nota: 'A-6 inicio · km 0.0 · OSM' },
        { lat: 40.55086, lon: -3.89703, nota: 'A-6 · km 0.8 · OSM' },
        { lat: 40.55640, lon: -3.90011, nota: 'A-6 · km 1.4 · OSM' },
        { lat: 40.56152, lon: -3.90299, nota: 'A-6 · km 2.1 · OSM' },
        { lat: 40.56521, lon: -3.91019, nota: 'A-6 · km 2.8 · OSM' },
        { lat: 40.56863, lon: -3.91735, nota: 'A-6 fin · km 3.5 · OSM' },
        // Salto a M-505 (cambio esperado a pastilla granate)
        { lat: 40.49407, lon: -3.88353, nota: 'M-505 inicio · Las Rozas · OSM · (SALTO desde A-6)' },
        { lat: 40.51663, lon: -3.93492, nota: 'M-505 · +5.0 km · OSM' },
        { lat: 40.54557, lon: -3.95916, nota: 'M-505 · +8.8 km · Galapagar · OSM' },
        { lat: 40.57202, lon: -3.99840, nota: 'M-505 · +13.3 km · OSM' },
        { lat: 40.57802, lon: -4.06101, nota: 'M-505 · +18.6 km · OSM' },
        { lat: 40.57947, lon: -4.12145, nota: 'M-505 fin · +23.7 km · El Escorial · OSM' }
      ]
    },

    // ========================================================================
    // a6-salidas — tramo A-6 con pre-roll + 4 salidas numeradas (24, 26, 27, 29)
    // Objetivo: probar MotorwayExitModule desde casa sin conducir.
    //
    // Estructura: 9 puntos de pre-roll (Torrelodones - aprox. A-6 km 18-23)
    // + 10 puntos con las salidas (A-6 km ~24-29, Galapagar/Collado Villalba).
    // Total: 19 puntos, ~20 km.
    //
    // Por qué el pre-roll: MotorwayExitModule tiene histéresis de 30 s a
    // >50 km/h antes de activarse. Con el simulador a x10, cada tick tarda
    // ~3.5 s reales. Sin pre-roll el módulo no activaría hasta la salida 29.
    // Con 9 puntos de pre-roll (~32 s reales a x10), la histéresis se despeja
    // antes de llegar a la salida 24 y la query Overpass tiene tiempo de
    // completarse antes de que llegue el primer junction interesante.
    //
    // Datos extraídos de OSM vía Overpass (sesión 12). Los km en las notas
    // son acumulados desde el inicio del dataset OSM (arranca en salida 19),
    // no km oficiales de la A-6 (que son ~8 km más desde Madrid).
    // ========================================================================
    'a6-salidas': {
      descripcion: 'A-6 pre-roll + salidas 24-29 (Torrelodones→Collado Villalba, ~20 km, datos OSM)',
      puntos: [
        // --- Pre-roll: 9 puntos para que la histéresis de MotorwayExitModule se despeje ---
        { lat: 40.49186, lon: -3.86751, nota: 'A-6 · pre-roll 1/9 · Torrelodones zona · OSM' },
        { lat: 40.49586, lon: -3.86953, nota: 'A-6 · pre-roll 2/9 · OSM' },
        { lat: 40.49855, lon: -3.87290, nota: 'A-6 · pre-roll 3/9 · OSM' },
        { lat: 40.50119, lon: -3.87349, nota: 'A-6 · pre-roll 4/9 · OSM' },
        { lat: 40.50281, lon: -3.87434, nota: 'A-6 · pre-roll 5/9 · OSM' },
        { lat: 40.50747, lon: -3.87752, nota: 'A-6 · pre-roll 6/9 · OSM' },
        { lat: 40.51627, lon: -3.88379, nota: 'A-6 · pre-roll 7/9 · OSM' },
        { lat: 40.52091, lon: -3.88622, nota: 'A-6 · pre-roll 8/9 · OSM' },
        { lat: 40.52133, lon: -3.88660, nota: 'A-6 · pre-roll 9/9 · ~1 km antes salida 24 · OSM' },
        // --- Tramo con salidas: histéresis ya despejada, módulo activo ---
        { lat: 40.52954, lon: -3.88725, nota: 'A-6 · km 11.5 · antes salida 24 · OSM' },
        { lat: 40.53422, lon: -3.88837, nota: 'A-6 · km 12.5 · aprox. 1 km antes salida 24 · OSM' },
        { lat: 40.54170, lon: -3.89290, nota: 'A-6 · km 13.6 · salida 24 a 138 m · OSM' },
        { lat: 40.55086, lon: -3.89703, nota: 'A-6 · km 14.7 · entre salidas 24 y 26 · OSM' },
        { lat: 40.55883, lon: -3.90114, nota: 'A-6 · km 15.9 · salida 26 a 525 m · OSM' },
        { lat: 40.56445, lon: -3.90815, nota: 'A-6 · km 16.9 · salida 27 a 83 m · OSM' },
        { lat: 40.57058, lon: -3.92101, nota: 'A-6 · km 18.2 · entre salidas 27 y 29 · OSM' },
        { lat: 40.57436, lon: -3.92926, nota: 'A-6 · km 19.3 · aprox. 1 km antes salida 29 · OSM' },
        { lat: 40.57772, lon: -3.93754, nota: 'A-6 · km 20.3 · salida 29 a 80 m · OSM' },
        { lat: 40.58007, lon: -3.94653, nota: 'A-6 · km 21.3 · pasada salida 29 · OSM' }
      ]
    }
  };

  function obtener(nombre) {
    return RUTAS[nombre] || null;
  }

  function listar() {
    return Object.keys(RUTAS);
  }

  return { obtener, listar };
})();
