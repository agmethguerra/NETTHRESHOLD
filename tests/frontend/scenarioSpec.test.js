import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITS, LOAD_VARIABLES, PROFILES, conditionsText, draftFromScenario, formatPeriod, sanitizeInt, sanitizeName, suggestName, summaryParts, validateScenario,
} from '../../frontend/js/scenarioSpec.js';

const TODAY = new Date(2026, 10, 11); // 11 nov 2026
const ok = (over = {}) => ({ ...draftFromScenario(), networkType: 'wlan', dataSource: 'manual', loadKey: 'people', ...over });
const check = (d, o = {}) => validateScenario(d, { today: TODAY, ...o });

test('borrador nuevo: faltan solo las tres decisiones que la app no puede adivinar', () => {
  const r = check(draftFromScenario());
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors), ['networkType', 'dataSource', 'loadKey']);
  assert.ok(Object.values(r.errors).every((e) => e.kind === 'missing'));
});

test('con las tres elecciones es válido; unidad y umbral se deducen', () => {
  const r = check(ok());
  assert.equal(r.ok, true);
  assert.equal(r.value.loadUnit, 'personas');
  assert.equal(r.value.loadVariable, 'Personas conectadas');
  assert.equal(r.value.metricUnit, 'ms');
  assert.equal(r.value.threshold, 150);
  assert.equal(r.value.metric, 'latency');
});

test('cada variable de carga trae su propia unidad fija', () => {
  for (const v of LOAD_VARIABLES) assert.equal(check(ok({ loadKey: v.key })).value.loadUnit, v.unit);
});

test('un perfil fija el umbral aunque el número escrito sea otro', () => {
  assert.equal(check(ok({ profile: 'juegos', threshold: 9999 })).value.threshold, 60);
});

