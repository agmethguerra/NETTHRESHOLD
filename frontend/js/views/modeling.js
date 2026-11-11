import { ApiUnavailableError, errorMessage, fitModel } from '../api.js';
import { chartSpec, mainChart, residualChart } from '../charts.js';
import * as store from '../storage.js';
import { alert, button, h, table, toast } from '../ui.js';
import { distinctLevels, fmtDate, fmtNum } from '../util.js';

export async function renderModeling(root, ctx, app) {
  const { scenario: sc, measurements: ms, model, stale } = ctx;
  const levels = distinctLevels(ms);
  const head = h('div', { class: 'block' },
    h('h2', null, 'Modelo cúbico de latencia'),
    h('p', { class: 'lede' }, 'Se ajusta un polinomio cúbico a las mediciones por mínimos cuadrados. Es una curva empírica: describe estos datos, no la red entera.'));
  root.append(head);

  if (levels < 4) {
    head.append(alert('pending', 'Faltan datos para ajustar', h('p', null, `Hay ${levels} nivel(es) de carga distinto(s) y el ajuste cúbico necesita al menos cuatro.`)),
      button('Ir a Datos', { onclick: () => app.navigate(`#/s/${sc.id}/datos`) }));
    if (!model) return;
  }

  const errHost = h('div');
  const fitBtn = button(model ? (stale ? 'Ajustar de nuevo' : 'Reajustar modelo') : 'Ajustar modelo', { variant: model && !stale ? 'secondary' : 'primary', disabled: levels < 4 });
  fitBtn.addEventListener('click', async () => {
    fitBtn.classList.add('busy');
    errHost.replaceChildren();
    try {
      const r = await fitModel({
        model_type: 'cubic', load_unit: sc.loadUnit, metric: 'latency', metric_unit: sc.metricUnit, threshold: sc.threshold,
        points: ms.map((m, i) => ({ x: m.loadValue, y: m.metricValue, row: m.sourceRow ?? i + 1 })),
      });
      if (!r.ok) {
        const rej = r.data?.rejected;
        errHost.append(alert('error', 'No se pudo ajustar el modelo', h('p', null, errorMessage(r)),
          rej?.length ? h('ul', null, rej.slice(0, 10).map((x) => h('li', null, `Fila ${x.row}: ${x.reason}`))) : null));
        return;
      }
      const d = r.data;
      await store.saveModel({
        scenarioId: sc.id, modelType: d.model_type, coefficients: d.coefficients, equation: d.equation,
        xMin: d.x_min, xMax: d.x_max, rmse: d.rmse, r2: d.r2, nPoints: d.n_points, distinctLevels: d.distinct_levels,
        conditionNumber: d.condition_number, warnings: d.warnings, residuals: d.residuals, suggestion: d.suggestion ?? null,
        measurementSetVersion: sc.dataVersion, points: ms.map((m) => [m.loadValue, m.metricValue]),
      });
      toast('Modelo ajustado.');
      app.reload();
    } catch (err) {
      errHost.append(alert('error', err instanceof ApiUnavailableError ? 'Backend sin conexión' : 'Error al ajustar', h('p', null, err.message)));
    } finally {
      fitBtn.classList.remove('busy');
    }
  });
  head.append(h('div', { class: 'row', style: 'margin-top:14px' }, fitBtn), errHost);

  if (!model) return;

  if (stale) head.append(alert('warn', 'Este modelo quedó desactualizado', h('p', null, 'Las mediciones cambiaron después de este ajuste. Los cálculos anteriores se conservan como historial, pero no corresponden a los datos actuales. Ajuste de nuevo para continuar.')));

  // Ecuación e indicadores
  const eq = h('div', { class: 'block' },
    h('h2', null, 'Ecuación y calidad del ajuste'),
    h('div', { class: 'eq', tabindex: '0', 'aria-label': 'Ecuación del modelo' }, model.equation),
    h('dl', { class: 'facts' },
      ...[['RMSE', `${fmtNum(model.rmse)} ${sc.metricUnit}`], ['R²', model.r2 === null ? 'No definido' : fmtNum(model.r2, 5)],
        ['Rango calibrado', `${fmtNum(model.xMin)} a ${fmtNum(model.xMax)} ${sc.loadUnit}`], ['Datos usados', `${model.nPoints} en ${model.distinctLevels} niveles`], ['Ajustado el', fmtDate(model.createdAt)]]
        .map(([k, v]) => h('div', null, h('dt', null, k), h('dd', { class: k === 'Ajustado el' ? 'small' : null }, v)))),
    h('div', { class: 'table-wrap', style: 'max-width:520px' }, h('table', { class: 'data mono' },
      h('thead', null, h('tr', null, h('th', null, 'Coeficiente'), h('th', { class: 'num' }, 'Valor'))),
      h('tbody', null, model.coefficients.map((c, i) => h('tr', null, h('td', null, `a${i}`), h('td', { class: 'num' }, fmtNum(c, 8))))))));
  for (const w of model.warnings ?? []) eq.append(alert('warn', null, h('p', null, w)));
  eq.append(h('p', { class: 'hint' }, 'RMSE y R² no demuestran por sí solos que el modelo represente la red: revise la forma de la curva, la distribución de los puntos y los residuos.'));
  root.append(eq);

  // Gráficas
  const snapshot = model.points.map(([x, y]) => ({ loadValue: x, metricValue: y }));
  const canvas = h('canvas', { role: 'img', 'aria-label': `Mediciones y curva ajustada de latencia frente a carga, con el umbral de ${fmtNum(sc.threshold)} ${sc.metricUnit}` });
  const rcanvas = h('canvas', { role: 'img', 'aria-label': 'Residuos del ajuste frente a la carga' });
  app.after(async () => {
    try {
      const spec = await chartSpec({ scenario: sc, model, measurements: snapshot });
      if (canvas.isConnected) mainChart(canvas, spec);
      if (rcanvas.isConnected) {
        residualChart(rcanvas, { points: model.points.map(([x], i) => ({ x, y: model.residuals[i] })), loadLabel: spec.loadLabel, metricUnit: sc.metricUnit, loadUnit: sc.loadUnit });
      }
    } catch (err) { toast(`No se pudo dibujar la gráfica: ${err.message}`, 'error'); }
  });
  root.append(h('div', { class: 'block' },
    h('h2', null, 'Mediciones y curva'),
    h('div', { class: 'chart' }, canvas),
    h('p', { class: 'hint' }, 'La franja sombreada es el rango calibrado. La línea punteada a la derecha extrapola sin datos: no la tome como evidencia.'),
    h('h3', { style: 'margin-top:22px' }, 'Residuos'),
    h('p', { class: 'hint', style: 'margin:4px 0 8px' }, 'Un patrón curvo o un abanico de residuos indica que el cúbico no describe bien estos datos.'),
    h('div', { class: 'chart small' }, rcanvas),
    h('details', { style: 'margin-top:14px' }, h('summary', null, 'Ver los datos de las gráficas en una tabla'),
      table({
        columns: [{ label: '#', num: true, render: (r) => r.i }, { label: `Carga (${sc.loadUnit})`, num: true, render: (r) => fmtNum(r.x) }, { label: `Medida (${sc.metricUnit})`, num: true, render: (r) => fmtNum(r.y) }, { label: 'Ajustada', num: true, render: (r) => fmtNum(r.y - r.res) }, { label: 'Residuo', num: true, render: (r) => fmtNum(r.res) }],
        rows: model.points.map(([x, y], i) => ({ i: i + 1, x, y, res: model.residuals[i] })),
      }))));

  if (!stale) {
    root.append(h('div', { class: 'block' },
      h('p', { class: 'lede' }, 'Con el modelo revisado, el siguiente paso es buscar la carga en la que la curva alcanza el umbral.'),
      button('Continuar a Müller', { variant: 'primary', onclick: () => app.navigate(`#/s/${sc.id}/muller`) })));
  }
}
