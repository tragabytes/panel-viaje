# Pendientes

Lo que queda por hacer, para no perderlo. Cada cosa dice qué es, de dónde sale y qué haría. Cuando
una se haga, se borra de aquí y se apunta en `DECISIONES.md`.

## Funcionalidades (pedidas por ti el 18/10)

Las dos llevan su spec antes de construirlas (qué hace, para quién, qué pasa en los casos raros).

### Nota de voz al marcar

> Es lo que más falta en el cuaderno: en casa tienes que adivinar qué viste. Al marcar, si sigues
> con el dedo puesto, graba lo que digas («castillo arriba a la izquierda») hasta que lo sueltas.
> Todo sin mirar y guardado solo en el móvil. Para ti: reconocer cada marca sin dudas.

Lo que habrá que resolver en la spec:
- **El permiso del micrófono** lo pide Chrome la primera vez. Esa pregunta no puede salir
  conduciendo: habrá que concederlo antes, parado (por ejemplo desde el cuaderno).
- **Cómo sabes sin mirar que está grabando**: una vibración al empezar y otra al guardar, o un
  pitido.
- **Dónde se guarda**: en el móvil, junto a la marca. Unos 40-80 KB por cada 10 segundos. Es dato
  tuyo: ninguna limpieza lo borra (regla 9), y la copia de seguridad del cuaderno tendrá que
  llevarlo dentro.
- **Pasarlo a texto** se haría con el reconocimiento de voz de Google, que manda el audio por
  internet. Como pides que quede solo en el móvil, en principio **sin transcribir**: el audio se
  escucha en el cuaderno.

### El horizonte de verdad en el paisaje

> Que las montañas del fondo de la vista 2 sean la silueta real del terreno que tienes delante,
> sacada del mismo relieve del radar. Es el detalle más bonito que se me ocurre, y no gasta datos.

Lo que habrá que resolver en la spec:
- **Hasta dónde se ve.** El relieve del radar cubre 16,5 km alrededor. Con eso salen los montes
  cercanos, no la sierra que se ve a 60 km (Gredos desde Madrid). Para esa, unas pocas teselas
  más bastas: ~100 KB cada una, que cambian muy de tarde en tarde.
- **"No gasta datos" solo si el radar ya bajó ese relieve.** Si un viaje no abres la vista 4, la
  vista 2 tendría que bajarlo ella (lo mismo que gasta el radar, ~1 MB por hora).
- **Necesita saber hacia dónde vas**, y el móvil viejo no da el rumbo: se usaría el calculado entre
  posiciones (el que ya usan el radar y las marcas). Parado o al arrancar, la última silueta buena.
- **Las tres cordilleras de ahora** se quedarían como capas de en medio y de delante; solo la del
  fondo pasa a ser la real.

## Esperan tu decisión

1. **Dos carpetas de trabajo viejas** (`.claude/worktrees/`) y los **ficheros archivados** del
   método anterior (tablero Kanvas, su herramienta, las skills de Obsidian, el generador del Word).
   Esperan tu decisión (DECISIONES D11 y D12).

Las seis mejoras pequeñas que había aquí se hicieron el 18/10 por la noche (DECISIONES D27); la del
simulador descargado en el panel de verdad se descartó (D27, n.º 7).
