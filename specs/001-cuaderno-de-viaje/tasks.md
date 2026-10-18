# Tareas — 001 Cuaderno de viaje

Estado del trabajo. Se marca cada casilla al cerrarla. Lo imprevisto se anota aquí y se avisa.

> **Borrador.** Escrito con mis recomendaciones a las tres preguntas de la spec (toque largo,
> revisar primero en el propio móvil, marca = "este momento"). Si contestas otra cosa, se reescribe
> antes de empezar. No se ha tocado código.

## Antes de empezar
- [ ] Laureano contesta las tres preguntas de la spec (se anotan allí con fecha) — 1 y 3 contestadas el 18/10 como se recomendaba; falta la 2
- [ ] Laureano valida la spec

## H1 · Marcar un momento sin mirar (el MVP)
- [ ] Tests que fallan primero: deslizar entre las 4 vistas no crea marcas; dos marcas en menos de 10 s son una; marcar sin red no hace ninguna petición; las marcas sobreviven a 11 viajes seguidos (rotación de logs) y a un cambio de `SW_VERSION`
- [ ] Guardar la marca: hora, posición, precisión, sentido de la marcha y velocidad, en un almacén propio, separado de cachés y de logs
- [ ] Pedir al navegador que ese almacén no se limpie solo
- [ ] El gesto (toque largo) en las 4 vistas, sin chocar con el deslizamiento
- [ ] La confirmación discreta en la cabecera (2 s)
- [ ] Probar en el simulador (3 marcas en una ruta, recargar, siguen ahí)
- [ ] Probar en el móvil del panel por cable: el toque largo se hace sin mirar y no se dispara solo
- [ ] Publicar (subir `SW_VERSION`, `node --test` en verde)
- [ ] **Parar y validar con Laureano en el coche**

## H2 · Qué había alrededor
- [ ] La marca guarda lo que el panel ya sabía: municipio, vía, pueblos cercanos (distancia y dirección), puntos de interés y tiempo
- [ ] Sin datos en el momento de marcar: se guarda lo que haya y se completa cuando vuelva la red
- [ ] **Parar y validar**

## H3 · Revisar el cuaderno
- [ ] Modo cuaderno aparte (como `?logs=1`): marcas por viaje, con fecha, hora y municipio
- [ ] Cada marca en un mapa con el sentido de la marcha y los candidatos alrededor (atrás y a los lados también)
- [ ] Elegir "era esto", nota, borrar, abrir en Wikipedia o Google Maps
- [ ] Exportar todas (copia de seguridad)
- [ ] **Parar y validar**

## Cierre
- [ ] `node --test` en verde
- [ ] Prueba en carretera: al menos 5 marcas, 0 falsas en 30 min (E-002, E-003)
- [ ] Una línea en `specs/000-rumbo/RELEVO.md` apuntando aquí

## Aprendido
