# Decisiones del panel de viaje

Lo que Claude decide mientras Laureano no está, para que lo revise. Cada entrada dice **qué** se
decidió, **por qué** y **cómo se deshace**. Las marcadas con ❓ necesitan tu respuesta.

## Para leer primero (resumen de la noche)

- **El panel publicado está sano** y es la misma versión que el repo. Sin errores de programa en el simulador.
- **Método nuevo, copiado de `temario-eir`** (D2): CLAUDE.md corto, specs, este fichero y un relevo. El tablero Kanvas y el seguimiento en Word quedan archivados, sin borrar.
- **Tu visión escrita** en [`vision.md`](vision.md): tus seis deseos, dónde está cada uno hoy y en qué orden propongo ir.
- **Spec del cuaderno de viaje** en borrador, con **tres preguntas** para ti (D6).
- **Dos fallos reales** encontrados midiendo: un servidor de Overpass muerto frena todo el panel (D7) y, sin cobertura, el panel afirma datos viejos como actuales (D8).
- **No he tocado el código de la app ni he subido nada a GitHub.** Todo está en tu ordenador, en commits locales (D10).
- **Seis preguntas para ti** en D12.

## Noche del 30/09 al 01/10/2026

### D0 · El encargo (Laureano, 30/09, antes de irse a dormir)
- "¿Cómo retomamos este proyecto? ¿le damos un impulso? analízalo y trabaja toda la noche iterando lo que necesites, documenta las decisiones."
- Durante la noche añadiste dos cosas: **qué quieres que sea la app** (un cuaderno de viaje, ver `vision.md`) y que **copie la forma de trabajar de `temario-eir`**.

### D1 · No he tocado el código de la app
- **Qué**: esta noche solo hay medición, documentos, specs y tests. Ni una línea de `index.html`, `js/` ni `service-worker.js`.
- **Por qué**: todo lo que encontré, o es algo nuevo (el cuaderno), que según tus reglas se escribe antes de construirse, o es un arreglo que tiene una decisión de diseño tuya dentro (D8). El de Overpass (D7) sí es un arreglo puro, pero cambiar cómo el panel habla con los servidores sin poder probarlo después contra ellos (D7) era hacerlo a ciegas.
- **Cómo se deshace**: no hay nada que deshacer.

### D2 · Método de trabajo copiado de `temario-eir`
- **Qué**:
  - `CLAUDE.md` reescrito: qué es el proyecto, mapa de ficheros y **diez reglas propias**, cada una sacada de algo que pasó de verdad (los problemas y decisiones del seguimiento). Se fueron las secciones de Kanvas, del seguimiento en Word y los principios generales que ya están en tu CLAUDE.md global.
  - Nuevos: `specs/000-rumbo/` (visión, este fichero y el relevo), `specs/001-cuaderno-de-viaje/`, `MANTENIMIENTO.md` y `tests/invariantes.test.mjs`.
  - **Archivados sin borrar**: `tablero.canvas`, `canvas-tool.py`, `RULES.md`, las skills de Obsidian y `docs/seguimiento.json` (con su `.docx`). El seguimiento sigue siendo la memoria de las sesiones 1-49 y se consulta; ya no se actualiza. Por eso **esta sesión no está en él**: está aquí.
- **Por qué**: lo pediste, y además el método viejo tenía piezas que ya no se ganaban el sitio: un tablero que había que mover a mano con una herramienta que rompía las tildes, y un `.docx` regenerado en cada sesión que nadie leía.
- **Cómo se deshace**: el CLAUDE.md antiguo está en el historial de git; volver a él es un comando. ❓ ¿Borramos los ficheros archivados o los dejamos? (D12).

### D3 · Las 15 tarjetas en revisión del tablero
- **Qué**: no las he pasado a ningún sitio. Tres se ven a simple vista (IU-36 pueblos a todo el ancho, DT-19 cabecera sin desenfoque, DT-22 el "RADIO 15 KM" de V3/V4). Las otras doce son internas (datos, batería, procesador), pasaron sus pruebas en la sesión 49 y esta noche no he visto ninguna regresión.
- **Por qué**: con el método nuevo no hay tarjetas que mover; lo que falta es tu visto bueno. Mi recomendación es darlas por buenas tras la prueba en carretera, con evidencia real.
- Tres tarjetas moradas que propuse al principio de la noche (antes de que me pidieras el método nuevo) las he **retirado**: su contenido está en D7, D8 y en el relevo.

### D4 · Servidor de pruebas local en el puerto 8767
- **Qué**: `.claude/launch.json` pasa del 8766 al 8767.
- **Por qué**: el 8766 lo usa el servidor web de `temario-eir`, y chocaban.
- **Cómo se deshace**: una cifra en ese fichero. No afecta al panel publicado.

### D5 · Tests para las reglas que pueden romperse sin avisar
- **Qué**: `node --test` comprueba que todo script está precargado (si no, el panel muere sin cobertura), que el arranque no depende de `debug.js`, y que nada se pide por `http://`. Cada comprobación va con un caso roto a propósito, para saber que de verdad detecta el fallo. 7 de 7 en verde.
- **Por qué**: tu regla global, "lo escrito envejece; lo que se ejecuta, no". El proyecto tenía 49 sesiones de reglas en prosa y ningún test.

