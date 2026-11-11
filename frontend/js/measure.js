// Medición real de la conexión desde el navegador.
// Aplica cargas crecientes (descargas simultáneas) y registra, en cada escalón, el tiempo de respuesta
// bajo carga y el caudal logrado. Mide el camino completo hasta el servidor de prueba, no solo el Wi-Fi.

export const DEFAULT_ENDPOINT = 'https://speed.cloudflare.com/__down';
export const LEVELS = [1, 2, 4, 8, 12, 16, 24, 32];

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Cancelado', 'AbortError')); }, { once: true });
});
const url = (ep, bytes) => `${ep}${ep.includes('?') ? '&' : '?'}bytes=${bytes}&r=${Math.random().toString(36).slice(2)}`;

/** Tiempo de respuesta (ms) de una petición mínima. Devuelve null si falla. */
export async function probe(endpoint, signal, fetchImpl = fetch, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const t0 = performance.now();
  try {
    const res = await fetchImpl(url(endpoint, 0), { cache: 'no-store', signal: ctrl.signal });
    await res.arrayBuffer();
    if (!res.ok) return null;
    return performance.now() - t0;
  } catch { return null; } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

/**
 * Ejecuta la prueba. Opciones: { endpoint, levels, warmupMs, windowMs, windows, chunkBytes, budgetBytes,
 * threshold, signal, onProgress, fetchImpl }.
 */
export async function runMeasurement(opts = {}) {
  const {
    endpoint = DEFAULT_ENDPOINT, levels = LEVELS, warmupMs = 1000, windowMs = 1500, windows = 3, chunkBytes = 500_000,
    budgetBytes = 300_000_000, threshold = 150, signal, onProgress = () => {}, fetchImpl = (...a) => fetch(...a),
  } = opts;

  // Línea base sin carga
  const base = [];
  for (let i = 0; i < 8; i++) {
    onProgress({ phase: 'baseline', done: i, total: 8 });
    const v = await probe(endpoint, signal, fetchImpl);
    if (v !== null) base.push(v);
    await sleep(120, signal);
  }
  if (base.length < 4) throw new Error('No se pudo contactar el servidor de prueba. Revise su conexión a internet (o que la red no bloquee el sitio).');
  const baselineMs = median(base);

  const stages = [];
  let totalBytes = 0;
  let stopReason = 'completed';

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    onProgress({ phase: 'level', level, index: li, total: levels.length, stages });
    const stop = new AbortController();
    const onAbort = () => stop.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const state = { bytes: 0, requests: 0, errors: 0 };
    const winBytes = []; // bytes acumulados por ventana
    let measuring = false;
    let winIdx = -1;

    const worker = async () => {
      while (!stop.signal.aborted) {
        try {
          const res = await fetchImpl(url(endpoint, chunkBytes), { cache: 'no-store', signal: stop.signal });
          if (!res.ok) { state.errors++; await sleep(100); continue; }
          if (res.body?.getReader) {
            const rd = res.body.getReader();
            for (;;) {
              const { done, value } = await rd.read();
              if (done) break;
              if (measuring && winIdx >= 0) winBytes[winIdx] = (winBytes[winIdx] ?? 0) + value.byteLength;
              state.bytes += value.byteLength;
            }
          } else {
            const buf = await res.arrayBuffer();
            if (measuring && winIdx >= 0) winBytes[winIdx] = (winBytes[winIdx] ?? 0) + buf.byteLength;
            state.bytes += buf.byteLength;
          }
          state.requests++;
        } catch (e) {
          if (stop.signal.aborted) return;
          state.errors++;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    };
    const workers = Array.from({ length: level }, () => worker());

    const windowsOut = [];
    let probeFail = 0, probeTotal = 0;
    try {
      await sleep(warmupMs, signal);
      measuring = true;
      for (let w = 0; w < windows; w++) {
        winIdx = w; winBytes[w] = 0;
        const lat = [];
        const end = performance.now() + windowMs;
        while (performance.now() < end) {
          const v = await probe(endpoint, signal, fetchImpl);
          probeTotal++;
          if (v === null) probeFail++; else lat.push(v);
          const rest = end - performance.now();
          if (rest > 0) await sleep(Math.min(200, rest), signal);
        }
        windowsOut.push({ latencyMs: median(lat), mbps: (winBytes[w] * 8) / (windowMs / 1000) / 1e6, probes: lat.length });
        onProgress({ phase: 'window', level, index: li, total: levels.length, window: w + 1, windows, latestLatency: windowsOut[w].latencyMs, latestMbps: windowsOut[w].mbps, stages });
      }
    } finally {
      stop.abort();
      signal?.removeEventListener('abort', onAbort);
      await Promise.allSettled(workers);
    }
    totalBytes += state.bytes;
    const okWins = windowsOut.filter((w) => w.latencyMs !== null);
    const errRate = (state.errors + probeFail) / Math.max(1, state.requests + state.errors + probeTotal);
    const stage = {
      level, windows: okWins, latencyMs: median(okWins.map((w) => w.latencyMs)), mbps: median(windowsOut.map((w) => w.mbps)),
      errorRate: errRate, bytes: state.bytes,
    };
    stages.push(stage);
    onProgress({ phase: 'stage', level, index: li, total: levels.length, stage, stages });

    if (stage.latencyMs === null || errRate > 0.2) { stopReason = 'failures'; break; }
    if (stage.latencyMs > Math.max(4 * threshold, 600)) { stopReason = 'saturated'; break; }
    if (totalBytes > budgetBytes) { stopReason = 'budget'; break; }
    await sleep(400, signal);
  }
  return { baselineMs, stages, totalBytes, stopReason, endpoint, startedAt: new Date().toISOString() };
}

/** Caudal (Mbps) a una carga dada, interpolando linealmente entre escalones. */
export function mbpsAt(stages, x) {
  // Máximo acumulado: una ventana ruidosa no debe hacer que la capacidad estimada baje al aumentar la carga.
  let run = 0;
  const pts = stages.filter((s) => s.mbps != null).map((s) => { run = Math.max(run, s.mbps); return [s.level, run]; });
  if (!pts.length) return null;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return pts[pts.length - 1][1];
}

/** Conclusión en palabras simples. live = {stages, baselineMs, stopReason, perPersonMbps, threshold}; calc = cálculo de Müller o null. */
export function buildConclusion(live, calc) {
  const { stages, baselineMs, threshold, perPersonMbps } = live;
  const fmt = (v, d = 0) => Number(v).toLocaleString('es-CO', { maximumFractionDigits: d });
  const persons = (mbps) => Math.max(0, Math.floor(mbps / perPersonMbps));
  const lines = [];
  const peakMbps = Math.max(...stages.map((s) => s.mbps ?? 0));
  const failStage = stages.find((s) => s.errorRate > 0.05);
  let verdict, tone = 'ok';

  if (baselineMs > threshold) {
    tone = 'warn';
    verdict = `Incluso sin carga, su conexión responde en unos ${fmt(baselineMs)} ms, por encima del límite de ${fmt(threshold)} ms. Con esa respuesta, las videollamadas ya serían incómodas aunque casi nadie la use. No se puede estimar un límite de personas con este límite de tiempo.`;
  } else if (calc?.assessment?.valid_threshold) {
    const x = calc.root;
    const mbps = mbpsAt(stages, x);
    verdict = `Su conexión responde bien (por debajo de ${fmt(threshold)} ms) hasta unas ${fmt(x, 1)} descargas simultáneas, que equivalen a unos ${fmt(mbps, 1)} Mbps de carga por segundo. Pasado ese punto, el tiempo de respuesta supera el límite y las videollamadas empiezan a fallar. Con ${fmt(perPersonMbps, 1)} Mbps por persona, eso alcanza para unas ${fmt(persons(mbps))} personas usándola al mismo tiempo.`;
  } else if (!stages.some((s) => s.latencyMs > threshold)) {
    const okStage = stages[stages.length - 1];
    tone = 'info';
    verdict = `En esta prueba no se llegó al límite: hasta ${fmt(okStage.level)} descargas simultáneas (unos ${fmt(peakMbps, 1)} Mbps) el tiempo de respuesta se mantuvo por debajo de ${fmt(threshold)} ms. La capacidad real es al menos esa: alcanza para ${fmt(persons(peakMbps))} personas o más con ${fmt(perPersonMbps, 1)} Mbps cada una. Para encontrar el límite exacto haría falta más carga de la que esta prueba aplica a propósito.`;
  } else {
    tone = 'warn';
    verdict = 'El tiempo de respuesta superó el límite durante la prueba, pero los datos no permiten ubicar con confianza el punto exacto (la curva ajustada no cruza el límite de forma clara dentro de lo medido). Repita la medición; si sigue igual, el detalle técnico muestra por qué.';
  }
  lines.push(verdict);
  if (failStage) lines.push(`Con ${fmt(failStage.level)} descargas simultáneas ya aparecieron fallos o tiempos agotados (${fmt(failStage.errorRate * 100)} % de las peticiones): ahí la conexión empieza a colapsar.`);
  else if (live.stopReason === 'saturated') lines.push('La prueba se detuvo al ver que la red ya estaba muy saturada, para no forzarla más.');
  lines.push('Recuerde: esta prueba la hace un solo dispositivo y mide el camino hasta internet, no cuenta personas reales. El número de personas es una estimación que depende de cuánto consume cada una.');
  return { tone, lines };
}
