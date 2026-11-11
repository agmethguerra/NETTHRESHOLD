// Semáforo, medidor de capacidad usada y explicación visual del método de Müller. Solo números en el SVG.
import { createGauge } from '../gauge.js';
import { alert, button, h } from '../ui.js';
import { fmtNum, polyEval } from '../util.js';

const svgBox = (cls, html) => { const d = h('div', { class: cls }); d.innerHTML = html; return d; };

/** Nivel del semáforo según la fracción de la carga límite que se está usando. */
export function trafficLevel(pct, validated) {
  if (!validated) return { key: 'gray', label: 'Sin validar', text: 'El umbral no está validado: mida a cargas mayores antes de decidir.' };
  if (pct < 70) return { key: 'green', label: 'Holgada', text: 'La red va holgada.' };
  if (pct < 100) return { key: 'amber', label: 'Cerca del límite', text: 'La red se acerca a su límite.' };
  return { key: 'red', label: 'Saturada', text: 'La carga ya supera el límite: el servicio no cumple.' };
}
const COLORS = { green: '#3ee0a0', amber: '#ffb84d', red: '#ff6b6b', gray: '#7d92b3' };

export function verdictBlock(sc, calc, model, ok) {
  const root = calc.root;
  const levels = model.points.map((p) => p[0]).sort((a, b) => a - b);
  const input = h('input', { type: 'number', min: '0', step: 'any', value: levels[levels.length >> 1], 'aria-label': 'Carga actual' });
  const out = h('div', { class: 'verdict-out' });
  const gauge = createGauge({ unit: '% de capacidad', label: 'Capacidad usada', zones: [[0, 70 / 120, '#3ee0a0'], [70 / 120, 100 / 120, '#ffb84d'], [100 / 120, 1, '#ff6b6b']] });
  const draw = () => {
    const cur = Math.max(0, Number(input.value) || 0);
    const pct = root > 0 ? (cur / root) * 100 : 0;
    const t = trafficLevel(pct, ok && root > 0);
    gauge.update(Math.min(pct, 120), { max: 120, text: `${fmtNum(pct, 3)} %` });
    const a = Math.PI * (1 - Math.min(pct, 120) / 120); // 0–120 % sobre un semicírculo
    const nx = 100 + 80 * Math.cos(a), ny = 100 - 80 * Math.sin(a);
    const lamp = (k) => `<circle cx="22" cy="${{ red: 24, amber: 62, green: 100, gray: 62 }[k]}" r="15" fill="${t.key === k || (k === 'amber' && t.key === 'gray') ? COLORS[t.key] : 'var(--rule-soft)'}"/>`;
    out.replaceChildren(
      svgBox('verdict-row', `<svg viewBox="0 0 44 124" width="120" role="img" aria-label="Semáforo: ${t.label}"><rect x="1" y="1" width="42" height="122" rx="9" fill="var(--surface)" stroke="var(--rule)"/>${lamp('red')}${lamp('amber')}${lamp('green')}</svg>`),
      gauge.el,
      h('div', { style: 'flex:1 1 220px' }, h('div', { style: `font:700 clamp(30px,4.5vw,46px)/1.1 var(--serif);color:${COLORS[t.key]}` }, t.label), h('p', { style: 'font-size:17px;margin-top:8px' }, t.text)));
  };
  input.addEventListener('input', draw); draw();
  return h('div', { class: 'verdict' }, h('h2', null, 'Estado de un vistazo'),
    h('p', { class: 'lede' }, `Capacidad usada = carga actual ÷ carga límite estimada (${fmtNum(root, 4)} ${calc.loadUnit ?? sc.loadUnit}). Verde por debajo de 70 %, amarillo hasta 100 %, rojo por encima.`),
    h('div', { class: 'field', style: 'max-width:240px' }, h('label', null, `Carga actual (${calc.loadUnit ?? sc.loadUnit})`), input), out);
}

