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

## Vistas en marcha

1. **El límite de velocidad no se atenúa sin cobertura.** Sin red se queda el de la última vía
   conocida, en blanco, aunque ya estés en otra carretera. Visto el 18/10 al hacer D14. *Propuesta*:
   atenuarlo como la vía (D8) o quitarlo. Decisión tuya: es información de seguridad.
2. **Pueblos cercanos que no son pueblos.** Cuando Overpass no contesta, la lista se rellena desde
   Wikipedia y se cuelan cosas como "Cofradía de la Entrada de Jesús en Jerusalén (Astorga)",
   "Sitios de Astorga", "País Leonés" o "Instituto Nacional de Toxicología". Visto el 30/09 (D9) y
   el 18/10 en el simulador. Debería bajar mucho con el arreglo de Overpass (D13): *mirar el log de
   la prueba en carretera antes de tocar nada*. Si sigue, endurecer el filtro de Wikipedia.
3. **Nombres de vía largos y repetidos**, como "Carretera de LE-142 por El Ganso a LE-142
   (Rabanal del Camino)". Vienen así de OpenStreetMap. *Propuesta*: acortar cuando el nombre
   repite el código.
4. **La población y la altitud de la cabecera pueden ser del pueblo anterior** un rato. Visto el
   18/10: "Galapagar · 99.037 hab · 718 m" (eran los datos de Las Rozas). Al cambiar de pueblo,
   el dato de población llega más tarde y mientras tanto se queda el viejo. *Propuesta*: borrarlo
   al cambiar de municipio hasta que llegue el nuevo.
5. **Provincia repetida con la comunidad**: en algunas marcas sale "Castilla y León" como
   provincia de Astorga (debería ser León). Visto el 18/10 en el contexto de una marca. *Mirar* qué
   devuelve Nominatim ahí antes de cambiar nada.
6. **La próxima salida usa el rumbo del GPS, que el móvil viejo no da.** Desde el 18/10 el panel
   calcula el rumbo entre posiciones (lo usan el radar y las marcas), pero la próxima salida sigue
   leyendo el del GPS. *Propuesta*: pasarle también el calculado, comprobándolo antes con el log.

## Mantenimiento

7. **El simulador se descarga también en el panel de verdad** (~7,5 KB). Poca cosa.
8. **Dos carpetas de trabajo viejas** (`.claude/worktrees/`) y los **ficheros archivados** del
   método anterior (tablero Kanvas, su herramienta, las skills de Obsidian, el generador del Word).
   Esperan tu decisión (DECISIONES D11 y D12).
