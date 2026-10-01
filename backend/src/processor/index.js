// Processor: Kafka -> normalise (hot-reloadable mappings) -> validate -> dedup -> ClickHouse + Redis latest-state -> rules -> alerts.
// Delivery: at-least-once (offset committed after ClickHouse flush) + idempotent dedup on vin:seq  => effectively-once results.
import os from 'node:os';
import { Kafka, logLevel } from 'kafkajs';
import { cfg } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { client, startMetricsServer } from '../shared/metrics.js';
import { mongo, redis, pgPool, clickhouse } from '../shared/db.js';
import { MappingCache } from '../shared/mappings.js';
import { normaliseAndValidate } from './normalise.js';
import { RuleEngine } from './rules.js';

const M = {
  processed: new client.Counter({ name: 'processor_events_total', help: 'events stored', labelNames: ['oem'] }),
  dead: new client.Counter({ name: 'processor_dead_letter_total', help: 'events rejected', labelNames: ['reason'] }),
  dups: new client.Counter({ name: 'processor_dedup_hits_total', help: 'duplicates dropped' }),
  alerts: new client.Counter({ name: 'processor_alerts_total', help: 'alerts raised', labelNames: ['code'] }),
  e2e: new client.Histogram({ name: 'processor_e2e_latency_seconds', help: 'event time -> stored', buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30] }),
  batch: new client.Histogram({ name: 'processor_batch_seconds', help: 'batch processing time', buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5] }),
};
let ready = false;
startMetricsServer(9102, () => ready);

const pool = pgPool(4); const ch = clickhouse(); const r = redis(); const sub = redis({ enableReadyCheck: false });
const mg = await mongo(); const db = mg.db(cfg.mongoDb);
const mappings = new MappingCache(db, sub); await mappings.start();
const rules = new RuleEngine({ idleMinutes: cfg.idleAlertMinutes });

// atomic "set latest only if newer" (handles out-of-order events)
r.defineCommand('setLatest', { numberOfKeys: 1, lua: `
  local cur = redis.call('HGET', KEYS[1], 'ts_ms')
  if cur and tonumber(cur) >= tonumber(ARGV[1]) then return 0 end
  redis.call('HSET', KEYS[1], unpack(ARGV, 2))
  return 1` });

// vin -> { id, fleet, tenant }
let vehicles = new Map(); let alertTypes = new Map();
async function loadRefs() {
  const v = await pool.query('SELECT v.vin, v.vehicle_id, v.fleet_id, f.tenant_id FROM vehicle v JOIN fleet f USING (fleet_id)');
  vehicles = new Map(v.rows.map((x) => [x.vin.trim(), { id: x.vehicle_id, fleet: x.fleet_id, tenant: x.tenant_id }]));
  alertTypes = new Map((await pool.query('SELECT code, alert_type_id FROM alert_type')).rows.map((x) => [x.code, x.alert_type_id]));
  logger.info({ vehicles: vehicles.size }, 'reference data loaded');
}
await loadRefs(); setInterval(() => loadRefs().catch((e) => logger.error(e)), 60000);

// dead-letter: Mongo gets a rate-limited sample; Redis counts everything (shown in UI)
let dlqBudget = 200; setInterval(() => { dlqBudget = 200; }, 1000);
function deadLetter(reason, oem, payload, bucket) {
  const key = reason.split(':').slice(0, 2).join(':');
  M.dead.inc({ reason: key.slice(0, 40) });
  bucket.set(key, (bucket.get(key) || 0) + 1);
  if (dlqBudget-- > 0) db.collection('dead_letter').insertOne({ reason, oem, stage: 'processor', payload, at: new Date() }).catch(() => {});
}

let epsCount = 0; const host = os.hostname();
setInterval(() => { r.set(`stats:eps:${host}`, epsCount, 'EX', 5).catch(() => {}); epsCount = 0; }, 1000);

const kafka = new Kafka({ clientId: `processor-${host}`, brokers: cfg.kafkaBrokers, logLevel: logLevel.WARN });
const consumer = kafka.consumer({ groupId: 'fleetnorm-processor', maxWaitTimeInMs: 300, minBytes: 64 * 1024, maxBytesPerPartition: 2 * 1024 * 1024, sessionTimeout: 30000 });

