import { ApiUnavailableError, errorMessage, validatePoints } from '../api.js';
import { MAX_CSV_BYTES, MAX_CSV_ROWS, buildPoints, detectDelimiter, guessMapping, parseCSV } from '../csv.js';
import * as store from '../storage.js';
import { add, alert, button, clear, download, field, h, readFileText, select, toast } from '../ui.js';
import { distinctLevels, fmtNum } from '../util.js';

const SHOWN_ROWS = 300;
const TEMPLATE = 'load_value,latency_ms,timestamp,notes\n10,12.5,2026-11-10T09:00:00,Prueba inicial\n20,15.2,2026-11-10T09:05:00,Prueba inicial\n30,21.8,2026-11-10T09:10:00,Prueba inicial\n40,35.4,2026-11-10T09:15:00,Prueba inicial\n50,58.1,2026-11-10T09:20:00,Prueba inicial\n';

// ---- Validación: el backend es la autoridad; si no responde, validación local básica ----------

function localValidate(points) {
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    return Number(String(v).trim().replace(',', '.'));
  };
  const valid = [];
  const rejected = [];
  points.forEach((p, i) => {
    const row = p.row ?? i + 1;
    const x = num(p.x);
    const y = num(p.y);
    const why = [];
    for (const [label, v] of [['carga', x], ['métrica', y]]) {
      if (v === null) why.push(`${label}: valor faltante`);
      else if (!Number.isFinite(v)) why.push(`${label}: no numérico`);
      else if (v < 0) why.push(`${label} negativa`);
    }
    if (why.length) rejected.push({ row, reason: why.join('; ') });
    else valid.push({ row, x, y });
  });
  const seen = new Map();
  for (const v of valid) seen.set(`${v.x}|${v.y}`, [...(seen.get(`${v.x}|${v.y}`) ?? []), v.row]);
  const duplicates = [...seen.values()].filter((r) => r.length > 1).map((rows) => ({ rows }));
  return { total: points.length, valid_count: valid.length, rejected_count: rejected.length, valid, rejected, duplicates, distinct_levels: new Set(valid.map((v) => v.x)).size, warnings: [] };
}

async function validateRows(sc, points) {
  try {
    const r = await validatePoints({
      load_unit: sc.loadUnit, metric_unit: sc.metricUnit,
      points: points.map((p) => ({ x: p.x, y: p.y, row: p.row, load_unit: p.load_unit ?? null, metric_unit: p.metric_unit ?? null })),
    });
    if (!r.ok) throw new Error(errorMessage(r));
    return { ...r.data, via: 'backend' };
  } catch (err) {
    if (err instanceof ApiUnavailableError) return { ...localValidate(points), via: 'local' };
    throw err;
  }
}

const originText = (m) => (m.origin === 'csv'
  ? `CSV${m.source ? ` · ${m.source}` : ''}${m.sourceRow ? ` · fila ${m.sourceRow}` : ''}`
  : m.origin === 'synthetic' ? 'Simulado' : 'Manual');

// ---- Vista -------------------------------------------------------------------------------------

