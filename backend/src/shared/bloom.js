// Bloom filter for cheap "definitely new" dedup checks. add/has O(k), space O(m) bits.
export class BloomFilter {
  constructor(bits = 1 << 25, k = 4) {
    this.m = bits; this.k = k; this.buf = new Uint8Array(bits >>> 3); this.n = 0;
  }
  _hashes(s) {
    let h1 = 0x811c9dc5, h2 = 5381;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) + c) >>> 0;
    }
    return [h1, h2 | 1];
  }
  add(s) {
    const [a, b] = this._hashes(s);
    for (let i = 0; i < this.k; i++) {
      const idx = ((a + Math.imul(i, b)) >>> 0) % this.m;
      this.buf[idx >>> 3] |= 1 << (idx & 7);
    }
    this.n++;
  }
  has(s) {
    const [a, b] = this._hashes(s);
    for (let i = 0; i < this.k; i++) {
      const idx = ((a + Math.imul(i, b)) >>> 0) % this.m;
      if (!(this.buf[idx >>> 3] & (1 << (idx & 7)))) return false;
    }
    return true;
  }
  // theoretical false-positive probability at current fill
  fpRate() { return Math.pow(1 - Math.exp((-this.k * this.n) / this.m), this.k); }
  reset() { this.buf.fill(0); this.n = 0; }
}