async function handleBatch({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) {
  const end = M.batch.startTimer();
  const rows = [], evs = [], dl = new Map();
  for (const msg of batch.messages) {
    let env; try { env = JSON.parse(msg.value.toString()); } catch { deadLetter('bad_envelope', null, null, dl); continue; }
    const mapping = mappings.get(env.oem);
    if (!mapping) { deadLetter('no_mapping', env.oem, env.p, dl); continue; }
    const res = normaliseAndValidate(env.p, mapping);
    if (!res.ok) { deadLetter(res.reason, env.oem, env.p, dl); continue; }
    const ev = res.event; const veh = vehicles.get(ev.vin);
    if (!veh) { deadLetter('unknown_vehicle', env.oem, env.p, dl); continue; }
    evs.push({ ev, veh, key: `${ev.vin}:${ev.seq}:${ev.ts}` });
  }

  // --- dedup (check -> store -> mark). Keys are only marked AFTER the ClickHouse insert succeeds, so a crash before the insert can never lose data
  //     (replay re-processes it). A crash between insert and mark may re-insert one batch: ClickHouse block-level insert dedup absorbs identical replays,
  //     and infra/chaos/*.sh reports any residual duplicate rows honestly. key = vin:seq:ts so a simulator restart is not mistaken for duplicates. ---
  const seen = new Set(); const cand = [];
  for (const x of evs) { if (seen.has(x.key)) M.dups.inc(); else { seen.add(x.key); cand.push(x); } }
  const prior = cand.length ? await r.mget(cand.map((x) => `dd:${x.key}`)) : [];
  const keep = [];
  cand.forEach((x, i) => { if (prior[i] === null) keep.push(x); else M.dups.inc(); });

  if (keep.length) {
    for (const { ev, veh } of keep) rows.push({ fleet_id: veh.fleet, vin: ev.vin, ts: ev.ts, lat: ev.lat, lon: ev.lon, speed_kmh: ev.speed_kmh, odo_km: ev.odo_km,
      fuel_pct: ev.fuel_pct ?? 0, engine_on: ev.engine_on ? 1 : 0, rpm: Math.round(ev.rpm ?? 0), dtc: ev.dtc, evt: ev.evt ?? '', seq: ev.seq, oem: ev.oem });
    await ch.insert({ table: 'telemetry', values: rows, format: 'JSONEachRow', clickhouse_settings: { insert_deduplicate: 1, async_insert_deduplicate: 1 } });
    const mark = r.pipeline(); for (const x of keep) mark.set(`dd:${x.key}`, 1, 'EX', 3600, 'NX'); await mark.exec();

    // --- latest state + live index (only if newer) ---
    const p2 = r.pipeline(); const now = Date.now();
    for (const { ev, veh } of keep) {
      const t = Date.parse(ev.ts);
      p2.setLatest(`latest:${ev.vin}`, t, 'ts_ms', t, 'ts', ev.ts, 'lat', ev.lat, 'lon', ev.lon, 'speed_kmh', ev.speed_kmh, 'fuel_pct', ev.fuel_pct ?? '', 'engine_on', ev.engine_on ? 1 : 0,
        'rpm', ev.rpm ?? '', 'odo_km', ev.odo_km, 'oem', ev.oem, 'evt', ev.evt ?? '', 'fleet_id', veh.fleet, 'vin', ev.vin);
      p2.zadd(`live:${veh.fleet}`, 'GT', t, ev.vin);
      M.e2e.observe(Math.max(0, (now - t) / 1000)); M.processed.inc({ oem: ev.oem });
    }
    await p2.exec();
    epsCount += keep.length;

    // --- streaming rules -> alerts ---
    const newAlerts = [];
    for (const { ev, veh } of keep) for (const a of rules.evaluate(ev)) newAlerts.push({ ...a, veh });
    if (newAlerts.length) {
      const ins = await pool.query(
        `INSERT INTO alert(vehicle_id, alert_type_id, severity, raised_at, detail)
         SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::timestamptz[], $5::jsonb[]) RETURNING alert_id`,
        [newAlerts.map((a) => a.veh.id), newAlerts.map((a) => alertTypes.get(a.code)), newAlerts.map((a) => a.severity), newAlerts.map((a) => a.ts), newAlerts.map((a) => JSON.stringify(a.detail))]);
      const p3 = r.pipeline();
      newAlerts.forEach((a, i) => {
        M.alerts.inc({ code: a.code });
        p3.publish('alerts', JSON.stringify({ alert_id: ins.rows[i].alert_id, tenant_id: a.veh.tenant, vin: a.vin, code: a.code, severity: a.severity, ts: a.ts, detail: a.detail }));
      });
      await p3.exec();
    }
  }
  if (dl.size) { const p4 = r.pipeline(); for (const [k, n] of dl) p4.incrby(`dlq:count:${k}`, n); await p4.exec(); }

  resolveOffset(batch.messages[batch.messages.length - 1].offset);
  await commitOffsetsIfNecessary(); await heartbeat(); end();
}

await consumer.connect();
await consumer.subscribe({ topic: cfg.topic, fromBeginning: true });
await consumer.run({ autoCommit: false, eachBatchAutoResolve: false, partitionsConsumedConcurrently: 3, eachBatch: handleBatch });
ready = true; logger.info('processor running');

const shutdown = async () => { ready = false; await consumer.disconnect().catch(() => {}); await ch.close(); await mg.close(); await pool.end(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
