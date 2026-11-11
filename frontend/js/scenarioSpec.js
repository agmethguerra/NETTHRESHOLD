// Reglas del formulario de escenario (v1.5): catálogos CERRADOS y validación sin DOM.
// Principio: el usuario elige de listas; lo que se puede deducir se deduce (la unidad sale de la
// variable, el umbral sale del perfil de uso) y lo que se escribe tiene límites estrictos.
import { NETWORK_TYPES, USE } from './util.js';

export const LIMITS = {
  nameMin: 3, nameMax: 80, descMax: 300, notesMax: 1000,
  thrMin: 1, thrMax: 2000, sliderMin: 10, sliderMax: 1000, sliderStep: 5,
};

// ---- Catálogos ---------------------------------------------------------------------------

/** Variable de carga ⇒ unidad fija. Cada una explica cuándo elegirla. */
export const LOAD_VARIABLES = [
  { key: 'people', label: 'Personas conectadas', unit: 'personas', when: 'Fue sumando personas o dispositivos a la red (por ejemplo 10, 20, 30…).' },
  { key: 'downloads', label: 'Descargas simultáneas', unit: 'descargas', when: 'Usó una prueba de velocidad en el navegador que abre varias descargas a la vez.' },
  { key: 'requests', label: 'Solicitudes por segundo', unit: 'req/s', when: 'Usó una herramienta de carga web (ab, wrk, JMeter…) que envía peticiones a un servidor.' },
  { key: 'connections', label: 'Conexiones simultáneas', unit: 'conexiones', when: 'Fue abriendo más sesiones o conexiones al mismo tiempo.' },
  { key: 'traffic', label: 'Tráfico ofrecido', unit: 'Mbps', when: 'Generó tráfico a una velocidad objetivo (por ejemplo iperf3 con 10, 20, 50 Mbps).' },
  { key: 'packets', label: 'Paquetes por segundo', unit: 'pps', when: 'Generó paquetes a una cadencia conocida (ping rápido, hping, generador de tráfico).' },
];

export const NETWORK_HELP = {
  lan: 'Red local cableada (Ethernet) de un edificio, aula u oficina.',
  wlan: 'Red inalámbrica (Wi-Fi) de un aula, casa u oficina.',
  wan: 'Enlace entre sedes o hacia internet, normalmente de un operador.',
  enterprise: 'Red completa de una organización: varias redes locales y enlaces juntos.',
  datacenter: 'Red interna entre servidores de un centro de datos.',
  cloud: 'Servicios en la nube: máquinas virtuales, balanceadores, etc.',
  other: 'Ninguna encaja o no está seguro. Solo describe el contexto; no cambia el cálculo.',
};
export const NETWORK_OPTIONS = NETWORK_TYPES.map((o) => (o.value === 'other' ? { ...o, label: 'Otra / no lo sé' } : o));

export const STATISTIC_OPTIONS = [
  { value: 'mean', label: 'Media (promedio)', help: 'El tiempo típico de respuesta. Es la opción más usada; elíjala si no está seguro.' },
  { value: 'median', label: 'Mediana', help: 'El valor del medio: ignora picos aislados que no representan el uso normal.' },
  { value: 'p95', label: 'Percentil 95', help: 'El tiempo que solo se supera el 5 % de las veces. Muestra el «mal día» razonable.' },
  { value: 'p99', label: 'Percentil 99', help: 'Más estricto aún: solo se supera el 1 % de las veces.' },
];
export const STATISTIC_NOUN = { mean: 'media', median: 'mediana', p95: 'percentil 95', p99: 'percentil 99', other: 'estadístico anterior' };

export const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Mediciones reales que escribiré a mano', help: 'Usted escribe cada medición en el siguiente paso.' },
  { value: 'csv', label: 'Mediciones reales en un archivo CSV', help: 'Las importará desde un archivo; la herramienta revisa cada fila.' },
  { value: 'synthetic', label: 'Datos simulados (solo para practicar)', help: 'Los informes indicarán que no corresponden a una red real.' },
];

/** Perfiles de uso: de ellos sale el umbral. «custom» deja elegir el valor con límites. */
export const PROFILES = [
  { key: 'clases', title: 'Clases y videollamadas', ms: USE.clases.ms, help: 'Voz y video en tiempo real: pasado este límite se nota el retraso al hablar.' },
  { key: 'juegos', title: 'Videojuegos en línea', ms: USE.juegos.ms, help: 'Muy sensibles al retraso: por encima de este límite el juego se siente lento.' },
  { key: 'streaming', title: 'Video en streaming', ms: USE.streaming.ms, help: 'Guarda video por adelantado, así que tolera más espera.' },
  { key: 'nube', title: 'Trabajo en la nube', ms: USE.nube.ms, help: 'Aplicaciones web, documentos compartidos y escritorios remotos.' },
  { key: 'web', title: 'Navegar y redes sociales', ms: USE.web.ms, help: 'Páginas y mensajes: se tolera más espera que en llamadas.' },
  { key: 'custom', title: 'Otro límite', ms: null, help: 'Usted elige el tiempo máximo aceptable (entre 1 y 2000 ms).' },
];

