// Recorrido de extremo a extremo en Chrome contra el servidor local (uvicorn en :8000).
// Uso: node e2e.mjs [directorio-de-capturas]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const shots = process.argv[2] ?? '/tmp/nt-shots';
fs.mkdirSync(shots, { recursive: true });
const BASE = 'http://127.0.0.1:8000';
const results = [];
const errors = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());

const text = () => page.evaluate(() => document.body.innerText);
const clickText = async (label, sel = 'button, a') => {
  const h = await page.evaluateHandle((l, s) => [...document.querySelectorAll(s)].find((e) => {
    const t = e.innerText.trim();
    return (s === 'nav a' ? t.endsWith(l) : t === l) && !e.disabled;
  }), label, sel);
  const el = h.asElement();
  if (!el) throw new Error(`No se encontró «${label}»`);
  await el.click();
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitText = (t, timeout = 8000) => page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t);
const shot = (n) => page.screenshot({ path: path.join(shots, n + '.png'), fullPage: true });

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await waitText('Escenarios de análisis');
  ok('Carga el panel de escenarios', true);
  await waitText('Backend conectado');
  ok('Detecta el backend', true);
  await shot('01-dashboard');

  // Ejemplo simulado
  await clickText('Cargar ejemplo simulado');
  await waitText('Mediciones registradas');
  let t = await text();
  ok('El ejemplo crea 22 mediciones', /22\s+mediciones/.test(t) && t.includes('11') );
  ok('Etiqueta datos simulados', t.includes('Datos simulados'));
  await shot('02-datos');

  // Modelado
  await clickText('Continuar al modelado');
  await waitText('Modelo cúbico de latencia');
  await clickText('Ajustar modelo');
  await waitText('Ecuación y calidad del ajuste');
  t = await text();
  ok('Muestra ecuación y RMSE', t.includes('R(λ)') && t.includes('RMSE'));
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2);
  await wait(600);
  const canvasInfo = await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, chart: !!window.Chart.getChart(c) })));
  ok('Dibuja las dos gráficas', canvasInfo.length === 2 && canvasInfo.every((c) => c.chart && c.w > 100));
  await shot('03-modelado');

  // Müller
  await clickText('Continuar a Müller');
  await waitText('Tres aproximaciones iniciales');
  const vals = await page.$$eval('fieldset input[type=number]', (els) => els.map((e) => Number(e.value)));
  ok('Puntos iniciales sugeridos y distintos', vals.length === 3 && new Set(vals).size === 3, vals.map((v) => v.toFixed(1)).join(', '));
  await shot('04-muller');
  await clickText('Ejecutar Müller');
  await waitText('Curva, umbral y carga estimada');
  await wait(600);
  t = await text();
  ok('Müller converge', t.includes('Convergió') || t.includes('Convergencia numérica alcanzada'));
  ok('Umbral validado', t.includes('Umbral validado dentro del rango calibrado'));
  const hero = await page.$eval('.hero-value', (e) => e.innerText);
  const rootVal = parseFloat(hero.replace(/[^\d.,]/g, '').replace(',', '.'));
  ok('La raíz es plausible (≈ 520–540 req/s para umbral 30 ms)', rootVal > 500 && rootVal < 560, hero.replace(/\n/g, ' '));
  await shot('05-resultados');

  // Comparación
  await clickText('Comparar con otros métodos');
  await waitText('Bisección');
  t = await text();
  ok('Compara 4 métodos', ['Müller', 'Secante', 'Newton-Raphson', 'Bisección'].every((m) => t.includes(m)));
  await shot('06-comparacion');

  // Reporte
  await clickText('Generar reporte');
  await waitText('Generar vista previa');
  await clickText('Generar vista previa');
  await page.waitForSelector('iframe.report');
  await wait(800);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const reportText = await frame.evaluate(() => document.body.innerText);
  ok('El reporte incluye secciones y advertencia de datos simulados', reportText.includes('Datos simulados') && reportText.includes('Método de Müller') && reportText.includes('Limitaciones'));
  ok('El reporte incluye la gráfica como imagen', await frame.evaluate(() => !!document.querySelector('img')?.src.startsWith('data:image/png')));
  await shot('07-reporte');

  // Cambiar mediciones -> modelo desactualizado
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await waitText('Escenarios de análisis');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Abrir'));
  await clickText('Abrir');
  await waitText('Mediciones registradas');
  await page.type('#load-input', '640');
  const inputs = await page.$$('form.inline-form input[type=number]');
  await inputs[1].type('90');
  await clickText('Agregar');
  await waitText('quedó desactualizado');
  ok('Agregar una medición marca el modelo como desactualizado', true);
  await clickText('Modelado', 'nav a');
  await waitText('Este modelo quedó desactualizado');
  ok('Modelado avisa del modelo desactualizado', true);

  // CSV con filas inválidas
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await waitText('Escenarios de análisis');
  await clickText('Nuevo escenario');
  await page.waitForSelector('input[type=text]');
  ok('Sin texto «null» en el formulario de nuevo escenario', !/\bnull\b/.test(await text()));
  const textInputs = await page.$$('input[type=text]');
  await textInputs[0].type('CSV de prueba');
  await textInputs[1].type('Solicitudes por segundo');
  await textInputs[2].type('req/s');
  await page.type('input[type=number]', '100');
  await clickText('Crear escenario');
  await waitText('Importar desde CSV');
  const csv = 'load_value,latency_ms,notes\n10,12.5,ok\n20,15.2,ok\n30,abc,mal\n,40,sin carga\n40,35.4,ok\n50,58.1,ok\n60,-5,neg\n70,98.0,ok\n80,150.2,ok\n';
  fs.writeFileSync(path.join(shots, 'prueba.csv'), csv);
  const fileInput = await page.$('input[type=file][aria-label="Archivo CSV"]');
  await fileInput.uploadFile(path.join(shots, 'prueba.csv'));
  await waitText('filas de datos');
  t = await text();
  ok('El CSV informa 6 válidas y 3 rechazadas', /6\s+válidas/.test(t) && /3\s+rechazadas/.test(t));
  ok('Las filas rechazadas indican el motivo', t.includes('no numérico') && t.includes('faltante') && t.includes('negativa'));
  await shot('08-csv');
  await clickText('Importar 6 fila(s) válida(s)');
  await waitText('Mediciones registradas');
  t = await text();
  ok('Importa solo las filas válidas', /6\s+mediciones/.test(t));
  await clickText('Continuar al modelado');
  await waitText('Modelo cúbico de latencia');
  await clickText('Ajustar modelo');
  await waitText('Ecuación y calidad del ajuste');
  ok('Ajusta con datos importados', true);

  // Persistencia tras recargar
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Modelo cúbico de latencia'); // la ruta se conserva tras recargar
  await page.evaluate(() => { location.hash = '#/'; });
  await waitText('Escenarios de análisis');
  t = await text();
  ok('Los datos persisten tras recargar (IndexedDB)', t.includes('CSV de prueba') && t.includes('Ejemplo sintético'));

  // Móvil
  await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2, isMobile: true });
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await waitText('Escenarios de análisis');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Abrir'));
  await clickText('Abrir');
  await waitText('Mediciones registradas');
  const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, top: document.querySelector('.topbar').getBoundingClientRect().width, inner: window.innerWidth }));
  ok('Sin desbordamiento horizontal en móvil (390 px)', widths.doc <= 391 && widths.top <= 391 && widths.inner <= 391, JSON.stringify(widths));
  ok('Sin texto «null» suelto en la pantalla de datos', !/\bnull\b/.test(await text()));
  await shot('09-movil');

  // Modo oscuro
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await waitText('Escenarios de análisis');
  await page.evaluate(() => { [...document.querySelectorAll('h3 a')].find((a) => a.innerText.includes('Ejemplo sintético')).click(); });
  await waitText('Mediciones registradas');
  await clickText('Resultados', 'nav a');
  await waitText('Curva, umbral y carga estimada');
  await wait(600);
  await shot('10-oscuro');
} catch (err) {
  ok('Recorrido sin interrupciones', false, err.message);
  await shot('error').catch(() => {});
  console.log((await text().catch(() => '')).slice(0, 800));
}

ok('Sin errores de consola ni excepciones', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
