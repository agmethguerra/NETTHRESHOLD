// Capa de cálculo. Todo se ejecuta dentro del navegador (engine.js): no hay servidor ni backend.
// Se conserva la misma forma de respuesta { ok, httpStatus, data } que tenía la API.
import * as E from './engine.js';

export const getBase = () => 'local';
export async function initApi() { return 'local'; }
export function setBase() {}
export const health = async () => true;

export class ApiUnavailableError extends Error {
  constructor() { super('El motor de cálculo no está disponible.'); this.name = 'ApiUnavailableError'; }
}

const okRes = (data) => ({ ok: true, httpStatus: 200, data });
const bad = (data) => ({ ok: false, httpStatus: 422, data });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export async function validatePoints(body) {
  return okRes(E.validatePoints(body.points ?? [], body.load_unit, body.metric_unit));
}

export async function fitModel(req) {
  const v = E.validatePoints(req.points ?? [], req.load_unit, req.metric_unit);
  if (v.rejected_count) {
    return bad({ status: 'invalid_input', code: 'invalid_points', rejected: v.rejected,
      message: `${v.rejected_count} medición(es) inválida(s); corríjalas o elimínelas antes de ajustar.` });
  }
  let fit;
  try {
    fit = E.fitPolynomial(v.valid.map((p) => p.x), v.valid.map((p) => p.y), 3);
  } catch (e) {
    if (e instanceof E.FitError) return bad({ status: e.code, code: e.code, message: e.message });
    throw e;
  }
  if (v.duplicates.length) fit.warnings.push(`${v.duplicates.length} medición(es) duplicada(s) exacta(s): confirme si son repeticiones válidas.`);
  const data = { status: 'ok', ...fit, load_unit: req.load_unit, metric: req.metric, metric_unit: req.metric_unit,
    duplicates: v.duplicates, replicated_levels: v.replicated_levels };
  if (finite(req.threshold)) data.suggestion = E.suggestInitialPoints(fit.coefficients, req.threshold, fit.x_min, fit.x_max);
  return okRes(data);
}

export async function evaluate({ coefficients, xs }) {
  const ys = xs.map((x) => { const y = E.polyEval(coefficients, x); return Number.isFinite(y) ? y : null; });
  return okRes({ status: 'ok', xs, ys });
}

export async function suggestPoints(req) {
  if (!(req.x_max > req.x_min)) return bad({ status: 'invalid_input', message: 'x_max debe ser mayor que x_min.' });
  return okRes({ status: 'ok', ...E.suggestInitialPoints(req.coefficients, req.threshold, req.x_min, req.x_max) });
}

const gOf = (coeffs, thr) => (z) => {
  const p = E.polyEvalC(coeffs, z);
  return { re: p.re - thr, im: p.im };
};

export async function solveMuller(req) {
  const { coefficients: co, threshold: thr } = req;
  const result = E.muller(gOf(co, thr), req.x0, req.x1, req.x2, req.step_tolerance ?? 1e-8, req.residual_tolerance ?? 1e-8, req.max_iterations ?? 100);
  const a = E.assessRoot(result, req.x_min, req.x_max);
  const warnings = [...result.warnings, ...a.assessment_warnings];
  delete a.assessment_warnings;
  const data = {
    ...result, ...a, warnings, root_unit: req.load_unit, threshold: thr,
    metric_at_root: result.root !== null ? E.polyEval(co, result.root) : null,
    reference_roots: E.referenceRoots(co, thr),
  };
  return result.status === 'invalid_input' ? bad(data) : okRes(data);
}

function timed(fn) {
  const t0 = performance.now();
  const out = fn();
  out.elapsed_ms = Math.round((performance.now() - t0) * 1e4) / 1e4;
  return out;
}

export async function compareMethods(req) {
  const co = req.coefficients, thr = req.threshold;
  const dco = E.polyDerivCoeffs(co);
  const g = (x) => E.polyEval(co, x) - thr;
  const dg = (x) => E.polyEval(dco, x);
  const st = req.step_tolerance ?? 1e-8, rt = req.residual_tolerance ?? 1e-8, mi = req.max_iterations ?? 100;
  let bracket = req.bracket ?? null;
  if (!bracket && req.x_min != null && req.x_max != null && req.x_max > req.x_min) {
    const f = E.scanCrossings(co, thr, req.x_min, req.x_max);
    bracket = f.length ? f[0] : null;
  }
  const methods = [
    timed(() => {
      const r = E.muller(gOf(co, thr), req.x0, req.x1, req.x2, st, rt, mi);
      return { method: 'muller', status: r.status, message: r.message, root: r.status === 'converged' ? r.root : null, iterations_count: r.iterations_count, residual: r.residual };
    }),
    timed(() => E.secant(g, req.x1, req.x2, st, rt, mi)),
    timed(() => E.newton(g, dg, req.x2, st, rt, mi)),
  ];
  methods.push(bracket
    ? timed(() => E.bisection(g, bracket[0], bracket[1], st, rt, Math.max(mi, 200)))
    : { method: 'bisection', status: 'not_applicable', message: 'No hay un intervalo con cambio de signo disponible.', root: null, iterations_count: 0, residual: null, elapsed_ms: 0 });
  return okRes({ status: 'ok', methods, reference_roots: E.referenceRoots(co, thr),
    note: 'Las comparaciones usan la misma función y tolerancias. No se asume que Müller sea superior en todos los casos.' });
}

export function errorMessage(result) {
  return result?.data?.message ?? `Error ${result?.httpStatus ?? ''}.`;
}
