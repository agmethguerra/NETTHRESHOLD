import { ApiUnavailableError, errorMessage, solveMuller, suggestPoints } from '../api.js';
import * as store from '../storage.js';
import { alert, button, field, h, select, toast } from '../ui.js';
import { fmtNum } from '../util.js';

const PRECISION = [
  { value: 'rapida', label: 'Rápida (tolerancia 0,0001)', tol: 1e-4 },
  { value: 'normal', label: 'Normal (tolerancia 0,00000001)', tol: 1e-8 },
  { value: 'alta', label: 'Alta (tolerancia 1e-12)', tol: 1e-12 },
  { value: 'custom', label: 'Personalizada (ver opciones avanzadas)', tol: null },
];

export async function renderMuller(root, ctx, app) {
  const { scenario: sc, model, stale, calculations } = ctx;
  const head = h('div', { class: 'block' },
    h('h2', null, 'Método de Müller'),
    h('p', { class: 'lede' }, 'Müller no modela la red: recibe la función ya ajustada y busca su raíz con tres aproximaciones iniciales, interpolando una parábola en cada paso.'));
  root.append(head);

  if (!model || stale) {
    head.append(alert('pending', model ? 'El modelo está desactualizado' : 'Aún no hay un modelo ajustado',
      h('p', null, 'Ajuste el modelo con las mediciones actuales antes de buscar el umbral.')),
    button('Ir a Modelado', { variant: 'primary', onclick: () => app.navigate(`#/s/${sc.id}/modelado`) }));
    return;
  }

  const last = calculations.find((c) => c.modelId === model.id);
  const span = model.xMax - model.xMin;
  const defaults = last
    ? [last.x0, last.x1, last.x2]
    : model.suggestion ? [model.suggestion.x0, model.suggestion.x1, model.suggestion.x2]
      : [0.25, 0.5, 0.75].map((f) => model.xMin + span * f);

  const num = (v, props = {}) => h('input', { type: 'number', step: 'any', value: v, ...props });
  const x0 = num(defaults[0], { 'aria-label': 'x₀' });
  const x1 = num(defaults[1], { 'aria-label': 'x₁' });
  const x2 = num(defaults[2], { 'aria-label': 'x₂' });
  const stepTol = num(last?.stepTolerance ?? 1e-8, { min: '0' });
  const resTol = num(last?.residualTolerance ?? 1e-8, { min: '0' });
  const maxIt = num(last?.maxIterations ?? 100, { step: '1', min: '1', max: '10000' });
  const msg = h('div');
  const sugMsg = h('div');

  const sugBtn = button('Sugerir puntos iniciales', { size: 'sm' });
  sugBtn.addEventListener('click', async () => {
    sugMsg.replaceChildren();
    sugBtn.classList.add('busy');
    try {
      const r = await suggestPoints({ coefficients: model.coefficients, threshold: sc.threshold, x_min: model.xMin, x_max: model.xMax });
      if (!r.ok) { sugMsg.append(alert('error', null, h('p', null, errorMessage(r)))); return; }
      [x0.value, x1.value, x2.value] = [r.data.x0, r.data.x1, r.data.x2];
      sugMsg.append(alert(r.data.found ? 'info' : 'warn', r.data.found ? 'Puntos sugeridos alrededor del cruce con el umbral' : 'El modelo no cruza el umbral en el rango medido',
        ...r.data.warnings.map((w) => h('p', null, w))));
    } catch (err) {
      sugMsg.append(alert('error', null, h('p', null, err.message)));
    } finally {
      sugBtn.classList.remove('busy');
    }
  });

  const match = PRECISION.find((o) => o.tol && o.tol === (last?.stepTolerance ?? 1e-8) && o.tol === (last?.residualTolerance ?? 1e-8) && (last?.maxIterations ?? 100) === 100);
  const prec = select(PRECISION.map(({ value, label }) => ({ value, label })), match?.value ?? 'custom');
  prec.addEventListener('change', () => { const o = PRECISION.find((q) => q.value === prec.value); if (o.tol) { stepTol.value = o.tol; resTol.value = o.tol; maxIt.value = 100; } else adv.open = true; });
  for (const el of [stepTol, resTol, maxIt]) el.addEventListener('input', () => { prec.value = 'custom'; });
  const adv = h('details', null, h('summary', null, 'Opciones avanzadas'),
    h('div', { class: 'stack', style: 'margin-top:12px' },
      h('fieldset', null, h('legend', null, `Tres aproximaciones iniciales distintas (${sc.loadUnit})`),
        h('div', { class: 'inline-form' }, field('x₀', x0), field('x₁', x1), field('x₂', x2), sugBtn),
        h('p', { class: 'hint' }, `Rango calibrado: ${fmtNum(model.xMin)} a ${fmtNum(model.xMax)} ${sc.loadUnit}.`), sugMsg),
      h('div', { class: 'form-grid' },
        field('Tolerancia del paso', stepTol, 'Se exige a la vez paso y residuo pequeños.'),
        field('Tolerancia del residuo', resTol, `En ${sc.metricUnit}.`),
        field('Máximo de iteraciones', maxIt))));
  const runBtn = button('Calcular umbral', { variant: 'primary', type: 'submit' });
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'eq', tabindex: '0' }, `g(λ) = R(λ) − ${fmtNum(sc.threshold)} = 0   con   ${model.equation}`),
    field('Precisión del cálculo', prec, 'Más precisión usa más iteraciones. Los puntos iniciales se eligen solos alrededor del cruce con el umbral.'),
    adv,
    msg,
    h('div', { class: 'row' }, runBtn));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.replaceChildren();
    const v = { x0: Number(x0.value), x1: Number(x1.value), x2: Number(x2.value), st: Number(stepTol.value), rt: Number(resTol.value), mi: Number(maxIt.value) };
    const problems = [];
    if (![v.x0, v.x1, v.x2].every(Number.isFinite) || [x0, x1, x2].some((el) => el.value === '')) problems.push('Las tres aproximaciones deben ser números.');
    else if (new Set([v.x0, v.x1, v.x2]).size < 3) problems.push('Las tres aproximaciones iniciales deben ser distintas.');
    if (!(v.st > 0) || !(v.rt > 0)) problems.push('Las tolerancias deben ser mayores que cero.');
    if (!Number.isInteger(v.mi) || v.mi < 1) problems.push('El máximo de iteraciones debe ser un entero positivo.');
    if (problems.length) { adv.open = true; msg.append(alert('error', 'Revise los parámetros', h('ul', null, problems.map((p) => h('li', null, p))))); return; }

    runBtn.classList.add('busy');
    try {
      const r = await solveMuller({
        coefficients: model.coefficients, threshold: sc.threshold, x0: v.x0, x1: v.x1, x2: v.x2,
        step_tolerance: v.st, residual_tolerance: v.rt, max_iterations: v.mi,
        x_min: model.xMin, x_max: model.xMax, load_unit: sc.loadUnit,
      });
      const d = r.data;
      if (!r.ok) { msg.append(alert('error', 'Entrada rechazada', h('p', null, d?.message ?? errorMessage(r)))); return; }
      const calc = await store.saveCalculation({
        scenarioId: sc.id, modelId: model.id, x0: v.x0, x1: v.x1, x2: v.x2,
        stepTolerance: v.st, residualTolerance: v.rt, maxIterations: v.mi, threshold: sc.threshold, loadUnit: sc.loadUnit,
        status: d.status, message: d.message, root: d.root, rootIsReal: d.root_is_real, rootComplex: d.root_complex,
        residual: d.residual, step: d.step, iterationsCount: d.iterations_count, iterations: d.iterations, warnings: d.warnings,
        metricAtRoot: d.metric_at_root, referenceRoots: d.reference_roots, lastApproximation: d.last_approximation ?? null,
        assessment: {
          numerically_converged: d.numerically_converged, root_is_real: d.root_is_real, root_non_negative: d.root_non_negative,
          within_calibrated_range: d.within_calibrated_range, valid_threshold: d.valid_threshold,
        },
      });
      app.selectedCalcId = calc.id;
      toast(d.status === 'converged' ? 'Cálculo ejecutado.' : 'El cálculo terminó sin converger; revise el resultado.', d.status === 'converged' ? 'info' : 'error');
      app.navigate(`#/s/${sc.id}/resultados`);
    } catch (err) {
      msg.append(alert('error', err instanceof ApiUnavailableError ? 'Backend sin conexión' : 'Error al ejecutar', h('p', null, err.message)));
    } finally {
      runBtn.classList.remove('busy');
    }
  });

  root.append(h('div', { class: 'block' }, form));
  if (last) root.append(h('div', { class: 'block' }, h('p', null, 'Ya hay un cálculo para este modelo. '), button('Ver el último resultado', { onclick: () => { app.selectedCalcId = last.id; app.navigate(`#/s/${sc.id}/resultados`); } })));
}
