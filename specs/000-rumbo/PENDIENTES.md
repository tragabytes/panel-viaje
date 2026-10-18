# Pendientes

Mejoras pequeñas que no se han hecho todavía, para no perderlas. Cada una dice qué pasa, dónde se
vio y qué haría. Cuando una se haga, se borra de aquí y se apunta en `DECISIONES.md`.

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
