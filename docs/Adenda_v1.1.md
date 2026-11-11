# NetThreshold — Adenda v1.1 a la documentación técnica

Fecha: 10 de noviembre de 2026. Complementa la versión 1.0 (las secciones no mencionadas aquí no cambian).

## Requisitos funcionales nuevos
| Código | Requisito |
|---|---|
| RF-23 | La aplicación tendrá identidad visual propia: logotipo, paleta única, franja con curso, universidad y autor, y pantalla «Acerca de». Los textos se editan en un solo archivo (`frontend/js/identity.js`). |
| RF-24 | El resultado mostrará un semáforo (verde < 70 %, amarillo < 100 %, rojo ≥ 100 %, gris si el umbral no está validado) y un medidor de capacidad usada = carga actual ÷ raíz estimada. La carga actual es editable. |
| RF-25 | La sección «¿Cómo lo calculó?» dibujará, iteración por iteración, la parábola de Müller sobre la curva modelo − umbral, con control manual y reproducción automática. |
| RF-26 | La medición en vivo ofrecerá perfiles de uso (clases en línea 150 ms, videojuegos 60 ms, streaming 400 ms, trabajo en la nube 200 ms, navegación 300 ms), cada uno con su límite de respuesta y consumo por persona; el límite sigue siendo editable. |

## Reglas y requisitos asociados
- RN-16: el semáforo gris (sin validar) tiene prioridad: una raíz fuera del rango calibrado nunca se muestra como verde o amarilla.
- RN-17: los límites y consumos por perfil son valores orientativos, no normas; se muestran al usuario y pueden cambiarse.
- RNF-13: la interfaz debe ser utilizable en pantallas de teléfono (diseño adaptable).

## Exclusiones y decisiones
- El historial comparativo de mediciones por lugar y hora de la universidad **no forma parte de la herramienta**: se prepara aparte, solo para la sustentación, con escenarios exportados.
- Idioma inglés y sombreado de zonas «segura/peligro» en la gráfica principal quedan como ampliación futura.

## Pruebas nuevas
Se verifica por prueba de humo (jsdom) que, tras la demostración, aparecen franja, logotipo, semáforo, medidor, explicación y pantalla «Acerca de». Pruebas existentes: 17 de navegador, sin fallos.

## Cambio v1.2: módulos e identidad
- RF-27: la aplicación se divide en dos módulos con navegación superior: **Medición de red** (inicio) y **Análisis avanzado** (escenarios, datos, modelado, Müller, resultados y reporte).
- RF-28: la identidad visual usa azul noche casi negro (#060b16) con blanco LED (#f2f7ff); se elimina el tema claro. El reporte exportado conserva fondo claro para impresión.

## Cambio v1.3: refactorización visual
- RF-29: el inicio presenta un velocímetro de red en vivo (arco de 270°, escala automática, aguja animada) que muestra los Mbps durante la prueba, con lecturas de respuesta sin carga, respuesta bajo carga, descargas simultáneas y datos usados.
- RF-30: el medidor de capacidad usada de Resultados reutiliza el mismo componente (`frontend/js/gauge.js`) con zonas verde/amarilla/roja.
- RF-31: identidad visual «consola de red»: azul profundo y cian eléctrico, retícula de fondo, paneles con esquinas de visor, tipografía técnica del sistema y logotipo hexagonal.

## Cambio v1.4: configuración simplificada
- RF-32: el paso de Müller ofrece un selector de precisión (Rápida 1e-4, Normal 1e-8, Alta 1e-12, Personalizada) que fija ambas tolerancias y 100 iteraciones; los puntos iniciales se sugieren automáticamente y el botón es «Calcular umbral».
- RF-33: las tres aproximaciones, las tolerancias y el máximo de iteraciones siguen disponibles en «Opciones avanzadas».
- RF-34: el formulario de escenario incluye un perfil de uso que rellena el umbral (editable).

## Cambio v1.5: captura guiada del escenario (sin datos libres)
- RF-35: el formulario de escenario solo admite valores de catálogos cerrados: tipo de red, origen de datos, variable de carga, estadístico, perfil de uso, herramienta, protocolo, destino y tamaño de paquetes. Los catálogos y reglas viven en `frontend/js/scenarioSpec.js`.
- RF-36: la unidad de carga se deduce de la variable elegida (personas, descargas, req/s, conexiones, Mbps, pps) y la métrica es siempre latencia en ms; ninguna se escribe a mano.
- RF-37: el umbral sale del perfil de uso; solo «Otro límite» se escribe, como entero de 1 a 2000 ms (campo numérico filtrado y deslizador).
- RF-38: el periodo se elige con selectores de fecha (no futura) y hora (fin posterior al inicio); con datos simulados no aplica.
- RF-39: el nombre se sanea al escribir (3–80 caracteres, con letras, sin repetirse); vacío usa un nombre sugerido. Cada opción muestra una explicación y «¿No sabe cuál elegir?».
- RF-40: un resumen en lenguaje simple confirma lo que se analizará; el botón de guardar permanece deshabilitado y el formulario indica qué falta o corregir.
- Los escenarios de versiones anteriores se siguen abriendo y guardando (valores previos se conservan).
- Pruebas: `tests/frontend/scenarioSpec.test.js` (15 casos).

## Cambio v1.6: aprovechamiento del ancho y línea de tiempo
- RF-41: el contenido usa hasta 96 % del ancho (máx. 1800 px), con letra base de 16,5 px y títulos, botones y campos más grandes.
- RF-42: los pasos del análisis se muestran como línea de tiempo vertical (círculos conectados por una línea; verde = completo, aro cian = paso actual); se elimina la forma hexagonal en pasos.

## Cambio v1.7: logotipo y simulador de Müller
- RF-43: nuevo logotipo (lupa sobre curva de latencia con el punto de umbral) incrustado en el archivo único; sirve también de favicon. Marca del encabezado: «NetThreshold» en una sola palabra (Net en blanco, Threshold en cian) con subtítulo «Umbral de saturación de redes».
- RF-44: la gráfica de «¿Cómo lo calculó?» se ajusta al marco (proporción fija, recorte interno de las curvas), y el botón Reproducir avanza las iteraciones automáticamente y se convierte en Pausar.

## Cambio v1.8: fondo de lluvia de código
- RF-45: se elimina la retícula de fondo y se reemplaza por una lluvia de código muy tenue (canvas fijo detrás del contenido, opacidad ≈ 28 %, ~16 fps). Es decorativa (`aria-hidden`), se pausa con la pestaña oculta, queda estática con «reducir movimiento» y no se imprime. Código en `frontend/js/rain.js`.
