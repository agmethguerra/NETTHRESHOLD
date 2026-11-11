// Escenario de ejemplo con datos SIMULADOS (RN-14). No corresponde a una red real.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MU = 120; // capacidad simulada del Wi-Fi (personas conectadas)
const S = 20; // tiempo de respuesta base simulado (ms)

export function syntheticExample(seed = 7) {
  const rand = mulberry32(seed);
  const measurements = [];
  for (let load = 10; load <= 110; load += 10) {
    for (let rep = 1; rep <= 2; rep++) {
      const clean = S / (1 - load / MU);
      const noisy = clean * (1 + (rand() * 2 - 1) * 0.03);
      measurements.push({
        loadValue: load,
        metricValue: Math.round(noisy * 100) / 100,
        replicate: rep,
        origin: 'synthetic',
        notes: 'Simulado',
      });
    }
  }
  const scenario = {
    name: 'Wi-Fi de la universidad: ¿cuántas personas aguanta? (simulado)',
    description: '¿Cuántas personas pueden conectarse al Wi-Fi de la universidad antes de que las videollamadas empiecen a fallar? Una videollamada se vuelve incómoda cuando la respuesta de la red pasa de unos 150 ms. Ejemplo con datos simulados.',
    networkType: 'wlan',
    loadKey: 'people',
    loadVariable: 'Personas conectadas',
    loadUnit: 'personas',
    metric: 'latency',
    metricUnit: 'ms',
    statistic: 'mean',
    threshold: 150,
    usageProfile: 'clases',
    dataSource: 'synthetic',
    conditions: {
      period: 'Simulado',
      tool: 'unknown', protocol: 'unknown', target: 'unknown', packetSize: 'unknown',
      notes: `Datos simulados de una red Wi-Fi de campus con R = S/(1 − λ/μ), S = ${S} ms, μ = ${MU} personas y ruido de ±3 %. No corresponden a una red real.`,
    },
  };
  return { scenario, measurements };
}
