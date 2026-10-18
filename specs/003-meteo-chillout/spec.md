# Especificación: Meteo chillout

**Carpeta**: `specs/003-meteo-chillout/` · **Fecha**: 2026-10-18 · **Estado**: construida, sin probar en el coche

**Lo que se pidió** (30/09): "quiero que las animaciones del clima sean extremadamente detallistas
y chillout".

> Esta spec se escribió **después** de construirlo y **sin tus referencias** de lo que para ti es
> "chillout": el 18/10 me pediste que decidiera yo. Lo que decidí va marcado con **(decidido)**.
> Si cuando lo veas no es tu idea de chillout, mándame dos o tres imágenes o vídeos y lo rehago:
> está hecho por capas y cambiar el estilo es barato.

## La idea (decidido)

La vista 2 deja de ser un fondo de color con efectos sueltos (un sol en la esquina, rayos de luz,
nubes de dibujo, rayos de tormenta) y pasa a ser **un paisaje que respira el tiempo de verdad**,
con el estilo de los fondos "lo-fi" y de juegos como Alto's Odyssey: capas de montañas, colores
suaves que cambian con la luz y movimientos lentos.

## Qué se ve

- **El cielo** cambia de color **de forma continua** según la hora real de salida y puesta del sol
  del sitio donde estás (los da la propia previsión): azul profundo de día, horizonte cálido y
  morado al amanecer y al atardecer, casi negro de noche. Siempre oscuro, porque se mira
  conduciendo.
- **El sol** recorre su arco de verdad: sale por un lado, sube, y se pone detrás de las montañas,
  más grande y más rojo cuanto más bajo. **De noche, la luna**, con **su fase real** de ese día
  (creciente, llena, menguante).
- **Las estrellas** de noche, que titilan muy despacio, y una **Vía Láctea** apenas insinuada.
- **Tres cordilleras** una detrás de otra, más claras cuanto más lejos (perspectiva atmosférica),
  con **pinos** en la más cercana y **tres casitas que encienden la luz** cuando oscurece (o cuando
  el día está muy cerrado).
- **Las montañas se deslizan muy despacio** hacia un lado **solo cuando el coche se mueve**, cada
  cordillera a su velocidad (las cercanas más rápido). Parado, el paisaje se queda quieto. A
  100 km/h la más cercana se mueve unos 5 píxeles por segundo: se nota con el tiempo, no de golpe.
- **Las nubes** según la nubosidad real (de ninguna a un techo cerrado), y **se mueven con el
  viento real**: más deprisa con más viento, hacia donde sopla.
- **Niebla en los valles** cuando hay niebla, en las mañanas muy húmedas y con poca visibilidad.
- **La lluvia y la nieve** de siempre (ya estaban bien hechas), por delante del paisaje.
- **La tormenta**: el cielo se cierra y oscurece y, cada 15-35 s, **un resplandor suave dentro de
  las nubes**. **(decidido)**: sin rayos. Un rayo es un destello, y la regla 3 dice "nada que
  destelle".

Encima, el texto de siempre (la palabra grande, la temperatura, el viento, la previsión), con un
velo oscuro detrás para que se lea sobre cualquier cielo.

## Arreglos de paso en la vista 2

- **La palabra grande se cortaba** en el móvil ("DESPEJAD"): ahora caben las de 9 letras
  (DESPEJADO, CHUBASCOS, AGUANIEVE).
- **La previsión por horas se salía por abajo**: una regla de estilo antigua descolocaba todo el
  bloque de texto 16 px hacia abajo. Ahora caben **5 horas** (antes se veían 3 enteras). El
  rótulo pasa de "PRÓX. 6H" a "PRÓXIMAS HORAS".

## Lo que cuesta

- **Datos: nada.** Todo se dibuja en el móvil con lo que ya trae la previsión.
- **Procesador**: cada capa se dibuja una sola vez (al cambiar el tiempo, o cada pocos minutos
  con la luz) y después solo se desplaza, cosa que hace la tarjeta gráfica sin gastar procesador.
  Fuera de la vista 2, todo se para.
- **Si el móvil no llega**: el panel mide la fluidez las dos primeras veces que entras en la
  vista 2; si no llega a 24 imágenes por segundo, el paisaje se queda quieto (sigue igual de
  bonito, pero sin moverse). Con una mala medida, solo ese viaje; con dos seguidas, para siempre en
  ese móvil (se deshace con `?paisaje=completo`).

## Para verlo sin esperar al tiempo

- `?meteo=lluvia` (o tormenta, nieve, niebla, nublado, cubierto, llovizna, chubascos, despejado)
  pinta ese tiempo.
- `?hora=21:30` pinta el paisaje a esa hora (solo el paisaje; los datos siguen siendo los reales).
- Se pueden juntar: `?sim=pedania-maragata&meteo=nieve&hora=17:45`.

## Lo que no se ha podido comprobar

- **Que el móvil viejo lo mueva sin tirones** (regla 1). Es lo primero que hay que mirar.
- **Si es tu idea de chillout.** Sin tus referencias, es la mía.

## Preguntas para ti

1. ¿Es chillout para ti? Si no, dos o tres referencias y lo rehago.
2. ¿Te gusta que las montañas se muevan con el coche, o lo prefieres quieto?
3. ¿Echas de menos los rayos de la tormenta? Se pueden volver a poner, suaves.
