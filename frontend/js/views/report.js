import { chartSpec, chartToImage } from '../charts.js';
import { buildReportHtml } from '../reports.js';
import { alert, button, dateStamp, download, h, slug, toast } from '../ui.js';

export async function renderReport(root, ctx, app) {
  const { scenario: sc, model, calculations, stale } = ctx;
  const intro = h('div', { class: 'block' }, h('h2', null, 'Reporte'),
    h('p', { class: 'lede' }, 'Un documento autónomo con el escenario, las mediciones, el modelo, las iteraciones, el resultado y sus limitaciones.'));
  root.append(intro);

  if (!model) {
    intro.append(alert('pending', 'Todavía no hay nada que reportar', h('p', null, 'Ajuste un modelo para generar el reporte.')));
    return;
  }

  const calc = calculations.find((c) => c.id === app.selectedCalcId) ?? calculations.find((c) => c.modelId === model.id) ?? null;
  const calcModel = calc ? ctx.models.find((m) => m.id === calc.modelId) ?? model : model;
  if (stale) intro.append(alert('warn', 'El modelo está desactualizado', h('p', null, 'El reporte describirá el último ajuste, que ya no coincide con las mediciones actuales.')));
  if (!calc) intro.append(alert('info', 'Aún no hay un cálculo de Müller', h('p', null, 'El reporte incluirá el modelo y marcará el cálculo como pendiente.')));

  const frameHost = h('div', { style: 'margin-top:16px' });
  const gen = button('Generar vista previa', { variant: 'primary' });
  let html = null;
  const dl = button('Descargar reporte (.html)', { disabled: true });
  const pr = button('Imprimir o guardar como PDF', { disabled: true });

  gen.addEventListener('click', async () => {
    gen.classList.add('busy');
    try {
      const spec = await chartSpec({
        scenario: { ...sc, threshold: calc?.threshold ?? sc.threshold }, model: calcModel,
        measurements: calcModel.points.map(([x, y]) => ({ loadValue: x, metricValue: y })),
        root: calc && calc.root != null ? { x: calc.root, validated: !!calc.assessment?.valid_threshold } : null,
      });
      const chartImage = await chartToImage(spec);
      html = buildReportHtml({ scenario: sc, model: calcModel, calculation: calc, chartImage });
      const frame = h('iframe', { class: 'report', title: 'Vista previa del reporte', sandbox: 'allow-modals allow-same-origin' });
      frame.srcdoc = html;
      frameHost.replaceChildren(frame);
      dl.disabled = false;
      pr.disabled = false;
      pr.onclick = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); };
    } catch (err) {
      frameHost.replaceChildren(alert('error', 'No se pudo generar el reporte', h('p', null, err.message)));
    } finally {
      gen.classList.remove('busy');
    }
  });
  dl.addEventListener('click', () => {
    if (!html) return;
    download(`informe-${slug(sc.name)}-${dateStamp()}.html`, html, 'text/html');
    toast('Reporte descargado.');
  });

  intro.append(h('div', { class: 'row' }, gen, dl, pr), frameHost);
}
