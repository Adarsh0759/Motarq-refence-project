// API service: JWT auth, RBAC, tenant isolation, audit log, keyset pagination, insights, OEM onboarding, erasure, SSE.
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import CircuitBreaker from 'opossum';
import swaggerUi from 'swagger-ui-express';
import { cfg } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { client, register } from '../shared/metrics.js';
import { pgPool, mongo, redis, clickhouse } from '../shared/db.js';
import { MAPPING_CHANNEL } from '../shared/mappings.js';
import { MappingInput } from '../shared/schema.js';
import { normaliseAndValidate } from '../processor/normalise.js';
import { clampInt, maskLocation, idleCost, ruleRisk, cursorOf } from './util.js';
import { openapiSpec } from './openapi.js';

const pool = pgPool(30); const ch = clickhouse(); const r = redis(); const subR = redis({ enableReadyCheck: false });
const mg = await mongo(); const db = mg.db(cfg.mongoDb);

// KEYS blocks the single-threaded Redis server for the full keyspace scan (measured: 100% CPU pin
// with a few million keys in the dataset); SCAN is cursor-based and non-blocking.
const scanKeys = (pattern) => new Promise((resolve, reject) => {
  const keys = []; const stream = r.scanStream({ match: pattern, count: 1000 });
  stream.on('data', (ks) => keys.push(...ks));
  stream.on('end', () => resolve(keys));
  stream.on('error', reject);
});

const httpH = new client.Histogram({ name: 'api_request_seconds', help: 'API latency', labelNames: ['method', 'route', 'status'], buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2] });
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', 1);
app.use(helmet()); app.use(cors({ origin: cfg.corsOrigin })); app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => { const end = httpH.startTimer(); res.on('finish', () => end({ method: req.method, route: req.route?.path || req.path.split('/').slice(0, 3).join('/'), status: res.statusCode })); next(); });

// correlation id on every request/response, folded into every JSON body (success or error) so a
// user-reported error can be grepped straight out of the structured logs.
app.use((req, res, next) => {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  const json = res.json.bind(res);
  res.json = (body) => json(body && typeof body === 'object' && !Array.isArray(body) ? { ...body, request_id: req.id } : body);
  next();
});

app.get('/healthz', (_q, s) => s.send('ok'));
app.get('/readyz', async (_q, s) => { try { await pool.query('SELECT 1'); s.send('ready'); } catch { s.status(503).send('not ready'); } });
app.get('/metrics', async (_q, s) => { s.set('Content-Type', register.contentType); s.end(await register.metrics()); });
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'FleetNorm API docs' }));
app.get('/api/openapi.json', (_q, s) => s.json(openapiSpec));

const mkLimiter = (max, windowMs, prefix) => rateLimit({ windowMs, limit: max, standardHeaders: true, legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...a) => r.call(...a), prefix }), message: { error: 'rate_limited' } });
const limiter = mkLimiter(600, 60_000, 'rl:api:'); const loginLimiter = mkLimiter(10, 60_000, 'rl:login:');

// ---------- auth ----------
const sign = (u) => jwt.sign({ sub: u.user_id, tid: u.tenant_id, role: u.role }, cfg.jwtSecret, { expiresIn: '15m', issuer: 'fleetnorm' });
const signRefresh = (u) => jwt.sign({ sub: u.user_id, typ: 'refresh' }, cfg.jwtSecret, { expiresIn: '7d', issuer: 'fleetnorm' });
const Login = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

