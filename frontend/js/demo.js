// Demostración de un clic: crea el ejemplo simulado, ajusta el modelo y ejecuta Müller.
import { fitModel, solveMuller } from './api.js';
import * as store from './storage.js';
import { syntheticExample } from './synthetic.js';

export async function runDemo() {
  const { scenario, measurements } = syntheticExample();
  const sc = await store.saveScenario(scenario);
  await store.addMeasurements(sc.id, measurements);
  const ms = await store.listMeasurements(sc.id);
  const fit = await fitModel({
    model_type: 'cubic', load_unit: sc.loadUnit, metric: 'latency', metric_unit: sc.metricUnit, threshold: sc.threshold,
    points: ms.map((m, i) => ({ x: m.loadValue, y: m.metricValue, row: m.sourceRow ?? i + 1 })),
  });
  if (!fit.ok) throw new Error(fit.data?.message ?? 'No se pudo ajustar el modelo de ejemplo.');
  const d = fit.data;
  const model = await store.saveModel({
    scenarioId: sc.id, modelType: d.model_type, coefficients: d.coefficients, equation: d.equation,
    xMin: d.x_min, xMax: d.x_max, rmse: d.rmse, r2: d.r2, nPoints: d.n_points, distinctLevels: d.distinct_levels,
    conditionNumber: d.condition_number, warnings: d.warnings, residuals: d.residuals, suggestion: d.suggestion ?? null,
    measurementSetVersion: (await store.getScenario(sc.id)).dataVersion, points: ms.map((m) => [m.loadValue, m.metricValue]),
  });
  const s = d.suggestion;
  const [x0, x1, x2] = [s.x0, s.x1, s.x2];
  const r = await solveMuller({
    coefficients: model.coefficients, threshold: sc.threshold, x0, x1, x2, step_tolerance: 1e-8, residual_tolerance: 1e-8,
    max_iterations: 100, x_min: model.xMin, x_max: model.xMax, load_unit: sc.loadUnit,
  });
  const c = r.data;
  await store.saveCalculation({
    scenarioId: sc.id, modelId: model.id, x0, x1, x2, stepTolerance: 1e-8, residualTolerance: 1e-8, maxIterations: 100,
    threshold: sc.threshold, loadUnit: sc.loadUnit, status: c.status, message: c.message, root: c.root, rootIsReal: c.root_is_real,
    rootComplex: c.root_complex, residual: c.residual, step: c.step, iterationsCount: c.iterations_count, iterations: c.iterations,
    warnings: c.warnings, metricAtRoot: c.metric_at_root, referenceRoots: c.reference_roots, lastApproximation: c.last_approximation ?? null,
    assessment: { numerically_converged: c.numerically_converged, root_is_real: c.root_is_real, root_non_negative: c.root_non_negative,
      within_calibrated_range: c.within_calibrated_range, valid_threshold: c.valid_threshold },
  });
  return sc.id;
}
