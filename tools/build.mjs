// Genera dist/index.html: UN solo archivo (HTML + CSS + JS + Chart.js) que se abre con doble clic
// o se publica en cualquier hosting estático. Uso: node tools/build.mjs   (requiere esbuild)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fe = path.join(root, 'frontend');
const out = await build({ entryPoints: [path.join(fe, 'js/app.js')], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const css = ['styles.css', 'components.css'].map((f) => fs.readFileSync(path.join(fe, 'css', f), 'utf8')).join('\n');
const chart = fs.readFileSync(path.join(fe, 'assets/vendor/chart.umd.js'), 'utf8');
let html = fs.readFileSync(path.join(fe, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="css\/styles.css">\s*<link rel="stylesheet" href="css\/components.css">/, () => `<style>${css}</style>`)
  .replace(/<script src="assets\/vendor\/chart.umd.js"><\/script>/, () => `<script>${safe(chart)}</script>`)
  .replace(/<script type="module" src="js\/app.js"><\/script>/, () => `<script>${safe(out.outputFiles[0].text)}</script>`);
if (/src="(js|assets)\//.test(html) || /href="css\//.test(html)) throw new Error('Quedaron referencias sin incluir');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log('dist/index.html', (html.length / 1024).toFixed(0), 'KB');
