# Especificación: Radar con relieve

**Carpeta**: `specs/002-radar-relieve/` · **Fecha**: 2026-10-18 · **Estado**: construida, sin probar en el coche

**Lo que se pidió** (30/09): "quiero que la vista de los pueblos cercanos se sienta como mirar un
radar ¿tal vez incluso con el relieve?".

> Esta spec se escribió **después** de construirlo: el 18/10 me pediste que lo hiciera todo sin
> esperarte ("toma por mí todas las decisiones"). Lo que decidí yo va marcado con **(decidido)**
> para que lo revises; cambiarlo es barato.

## Qué es

La cuarta vista deja de ser un mapa abstracto con chinchetas repartidas a ojo y pasa a ser un
**radar de verdad**: un disco con lo que tienes delante arriba, los pueblos en su sitio real y el
relieve del terreno debajo.

- **Gira con la marcha.** Lo de delante, siempre arriba. Una "N" en el borde del disco dice dónde
  queda el norte. Parado (menos de 5 km/h) el disco se queda quieto: el rumbo del GPS a esa
  velocidad no vale nada.
- **Anillos cada 5 km**, hasta 15 km, con su distancia escrita.
- **Un barrido lento** (una vuelta cada 8 s) que ilumina cada pueblo al pasar por encima, como el
  eco de un radar. **(decidido)**: 8 s, verde fósforo muy tenue.
- **Los pueblos cercanos** como ecos con su nombre y su distancia. Los nombres no se pisan: si dos
  chocan, uno se pone al otro lado de su punto, y si no cabe, se queda solo el punto. Un pueblo que
  se ha quedado fuera de los 15 km sale pegado al borde y apagado, hasta que el panel refresca la
  lista.
- **Tus marcas del cuaderno** que caen dentro del radar salen como rombos ámbar. **(decidido)**:
  sin nombre, para no llenar el disco.
- **El relieve**: laderas iluminadas desde el noroeste, curvas de nivel cada 100 m (más marcadas
  cada 500 m), el mar en azul muy oscuro y la línea de costa resaltada. Todo en verde oscuro, para
  que los nombres se lean encima.
- **A la izquierda**, el nombre de la zona en grande y, abajo, el rumbo (por ejemplo "NO · 312°"),
  la **altitud del terreno** donde estás (sale del propio relieve, sin pedir nada más) y las
  coordenadas.

## De dónde sale el relieve, y lo que cuesta

- **Fuente**: las teselas de elevación de Amazon ("Terrain Tiles"), gratuitas, sin clave y
  utilizables desde el navegador. Probadas con llamadas reales el 30/09 y el 18/10.
- **Cada tesela** cubre unos 30 km de lado y pesa unos 135 KB. El radar necesita entre 1 y 4.
- **Se guardan en el móvil para siempre** (el relieve no cambia), con un tope de 300 teselas,
  unos 40 MB: si se llena, se borran las que hace más tiempo que no se usan. Por las zonas ya
  recorridas, **cero datos**.
- **Solo se piden con la vista 4 en pantalla.** Si vas en la vista 1 todo el viaje, el radar no
  gasta nada. **(decidido)**, por la regla de que los datos cuestan.
- **Sin cobertura**, el radar funciona igual sin el relieve de las zonas nuevas, y lo vuelve a
  intentar pasado un rato (no en bucle).
- **Calculado a 100 km/h por zonas nuevas**: unos 135 KB cada 18 minutos con la vista 4 abierta,
  menos de 0,5 MB por hora.

## Casos raros

- **El GPS del móvil viejo no da rumbo**: el panel lo calcula entre dos posiciones separadas al
  menos 25 m. Este cálculo sirve también a las marcas del cuaderno.
- **Media vuelta (180°)**: el disco gira por el camino corto y las etiquetas siguen derechas.
- **Sin pueblos** (Overpass caído): el radar enseña el relieve y los anillos, sin ecos.
- **Pantalla en vertical**: el radar se centra debajo del nombre de la zona.

## Lo que no se ha podido comprobar

- **Que el móvil viejo lo mueva sin tirones.** En el ordenador va fluido, y casi todo lo mueve la
  tarjeta gráfica (giro, barrido, ecos), no el procesador. Pero la regla 1 dice que solo cuenta el
  móvil. Si va a tirones, lo primero a quitar es el barrido.
- **La alineación fina del relieve con la realidad** en carretera: los cálculos están probados
  con tests, pero hay que mirar en el coche que un monte que ves a la izquierda está a la
  izquierda en el radar.

## Preguntas para ti (cuando lo veas en el coche)

1. ¿El giro con la marcha te ayuda o te marea? La alternativa es el norte siempre arriba.
2. ¿El barrido distrae? Se puede quitar o hacer más lento.
3. ¿Quieres ver también los puntos de interés (castillos, iglesias…) en el radar, o solo pueblos?
