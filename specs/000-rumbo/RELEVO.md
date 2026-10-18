# Mensaje de arranque para una sesión nueva

Abre la sesión en `C:\Users\Laureano de Tomas\proyectos\panel-viaje` y pega esto:

---

Seguimos con el panel de viaje, que ahora es un **cuaderno de viaje**. Todo en español, también tu
razonamiento y las descripciones de los comandos.

Lee, por este orden:
1. `CLAUDE.md` (mapa del proyecto y reglas propias).
2. `specs/000-rumbo/vision.md` (qué quiero que sea y en qué orden).
3. `specs/000-rumbo/DECISIONES.md`, sobre todo de D17 en adelante (lo que se hizo el 18/10).
4. `specs/000-rumbo/PENDIENTES.md` (mejoras pequeñas apuntadas).
5. Las specs 001, 002 y 003 con sus `tasks.md`.
6. `MANTENIMIENTO.md` si vas a probar o publicar (y su sección 7 si algo falla en un móvil).

**Estado (18/10, cierre de sesión).**
- **Publicado** en https://tragabytes.github.io/panel-viaje/ con `SW_VERSION`
  `v21-2026-10-18-ayuda-ubicacion`. Todo subido a GitHub; no queda nada en local sin subir.
- Lo que hay: cuaderno completo (H1 marcar con toque largo, H2 lo que había alrededor, H3 revisar en
  `?cuaderno=1`), radar con relieve en la vista 4 (spec 002), meteo chillout en la vista 2
  (spec 003), los 40 arreglos de la revisión (D22), actualizaciones que entran solas con el coche
  parado (v20, D24) y una tarjeta que explica qué falla cuando no hay permiso de ubicación (v21, D25).
- **Ningún móvil tiene confirmada la v21.** Los que tenían una versión anterior a la v20 necesitan
  una vez la actualización a mano (MANTENIMIENTO, sección 4). Desde la v20, solas.
- El 18/10 hice una prueba en carretera con la v18. Su log (`?logs=1`) dirá si Overpass responde con
  los datos del móvil, si Chrome concedió el almacenamiento persistente y cómo fue marcar.
- Desde casa, Overpass seguía sin funcionar el 18/10 (`overpass-api.de` colgado, `private.coffee`
  con errores). Antes de medir contra Overpass desde casa, comprobar que responde, y con pocas
  peticiones.
- **Dos problemas abiertos en mis móviles** (no son fallos del panel; ver MANTENIMIENTO, sección 7):
  - **S22 del trabajo**: "permiso de ubicación denegado" con Chrome. Por mirar: el permiso de
    Chrome, la ubicación del perfil de trabajo y `chrome://policy` (puede que la empresa la bloquee).
    La prueba rápida: Google Maps en Chrome; si tampoco localiza, es el teléfono.
  - **Móvil viejo del panel**: Chrome dice "esta aplicación no se puede instalar". La web cumple lo
    que pide Chrome (comprobado el 18/10); causa probable en el móvil: una copia vieja instalada,
    poco espacio, Google Play desactualizado o el permiso de instalar apps. **Hacer copia del
    cuaderno antes de desinstalar nada.**

**Por dónde seguir:**
1. **Leer el log de la prueba en carretera** del 18/10 y sacar conclusiones (Overpass, marcas,
   peticiones por hora). Con eso, dar por buenas las 15 tarjetas de la sesión 49 (D3).
2. **Comprobar que el móvil del panel tiene la v21** (vista 2 con montañas, vista 4 con un radar
   redondo) y probar la fluidez del radar y del paisaje ahí (regla 1).
3. **Otra prueba en carretera** con la v21: marcas, cuaderno en casa, radar y paisaje. Contestar
   las preguntas de las specs 002 y 003.
4. Lo que salga de ahí, y después `PENDIENTES.md`.

**Pendiente de mí:**
- Lo de los dos móviles de arriba (y contarte qué salió).
- Contestar las preguntas de las specs 002 y 003 tras verlas en el coche (en la 002, también si me
  vale ~1 MB por hora de relieve o prefiero menos detalle).
- Qué hacer con los ficheros archivados y las carpetas viejas (D11, D12).