app.post('/auth/login', loginLimiter, async (req, res) => {
  const p = Login.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'invalid_input' });
  const { rows } = await pool.query('SELECT u.user_id, u.tenant_id, u.password_hash, ro.code AS role FROM app_user u JOIN role ro USING (role_id) WHERE u.email = $1', [p.data.email.toLowerCase()]);
  const u = rows[0];
  const ok = u ? bcrypt.compareSync(p.data.password, u.password_hash) : bcrypt.compareSync(p.data.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  res.json({ access_token: sign(u), refresh_token: signRefresh(u), role: u.role, tenant_id: u.tenant_id });
});
app.post('/auth/refresh', async (req, res) => {
  try {
    const d = jwt.verify(String(req.body?.refresh_token || ''), cfg.jwtSecret, { issuer: 'fleetnorm' });
    if (d.typ !== 'refresh') throw new Error('typ');
    const { rows } = await pool.query('SELECT u.user_id, u.tenant_id, ro.code AS role FROM app_user u JOIN role ro USING (role_id) WHERE u.user_id=$1', [d.sub]);
    if (!rows[0]) throw new Error('nouser');
    res.json({ access_token: sign(rows[0]) });
  } catch { res.status(401).json({ error: 'invalid_refresh' }); }
});

function auth(req, res, next) {
  const h = req.get('authorization') || ''; const tok = h.startsWith('Bearer ') ? h.slice(7) : req.query.token; // ?token= only for SSE
  try { const d = jwt.verify(String(tok), cfg.jwtSecret, { issuer: 'fleetnorm' }); if (d.typ) throw new Error('refresh token'); req.user = { id: d.sub, tenant: d.tid, role: d.role }; next(); }
  catch { res.status(401).json({ error: 'unauthorized' }); }
}
const need = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'forbidden' }));

// audit every data access (async, never blocks the response)
function audit(req, res, next) {
  res.on('finish', () => pool.query('INSERT INTO audit_log(tenant_id,user_id,action,resource,status) VALUES ($1,$2,$3,$4,$5)',
    [req.user?.tenant ?? null, req.user?.id ?? null, req.method, req.originalUrl.split('?')[0].slice(0, 200), res.statusCode]).catch((e) => logger.warn({ err: e.message }, 'audit failed')));
  next();
}
const api = express.Router(); api.use(limiter, auth, audit); app.use('/api', api);

// tenant's fleet ids (cached 30s) - every ClickHouse query is scoped with these
const fleetCache = new Map();
async function fleetIds(tenant) {
  const c = fleetCache.get(tenant); if (c && c.exp > Date.now()) return c.ids;
  const ids = (await pool.query('SELECT fleet_id FROM fleet WHERE tenant_id=$1', [tenant])).rows.map((x) => x.fleet_id);
  fleetCache.set(tenant, { ids, exp: Date.now() + 30000 }); return ids;
}
const chq = async (query, query_params) => (await ch.query({ query, query_params, format: 'JSONEachRow' })).json();
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { logger.error({ err: e.message, path: req.path }, 'handler error'); res.status(500).json({ error: 'internal' }); });

// ---------- fleets / vehicles (keyset pagination) ----------
api.get('/fleets', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT f.fleet_id, f.name, count(v.*)::int AS vehicles FROM fleet f LEFT JOIN vehicle v USING (fleet_id) WHERE f.tenant_id=$1 GROUP BY f.fleet_id ORDER BY f.fleet_id', [req.user.tenant]);
  res.json({ data: rows });
}));

api.get('/vehicles', wrap(async (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 200); const after = clampInt(req.query.cursor, 0, 0, 2_000_000_000);
  const fleet = req.query.fleetId ? clampInt(req.query.fleetId, null, 1, 1e9) : null;
  const { rows } = await pool.query(
    `SELECT v.vehicle_id, v.vin, v.fleet_id, o.code AS oem, v.model, v.fuel_type
       FROM vehicle v JOIN fleet f ON f.fleet_id=v.fleet_id JOIN oem o ON o.oem_id=v.oem_id
      WHERE f.tenant_id=$1 AND ($2::int IS NULL OR v.fleet_id=$2) AND v.vehicle_id > $3 ORDER BY v.vehicle_id LIMIT $4`, [req.user.tenant, fleet, after, limit]);
  res.json({ data: rows, next_cursor: rows.length === limit ? cursorOf(rows, 'vehicle_id') : null });
}));