const UNKNOWN = { value: 'unknown', label: 'No lo sé / no aplica' };
export const TOOL_OPTIONS = [UNKNOWN,
  { value: 'iperf', label: 'iPerf / iPerf3' }, { value: 'ping', label: 'Ping / fping' },
  { value: 'browser', label: 'Prueba de velocidad en el navegador' }, { value: 'httpload', label: 'JMeter / ab / wrk (carga web)' },
  { value: 'other', label: 'Otra herramienta' }];
export const PROTOCOL_OPTIONS = [UNKNOWN,
  { value: 'icmp', label: 'ICMP (ping)' }, { value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }, { value: 'http', label: 'HTTP / HTTPS' }];
export const TARGET_OPTIONS = [UNKNOWN,
  { value: 'gateway', label: 'El router o puerta de enlace' }, { value: 'local', label: 'Un servidor de la red local' },
  { value: 'internet', label: 'Un servidor en internet' }, { value: 'cloud', label: 'Un servidor en la nube' }];
export const PACKET_OPTIONS = [UNKNOWN,
  { value: 'small', label: 'Pequeños (≈ 64 bytes)' }, { value: 'standard', label: 'Estándar (≈ 1500 bytes)' },
  { value: 'large', label: 'Grandes (más de 1500 bytes)' }, { value: 'mixed', label: 'Mezclados' }];

export const FIELD_LABELS = {
  name: 'Nombre', description: 'Descripción', networkType: 'Tipo de red', dataSource: 'Origen de los datos',
  loadKey: 'Variable de carga', statistic: 'Estadístico', profile: 'Para qué se usa la red', threshold: 'Límite de respuesta',
  date: 'Fecha de medición', time: 'Hora', tool: 'Herramienta', protocol: 'Protocolo', target: 'Destino', packetSize: 'Tamaño de paquetes', notes: 'Notas',
};
const ORDER = Object.keys(FIELD_LABELS);

// ---- Utilidades de texto ------------------------------------------------------------------

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n) => String(n).padStart(2, '0');
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}
const normName = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Quita caracteres no permitidos mientras se escribe (letras, números, espacios y signos comunes). */
export function sanitizeName(s) {
  return String(s ?? '').replace(/[^\p{L}\p{N} .,:;()\-_/+&'¿?¡!·]/gu, '').replace(/ {2,}/g, ' ').slice(0, LIMITS.nameMax);
}
export const sanitizeInt = (s, maxLen = 4) => String(s ?? '').replace(/\D/g, '').slice(0, maxLen);

const find = (list, key) => list.find((o) => (o.key ?? o.value) === key);
export const loadOption = (key, original = {}) => {
  if (key === 'legacy' && original.loadVariable) return { key: 'legacy', label: original.loadVariable, unit: original.loadUnit ?? '', when: 'Valor de una versión anterior; se conserva tal cual.' };
  return find(LOAD_VARIABLES, key);
};
export const profileOption = (key) => find(PROFILES, key);

// ---- Borrador ⇄ escenario ----------------------------------------------------------------

/** Convierte un escenario guardado (o vacío) en el borrador que edita el formulario. */
export function draftFromScenario(sc = {}) {
  const isNew = !sc.id;
  const c = sc.conditions ?? {};
  let loadKey = '';
  if (sc.loadKey && find(LOAD_VARIABLES, sc.loadKey)) loadKey = sc.loadKey;
  else if (sc.loadUnit || sc.loadVariable) {
    loadKey = LOAD_VARIABLES.find((v) => v.unit.toLowerCase() === String(sc.loadUnit ?? '').trim().toLowerCase())?.key ?? 'legacy';
  }
  const threshold = sc.threshold ?? 150;
  let profile = 'clases';
  if (!isNew) profile = PROFILES.find((p) => p.ms === threshold && (!sc.usageProfile || sc.usageProfile === p.key))?.key ?? PROFILES.find((p) => p.ms === threshold)?.key ?? 'custom';
  return {
    name: sc.name ?? '', description: sc.description ?? '',
    networkType: sc.networkType ?? '', dataSource: sc.dataSource ?? '',
    loadKey, statistic: sc.statistic ?? 'mean', profile, threshold,
    date: c.periodDate ?? '', start: c.periodStart ?? '', end: c.periodEnd ?? '',
    tool: c.tool ?? 'unknown', protocol: c.protocol ?? 'unknown', target: c.target ?? 'unknown', packetSize: c.packetSize ?? 'unknown',
    notes: c.notes ?? '',
  };
}

export function formatPeriod({ date, start, end }) {
  const d = formatDate(date);
  if (!d) return '';
  if (start && end) return `${d}, ${start} a ${end}`;
  if (start) return `${d}, desde ${start}`;
  if (end) return `${d}, hasta ${end}`;
  return d;
}

export function conditionsText(c = {}) {
  const lab = (list, k) => (k && k !== 'unknown' ? list.find((o) => o.value === k)?.label : null);
  const parts = [
    lab(TOOL_OPTIONS, c.tool) && `Herramienta: ${lab(TOOL_OPTIONS, c.tool)}`,
    lab(PROTOCOL_OPTIONS, c.protocol) && `Protocolo: ${lab(PROTOCOL_OPTIONS, c.protocol)}`,
    lab(TARGET_OPTIONS, c.target) && `Destino: ${lab(TARGET_OPTIONS, c.target)}`,
    lab(PACKET_OPTIONS, c.packetSize) && `Paquetes: ${lab(PACKET_OPTIONS, c.packetSize)}`,
  ].filter(Boolean);
  return [parts.join(' · '), c.notes].filter(Boolean).join(' — ');
}

/** Nombre que se usa si el usuario deja el campo vacío; nunca repite uno existente. */
export function suggestName(d, existingNames = [], today = new Date()) {
  const net = d.networkType ? NETWORK_OPTIONS.find((o) => o.value === d.networkType)?.label : '';
  const p = profileOption(d.profile);
  const use = !p ? '' : p.key === 'custom' ? `límite ${d.threshold} ms` : p.title;
  const base = ([net, use, formatDate(todayStr(today))].filter(Boolean).join(' · ') || 'Nuevo escenario').slice(0, LIMITS.nameMax - 4);
  const taken = new Set(existingNames.map(normName));
  if (!taken.has(normName(base))) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(normName(`${base} (${i})`))) return `${base} (${i})`;
  return base;
}

// ---- Validación --------------------------------------------------------------------------

const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const isDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
};

