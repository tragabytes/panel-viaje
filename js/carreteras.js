// carreteras.js — Tabla de mapeo de nombres descriptivos a códigos de carretera
//
// Nominatim a veces devuelve nombres descriptivos ("Autovía del Nordeste")
// en lugar del código corto ("A-2"). Esta tabla los equipara.
// Decisión arquitectónica 09 del plan.
//
// La clave es el nombre en minúsculas, sin tildes y sin espacios de más,
// para que el lookup sea robusto frente a variaciones de escritura.
// La función normalizar() hace esa limpieza antes de buscar.

const Carreteras = (() => {

  // Mapeo nombre descriptivo → código oficial
  const NOMBRES_A_CODIGOS = {
    // Autovías radiales (las 6 con nombre descriptivo)
    'autovia del norte': 'A-1',
    'autovia del nordeste': 'A-2',
    'autovia del este': 'A-3',
    'autovia del sur': 'A-4',
    'autovia del suroeste': 'A-5',
    'autovia del noroeste': 'A-6',

    // Autopistas radiales de peaje
    'autopista del norte': 'AP-1',
    'autopista del nordeste': 'AP-2',
    'autopista del este': 'AP-3',
    'autopista del sur': 'AP-4',
    'autopista del noroeste': 'AP-6',

    // Autovías transversales y del cantábrico con nombre conocido
    'autovia del mediterraneo': 'A-7',
    'autovia de la plata': 'A-66',
    'autovia del cantabrico': 'A-8',
    'autovia mudejar': 'A-23',

    // Radiales de pago de Madrid
    'radial 2': 'R-2',
    'radial 3': 'R-3',
    'radial 4': 'R-4',
    'radial 5': 'R-5',
  };

  // Patrón de códigos de carretera españoles: letras (1-3) + guion + número.
  // Cubre: A-2, AP-7, N-340, M-30, M-40, CM-42, CL-601, C-32, AS-II, etc.
  // También tolera sin guion por si acaso (A2, N340).
  const REGEX_CODIGO = /^[A-Z]{1,3}-?\d{1,4}$/i;

  // Normaliza un nombre: minúsculas, sin tildes, espacios colapsados.
  function normalizar(texto) {
    return texto
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita tildes
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Dado lo que Nominatim devuelve en address.road, intenta extraer un
  // código de carretera. Si no parece carretera (es una calle, un camino...),
  // devuelve null.
  //
  // Orden de intentos:
  //   1. ¿Ya es un código tipo "A-2", "N-340", "M-30"? → devolverlo tal cual.
  //   2. ¿Es un nombre descriptivo conocido ("Autovía del Nordeste")? → traducir.
  //   3. ¿Contiene dentro un código ("A-2 / Autovía del Nordeste")? → extraerlo.
  //   4. Si nada encaja → null.
  function extraerCodigo(textoVia) {
    if (!textoVia || typeof textoVia !== 'string') return null;
    const limpio = textoVia.trim();

    // Caso 1: el propio texto ya es un código
    if (REGEX_CODIGO.test(limpio)) {
      return limpio.toUpperCase().replace(/^([A-Z]+)(\d)/, '$1-$2');
    }

    // Caso 2: nombre descriptivo conocido
    const normalizado = normalizar(limpio);
    if (NOMBRES_A_CODIGOS[normalizado]) {
      return NOMBRES_A_CODIGOS[normalizado];
    }

    // Caso 3: el texto contiene un código dentro (p.ej. "A-2; Autovía...")
    const partes = limpio.split(/[;,/\s]+/);
    for (const parte of partes) {
      if (REGEX_CODIGO.test(parte)) {
        return parte.toUpperCase().replace(/^([A-Z]+)(\d)/, '$1-$2');
      }
    }

    // Caso 4: no es carretera identificable
    return null;
  }

  return { extraerCodigo, normalizar };
})();
