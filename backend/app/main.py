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
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(ROOT, ".env"))
sys.path.insert(0, os.path.join(ROOT, "ml", "evaluation"))
sys.path.insert(0, os.path.dirname(__file__))
from explain import RiskModel  # noqa: E402
from live import get_live_daily  # noqa: E402
from auth import is_premium, optional_user  # noqa: E402

TABLE_PATH = os.path.join(ROOT, "ml", "data", "processed", "training_table_2024.parquet")
NAMES_PATH = os.path.join(ROOT, "ml", "data", "processed", "cell_names.csv")
STATIC_PATH = os.path.join(ROOT, "ml", "data", "processed", "cell_static_features.csv")
RAINMAP_PATH = os.path.join(ROOT, "ml", "data", "processed", "cell_rain_point_map.csv")

RAIN_FEATURES = ["rain_mm", "rain_max_1h", "rain_prev1d",
                 "rain_prev3d", "rain_prev7d", "rain_prev30d"]

GEMINI_MODEL = "gemini-3.8-flash"

app = FastAPI(
    title="CivicPulse AI",
    description="Delhi waterlogging risk prediction (prototype, trained on SYNTHETIC data). "
                "Not an emergency warning system.",
    version="0.3.0",
)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(os.path.join(ROOT, "backend", "uploads"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=os.path.join(ROOT, "backend", "uploads")), name="uploads")

from community import router as community_router  # noqa: E402
from auth import router as auth_router  # noqa: E402
from payments import router as payments_router  # noqa: E402
from oauth import router as oauth_router  # noqa: E402

app.include_router(community_router)
app.include_router(auth_router)
app.include_router(payments_router)
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
    """Static features per cell + rain point + average incident history."""
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


_ARCHIVE_CACHE = {}


def day_frame(date: str):
    """Return (dataframe, mode) for a date. mode: observed | forecast | observed_live."""
    ts = pd.Timestamp(date)
    t = get_table()
    day = t[t["date"] == ts]
    if not day.empty:
        return day, "observed"
    today = pd.Timestamp(_date.today())
    if ts > today + timedelta(days=15):
        raise HTTPException(404, "Forecast is available only up to 15 days ahead.")
    try:
        if ts >= today - timedelta(days=2):
            daily = get_live_daily(rain_points())
            d = daily[daily["date"] == ts]
            mode = "forecast"
        else:
            if date not in _ARCHIVE_CACHE:
                from live import fetch_archive_day
                _ARCHIVE_CACHE[date] = fetch_archive_day(rain_points(), date)
            d = _ARCHIVE_CACHE[date]
            mode = "observed_live"
    except Exception as e:
        print("Weather error:", e)
        raise HTTPException(503, "Weather data is unavailable right now. Please try again shortly.")
    if d.empty:
        raise HTTPException(404, "No weather data found for this date.")
    df = get_base().merge(d, on=["rain_lat", "rain_lon"], how="left")
    df["date"] = ts
    df["month"] = ts.month
    df["dayofyear"] = ts.dayofyear
    df = df.dropna(subset=["rain_mm"]).reset_index(drop=True)
    return df, mode


def one_row(cell_id: int, date: str):
    day, mode = day_frame(date)
    row = day[day["cell_id"] == cell_id]
    if row.empty:
        raise HTTPException(404, "No data found for this cell.")
    return row, mode


def precautions_for(level: str, factors: list, rain: float) -> list:
    tips = []
    labels = " ".join(f["label"] for f in factors if f["direction"] == "increases_risk").lower()
    if level == "High":
        tips += [
            "Avoid driving through this area, especially underpasses and low-lying roads.",
            "Work from home if you can.",
            "Move valuables in basements and ground floors to a higher place.",
            "Keep electrical switches and extension boards away from water.",
            "Keep your phone and power bank charged and save emergency numbers (112, MCD).",
        ]
    elif level == "Medium":
        tips += [
            "Check the route and traffic updates before you travel.",
            "Choose an alternative to underpasses and low-lying roads.",
            "Park your vehicle on higher ground.",
        ]
    else:
        tips += [
            "Risk is low right now, but keep an eye on weather updates if rain intensifies.",
            "Do not dump garbage near drains.",
        ]
    if "underpass" in labels or "tunnel" in labels:
        tips.append("This area has underpasses/tunnels. Do not enter if you see standing water.")
    if "elevation" in labels:
        tips.append("This area is lower than its surroundings, so water can collect here.")
    if rain >= 64.5:
        tips.append("Rain is very heavy. Stay away from electric poles and exposed wires.")
    return tips


