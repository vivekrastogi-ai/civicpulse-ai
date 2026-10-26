"use client";

import { useEffect, useState } from "react";
import { API } from "../lib/api";

type D = {
  score: number; label: string; reason: string;
  high_cells: number; medium_cells: number; total_cells: number; avg_rain_mm: number;
};

export default function FloodScore({ date }: { date: string }) {
  const [d, setD] = useState<D | null>(null);

  useEffect(() => {
    if (!date) return;
    let stale = false;
    setD(null);
    fetch(`${API}/api/v1/flood-score?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!stale) setD(j); })
      .catch(() => { if (!stale) setD(null); });
    return () => { stale = true; };
  }, [date]);

  if (!d) return <div className="text-xs text-slate-500">Flood score load ho raha hai...</div>;
  const color = d.score < 15 ? "#22c55e" : d.score < 40 ? "#f59e0b" : "#ef4444";
  const len = Math.PI * 70;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="relative w-32 shrink-0">
        <svg viewBox="0 0 160 90" className="w-full">
          <path d="M10 85 A70 70 0 0 1 150 85" fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
          <path
            d="M10 85 A70 70 0 0 1 150 85" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={len} strokeDashoffset={len * (1 - Math.max(d.score, 3) / 100)}
            style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center text-2xl font-black text-white">{d.score}</div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-slate-400">Delhi Flood Score ({date})</div>
        <div className="text-lg font-bold" style={{ color }}>{d.label} risk</div>
        <div className="text-xs text-slate-300">{d.reason}</div>
        <div className="text-xs text-slate-400">
          {d.high_cells} High | {d.medium_cells} Medium | {d.total_cells} cells | avg barish {d.avg_rain_mm} mm
        </div>
      </div>
    </div>
  );
}