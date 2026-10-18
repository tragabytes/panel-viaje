# Rumbo: un cuaderno de viaje para el coche

**Fecha**: 2026-09-30 · **Estado**: los seis deseos construidos el 18/10; falta probarlos en el coche

**Lo que se pidió** (30/09, por la noche): "quiero que sea mi cuaderno de viaje. La llevaré
conectada en mi coche al lado del gps y a medida que vayamos pasando por pueblos o sitios chulos
quiero poder marcarlos y guardarlos para luego investigarlos. Quiero que las animaciones del clima
sean extremadamente detallistas y chillout y quiero que la vista de los pueblos cercanos se sienta
como mirar un radar ¿tal vez incluso con el relieve?. Quiero que la app sea excelente desde el punto
de vista del diseño y la usabilidad, quiero que cargue rápido. Su posición normal será apaisada."

## Dónde está cada deseo (18/10/2026)

| Deseo | Estado |
|---|---|
| 1. Marcar sitios y guardarlos para investigarlos | **Hecho** (spec 001): toque largo de 1 s, la marca guarda lo que había alrededor, y el cuaderno (`?cuaderno=1`) para revisarlas en un mapa, elegir "era esto", anotar y compartir |
| 2. Pueblos cercanos como un radar, con relieve | **Hecho** (spec 002): gira con la marcha, anillos, barrido, relieve con curvas de nivel |
| 3. Animaciones del tiempo detallistas y chillout | **Hecho** (spec 003): paisaje lo-fi que cambia con la hora y el tiempo reales. Es tu idea de chillout (18/10) |
| 4. Excelente en diseño y usabilidad | Arreglados los dos fallos de uso que más pesaban (Overpass lento, datos viejos como actuales) y dos de la vista 2 (palabra cortada, previsión que se salía). El 18/10 por la noche: modo noche, radar que se acerca en ciudad, «Aquí marcaste», marcas a Google Maps y seis arreglos (D26-D33). **Las vistas 1 y 3 con el estilo nuevo esperan tu elección** (spec 004). Lo demás, en la prueba en carretera |
| 5. Que cargue rápido | La app ya cargaba rápido; la vía ya no se queda esperando a un servidor caído (D13) |
| 6. Apaisado | Sigue siéndolo; el cuaderno también funciona en vertical |

Lo de abajo es el análisis del 30/09, que se conserva como explicación del porqué.

## El cambio de fondo

En 49 sesiones el panel se construyó como **pantalla informativa**: enseña cosas y no se toca. Lo
que describes es otra cosa: un **compañero de viaje que recuerda por ti**. Casi todo lo construido
sirve (ubicación, pueblos cercanos, puntos de interés, meteo, logs de viaje), pero cambia para qué
existe y qué es lo más importante.

## Tus seis deseos, uno a uno

### 1. Marcar sitios al pasar para investigarlos luego — **nuevo**

Hoy no existe. Es el corazón de la idea y lo más barato de construir: el panel ya sabe en cada
momento dónde estás, hacia dónde vas y qué hay alrededor; solo falta guardarlo cuando tú lo digas.

Spec: [`specs/001-cuaderno-de-viaje/`](../001-cuaderno-de-viaje/spec.md), con **tres preguntas
para ti**.

### 2. Pueblos cercanos como un radar, quizá con relieve — **evolución de V4**

La vista 4 ya es medio radar: pone los pueblos por dirección y distancia alrededor de un punto
"AQUÍ", en 15 km. Le falta lo que hace que *se sienta* radar: anillos de distancia, que gire con la
marcha (lo que tienes delante, arriba), un barrido lento, y el relieve debajo.

**El relieve es viable, comprobado esta noche:**
- Hay una fuente gratuita, sin clave y que el navegador puede usar: las teselas de elevación de
  Amazon (Terrain Tiles, formato "terrarium"). Probadas con llamadas reales: responden en ~0,5 s.
- Cada tesela cubre ~30 km de lado y pesa ~125 KB. Un radar de 15 km necesita entre 1 y 4.
- El relieve no cambia (esas teselas son de 2017), así que se guardan en el móvil **para siempre**:
  ~0,5 MB por hora de viaje por zonas nuevas, y **0 en zonas ya recorridas**.
- A comprobar: que el móvil viejo dibuje el sombreado del relieve sin tirones. Se calcula una vez
  por tesela, no en cada fotograma, así que debería.

El radar es también el sitio natural para que un copiloto marque un pueblo concreto (deseo 1).

### 3. Animaciones del tiempo extremadamente detallistas y chillout — **evolución de V2**

Hoy la vista 2 ya tiene sol y luna según la hora, lluvia y nieve con viento real, tormenta con
rayos y niebla. "Chillout" encaja con la regla de seguridad (lento, calmado, nada que destelle).

**El choque que tienes que conocer**: "extremadamente detallista" y "móvil viejo" tiran en
sentidos contrarios. El panel ya se degrada solo si la niebla va a tirones, y cada efecto nuevo se
tendrá que medir en ese móvil. Si algún día quieres subir mucho el listón, un Android de segunda
mano más reciente cambiaría lo que es posible; es tu decisión y no hace falta ahora.

Para escribir su spec necesito **referencias tuyas**: dos o tres vídeos o imágenes de lo que para ti
es "chillout" (un fondo de pantalla animado, un vídeo lo-fi, un juego…). Sin eso, estaría adivinando
tu gusto.

### 4. Excelente en diseño y usabilidad — **transversal**

Lo que esta noche he visto que más falla no es estético sino de uso:
- **Sin cobertura, el panel afirma datos viejos como si fueran actuales** (en Galapagar seguía
  diciendo "Las Rozas · A-6").
- **La vía puede tardar más de un minuto en aparecer** cuando falla un servidor de Overpass.

Antes que pulir, que lo que dice sea verdad y llegue a tiempo. Para lo visual, propongo trabajar como
en `temario-eir`: **maquetas antes de código**, que puedas ver y elegir.

### 5. Que cargue rápido — **la app ya carga rápido; los datos, no**

Medido esta noche: la app entera pesa ~170 KB comprimida la primera vez, y después arranca desde la
memoria del móvil, sin descargar nada. Lo que tarda es lo de fuera: el GPS en fijar posición y los
servidores (sobre todo Overpass) en contestar. Así que "cargar rápido" aquí significa:
- arreglar cómo se gestiona un servidor que no contesta (ver `DECISIONES.md`, D7), y
- enseñar al arrancar lo último que se sabía, marcado como tal, en vez de pantallas vacías.

### 6. Apaisado — **ya lo es**

Todo el panel está diseñado para apaisado. Se mantiene como la posición normal; el modo cuaderno
(revisar marcas en casa) es el único sitio donde tendría sentido admitir vertical.

## Orden que propongo

1. ~~**Arreglos de fiabilidad** (Overpass y datos viejos)~~ — hecho el 18/10 (D13, D14).
2. ~~**Cuaderno, H1: marcar sin mirar**~~ — hecho y publicado el 18/10 (D16).
3. **Prueba en carretera** con marcas reales y el log del viaje — hecha el 18/10 con la v18; falta
   leer su log.
4. ~~**Cuaderno, H2 y H3**~~ — hechos el 18/10 sin esperar a la prueba, por encargo tuyo (D18, D19).
5. ~~**Radar con relieve** (spec 002)~~ — hecho el 18/10 (D20).
6. ~~**Meteo chillout** (spec 003)~~ — hecho el 18/10 sin tus referencias (D21).

Cada paso se prueba en el coche antes del siguiente: los cuatro últimos van juntos a la próxima
prueba.
