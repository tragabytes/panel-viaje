#!/usr/bin/env python3
"""Limpieza de los logs del panel de viaje (specs/005-logs-en-la-nube).

Cada noche, en el repositorio privado de los logs:
  1. Apunta en .llegadas.json el día en que llegó cada log nuevo (el borrado
     cuenta desde que llegó, no desde la fecha del móvil, que puede ir mal).
  2. Borra los logs que llevan más de DIAS días.
  3. Si ha borrado alguno, rehace el historial con un solo commit con lo que
     queda: así tampoco quedan en el historial.

Si el móvil sube un log mientras tanto, el envío a GitHub falla sin romper nada
(--force-with-lease) y se reintenta la noche siguiente.

Uso: python3 limpieza.py [--hoy AAAA-MM-DD] [--sin-push]
"""
import argparse
import datetime
import json
import os
import subprocess
import sys

DIAS = 30
CARPETA = 'logs'
LLEGADAS = '.llegadas.json'


def decidir(ficheros, llegadas, hoy, dias=DIAS):
    """Pura: -> (llegadas al día, ficheros a borrar)."""
    nuevas = {f: llegadas.get(f, hoy.isoformat()) for f in ficheros}
    limite = hoy - datetime.timedelta(days=dias)
    borrar = sorted(f for f, d in nuevas.items() if datetime.date.fromisoformat(d) < limite)
    for f in borrar:
        del nuevas[f]
    return nuevas, borrar


def git(*args):
    return subprocess.run(['git', *args], check=True, text=True, capture_output=True).stdout.strip()


def empujar(*args):
    try:
        git('push', *args)
        return True
    except subprocess.CalledProcessError as e:
        print('No se pudo enviar (¿llegó un log a la vez?); se reintenta mañana.\n' + (e.stderr or ''))
        return False


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--hoy', help='AAAA-MM-DD (por defecto, hoy en UTC)')
    p.add_argument('--sin-push', action='store_true')
    a = p.parse_args()
    hoy = datetime.date.fromisoformat(a.hoy) if a.hoy else datetime.datetime.now(datetime.timezone.utc).date()

    ficheros = sorted(f'{CARPETA}/{n}' for n in os.listdir(CARPETA)) if os.path.isdir(CARPETA) else []
    llegadas = {}
    if os.path.exists(LLEGADAS):
        with open(LLEGADAS, encoding='utf-8') as f:
            llegadas = json.load(f)
    nuevas, borrar = decidir(ficheros, llegadas, hoy)
    if nuevas == llegadas and not borrar:
        print('Nada que hacer.')
        return 0
    for f in borrar:
        os.remove(f)
    with open(LLEGADAS, 'w', encoding='utf-8') as f:
        json.dump(nuevas, f, indent=1, sort_keys=True)
        f.write('\n')

    git('config', 'user.name', 'limpieza-logs')
    git('config', 'user.email', 'limpieza-logs@users.noreply.github.com')
    cabeza = git('rev-parse', 'HEAD')
    if borrar:
        git('checkout', '--orphan', 'limpio')
        git('add', '-A')
        git('commit', '-q', '-m', f'Limpieza {hoy}: logs de los últimos {DIAS} días ({len(borrar)} borrados)')
        print(f'Borrados {len(borrar)}: ' + ', '.join(borrar))
        if not a.sin_push:
            empujar(f'--force-with-lease=main:{cabeza}', 'origin', 'limpio:main')
    else:
        git('add', LLEGADAS)
        git('commit', '-q', '-m', f'Llegadas {hoy}')
        if not a.sin_push:
            empujar('origin', 'HEAD:main')
    return 0


if __name__ == '__main__':
    sys.exit(main())