def mode_note(mode: str) -> str:
    if mode == "forecast":
        return ("Estimate based on forecast/live weather. The rainfall forecast can be wrong "
                "(especially 3+ days ahead). Incident history is approximated. Not an emergency warning.")
    if mode == "observed_live":
        return "Model estimate based on observed weather data. Not an emergency warning."
    return "Model estimate based on observed 2024 weather. Prototype trained on synthetic data."


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
        "live_to": (today + timedelta(days=15)).isoformat(),
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
    """Search a place name: local names first, then OpenStreetMap geocoding."""
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
    m = get_model()
    level = np.where(prob >= m.high_thr, "High",
                     np.where(prob >= m.low_thr, "Medium", "Low"))
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
        "note": "Risk levels use the model's absolute thresholds; probability is the model estimate.",
        "cells": out.to_dict(orient="records"),
    }


class SimulationRequest(BaseModel):
    cell_id: int
    date: str
    rain_multiplier: float = 1.0


@app.post("/api/v1/simulations")
def simulate(req: SimulationRequest):
    if not 0 <= req.rain_multiplier <= 3:
        raise HTTPException(400, "rain_multiplier must be between 0 and 3.")
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
        "disclaimer": "What-if is a model estimate. It is less reliable outside the rainfall range seen in training.",
    }


class ChatRequest(BaseModel):
    cell_id: int
    date: str
    question: str
    place_name: str | None = None


def _has(q: str, words) -> bool:
    return any(w in q for w in words)


def rule_based_answer(q, info, rain, place, tips):
    prob = info["risk_probability"] * 100
    ups = [f for f in info["top_factors"] if f["direction"] == "increases_risk"]
    downs = [f for f in info["top_factors"] if f["direction"] != "increases_risk"]
    if _has(q, ["place", "where", "location", "area", "jagah", "kahan", "kaha"]):
        return (f"You are asking about the 1 km cell around {place}. On this day the rainfall there is "
                f"{rain:.1f} mm and the model's risk is {prob:.1f}% ({info['risk_level']}).")
    if _has(q, ["precaution", "safety", "tips", "what should i do", "what to do", "savdhani", "bachav"]):
        return f"Precautions for {place}: " + " ".join(tips[:4])
    if _has(q, ["why", "reason", "factor", "cause", "kyun", "kyu", "wajah"]):
        parts = [f"{f['label']} (value {f['value']:.2f})" for f in ups[:3]]
        ans = (f"The risk for {place} is {prob:.1f}%. Factors raising the risk: "
               + (", ".join(parts) if parts else "none in particular") + ".")
        if downs:
            ans += f" Factor lowering the risk: {downs[0]['label']}."
        return ans
    if _has(q, ["rain", "barish"]):
        return f"Rainfall at {place} on this day is {rain:.1f} mm. The model's risk estimate is {prob:.1f}%."
    top = info["top_factors"][0]
    return (f"{place}: the model estimates a risk of {prob:.1f}% ({info['risk_level']}). "
            f"The biggest factor is: {top['label']}. "
            f"You can ask 'why?', 'what precautions should I take?' or 'what if rain is 2x?'.")


