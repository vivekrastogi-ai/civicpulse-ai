"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type Cell = {
  cell_id: number;
  lat: number;
  lon: number;
  risk_probability: number;
  risk_level: "Low" | "Medium" | "High";
  rain_mm: number;
};

const COLORS = { Low: "#22c55e", Medium: "#eab308", High: "#ef4444" };

function Resize() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

export default function RiskMap({
  cells,
  selected,
  onSelect,
}: {
  cells: Cell[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <MapContainer
      center={[28.64, 77.12]}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      preferCanvas
    >
      <Resize />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cells.map((c) => (
        <CircleMarker
          key={c.cell_id}
          center={[c.lat, c.lon]}
          radius={c.cell_id === selected ? 9 : c.risk_level === "Low" ? 3 : 5}
          pathOptions={{
            color: c.cell_id === selected ? "#000" : COLORS[c.risk_level],
            fillColor: COLORS[c.risk_level],
            fillOpacity: c.risk_level === "Low" ? 0.35 : 0.8,
            weight: c.cell_id === selected ? 3 : 1,
          }}
          eventHandlers={{ click: () => onSelect(c.cell_id) }}
        />
      ))}
    </MapContainer>
  );
}