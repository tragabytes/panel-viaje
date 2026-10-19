# Mensaje de arranque para una sesión nueva

Abre la sesión en `C:\Users\Laureano de Tomas\proyectos\panel-viaje` y pega esto:

---

Seguimos con el panel de viaje, que ahora es un **cuaderno de viaje**. Todo en español, también tu
razonamiento y las descripciones de los comandos.

Lee, por este orden:
1. `CLAUDE.md` (mapa del proyecto y reglas propias).
2. `specs/000-rumbo/vision.md` (qué quiero que sea y en qué orden).
3. `specs/000-rumbo/DECISIONES.md`, sobre todo de D26 en adelante (lo último que se hizo, con la
   revisión en D34).
4. `specs/000-rumbo/PENDIENTES.md` (las dos funcionalidades grandes apuntadas y lo que espera decisión).
5. `specs/004-vistas-1-y-3/propuesta.md` (las vistas 1 y 3: la 1 se quedó como estaba y la 3 pasó a postales).
6. Las specs 001, 002 y 003 con sus `tasks.md`, si vas a tocar el cuaderno, el radar o el paisaje.
7. `MANTENIMIENTO.md` si vas a probar o publicar (y su sección 7 si algo falla en un móvil).

**Estado (18/10, noche, cierre de sesión).**
- **Publicado** en https://tragabytes.github.io/panel-viaje/: la **v23**
  (`v23-2026-10-18-postales`, el 18/10 a las 19:26). Lleva las mejoras pequeñas de la v22
  (DECISIONES D26-D34): los seis pendientes arreglados (provincia, nombre de vía, datos del pueblo
  anterior, límite sin cobertura, pueblos de Wikipedia que no eran pueblos, próxima salida sin
  rumbo), modo noche, radar que se acerca a 6 km en ciudad, «Aquí marcaste», marcas a Google Maps
  (KML), el código reorganizado y el tick del GPS a prueba de fallos, más los 16 arreglos de la
  revisión (D34).
  y, además, la vista 3 con postales, la opción que elegí (D36).
- Desde la v20 las versiones entran solas en el móvil, con el coche parado (D24).
- **Publicada el 19/10 a las 7:41**: la **v24** (`v24-2026-10-18-logs-nube`): los logs de cada viaje
  se suben solos a un repositorio privado de GitHub (`tragabytes/panel-viaje-logs`) que borra lo de
  más de 30 días (spec 005, D38). El repositorio y su limpieza ya existen; **falta que pegue la clave en
  `?logs=1` del móvil**. Después, "revisa los logs" se hace con `python infra/leer-logs.py`
  (MANTENIMIENTO, sección 8).
- **Ningún móvil tiene confirmada la v23 todavía.** Los que tenían una versión anterior a la v20
  necesitan una vez la actualización a mano (MANTENIMIENTO, sección 4).
- El 18/10 hice una prueba en carretera con la v18. Su log (`?logs=1`) sigue sin leer: dirá si
  Overpass responde con los datos del móvil, cómo fue marcar y cuántas peticiones por hora.
- Desde casa, Overpass no funcionaba el 18/10 (`overpass-api.de` colgado, `private.coffee` sin CORS
  en los errores): los pueblos salen del plan B de Wikipedia, ahora filtrado por la descripción.
- **Dos problemas abiertos en mis móviles** (no son fallos del panel; MANTENIMIENTO, sección 7): el
  S22 del trabajo con "permiso de ubicación denegado" y el móvil viejo que dice "esta aplicación no
  se puede instalar". **Copia del cuaderno antes de desinstalar nada.**

**Por dónde seguir:**
1. **Leer los logs** con `python infra/leer-logs.py` en cuanto la clave esté puesta (la primera
   subida trae los 10 viajes que guarda el móvil: el trayecto por Las Rozas del 18/10 y la prueba
   en carretera de ese día) y sacar conclusiones.
2. **Otra prueba en carretera** con la v23: marcas, «Aquí marcaste», modo noche al anochecer, radar
   en ciudad y en autovía, paisaje, postales. Contestar las preguntas de las specs 002 y 003.
3. Las dos funcionalidades grandes de `PENDIENTES.md` (nota de voz, horizonte de verdad): spec
   antes de construir.

**Pendiente de mí:**
- Crear la clave de GitHub y pegarla en `?logs=1` del móvil del panel (D38).
- Decir si el 70 % del modo noche está bien, después de verlo al anochecer (D29).
- Lo de los dos móviles y las preguntas de las specs 002 y 003 tras verlas en el coche.
- Qué hacer con los ficheros archivados y las carpetas viejas (D11, D12).
