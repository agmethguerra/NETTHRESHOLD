// Humo: abre dist/index.html en jsdom (sin servidor), pulsa la demo y comprueba el resultado.
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const html = fs.readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) { w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = () => null; w.matchMedia = () => ({ matches: false, addEventListener() {} }); } });
const w = dom.window;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(400);
const txt = () => w.document.body.textContent;
console.log('panel:', txt().includes('¿cuántas personas aguanta?'), '| modo local:', txt().includes('sin servidor'));
[...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('demostración con datos simulados')).click();
await wait(1500);
console.log('resultado:', txt().includes('En términos simples'), '| 529:', /10[0-9]/.test(txt()) && txt().includes("personas"), '| validado:', txt().includes('Umbral validado'));
process.exit(0);
