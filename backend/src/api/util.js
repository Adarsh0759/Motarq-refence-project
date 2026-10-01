import { cfg } from '../shared/config.js';

export const clampInt = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

// Viewers never see precise coordinates (~110 m resolution at 3 dp) - GDPR/DPDP location masking.
export function maskLocation(obj, role) {
  if (role !== 'viewer' || !obj) return obj;
  const m = { ...obj };
  for (const k of ['lat', 'lon']) if (m[k] !== undefined && m[k] !== null && m[k] !== '') m[k] = Number(Number(m[k]).toFixed(3));
  return m;
}

// Estimated idling cost in INR from idle sample count (each event represents sampleSeconds).
export function idleCost(idleEvents, c = cfg) {
  const hours = (idleEvents * c.sampleSeconds) / 3600;
  const litres = hours * c.idleLitresPerHour;
  return { idle_hours: Number(hours.toFixed(3)), litres: Number(litres.toFixed(3)), cost_inr: Number((litres * c.fuelInrPerLitre).toFixed(2)) };
}

// Transparent rule-based fallback if the ML service is down (graceful degradation).
export function ruleRisk(f) {
  const s = 4 * f.dtc_ratio * 100 + 3 * f.harsh_ratio * 100 + 1.5 * f.idle_ratio + 2 * f.overspeed_ratio * 10 + 1 * f.lowfuel_ratio;
  return Math.max(0, Math.min(1, s / 10));
}

export const cursorOf = (rows, key) => (rows.length ? String(rows[rows.length - 1][key]) : null);
