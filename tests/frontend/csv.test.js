import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPoints, detectDelimiter, guessMapping, parseCSV } from '../../frontend/js/csv.js';

test('detecta separadores', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(detectDelimiter('"a,x";b\n"1,5";2'), ';'); // comas dentro de comillas no cuentan
});

test('parsea comillas, comillas escapadas, saltos de línea y BOM', () => {
  const { records, unterminatedQuote } = parseCSV('﻿a,b\n"x,1","di ""hola"""\n"línea\nnueva",2\r\n', ',');
  assert.equal(unterminatedQuote, false);
  assert.deepEqual(records, [['a', 'b'], ['x,1', 'di "hola"'], ['línea\nnueva', '2']]);
});

test('detecta comilla sin cerrar', () => {
  assert.equal(parseCSV('a,b\n"x,1\n', ',').unterminatedQuote, true);
});

test('mapeo automático de columnas en español e inglés', () => {
  assert.deepEqual(
    (({ load, metric, timestamp, notes }) => ({ load, metric, timestamp, notes }))(guessMapping(['load_value', 'latency_ms', 'timestamp', 'notes'])),
    { load: 0, metric: 1, timestamp: 2, notes: 3 });
  const m = guessMapping(['Fecha', 'Carga ofrecida', 'Latencia (ms)', 'Observaciones']);
  assert.equal(m.load, 1); assert.equal(m.metric, 2); assert.equal(m.timestamp, 0); assert.equal(m.notes, 3);
  assert.equal(guessMapping(['foo', 'bar']).load, -1);
});

test('buildPoints numera filas como en una hoja y omite filas vacías', () => {
  const records = [['x', 'y'], ['1', '2'], ['', ''], ['3', 'abc'], ['4']];
  const { points, emptyRows } = buildPoints(records, { load: 0, metric: 1, loadUnit: -1, metricUnit: -1, timestamp: -1, notes: -1, replicate: -1 });
  assert.equal(emptyRows, 1);
  assert.deepEqual(points.map((p) => [p.row, p.x, p.y]), [[2, '1', '2'], [4, '3', 'abc'], [5, '4', null]]);
});
