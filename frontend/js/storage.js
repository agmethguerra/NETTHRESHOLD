// Persistencia local en IndexedDB (sección 11). Sin DOM: se puede probar en Node con fake-indexeddb.
import { nowIso, uuid } from './util.js';

const DB_NAME = 'netthreshold';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;
const STORES = ['scenarios', 'measurements', 'models', 'calculations'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('scenarios', { keyPath: 'id' });
      db.createObjectStore('measurements', { keyPath: 'id' }).createIndex('scenarioId', 'scenarioId');
      db.createObjectStore('models', { keyPath: 'id' }).createIndex('scenarioId', 'scenarioId');
      db.createObjectStore('calculations', { keyPath: 'id' }).createIndex('scenarioId', 'scenarioId');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('La base de datos local está bloqueada por otra pestaña.'));
  });
  return dbPromise;
}

const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Ejecuta `work` dentro de una transacción; resuelve al completarse (commit) con su resultado. */
async function run(names, mode, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transacción cancelada.'));
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    Promise.resolve(work(stores)).then(
      (r) => { result = r; },
      (e) => { try { t.abort(); } catch { /* ya finalizada */ } reject(e); },
    );
  });
}

let seqCounter = 0;
const nextSeq = () => Date.now() * 1000 + (seqCounter++ % 1000);

const byDateDesc = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

// ---- Escenarios ---------------------------------------------------------------------------

export const listScenarios = () =>
  run(['scenarios'], 'readonly', async ({ scenarios }) =>
    (await req(scenarios.getAll())).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));

export const getScenario = (id) => run(['scenarios'], 'readonly', ({ scenarios }) => req(scenarios.get(id)));

/** Crea o actualiza; asigna id, fechas y versión de datos cuando faltan. */
export async function saveScenario(data) {
  const now = nowIso();
  const scenario = {
    ...data,
    id: data.id ?? uuid(),
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    dataVersion: data.dataVersion ?? uuid(),
  };
  await run(['scenarios'], 'readwrite', ({ scenarios }) => req(scenarios.put(scenario)));
  return scenario;
}

async function deleteByScenario(store, scenarioId) {
  const keys = await req(store.index('scenarioId').getAllKeys(scenarioId));
  await Promise.all(keys.map((k) => req(store.delete(k))));
}

/** Elimina el escenario y todos sus registros relacionados (modelos, mediciones, cálculos). */
export const deleteScenario = (id) =>
  run(STORES, 'readwrite', async (s) => {
    await Promise.all(['measurements', 'models', 'calculations'].map((n) => deleteByScenario(s[n], id)));
    await req(s.scenarios.delete(id));
  });

// ---- Mediciones ---------------------------------------------------------------------------
// Cada cambio en las mediciones renueva scenario.dataVersion: así el modelo previo queda
// marcado como desactualizado (sección 11.8).

async function bump(scenarios, scenarioId) {
  const sc = await req(scenarios.get(scenarioId));
  if (!sc) throw new Error('El escenario no existe.');
  sc.dataVersion = uuid();
  sc.updatedAt = nowIso();
  await req(scenarios.put(sc));
}

export const listMeasurements = (scenarioId) =>
  run(['measurements'], 'readonly', async ({ measurements }) =>
    (await req(measurements.index('scenarioId').getAll(scenarioId))).sort((a, b) => a.seq - b.seq));

/** @param items [{loadValue, metricValue, timestamp?, replicate?, notes?, sourceRow?}] */
export const addMeasurements = (scenarioId, items) =>
  run(['measurements', 'scenarios'], 'readwrite', async ({ measurements, scenarios }) => {
    const created = [];
    for (const it of items) {
      const m = {
        id: uuid(),
        scenarioId,
        loadValue: it.loadValue,
        metricValue: it.metricValue,
        timestamp: it.timestamp ?? null,
        replicate: it.replicate ?? null,
        notes: it.notes ?? null,
        sourceRow: it.sourceRow ?? null,
        origin: it.origin ?? 'manual',
        source: it.source ?? null, // nombre del archivo CSV de origen
        seq: nextSeq(),
        createdAt: nowIso(),
      };
      await req(measurements.put(m));
      created.push(m);
    }
    await bump(scenarios, scenarioId);
    return created;
  });

