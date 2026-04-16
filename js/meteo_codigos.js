// js/meteo_codigos.js
// Traducción de códigos WMO (OMM 4677) a texto humano en español,
// categoría visual (una de 6) e icono SVG (ID de símbolo en el sprite).
//
// Los 28 códigos oficiales de Open-Meteo están cubiertos. Para códigos
// desconocidos se devuelve un fallback neutro y se loguea un warn.
//
// Categorías visuales (6): despejado, nublado, niebla, lluvia, nieve, tormenta.
// El paso 4 del WeatherModule enriquece los datos de current y hourly con
// los campos {descripcion, categoria, icono} usando esta tabla.
// IU-06: los campos dia/noche ahora contienen IDs de símbolos SVG en vez
// de emojis. El render usa iconoSVG() para generar el markup <svg><use>.
//
// Expone el objeto global MeteoCodigos con la función traducir(codigo, esDia).

(function () {
  'use strict';

  // Tabla interna. Cada entrada puede definir iconos separados para día y
  // noche. Si solo hay un icono, se usa en ambos.
  var TABLA = {
    0:  { texto: 'Despejado',               categoria: 'despejado', dia: 'meteo-sol',      noche: 'meteo-luna' },
    1:  { texto: 'Mayormente despejado',    categoria: 'despejado', dia: 'meteo-sol-nube', noche: 'meteo-luna' },
    2:  { texto: 'Parcialmente nublado',    categoria: 'nublado',   dia: 'meteo-sol-nube', noche: 'meteo-nube' },
    3:  { texto: 'Nublado',                 categoria: 'nublado',   dia: 'meteo-nube',     noche: 'meteo-nube' },

    45: { texto: 'Niebla',                  categoria: 'niebla',    dia: 'meteo-niebla', noche: 'meteo-niebla' },
    48: { texto: 'Niebla escarchada',       categoria: 'niebla',    dia: 'meteo-niebla', noche: 'meteo-niebla' },

    51: { texto: 'Llovizna ligera',         categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },
    53: { texto: 'Llovizna moderada',       categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },
    55: { texto: 'Llovizna densa',          categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },

    56: { texto: 'Llovizna helada ligera',  categoria: 'lluvia',    dia: 'meteo-nieve',  noche: 'meteo-nieve' },
    57: { texto: 'Llovizna helada densa',   categoria: 'lluvia',    dia: 'meteo-nieve',  noche: 'meteo-nieve' },

    61: { texto: 'Lluvia ligera',           categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },
    63: { texto: 'Lluvia moderada',         categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },
    65: { texto: 'Lluvia intensa',          categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },

    66: { texto: 'Lluvia helada ligera',    categoria: 'lluvia',    dia: 'meteo-nieve',  noche: 'meteo-nieve' },
    67: { texto: 'Lluvia helada intensa',   categoria: 'lluvia',    dia: 'meteo-nieve',  noche: 'meteo-nieve' },

    71: { texto: 'Nevada ligera',           categoria: 'nieve',     dia: 'meteo-nieve',  noche: 'meteo-nieve' },
    73: { texto: 'Nevada moderada',         categoria: 'nieve',     dia: 'meteo-nieve',  noche: 'meteo-nieve' },
    75: { texto: 'Nevada intensa',          categoria: 'nieve',     dia: 'meteo-nieve',  noche: 'meteo-nieve' },

    77: { texto: 'Granos de nieve',         categoria: 'nieve',     dia: 'meteo-nieve',  noche: 'meteo-nieve' },

    80: { texto: 'Chubascos ligeros',       categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },
    81: { texto: 'Chubascos moderados',     categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },
    82: { texto: 'Chubascos violentos',     categoria: 'lluvia',    dia: 'meteo-lluvia', noche: 'meteo-lluvia' },

    85: { texto: 'Chubascos de nieve ligeros',  categoria: 'nieve', dia: 'meteo-nieve',  noche: 'meteo-nieve' },
    86: { texto: 'Chubascos de nieve intensos', categoria: 'nieve', dia: 'meteo-nieve',  noche: 'meteo-nieve' },

    95: { texto: 'Tormenta',                    categoria: 'tormenta', dia: 'meteo-tormenta', noche: 'meteo-tormenta' },
    96: { texto: 'Tormenta con granizo ligero', categoria: 'tormenta', dia: 'meteo-tormenta', noche: 'meteo-tormenta' },
    99: { texto: 'Tormenta con granizo intenso',categoria: 'tormenta', dia: 'meteo-tormenta', noche: 'meteo-tormenta' }
  };

  // Jerarquía de severidad de menor a mayor. Se usa para decidir qué
  // categoría "representa" un tramo horario con condiciones mixtas.
  var SEVERIDAD = {
    despejado:   0,
    nublado:     1,
    niebla:      2,
    lluvia:      3,
    nieve:       4,
    tormenta:    5,
    desconocido: -1
  };

  var FALLBACK = {
    texto: 'Condiciones desconocidas',
    categoria: 'desconocido',
    dia: 'meteo-desconocido',
    noche: 'meteo-desconocido'
  };

  function traducir(codigo, esDia) {
    var entrada = TABLA[codigo];
    if (!entrada) {
      if (typeof debug !== 'undefined') {
        debug.warn('MeteoCodigos: código WMO desconocido ' + codigo);
      }
      entrada = FALLBACK;
    }
    return {
      texto: entrada.texto,
      categoria: entrada.categoria,
      icono: esDia ? entrada.dia : entrada.noche
    };
  }

  // Dado un array de previsión horaria con campo `categoria` ya traducido,
  // devuelve la categoría más severa del tramo. Usa la tabla SEVERIDAD.
  function categoriaMasSevera(horas) {
    if (!horas || horas.length === 0) return 'desconocido';
    var peor = 'despejado';
    var peorValor = SEVERIDAD[peor];
    for (var i = 0; i < horas.length; i++) {
      var cat = horas[i].categoria;
      var val = SEVERIDAD[cat];
      if (typeof val === 'number' && val > peorValor) {
        peor = cat;
        peorValor = val;
      }
    }
    return peor;
  }

  // Devuelve el ID de símbolo SVG asociado a una categoría, en versión día.
  // Útil para representar el resumen de un tramo horario en la UI.
  function iconoDeCategoria(categoria) {
    var ejemplos = {
      despejado:   'meteo-sol',
      nublado:     'meteo-nube',
      niebla:      'meteo-niebla',
      lluvia:      'meteo-lluvia',
      nieve:       'meteo-nieve',
      tormenta:    'meteo-tormenta',
      desconocido: 'meteo-desconocido'
    };
    return ejemplos[categoria] || 'meteo-desconocido';
  }

  // Genera el markup HTML de un icono SVG a partir de un ID de símbolo.
  // El tamaño se hereda del contenedor via CSS (width/height o font-size).
  function iconoSVG(id, clase) {
    var cls = clase ? ' class="' + clase + '"' : '';
    return '<svg' + cls + '><use href="#' + id + '"/></svg>';
  }

  window.MeteoCodigos = {
    traducir: traducir,
    categoriaMasSevera: categoriaMasSevera,
    iconoDeCategoria: iconoDeCategoria,
    iconoSVG: iconoSVG
  };
})();
