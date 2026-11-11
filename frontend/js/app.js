// Punto de entrada: enrutador por hash, guía de pasos y estado del backend.
import { destroyCharts } from './charts.js';
import * as store from './storage.js';
import { alert, badge, button, clear, h, toast } from './ui.js';
import { computeStatus, distinctLevels, isModelStale, networkLabel } from './util.js';
import { renderDashboard } from './views/dashboard.js';
import { renderData } from './views/data.js';
import { renderModeling } from './views/modeling.js';
import { renderMeasure } from './views/measure.js';
import { renderMuller } from './views/muller.js';
import { renderReport } from './views/report.js';
import { renderResults } from './views/results.js';
import { renderAbout } from './views/about.js';
import { IDENTITY, LOGO } from './identity.js';
import { startRain } from './rain.js';
import { renderScenarioForm } from './views/scenario.js';

const STEPS = [
  { key: 'escenario', label: 'Escenario', render: renderScenarioForm },
  { key: 'datos', label: 'Datos', render: renderData },
  { key: 'modelado', label: 'Modelado', render: renderModeling },
  { key: 'muller', label: 'Müller', render: renderMuller },
  { key: 'resultados', label: 'Resultados', render: renderResults },
  { key: 'reporte', label: 'Reporte', render: renderReport },
];

const view = document.getElementById('view');
let token = 0;
let afterQueue = [];

export const app = {
  pendingFocus: null,
  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  reload: () => render({ keepScroll: true }),
  /** Ejecuta `fn` cuando la vista ya está en el DOM (p. ej. para crear gráficas). */
  after(fn) { afterQueue.push(fn); },
};

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'nuevo') return { name: 'new' };
  if (parts[0] === 'analisis') return { name: 'dashboard' };
  if (!parts.length || parts[0] === 'medir') return { name: 'measure' };
  if (parts[0] === 'acerca') return { name: 'about' };
  if (parts[0] === 's' && parts[1]) {
    const step = STEPS.some((s) => s.key === parts[2]) ? parts[2] : 'datos';
    return { name: 'workspace', id: parts[1], step };
  }
  return { name: 'dashboard' };
}
const MODULE = { measure: 'medicion', dashboard: 'analisis', new: 'analisis', workspace: 'analisis', about: 'acerca' };

async function loadCtx(id) {
  const scenario = await store.getScenario(id);
  if (!scenario) return null;
  const [measurements, models, calculations] = await Promise.all([
    store.listMeasurements(id), store.listModels(id), store.listCalculations(id),
  ]);
  const model = models[0] ?? null;
  const stale = isModelStale(model, scenario);
  return {
    scenario, measurements, models, model, calculations, stale,
    status: computeStatus(scenario, measurements, model, calculations),
  };
}

function rail(ctx, route) {
  const { scenario, measurements: ms, model, calculations, stale } = ctx;
  const levels = distinctLevels(ms);
  const current = model && !stale ? calculations.find((c) => c.modelId === model.id) : null;
  const state = {
    escenario: 'done',
    datos: ms.length && levels >= 4 ? 'done' : ms.length ? 'warn' : '',
    modelado: model ? (stale ? 'warn' : 'done') : '',
    muller: current ? 'done' : model && !stale ? '' : 'locked',
    resultados: calculations.length ? (current?.status === 'converged' ? 'done' : current ? 'warn' : '') : 'locked',
    reporte: model ? '' : 'locked',
  };
  return h('nav', { class: 'rail', 'aria-label': 'Pasos del análisis' },
    h('ol', null, STEPS.map((s, i) => {
      const st = state[s.key];
      const mark = st === 'done' ? '✓' : st === 'warn' ? '!' : String(i + 1);
      return h('li', null,
        h('a', {
          href: `#/s/${scenario.id}/${s.key}`, class: st, 'aria-current': s.key === route.step ? 'step' : null,
        }, h('span', { class: 'step-mark', 'aria-hidden': 'true' }, mark), h('span', { class: 'step-label' }, s.label)));
    })));
}