### D6 · Spec del cuaderno de viaje (borrador)
- **Qué**: [`specs/001-cuaderno-de-viaje/spec.md`](../001-cuaderno-de-viaje/spec.md) y su `tasks.md`. Idea central: **lo que ves no está donde estás** (el castillo está a 3 km a la izquierda), así que marcar guarda "este momento" y qué era exactamente lo decides después, con calma.
- **Choque que te señalo**: las reglas antiguas decían que el panel no se toca conduciendo. La spec lo cambia, a la vista, a "un solo gesto sin mirar".
- ❓ **Tres preguntas** al final de la spec: cómo marcar, dónde revisar y qué es una marca. Las tareas están escritas con mis recomendaciones; si contestas otra cosa, se reescriben antes de empezar.

### D7 · Overpass: un servidor muerto frena todo el panel
- **Qué encontré**: de los tres servidores de Overpass que usa el panel, **dos son el mismo** con dos nombres (misma IP), y ese servidor no contesta. Cuando uno no contesta, el panel espera 8 s y pasa al siguiente, pero **no lo recuerda**: en la siguiente consulta vuelve a esperarle (solo aparta a un servidor cuando responde con error, no cuando se calla). Encima, las consultas van de dos en dos, y la de la vía (la más ligera y la más importante) espera detrás de las de gasolineras y pueblos.
- **Medido** en la ruta M-505 del simulador: la consulta de la vía pasó **23 s en la fila** antes de salir, y el panel estuvo **más de un minuto con "Sin vía identificada"**. En la ruta A-6: 5 de 16 consultas fallaron del todo, y hubo 17 esperas de 8 s en vano.
- **Error mío que te cuento**: medí con demasiada insistencia (simulador y un medidor a la vez), y a mitad de la noche el servidor principal, `overpass-api.de`, **dejó de aceptar conexiones desde tu casa** (el resto de internet iba bien). Es un bloqueo temporal por exceso de peticiones; lo paré en cuanto lo vi. Consecuencias: no he podido medir su fiabilidad real, y si mañana abres el panel en casa con el wifi puede que la vía y los pueblos no salgan un rato. **En el coche, con los datos del móvil, no afecta** (es otra IP). Lo que sí queda probado, porque ocurrió antes del bloqueo: el servidor duplicado está muerto y el panel gestiona mal a un servidor que no contesta.
- **Arreglo que propongo** (pequeño, de los de ir directo): (1) apartar también al servidor que no contesta; (2) quitar el nombre duplicado; (3) que la consulta de la vía pase delante. Un cuarto servidor (`maps.mail.ru`) contesta, pero tarda ~14 s: no sirve con el límite de 8 s, así que no lo añadiría.
- **Cómo se deshace**: son cambios en un solo módulo; se revierten con git.

### D8 · Sin cobertura, el panel afirma datos viejos
- **Qué encontré**: cortando la red a mitad de la ruta A-6 → M-505, el GPS sigue (no necesita internet) pero el panel mantiene municipio y vía del último sitio con cobertura. A 9 km, ya en Galapagar por la M-505, seguía diciendo **"Las Rozas de Madrid · A-6 Autovía del Noroeste"**. Hay aviso para GPS viejo y para meteo en error, pero no para ubicación ni vía.
- ❓ **Cómo quieres ver un dato viejo**: atenuado en gris (*mi recomendación*: discreto y no descoloca el diseño), oculto con "—" (más honesto, pero el panel se vacía en cada túnel) o con una marquita "sin cobertura". Y desde cuántos km se considera viejo (propongo 2 km: ~70 s a 100 km/h).

### D9 · Otras cosas que he visto (sin tocar)
- **Pueblos cercanos que no son pueblos**: cuando Overpass falla, la vista 4 se rellena desde Wikipedia y salen cosas como "Instituto Nacional de Toxicología" o "Batalla de Majadahonda". Es el mismo problema que las tarjetas BPC-16/18 ya atacaron; se agrava porque Overpass falla más de lo que debería (D7). Arreglando D7 debería bajar mucho.
- **Nombre de vía feo**: "Carretera de LE-142 por El Ganso a LE-142 (Rabanal del Camino)". Viene así de OpenStreetMap; se podría acortar cuando repite el código.
- **El `README.md` está desfasado** (dice que hay tres vistas y describe Kanvas). No lo he tocado; lo pondría al día junto con el cuaderno.
- **El simulador se descarga también en el panel de verdad** (~7,5 KB). Poca cosa.

### D10 · Nada subido a GitHub
- **Qué**: los cambios de esta noche están en commits en tu ordenador, sin `push`.
- **Por qué**: publicar es de las cosas que te pregunto antes. Además no cambia nada del panel: solo documentos, tests y la configuración del servidor local.
- **Cómo se hace**: dime "sube" y lo subo.

### D11 · Dos carpetas de trabajo viejas
- `.claude/worktrees/ecstatic-dirac` y `frosty-pare`, de las sesiones 12 y 13. Todo su contenido ya está en `main`. Se pueden borrar sin perder nada; no lo he hecho porque borrar es cosa tuya.

### D12 · ❓ Preguntas para ti
1. **Cuaderno**: las tres preguntas del final de la [spec](../001-cuaderno-de-viaje/spec.md).
2. **Datos viejos (D8)**: ¿atenuado, oculto o con marca? ¿2 km te parece bien?
3. **Overpass (D7)**: ¿lo arreglo directamente? Es un arreglo, pero te lo pregunto porque es lo primero que haríamos.
4. **Meteo chillout**: dos o tres vídeos o imágenes que para ti sean "chillout", para escribir su spec sin adivinar tu gusto.
5. **Archivo**: ¿borramos el tablero Kanvas, su herramienta, las skills de Obsidian y el generador del Word, o se quedan como archivo? (Mi recomendación: borrarlos; están en el historial de git si algún día hacen falta.)
6. **Subir** a GitHub lo de esta noche (D10) y **borrar las carpetas viejas** (D11).

