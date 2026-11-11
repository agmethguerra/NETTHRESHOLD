// Lectura de CSV en el navegador (sin DOM). El contenido NUNCA se inserta como HTML (sección 16.1).

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 50000;

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

function countOutsideQuotes(line, delimiter) {
  let n = 0;
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === delimiter && !inQ) n++;
  }
  return n;
}

/** Detecta el separador más consistente entre las primeras líneas. */
export function detectDelimiter(text) {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/).filter((l) => l.trim() !== '').slice(0, 10);
  if (!lines.length) return ',';
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    if (counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length;
    const score = consistent * 1000 + counts[0];
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Analizador RFC 4180: comillas, comillas escapadas ("") y saltos de línea dentro de campos. */
export function parseCSV(text, delimiter = ',') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let row = [];
  let field = '';
  let inQ = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { inQ = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); records.push(row); row = []; field = ''; i++; continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  return { records, unterminatedQuote: inQ };
}

const FIELD_RULES = {
  load: { exact: ['loadvalue', 'load', 'carga', 'cargaofrecida', 'x', 'lambda', 'rate', 'requestsps'], has: ['load', 'carga'] },
  metric: { exact: ['latencyms', 'latency', 'latencia', 'latenciams', 'metricvalue', 'metric', 'metrica', 'y', 'responsetime', 'tiempoderespuesta', 'rtt', 'delay', 'retardo'], has: ['latenc', 'metric'] },
  timestamp: { exact: ['timestamp', 'fecha', 'datetime', 'date', 'fechahora'], has: ['timestamp', 'fecha'] },
  notes: { exact: ['notes', 'notas', 'observaciones', 'comments', 'comentarios'], has: ['nota', 'observ'] },
  replicate: { exact: ['replicate', 'repeticion', 'replica', 'rep'], has: ['replic', 'repetic'] },
  loadUnit: { exact: ['loadunit', 'unidadcarga', 'unidaddecarga'], has: [] },
  metricUnit: { exact: ['metricunit', 'unidadmetrica', 'unidaddemetrica'], has: [] },
};

/** Propone la asignación de columnas (índice o -1) a partir de la fila de encabezados. */
export function guessMapping(header) {
  const names = header.map(norm);
  const used = new Set();
  const mapping = {};
  for (const [key, rule] of Object.entries(FIELD_RULES)) {
    let idx = names.findIndex((n, i) => !used.has(i) && rule.exact.includes(n));
    if (idx < 0) idx = names.findIndex((n, i) => !used.has(i) && rule.has.some((h) => n.includes(h)));
    mapping[key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}

/**
 * Convierte registros en puntos {x, y, row, ...} según el mapeo. La fila 1 es el encabezado, de
 * modo que la primera fila de datos es la 2 (coincide con la numeración de una hoja de cálculo).
 * Las filas completamente vacías se ignoran y se cuentan.
 */
export function buildPoints(records, mapping) {
  const points = [];
  let emptyRows = 0;
  const cell = (r, idx) => (idx >= 0 && idx < r.length ? r[idx] : undefined);
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    if (r.every((c) => String(c).trim() === '')) { emptyRows++; continue; }
    points.push({
      row: i + 1,
      x: cell(r, mapping.load) ?? null,
      y: cell(r, mapping.metric) ?? null,
      load_unit: cell(r, mapping.loadUnit) ?? null,
      metric_unit: cell(r, mapping.metricUnit) ?? null,
      timestamp: cell(r, mapping.timestamp) ?? null,
      notes: cell(r, mapping.notes) ?? null,
      replicate: cell(r, mapping.replicate) ?? null,
    });
  }
  return { points, emptyRows };
}