def gemini_answer(question, facts):
    from google import genai
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    prompt = (
        "You are the assistant of CivicPulse AI (a Delhi waterlogging risk prototype). "
        "Answer ONLY from the FACTS below. Do not invent numbers or claims. "
        "If the facts do not contain the answer, say the data is not available. "
        "Remind the user that this is a model estimate, not a verified observation. "
        "Reply in short (3-4 sentences), simple English.\n\n"
        f"FACTS:\n{facts}\n\nQUESTION: {question}"
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
        f"Place: {place} (cell {req.cell_id}), date {req.date}",
        f"Data type: {'forecast/live weather' if mode == 'forecast' else 'observed weather'}",
        f"Rainfall: {rain:.1f} mm",
        f"Model risk probability: {info['risk_probability'] * 100:.1f}% ({info['risk_level']})",
        "Top factors (SHAP):",
    ]
    for f in info["top_factors"]:
        facts.append(f"- {f['label']}: value {f['value']:.2f}, "
                     f"{'raises risk' if f['direction'] == 'increases_risk' else 'lowers risk'} "
                     f"(contribution {f['contribution']:+.2f})")
    facts.append("Precautions: " + " | ".join(tips))

    m = re.search(r"(\d+(?:\.\d+)?)\s*(x|times|guna)", q)
    mult = float(m.group(1)) if m else (2.0 if ("double" in q or "twice" in q or "dugni" in q) else None)
    sim = None
    if mult is not None and 0 <= mult <= 3:
        sim = simulate(SimulationRequest(cell_id=req.cell_id, date=req.date, rain_multiplier=mult))
        facts.append(f"What-if rain {mult}x: {sim['original_rain_mm']:.1f} mm to "
                     f"{sim['scenario_rain_mm']:.1f} mm, risk {sim['original_probability'] * 100:.1f}% to "
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
            answer = (f"{place}: if the rain were {mult}x ({sim['original_rain_mm']:.1f} mm to "
                      f"{sim['scenario_rain_mm']:.1f} mm), the risk would change from "
                      f"{sim['original_probability'] * 100:.1f}% to {sim['scenario_probability'] * 100:.1f}%.")
        else:
            answer = rule_based_answer(q, info, rain, place, tips)

    return {"answer": answer, "source": source, "disclaimer": mode_note(mode)}


@app.get("/api/v1/timeline")
def timeline(cell_id: int, days: int = 8):
    """Risk for one cell for today and the next 7 days."""
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
    """Side-by-side risk, rainfall and top factors for two places."""
    out = []
    mode = "observed"
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
            "summary": f"{safer['place_name']} has the lower risk on this day "
                       f"({safer['risk_probability'] * 100:.1f}%). This is a model estimate."}


@app.get("/api/v1/model-info")
def model_info():
    meta = get_model().meta
    return {
        "model_version": meta.get("model_version"),
        "data": meta.get("data"),
        "features": meta.get("features"),
        "test_metrics": meta.get("test_metrics"),
        "limitations": [
            "Incidents are synthetic; the model learned the generator's rules, not real causes of waterlogging.",
            "Rainfall resolution is about 10 km, so neighbouring cells share the same rainfall.",
            "Temperature and humidity are proxies for rain, not causes.",
            "Live mode uses an approximation of incident history.",
            "This is a prototype, not an emergency warning system.",
        ],
    }


@app.get("/api/v1/analytics")
def analytics(date: str, top: int = 10):
    """One-day overview: top risky areas, distribution, rainfall."""
    day, mode = day_frame(date)
    prob, _ = get_model().predict(day)
    names = get_names()
    df = pd.DataFrame({
        "cell_id": day["cell_id"].values,
        "place_name": [names.get(c, f"Cell {c}") for c in day["cell_id"].values],
        "risk_probability": prob,
        "rain_mm": day["rain_mm"].values.astype(float),
    })
    top_df = df.sort_values("risk_probability", ascending=False).head(min(top, 25))
    buckets = [("<0.5%", 0, 0.005), ("0.5-2%", 0.005, 0.02),
               ("2-8%", 0.02, 0.08), ("8%+", 0.08, 2)]
    dist = [{"label": l, "cells": int(((prob >= lo) & (prob < hi)).sum())} for l, lo, hi in buckets]
    return {
        "date": date,
        "mode": mode,
        "total_cells": int(len(df)),
        "avg_rain_mm": round(float(df["rain_mm"].mean()), 1),
        "max_rain_mm": round(float(df["rain_mm"].max()), 1),
        "max_probability": round(float(prob.max()), 5),
        "avg_probability": round(float(prob.mean()), 5),
        "distribution": dist,
        "top_areas": [
            {"cell_id": int(r.cell_id), "place_name": r.place_name,
             "risk_probability": round(float(r.risk_probability), 5),
             "rain_mm": round(float(r.rain_mm), 1)}
            for r in top_df.itertuples()
        ],
    }