async function ownVehicle(req, vin) {
  const { rows } = await pool.query('SELECT v.vehicle_id, v.fleet_id FROM vehicle v JOIN fleet f USING (fleet_id) WHERE v.vin=$1 AND f.tenant_id=$2', [vin, req.user.tenant]);
  return rows[0];
}
api.get('/vehicles/live', wrap(async (req, res) => {
  const limit = clampInt(req.query.limit, 300, 1, 1000); const fleets = await fleetIds(req.user.tenant);
  const p = r.pipeline(); fleets.forEach((f) => p.zrevrange(`live:${f}`, 0, limit - 1)); const z = await p.exec();
  const vins = z.flatMap((x) => x[1]).slice(0, limit);
  const p2 = r.pipeline(); vins.forEach((v) => p2.hgetall(`latest:${v}`)); const h = await p2.exec();
  res.json({ data: h.map((x) => x[1]).filter((x) => x.vin).map((x) => maskLocation({ vin: x.vin, lat: +x.lat, lon: +x.lon, speed_kmh: +x.speed_kmh, engine_on: x.engine_on === '1', ts: x.ts, oem: x.oem }, req.user.role)) });
}));
api.get('/vehicles/:vin/latest', wrap(async (req, res) => {
  if (!(await ownVehicle(req, req.params.vin))) return res.status(404).json({ error: 'not_found' });
  const h = await r.hgetall(`latest:${req.params.vin}`); if (!h.vin) return res.status(404).json({ error: 'no_data' });
  const num = (k) => (h[k] === '' || h[k] === undefined ? null : Number(h[k]));
  res.json(maskLocation({ vin: h.vin, ts: h.ts, oem: h.oem, evt: h.evt || null, engine_on: h.engine_on === '1', lat: num('lat'), lon: num('lon'), speed_kmh: num('speed_kmh'),
    fuel_pct: num('fuel_pct'), rpm: num('rpm'), odo_km: num('odo_km') }, req.user.role));
}));
api.get('/vehicles/:vin/history', wrap(async (req, res) => {
  const v = await ownVehicle(req, req.params.vin); if (!v) return res.status(404).json({ error: 'not_found' });
  const limit = clampInt(req.query.limit, 200, 1, 2000); const hours = clampInt(req.query.hours, 1, 1, 168);
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const rows = await chq(`SELECT ts, lat, lon, speed_kmh, fuel_pct, engine_on, evt FROM telemetry WHERE fleet_id={f:UInt32} AND vin={vin:String}
    AND ts >= now() - INTERVAL {h:UInt32} HOUR AND ({b:String}='' OR ts < parseDateTime64BestEffort({b:String})) ORDER BY ts DESC LIMIT {l:UInt32}`,
    { f: v.fleet_id, vin: req.params.vin, h: hours, b: before && !Number.isNaN(before.getTime()) ? before.toISOString() : '', l: limit });
  res.json({ data: rows.map((x) => maskLocation(x, req.user.role)), next_before: rows.length === limit ? rows[rows.length - 1].ts : null });
}));

// ---------- alerts (keyset, partial index) ----------
api.get('/alerts', wrap(async (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 200); const status = ['open', 'ack', 'closed'].includes(req.query.status) ? req.query.status : 'open';
  const before = req.query.cursor ? clampInt(req.query.cursor, null, 1, 9e15) : null; const fleets = await fleetIds(req.user.tenant);
  // Fleet IDs are resolved first (cached, tenant-derived server-side): lets the planner walk alert_open_idx instead of joining from vehicle (688 ms -> 0.9 ms, docs/perf).
  const { rows } = await pool.query(
    `SELECT a.alert_id, v.vin, t.code, a.severity, a.status, a.raised_at, a.detail
       FROM alert a JOIN vehicle v ON v.vehicle_id=a.vehicle_id JOIN alert_type t ON t.alert_type_id=a.alert_type_id
      WHERE v.fleet_id = ANY($1::int[]) AND a.status=$2 AND ($3::bigint IS NULL OR a.alert_id < $3) ORDER BY a.alert_id DESC LIMIT $4`, [fleets, status, before, limit]);
  res.json({ data: rows, next_cursor: rows.length === limit ? cursorOf(rows, 'alert_id') : null });
}));
api.post('/alerts/:id/ack', need('admin', 'manager'), wrap(async (req, res) => {
  const id = clampInt(req.params.id, null, 1, 9e15); if (!id) return res.status(400).json({ error: 'bad_id' });
  const fleets = await fleetIds(req.user.tenant);
  const u = await pool.query(`UPDATE alert a SET status='ack', acked_by=$3, acked_at=now() FROM vehicle v
     WHERE a.alert_id=$1 AND a.vehicle_id=v.vehicle_id AND v.fleet_id = ANY($2::int[]) AND a.status='open'`, [id, fleets, req.user.id]);
  res.status(u.rowCount ? 200 : 404).json({ acked: u.rowCount });
}));

