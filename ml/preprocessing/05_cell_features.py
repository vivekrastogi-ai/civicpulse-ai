import numpy as np
import pandas as pd
import geopandas as gpd

CRS = 32643  # meters mein kaam karne ke liye
grid = gpd.read_file("ml/data/processed/delhi_grid.geojson").to_crs(CRS)
grid = grid[["cell_id", "geometry"]]


def length_per_cell(path, query=None):
    g = gpd.read_file(path).to_crs(CRS)
    if query:
        g = g.query(query)
    g = g[["geometry"]]
    inter = gpd.overlay(g, grid, how="intersection", keep_geom_type=True)
    inter["len_km"] = inter.geometry.length / 1000
    s = inter.groupby("cell_id")["len_km"].sum()
    return s.reindex(grid["cell_id"]).fillna(0).values


print("Road length nikal rahe hain (kuch minute lag sakte hain)...")
road_km = length_per_cell("ml/data/raw/osm_roads.gpkg")

print("Drain/waterway length...")
drain_km = length_per_cell("ml/data/raw/osm_waterways.gpkg")

print("Tunnel length (sirf tunnel=yes)...")
tunnel_km = length_per_cell("ml/data/raw/osm_tunnels.gpkg", query='tunnel == "yes"')

# Underpass count
tunnels = gpd.read_file("ml/data/raw/osm_tunnels.gpkg").to_crs(CRS)
tunnels = tunnels[tunnels["tunnel"] == "yes"][["geometry"]]
j = gpd.sjoin(grid, tunnels, predicate="intersects")
cnt = j.groupby("cell_id").size()
underpass_count = cnt.reindex(grid["cell_id"]).fillna(0).astype(int).values

# Nearest waterway distance
water = gpd.read_file("ml/data/raw/osm_waterways.gpkg").to_crs(CRS)[["geometry"]]
cent = gpd.GeoDataFrame(grid[["cell_id"]], geometry=grid.geometry.centroid, crs=CRS)
near = gpd.sjoin_nearest(cent, water, distance_col="dist_m")
dist_km = near.groupby("cell_id")["dist_m"].min().reindex(grid["cell_id"]).values / 1000

# Elevation + local relief (cell apne 3 km ke padosiyon se kitna neecha hai)
elev = pd.read_csv("ml/data/processed/cell_elevation.csv").sort_values("cell_id")
e = elev["elevation"].values
xy = np.c_[cent.geometry.x.values, cent.geometry.y.values]
d = np.sqrt(((xy[:, None, :] - xy[None, :, :]) ** 2).sum(-1))
mask = (d <= 3000) & (d > 0)
nb_mean = (mask * e[None, :]).sum(1) / np.maximum(mask.sum(1), 1)
local_relief = e - nb_mean   # negative = padosiyon se neecha (waterlogging ka khatra zyada)

out = pd.DataFrame({
    "cell_id": grid["cell_id"].values,
    "lat": elev["lat"].values,
    "lon": elev["lon"].values,
    "elevation": e,
    "local_relief": local_relief,
    "road_length_km": road_km,
    "drain_length_km": drain_km,
    "tunnel_length_km": tunnel_km,
    "underpass_count": underpass_count,
    "dist_waterway_km": dist_km,
})
out.to_csv("ml/data/processed/cell_static_features.csv", index=False)
print(out.describe().T)