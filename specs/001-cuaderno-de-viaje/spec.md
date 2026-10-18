# Especificación: Cuaderno de viaje

**Carpeta**: `specs/001-cuaderno-de-viaje/` · **Fecha**: 2026-09-30 · **Estado**: H1, H2 y H3 construidas (18/10); falta probarlas en el coche

**Lo que se pidió**: "quiero que sea mi cuaderno de viaje. La llevaré conectada en mi coche al lado
del gps y a medida que vayamos pasando por pueblos o sitios chulos quiero poder marcarlos y
guardarlos para luego investigarlos."

> Esta spec cubre **solo el cuaderno** (marcar y guardar). El resto de lo que pediste la misma
> noche (meteo más detallista, radar con relieve, diseño, carga rápida) está en
> [`specs/000-rumbo/vision.md`](../000-rumbo/vision.md). Cada cosa tendrá su propia spec: si
> abrimos todas a la vez, ninguna avanza.

## Lo que cambia respecto a hoy

Hasta ahora el panel **solo enseña** cosas. Con esto pasa a **guardar** cosas tuyas. Eso trae dos
novedades que no tenía:

1. **Hay que tocarlo conduciendo.** Las reglas antiguas decían "no debe tener que tocar el panel".
   Esta spec no las rompe a escondidas: las cambia de forma explícita a "**un solo gesto, sin
   mirar, sin menús ni confirmaciones**" (así queda ya en la regla 3 del `CLAUDE.md` nuevo). Si no
   te convence, lo decimos ahora.
2. **Los datos tuyos no se pueden perder.** Hoy, si se borra la caché, se vuelve a descargar. Una
   marca perdida no vuelve.

Una idea importante que guía todo el diseño: **lo que ves no está donde estás.** El castillo del
cerro está a 3 km a la izquierda; el pueblo bonito lo has dejado atrás hace 20 segundos. Por eso
marcar no guarda "el pueblo en el que estoy", sino **"este momento"**: dónde iba, hacia dónde, a qué
hora y qué había alrededor. Qué era exactamente lo decides tú después, con calma.

## Historias

### H1 — Marcar un momento sin mirar (P1) · el MVP

Voy conduciendo, veo algo que me llama, y con un gesto rápido sobre el panel lo apunto. El panel
me confirma con una señal discreta que lo ha guardado, y sigo conduciendo.

**Por qué es la primera**: sin esto no hay cuaderno. Lo demás es cómo se ve lo apuntado.

**Cómo se comprueba sola**: en el simulador, hacer el gesto en tres puntos de una ruta; recargar la
página; las tres marcas siguen ahí con su hora y su posición.

**Criterios de aceptación**:

1. **Dado** que el panel está en cualquiera de las 4 vistas, **cuando** hago el gesto de marcar,
   **entonces** en menos de medio segundo aparece una confirmación discreta y la marca queda guardada.
2. **Dado** que no hay cobertura, **cuando** marco, **entonces** la marca se guarda igual (solo
   necesita el GPS).
3. **Dado** que estoy deslizando entre vistas, **cuando** el dedo se mueve, **entonces** nunca se
   crea una marca.
4. **Dado** que marco dos veces seguidas por error (menos de 10 s), **entonces** queda una sola marca.

---

### H2 — Qué había alrededor (P2)

Cada marca guarda, además del punto, lo que el panel ya sabía en ese momento sin gastar datos
extra: municipio, vía, pueblos cercanos con su distancia y dirección, puntos de interés cercanos y
el tiempo que hacía.

