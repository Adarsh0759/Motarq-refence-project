// Geohash encode/decode. O(precision) time.
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encode(lat, lon, precision = 7) {
  let idx = 0, bit = 0, even = true, hash = '';
  const latR = [-90, 90], lonR = [-180, 180];
  while (hash.length < precision) {
    const r = even ? lonR : latR;
    const v = even ? lon : lat;
    const mid = (r[0] + r[1]) / 2;
    if (v >= mid) { idx = idx * 2 + 1; r[0] = mid; } else { idx = idx * 2; r[1] = mid; }
    even = !even;
    if (++bit === 5) { hash += B32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

export function decode(hash) {
  let even = true;
  const latR = [-90, 90], lonR = [-180, 180];
  for (const c of hash) {
    const cd = B32.indexOf(c);
    if (cd < 0) throw new Error('invalid geohash');
    for (let mask = 16; mask > 0; mask >>= 1) {
      const r = even ? lonR : latR;
      const mid = (r[0] + r[1]) / 2;
      if (cd & mask) r[0] = mid; else r[1] = mid;
      even = !even;
    }
  }
  return { lat: (latR[0] + latR[1]) / 2, lon: (lonR[0] + lonR[1]) / 2, latErr: (latR[1] - latR[0]) / 2, lonErr: (lonR[1] - lonR[0]) / 2 };
}
