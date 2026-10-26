import os
import re
import sys
import time
from datetime import date as _date, timedelta
from functools import lru_cache
from fastapi.staticfiles import StaticFiles

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

os.makedirs(os.path.join(ROOT, "backend", "uploads"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=os.path.join(ROOT, "backend", "uploads")), name="uploads")


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


_ARCHIVE_CACHE = {}


def day_frame(date: str):
    ts = pd.Timestamp(date)
    t = get_table()
    day = t[t["date"] == ts]
    if not day.empty:
        return day, "observed"
    today = pd.Timestamp(_date.today())
    if ts > today + timedelta(days=15):
        raise HTTPException(404, "Forecast sirf agle 15 din tak milta hai.")
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
        raise HTTPException(503, "Mausam data abhi nahi mil paya, thodi der baad try karo.")
    if d.empty:
        raise HTTPException(404, "Is date ka mausam data nahi mila.")
    df = get_base().merge(d, on=["rain_lat", "rain_lon"], how="left")
    df["date"] = ts
    df["month"] = ts.month
    df["dayofyear"] = ts.dayofyear
    df = df.dropna(subset=["rain_mm"]).reset_index(drop=True)
    return df, mode
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



@app.get("/api/v1/model-info")
def model_info():
    meta = get_model().meta
    return {
        "model_version": meta.get("model_version"),
        "data": meta.get("data"),
        "features": meta.get("features"),
        "test_metrics": meta.get("test_metrics"),
        "limitations": [
            "Incidents synthetic hain; model ne generator ke rules seekhe, asli waterlogging ke karan nahi.",
            "Rainfall resolution ~10 km hai, paas ke cells ek jaisi barish share karte hain.",
            "Temperature/humidity barish ke proxy hain, karan nahi.",
            "Live mode mein incident history ka approximation use hota hai.",
            "Ye prototype hai, emergency warning system nahi.",
        ],
    }


@app.get("/api/v1/analytics")
def analytics(date: str, top: int = 10):
    """Ek din ka overview: top risky areas, distribution, barish."""
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
    """A se B ke raaste, har raaste ka risk (model ke hisaab se)."""
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
        raise HTTPException(503, "Routing service abhi nahi mil rahi, thodi der baad try karo.")
    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(404, "In dono jagah ke beech raasta nahi mila.")

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
        "note": "Risk model ka estimate hai (synthetic data par trained). Asli halat ke liye traffic/mausam updates dekho.",
    }


@app.get("/api/v1/stress-test")
def stress_test(date: str):
    """Maan lo poori Delhi mein X mm barish ho: kitne cells High honge (us din ki baaki condition wahi)."""
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
            "note": "Maan liya gaya hai ki poori Delhi mein itni barish hoti hai. Estimate hai, guarantee nahi."}


@app.get("/api/v1/resilience")
def resilience(cell_id: int):
    """Barish se alag: ilaake ki apni banawat ka score (0-100, zyada = behtar)."""
    base = get_base()
    row = base[base["cell_id"] == cell_id]
    if row.empty:
        raise HTTPException(404, "Cell nahi mila.")
    r = row.iloc[0]

    def pr(col, v, inv=False):
        x = float((base[col] < v).mean())
        return 1 - x if inv else x

    parts = {
        "Unchai (elevation)": pr("elevation", r["elevation"]),
        "Padosi se unchai": pr("local_relief", r["local_relief"]),
        "Drain/naale": pr("drain_length_km", r["drain_length_km"]),
        "Underpass kam": pr("underpass_count", r["underpass_count"], inv=True),
    }
    score = round(100 * sum(parts.values()) / len(parts))
    grade = "Mazboot" if score >= 65 else "Madhyam" if score >= 40 else "Kamzor"
    return {
        "cell_id": cell_id,
        "place_name": get_names().get(cell_id, f"Cell {cell_id}"),
        "score": score,
        "grade": grade,
        "parts": {k: round(v * 100) for k, v in parts.items()},
        "underpasses": int(r["underpass_count"]),
        "note": "Ye sirf ilaake ki banawat ka score hai, aaj ki barish ka nahi. Delhi ke baaki cells se tulna par based.",
    }


