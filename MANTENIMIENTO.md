# Mantenimiento

Cómo se prueba, se publica y se diagnostica el panel. Todos los comandos, desde la carpeta del
proyecto.

## 1. Probar en local

El servidor de pruebas está en `.claude/launch.json` (puerto **8767**; el 8766 lo usa
`temario-eir`). Desde Claude Code se arranca con la vista previa, no a mano.

La app necesita HTTPS para el GPS, pero `localhost` cuenta como seguro: en el ordenador funciona
con el simulador. El móvil del panel es apaisado de **640×360**: conviene probar a ese tamaño.

**Ojo con el service worker al probar**: sirve los ficheros desde su caché, así que tras cambiar
código el navegador de pruebas puede seguir enseñando la versión anterior. Antes de mirar un
cambio: dar de baja el service worker, borrar sus cachés y volver a pedir los ficheros con
`cache: 'reload'` (o subir `SW_VERSION` y recargar dos veces).

## 2. Banderas de la URL

| Bandera | Qué hace |
|---|---|
| `?sim=<ruta>` | Simula el GPS recorriendo una ruta (ver abajo). Por defecto a velocidad x10 |
| `&speed=N` | Velocidad de la simulación (`speed=1`: tiempo real) |
| `&simSpeedNull=1` | Simula un GPS viejo que no da velocidad |
| `?debug=1` | Panel de depuración en pantalla (entradas, salidas, latencias, cachés, errores) |
| `?logs=1` | Modo aparte con los viajes guardados, para descargarlos o borrarlos |
| `?cuaderno=1` | Modo cuaderno: revisar las marcas (también con el atajo del icono de la app) |
| `?meteo=<tiempo>` | Pinta ese tiempo en vez del real: `despejado`, `nublado`, `cubierto`, `niebla`, `llovizna`, `lluvia`, `chubascos`, `nieve`, `tormenta` |
| `?hora=HH:MM` | Pinta el paisaje de la vista 2 a esa hora (solo el paisaje) |
| `?paisaje=ligero` | Deja el paisaje de la vista 2 quieto (y lo recuerda); `?paisaje=completo` lo vuelve a mover |
| `?safearea=N` | Simula un recorte de pantalla de N px, para maquetar desde el ordenador |

Se pueden juntar: `?sim=pedania-maragata&speed=1&meteo=nieve&hora=17:45`.

Rutas del simulador: `urbano-lasrozas`, `a6`, `m505`, `cruce-a6-m505`, `pedania-maragata`,
`a6-salidas`. Tienen pocos puntos, separados por kilómetros: sirven para ver que nada se rompe,
**no para medir consumo de datos** (eso sale de un viaje real, sección 5). La ruta
`cruce-a6-m505` da media vuelta de golpe: buena para ver el radar en un giro de 180°.

## 3. Tests

```
node --test
```

Comprueban las reglas que pueden romperse sin que nadie se entere (ver `CLAUDE.md`) y las cuentas
de cada pieza: cuaderno, relieve, radar, paisaje y Overpass. Se pasan antes de publicar.

## 4. Publicar

Todo lo que entra en `main` se publica solo en GitHub Pages (tarda 1-2 minutos).

1. Si cambia cualquier fichero de la app, **subir `SW_VERSION`** en `service-worker.js`. Si no, los
   móviles que ya tienen el panel siguen con la versión vieja.
2. Si se añade un fichero `.js`, añadirlo también a `PRECACHE` en `service-worker.js` (lo vigila
   un test).
3. `node --test` en verde.
4. Commit y push a `main`.
5. Comprobar que la versión publicada es la nueva: el `SW_VERSION` de
   https://tragabytes.github.io/panel-viaje/service-worker.js.

En el móvil del panel, la página que ya está abierta sigue con la versión vieja: la nueva se
descarga en segundo plano y entra **al recargar o volver a abrir** el panel (a veces hacen falta
dos recargas).

## 5. Sacar los logs de un viaje real

1. Al llegar, en el móvil del panel, abrir la web con `?logs=1`.
2. Descargar el viaje. Es un `.txt` con resumen arriba y el log completo, con los mensajes repetidos
   agrupados.
3. Pasárselo a Claude en una sesión.

Se guardan los 10 últimos viajes, hasta 8.000 mensajes cada uno. En el log salen también las
marcas del cuaderno ("Cuaderno: marca guardada…"), si Chrome concedió el almacenamiento
persistente, las teselas de relieve bajadas y la fluidez del paisaje ("Paisaje: N fps").

## 6. Qué guarda el móvil

Cada cosa en su sitio, para que ninguna limpieza toque lo que no debe:

| Qué | Dónde | Caduca | Quién lo borra |
|---|---|---|---|
| **Marcas del cuaderno** | base de datos `panel-viaje-cuaderno` | Nunca | Solo tú, una a una, desde el cuaderno |
| Teselas de relieve | base de datos `panel-viaje-relieve` | Nunca (el relieve no cambia) | Ella misma, al pasar de 300 teselas: las menos usadas |
| Logs de viaje | base de datos `panel-viaje-trayectos` | Al pasar de 10 viajes | Rotación automática, o tú desde `?logs=1` |
| Pueblos y puntos de interés | base de datos `panel-viaje-cache` | A los 14 días | Limpieza automática |
| La app (HTML, JS, fuentes) | caché del service worker | Al cambiar `SW_VERSION` | El service worker |

**Copia de seguridad del cuaderno**: en `?cuaderno=1`, menú "⋯" → "Descargar copia de seguridad".
Es un `.json`; "Importar una copia" lo vuelve a cargar (solo añade las marcas que falten).
