// k6 ingest load test. Default: 100 req/s x 1000 events = 100,000 events/sec for 5 min.
//   k6 run infra/k6/ingest.js
//   RATE=20 DURATION=30m k6 run infra/k6/ingest.js     # soak
import http from 'k6/http';
import { check } from 'k6';

const RATE = Number(__ENV.RATE || 100), BATCH = Number(__ENV.BATCH || 1000), N = Number(__ENV.VEHICLES || 100000);
const URL = __ENV.URL || 'http://localhost:4001/v1/ingest/B';
export const options = {
  scenarios: { ingest: { executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: __ENV.DURATION || '5m', preAllocatedVUs: 200, maxVUs: 600 } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500', 'p(99)<1000'] },
};

// same algorithm as backend/src/shared/vin.js (vehicle index -> valid VIN)
const ALPHA = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789', WMIS = ['1HG', 'JHM', 'WVW', 'SAL', '5YJ', 'MA1', 'KMH', 'TMB'];
const TR = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
function makeVin(n) {
  let x = n, vds = ''; for (let i = 0; i < 5; i++) { vds = ALPHA[x % 33] + vds; x = Math.floor(x / 33); }
  const body = WMIS[n % 8] + vds + '0NA' + String(n % 1000000).padStart(6, '0');
  let s = 0; for (let i = 0; i < 17; i++) { const c = body[i]; s += (c >= '0' && c <= '9' ? +c : TR[c]) * W[i]; }
  const r = s % 11; return body.slice(0, 8) + (r === 10 ? 'X' : String(r)) + body.slice(9);
}
// only OEM "B" vehicles (index % 5 === 1) so VINs map to the right OEM format
const vins = []; for (let i = 1; i < N; i += 5) vins.push(makeVin(i + 1));
let seq = 1;

export default function () {
  const now = new Date().toISOString(); const lines = new Array(BATCH);
  for (let i = 0; i < BATCH; i++) {
    const v = vins[(Math.random() * vins.length) | 0]; seq += 1;
    lines[i] = `{"vin":"${v}","ts":"${now}","gps":[13.08,80.27],"speed_kmh":${(Math.random() * 90).toFixed(1)},"odo_km":${(1000 + seq % 1000).toFixed(1)},"fuel_pct":55.5,"engine_on":true,"rpm":1800,"dtc":[],"evt":null,"seq":${seq + __VU * 1e7 + __ITER}}`;
  }
  const res = http.post(URL, lines.join('\n'), { headers: { 'content-type': 'application/x-ndjson', 'x-api-key': __ENV.DEVICE_API_KEY || 'dev-device-key' } });
  check(res, { 'accepted 202': (r) => r.status === 202 });
}
