import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConclusion, mbpsAt, runMeasurement } from '../../frontend/js/measure.js';
import { saveMeasurement } from '../../frontend/js/views/measure.js';
import * as store from '../../frontend/js/storage.js';

// Servidor simulado: capacidad compartida; la respuesta empeora al crecer el número de descargas activas.
function fakeNet({ capacityMbps = 80, baseMs = 20, badAt = Infinity } = {}) {
  let active = 0;
  return async (u, { signal } = {}) => {
    const bytes = Number(new URL(u).searchParams.get('bytes'));
    const wait = (ms) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('x', 'AbortError')); }); });
    if (bytes === 0) {
      await wait(baseMs + 4 * active ** 2);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    active++;
    let sent = 0;
    const perChunk = 50_000;
    const body = { getReader: () => ({ read: async () => {
      if (sent >= bytes) { active--; return { done: true }; }
      const rate = (capacityMbps * 1e6) / 8 / Math.max(1, active); // bytes/s por descarga
      try { await wait((perChunk / rate) * 1000); } catch (e) { active--; throw e; }
      sent += perChunk; return { done: false, value: new Uint8Array(perChunk) };
    } }) };
    return { ok: true, body };
  };
}
const fast = { warmupMs: 80, windowMs: 200, windows: 3, chunkBytes: 400_000, levels: [1, 2, 4, 6, 8, 12], budgetBytes: 1e12 };

test('la medición simulada detecta el cruce del límite y concluye en personas', async () => {
  const result = await runMeasurement({ ...fast, threshold: 150, fetchImpl: fakeNet() });
  assert.ok(result.stages.length >= 5);
  assert.ok(result.stages.at(-1).latencyMs > result.stages[0].latencyMs);
  const saved = await saveMeasurement(result, { threshold: 150, perPersonMbps: 3 });
  assert.equal(saved.calc?.status, 'converged');
  const c = buildConclusion(saved.live, saved.calc);
  console.log('CONCLUSION:', c.lines[0]);
  assert.match(c.lines[0], /personas/);
  assert.ok(mbpsAt(result.stages, 4) > 0);
  const sc = await store.getScenario(saved.scenarioId);
  assert.equal(sc.dataSource, 'measured');
});

test('si nunca se llega al límite lo dice en vez de inventar un número', async () => {
  const result = await runMeasurement({ ...fast, levels: [1, 2, 4, 6], threshold: 150, fetchImpl: fakeNet({ baseMs: 10 }) });
  const live = { stages: result.stages, baselineMs: result.baselineMs, threshold: 5000, perPersonMbps: 3, stopReason: result.stopReason };
  const c = buildConclusion(live, null);
  assert.match(c.lines[0], /no se llegó al límite/);
});

test('falla con mensaje claro si no hay servidor', async () => {
  await assert.rejects(runMeasurement({ ...fast, fetchImpl: async () => { throw new Error('offline'); } }), /No se pudo contactar/);
});
