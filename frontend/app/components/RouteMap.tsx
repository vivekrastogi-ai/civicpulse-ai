"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type RouteLine = { geometry: [number, number][]; color: string; weight: number };
type Pt = { lat: number; lon: number; place_name: string } | null;

function Fit({ lines }: { lines: RouteLine[] }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
    const pts = lines.flatMap((l) => l.geometry);
    if (pts.length) map.fitBounds(pts as [number, number][], { padding: [30, 30] });
  }, [lines, map]);
  return null;
}

export default function RouteMap({ lines, from, to }: { lines: RouteLine[]; from: Pt; to: Pt }) {
  return (
    <MapContainer center={[28.64, 77.12]} zoom={11} style={{ height: "100%", width: "100%", background: "#0b1220" }}>
      <Fit lines={lines} />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="cp-dark-tiles"
      />
      {[...lines]
        .map((l, i) => ({ l, i }))
        .sort((x, y) => x.l.weight - y.l.weight)
        .map(({ l, i }) => (
          <Polyline key={i} positions={l.geometry} pathOptions={{ color: l.color, weight: l.weight, opacity: 0.9 }} />
        ))}
      {from && <CircleMarker center={[from.lat, from.lon]} radius={9} pathOptions={{ color: "#fff", fillColor: "#22c55e", fillOpacity: 1 }} />}
      {to && <CircleMarker center={[to.lat, to.lon]} radius={9} pathOptions={{ color: "#fff", fillColor: "#ef4444", fillOpacity: 1 }} />}
    </MapContainer>
  );
}