test('«Otro límite»: solo enteros de 1 a 2000', () => {
  for (const bad of ['', '0', '2001', '-5', '1.5', 'abc', '1e3']) {
    const r = check(ok({ profile: 'custom', threshold: bad }));
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(bad)}`);
    assert.ok(r.errors.threshold);
  }
  assert.equal(check(ok({ profile: 'custom', threshold: '2000' })).value.threshold, 2000);
  assert.equal(check(ok({ profile: 'custom', threshold: 1 })).value.threshold, 1);
});

test('valores fuera de las listas se rechazan', () => {
  for (const [f, v] of [['networkType', 'satelite'], ['dataSource', 'adivinado'], ['loadKey', 'mbps-raro'], ['statistic', 'moda'], ['profile', 'otro'], ['tool', 'x'], ['protocol', 'x']]) {
    assert.equal(check(ok({ [f]: v })).ok, false, f);
  }
});

test('nombre: se sanea, se limita y no se repite', () => {
  assert.equal(sanitizeName('Aula <b>1</b> {x}\\'), 'Aula b1/b x');
  assert.equal(sanitizeName('a'.repeat(200)).length, LIMITS.nameMax);
  assert.equal(check(ok({ name: '12' })).errors.name.kind, 'invalid');
  assert.equal(check(ok({ name: '1234' })).errors.name.kind, 'invalid'); // sin letras
  assert.equal(check(ok({ name: 'Wi-Fi del aula 3' })).ok, true);
  const dup = check(ok({ name: 'wifi del AULA 3' }), { existingNames: ['Wi-Fi del aula 3', 'wifi del aula 3'] });
  assert.equal(dup.ok, false);
  assert.match(dup.errors.name.msg, /Ya existe/);
});

test('nombre vacío: usa uno sugerido y distinto de los existentes', () => {
  const d = ok();
  const first = suggestName(d, [], TODAY);
  assert.equal(first, 'WLAN / Wi-Fi · Clases y videollamadas · 11 nov 2026');
  assert.equal(suggestName(d, [first], TODAY), `${first} (2)`);
  assert.equal(check(d, { existingNames: [first] }).value.name, `${first} (2)`);
});

test('fecha: no futura; hora fin posterior a inicio; hora requiere fecha', () => {
  assert.equal(check(ok({ date: '2026-11-12' })).errors.date.kind, 'invalid');
  assert.equal(check(ok({ date: '2026-02-30' })).errors.date.kind, 'invalid');
  assert.equal(check(ok({ date: '2026-11-10', start: '11:00', end: '09:00' })).errors.time.kind, 'invalid');
  assert.equal(check(ok({ date: '2026-11-10', start: '09:00', end: '09:00' })).ok, false);
  assert.equal(check(ok({ start: '09:00' })).errors.date.kind, 'invalid');
  const good = check(ok({ date: '2026-11-10', start: '09:00', end: '11:00' }));
  assert.equal(good.value.conditions.period, '10 nov 2026, 09:00 a 11:00');
  assert.equal(formatPeriod({ date: '2026-11-10' }), '10 nov 2026');
});

test('datos simulados: el periodo es «Simulado» y se ignora la fecha', () => {
  const r = check(ok({ dataSource: 'synthetic', date: '2030-01-01' }));
  assert.equal(r.ok, true);
  assert.equal(r.value.conditions.period, 'Simulado');
});

test('textos largos y enteros escritos', () => {
  assert.equal(check(ok({ notes: 'x'.repeat(LIMITS.notesMax + 1) })).ok, false);
  assert.equal(check(ok({ description: 'x'.repeat(LIMITS.descMax + 1) })).ok, false);
  assert.equal(sanitizeInt('12a3.4e5'), '1234');
});

test('escenarios de versiones anteriores siguen siendo editables', () => {
  const old = {
    id: 'x', name: 'Prueba vieja', networkType: 'lan', dataSource: 'measured', loadVariable: 'Alumnos en el aula', loadUnit: 'alumnos',
    metricUnit: 'ms', statistic: 'other', threshold: 33, conditions: { period: '10 nov, tarde', notes: 'algo' },
  };
  const d = draftFromScenario(old);
  assert.equal(d.loadKey, 'legacy');
  assert.equal(d.profile, 'custom');
  const r = check(d, { original: old, existingNames: [] });
  assert.equal(r.ok, true);
  assert.equal(r.value.loadVariable, 'Alumnos en el aula');
  assert.equal(r.value.loadUnit, 'alumnos');
  assert.equal(r.value.dataSource, 'measured');
  assert.equal(r.value.statistic, 'other');
  assert.equal(r.value.threshold, 33);
  assert.equal(r.value.conditions.period, '10 nov, tarde'); // se conserva el periodo escrito a mano
});

test('una variable anterior con unidad conocida se reconoce', () => {
  assert.equal(draftFromScenario({ id: 'x', loadVariable: 'Personas conectadas al Wi-Fi', loadUnit: 'personas', threshold: 150 }).loadKey, 'people');
  assert.equal(draftFromScenario({ id: 'x', loadVariable: 'Descargas simultáneas', loadUnit: 'descargas', threshold: 300 }).profile, 'web');
});

test('el umbral coincide con perfiles conocidos', () => {
  assert.deepEqual(PROFILES.map((p) => p.ms), [150, 60, 400, 200, 300, null]);
});

test('resumen y condiciones en lenguaje simple', () => {
  const txt = summaryParts(ok()).map((s) => s.text).join('');
  assert.match(txt, /red WLAN \/ Wi-Fi/);
  assert.match(txt, /personas conectadas \(personas\)/);
  assert.match(txt, /150 ms \(clases y videollamadas\)/);
  assert.match(summaryParts(draftFromScenario()).map((s) => s.text).join(''), /sin elegir/);
  assert.equal(conditionsText({ tool: 'iperf', protocol: 'tcp', target: 'unknown', packetSize: 'unknown', notes: 'Aula 3' }), 'Herramienta: iPerf / iPerf3 · Protocolo: TCP — Aula 3');
  assert.equal(conditionsText({ notes: 'solo notas' }), 'solo notas');
  assert.equal(conditionsText(undefined), '');
});
