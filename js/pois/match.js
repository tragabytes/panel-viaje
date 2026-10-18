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

  // Filtro general para Wikipedia geosearch: infraestructura que no debe
  // considerarse ni pueblo ni POI patrimonial. Lo usan tanto el fallback de
  // pueblos como el de POIs por pueblo. NO incluye palacios/iglesias/etc:
  // esos sí son POIs válidos.
  const EXCLUIR_GEOSEARCH = /\b(Estaci[oó]n|Embalse|Arroyo|R[ií]o|Autov[ií]a|Autopista|Aeropuerto|Pol[ií]gono|Hospital|Universidad|Centro comercial|Pantano|Presa)\b|\(empresa\)|\(compañía\)|\(revista\)|^[A-Z]{1,3}-\d/i;

  // BPC-16: filtro adicional ESTRICTO solo para el fallback de pueblos
  // (obtenerPueblosWikipedia). Wikipedia geosearch devuelve cualquier
  // artículo con coordenadas en el radio: palacios, conventos, ayuntamientos,
  // observatorios... que se colaban como "pueblos" cuando Overpass fallaba y
  // se persistían en IDB contaminando V1 y V3. Tres categorías:
  //   1) Palabras al inicio del título que NUNCA son pueblo en España
  //      (Palacio, Convento, Ayuntamiento, etc.). Excluyen sin ambigüedad.
  //   2) Palabras ambivalentes (Iglesia, Torre, Fuente, Puente...) que SÍ
  //      pueden encabezar nombres de pueblos legítimos (Torre Pacheco,
  //      Puente Genil, Fuente Obejuna). Solo excluir si llevan paréntesis,
  //      patrón típico de POI con municipio explícito: "X de Y (Municipio)".
  //   3) Cualquier cosa que ya excluya EXCLUIR_GEOSEARCH (infraestructura).
  const EXCLUIR_PUEBLOS_GEOSEARCH = new RegExp(
    // Categoría 1: nunca son pueblo al inicio
    '^(Palacio|Palacete|Convento|Monasterio|Ayuntamiento|Auditorio|Observatorio|Casa[-\\s]Museo|Casa de Cultura|Museo|Catedral|Dehesa)\\b' +
    // Categoría 2: ambivalentes con paréntesis (POI dentro de un municipio)
    '|^(Iglesia|Ermita|Capilla|Torre|Fuente|Castillo|Plaza|Cruz|Arco|Puente|Parque|Casa)\\b.*\\([^)]+\\)',
    'i'
  );

  // BPC-18: filtro adicional para los resultados Overpass de pueblos.
  // Confirmado en sesión 44 (preview con ?sim=a6) que entradas como
  // "Urbanización Montealegría", "Finca Nueva El Enebrillo" o "Canto del Pico"
  // están en OSM como place=hamlet y se cuelan en V1/V3. Solo el nombre las
  // delata; no son lugares poblacionales en el sentido tradicional.
  const EXCLUIR_PUEBLOS_OSM = new RegExp(
    '^(Urbanizaci[oó]n|Finca|Pol[ií]gono|Cementerio|Pantano|Embalse|Presa|Aeropuerto)\\b' +
    // Geográficos que OSM a veces marca hamlet por ser microparajes
    '|^(Canto|Cerro|Mirador|Loma|Pe[ñn]a)\\b',
    'i'
  );

  // PENDIENTES n.º 2: la descripción corta de un artículo de Wikipedia (viene
  // de Wikidata) dice qué es. Es un pueblo si empieza así; si no (cofradía,
  // edificio, río, barrio, estación, batalla...), no. Muestreadas el 18/10/2026
  // en nueve zonas de España: así se describen municipios, localidades,
  // parroquias gallegas y asturianas, anteiglesias vascas y entidades de población.
  const DESCRIPCION_PUEBLO = new RegExp(
    '^(municipio|localidad|pedan[ií]a|aldea|pueblo|concejo|despoblado|anteiglesia|barrio y anteiglesia' +
    '|n[uú]cleo de poblaci[oó]n|poblaci[oó]n|entidad (singular de|colectiva de|de|local)\\b|comuna|freguesia' +
    '|parroquia(?! cat[oó]lica)|lugar (de la parroquia|del (municipio|concejo|concello))' +
    '|villa (de|del|y|espa[ñn]ola)\\b|ciudad (de|del|y|espa[ñn]ola|aut[oó]noma)\\b|capital (de|del)\\b)',
    'i'
  );

  // Sin descripción, el título. Además de los filtros de arriba, lo que nunca
  // es un pueblo al principio de un título (sitios y batallas, calles, barrios,
  // estadios, cofradías...). Solo se aplica a artículos sin descripción, así
  // que "Torre Pacheco" (que la tiene) no se pierde.
  const NO_PUEBLO_TITULO = new RegExp(
    '^(Sitios?|Asedio|Batalla|Combate|Bombardeo|Toma|Estadio|Pabell[oó]n|Teatro|Partido judicial' +
    '|[ÁA]rea (urbana|metropolitana)|Comarca|Monumento|Edificio|Calle|Paseo|Avenida|Plaza|Mina|Muralla' +
    '|Sacrist[ií]a|Patio|[ÍI]dolo|Distrito|Barrio|Cofrad[ií]a|Archicofrad[ií]a|Hermandad|Real Cofrad[ií]a' +
    '|Instituto|Colegio|Biblioteca|Hotel|Antigu[oa]|Casas?|Torre|Atalaya|Puerta|Puerto de|Pueblo|Sierra|Monte' +
    '|Parque|Polideportivo|Cementerio|Sede|Nave|Bas[ií]lica|Castillo|Iglesia|Ermita|Palacio|Convento|Monasterio' +
    '|Museo|Catedral|Santuario|Puente|Estaci[oó]n)\\b',
    'i'
  );

  // Lo mismo para los POIs de un pueblo sacados de Wikipedia: ni un pueblo
  // vecino (DESCRIPCION_PUEBLO) ni algo que no se puede visitar (un asedio, una
  // cofradía, una comarca, una estación, un río...).
  const NO_POI_DESCRIPCION = new RegExp(
    '^(asedio|batalla|combate|bombardeo|toma de|cofrad[ií]a|archicofrad[ií]a|hermandad|club|equipo|empresa' +
    '|organismo|instituci[oó]n|partido judicial|comarca|territorio|regi[oó]n|distrito|barrio|urbanizaci[oó]n' +
    '|estaci[oó]n|apeadero|l[ií]nea|carretera|autov[ií]a|autopista|calle|avenida|ayuntamiento de' +
    '|curso de agua|r[ií]o|arroyo|centro (educativo|de salud|comercial)|colegio|instituto|universidad' +
    '|facultad|hospital|estadio|pabell[oó]n|polideportivo|complejo deportivo)',
    'i'
  );

  // Un artículo SIN descripción solo pasa como punto de interés si el título lo
  // dice: si no, suele ser un pueblo vecino sin describir ("La Carrera (León)")
  // o algo que no se visita ("Partido judicial de…").
  const SI_POI_TITULO = new RegExp(
    '^(Iglesia|Ermita|Castillo|Palacio|Monasterio|Convento|Catedral|Bas[ií]lica|Santuario|Colegiata|Abad[ií]a|Cartuja' +
    '|Capilla|Museo|Puente|Torre|Torre[oó]n|Atalaya|Muralla|Murallas|Alc[aá]zar|Fortaleza|Acueducto|Arco|Puerta' +
    '|Casa|Fuente|Mirador|Pico|Cueva|Ruinas|Yacimiento|Villa romana|Termas|Teatro romano|Calzada|Dolmen|Castro' +
    '|Necr[oó]polis|Monumento|Cruz|Rollo|Picota|Molino|Plaza Mayor|Jard[ií]n|Bosque|Cascada|Laguna|Lago|Desfiladero' +
    '|Hoz|Garganta|Faro)\\b',
    'i'
  );

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
    EXCLUIR_PUEBLOS_GEOSEARCH,
    EXCLUIR_PUEBLOS_OSM,
    DESCRIPCION_PUEBLO,
    NO_PUEBLO_TITULO,
    NO_POI_DESCRIPCION,
    SI_POI_TITULO,
    JACCARD_MIN_POI,
    JACCARD_MIN_MUNICIPIO,
    JACCARD_MIN_PEDANIA,
  };
})();
