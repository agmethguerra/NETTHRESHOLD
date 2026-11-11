// Pantalla «Medir mi red»: prueba real, ajuste, Müller y conclusión en palabras simples.
import { fitModel, solveMuller } from '../api.js';
import { DEFAULT_ENDPOINT, LEVELS, buildConclusion, runMeasurement } from '../measure.js';
import * as store from '../storage.js';
import { createGauge, niceMax } from '../gauge.js';
import { runDemo } from '../demo.js';
import { USE } from '../util.js';
import { alert, button, field, h, select, toast } from '../ui.js';

const PROFILES = Object.entries(USE).map(([value, u]) => ({ value, label: u.label }));

/** Convierte la medición en escenario + mediciones + modelo + cálculo. Devuelve { scenarioId, calc }. */
export async function saveMeasurement(result, { threshold, perPersonMbps }) {
  const now = new Date();
  const live = { stages: result.stages.map((s) => ({ level: s.level, latencyMs: s.latencyMs, mbps: s.mbps, errorRate: s.errorRate })),
    baselineMs: result.baselineMs, stopReason: result.stopReason, perPersonMbps, threshold, totalMB: Math.round(result.totalBytes / 1e6) };
  const sc = await store.saveScenario({
    name: `Medición de mi red — ${now.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}`,
    description: 'Medición en vivo desde el navegador: descargas simultáneas crecientes y tiempo de respuesta bajo carga.',
    networkType: 'wlan', loadVariable: 'Descargas simultáneas', loadUnit: 'descargas', metric: 'latency', metricUnit: 'ms',
    statistic: 'median', threshold, dataSource: 'measured',
    conditions: { period: now.toLocaleString('es-CO'), notes: `Servidor de prueba: ${result.endpoint}. Línea base sin carga: ${Math.round(result.baselineMs)} ms. Mide el camino completo hasta el servidor, no solo el Wi-Fi.`, live },
  });
  const items = [];
  for (const s of result.stages) s.windows.forEach((w, i) => items.push({ loadValue: s.level, metricValue: Math.round(w.latencyMs * 100) / 100, replicate: i + 1, origin: 'measured', notes: `${(s.mbps ?? 0).toFixed(1)} Mbps` }));
  await store.addMeasurements(sc.id, items);
  const fresh = await store.getScenario(sc.id);
  const ms = await store.listMeasurements(sc.id);
  const fit = await fitModel({ model_type: 'cubic', load_unit: 'descargas', metric: 'latency', metric_unit: 'ms', threshold,
    points: ms.map((m, i) => ({ x: m.loadValue, y: m.metricValue, row: i + 1 })) });
  if (!fit.ok) return { scenarioId: sc.id, calc: null, fitError: fit.data?.message, live };
  const d = fit.data;
  const model = await store.saveModel({
    scenarioId: sc.id, modelType: d.model_type, coefficients: d.coefficients, equation: d.equation, xMin: d.x_min, xMax: d.x_max,
    rmse: d.rmse, r2: d.r2, nPoints: d.n_points, distinctLevels: d.distinct_levels, conditionNumber: d.condition_number,
    warnings: d.warnings, residuals: d.residuals, suggestion: d.suggestion ?? null, measurementSetVersion: fresh.dataVersion,
    points: ms.map((m) => [m.loadValue, m.metricValue]),
  });
  const crosses = d.suggestion?.found;
  let calc = null;
  if (crosses) {
    const s = d.suggestion;
    const r = await solveMuller({ coefficients: model.coefficients, threshold, x0: s.x0, x1: s.x1, x2: s.x2, step_tolerance: 1e-8,
      residual_tolerance: 1e-8, max_iterations: 100, x_min: model.xMin, x_max: model.xMax, load_unit: 'descargas' });
    const c = r.data;
    calc = await store.saveCalculation({
      scenarioId: sc.id, modelId: model.id, x0: s.x0, x1: s.x1, x2: s.x2, stepTolerance: 1e-8, residualTolerance: 1e-8, maxIterations: 100,
      threshold, loadUnit: 'descargas', status: c.status, message: c.message, root: c.root, rootIsReal: c.root_is_real, rootComplex: c.root_complex,
      residual: c.residual, step: c.step, iterationsCount: c.iterations_count, iterations: c.iterations, warnings: c.warnings,
      metricAtRoot: c.metric_at_root, referenceRoots: c.reference_roots, lastApproximation: c.last_approximation ?? null,
      assessment: { numerically_converged: c.numerically_converged, root_is_real: c.root_is_real, root_non_negative: c.root_non_negative,
        within_calibrated_range: c.within_calibrated_range, valid_threshold: c.valid_threshold },
    });
  }
  return { scenarioId: sc.id, calc, live };
}

export function conclusionBlock(live, calc) {
  const c = buildConclusion(live, calc);
  return alert(c.tone, 'Conclusión para su red', ...c.lines.map((t, i) => h('p', i === 0 ? { style: 'font-size:1.08em' } : { class: 'hint' }, t)));
}

