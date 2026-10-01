# Algorithms & data structures (all in `backend/src`, all unit-tested)

| Component | Structure / algorithm | Time | Space | Used for |
|---|---|---|---|---|
| `shared/vin.js` | ISO 3779 weighted check digit | O(17) | O(1) | reject corrupt VINs before they hit storage |
| `shared/geohash.js` | interleaved-bit bisection encode/decode | O(p) | O(1) | spatial bucketing (library + tested; the map uses raw coordinates) |
| `shared/haversine.js` | great-circle formula | O(1) | O(1) | distance checks |
| `shared/ewma.js` | EWMA mean/variance → z-score | O(1)/sample | O(1)/vehicle | speed-anomaly rule |
| `shared/window.js` | array + moving head (amortised queue) | O(1) amortised | O(events in window) | harsh-brake burst, repeated DTC |
| `shared/bloom.js` | Bloom filter, FNV + double hashing | O(k) | O(m) bits | implemented + tested, **not on the hot path** (ADR-4) |
| `processor/normalise.js` | path lookup + unit/format conversion driven by a versioned mapping | O(fields) | O(1) | normalise 5 OEM formats with zero code change per OEM |
| `processor/rules.js` | per-vehicle state machine, event-time windows, cooldown | O(1) amortised/event | O(active vehicles) | idling, harsh-brake, DTC, overspeed, low fuel |
| API pagination | keyset (`id > cursor ORDER BY id LIMIT n`) | O(log n + k) | O(k) | no OFFSET scan cost at 100K+ rows |
| Redis latest-state | Lua compare-and-set on `ts_ms` | O(1) | O(vehicles) | out-of-order safety |
