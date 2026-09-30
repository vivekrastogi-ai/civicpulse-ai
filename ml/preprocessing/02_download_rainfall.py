import time
import requests
import pandas as pd
import geopandas as gpd

grid = gpd.read_file("ml/data/processed/delhi_grid.geojson")
grid["rain_lat"] = grid["lat"].round(1)
grid["rain_lon"] = grid["lon"].round(1)
grid[["cell_id", "rain_lat", "rain_lon"]].to_csv(
    "ml/data/processed/cell_rain_point_map.csv", index=False
)

points = grid[["rain_lat", "rain_lon"]].drop_duplicates().values
print("Unique rainfall points:", len(points))

URL = "https://archive-api.open-meteo.com/v1/archive"
frames = []
for lat, lon in points:
    params = {
        "latitude": lat, "longitude": lon,
        "start_date": "2018-01-01", "end_date": "2024-12-31",
        "hourly": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
        "timezone": "Asia/Kolkata",
    }
    for attempt in range(5):
        r = requests.get(URL, params=params, timeout=120)
        if r.status_code == 429:
            print("Rate limit, 60 sec wait...")
            time.sleep(60)
            continue
        r.raise_for_status()
        break
    df = pd.DataFrame(r.json()["hourly"])
    df["rain_lat"], df["rain_lon"] = lat, lon
    frames.append(df)
    print("done", lat, lon)
    time.sleep(5)

out = pd.concat(frames, ignore_index=True)
out.to_parquet("ml/data/raw/rainfall_hourly.parquet", index=False)
print(out.shape)