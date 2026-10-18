# Especificación: los logs del viaje, en la nube y con borrado automático

**Carpeta**: `specs/005-logs-en-la-nube/` · **Fecha**: 2026-10-18 · **Estado**: construida (H1, H2 y H3) en la v24; falta que Laureano ponga la clave en el móvil y un viaje de verdad

**Lo que se pidió**: "Hay que hacer algo para que tengas acceso a los logs guardarlos en alguna
infra con una política de housekeeping."

**De dónde sale**: el 18/10 hiciste un trayecto corto por Las Rozas y me pediste revisar el log. El
log de cada viaje vive **solo en el móvil** (los 10 últimos), y para que yo lo lea tienes que
abrir `?logs=1`, descargarlo y pasarlo al ordenador. Con esto, te bastaría con decir "revisa los
logs".

## Historias

### H1 — El log de cada viaje llega solo a un sitio privado tuyo (P1) · el MVP

Al cerrar el panel (o al dejarlo en segundo plano), el log del viaje se sube comprimido a un sitio
privado tuyo. Si en ese momento no hay internet, se sube la siguiente vez que abras el panel con
cobertura. Cuando me digas "revisa los logs", los leo desde aquí, sin que tengas que hacer nada.

**Por qué es la primera**: es lo que pediste; sin ella, cada revisión pasa por ti y por el cable.

**Cómo se comprueba sola**: haces un trayecto corto, cierras la app, y desde el ordenador leo ese
log.

**Criterios de aceptación**:

1. **Dado** un viaje con internet al final, **cuando** cierras la app o pasa a segundo plano,
   **entonces** en menos de un minuto su log está en el sitio privado.
2. **Dado** un viaje que acaba sin cobertura, **cuando** vuelves a abrir el panel con internet,
   **entonces** se sube ese log (y cualquier otro que faltara).
3. **Dado** un móvil sin la clave puesta, **entonces** no se sube nada y el panel funciona igual que
   ahora.
4. **Dado** un log ya subido, **cuando** el viaje sigue (lo dejaste en segundo plano y vuelves),
   **entonces** el siguiente envío lo sustituye con lo nuevo; nunca dos copias ni un envío en bucle.

---

### H2 — Se borran solos pasado un tiempo (P1)

Los logs de más de **30 días** desaparecen solos del sitio privado, cada noche, sin que nadie haga
nada, y **no quedan en ningún historial**. En el móvil siguen como ahora (los 10 últimos).

**Por qué va con la primera**: los logs llevan tus posiciones de cada viaje; guardarlos para
siempre en internet no tiene sentido.

**Cómo se comprueba sola**: un log de prueba con fecha de hace 31 días desaparece en la siguiente
limpieza, y en el historial tampoco está.

**Criterios de aceptación**:

1. **Dado** un log de hace 31 días, **cuando** pasa la limpieza de la noche, **entonces** ya no está.
2. **Dado** un log de hace 29 días, **cuando** pasa la limpieza, **entonces** sigue ahí.

---

### H3 — Saber en `?logs=1` qué viajes están subidos (P2)

En la lista de viajes de `?logs=1`, junto a cada uno: "subido" o "pendiente", y un botón "Subir
ahora". Ahí mismo se pone la clave la primera vez, y se ve si ha dejado de valer.

---

## Casos raros

- **Sin internet al cerrar**: se queda pendiente y sube al abrir la próxima vez con cobertura.
- **Viaje muy largo** (el tope de 8.000 mensajes): comprimido son ~100 KB; sube igual.
- **La clave deja de valer** (la revocas o caduca): no se sube nada, `?logs=1` lo dice, y el
  panel sigue igual.
- **Pierdes el móvil**: revocas la clave en GitHub (un clic) y ese móvil ya no puede escribir; los
  logs que hay en la nube siguen siendo tuyos.
- **Dos móviles** (el del panel y el S22): cada uno sube los suyos, con el nombre del móvil en el
  log, si le pones la clave.
