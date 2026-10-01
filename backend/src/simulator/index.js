// Fleet telemetry simulator. Compact typed-array state -> 100K+ vehicles in ~20 MB.
// Models: trips, idling, harsh braking, DTC faults (a "bad" minority), GPS noise,
// 5% duplicates, 3% out-of-order, optional 3x bursts. Sends NDJSON batches per OEM.
import { FORMATS } from './formats.js';
import { oemForIndex, vinForIndex } from '../shared/fleetgen.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const N = Number(arg('vehicles', process.env.VEHICLES || 100000));
const RATE = Number(arg('rate', process.env.RATE || 1000));          // events / second
const SECONDS = Number(arg('duration', process.env.DURATION || 0));  // 0 = run forever
const BATCH = Number(arg('batch', 2000));
const CONC = Number(arg('concurrency', 8));
const OEM_SET = new Set(arg('oems', 'A,B,C,D,E').split(','));
const BURST = flag('burst');
const DRY = flag('dry');
const URL_BASE = arg('url', process.env.INGEST_URL || 'http://localhost:4001');
const KEY = process.env.DEVICE_API_KEY || 'dev-device-key';
const P_DUP = 0.05, P_OOO = 0.03;

// ---- vehicle state ----
const lat = new Float64Array(N), lon = new Float64Array(N), head = new Float32Array(N), spd = new Float32Array(N);
const odo = new Float64Array(N), fuel = new Float32Array(N), seq = new Uint32Array(N);
const mode = new Uint8Array(N);      // 0 parked, 1 moving, 2 idling
const prof = new Uint8Array(N);      // 0 normal, 1 idler, 2 faulty/aggressive
const vins = new Array(N), oems = new Array(N);
const CITIES = [[13.0827, 80.2707], [12.9716, 77.5946], [19.076, 72.8777], [28.6139, 77.209]];
for (let i = 0; i < N; i++) {
  vins[i] = vinForIndex(i); oems[i] = oemForIndex(i);
  const c = CITIES[i % CITIES.length];
  lat[i] = c[0] + (Math.random() - 0.5) * 0.3; lon[i] = c[1] + (Math.random() - 0.5) * 0.3;
  head[i] = Math.random() * 360; odo[i] = 5000 + Math.random() * 120000; fuel[i] = 30 + Math.random() * 65;
  mode[i] = Math.random() < 0.5 ? 1 : 0;
  const p = Math.random(); prof[i] = p < 0.05 ? 1 : p < 0.08 ? 2 : 0;
}
const DTCS = ['P0301', 'P0420', 'P0171', 'P0217', 'U0100'];

function step(i, now) {
  const rnd = Math.random();
  // state machine (idlers stay idle much longer -> triggers excessive-idling alerts)
  if (mode[i] === 0) { if (rnd < 0.004) mode[i] = 1; }
  else if (mode[i] === 1) { if (rnd < 0.002) mode[i] = 2; else if (rnd < 0.0025) mode[i] = 0; }
  else { const stay = prof[i] === 1 ? 0.9995 : 0.99; if (rnd > stay) mode[i] = Math.random() < 0.7 ? 1 : 0; }

  let harsh = false;
  if (mode[i] === 1) {
    spd[i] = Math.max(5, Math.min(130, spd[i] + (Math.random() - 0.45) * 6 + (prof[i] === 2 && Math.random() < 0.002 ? 40 : 0)));
    head[i] += (Math.random() - 0.5) * 8;
    const dist = spd[i] / 3600; // km in 1 s
    const rad = head[i] * Math.PI / 180;
    lat[i] += (dist * Math.cos(rad)) / 111; lon[i] += (dist * Math.sin(rad)) / (111 * Math.cos(lat[i] * Math.PI / 180));
    odo[i] += dist; fuel[i] = Math.max(0, fuel[i] - dist * 0.0012 * 100 / 60);
    harsh = Math.random() < (prof[i] === 2 ? 0.02 : 0.0004);
    if (harsh) spd[i] = Math.max(0, spd[i] - 40);
  } else { spd[i] = 0; }
  const dtc = prof[i] === 2 && Math.random() < 0.03 ? [DTCS[(Math.random() * DTCS.length) | 0]] : [];
  const engine = mode[i] !== 0;
  return {
    vin: vins[i], ts: new Date(now), lat: lat[i] + (Math.random() - 0.5) * 0.00008, lon: lon[i] + (Math.random() - 0.5) * 0.00008,
    speed_kmh: spd[i], odo_km: odo[i], fuel_pct: fuel[i], engine_on: engine,
    rpm: engine ? (mode[i] === 2 ? 750 + ((Math.random() * 60) | 0) : 1500 + ((spd[i] * 25) | 0)) : 0,
    dtc, evt: harsh ? 'HARSH_BRAKE' : null, seq: ++seq[i],
  };
}

