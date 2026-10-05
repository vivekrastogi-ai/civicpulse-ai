import os
import sys
from functools import lru_cache

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ml/evaluation/explain.py import karne ke liye
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ml", "evaluation"))
from explain import RiskModel  # noqa: E402

TABLE_PATH = os.path.join(ROOT, "ml", "data", "processed", "training_table.parquet")

RAIN_FEATURES = ["rain_mm", "rain_max_1h", "rain_prev1d",
                 "rain_prev3d", "rain_prev7d", "rain_prev30d"]

app = FastAPI(
    title="CivicPulse AI",
    description="Delhi waterlogging risk prediction (prototype, SYNTHETIC data par trained). "
                "Emergency warning system nahi hai.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_model() -> RiskModel:
    return RiskModel()


@lru_cache(maxsize=1)
def get_table() -> pd.DataFrame:
    df = pd.read_parquet(TABLE_PATH)
    return df[df["year"] == 2024].reset_index(drop=True)   # demo ke liye 2024


@app.get("/")
def root():
    return {"app": "CivicPulse AI", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok", "model_version": get_model().meta["model_version"]}


@app.get("/api/v1/locations")
def list_locations(limit: int = 50):
    df = get_table()
    cells = df.drop_duplicates("cell_id")[["cell_id", "lat", "lon", "elevation"]]
    return cells.head(limit).to_dict(orient="records")


@app.get("/api/v1/predict")
def predict(cell_id: int, date: str):
    """Ek cell aur date (2024 monsoon) ke liye risk + explanation."""
    df = get_table()
    row = df[(df["cell_id"] == cell_id) & (df["date"] == pd.Timestamp(date))]
    if row.empty:
        raise HTTPException(404, "Is cell/date ka data nahi mila (date 2024-06-01 se 2024-09-30 ke beech do).")
    out = get_model().explain(row)
    out.update(cell_id=cell_id, date=date,
               disclaimer="Model estimate hai, verified observation nahi. Synthetic data par trained prototype.")
    return out


@app.get("/api/v1/risk-map")
def risk_map(date: str):
    """Ek din ke saare cells ka risk (map ke liye)."""
    df = get_table()
    day = df[df["date"] == pd.Timestamp(date)]
    if day.empty:
        raise HTTPException(404, "Is date ka data nahi mila (2024-06-01 se 2024-09-30).")
    prob, _ = get_model().predict(day)

    # Map ke liye relative level: us din ke top 3% High, agle 15% Medium
    hi_cut = np.quantile(prob, 0.97)
    med_cut = np.quantile(prob, 0.82)
    level = np.where(prob >= hi_cut, "High",
                     np.where(prob >= med_cut, "Medium", "Low"))

    out = pd.DataFrame({
        "cell_id": day["cell_id"].values,
        "lat": day["lat"].values,
        "lon": day["lon"].values,
        "risk_probability": np.round(prob, 5),
        "risk_level": level,
        "rain_mm": day["rain_mm"].values,
    })
    summary = out["risk_level"].value_counts().to_dict()
    return {
        "date": date,
        "summary": summary,
        "note": "Map levels us din ke cells ke beech relative hain; probability absolute hai.",
        "cells": out.to_dict(orient="records"),
    }


class SimulationRequest(BaseModel):
    cell_id: int
    date: str
    rain_multiplier: float = 1.0


@app.post("/api/v1/simulations")
def simulate(req: SimulationRequest):
    """What-if: barish ko scale karke risk dobara nikalo."""
    if not 0 <= req.rain_multiplier <= 3:
        raise HTTPException(400, "rain_multiplier 0 se 3 ke beech hona chahiye.")
    df = get_table()
    row = df[(df["cell_id"] == req.cell_id) & (df["date"] == pd.Timestamp(req.date))]
    if row.empty:
        raise HTTPException(404, "Is cell/date ka data nahi mila.")

    model = get_model()
    base_prob, _ = model.predict(row)

    scenario = row.copy()
    for col in RAIN_FEATURES:
        scenario[col] = scenario[col] * req.rain_multiplier
    sim_prob, _ = model.predict(scenario)
    out = model.explain(scenario)

    return {
        "cell_id": req.cell_id,
        "date": req.date,
        "rain_multiplier": req.rain_multiplier,
        "original_rain_mm": float(row["rain_mm"].iloc[0]),
        "scenario_rain_mm": float(scenario["rain_mm"].iloc[0]),
        "original_probability": round(float(base_prob[0]), 5),
        "scenario_probability": round(float(sim_prob[0]), 5),
        "scenario_level": out["risk_level"],
        "top_factors": out["top_factors"],
        "disclaimer": "What-if model ka estimate hai (synthetic data par trained). "
                      "Training range se bahar ki barish par bharosa kam hai.",
    }