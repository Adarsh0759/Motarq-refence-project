// NDJSON batch parser: bad lines are isolated, never fail the whole batch. O(total bytes).
export function parseNdjson(text, maxLines = 5000) {
  const valid = [], invalid = [];
  let truncated = false, n = 0;
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    if (++n > maxLines) { truncated = true; break; }
    try {
      const o = JSON.parse(l);
      if (o && typeof o === 'object' && !Array.isArray(o)) valid.push(o);
      else invalid.push({ line: l.slice(0, 300), reason: 'not_object' });
    } catch { invalid.push({ line: l.slice(0, 300), reason: 'bad_json' }); }
  }
  return { valid, invalid, truncated };
}

const VIN_KEYS = ['vin', 'VIN', 'vehicleId', 'v', 'chassis'];
export function fallbackKey(o) { for (const k of VIN_KEYS) if (typeof o[k] === 'string') return o[k]; return null; }