@app.get("/api/v1/flood-score")
def flood_score(date: str):
    """Poori Delhi ka headline score (0-100). Zyada = zyada risk."""
    day, mode = day_frame(date)
    m = get_model()
    prob, _ = m.predict(day)
    thr = float(m.high_thr)
    high_share = float((prob >= thr).mean())
    med_share = float((prob >= m.low_thr).mean())
    avg = float(prob.mean())
    score = round(100 * min(1.0, 0.45 * (high_share / 0.15)
                                 + 0.30 * (med_share / 0.6)
                                 + 0.25 * (avg / 0.05)))
    label = "Kam" if score < 15 else "Madhyam" if score < 40 else "Zyada" if score < 70 else "Bahut zyada"
    avg_rain = float(day["rain_mm"].astype(float).mean())
    if avg_rain < 1:
        reason = "Aaj lagbhag barish nahi hai, isliye risk kam hai."
    elif score < 40:
        reason = f"Halki barish (avg {avg_rain:.1f} mm), kuch hi jagah risk."
    else:
        reason = f"Kaafi barish (avg {avg_rain:.1f} mm), kai jagah paani bharne ka khatra."
    return {
        "date": date, "mode": mode, "score": score, "label": label, "reason": reason,
        "high_cells": int((prob >= thr).sum()),
        "medium_cells": int(((prob >= m.low_thr) & (prob < thr)).sum()),
        "total_cells": int(len(prob)),
        "avg_rain_mm": round(avg_rain, 1),
        "note": "Ek headline andaza hai, model ke estimate par based.",
    }


@app.get("/api/v1/confidence")
def confidence(date: str):
    today = _date.today()
    d = _date.fromisoformat(date)
    delta = (d - today).days
    if delta <= 1:
        level, why = "High", "Mausam data observed ya 1 din ke andar ka forecast hai."
    elif delta <= 4:
        level, why = "Medium", "2-4 din aage ka forecast, barish ki matra badal sakti hai."
    else:
        level, why = "Low", "5+ din aage ka forecast kam bharosemand hota hai."
    return {
        "date": date, "days_ahead": delta, "level": level, "why": why,
        "model_note": "Model synthetic data par trained hai, isliye jagah-wise accuracy abhi asli nahi hai.",
    }


@lru_cache(maxsize=1)
def replay_summary():
    """2024 June-Sept ka din-wise headline (ek baar compute, phir cache)."""
    t = get_table()
    m = get_model()
    out = []
    for d, grp in t.groupby("date"):
        prob, _ = m.predict(grp)
        high = float((prob >= m.high_thr).mean())
        med = float((prob >= m.low_thr).mean())
        avg = float(prob.mean())
        score = round(100 * min(1.0, 0.45 * (high / 0.15) + 0.30 * (med / 0.6) + 0.25 * (avg / 0.05)))
        out.append({
            "date": d.date().isoformat(),
            "score": score,
            "high_cells": int((prob >= m.high_thr).sum()),
            "avg_rain_mm": round(float(grp["rain_mm"].astype(float).mean()), 1),
        })
    return out


@app.get("/api/v1/replay")
def replay():
    return {"days": replay_summary(),
            "note": "2024 monsoon (June-Sept) ka din-wise model estimate."}


@app.get("/api/v1/reminder-check")
def reminder_check(cell_id: int, date: str, time_hhmm: str = "10:00"):
    """Ek jagah ke liye alert: risk, barish aur kab nikalna chahiye."""
    row, mode = one_row(cell_id, date)
    info = get_model().explain(row, top_n=2)
    p = info["risk_probability"]
    rain = float(row["rain_mm"].iloc[0])
    lvl = info["risk_level"]
    h, m = map(int, time_hhmm.split(":"))
    leave_by = f"{(h * 60 + m - 30) // 60:02d}:{(h * 60 + m - 30) % 60:02d}"
    if lvl == "Low":
        msg = "Is jagah par aaj risk kam hai. Normal nikal sakte ho."
        alert = False
    else:
        msg = (f"Aaj {time_hhmm} par risk {lvl} hai ({p * 100:.1f}%, barish {rain:.1f} mm). "
               f"{leave_by} tak nikal jao ya Safe Route dekho.")
        alert = True
    return {"alert": alert, "level": lvl, "risk_probability": p, "rain_mm": round(rain, 1),
            "leave_by": leave_by, "message": msg, "confidence_mode": mode}

@app.on_event("startup")
def _start_notifier():
    import notifier
    notifier.start(lambda cid, d, t: reminder_check(cid, d, t))