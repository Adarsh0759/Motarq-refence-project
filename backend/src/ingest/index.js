// Ingest service: device-authenticated NDJSON batches -> Kafka (partitioned by VIN).
// Idempotency is enforced downstream (vin+seq). Back-pressure = 429 when too many messages are in flight; circuit breaker on the producer.
import crypto from 'node:crypto';
import express from 'express';
import { Kafka, CompressionTypes, logLevel } from 'kafkajs';
import CircuitBreaker from 'opossum';
import { cfg } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { client, register } from '../shared/metrics.js';
import { mongo, redis } from '../shared/db.js';
import { MappingCache } from '../shared/mappings.js';
import { getPath } from '../processor/normalise.js';
import { parseNdjson, fallbackKey } from './parse.js';

const accepted = new client.Counter({ name: 'ingest_events_accepted_total', help: 'events produced to Kafka', labelNames: ['oem'] });
const rejected = new client.Counter({ name: 'ingest_events_rejected_total', help: 'unparseable lines', labelNames: ['reason'] });
const throttled = new client.Counter({ name: 'ingest_throttled_total', help: 'requests answered 429/503', labelNames: ['why'] });
const inflightG = new client.Gauge({ name: 'ingest_inflight_messages', help: 'messages awaiting broker ack' });
const produceH = new client.Histogram({ name: 'ingest_produce_seconds', help: 'produce latency per batch', buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2] });

const kafka = new Kafka({ clientId: 'ingest', brokers: cfg.kafkaBrokers, logLevel: logLevel.WARN, retry: { retries: 8 } });
const producer = kafka.producer({ allowAutoTopicCreation: false, idempotent: false });
const sendBreaker = new CircuitBreaker((messages) => producer.send({ topic: cfg.topic, messages, acks: -1, compression: CompressionTypes.GZIP }),
  { timeout: 15000, errorThresholdPercentage: 50, resetTimeout: 5000, volumeThreshold: 5 });
sendBreaker.on('open', () => logger.warn('producer circuit OPEN'));
sendBreaker.on('close', () => logger.info('producer circuit closed'));

const mongoClient = await mongo(); const db = mongoClient.db(cfg.mongoDb);
const sub = redis({ enableReadyCheck: false }); const mappings = new MappingCache(db, sub); await mappings.start();
await producer.connect();

let inflight = 0; let ready = true;
const eq = (a, b) => { const x = Buffer.from(a || ''), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_q, r) => r.send('ok'));
app.get('/readyz', (_q, r) => (ready && !sendBreaker.opened ? r.send('ready') : r.status(503).send('not ready')));
app.get('/metrics', async (_q, r) => { r.set('Content-Type', register.contentType); r.end(await register.metrics()); });

app.post('/v1/ingest/:oem', express.text({ type: '*/*', limit: '8mb' }), async (req, res) => {
  if (!eq(req.get('x-api-key'), cfg.deviceKey)) return res.status(401).json({ error: 'unauthorized' });
  const oem = req.params.oem;
  if (!/^[A-Z0-9_-]{1,20}$/.test(oem)) return res.status(400).json({ error: 'bad_oem' });
  if (typeof req.body !== 'string' || !req.body.length) return res.status(400).json({ error: 'empty_body' });
  if (inflight > cfg.maxInflight) { throttled.inc({ why: 'inflight' }); return res.set('Retry-After', '1').status(429).json({ error: 'back_pressure' }); }
  if (sendBreaker.opened) { throttled.inc({ why: 'circuit' }); return res.set('Retry-After', '5').status(503).json({ error: 'broker_unavailable' }); }

  const { valid, invalid, truncated } = parseNdjson(req.body);
  if (invalid.length) {
    rejected.inc({ reason: 'parse' }, invalid.length);
    db.collection('dead_letter').insertMany(invalid.slice(0, 20).map((i) => ({ ...i, oem, stage: 'ingest', at: new Date() }))).catch(() => {});
  }
  if (!valid.length) return res.status(422).json({ accepted: 0, rejected: invalid.length });

  const m = mappings.get(oem); const vp = m?.fields?.vin?.path;
  const now = Date.now();
  const messages = valid.map((p) => ({ key: (vp ? getPath(p, vp) : null) ?? fallbackKey(p), value: JSON.stringify({ oem, r: now, p }) }));
  inflight += messages.length; inflightG.set(inflight);
  const end = produceH.startTimer();
  try {
    await sendBreaker.fire(messages);
    accepted.inc({ oem }, messages.length);
    res.status(202).json({ accepted: messages.length, rejected: invalid.length, truncated });
  } catch (e) {
    throttled.inc({ why: 'produce_error' });
    logger.error({ err: e.message }, 'produce failed');
    res.set('Retry-After', '2').status(503).json({ error: 'produce_failed' });
  } finally { end(); inflight -= messages.length; inflightG.set(inflight); }
});

app.use((err, _q, res, _n) => res.status(err.status || 500).json({ error: err.type || 'internal' }));
const server = app.listen(4001, () => logger.info('ingest listening :4001'));
const shutdown = async () => { ready = false; server.close(); await producer.disconnect().catch(() => {}); await mongoClient.close(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
