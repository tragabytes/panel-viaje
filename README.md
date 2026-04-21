# Panel de viaje

Panel informativo para coche que muestra en tiempo real, sobre un móvil Android colocado en el salpicadero, información contextual del lugar por el que se circula: ubicación administrativa, carretera actual, próxima salida en autovía, pueblos cercanos con sus puntos de interés, y previsión meteorológica.

**URL del panel:** https://tragabytes.github.io/panel-viaje/ *(disponible una vez activado GitHub Pages)*

## Qué hace

El panel se alimenta del GPS del propio móvil y se actualiza solo, sin necesidad de tocar nada mientras se conduce. Está pensado para usarse junto a un GPS principal (Google Maps, Waze) en el móvil principal, no como sustituto.

Tiene tres vistas deslizables horizontalmente:

1. **Vista completa** — toda la información en una sola pantalla.
2. **Vista ubicación + meteo** — solo ubicación y tiempo, con sistema de animaciones full-inmersión según las condiciones meteorológicas: sol/luna realista con momento del día, god-rays, estrellas de noche, lluvia y nieve en Canvas 2D con viento real, tormenta con rayos SVG bifurcados y eco cálido, niebla volumétrica con `feTurbulence`.
3. **Vista qué ver por la zona** — rejilla con los pueblos cercanos y sus puntos de interés histórico-monumentales, barra inferior de gasolineras cercanas.

## Stack técnico

- HTML, CSS y JavaScript vanilla (sin frameworks)
- Progressive Web App (PWA)
- Despliegue: GitHub Pages

## APIs utilizadas

Todas gratuitas y sin API key (en evaluación durante la fase 1):

- **Open-Meteo** — meteorología
- **Nominatim** (OpenStreetMap) — geocodificación inversa
- **Overpass API** (OpenStreetMap) — vías y puntos de interés
- **Wikipedia / Wikidata** — descripciones, fotos y datos de municipios

## Estructura del repositorio

```
/
├── index.html              Punto de entrada de la PWA (HTML + CSS + bootstrap JS)
├── README.md               Este archivo
├── CLAUDE.md               Constitución del proyecto para el asistente
├── canvas-tool.py          CLI del tablero Kanvas (gestión de tareas)
├── RULES.md                Reglas del flujo Kanvas
├── tablero.canvas          Tablero Kanvas (Obsidian Canvas)
├── js/                     Módulos JavaScript (vanilla, sin frameworks)
├── docs/                   Documentación y sistema de seguimiento
│   ├── seguimiento.json                           Historia canónica del proyecto
│   ├── generar_seguimiento.js                     Generador del .docx desde el JSON
│   ├── seguimiento_desarrollo_panel_viaje.docx    Generado automáticamente
│   ├── plan_desarrollo_panel_viaje.docx           Plan maestro
│   └── instrucciones_proyecto_panel_viaje.docx    Instrucciones originales
└── tests/                  Notebooks de Google Colab (análisis de APIs)
```

## Estado del proyecto

En desarrollo. Módulos de datos completos (LocationModule, WeatherModule, RoadRef, MotorwayExit, POIModule, Gasolineras). Bloque UI full-inmersión de la V2 cerrado (IU-12 a IU-15: luminaria con momento del día, lluvia, tormenta con rayos, nieve y niebla). Logs persistentes de trayectos en IndexedDB con exportación `.txt`. Pendiente de prueba en carretera real.

Ver `docs/seguimiento_desarrollo_panel_viaje.docx` para el estado detallado y la historia de decisiones.

## Parámetros útiles de URL

- `?debug=1` — panel de debug en pantalla con el historial de logs.
- `?sim=<ruta>` — simulador de GPS sin conducir (rutas: `urbano-lasrozas`, `a6`, `m505`, `cruce-a6-m505`).
- `?speed=<n>` — factor de velocidad del simulador (por defecto x10).
- `?logs=1` — modo admin para listar, ver y descargar los trayectos persistidos.
- `?fogfallback=1` — fuerza el fallback CSS de la niebla (radiales) si el filter SVG da lag en el móvil.

## Uso personal

Este es un proyecto personal sin pretensiones comerciales. El código es público porque GitHub Pages gratuito lo requiere, pero está pensado para uso del autor.

## Añado botón para abrir en COLAB
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/tragabytes/panel-viaje/blob/main/tests/fase1_geocoding.ipynb)
