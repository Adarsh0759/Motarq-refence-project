import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidVin, makeVin, checkDigit } from '../src/shared/vin.js';
import { encode, decode } from '../src/shared/geohash.js';
import { BloomFilter } from '../src/shared/bloom.js';
import { EwmaZ } from '../src/shared/ewma.js';
import { SlidingWindow } from '../src/shared/window.js';
import { haversineKm } from '../src/shared/haversine.js';
import { CanonicalEvent, DTC_RE, MappingInput } from '../src/shared/schema.js';
import { oemForIndex, vinForIndex } from '../src/shared/fleetgen.js';

test('VIN: known-valid sample from the brief', () => assert.ok(isValidVin('1HGCM82633A004352')));
test('VIN: wrong check digit rejected', () => assert.ok(!isValidVin('1HGCM82613A004352')));
test('VIN: I/O/Q and bad length rejected', () => {
  assert.ok(!isValidVin('1HGCM8263IA004352'));
  assert.ok(!isValidVin('1HGCM8263OA004352'));
  assert.ok(!isValidVin('1HGCM8263QA004352'));
  assert.ok(!isValidVin('SHORT'));
  assert.ok(!isValidVin(12345));
});
test('VIN: check digit X handled', () => {
  // find any synthetic vin whose check digit is X and confirm it validates
  let found = null;
  for (let i = 1; i < 5000 && !found; i++) { const v = makeVin(i); if (v[8] === 'X') found = v; }
  assert.ok(found && isValidVin(found) && checkDigit(found) === 'X');
});
test('VIN: makeVin valid + unique across 100k', () => {
  const s = new Set();
  for (let i = 1; i <= 100000; i++) { const v = makeVin(i); if (i % 997 === 0) assert.ok(isValidVin(v)); s.add(v); }
  assert.equal(s.size, 100000);
});
test('fleetgen deterministic', () => { assert.equal(vinForIndex(5), makeVin(6)); assert.equal(oemForIndex(7), 'C'); });

test('geohash: reference value + roundtrip', () => {
  assert.equal(encode(57.64911, 10.40744, 11), 'u4pruydqqvj');
  const d = decode(encode(21.1702, 72.8311, 8));
  assert.ok(Math.abs(d.lat - 21.1702) < 0.001 && Math.abs(d.lon - 72.8311) < 0.001);
  assert.throws(() => decode('a!'));
});

test('bloom: no false negatives, low false positives', () => {
  const b = new BloomFilter(1 << 22, 4);
  for (let i = 0; i < 50000; i++) b.add('k' + i);
  for (let i = 0; i < 50000; i++) assert.ok(b.has('k' + i));
  let fp = 0; for (let i = 0; i < 20000; i++) if (b.has('x' + i)) fp++;
  assert.ok(fp / 20000 < 0.01, `fp=${fp / 20000}`);
  assert.ok(b.fpRate() < 0.01);
  b.reset(); assert.ok(!b.has('k1'));
});

test('ewma z-score flags spike after warmup, not before', () => {
  const e = new EwmaZ(0.05, 20);
  for (let i = 0; i < 60; i++) e.update(50 + (i % 3));
  assert.ok(e.update(140) > 4);
  const cold = new EwmaZ(); cold.update(50); assert.equal(cold.update(500), 0);
});

test('sliding window counts within horizon only', () => {
  const w = new SlidingWindow(1000);
  [0, 100, 200, 1500].forEach((t) => w.add(t));
  assert.equal(w.count(1500), 1);
  assert.equal(w.count(1100), 1); // only t=1500 remains after pruning
  const big = new SlidingWindow(10); for (let i = 0; i < 2000; i++) big.add(i * 100);
  assert.equal(big.count(199900), 1);
});

test('haversine: Chennai-Bengaluru ~290km', () => {
  const d = haversineKm(13.0827, 80.2707, 12.9716, 77.5946);
  assert.ok(d > 280 && d < 300);
  assert.equal(haversineKm(1, 1, 1, 1), 0);
});

test('schema: DTC regex + canonical validation', () => {
  assert.ok(DTC_RE.test('P0301')); assert.ok(!DTC_RE.test('X0301')); assert.ok(!DTC_RE.test('P4301'));
  const ok = { vin: '1HGCM82633A004352', oem: 'B', ts: '2026-09-25T10:15:02.120Z', lat: 21.17, lon: 72.83, speed_kmh: 64.2, odo_km: 18234.7,
    fuel_pct: 41, engine_on: true, rpm: 2000, dtc: ['P0301'], evt: 'HARSH_BRAKE', seq: 88412, schema_ver: 1 };
  assert.ok(CanonicalEvent.safeParse(ok).success);
  assert.ok(!CanonicalEvent.safeParse({ ...ok, lat: 123 }).success);
  assert.ok(!CanonicalEvent.safeParse({ ...ok, vin: 'BADVIN' }).success);
  assert.ok(!CanonicalEvent.safeParse({ ...ok, dtc: ['ZZZ'] }).success);
});

test('mapping input schema accepts good, rejects bad', () => {
  const good = { oem: 'E', fields: { vin: { path: 'a' }, ts: { path: 'b', format: 'iso' }, lat: { path: 'c' }, lon: { path: 'd' }, speed_kmh: { path: 'e', unit: 'mph' }, odo_km: { path: 'f' }, seq: { path: 'g' } } };
  assert.ok(MappingInput.safeParse(good).success);
  assert.ok(!MappingInput.safeParse({ ...good, oem: 'bad oem!' }).success);
  assert.ok(!MappingInput.safeParse({ oem: 'E', fields: {} }).success);
});