@app.get("/api/v1/route")
def safe_route(from_lat: float, from_lon: float, to_lat: float, to_lon: float, date: str):
    """Routes from A to B with the model's risk along each route."""
    day, mode = day_frame(date)
    prob, _ = get_model().predict(day)
    lats = day["lat"].values.astype(float)
    lons = day["lon"].values.astype(float)
    hi_cut = float(np.quantile(prob, 0.97))

    url = f"https://router.project-osrm.org/route/v1/driving/{from_lon},{from_lat};{to_lon},{to_lat}"
    try:
        r = requests.get(
            url,
            params={"alternatives": "true", "overview": "full", "geometries": "geojson"},
            timeout=20,
        )
        data = r.json()
    except Exception as e:
        print("Routing error:", e)
        raise HTTPException(503, "Routing service is unavailable right now. Please try again shortly.")
    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(404, "No route found between these two places.")

    routes = []
    for rt in data["routes"]:
        coords = rt["geometry"]["coordinates"]  # [lon, lat]
        step = max(1, len(coords) // 80)
        risks = []
        risky_pts = 0
        for lon, lat in coords[::step]:
            d = (lats - lat) ** 2 + ((lons - lon) * 0.88) ** 2
            i = int(d.argmin())
            if d[i] <= 0.02 ** 2:
                p = float(prob[i])
                risks.append(p)
                if p >= hi_cut:
                    risky_pts += 1
        routes.append({
            "distance_km": round(rt["distance"] / 1000, 1),
            "duration_min": round(rt["duration"] / 60),
            "avg_risk": round(float(np.mean(risks)), 5) if risks else 0.0,
            "max_risk": round(float(np.max(risks)), 5) if risks else 0.0,
            "risky_points": risky_pts,
            "geometry": [[c[1], c[0]] for c in coords[::max(1, len(coords) // 400)]],
        })
    safest = min(range(len(routes)), key=lambda k: (routes[k]["avg_risk"], routes[k]["duration_min"]))
    fastest = min(range(len(routes)), key=lambda k: routes[k]["duration_min"])
    return {
        "date": date,
        "mode": mode,
        "safest": safest,
        "fastest": fastest,
        "routes": routes,
        "note": "Risk is a model estimate (trained on synthetic data). Check live traffic and weather updates too.",
    }


@app.get("/api/v1/stress-test")
def stress_test(date: str):
    """Assume X mm of rain over all of Delhi: how many cells become High (other conditions unchanged)."""
    day, mode = day_frame(date)
    model = get_model()
    thr = float(model.high_thr)
    out = []
    for mm in (0, 25, 50, 75, 100, 150):
        sc = day.copy()
        sc["rain_mm"] = float(mm)
        sc["rain_max_1h"] = float(mm) * 0.35
        sc["rain_prev1d"] = day["rain_prev1d"].astype(float)
        sc["rain_prev3d"] = day["rain_prev3d"].astype(float) + mm * 0.5
        p, _ = model.predict(sc)
        out.append({
            "rain_mm": mm,
            "high_cells": int((p >= thr).sum()),
            "avg_risk": round(float(p.mean()), 5),
            "max_risk": round(float(p.max()), 5),
        })
    return {"date": date, "mode": mode, "total_cells": int(len(day)), "steps": out,
            "note": "Assumes the same rainfall over all of Delhi. This is an estimate, not a guarantee."}


@app.get("/api/v1/resilience")
def resilience(cell_id: int):
    """Terrain-based score independent of rain (0-100, higher = better)."""
    base = get_base()
    row = base[base["cell_id"] == cell_id]
    if row.empty:
        raise HTTPException(404, "Cell not found.")
    r = row.iloc[0]

    def pr(col, v, inv=False):
        x = float((base[col] < v).mean())
        return 1 - x if inv else x

    parts = {
        "Elevation": pr("elevation", r["elevation"]),
        "Elevation vs neighbours": pr("local_relief", r["local_relief"]),
        "Drains": pr("drain_length_km", r["drain_length_km"]),
        "Few underpasses": pr("underpass_count", r["underpass_count"], inv=True),
    }
    score = round(100 * sum(parts.values()) / len(parts))
    grade = "Strong" if score >= 65 else "Moderate" if score >= 40 else "Weak"
    return {
        "cell_id": cell_id,
        "place_name": get_names().get(cell_id, f"Cell {cell_id}"),
        "score": score,
        "grade": grade,
        "parts": {k: round(v * 100) for k, v in parts.items()},
        "underpasses": int(r["underpass_count"]),
        "note": "This score reflects only the area's physical setup, not today's rain. It is relative to other Delhi cells.",
    }


def _city_score(prob, m) -> int:
    high = float((prob >= m.high_thr).mean())
    med = float((prob >= m.low_thr).mean())
    avg = float(prob.mean())
    return round(100 * min(1.0, 0.45 * (high / 0.15) + 0.30 * (med / 0.6) + 0.25 * (avg / 0.05)))


@app.get("/api/v1/flood-score")
def flood_score(date: str):
    """Headline score for all of Delhi (0-100). Higher = more risk."""
    day, mode = day_frame(date)
    m = get_model()
    prob, _ = m.predict(day)
    thr = float(m.high_thr)
    score = _city_score(prob, m)
    label = "Low" if score < 15 else "Moderate" if score < 40 else "High" if score < 70 else "Very high"
    avg_rain = float(day["rain_mm"].astype(float).mean())
    if avg_rain < 1:
        reason = "There is almost no rain, so the risk is low."
    elif score < 40:
        reason = f"Light rain (avg {avg_rain:.1f} mm), risk in only a few places."
    else:
        reason = f"Heavy rain (avg {avg_rain:.1f} mm), waterlogging risk in many places."
    return {
        "date": date, "mode": mode, "score": score, "label": label, "reason": reason,
        "high_cells": int((prob >= thr).sum()),
        "medium_cells": int(((prob >= m.low_thr) & (prob < thr)).sum()),
        "total_cells": int(len(prob)),
        "avg_rain_mm": round(avg_rain, 1),
        "note": "A headline estimate based on the model output.",
    }


@app.get("/api/v1/confidence")
def confidence(date: str):
    today = _date.today()
    d = _date.fromisoformat(date)
    delta = (d - today).days
    if delta <= 1:
        level, why = "High", "Weather data is observed or a forecast within 1 day."
    elif delta <= 4:
        level, why = "Medium", "A 2-4 day forecast; the rainfall amount can change."
    else:
        level, why = "Low", "Forecasts 5+ days ahead are less reliable."
    return {
        "date": date, "days_ahead": delta, "level": level, "why": why,
        "model_note": "The model is trained on synthetic data, so place-level accuracy is not yet real-world accuracy.",
    }


@lru_cache(maxsize=1)
def replay_summary():
    """Day-wise headline for June-Sept 2024 (computed once, then cached)."""
    t = get_table()
    m = get_model()
    out = []
    for d, grp in t.groupby("date"):
        prob, _ = m.predict(grp)
        out.append({
            "date": d.date().isoformat(),
            "score": _city_score(prob, m),
            "high_cells": int((prob >= m.high_thr).sum()),
            "avg_rain_mm": round(float(grp["rain_mm"].astype(float).mean()), 1),
        })
    return out


@app.get("/api/v1/replay")
def replay():
    return {"days": replay_summary(),
            "note": "Day-by-day model estimate for the 2024 monsoon (June-Sept)."}


@app.get("/api/v1/reminder-check")
def reminder_check(cell_id: int, date: str, time_hhmm: str = "10:00"):
    """Alert for a place: risk, rainfall and when to leave."""
    row, mode = one_row(cell_id, date)
    info = get_model().explain(row, top_n=2)
    p = info["risk_probability"]
    rain = float(row["rain_mm"].iloc[0])
    lvl = info["risk_level"]
    h, mi = map(int, time_hhmm.split(":"))
    leave_by = f"{(h * 60 + mi - 30) // 60:02d}:{(h * 60 + mi - 30) % 60:02d}"
    if lvl == "Low":
        msg = "Risk is low at this place today. You can leave as usual."
        alert = False
    else:
        msg = (f"Risk at {time_hhmm} today is {lvl} ({p * 100:.1f}%, rain {rain:.1f} mm). "
               f"Leave by {leave_by} or check Safe Route.")
        alert = True
    return {"alert": alert, "level": lvl, "risk_probability": p, "rain_mm": round(rain, 1),
            "leave_by": leave_by, "message": msg, "confidence_mode": mode}


@app.on_event("startup")
def _start_notifier():
    import notifier
    notifier.start(lambda cid, d, t: reminder_check(cid, d, t))


# ---------------- Premium Lab ----------------
def _gate(user, demo: bool) -> bool:
    """True = demo mode. Premium users and admins get full access."""
    if user and is_premium(user):
        return False
    if demo:
        return True
    raise HTTPException(402, "This is a Premium feature. Upgrade to use it.")


@app.get("/api/v1/premium/briefing")
def p_briefing(date: str = "", demo: bool = False, user: dict | None = Depends(optional_user)):
    d = _gate(user, demo)
    date = "2024-09-13" if d else (date or _date.today().isoformat())
    day, mode = day_frame(date)
    m = get_model()
    prob, _ = m.predict(day)
    names = get_names()
    top = []
    for i in np.argsort(-prob)[:5]:
        cid = int(day["cell_id"].iloc[int(i)])
        top.append({"place": names.get(cid, f"Cell {cid}"), "risk": round(float(prob[int(i)]), 5),
                    "rain_mm": round(float(day["rain_mm"].iloc[int(i)]), 1)})
    high = int((prob >= m.high_thr).sum())
    med = int(((prob >= m.low_thr) & (prob < m.high_thr)).sum())
    rain = round(float(day["rain_mm"].astype(float).mean()), 1)
    score = _city_score(prob, m)
    facts = (f"Date: {date}\nDelhi flood score: {score}/100\nHigh cells: {high}, Medium: {med}, total {len(prob)}\n"
             f"Average rain: {rain} mm\nTop areas: " +
             "; ".join(f"{t['place']} {t['risk'] * 100:.1f}% (rain {t['rain_mm']} mm)" for t in top))
    text, source = None, "gemini"
    try:
        text = gemini_answer("Write today's flood briefing for Delhi: the situation, the riskiest areas, and 3 precautions.", facts)
    except Exception as e:
        print("Briefing Gemini error:", e)
    if not text:
        source = "rule-based"
        text = (f"On {date} the Delhi flood score is {score}/100 (average rain {rain} mm). "
                f"{high} cells are High and {med} are Medium. Highest risk: " +
                ", ".join(t["place"] for t in top[:3]) + ". Avoid underpasses and low-lying roads.")
    return {"demo": d, "date": date, "mode": mode, "score": score, "high_cells": high, "medium_cells": med,
            "avg_rain_mm": rain, "top_areas": top, "briefing": text, "source": source,
            "note": "Model estimate, not an emergency alert."}


@app.get("/api/v1/premium/watchlist")
def p_watch(cell_ids: str = "", demo: bool = False, user: dict | None = Depends(optional_user)):
    d = _gate(user, demo)
    m = get_model()
    if d:
        ids, start = [1241, 1501], pd.Timestamp("2024-09-10")
    else:
        ids = [int(x) for x in cell_ids.split(",") if x.strip().isdigit()][:10]
        start = pd.Timestamp(_date.today())
    if not ids:
        raise HTTPException(400, "Choose at least one place.")
    dates = [(start + timedelta(days=i)).date().isoformat() for i in range(7)]
    rows = {i: [] for i in ids}
    for ds in dates:
        try:
            day, _ = day_frame(ds)
            sub = day[day["cell_id"].isin(ids)]
            pm = {}
            if len(sub):
                p, _ = m.predict(sub)
                pm = dict(zip(sub["cell_id"].tolist(), p.tolist()))
        except HTTPException:
            pm = {}
        for i in ids:
            rows[i].append(round(float(pm[i]), 5) if i in pm else None)
    names = get_names()
    return {"demo": d, "dates": dates, "high_thr": float(m.high_thr), "low_thr": float(m.low_thr),
            "places": [{"cell_id": i, "place_name": names.get(i, f"Cell {i}"), "risks": rows[i]} for i in ids]}


@app.get("/api/v1/premium/safety-report")
def p_safety(cell_id: int = 0, demo: bool = False, user: dict | None = Depends(optional_user)):
    d = _gate(user, demo)
    cid = 1241 if d else cell_id
    t = get_table()
    sub = t[t["cell_id"] == cid]
    if sub.empty:
        raise HTTPException(404, "No data found for this place.")
    m = get_model()
    prob, _ = m.predict(sub)
    hi_days = int((prob >= m.high_thr).sum())
    w = int(prob.argmax())
    res = resilience(cid)
    grade = res["grade"]
    advice = []
    if hi_days >= 5:
        advice.append("This place was at high risk repeatedly during the monsoon: avoid keeping valuables in the basement or ground floor.")
    if res["underpasses"] > 0:
        advice.append("There are underpasses nearby: plan your route in advance for rainy days.")
    if grade == "Weak":
        advice.append("The area's terrain is weak (low-lying or few drains): do an on-site inspection before buying or renting property.")
    if not advice:
        advice.append("This place had a good record in the 2024 monsoon. Still, keep checking weather updates.")
    return {"demo": d, "cell_id": cid, "place_name": get_names().get(cid, f"Cell {cid}"),
            "resilience": res["score"], "grade": grade, "parts": res["parts"],
            "monsoon_days": int(len(sub)), "high_days": hi_days,
            "avg_risk": round(float(prob.mean()), 5), "max_risk": round(float(prob.max()), 5),
            "worst_date": sub["date"].iloc[w].date().isoformat(), "advice": advice,
            "note": "Based on the 2024 model estimate. This is not legal, insurance or property advice."}


@app.get("/api/v1/premium/outlook")
def p_outlook(cell_id: int = 0, demo: bool = False, user: dict | None = Depends(optional_user)):
    d = _gate(user, demo)
    cid = 1241 if d else cell_id
    start = pd.Timestamp("2024-09-08") if d else pd.Timestamp(_date.today())
    m = get_model()
    days = []
    for i in range(15):
        ds = (start + timedelta(days=i)).date().isoformat()
        try:
            day, _ = day_frame(ds)
        except HTTPException:
            continue
        prob, _ = m.predict(day)
        cell_p = None
        if cid:
            sel = np.where(day["cell_id"].values == cid)[0]
            if len(sel):
                cell_p = round(float(prob[int(sel[0])]), 5)
        days.append({"date": ds, "city_score": _city_score(prob, m),
                     "avg_rain_mm": round(float(day["rain_mm"].astype(float).mean()), 1), "cell_risk": cell_p})
    if not days:
        raise HTTPException(503, "The outlook could not be built right now. Please try again shortly.")
    key = (lambda x: x["cell_risk"] if x["cell_risk"] is not None else 9) if cid else (lambda x: x["city_score"])
    best = min(days, key=key)["date"]
    worst = max(days, key=lambda x: x["city_score"])["date"]
    return {"demo": d, "place_name": get_names().get(cid) if cid else None, "days": days,
            "best_day": best, "worst_day": worst,
            "note": "Rainfall forecasts for later days are less reliable."}


@app.get("/api/v1/premium/export")
def p_export(date: str = "", demo: bool = False, user: dict | None = Depends(optional_user)):
    d = _gate(user, demo)
    date = "2024-09-13" if d else (date or _date.today().isoformat())
    day, _ = day_frame(date)
    m = get_model()
    prob, _ = m.predict(day)
    level = np.where(prob >= m.high_thr, "High", np.where(prob >= m.low_thr, "Medium", "Low"))
    names = get_names()
    df = pd.DataFrame({
        "cell_id": day["cell_id"].values,
        "place_name": [names.get(int(c), "") for c in day["cell_id"].values],
        "lat": day["lat"].values, "lon": day["lon"].values,
        "rain_mm": np.round(day["rain_mm"].astype(float).values, 1),
        "risk_probability": np.round(prob, 5), "risk_level": level,
    }).sort_values("risk_probability", ascending=False)
    if d:
        df = df.head(50)
    return Response(df.to_csv(index=False), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="civicpulse_{date}.csv"'})