**Respuestas del 18/10/2026**: (1) marcar con toque largo en cualquier sitio; la marca es "este
momento"; dónde revisar, sin contestar todavía. (2) Atenuado en gris, desde 2 km. (3) Sí, arreglar
Overpass directamente. Siguen abiertas la 4, la 5 y la 6.

## 18/10/2026

### D13 · Arreglo de Overpass (D7), hecho
- **Qué**: (1) un servidor que no contesta en 8 s queda apartado 60 s, igual que uno que dice
  "saturado"; (2) fuera `overpass.kumi.systems`, que era el mismo servidor que
  `overpass.private.coffee`; (3) la consulta de la vía se cuela en la fila. `SW_VERSION` pasa a
  `v15-2026-10-18-overpass`.
- **Comprobado**: `tests/overpass.test.mjs` reproduce lo de la M-505 con servidores falsos. Antes
  del arreglo, la vía tardaba 16,1 s; ahora, menos de 10. En el simulador, el panel aparta a
  `overpass-api.de` cuando se calla.
- **Sin comprobar**: la vía en menos de 10 s con los servidores de verdad. Desde casa no había
  ninguno que funcionara: `overpass-api.de` se queda colgado o rechaza la conexión (puede que
  siga el bloqueo de D7) y `private.coffee` falla una de cada dos veces. Se verá en la prueba en
  carretera, con los datos del móvil.
- **Cómo se deshace**: un commit que solo toca `js/overpass.js`, `service-worker.js` y el test.

### D14 · Datos viejos atenuados (D8), hecho
- **Qué**: el pueblo (con comunidad, provincia y comarca, también en la vista 4) y la vía se pintan
  en gris y apagados cuando el coche está a más de 2 km de donde Nominatim los confirmó por última
  vez. En cuanto vuelve a contestar, recuperan su color. Una respuesta de la caché no cuenta como
  confirmación. `SW_VERSION` pasa a `v16-2026-10-18-datos-viejos`.
- **Comprobado**: `tests/frescura.test.mjs` (el caso Las Rozas → Galapagar y el umbral de 2 km). En
  el simulador (ruta `cruce-a6-m505`, red cortada a mano): a ~8 km de Torrelodones, pueblo y vía
  atenuados; al devolver la red, en su color al segundo.
- **Lo que no he atenuado**, por si lo quieres: el límite de velocidad (va con la vía, y sin red se
  queda el de la última vía conocida) y la próxima salida.
- **En el simulador** puede verse gris un segundo aun con red, porque sus puntos están a kilómetros
  unos de otros. En carretera no debería: el panel pregunta cada 50 m.
- **Cómo se deshace**: un commit; quitar la clase `dato-viejo` de `css/style.css` lo desactiva.

### D15 · Encontrado: el service worker puede guardar ficheros viejos al actualizarse
- **Qué**: al probar D14, la versión nueva del service worker se instaló con los ficheros
  **anteriores** que el navegador tenía en su caché normal. Pasa porque la precarga no le pide al
  navegador que los baje de nuevo. En GitHub Pages esa caché dura 10 minutos: si el móvil abrió el
  panel en los 10 minutos antes de una publicación, puede quedarse con ficheros viejos bajo la
  versión nueva hasta la siguiente.
- **Arreglado el 18/10** (lo pediste): la precarga pide cada fichero de nuevo al servidor
  (`cache: 'reload'`). Lo vigila un test de `tests/invariantes.test.mjs`. Comprobado en el
  navegador: con el panel cargado, se cambia un fichero y la versión, y la versión nueva guarda el
  fichero nuevo. `SW_VERSION` pasa a `v17-2026-10-18-precarga-fresca`.

### D16 · Cuaderno H1: decisiones menores tomadas al construirlo
- **Base de datos propia** (`panel-viaje-cuaderno`), separada de logs y cachés. Ningún otro módulo
  la nombra, y lo vigila un test.
- **El toque largo salta al segundo, sin soltar.** Se cancela si el dedo se mueve más de 10 px,
  si entra un segundo dedo o si el navegador empieza a desplazar la vista. Los botones (pantalla
  completa, copiar del debug) no marcan. En el panel y la cabecera ya no se puede seleccionar
  texto, y Chrome no saca su menú al mantener el dedo.
- **Confirmación**: "◆ MARCADO" en verde, en el centro de la cabecera, 2 s, sin animación. Un
  doble toque en menos de 10 s también enseña "MARCADO", pero guarda una sola marca. Si no se pudo
  guardar: "✕ SIN GUARDAR" en ámbar, para que nunca parezca guardada una marca que no lo está.
- **Sin GPS todavía** (recién arrancado), la marca se guarda igual: la hora, sin posición y como
  "aproximada". Con la última posición de hace más de 30 s (túnel), también "aproximada". Por
  debajo de 3 km/h, el sentido de la marcha queda como desconocido.
- **Sin vibración** (lo dice la spec). Si en el coche no notas la confirmación de reojo, es lo
  primero que cambiaría.
- **Aún no hay forma de ver las marcas** en el panel: eso es H3. En la prueba en carretera se ven
  en el log del viaje (`?logs=1`), con hora y posición.

## 18/10/2026, tarde: todo lo que quedaba, en tu ausencia

### D17 · El encargo y cómo lo he llevado
- **El encargo** (tú, antes de salir a la prueba en carretera): "ponte a construir todo lo que
  queda… toma por mí todas las decisiones que hagan falta y termina el trabajo… revísalo después
  para encontrar bugs… quiero las H2 y H3 pero también… radar con relieve y meteo chillout. Las
  mejoras pequeñas apúntalas como pendientes. Al acabar actualiza toda la documentación".
