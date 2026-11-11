import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as store from '../../frontend/js/storage.js';
import { runDemo } from '../../frontend/js/demo.js';
import * as api from '../../frontend/js/api.js';

test('la demostración de 1 clic deja un resultado validado', async () => {
  const id = await runDemo();
  const [calc] = await store.listCalculations(id);
  assert.equal(calc.status, 'converged');
  assert.ok(calc.assessment.valid_threshold);
  assert.ok(calc.root > 95 && calc.root < 110);
});

test('motor en el navegador: rechaza puntos repetidos y maneja raíces complejas', async () => {
  const bad = await api.solveMuller({ coefficients: [1, 0, 1, 0], threshold: 0, x0: 1, x1: 1, x2: 2 });
  assert.equal(bad.ok, false);
  const cx = await api.solveMuller({ coefficients: [1, 0, 1, 0], threshold: 0, x0: 0.5, x1: 1, x2: 1.5, x_min: 0, x_max: 10 });
  assert.equal(cx.data.root_is_real, false);
  assert.equal(cx.data.valid_threshold, false);
});

test('ajuste con pocos niveles falla con mensaje claro', async () => {
  const r = await api.fitModel({ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] });
  assert.equal(r.ok, false);
  assert.match(r.data.message, /al menos 4/);
});
