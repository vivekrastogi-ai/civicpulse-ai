"use client";

import { useEffect, useState } from "react";
import { API } from "../lib/api";

type Day = { date: string; rain_mm: number; risk_probability: number };

const pct = (p: number) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);

export default function Timeline({ cellId }: { cellId: number }) {
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/v1/timeline?cell_id=${cellId}`)
      .then((r) => r.json())
      .then((d) => setDays(d.days ?? []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, [cellId]);

  const maxP = Math.max(0.02, ...days.map((d) => d.risk_probability));

  return (
    <div className="rounded-2xl border border-teal-400/20 bg-teal-400/5 p-4 text-sm">
      <div className="mb-2 font-semibold text-teal-300">Agle 7 din ka risk</div>
      {loading && <p className="text-xs text-slate-400">Load ho raha hai...</p>}
      {!loading && days.length === 0 && <p className="text-xs text-slate-400">Forecast abhi nahi mila.</p>}
      <div className="flex h-28 items-end gap-1">
        {days.map((d) => {
          const h = Math.max(4, (d.risk_probability / maxP) * 90);
          const color =
            d.risk_probability >= 0.08 ? "bg-red-500" : d.risk_probability >= 0.02 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center justify-end" title={`${d.date}: ${pct(d.risk_probability)}, barish ${d.rain_mm} mm`}>
              <div className="mb-1 text-[9px] text-slate-300">{pct(d.risk_probability)}</div>
              <div className={`w-full rounded-t ${color}`} style={{ height: `${h}px` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {days.map((d) => (
          <div key={d.date} className="flex-1 text-center text-[9px] text-slate-400">
            {d.date.slice(5)}
            <div className="text-sky-300">{d.rain_mm}mm</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Forecast based estimate. Door ke din ka barish forecast kam bharosemand hota hai.
      </p>
    </div>
  );
}