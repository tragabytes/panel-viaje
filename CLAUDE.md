# CLAUDE.md — Panel de viaje para coche

> Este archivo es la constitución del proyecto. Claude Code lo lee al arrancar cada sesión en este repositorio. Todas las reglas que aparecen aquí son de obligado cumplimiento, salvo indicación explícita en contrario del usuario durante la sesión.

---

## 1. Qué es este proyecto

Panel informativo para coche que muestra en tiempo real, sobre un móvil Android colocado en el salpicadero de un Toyota Yaris, información contextual del lugar por el que se circula: ubicación administrativa (pueblo, provincia, comunidad autónoma), carretera actual, próxima salida si es autovía, pueblos cercanos con sus puntos de interés, y previsión meteorológica.

El panel es un **complemento informativo**, no un navegador. El usuario sigue usando su móvil principal con Google Maps para la navegación. El móvil viejo del panel actúa como pantalla secundaria dedicada.

- **Repositorio:** https://github.com/tragabytes/panel-viaje
- **URL del panel en producción:** https://tragabytes.github.io/panel-viaje/
- **Usuario de GitHub:** tragabytes
- **Usuario humano:** Laureano. Nivel técnico medio: entiende conceptos generales pero no programa. No sabe usar git CLI ni terminal fuera de lo imprescindible para Claude Code.

---

## 2. Restricciones que nunca debes olvidar

Estas restricciones son permanentes y condicionan cualquier decisión técnica del proyecto. Si una propuesta choca con alguna de ellas, la propuesta está mal.

- **Hardware:** móvil Android viejo usado como panel. Pantalla ~5.5" en orientación apaisada, procesador y RAM limitados, Chrome actualizado (validado en sesión 02: Chrome 146 sobre Android 10). Se pueden usar CSS y JavaScript modernos sin polyfills.
- **Conexión:** datos compartidos desde el móvil principal. Los datos y la batería cuestan. Minimizar peticiones es un objetivo permanente.
- **Uso real:** el usuario conduce mientras el panel está activo. No debe tener que tocar el panel. Todo se actualiza solo.
- **Seguridad visual:** fondo oscuro, tipografía grande, contraste alto. Nada de animaciones llamativas que distraigan. Animaciones sutiles de fondo (nubes, lluvia) sí son aceptables.
- **Geografía:** España. Todas las APIs y datos deben funcionar bien en municipios españoles, incluidos los pequeños y las pedanías.
- **HTTPS obligatorio:** el GPS del navegador solo funciona por HTTPS. GitHub Pages lo cumple de serie.

---

## 3. Stack técnico

- **App:** PWA en HTML, CSS y JavaScript vanilla. Sin frameworks pesados (React, Vue, Angular están prohibidos).
- **Hosting:** GitHub Pages. Despliegue automático al subir cambios a `main`.
- **APIs preferentes (gratuitas, sin API key):**
  - **Open-Meteo** — meteorología.
  - **Nominatim (OpenStreetMap)** — geocodificación inversa.
  - **Overpass API (OpenStreetMap)** — vías, POIs, próxima salida de autovía.
  - **Wikipedia REST / Wikidata SPARQL** — descripciones, fotos y datos de municipios.
- **Almacenamiento local:** localStorage o IndexedDB para caché, según tamaño.
- **Herramientas auxiliares:** notebooks de Google Colab (Python) para análisis de APIs y extracción de datos puntual. Los notebooks **viven en `tests/`**, no en `docs/`.

---

## 4. Estructura del repositorio

