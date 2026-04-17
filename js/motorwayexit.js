// motorwayexit.js — MotorwayExitModule: próximas salidas de la vía actual
//
// Qué hace:
//   Dado un fix de GPS (lat, lon, rumbo, velocidad) y el código de la vía
//   actual (roadRef), devuelve la próxima salida y la siguiente de esa vía.
//   Si la vía no tiene salidas, o si no estamos en movimiento, o si no
//   tenemos código de vía, el módulo devuelve "oculto" y el cartel verde
//   no se pinta.
//
// Diseño (decisiones 14 y posteriores sesión 10):
//   · Activación por velocidad > 50 km/h sostenida, no por prefijo de ref.
//     Cualquier vía con código oficial entra (A-, AP-, M-, CV-, etc.).
//     Es la propia respuesta de Overpass la que decide si esa vía tiene
//     salidas útiles: si devuelve cero junctions, el módulo queda en
//     "sin_datos" y el cartel verde se oculta.
//   · Consulta única de 50 km a Overpass cuando entramos en una vía nueva.
//     Refresco cuando nos alejamos >35 km del centro de la última consulta.
//     Sin refresco por tiempo: las salidas no se mueven.
//   · Filtro local en cada tick: distancia >300 m y ángulo <45° respecto
//     al rumbo actual. El rumbo SIEMPRE es el del fix más reciente, nunca
//     uno cacheado (aprendizaje de decisión 14).
//   · Cascada de mirrors delegada a Overpass.query() (overpass.js).
//   · Caché solo en memoria. Si se recarga el panel en marcha, nueva
//     consulta. En un viaje típico son 3-5 consultas, despreciables.
//
// Histéresis de velocidad:
//   No queremos desactivar el módulo por un frenazo ni activarlo por un
//   acelerón puntual. Por eso la velocidad tiene que estar por encima (o
//   debajo) del umbral de forma SOSTENIDA durante 30 s antes de cambiar
//   el estado de "en movimiento". Esto también evita que un atasco en
//   M-30 urbana dispare Overpass sin parar.
//
// API pública:
//   MotorwayExitModule.actualizar({lat, lon, rumbo, velocidadKmh, roadRef})
//     → { activo, proxima, siguiente, estado }
//       activo: bool — si false, ocultar cartel verde
//       proxima: { ref, distanciaKm } | null
//       siguiente: { ref, distanciaKm } | null
//       estado: 'ok' | 'cargando' | 'sin_datos' | 'error' | 'inactivo'
//
//   MotorwayExitModule.reset()
//     Vacía caché y estado. Útil para tests con el simulador.
//
// Dependencia: overpass.js debe cargarse antes que este archivo.
//
// NOTA CRÍTICA SOBRE EL SCOPE GLOBAL (P18-bis, sesión 10):
//   En scripts clásicos de navegador todos los <script> comparten el mismo
//   ámbito global. Por eso NO podemos declarar `const __global__ = ...` a
//   nivel top-level: si otro archivo (p.ej. roadref.js) ya lo declaró, la
//   segunda declaración lanza SyntaxError y aborta la carga entera del
//   archivo, dejando window.MotorwayExitModule en undefined sin avisar.
//   Solución: envolvemos TODO el archivo en una IIFE exterior para que
//   __global__ viva en un ámbito local. Así ningún identificador interno
//   choca con otros módulos pase lo que pase.

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  __global__.MotorwayExitModule = (() => {

  // --- Constantes configurables ---

  const RADIO_CONSULTA_KM = 50;
  const UMBRAL_REFRESCO_KM = 35;

  const DISTANCIA_MIN_JUNCTION_M = 300;
  const TOLERANCIA_ANGULAR_GRADOS = 45;

  // MO-06: en autovía dividida, descartar junctions cuyo way (oneway=yes)
  // vaya en sentido opuesto al rumbo del usuario. >90° = sentido contrario.
  // Si el way no es oneway o no tenemos bearing, no filtramos por sentido.
  const TOLERANCIA_SENTIDO_GRADOS = 90;

  const VELOCIDAD_MIN_KMH = 50;
  const HISTERESIS_VELOCIDAD_MS = 30000;

  // Distancia a la que se lanza la consulta de destinos del cartel.
  // 2 km da tiempo de sobra para que llegue la respuesta antes de llegar.
  const UMBRAL_DESTINOS_KM = 2.0;

  // Tiempo máximo que toleramos sin roadRef antes de vaciar la caché.
  // Cubre fallos transitorios de mirrors (1-2 ticks, ~3-6 s). Si el ref
  // lleva más de 30 s ausente, asumimos cambio real de vía o parada.
  const GRACIA_ROADREF_MS = 30000;

  // Tiempo de espera antes de reintentar Overpass tras un error total de red.
  // 2 minutos: suficiente para que el servidor se recupere sin martillear.
  const REINTENTO_ERROR_MS = 120000;

  // --- Estado interno ---

  // Caché de junctions para la vía actual.
  // { ref: "A-6", centroLat, centroLon, junctions: [{id, ref, lat, lon}], cargando: bool }
  let cache = null;

  // Caché de destinos por node ID de junction.
  // { [nodeId]: { destinos: string|null, cargando: bool } }
  // null = sin datos (la salida no tiene destination en OSM).
  // string = texto formateado listo para mostrar.
  let destinosPorJunction = {};

  // Control de histéresis: marca temporal del último momento en que la
  // velocidad CRUZÓ el umbral. Mientras no hayan pasado HISTERESIS_VELOCIDAD_MS,
  // el estado "en movimiento" no cambia.
  let enMovimiento = false;
  let tsUltimoCruceVelocidad = 0;
  let ultimaVelocidadSobreUmbral = false;

  // Último roadRef conocido válido + su timestamp. Permite sobrevivir
  // fallos transitorios de RoadRef sin vaciar caché ni relanzar Overpass.
  let ultimoRoadRefConocido = null;
  let tsUltimoRoadRefConocido = 0;

  // Memo del último conteo de descartados por sentido para deduplicar el
  // log de MO-06 (un mensaje por cambio, no uno por tick).
  let ultimoDescartadosSentido = 0;

  // --- Overpass ---

  // Pedimos los nodos highway=motorway_junction de la vía actual + geometría
  // de los ways. La geometría sirve para filtrar el sentido de marcha (MO-06):
  // por cada junction calculamos el bearing del segmento del way que lo
  // contiene, y descartamos los del sentido contrario en autovía dividida.
  // Estrategia (problema P24, sesión 13 + MO-06):
  //   1) Nodos motorway_junction en radio 50 km → .todos (índice espacial)
  //   2) Ways con ref=<refVia> que contienen esos nodos → .via (set pre-filtrado)
  //   3) Nodos motorway_junction de esas vías → .juncs (resultado limpio)
  //   4) .juncs out body  → tags + lat/lon de cada junction
  //   5) .via   out body geom  → tags (oneway), nodes[] y geometry[] paralelos.
  //      `nodes` y `geometry` son arrays paralelos: nodes[i] es el id del
  //      i-ésimo nodo del way, geometry[i] su {lat, lon}.
  function construirQuery(lat, lon, refVia) {
    const radioMetros = RADIO_CONSULTA_KM * 1000;
    const refEscapada = String(refVia).replace(/"/g, '');
    return (
      `[out:json][timeout:25];` +
      `node(around:${radioMetros},${lat},${lon})[highway=motorway_junction]["ref"](if:t["ref"]!="0")->.todos;` +
      `way[ref="${refEscapada}"][highway~"motorway"](bn.todos)->.via;` +
      `node(w.via)[highway=motorway_junction]["ref"](if:t["ref"]!="0")->.juncs;` +
      `.juncs out body;` +
      `.via out body geom;`
    );
  }

  // Parsea elements de Overpass en lista de junctions con metadatos de sentido.
  // No dedupa por ref aquí: en autovía dividida el mismo número de salida
  // aparece en ambas calzadas como dos junctions distintos. La dedupe se hace
  // más tarde en actualizar(), después de filtrar por sentido y proximidad,
  // quedándonos con el más cercano (MO-06).
  //
  // Para cada junction, calcula el bearing local del way que lo contiene:
  //   - Localiza el way por nodes[].includes(junctionId).
  //   - Calcula el bearing del segmento adyacente al junction
  //     (geometry[i-1] → geometry[i] si hay anterior, o geometry[i] →
  //     geometry[i+1] si es el primero).
  //   - Si oneway === '-1', el way está digitalizado al revés respecto
  //     al sentido de circulación: invertimos el bearing.
  function parsearJunctions(datos) {
    if (!datos || !Array.isArray(datos.elements)) return { lista: [], descartados: 0 };

    const nodes = [];
    const ways = [];
    for (const el of datos.elements) {
      if (!el) continue;
      if (el.type === 'node') nodes.push(el);
      else if (el.type === 'way') ways.push(el);
    }

    // Mapa junctionId → { wayBearing (grados 0-360), wayOneway (bool) }.
    // Si un junction aparece en varios ways (raro), nos quedamos con el
    // primero encontrado: en autovía dividida cada calzada es su propio way
    // y cada junction está en un único way.
    const datosWayPorJunction = new Map();
    for (const w of ways) {
      const tags = w.tags || {};
      const onewayRaw = (tags.oneway || '').toLowerCase();
      const oneway = (onewayRaw === 'yes' || onewayRaw === '1' || onewayRaw === '-1' || onewayRaw === 'true');
      const sentidoInverso = (onewayRaw === '-1');
      const ids = Array.isArray(w.nodes) ? w.nodes : [];
      const geom = Array.isArray(w.geometry) ? w.geometry : [];
      if (ids.length < 2 || geom.length < 2 || ids.length !== geom.length) continue;
      for (let i = 0; i < ids.length; i++) {
        const idJ = ids[i];
        if (datosWayPorJunction.has(idJ)) continue;
        let aIdx, bIdx;
        if (i > 0) { aIdx = i - 1; bIdx = i; }
        else { aIdx = 0; bIdx = 1; }
        const a = geom[aIdx];
        const b = geom[bIdx];
        if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') continue;
        let bearingWay = rumboHaciaLocal(a.lat, a.lon, b.lat, b.lon);
        if (sentidoInverso) bearingWay = (bearingWay + 180) % 360;
        datosWayPorJunction.set(idJ, { wayBearing: bearingWay, wayOneway: oneway });
      }
    }

    const lista = [];
    let descartados = 0;
    for (const el of nodes) {
      const ref = el.tags && el.tags.ref;
      if (!ref || typeof ref !== 'string' || ref.trim() === '' || ref.trim() === '0') {
        descartados++;
        continue;
      }
      const refLimpia = ref.trim();
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') {
        descartados++;
        continue;
      }
      const dw = datosWayPorJunction.get(el.id) || null;
      lista.push({
        id: el.id,
        ref: refLimpia,
        lat: el.lat,
        lon: el.lon,
        wayBearing: dw ? dw.wayBearing : null,
        wayOneway: dw ? dw.wayOneway : false,
      });
    }
    return { lista, descartados };
  }

  // Helper local: calcula el rumbo (grados 0-360) entre dos puntos.
  // Duplica la lógica de Overpass.rumboHacia para no depender del módulo
  // global cuando _parsearJunctions se usa aislado en tests.
  function rumboHaciaLocal(lat1, lon1, lat2, lon2) {
    if (typeof Overpass !== 'undefined' && Overpass.rumboHacia) {
      return Overpass.rumboHacia(lat1, lon1, lat2, lon2);
    }
    const toRad = (g) => g * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  async function consultarOverpass(lat, lon, refVia) {
    const queryQL = construirQuery(lat, lon, refVia);
    const { datos } = await Overpass.query(queryQL, 'MotorwayExit');
    const { lista, descartados } = parsearJunctions(datos);
    if (typeof debug !== 'undefined') {
      debug.log(`MotorwayExit · ${lista.length} junctions válidos · ${descartados} descartados`);
    }
    return { lista };
  }

  // --- Destinos del cartel ---

  // Formatea el valor del tag destination de OSM en texto legible.
  // OSM usa ";" como separador de destinos múltiples.
  // Ejemplo: "Las Matas;Los Peñascales;vía de servicio" → "Las Matas · Los Peñascales · vía de servicio"
  function formatearDestinos(destinationTag, destinationRefTag) {
    const partes = [];
    if (destinationRefTag) {
      partes.push(destinationRefTag.split(';').map(s => s.trim()).filter(Boolean).join(' / '));
    }
    if (destinationTag) {
      partes.push(...destinationTag.split(';').map(s => s.trim()).filter(Boolean));
    }
    return partes.length ? partes.join(' · ') : null;
  }

  // Consulta los ways motorway_link que contienen el nodo junction dado
  // y extrae su tag destination. Resultado cacheado en destinosPorJunction.
  // Solo se lanza una vez por junction ID; si ya está en caché no hace nada.
  function consultarDestinos(junctionId) {
    if (destinosPorJunction[junctionId]) return; // ya está en caché (incluso si es cargando)
    destinosPorJunction[junctionId] = { destinos: null, cargando: true };
    const queryQL = `[out:json][timeout:10];node(${junctionId});way(bn)[highway=motorway_link];out tags;`;
    Overpass.query(queryQL, 'MotorwayDestinos').then(({ datos }) => {
      let mejorDestino = null;
      if (datos && Array.isArray(datos.elements)) {
        for (const el of datos.elements) {
          const tags = el.tags || {};
          const d = formatearDestinos(tags['destination'], tags['destination:ref']);
          if (d) { mejorDestino = d; break; } // tomamos el primer way con destination
        }
      }
      destinosPorJunction[junctionId] = { destinos: mejorDestino, cargando: false };
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayDestinos: junction ${junctionId} → ${mejorDestino || '(sin destination)'}`);
      }
    }).catch(() => {
      // En caso de error de red, dejamos cargando=false y destinos=null.
      // El cartel sigue mostrando el número sin destinos; no es crítico.
      destinosPorJunction[junctionId] = { destinos: null, cargando: false };
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayDestinos: fallo al consultar junction ${junctionId}`);
      }
    });
  }

  // --- Gestión de caché ---

  // Lanza una consulta asíncrona a Overpass. Distingue dos casos:
  //   1) Entrada nueva en una vía (cache === null): empezamos de cero con
  //      junctions=null y estado "cargando". La UI oculta el cartel.
  //   2) Refresco por distancia (cache existe y tiene junctions): mantenemos
  //      los junctions anteriores visibles mientras llega la nueva respuesta.
  //      Esto evita el parpadeo del cartel verde durante los 300-2000 ms de
  //      latencia del refresco. Al llegar la respuesta nueva, se sustituyen.
  function lanzarConsultaAsincrona(lat, lon, refVia) {
    const esRefresco = (cache && cache.ref === refVia && Array.isArray(cache.junctions));
    if (esRefresco) {
      // Marcamos que hay un refresco en curso pero NO tocamos junctions.
      cache.refrescando = true;
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: refresco en curso para ${refVia} (manteniendo ${cache.junctions.length} junctions visibles)`);
      }
    } else {
      cache = {
        ref: refVia,
        centroLat: lat,
        centroLon: lon,
        junctions: null,
        cargando: true,
        refrescando: false,
        error: false,
      };
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: entrada en ${refVia}, lanzando query Overpass (radio ${RADIO_CONSULTA_KM}km)`);
      }
    }
    consultarOverpass(lat, lon, refVia).then(({ lista }) => {
      // Solo actualizamos si seguimos en la misma vía. Si mientras llegaba
      // la respuesta el usuario cambió de autovía, la respuesta es obsoleta.
      if (cache && cache.ref === refVia) {
        cache.junctions = lista;
        cache.centroLat = lat;
        cache.centroLon = lon;
        cache.cargando = false;
        cache.refrescando = false;
        cache.error = false;
      }
    }).catch(() => {
      if (cache && cache.ref === refVia) {
        // En entrada nueva, el error es visible (estado 'error'). En refresco,
        // conservamos los datos viejos y solo anotamos el fallo: el usuario
        // sigue viendo la última salida válida.
        if (!Array.isArray(cache.junctions)) {
          cache.cargando = false;
          cache.error = true;
          cache.tsError = Date.now();
          cache.junctions = [];
        } else {
          cache.refrescando = false;
          if (typeof debug !== 'undefined') {
            debug.log('MotorwayExit: refresco falló, se mantienen los junctions anteriores');
          }
        }
      }
    });
  }

  // --- Histéresis de velocidad ---

  function actualizarMovimiento(velocidadKmh, ahoraMs) {
    const sobreUmbral = (typeof velocidadKmh === 'number' && velocidadKmh > VELOCIDAD_MIN_KMH);
    if (sobreUmbral !== ultimaVelocidadSobreUmbral) {
      tsUltimoCruceVelocidad = ahoraMs;
      ultimaVelocidadSobreUmbral = sobreUmbral;
    }
    const transcurrido = ahoraMs - tsUltimoCruceVelocidad;
    if (transcurrido >= HISTERESIS_VELOCIDAD_MS) {
      if (enMovimiento !== sobreUmbral) {
        enMovimiento = sobreUmbral;
        if (typeof debug !== 'undefined') {
          debug.log(`MotorwayExit: movimiento = ${enMovimiento} (v=${Math.round(velocidadKmh || 0)}km/h)`);
        }
      }
    }
  }

  // --- API pública ---

  function actualizar(fix) {
    const { lat, lon, rumbo, velocidadKmh, roadRef } = fix || {};
    const ahoraMs = Date.now();

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return { activo: false, proxima: null, siguiente: null, estado: 'inactivo' };
    }

    actualizarMovimiento(velocidadKmh, ahoraMs);

    // Sin código de vía: puede ser un fallo transitorio de RoadRef (mirror caído
    // 1-2 ticks). Si tenemos un ref reciente, lo usamos como fallback durante
    // GRACIA_ROADREF_MS para no vaciar caché ni relanzar Overpass innecesariamente.
    // Solo vaciamos si el ref lleva más de 30 s ausente (cambio real de vía o parada).
    let refEfectiva = roadRef;
    if (!refEfectiva) {
      const edadUltimoRef = ahoraMs - tsUltimoRoadRefConocido;
      if (ultimoRoadRefConocido && edadUltimoRef < GRACIA_ROADREF_MS) {
        if (typeof debug !== 'undefined') {
          debug.log(`MotorwayExit: sin roadRef, fallback a ${ultimoRoadRefConocido} (${Math.round(edadUltimoRef / 1000)}s)`);
        }
        refEfectiva = ultimoRoadRefConocido;
      } else {
        if (cache) {
          if (typeof debug !== 'undefined') debug.log('MotorwayExit: sin roadRef, caché vaciada');
          cache = null;
        }
        ultimoRoadRefConocido = null;
        return { activo: false, proxima: null, siguiente: null, estado: 'inactivo' };
      }
    } else {
      ultimoRoadRefConocido = roadRef;
      tsUltimoRoadRefConocido = ahoraMs;
    }

    // No en movimiento sostenido: no activamos. Pero NO vaciamos la caché
    // si ya existe para la vía actual; puede ser un frenazo, si en <30s
    // volvemos a pasar el umbral seguimos teniendo los datos.
    if (!enMovimiento) {
      return { activo: false, proxima: null, siguiente: null, estado: 'inactivo' };
    }

    // Cambio de vía: vaciamos y relanzamos.
    if (cache && cache.ref !== refEfectiva) {
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: cambio de vía ${cache.ref} → ${refEfectiva}, caché vaciada`);
      }
      cache = null;
    }

    // Sin caché: primera consulta para esta vía.
    if (!cache) {
      lanzarConsultaAsincrona(lat, lon, refEfectiva);
      return { activo: false, proxima: null, siguiente: null, estado: 'cargando' };
    }

    // Caché presente pero aún cargando.
    if (cache.cargando) {
      return { activo: false, proxima: null, siguiente: null, estado: 'cargando' };
    }

    // Caché presente con error de red. Reintentamos tras REINTENTO_ERROR_MS.
    if (cache.error) {
      if (ahoraMs - cache.tsError >= REINTENTO_ERROR_MS) {
        if (typeof debug !== 'undefined') {
          debug.log('MotorwayExit: reintentando tras error de red');
        }
        cache = null;
        lanzarConsultaAsincrona(lat, lon, refEfectiva);
        return { activo: false, proxima: null, siguiente: null, estado: 'cargando' };
      }
      return { activo: false, proxima: null, siguiente: null, estado: 'error' };
    }

    // Caché presente y cargada. ¿Toca refrescar por distancia?
    // No disparamos un refresco si ya hay uno en vuelo.
    const distCentroKm = Overpass.distanciaMetros(lat, lon, cache.centroLat, cache.centroLon) / 1000;
    if (distCentroKm >= UMBRAL_REFRESCO_KM && !cache.refrescando) {
      if (typeof debug !== 'undefined') {
        debug.log(`MotorwayExit: refresco por distancia (centro a ${distCentroKm.toFixed(1)}km)`);
      }
      lanzarConsultaAsincrona(lat, lon, refEfectiva);
      // Durante el refresco seguimos usando los junctions actuales
      // (lanzarConsultaAsincrona los preserva).
    }

    // Filtro local de junctions por delante.
    const junctions = (cache && cache.junctions) || [];
    if (junctions.length === 0) {
      return { activo: false, proxima: null, siguiente: null, estado: 'sin_datos' };
    }

    let descartadosSentido = 0;
    const candidatos = [];
    for (const j of junctions) {
      const distM = Overpass.distanciaMetros(lat, lon, j.lat, j.lon);
      if (distM < DISTANCIA_MIN_JUNCTION_M) continue;
      if (typeof rumbo === 'number') {
        const rumboJ = Overpass.rumboHacia(lat, lon, j.lat, j.lon);
        const diff = Overpass.diferenciaAngular(rumbo, rumboJ);
        if (diff > TOLERANCIA_ANGULAR_GRADOS) continue;
        // MO-06: si el way del junction es oneway y va en sentido opuesto
        // al rumbo del usuario, es la calzada contraria → descartar.
        if (j.wayOneway && typeof j.wayBearing === 'number') {
          const diffSentido = Overpass.diferenciaAngular(rumbo, j.wayBearing);
          if (diffSentido > TOLERANCIA_SENTIDO_GRADOS) {
            descartadosSentido++;
            continue;
          }
        }
      }
      candidatos.push({ id: j.id, ref: j.ref, distanciaKm: distM / 1000 });
    }

    if (descartadosSentido > 0 && typeof debug !== 'undefined') {
      // Log dedupado: solo cuando cambia el conteo, para no spammear cada tick.
      if (descartadosSentido !== ultimoDescartadosSentido) {
        debug.log(`MotorwayExit: ${descartadosSentido} junctions descartados por sentido contrario`);
        ultimoDescartadosSentido = descartadosSentido;
      }
    } else if (descartadosSentido === 0 && ultimoDescartadosSentido !== 0) {
      ultimoDescartadosSentido = 0;
    }

    if (candidatos.length === 0) {
      return { activo: false, proxima: null, siguiente: null, estado: 'sin_datos' };
    }

    // Dedupe por ref: mismo número de salida puede aparecer en ambas
    // calzadas; nos quedamos con el más cercano (en autovía dividida ya
    // habremos descartado el contrario por sentido, pero por seguridad).
    candidatos.sort((a, b) => a.distanciaKm - b.distanciaKm);
    const vistosRef = new Set();
    const candidatosUnicos = [];
    for (const c of candidatos) {
      if (vistosRef.has(c.ref)) continue;
      vistosRef.add(c.ref);
      candidatosUnicos.push(c);
    }
    candidatos.length = 0;
    candidatos.push(...candidatosUnicos);

    const proxima = {
      id: candidatos[0].id,
      ref: candidatos[0].ref,
      distanciaKm: Math.round(candidatos[0].distanciaKm * 10) / 10,
    };
    const siguiente = candidatos[1] ? {
      ref: candidatos[1].ref,
      distanciaKm: Math.round(candidatos[1].distanciaKm * 10) / 10,
    } : null;

    // Si estamos a ≤ UMBRAL_DESTINOS_KM, lanzar consulta de destinos (una sola vez por junction).
    if (proxima.distanciaKm <= UMBRAL_DESTINOS_KM && proxima.id) {
      consultarDestinos(proxima.id);
    }
    const entradaDestinos = proxima.id ? destinosPorJunction[proxima.id] : null;
    proxima.destinos = (entradaDestinos && !entradaDestinos.cargando) ? entradaDestinos.destinos : null;

    return { activo: true, proxima, siguiente, estado: 'ok' };
  }

  function reset() {
    cache = null;
    destinosPorJunction = {};
    enMovimiento = false;
    tsUltimoCruceVelocidad = 0;
    ultimaVelocidadSobreUmbral = false;
    ultimoRoadRefConocido = null;
    tsUltimoRoadRefConocido = 0;
    ultimoDescartadosSentido = 0;
    if (typeof debug !== 'undefined') {
      debug.log('MotorwayExit: reset');
    }
  }

  return {
    actualizar,
    reset,
    // Expuestos para tests
    _parsearJunctions: parsearJunctions,
    _construirQuery: construirQuery,
  };
})();

// Compat Node para tests locales
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.MotorwayExitModule;
  }
})();
