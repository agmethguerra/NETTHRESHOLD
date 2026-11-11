// Utilidades puras (sin DOM): ids, formato numérico, constantes y estado del análisis.

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const nowIso = () => new Date().toISOString();

export const NETWORK_TYPES = [
  { value: 'lan', label: 'LAN' },
  { value: 'wlan', label: 'WLAN / Wi-Fi' },
  { value: 'wan', label: 'WAN' },
  { value: 'enterprise', label: 'Red empresarial' },
  { value: 'datacenter', label: 'Centro de datos' },
  { value: 'cloud', label: 'Nube' },
  { value: 'other', label: 'Otro' },
];

export const STATISTICS = [
  { value: 'mean', label: 'Media' },
  { value: 'median', label: 'Mediana' },
  { value: 'p95', label: 'Percentil 95' },
  { value: 'p99', label: 'Percentil 99' },
  { value: 'other', label: 'Otro' },
];

export const DATA_SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'csv', label: 'Archivo CSV' },
  { value: 'synthetic', label: 'Sintético (simulado)' },
  { value: 'measured', label: 'Medición en vivo (navegador)' },
  { value: 'external', label: 'Medición externa' },
];

const labelOf = (list, value) => list.find((o) => o.value === value)?.label ?? value ?? '—';
export const networkLabel = (v) => labelOf(NETWORK_TYPES, v);
export const statisticLabel = (v) => labelOf(STATISTICS, v);
export const sourceLabel = (v) => labelOf(DATA_SOURCES, v);

/** Horner; mismo esquema que el backend. */
export function polyEval(coeffs, x) {
  let r = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) r = r * x + coeffs[i];
  return r;
}

/** Número con `sig` cifras significativas; notación científica automática para extremos. */
export function fmtNum(v, sig = 6) {
  if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  return String(Number(v.toPrecision(sig)));
}

/** Formatea un valor del backend: número real, {re, im} o null. */
export function fmtComplex(v, sig = 6) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return fmtNum(v, sig);
  if (typeof v === 'object' && 're' in v) {
    const sign = v.im < 0 ? '−' : '+';
    return `${fmtNum(v.re, sig)} ${sign} ${fmtNum(Math.abs(v.im), sig)}i`;
  }
  return String(v);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function distinctLevels(measurements) {
  return new Set(measurements.map((m) => m.loadValue)).size;
}

export function isModelStale(model, scenario) {
  return !!model && model.measurementSetVersion !== scenario.dataVersion;
}

/**
 * Estado visible del análisis (sección 13.1/13.4).
 * tone: ok | warn | error | pending
 */
export function computeStatus(scenario, measurements, model, calculations) {
  if (!measurements.length) return { key: 'no_data', label: 'Sin datos', tone: 'pending' };
  if (!model) {
    return distinctLevels(measurements) >= 4
      ? { key: 'data_ready', label: 'Datos listos', tone: 'pending' }
      : { key: 'insufficient', label: 'Datos insuficientes', tone: 'pending' };
  }
  if (isModelStale(model, scenario)) return { key: 'model_stale', label: 'Modelo pendiente', tone: 'warn' };
  const calc = calculations.find((c) => c.modelId === model.id);
  if (!calc) return { key: 'model_ok', label: 'Modelo válido', tone: 'ok' };
  if (calc.status !== 'converged') return { key: 'calc_error', label: 'Cálculo con error', tone: 'error' };
  if (!calc.assessment?.valid_threshold || (calc.warnings?.length ?? 0) > 0) {
    return { key: 'calc_warn', label: 'Cálculo con advertencias', tone: 'warn' };
  }
  return { key: 'calc_ok', label: 'Cálculo ejecutado', tone: 'ok' };
}

/** Perfiles de uso: límite de respuesta (ms) y consumo por persona (Mbps). Valores orientativos. */
export const USE = {
  clases: { label: 'Clases en línea (límite 150 ms, ≈ 3 Mbps por persona)', ms: 150, mbps: 3 },
  juegos: { label: 'Videojuegos (límite 60 ms, ≈ 3 Mbps por persona)', ms: 60, mbps: 3 },
  streaming: { label: 'Streaming de video (límite 400 ms, ≈ 5 Mbps por persona)', ms: 400, mbps: 5 },
  nube: { label: 'Trabajo en la nube (límite 200 ms, ≈ 2 Mbps por persona)', ms: 200, mbps: 2 },
  web: { label: 'Navegar y redes sociales (límite 300 ms, ≈ 1 Mbps por persona)', ms: 300, mbps: 1 },
};
