import test from 'node:test';
import assert from 'node:assert/strict';
import { clampInt, maskLocation, idleCost, ruleRisk, cursorOf } from '../src/api/util.js';

test('clampInt bounds + defaults', () => {
  assert.equal(clampInt('500', 50, 1, 200), 200); assert.equal(clampInt('-5', 50, 1, 200), 1);
  assert.equal(clampInt('abc', 50, 1, 200), 50); assert.equal(clampInt(undefined, 7, 1, 9), 7);
});
test('viewer location masked to 3dp; manager untouched', () => {
  const row = { lat: 13.082712345, lon: 80.270798765, speed: 40 };
  assert.deepEqual(maskLocation(row, 'viewer'), { lat: 13.083, lon: 80.271, speed: 40 });
  assert.equal(maskLocation(row, 'manager').lat, 13.082712345);
  assert.equal(maskLocation(null, 'viewer'), null);
});
test('idle cost: 3600 events at 1Hz = 1h -> 0.8L -> 76 INR with defaults', () => {
  const c = idleCost(3600, { sampleSeconds: 1, idleLitresPerHour: 0.8, fuelInrPerLitre: 95 });
  assert.equal(c.idle_hours, 1); assert.equal(c.litres, 0.8); assert.equal(c.cost_inr, 76);
  assert.equal(idleCost(0).cost_inr, 0);
});
test('rule fallback risk bounded 0..1 and monotonic in DTCs', () => {
  const base = { idle_ratio: 0.1, harsh_ratio: 0, dtc_ratio: 0, overspeed_ratio: 0, lowfuel_ratio: 0 };
  assert.ok(ruleRisk({ ...base, dtc_ratio: 0.05 }) > ruleRisk(base));
  assert.equal(ruleRisk({ ...base, dtc_ratio: 10 }), 1); assert.ok(ruleRisk(base) >= 0);
});
test('cursorOf', () => { assert.equal(cursorOf([{ id: 1 }, { id: 9 }], 'id'), '9'); assert.equal(cursorOf([], 'id'), null); });
