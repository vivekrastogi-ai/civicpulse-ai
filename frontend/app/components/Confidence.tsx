"use client";

import { useEffect, useState } from "react";
import { API } from "../lib/api";

type C = { level: string; why: string; model_note: string; days_ahead: number };

export default function Confidence({ date }: { date: string }) {
  const [c, setC] = useState<C | null>(null);

  useEffect(() => {
    if (!date) return;
    let stale = false;
    fetch(`${API}/api/v1/confidence?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!stale) setC(j); })
      .catch(() => {});
    return () => { stale = true; };
  }, [date]);

  if (!c) return null;
  const cls =
    c.level === "High" ? "bg-emerald-500/20 text-emerald-300"
    : c.level === "Medium" ? "bg-amber-500/20 text-amber-300"
    : "bg-red-500/20 text-red-300";

  return (
    <span title={`${c.why} ${c.model_note}`} className={`cursor-help rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      Bharosa: {c.level === "High" ? "Zyada" : c.level === "Medium" ? "Madhyam" : "Kam"}
    </span>
  );
}