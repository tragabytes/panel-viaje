# CLAUDE.md — panel-viaje

**Cuaderno de viaje** para el coche: una web (PWA) en un móvil Android viejo, en apaisado, junto
al navegador del móvil principal. Enseña dónde vas (pueblo, vía, próxima salida, pueblos cercanos,
tiempo) y **deja marcar los sitios que te llaman para investigarlos después**. No es un navegador.
Publicada en https://tragabytes.github.io/panel-viaje/ (GitHub Pages: lo que entra en `main` se
publica solo).

| Archivo | Para qué |
|---|---|
| [`specs/000-rumbo/vision.md`](specs/000-rumbo/vision.md) | **Rumbo del proyecto**: qué quiere Laureano que sea y en qué orden. **Punto de entrada** |
| [`specs/000-rumbo/DECISIONES.md`](specs/000-rumbo/DECISIONES.md) | Decisiones tomadas en ausencia de Laureano, para que las revise |
| [`specs/000-rumbo/RELEVO.md`](specs/000-rumbo/RELEVO.md) | Mensaje de arranque de la sesión siguiente, con el estado y lo pendiente |
| [`specs/001-cuaderno-de-viaje/`](specs/001-cuaderno-de-viaje/) | Marcar un momento sin mirar, guardarlo y revisarlo después. **Borrador** |
| [`MANTENIMIENTO.md`](MANTENIMIENTO.md) | Probar en local, simulador, banderas de la URL, publicar y sacar los logs de un viaje |
| `index.html`, `js/`, `css/`, `fonts/`, `service-worker.js` | La app. Vanilla JS, sin compilar: lo que hay en el repo es lo que se publica |
| `tests/` | Tests de invariantes (`node --test`) y los cuadernos de Colab de la investigación de APIs (fase 1) |
| `docs/seguimiento.json` | **Archivo histórico** de las sesiones 1-49 (decisiones, problemas, fichas de API). Se consulta, ya no se actualiza |
| `tablero.canvas`, `canvas-tool.py`, `RULES.md`, `.claude/skills/` | **Archivo**: el tablero Kanvas y las skills de Obsidian del método anterior. No se usan |

## Reglas propias

Las restricciones de fondo, que no se deducen del código:

1. **El hardware es el techo.** Móvil viejo (Chrome sobre Android 10, pantalla ~5,5" apaisada, poca CPU). Todo efecto se mide ahí; lo que va fluido en el ordenador no prueba nada.
2. **Los datos cuestan.** Salen del móvil principal. Toda petición evitable se evita, y cada caché nueva lleva su TTL y su criterio escritos en el código.
3. **Se mira conduciendo.** Fondo oscuro, letra grande, contraste alto, nada que destelle. Lo que hay que tocar se hace con **un solo gesto sin mirar**; lo demás, en modos aparte (`?logs=1`) que no aparecen en marcha.
4. **La red falla, y es lo normal.** Cualquier dato de internet tiene alternativa o un estado visible, y un fallo de red **nunca se guarda como si fuera un dato** (una lista vacía cacheada deja un pueblo sin POIs dos semanas: BPC-08, RA-04).
5. **España entera**, pedanías incluidas. APIs gratuitas y sin clave (Open-Meteo, Nominatim, Overpass, Wikidata, Wikipedia, Photon). Nada de parámetros de memoria: se prueba la llamada real antes (P04, P05: los QID y filtros SPARQL "de memoria" fallaron una y otra vez).
6. **Nominatim, como mucho 1 petición por segundo** y en fila (su política de uso; DT-13).
7. **Todo script de `index.html` está en el precache del service worker**, y cualquier cambio publicado sube `SW_VERSION`. Si no, el panel se queda viejo o muere sin cobertura sin avisar (DT-11). Lo comprueba un test.
8. **`debug.js` no es imprescindible.** Declara `const debug` (no llega a `window`); `index.html` pone antes un sustituto para que, si no carga, el panel arranque igual (P18, DT-17). Lo comprueba un test.
9. **Los datos del usuario no se pierden.** Hasta ahora solo había cachés, que se pueden volver a bajar. Las marcas del cuaderno son de Laureano: ninguna limpieza, rotación ni actualización las borra.
10. **Sin frameworks** (React, Vue…). Una librería solo si se justifica y se dice cuánto pesa.

Las rutas del simulador, las banderas de depuración y cómo publicar están en `MANTENIMIENTO.md`.
