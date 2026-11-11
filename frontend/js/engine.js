// Motor matemático de NetThreshold en JavaScript (port fiel de backend/core/*.py).
// Permite ejecutar todo en el navegador, sin servidor ni instalación.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- Aritmética compleja mínima: {re, im} ----------
const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
const csub = (a, b) => C(a.re - b.re, a.im - b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cscale = (a, k) => C(a.re * k, a.im * k);
const cabs = (a) => Math.hypot(a.re, a.im);
function cdiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
function csqrt(z) {
  const r = cabs(z);
  if (r === 0) return C(0, 0);
  const re = Math.sqrt((r + z.re) / 2);
  const im = Math.sqrt((r - z.re) / 2);
  return C(re, z.im < 0 ? -im : im);
}
const cfinite = (...zs) => zs.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im));

function fmtC(z) {
  if (!cfinite(z)) return null;
  if (Math.abs(z.im) <= 1e-12 * Math.max(1, Math.abs(z.re))) return z.re;
  return { re: z.re, im: z.im };
}

// ---------- Métricas ----------
export function polyEvalC(coeffs, x) {
  let r = C(0, 0);
  for (let i = coeffs.length - 1; i >= 0; i--) r = cadd(cmul(r, x), C(coeffs[i]));
  return r;
}
export function polyEval(coeffs, x) {
  let r = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) r = r * x + coeffs[i];
  return r;
}
export const polyDerivCoeffs = (c) => {
  const d = c.map((v, k) => k * v).slice(1);
  return d.length ? d : [0];
};
const rmse = (ys, yh) => Math.sqrt(ys.reduce((s, y, i) => s + (y - yh[i]) ** 2, 0) / ys.length);
function rSquared(ys, yh) {
  const n = ys.length;
  if (!n) return null;
  const mean = ys.reduce((s, y) => s + y, 0) / n;
  const tot = ys.reduce((s, y) => s + (y - mean) ** 2, 0);
  if (tot === 0) return null;
  return 1 - ys.reduce((s, y, i) => s + (y - yh[i]) ** 2, 0) / tot;
}

// ---------- Regresión polinómica (QR de Householder) ----------
export class FitError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function fmtG(v) { return Number(v.toPrecision(6)).toString(); }
function equationString(coeffs) {
  const sg = (c) => (c >= 0 ? '+' : '-') + fmtG(Math.abs(c));
  return 'R(λ) = ' + coeffs.map((c, k) => (k === 0 ? fmtG(c) : k === 1 ? `${sg(c)}·λ` : `${sg(c)}·λ^${k}`)).join(' ');
}

function lstsq(A, y) {
  // A: m x n (m>=n). Devuelve { x, diagR } o null si es singular.
  const m = A.length, n = A[0].length;
  const R = A.map((r) => r.slice());
  const b = y.slice();
  for (let k = 0; k < n; k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm += R[i][k] ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) return null;
    const alpha = R[k][k] > 0 ? -norm : norm;
    const v = new Array(m).fill(0);
    for (let i = k; i < m; i++) v[i] = R[i][k];
    v[k] -= alpha;
    const vn = v.reduce((s, t) => s + t * t, 0);
    if (vn === 0) continue;
    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = k; i < m; i++) dot += v[i] * R[i][j];
      const f = (2 * dot) / vn;
      for (let i = k; i < m; i++) R[i][j] -= f * v[i];
    }
    let dot = 0;
    for (let i = k; i < m; i++) dot += v[i] * b[i];
    const f = (2 * dot) / vn;
    for (let i = k; i < m; i++) b[i] -= f * v[i];
  }
  const diag = Array.from({ length: n }, (_, i) => Math.abs(R[i][i]));
  const dmax = Math.max(...diag), dmin = Math.min(...diag);
  if (dmax === 0 || dmin <= dmax * 1e-12) return null;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= R[i][j] * x[j];
    x[i] = s / R[i][i];
  }
  return { x, cond: dmax / dmin };
}