export const updateMeasurement = (m) =>
  run(['measurements', 'scenarios'], 'readwrite', async ({ measurements, scenarios }) => {
    await req(measurements.put(m));
    await bump(scenarios, m.scenarioId);
  });

export const deleteMeasurements = (scenarioId, ids) =>
  run(['measurements', 'scenarios'], 'readwrite', async ({ measurements, scenarios }) => {
    for (const id of ids) await req(measurements.delete(id));
    await bump(scenarios, scenarioId);
  });

// ---- Modelos y cálculos -------------------------------------------------------------------

export async function saveModel(model) {
  const m = { ...model, id: model.id ?? uuid(), createdAt: model.createdAt ?? nowIso() };
  await run(['models'], 'readwrite', ({ models }) => req(models.put(m)));
  return m;
}

export const listModels = (scenarioId) =>
  run(['models'], 'readonly', async ({ models }) =>
    (await req(models.index('scenarioId').getAll(scenarioId))).sort(byDateDesc));

export async function latestModel(scenarioId) {
  return (await listModels(scenarioId))[0] ?? null;
}

export async function saveCalculation(calc) {
  const c = { ...calc, id: calc.id ?? uuid(), createdAt: calc.createdAt ?? nowIso() };
  await run(['calculations'], 'readwrite', ({ calculations }) => req(calculations.put(c)));
  return c;
}

export const listCalculations = (scenarioId) =>
  run(['calculations'], 'readonly', async ({ calculations }) =>
    (await req(calculations.index('scenarioId').getAll(scenarioId))).sort(byDateDesc));

export const getModel = (id) => run(['models'], 'readonly', ({ models }) => req(models.get(id)));

// ---- Respaldo -----------------------------------------------------------------------------

export const exportAll = () =>
  run(STORES, 'readonly', async (s) => ({
    app: 'NetThreshold',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    scenarios: await req(s.scenarios.getAll()),
    measurements: await req(s.measurements.getAll()),
    models: await req(s.models.getAll()),
    calculations: await req(s.calculations.getAll()),
  }));

export async function exportScenario(id) {
  const all = await exportAll();
  const keep = (list) => list.filter((x) => x.scenarioId === id);
  return {
    ...all,
    scenarios: all.scenarios.filter((s) => s.id === id),
    measurements: keep(all.measurements),
    models: keep(all.models),
    calculations: keep(all.calculations),
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Valida la estructura de un respaldo; lanza Error con un mensaje claro si no es válido. */
export function validateBackup(data) {
  if (!isObj(data) || data.app !== 'NetThreshold') throw new Error('El archivo no es un respaldo de NetThreshold.');
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error(`Versión de respaldo no soportada (${data.schemaVersion}).`);
  for (const k of STORES) if (!Array.isArray(data[k])) throw new Error(`Respaldo incompleto: falta «${k}».`);
  for (const s of data.scenarios) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.name !== 'string') throw new Error('Escenario inválido en el respaldo.');
  }
  for (const m of data.measurements) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.scenarioId !== 'string'
      || !Number.isFinite(m.loadValue) || !Number.isFinite(m.metricValue)) {
      throw new Error('Medición inválida en el respaldo.');
    }
  }
  for (const k of ['models', 'calculations']) {
    for (const x of data[k]) {
      if (!isObj(x) || typeof x.id !== 'string' || typeof x.scenarioId !== 'string') throw new Error(`Registro inválido en «${k}».`);
    }
  }
  return true;
}

/** Restaura un respaldo. `replace` vacía antes; si no, combina por id (los ids iguales se sobrescriben). */
export async function importAll(data, { replace = false } = {}) {
  validateBackup(data);
  await run(STORES, 'readwrite', async (s) => {
    if (replace) await Promise.all(STORES.map((n) => req(s[n].clear())));
    for (const n of STORES) for (const rec of data[n]) await req(s[n].put(rec));
  });
  return Object.fromEntries(STORES.map((n) => [n, data[n].length]));
}

export async function resetAll() {
  await run(STORES, 'readwrite', async (s) => { await Promise.all(STORES.map((n) => req(s[n].clear()))); });
}
