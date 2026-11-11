// Fondo: lluvia de código muy tenue (canvas). Se pausa si la pestaña está oculta y se queda
// estática con «reducir movimiento». Es decorativa: aria-hidden y sin eventos de puntero.
const GLYPHS = '01{}[]()<>/\;=+-*&|^~#$%0123456789abcdefABCDEFλμρσΣ∂∫≈≤≥'.split('');
const SIZE = 16;
const FRAME_MS = 60; // ~16 fps: suficiente y barato

export function startRain(canvas = document.getElementById('rain')) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let cols = 0, drops = [], speeds = [], timer = null, w = 0, h = 0;

  const resize = () => {
    w = canvas.width = Math.max(1, innerWidth);
    h = canvas.height = Math.max(1, innerHeight);
    cols = Math.ceil(w / SIZE);
    drops = Array.from({ length: cols }, () => Math.random() * -(h / SIZE));
    speeds = Array.from({ length: cols }, () => 0.35 + Math.random() * 0.65);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${SIZE - 2}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  };

  const frame = () => {
    ctx.globalCompositeOperation = 'destination-out'; // desvanece la estela sin tapar el fondo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < cols; i++) {
      const y = drops[i] * SIZE;
      if (y > 0) {
        ctx.fillStyle = Math.random() < 0.04 ? 'rgba(160, 235, 255, 0.55)' : 'rgba(53, 208, 255, 0.4)';
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], i * SIZE, y);
      }
      drops[i] += speeds[i];
      if (y > h && Math.random() > 0.975) drops[i] = Math.random() * -20;
    }
  };

  const run = () => { if (!timer && !still) timer = setInterval(frame, FRAME_MS); };
  const stop = () => { clearInterval(timer); timer = null; };
  resize();
  if (still) for (let i = 0; i < 40; i++) frame(); // una imagen fija, sin animación
  addEventListener('resize', () => { resize(); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
  run();
}