export async function renderMeasure(root, app) {
  const threshold = h('input', { type: 'number', value: 150, min: '20', max: '2000', step: '10' });
  const profile = select(PROFILES, 'clases');
  const endpoint = h('input', { type: 'text', value: DEFAULT_ENDPOINT, spellcheck: 'false' });
  profile.addEventListener('change', () => { threshold.value = USE[profile.value].ms; });
  const start = button('▶ Iniciar medición', { variant: 'primary' });
  const cancel = button('Cancelar', { variant: 'ghost' });
  cancel.hidden = true;
  const demo = button('Ver demostración con datos simulados');
  demo.addEventListener('click', async () => {
    demo.classList.add('busy');
    try { app.navigate(`#/s/${await runDemo()}/resultados`); } catch (err) { toast(err.message, 'error'); } finally { demo.classList.remove('busy'); }
  });
  const status = h('div', { class: 'hint', 'aria-live': 'polite' });
  const bar = h('progress', { max: '100', value: '0', style: 'width:100%;display:none' });
  const out = h('div');
  let ctrl = null;

  const G = createGauge({ unit: 'Mbps', label: 'Velocímetro de red' });
  const mk = (l) => { const dd = h('dd', null, '—'); return { dd, el: h('div', { class: 'ro' }, h('dt', null, l), dd) }; };
  const RO = { base: mk('Respuesta sin carga'), lat: mk('Respuesta bajo carga'), lvl: mk('Descargas simultáneas'), data: mk('Datos usados') };
  let maxSeen = 0;
  const hud = (p) => {
    if (p.phase === 'window') {
      maxSeen = Math.max(maxSeen, p.latestMbps ?? 0);
      G.update(p.latestMbps ?? 0, { max: niceMax(maxSeen) });
      RO.lat.dd.textContent = `${Math.round(p.latestLatency ?? 0)} ms`; RO.lvl.dd.textContent = p.level;
    }
  };
  const finish = (result) => {
    const peak = Math.max(...result.stages.map((s) => s.mbps ?? 0));
    G.update(peak, { max: niceMax(peak) });
    RO.base.dd.textContent = `${Math.round(result.baselineMs)} ms`; RO.data.dd.textContent = `${Math.round(result.totalBytes / 1e6)} MB`;
  };
  G.update(0, { max: 50 });
  root.append(
    h('div', { class: 'hud' },
      h('section', { class: 'panel hud-main' }, h('h1', null, 'Medición de red'),
        h('p', { class: 'lede' }, 'Aumenta la carga poco a poco, mide cuánto tarda en responder tu conexión y dice hasta dónde aguanta.'),
        G.el, bar, status, h('dl', { class: 'readouts' }, ...Object.values(RO).map((r) => r.el))),
      h('aside', { class: 'panel hud-side' }, h('h2', null, 'Configurar prueba'),
        h('div', { class: 'stack' },
          field('¿Para qué se usará la red?', profile, 'Cada uso tiene su propio límite de respuesta y consumo por persona.'),
          field('Límite de respuesta (ms)', threshold),
          h('details', null, h('summary', null, 'Opciones avanzadas'), field('Servidor de prueba', endpoint, 'Debe aceptar CORS y responder con ?bytes=N.')),
          alert('warn', 'Antes de empezar', h('p', null, 'Dura cerca de un minuto y descarga datos (puede pasar de 100 MB). No la hagas con datos móviles; cierra otras descargas.')),
          h('div', { class: 'row' }, start, cancel, demo)))),
    out);

  const phaseText = (p) => {
    if (p.phase === 'baseline') return 'Midiendo la respuesta de la red sin carga…';
    if (p.phase === 'level' || p.phase === 'window') {
      const extra = p.phase === 'window' ? ` — respuesta ${Math.round(p.latestLatency ?? 0)} ms, ${(p.latestMbps ?? 0).toFixed(1)} Mbps` : '';
      return `Nivel ${p.index + 1} de ${p.total}: ${p.level} descarga(s) simultánea(s)${extra}`;
    }
    return status.textContent;
  };

  start.addEventListener('click', async () => {
    out.replaceChildren();
    const thr = Number(threshold.value);
    if (!(thr >= 20)) { toast('El límite debe ser de al menos 20 ms.', 'error'); return; }
    const perPerson = USE[profile.value].mbps;
    ctrl = new AbortController();
    start.disabled = true; cancel.hidden = false; bar.style.display = 'block'; bar.value = 0;
    try {
      const result = await runMeasurement({
        endpoint: endpoint.value.trim() || DEFAULT_ENDPOINT, threshold: thr, signal: ctrl.signal,
        onProgress: (p) => {
          status.textContent = phaseText(p); hud(p);
          if (p.phase === 'baseline') bar.value = (p.done / p.total) * 5;
          else bar.value = 5 + (((p.index ?? 0) + (p.window ? p.window / (p.windows + 1) : 0)) / p.total) * 90;
        },
      });
      status.textContent = 'Calculando el resultado…'; bar.value = 97;
      const saved = await saveMeasurement(result, { threshold: thr, perPersonMbps: perPerson });
      bar.value = 100; finish(result);
      status.textContent = `Listo. Se descargaron unos ${Math.round(result.totalBytes / 1e6)} MB durante la prueba.`;
      out.append(h('div', { class: 'block' }, conclusionBlock(saved.live, saved.calc),
        saved.fitError ? alert('warn', null, h('p', null, saved.fitError)) : null,
        h('div', { class: 'row', style: 'margin-top:12px' },
          button('Ver el análisis técnico', { onclick: () => app.navigate(`#/s/${saved.scenarioId}/${saved.calc ? 'resultados' : 'modelado'}`) }),
          button('Medir de nuevo', { variant: 'ghost', onclick: () => app.navigate('#/') }))));
    } catch (err) {
      if (err?.name === 'AbortError') status.textContent = 'Medición cancelada.';
      else { status.textContent = ''; out.append(alert('error', 'No se pudo completar la medición', h('p', null, err.message || String(err)))); }
    } finally {
      start.disabled = false; cancel.hidden = true; ctrl = null;
    }
  });
  cancel.addEventListener('click', () => ctrl?.abort());
  app.after(() => {});
}
