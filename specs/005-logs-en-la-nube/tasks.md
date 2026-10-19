# Tareas — 005 Los logs del viaje en la nube

Estado del trabajo. Se marca cada casilla al cerrarla. Lo imprevisto se anota aquí y se avisa.

## Antes de empezar
- [x] Laureano contesta las tres preguntas (18/10): repositorio privado de GitHub, 30 días, se suben solos
- [x] Laureano valida la spec (18/10: "adelante")

## H1 · El log de cada viaje llega solo
- [x] Tests que fallan primero: un log ya subido y sin cambios no se reenvía; tras un fallo sigue pendiente; ningún fichero publicado contiene algo con forma de clave de GitHub; el service worker no guarda nada de la API de GitHub
- [x] Crear el repositorio privado de los logs (`tragabytes/panel-viaje-logs`, con su OK del 18/10)
- [x] Subir el log comprimido al pasar a segundo plano o cerrar, y al abrir los que queden pendientes (la primera vez, todos los del móvil)
- [x] Sitio en `?logs=1` para pegar la clave, y guía paso a paso para crearla limitada a ese repositorio
- [x] Probar en el navegador con una API de GitHub de mentira: sube los 10 viajes (el más largo, 54 KB), no reenvía lo que no ha crecido, con la clave mala lo dice y deja el viaje pendiente
- [x] Probar con la API de verdad (desde el ordenador, con su sesión de `gh`): subir, leer con tildes y borrar un log de prueba
- [x] Publicar (`SW_VERSION` v24, `node --test` en verde), con el "sube" de Laureano — 19/10, 7:41
- [ ] Laureano crea la clave y la pega en `?logs=1` del móvil del panel
- [ ] **Parar y validar**: un trayecto de verdad y leo su log desde el ordenador

## H2 · Se borran solos a los 30 días
- [x] Limpieza de cada noche en el repositorio: fuera lo de más de 30 días desde que llegó, también del historial (`infra/repositorio-logs/`)
- [x] Probar con un repositorio de prueba (31 días fuera, 29 se quedan, historial en un commit) y lanzarla de verdad en GitHub (apuntó la llegada de un log de prueba)
- [ ] **Parar y validar** (a los 30 días del primer log de verdad, que ya no esté)

## H3 · Qué está subido, en `?logs=1`
- [x] "Subido" o "pendiente de subir" junto a cada viaje, botón "Subir ahora" y aviso si la clave ha dejado de valer
- [ ] **Parar y validar**

## Cierre
- [x] `node --test` en verde, con los tests de los invariantes que pueden romperse en silencio
- [x] `MANTENIMIENTO.md`: cómo leo los logs de la nube, qué guarda el repositorio y cómo se anula la clave
- [ ] Probar el flujo de verdad en el móvil del panel
- [ ] Quitar de `PENDIENTES.md` la línea que apunta aquí

## Aprendido
- **El navegador de pruebas comparte los logs entre pestañas**: con el simulador abierto en otra
  pestaña, su viaje seguía creciendo y "Subir ahora" lo volvía a subir. Es lo correcto (había
  crecido), pero despista al probar.