// live alert stream (SSE), tenant-filtered
api.get('/stream/alerts', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders();
  const sub = subR.duplicate();
  sub.subscribe('alerts'); sub.on('message', (_c, m) => { try { const a = JSON.parse(m); if (a.tenant_id === req.user.tenant) res.write(`data: ${m}\n\n`); } catch { /* ignore */ } });
  const ka = setInterval(() => res.write(': ka\n\n'), 20000);
  req.on('close', () => { clearInterval(ka); sub.disconnect(); });
});

// ---------- insights ----------
api.get('/insights/summary', wrap(async (req, res) => {
  const fleets = await fleetIds(req.user.tenant);
  const [openA, live, epsKeys, cost] = await Promise.all([
    pool.query(`SELECT count(*)::int c FROM alert a JOIN vehicle v USING (vehicle_id) WHERE v.fleet_id = ANY($1::int[]) AND a.status='open'`, [fleets]),
    Promise.all(fleets.map((f) => r.zcount(`live:${f}`, Date.now() - 120000, '+inf'))),
    scanKeys('stats:eps:*'),
    chq(`SELECT sum(idle_events) AS idle FROM hourly_vehicle_stats WHERE fleet_id IN {f:Array(UInt32)} AND hour >= now() - INTERVAL 7 DAY`, { f: fleets }),
  ]);
  const eps = epsKeys.length ? (await r.mget(epsKeys)).reduce((a, b) => a + Number(b || 0), 0) : 0;
  res.json({ active_vehicles: live.reduce((a, b) => a + b, 0), open_alerts: openA.rows[0].c, events_per_sec: eps, idle_cost_7d_inr: idleCost(Number(cost[0]?.idle || 0)).cost_inr });
}));

api.get('/insights/idling-cost', wrap(async (req, res) => {
  const days = clampInt(req.query.days, 7, 1, 90), limit = clampInt(req.query.limit, 10, 1, 100); const fleets = await fleetIds(req.user.tenant);
  const [top, tot, byFleet] = await Promise.all([
    chq(`SELECT vin, sum(idle_events) AS idle, sum(event_count) AS n FROM hourly_vehicle_stats WHERE fleet_id IN {f:Array(UInt32)} AND hour >= now() - INTERVAL {d:UInt32} DAY GROUP BY vin HAVING idle>0 ORDER BY idle DESC LIMIT {l:UInt32}`, { f: fleets, d: days, l: limit }),
    chq(`SELECT sum(idle_events) AS idle, sum(event_count) AS n FROM hourly_vehicle_stats WHERE fleet_id IN {f:Array(UInt32)} AND hour >= now() - INTERVAL {d:UInt32} DAY`, { f: fleets, d: days }),
    chq(`SELECT fleet_id, sum(idle_events) AS idle FROM hourly_vehicle_stats WHERE fleet_id IN {f:Array(UInt32)} AND hour >= now() - INTERVAL {d:UInt32} DAY GROUP BY fleet_id ORDER BY fleet_id`, { f: fleets, d: days }),
  ]);
  res.json({ days, assumptions: { sample_seconds: cfg.sampleSeconds, litres_per_idle_hour: cfg.idleLitresPerHour, inr_per_litre: cfg.fuelInrPerLitre },
    total: { ...idleCost(Number(tot[0]?.idle || 0)), idle_ratio: Number(tot[0]?.n) ? Number(tot[0].idle) / Number(tot[0].n) : 0 },
    by_fleet: byFleet.map((x) => ({ fleet_id: x.fleet_id, ...idleCost(Number(x.idle)) })),
    top_vehicles: top.map((x) => ({ vin: x.vin, idle_ratio: Number(x.idle) / Number(x.n), ...idleCost(Number(x.idle)) })) });
}));

