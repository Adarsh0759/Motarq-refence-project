"""Train a 7-day breakdown-risk model on SYNTHETIC vehicle aggregates and compare to a rule baseline.

IMPORTANT: labels come from a hidden wear model we define here, so absolute scores are optimistic.
This demonstrates the method + evaluation discipline, not real-world accuracy. Numbers printed are real (measured)."""
import json, sys
import numpy as np
from joblib import dump
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from features import FEATURES

rng = np.random.default_rng(42)
N = 40000


def make(n):
    wear = rng.beta(2, 5, n)                     # latent health (0 good .. 1 worn)
    age = rng.uniform(5_000, 250_000, n)
    aggressive = rng.random(n) < 0.15
    idle = np.clip(0.08 + 0.25 * wear + rng.normal(0, 0.05, n), 0, 1)
    harsh = rng.gamma(2, 0.0002 * (1 + 6 * aggressive + 3 * wear))
    dtc = np.where(rng.random(n) < (0.05 + 0.5 * wear ** 2), rng.gamma(2, 0.004 * (1 + 4 * wear)), 0.0)
    over = np.clip(rng.gamma(2, 0.004 * (1 + 3 * aggressive)), 0, 1)
    low = np.clip(rng.gamma(2, 0.003, n), 0, 1)
    kmh = np.clip(rng.normal(28, 9, n), 0, None)
    X = np.column_stack([idle, harsh, dtc, over, low, kmh, age])
    logit = -5.2 + 5.5 * wear + 1.6 * (age / 250_000) + 40 * dtc + 600 * harsh + rng.normal(0, 0.6, n)
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)
    return X, y


X, y = make(N)
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=7, stratify=y)

# ---- baseline: best single-threshold rule on (dtc_ratio OR harsh_ratio), tuned on train for F1 ----
best = (0, None)
for td in np.quantile(Xtr[:, 2], np.linspace(0.5, 0.99, 25)):
    for th in np.quantile(Xtr[:, 1], np.linspace(0.5, 0.99, 25)):
        pred = ((Xtr[:, 2] > td) | (Xtr[:, 1] > th)).astype(int)
        f = f1_score(ytr, pred, zero_division=0)
        if f > best[0]: best = (f, (td, th))
td, th = best[1]
base_pred = ((Xte[:, 2] > td) | (Xte[:, 1] > th)).astype(int)
base_score = np.clip(Xte[:, 2] / (td + 1e-9), 0, 3) + np.clip(Xte[:, 1] / (th + 1e-9), 0, 3)

# ---- model ----
clf = GradientBoostingClassifier(n_estimators=150, max_depth=3, learning_rate=0.08, random_state=1)
clf.fit(Xtr, ytr)
p = clf.predict_proba(Xte)[:, 1]
# operating point: choose the threshold that maximises F1 on TRAIN (no test leakage)
ptr = clf.predict_proba(Xtr)[:, 1]
ths = np.linspace(0.05, 0.9, 60)
thr = ths[int(np.argmax([f1_score(ytr, (ptr >= t).astype(int), zero_division=0) for t in ths]))]
pred = (p >= thr).astype(int)

def m(yt, yp, sc): return dict(precision=round(precision_score(yt, yp, zero_division=0), 4), recall=round(recall_score(yt, yp), 4), f1=round(f1_score(yt, yp), 4), roc_auc=round(roc_auc_score(yt, sc), 4))
res = {"n_vehicles": N, "positive_rate": round(float(y.mean()), 4), "test_size": int(len(yte)),
       "baseline_rule": m(yte, base_pred, base_score), "gradient_boosting": m(yte, pred, p), "model_threshold": round(float(thr), 3)}
print(json.dumps(res, indent=2))
dump({"model": clf, "features": FEATURES, "threshold": float(thr)}, "model.joblib")
json.dump(res, open("metrics.json", "w"), indent=2)
