import osmnx as ox

place = "National Capital Territory of Delhi, India"
ox.settings.timeout = 600

# 1. Roads
print("Roads download ho rahi hain...")
roads = ox.features_from_place(place, tags={"highway": True})
roads = roads[roads.geometry.type.isin(["LineString", "MultiLineString"])]
roads = roads[["geometry", "highway", "name", "tunnel", "bridge"]
              if all(c in roads.columns for c in ["name", "tunnel", "bridge"])
              else ["geometry", "highway"]]
roads.reset_index(drop=True).to_file("ml/data/raw/osm_roads.gpkg", driver="GPKG")
print("Roads:", len(roads))

# 2. Nalay / naddi / canal
print("Waterways download ho rahi hain...")
water = ox.features_from_place(
    place, tags={"waterway": ["drain", "canal", "river", "stream", "ditch"]}
)
water = water[water.geometry.type.isin(["LineString", "MultiLineString"])]
water = water[["geometry", "waterway"]]
water.reset_index(drop=True).to_file("ml/data/raw/osm_waterways.gpkg", driver="GPKG")
print("Waterways:", len(water))

# 3. Underpass / tunnel
print("Tunnels download ho rahe hain...")
tunnels = ox.features_from_place(place, tags={"tunnel": True, "highway": True})
tunnels = tunnels[tunnels.geometry.type.isin(["LineString", "MultiLineString"])]
tunnels = tunnels[["geometry", "highway", "tunnel"]]
tunnels.reset_index(drop=True).to_file("ml/data/raw/osm_tunnels.gpkg", driver="GPKG")
print("Tunnels:", len(tunnels))