```
/
├── index.html                      Punto de entrada de la PWA
├── README.md                       Descripción pública del proyecto
├── CLAUDE.md                       Este archivo (constitución del proyecto)
├── canvas-tool.py                  CLI de Kanvas (ver sección 6)
├── RULES.md                        Reglas completas del flujo Kanvas
├── tablero.canvas                  Tablero Kanvas del proyecto (Obsidian Canvas)
├── .claude/
│   └── skills/                     Skills de Obsidian de kepano (ver sección 8)
├── js/                             Módulos JavaScript del panel
│   ├── debug.js                    Panel de debug en pantalla con ?debug=1
│   ├── location.js                 LocationModule (Nominatim zoom 14 + 17)
│   ├── weather.js                  WeatherModule (Open-Meteo)
│   ├── meteo_codigos.js            Tabla WMO → texto + categoría + icono
│   ├── carreteras.js               Clasificación estatal/autonómica + tabla de mapeo
│   ├── roadref.js                  Fallback Overpass para rescatar ref de vías
│   ├── wakelock.js                 Wake Lock API para mantener la pantalla encendida
│   ├── simulator.js                Simulador de GPS activable con ?sim=<ruta>
│   ├── rutas.js                    Catálogo de rutas del simulador
│   ├── motorwayexit.js             (pendiente) Próxima salida de autovía
│   └── (futuros módulos)
├── docs/                           Documentación y sistema de seguimiento
│   ├── seguimiento.json            FUENTE CANÓNICA de historia (ver sección 5)
│   ├── generar_seguimiento.js      Script Node.js que genera el .docx desde el JSON
│   ├── seguimiento_desarrollo_panel_viaje.docx   Generado automáticamente
│   ├── plan_desarrollo_panel_viaje.docx          Plan maestro
│   └── instrucciones_proyecto_panel_viaje.docx   Instrucciones originales
└── tests/                          Notebooks de Google Colab (Python)
    ├── fase1_geocoding.ipynb       Análisis Nominatim + Photon
    ├── fase1_meteo.ipynb           Análisis Open-Meteo
    ├── fase1_overpass.ipynb        Análisis Overpass (pueblos, POIs, junctions)
    ├── fase1_pois.ipynb            Análisis Wikidata + Wikipedia
    ├── fase1_wikidata_proximidad.ipynb   Validación proximidad geográfica
    └── obtener_rutas_osm.ipynb     Utilidad para extraer rutas del simulador
```

Nunca muevas archivos entre estas carpetas sin motivo explícito aprobado por el usuario. La estructura es estable y cualquier cambio rompe referencias en el código y en los documentos.

---

## 5. Fuentes de verdad del proyecto

El proyecto tiene dos fuentes de información complementarias. No se solapan y cada una tiene su rol.

### 5.1. `docs/seguimiento.json` — historia canónica

Este archivo pesa ~150 KB y contiene **toda la historia del proyecto**: metadatos, estado actual, fases, entorno del móvil, fichas detalladas de cada API evaluada, decisiones técnicas con contexto y alternativas, problemas encontrados (abiertos y resueltos), sesiones de trabajo con lo que se hizo en cada una, e ideas parqueadas para el futuro.

**Reglas de uso:**

- **Es la fuente canónica para cualquier pregunta histórica**: qué se decidió, por qué, qué problema se encontró, cómo se resolvió, qué se probó. Si necesitas saber algo del pasado del proyecto, búscalo aquí antes de preguntar al usuario.
- **No lo leas entero en cada arranque.** Pesa demasiado. Léelo bajo demanda, buscando la sección concreta que necesites (decisiones, problemas, sesiones, fichas_api).
- **No dupliques su contenido en otros sitios.** Si algo ya está en el seguimiento, no lo repitas en el tablero Kanvas ni en otros documentos. Enlaza o referencia por ID.
- **Lo vas a actualizar tú al final de cada sesión.** Ver sección 7.

### 5.2. Tablero Kanvas — trabajo vivo

El archivo `tablero.canvas` contiene el trabajo **vivo hacia adelante**: lo que hay que hacer a partir de hoy. Tareas propuestas, en curso, en revisión, bloqueadas o terminadas. No guarda historia del pasado (eso va al seguimiento). Solo mira al futuro inmediato.

Las tarjetas del tablero pueden y deben **enlazar al seguimiento** cuando necesiten contexto histórico, usando wikilinks de Obsidian hacia archivos o secciones concretas.

---

## 6. Flujo de trabajo con Kanvas

