import os
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

os.makedirs("docs/eda", exist_ok=True)
df = pd.read_parquet("ml/data/processed/training_table.parquet")
print("Shape:", df.shape)

# 1. Rainfall bucket vs incident rate
bins = [-0.01, 0.1, 5, 15, 30, 65, 115, 1000]
labels = ["0", "0-5", "5-15", "15-30", "30-65", "65-115", "115+"]
df["rain_bucket"] = pd.cut(df["rain_mm"], bins=bins, labels=labels)
t1 = df.groupby("rain_bucket", observed=True)["waterlogged"].agg(["mean", "sum", "count"])
print("\nRainfall bucket vs incident rate:\n", t1)
ax = (t1["mean"] * 100).plot(kind="bar", color="steelblue", figsize=(8, 4))
ax.set_ylabel("Incident rate (%)"); ax.set_xlabel("Daily rainfall (mm)")
ax.set_title("Rainfall vs waterlogging rate")
plt.tight_layout(); plt.savefig("docs/eda/01_rain_vs_rate.png", dpi=120); plt.close()

# 2. Month-wise
t2 = df.groupby("month")["waterlogged"].agg(["sum", "mean"])
print("\nMonth-wise:\n", t2)
ax = t2["sum"].plot(kind="bar", color="darkorange", figsize=(6, 4))
ax.set_ylabel("Incidents"); ax.set_title("Incidents by month")
plt.tight_layout(); plt.savefig("docs/eda/02_month.png", dpi=120); plt.close()

# 3. Year-wise
t3 = df.groupby("year")["waterlogged"].sum()
ax = t3.plot(kind="bar", color="seagreen", figsize=(6, 4))
ax.set_ylabel("Incidents"); ax.set_title("Incidents by year")
plt.tight_layout(); plt.savefig("docs/eda/03_year.png", dpi=120); plt.close()

# 4. Underpass wali cells vs baaki
df["has_underpass"] = df["underpass_count"] > 0
print("\nUnderpass vs incident rate:\n", df.groupby("has_underpass")["waterlogged"].mean())

# 5. Top 10 cells
top = df.groupby("cell_id")["waterlogged"].sum().sort_values(ascending=False).head(10)
print("\nTop 10 cells:\n", top)
print("Kitne cells mein kabhi incident nahi hua:",
      int((df.groupby("cell_id")["waterlogged"].sum() == 0).sum()), "/", df["cell_id"].nunique())

# 6. Feature correlation with target
num = df.select_dtypes("number").drop(columns=["cell_id", "rain_lat", "rain_lon", "year"])
corr = num.corr()["waterlogged"].drop("waterlogged").sort_values()
print("\nCorrelation with target:\n", corr)
ax = corr.plot(kind="barh", figsize=(7, 7), color="slategray")
ax.set_title("Correlation with waterlogged")
plt.tight_layout(); plt.savefig("docs/eda/04_correlation.png", dpi=120); plt.close()

print("\nCharts docs/eda/ folder mein save ho gaye.")