// ---- sending ----
let cursor = 0, inflight = 0, sent = 0, errors = 0, throttled = 0, generated = 0;
const bufs = {}; const delayed = [];
const queue = [];

async function post(oem, lines) {
  const body = lines.join('\n');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${URL_BASE}/v1/ingest/${oem}`, { method: 'POST', headers: { 'content-type': 'application/x-ndjson', 'x-api-key': KEY }, body });
      if (res.status === 202 || res.status === 200) { sent += lines.length; return; }
      if (res.status === 429 || res.status === 503) { throttled++; const ra = Number(res.headers.get('retry-after') || 1); await new Promise((r) => setTimeout(r, ra * 1000)); continue; }
      errors++; return;
    } catch { errors++; await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); }
  }
}
function flush(oem) {
  const lines = bufs[oem]; if (!lines || !lines.length) return;
  bufs[oem] = [];
  if (DRY) { sent += lines.length; return; }
  queue.push([oem, lines]); pump();
}
function pump() {
  while (inflight < CONC && queue.length) {
    const [oem, lines] = queue.shift(); inflight++;
    post(oem, lines).finally(() => { inflight--; pump(); });
  }
}
function emit(ev, oem) {
  (bufs[oem] ||= []).push(JSON.stringify(FORMATS[oem](ev)));
  generated++;
  if (bufs[oem].length >= BATCH) flush(oem);
}

let tick = 0; const t0 = Date.now();
function loop() {
  const now = Date.now(); tick++;
  const burstOn = BURST && Math.floor(tick / 30) % 4 === 3; // 30s normal x3, 30s at 3x
  const target = RATE * (burstOn ? 3 : 1);
  // release delayed (out-of-order) events
  while (delayed.length && delayed[0].at <= now) { const d = delayed.shift(); emit(d.ev, d.oem); }
  for (let k = 0; k < target; k++) {
    const i = cursor; cursor = (cursor + 1) % N;
    const oem = oems[i]; const ev = step(i, now);
    if (!OEM_SET.has(oem)) continue;
    if (Math.random() < P_OOO) { delayed.push({ at: now + 1000 + Math.random() * 4000, ev, oem }); delayed.sort((a, b) => a.at - b.at); }
    else emit(ev, oem);
    if (Math.random() < P_DUP) emit(ev, oem);
  }
  for (const o of Object.keys(bufs)) flush(o);
  if (tick % 5 === 0) console.log(JSON.stringify({ t: Math.round((now - t0) / 1000), target_eps: target, generated, sent, inflight, throttled, errors }));
  if (SECONDS && (now - t0) / 1000 >= SECONDS) { finish(); return; }
  setTimeout(loop, Math.max(0, 1000 - (Date.now() - now)));
}
function finish() {
  for (const o of Object.keys(bufs)) flush(o);
  const wait = setInterval(() => {
    if (!inflight && !queue.length) { clearInterval(wait); console.log(JSON.stringify({ done: true, generated, sent, throttled, errors, seconds: Math.round((Date.now() - t0) / 1000) })); process.exit(0); }
  }, 200);
}
console.log(JSON.stringify({ starting: { vehicles: N, rate: RATE, oems: [...OEM_SET], burst: BURST, dry: DRY, url: URL_BASE } }));
loop();