export async function renderData(root, ctx, app) {
  const { scenario: sc, measurements: ms, model, stale } = ctx;
  const levels = distinctLevels(ms);
  const xs = ms.map((m) => m.loadValue);

  // Resumen
  const summary = h('div', { class: 'block' },
    h('h2', null, 'Mediciones'),
    h('div', { class: 'kpis' },
      h('span', null, h('b', null, ms.length), ' mediciones'),
      h('span', null, h('b', null, levels), ' niveles de carga distintos'),
      ms.length ? h('span', null, 'carga de ', h('b', null, fmtNum(Math.min(...xs))), ' a ', h('b', null, fmtNum(Math.max(...xs))), ` ${sc.loadUnit}`) : null));
  if (!ms.length) summary.append(alert('pending', 'Aún no hay mediciones', h('p', null, 'Agregue al menos cuatro niveles de carga distintos, a mano o desde un CSV. Para evaluar la calidad del ajuste se recomiendan más de cuatro.')));
  else if (levels < 4) summary.append(alert('warn', `Hay ${levels} nivel(es) de carga distinto(s)`, h('p', null, 'El ajuste cúbico necesita al menos cuatro niveles distintos.')));
  else if (levels === 4) summary.append(alert('info', 'Exactamente cuatro niveles de carga', h('p', null, 'El ajuste cúbico será exacto y no permitirá evaluar su calidad. Se recomiendan más niveles.')));
  if (model && stale) summary.append(alert('warn', 'El modelo ajustado quedó desactualizado', h('p', null, 'Las mediciones cambiaron después del último ajuste. Ajuste el modelo de nuevo antes de ejecutar un cálculo vigente.')));
  if (levels >= 4) summary.append(h('div', { class: 'row', style: 'margin-top:12px' }, button(model && !stale ? 'Ver el modelo' : 'Continuar al modelado', { variant: 'primary', onclick: () => app.navigate(`#/s/${sc.id}/modelado`) })));

  // Alta manual
  const loadIn = h('input', { id: 'load-input', type: 'number', step: 'any', min: '0', required: true, autocomplete: 'off' });
  const metricIn = h('input', { type: 'number', step: 'any', min: '0', required: true, autocomplete: 'off' });
  const repIn = h('input', { type: 'text', maxlength: 20 });
  const noteIn = h('input', { type: 'text', maxlength: 200 });
  const addMsg = h('div');
  const addForm = h('form', { class: 'inline-form', novalidate: true },
    field(`Carga (${sc.loadUnit})`, loadIn),
    field(`Latencia (${sc.metricUnit})`, metricIn),
    field('Réplica (opcional)', repIn),
    field('Notas (opcional)', noteIn),
    button('Agregar', { variant: 'primary', type: 'submit' }));
  addForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    addMsg.replaceChildren();
    try {
      const res = await validateRows(sc, [{ x: loadIn.value, y: metricIn.value, row: 1 }]);
      if (res.rejected_count) {
        addMsg.append(alert('error', 'Medición rechazada', h('p', null, res.rejected[0].reason)));
        return;
      }
      const v = res.valid[0];
      if (ms.some((m) => m.loadValue === v.x && m.metricValue === v.y)) toast('Ya había una medición idéntica; se guardó como posible repetición.', 'info');
      if (res.via === 'local') toast('Backend sin conexión: se validará de nuevo al ajustar el modelo.', 'info');
      await store.addMeasurements(sc.id, [{ loadValue: v.x, metricValue: v.y, replicate: repIn.value.trim() || null, notes: noteIn.value.trim() || null, origin: 'manual' }]);
      app.pendingFocus = '#load-input';
      app.reload();
    } catch (err) {
      addMsg.append(alert('error', 'No se pudo agregar', h('p', null, err.message)));
    }
  });
  const addSection = h('div', { class: 'block' }, h('h2', null, 'Agregar una medición'), addForm, addMsg);

  // CSV
  const csvSection = h('div', { class: 'block' },
    h('h2', null, 'Importar desde CSV'),
    h('p', { class: 'lede' }, 'El archivo se revisa antes de guardar. Las filas rechazadas se listan con su motivo y nada se importa sin su confirmación.'),
    csvPanel(sc, app));

  // Tabla
  const tableSection = h('div', { class: 'block' });
  if (ms.length) tableSection.append(measurementsTable(sc, ms, app));

  root.append(summary, addSection, csvSection, tableSection);
}

// ---- Importación CSV ---------------------------------------------------------------------------

