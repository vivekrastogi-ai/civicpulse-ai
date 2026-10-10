import os
import re
import sys
import time
from datetime import date as _date, timedelta
from functools import lru_cache

import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(ROOT, ".env"))
sys.path.insert(0, os.path.join(ROOT, "ml", "evaluation"))
sys.path.insert(0, os.path.dirname(__file__))
from explain import RiskModel  # noqa: E402
from live import get_live_daily  # noqa: E402

TABLE_PATH = os.path.join(ROOT, "ml", "data", "processed", "training_table.parquet")
NAMES_PATH = os.path.join(ROOT, "ml", "data", "processed", "cell_names.csv")
STATIC_PATH = os.path.join(ROOT, "ml", "data", "processed", "cell_static_features.csv")
RAINMAP_PATH = os.path.join(ROOT, "ml", "data", "processed", "cell_rain_point_map.csv")

RAIN_FEATURES = ["rain_mm", "rain_max_1h", "rain_prev1d",
                 "rain_prev3d", "rain_prev7d", "rain_prev30d"]

GEMINI_MODEL = "gemini-3.8-flash"

app = FastAPI(
    title="CivicPulse AI",
    description="Delhi waterlogging risk prediction (prototype, SYNTHETIC data par trained). "
                "Emergency warning system nahi hai.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


from community import router as community_router  # noqa: E402
from auth import router as auth_router  # noqa: E402

app.include_router(community_router)
app.include_router(auth_router)

from oauth import router as oauth_router  # noqa: E402

app.include_router(oauth_router)


@lru_cache(maxsize=1)
def get_model() -> RiskModel:
    return RiskModel()


@lru_cache(maxsize=1)
def get_table() -> pd.DataFrame:
    df = pd.read_parquet(TABLE_PATH)
    return df[df["year"] == 2024].reset_index(drop=True)


@lru_cache(maxsize=1)
def get_names() -> dict:
    n = pd.read_csv(NAMES_PATH)
    return dict(zip(n["cell_id"], n["place_name"]))


@lru_cache(maxsize=1)
def get_base() -> pd.DataFrame:
    """Har cell ke static features + rain point + history ka average."""
    s = pd.read_csv(STATIC_PATH)
    m = pd.read_csv(RAINMAP_PATH)
    m["rain_lat"] = m["rain_lat"].round(1)
    m["rain_lon"] = m["rain_lon"].round(1)
    hist = get_table().groupby("cell_id").agg(
        inc_last30d=("inc_last30d", "mean"),
        inc_past_years=("inc_past_years", "mean"),
    ).reset_index()
    base = s.merge(m, on="cell_id").merge(hist, on="cell_id", how="left")
    base[["inc_last30d", "inc_past_years"]] = base[["inc_last30d", "inc_past_years"]].fillna(0)
    return base


@lru_cache(maxsize=1)
def rain_points() -> list:
    b = get_base()[["rain_lat", "rain_lon"]].drop_duplicates()
    return [(float(a), float(c)) for a, c in b.values]


def day_frame(date: str):
    """Date ke liye (dataframe, mode) lautao. mode = 'observed' ya 'forecast'."""
    ts = pd.Timestamp(date)
    t = get_table()
    day = t[t["date"] == ts]
    if not day.empty:
        return day, "observed"
    today = pd.Timestamp(_date.today())
    if today - timedelta(days=2) <= ts <= today + timedelta(days=7):
        try:
            daily = get_live_daily(rain_points())
        except Exception as e:
            print("Live weather error:", e)
            raise HTTPException(503, "Live weather abhi nahi mil paya, thodi der baad try karo.")
        d = daily[daily["date"] == ts]
        if d.empty:
            raise HTTPException(404, "Is date ka forecast nahi mila.")
        df = get_base().merge(
            d.drop(columns=[]), on=["rain_lat", "rain_lon"], how="left"
        )
        df["date"] = ts
        df["month"] = ts.month
        df["dayofyear"] = ts.dayofyear
        df = df.dropna(subset=["rain_mm"]).reset_index(drop=True)
        return df, "forecast"
    raise HTTPException(
        404,
        "Is date ka data nahi hai. Aaj se 2 din pehle se 7 din aage tak, ya June-Sept 2024 chuno.",
    )


def one_row(cell_id: int, date: str):
    day, mode = day_frame(date)
    row = day[day["cell_id"] == cell_id]
    if row.empty:
        raise HTTPException(404, "Is cell ka data nahi mila.")
    return row, mode


def precautions_for(level: str, factors: list, rain: float) -> list:
    tips = []
    labels = " ".join(f["label"] for f in factors if f["direction"] == "increases_risk").lower()
    if level == "High":
        tips += [
            "Is ilaake mein gaadi se jaane se bachein, khaaskar underpass aur neeche wali sadakon par.",
            "Zaroori kaam na ho toh ghar ya daftar se hi kaam karein.",
            "Basement aur ground floor ka saamaan unchai par rakhein.",
            "Bijli ke switch aur extension board pani se door rakhein.",
            "Mobile aur power bank charge rakhein, zaroori numbers (112, MCD) saath rakhein.",
        ]
    elif level == "Medium":
        tips += [
            "Yatra se pehle raasta aur traffic update dekh lein.",
            "Underpass ya nichli sadak ki jagah doosra raasta chunein.",
            "Gaadi ki parking unchi jagah par karein.",
        ]
    else:
        tips += [
            "Abhi risk kam hai, par barish tez ho toh mausam update dekhte rahein.",
            "Naale aur drain ke paas kachra na daalein.",
        ]
    if "underpass" in labels or "tunnel" in labels:
        tips.append("Is cell mein underpass/tunnel hain. Paani bhara dikhe toh andar na ghusein.")
    if "unchai" in labels:
        tips.append("Ye ilaaka aas-paas se neecha hai, paani yahan jama ho sakta hai.")
    if rain >= 64.5:
        tips.append("Barish bahut tez hai. Bijli ke khambe aur khule taaron se door rahein.")
    return tips


def mode_note(mode: str) -> str:
    if mode == "forecast":
        return ("Forecast/live weather par based estimate. Barish forecast mein galti ho sakti hai "
                "(khaaskar 3+ din aage). Incident history ka approximation use hua hai. "
                "Emergency warning nahi.")
    return "2024 ke observed mausam data par based model estimate. Synthetic data par trained prototype."


@app.get("/")
def root():
    return {"app": "CivicPulse AI", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok", "model_version": get_model().meta["model_version"]}


@app.get("/api/v1/dates")
def valid_dates():
    today = _date.today()
    return {
        "today": today.isoformat(),
        "live_from": (today - timedelta(days=2)).isoformat(),
        "live_to": (today + timedelta(days=7)).isoformat(),
        "observed_from": "2024-06-01",
        "observed_to": "2024-09-30",
    }


@app.get("/api/v1/locations")
def list_locations(limit: int = 50):
    df = get_table()
    cells = df.drop_duplicates("cell_id")[["cell_id", "lat", "lon", "elevation"]]
    return cells.head(limit).to_dict(orient="records")


@app.get("/api/v1/search")
def search_places(q: str, limit: int = 6):
    """Jagah ka naam likho. Pehle local naam, phir OpenStreetMap geocoding."""
    cells = get_base()[["cell_id", "lat", "lon"]]
    n = pd.read_csv(NAMES_PATH)
    hit = n[n["place_name"].str.contains(q, case=False, na=False, regex=False)]
    hit = hit.merge(cells, on="cell_id").drop_duplicates("place_name").head(limit)
    results = [
        {"cell_id": int(r.cell_id), "place_name": r.place_name,
         "lat": float(r.lat), "lon": float(r.lon)}
        for r in hit.itertuples()
    ]
    if results:
        return results
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": f"{q}, Delhi, India", "format": "json", "limit": 3,
                    "viewbox": "76.84,28.88,77.35,28.40", "bounded": 1},
            headers={"User-Agent": "civicpulse-ai-demo"},
            timeout=10,
        )
        for p in resp.json():
            lat, lon = float(p["lat"]), float(p["lon"])
            d = (cells["lat"] - lat) ** 2 + ((cells["lon"] - lon) * 0.88) ** 2
            c = cells.loc[d.idxmin()]
            if d.min() > 0.03 ** 2:
                continue
            name = ", ".join(p["display_name"].split(",")[:2])
            results.append({"cell_id": int(c["cell_id"]), "place_name": name,
                            "lat": lat, "lon": lon})
    except Exception as e:
        print("Geocode error:", e)
    return results


