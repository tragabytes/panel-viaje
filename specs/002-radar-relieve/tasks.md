# Tareas — 002 Radar con relieve

Estado del trabajo. Se marca cada casilla al cerrarla. Lo imprevisto se anota aquí y se avisa.

## Construcción (18/10/2026, sin Laureano: ver DECISIONES D20)
- [x] Comprobar la fuente de relieve con llamadas reales (CORS, peso, formato, mar y costa)
- [x] Relieve: bajar, guardar para siempre con tope de 300 teselas, sombrear y componer
- [x] Tests: proyección, teselas necesarias, alturas, sombreado, curvas, mar y costa
- [x] El service worker deja pasar las teselas (si no, acabarían en su caché sin tope)
- [x] Radar: disco que gira con el rumbo, anillos, barrido, ecos sincronizados, norte
- [x] Etiquetas sin pisarse ni tapar el coche; pueblos fuera del radio pegados al borde
- [x] Marcas del cuaderno como rombos
- [x] Rumbo calculado entre posiciones cuando el GPS no lo da
- [x] Probar en el simulador a 640×360 (giros normales y media vuelta)
- [x] Revisión de fallos (DECISIONES D22)
- [x] Escala según la velocidad: 6 km en ciudad, 15 en carretera, con zum (DECISIONES D30)

## Pendiente
- [ ] Probar en el móvil del panel: fluidez del giro y del barrido, y del zum al cambiar de escala
- [ ] Prueba en carretera: el relieve casa con lo que se ve; contestar las 3 preguntas de la spec
- [ ] **Parar y validar con Laureano**

## Aprendido
- **Girar con `transform` no vale para dos capas que se compensan.** En un giro de ~180°, Chrome
  interpola por matrices y el disco y las etiquetas tomaban sentidos distintos a mitad de
  transición: las etiquetas salían boca abajo. Ahora solo gira el relieve (con la propiedad
  `rotate`, que interpola el ángulo como un número) y los ecos se recolocan ya girados en cada tick.