El proyecto usa **Kanvas** (https://github.com/XMihura/Kanvas) como sistema de gestión de tareas entre el humano y el agente. Kanvas es un tablero visual sobre Obsidian Canvas donde cada tarea es una tarjeta de color, y las flechas son dependencias.

### 6.1. Estados de las tarjetas

| Color   | Estado    | Quién mueve            |
|---------|-----------|------------------------|
| Morado  | Propuesto | Agente (tú)            |
| Rojo    | Por hacer | Humano (Laureano)      |
| Naranja | En curso  | Agente o humano        |
| Cian    | Revisión  | Agente (tú)            |
| Verde   | Hecho     | Humano (Laureano)      |
| Gris    | Bloqueado | Automático por deps    |

### 6.2. Flujo estándar

1. **Tú (agente) propones una tarea** → tarjeta morada.
2. **Laureano la aprueba** → tarjeta roja.
3. **Tú la empiezas** → tarjeta naranja.
4. **Tú terminas y la dejas para revisión** → tarjeta cian.
5. **Laureano verifica** → tarjeta verde.

Si una tarjeta depende de otra que no está en verde, el sistema la pone automáticamente en gris hasta que la dependencia se cumpla.

### 6.3. Regla dura: tarjeta activa obligatoria

**No toques código del proyecto sin tener una tarjeta activa en estado naranja.** Este es el modo estricto de Kanvas. Si Laureano te pide un cambio pero no hay tarjeta para él, tu respuesta por defecto es: "eso no está en el tablero, ¿propongo una tarjeta nueva?".

Laureano puede pedir expresamente "hazlo sin tarjeta" para cambios rápidos puntuales. Si lo hace, cumples, pero al final de la sesión dejas constancia del cambio en el seguimiento.

> **Nota operativa:** este modo estricto se usará durante las primeras 3-4 sesiones para afianzar la herramienta. Después, Laureano decidirá si mantiene el rigor o lo relaja.

### 6.4. Interfaz con el tablero: `canvas-tool.py`

**Nunca edites directamente `tablero.canvas` a mano.** El tablero es un JSON complejo con reglas de consistencia (IDs, coordenadas, aristas, grupos) y una edición manual rompe fácilmente el archivo. Usa siempre la CLI de Kanvas:

```
python canvas-tool.py tablero.canvas <comando> [args]
```

Comandos más habituales (ver `RULES.md` para la lista completa):

- `status` — vista general del tablero.
- `ready` — tarjetas rojas con todas las dependencias cumplidas.
- `blocked` — tarjetas grises y qué las bloquea.
- `show <ID>` — detalle de una tarjeta.
- `propose <grupo> "<título>" "<descripción>" [--depends-on ID ...]` — crear tarjeta morada.
- `start <ID>` — rojo → naranja.
- `finish <ID>` — naranja → cian.
- `pause <ID>` — naranja → rojo.

### 6.5. Skill de JSON Canvas

Para cualquier lectura o edición avanzada del `tablero.canvas` que la CLI no cubra, consulta primero el skill `json-canvas` instalado en `.claude/skills/` (ver sección 8). Ese skill conoce el formato JSON Canvas y te evita romperlo.

---

## 7. Regla del seguimiento: actualización al final de cada sesión

**Toda sesión de trabajo termina actualizando `docs/seguimiento.json` y regenerando el `.docx`.** Esto no es opcional. Es parte del trabajo, igual que escribir el código.

### 7.1. Qué actualizar

Al final de cada sesión, antes de dar nada por cerrado, actualiza estas secciones del `seguimiento.json`:

- **`estado_actual`**: fase actual, última actualización, siguiente hito, bloqueos. Reescribe con el estado tras la sesión.
- **`sesiones`**: añade una entrada nueva al array siguiendo el formato de las anteriores. Incluye número (continúa el último), título, fecha, fase trabajada, lo que se ha hecho, decisiones tomadas, problemas encontrados, pendientes. Si miras una sesión existente tendrás el esquema de campos exacto.
- **`decisiones`**: si durante la sesión se tomó alguna decisión técnica relevante, añádela al array con su ID incremental, título, fecha, contexto, alternativas consideradas, razón, parámetros operativos y consecuencias. El formato está en las decisiones existentes.
- **`problemas_resueltos` o `problemas_abiertos`**: cualquier problema encontrado se registra aquí aunque se resuelva en la misma sesión. La historia de problemas es tan valiosa como la historia de decisiones porque explica decisiones posteriores.
- **Fase (`fases`)**: si se cerró o arrancó una fase, actualiza su `estado` y sus `notas`.

### 7.2. Regenerar el .docx

Después de guardar el JSON, regenera el documento Word ejecutando:

```
node docs/generar_seguimiento.js
```

Esto actualiza `docs/seguimiento_desarrollo_panel_viaje.docx` automáticamente a partir del JSON. Si el script necesita dependencias npm que aún no están instaladas, instala lo mínimo con `npm install` dentro de `docs/` (o donde esté el `package.json` correspondiente) y prueba de nuevo. Si no hay `package.json` aún, avisa a Laureano antes de inventar nada: puede que la primera ejecución requiera un arranque manual.

### 7.3. Commit final

El trabajo de la sesión se commitea en dos partes:

1. **Commit del código/cambios del proyecto**, con mensaje descriptivo de lo que se hizo.
2. **Commit del seguimiento**, con mensaje tipo `seguimiento: sesión N — <título corto>`.

Si algún cambio del código es trivial y el seguimiento lo describe adecuadamente, pueden ir juntos en un solo commit. Usa tu criterio.

---

## 8. Skills cargados

El proyecto tiene instalados los skills de Obsidian de kepano (https://github.com/kepano/obsidian-skills) en `.claude/skills/`. Cada skill es una carpeta con un `SKILL.md` que te enseña a manejar un formato concreto sin cometer errores.

**Cuándo usar cada uno:**

- **`json-canvas`** — obligatorio antes de cualquier edición avanzada del `tablero.canvas` que la CLI de Kanvas no cubra. Te enseña el formato JSON Canvas (nodos, aristas, grupos, coordenadas).
- **`obsidian-markdown`** — úsalo cuando escribas cualquier nota Markdown nueva en el vault de Obsidian. Cubre wikilinks, embeds, callouts y propiedades YAML.
- **`obsidian-bases`** — para crear vistas tipo base de datos en Obsidian. No es prioritario en este proyecto.
- **`obsidian-cli`** — para interactuar con el vault desde línea de comandos. Uso puntual.
- **`defuddle`** — para extraer texto limpio de páginas web. Úsalo si alguna vez necesitas convertir una página web en nota de Obsidian.

**Regla:** antes de empezar una tarea que involucre Obsidian, Canvas, wikilinks o formatos de notas, consulta el skill correspondiente. No trabajes de memoria.

---

## 9. Cómo trabaja Laureano conmigo

Laureano tiene un estilo de trabajo concreto que debes respetar.

- **Le gusta el diseño cuidado, la explicación clara del porqué de cada decisión, y que le consultes antes de tomar decisiones importantes.**
- **Prefiere ir paso a paso y validar cada fase antes de avanzar.** No saltes fases.
- **Si propone algo que contradice el plan o el seguimiento, coméntalo antes de implementarlo.** Es mejor parar y discutir que ejecutar algo incoherente.
- **Pide que midas antes de asumir.** Si dices que una API es rápida, mídela. Si dices que un archivo pesa poco, cuenta los bytes.
- **Pide pruebas reales antes de dar algo por hecho.** Un "esto debería funcionar" no cuenta como validación.
- **Valora que le adviertas de riesgos.** Si ves que una decisión tiene una consecuencia que él puede no haber previsto, díselo aunque no te lo pregunte.

---

## 10. Reglas técnicas duras

Estas reglas se aplican a todo el código que toques en este repositorio.

- **Vanilla JS por defecto.** Si necesitas una librería, justifica por qué y cuánto pesa. Frameworks pesados (React, Vue, Angular, Svelte...) están prohibidos.
- **Probar antes de dar algo por hecho.** Nunca afirmes que una API funciona sin haberla llamado con datos reales. Nunca afirmes que un módulo está listo sin haberlo ejecutado.
- **Medir en lugar de suponer.** Latencias, tamaños de respuesta, tiempos de ejecución: siempre con números reales.
- **Fallback siempre.** Cualquier función que dependa de una API externa debe tener alternativa o, al menos, un estado de error razonable visible en el panel de debug.
- **Caché con cabeza.** Cada dato tiene su TTL y su criterio. Ubicación ~30 s, meteo ~15 min, POIs de un pueblo horas o días. Cuando definas una caché nueva, documenta el TTL y el criterio en el código y en el seguimiento.
- **Minimiza peticiones.** El usuario paga los datos móviles con los del móvil principal. Cualquier petición evitable debe evitarse.
- **Panel de debug en pantalla.** Cualquier módulo nuevo usa `debug.log` para registrar entrada, salida, latencia, caché reusada y errores. El panel se activa con `?debug=1` en la URL.
- **HTTPS siempre.** Cualquier recurso externo debe servirse por HTTPS o no se incluye.

---

## 11. Cosas que NO debes hacer

Lista negativa explícita. Si te descubres haciendo alguna de estas, para.

- **No inventes endpoints ni parámetros de APIs.** Si no estás seguro, búscalo en la documentación oficial o pregunta.
- **No añadas funcionalidades no acordadas** sin proponerlas antes como tarjeta Kanvas y obtener aprobación.
- **No uses frameworks pesados.** Ver sección 10.
- **No asumas buena conexión.** El panel debe funcionar con 3G lento y cortes intermitentes.
- **No des código por terminado sin probarlo.** Si no has ejecutado el código tú mismo, no está terminado.
- **No des instrucciones que requieran que Laureano toque terminal o git CLI directamente** fuera de los comandos mínimos ya establecidos (`claude` para arrancarte, y poco más). Todo cambio en el repo lo haces tú con git desde Claude Code.
- **No toques `docs/seguimiento.json` fuera del flujo de actualización de fin de sesión.** Es la fuente canónica: se respeta su estructura y solo se amplía, nunca se reescribe arbitrariamente.
- **No edites `tablero.canvas` a mano.** Usa siempre `canvas-tool.py` o el skill `json-canvas`.
- **No rompas la estructura del repo** sin motivo aprobado.

---

## 12. Instrucciones para el primer arranque

Esta sección se aplica **solo la primera vez** que arranques en este repositorio. Después de ejecutarla, Laureano la marcará como cumplida y podrás ignorarla.

Cuando Laureano te salude por primera vez en este repo, tu primera tarea es completar la instalación del sistema de trabajo. Sigue estos pasos en orden, pidiendo confirmación a Laureano antes de cada bloque importante:

**Bloque A — Verificación del entorno:**

1. Comprueba que estás en la carpeta correcta leyendo el `README.md` y el `package.json` si existe.
2. Lee este `CLAUDE.md` entero si aún no lo has hecho.
3. Lee el `estado_actual` del `docs/seguimiento.json` para saber en qué fase está el proyecto.

**Bloque B — Instalación de skills de Obsidian:**

4. Comprueba si existe la carpeta `.claude/skills/`. Si no existe, créala.
5. Descarga los skills de kepano desde https://github.com/kepano/obsidian-skills clonando el repo a una carpeta temporal fuera del proyecto (por ejemplo `/tmp/obsidian-skills` o el equivalente en Windows).
6. Copia las cinco subcarpetas del directorio `skills/` del repo de kepano (`obsidian-markdown`, `obsidian-bases`, `json-canvas`, `obsidian-cli`, `defuddle`) a `.claude/skills/` en el proyecto.
7. Borra la carpeta temporal.
8. Verifica que los cinco `SKILL.md` están en `.claude/skills/<nombre>/SKILL.md`.

**Bloque C — Instalación de Kanvas:**

9. Clona el repo de Kanvas (https://github.com/XMihura/Kanvas) a una carpeta temporal.
10. Copia `canvas-tool.py` y `RULES.md` desde el repo de Kanvas a la raíz de este proyecto.
11. Copia `examples/blank.canvas` desde el repo de Kanvas a la raíz de este proyecto y renómbralo a `tablero.canvas`.
12. Borra la carpeta temporal de Kanvas.
13. Comprueba que `python canvas-tool.py tablero.canvas status` funciona (necesita Python 3.7+ ya instalado en el sistema).

**Bloque D — Primer tablero:**

14. Lee el `estado_actual` y las últimas 2-3 sesiones del `seguimiento.json` para entender dónde estamos exactamente.
15. Propón a Laureano una lista inicial de 5-10 tarjetas morfadas para el tablero, basadas en el siguiente hito inmediato (prueba en carretera + MotorwayExitModule + POIModule) y las ideas parqueadas más relevantes del seguimiento. Propón también los grupos adecuados.
16. No las añadas al tablero todavía. Enséñaselas a Laureano como propuesta en texto. Cuando apruebe, usa `propose` y `propose-group` de la CLI para crearlas.

**Bloque E — Commit inicial:**

17. Commitea todo lo instalado con un mensaje tipo `setup: kanvas + skills obsidian + tablero inicial`.
18. Actualiza el `seguimiento.json` añadiendo una sesión nueva que describa esta instalación como sesión de infraestructura (no de producto). Regenera el `.docx`.
19. Commitea el seguimiento con un mensaje tipo `seguimiento: sesión <N> — instalación de kanvas y skills`.

Cuando termines el bloque E, avisa a Laureano con un resumen claro de lo que se ha instalado y qué esperar del próximo arranque.

---

## 13. Comportamiento general esperado en cada sesión

Al inicio de una sesión normal (no la primera):

1. Saluda brevemente y muestra el `status` del tablero Kanvas. Laureano quiere ver de un vistazo qué hay pendiente.
2. Pregunta qué quiere trabajar hoy. No asumas. Puede tener ideas nuevas.
3. Si va a trabajar en una tarjeta existente, usa `start <ID>` para moverla a naranja antes de tocar código.
4. Si va a crear una tarjeta nueva, propónla con `propose` y espera aprobación antes de empezar.

Durante la sesión:

5. Comunica avances en mensajes cortos. No escribas parrafadas innecesarias.
6. Si encuentras un problema, documéntalo. Aunque lo resuelvas en el momento, queda constancia para el seguimiento.
7. Si necesitas tomar una decisión técnica que no está en el seguimiento, pregúntale antes.

Al final de la sesión:

8. Mueve las tarjetas terminadas a cian con `finish`.
9. Actualiza el `seguimiento.json` según la sección 7.
10. Regenera el `.docx`.
11. Commitea todo según la sección 7.3.
12. Resume brevemente qué se ha hecho y qué queda para la próxima.

---

*Fin del CLAUDE.md. Última actualización: primer montaje del sistema, 12 de abril de 2026.*
