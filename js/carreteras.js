// carreteras.js — Identificación y clasificación de carreteras españolas
//
// Qué hace este módulo:
//   1. Extrae un código corto ("A-6", "M-505", "N-340") a partir de lo que
//      Nominatim devuelve en address.road o extratags.ref.
//   2. Clasifica ese código como 'estatal' o 'autonomica', para que la UI
//      pinte la pastilla azul (estatal) o granate (autonómica/local).
//
// Contrato (importante):
//   extraerCodigo(entrada) acepta:
//     - string  (compatibilidad hacia atrás)
//     - objeto  { ref, road }  -- preferido por el LocationModule nuevo
//   Y devuelve:
//     - { codigo: 'A-6', tipo: 'estatal' }
//     - { codigo: 'M-505', tipo: 'autonomica' }
//     - null  (si no se puede identificar)
//
// Decisión 19 (sesión 9.6): la clasificación estatal/autonómica se hace por
// LISTA BLANCA explícita de lo que consideramos estatal. Todo lo demás es
// autonómica. Esto es más fiable que intentar detectar autonómicas por
// prefijos: los prefijos autonómicos son muchos y cambian entre CCAA
// (M-, CL-, CM-, CV-, GI-, BI-, SS-, AS-, CA-, SE-, etc.), mientras que
// los estatales son pocos y cerrados.
//
// Casos especiales incluidos como "visualmente estatales" aunque tengan
// prefijo de CCAA:
//   - M-30, M-40, M-50 (circunvalaciones de Madrid, gestión mixta pero
//     percibidas como vías principales estatales)
//   - B-10, B-20, B-23, B-30, B-40 (rondas/cinturones de Barcelona,
//     gestión estatal histórica, señaladas en azul por Fomento)