**Por qué es la segunda**: convierte un punto en el mapa en algo que puedes reconocer ("ah, esto
fue pasando la M-505, llovía, a la izquierda estaba Galapagar").

**Cómo se comprueba sola**: marcar en la ruta de Maragatería del simulador; la marca incluye
Santa Colomba de Somoza, la LE-142 y los pueblos que había en la vista de pueblos cercanos.

**Criterios de aceptación**:

1. **Dado** que marco, **entonces** no se hace ninguna petición a internet en ese momento.
2. **Dado** que el panel aún no tenía datos del sitio (acaba de arrancar, o sin cobertura),
   **entonces** la marca se guarda con lo que haya y se completa más tarde, cuando haya red.

---

### H3 — Revisar el cuaderno con calma (P3)

Ya en casa (o parado), abro el cuaderno y veo mis marcas agrupadas por viaje, cada una en un mapa
con lo que había alrededor. Para cada una puedo decir "era esto" (elegir el pueblo o sitio
concreto), abrir su información (Wikipedia, Google Maps), añadir una nota, o borrarla.

**Por qué es la tercera**: es para lo que sirve el cuaderno ("para luego investigarlos"), pero sin
H1 y H2 no hay nada que revisar. **Dónde** se revisa depende de tu respuesta a la pregunta 2.

**Criterios de aceptación**:

1. **Dado** que tengo marcas de varios viajes, **cuando** abro el cuaderno, **entonces** las veo por
   viaje y por orden, con fecha, hora y el municipio.
2. **Dado** una marca, **cuando** la abro, **entonces** veo el punto en el mapa con el sentido de la
   marcha y los pueblos/sitios candidatos a su alrededor.
3. **Dado** que el cuaderno se abre, **entonces** nunca aparece mientras se conduce: es un modo
   aparte, como hoy el de los logs.

## Casos raros

- **Sin GPS** (túnel, arranque): se guarda con la última posición conocida y se indica que es aproximada.
- **Sin cobertura**: se guarda igual; lo que falte se completa después.
- **Cuaderno vacío**: un texto que explique cómo marcar, nada más.
- **Parado en un semáforo**: se marca igual; el sentido de la marcha queda como "desconocido".
- **Se borran los logs de viaje** (se rotan cada 10 viajes): las marcas **no** se tocan.
- **El móvil se queda sin espacio o Chrome limpia datos**: hay que pedir al navegador que trate
  este almacenamiento como importante, y en la revisión ofrecer una copia de seguridad.
- **Marca a 120 km/h**: entre ver el sitio y marcar pasan 2-3 s = 60-100 m. El mapa de revisión
  debe enseñar también lo que había *atrás* y a los lados, no solo delante.

## Requisitos

- **R-001**: Marcar DEBE hacerse con un solo gesto, sin mirar, sin menús ni confirmaciones.
- **R-002**: La confirmación DEBE ser discreta (sin destellos) y visible de reojo.
- **R-003**: Marcar NUNCA DEBE gastar datos en ese momento.
- **R-004**: Las marcas NUNCA DEBEN borrarse por la rotación de logs, la limpieza de cachés ni una actualización de la app.
- **R-005**: Deslizar entre vistas NUNCA DEBE crear una marca.
- **R-006**: Los usuarios DEBEN poder borrar una marca y exportar todas.

## Qué invariantes toca

| Invariante | Dónde está escrito | ¿Puede romperse en silencio? |
|---|---|---|
| El conductor no tiene que manejar el panel | CLAUDE.md, regla 3 | **Sí**: un gesto que exija mirar parece funcionar en escritorio. Se comprueba en la prueba en carretera, no en simulador. |
| Seguridad visual: nada llamativo | CLAUDE.md, regla 3 | No: se ve. |
| Minimizar peticiones | CLAUDE.md, regla 2 | **Sí**: que marcar dispare consultas no se ve. **Test**: marcar sin red y comprobar cero peticiones. |
| Los datos del usuario no se pierden | CLAUDE.md, regla 9 (nueva con esta feature) | **Sí, el más peligroso**: la rotación de trayectos o una actualización del service worker podrían borrar marcas sin avisar. **Test**: 11 trayectos seguidos + cambio de versión, y las marcas siguen. |
| Deslizar no marca | *Nuevo con esta feature* | **Sí**: una marca falsa no da error. **Test**: simular deslizamientos entre las 4 vistas, cero marcas. |

## Criterios de éxito

- **E-001**: Marcar lleva menos de 1 s desde el gesto hasta la confirmación, con o sin red.
- **E-002**: En la prueba en carretera, Laureano marca al menos 5 sitios sin apartar la vista más de lo que cuesta mirar el retrovisor, y en casa reconoce al menos 4 de ellos en el cuaderno.
- **E-003**: 0 marcas falsas en un trayecto de 30 min con deslizamientos normales entre vistas.
- **E-004**: 0 marcas perdidas tras 11 trayectos y una actualización de la app.

## Preguntas para ti (cambian lo que se construye)

> **Contestadas el 18/10/2026**: 1 → (a) toque largo en cualquier sitio; 3 → (a) "este momento".
> La 2 la decidí yo el mismo día, cuando me pediste que tomara las decisiones: **(c) las dos**. Se
> revisa en el propio móvil (modo cuaderno) y desde ahí se manda a tu móvil o a tu ordenador con
> "Compartir" (una lista con enlaces a Google Maps) o con la copia de seguridad (DECISIONES D19).

1. **¿Cómo quieres marcar?**
   - (a) **Toque largo en cualquier parte de la pantalla** (1 segundo). *Mi recomendación*: no hay que apuntar a nada y no se confunde con deslizar.
   - (b) Un botón fijo y grande en una esquina. Más evidente, pero hay que mirar dónde está.
   - (c) Tocar el pueblo concreto en la lista o el radar. Más preciso, pero exige mirar y apuntar: no lo veo conduciendo, sí para un copiloto.
2. **¿Dónde quieres investigar después?**
   - (a) En el propio móvil del panel, en un modo "cuaderno".
   - (b) En tu móvil o tu ordenador: el panel te lo manda (archivo, o lista de enlaces a Google Maps).
   - (c) Las dos. *Mi recomendación*: (a) primero porque no depende de nada más; (b) después, con lo aprendido.
3. **¿Qué es una marca?**
   - (a) **"Este momento"**: punto, sentido, hora y lo que había alrededor; tú eliges después qué era. *Mi recomendación*, por lo de "lo que ves no está donde estás".
   - (b) El municipio en el que estás en ese momento. Más simple, pero falla con lo que se ve a lo lejos.
   - (c) Un pueblo o sitio concreto elegido al marcar (va con la respuesta 1c).

## Supuestos

- **Marcar funciona igual en las 4 vistas.** Si prefieres que solo en V1, se simplifica.
- **La señal de confirmación es un pequeño símbolo que aparece 2 s en la cabecera**, sin sonido ni vibración. Si quieres vibración, el móvil lo permite.
- **No hay cuentas ni nube.** Las marcas viven en el móvil del panel; sacarlas de ahí es la pregunta 2.
- **Sin fotos.** El panel no hace fotos (la cámara mira al salpicadero). Las fotos de los sitios, si las quieres, se buscan después en la revisión, con wifi.
- **El texto de la marca no se escribe conduciendo.** Las notas solo se añaden en la revisión.
