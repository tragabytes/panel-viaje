# Mensaje de arranque para una sesión nueva

Abre la sesión en `C:\Users\Laureano de Tomas\proyectos\panel-viaje` y pega esto:

---

Seguimos con el panel de viaje, que ahora es un **cuaderno de viaje**. Todo en español, también tu
razonamiento y las descripciones de los comandos.

Lee, por este orden:
1. `CLAUDE.md` (mapa del proyecto y reglas propias).
2. `specs/000-rumbo/vision.md` (qué quiero que sea y en qué orden).
3. `specs/000-rumbo/DECISIONES.md`, sobre todo de D17 en adelante (lo que se hizo el 18/10 por la
   tarde sin mí).
4. `specs/000-rumbo/PENDIENTES.md` (mejoras pequeñas apuntadas).
5. Las specs 001, 002 y 003 con sus `tasks.md`.
6. `MANTENIMIENTO.md` si vas a probar o publicar.

**Estado (18/10, noche).**
- **Publicado** en https://tragabytes.github.io/panel-viaje/: `SW_VERSION` `v18-2026-10-18-cuaderno-h1`
  (Overpass arreglado, datos viejos en gris, precarga del service worker y marcar con toque largo).
- **En commits locales, sin subir** (D23), con `SW_VERSION` `v19-2026-10-18-cuaderno-radar-paisaje`:
  cuaderno H2 y H3, radar con relieve (spec 002), meteo chillout (spec 003), los arreglos de la
  revisión (D22) y la documentación. Se publica con un "sube".
- El 18/10 hice una prueba en carretera con la v18. Su log (`?logs=1`) dirá si Overpass responde con
  los datos del móvil, si Chrome concedió el almacenamiento persistente y cómo fue marcar.
- El 18/10, desde casa, Overpass seguía sin funcionar (`overpass-api.de` colgado, `private.coffee`
  con errores). Antes de medir contra Overpass desde casa, comprobar que responde, y con pocas
  peticiones.

**Por dónde seguir:**
1. **Leer el log de la prueba en carretera** del 18/10 y sacar conclusiones (Overpass, marcas,
   peticiones por hora). Con eso, dar por buenas las 15 tarjetas de la sesión 49 (D3).
2. **Publicar la v19** cuando yo diga "sube", y probarla en el móvil del panel: fluidez del radar y
   del paisaje (regla 1), que el toque largo no choca con nada nuevo.
3. **Otra prueba en carretera** con la v19: marcas, cuaderno en casa, radar y paisaje. Contestar
   las preguntas de las specs 002 y 003.
4. Lo que salga de ahí, y después `PENDIENTES.md`.

**Pendiente de mí:**
- Decir si el paisaje de la vista 2 es mi idea de "chillout" (si no, dos o tres referencias).
- Contestar las preguntas de las specs 002 y 003 tras verlas en el coche.
- Qué hacer con los ficheros archivados y las carpetas viejas (D11, D12).