@app.get("/api/v1/predict")
def predict(cell_id: int, date: str):
    row, mode = one_row(cell_id, date)
    out = get_model().explain(row)
    out.update(
        cell_id=cell_id,
        date=date,
        mode=mode,
        place_name=get_names().get(cell_id, f"Cell {cell_id}"),
        rain_mm=float(row["rain_mm"].iloc[0]),
        precautions=precautions_for(out["risk_level"], out["top_factors"],
                                    float(row["rain_mm"].iloc[0])),
        disclaimer=mode_note(mode),
    )
    return out


@app.get("/api/v1/risk-map")
def risk_map(date: str):
    day, mode = day_frame(date)
    prob, _ = get_model().predict(day)

    hi_cut = np.quantile(prob, 0.97)
    med_cut = np.quantile(prob, 0.82)
    level = np.where(prob >= hi_cut, "High",
                     np.where(prob >= med_cut, "Medium", "Low"))

    out = pd.DataFrame({
        "cell_id": day["cell_id"].values,
        "place_name": [get_names().get(c, f"Cell {c}") for c in day["cell_id"].values],
        "lat": day["lat"].values,
        "lon": day["lon"].values,
        "risk_probability": np.round(prob, 5),
        "risk_level": level,
        "rain_mm": np.round(day["rain_mm"].values.astype(float), 1),
    })
    summary = out["risk_level"].value_counts().to_dict()
    return {
        "date": date,
        "mode": mode,
        "summary": summary,
        "max_probability": float(np.max(prob)),
        "avg_rain_mm": float(out["rain_mm"].mean()),
        "note": "Map levels us din ke cells ke beech relative hain; probability absolute hai.",
        "cells": out.to_dict(orient="records"),
    }


