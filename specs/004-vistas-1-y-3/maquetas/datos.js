// Datos de las maquetas (spec 004): la A-6 llegando a Astorga desde León,
// hacia el oeste-suroeste. Coordenadas reales (Wikipedia); el resto, como lo
// pintaría el panel.
const MAQUETA = {
  coche: { lat: 42.4640, lon: -6.0240, rumbo: 250, velocidad: 112, limite: 120 },
  cabecera: { ccaa: 'Castilla y León', provincia: 'León', municipio: 'Astorga', meta: '10.305 hab · 869 m' },
  via: { codigo: 'A-6', nombre: 'Autovía del Noroeste' },
  salida: { ref: '324', km: '1,6', destinos: 'Astorga · Ponferrada' },
  pueblos: [
    { nombre: 'San Román de la Vega', lat: 42.47194444, lon: -6.02444444 },
    { nombre: 'San Justo de la Vega', lat: 42.45416667, lon: -6.01472222 },
    { nombre: 'Carneros', lat: 42.47583333, lon: -6.04777778 },
    { nombre: 'Astorga', lat: 42.4575, lon: -6.05694444 },
    { nombre: 'Valdeviejas', lat: 42.46138889, lon: -6.07888889 },
  ],
  meteo: { temp: 16, texto: 'Despejado', historia: 'Sin lluvia prevista', viento: '19 km/h NE' },
  gasolinera: { marca: 'Repsol', km: '1,9' },
  pois: [
    { nombre: 'Catedral de Astorga', pueblo: 'Astorga', lat: 42.45777778, lon: -6.05694444,
      foto: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/Astorga_Cathedral_Fa%C3%A7ade.jpg/330px-Astorga_Cathedral_Fa%C3%A7ade.jpg' },
    { nombre: 'Palacio Episcopal de Gaudí', pueblo: 'Astorga', lat: 42.4578, lon: -6.0556,
      foto: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/92/Palacio_Episcopal_Astorga_2021_-_exterior.jpg/330px-Palacio_Episcopal_Astorga_2021_-_exterior.jpg' },
    { nombre: 'Muralla de Astorga', pueblo: 'Astorga', lat: 42.4575, lon: -6.055,
      foto: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Astorga_muralla_JMM.JPG/330px-Astorga_muralla_JMM.JPG' },
    { nombre: 'Termas romanas', pueblo: 'Astorga', lat: 42.456001, lon: -6.055226,
      foto: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/Ba%C3%B1era_Termas_Mayores.jpg/330px-Ba%C3%B1era_Termas_Mayores.jpg' },
    { nombre: 'Castrillo de los Polvazares', pueblo: 'Astorga', lat: 42.465, lon: -6.12833333,
      foto: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/39/Castrillo_de_los_polvazares_2018004.jpg/330px-Castrillo_de_los_polvazares_2018004.jpg' },
    { nombre: 'Museo de los Caminos', pueblo: 'Astorga', lat: 42.4579, lon: -6.0561,
      foto: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Palacio_Episcopal%2C_Astorga.jpg/330px-Palacio_Episcopal%2C_Astorga.jpg' },
  ],
};

// Distancia y desvío (−180…180°, negativo = a la izquierda) desde el coche.
function medirDesdeCoche(item) {
  const c = MAQUETA.coche;
  const km = Geo.distanciaMetros(c.lat, c.lon, item.lat, item.lon) / 1000;
  const rumbo = Geo.rumboHacia(c.lat, c.lon, item.lat, item.lon);
  const desvio = ((rumbo - c.rumbo + 540) % 360) - 180;
  return Object.assign({}, item, { km, desvio });
}
const kmTexto = (km) => (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km');

function pintarCabecera() {
  const d = MAQUETA.cabecera, c = MAQUETA.coche;
  document.getElementById('cab').innerHTML =
    `<div class="cab-migas"><span class="es">ES</span><span class="sep">·</span>${d.ccaa}<span class="sep">·</span>${d.provincia}` +
    `<span class="sep">·</span>${d.municipio}<span class="meta"> · ${d.meta}</span></div>` +
    `<div class="cab-vel"><b>${c.velocidad}</b><small>KM/H</small><i>/ ${c.limite}</i></div>`;
}

// Flecha (SVG) que apunta hacia donde queda el sitio: arriba = de frente.
const flecha = (desvio) => `<svg class="flecha" style="--giro:${desvio.toFixed(0)}deg" viewBox="-10 -10 20 20"><path d="M0 -8 L6.5 6 L0 2.5 L-6.5 6 Z" fill="currentColor"/></svg>`;
const SOL = '<svg class="icono" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle r="4.5"/><path d="M0-10v3M0 7v3M-10 0h3M7 0h3M-7-7l2 2M5 5l2 2M-7 7l2-2M5-5l2-2"/></svg>';
