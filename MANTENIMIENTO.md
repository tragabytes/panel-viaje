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
`cache: 'reload'` (o subir `SW_VERSION` y recargar dos veces). Si aun así un módulo sale viejo (la
pestaña guarda copias en memoria: el 18/10 cargó un `cuaderno.js` anterior con el `main.js`
nuevo), **abrir una pestaña nueva**. Para saber qué versión corre: `Object.keys(Cuaderno)` o
cualquier función nueva desde la consola.

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
| `?hora=HH:MM` | Pinta el paisaje de la vista 2 y el brillo del modo noche a esa hora (los datos siguen siendo los de ahora). `?hora=23:00`: el panel de noche |
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
de cada pieza: cuaderno, relieve, radar, paisaje, modo noche, velocidad y rumbo, textos de cada
vista, provincia y vía, pueblos de Wikipedia y Overpass. Algunos usan respuestas reales guardadas
en `tests/datos/`. Se pasan antes de publicar.

El simulador da siempre 100 km/h: la escala de ciudad del radar (6 km) no se ve con él. Para verla,
desde la consola del navegador, llamar a `RadarV4.posicion({ lat, lon, rumbo, velocidadKmh: 20 })`
una vez por segundo durante algo más de un minuto.

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

En el móvil del panel la versión nueva **entra sola** desde la v20 (D24): la app mira si hay
versión nueva al abrirla y cada vez que vuelves a ella (como mucho cada 15 min), y se recarga sola
solo con el coche parado: recién abierta, o tras 3 minutos parado. Nunca en marcha ni sin GPS
reciente (túnel). Lo deja escrito en el log ("Actualización: …").

Si un móvil tiene una versión anterior a la v20, la primera vez hay que forzarla a mano: cerrar la
app desde recientes, abrirla con internet, esperar ~30 s, y cerrarla y abrirla otra vez. **No borrar
los datos del sitio** en Chrome: se llevaría las marcas del cuaderno.

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
| Pueblos y puntos de interés | base de datos `panel-viaje-cache` (solo lo de Overpass: lo de Wikipedia, plan B, solo en memoria) | A los 14 días | Limpieza automática |
| Marcas ya recordadas («Aquí marcaste») | `localStorage`, clave `cuaderno-recordadas` (con el simulador no se escribe) | Al mes | Él mismo; si se pierde, como mucho se repite un aviso |
| La clave de los logs en la nube | `localStorage`, clave `nube-clave` | Cuando caduque (1 año) | Tú, en `?logs=1` ("Quitar la clave") |
| Qué viajes están subidos | `localStorage`, clave `nube-subidos` | Con la rotación de los logs | Él mismo; si se pierde, se resuben (se sustituyen, no se duplican) |
| **Los logs en la nube** | repositorio privado `tragabytes/panel-viaje-logs` | A los 30 días de llegar | La limpieza de cada noche del repositorio |
| La app (HTML, JS, fuentes) | caché del service worker | Al cambiar `SW_VERSION` | El service worker |

**Copia de seguridad del cuaderno**: en `?cuaderno=1`, menú "⋯" → "Descargar copia de seguridad".
Es un `.json`; "Importar una copia" lo vuelve a cargar (solo añade las marcas que falten).

**Ver las marcas en Google Maps**: menú "⋯" → "Llevar a Google Maps (KML)". Se abre en Google My
Maps (Crear mapa → Importar) o en Google Earth. No es una copia de seguridad: no se puede volver a
importar en el cuaderno.

## 7. Si algo falla en un móvil

Antes de tocar nada en un móvil con marcas: **copia de seguridad del cuaderno** (sección 6). Y
nunca "borrar datos del sitio" en Chrome: se lleva las marcas.

**No se ve la versión nueva.** Desde la v20 entra sola al abrir la app parado (D24). Con una
anterior: cerrar la app desde recientes, abrirla con internet, esperar ~30 s, y cerrarla y abrirla
otra vez. Señales de la versión actual: vista 2 con montañas, vista 4 con un radar redondo.

**"Sin permiso de ubicación"** (o, en versiones viejas, "Error de GPS: Permiso denegado"). La v21
saca una tarjeta con los pasos (D25). Lo típico, por orden: ubicación del móvil apagada; Chrome sin
permiso de ubicación en Android (Ajustes → Aplicaciones → Chrome → Permisos → Ubicación); la web
bloqueada en Chrome (⋮ → Configuración → Configuración de sitios → Ubicación); la web abierta dentro
de otra app; en móviles de empresa, la ubicación del perfil de trabajo apagada o una política que la
bloquea (`chrome://policy`: "DefaultGeolocationSetting" con valor 2). **Prueba rápida**: Google Maps
en ese mismo Chrome (maps.google.com → botón de ubicación); si tampoco localiza, es el teléfono.
No es un problema de HTTPS: el de GitHub Pages vale en cualquier móvil (D25).

**"Esta aplicación no se puede instalar"** al instalarla desde Chrome. La web cumple lo que pide
Chrome (manifiesto, iconos de 192 y 512 px, service worker: comprobado el 18/10), así que es el
móvil. Por orden: una copia vieja ya instalada (Ajustes → Aplicaciones → "Panel": desinstalarla
sin borrar datos y volver a instalar); poco espacio libre; Chrome o los servicios de Google Play
desactualizados; Chrome sin permiso para "instalar aplicaciones desconocidas"; un móvil sin Google
Play. Si nada funciona, "Crear acceso directo" sirve igual (se abre en Chrome; el botón de pantalla
completa quita las barras).

## 8. Los logs en la nube (spec 005)

El panel sube el log de cada viaje, comprimido, al repositorio **privado**
`tragabytes/panel-viaje-logs` de GitHub: al dejar el panel y, al abrirlo, los que falten. Cada
noche el repositorio borra lo que lleve más de 30 días desde que llegó, también del historial
(`limpieza.py`; copia de referencia en `infra/repositorio-logs/`).

**Leerlos desde el ordenador** (con la sesión de GitHub de este PC, `gh`):

```
python infra/leer-logs.py               # lista, del más reciente al más viejo
python infra/leer-logs.py ultimo        # el último, descomprimido
python infra/leer-logs.py 2026-10-18    # los de un día
```

**La clave**: una clave de GitHub "de grano fino", limitada a ese repositorio con permiso
*Contents: Read and write*. Se crea en github.com → Settings → Developer settings → Personal
access tokens → Fine-grained tokens, y se pega en `?logs=1` (la guía paso a paso está ahí). Vive
solo en el móvil. **Para anularla** (móvil perdido, o si `?logs=1` dice que no vale): en esa misma
página de GitHub, y crear otra.

**Si un viaje no aparece en la nube**: en `?logs=1` del móvil se ve si está "pendiente de subir";
"Subir ahora" lo intenta en el momento. La limpieza se puede lanzar a mano desde la pestaña
*Actions* del repositorio.
