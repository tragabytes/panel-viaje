# Histórico — Instrucciones de primer arranque

> Estas instrucciones se ejecutaron una sola vez al instalar Kanvas + skills de Obsidian en el proyecto. Se conservan aquí como histórico por si en el futuro hay que repetir el setup en otro entorno o auditar cómo se hizo. **No son reglas vivas:** Claude no las aplica en sesiones normales. Vivían originalmente en la sección 13 de `CLAUDE.md` y se movieron aquí en la sesión 48 (5 de mayo de 2026) durante la limpieza operativa del documento.

## Procedimiento original

Cuando Laureano salude por primera vez en este repo, la primera tarea es completar la instalación del sistema de trabajo. Sigue estos pasos en orden, pidiendo confirmación a Laureano antes de cada bloque importante:

**Bloque A — Verificación del entorno:**

1. Comprueba que estás en la carpeta correcta leyendo el `README.md` y el `package.json` si existe.
2. Lee `CLAUDE.md` entero si aún no lo has hecho.
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
15. Propón a Laureano una lista inicial de 5-10 tarjetas moradas para el tablero, basadas en el siguiente hito inmediato (prueba en carretera + MotorwayExitModule + POIModule) y las ideas parqueadas más relevantes del seguimiento. Propón también los grupos adecuados.
16. No las añadas al tablero todavía. Enséñaselas a Laureano como propuesta en texto. Cuando apruebe, usa `propose` y `propose-group` de la CLI para crearlas.

**Bloque E — Commit inicial:**

17. Commitea todo lo instalado con un mensaje tipo `setup: kanvas + skills obsidian + tablero inicial`.
18. Actualiza el `seguimiento.json` añadiendo una sesión nueva que describa esta instalación como sesión de infraestructura (no de producto). Regenera el `.docx`.
19. Commitea el seguimiento con un mensaje tipo `seguimiento: sesión <N> — instalación de kanvas y skills`.

Cuando termines el bloque E, avisa a Laureano con un resumen claro de lo que se ha instalado y qué esperar del próximo arranque.
