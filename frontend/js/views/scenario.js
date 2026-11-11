import * as store from '../storage.js';
import { sourceLabel, statisticLabel } from '../util.js';
import { add, alert, button, dateStamp, download, h, nextId, slug, toast } from '../ui.js';
import {
  FIELD_LABELS, LIMITS, LOAD_VARIABLES, NETWORK_HELP, NETWORK_OPTIONS, PACKET_OPTIONS, PROFILES, PROTOCOL_OPTIONS, SOURCE_OPTIONS,
  STATISTIC_OPTIONS, TARGET_OPTIONS, TOOL_OPTIONS, draftFromScenario, loadOption, sanitizeInt, sanitizeName, suggestName, summaryParts,
  todayStr, validateScenario,
} from '../scenarioSpec.js';

/**
 * Formulario de escenario (CU-01), v1.5: todo se elige de listas o tarjetas, la unidad y el umbral se
 * deducen, lo escrito tiene límites estrictos y no se puede guardar mientras falte o sobre algo.
 * ctx === null crea uno nuevo.
 */
export async function renderScenarioForm(root, ctx, app) {
  const sc = ctx?.scenario ?? {};
  const existingNames = (await store.listScenarios()).filter((s) => s.id !== sc.id).map((s) => s.name);
  const d = draftFromScenario(sc);
  const touched = new Set();
  const fields = {}; // campo → { err, control }

  // ---- Constructores ----------------------------------------------------------------------
  const req = (t) => h('span', null, t, ' ', h('span', { class: 'req', 'aria-hidden': 'true' }, '*'));
  const opt = (value, label, extra = {}) => h('option', { value, ...extra }, label);

  /** Lista cerrada. `placeholder` crea una primera opción vacía no seleccionable de nuevo. */
  function pick(options, value, { placeholder, legacy } = {}) {
    const el = h('select');
    if (placeholder) el.append(opt('', placeholder, { disabled: true }));
    const list = options.map((o) => ({ value: o.value ?? o.key, label: o.label ?? o.title }));
    if (legacy && value && !list.some((o) => o.value === value)) list.push({ value, label: `${legacy(value)} (de una versión anterior)` });
    for (const o of list) el.append(opt(o.value, o.label));
    el.value = value ?? '';
    return el;
  }

  /** Campo con etiqueta, texto de ayuda dinámico y mensaje de error propio. */
  function fld(name, labelNode, control, { wide = false } = {}) {
    const id = control.id || (control.id = nextId());
    const hint = h('p', { class: 'hint', id: `${id}-hint` });
    const err = h('p', { class: 'field-error', id: `${id}-err`, 'aria-live': 'polite' });
    control.setAttribute('aria-describedby', `${id}-hint ${id}-err`);
    fields[name] = { err, control };
    const el = h('div', { class: wide ? 'field wide' : 'field' }, h('label', { for: id }, labelNode), control, hint, err);
    return { el, hint };
  }

  const step = (n, title, lede, ...kids) => h('section', { class: 'form-step' },
    h('h3', null, h('span', { class: 'step-n', 'aria-hidden': 'true' }, n), title),
    lede ? h('p', { class: 'step-lede' }, lede) : null, ...kids);

  const counter = (el, max) => {
    const c = h('span', { class: 'counter' });
    return { c, update: () => { c.textContent = `${el.value.length}/${max}`; } };
  };

  // ---- Controles --------------------------------------------------------------------------
  const name = h('input', { type: 'text', maxlength: LIMITS.nameMax, autocomplete: 'off', value: d.name });
  const nameCount = counter(name, LIMITS.nameMax);
  const description = h('textarea', { maxlength: LIMITS.descMax }, d.description);
  const descCount = counter(description, LIMITS.descMax);
  const networkType = pick(NETWORK_OPTIONS, d.networkType, { placeholder: 'Elija el tipo de red…' });
  const dataSource = pick(SOURCE_OPTIONS, d.dataSource, { placeholder: 'Elija el origen…', legacy: sourceLabel });
  const loadKey = pick(LOAD_VARIABLES, d.loadKey === 'legacy' ? '' : d.loadKey, { placeholder: 'Elija qué va aumentando…' });
  if (d.loadKey === 'legacy') {
    loadKey.append(opt('legacy', `${sc.loadVariable} (${sc.loadUnit}) — de una versión anterior`));
    loadKey.value = 'legacy';
  }
  const statistic = pick(STATISTIC_OPTIONS, d.statistic, { legacy: statisticLabel });
  const date = h('input', { type: 'date', min: '2000-01-01', max: todayStr(), value: d.date });
  const start = h('input', { type: 'time', value: d.start, 'aria-label': 'Hora de inicio' });
  const end = h('input', { type: 'time', value: d.end, 'aria-label': 'Hora de fin' });
  const tool = pick(TOOL_OPTIONS, d.tool);
  const protocol = pick(PROTOCOL_OPTIONS, d.protocol);
  const target = pick(TARGET_OPTIONS, d.target);
  const packetSize = pick(PACKET_OPTIONS, d.packetSize);
  const notes = h('textarea', { maxlength: LIMITS.notesMax, placeholder: 'Opcional: topología, equipos, algo que no encaje en las listas.' }, d.notes);
  const notesCount = counter(notes, LIMITS.notesMax);

  // Límite de respuesta: tarjetas de perfil + (solo «Otro límite») número y deslizador acotados.
  const customNum = h('input', { type: 'text', inputmode: 'numeric', maxlength: 4, autocomplete: 'off', value: String(d.threshold ?? ''), 'aria-label': 'Límite en milisegundos' });
  const slider = h('input', { type: 'range', min: LIMITS.sliderMin, max: LIMITS.sliderMax, step: LIMITS.sliderStep, 'aria-label': 'Ajustar límite con el deslizador' });
  slider.value = String(Math.min(LIMITS.sliderMax, Math.max(LIMITS.sliderMin, Number(d.threshold) || 150)));
  const thrErr = h('p', { class: 'field-error', id: 'thr-err', 'aria-live': 'polite' });
  fields.threshold = { err: thrErr, control: customNum };
  customNum.setAttribute('aria-describedby', 'thr-err');
  const customBox = h('div', { class: 'custom-limit' },
    h('label', { for: (customNum.id = nextId()) }, 'Tiempo máximo aceptable'),
    h('div', { class: 'custom-row' }, customNum, h('span', { class: 'unit-chip' }, 'ms'), slider),
    h('p', { class: 'hint' }, 'Referencia: menos de 50 ms es excelente; 150 ms sirve para llamadas; más de 400 ms se siente lento en casi todo.'), thrErr);

  const profileLegend = h('legend', { id: 'profile-legend' }, 'Para qué se usa esta red');
  const cards = h('div', { class: 'cards', role: 'radiogroup', 'aria-labelledby': 'profile-legend' });
  const radios = PROFILES.map((p) => {
    const input = h('input', { type: 'radio', name: 'profile', value: p.key, checked: p.key === d.profile });
    input.addEventListener('change', () => { d.profile = p.key; touched.add('profile'); if (p.ms) { d.threshold = p.ms; syncThreshold(); } refresh(); });
    cards.append(h('label', { class: 'card-opt' }, input, h('span', { class: 'card-body' },
      h('strong', null, p.title), h('span', { class: 'card-limit' }, p.ms ? `límite ${p.ms} ms` : 'usted decide'), h('span', { class: 'card-help' }, p.help))));
    return input;
  });
  const profileBox = h('fieldset', { class: 'profile' }, profileLegend,
    h('p', { class: 'hint' }, 'Elija la situación que más se parezca: de ahí sale el tiempo de respuesta máximo aceptable. Si no está seguro, deje «Clases y videollamadas».'),
    cards, customBox);

  // Unidades y métrica: se muestran, pero no se escriben.
  const unitChip = h('span', { class: 'unit-chip locked' });
  const loadHelp = h('details', { class: 'guide' }, h('summary', null, '¿No sabe cuál elegir?'),
    h('ul', null, LOAD_VARIABLES.map((v) => h('li', null, h('strong', null, v.label), ' — ', v.when))));
  const metricInfo = h('div', { class: 'fixed-metric' },
    h('span', { class: 'fixed-label' }, 'Qué se mide'),
    h('span', { class: 'unit-chip locked' }, 'Latencia (tiempo de respuesta)'), h('span', { class: 'unit-chip locked' }, `en ${sc.metricUnit ?? 'ms'}`),
    h('p', { class: 'hint' }, 'Es la única métrica disponible por ahora; la unidad la fija el sistema para que no se mezclen unidades.'));

  const syntheticNote = h('div');
  const summary = h('p', { class: 'summary-text' });
  const status = h('p', { class: 'form-status', 'aria-live': 'polite' });
  const submit = button(ctx ? 'Guardar cambios' : 'Crear escenario', { variant: 'primary', type: 'submit' });

  // ---- Estructura -------------------------------------------------------------------------
  const nameF = fld('name', 'Nombre del escenario', name);
  const descF = fld('description', 'Descripción (opcional)', description, { wide: true });
  const netF = fld('networkType', req('Tipo de red'), networkType);
  const srcF = fld('dataSource', req('Origen de los datos'), dataSource);
  const loadF = fld('loadKey', req('Variable de carga'), loadKey, { wide: true });
  const statF = fld('statistic', 'Estadístico', statistic);
  const dateF = fld('date', 'Fecha de la medición (opcional)', date);
  const timeRow = h('div', { class: 'time-row' }, start, h('span', null, 'a'), end);
  const timeF = fld('time', 'Hora de inicio y fin (opcional)', timeRow);
  fields.time.control = start;
  timeF.el.querySelector('label').setAttribute('for', (start.id = nextId()));
  const toolF = fld('tool', 'Herramienta usada', tool);
  const protoF = fld('protocol', 'Protocolo', protocol);
  const targetF = fld('target', 'Destino de la prueba', target);
  const packetF = fld('packetSize', 'Tamaño de los paquetes', packetSize);
  const notesF = fld('notes', 'Notas (opcional)', notes, { wide: true });
  nameF.el.append(nameCount.c); descF.el.append(descCount.c); notesF.el.append(notesCount.c);
  loadF.el.insertBefore(h('div', { class: 'unit-line' }, h('span', { class: 'fixed-label' }, 'Unidad (automática)'), unitChip), loadF.el.querySelector('.hint'));
  loadF.el.append(loadHelp);

  const form = h('form', { novalidate: true, class: 'stack scenario-form' },
    step(1, 'Datos generales', 'Qué red es y de dónde vienen las mediciones.',
      h('div', { class: 'form-grid' }, nameF.el, descF.el, netF.el, srcF.el)),
    syntheticNote,
    step(2, 'Qué se va a medir', 'La carga es lo que usted aumenta en la prueba; la respuesta de la red es lo que se observa.',
      h('div', { class: 'form-grid' }, loadF.el, h('div', { class: 'field' }, metricInfo), statF.el)),
    step(3, '¿Cuándo la red deja de ser aceptable?', 'Es el límite del tiempo de respuesta. NetThreshold calcula en qué carga se llega a él.', profileBox),
    step(4, 'Cómo se midió (opcional)', 'Sirve para que el informe quede completo. Si no lo recuerda, deje «No lo sé».',
      h('div', { class: 'form-grid' }, dateF.el, timeF.el, toolF.el, protoF.el, targetF.el, packetF.el, notesF.el)),
    h('section', { class: 'form-step summary' }, h('h3', null, 'Resumen: así quedará su análisis'), summary),
    status,
    h('div', { class: 'row' },
      submit,
      ctx ? button('Exportar escenario', {
        onclick: async () => {
          download(`netthreshold-${slug(sc.name)}-${dateStamp()}.json`, JSON.stringify(await store.exportScenario(sc.id), null, 2), 'application/json');
        },
      }) : button('Cancelar', { variant: 'ghost', onclick: () => app.navigate('#/') }),
      ctx ? button('Eliminar escenario', {
        variant: 'danger',
        onclick: async () => {
          if (!window.confirm(`¿Eliminar «${sc.name}» con todas sus mediciones, modelos y cálculos? Esta acción no se puede deshacer.`)) return;
          await store.deleteScenario(sc.id);
          toast('Escenario eliminado.');
          app.navigate('#/');
        },
      }) : null));

  // ---- Estado → pantalla ------------------------------------------------------------------
  function syncThreshold() {
    customNum.value = String(d.threshold ?? '');
    slider.value = String(Math.min(LIMITS.sliderMax, Math.max(LIMITS.sliderMin, Number(d.threshold) || 150)));
  }

  function refresh() {
    const res = validateScenario(d, { existingNames, original: sc });
    // Ayudas que cambian con la selección
    const load = d.loadKey ? loadOption(d.loadKey, sc) : null;
    unitChip.textContent = load ? load.unit : 'se fija al elegir la variable';
    unitChip.classList.toggle('empty', !load);
    loadF.hint.textContent = load ? `Elegida: ${load.when}` : 'Es lo que usted va aumentando en la prueba. La unidad se asigna sola.';
    netF.hint.textContent = d.networkType ? NETWORK_HELP[d.networkType] ?? 'Valor de una versión anterior.' : 'Solo describe el contexto; no cambia el modelo matemático.';
    srcF.hint.textContent = SOURCE_OPTIONS.find((o) => o.value === d.dataSource)?.help ?? 'Indica si los datos son reales o simulados; el informe lo mostrará.';
    statF.hint.textContent = STATISTIC_OPTIONS.find((o) => o.value === d.statistic)?.help ?? 'No mezcle varios estadísticos en un mismo análisis.';
    nameF.hint.textContent = d.name.trim() ? 'Letras, números, espacios y signos comunes.' : `Si lo deja vacío se usará: «${suggestName(d, existingNames)}»`;
    name.placeholder = suggestName(d, existingNames);
    dateF.hint.textContent = !d.date && sc.conditions?.period && !sc.conditions?.periodDate ? `Periodo anterior: «${sc.conditions.period}». Elija una fecha para reemplazarlo.` : 'No puede ser posterior a hoy.';
    timeF.hint.textContent = d.date ? 'Formato de 24 horas.' : 'Primero elija la fecha.';
    toolF.hint.textContent = ''; protoF.hint.textContent = ''; targetF.hint.textContent = ''; packetF.hint.textContent = '';
    descF.hint.textContent = 'Una frase sobre el propósito de este análisis.'; notesF.hint.textContent = '';
    nameCount.update(); descCount.update(); notesCount.update();

    const synthetic = d.dataSource === 'synthetic';
    for (const el of [date, start, end]) el.disabled = synthetic || (el !== date && !d.date);
    if (synthetic) timeF.hint.textContent = 'No aplica con datos simulados.';
    syntheticNote.replaceChildren(synthetic ? alert('info', 'Los datos se etiquetarán como simulados', h('p', null, 'Los informes mostrarán que no corresponden a una red real.')) : '');

    const custom = d.profile === 'custom';
    customBox.hidden = !custom;
    radios.forEach((r) => { r.checked = r.value === d.profile; });

    // Errores: los «invalid» se ven siempre; los «missing» cuando el campo ya se tocó.
    for (const [f, { err, control }] of Object.entries(fields)) {
      const e = res.errors[f];
      const show = e && (e.kind === 'invalid' || touched.has(f));
      err.textContent = show ? e.msg : '';
      if (show) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
    }
    submit.disabled = !res.ok;
    submit.title = res.ok ? '' : 'Complete los campos marcados para poder guardar.';
    const labels = Object.entries(res.errors).map(([f, e]) => `${FIELD_LABELS[f]}${e.kind === 'invalid' ? ' (corregir)' : ''}`);
    status.className = `form-status ${res.ok ? 'ok' : 'todo'}`;
    status.textContent = res.ok ? 'Todo listo: revise el resumen y guarde.' : `Para guardar falta: ${labels.join(' · ')}.`;
    summary.replaceChildren(...summaryParts(d, { original: sc }).map((s) => (s.strong ? h('strong', null, s.text) : s.muted ? h('span', { class: 'muted' }, s.text) : s.text)));
    return res;
  }

  // ---- Eventos ----------------------------------------------------------------------------
  const bind = (el, key, f = key, transform) => {
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' || el.type === 'time' ? 'change' : 'input', () => {
      d[key] = transform ? transform(el.value) : el.value;
      touched.add(f);
      refresh();
    });
    el.addEventListener('blur', () => { touched.add(f); refresh(); });
  };
  name.addEventListener('input', () => {
    const clean = sanitizeName(name.value);
    if (clean !== name.value) {
      const pos = Math.max(0, (name.selectionStart ?? clean.length) - (name.value.length - clean.length));
      name.value = clean;
      name.setSelectionRange(pos, pos);
    }
    d.name = clean;
    refresh();
  });
  bind(description, 'description'); bind(networkType, 'networkType'); bind(dataSource, 'dataSource'); bind(loadKey, 'loadKey');
  bind(statistic, 'statistic'); bind(date, 'date'); bind(start, 'start', 'time'); bind(end, 'end', 'time');
  bind(tool, 'tool'); bind(protocol, 'protocol'); bind(target, 'target'); bind(packetSize, 'packetSize'); bind(notes, 'notes');
  customNum.addEventListener('input', () => {
    customNum.value = sanitizeInt(customNum.value);
    d.threshold = customNum.value;
    if (customNum.value) slider.value = String(Math.min(LIMITS.sliderMax, Math.max(LIMITS.sliderMin, Number(customNum.value))));
    refresh();
  });
  customNum.addEventListener('blur', () => { // al salir, se ajusta al rango permitido
    const n = Number(customNum.value);
    if (customNum.value === '' || n < LIMITS.thrMin) d.threshold = LIMITS.thrMin;
    else if (n > LIMITS.thrMax) d.threshold = LIMITS.thrMax;
    syncThreshold();
    refresh();
  });
  slider.addEventListener('input', () => { d.threshold = Number(slider.value); customNum.value = slider.value; refresh(); });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const res = refresh();
    if (!res.ok) {
      Object.keys(res.errors).forEach((f) => touched.add(f));
      refresh();
      fields[Object.keys(res.errors)[0]]?.control.focus();
      return;
    }
    const v = res.value;
    if (ctx?.measurements.length && (sc.loadUnit !== v.loadUnit || sc.metricUnit !== v.metricUnit)) {
      if (!window.confirm('Cambiar la variable de carga cambia la unidad y no convierte las mediciones existentes. ¿Continuar?')) return;
    }
    submit.disabled = true;
    const saved = await store.saveScenario({ ...sc, ...v, conditions: { ...(sc.conditions ?? {}), ...v.conditions } });
    if (ctx) {
      toast('Cambios guardados.');
      app.reload();
    } else {
      toast('Escenario creado. Agregue las mediciones.');
      app.navigate(`#/s/${saved.id}/datos`);
    }
  });

  add(root,
    ctx ? h('h2', null, 'Configuración del escenario') : null,
    ctx
      ? h('p', { class: 'lede' }, 'Cambiar el límite no obliga a ajustar de nuevo el modelo: los cálculos anteriores conservan el umbral con el que se ejecutaron.')
      : h('p', { class: 'lede' }, 'Defina qué se mide y cuál es el límite aceptable. Todo se elige de listas; no hay nada que adivinar. Un escenario analiza una sola red y una sola métrica.'),
    form);
  refresh();
  if (!ctx) app.pendingFocus = 'input[type="text"]';
}
