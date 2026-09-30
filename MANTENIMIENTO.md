# Mantenimiento

Cómo se prueba, se publica y se diagnostica el panel. Todos los comandos, desde la carpeta del
proyecto.

## 1. Probar en local

El servidor de pruebas está en `.claude/launch.json` (puerto **8767**; el 8766 lo usa
`temario-eir`). Desde Claude Code se arranca con la vista previa, no a mano.

La app necesita HTTPS para el GPS, pero `localhost` cuenta como seguro: en el ordenador funciona
con el simulador.

## 2. Banderas de la URL

| Bandera | Qué hace |
|---|---|
| `?sim=<ruta>` | Simula el GPS recorriendo una ruta (ver abajo). Por defecto a velocidad x10 |
| `&speed=N` | Velocidad de la simulación (`speed=1`: tiempo real) |
| `&simSpeedNull=1` | Simula un GPS viejo que no da velocidad |
| `?debug=1` | Panel de depuración en pantalla (entradas, salidas, latencias, cachés, errores) |
| `?logs=1` | Modo aparte con los viajes guardados, para descargarlos o borrarlos |
| `?fogfallback=1` | Niebla sencilla por si la volumétrica va a tirones |
| `?safearea=N` | Simula un recorte de pantalla de N px, para maquetar desde el ordenador |

Rutas del simulador: `urbano-lasrozas`, `a6`, `m505`, `cruce-a6-m505`, `pedania-maragata`,
`a6-salidas`. Tienen pocos puntos, separados por kilómetros: sirven para ver que nada se rompe,
**no para medir consumo de datos** (eso sale de un viaje real, sección 5).

## 3. Tests

```
node --test
```

Comprueban las reglas que pueden romperse sin que nadie se entere (ver `CLAUDE.md`). Se pasan
antes de publicar.

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
descarga en segundo plano y entra **al recargar o volver a abrir** el panel.

## 5. Sacar los logs de un viaje real

1. Al llegar, en el móvil del panel, abrir la web con `?logs=1`.
2. Descargar el viaje. Es un `.txt` con resumen arriba y el log completo, con los mensajes repetidos
   agrupados.
3. Pasárselo a Claude en una sesión.

Se guardan los 10 últimos viajes, hasta 8.000 mensajes cada uno.
