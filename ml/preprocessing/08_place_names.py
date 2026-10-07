import geopandas as gpd
import osmnx as ox
import pandas as pd

ox.settings.timeout = 600
place = "National Capital Territory of Delhi, India"

print("Localities download ho rahi hain...")
tags = {"place": ["suburb", "neighbourhood", "locality", "village", "town", "quarter"]}
pts = ox.features_from_place(place, tags=tags).reset_index(drop=True)
pts = pts[pts["name"].notna()].copy()
pts["label"] = pts["name:en"].fillna(pts["name"]) if "name:en" in pts.columns else pts["name"]
pts = pts.to_crs(32643)
pts["geometry"] = pts.geometry.centroid
pts = pts[["label", "geometry"]]
print("Naam wali localities:", len(pts))

grid = gpd.read_file("ml/data/processed/delhi_grid.geojson").to_crs(32643)
cells = gpd.GeoDataFrame(grid[["cell_id"]], geometry=grid.geometry.centroid, crs=32643)

j = gpd.sjoin_nearest(cells, pts, distance_col="dist_m").drop_duplicates("cell_id")
out = j[["cell_id", "label", "dist_m"]].rename(columns={"label": "place_name"})
out["dist_m"] = out["dist_m"].round(0)
out.sort_values("cell_id").to_csv("ml/data/processed/cell_names.csv", index=False)

print("Cells with name:", len(out), "/", len(grid))
print("Unique naam:", out["place_name"].nunique())
print(out.sample(10, random_state=1).to_string(index=False))