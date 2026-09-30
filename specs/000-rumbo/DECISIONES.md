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