- **Hecho**: cuaderno H2 y H3, radar con relieve (spec 002), meteo chillout (spec 003), revisión
  con tres revisores independientes más la mía (D22), pendientes en `PENDIENTES.md` y documentación.
- **No subido a GitHub** (D23): estabas probando la versión publicada en el coche y publicar es de
  las cosas que, según tus reglas, se preguntan.
- **Las specs 002 y 003 se escribieron después de construir**, al revés de lo normal, porque me
  pediste no esperarte. Lo que decidí yo va marcado como "(decidido)".

### D18 · H2: qué guarda una marca
- **Qué**: además de la hora y la posición, el municipio con su provincia y comunidad, la vía, los
  pueblos cercanos (hasta 8) y los puntos de interés (hasta 12) con su distancia y su rumbo
  **medidos desde la marca**, y el tiempo (descripción, temperatura, viento). Si el pueblo o la vía
  estaban atenuados por viejos (D14), la marca lo apunta.
- **Sin datos al marcar** (sin cobertura, recién arrancado): se guarda lo que hubiera y la marca
  queda "pendiente de completar". **Se completa al abrir el cuaderno con internet**, no en el
  coche: así no gasta datos del móvil y no compite con el panel. Las marcas de la primera versión
  (sin nada de esto) se completan igual.
- **Lo que el panel vio manda**: al completar no se pisa la vía ni los pueblos que se vieron al
  marcar, salvo que estuvieran atenuados. Una consulta que falla no borra nada (regla 4).
- **Cómo se deshace**: el contexto es un campo aparte de la marca; quitarlo no toca lo demás.

### D19 · H3: dónde y cómo se revisa
- **Pregunta 2 de la spec, decidida: (c) las dos.** El cuaderno se abre en el propio móvil del
  panel (`?cuaderno=1`, o manteniendo pulsado el icono de la app → "Cuaderno de viaje", o desde
  `?logs=1`). Desde ahí, **"Compartir"** manda la lista (con enlaces a Google Maps) a WhatsApp, al
  correo o a donde quieras, y **la copia de seguridad** se descarga como archivo.
- **Nunca en marcha**: el panel no tiene ningún botón que lleve al cuaderno (criterio 3 de H3).
- **Mapa de cada marca**: con el relieve, **orientado hacia donde ibas** (lo de delante, arriba) y
  con un cono suave de "delante". Los candidatos dicen a qué lado quedaban (delante, a la derecha,
  detrás, a la izquierda): a 120 km/h, entre verlo y marcar pasan 100 m.
- **Candidatos**: los pueblos y puntos de interés que el panel conocía, más los **sitios de
  Wikipedia** a menos de 10 km (ríos, embalses, sierras, monumentos…), que se bajan al abrir la marca.
- **Borrar**: una a una y con confirmación. **Importar** una copia solo añade marcas que no
  existen; nunca pisa ni borra.
- **Viajes**: más de 4 horas sin marcar es otro viaje.

### D20 · Radar con relieve (spec 002)
- **Qué y por qué**: en `specs/002-radar-relieve/spec.md`. Lo principal: gira con la marcha,
  anillos cada 5 km, barrido de 8 s, pueblos en su sitio real, marcas del cuaderno como rombos,
  relieve con curvas de nivel y altitud del terreno.
- **Datos**: el relieve solo se pide con la vista 4 en pantalla y se guarda para siempre (tope de
  300 teselas, ~40 MB, se borran las menos usadas).
- **Rumbo calculado**: el GPS de muchos Android viejos no da rumbo; el panel lo calcula entre dos
  posiciones separadas al menos 25 m. Lo usan el radar y las marcas.
- **Se quitó** el mapa anterior de la vista 4 (chinchetas repartidas en ángulo a ojo).
- **Cómo se deshace**: el commit "radar con relieve" se puede revertir solo.

### D21 · Meteo chillout (spec 003), sin tus referencias
- **Qué y por qué**: en `specs/003-meteo-chillout/spec.md`. Un paisaje lo-fi por capas en lugar
  de los efectos sueltos de antes.
- **Sin rayos en la tormenta**: un resplandor suave dentro de las nubes. Regla 3.
- **Se retiraron** los rayos SVG, la niebla con filtro SVG (`?fogfallback=1` ya no existe), el sol
  de esquina con sus rayos de luz, las nubes de dibujo y las estrellas sueltas.
- **De paso, dos fallos viejos de la vista 2**: la palabra grande se cortaba ("DESPEJAD") y la
  previsión se salía por abajo por una regla de estilo que descolocaba el bloque de texto.
- **Si el móvil no llega a 24 fps**, el paisaje se queda quieto; se recuerda tras dos medidas malas.
- **Cómo se deshace**: el commit "meteo chillout" se puede revertir solo (vuelven los efectos
  anteriores).
- **Respuesta (18/10, noche)**: "El paisaje es mi idea de chillout, sí".

### D22 · Revisión a fondo: lo que se encontró y se arregló
- **Cómo**: tres revisores independientes, uno por bloque (cuaderno, radar, paisaje), con el
  encargo de buscar fallos concretos y demostrarlos; después comprobé cada hallazgo yo antes de
  tocar nada. Varios se confirmaron con scripts y midiendo en el navegador a 640×360.
