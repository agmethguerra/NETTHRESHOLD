// Generación del reporte (sección 15). Documento HTML autónomo y apto para imprimir o guardar como PDF.
import { conditionsText } from './scenarioSpec.js';
import { escapeHtml as e, fmtComplex, fmtDate, fmtNum, networkLabel, sourceLabel, statisticLabel } from './util.js';

const CSS = `
 body{font:14px/1.55 'Segoe UI',system-ui,sans-serif;color:#12202F;max-width:900px;margin:0 auto;padding:32px 28px;}
 h1{font:700 28px/1.2 Georgia,'Iowan Old Style',serif;margin:0 0 4px}
 h2{font:700 18px/1.3 Georgia,'Iowan Old Style',serif;margin:30px 0 8px;padding-top:14px;border-top:1px solid #D5DCE3}
 table{border-collapse:collapse;width:100%;margin:8px 0;font-variant-numeric:tabular-nums}
 th,td{border-bottom:1px solid #E3E8ED;padding:5px 8px;text-align:left;vertical-align:top}
 th{font-weight:600;color:#44566A;background:#F4F6F8}
 td.n,th.n{text-align:right}
 .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
 .kv td:first-child{width:34%;color:#44566A}
 .big{font:700 44px/1.1 Georgia,serif;margin:6px 0}
 .note{border-left:3px solid #B45309;background:#FDF6EC;padding:8px 12px;margin:10px 0}
 .ok{border-left-color:#1B7F4B;background:#EEF8F2}.bad{border-left-color:#B42318;background:#FDF0EE}
 img{max-width:100%;height:auto}
 .muted{color:#5B6B7C} small{color:#5B6B7C}
 @media print{body{padding:0}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}`;

const kv = (rows) => `<table class="kv">${rows.map(([k, v]) => `<tr><td>${e(k)}</td><td>${v}</td></tr>`).join('')}</table>`;

/**
 * @param d { scenario, model, calculation, chartImage, appVersion }
 * model y calculation pueden ser null (reporte parcial).
 */
