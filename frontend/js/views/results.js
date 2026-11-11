import { ApiUnavailableError, compareMethods, errorMessage } from '../api.js';
import { chartSpec, mainChart } from '../charts.js';
import { conclusionBlock } from './measure.js';
import { explainBlock, verdictBlock } from './verdict.js';
import { alert, badge, button, h, table, toast } from '../ui.js';
import { fmtComplex, fmtDate, fmtNum } from '../util.js';

const METHOD_NAMES = { muller: 'Müller', secant: 'Secante', newton: 'Newton-Raphson', bisection: 'Bisección' };
const STATUS_TEXT = {
  converged: 'Convergió', not_converged: 'No convergió', numerical_error: 'Error numérico',
  invalid_input: 'Entrada inválida', not_applicable: 'No aplicable',
};

export async function renderResults(root, ctx, app) {
  const { scenario: sc, model, calculations, stale } = ctx;
  const intro = h('div', { class: 'block' }, h('h2', null, 'Resultados'));
  root.append(intro);

  if (!calculations.length) {
    intro.append(alert('pending', 'Aún no hay cálculos', h('p', null, 'Ejecute el método de Müller para obtener una estimación.')),
      button('Ir a Müller', { variant: 'primary', onclick: () => app.navigate(`#/s/${sc.id}/muller`) }));
    return;
  }

  let calc = calculations.find((c) => c.id === app.selectedCalcId) ?? calculations[0];
  const calcModel = ctx.models.find((m) => m.id === calc.modelId) ?? null;
  const outdated = !calcModel || calcModel.id !== model?.id || stale;
  const a = calc.assessment ?? {};
  const ok = !!a.valid_threshold;
  const unit = calc.loadUnit ?? sc.loadUnit;

  if (outdated) {
    intro.append(alert('warn', 'Este resultado corresponde a un modelo anterior', h('p', null, 'Las mediciones o el modelo cambiaron después de este cálculo. Úselo solo como historial.')));
  }

  // Cifra principal
  const hero = h('div', { class: 'hero-figure' });
  if (calc.root !== null && calc.root !== undefined) {
    hero.append(h('div', { class: 'hero-value' }, fmtNum(calc.root, 5), h('span', { class: 'hero-unit' }, unit)),
      h('div', { class: 'hero-sub' }, `Carga a la que el modelo alcanza ${fmtNum(calc.threshold)} ${sc.metricUnit} de latencia`));
  } else if (calc.rootComplex && typeof calc.rootComplex === 'object') {
    hero.append(h('div', { class: 'hero-value', style: 'font-size:clamp(28px,4vw,44px)' }, fmtComplex(calc.rootComplex, 5)),
      h('div', { class: 'hero-sub' }, 'Raíz compleja: no corresponde a una carga real.'));
  } else {
    hero.append(h('div', { class: 'hero-value' }, 'Sin estimación'),
      h('div', { class: 'hero-sub' }, calc.message));
  }
  intro.append(hero,
    h('div', { class: 'row' }, ok ? badge('ok', 'Umbral validado dentro del rango calibrado') : calc.status === 'converged' ? badge('warn', 'Convergió, pero no está validado') : badge('error', STATUS_TEXT[calc.status] ?? calc.status)));

  if (calcModel && calc.root != null && calc.root > 0) intro.insertBefore(verdictBlock(sc, calc, calcModel, ok), hero);
  if (sc.conditions?.live) intro.append(conclusionBlock(sc.conditions.live, calc));
  // Resumen en palabras simples
  const plain = calc.root != null
    ? (ok
      ? `En términos simples: según las mediciones, el tiempo de respuesta llega a ${fmtNum(calc.threshold)} ${sc.metricUnit} cuando la carga llega a unas ${fmtNum(calc.root, 3)} ${unit}. Por debajo de esa cifra el servicio cumple el límite; por encima, empieza a fallar.`
      : `En términos simples: el cálculo da unas ${fmtNum(calc.root, 3)} ${unit}, pero ese valor está fuera de lo que se midió, así que es una extrapolación y no debe tomarse como confirmado. Conviene medir a cargas mayores.`)
    : 'En términos simples: con estos datos no fue posible encontrar una carga en la que se alcance el límite. Revise las mediciones o los puntos iniciales.';
  if (!sc.conditions?.live) intro.append(alert(ok ? 'ok' : 'warn', null, h('p', null, plain)));

  // Tres preguntas distintas (sección 15.2)
  const q = (good, question, answer) => h('li', null, badge(good ? 'ok' : 'warn', good ? 'Sí' : 'No'), h('span', { class: 'q' }, question), h('span', { class: 'a' }, answer));
  intro.append(h('ul', { class: 'checks' },
    q(a.numerically_converged, '¿Müller convergió numéricamente?', `Paso ${fmtNum(calc.step, 3)} y residuo ${fmtNum(calc.residual, 3)} tras ${calc.iterationsCount} iteración(es). ${calc.message}`),
    q(!!(a.root_is_real && a.root_non_negative), '¿La raíz es real y no negativa?', a.numerically_converged ? (a.root_is_real ? 'La raíz es real.' : 'La raíz es compleja.') : 'No hay raíz que evaluar.'),
    q(a.within_calibrated_range === true, '¿Está dentro del rango medido?', `Rango calibrado: ${fmtNum(calcModel?.xMin)} a ${fmtNum(calcModel?.xMax)} ${unit}. ${a.within_calibrated_range === false ? 'Fuera del rango es extrapolación y no se presenta como umbral validado.' : ''}`)));
  for (const w of calc.warnings ?? []) intro.append(alert('warn', null, h('p', null, w)));

  intro.append(h('dl', { class: 'facts' },
    ...[['Latencia del modelo en la raíz', calc.metricAtRoot == null ? '—' : `${fmtNum(calc.metricAtRoot)} ${sc.metricUnit}`],
      ['Umbral usado', `${fmtNum(calc.threshold)} ${sc.metricUnit}`],
      ['Puntos iniciales', `${fmtNum(calc.x0)}, ${fmtNum(calc.x1)}, ${fmtNum(calc.x2)}`],
      ['Calculado el', fmtDate(calc.createdAt)]].map(([k, v]) => h('div', null, h('dt', null, k), h('dd', { class: k === 'Calculado el' ? 'small' : null }, v)))));
  if (calc.referenceRoots) {
    const r = calc.referenceRoots;
    intro.append(h('p', { class: 'hint' }, `Verificación independiente (raíces algebraicas del mismo modelo): ${r.real.length ? r.real.map((x) => fmtNum(x, 7)).join(', ') : 'sin raíces reales'}${r.complex.length ? ` y ${r.complex.length} compleja(s)` : ''}.`));
  }

  // Gráfica
  if (calcModel) {
    const canvas = h('canvas', { role: 'img', 'aria-label': 'Curva ajustada, umbral y carga estimada' });
    app.after(async () => {
      try {
        const spec = await chartSpec({
          scenario: { ...sc, threshold: calc.threshold }, model: calcModel,
          measurements: calcModel.points.map(([x, y]) => ({ loadValue: x, metricValue: y })),
          root: calc.root != null ? { x: calc.root, validated: ok } : null,
        });
        if (canvas.isConnected) mainChart(canvas, spec);
      } catch (err) { toast(`No se pudo dibujar la gráfica: ${err.message}`, 'error'); }
    });
    root.append(h('div', { class: 'block' }, h('h2', null, 'Curva, umbral y carga estimada'), h('div', { class: 'chart' }, canvas),
      ok ? null : h('p', { class: 'hint' }, 'La carga estimada se dibuja con marcador hueco y línea discontinua porque no está validada.')));
  }

  const ex = calcModel ? explainBlock(calc, calcModel) : null;
  if (ex) root.append(ex);

  // Iteraciones
  const fmtIt = (v) => fmtComplex(v, 7);
  root.append(h('div', { class: 'block' }, h('h2', null, `Iteraciones (${calc.iterationsCount})`),
    table({
      className: 'mono', empty: 'No se registraron iteraciones.',
      columns: [
        { label: 'k', num: true, render: (r) => r.iteration }, { label: 'x₀', num: true, render: (r) => fmtIt(r.x0) }, { label: 'x₁', num: true, render: (r) => fmtIt(r.x1) },
        { label: 'x₂', num: true, render: (r) => fmtIt(r.x2) }, { label: 'a', num: true, render: (r) => fmtComplex(r.a, 5) }, { label: 'b', num: true, render: (r) => fmtComplex(r.b, 5) },
        { label: 'c', num: true, render: (r) => fmtComplex(r.c, 5) }, { label: 'discriminante', num: true, render: (r) => fmtComplex(r.discriminant, 5) },
        { label: 'x₃', num: true, render: (r) => fmtIt(r.x3) }, { label: 'paso', num: true, render: (r) => fmtNum(r.step, 4) }, { label: 'residuo', num: true, render: (r) => fmtNum(r.residual, 4) },
      ],
      rows: calc.iterations ?? [],
    })));

  // Comparación de métodos
  const cmpHost = h('div');
  const cmpBtn = button('Comparar con otros métodos', { size: 'sm' });
  cmpBtn.addEventListener('click', async () => {
    cmpBtn.classList.add('busy');
    cmpHost.replaceChildren();
    try {
      const r = await compareMethods({
        coefficients: calcModel.coefficients, threshold: calc.threshold, x0: calc.x0, x1: calc.x1, x2: calc.x2,
        step_tolerance: calc.stepTolerance, residual_tolerance: calc.residualTolerance, max_iterations: calc.maxIterations,
        x_min: calcModel.xMin, x_max: calcModel.xMax,
      });
      if (!r.ok) { cmpHost.append(alert('error', null, h('p', null, errorMessage(r)))); return; }
      cmpHost.append(table({
        columns: [
          { label: 'Método', render: (m) => METHOD_NAMES[m.method] ?? m.method },
          { label: 'Estado', render: (m) => STATUS_TEXT[m.status] ?? m.status },
          { label: `Raíz (${unit})`, num: true, render: (m) => fmtNum(m.root, 8) },
          { label: 'Iteraciones', num: true, render: (m) => m.iterations_count },
          { label: 'Residuo', num: true, render: (m) => fmtNum(m.residual, 3) },
          { label: 'Tiempo (ms)', num: true, render: (m) => fmtNum(m.elapsed_ms, 3) },
        ],
        rows: r.data.methods,
      }), h('p', { class: 'hint' }, r.data.note));
    } catch (err) {
      cmpHost.append(alert('error', err instanceof ApiUnavailableError ? 'Backend sin conexión' : 'Error', h('p', null, err.message)));
    } finally {
      cmpBtn.classList.remove('busy');
    }
  });
  if (calcModel) root.append(h('div', { class: 'block stack' }, h('h2', null, 'Comparación con otros métodos'), h('p', { class: 'lede' }, 'Todos usan la misma función y las mismas tolerancias. No se asume que Müller sea mejor en todos los casos.'), h('div', null, cmpBtn), cmpHost));

  // Historial
  root.append(h('div', { class: 'block' }, h('h2', null, 'Historial de cálculos'),
    table({
      columns: [
        { label: 'Fecha', render: (c) => fmtDate(c.createdAt) },
        { label: 'Estado', render: (c) => STATUS_TEXT[c.status] ?? c.status },
        { label: `Raíz (${unit})`, num: true, render: (c) => (c.root == null ? '—' : fmtNum(c.root, 6)) },
        { label: 'Umbral', num: true, render: (c) => `${fmtNum(c.threshold)} ${sc.metricUnit}` },
        { label: 'Modelo', render: (c) => (c.modelId === model?.id && !stale ? 'Vigente' : 'Anterior') },
        { label: '', render: (c) => (c.id === calc.id ? badge('info', 'Mostrado') : button('Ver', { variant: 'ghost', size: 'sm', onclick: () => { app.selectedCalcId = c.id; app.reload(); } })) },
      ],
      rows: calculations,
    }),
    h('div', { class: 'row', style: 'margin-top:16px' }, button('Generar reporte', { variant: 'primary', onclick: () => { app.selectedCalcId = calc.id; app.navigate(`#/s/${sc.id}/reporte`); } }),
      button('Ejecutar otro cálculo', { onclick: () => app.navigate(`#/s/${sc.id}/muller`) }))));
}