api.get('/insights/utilisation', wrap(async (req, res) => {
  const days = clampInt(req.query.days, 7, 1, 90), limit = clampInt(req.query.limit, 10, 1, 100); const fleets = await fleetIds(req.user.tenant);
  const rows = await chq(`SELECT vin, sum(event_count) AS n, sum(idle_events) AS idle, max(odo_max)-min(odo_min) AS km, max(max_speed) AS vmax FROM hourly_vehicle_stats
    WHERE fleet_id IN {f:Array(UInt32)} AND hour >= now() - INTERVAL {d:UInt32} DAY GROUP BY vin ORDER BY km DESC LIMIT {l:UInt32}`, { f: fleets, d: days, l: limit });
  res.json({ days, vehicles: rows.map((x) => ({ vin: x.vin, distance_km: Number(Number(x.km).toFixed(2)), active_hours: Number(((Number(x.n) - Number(x.idle)) * cfg.sampleSeconds / 3600).toFixed(3)), max_speed_kmh: Number(Number(x.vmax).toFixed(1)) })) });
}));

// ML risk ranking (circuit breaker + transparent rule-based fallback)
const mlBreaker = new CircuitBreaker(async (rows) => {
  const res = await fetch(`${cfg.mlUrl}/predict`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }), signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`ml ${res.status}`); return res.json();
}, { timeout: 4000, errorThresholdPercentage: 50, resetTimeout: 10000, volumeThreshold: 3 });
api.get('/insights/risk', wrap(async (req, res) => {
  const limit = clampInt(req.query.limit, 10, 1, 50), hours = clampInt(req.query.hours, 24, 1, 168); const fleets = await fleetIds(req.user.tenant);
  const agg = await chq(`SELECT vin, sum(event_count) AS n, sum(idle_events) AS idle, sum(harsh_events) AS harsh, sum(dtc_events) AS dtc, sum(overspeed_events) AS over, sum(lowfuel_events) AS low,
      max(odo_max)-min(odo_min) AS km, max(odo_max) AS odo, dateDiff('second', min(hour), max(hour)) + 3600 AS secs
    FROM hourly_vehicle_stats WHERE fleet_id IN {f:Array(UInt32)} AND hour >= now() - INTERVAL {h:UInt32} HOUR GROUP BY vin HAVING n >= 30
    ORDER BY dtc DESC, harsh DESC LIMIT 500`, { f: fleets, h: hours });
  const rows = agg.map((x) => { const n = Number(x.n); return { vin: x.vin, features: { idle_ratio: Number(x.idle) / n, harsh_ratio: Number(x.harsh) / n, dtc_ratio: Number(x.dtc) / n,
    overspeed_ratio: Number(x.over) / n, lowfuel_ratio: Number(x.low) / n, km_per_hour: Number(x.km) / (Number(x.secs) / 3600), odo_km: Number(x.odo) } }; });
  let scored, source = 'ml';
  try { scored = (await mlBreaker.fire(rows)).predictions; }
  catch { source = 'rules_fallback'; scored = rows.map((x) => ({ vin: x.vin, risk: ruleRisk(x.features) })); }
  const byVin = new Map(rows.map((x) => [x.vin, x.features]));
  res.json({ source, window_hours: hours, vehicles: scored.sort((a, b) => b.risk - a.risk).slice(0, limit).map((s) => ({ vin: s.vin, risk: Number(s.risk.toFixed(4)), features: byVin.get(s.vin) })) });
}));

