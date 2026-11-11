// Velocímetro SVG reutilizable: arco de 270°, escala automática, aguja con inercia y brillo.
const CX = 200, CY = 190, R = 140;
const pt = (deg, r = R) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)];
const arc = (f0, f1) => {
  const [x0, y0] = pt(135 + 270 * f0), [x1, y1] = pt(135 + 270 * f1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 ${(f1 - f0) * 270 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
const NICE = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
export const niceMax = (v) => NICE.find((n) => n >= v * 1.1) ?? Math.ceil(v * 1.2);
const fmt = (v) => Number(v.toPrecision(3)).toLocaleString('es-CO');

/** zones: [[desde, hasta, color]] como fracciones de la escala (modo medidor de capacidad). */
export function createGauge({ unit = '', zones = null, label = 'Medidor' } = {}) {
  const el = document.createElement('div');
  el.className = 'gauge';
  const id = `g${Math.random().toString(36).slice(2, 7)}`;
  const body = zones
    ? zones.map(([a, b, c]) => `<path d="${arc(a, b)}" fill="none" stroke="${c}" stroke-width="16" opacity=".9"/>`).join('')
    : `<path class="g-prog" d="${arc(0, 1)}" pathLength="1" fill="none" stroke="url(#${id})" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 1"/>`;
  el.innerHTML = `<svg viewBox="0 0 400 300" role="img" aria-label="${label}"><defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#3b82ff"/><stop offset="1" stop-color="#35d0ff"/></linearGradient></defs>
<circle cx="${CX}" cy="${CY}" r="172" fill="none" stroke="var(--line)" stroke-dasharray="2 7"/>
<path d="${arc(0, 1)}" fill="none" stroke="var(--track)" stroke-width="16" stroke-linecap="round"/>${body}
<g class="g-ticks"></g><g class="g-needle"><polygon points="195.5,190 204.5,190 200,66"/></g>
<circle class="g-hub" cx="${CX}" cy="${CY}" r="13"/><text class="g-val" x="200" y="252" text-anchor="middle">0</text><text class="g-unit" x="200" y="278" text-anchor="middle">${unit}</text></svg>`;
  const $ = (s) => el.querySelector(s);
  const needle = $('.g-needle'), prog = $('.g-prog'), val = $('.g-val'), ticks = $('.g-ticks');
  let curMax = null;
  const drawTicks = (max) => {
    let t = '';
    for (let i = 0; i <= 40; i++) {
      const major = i % 10 === 0, a = 135 + (270 * i) / 40, [x0, y0] = pt(a, R - 24), [x1, y1] = pt(a, R - (major ? 40 : 32));
      t += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--ink-2)" stroke-width="${major ? 2.2 : 1}" opacity="${major ? 1 : 0.5}"/>`;
      if (major) { const [lx, ly] = pt(a, R - 58); t += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" class="g-lbl">${fmt((max * i) / 40)}</text>`; }
    }
    ticks.innerHTML = t;
  };
  const update = (value, { max = 100, text } = {}) => {
    if (max !== curMax) { drawTicks(max); curMax = max; }
    const f = Math.max(0, Math.min(1, value / max));
    needle.style.transform = `rotate(${270 * f - 135}deg)`;
    if (prog) { prog.setAttribute('stroke-dasharray', `${f} 1`); prog.style.opacity = f > 0 ? 1 : 0; }
    val.textContent = text ?? fmt(value);
  };
  update(0, { max: 100 });
  return { el, update };
}
