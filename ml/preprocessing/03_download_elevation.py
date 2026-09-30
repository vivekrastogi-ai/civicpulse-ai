import time
import requests
import geopandas as gpd

grid = gpd.read_file("ml/data/processed/delhi_grid.geojson")
elev = []

for i in range(0, len(grid), 100):   # ek call mein max 100 points
    chunk = grid.iloc[i:i + 100]
    params = {
        "latitude": ",".join(f"{v:.5f}" for v in chunk["lat"]),
        "longitude": ",".join(f"{v:.5f}" for v in chunk["lon"]),
    }
    for attempt in range(5):
        r = requests.get("https://api.open-meteo.com/v1/elevation", params=params, timeout=60)
        if r.status_code == 429:
            print("Rate limit, 60 sec wait...")
            time.sleep(60)
            continue
        r.raise_for_status()
        break
    elev.extend(r.json()["elevation"])
    print("done", i, "to", i + len(chunk))
    time.sleep(2)

grid["elevation"] = elev
grid.drop(columns="geometry").to_csv("ml/data/processed/cell_elevation.csv", index=False)
print(grid["elevation"].describe())