function header(ctx) {
  const { scenario, status } = ctx;
  return h('div', { class: 'ws-head' },
    h('a', { class: 'crumb', href: '#/analisis' }, '‹ Análisis avanzado'),
    h('h1', null, scenario.name),
    h('div', { class: 'ws-meta' },
      networkLabel(scenario.networkType),
      badge(status.tone, status.label),
      scenario.dataSource === 'synthetic' ? badge('info', 'Datos simulados') : null));
}

function mount(node, my) {
  if (my !== token) return false;
  clear(view);
  view.append(node);
  return true;
}

async function render({ keepScroll = false } = {}) {
  const my = ++token;
  const scrollY = window.scrollY;
  destroyCharts();
  afterQueue = [];
  const route = parseHash();
  document.querySelectorAll('.modnav a').forEach((a) => (a.dataset.mod === MODULE[route.name] ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  try {
    let node;
    if (route.name === 'dashboard') {
      node = h('div');
      await renderDashboard(node, app);
    } else if (route.name === 'measure') {
      node = h('div', { class: 'ws-main' });
      await renderMeasure(node, app);
    } else if (route.name === 'about') {
      node = h('div', { class: 'ws-main' }, h('a', { class: 'crumb', href: '#/' }, '‹ Inicio'));
      renderAbout(node);
    } else if (route.name === 'new') {
      node = h('div', { class: 'ws-main' }, h('a', { class: 'crumb', href: '#/analisis' }, '‹ Análisis avanzado'), h('h1', null, 'Nuevo escenario'));
      const body = h('div', { class: 'block' });
      await renderScenarioForm(body, null, app);
      node.append(body);
    } else {
      const ctx = await loadCtx(route.id);
      if (!ctx) {
        node = h('div', null, alert('error', 'No se encontró el escenario', h('p', null, 'Es posible que se haya eliminado o que pertenezca a otro navegador. '), h('a', { href: '#/analisis' }, 'Volver a escenarios')));
      } else {
        const content = h('div', { class: 'ws-content' });
        const step = STEPS.find((s) => s.key === route.step);
        await step.render(content, ctx, app);
        node = h('div', { class: 'workspace' }, rail(ctx, route), h('div', { class: 'ws-main' }, header(ctx), content));
      }
    }
    if (!mount(node, my)) return;
    for (const fn of afterQueue) fn();
    afterQueue = [];
    if (keepScroll) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);
    if (app.pendingFocus) {
      view.querySelector(app.pendingFocus)?.focus();
      app.pendingFocus = null;
    }
  } catch (err) {
    console.error(err);
    if (my === token) {
      mount(h('div', null, alert('error', 'No se pudo mostrar esta pantalla', h('p', null, err.message || String(err)), h('a', { href: '#/analisis' }, 'Volver a escenarios'))), my);
    }
  }
}

// ---- Indicador de modo ---------------------------------------------------------------------

const statusBox = document.getElementById('backend-status');
function showMode() {
  clear(statusBox);
  statusBox.append(h('span', { class: 'dot on', 'aria-hidden': 'true' }), 'Funciona sin servidor: todo se calcula en su navegador');
}

async function start() {
  try {
    await store.openDB();
  } catch (err) {
    clear(view);
    view.append(alert('error', 'Este navegador no permite el almacenamiento local (IndexedDB)',
      h('p', null, 'NetThreshold guarda los datos en el navegador. Salga del modo privado o pruebe con un navegador moderno. '), h('p', null, err.message)));
    return;
  }
  showMode();
  startRain();
  document.getElementById('logo').innerHTML = LOGO;
  window.addEventListener('hashchange', () => render());
  window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message ?? 'Ocurrió un error inesperado.', 'error'));
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => render({ keepScroll: true }));
  render();
}

start();
