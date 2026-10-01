// Generic mapping-driven normaliser: raw OEM payload + versioned mapping -> canonical event.
import { CanonicalEvent } from '../shared/schema.js';

export class MappingError extends Error { constructor(code) { super(code); this.code = code; } }

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const SPEED = { kmh: 1, kph: 1, mph: 1.609344, ms: 3.6 };
const DIST = { km: 1, mi: 1.609344 };

export function parseTs(v, format = 'iso') {
  let d;
  if (format === 'epoch_ms') d = new Date(Number(v));
  else if (format === 'epoch_s') d = new Date(Number(v) * 1000);
  else if (format === 'ddmmyyyy_hms') {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(v));
    if (!m) throw new MappingError('bad_ts');
    d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]));
  } else d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new MappingError('bad_ts');
  return d.toISOString();
}

function num(spec, raw, name, factor = 1) {
  const v = getPath(raw, spec.path);
  if (v === undefined || v === null || v === '') throw new MappingError(`missing:${name}`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new MappingError(`bad_number:${name}`);
  return n * factor * (spec.scale ?? 1);
}

const optNum = (spec, raw, factor = 1) => {
  if (!spec) return null;
  const v = getPath(raw, spec.path);
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n * factor * (spec.scale ?? 1) : null;
};

export function normalise(raw, mapping) {
  const f = mapping.fields;
  const vinV = getPath(raw, f.vin.path);
  if (vinV == null) throw new MappingError('missing:vin');
  const tsV = getPath(raw, f.ts.path);
  if (tsV == null) throw new MappingError('missing:ts');

  let dtc = [];
  if (f.dtc) {
    const d = getPath(raw, f.dtc.path);
    if (Array.isArray(d)) dtc = d.map((x) => String(x).toUpperCase());
    else if (typeof d === 'string' && d.length) dtc = d.split(f.dtc.split || ',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  }
  let engine = false;
  if (f.engine_on) {
    const e = getPath(raw, f.engine_on.path);
    engine = (f.engine_on.truthy || [true]).some((t) => t === e || String(t) === String(e));
  }
  const evt = f.evt ? getPath(raw, f.evt.path) : null;
  return {
    vin: String(vinV).toUpperCase(),
    oem: mapping.oem,
    ts: parseTs(tsV, f.ts.format),
    lat: num(f.lat, raw, 'lat'),
    lon: num(f.lon, raw, 'lon'),
    speed_kmh: Math.max(0, num(f.speed_kmh, raw, 'speed_kmh', SPEED[f.speed_kmh.unit || 'kmh'])),
    odo_km: num(f.odo_km, raw, 'odo_km', DIST[f.odo_km.unit || 'km']),
    fuel_pct: optNum(f.fuel_pct, raw),
    engine_on: engine,
    rpm: optNum(f.rpm, raw),
    dtc,
    evt: evt == null || evt === '' ? null : String(evt).toUpperCase(),
    seq: num(f.seq, raw, 'seq'),
    schema_ver: mapping.version ?? 1,
  };
}

// Returns { ok: true, event } or { ok: false, reason }.
export function normaliseAndValidate(raw, mapping) {
  try {
    const ev = normalise(raw, mapping);
    const r = CanonicalEvent.safeParse(ev);
    if (!r.success) {
      const i = r.error.issues[0];
      return { ok: false, reason: `invalid:${i.path.join('.')}:${i.message}` };
    }
    return { ok: true, event: r.data };
  } catch (e) {
    return { ok: false, reason: e instanceof MappingError ? e.code : 'mapping_exception' };
  }
}
