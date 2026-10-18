# Panel de viaje

Un **cuaderno de viaje** para el coche: una web que va en un móvil Android apaisado junto al
navegador. Enseña dónde vas y qué hay alrededor, y **deja marcar los sitios que te llaman** para
investigarlos después, con calma.

**Panel:** https://tragabytes.github.io/panel-viaje/ — se instala desde Chrome con "Instalar
aplicación". No es un navegador: va al lado de Google Maps o Waze, no en su lugar.

## Qué hace

Se alimenta del GPS del propio móvil y se actualiza solo. Cuatro vistas, deslizando de lado:

1. **Todo de un vistazo**: pueblo, vía, próxima salida en autovía, pueblos cercanos, puntos de
   interés, gasolineras y el tiempo.
2. **El tiempo como paisaje**: un paisaje lo-fi que cambia con la hora real del día, el sol y la
   luna (con su fase), las nubes y el viento de verdad, la niebla, la lluvia y la nieve.
3. **Qué ver por la zona**: los puntos de interés cercanos con foto.
4. **Radar**: los pueblos cercanos en un radar que gira con la marcha, con el relieve debajo.

**Marcar**: mantener el dedo un segundo en cualquier sitio de la pantalla guarda ese momento y lo
que había alrededor. Después, en el **cuaderno** (`?cuaderno=1`, o manteniendo pulsado el icono de
la app), cada marca sale en un mapa con lo que podía ser, para elegir "era esto", añadir una nota,
abrirlo en Google Maps o Wikipedia y compartirlo.

## Cómo está hecho

- HTML, CSS y JavaScript sin frameworks ni compilación: lo que hay en el repositorio es lo que se
  publica (GitHub Pages).
- Aplicación web instalable (PWA) que arranca sin cobertura.
- APIs gratuitas y sin clave: Open-Meteo (tiempo), Nominatim y Overpass de OpenStreetMap (lugar,
  vías, pueblos), Wikipedia y Wikidata (sitios, fotos, datos de municipios), Photon y las teselas
  de relieve de AWS.
- Pensado para un móvil viejo: los efectos los mueve la tarjeta gráfica y se paran fuera de
  pantalla; cada petición a internet se evita si se puede y se guarda con su caducidad.

## Para quien lo mantenga

- [`CLAUDE.md`](CLAUDE.md): mapa del proyecto y sus reglas.
- [`specs/`](specs/): qué se quiere que sea (`000-rumbo`), y cada pieza con su especificación y
  sus tareas.
- [`MANTENIMIENTO.md`](MANTENIMIENTO.md): cómo probar con el simulador, las banderas de la URL,
  cómo publicar y cómo sacar los logs de un viaje.
- Tests: `node --test`.

## Uso personal

Proyecto personal sin pretensiones comerciales. El código es público porque GitHub Pages gratuito
lo requiere.

## Añado botón para abrir en COLAB
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/tragabytes/panel-viaje/blob/main/tests/fase1_geocoding.ipynb)
