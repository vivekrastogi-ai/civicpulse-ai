import numpy as np
import geopandas as gpd
import osmnx as ox
from shapely.geometry import box

# 1. Delhi boundary
delhi = ox.geocode_to_gdf("National Capital Territory of Delhi, India")
delhi_utm = delhi.to_crs(32643)   # UTM zone 43N (meters mein kaam karne ke liye)

# 2. 1km x 1km cells
minx, miny, maxx, maxy = delhi_utm.total_bounds
cells = [
    box(x, y, x + 1000, y + 1000)
    for x in np.arange(minx, maxx, 1000)
    for y in np.arange(miny, maxy, 1000)
]
grid = gpd.GeoDataFrame(geometry=cells, crs=32643)

# 3. Sirf wo cells rakho jo Delhi ke andar hain
delhi_shape = delhi_utm.union_all()
grid = grid[grid.intersects(delhi_shape)].reset_index(drop=True)
grid["cell_id"] = grid.index

# 4. Centroid lat/lon
centroids = grid.geometry.centroid.to_crs(4326)
grid["lat"] = centroids.y
grid["lon"] = centroids.x

# 5. Save (WGS84 mein)
grid = grid.to_crs(4326)
grid.to_file("ml/data/processed/delhi_grid.geojson", driver="GeoJSON")
print("Total cells:", len(grid))