export function fitPolynomial(xs, ys, degree = 3) {
  if (xs.length !== ys.length) throw new FitError('invalid_input', 'Las listas de carga y métrica deben tener igual longitud.');
  if (!xs.length) throw new FitError('insufficient_data', 'No hay mediciones para ajustar.');
  if (![...xs, ...ys].every(isNum)) throw new FitError('invalid_input', 'Todos los valores deben ser finitos (sin NaN ni infinitos).');
  const need = degree + 1;
  const distinct = new Set(xs).size;
  if (distinct < need) {
    throw new FitError('insufficient_data', `Se requieren al menos ${need} niveles de carga distintos para un ajuste de grado ${degree}; hay ${distinct}.`);
  }
  const scale = Math.max(...xs.map(Math.abs));
  if (scale === 0) throw new FitError('singular_fit', 'Todas las cargas son cero; el ajuste es singular.');
  const t = xs.map((x) => x / scale);
  const V = t.map((ti) => Array.from({ length: need }, (_, k) => ti ** k));
  const sol = lstsq(V, ys);
  if (!sol) throw new FitError('singular_fit', 'La matriz de ajuste no tiene rango completo; ajuste singular.');
  const coeffs = sol.x.map((c, k) => c / scale ** k);
  if (!coeffs.every(isNum)) throw new FitError('numerical_error', 'El ajuste produjo coeficientes no finitos.');
  const yhat = xs.map((x) => polyEval(coeffs, x));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const warnings = [];
  if (distinct <= need) {
    warnings.push(`Solo hay ${distinct} niveles de carga distintos: el ajuste cúbico es exacto o casi exacto y RMSE/R² no permiten evaluar la calidad. Se recomiendan más de cuatro niveles.`);
  }
  if (sol.cond > 1e8) warnings.push(`La matriz de ajuste está mal condicionada (cond≈${sol.cond.toExponential(2)}).`);
  const dc = polyDerivCoeffs(coeffs);
  let minV = Infinity, minS = Infinity;
  for (let i = 0; i < 400; i++) {
    const x = xMin + ((xMax - xMin) * i) / 399;
    minV = Math.min(minV, polyEval(coeffs, x));
    minS = Math.min(minS, polyEval(dc, x));
  }
  if (minV < 0) warnings.push('El modelo predice valores negativos de la métrica dentro del rango medido.');
  if (minS < 0) warnings.push('La curva ajustada no es creciente en todo el rango medido; revise la gráfica y los residuos.');
  return {
    model_type: degree === 3 ? 'cubic' : `poly${degree}`,
    coefficients: coeffs,
    equation: equationString(coeffs),
    x_min: xMin, x_max: xMax,
    rmse: rmse(ys, yhat), r2: rSquared(ys, yhat),
    n_points: xs.length, distinct_levels: distinct,
    residuals: ys.map((y, i) => y - yhat[i]),
    condition_number: sol.cond, warnings,
  };
}

// ---------- Método de Müller ----------
const TINY = 1e-14, REAL_TOL = 1e-9;

