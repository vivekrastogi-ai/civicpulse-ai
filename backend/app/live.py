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
        "past_days": 31, "forecast_days": 16,
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


FORECAST = "https://api.open-meteo.com/v1/forecast"


def _daily_from_hourly(h, lat, lon):
    h = pd.DataFrame(h)
    h["time"] = pd.to_datetime(h["time"])
    h["date"] = h["time"].dt.normalize()
    dd = h.groupby("date").agg(
        rain_mm=("precipitation", "sum"),
        rain_max_1h=("precipitation", "max"),
        temp_mean=("temperature_2m", "mean"),
        humidity_mean=("relative_humidity_2m", "mean"),
        wind_mean=("wind_speed_10m", "mean"),
    ).reset_index().sort_values("date")
    g = dd["rain_mm"]
    dd["rain_prev1d"] = g.shift(1).fillna(0)
    dd["rain_prev3d"] = g.shift(1).rolling(3, min_periods=1).sum().fillna(0)
    dd["rain_prev7d"] = g.shift(1).rolling(7, min_periods=1).sum().fillna(0)
    dd["rain_prev30d"] = g.shift(1).rolling(30, min_periods=1).sum().fillna(0)
    dd["rain_lat"], dd["rain_lon"] = round(lat, 1), round(lon, 1)
    return dd


def get_live_daily(points):
    """Fetch forecast for all points in small batches (few requests, gentle on rate limits)."""
    frames = []
    batch = 7
    for i in range(0, len(points), batch):
        chunk = points[i:i + batch]
        params = {
            "latitude": ",".join(str(p[0]) for p in chunk),
            "longitude": ",".join(str(p[1]) for p in chunk),
            "hourly": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
            "past_days": 31, "forecast_days": 16,
            "timezone": "Asia/Kolkata",
        }
        data = None
        for attempt in range(4):
            try:
                r = requests.get(FORECAST, params=params, timeout=60)
                j = r.json()
                if r.status_code == 200 and (isinstance(j, list) or "hourly" in j):
                    data = j if isinstance(j, list) else [j]
                    break
                print("Open-Meteo said:", r.status_code, str(j)[:200])
            except Exception as e:
                print("Open-Meteo request error:", e)
            time.sleep(8 * (attempt + 1))
        if data is None:
            continue
        for (lat, lon), item in zip(chunk, data):
            frames.append(_daily_from_hourly(item["hourly"], lat, lon))
        time.sleep(3)
    if not frames:
        raise RuntimeError("Open-Meteo returned no data for any point")
    return pd.concat(frames, ignore_index=True)


def live_range():
    today = date.today()
    return today - timedelta(days=2), today + timedelta(days=7)

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"


def fetch_archive_day(points, day):
    """Kisi bhi purani date ka observed weather (30 din pehle tak ki history ke saath)."""
    from datetime import date as _d, timedelta as _td
    d = _d.fromisoformat(day)
    start = (d - _td(days=31)).isoformat()
    frames = []
    for lat, lon in points:
        params = {
            "latitude": lat, "longitude": lon,
            "start_date": start, "end_date": day,
            "hourly": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
            "timezone": "Asia/Kolkata",
        }
        r = None
        for attempt in range(4):
            r = requests.get(ARCHIVE, params=params, timeout=60)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(5 * (attempt + 1))
                continue
            r.raise_for_status()
            break
        else:
            raise RuntimeError("Archive API abhi unavailable")
        h = pd.DataFrame(r.json()["hourly"])
        h["time"] = pd.to_datetime(h["time"])
        h["date"] = h["time"].dt.normalize()
        dd = h.groupby("date").agg(
            rain_mm=("precipitation", "sum"),
            rain_max_1h=("precipitation", "max"),
            temp_mean=("temperature_2m", "mean"),
            humidity_mean=("relative_humidity_2m", "mean"),
            wind_mean=("wind_speed_10m", "mean"),
        ).reset_index().sort_values("date")
        g = dd["rain_mm"]
        dd["rain_prev1d"] = g.shift(1).fillna(0)
        dd["rain_prev3d"] = g.shift(1).rolling(3, min_periods=1).sum().fillna(0)
        dd["rain_prev7d"] = g.shift(1).rolling(7, min_periods=1).sum().fillna(0)
        dd["rain_prev30d"] = g.shift(1).rolling(30, min_periods=1).sum().fillna(0)
        dd["rain_lat"], dd["rain_lon"] = round(lat, 1), round(lon, 1)
        frames.append(dd[dd["date"] == pd.Timestamp(day)])
        time.sleep(0.5)
    return pd.concat(frames, ignore_index=True)