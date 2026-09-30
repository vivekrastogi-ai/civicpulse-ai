import json
import joblib
import numpy as np
import pandas as pd
import shap

MODEL_PATH = "ml/artifacts/xgb_model.joblib"
CALIB_PATH = "ml/artifacts/calibrator.joblib"
META_PATH = "ml/artifacts/model_meta.json"

# Padhne mein aasan naam (UI/assistant ke liye)
READABLE = {
    "rain_mm": "Aaj ki barish",
    "rain_max_1h": "Sabse tez 1-ghante ki barish",
    "rain_prev1d": "Kal ki barish",
    "rain_prev3d": "Pichhle 3 din ki barish",
    "rain_prev7d": "Pichhle 7 din ki barish",
    "rain_prev30d": "Pichhle 30 din ki barish",
    "temp_mean": "Temperature",
    "humidity_mean": "Humidity",
    "wind_mean": "Hawa ki raftaar",
    "lat": "Latitude",
    "lon": "Longitude",
    "elevation": "Unchai (elevation)",
    "local_relief": "Padosiyon se relative unchai",
    "road_length_km": "Sadak ki lambai",
    "drain_length_km": "Nale/drain ki lambai",
    "tunnel_length_km": "Tunnel/underpass ki lambai",
    "underpass_count": "Underpass ki ginti",
    "dist_waterway_km": "Nazdiki nale/nadi se doori",
    "inc_last30d": "Pichhle 30 din ke incidents",
    "inc_past_years": "Pichhle saalon ke incidents",
    "month": "Mahina",
    "dayofyear": "Saal ka din",
}


class RiskModel:
    def __init__(self):
        self.model = joblib.load(MODEL_PATH)
        self.calibrator = joblib.load(CALIB_PATH)
        with open(META_PATH) as f:
            self.meta = json.load(f)
        self.features = self.meta["features"]
        self.low_thr = self.meta["low_threshold"]
        self.high_thr = self.meta["high_threshold"]
        self.explainer = shap.TreeExplainer(self.model)

    def predict(self, X: pd.DataFrame):
        raw = self.model.predict_proba(X[self.features])[:, 1]
        prob = self.calibrator.predict(raw)
        level = np.where(prob >= self.high_thr, "High",
                         np.where(prob >= self.low_thr, "Medium", "Low"))
        return prob, level

    def explain(self, row: pd.DataFrame, top_n: int = 5):
        """Ek row ke liye risk + top contributing factors."""
        X = row[self.features]
        prob, level = self.predict(X)
        sv = self.explainer.shap_values(X)
        sv = np.asarray(sv)[0]
        base = float(np.ravel(self.explainer.expected_value)[0])
        order = np.argsort(-np.abs(sv))[:top_n]
        factors = []
        for i in order:
            f = self.features[i]
            factors.append({
                "feature": f,
                "label": READABLE.get(f, f),
                "value": float(X.iloc[0, i]),
                "contribution": round(float(sv[i]), 4),
                "direction": "increases_risk" if sv[i] > 0 else "decreases_risk",
            })
        return {
            "risk_probability": round(float(prob[0]), 5),
            "risk_level": str(level[0]),
            "base_score": round(base, 4),
            "top_factors": factors,
            "note": "Contribution model ke raw score (log-odds) mein hai, "
                    "calibrated probability ke percentage points mein nahi.",
        }