class SimulationRequest(BaseModel):
    cell_id: int
    date: str
    rain_multiplier: float = 1.0


@app.post("/api/v1/simulations")
def simulate(req: SimulationRequest):
    if not 0 <= req.rain_multiplier <= 3:
        raise HTTPException(400, "rain_multiplier 0 se 3 ke beech hona chahiye.")
    row, mode = one_row(req.cell_id, req.date)

    model = get_model()
    base_prob, _ = model.predict(row)

    scenario = row.copy()
    for col in RAIN_FEATURES:
        scenario[col] = scenario[col].astype(float) * req.rain_multiplier
    sim_prob, _ = model.predict(scenario)
    out = model.explain(scenario)

    return {
        "cell_id": req.cell_id,
        "date": req.date,
        "mode": mode,
        "rain_multiplier": req.rain_multiplier,
        "original_rain_mm": float(row["rain_mm"].iloc[0]),
        "scenario_rain_mm": float(scenario["rain_mm"].iloc[0]),
        "original_probability": round(float(base_prob[0]), 5),
        "scenario_probability": round(float(sim_prob[0]), 5),
        "scenario_level": out["risk_level"],
        "top_factors": out["top_factors"],
        "disclaimer": "What-if model ka estimate hai. Training range se bahar ki barish par bharosa kam hai.",
    }


class ChatRequest(BaseModel):
    cell_id: int
    date: str
    question: str
    place_name: str | None = None


def rule_based_answer(q, info, rain, place, tips):
    prob = info["risk_probability"] * 100
    ups = [f for f in info["top_factors"] if f["direction"] == "increases_risk"]
    downs = [f for f in info["top_factors"] if f["direction"] != "increases_risk"]
    if any(w in q for w in ["jagah", "janga", "place", "kaha", "kahan", "kon sa", "kaun", "location", "area"]):
        return (f"Aap {place} ke aas-paas ke 1 km wale cell ki baat kar rahe ho. "
                f"Is din yahan barish {rain:.1f} mm hai aur model ka risk {prob:.1f}% "
                f"({info['risk_level']}) hai.")
    if any(w in q for w in ["precaution", "savdhani", "kya karu", "kya kare", "bachav", "safety", "tips"]):
        return f"{place} ke liye savdhaniyan: " + " ".join(tips[:4])
    if any(w in q for w in ["why", "kyun", "kyu", "wajah", "reason", "factor"]):
        parts = [f"{f['label']} (value {f['value']:.2f})" for f in ups[:3]]
        ans = (f"{place} ka risk {prob:.1f}% hai. Risk badhane wale factors: "
               + (", ".join(parts) if parts else "koi khaas nahi") + ".")
        if downs:
            ans += f" Risk ghatane wala factor: {downs[0]['label']}."
        return ans
    if any(w in q for w in ["rain", "barish"]):
        return f"{place} mein is din barish {rain:.1f} mm hai. Model ka risk estimate {prob:.1f}% hai."
    top = info["top_factors"][0]
    return (f"{place}: model ke hisaab se risk {prob:.1f}% ({info['risk_level']}) hai. "
            f"Sabse bada factor: {top['label']}. "
            f"Aap 'kyun?', 'savdhani kya rakhein?' ya 'barish 2x ho jaye toh?' pooch sakte ho.")