export function muller(g, x0, x1, x2, stepTol = 1e-8, resTol = 1e-8, maxIter = 100) {
  const iterations = [];
  const warnings = [];
  const done = (status, message, extra = {}) => ({
    status, message, root: null, root_is_real: null, root_complex: null, residual: null, step: null,
    iterations_count: iterations.length, iterations, warnings, ...extra,
  });
  if (![x0, x1, x2].every(isNum)) return done('invalid_input', 'Las tres aproximaciones iniciales deben ser números finitos.');
  if (!(isNum(stepTol) && stepTol > 0 && isNum(resTol) && resTol > 0)) return done('invalid_input', 'Las tolerancias deben ser números positivos y finitos.');
  if (!Number.isInteger(maxIter) || maxIter < 1) return done('invalid_input', 'El máximo de iteraciones debe ser un entero positivo.');
  if (new Set([x0, x1, x2]).size < 3) return done('invalid_input', 'Las tres aproximaciones iniciales deben ser distintas (RN-09).');
  const scale0 = Math.max(1, Math.abs(x0), Math.abs(x1), Math.abs(x2));
  if (Math.min(Math.abs(x0 - x1), Math.abs(x1 - x2), Math.abs(x0 - x2)) <= 1e-12 * scale0) {
    return done('invalid_input', 'Las aproximaciones iniciales están numéricamente demasiado próximas entre sí.');
  }
  let p0 = C(x0), p1 = C(x1), p2 = C(x2);

  const finish = (p3, step, residual) => {
    const real = Math.abs(p3.im) <= REAL_TOL * Math.max(1, Math.abs(p3.re));
    let message = 'Convergencia numérica alcanzada.';
    if (!real) {
      message = 'Convergencia numérica a una raíz compleja.';
      warnings.push('La raíz obtenida es compleja; no es interpretable como carga real.');
    }
    return done('converged', message, {
      root: real ? p3.re : null, root_is_real: real, root_complex: fmtC(p3), residual, step,
    });
  };

  for (let k = 1; k <= maxIter; k++) {
    const f0 = g(p0), f1 = g(p1), f2 = g(p2);
    if (!cfinite(f0, f1, f2)) return done('numerical_error', 'La función produjo un valor no finito.');
    const h1 = csub(p1, p0), h2 = csub(p2, p1);
    const scale = Math.max(1, cabs(p0), cabs(p1), cabs(p2));
    if (Math.min(cabs(h1), cabs(h2), cabs(csub(p2, p0))) <= TINY * scale) {
      return done('numerical_error', 'Las aproximaciones se volvieron numéricamente indistinguibles (diferencia casi nula); el método se estancó.', { last_approximation: fmtC(p2) });
    }
    const d1 = cdiv(csub(f1, f0), h1);
    const d2 = cdiv(csub(f2, f1), h2);
    const a = cdiv(csub(d2, d1), cadd(h2, h1));
    const b = cadd(cmul(a, h2), d2);
    const c = f2;
    const disc = csub(cmul(b, b), cscale(cmul(a, c), 4));

    if (c.re === 0 && c.im === 0) {
      iterations.push({ iteration: k, x0: fmtC(p0), x1: fmtC(p1), x2: fmtC(p2), a: fmtC(a), b: fmtC(b), c: fmtC(c), discriminant: fmtC(disc), denominator: null, x3: fmtC(p2), step: 0, residual: 0 });
      return finish(p2, 0, 0);
    }
    const d = csqrt(disc);
    const e1 = cadd(b, d), e2 = csub(b, d);
    const e = cabs(e1) >= cabs(e2) ? e1 : e2;
    if (!cfinite(a, b, c, d, e) || cabs(e) < 1e-300) {
      return done('numerical_error', 'Denominador casi nulo o valores no finitos en la parábola interpolante.', { last_approximation: fmtC(p2) });
    }
    const hh = cscale(cdiv(c, e), -2);
    const p3 = cadd(p2, hh);
    const residual = cabs(g(p3));
    const step = cabs(hh);
    if (!(Number.isFinite(step) && Number.isFinite(residual) && cfinite(p3))) {
      return done('numerical_error', 'Se obtuvo una aproximación no finita.', { last_approximation: fmtC(p2) });
    }
    iterations.push({ iteration: k, x0: fmtC(p0), x1: fmtC(p1), x2: fmtC(p2), a: fmtC(a), b: fmtC(b), c: fmtC(c), discriminant: fmtC(disc), denominator: fmtC(e), x3: fmtC(p3), step, residual });
    if (step <= stepTol && residual <= resTol) return finish(p3, step, residual);
    p0 = p1; p1 = p2; p2 = p3;
  }
  const last = iterations[iterations.length - 1] ?? {};
  return done('not_converged', `Se alcanzó el máximo de ${maxIter} iteraciones sin cumplir ambos criterios de convergencia.`, {
    last_approximation: last.x3 ?? null, residual: last.residual ?? null, step: last.step ?? null,
  });
}