- **El simulador**: sus viajes se suben igual, marcados como simulación (o no se suben: ver supuestos).
- **El reloj del móvil mal**: el nombre del log lleva la fecha del móvil; el borrado de los 30 días
  cuenta desde que llegó a la nube, no desde esa fecha.

## Requisitos

- **R-001**: El log de cada viaje DEBE llegar al sitio privado sin que Laureano haga nada, como muy
  tarde al abrir el panel la vez siguiente con cobertura.
- **R-002**: Lo que se sube DEBE ir comprimido: menos de 50 KB por viaje normal.
- **R-003**: La clave NUNCA DEBE estar en el código publicado: vive solo en el móvil, y la pone
  Laureano una vez.
- **R-004**: El sitio DEBE ser privado: solo Laureano (y Claude, desde su ordenador) pueden leerlo.
- **R-005**: Los logs de más de 30 días DEBEN desaparecer solos, también del historial.
- **R-006**: Un fallo al subir NUNCA DEBE afectar al panel (ni bloquearlo, ni pararlo, ni borrar el
  log del móvil).
- **R-007**: Un log NUNCA DEBE darse por subido si no llegó.

## Qué invariantes toca

| Invariante | Dónde está escrito | ¿Puede romperse en silencio? |
|---|---|---|
| Los datos cuestan (regla 2) | `CLAUDE.md` | **Sí**: un envío que se repite en bucle gastaría datos sin que nadie se entere. Test: un log ya subido y sin cambios no se reenvía |
| La red falla (regla 4) | `CLAUDE.md` | **Sí**: un fallo marcado como "subido" perdería ese log para siempre. Test: tras un fallo, sigue pendiente |
| La clave fuera del código (nuevo, R-003) | esta spec | **Sí**: una clave pegada por error en el código publicado sería de cualquiera. Test: ningún fichero publicado contiene algo con forma de clave de GitHub |
| Todo script en el precache (regla 7) | `CLAUDE.md` | Lo vigila el test de siempre |
| Los datos del usuario no se pierden (regla 9) | `CLAUDE.md` | No aplica directamente: se suben logs, no marcas, y el log del móvil no se toca |

## Criterios de éxito

- **E-001**: Tras un trayecto, leo su log desde el ordenador sin que hagas nada más que cerrar la app.
- **E-002**: Menos de 50 KB de datos del móvil por viaje.
- **E-003**: A los 31 días de subido, el log ya no está, ni en el historial.

## Supuestos

- **Dónde**: un **repositorio privado en tu cuenta de GitHub**. No hace falta cuenta nueva, es
  gratis, y yo ya puedo leerlo desde este ordenador. — **Confirmado** (Laureano, 18/10/2026).
- **Cuánto tiempo**: **30 días**. — **Confirmado** (18/10/2026).
- **Cuándo se sube**: solo, al pasar a segundo plano o cerrar, y al abrir si quedó alguno
  pendiente. — **Confirmado** (18/10/2026).
- **La clave**: la creas tú en GitHub, limitada a ese repositorio y solo para escribir logs (unos 5
  minutos, te guío paso a paso), y la pegas una vez en `?logs=1` en cada móvil. Yo no puedo crearla
  ni escribirla por ti: es la seguridad de tu cuenta.
- **El repositorio y la limpieza de cada noche** los creo yo en tu cuenta de GitHub, con tu permiso.
- **Qué se sube**: el log tal cual lo descargas hoy en `?logs=1` (resumen y mensajes, con las
  posiciones del recorrido). Las marcas del cuaderno no se suben aparte.
- **El simulador**: sus viajes se suben marcados como simulación, para poder revisarlos también.
- **La primera vez**, se suben también los viajes que el móvil ya tiene guardados (hasta 10, unos
  300 KB una sola vez): así llegan el trayecto de hoy por Las Rozas y la prueba en carretera del 18/10.
