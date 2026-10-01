// Streaming, per-vehicle rule engine using event time. Memory is O(active vehicles); lazily allocated.
import { SlidingWindow } from '../shared/window.js';
import { EwmaZ } from '../shared/ewma.js';

const MIN = 60000;
export const RULES = {
  IDLING_EXCESSIVE: { severity: 'warning' },
  HARSH_BRAKE_BURST: { severity: 'warning' },
  DTC_REPEAT: { severity: 'critical' },
  OVERSPEED_ANOMALY: { severity: 'warning' },
  LOW_FUEL: { severity: 'info' },
};

export class RuleEngine {
  constructor({ idleMinutes = 10, cooldownMs = 15 * MIN } = {}) {
    this.idleMs = idleMinutes * MIN; this.cooldownMs = cooldownMs; this.state = new Map();
  }
  _s(vin) {
    let s = this.state.get(vin);
    if (!s) { s = { idleSince: null, idleAlerted: false, brake: null, dtc: null, z: null, last: {} }; this.state.set(vin, s); }
    return s;
  }
  _emit(out, s, code, t, ev, detail) {
    if (s.last[code] !== undefined && t - s.last[code] < this.cooldownMs) return;
    s.last[code] = t;
    out.push({ code, severity: RULES[code].severity, vin: ev.vin, ts: ev.ts, detail });
  }
  evaluate(ev) {
    const out = []; const s = this._s(ev.vin); const t = Date.parse(ev.ts);

    // 1) excessive idling: engine on, not moving, continuously for N minutes
    if (ev.engine_on && ev.speed_kmh < 1) {
      if (s.idleSince === null) { s.idleSince = t; s.idleAlerted = false; }
      else if (!s.idleAlerted && t - s.idleSince >= this.idleMs) {
        s.idleAlerted = true;
        this._emit(out, s, 'IDLING_EXCESSIVE', t, ev, { idle_minutes: Math.round((t - s.idleSince) / MIN) });
      }
    } else { s.idleSince = null; s.idleAlerted = false; }

    // 2) harsh-brake burst: >=3 in 10 min
    if (ev.evt === 'HARSH_BRAKE') {
      s.brake ||= new SlidingWindow(10 * MIN); s.brake.add(t);
      const c = s.brake.count(t);
      if (c >= 3) this._emit(out, s, 'HARSH_BRAKE_BURST', t, ev, { count_10min: c });
    }

    // 3) repeated DTC: same code >=3 times in 1 hour
    for (const code of ev.dtc) {
      s.dtc ||= new Map();
      let w = s.dtc.get(code); if (!w) { w = new SlidingWindow(60 * MIN); s.dtc.set(code, w); }
      w.add(t);
      const c = w.count(t);
      if (c >= 3) this._emit(out, s, 'DTC_REPEAT', t, ev, { code, count_1h: c });
    }

    // 4) speed anomaly: EWMA z-score > 4 and absolute speed > 100 km/h
    s.z ||= new EwmaZ(0.05, 30);
    const z = s.z.update(ev.speed_kmh);
    if (z > 4 && ev.speed_kmh > 100) this._emit(out, s, 'OVERSPEED_ANOMALY', t, ev, { speed_kmh: ev.speed_kmh, z: Number(z.toFixed(1)) });

    // 5) low fuel
    if (ev.fuel_pct != null && ev.fuel_pct < 10) this._emit(out, s, 'LOW_FUEL', t, ev, { fuel_pct: ev.fuel_pct });
    return out;
  }
}
