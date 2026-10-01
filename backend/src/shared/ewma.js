// Exponentially weighted moving mean/variance -> streaming z-score. O(1) per sample.
export class EwmaZ {
  constructor(alpha = 0.05, warmup = 20) { this.alpha = alpha; this.warmup = warmup; this.mean = 0; this.var = 0; this.n = 0; }
  update(x) {
    if (this.n === 0) { this.mean = x; this.var = 0; this.n = 1; return 0; }
    const sd = Math.sqrt(this.var);
    const z = this.n >= this.warmup && sd > 1e-9 ? (x - this.mean) / sd : 0;
    const d = x - this.mean;
    this.mean += this.alpha * d;
    this.var = (1 - this.alpha) * (this.var + this.alpha * d * d);
    this.n++;
    return z;
  }
}
