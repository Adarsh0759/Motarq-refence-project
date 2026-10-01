// Sliding time-window counter (event time). add O(1) amortised, count O(1) amortised.
export class SlidingWindow {
  constructor(ms) { this.ms = ms; this.q = []; this.h = 0; }
  prune(now) {
    while (this.h < this.q.length && this.q[this.h] <= now - this.ms) this.h++;
    if (this.h > 256 && this.h * 2 > this.q.length) { this.q = this.q.slice(this.h); this.h = 0; }
  }
  add(ts) { this.q.push(ts); this.prune(ts); }
  count(now) { this.prune(now); return this.q.length - this.h; }
}
