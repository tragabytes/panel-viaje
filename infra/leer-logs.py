#!/usr/bin/env python3
"""Leer los logs del panel que están en la nube (specs/005-logs-en-la-nube).

Usa la sesión de GitHub de este ordenador (`gh`), sin claves a la vista.

  python infra/leer-logs.py                 lista los logs (del más reciente al más viejo)
  python infra/leer-logs.py ultimo          el más reciente, descomprimido, por pantalla
  python infra/leer-logs.py 2026-10-18      los de ese día, uno tras otro
  python infra/leer-logs.py <nombre>        uno concreto (el nombre de la lista)

Para guardarlo en un fichero: añadir  > log.txt
"""
import base64
import gzip
import json
import subprocess
import sys

REPO = 'tragabytes/panel-viaje-logs'


def gh(ruta):
    r = subprocess.run(['gh', 'api', f'repos/{REPO}/contents/{ruta}'], text=True, capture_output=True)
    if r.returncode != 0:
        if 'Not Found' in (r.stdout + r.stderr):
            return None
        sys.exit(f'gh falló: {r.stderr.strip()}')
    return json.loads(r.stdout)


def lista():
    datos = gh('logs') or []
    return sorted((d['name'] for d in datos if d['name'].endswith('.txt.gz')), reverse=True)


def texto(nombre):
    d = gh(f'logs/{nombre}')
    if not d:
        sys.exit(f'No está: {nombre}')
    return gzip.decompress(base64.b64decode(d['content'])).decode('utf-8')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    nombres = lista()
    if len(sys.argv) < 2:
        print('\n'.join(nombres) if nombres else 'No hay logs en la nube.')
        return
    arg = sys.argv[1]
    if arg == 'ultimo':
        elegidos = nombres[:1]
    elif arg in nombres:
        elegidos = [arg]
    else:
        elegidos = [n for n in nombres if n.startswith(arg)][::-1]
    if not elegidos:
        sys.exit(f'Ningún log coincide con «{arg}».')
    for n in elegidos:
        print(f'##### {n}\n')
        print(texto(n))


if __name__ == '__main__':
    main()
