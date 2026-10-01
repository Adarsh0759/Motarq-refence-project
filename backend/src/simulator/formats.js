// Five different OEM wire formats (units, field names, time formats, nesting all differ).
const pad = (n) => String(n).padStart(2, '0');
const ddmmyyyy = (d) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const r = (x, p) => Number(x.toFixed(p));

// ev: { vin, ts:Date, lat, lon, speed_kmh, odo_km, fuel_pct(0-100), engine_on, rpm, dtc[], evt|null, seq }
export const FORMATS = {
  A: (e) => ({ vehicleId: e.vin, timestamp: e.ts.getTime(), position: { latitude: r(e.lat, 6), longitude: r(e.lon, 6) },
    velocityMph: r(e.speed_kmh / 1.609344, 1), odometerMiles: r(e.odo_km / 1.609344, 2), fuelLevel: r(e.fuel_pct / 100, 3),
    ignition: e.engine_on ? 'ON' : 'OFF', engineRpm: e.rpm, faultCodes: e.dtc, event: e.evt, sequence: e.seq }),
  B: (e) => ({ vin: e.vin, ts: e.ts.toISOString(), gps: [r(e.lat, 6), r(e.lon, 6)], speed_kmh: r(e.speed_kmh, 1),
    odo_km: r(e.odo_km, 2), fuel_pct: r(e.fuel_pct, 1), engine_on: e.engine_on, rpm: e.rpm, dtc: e.dtc, evt: e.evt, seq: e.seq }),
  C: (e) => ({ VIN: e.vin, time: ddmmyyyy(e.ts), lat: r(e.lat, 6), lng: r(e.lon, 6), speedMs: r(e.speed_kmh / 3.6, 2),
    odoKm: r(e.odo_km, 2), fuelPercent: String(r(e.fuel_pct, 1)), engine: e.engine_on ? 1 : 0, rpm: e.rpm, codes: e.dtc.join(';'),
    evt: e.evt ?? '', n: e.seq }),
  D: (e) => ({ v: e.vin, t: Math.floor(e.ts.getTime() / 1000), la: r(e.lat, 6), lo: r(e.lon, 6), spd_mph: r(e.speed_kmh / 1.609344, 1),
    odo_mi: r(e.odo_km / 1.609344, 2), fl: r(e.fuel_pct, 1), eng: e.engine_on, r: e.rpm, d: e.dtc, e: e.evt, s: e.seq }),
  E: (e) => ({ chassis: e.vin, unixTime: e.ts.getTime(), coords: { y: r(e.lat, 6), x: r(e.lon, 6) }, kph: r(e.speed_kmh, 1),
    odometer: r(e.odo_km, 2), fuel: r(e.fuel_pct / 100, 3), running: e.engine_on ? 'Y' : 'N', revs: e.rpm, dtcList: e.dtc,
    event: e.evt, counter: e.seq }),
};
