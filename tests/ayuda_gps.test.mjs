// Ayuda cuando el panel no recibe la ubicación (DECISIONES D25).
//
// Se ejecutan con: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const A = require('../js/ayuda_gps.js');

const CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';
const WEBVIEW = 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.0.0 Mobile Safari/537.36';

// Impide volver al escueto "Error de GPS: Permiso denegado" sin saber qué hacer.
test('sin permiso, la ayuda dice qué falla y dónde se arregla', () => {
  const a = A.decidir({ codigo: 1, huboFix: false, enWebView: false });
  assert.equal(a.variante, 'permiso');
  const texto = a.pasos.join(' ');
  assert.match(texto, /Configuración de sitios/);
  assert.match(texto, /tragabytes\.github\.io/);
  assert.match(texto, /Aplicaciones → Chrome → Permisos → Ubicación/);
  assert.match(texto, /chrome:\/\/policy/);
});

test('dentro del navegador de otra app, lo primero es decírselo', () => {
  const a = A.decidir({ codigo: 1, huboFix: false, enWebView: true });
  assert.match(a.pasos[0], /otra app/);
});

test('sin señal desde el principio, ayuda; un corte con el GPS ya funcionando (túnel), no', () => {
  assert.equal(A.decidir({ codigo: 2, huboFix: false }).variante, 'sin-senal');
  assert.equal(A.decidir({ codigo: 2, huboFix: true }), null);
  assert.equal(A.decidir({ codigo: 3, huboFix: false }), null); // el GPS tarda: solo el aviso pequeño
});

test('un navegador sin ubicación pide abrir la web en Chrome', () => {
  assert.equal(A.decidir({ sinApi: true }).variante, 'sin-api');
});

test('se reconoce el navegador interno de otra app (WebView de Android)', () => {
  assert.equal(A.esWebView(WEBVIEW), true);
  assert.equal(A.esWebView(CHROME), false);
});

test('el aviso de la cabecera dice lo que pasa en pocas palabras', () => {
  assert.equal(A.estado(1, false), 'Sin permiso de ubicación');
  assert.equal(A.estado(2, true), 'Sin señal de GPS');
  assert.equal(A.estado(3, false), 'El GPS tarda en responder');
});
