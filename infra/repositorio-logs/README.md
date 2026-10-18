# Logs del panel de viaje

Repositorio **privado**. Aquí sube el panel de viaje (https://tragabytes.github.io/panel-viaje/)
el log de cada trayecto, comprimido, para que Claude pueda leerlo sin pasar por el móvil
(spec 005 del panel).

- `logs/AAAA-MM-DD_HH-MM-SS_movil[_sim].txt.gz`: un fichero por viaje, con la fecha y hora del
  móvil al empezarlo. Es el mismo texto que se descarga en `?logs=1`, comprimido con gzip.
- **Cada noche** (`limpieza.py`, desde `.github/workflows/limpieza.yml`) se borran los que llevan
  más de **30 días** desde que llegaron (`.llegadas.json`) y se rehace el historial, para que
  tampoco queden en él.
- Escribe aquí una **clave de GitHub de grano fino** limitada a este repositorio (Contents: read and
  write), que vive solo en el móvil. Para anularla: Settings → Developer settings → Personal access
  tokens → Fine-grained tokens.

La copia de referencia de estos ficheros está en el repositorio del panel, en
`infra/repositorio-logs/`.
