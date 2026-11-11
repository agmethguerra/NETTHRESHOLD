// Gráficas con Chart.js (global `Chart`, vendorizado en assets/vendor).
// Colores validados con el validador de paletas (CVD y contraste) en modo claro y oscuro.
import { evaluate } from './api.js';
import { fmtNum, polyEval } from './util.js';

const LIGHT = {
  points: '#2F6EA8', curve: '#A33C7A', threshold: '#B45309', ink: '#12202F', surface: '#FFFFFF',
  grid: '#E3E8ED', axis: '#7A8A9B', text: '#44566A', band: 'rgba(47,110,168,0.07)',
};
const DARK = {
  points: '#35D0FF', curve: '#E8F1FF', threshold: '#FFB84D', ink: '#E8F1FF', surface: '#0A1226',
  grid: '#142445', axis: '#7F90A2', text: '#A9B8C7', band: 'rgba(79,143,214,0.10)',
};

const prefersDark = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const palette = (forceLight) => (forceLight ? LIGHT : DARK);

const live = new Set();
export function destroyCharts() {
  for (const c of live) c.destroy();
  live.clear();
}

const bandPlugin = {
  id: 'calibratedBand',
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts || opts.xMin == null) return;
    const { ctx, chartArea, scales } = chart;
    const x1 = Math.max(chartArea.left, scales.x.getPixelForValue(opts.xMin));
    const x2 = Math.min(chartArea.right, scales.x.getPixelForValue(opts.xMax));
    if (x2 <= x1) return;
    ctx.save();
    ctx.fillStyle = opts.fill;
    ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
    ctx.fillStyle = opts.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(opts.label, x1 + 8, chartArea.top + 6);
    ctx.restore();
  },
};

const zonesPlugin = {
  id: 'thresholdZones',
  beforeDatasetsDraw(chart, _a, o) {
    if (!o || o.threshold == null) return;
    const { ctx, chartArea: a, scales } = chart;
    const yT = Math.min(a.bottom, Math.max(a.top, scales.y.getPixelForValue(o.threshold)));
    ctx.save();
    ctx.fillStyle = o.safe; ctx.fillRect(a.left, yT, a.right - a.left, a.bottom - yT);
    ctx.fillStyle = o.danger; ctx.fillRect(a.left, a.top, a.right - a.left, yT - a.top);
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = o.text;
    ctx.textBaseline = 'bottom'; ctx.fillText('Zona segura', a.right - 8, a.bottom - 6);
    ctx.textBaseline = 'top'; ctx.fillText('Zona de peligro', a.right - 8, a.top + 6);
    ctx.restore();
  },
};

/** Evalúa la curva con el backend; si no está disponible usa el mismo polinomio localmente. */
export async function curvePoints(coefficients, xs) {
  try {
    const r = await evaluate({ coefficients, xs });
    if (r.ok && r.data?.ys) return xs.map((x, i) => ({ x, y: r.data.ys[i] })).filter((p) => Number.isFinite(p.y));
  } catch { /* se evalúa localmente */ }
  return xs.map((x) => ({ x, y: polyEval(coefficients, x) })).filter((p) => Number.isFinite(p.y));
}

const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

/**
 * Prepara los datos de la gráfica principal (sección 13.3).
 * root: { x, validated } | null
 */
export async function chartSpec({ scenario, model, measurements, root = null }) {
  const pts = (measurements ?? []).map((m) => ({ x: m.loadValue, y: m.metricValue }));
  const xMin = model.xMin;
  const xMax = model.xMax;
  const span = xMax - xMin || 1;
  let axisMin = Math.max(0, xMin - 0.08 * span);
  let axisMax = xMax + 0.25 * span;
  const rootX = root && Number.isFinite(root.x) && root.x >= 0 ? root.x : null;
  if (rootX !== null && rootX > axisMax) axisMax = Math.min(rootX + 0.05 * span, xMax + 3 * span);
  const inside = linspace(xMin, xMax, 100);
  const outside = linspace(xMax, axisMax, 60);
  const all = await curvePoints(model.coefficients, [...inside, ...outside]);
  const curveIn = all.filter((p) => p.x <= xMax + 1e-12 && p.x >= xMin - 1e-12 && inside.includes(p.x));
  const curveOut = all.filter((p) => p.x >= xMax - 1e-12);
  const yTop = Math.max(...pts.map((p) => p.y), scenario.threshold);
  return {
    points: pts, curveIn, curveOut, threshold: scenario.threshold,
    root: rootX === null ? null : { x: rootX, validated: !!root.validated },
    xMin, xMax, axisMin, axisMax, yMax: yTop * 1.35,
    loadLabel: `${scenario.loadVariable} (${scenario.loadUnit})`,
    metricLabel: `Latencia (${scenario.metricUnit})`,
    loadUnit: scenario.loadUnit, metricUnit: scenario.metricUnit,
  };
}

function baseOptions(c, { animate, loadLabel, metricLabel, xMin, xMax, yMin, yMax }) {
  const tick = { color: c.text, font: { size: 12 } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: animate && !prefersReducedMotion() ? { duration: 300 } : false,
    scales: {
      x: { type: 'linear', min: xMin, max: xMax, title: { display: true, text: loadLabel, color: c.text }, ticks: tick, grid: { color: c.grid }, border: { color: c.axis } },
      y: { type: 'linear', min: yMin, max: yMax, title: { display: true, text: metricLabel, color: c.text }, ticks: tick, grid: { color: c.grid }, border: { color: c.axis } },
    },
  };
}

