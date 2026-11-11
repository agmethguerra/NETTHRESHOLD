# NetThreshold

Herramienta web que responde una pregunta simple: **¿hasta cuánta carga aguanta una red antes de que el servicio se vuelva demasiado lento?** Ajusta una curva a las mediciones y calcula, con el método de Müller, la carga exacta en la que se supera el límite que usted define.

## Cómo probarla (sin instalar nada)

1. Abra el archivo **`NetThreshold.html`** con doble clic (Chrome, Edge o Firefox actuales). También está en `dist/index.html`.
2. En el inicio, pulse **«▶ Iniciar medición»** (necesita internet). La herramienta mide la conexión real del dispositivo en cerca de un minuto, aumentando la carga poco a poco, y al final dice hasta dónde responde bien y cuántas personas aguantaría, en palabras simples. Si solo quiere ver cómo funciona sin medir, pulse **«Ver demostración con datos simulados»**.
3. Si desea recorrerlo con calma, use los pasos de la izquierda: Escenario → Datos → Modelado → Müller → Resultados → Reporte. También puede crear su propio escenario, escribir mediciones o importar un CSV (ejemplo en `ejemplos/mediciones_ejemplo.csv`).

No hay usuario ni contraseña. No requiere Python, Node, internet ni servidor: todo se calcula dentro del navegador.

## Módulos (versión 1.2)

- **Medición de red** (inicio): mide la conexión, da el veredicto con semáforo y medidor, y permite ver la demostración simulada.
- **Análisis avanzado**: escenarios, datos manuales o CSV, modelado, Müller, resultados y reporte.
- Identidad v1.3: consola de red futurista en azules y cian eléctrico (solo tema oscuro). El velocímetro del inicio muestra los Mbps en vivo.

## Novedades de la versión 1.5

- Formulario de escenario guiado: todo se elige de listas o tarjetas, la unidad y el umbral se deducen, fechas con selector, nombre saneado, resumen en lenguaje simple y guardado bloqueado hasta que todo sea válido. Detalle en `docs/Adenda_v1.1.md`.

## Novedades de la versión 1.1

- Identidad propia: logotipo, franja con curso/universidad/autor y pantalla «Acerca de». Edite sus datos en `frontend/js/identity.js` y ejecute `node tools/build.mjs`.
- Resultado de un vistazo: semáforo y medidor de capacidad usada (carga actual editable).
- «¿Cómo lo calculó?»: la parábola de Müller dibujada paso a paso.
- Perfiles de uso (clases, videojuegos, streaming, nube, navegación), cada uno con su límite de respuesta.
- Detalle en `docs/Adenda_v1.1.md`.

## Qué mide y qué no

- Mide, desde el navegador, el tiempo de respuesta bajo carga y los Mbps logrados con 1, 2, 4… hasta 32 descargas simultáneas contra un servidor de prueba público (Cloudflare). Con esos puntos ajusta la curva y calcula con Müller el punto en que se supera el límite (150 ms por defecto, editable).
- El número de **personas** es una estimación: capacidad medida dividida entre lo que consume cada persona (se elige el uso: navegar, videollamada o video HD). El navegador no puede contar los dispositivos conectados.
- La prueba la hace un solo dispositivo y mide el camino completo hasta internet, no solo el Wi-Fi. Descarga datos (a menudo 100 MB o más en conexiones rápidas): no usar con datos móviles. Se detiene sola si ve saturación, fallos o supera 300 MB.
- Si la red es muy rápida y no llega al límite, la herramienta lo dice y da una capacidad mínima, sin inventar un número.
- Si una red institucional bloquea el servidor de prueba, se puede cambiar en «Opciones avanzadas».

## Publicarla en internet (opcional, 2 minutos)

Como es un solo archivo estático, sirve cualquier hosting gratuito:

- **Netlify Drop**: entre a app.netlify.com/drop y arrastre la carpeta `dist/`. Entrega un enlace público al instante.
- **GitHub Pages**: suba `dist/index.html` a un repositorio, active Pages (Settings → Pages) y comparta el enlace.

## Limitaciones

- Los datos se guardan en el navegador de quien usa la herramienta (IndexedDB). Otro navegador u otro equipo empieza vacío; borrar los datos del sitio los elimina. Use **Exportar respaldo** si necesita conservarlos.
- Los datos de la demostración son **simulados**; no representan una red real. Las mediciones en vivo sí son reales.
- La primera versión analiza **latencia frente a carga** con un modelo cúbico. Si el resultado cae fuera del rango medido, se avisa que es extrapolación y no se presenta como validado.
- Es una estimación a partir de los datos y del modelo, no una garantía de capacidad.
- Si algún navegador bloquea el almacenamiento al abrir el archivo directamente (algunas configuraciones de privacidad), use la versión publicada o ejecute `python3 -m http.server` dentro de `dist/` y abra `http://localhost:8000`.

## Para desarrolladores

El motor matemático existe en dos versiones equivalentes: `frontend/js/engine.js` (la que usa la aplicación) y `backend/core/` en Python/FastAPI (versión de referencia, con 75 pruebas). Ambas dan los mismos resultados.

```bash
node tools/build.mjs                       # regenera dist/index.html (requiere: npm i esbuild)
python3 -m pytest -q                       # pruebas del motor en Python
cd tests/frontend && npm install && node --test   # pruebas del navegador y la demo
```

Para usar la API de Python en lugar del motor del navegador: `pip install -r requirements.txt` y `uvicorn backend.main:app`; la interfaz sigue siendo la misma.

## Cómo se decide si un resultado es válido

Se separan tres preguntas, porque que Müller converja no basta:

1. ¿Convergió numéricamente? (paso **y** residuo por debajo de sus tolerancias)
2. ¿La raíz es real y no negativa?
3. ¿Está dentro del rango de cargas medido? Fuera de él es extrapolación y **no** se presenta como umbral validado.

Si las mediciones cambian después de ajustar, el modelo se marca como desactualizado y los cálculos anteriores quedan como historial.

## API

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Estado del servicio |
| POST | `/analysis/validate` | Valida filas y devuelve el motivo de cada rechazo |
| POST | `/model/fit` | Ajuste cúbico, RMSE, R², residuos y puntos iniciales sugeridos |
| POST | `/analysis/evaluate` | Evalúa el polinomio en una lista de cargas |
| POST | `/muller/suggest` | Sugiere tres aproximaciones iniciales |
| POST | `/muller/solve` | Ejecuta Müller y evalúa la raíz |
| POST | `/compare/methods` | Compara Müller con secante, Newton y bisección |

## Pruebas

```bash
python3 -m pytest -q                      # motor numérico y API (75 pruebas)
cd tests/frontend && npm install          # una sola vez
node --test                               # CSV e IndexedDB (11 pruebas)
node e2e.mjs                              # recorrido en Chrome; requiere el servidor activo
```

`e2e.mjs` usa `/usr/bin/google-chrome`; ajuste la ruta en el archivo si el suyo es otro.

## Estructura

```
backend/   api/ (rutas), core/ (regression, muller, methods, validation, metrics), schemas/
frontend/  index.html, css/, js/ (módulos y views/), assets/vendor/chart.umd.js
tests/     pruebas de Python; frontend/ con pruebas de Node y e2e
```

## Límites conocidos

- Solo latencia como métrica y un único modelo (cúbico) en esta primera versión.
- El cúbico es una curva empírica: no representa colas ni cuellos de botella y no debe usarse para extrapolar.
- Con exactamente cuatro niveles de carga el ajuste es exacto y no permite juzgar su calidad.
