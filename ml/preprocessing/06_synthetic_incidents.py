import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
TARGET_RATE = 0.004   # lagbhag 0.4% cell-days mein waterlogging

static = pd.read_csv("ml/data/processed/cell_static_features.csv")
cellmap = pd.read_csv("ml/data/processed/cell_rain_point_map.csv")
cellmap["rain_lat"] = cellmap["rain_lat"].round(1)
cellmap["rain_lon"] = cellmap["rain_lon"].round(1)


def z(s):
    return ((s - s.mean()) / s.std()).clip(-3, 3)


# Cell ki vulnerability (hamare banaye rules, real nahi)
static["vulnerability"] = (
    -0.8 * z(static["local_relief"])
    - 0.3 * z(static["elevation"])
    + 0.9 * (static["underpass_count"] > 0).astype(float)
    + 0.4 * z(static["road_length_km"])
    - 0.4 * z(static["drain_length_km"])
    + 0.3 * z(static["dist_waterway_km"])
)
# Chhupa hua random factor, taaki model ke liye sab kuch perfectly predictable na ho
static["hotspot"] = rng.normal(0, 0.5, len(static))

# Daily rainfall (monsoon: June-Sept)
rain = pd.read_parquet(
    "ml/data/raw/rainfall_hourly.parquet",
    columns=["time", "precipitation", "rain_lat", "rain_lon"],
)
rain["rain_lat"] = rain["rain_lat"].round(1)
rain["rain_lon"] = rain["rain_lon"].round(1)
rain["date"] = pd.to_datetime(rain["time"]).dt.normalize()
daily = (
    rain.groupby(["rain_lat", "rain_lon", "date"], as_index=False)["precipitation"]
    .sum()
    .rename(columns={"precipitation": "rain_mm"})
    .sort_values(["rain_lat", "rain_lon", "date"])
)
daily["rain_prev2d"] = (
    daily.groupby(["rain_lat", "rain_lon"])["rain_mm"]
    .transform(lambda s: s.shift(1).rolling(2, min_periods=1).sum())
    .fillna(0)
)
daily = daily[daily["date"].dt.month.between(6, 9)]

# Har cell x har din
df = cellmap.merge(daily, on=["rain_lat", "rain_lon"])
df = df.merge(static[["cell_id", "lat", "lon", "vulnerability", "hotspot"]], on="cell_id")
print("Total cell-days:", len(df))

score = (
    1.6 * np.log1p(df["rain_mm"])
    + 0.5 * np.log1p(df["rain_prev2d"])
    + df["vulnerability"]
    + df["hotspot"]
).values

# Intercept aisa dhundho ki overall rate TARGET_RATE ke barabar ho
lo, hi = -40.0, 10.0
for _ in range(60):
    mid = (lo + hi) / 2
    rate = (1 / (1 + np.exp(-(mid + score)))).mean()
    if rate > TARGET_RATE:
        hi = mid
    else:
        lo = mid
prob = 1 / (1 + np.exp(-(mid + score)))

df["waterlogged"] = rng.random(len(df)) < prob
inc = df[df["waterlogged"]].copy()
inc["severity"] = np.where(inc["rain_mm"] >= 64.5, "high",
                    np.where(inc["rain_mm"] >= 30, "medium", "low"))
inc["source"] = "synthetic"
inc[["date", "cell_id", "lat", "lon", "severity", "source"]].to_csv(
    "ml/data/raw/incidents_synthetic.csv", index=False
)

print("Incidents:", len(inc), "| rate:", round(df["waterlogged"].mean(), 5))
print(inc.groupby(inc["date"].dt.year).size())
print(inc["severity"].value_counts())
print("Sabse zyada incidents wale 5 cells:")
print(inc["cell_id"].value_counts().head())