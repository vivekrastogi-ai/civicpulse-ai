import time
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests

URL = "https://api.open-meteo.com/v1/forecast"
_CACHE = {"t": 0.0, "daily": None}
TTL = 1800  # 30 minute


def _fetch_point(lat, lon):
    params = {
        "latitude": lat, "longitude": lon,
        "hourly": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
        "past_days": 31, "forecast_days": 8,
        "timezone": "Asia/Kolkata",
    }
    for _ in range(4):
        r = requests.get(URL, params=params, timeout=60)
        if r.status_code == 429:
            time.sleep(20)
            continue
        r.raise_for_status()
        break
    h = pd.DataFrame(r.json()["hourly"])
    h["time"] = pd.to_datetime(h["time"])
    h["date"] = h["time"].dt.normalize()
    d = h.groupby("date").agg(
        rain_mm=("precipitation", "sum"),
        rain_max_1h=("precipitation", "max"),
        temp_mean=("temperature_2m", "mean"),
        humidity_mean=("relative_humidity_2m", "mean"),
        wind_mean=("wind_speed_10m", "mean"),
    ).reset_index().sort_values("date")
    g = d["rain_mm"]
    d["rain_prev1d"] = g.shift(1).fillna(0)
    d["rain_prev3d"] = g.shift(1).rolling(3, min_periods=1).sum().fillna(0)
    d["rain_prev7d"] = g.shift(1).rolling(7, min_periods=1).sum().fillna(0)
    d["rain_prev30d"] = g.shift(1).rolling(30, min_periods=1).sum().fillna(0)
    d["rain_lat"], d["rain_lon"] = round(lat, 1), round(lon, 1)
    return d


def get_live_daily(points):
    """points: [(lat, lon), ...] -> DataFrame of daily features (30 min cache)."""
    now = time.time()
    if _CACHE["daily"] is not None and now - _CACHE["t"] < TTL:
        return _CACHE["daily"]
    frames = []
    for lat, lon in points:
        frames.append(_fetch_point(lat, lon))
        time.sleep(1)
    daily = pd.concat(frames, ignore_index=True)
    _CACHE["daily"], _CACHE["t"] = daily, now
    return daily


def live_range():
    today = date.today()
    return today - timedelta(days=2), today + timedelta(days=7)