// ---------- Métodos de referencia ----------
const res = (method, status, message, root = null, iterations = 0, residual = null) => ({ method, status, message, root, iterations_count: iterations, residual });

export function secant(g, x0, x1, st = 1e-8, rt = 1e-8, maxIter = 100) {
  let a = x0, b = x1;
  if (a === b) return res('secant', 'invalid_input', 'Se requieren dos puntos distintos.');
  for (let k = 1; k <= maxIter; k++) {
    const ga = g(a), gb = g(b);
    if (!(Number.isFinite(ga) && Number.isFinite(gb))) return res('secant', 'numerical_error', 'Valor no finito.', null, k);
    if (gb === ga) return res('secant', 'numerical_error', 'Pendiente nula.', null, k);
    const c = b - (gb * (b - a)) / (gb - ga);
    const step = Math.abs(c - b), r = Math.abs(g(c));
    if (step <= st && r <= rt) return res('secant', 'converged', 'Convergencia alcanzada.', c, k, r);
    a = b; b = c;
  }
  return res('secant', 'not_converged', 'Máximo de iteraciones alcanzado.', null, maxIter, Math.abs(g(b)));
}

export function newton(g, dg, x0, st = 1e-8, rt = 1e-8, maxIter = 100) {
  let x = x0;
  for (let k = 1; k <= maxIter; k++) {
    const gx = g(x), dgx = dg(x);
    if (!(Number.isFinite(gx) && Number.isFinite(dgx))) return res('newton', 'numerical_error', 'Valor no finito.', null, k);
    if (dgx === 0) return res('newton', 'numerical_error', 'Derivada nula.', null, k);
    const nx = x - gx / dgx;
    const step = Math.abs(nx - x), r = Math.abs(g(nx));
    if (step <= st && r <= rt) return res('newton', 'converged', 'Convergencia alcanzada.', nx, k, r);
    x = nx;
  }
  return res('newton', 'not_converged', 'Máximo de iteraciones alcanzado.', null, maxIter, Math.abs(g(x)));
}

export function bisection(g, a, b, st = 1e-8, rt = 1e-8, maxIter = 200) {
  let lo = a, hi = b, glo = g(lo);
  const ghi = g(hi);
  if (glo * ghi > 0) return res('bisection', 'invalid_input', 'El intervalo no presenta cambio de signo.');
  for (let k = 1; k <= maxIter; k++) {
    const mid = (lo + hi) / 2, gm = g(mid);
    if (Math.abs(hi - lo) / 2 <= st && Math.abs(gm) <= rt) return res('bisection', 'converged', 'Convergencia alcanzada.', mid, k, Math.abs(gm));
    if (glo * gm <= 0) hi = mid; else { lo = mid; glo = gm; }
  }
  const mid = (lo + hi) / 2;
  return res('bisection', 'not_converged', 'Máximo de iteraciones alcanzado.', null, maxIter, Math.abs(g(mid)));
}

