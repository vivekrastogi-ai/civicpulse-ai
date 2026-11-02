"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, authHeaders, getUser } from "../lib/api";


type Step = { rain_mm: number; high_cells: number; avg_risk: number; max_risk: number };
type Data = { date: string; mode: string; total_cells: number; steps: Step[]; note: string };

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const pct = (p: number) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);

export default function Stress() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else setDate("2024-09-13");
  }, [router]);

  useEffect(() => {
    if (!date) return;
    let stale = false;
    setLoading(true);
    setErr("");
    setD(null);
    fetch(`${API}/api/v1/stress-test?date=${date}`, {
    headers: authHeaders()
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || "Data nahi mila");
        return j;
      })
            .then((j) => {
        if (!stale) setD(j);
      })
      .catch((e) => {
        if (!stale) {
          setD(null);
          setErr(e.message);
        }
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [date]);

  const maxH = Math.max(1, ...(d?.steps ?? []).map((s) => s.high_cells));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">Rain Stress Test</h1>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="ml-auto rounded-full bg-white/10 px-3 py-1 text-sm [color-scheme:dark]"
          />
        </div>
        <p className="text-sm text-slate-400">
          Agar Delhi mein itni barish ho (0 se 150 mm), toh us din ki baaki condition ke saath kitne cells High-risk mein aayenge?
        </p>
        {loading && <p className="text-sky-300">Calculate ho raha hai... (10-20 second)</p>}
        
        {err && (
  <div>
    <p>{err}</p>
    {err.includes("Premium") && (
      <a href="/premium" className="underline">
        Premium lo
      </a>
    )}
  </div>
)}

        {d && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex h-64 items-end gap-3">
              {d.steps.map((s) => (
                <div key={s.rain_mm} className="flex h-full flex-1 flex-col items-center justify-end">
                  <div className="mb-1 text-xs font-semibold">{s.high_cells}</div>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-sky-500 to-red-500 transition-all duration-700"
                    style={{ height: `${Math.max(6, (s.high_cells / maxH) * 210)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3">
              {d.steps.map((s) => (
                <div key={s.rain_mm} className="flex-1 text-center text-xs text-slate-400">
                  {s.rain_mm} mm
                  <div className="text-[10px] text-slate-500">avg {pct(s.avg_risk)}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Kul {d.total_cells} cells mein se. {d.note}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}