/**
 * Valida el borrador. Devuelve { ok, errors, value }.
 *  errors[campo] = { kind: 'missing' | 'invalid', msg }  (en el orden del formulario)
 *  value = campos listos para guardar (solo si ok).
 * `original` es el escenario que se edita: sus valores anteriores (de versiones previas) siguen siendo válidos.
 */
export function validateScenario(d, { existingNames = [], original = {}, today = new Date() } = {}) {
  const errors = {};
  const miss = (f, msg) => { errors[f] = { kind: 'missing', msg }; };
  const bad = (f, msg) => { errors[f] = { kind: 'invalid', msg }; };
  const synthetic = d.dataSource === 'synthetic';

  // Nombre (vacío ⇒ se usa el sugerido)
  const typed = String(d.name ?? '').replace(/\s+/g, ' ').trim();
  const name = typed || suggestName(d, existingNames, today);
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax || !/\p{L}/u.test(name) || sanitizeName(name) !== name) {
    bad('name', `El nombre debe tener entre ${LIMITS.nameMin} y ${LIMITS.nameMax} caracteres, con al menos una letra.`);
  } else if (existingNames.some((n) => normName(n) === normName(name))) {
    bad('name', 'Ya existe un escenario con ese nombre. Use otro o déjelo vacío para usar uno sugerido.');
  }
  if (String(d.description ?? '').length > LIMITS.descMax) bad('description', `Máximo ${LIMITS.descMax} caracteres.`);

  // Listas cerradas (un valor de una versión anterior del mismo escenario sigue permitido)
  const inList = (v, opts, orig) => v !== '' && v !== undefined && (opts.some((o) => (o.value ?? o.key) === v) || (orig !== undefined && v === orig));
  if (!d.networkType) miss('networkType', 'Elija el tipo de red.');
  else if (!inList(d.networkType, NETWORK_OPTIONS, original.networkType)) bad('networkType', 'Elija una opción de la lista.');
  if (!d.dataSource) miss('dataSource', 'Elija de dónde vienen los datos.');
  else if (!inList(d.dataSource, SOURCE_OPTIONS, original.dataSource)) bad('dataSource', 'Elija una opción de la lista.');
  const load = d.loadKey ? loadOption(d.loadKey, original) : null;
  if (!d.loadKey) miss('loadKey', 'Elija qué variable aumenta durante la prueba.');
  else if (!load) bad('loadKey', 'Elija una opción de la lista.');
  if (!inList(d.statistic, STATISTIC_OPTIONS, original.statistic)) bad('statistic', 'Elija una opción de la lista.');

  // Umbral: sale del perfil; solo «Otro límite» se escribe, con rango entero estricto.
  const prof = profileOption(d.profile);
  let threshold = prof?.ms ?? null;
  if (!prof) bad('profile', 'Elija una opción de la lista.');
  else if (prof.key === 'custom') {
    const raw = String(d.threshold ?? '');
    const t = Number(raw);
    if (!/^\d{1,4}$/.test(raw) || t < LIMITS.thrMin || t > LIMITS.thrMax) {
      bad('threshold', `Escriba un número entero de ${LIMITS.thrMin} a ${LIMITS.thrMax} ms.`);
    } else threshold = t;
  }

  // Periodo (opcional). Con datos simulados no aplica.
  let period = '';
  if (synthetic) period = 'Simulado';
  else {
    const hasTimes = !!(d.start || d.end);
    if (d.date && !isDate(d.date)) bad('date', 'La fecha no es válida.');
    else if (d.date && d.date > todayStr(today)) bad('date', 'La fecha no puede ser futura: la medición ya debe haberse hecho.');
    else if (d.date && d.date < '2000-01-01') bad('date', 'La fecha es demasiado antigua.');
    else if (!d.date && hasTimes) bad('date', 'Elija la fecha para poder indicar la hora.');
    if ((d.start && !isTime(d.start)) || (d.end && !isTime(d.end))) bad('time', 'La hora no es válida.');
    else if (d.start && d.end && d.end <= d.start) bad('time', 'La hora de fin debe ser posterior a la de inicio.');
    if (!errors.date && !errors.time) {
      period = formatPeriod(d);
      // Periodo escrito a mano en una versión anterior: se conserva si no se elige fecha.
      if (!period && original.conditions?.period && !original.conditions?.periodDate) period = original.conditions.period;
    }
  }

  for (const [f, opts, orig] of [['tool', TOOL_OPTIONS], ['protocol', PROTOCOL_OPTIONS], ['target', TARGET_OPTIONS], ['packetSize', PACKET_OPTIONS]]) {
    if (!inList(d[f], opts, orig)) bad(f, 'Elija una opción de la lista.');
  }
  if (String(d.notes ?? '').length > LIMITS.notesMax) bad('notes', `Máximo ${LIMITS.notesMax} caracteres.`);

  const ordered = {};
  for (const f of ORDER) if (errors[f]) ordered[f] = errors[f];
  if (Object.keys(ordered).length) return { ok: false, errors: ordered, value: null };

  return {
    ok: true, errors: {},
    value: {
      name, description: String(d.description ?? '').trim(),
      networkType: d.networkType, dataSource: d.dataSource,
      loadKey: load.key, loadVariable: load.label, loadUnit: load.unit,
      metric: 'latency', metricUnit: original.metricUnit ?? 'ms',
      statistic: d.statistic, usageProfile: prof.key, threshold,
      conditions: {
        period, periodDate: synthetic ? '' : d.date, periodStart: synthetic ? '' : d.start, periodEnd: synthetic ? '' : d.end,
        tool: d.tool, protocol: d.protocol, target: d.target, packetSize: d.packetSize, notes: String(d.notes ?? '').trim(),
      },
    },
  };
}

