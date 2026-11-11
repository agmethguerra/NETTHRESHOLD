// Ayudas de interfaz. Todo el contenido de usuario entra como texto (nunca como HTML).

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (['value', 'checked', 'disabled', 'selected', 'readOnly'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Como Element.append, pero ignora null/undefined/false (el nativo escribiría «null»). */
export function add(el, ...kids) {
  append(el, kids);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const GLYPH = { ok: '✓', warn: '!', error: '×', pending: '○', info: 'i' };

/** Estado con icono y texto: nunca solo color. */
export function badge(tone, label) {
  return h('span', { class: `badge badge-${tone}` }, h('span', { class: 'badge-mark', 'aria-hidden': 'true' }, GLYPH[tone] ?? '○'), label);
}

export function alert(tone, title, ...body) {
  return h(
    'div',
    { class: `alert alert-${tone}`, role: tone === 'error' ? 'alert' : 'status' },
    h('span', { class: 'alert-mark', 'aria-hidden': 'true' }, GLYPH[tone] ?? 'i'),
    h('div', { class: 'alert-body' }, title ? h('strong', null, title) : null, ...body),
  );
}

let idCounter = 0;
export const nextId = (p = 'f') => `${p}-${++idCounter}`;

/** Campo de formulario con etiqueta asociada y texto de ayuda opcional. */
export function field(label, control, hint) {
  const id = control.id || (control.id = nextId());
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'hint', id: hintId }, hint) : null);
}

export function select(options, value, props = {}) {
  const el = h('select', props);
  for (const o of options) {
    el.append(h('option', { value: o.value, selected: o.value === value }, o.label));
  }
  return el;
}

export function button(label, props = {}) {
  const { variant = 'secondary', size, ...rest } = props;
  const cls = ['btn', `btn-${variant}`, size ? `btn-${size}` : '', rest.class || ''].filter(Boolean).join(' ');
  return h('button', { type: 'button', ...rest, class: cls }, label);
}

export function section(title, ...children) {
  return h('section', { class: 'block' }, title ? h('h2', null, title) : null, ...children);
}

export function table({ columns, rows, className = '', empty = 'Sin datos.' }) {
  const head = h('tr', null, columns.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : '' }, c.label)));
  const body = rows.length
    ? rows.map((r) => h('tr', null, columns.map((c) => h('td', { class: c.num ? 'num' : '' }, c.render ? c.render(r) : r[c.key]))))
    : [h('tr', null, h('td', { colspan: columns.length, class: 'empty' }, empty))];
  return h('div', { class: 'table-wrap' }, h('table', { class: `data ${className}` }, h('thead', null, head), h('tbody', null, body)));
}

// ---- Avisos --------------------------------------------------------------------------------

export function toast(message, tone = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast toast-${tone}`, role: tone === 'error' ? 'alert' : 'status' }, message);
  box.append(t);
  setTimeout(() => t.remove(), tone === 'error' ? 9000 : 4500);
}

// ---- Archivos ------------------------------------------------------------------------------

export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file, maxBytes) {
  if (maxBytes && file.size > maxBytes) {
    return Promise.reject(new Error(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB y supera el límite de ${(maxBytes / 1048576).toFixed(0)} MB.`));
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.readAsText(file);
  });
}

export const dateStamp = () => new Date().toISOString().slice(0, 10).replaceAll('-', '');

export function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'escenario';
}
