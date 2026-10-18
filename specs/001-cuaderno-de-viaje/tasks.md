# Tareas — 001 Cuaderno de viaje

Estado del trabajo. Se marca cada casilla al cerrarla. Lo imprevisto se anota aquí y se avisa.

> Escrito con mis recomendaciones a las tres preguntas de la spec. El 18/10 Laureano eligió las
> mismas en la 1 y la 3, pidió H1 "tal como está en la spec" y, después, que hiciera H2 y H3
> decidiendo yo (la pregunta 2 incluida). Las tres están construidas; falta el coche.

## Antes de empezar
- [x] Laureano contesta las tres preguntas de la spec (se anotan allí con fecha) — 1 y 3 el 18/10; la 2 la decidí yo ese día por encargo suyo (D19)
- [x] Laureano valida la spec (18/10: "tal como está en la spec")

## H1 · Marcar un momento sin mirar (el MVP)
- [x] Tests que fallan primero: deslizar entre las 4 vistas no crea marcas; dos marcas en menos de 10 s son una; marcar sin red no hace ninguna petición; las marcas sobreviven a 11 viajes seguidos (rotación de logs) y a un cambio de `SW_VERSION`
- [x] Guardar la marca: hora, posición, precisión, sentido de la marcha y velocidad, en un almacén propio, separado de cachés y de logs
- [x] Pedir al navegador que ese almacén no se limpie solo
- [x] El gesto (toque largo) en las 4 vistas, sin chocar con el deslizamiento
- [x] La confirmación discreta en la cabecera (2 s)
- [x] Probar en el simulador (3 marcas en una ruta, recargar, siguen ahí)
- [ ] Probar en el móvil del panel por cable: el toque largo se hace sin mirar y no se dispara solo
- [x] Publicar (subir `SW_VERSION`, `node --test` en verde) — v18, 18/10
- [ ] **Parar y validar con Laureano en el coche** — prueba en carretera del 18/10 en marcha

## H2 · Qué había alrededor
- [x] La marca guarda lo que el panel ya sabía: municipio, vía, pueblos cercanos (distancia y dirección), puntos de interés y tiempo
- [x] Sin datos en el momento de marcar: se guarda lo que haya y se completa cuando vuelva la red — al abrir el cuaderno con internet (D18)
- [ ] **Parar y validar**

## H3 · Revisar el cuaderno
- [x] Modo cuaderno aparte (como `?logs=1`): marcas por viaje, con fecha, hora y municipio — `?cuaderno=1`, atajo en el icono de la app y enlace desde `?logs=1`
- [x] Cada marca en un mapa con el sentido de la marcha y los candidatos alrededor (atrás y a los lados también)
- [x] Elegir "era esto", nota, borrar, abrir en Wikipedia o Google Maps
- [x] Exportar todas (copia de seguridad) — y también importar (solo añade) y compartir como texto
- [ ] **Parar y validar**

## Mejoras (18/10, noche: DECISIONES D31 y D32)
- [x] «Aquí marcaste»: aviso al volver a pasar junto a una marca de otro momento (una vez al mes por marca)
- [x] Llevar las marcas a Google My Maps o Google Earth (KML desde el menú ⋯)
- [ ] Probar en el coche que el aviso salta donde debe y no molesta

## Cierre
- [x] `node --test` en verde
- [ ] Prueba en carretera: al menos 5 marcas, 0 falsas en 30 min (E-002, E-003)
- [ ] Una línea en `specs/000-rumbo/RELEVO.md` apuntando aquí

## Aprendido

- **Las marcas de la primera versión (H1, sin "lo que había alrededor") se completan solas** al
  abrir el cuaderno con internet: pueblo y vía con Nominatim, pueblos con Overpass y, si Overpass
  no contesta, con Wikipedia (el mismo respaldo que el panel).

- **Que las marcas sobrevivan se vigila sobre el código**, no con 11 viajes de verdad: Node no
  tiene IndexedDB. Los tests comprueban que solo `cuaderno.js` nombra su base de datos (ni la
  rotación de trayectos ni el service worker pueden abrirla ni borrarla), que no hay borrados en
  bloque y que el service worker no toca IndexedDB. En el simulador, 5 marcas sobrevivieron a una
  recarga y a un cambio de `SW_VERSION`.
- **"Persistente" denegado en el navegador de pruebas.** Chrome lo concede según el uso (sobre
  todo si está instalado en la pantalla de inicio). El log del viaje dice si se concedió en el
  móvil del panel.
