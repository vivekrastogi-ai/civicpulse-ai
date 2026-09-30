import numpy as np
import pandas as pd

static = pd.read_csv("ml/data/processed/cell_static_features.csv")
cellmap = pd.read_csv("ml/data/processed/cell_rain_point_map.csv")
cellmap["rain_lat"] = cellmap["rain_lat"].round(1)
cellmap["rain_lon"] = cellmap["rain_lon"].round(1)

# ---------- 1. Daily weather per rain point ----------
w = pd.read_parquet(
    "ml/data/raw/rainfall_hourly.parquet",
    columns=["time", "precipitation", "temperature_2m",
             "relative_humidity_2m", "wind_speed_10m", "rain_lat", "rain_lon"],
)
w["rain_lat"] = w["rain_lat"].round(1)
w["rain_lon"] = w["rain_lon"].round(1)
w["time"] = pd.to_datetime(w["time"])
w["date"] = w["time"].dt.normalize()

daily = w.groupby(["rain_lat", "rain_lon", "date"], as_index=False).agg(
    rain_mm=("precipitation", "sum"),
    rain_max_1h=("precipitation", "max"),
    temp_mean=("temperature_2m", "mean"),
    humidity_mean=("relative_humidity_2m", "mean"),
    wind_mean=("wind_speed_10m", "mean"),
)
daily = daily.sort_values(["rain_lat", "rain_lon", "date"])

g = daily.groupby(["rain_lat", "rain_lon"])["rain_mm"]
daily["rain_prev1d"] = g.shift(1).fillna(0)
daily["rain_prev3d"] = g.transform(lambda s: s.shift(1).rolling(3, min_periods=1).sum()).fillna(0)
daily["rain_prev7d"] = g.transform(lambda s: s.shift(1).rolling(7, min_periods=1).sum()).fillna(0)
daily["rain_prev30d"] = g.transform(lambda s: s.shift(1).rolling(30, min_periods=1).sum()).fillna(0)

# sirf monsoon (features upar poore saal par bane, isliye June ke shuru mein bhi history sahi hai)
daily = daily[daily["date"].dt.month.between(6, 9)]

# ---------- 2. Cell x day table ----------
df = cellmap.merge(daily, on=["rain_lat", "rain_lon"])
df = df.merge(static, on="cell_id")
print("Cell-days:", len(df))

# ---------- 3. Target ----------
inc = pd.read_csv("ml/data/raw/incidents_synthetic.csv", parse_dates=["date"])
inc = inc[["cell_id", "date"]].drop_duplicates()
inc["waterlogged"] = 1
df = df.merge(inc, on=["cell_id", "date"], how="left")
df["waterlogged"] = df["waterlogged"].fillna(0).astype(int)

# ---------- 4. History (sirf PICHHLE din) ----------
df = df.sort_values(["cell_id", "date"]).reset_index(drop=True)
df["inc_prev"] = df.groupby("cell_id")["waterlogged"].shift(1).fillna(0)
# pichhle 30 dino mein is cell ke incidents (aaj ko chhod kar)
df["inc_last30d"] = df.groupby("cell_id")["inc_prev"].transform(
    lambda s: s.rolling(30, min_periods=1).sum()
)
# pichhle saalon ki total incidents (sirf poore beete saal, leakage nahi)
df["year"] = df["date"].dt.year
yearly = df.groupby(["cell_id", "year"])["waterlogged"].sum().reset_index()
yearly = yearly.sort_values(["cell_id", "year"])
yearly["inc_past_years"] = yearly.groupby("cell_id")["waterlogged"].cumsum() - yearly["waterlogged"]
df = df.merge(yearly[["cell_id", "year", "inc_past_years"]], on=["cell_id", "year"])
df = df.drop(columns=["inc_prev"])

# ---------- 5. Time features ----------
df["month"] = df["date"].dt.month
df["dayofyear"] = df["date"].dt.dayofyear

df = df.sort_values(["date", "cell_id"]).reset_index(drop=True)
df.to_parquet("ml/data/processed/training_table.parquet", index=False)

print("Shape:", df.shape)
print("Positive rate:", round(df["waterlogged"].mean(), 5))
print(df.groupby("year")["waterlogged"].agg(["sum", "mean"]))
print("Missing values:", int(df.isna().sum().sum()))
print(list(df.columns))