/** Raíces de P(x) − umbral = 0 (Durand-Kerner), como verificación independiente. */
export function referenceRoots(coeffs, threshold) {
  let poly = coeffs.slice();
  poly[0] -= threshold;
  while (poly.length > 1 && poly[poly.length - 1] === 0) poly.pop();
  const n = poly.length - 1;
  if (n < 1) return { real: [], complex: [] };
  const lead = poly[n];
  const mon = poly.map((c) => c / lead);
  const radius = 1 + Math.max(...mon.slice(0, n).map(Math.abs));
  let roots = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.4;
    return C(radius * 0.7 * Math.cos(ang), radius * 0.7 * Math.sin(ang));
  });
  const ev = (z) => polyEvalC(mon, z);
  for (let it = 0; it < 500; it++) {
    let delta = 0;
    roots = roots.map((r, i) => {
      let den = C(1, 0);
      roots.forEach((o, j) => { if (j !== i) den = cmul(den, csub(r, o)); });
      if (cabs(den) === 0) return r;
      const step = cdiv(ev(r), den);
      delta = Math.max(delta, cabs(step));
      return csub(r, step);
    });
    if (delta < 1e-14 * radius) break;
  }
  const real = [], complex = [];
  for (const r of roots) {
    if (Math.abs(r.im) <= 1e-9 * Math.max(1, Math.abs(r.re))) real.push(r.re);
    else complex.push({ re: r.re, im: r.im });
  }
  return { real: real.sort((p, q) => p - q), complex };
}

export function scanCrossings(coeffs, threshold, xMin, xMax, n = 2000) {
  const out = [];
  let prev = polyEval(coeffs, xMin) - threshold;
  for (let i = 0; i < n; i++) {
    const x1 = xMin + ((xMax - xMin) * (i + 1)) / n;
    const cur = polyEval(coeffs, x1) - threshold;
    if (prev === 0 || prev * cur < 0) out.push([xMin + ((xMax - xMin) * i) / n, x1]);
    prev = cur;
  }
  return out;
}

export function suggestInitialPoints(coeffs, threshold, xMin, xMax) {
  const span = xMax - xMin;
  const br = scanCrossings(coeffs, threshold, xMin, xMax);
  const warnings = [];
  if (!br.length) {
    warnings.push('El modelo no cruza el umbral dentro del rango calibrado; los datos no permiten estimarlo sin extrapolar (RN-13). Se sugieren puntos repartidos en el rango medido.');
    const p = [0.25, 0.5, 0.75].map((f) => xMin + span * f);
    return { found: false, x0: p[0], x1: p[1], x2: p[2], crossings: 0, warnings };
  }
  if (br.length > 1) warnings.push(`El modelo cruza el umbral ${br.length} veces dentro del rango; se sugiere el primer cruce.`);
  const r0 = (br[0][0] + br[0][1]) / 2;
  const d = 0.1 * span;
  const clamp = (v) => Math.min(Math.max(v, xMin), xMax);
  let pts = [...new Set([clamp(r0 - d), r0, clamp(r0 + d)])].sort((a, b) => a - b);
  if (pts.length < 3) pts = [xMin, (xMin + xMax) / 2, xMax];
  return { found: true, x0: pts[0], x1: pts[1], x2: pts[2], crossings: br.length, bracket: br[0], warnings };
}

// ---------- Validación ----------
const MIN_LEVELS = 4, RECOMMENDED = 5, NEAR_EDGE = 0.05;

export function parseNumber(value) {
  if (value === null || value === undefined) return [null, 'valor faltante'];
  if (typeof value === 'boolean') return [null, 'no numérico'];
  let num;
  if (typeof value === 'number') num = value;
  else {
    let s = String(value).trim();
    if (s === '') return [null, 'valor faltante'];
    if (s.includes('_')) return [null, 'no numérico'];
    if (s.includes(',') && !s.includes('.') && s.split(',').length === 2) s = s.replace(',', '.');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) && !/^[+-]?(inf|infinity|nan)$/i.test(s)) return [null, 'no numérico'];
    num = /inf/i.test(s) ? (s.startsWith('-') ? -Infinity : Infinity) : /nan/i.test(s) ? NaN : Number(s);
  }
  if (!Number.isFinite(num)) return [null, 'no finito'];
  return [num, null];
}
const normUnit = (u) => String(u).trim().toLowerCase().replaceAll(' ', '');