- **Cuaderno** (13 hallazgos, todos arreglados):
  - Sin cobertura, la marca se quedaba con los pueblos de donde hubo red (a 20 km) y al completarla
    no se corregían. Ahora se apuntan como viejos y se sustituyen.
  - Si fallaba el guardado (móvil lleno, conexión cerrada por Chrome), la marca se perdía. Ahora:
    escritura duradera, reapertura de la conexión, un reintento y, si nada funciona, un respaldo que
    pasa la marca al cuaderno en cuanto se puede. Hay un test que lo simula.
  - Si el reloj del móvil retrocedía, todas las marcas se daban por repetidas durante una hora.
  - La nota podía perder lo último tecleado al salir o al repintarse la pantalla.
  - Una copia de seguridad con datos raros rompía el cuaderno: ahora se sanea campo a campo.
  - Parado, la marca podía guardar el sentido de la marcha del último tramo.
  - "◆ MARCADO" hacía saltar la cabecera una línea: ahora es una píldora encima del contenido.
  - En la vista 3, mantener el dedo sobre una foto la arrastraba y no marcaba.
  - Menores: candidatos con el mismo nombre en sitios distintos se fundían; Wikipedia con error se
    guardaba como "sin sitios"; el filtro quitaba sitios buenos ("Hospital de Órbigo" es un pueblo);
    el mapa se encogía por un candidato lejano.
- **Paisaje** (15 hallazgos, todos arreglados):
  - Sin cobertura usaba un horario de sol inventado: en junio pintaba de noche a las 20:30. Ahora la
    salida y la puesta del sol se calculan con la fecha y la posición, sin internet (con test).
  - Costuras al dar la vuelta las capas (sobre todo la niebla, que aparecía o desaparecía de golpe).
  - La línea del viento caía sobre el horizonte, la franja más clara: contraste 1,6:1 de día y
    casi nulo al atardecer. Ahora lleva velo, sombra y un gris más claro.
  - Al ponerse el sol, el astro y su resplandor saltaban de lado; la luz cambiaba a saltos en el
    crepúsculo.
  - Las nubes iban en sentido contrario a la lluvia.
  - El resplandor de tormenta hacía un doble pulso que de noche podía verse como destello: ahora es
    un solo pulso lento, más tenue de noche.
  - El vigilante de fluidez podía dejar el paisaje quieto por un atasco ajeno (Overpass): ahora mide
    la mediana de los fotogramas.
  - Menores: casas con luz a mediodía; cambios de viento que tardaban una hora en verse; montañas
    que seguían moviéndose a 2 km/h; `?meteo=` llegaba a las marcas como si fuera real; el modo
    ligero no paraba todo; la luna nueva se veía con manchas; horas de previsión cortadas.
- **Radar** (12 hallazgos, todos arreglados):
  - Los ecos se desincronizaban del barrido a los pocos minutos. Medido después: menos de 20 ms de
    desfase, también tras recorrer kilómetros.
  - El relieve gastaba 2-3 veces los datos que yo había puesto en la spec: componía un cuadrado de
    19 km. Ahora solo el círculo que se ve, con 1,5 km de margen: casi siempre 4 teselas, nunca
    más de 6. Aun así son 0,8-1,2 MB por hora con la vista 4 siempre abierta, y no "menos de 0,5"
    como escribí el 30/09: lo he corregido en la spec y te dejo la alternativa (pregunta 4).
  - En giros grandes, los ecos iban en recta mientras el relieve giraba en arco: ahora los giros de
    más de 30° se aplican de golpe.
  - El rumbo calculado metía ruido (el disco se balanceaba en recta) y, parado con mala señal,
    podía girar en un semáforo: ahora hace falta buena precisión y no se gira por menos de 4°.
  - Las etiquetas saltaban de lado a cada tick y se pisaban con la "N" y los rótulos de los
    anillos. Al comprobarlo vi otra cosa: con los pueblos apiñados a 2-3 km solo salía un nombre
    de cinco. Ahora cada etiqueta prueba seis sitios (a los lados, encima y debajo de su punto) y
    se queda en el que tenía mientras quepa: en la misma prueba, salen cuatro de cinco.
  - Una raya oscura en la junta de cada tesela; una tesela guardada corrupta dejaba un agujero
    para siempre; donde faltaba relieve parecía una llanura (ahora se ve un rayado tenue).
  - Menores: el primer giro daba la vuelta larga; dos pueblos con el mismo nombre salían como uno;
    con conexión lenta fallaban todas las descargas a la vez; en vertical se escondían etiquetas
    que cabían.

### D23 · Sin subir a GitHub
- **Qué**: todo lo de esta tarde está en commits en tu ordenador, con `SW_VERSION`
  `v19-2026-10-18-cuaderno-radar-paisaje`, sin `push`.
- **Por qué**: (1) estabas probando la v18 en el coche: si publicaba a mitad de viaje, el panel
  podía cambiar al recargarlo y la prueba dejaba de valer; (2) publicar es de las decisiones que,
  según tus reglas, se preguntan aunque el resto lo decida yo.
- **Hecho**: el mismo 18/10, al volver, dijiste "sube la v19" y se publicó (comprobado: la web
  sirve `v19-2026-10-18-cuaderno-radar-paisaje`).

## 18/10/2026, noche

### D24 · Las actualizaciones entran solas, nunca en marcha
- **Por qué**: publicada la v19, no se veía en tu móvil. Android reanuda la app sin recargarla (y
  así ni mira si hay versión nueva), y al arrancar de cero enseña la guardada mientras baja la
  nueva: hacía falta cerrarla del todo dos veces. Me pediste que entraran solas "sin recargar
  nunca en marcha".
