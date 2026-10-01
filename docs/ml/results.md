# ML component: 7-day breakdown-risk ranking

**What:** `ml/train.py` (scikit-learn GradientBoosting) → `ml/serve.py` (FastAPI `/predict`) → API `/api/insights/risk` (circuit breaker; rule-based fallback if the service is down, tested).
**Features (per vehicle, from the hourly rollup):** idle ratio, harsh-brake ratio, DTC ratio, overspeed ratio, low-fuel ratio, km/hour, odometer.

## Results (measured; `python ml/train.py`, seed 42; 40,000 synthetic vehicles, 10,000 held-out; positive rate 17.7 %)
| Model | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|
| Rule baseline (best-F1 thresholds on DTC / harsh-brake, tuned on train) | 0.392 | 0.505 | 0.441 | 0.737 |
| GradientBoosting (operating threshold 0.281, chosen on train) | 0.487 | 0.460 | 0.473 | 0.784 |

**Reading this honestly**
- The model beats a tuned rule baseline, but **modestly** (+0.03 F1, +0.05 AUC). The baseline is deliberately not a strawman.
- **These labels are synthetic.** They come from a hidden wear model written in `train.py`, so absolute numbers are optimistic and say nothing about real fleets. This demonstrates the method, leakage-free thresholding (chosen on train, reported on test) and serving, not real-world accuracy.
- Training uses `random_state` fixes and a stratified split; no hyper-parameter search was run, so there is no tuning leakage to disclose.
- Sanity check on serving: a healthy profile scored 0.04 and a worn profile 0.91; a malformed VIN is rejected with HTTP 422.
- No AI is used anywhere else in the request path (ADR-5).

**To improve with real data:** time-based split (train on earlier weeks), calibration, per-OEM drift monitoring, cost-weighted threshold.
