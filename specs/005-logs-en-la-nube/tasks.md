# Tareas — 005 Los logs del viaje en la nube

Estado del trabajo. Se marca cada casilla al cerrarla. Lo imprevisto se anota aquí y se avisa.

## Antes de empezar
- [x] Laureano contesta las tres preguntas (18/10): repositorio privado de GitHub, 30 días, se suben solos
- [ ] **Laureano valida la spec**

## H1 · El log de cada viaje llega solo
- [ ] Tests que fallan primero: un log ya subido y sin cambios no se reenvía; tras un fallo sigue pendiente; ningún fichero publicado contiene algo con forma de clave de GitHub
- [ ] Crear el repositorio privado de los logs en la cuenta de GitHub de Laureano (con su OK)
- [ ] Subir el log comprimido al pasar a segundo plano o cerrar, y al abrir los que queden pendientes
- [ ] Sitio en `?logs=1` para pegar la clave, y guía paso a paso para crearla limitada a ese repositorio
- [ ] Probar en el simulador: un trayecto corto sube su log; sin clave no pasa nada; sin red queda pendiente y sube al volver
- [ ] Publicar (`SW_VERSION`, `node --test` en verde), con el "sube" de Laureano
- [ ] **Parar y validar**: un trayecto de verdad y leo su log desde el ordenador

## H2 · Se borran solos a los 30 días
- [ ] Limpieza de cada noche en el repositorio: fuera lo de más de 30 días desde que llegó, también del historial
- [ ] Probar con un log de prueba de hace 31 días y otro de hace 29
- [ ] **Parar y validar**

## H3 · Qué está subido, en `?logs=1`
- [ ] "Subido" o "pendiente" junto a cada viaje, botón "Subir ahora" y aviso si la clave ha dejado de valer
- [ ] **Parar y validar**

## Cierre
- [ ] `node --test` en verde, con los tests de los tres invariantes que pueden romperse en silencio
- [ ] Probar el flujo de verdad en el móvil del panel
- [ ] `MANTENIMIENTO.md`: cómo leo los logs de la nube, qué guarda el repositorio y cómo se revoca la clave
- [ ] Quitar de `PENDIENTES.md` la línea que apunta aquí
