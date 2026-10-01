import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleEngine } from '../src/processor/rules.js';
import { parseNdjson, fallbackKey } from '../src/ingest/parse.js';
import { vinForIndex } from '../src/shared/fleetgen.js';

const vin = vinForIndex(1);
const base = { vin, oem: 'B', lat: 1, lon: 1, speed_kmh: 50, odo_km: 1, fuel_pct: 50, engine_on: true, rpm: 2000, dtc: [], evt: null, seq: 1, schema_ver: 1 };
const at = (sec, o = {}) => ({ ...base, ...o, ts: new Date(1_700_000_000_000 + sec * 1000).toISOString() });

test('idling alert after threshold, once per episode', () => {
  const r = new RuleEngine({ idleMinutes: 1 }); const alerts = [];
  for (let s = 0; s < 200; s++) alerts.push(...r.evaluate(at(s, { speed_kmh: 0 })));
  assert.equal(alerts.filter((a) => a.code === 'IDLING_EXCESSIVE').length, 1);
  assert.equal(alerts[0].severity, 'warning');
});
test('idle resets when vehicle moves', () => {
  const r = new RuleEngine({ idleMinutes: 1 });
  for (let s = 0; s < 50; s++) r.evaluate(at(s, { speed_kmh: 0 }));
  r.evaluate(at(51, { speed_kmh: 40 }));
  let got = []; for (let s = 52; s < 100; s++) got.push(...r.evaluate(at(s, { speed_kmh: 0 })));
  assert.equal(got.length, 0);
});
test('engine off is not idling', () => {
  const r = new RuleEngine({ idleMinutes: 1 }); let n = 0;
  for (let s = 0; s < 300; s++) n += r.evaluate(at(s, { speed_kmh: 0, engine_on: false })).length;
  assert.equal(n, 0);
});
test('harsh brake burst needs 3 in window', () => {
  const r = new RuleEngine(); const out = [];
  out.push(...r.evaluate(at(0, { evt: 'HARSH_BRAKE' })), ...r.evaluate(at(10, { evt: 'HARSH_BRAKE' })));
  assert.equal(out.length, 0);
  out.push(...r.evaluate(at(20, { evt: 'HARSH_BRAKE' })));
  assert.equal(out[0].code, 'HARSH_BRAKE_BURST');
});
test('harsh brakes far apart do not alert', () => {
  const r = new RuleEngine(); let n = 0;
  for (const s of [0, 700, 1400, 2100]) n += r.evaluate(at(s, { evt: 'HARSH_BRAKE' })).length;
  assert.equal(n, 0);
});
test('repeated DTC is critical, cooldown suppresses duplicates', () => {
  const r = new RuleEngine(); const out = [];
  for (let s = 0; s < 6; s++) out.push(...r.evaluate(at(s * 10, { dtc: ['P0301'] })));
  assert.equal(out.length, 1); assert.equal(out[0].code, 'DTC_REPEAT'); assert.equal(out[0].severity, 'critical'); assert.equal(out[0].detail.code, 'P0301');
});
test('cooldown expires', () => {
  const r = new RuleEngine({ cooldownMs: 60000 }); let n = 0;
  for (const s of [0, 1, 2, 500, 501, 502]) n += r.evaluate(at(s, { dtc: ['P0420'] })).length;
  assert.equal(n, 2);
});
test('speed anomaly after stable baseline', () => {
  const r = new RuleEngine(); let hit = null;
  for (let s = 0; s < 80; s++) r.evaluate(at(s, { speed_kmh: 50 + (s % 3) }));
  hit = r.evaluate(at(81, { speed_kmh: 150 })).find((a) => a.code === 'OVERSPEED_ANOMALY');
  assert.ok(hit && hit.detail.z > 4);
});
test('low fuel info alert', () => {
  const r = new RuleEngine(); const a = r.evaluate(at(0, { fuel_pct: 5 }));
  assert.equal(a[0].code, 'LOW_FUEL'); assert.equal(a[0].severity, 'info');
  assert.equal(new RuleEngine().evaluate(at(0, { fuel_pct: null })).length, 0);
});

test('ndjson: isolates bad lines, honours max lines', () => {
  const r = parseNdjson('{"a":1}\nnot json\n[1,2]\n\n{"b":2}\n');
  assert.equal(r.valid.length, 2); assert.equal(r.invalid.length, 2);
  assert.deepEqual(r.invalid.map((i) => i.reason), ['bad_json', 'not_object']);
  const big = parseNdjson('{"a":1}\n'.repeat(10), 5);
  assert.equal(big.valid.length, 5); assert.ok(big.truncated);
});
test('fallback partition key', () => {
  assert.equal(fallbackKey({ chassis: 'X' }), 'X'); assert.equal(fallbackKey({ v: 'Y' }), 'Y'); assert.equal(fallbackKey({ n: 1 }), null);
});