function csvPanel(sc, app) {
  const host = h('div', { class: 'stack' });
  let st = null;

  const draw = () => {
    clear(host);
    if (!st) {
      const input = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', 'aria-label': 'Archivo CSV' });
      input.addEventListener('change', () => input.files[0] && load(input.files[0]));
      host.append(
        h('div', { class: 'dropzone stack' }, input,
          h('p', { class: 'hint' }, `Encabezado en la primera fila, columnas numéricas de carga y métrica (p. ej. load_value, latency_ms). Máximo ${MAX_CSV_BYTES / 1048576} MB y ${MAX_CSV_ROWS.toLocaleString('es-CO')} filas. Las unidades del archivo deben coincidir con las del escenario (${sc.loadUnit}, ${sc.metricUnit}).`),
          button('Descargar plantilla CSV', { size: 'sm', onclick: () => download('plantilla-netthreshold.csv', TEMPLATE, 'text/csv') })));
      return;
    }
    const header = st.records[0] ?? [];
    const colOptions = [{ value: '-1', label: 'Ninguna' }, ...header.map((c, i) => ({ value: String(i), label: `${i + 1}: ${String(c).trim() || '(vacío)'}` }))];
    const mapSel = (key, label, required) => {
      const el = select(colOptions, String(st.mapping[key]));
      el.addEventListener('change', () => { st.mapping[key] = Number(el.value); revalidate(); });
      return field(required ? `${label} *` : label, el);
    };
    const delimSel = select([{ value: 'auto', label: 'Detectar' }, { value: ',', label: 'Coma ( , )' }, { value: ';', label: 'Punto y coma ( ; )' }, { value: '\t', label: 'Tabulación' }, { value: '|', label: 'Barra ( | )' }], st.delimiterMode);
    delimSel.addEventListener('change', () => { st.delimiterMode = delimSel.value; reparse(); });

    host.append(
      h('div', { class: 'spread' }, h('strong', null, st.filename), button('Cancelar importación', { variant: 'ghost', size: 'sm', onclick: () => { st = null; draw(); } })),
      h('div', { class: 'form-grid' }, field('Separador', delimSel), mapSel('load', 'Columna de carga', true), mapSel('metric', 'Columna de latencia', true), mapSel('loadUnit', 'Unidad de carga'), mapSel('metricUnit', 'Unidad de la métrica'), mapSel('replicate', 'Réplica'), mapSel('timestamp', 'Fecha y hora'), mapSel('notes', 'Notas')),
      previewTable(st.records, header));

    if (st.error) host.append(alert('error', 'No se puede validar el archivo', h('p', null, st.error)));
    else if (st.busy) host.append(h('p', { class: 'muted' }, 'Validando…'));
    else if (st.result) host.append(...resultBlock());
  };

  const resultBlock = () => {
    const r = st.result;
    const out = [h('div', { class: 'kpis' },
      h('span', null, h('b', null, r.total), ' filas de datos'),
      h('span', null, h('b', null, r.valid_count), ' válidas'),
      h('span', null, h('b', null, r.rejected_count), ' rechazadas'),
      st.emptyRows ? h('span', null, h('b', null, st.emptyRows), ' vacías ignoradas') : null,
      r.duplicates?.length ? h('span', null, h('b', null, r.duplicates.length), ' duplicadas exactas') : null)];
    if (r.via === 'local') out.push(alert('warn', 'Validación local', h('p', null, 'El backend no respondió; se aplicó una validación básica. Se validará de nuevo al ajustar el modelo.')));
    if (r.duplicates?.length) out.push(alert('info', 'Hay mediciones duplicadas', h('p', null, 'Se importarán sin eliminarlas. Confirme que son repeticiones válidas y no duplicados accidentales.')));
    if (r.rejected_count) {
      const shown = r.rejected.slice(0, 50);
      out.push(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', { class: 'num' }, 'Fila'), h('th', null, 'Motivo del rechazo'))),
        h('tbody', null, shown.map((x) => h('tr', null, h('td', { class: 'num' }, x.row), h('td', null, x.reason))),
          r.rejected_count > shown.length ? h('tr', null, h('td', { colspan: 2, class: 'empty' }, `y ${r.rejected_count - shown.length} más`)) : null))));
    }
    out.push(h('div', { class: 'row' },
      button(`Importar ${r.valid_count} fila(s) válida(s)`, { variant: 'primary', disabled: r.valid_count === 0, onclick: doImport }),
      r.rejected_count ? h('span', { class: 'muted' }, 'Las filas rechazadas no se importan.') : null));
    return out;
  };

  const parseWith = (mode) => {
    const delimiter = mode === 'auto' ? detectDelimiter(st.text) : mode;
    const { records, unterminatedQuote } = parseCSV(st.text, delimiter);
    st.records = records;
    st.unterminated = unterminatedQuote;
  };

  async function reparse() {
    parseWith(st.delimiterMode);
    st.mapping = guessMapping(st.records[0] ?? []);
    await revalidate();
  }

  async function revalidate() {
    st.result = null;
    st.error = null;
    if (st.unterminated) st.error = 'Hay una comilla sin cerrar: revise el archivo o cambie el separador.';
    else if (st.records.length < 2) st.error = 'El archivo no tiene filas de datos debajo del encabezado.';
    else if (st.records.length - 1 > MAX_CSV_ROWS) st.error = `El archivo supera el máximo de ${MAX_CSV_ROWS.toLocaleString('es-CO')} filas.`;
    else if (st.mapping.load < 0 || st.mapping.metric < 0) st.error = 'Asigne las columnas de carga y de latencia.';
    else if (st.mapping.load === st.mapping.metric) st.error = 'La carga y la latencia no pueden ser la misma columna.';
    if (st.error) { draw(); return; }
    const { points, emptyRows } = buildPoints(st.records, st.mapping);
    st.points = points;
    st.emptyRows = emptyRows;
    st.busy = true;
    draw();
    try {
      st.result = await validateRows(sc, points);
    } catch (err) {
      st.error = err.message;
    }
    st.busy = false;
    draw();
  }

  async function load(file) {
    try {
      const text = await readFileText(file, MAX_CSV_BYTES);
      st = { filename: file.name, text, delimiterMode: 'auto', mapping: {}, records: [], points: [], result: null };
      await reparse();
    } catch (err) {
      st = null;
      draw();
      toast(err.message, 'error');
    }
  }

  async function doImport() {
    const byRow = new Map(st.points.map((p) => [p.row, p]));
    const items = st.result.valid.map((v) => {
      const p = byRow.get(v.row) ?? {};
      return { loadValue: v.x, metricValue: v.y, timestamp: p.timestamp || null, replicate: p.replicate || null, notes: p.notes || null, sourceRow: v.row, origin: 'csv', source: st.filename };
    });
    await store.addMeasurements(sc.id, items);
    toast(`${items.length} medición(es) importada(s).`);
    app.reload();
  }

  draw();
  return host;
}

