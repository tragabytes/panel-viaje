# Mensaje de arranque para una sesión nueva

Abre la sesión en `C:\Users\Laureano de Tomas\proyectos\panel-viaje` y pega esto:

---

Seguimos con el panel de viaje, que ahora es un **cuaderno de viaje**. Todo en español, también tu
razonamiento y las descripciones de los comandos.

Lee, por este orden:
1. `CLAUDE.md` (mapa del proyecto y reglas propias).
2. `specs/000-rumbo/vision.md` (qué quiero que sea y en qué orden).
3. `specs/000-rumbo/DECISIONES.md`, sobre todo D7, D8 y las preguntas de D12.
4. `specs/001-cuaderno-de-viaje/spec.md` y `tasks.md`.
5. `MANTENIMIENTO.md` si vas a probar o publicar.

**Estado (18/10).**
- Publicado en https://tragabytes.github.io/panel-viaje/ con `SW_VERSION` `v18-2026-10-18-cuaderno-h1`: arreglo de Overpass (D13), datos viejos en gris (D14), precarga del service worker (D15) y marcar con toque largo (cuaderno H1, D16).
- Método nuevo desde el 30/09 (copiado de `temario-eir`). El tablero Kanvas y `docs/seguimiento.json` son archivo: se consultan, no se actualizan.
- El 18/10, desde casa, Overpass seguía sin funcionar (`overpass-api.de` colgado, `private.coffee` con errores). Antes de medir contra Overpass desde casa, comprobar que responde, y medir con pocas peticiones.

**Por dónde seguir:**
1. ~~**Arreglo de Overpass** (D7)~~ — hecho el 18/10 (DECISIONES D13); falta verlo con los servidores reales en carretera.
2. ~~**Datos viejos sin cobertura** (D8)~~ — hecho el 18/10, atenuado en gris desde 2 km (DECISIONES D14). D15 (precarga con ficheros viejos), arreglado también.
3. **Cuaderno, H1** — construido el 18/10 (DECISIONES D16, `SW_VERSION` `v18-2026-10-18-cuaderno-h1`). Falta probarlo en el móvil por cable y en el coche.
4. **Prueba en carretera**: marcas reales + log del viaje (`?logs=1`), medir peticiones por hora y fallos de Overpass. Con eso, dar por buenas las 15 tarjetas que quedaron en revisión en la sesión 49 (DECISIONES D3).
5. Después: radar con relieve (spec 002) y meteo chillout (spec 003, con mis referencias).

**Pendiente de mí:**
- De D12 quedan: dónde revisar el cuaderno (pregunta 2 de la spec), qué hacer con los ficheros archivados y borrar las carpetas viejas (D11).
- Buscar dos o tres referencias de lo que para mí es "chillout".
