import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalise, normaliseAndValidate, getPath, parseTs } from '../src/processor/normalise.js';
import { FORMATS } from '../src/simulator/formats.js';
import { vinForIndex } from '../src/shared/fleetgen.js';

const load = (o) => ({ ...JSON.parse(fs.readFileSync(new URL(`../mappings/oem-${o}.json`, import.meta.url))), version: 1 });
const canon = { vin: vinForIndex(0), ts: new Date('2026-09-25T10:15:02.000Z'), lat: 21.170212, lon: 72.831134, speed_kmh: 64.2,
  odo_km: 18234.7, fuel_pct: 41, engine_on: true, rpm: 2100, dtc: ['P0301', 'P0420'], evt: 'HARSH_BRAKE', seq: 88412 };

for (const oem of ['A', 'B', 'C', 'D', 'E']) {
  test(`OEM ${oem}: wire format -> canonical roundtrip`, () => {
    const raw = JSON.parse(JSON.stringify(FORMATS[oem](canon)));   // simulate the wire
    const r = normaliseAndValidate(raw, load(oem));
    assert.ok(r.ok, r.reason);
    const e = r.event;
    assert.equal(e.vin, canon.vin); assert.equal(e.oem, oem); assert.equal(e.seq, 88412);
    assert.ok(Math.abs(e.speed_kmh - 64.2) < 0.2, `speed ${e.speed_kmh}`);
    assert.ok(Math.abs(e.odo_km - 18234.7) < 0.2, `odo ${e.odo_km}`);
    assert.ok(Math.abs(e.fuel_pct - 41) < 0.6, `fuel ${e.fuel_pct}`);
    assert.ok(Math.abs(e.lat - canon.lat) < 1e-5 && Math.abs(e.lon - canon.lon) < 1e-5);
    assert.equal(e.engine_on, true); assert.deepEqual(e.dtc, ['P0301', 'P0420']); assert.equal(e.evt, 'HARSH_BRAKE');
    assert.ok(Math.abs(Date.parse(e.ts) - canon.ts.getTime()) < 1000);
  });
}

test('engine off + empty dtc + null event roundtrip (OEM C string fields)', () => {
  const off = { ...canon, engine_on: false, speed_kmh: 0, rpm: 0, dtc: [], evt: null };
  const r = normaliseAndValidate(JSON.parse(JSON.stringify(FORMATS.C(off))), load('C'));
  assert.ok(r.ok, r.reason); assert.equal(r.event.engine_on, false); assert.deepEqual(r.event.dtc, []); assert.equal(r.event.evt, null);
});

test('failure reasons: missing field, bad number, bad ts, invalid vin, bad dtc', () => {
  const m = load('B'); const raw = JSON.parse(JSON.stringify(FORMATS.B(canon)));
  assert.equal(normaliseAndValidate({ ...raw, vin: undefined }, m).reason, 'missing:vin');
  assert.equal(normaliseAndValidate({ ...raw, ts: undefined }, m).reason, 'missing:ts');
  assert.equal(normaliseAndValidate({ ...raw, speed_kmh: 'fast' }, m).reason, 'bad_number:speed_kmh');
  assert.equal(normaliseAndValidate({ ...raw, odo_km: null }, m).reason, 'missing:odo_km');
  assert.equal(normaliseAndValidate({ ...raw, ts: 'garbage' }, m).reason, 'bad_ts');
  assert.match(normaliseAndValidate({ ...raw, vin: '1HGCM82613A004352' }, m).reason, /invalid_vin/);
  assert.match(normaliseAndValidate({ ...raw, dtc: ['nope'] }, m).reason, /invalid_dtc/);
  assert.equal(normaliseAndValidate({ ...raw, gps: [999, 0] }, m).ok, false);
});

test('mapping exception path does not throw', () => {
  assert.equal(normaliseAndValidate(null, load('B')).ok, false);
  assert.equal(normaliseAndValidate({}, { oem: 'X', fields: {} }).ok, false);
});

test('parseTs formats + errors', () => {
  assert.equal(parseTs(1758795302000, 'epoch_ms'), '2025-09-25T10:15:02.000Z');
  assert.equal(parseTs(1758795302, 'epoch_s'), '2025-09-25T10:15:02.000Z');
  assert.equal(parseTs('25/09/2025 10:15:02', 'ddmmyyyy_hms'), '2025-09-25T10:15:02.000Z');
  assert.throws(() => parseTs('2025-09-25', 'ddmmyyyy_hms'));
  assert.throws(() => parseTs('nope', 'iso'));
});

test('getPath nested + array index', () => {
  assert.equal(getPath({ a: { b: [5, 6] } }, 'a.b.1'), 6);
  assert.equal(getPath({ a: null }, 'a.b'), undefined);
});

test('zero-downtime onboarding: same payload fails before mapping, passes after', () => {
  const raw = JSON.parse(JSON.stringify(FORMATS.E(canon)));
  assert.equal(normaliseAndValidate(raw, load('B')).ok, false);   // wrong mapping -> dead letter
  assert.ok(normaliseAndValidate(raw, load('E')).ok);            // new mapping -> accepted
});