const Carreteras = (() => {

  // --- Tabla de nombres descriptivos a códigos (autovías radiales y alguna
  //     transversal conocida). Nominatim devuelve a veces el nombre largo
  //     ("Autovía del Noroeste") en lugar del código ("A-6"). ---
  const NOMBRES_A_CODIGOS = {
    // Radiales del Estado
    'autovia del norte':     'A-1',
    'autovia del nordeste':  'A-2',
    'autovia del este':      'A-3',
    'autovia del sur':       'A-4',
    'autovia del suroeste':  'A-5',
    'autovia del noroeste':  'A-6',
    // Autopistas radiales de peaje
    'autopista del norte':     'AP-1',
    'autopista del nordeste':  'AP-2',
    'autopista del este':      'AP-3',
    'autopista del sur':       'AP-4',
    'autopista del noroeste':  'AP-6',
    // Transversales con nombre reconocible
    'autovia del mediterraneo': 'A-7',
    'autovia del cantabrico':   'A-8',
    'autovia de la plata':      'A-66',
    'autovia mudejar':          'A-23',
    // Radiales de pago de Madrid
    'radial 2': 'R-2',
    'radial 3': 'R-3',
    'radial 4': 'R-4',
    'radial 5': 'R-5',
  };

  // Patrón de códigos de carretera españoles: letras (1-3) + guion opcional + número.
  // Cubre: A-2, AP-7, N-340, M-30, CM-42, CL-601, etc. También A2, N340 sin guion.
  const REGEX_CODIGO = /^[A-Z]{1,3}-?\d{1,4}$/i;

  // --- Lista blanca de códigos ESTATALES ---
  //
  // 1) Por PREFIJO (todo código con estos prefijos es estatal):
  const PREFIJOS_ESTATALES = new Set(['N', 'AP', 'E', 'R']);

  // 2) Por CÓDIGO COMPLETO (autovías A-x gestionadas por el Estado):
  //    Lista confeccionada a partir del catálogo oficial de la Red de
  //    Carreteras del Estado. Las A- no listadas aquí se consideran
  //    autonómicas (A-92 andaluza, A-381 andaluza, A-66 *parte asturiana*,
  //    etc.). En caso de duda, pecamos por el lado de autonómica: mejor
  //    ver una granate donde debería ser azul que al revés (el usuario
  //    nos dirá en pruebas reales y ampliaremos la lista).
  const AUTOVIAS_A_ESTATALES = new Set([
    // Radiales
    'A-1','A-2','A-3','A-4','A-5','A-6',
    // Transversales y del Cantábrico
    'A-7','A-8',
    // Resto de autovías de la Red del Estado con código A-
    'A-10','A-11','A-12','A-13','A-14','A-15',
    'A-21','A-22','A-23','A-24','A-25','A-27',
    'A-30','A-31','A-32','A-33',
    'A-40','A-41','A-42','A-43','A-44','A-45','A-46','A-48','A-49',
    'A-50','A-52','A-54','A-55','A-57','A-58','A-60','A-62','A-63',
    'A-64','A-65','A-66','A-67','A-68',
    'A-70','A-71','A-72','A-73','A-74','A-75','A-76','A-77','A-78',
    'A-79','A-80','A-81',
  ]);

  // 3) Casos especiales visualmente estatales aunque su prefijo coincida
  //    con autonómica. Ver comentario del cabecero del archivo.
  const ESPECIALES_ESTATALES = new Set([
    'M-30','M-40','M-50',
    'B-10','B-20','B-23','B-30','B-40',
  ]);

  // --- Utilidades ---

  function normalizarTexto(texto) {
    return texto
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita tildes
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Normaliza un código a formato canónico: mayúsculas y con guion.
  //   "a2"    -> "A-2"
  //   "A-2"   -> "A-2"
  //   "n 340" -> "N-340"  (el split de entrada ya habrá roto espacios,
  //                        pero por si acaso)
  function normalizarCodigo(codigo) {
    const arriba = codigo.toUpperCase().replace(/\s+/g, '');
    // Si ya tiene guion, dejarlo; si no, inyectarlo entre letras y dígitos.
    if (arriba.includes('-')) return arriba;
    return arriba.replace(/^([A-Z]+)(\d)/, '$1-$2');
  }

  // Dado un código YA normalizado ("A-6", "M-505"), devuelve 'estatal' o
  // 'autonomica'. Nunca devuelve null: si hay código, hay tipo.
  function clasificarTipo(codigo) {
    // 1) Especiales primero (M-30 gana contra "prefijo M = autonómica")
    if (ESPECIALES_ESTATALES.has(codigo)) return 'estatal';

    // 2) Por prefijo puro (N, AP, E, R)
    const guion = codigo.indexOf('-');
    const prefijo = guion > 0 ? codigo.slice(0, guion) : codigo.replace(/\d.*/, '');
    if (PREFIJOS_ESTATALES.has(prefijo)) return 'estatal';

    // 3) Autovías A- en la lista blanca del Estado
    if (prefijo === 'A' && AUTOVIAS_A_ESTATALES.has(codigo)) return 'estatal';

    // 4) Todo lo demás, autonómica
    return 'autonomica';
  }

  // Busca un código dentro de un texto libre. Usa dos estrategias:
  //   a) El texto entero es un código (regex estricta).
  //   b) El texto contiene un código entre separadores (A-2; Autovía del Nordeste).
  //   c) El texto es un nombre descriptivo conocido (Autovía del Noroeste).
  // Devuelve el código canónico o null.
  function buscarCodigoEnTexto(texto) {
    if (!texto || typeof texto !== 'string') return null;
    const limpio = texto.trim();
    if (!limpio) return null;

    // a) Texto entero = código
    if (REGEX_CODIGO.test(limpio)) {
      return normalizarCodigo(limpio);
    }

    // b) Texto contiene un código entre separadores
    const partes = limpio.split(/[;,/\s]+/);
    for (const parte of partes) {
      if (REGEX_CODIGO.test(parte)) {
        return normalizarCodigo(parte);
      }
    }

    // c) Nombre descriptivo conocido
    const normalizado = normalizarTexto(limpio);
    if (NOMBRES_A_CODIGOS[normalizado]) {
      return NOMBRES_A_CODIGOS[normalizado];
    }

    return null;
  }

  // --- API pública ---
  //
  // extraerCodigo(entrada) → { codigo, tipo } | null
  //
  // entrada puede ser:
  //   · string: texto de la vía tal cual (compatibilidad hacia atrás)
  //   · objeto { ref, road }: preferido por el LocationModule nuevo,
  //     que pasa extratags.ref en `ref` y address.road en `road`.
  //     Se intenta primero `ref` (más limpio), luego `road`.
  function extraerCodigo(entrada) {
    if (entrada == null) return null;

    let codigo = null;

    if (typeof entrada === 'string') {
      codigo = buscarCodigoEnTexto(entrada);
    } else if (typeof entrada === 'object') {
      // Preferimos ref porque suele ser el código limpio ("A-6").
      // Si no da nada, caemos a road ("Autovía del Noroeste").
      codigo = buscarCodigoEnTexto(entrada.ref)
            || buscarCodigoEnTexto(entrada.road);
    }

    if (!codigo) return null;
    return { codigo, tipo: clasificarTipo(codigo) };
  }

  return {
    extraerCodigo,
    clasificarTipo,
    // Se exponen para poder testearlas desde consola si hiciera falta:
    _buscarCodigoEnTexto: buscarCodigoEnTexto,
    _normalizarTexto: normalizarTexto,
    _normalizarCodigo: normalizarCodigo,
  };
})();

// Compat Node: permite hacer require() en los tests locales sin afectar
// al comportamiento en el navegador (donde `module` no existe).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Carreteras;
}