// ---- Resumen en lenguaje simple ----------------------------------------------------------

/** Frase que confirma, en palabras simples, lo que se va a analizar. Segmentos {text, strong?, muted?}. */
export function summaryParts(d, { original = {} } = {}) {
  const T = (text) => ({ text });
  const B = (text) => ({ text, strong: true });
  const M = (text) => ({ text, muted: true });
  const net = NETWORK_OPTIONS.find((o) => o.value === d.networkType)?.label;
  const load = d.loadKey ? loadOption(d.loadKey, original) : null;
  const prof = profileOption(d.profile);
  const stat = STATISTIC_NOUN[d.statistic] ?? '';
  const limit = prof ? (prof.key === 'custom' ? Number(d.threshold) : prof.ms) : null;
  const limitOk = Number.isInteger(limit) && limit >= LIMITS.thrMin && limit <= LIMITS.thrMax;
  return [
    T('Analizará una red '), net ? B(net) : M('(sin elegir)'),
    T('. Irá aumentando '), load ? B(`${load.label.toLowerCase()} (${load.unit})`) : M('(variable sin elegir)'),
    T(' y en cada nivel registrará la '), B('latencia'), T(` en ${original.metricUnit ?? 'ms'}, resumida como `), B(stat),
    T('. La red se considera saturada cuando la latencia pasa de '), limitOk ? B(`${limit} ms`) : M('(límite sin definir)'),
    prof && prof.key !== 'custom' ? T(` (${prof.title.toLowerCase()})`) : null,
    T('. NetThreshold calculará cuánta carga'), load ? T(` (${load.unit})`) : null, T(' soporta antes de llegar a ese límite.'),
  ].filter(Boolean);
}