export function mainChart(canvas, spec, { forceLight = false, animate = true, sized = false } = {}) {
  const c = palette(forceLight);
  const datasets = [
    { label: 'Mediciones', data: spec.points, showLine: false, pointRadius: 4.5, pointHoverRadius: 6, backgroundColor: c.points, borderColor: c.surface, borderWidth: 1.5, order: 3 },
    { label: 'Curva ajustada', data: spec.curveIn, showLine: true, pointRadius: 0, pointHitRadius: 6, borderColor: c.curve, backgroundColor: c.curve, borderWidth: 2, tension: 0, order: 2 },
    { label: 'Extrapolación (sin datos)', data: spec.curveOut, showLine: true, pointRadius: 0, pointHitRadius: 6, borderColor: c.curve, backgroundColor: c.curve, borderWidth: 2, borderDash: [2, 4], tension: 0, order: 2 },
    { label: `Umbral (${fmtNum(spec.threshold)} ${spec.metricUnit})`, data: [{ x: spec.axisMin, y: spec.threshold }, { x: spec.axisMax, y: spec.threshold }], showLine: true, pointRadius: 0, pointHitRadius: 0, borderColor: c.threshold, backgroundColor: c.threshold, borderWidth: 2, borderDash: [8, 5], order: 1 },
  ];
  if (spec.root) {
    datasets.push({
      label: spec.root.validated ? 'Carga estimada (validada)' : 'Carga estimada (no validada)',
      data: [{ x: spec.root.x, y: 0 }, { x: spec.root.x, y: spec.threshold }],
      showLine: true, borderColor: c.ink, backgroundColor: spec.root.validated ? c.ink : c.surface,
      borderWidth: 1.5, borderDash: spec.root.validated ? [] : [4, 3],
      pointRadius: (ctx) => (ctx.dataIndex === 1 ? 7 : 0), pointBorderColor: c.ink, pointBorderWidth: 2.5, pointHitRadius: 8, order: 0,
    });
  }
  const options = baseOptions(c, { animate, ...spec, xMin: spec.axisMin, xMax: spec.axisMax, yMin: 0, yMax: spec.yMax });
  options.interaction = { mode: 'nearest', intersect: true };
  options.plugins = {
    legend: { position: 'bottom', labels: { color: c.text, usePointStyle: true, boxWidth: 8, padding: 16, font: { size: 12 } } },
    tooltip: {
      callbacks: {
        label: (item) => `${item.dataset.label}: ${fmtNum(item.parsed.x)} ${spec.loadUnit}, ${fmtNum(item.parsed.y)} ${spec.metricUnit}`,
      },
    },
    thresholdZones: { threshold: spec.threshold, safe: 'rgba(62,224,160,0.10)', danger: 'rgba(255,107,107,0.10)', text: c.text },
    calibratedBand: { xMin: spec.xMin, xMax: spec.xMax, label: 'Rango calibrado', fill: c.band, text: c.text },
  };
  const chart = new globalThis.Chart(canvas, { type: 'scatter', data: { datasets }, options, plugins: [zonesPlugin, bandPlugin] });
  if (!sized) live.add(chart);
  return chart;
}

export function residualChart(canvas, { points, loadLabel, metricUnit, loadUnit }) {
  const c = palette(false);
  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const pad = (xMax - xMin || 1) * 0.06;
  const rMax = Math.max(...points.map((p) => Math.abs(p.y)), 1e-9) * 1.3;
  const datasets = [
    { label: 'Residuo', data: points, showLine: false, pointRadius: 4.5, pointHoverRadius: 6, backgroundColor: c.points, borderColor: c.surface, borderWidth: 1.5 },
    { label: 'Cero', data: [{ x: xMin - pad, y: 0 }, { x: xMax + pad, y: 0 }], showLine: true, pointRadius: 0, pointHitRadius: 0, borderColor: c.axis, borderWidth: 1.5 },
  ];
  const options = baseOptions(c, { animate: true, loadLabel, metricLabel: `Residuo (${metricUnit})`, xMin: xMin - pad, xMax: xMax + pad, yMin: -rMax, yMax: rMax });
  options.plugins = {
    legend: { display: false },
    tooltip: { filter: (i) => i.datasetIndex === 0, callbacks: { label: (i) => `Residuo: ${fmtNum(i.parsed.y)} ${metricUnit} a ${fmtNum(i.parsed.x)} ${loadUnit}` } },
  };
  const chart = new globalThis.Chart(canvas, { type: 'scatter', data: { datasets }, options });
  live.add(chart);
  return chart;
}

/** Imagen PNG de la gráfica principal en tema claro (para el reporte). */
export async function chartToImage(spec, width = 920, height = 440) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.append(canvas);
  const chart = mainChart(canvas, spec, { forceLight: true, animate: false, sized: true });
  chart.options.responsive = false;
  chart.resize(width, height);
  chart.update('none');
  const url = canvas.toDataURL('image/png');
  chart.destroy();
  canvas.remove();
  return url;
}
