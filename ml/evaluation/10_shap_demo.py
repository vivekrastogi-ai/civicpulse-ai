import os
import sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import shap

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from explain import RiskModel

os.makedirs("docs/model", exist_ok=True)
rm = RiskModel()

df = pd.read_parquet("ml/data/processed/training_table.parquet")
test = df[df["year"] == 2024].reset_index(drop=True)

# ---------- 1. Global SHAP chart (10,000 random test rows) ----------
sample = test.sample(10000, random_state=42)
sv = rm.explainer.shap_values(sample[rm.features])
plt.figure()
shap.summary_plot(sv, sample[rm.features], show=False, max_display=15)
plt.tight_layout()
plt.savefig("docs/model/shap_summary.png", dpi=120, bbox_inches="tight")
plt.close()

imp = pd.Series(np.abs(sv).mean(0), index=rm.features).sort_values(ascending=False)
print("Mean |SHAP| (top 10):\n", imp.head(10).round(4))

# ---------- 2. 3 example explanations ----------
prob, level = rm.predict(test)
test["prob"], test["level"] = prob, level

examples = {
    "High": test[test["level"] == "High"].sort_values("prob", ascending=False).iloc[[50]],
    "Medium": test[test["level"] == "Medium"].sample(1, random_state=1),
    "Low": test[test["level"] == "Low"].sample(1, random_state=1),
}
for name, row in examples.items():
    out = rm.explain(row)
    print(f"\n===== {name} example | cell {int(row['cell_id'].iloc[0])} | {row['date'].iloc[0].date()} | "
          f"actual waterlogged = {int(row['waterlogged'].iloc[0])} =====")
    print("Probability:", out["risk_probability"], "| Level:", out["risk_level"])
    for f in out["top_factors"]:
        print(f"  {f['label']:<32} value={f['value']:<10.2f} contribution={f['contribution']:+.3f}  ({f['direction']})")

print("\nChart: docs/model/shap_summary.png")