// Generador del seguimiento del Panel de Viaje
// Separa contenido (seguimiento.json) de presentación (este script).
// Uso: node generar_seguimiento.js [ruta_json] [ruta_salida]
//
// Por defecto lee ./seguimiento.json y escribe ./seguimiento_desarrollo_panel_viaje.docx

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType
} = require('docx');
const fs = require('fs');
const path = require('path');

const inputJson = process.argv[2] || 'seguimiento.json';
const outputDocx = process.argv[3] || 'seguimiento_desarrollo_panel_viaje.docx';

const data = JSON.parse(fs.readFileSync(inputJson, 'utf8'));

// === Helpers de presentación ===
const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: typeof text === 'string'
      ? [new TextRun({ text, ...(opts.run || {}) })]
      : text,
  });
}

function bulletKV(label, value) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80 },
    children: [
      new TextRun({ text: label + ": ", bold: true }),
      new TextRun({ text: value }),
    ],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32 })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 140 },
    children: [new TextRun({ text, bold: true, size: 22 })],
  });
}

function cell(text, opts = {}) {
  const isHeader = opts.header || false;
  const width = opts.width || 2340;
  return new TableCell({
    borders: cellBorders,
    margins: cellMargins,
    width: { size: width, type: WidthType.DXA },
    shading: isHeader ? { fill: "E7E6E6", type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: isHeader, size: 20 })],
    })],
  });
}

function tablaKV(filas, anchoCampo = 2880, anchoValor = 6480) {
  return new Table({
    width: { size: anchoCampo + anchoValor, type: WidthType.DXA },
    columnWidths: [anchoCampo, anchoValor],
    rows: filas.map(([k, v]) => new TableRow({
      children: [
        cell(k, { header: true, width: anchoCampo }),
        cell(v, { width: anchoValor }),
      ],
    })),
  });
}

// === Construcción del documento desde el JSON ===
const children = [];

// --- Cabecera ---
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 100 },
  children: [new TextRun({ text: data.meta.titulo, bold: true, size: 36 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 100 },
  children: [new TextRun({ text: data.meta.subtitulo, italics: true, size: 24 })],
}));
children.push(p("Repositorio: " + data.meta.repositorio));
children.push(p("URL del panel: " + data.meta.url_panel));
children.push(p(""));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: data.meta.nota_pie, italics: true })],
}));

// --- Estado actual ---
children.push(h1("Estado actual"));
children.push(tablaKV([
  ["Campo", "Valor"],
  ["Fase actual", data.estado_actual.fase_actual],
  ["Última actualización", data.estado_actual.ultima_actualizacion],
  ["Siguiente hito", data.estado_actual.siguiente_hito],
  ["Bloqueos activos", data.estado_actual.bloqueos],
]));

// --- Progreso por fases ---
children.push(h1("Progreso por fases"));
const filasFases = [
  ["Fase", "Nombre", "Estado", "Notas"],
  ...data.fases.map(f => [f.id, f.nombre, f.estado, f.notas])
];
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [720, 2880, 1440, 4320],
  rows: filasFases.map((fila, i) => new TableRow({
    children: fila.map((txt, j) => cell(txt, {
      header: i === 0,
      width: [720, 2880, 1440, 4320][j],
    })),
  })),
}));
children.push(p(""));
children.push(new Paragraph({
  children: [new TextRun({ text: "Estados posibles: Pendiente, En curso, Bloqueada, Completada, Casi completada, Omitida.", italics: true })],
}));

// --- Entorno del móvil ---
children.push(h1("Entorno de ejecución del móvil destino"));
children.push(p(data.entorno_movil.intro));
children.push(tablaKV([
  ["Propiedad", "Valor"],
  ...data.entorno_movil.campos
]));
children.push(p(""));
children.push(new Paragraph({
  children: [new TextRun({ text: data.entorno_movil.conclusion, italics: true })],
}));

// --- Fichas de APIs ---
children.push(h1("Fichas de APIs evaluadas (Fase 1)"));
children.push(p("Esta sección se rellena durante la Fase 1. Para cada API evaluada, una ficha con el formato común de campos."));
for (const ficha of data.fichas_api) {
  children.push(h3("Ficha — " + ficha.titulo));
  for (const [k, v] of ficha.campos) {
    children.push(bulletKV(k, v));
  }
}
if (data.fichas_pendientes) {
  children.push(p(data.fichas_pendientes));
}

// --- Decisiones arquitectónicas ---
children.push(h1("Registro de decisiones arquitectónicas"));
children.push(p("Cada decisión relevante se registra aquí con fecha, contexto, alternativas consideradas y razón. Sirve para no tener que reconstruir el porqué al volver al proyecto tiempo después."));
for (const d of data.decisiones) {
  children.push(h3(`Decisión ${d.id} — ${d.titulo}`));
  for (const [k, v] of d.campos) {
    children.push(bulletKV(k, v));
  }
}

// --- Log de sesiones ---
children.push(h1("Log de sesiones de trabajo"));
for (const s of data.sesiones) {
  children.push(h3(`Sesión ${s.n} — ${s.titulo}`));
  for (const [k, v] of s.campos) {
    children.push(bulletKV(k, v));
  }
}

// --- Problemas abiertos ---
children.push(h1("Problemas abiertos"));
if (!data.problemas_abiertos || data.problemas_abiertos.length === 0) {
  children.push(new Paragraph({
    children: [new TextRun({ text: "(vacío — todos los problemas han quedado resueltos o documentados como observaciones para fases posteriores)", italics: true })],
  }));
} else {
  for (const pr of data.problemas_abiertos) {
    children.push(h3(`${pr.id} — ${pr.titulo}`));
    for (const [k, v] of pr.campos) {
      children.push(bulletKV(k, v));
    }
  }
}

// --- Problemas resueltos ---
children.push(h1("Problemas resueltos"));
for (const pr of data.problemas_resueltos) {
  children.push(h3(`${pr.id} — ${pr.titulo}`));
  for (const [k, v] of pr.campos) {
    children.push(bulletKV(k, v));
  }
}

// --- Ideas parqueadas ---
children.push(h1("Ideas parqueadas"));
children.push(p("Ideas surgidas durante el desarrollo que no encajan en la fase actual pero podrían incorporarse más adelante."));
for (const idea of data.ideas_parqueadas) {
  children.push(h3(idea.titulo));
  children.push(p(idea.texto));
}

// --- Documento final ---
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F3864" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "2E74B5" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "1F3864" },
        paragraph: { spacing: { before: 220, after: 140 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputDocx, buffer);
  console.log(`OK: ${outputDocx} generado desde ${inputJson}`);
  console.log(`    ${data.fases.length} fases · ${data.fichas_api.length} fichas API · ${data.decisiones.length} decisiones · ${data.sesiones.length} sesiones · ${data.problemas_resueltos.length} problemas resueltos · ${data.ideas_parqueadas.length} ideas parqueadas`);
});