export function validatePoints(points, loadUnit = null, metricUnit = null) {
  const valid = [], rejected = [];
  points.forEach((p, i) => {
    const row = p.row ?? i + 1;
    const reasons = [];
    const [x, ex] = parseNumber(p.x);
    const [y, ey] = parseNumber(p.y);
    if (ex) reasons.push(`carga: ${ex}`); else if (x < 0) reasons.push('carga negativa');
    if (ey) reasons.push(`métrica: ${ey}`); else if (y < 0) reasons.push('métrica negativa');
    if (loadUnit && p.load_unit != null && p.load_unit !== '' && normUnit(p.load_unit) !== normUnit(loadUnit)) reasons.push(`unidad de carga incompatible ('${p.load_unit}' ≠ '${loadUnit}')`);
    if (metricUnit && p.metric_unit != null && p.metric_unit !== '' && normUnit(p.metric_unit) !== normUnit(metricUnit)) reasons.push(`unidad de métrica incompatible ('${p.metric_unit}' ≠ '${metricUnit}')`);
    if (reasons.length) rejected.push({ row, reason: reasons.join('; '), raw: { x: p.x, y: p.y } });
    else valid.push({ row, x, y });
  });
  const groups = new Map(), levels = new Map();
  for (const v of valid) {
    const k = `${v.x}|${v.y}`;
    groups.set(k, [...(groups.get(k) ?? []), v.row]);
    levels.set(v.x, (levels.get(v.x) ?? 0) + 1);
  }
  const duplicates = [...groups].filter(([, r]) => r.length > 1).map(([k, rows]) => { const [x, y] = k.split('|').map(Number); return { x, y, rows }; });
  const replicated = [...levels].sort((a, b) => a[0] - b[0]).filter(([, n]) => n > 1).map(([x, count]) => ({ x, count }));
  const distinct = levels.size;
  const warnings = [];
  if (duplicates.length) warnings.push(`${duplicates.length} medición(es) duplicada(s) exacta(s): confirme si son repeticiones válidas.`);
  if (distinct > 0 && distinct < MIN_LEVELS) warnings.push(`Hay ${distinct} niveles de carga distintos; el ajuste cúbico requiere al menos ${MIN_LEVELS}.`);
  else if (distinct === MIN_LEVELS) warnings.push('Con exactamente cuatro niveles el ajuste cúbico es exacto y no permite evaluar su calidad; se recomiendan más de cuatro niveles.');
  return {
    total: points.length, valid_count: valid.length, rejected_count: rejected.length, valid, rejected,
    duplicates, replicated_levels: replicated, distinct_levels: distinct,
    enough_for_cubic: distinct >= MIN_LEVELS, recommended_ok: distinct >= RECOMMENDED, warnings,
  };
}

export function assessRoot(result, xMin, xMax) {
  const warnings = [];
  const root = result.root;
  const converged = result.status === 'converged';
  const isReal = !!result.root_is_real && root !== null;
  const nonNeg = !!(isReal && root >= 0);
  let inRange = null;
  if (isReal && !nonNeg) warnings.push('La raíz es negativa; no es una carga físicamente interpretable (RN-11).');
  if (isReal && xMin != null && xMax != null) {
    inRange = xMin <= root && root <= xMax;
    if (!inRange) warnings.push('La raíz está fuera del rango medido: es extrapolación y no se presenta como umbral validado (RN-12).');
    else {
      const span = xMax - xMin;
      if (span > 0 && Math.min(root - xMin, xMax - root) <= NEAR_EDGE * span) warnings.push('La raíz está próxima al límite del rango calibrado.');
    }
  } else if (isReal) warnings.push('No se proporcionó el rango calibrado; no se pudo verificar la raíz.');
  return {
    numerically_converged: converged,
    root_is_real: converged ? isReal : null,
    root_non_negative: converged ? nonNeg : null,
    within_calibrated_range: inRange,
    valid_threshold: !!(converged && isReal && nonNeg && inRange),
    assessment_warnings: warnings,
  };
}