function previewTable(records, header) {
  const rows = records.slice(1, 9);
  return h('div', null,
    h('p', { class: 'hint', style: 'margin-bottom:6px' }, `Vista previa de las primeras ${rows.length} fila(s)`),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, header.map((c, i) => h('th', null, String(c).trim() || `Col. ${i + 1}`)))),
      h('tbody', null, rows.map((r) => h('tr', null, header.map((_, i) => h('td', null, r[i] ?? ''))))))));
}

// ---- Tabla de mediciones -----------------------------------------------------------------------

function measurementsTable(sc, ms, app) {
  const selected = new Set();
  let editingId = null;
  const host = h('div', { class: 'stack' });
  const bulk = button('Eliminar seleccionadas', { variant: 'danger', size: 'sm', disabled: true });
  const updateBulk = () => { bulk.disabled = selected.size === 0; bulk.textContent = selected.size ? `Eliminar ${selected.size} seleccionada(s)` : 'Eliminar seleccionadas'; };

  bulk.addEventListener('click', async () => {
    if (!window.confirm(`¿Eliminar ${selected.size} medición(es)? El modelo actual quedará desactualizado.`)) return;
    await store.deleteMeasurements(sc.id, [...selected]);
    app.reload();
  });

  const draw = () => {
    clear(host);
    const shown = ms.slice(0, SHOWN_ROWS);
    const all = h('input', { type: 'checkbox', 'aria-label': 'Seleccionar todas', checked: selected.size === ms.length && ms.length > 0 });
    all.addEventListener('change', () => { selected.clear(); if (all.checked) ms.forEach((m) => selected.add(m.id)); updateBulk(); draw(); });
    add(host,
      h('div', { class: 'spread' }, h('h2', null, 'Mediciones registradas'),
        h('div', { class: 'row' }, bulk, button('Eliminar todas', {
          variant: 'danger', size: 'sm',
          onclick: async () => {
            if (!window.confirm(`¿Eliminar las ${ms.length} mediciones de este escenario? El modelo actual quedará desactualizado.`)) return;
            await store.deleteMeasurements(sc.id, ms.map((m) => m.id));
            app.reload();
          },
        }))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, all), h('th', { class: 'num' }, '#'), h('th', { class: 'num' }, `Carga (${sc.loadUnit})`), h('th', { class: 'num' }, `Latencia (${sc.metricUnit})`), h('th', null, 'Réplica'), h('th', null, 'Origen'), h('th', null, 'Notas'), h('th', null, h('span', { class: 'sr' }, 'Acciones'))),
        ),
        h('tbody', null, shown.map((m, i) => (editingId === m.id ? editRow(m, i) : viewRow(m, i)))))),
      ms.length > SHOWN_ROWS ? h('p', { class: 'hint' }, `Se muestran las primeras ${SHOWN_ROWS} de ${ms.length} mediciones; todas se usan en el ajuste.`) : null);
  };

  const viewRow = (m, i) => h('tr', null,
    h('td', null, h('input', { type: 'checkbox', checked: selected.has(m.id), 'aria-label': `Seleccionar medición ${i + 1}`, onchange: (e) => { if (e.target.checked) selected.add(m.id); else selected.delete(m.id); updateBulk(); } })),
    h('td', { class: 'num' }, i + 1), h('td', { class: 'num' }, fmtNum(m.loadValue)), h('td', { class: 'num' }, fmtNum(m.metricValue)),
    h('td', null, m.replicate ?? ''), h('td', null, originText(m)), h('td', null, m.notes ?? ''),
    h('td', { class: 'col-actions' },
      button('Editar', { variant: 'ghost', size: 'sm', onclick: () => { editingId = m.id; draw(); } }),
      button('Eliminar', { variant: 'ghost', size: 'sm', class: 'btn-danger', onclick: async () => { await store.deleteMeasurements(sc.id, [m.id]); app.reload(); } })));

  const editRow = (m, i) => {
    const x = h('input', { type: 'number', step: 'any', min: '0', value: m.loadValue, 'aria-label': 'Carga' });
    const y = h('input', { type: 'number', step: 'any', min: '0', value: m.metricValue, 'aria-label': 'Latencia' });
    const rep = h('input', { type: 'text', value: m.replicate ?? '', 'aria-label': 'Réplica' });
    const note = h('input', { type: 'text', value: m.notes ?? '', 'aria-label': 'Notas' });
    return h('tr', null,
      h('td'), h('td', { class: 'num' }, i + 1), h('td', null, x), h('td', null, y), h('td', null, rep), h('td', null, originText(m)), h('td', null, note),
      h('td', { class: 'col-actions' },
        button('Guardar', {
          variant: 'primary', size: 'sm',
          onclick: async () => {
            try {
              const res = await validateRows(sc, [{ x: x.value, y: y.value, row: 1 }]);
              if (res.rejected_count) { toast(res.rejected[0].reason, 'error'); return; }
              await store.updateMeasurement({ ...m, loadValue: res.valid[0].x, metricValue: res.valid[0].y, replicate: rep.value.trim() || null, notes: note.value.trim() || null });
              app.reload();
            } catch (err) { toast(err.message, 'error'); }
          },
        }),
        button('Cancelar', { variant: 'ghost', size: 'sm', onclick: () => { editingId = null; draw(); } })));
  };

  draw();
  return host;
}
