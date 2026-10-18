"""Tests de la limpieza de los logs (spec 005, H2).

Se ejecutan con: python -m unittest test_limpieza  (desde esta carpeta)
"""
import datetime
import json
import os
import subprocess
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import limpieza  # noqa: E402

HOY = datetime.date(2026, 10, 18)


def git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, check=True, text=True, capture_output=True).stdout.strip()


class Decidir(unittest.TestCase):
    # Impide: guardar logs con posiciones más tiempo del dicho, o borrar antes de tiempo.
    def test_31_dias_fuera_29_se_queda(self):
        llegadas = {'logs/a.gz': '2026-09-17', 'logs/b.gz': '2026-09-19', 'logs/c.gz': '2026-09-18'}
        nuevas, borrar = limpieza.decidir(['logs/a.gz', 'logs/b.gz', 'logs/c.gz'], llegadas, HOY)
        self.assertEqual(borrar, ['logs/a.gz'])
        self.assertEqual(sorted(nuevas), ['logs/b.gz', 'logs/c.gz'])

    def test_un_log_nuevo_se_apunta_con_la_fecha_de_hoy(self):
        nuevas, borrar = limpieza.decidir(['logs/nuevo.gz'], {}, HOY)
        self.assertEqual(nuevas, {'logs/nuevo.gz': '2026-10-18'})
        self.assertEqual(borrar, [])

    def test_lo_apuntado_de_un_log_que_ya_no_esta_se_olvida(self):
        nuevas, _ = limpieza.decidir([], {'logs/ido.gz': '2026-10-01'}, HOY)
        self.assertEqual(nuevas, {})


class DeVerdad(unittest.TestCase):
    """Con un repositorio de verdad y un 'origin' local."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        self.origen = os.path.join(base, 'origen.git')
        self.trabajo = os.path.join(base, 'trabajo')
        git(base, 'init', '-q', '--bare', '-b', 'main', self.origen)
        git(base, 'clone', '-q', self.origen, self.trabajo)
        git(self.trabajo, 'checkout', '-q', '-b', 'main')
        git(self.trabajo, 'config', 'user.name', 't')
        git(self.trabajo, 'config', 'user.email', 't@t')
        os.makedirs(os.path.join(self.trabajo, 'logs'))
        for nombre in ('viejo.gz', 'reciente.gz', 'recien_llegado.gz'):
            with open(os.path.join(self.trabajo, 'logs', nombre), 'w') as f:
                f.write(nombre)
        with open(os.path.join(self.trabajo, limpieza.LLEGADAS), 'w') as f:
            json.dump({'logs/viejo.gz': '2026-09-10', 'logs/reciente.gz': '2026-10-10'}, f)
        git(self.trabajo, 'add', '-A')
        git(self.trabajo, 'commit', '-q', '-m', 'logs')
        git(self.trabajo, 'commit', '-q', '--allow-empty', '-m', 'otro commit')
        git(self.trabajo, 'push', '-q', 'origin', 'main')

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self, hoy):
        return subprocess.run([sys.executable, os.path.join(AQUI, 'limpieza.py'), '--hoy', hoy],
                              cwd=self.trabajo, check=True, text=True, capture_output=True).stdout

    # Impide: que un log borrado siga en el historial del repositorio.
    def test_borra_lo_viejo_y_rehace_el_historial(self):
        self.correr('2026-10-18')
        ficheros = git(self.origen, 'ls-tree', '-r', '--name-only', 'main').split('\n')
        self.assertNotIn('logs/viejo.gz', ficheros)
        self.assertIn('logs/reciente.gz', ficheros)
        self.assertIn('logs/recien_llegado.gz', ficheros)
        self.assertEqual(git(self.origen, 'rev-list', '--count', 'main'), '1', 'un solo commit: sin historial')
        llegadas = json.loads(git(self.origen, 'show', 'main:' + limpieza.LLEGADAS))
        self.assertEqual(llegadas['logs/recien_llegado.gz'], '2026-10-18')

    def test_sin_nada_que_borrar_no_rehace_el_historial(self):
        self.correr('2026-09-20')  # el viejo llegó el 10/09: aún no tiene 30 días
        ficheros = git(self.origen, 'ls-tree', '-r', '--name-only', 'main').split('\n')
        self.assertIn('logs/viejo.gz', ficheros)
        self.assertEqual(git(self.origen, 'rev-list', '--count', 'main'), '3', 'solo un commit más, con las llegadas')
        self.assertIn('Nada que hacer', self.correr('2026-09-20'))


if __name__ == '__main__':
    unittest.main()