def gemini_answer(question, facts):
    from google import genai
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    prompt = (
        "Tum CivicPulse AI ke assistant ho (Delhi waterlogging risk prototype). "
        "Sirf neeche diye FACTS ke aadhar par jawab do. Koi nayi sankhya ya baat invent mat karo. "
        "Agar facts mein jawab nahi hai toh saaf bolo ki data nahi hai. "
        "Yaad dilao ki ye model ka estimate hai, verified observation nahi. "
        "Jawab chhota (3-4 vakya) aur saral Hinglish mein do.\n\n"
        f"FACTS:\n{facts}\n\nSAWAL: {question}"
    )
    client = genai.Client(api_key=key)
    last = None
    for attempt in range(3):
        try:
            r = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
            return r.text
        except Exception as e:
            last = e
            if "503" in str(e) or "429" in str(e):
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last


@app.post("/api/v1/assistant/chat")
def chat(req: ChatRequest):
    row, mode = one_row(req.cell_id, req.date)
    info = get_model().explain(row, top_n=5)
    rain = float(row["rain_mm"].iloc[0])
    q = req.question.lower()
    place = req.place_name or get_names().get(req.cell_id, f"Cell {req.cell_id}")
    tips = precautions_for(info["risk_level"], info["top_factors"], rain)

    facts = [
        f"Jagah: {place} (cell {req.cell_id}), date {req.date}",
        f"Data type: {'forecast/live weather' if mode == 'forecast' else '2024 observed weather'}",
        f"Barish: {rain:.1f} mm",
        f"Model risk probability: {info['risk_probability'] * 100:.1f}% ({info['risk_level']})",
        "Top factors (SHAP):",
    ]
    for f in info["top_factors"]:
        facts.append(f"- {f['label']}: value {f['value']:.2f}, "
                     f"{'risk badhata hai' if f['direction'] == 'increases_risk' else 'risk ghatata hai'} "
                     f"(contribution {f['contribution']:+.2f})")
    facts.append("Precautions: " + " | ".join(tips))

    m = re.search(r"(\d+(?:\.\d+)?)\s*(x|guna|times)", q)
    mult = float(m.group(1)) if m else (2.0 if ("double" in q or "dugni" in q) else None)
    sim = None
    if mult is not None and 0 <= mult <= 3:
        sim = simulate(SimulationRequest(cell_id=req.cell_id, date=req.date, rain_multiplier=mult))
        facts.append(f"What-if barish {mult}x: {sim['original_rain_mm']:.1f} mm se "
                     f"{sim['scenario_rain_mm']:.1f} mm, risk {sim['original_probability'] * 100:.1f}% se "
                     f"{sim['scenario_probability'] * 100:.1f}%")

    source = "gemini"
    answer = None
    try:
        answer = gemini_answer(req.question, "\n".join(facts))
    except Exception as e:
        print("Gemini error:", e)
    if not answer:
        source = "rule-based"
        if sim:
            answer = (f"{place}: agar barish {mult}x ho ({sim['original_rain_mm']:.1f} se "
                      f"{sim['scenario_rain_mm']:.1f} mm), risk {sim['original_probability'] * 100:.1f}% "
                      f"se {sim['scenario_probability'] * 100:.1f}% ho jayega.")
        else:
            answer = rule_based_answer(q, info, rain, place, tips)

    return {"answer": answer, "source": source, "disclaimer": mode_note(mode)}

@app.get("/api/v1/timeline")
def timeline(cell_id: int, days: int = 8):
    """Ek cell ka aaj se agle 7 din ka risk."""
    out = []
    today = _date.today()
    for i in range(min(days, 8)):
        d = (today + timedelta(days=i)).isoformat()
        try:
            row, _ = one_row(cell_id, d)
        except HTTPException:
            continue
        prob, _ = get_model().predict(row)
        out.append({"date": d,
                    "rain_mm": round(float(row["rain_mm"].iloc[0]), 1),
                    "risk_probability": round(float(prob[0]), 5)})
    return {"cell_id": cell_id, "place_name": get_names().get(cell_id, f"Cell {cell_id}"), "days": out}


@app.get("/api/v1/compare")
def compare(cell_a: int, cell_b: int, date: str):
    """Do jagah ka risk, barish aur top wajah side-by-side."""
    out = []
    for cid in (cell_a, cell_b):
        row, mode = one_row(cid, date)
        info = get_model().explain(row, top_n=3)
        out.append({
            "cell_id": cid,
            "place_name": get_names().get(cid, f"Cell {cid}"),
            "risk_probability": info["risk_probability"],
            "risk_level": info["risk_level"],
            "rain_mm": round(float(row["rain_mm"].iloc[0]), 1),
            "elevation": round(float(row["elevation"].iloc[0]), 1),
            "top_factors": info["top_factors"],
        })
    safer = min(out, key=lambda x: x["risk_probability"])
    return {"date": date, "mode": mode, "places": out,
            "summary": f"{safer['place_name']} is din relatively kam risk par hai "
                       f"({safer['risk_probability'] * 100:.1f}%). Ye model ka estimate hai."}