"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
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

const COLORS = { Low: "#22c55e", Medium: "#f59e0b", High: "#ef4444" };

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

function Heat({ cells }: { cells: Cell[] }) {
  const map = useMap();
  useEffect(() => {
    let layer: L.Layer | null = null;
    let cancelled = false;
    import("leaflet.heat").then(() => {
      if (cancelled || !cells.length) return;
      const max = Math.max(0.02, ...cells.map((c) => c.risk_probability));
      const pts = cells.map((c) => [c.lat, c.lon, Math.min(1, c.risk_probability / max)]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layer = (L as any).heatLayer(pts, {
        radius: 28,
        blur: 22,
        maxZoom: 13,
        gradient: { 0.2: "#22c55e", 0.5: "#f59e0b", 0.8: "#ef4444" },
      });
      layer!.addTo(map);
    });
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [cells, map]);
  return null;
}

export default function RiskMap({
  cells,
  selected,
  onSelect,
  focus,
  heat = false,
}: {
  cells: Cell[];
  selected: number | null;
  onSelect: (id: number) => void;
  focus: Focus;
  heat?: boolean;
}) {
  return (
    <MapContainer
      key="civicpulse-map"
      center={[28.64, 77.12]}
      zoom={11}
      style={{ height: "100%", width: "100%", background: "#0b1220" }}
      preferCanvas
    >
      <Resize />
      <FlyTo focus={focus} />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="cp-dark-tiles"
      />
      {heat && <Heat cells={cells} />}
      {cells.map((c) => (
        <CircleMarker
          key={c.cell_id}
          center={[c.lat, c.lon]}
          radius={c.cell_id === selected ? 11 : heat ? 4 : c.risk_level === "Low" ? 3.5 : 6}
          pathOptions={{
            color: c.cell_id === selected ? "#ffffff" : COLORS[c.risk_level],
            fillColor: COLORS[c.risk_level],
            fillOpacity: heat ? 0.25 : c.risk_level === "Low" ? 0.45 : 0.85,
            weight: c.cell_id === selected ? 3 : 1,
          }}
          eventHandlers={{ click: () => onSelect(c.cell_id) }}
        >
          <Tooltip sticky>
            {c.place_name} | {(c.risk_probability * 100).toFixed(1)}%
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}