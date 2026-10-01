from contextlib import asynccontextmanager
from typing import Dict, List
import numpy as np
from fastapi import FastAPI
from joblib import load
from pydantic import BaseModel, Field
from features import FEATURES

state = {}

@asynccontextmanager
async def lifespan(_):
    state["bundle"] = load("model.joblib")
    yield

app = FastAPI(title="FleetNorm ML", lifespan=lifespan)

class Row(BaseModel):
    vin: str = Field(min_length=17, max_length=17)
    features: Dict[str, float]

class Req(BaseModel):
    rows: List[Row] = Field(max_length=2000)

@app.get("/healthz")
def healthz(): return {"ok": True}

@app.post("/predict")
def predict(req: Req):
    if not req.rows: return {"predictions": []}
    b = state["bundle"]
    X = np.array([[r.features.get(f, 0.0) for f in FEATURES] for r in req.rows], dtype=float)
    p = b["model"].predict_proba(X)[:, 1]
    return {"predictions": [{"vin": r.vin, "risk": float(x)} for r, x in zip(req.rows, p)], "threshold": b["threshold"]}