export function buildReportHtml(d) {
  const { scenario: s, model: m, calculation: c } = d;
  const parts = [];
  const unit = s.loadUnit;
  const synthetic = s.dataSource === 'synthetic';

  parts.push(`<h1>${e(s.name)}</h1><div class="muted">Informe de análisis de saturación · NetThreshold · generado el ${e(fmtDate(new Date().toISOString()))}</div>`);
  if (synthetic) parts.push('<div class="note"><strong>Datos simulados.</strong> Este análisis usa datos sintéticos y no describe una red real.</div>');

  parts.push('<h2>1. Escenario</h2>' + kv([
    ['Descripción', e(s.description || '—')],
    ['Tipo de red', e(networkLabel(s.networkType))],
    ['Objetivo', 'Estimar la carga a la que el modelo ajustado alcanza el umbral de servicio definido.'],
    ['Variable de carga', `${e(s.loadVariable)} (${e(unit)})`],
    ['Métrica', `Latencia / tiempo de respuesta, ${e(statisticLabel(s.statistic))} (${e(s.metricUnit)})`],
    ['Umbral', `${fmtNum(s.threshold)} ${e(s.metricUnit)}`],
    ['Origen de los datos', e(sourceLabel(s.dataSource))],
    ['Periodo de medición', e(s.conditions?.period || '—')],
    ['Condiciones de medición', e(conditionsText(s.conditions) || '—')],
  ]));

  if (!m) {
    parts.push('<div class="note">Este escenario aún no tiene un modelo ajustado; no hay resultados que informar.</div>');
    return wrap(s, parts);
  }

  const pts = m.points ?? [];
  parts.push(`<h2>2. Mediciones utilizadas</h2><p class="muted">${pts.length} mediciones, ${m.distinctLevels} niveles de carga distintos. Rango calibrado: ${fmtNum(m.xMin)} a ${fmtNum(m.xMax)} ${e(unit)}.</p>`);
  parts.push(`<table><thead><tr><th class="n">#</th><th class="n">Carga (${e(unit)})</th><th class="n">Latencia (${e(s.metricUnit)})</th></tr></thead><tbody>${
    pts.map((p, i) => `<tr><td class="n">${i + 1}</td><td class="n">${fmtNum(p[0])}</td><td class="n">${fmtNum(p[1])}</td></tr>`).join('')}</tbody></table>`);

  parts.push('<h2>3. Modelo y calidad del ajuste</h2>' + kv([
    ['Tipo de modelo', 'Polinomio cúbico por mínimos cuadrados'],
    ['Ecuación', `<span class="mono">${e(m.equation)}</span>`],
    ['Coeficientes', `<span class="mono">${m.coefficients.map((v, i) => `a${i} = ${fmtNum(v, 8)}`).map(e).join('<br>')}</span>`],
    ['RMSE', `${fmtNum(m.rmse)} ${e(s.metricUnit)}`],
    ['R²', m.r2 === null ? 'No definido' : fmtNum(m.r2, 5)],
    ['Ajustado el', e(fmtDate(m.createdAt))],
  ]));
  if (m.warnings?.length) parts.push(`<div class="note"><strong>Advertencias del ajuste</strong><ul>${m.warnings.map((w) => `<li>${e(w)}</li>`).join('')}</ul></div>`);
  if (d.chartImage) parts.push(`<p><img alt="Mediciones, curva ajustada, umbral y carga estimada" src="${d.chartImage}"></p>`);
  parts.push('<p class="muted">RMSE y R² no demuestran por sí solos que el modelo represente la red: debe revisarse la forma de la curva, la distribución de las mediciones y el rango calibrado.</p>');

  if (!c) {
    parts.push('<div class="note">Aún no se ha ejecutado el método de Müller para este modelo.</div>');
    return wrap(s, parts);
  }

  parts.push('<h2>4. Método de Müller</h2>' + kv([
    ['Función', `g(λ) = R(λ) − ${fmtNum(c.threshold)} = 0`],
    ['Aproximaciones iniciales', `x₀ = ${fmtNum(c.x0)}, x₁ = ${fmtNum(c.x1)}, x₂ = ${fmtNum(c.x2)}`],
    ['Tolerancia del paso', fmtNum(c.stepTolerance)],
    ['Tolerancia del residuo', fmtNum(c.residualTolerance)],
    ['Máximo de iteraciones', c.maxIterations],
    ['Ejecutado el', e(fmtDate(c.createdAt))],
  ]));
  parts.push(`<table class="mono"><thead><tr><th class="n">k</th><th class="n">x₀</th><th class="n">x₁</th><th class="n">x₂</th><th class="n">discriminante</th><th class="n">x₃</th><th class="n">paso</th><th class="n">residuo</th></tr></thead><tbody>${
    (c.iterations ?? []).map((it) => `<tr><td class="n">${it.iteration}</td><td class="n">${fmtComplex(it.x0, 7)}</td><td class="n">${fmtComplex(it.x1, 7)}</td><td class="n">${fmtComplex(it.x2, 7)}</td><td class="n">${fmtComplex(it.discriminant, 5)}</td><td class="n">${fmtComplex(it.x3, 9)}</td><td class="n">${fmtNum(it.step, 4)}</td><td class="n">${fmtNum(it.residual, 4)}</td></tr>`).join('')}</tbody></table>`);

  const a = c.assessment ?? {};
  const ok = !!a.valid_threshold;
  parts.push('<h2>5. Resultado</h2>');
  if (c.root !== null && c.root !== undefined) {
    parts.push(`<div class="big">${fmtNum(c.root)} <span style="font-size:20px">${e(unit)}</span></div>`);
  } else {
    parts.push('<div class="big">Sin estimación</div>');
  }
  parts.push(`<div class="note ${ok ? 'ok' : c.status === 'converged' ? '' : 'bad'}"><strong>${ok ? 'Umbral estimado y validado dentro del rango calibrado.' : 'La estimación no está validada.'}</strong> ${e(c.message ?? '')}</div>`);
  parts.push(kv([
    ['Estado del cálculo', e(c.status)],
    ['Iteraciones', c.iterationsCount ?? (c.iterations ?? []).length],
    ['Residuo |g(x)|', fmtNum(c.residual)],
    ['Latencia del modelo en la raíz', c.metricAtRoot === null || c.metricAtRoot === undefined ? '—' : `${fmtNum(c.metricAtRoot)} ${e(s.metricUnit)}`],
  ]));
  parts.push('<p><strong>Interpretación (tres preguntas distintas)</strong></p><ol>' + [
    `¿Müller convergió numéricamente? ${a.numerically_converged ? 'Sí.' : 'No.'}`,
    `¿La raíz es real, no negativa y pertenece al rango calibrado? ${ok ? 'Sí.' : 'No (' + [a.root_is_real === false ? 'raíz compleja' : '', a.root_non_negative === false ? 'raíz negativa' : '', a.within_calibrated_range === false ? 'fuera del rango' : ''].filter(Boolean).join(', ') + ').'}`,
    `¿El modelo representa razonablemente las mediciones? Requiere criterio del analista: RMSE ${fmtNum(m.rmse)} ${e(s.metricUnit)}, R² ${m.r2 === null ? 'no definido' : fmtNum(m.r2, 4)}; revise la gráfica y los residuos.`,
  ].map((t) => `<li>${t}</li>`).join('') + '</ol>');
  if (c.warnings?.length) parts.push(`<div class="note"><strong>Advertencias</strong><ul>${c.warnings.map((w) => `<li>${e(w)}</li>`).join('')}</ul></div>`);
  if (c.referenceRoots) {
    parts.push(`<p class="muted">Verificación independiente (raíces algebraicas del modelo): ${c.referenceRoots.real.length ? c.referenceRoots.real.map((r) => fmtNum(r, 7)).join(', ') : 'sin raíces reales'}${c.referenceRoots.complex.length ? `; ${c.referenceRoots.complex.length} compleja(s)` : ''}.</p>`);
  }

  parts.push('<h2>6. Limitaciones</h2><p>La estimación representa el resultado del modelo ajustado a las mediciones suministradas y a los parámetros seleccionados. No constituye una garantía de capacidad, disponibilidad o comportamiento futuro de la red.</p><p class="muted">El modelo cúbico es una curva empírica: no modela cuellos de botella múltiples ni protocolos, y su extrapolación fuera del rango calibrado no está validada. Las mediciones deben contrastarse con una prueba de carga independiente.</p>');
  return wrap(s, parts);
}

function wrap(s, parts) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(s.name)} · Informe NetThreshold</title><style>${CSS}</style></head><body>${parts.join('\n')}</body></html>`;
}
