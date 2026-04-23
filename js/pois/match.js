// js/pois/match.js — DT-10 (sesión 33)
//
// Módulo de matching léxico para POIs y municipios. Expone:
//   POIMatch.tokenizar(s) → Set<string>
//   POIMatch.jaccardSim(a, b) → number [0, 1]
//   POIMatch.matchLabels(a, b, umbral) → number (Jaccard o "containment" >= umbral)
//   POIMatch.STOPWORDS (Set<string>)
//   POIMatch.EXCLUIR_GEOSEARCH (RegExp)
//   POIMatch.JACCARD_MIN_POI, .JACCARD_MIN_MUNICIPIO, .JACCARD_MIN_PEDANIA
//
// Extraído sin cambios de comportamiento de pois.js. La segunda pasada
// "containment" (PO-10) reconoce nombres que coinciden cuando el más
// corto está contenido entero en el más largo y tiene al menos un
// término con ≥ 5 letras (posible nombre propio).

(function () {
  'use strict';

  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  // Stopwords de dominio (decisión 13 + PO-10). PO-10 amplía con sinónimos
  // comunes de patrimonio civil para que "Palacio de X" y "Casa-Museo de X"
  // comparen solo por los nombres propios restantes.
  const STOPWORDS = new Set([
    'de','del','la','el','los','las','y','a','en',
    'san','santa','santo','nuestra','señora','virgen',
    'iglesia','ermita','castillo','torre','convento',
    'monasterio','catedral','capilla',
    'palacio','palacete','casa','museo','casona','mansion','solar',
    'puerta','arco','puente','fuente','plaza',
  ]);

  // Filtro para Wikipedia geosearch: títulos que no son pueblos.
  const EXCLUIR_GEOSEARCH = /\b(Estaci[oó]n|Embalse|Arroyo|R[ií]o|Autov[ií]a|Autopista|Aeropuerto|Pol[ií]gono|Hospital|Universidad|Centro comercial|Pantano|Presa)\b|\(empresa\)|\(compañía\)|\(revista\)|^[A-Z]{1,3}-\d/i;

  const JACCARD_MIN_POI = 0.5;
  const JACCARD_MIN_MUNICIPIO = 0.3;
  const JACCARD_MIN_PEDANIA = 0.5;

  function tokenizar(s) {
    return new Set(
      s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/\W+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(w))
    );
  }

  function jaccardSim(a, b) {
    const wa = tokenizar(a);
    const wb = tokenizar(b);
    let interseccion = 0;
    for (const w of wa) if (wb.has(w)) interseccion++;
    const union = wa.size + wb.size - interseccion;
    return union === 0 ? 0 : interseccion / union;
  }

  // PO-10: match en dos pasadas. Primera pasada Jaccard estricto. Si no
  // llega al umbral, segunda pasada por "containment": todos los tokens
  // del nombre más corto están en el más largo Y al menos uno tiene ≥ 5
  // letras (nombre propio probable).
  function matchLabels(a, b, umbral) {
    const jac = jaccardSim(a, b);
    if (jac >= umbral) return jac;
    const wa = tokenizar(a), wb = tokenizar(b);
    const [pequeno, grande] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
    if (pequeno.size === 0) return jac;
    let tieneNombrePropio = false;
    for (const w of pequeno) if (w.length >= 5) { tieneNombrePropio = true; break; }
    if (!tieneNombrePropio) return jac;
    for (const w of pequeno) if (!grande.has(w)) return jac;
    return umbral;
  }

  __global__.POIMatch = {
    tokenizar,
    jaccardSim,
    matchLabels,
    STOPWORDS,
    EXCLUIR_GEOSEARCH,
    JACCARD_MIN_POI,
    JACCARD_MIN_MUNICIPIO,
    JACCARD_MIN_PEDANIA,
  };
})();