/** «¿Cómo lo calculó?»: dibuja, paso a paso, la parábola de cada iteración sobre la curva g(x) = modelo − umbral. */
export function explainBlock(calc, model) {
  const its = (calc.iterations ?? []).filter((r) => [r.x0, r.x1, r.x2, r.x3].every((v) => typeof v === 'number'));
  if (!its.length) return null;
  const g = (x) => polyEval(model.coefficients, x) - calc.threshold;
  const xs = its.flatMap((r) => [r.x0, r.x1, r.x2, r.x3]).concat([model.xMin, model.xMax]);
  const lo = Math.min(...xs), hi = Math.max(...xs), pad = (hi - lo) * 0.08 || 1, X0 = lo - pad, X1 = hi + pad;
  const sample = Array.from({ length: 81 }, (_, i) => X0 + ((X1 - X0) * i) / 80);
  let step = 0;
  const host = h('div'), caption = h('p', { class: 'hint', 'aria-live': 'polite' });
  const draw = () => {
    const r = its[step], pts = [[r.x0, g(r.x0)], [r.x1, g(r.x1)], [r.x2, g(r.x2)]];
    const par = (x) => pts.reduce((s, [xi, yi], i) => s + yi * pts.reduce((p, [xj], j) => (j === i ? p : p * (x - xj) / (xi - xj)), 1), 0);
    const ys = sample.map(g).concat(sample.map(par).filter(Number.isFinite));
    const yl = Math.max(-calc.threshold * 0.6, Math.min(...ys)), yh = Math.min(calc.threshold * 1.2, Math.max(...ys)) || 1;
    const sx = (x) => 40 + ((x - X0) / (X1 - X0)) * 920, sy = (y) => 290 - ((y - yl) / (yh - yl || 1)) * 260;
    const path = (f) => sample.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${Math.max(-2000, Math.min(2000, sy(f(x)))).toFixed(1)}`).join('');
    const dots = pts.map(([x, y]) => `<circle cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="7" fill="var(--accent)"/>`).join('');
    const zy = sy(0).toFixed(1), rx = sx(r.x3).toFixed(1);
    host.replaceChildren(svgBox('chart svg-chart', `<svg viewBox="0 0 1000 320" role="img" aria-label="Parábola de la iteración ${r.iteration}"><defs><clipPath id="cp"><rect x="40" y="30" width="920" height="260"/></clipPath></defs><rect x="40" y="30" width="920" height="260" fill="none" stroke="var(--rule)"/><g clip-path="url(#cp)"><line x1="40" x2="960" y1="${zy}" y2="${zy}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="6 5"/><path d="${path(g)}" fill="none" stroke="var(--ink)" stroke-width="3"/><path d="${path(par)}" fill="none" stroke="#f0a030" stroke-width="3"/>${dots}<circle cx="${rx}" cy="${zy}" r="10" fill="none" stroke="var(--error)" stroke-width="3.5"/></g><text x="44" y="22" fill="var(--ink-2)" font-size="15">g(x) = modelo − umbral</text><text x="956" y="312" fill="var(--ink-2)" font-size="15" text-anchor="end">carga</text></svg>`));
    caption.textContent = `Iteración ${r.iteration} de ${its.length}: la curva clara es modelo − umbral (cruza la línea punteada en la carga buscada). Los tres puntos azules definen la parábola naranja; donde ella cruza el eje (círculo rojo, ${fmtNum(r.x3, 6)}) está la nueva aproximación.`;
    prev.disabled = step === 0; next.disabled = step === its.length - 1;
  };
  const prev = button('‹ Anterior', { size: 'sm', onclick: () => { step--; draw(); } });
  const next = button('Siguiente ›', { size: 'sm', onclick: () => { step++; draw(); } });
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; play.textContent = '▶ Reproducir'; };
  const play = button('▶ Reproducir', { size: 'sm', onclick: () => {
    if (timer) return stop();
    step = 0; draw(); play.textContent = '⏸ Pausar';
    timer = setInterval(() => { if (step >= its.length - 1 || !host.isConnected) return stop(); step++; draw(); }, 1000);
  } });
  prev.addEventListener('click', stop); next.addEventListener('click', stop);
  draw();
  return h('div', { class: 'block' }, h('h2', null, '¿Cómo lo calculó?'),
    h('p', { class: 'lede' }, 'Müller toma tres puntos de la curva, dibuja la parábola que pasa por ellos y usa el lugar donde esa parábola cruza el eje como siguiente intento. Repite hasta que el cruce ya casi no cambia.'),
    host, caption, h('div', { class: 'row' }, prev, next, play));
}
