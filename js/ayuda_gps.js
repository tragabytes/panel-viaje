// ayuda_gps.js — Qué falla y dónde se arregla cuando el panel no recibe la ubicación (D25).
//
// Antes, sin permiso, el panel se quedaba vacío con un "Error de GPS: Permiso
// denegado" en letra pequeña (pasó con el móvil del trabajo). Ahora:
//   · Sin permiso: una tarjeta con los sitios donde se arregla, por orden.
//   · Sin señal desde el principio: otra, con la ubicación del móvil y el GPS
//     en interiores.
//   · Un corte con el GPS ya funcionando (túnel) o un GPS que tarda: solo el
//     aviso pequeño de la cabecera, como siempre.
// Sin GPS el panel no sirve para nada, así que la tarjeta no estorba conduciendo.
//
// API pública (AyudaGPS):
//   AyudaGPS.decidir({ codigo, huboFix, enWebView, sinApi }) → ayuda | null   (pura)
//   AyudaGPS.estado(codigo, huboFix) → texto corto para la cabecera          (pura)
//   AyudaGPS.esWebView(userAgent) → boolean                                  (pura)
//   AyudaGPS.mostrar(ayuda, alReintentar) · AyudaGPS.ocultar()

(function () {
  const __global__ = (typeof window !== 'undefined') ? window : globalThis;

  const PASO_OTRA_APP = '<b>Estás dentro de otra app</b> (Teams, WhatsApp, el correo…), y su navegador no da la ubicación: abre la web directamente en Chrome.';
  const PASO_SI_OTRA_APP = '<b>Si la abriste desde otra app</b> (Teams, WhatsApp, el correo…), ábrela directamente en Chrome: su navegador interno no siempre da la ubicación.';
  const PASO_UBICACION = '<b>Ubicación del móvil</b>: actívala en los ajustes rápidos (deslizando desde arriba).';
  const PASO_CHROME = '<b>Permiso de Chrome</b>: Ajustes del móvil → Aplicaciones → Chrome → Permisos → Ubicación → «Permitir mientras se usa la app», con «Usar ubicación precisa» activado.';
  const PASO_WEB = '<b>Permiso de esta web</b>: en Chrome, menú ⋮ → Configuración → Configuración de sitios → Ubicación. Si tragabytes.github.io sale en «Bloqueados», permítelo.';
  const PASO_EMPRESA = '<b>Móvil de empresa</b>: puede que la empresa bloquee la ubicación a las webs (escribe chrome://policy en Chrome: si sale «DefaultGeolocationSetting» con valor 2, está bloqueada). Prueba con el Chrome sin maletín o pregunta a informática.';

  function decidir(c) {
    c = c || {};
    if (c.sinApi) {
      return {
        variante: 'sin-api',
        titulo: 'Este navegador no da la ubicación',
        pasos: [c.enWebView ? PASO_OTRA_APP : 'Abre la web en <b>Chrome</b>: https://tragabytes.github.io/panel-viaje/'],
        pie: '',
      };
    }
    if (c.codigo === 1) {
      const pasos = [PASO_UBICACION, PASO_CHROME, PASO_WEB, PASO_SI_OTRA_APP, PASO_EMPRESA];
      if (c.enWebView) { pasos.splice(3, 1); pasos.unshift(PASO_OTRA_APP); }
      return {
        variante: 'permiso',
        titulo: 'El panel no tiene permiso para usar tu ubicación',
        pasos,
        pie: 'En cuanto des el permiso, el panel arranca solo.',
      };
    }
    if (c.codigo === 2 && !c.huboFix) {
      return {
        variante: 'sin-senal',
        titulo: 'El móvil no está dando la ubicación',
        pasos: [
          PASO_UBICACION,
          '<b>Dentro de un edificio</b> el GPS puede tardar o no llegar: acércate a una ventana o sal fuera.',
          '<b>Si sigue sin llegar</b>, apaga la ubicación del móvil y vuelve a encenderla.',
          PASO_CHROME,
        ],
        pie: 'En cuanto llegue la ubicación, el panel arranca solo.',
      };
    }
    return null;
  }

  function estado(codigo, huboFix) {
    if (codigo === 1) return 'Sin permiso de ubicación';
    if (codigo === 2) return huboFix ? 'Sin señal de GPS' : 'El móvil no da la ubicación';
    if (codigo === 3) return 'El GPS tarda en responder';
    return 'Error de GPS';
  }

  // El navegador interno de otra app (WebView de Android) lleva "; wv)".
  function esWebView(ua) {
    return /;\s*wv\)/.test(String(ua || ''));
  }

  // --- Tarjeta ---

  let tarjeta = null;
  // Cerrada a mano ("Seguir sin ubicación"): no vuelve a salir sola con cada
  // error repetido del GPS, solo tras "Volver a intentarlo".
  let descartada = false;

  function mostrar(ayuda, alReintentar) {
    if (typeof document === 'undefined' || !ayuda || descartada) return;
    if (!tarjeta) {
      tarjeta = document.createElement('section');
      tarjeta.className = 'ayuda-gps';
      tarjeta.setAttribute('role', 'alertdialog');
      document.body.appendChild(tarjeta);
      tarjeta.addEventListener('click', (e) => {
        if (e.target.closest('.ayuda-gps-reintentar') && tarjeta.alReintentar) {
          descartada = false;
          tarjeta.alReintentar();
        }
        if (e.target.closest('.ayuda-gps-cerrar')) {
          descartada = true;
          ocultar();
        }
      });
    }
    tarjeta.alReintentar = alReintentar;
    // Textos fijos de este módulo (ningún dato de fuera): se pueden poner tal cual.
    tarjeta.innerHTML = `
      <div class="ayuda-gps-caja">
        <h2 class="ayuda-gps-titulo">${ayuda.titulo}</h2>
        <ol class="ayuda-gps-pasos">${ayuda.pasos.map((p) => `<li>${p}</li>`).join('')}</ol>
        ${ayuda.pie ? `<p class="ayuda-gps-pie">${ayuda.pie}</p>` : ''}
        <div class="ayuda-gps-botones">
          <button type="button" class="ayuda-gps-reintentar">Volver a intentarlo</button>
          <button type="button" class="ayuda-gps-cerrar">Seguir sin ubicación</button>
        </div>
      </div>`;
    tarjeta.hidden = false;
  }

  function ocultar() {
    if (tarjeta) tarjeta.hidden = true;
  }

  function visible() {
    return !!tarjeta && !tarjeta.hidden;
  }

  __global__.AyudaGPS = { decidir, estado, esWebView, mostrar, ocultar, visible };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = __global__.AyudaGPS;
  }
})();
