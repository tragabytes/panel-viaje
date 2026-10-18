# Tareas — 003 Meteo chillout

Estado del trabajo. Se marca cada casilla al cerrarla. Lo imprevisto se anota aquí y se avisa.

## Construcción (18/10/2026, sin Laureano ni sus referencias: ver DECISIONES D21)
- [x] Paisaje por capas: cielo continuo, sol con su arco, luna con su fase, estrellas, tres cordilleras
- [x] Pinos y casas con luz; nubes por nubosidad y viento; niebla en los valles
- [x] Tormenta como resplandor suave, sin rayos (regla 3)
- [x] Las montañas se deslizan con la velocidad del coche; todo se para fuera de la vista 2
- [x] Vigilante de fluidez y modo quieto (`?paisaje=ligero`, `?paisaje=completo`)
- [x] Banderas para verlo: `?meteo=` y `?hora=`
- [x] Tests: fase lunar, sol, paleta oscura, tiempo, niebla, montañas sin costura
- [x] Arreglos de la vista 2: palabra cortada, previsión que se salía
- [x] Retirados los efectos anteriores (rayos, niebla con filtro, sol y nubes de dibujo)
- [x] Probar en el simulador: mediodía, atardecer, noche, lluvia, niebla, tormenta, nieve
- [x] Revisión de fallos (DECISIONES D22)

## Pendiente
- [ ] Probar en el móvil del panel: fluidez (si el vigilante lo deja quieto, saldrá en el log)
- [ ] Que Laureano diga si es su idea de chillout (si no, referencias y rehacer el estilo)
- [ ] **Parar y validar con Laureano**

## Aprendido
- **Una regla de estilo antigua (`#vista2 > *:not(...)`) pisaba el `position: absolute` del bloque
  de texto** y lo desplazaba 16 px hacia abajo: por eso la previsión se cortaba desde hace tiempo.
  Al quitar los efectos viejos salió a la luz.
