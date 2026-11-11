import * as store from '../storage.js';
import { syntheticExample } from '../synthetic.js';
import { alert, badge, button, dateStamp, download, h, readFileText, toast } from '../ui.js';
import { computeStatus, distinctLevels, fmtDate, fmtNum, networkLabel } from '../util.js';

export async function renderDashboard(root, app) {
  const scenarios = await store.listScenarios();
  const rows = await Promise.all(scenarios.map(async (sc) => {
    const [ms, models, calcs] = await Promise.all([store.listMeasurements(sc.id), store.listModels(sc.id), store.listCalculations(sc.id)]);
    return { sc, ms, status: computeStatus(sc, ms, models[0] ?? null, calcs) };
  }));

  const restoreInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': 'Archivo de respaldo' });
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    restoreInput.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file, 60 * 1048576));
      store.validateBackup(data);
      const msg = `El respaldo contiene ${data.scenarios.length} escenario(s) y ${data.measurements.length} medición(es).\n\nSe combinará con los datos actuales; los escenarios con el mismo identificador se sobrescribirán. ¿Restaurar?`;
      if (!window.confirm(msg)) return;
      await store.importAll(data);
      toast('Respaldo restaurado.');
      app.reload();
    } catch (err) {
      toast(err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message, 'error');
    }
  });

  const head = h('div', { class: 'block' },
    h('h1', null, 'Análisis avanzado'),
    h('p', { class: 'lede' }, 'Estime cuántas personas o cuánta carga soporta una red antes de volverse demasiado lenta. Cada escenario conserva sus mediciones, su modelo y sus cálculos en este navegador.'),
    h('div', { class: 'row', style: 'margin-top:16px' },
      button('Nuevo escenario', { variant: 'primary', onclick: () => app.navigate('#/nuevo') }),
      button('Cargar ejemplo simulado', {
        onclick: async () => {
          const { scenario, measurements } = syntheticExample();
          const saved = await store.saveScenario(scenario);
          await store.addMeasurements(saved.id, measurements);
          toast('Ejemplo simulado creado.');
          app.navigate(`#/s/${saved.id}/datos`);
        },
      }),
      button('Exportar respaldo', {
        disabled: !rows.length,
        onclick: async () => {
          download(`netthreshold-respaldo-${dateStamp()}.json`, JSON.stringify(await store.exportAll(), null, 2), 'application/json');
          toast('Respaldo exportado.');
        },
      }),
      button('Restaurar respaldo', { onclick: () => restoreInput.click() }),
      restoreInput),
    alert('warn', 'Los datos viven solo en este navegador', h('p', null, 'IndexedDB no es una copia de seguridad: borrar los datos del sitio, cambiar de navegador o de equipo los pierde. Exporte un respaldo con regularidad.')));

  let list;
  if (!rows.length) {
    list = h('div', { class: 'empty-state' },
      h('h2', null, 'Aún no hay escenarios'),
      h('p', { class: 'lede' }, 'Cree un escenario con sus unidades y su umbral, o cargue el ejemplo simulado para recorrer el flujo completo en un minuto.'));
  } else {
    list = h('ul', { class: 'scenario-list' }, rows.map(({ sc, ms, status }) => h('li', { class: 'scenario-item' },
      h('div', null,
        h('h3', null, h('a', { href: `#/s/${sc.id}/datos` }, sc.name)),
        h('div', { class: 'meta' }, `${networkLabel(sc.networkType)} · umbral ${fmtNum(sc.threshold)} ${sc.metricUnit} · carga en ${sc.loadUnit}`)),
      h('div', { class: 'stats' },
        h('div', null, badge(status.tone, status.label), sc.dataSource === 'synthetic' ? ' ' : null, sc.dataSource === 'synthetic' ? badge('info', 'Simulado') : null),
        h('div', { style: 'margin-top:5px' }, `${ms.length} mediciones · ${distinctLevels(ms)} niveles · ${fmtDate(sc.updatedAt)}`)),
      h('div', { class: 'actions' },
        button('Abrir', { variant: 'ghost', size: 'sm', onclick: () => app.navigate(`#/s/${sc.id}/datos`) }),
        button('Duplicar', {
          variant: 'ghost', size: 'sm',
          onclick: async () => {
            const copy = await store.saveScenario({ ...sc, id: undefined, createdAt: undefined, dataVersion: undefined, name: `${sc.name} (copia)` });
            if (ms.length) {
              await store.addMeasurements(copy.id, ms.map((m) => ({ loadValue: m.loadValue, metricValue: m.metricValue, timestamp: m.timestamp, replicate: m.replicate, notes: m.notes, sourceRow: m.sourceRow, origin: m.origin, source: m.source })));
            }
            toast('Escenario duplicado (sin modelo ni cálculos).');
            app.reload();
          },
        }),
        button('Eliminar', {
          variant: 'ghost', size: 'sm', class: 'btn-danger',
          onclick: async () => {
            if (!window.confirm(`¿Eliminar «${sc.name}» con todas sus mediciones, modelos y cálculos? Esta acción no se puede deshacer.`)) return;
            await store.deleteScenario(sc.id);
            toast('Escenario eliminado.');
            app.reload();
          },
        })))));
  }
  root.append(head, h('div', { class: 'block' }, list));
}
