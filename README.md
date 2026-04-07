# Panel de viaje

Panel informativo para coche que muestra en tiempo real, sobre un móvil Android colocado en el salpicadero, información contextual del lugar por el que se circula: ubicación administrativa, carretera actual, próxima salida en autovía, pueblos cercanos con sus puntos de interés, y previsión meteorológica.

**URL del panel:** https://tragabytes.github.io/panel-viaje/ *(disponible una vez activado GitHub Pages)*

## Qué hace

El panel se alimenta del GPS del propio móvil y se actualiza solo, sin necesidad de tocar nada mientras se conduce. Está pensado para usarse junto a un GPS principal (Google Maps, Waze) en el móvil principal, no como sustituto.

Tiene tres vistas deslizables horizontalmente:

1. **Vista completa** — toda la información en una sola pantalla.
2. **Vista ubicación + meteo** — solo ubicación y tiempo, con animación de fondo según las condiciones meteorológicas.
3. **Vista qué ver por la zona** — rejilla con los pueblos cercanos y sus puntos de interés histórico-monumentales.

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
├── index.html        Punto de entrada de la app
├── README.md         Este archivo
├── css/              Hojas de estilo
├── js/               Scripts organizados por módulos
├── assets/           Imágenes, iconos, recursos estáticos
├── data/             Datos estáticos (GeoJSON de municipios, etc.)
└── docs/             Documentación del proyecto
    ├── plan_desarrollo_panel_viaje.docx
    ├── instrucciones_proyecto_panel_viaje.docx
    └── seguimiento_desarrollo_panel_viaje.docx
```

## Estado del proyecto

En desarrollo. Fase actual: configuración inicial del repositorio. Ver `docs/seguimiento_desarrollo_panel_viaje.docx` para el estado detallado.

## Uso personal

Este es un proyecto personal sin pretensiones comerciales. El código es público porque GitHub Pages gratuito lo requiere, pero está pensado para uso del autor.
