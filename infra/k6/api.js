// k6 API read-path test: login once, then mixed reads. k6 run infra/k6/api.js
import http from 'k6/http';
import { check } from 'k6';
const BASE = __ENV.BASE || 'http://localhost:4000';
export const options = { vus: 50, duration: '2m', thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<200'] } };
export function setup() {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: 'manager@fleetnorm.dev', password: 'Manager@123' }), { headers: { 'content-type': 'application/json' } });
  return { token: r.json('access_token') };
}
export default function (d) {
  const h = { headers: { authorization: `Bearer ${d.token}` } };
  const paths = ['/api/vehicles?limit=50', '/api/alerts?limit=25', '/api/insights/summary', '/api/insights/idling-cost', '/api/vehicles/live?limit=200'];
  const res = http.get(BASE + paths[Math.floor(Math.random() * paths.length)], h);
  check(res, { ok: (r) => r.status === 200 });
}
