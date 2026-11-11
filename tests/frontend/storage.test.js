import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as store from '../../frontend/js/storage.js';
import { computeStatus, isModelStale } from '../../frontend/js/util.js';

const base = { name: 'Prueba', networkType: 'lan', loadVariable: 'Carga', loadUnit: 'req/s', metric: 'latency', metricUnit: 'ms', statistic: 'mean', threshold: 100, dataSource: 'manual', conditions: {} };

test('crea escenario, agrega mediciones y renueva dataVersion', async () => {
  const sc = await store.saveScenario(base);
  assert.ok(sc.id && sc.dataVersion);
  const [m1] = await store.addMeasurements(sc.id, [{ loadValue: 10, metricValue: 5 }]);
  const after1 = await store.getScenario(sc.id);
  assert.notEqual(after1.dataVersion, sc.dataVersion);
  await store.addMeasurements(sc.id, [{ loadValue: 20, metricValue: 8 }, { loadValue: 30, metricValue: 9 }]);
  const list = await store.listMeasurements(sc.id);
  assert.deepEqual(list.map((m) => m.loadValue), [10, 20, 30]); // conserva el orden de inserción
  await store.updateMeasurement({ ...m1, metricValue: 6 });
  assert.equal((await store.listMeasurements(sc.id))[0].metricValue, 6);
  await store.deleteMeasurements(sc.id, [m1.id]);
  assert.equal((await store.listMeasurements(sc.id)).length, 2);
});

test('el modelo queda desactualizado cuando cambian las mediciones', async () => {
  const sc = await store.saveScenario({ ...base, name: 'Stale' });
  await store.addMeasurements(sc.id, [10, 20, 30, 40].map((x) => ({ loadValue: x, metricValue: x })));
  const fresh = await store.getScenario(sc.id);
  const model = await store.saveModel({ scenarioId: sc.id, measurementSetVersion: fresh.dataVersion, coefficients: [0, 1, 0, 0] });
  assert.equal(isModelStale(model, fresh), false);
  await store.addMeasurements(sc.id, [{ loadValue: 50, metricValue: 50 }]);
  const changed = await store.getScenario(sc.id);
  assert.equal(isModelStale(model, changed), true);
  const ms = await store.listMeasurements(sc.id);
  assert.equal(computeStatus(changed, ms, model, []).key, 'model_stale');
});

test('eliminar un escenario borra sus datos relacionados y no los de otros', async () => {
  const a = await store.saveScenario({ ...base, name: 'A' });
  const b = await store.saveScenario({ ...base, name: 'B' });
  for (const s of [a, b]) {
    await store.addMeasurements(s.id, [{ loadValue: 1, metricValue: 1 }]);
    const m = await store.saveModel({ scenarioId: s.id, measurementSetVersion: 'v' });
    await store.saveCalculation({ scenarioId: s.id, modelId: m.id, status: 'converged' });
  }
  await store.deleteScenario(a.id);
  assert.equal(await store.getScenario(a.id), undefined);
  assert.equal((await store.listMeasurements(a.id)).length, 0);
  assert.equal((await store.listModels(a.id)).length, 0);
  assert.equal((await store.listCalculations(a.id)).length, 0);
  assert.equal((await store.listMeasurements(b.id)).length, 1);
  assert.equal((await store.listCalculations(b.id)).length, 1);
});

test('respaldo: exporta, valida y restaura', async () => {
  const sc = await store.saveScenario({ ...base, name: 'Respaldo' });
  await store.addMeasurements(sc.id, [{ loadValue: 1, metricValue: 2 }]);
  const dump = JSON.parse(JSON.stringify(await store.exportAll()));
  assert.equal(dump.app, 'NetThreshold');
  assert.ok(dump.scenarios.some((s) => s.id === sc.id));
  assert.equal(store.validateBackup(dump), true);
  await store.resetAll();
  assert.equal((await store.listScenarios()).length, 0);
  const counts = await store.importAll(dump);
  assert.ok(counts.scenarios >= 1);
  assert.equal((await store.listMeasurements(sc.id)).length, 1);

  const one = await store.exportScenario(sc.id);
  assert.equal(one.scenarios.length, 1);
});

test('rechaza respaldos inválidos', async () => {
  assert.throws(() => store.validateBackup(null), /no es un respaldo/);
  assert.throws(() => store.validateBackup({ app: 'Otra' }), /no es un respaldo/);
  assert.throws(() => store.validateBackup({ app: 'NetThreshold', schemaVersion: 99 }), /no soportada/);
  assert.throws(() => store.validateBackup({ app: 'NetThreshold', schemaVersion: 1, scenarios: [], measurements: [], models: [] }), /incompleto/);
  const bad = { app: 'NetThreshold', schemaVersion: 1, scenarios: [], models: [], calculations: [], measurements: [{ id: 'x', scenarioId: 'y', loadValue: 'a', metricValue: 1 }] };
  assert.throws(() => store.validateBackup(bad), /Medición inválida/);
  await assert.rejects(() => store.importAll(bad), /Medición inválida/);
});

test('estados del análisis', () => {
  const sc = { dataVersion: 'v1' };
  assert.equal(computeStatus(sc, [], null, []).key, 'no_data');
  const ms3 = [1, 2, 3].map((x) => ({ loadValue: x }));
  assert.equal(computeStatus(sc, ms3, null, []).key, 'insufficient');
  const ms5 = [1, 2, 3, 4, 5].map((x) => ({ loadValue: x }));
  assert.equal(computeStatus(sc, ms5, null, []).key, 'data_ready');
  const model = { id: 'm', measurementSetVersion: 'v1' };
  assert.equal(computeStatus(sc, ms5, model, []).key, 'model_ok');
  assert.equal(computeStatus(sc, ms5, model, [{ modelId: 'm', status: 'converged', assessment: { valid_threshold: true }, warnings: [] }]).key, 'calc_ok');
  assert.equal(computeStatus(sc, ms5, model, [{ modelId: 'm', status: 'converged', assessment: { valid_threshold: false }, warnings: ['x'] }]).key, 'calc_warn');
  assert.equal(computeStatus(sc, ms5, model, [{ modelId: 'm', status: 'not_converged' }]).key, 'calc_error');
});
