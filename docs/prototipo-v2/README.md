# Prototipo V2 — referencia del rediseño

Este directorio contiene el prototipo que generó Claude Design (Anthropic Labs) como entregable de la tarjeta Kanvas **IU-17** el 24 de abril de 2026. Es la **fuente canónica de diseño** para el rediseño completo del front del panel (tarjetas **IU-18 a IU-24** del grupo *UI / Experiencia V2*).

## Cómo abrirlo

Abre `prototipo-final.html` directamente en un navegador moderno. El prototipo carga React 18 y Babel desde `unpkg.com`, así que **requiere conexión a internet** para renderizarse.

Teclas: `←` / `→` o swipe para navegar las 4 vistas. Botón *Exceso ON* para previsualizar el efecto de velocidad excesiva.

## Qué es (y qué no es)

- **Es:** referencia visual, tipográfica y de interacción. Los ficheros CSS son la spec directa de los tokens y componentes que se van a portar a vanilla JS.
- **No es:** código de producción. El panel real es vanilla JS sin frameworks (ver `CLAUDE.md` §10). El HTML y los JSX de este directorio **no** deben copiarse tal cual al `index.html` ni al `js/` del proyecto.

## Contenido

| Archivo | Rol | Tarjetas que lo usan |
|---|---|---|
| `prototipo-final.html` | Página que monta las 4 vistas con swipe | Todas (visión general) |
| `styles/system.css` | Tokens globales: paleta HUD fósforo, tipografías, scanlines, placeholders | **IU-18** (base) |
| `styles/p1.css` | Estilos de la V1 principal y la V3 POIs | **IU-19** (V1), **IU-21** (V3) |
| `styles/p3.css` | Estilos de la V2 meteo expresiva y la V4 cartografía | **IU-20** (V2), **IU-22** (V4) |
| `proposals/p1-conservative.jsx` | Componentes React de la propuesta conservadora (V1 y V3) | **IU-19**, **IU-21** |
| `proposals/p3-risky.jsx` | Componentes React de la propuesta arriesgada (V2, V4 + modo rural de bonus) | **IU-20**, **IU-22** |

## Decisiones ya fijadas sobre el prototipo

- **Fuentes self-host** en `/fonts/` (no Google Fonts): menos peticiones, offline con el service worker.
- **Etiquetas meteo cortas** (≤10 caracteres): DESPEJADO, NUBOSO, LLUVIA, TORMENTA, NIEVE, NIEBLA... Se mapean a códigos WMO en `js/meteo_codigos.js`.

## Ideas no adoptadas todavía

El archivo `p3-risky.jsx` contiene una **V1 modo rural** (cuando circulas por secundaria, el nombre del pueblo toma protagonismo con Archivo Black grande) que no entró al prototipo final pero queda parqueada como idea futura.