- **Qué**: la app mira si hay versión nueva al abrirla y al volver a ella (como mucho cada 15 min,
  una petición pequeña). Cuando la tiene, se recarga sola **solo con el coche parado**: en el
  primer minuto tras abrirla, o tras **3 minutos parado** (más que un semáforo largo, para no
  recargar en una espera del viaje ni partir el log del trayecto). Nunca en marcha, ni sin un dato
  de GPS de los últimos 10 s (túnel). Sin GPS en toda la sesión (en casa), enseguida. Nunca dos
  recargas en menos de un minuto.
- **Comprobado**: tests de la regla (7) y en el navegador: con el simulador a 100 km/h llegó una
  versión nueva y no recargó; sin GPS, recargó sola en la versión nueva.
- **Ojo**: tu móvil, que tiene la v18 o la v19, necesita **esta última vez** los pasos a mano
  (cerrar desde recientes, abrir, esperar, volver a abrir). A partir de la v20, solas.
- **Cómo se deshace**: el commit "actualizaciones solas"; quitar `js/actualizacion.js` vuelve al
  registro de siempre.

### D25 · Sin ubicación, el panel explica qué falla y dónde se arregla
- **Por qué**: en tu móvil del trabajo el panel se quedaba vacío con un "Error de GPS: Permiso
  denegado" en letra pequeña. No era un problema de HTTPS (DuckDNS no lo arreglaría: el HTTPS de
  GitHub Pages es válido en cualquier móvil), sino de permisos del teléfono.
- **Qué**: sin permiso, una tarjeta con los cinco sitios donde se arregla, por orden: ubicación del
  móvil, permiso de Chrome, permiso de esta web, abrirla en Chrome si venía de otra app, y móvil de
  empresa (`chrome://policy`). Si la web está dentro del navegador de otra app, lo dice primero.
  Sin señal desde el principio, otra tarjeta. Un corte con el GPS ya funcionando (túnel) o un GPS
  que tarda: solo el aviso de la cabecera. **En cuanto se da el permiso, el panel arranca solo** (al
  volver de los ajustes), sin recargar. "Seguir sin ubicación" la cierra hasta "Volver a intentarlo".
- **Comprobado**: tests (6) y en el navegador integrado, que tiene la ubicación denegada: sale la
  tarjeta entera a 640×360, se cierra, reaparece al reintentar; con GPS (simulador) no sale.
- **Sin comprobar**: que arranque solo al dar el permiso (el navegador de pruebas no deja cambiarlo).
- **Cómo se deshace**: el commit "ayuda de ubicación"; quitar `js/ayuda_gps.js` vuelve al aviso pequeño.

## 18/10/2026, última sesión: las mejoras pequeñas

### D26 · El encargo
- "Vamos con todas las mejoras pequeñas. Además si consideras que es necesario revisar y reorganizar
  el código hazlo. Apunta como pendiente estas dos funcionalidades que son chulísimas": la **nota de
  voz al marcar** y **el horizonte de verdad en el paisaje**. Apuntadas en `PENDIENTES.md`, con lo
  que habrá que resolver en su spec (el permiso del micrófono no puede pedirse conduciendo; el
  horizonte solo "no gasta datos" si el radar ya bajó ese relieve).
- "Las mejoras pequeñas" eran las que te propuse: exportar a Google Maps, «Aquí marcaste», radar con
  zoom según la velocidad, modo noche, las vistas 1 y 3 con el estilo nuevo (con maquetas antes de
  código) y las seis de `PENDIENTES.md`.

### D27 · Los seis pendientes, hechos
- **N.º 5, provincia repetida**: miré qué devuelve Nominatim (Astorga, Toledo, Gerona, Galapagar y
  La Coruña): la provincia viene ahora en `state_district`, y el panel leía `province`, que ya no
  viene. Por eso en **todas** las comunidades con varias provincias salía la comunidad dos veces
  (no solo en Astorga). Ahora la cabecera dice "Castilla y León · León · Astorga". `county` no
  sirve: en Cataluña y Galicia es la comarca.
- **N.º 3, nombres de vía repetidos**: si el nombre repite el código de la pastilla, no se enseña
  ("LE-142" a secas); si lo lleva entre paréntesis al final, se quita ("Autovía del Noroeste").
- **N.º 4, datos del pueblo anterior**: la población y la altitud solo se enseñan si son del
  municipio en el que estás; al cambiar de pueblo se borran hasta que llegan las nuevas.
- **N.º 1, el límite sin cobertura** (era decisión tuya): **atenuado con la vía** (cuando la vía
  lleva 2 km sin confirmar) y, mientras tanto, **sin aviso de exceso**: un aviso rojo calculado con
  el límite de la carretera de la que venías distrae más de lo que ayuda. Si prefieres que el
  límite desaparezca, o que el aviso siga, es una línea.
- **N.º 2, pueblos que no son pueblos**: el log de la prueba en carretera está en tu móvil, así que
  no pude mirarlo antes, como decía la nota. Lo hice igual porque el arreglo solo toca el plan B
  (cuando Overpass no contesta) y está probado con respuestas reales: Wikipedia ahora trae, en la
  misma petición, la **descripción corta** de cada artículo ("municipio de la provincia de León",
  "localidad del municipio de Astorga", "cofradía católica", "asedio de 1810"...), y solo pasan los
  que son núcleos de población. Muestreado en nueve zonas de España (Galicia, Asturias, País Vasco,
  Cataluña, Valencia, Andalucía, Canarias, Madrid, León). Lo mismo para los puntos de interés de
  Wikipedia: ni pueblos vecinos ("Pedredo" como monumento de Murias) ni asedios. Los artículos sin
  descripción solo pasan si el título lo deja claro. Y **lo que sale de Wikipedia ya no se guarda
  14 días** (era un plan B: esa zona no volvía a preguntar a Overpass en dos semanas): solo en
  memoria y por 10 minutos; en el cuaderno, queda como provisional y "Completar con internet" lo
  cambia por lo de Overpass cuando conteste. Las listas guardadas con el filtro viejo se olvidan
  (se volverán a pedir: unos pocos KB por zona).
