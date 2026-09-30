import geopandas as gpd

roads = gpd.read_file("ml/data/raw/osm_roads.gpkg")
print("Columns:", list(roads.columns))

if "tunnel" in roads.columns:
    # OSM mein tunnel=yes, culvert, building_passage wagairah values hoti hain; "no" ya khaali ko hatao
    mask = roads["tunnel"].notna() & (roads["tunnel"].astype(str).str.lower() != "no")
    tunnels = roads[mask][["geometry", "highway", "tunnel"]]
else:
    tunnels = roads.iloc[0:0]

tunnels.reset_index(drop=True).to_file("ml/data/raw/osm_tunnels.gpkg", driver="GPKG")
print("Tunnels (sahi count):", len(tunnels))
print(tunnels["tunnel"].value_counts() if len(tunnels) else "koi tunnel nahi mila")