// ---------- OEM mapping admin (zero-downtime onboarding) ----------
const Preview = z.object({ mapping: MappingInput, payload: z.record(z.any()) });
api.get('/admin/oem-mappings', need('admin'), wrap(async (_req, res) => {
  res.json({ data: await db.collection('oem_mappings').find({}, { projection: { _id: 0 } }).sort({ oem: 1, version: -1 }).toArray() });
}));
api.post('/admin/oem-mappings/preview', need('admin'), wrap(async (req, res) => {
  const p = Preview.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'invalid_input', issues: p.error.issues.slice(0, 5) });
  const out = normaliseAndValidate(p.data.payload, { ...p.data.mapping, version: 1 });
  res.json(out.ok ? { ok: true, event: out.event } : { ok: false, reason: out.reason });
}));
api.post('/admin/oem-mappings', need('admin'), wrap(async (req, res) => {
  const p = MappingInput.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'invalid_input', issues: p.error.issues.slice(0, 5) });
  const last = await db.collection('oem_mappings').find({ oem: p.data.oem }).sort({ version: -1 }).limit(1).toArray();
  const version = (last[0]?.version || 0) + 1;
  await db.collection('oem_mappings').insertOne({ ...p.data, version, active: false, created_at: new Date(), created_by: req.user.id });
  res.status(201).json({ oem: p.data.oem, version, active: false });
}));
api.post('/admin/oem-mappings/:oem/activate/:version', need('admin'), wrap(async (req, res) => {
  const version = clampInt(req.params.version, null, 1, 10000); const oem = req.params.oem;
  const exists = await db.collection('oem_mappings').findOne({ oem, version }); if (!exists) return res.status(404).json({ error: 'not_found' });
  await db.collection('oem_mappings').updateMany({ oem, active: true }, { $set: { active: false } });
  await db.collection('oem_mappings').updateOne({ oem, version }, { $set: { active: true, activated_at: new Date() } });
  await r.publish(MAPPING_CHANNEL, `${oem}:${version}`);        // processors + ingest hot-reload, no restart
  res.json({ oem, version, active: true });
}));
api.get('/admin/dlq', need('admin'), wrap(async (_req, res) => {
  const keys = await scanKeys('dlq:count:*'); const vals = keys.length ? await r.mget(keys) : [];
  const recent = await db.collection('dead_letter').find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(10).toArray();
  res.json({ counts: Object.fromEntries(keys.map((k, i) => [k.replace('dlq:count:', ''), Number(vals[i])])), recent });
}));
api.delete('/admin/dlq', need('admin'), wrap(async (_req, res) => { const k = await scanKeys('dlq:count:*'); if (k.length) await r.del(k); res.json({ cleared: k.length }); }));

// ---------- compliance: right to erasure ----------
api.delete('/admin/drivers/:id/erase', need('admin'), wrap(async (req, res) => {
  const id = clampInt(req.params.id, null, 1, 2_000_000_000);
  const u = await pool.query(`UPDATE driver SET full_name='ERASED', licence_no=NULL, erased_at=now() WHERE driver_id=$1 AND tenant_id=$2 AND erased_at IS NULL`, [id, req.user.tenant]);
  res.status(u.rowCount ? 200 : 404).json({ erased: u.rowCount });
}));
api.get('/drivers', need('admin', 'manager'), wrap(async (req, res) => {
  const limit = clampInt(req.query.limit, 20, 1, 100), after = clampInt(req.query.cursor, 0, 0, 2e9);
  const { rows } = await pool.query('SELECT driver_id, full_name, licence_no, erased_at FROM driver WHERE tenant_id=$1 AND driver_id > $2 ORDER BY driver_id LIMIT $3', [req.user.tenant, after, limit]);
  res.json({ data: rows, next_cursor: rows.length === limit ? cursorOf(rows, 'driver_id') : null });
}));
api.get('/admin/audit', need('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT audit_id, user_id, action, resource, status, at FROM audit_log WHERE tenant_id=$1 ORDER BY audit_id DESC LIMIT 50', [req.user.tenant]);
  res.json({ data: rows });
}));

app.use((_q, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, _q, res, _n) => { logger.error({ err: err.message }, 'unhandled'); res.status(err.status || 500).json({ error: 'internal' }); });
const server = app.listen(4000, () => logger.info('api listening :4000'));
const stop = async () => { server.close(); await pool.end(); await ch.close(); await mg.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