- **N.º 6, la próxima salida sin rumbo**: con el móvil viejo (que no da rumbo) la próxima salida
  **no filtraba por sentido** y podía enseñar la que acababas de dejar atrás. Ahora usa el rumbo
  calculado, **solo si es de los últimos 5 segundos** (uno más viejo, en una curva, descartaba la
  salida que venía); y **sin rumbo, sin cartel**: mejor ninguno que uno equivocado.
- **N.º 7, el simulador en el panel de verdad**: **no lo hago**. Se baja una vez por versión
  (~7,5 KB) y no hace nada si no hay `?sim=`; cargarlo aparte complicaría el arranque para nada.
- **Cómo se deshace**: el commit "pendientes 1-6 y reorganización".

### D28 · Reorganización del código: la justa
- **Qué**: `main.js` pasó de 1.674 a ~1.300 líneas. Salieron a ficheros propios, con tests: la
  vista `?logs=1` (`logs_vista.js`), la velocidad y el rumbo de cada posición (`movimiento.js`: un
  solo rumbo para todo el panel) y los textos de cada vista (`formato.js`). Las tres copias del
  reparto de puntos de interés entre las vistas 1 y 3 son ahora una (antes tenían que casar a mano).
  Fuera ~25 líneas de estilo de vistas que ya no existen.
- **Lo que no**: sacar las ~1.800 líneas de estilo de `index.html` a ficheros aparte. No cambia nada
  que se note y habría hecho ilegible la revisión de lo demás.
- **De paso**: en el tick del GPS, el radar, el paisaje, el modo noche, las actualizaciones y
  «Aquí marcaste» van protegidos: **un fallo en uno de ellos ya no deja el panel sin pueblo, vía
  ni tiempo** (antes, cualquier error ahí cortaba el resto del tick). Lo vigila un test.

### D29 · Modo noche
- **Qué**: desde la puesta del sol, el brillo de las letras, los verdes, el relieve del radar y las
  fotos baja poco a poco hasta el **70 %** en 40 minutos (lo que dura el crepúsculo), en escalones
  de un 1 % que no se notan; vuelve a subir los 40 minutos antes del amanecer. La hora de la puesta
  se calcula en el móvil con la posición (sin internet). El ámbar baja la mitad (avisa) y **el rojo
  del exceso no baja**. El paisaje de la vista 2 ya tenía su noche.
- **Por qué el 70 %**: lo bastante para no deslumbrar en la cabina a oscuras sin perder contraste.
  Si te parece poco o mucho, es un número.
- **Ajustes de la revisión**: el relieve del radar baja con opacidad, no con un filtro (un filtro
  obligaba a redibujar el disco entero en cada fotograma del barrido); cualquier cambio de brillo
  va de punto en punto cada segundo (al encender se calcula con el sol de Madrid y, al llegar el
  GPS, en Vigo o Girona al anochecer podía saltar 20 puntos de golpe); la previsión por horas de
  la vista 2 no baja (ya es un verde tenue: de noche no se leía).
- **Para verlo**: `?hora=23:00` (también pinta el paisaje a esa hora).
- **Cómo se deshace**: quitar `js/modo_noche.js` (los colores vuelven a los de siempre).

### D30 · Radar con escala según la velocidad: 6 o 15 km, no 25
- **Qué**: 15 km de radio en carretera; **6 km en ciudad**, cuando la media del último minuto en
  marcha baja de 40 km/h; vuelve a 15 km cuando la de los últimos 20 s pasa de 55. Con medias, un
  salto del GPS entre edificios no lo deshace, y **el tiempo parado no cuenta** (en una gasolinera
  o un atasco no se acerca: bajaría teselas para nada). El cambio se ve como un zum de un segundo;
  los anillos pasan a decir 2 · 4 · 6 km.
- **Sin cobertura en ciudad**, si faltan las teselas de detalle, el radar usa las de carretera
  ampliadas (más borroso) en vez de un disco rayado, y reintenta el detalle pasado un rato.
- **Por qué no 25 km en autovía** (como te propuse): los pueblos se buscan a 15 km; a 25, la mitad
  exterior del radar saldría vacía. Buscar más lejos gasta datos.
- **Datos**: en ciudad el relieve va con un nivel más de detalle (a 6 km, el de carretera se veía
  borroso) y aun así pide las mismas teselas que el de 15 km: casi siempre 4, nunca más de 6
  (comprobado en toda España con un test). Cambiar de escala sí baja las teselas de la otra escala
  la primera vez en cada zona.
- **Cómo se deshace**: el commit "modo noche y radar con escala".

### D31 · «Aquí marcaste»
- **Qué**: al volver a pasar a menos de 150 m de una marca de hace más de media hora, la píldora
  de debajo de la cabecera dice, 8 segundos y en ámbar, "◆ Aquí marcaste · 12 sep · Castillo de
  Turienzo" (lo elegido al revisarla, o el principio de la nota). Sin animación.
