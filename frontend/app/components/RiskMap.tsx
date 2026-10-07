"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type Cell = {
  cell_id: number;
  place_name?: string;
  lat: number;
  lon: number;
  risk_probability: number;
  risk_level: "Low" | "Medium" | "High";
  rain_mm: number;
};

export type Focus = { lat: number; lon: number; name: string } | null;

const COLORS = { Low: "#22c55e", Medium: "#eab308", High: "#ef4444" };

function Resize() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

function FlyTo({ focus }: { focus: Focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], 14, { duration: 1.2 });
  }, [focus, map]);
  return null;
}

export default function RiskMap({
  cells,
  selected,
  onSelect,
  focus,
}: {
  cells: Cell[];
  selected: number | null;
  onSelect: (id: number) => void;
  focus: Focus;
}) {
  return (
    <MapContainer
      key="civicpulse-map"
      center={[28.64, 77.12]}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      preferCanvas
    >
      <Resize />
      <FlyTo focus={focus} />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cells.map((c) => (
        <CircleMarker
          key={c.cell_id}
          center={[c.lat, c.lon]}
          radius={c.cell_id === selected ? 10 : c.risk_level === "Low" ? 3 : 5}
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