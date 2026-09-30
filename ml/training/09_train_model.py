import json
import os
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.isotonic import IsotonicRegression
from sklearn.calibration import calibration_curve
from sklearn.metrics import (average_precision_score, roc_auc_score, brier_score_loss,
                             precision_recall_curve, precision_score, recall_score, f1_score)
from xgboost import XGBClassifier

os.makedirs("ml/artifacts", exist_ok=True)
os.makedirs("docs/model", exist_ok=True)

df = pd.read_parquet("ml/data/processed/training_table.parquet")

FEATURES = [
    "rain_mm", "rain_max_1h", "rain_prev1d", "rain_prev3d", "rain_prev7d", "rain_prev30d",
    "temp_mean", "humidity_mean", "wind_mean",
    "lat", "lon", "elevation", "local_relief",
    "road_length_km", "drain_length_km", "tunnel_length_km", "underpass_count", "dist_waterway_km",
    "inc_last30d", "inc_past_years", "month", "dayofyear",
]
TARGET = "waterlogged"

# ---------- Time-based split ----------
train = df[df["year"] <= 2022]
val = df[df["year"] == 2023]
test = df[df["year"] == 2024]
print("Train/Val/Test rows:", len(train), len(val), len(test))
print("Positive rate:", round(train[TARGET].mean(), 5), round(val[TARGET].mean(), 5), round(test[TARGET].mean(), 5))

Xtr, ytr = train[FEATURES], train[TARGET]
Xva, yva = val[FEATURES], val[TARGET]
Xte, yte = test[FEATURES], test[TARGET]


def evaluate(name, y, p, thr=None):
    ap = average_precision_score(y, p)
    auc = roc_auc_score(y, p)
    brier = brier_score_loss(y, p)
    res = {"model": name, "pr_auc": round(ap, 4), "roc_auc": round(auc, 4), "brier": round(brier, 5)}
    if thr is not None:
        pred = (p >= thr).astype(int)
        res.update(threshold=round(float(thr), 4),
                   precision=round(precision_score(y, pred, zero_division=0), 4),
                   recall=round(recall_score(y, pred), 4),
                   f1=round(f1_score(y, pred), 4))
    return res


def best_f1_threshold(y, p):
    prec, rec, thr = precision_recall_curve(y, p)
    f1 = 2 * prec[:-1] * rec[:-1] / np.maximum(prec[:-1] + rec[:-1], 1e-9)
    return thr[np.argmax(f1)]


# ---------- 1. Baseline: Logistic Regression ----------
print("\nBaseline train ho raha hai...")
lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced"))
lr.fit(Xtr, ytr)
p_lr_va = lr.predict_proba(Xva)[:, 1]
p_lr_te = lr.predict_proba(Xte)[:, 1]
thr_lr = best_f1_threshold(yva, p_lr_va)

# ---------- 2. Candidate: XGBoost ----------
print("XGBoost train ho raha hai...")
xgb = XGBClassifier(
    n_estimators=600, learning_rate=0.05, max_depth=5,
    subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
    eval_metric="aucpr", early_stopping_rounds=40,
    tree_method="hist", n_jobs=-1, random_state=42,
)
xgb.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)
print("Best iteration:", xgb.best_iteration)
p_xgb_va = xgb.predict_proba(Xva)[:, 1]
p_xgb_te = xgb.predict_proba(Xte)[:, 1]

# ---------- 3. Calibration (isotonic, validation par fit) ----------
iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
iso.fit(p_xgb_va, yva)
p_cal_te = iso.predict(p_xgb_te)

# Threshold validation se, test par sirf ek baar apply
thr_xgb = best_f1_threshold(yva, iso.predict(p_xgb_va))

# ---------- 4. Results (TEST = 2024) ----------
results = [
    evaluate("LogisticRegression", yte, p_lr_te, thr_lr),
    evaluate("XGBoost (raw)", yte, p_xgb_te, best_f1_threshold(yva, p_xgb_va)),
    evaluate("XGBoost (calibrated)", yte, p_cal_te, thr_xgb),
]
res_df = pd.DataFrame(results)
print("\n=== TEST RESULTS (2024) ===")
print(res_df.to_string(index=False))
print("\nBaseline (random guess) PR-AUC =", round(yte.mean(), 4))

# ---------- 5. Calibration plot ----------
plt.figure(figsize=(5.5, 5))
for label, p in [("XGB raw", p_xgb_te), ("XGB calibrated", p_cal_te)]:
    frac, mean_p = calibration_curve(yte, p, n_bins=10, strategy="quantile")
    plt.plot(mean_p, frac, marker="o", label=label)
mx = max(p_cal_te.max(), p_xgb_te.max())
plt.plot([0, mx], [0, mx], "k--", label="perfect")
plt.xlabel("Predicted probability"); plt.ylabel("Actual rate"); plt.legend()
plt.title("Calibration (test 2024)")
plt.tight_layout(); plt.savefig("docs/model/calibration.png", dpi=120); plt.close()

# ---------- 6. Risk levels (calibrated probability par) ----------
p_va_cal = iso.predict(p_xgb_va)
low_thr = float(np.quantile(p_va_cal, 0.90))     # neeche ke 90% = Low
high_thr = float(thr_xgb)                          # best-F1 threshold = High
if low_thr >= high_thr:
    low_thr = high_thr / 3
risk = np.where(p_cal_te >= high_thr, "High", np.where(p_cal_te >= low_thr, "Medium", "Low"))
print("\nRisk levels (test):")
print(pd.crosstab(risk, yte, rownames=["risk"], colnames=["actual"]))
print(pd.Series(risk).value_counts(normalize=True).round(4))

# ---------- 7. Feature importance ----------
imp = pd.Series(xgb.feature_importances_, index=FEATURES).sort_values(ascending=False)
print("\nTop features (XGBoost):\n", imp.head(10).round(4))

# ---------- 8. Save ----------
joblib.dump(xgb, "ml/artifacts/xgb_model.joblib")
joblib.dump(iso, "ml/artifacts/calibrator.joblib")
meta = {
    "model_version": "v1-synthetic",
    "data": "SYNTHETIC incidents - metrics real-world accuracy nahi dikhate",
    "features": FEATURES,
    "low_threshold": low_thr,
    "high_threshold": high_thr,
    "test_metrics": results,
}
with open("ml/artifacts/model_meta.json", "w") as f:
    json.dump(meta, f, indent=2)
print("\nModel ml/artifacts/ mein save ho gaya.")