- **Decidido**: cada marca se recuerda **como mucho una vez al mes** (en un trayecto de todos los
  días sería un aviso diario), y **solo si te habías ido** a más de 1 km: ni con la que acabas de
  hacer ni tras media hora parado donde marcaste; a la vuelta del mismo viaje, sí. Con varias
  marcas juntas, la más cercana y "y 2 más". Con el simulador no se apunta nada en el móvil (si no,
  en el viaje de verdad ya no saldrían).
- **Comprobado** en el simulador: al pasar por las marcas de la mañana salió "◆ Aquí marcaste · hoy 12:10".

### D32 · Exportar a Google Maps
- **Qué**: en el cuaderno, menú ⋯ → **"Llevar a Google Maps (KML)"**. Descarga un archivo que se
  abre en **Google My Maps** (Crear mapa → Importar) o en **Google Earth**: un punto por marca (en
  el sitio que elegiste al revisarla, o donde estabas), una carpeta por viaje, y la fecha, el
  pueblo, la vía y tu nota. Sin "qué era", el punto se llama con el pueblo y la hora.
- **No es la copia de seguridad**: no se puede volver a importar en el cuaderno, y las marcas sin
  posición no van (lo avisa).

### D33 · ❓ Vistas 1 y 3: maquetas para que elijas
- En [`specs/004-vistas-1-y-3/propuesta.md`](../004-vistas-1-y-3/propuesta.md): dos opciones para
  cada vista, con imágenes. **Sin código**: las vistas siguen como estaban hasta que elijas.
- Mi recomendación: vista 1 **B (paisaje con los pueblos como carteles en su dirección real)** y
  vista 3 **A (postales)**.
- **Respuesta (18/10, noche)**: vista 1, **como está**; vista 3, **A (postales)** (D36). Y el
  límite sin cobertura, **en gris y sin aviso**, como lo había dejado (D27, n.º 1).

### D34 · Revisión de lo de hoy: lo que se encontró y se arregló
- **Cómo**: tres revisiones por separado (radar y modo noche; la reorganización; cuaderno y
  fuentes de datos), con simulaciones y algunas peticiones reales a Wikipedia. Diecisiete hallazgos;
  todos arreglados salvo uno que ya estaba resuelto (la `SW_VERSION`). Los que importan:
  - **Lo de Wikipedia se guardaba 14 días** cuando Overpass fallaba (regla 4). Ahora no (D27, n.º 2).
  - **Sin cobertura, la escala de ciudad dejaba el radar rayado** y la altitud en "—" (D30).
  - **Un salto del GPS reiniciaba el minuto** de la escala de ciudad, y parado en una gasolinera
    acababa bajando teselas (D30).
  - **La próxima salida podía volver a la de atrás** con el rumbo caducado (D27, n.º 6).
  - **Artículos de Wikipedia sin descripción** se colaban como pueblos (la sede de la EMT, un
    polideportivo, cerca de la M-30) o como monumentos (pueblos vecinos sin describir); faltaban las
    "entidades colectivas" (Murcia), las comunas francesas y las freguesias portuguesas; y los POIs
    salían por antigüedad del artículo, no por cercanía.
  - **«Aquí marcaste»** podía saltar tras media hora parado donde marcaste, callarse la segunda de
    dos marcas juntas o quedar silenciado por un reloj adelantado (D31).
  - Un **carácter de control** en una nota invalidaba el KML entero; un **filtro** en el radar de
    noche costaba de más; el **brillo saltaba** al llegar el GPS (D29); y si la vista de logs no
    cargaba, `?logs=1` se quedaba en blanco (ahora lo dice).
- **Comprobado**: 165 tests en verde (14 nuevos de la revisión, que fallaban antes del arreglo) y en
  el navegador: escala de ciudad con las teselas de detalle bloqueadas (relieve de carretera, no
  rayado), modo noche, «Aquí marcaste», cuaderno y logs.

### D35 · Sin subir a GitHub
- **Qué**: todo esto está en commits en tu ordenador, con `SW_VERSION`
  `v22-2026-10-18-mejoras-pequenas`, sin `push`. Se publica cuando digas "sube".
- **Hecho**: el mismo 18/10 por la noche dijiste "sube" y se publicó (comprobado: la web sirve
  `v22-2026-10-18-mejoras-pequenas`).

### D36 · La vista 3 con postales
- **Qué**: la opción que elegiste (spec 004): los **tres sitios más cercanos**, con la foto grande y
  el nombre encima; debajo, el pueblo, la distancia y una **flecha hacia donde quedan** (arriba, de
  frente; abajo, detrás). La cuadrícula de seis se va: **3 fotos en vez de 6**, menos datos.
- **Decidido al construirla**:
  - "Más cercanos" por la posición de cada sitio, no por la de su pueblo (todos los de Astorga
    tenían la misma distancia).
  - Distancia y flecha se actualizan en cada tick; las postales no cambian de orden hasta que
    cambia la lista de pueblos (para que no bailen las fotos).
  - Parado, la flecha se queda con el último rumbo conocido; sin ninguno todavía, no sale.
  - El contador dice cuántos sitios hay en total ("4 EN 15 KM") y las gasolineras siguen abajo.
- **Comprobado**: tests (3 nuevos) y en el navegador con el simulador a 640×360.
- **Cómo se deshace**: el commit "vista 3 con postales".

### D37 · Sin subir a GitHub
- **Qué**: la v23 (`v23-2026-10-18-postales`) está en tu ordenador, sin `push`. Se publica cuando
  digas "sube".
- **Hecho**: el mismo 18/10 por la noche dijiste "adelante" y se publicó (comprobado: la web sirve
  `v23-2026-10-18-postales` desde las 19:26).
