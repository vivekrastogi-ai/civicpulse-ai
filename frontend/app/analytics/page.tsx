"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, getUser } from "../lib/api";

type Data = {
  date: string;
  mode: string;
  total_cells: number;
  avg_rain_mm: number;
  max_rain_mm: number;
  max_probability: number;
  avg_probability: number;
  distribution: { label: string; cells: number }[];
  top_areas: { cell_id: number; place_name: string; risk_probability: number; rain_mm: number }[];
};

const pct = (p: number) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);
const card = "rounded-2xl border border-white/10 bg-white/5 p-4";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function Analytics() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/login");
      return;
    }
    setDate(iso(new Date()));
  }, [router]);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setErr("");
    fetch(`${API}/api/v1/analytics?date=${date}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || "Data nahi mila");
        return j;
      })
      .then(setD)
      .catch((e) => {
        setD(null);
        setErr(e.message);
      })
      .finally(() => setLoading(false));
  }, [date]);

  const maxC = Math.max(1, ...(d?.distribution ?? []).map((x) => x.cells));
  const maxP = Math.max(0.001, ...(d?.top_areas ?? []).map((x) => x.risk_probability));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">Analytics</h1>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="ml-auto rounded-full bg-white/10 px-3 py-1 text-sm [color-scheme:dark]"
          />
        </div>
        {loading && <p className="text-sky-300">Load ho raha hai... (live data pehli baar 1 min le sakta hai)</p>}
        {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}
        {d && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Kul cells", d.total_cells, "text-sky-300"],
                ["Average barish", `${d.avg_rain_mm} mm`, "text-teal-300"],
                ["Sabse zyada barish", `${d.max_rain_mm} mm`, "text-violet-300"],
                ["Sabse zyada risk", pct(d.max_probability), "text-red-300"],
              ].map(([l, v, c]) => (
                <div key={l as string} className={card}>
                  <div className="text-xs text-slate-400">{l}</div>
                  <div className={`mt-1 text-2xl font-extrabold ${c}`}>{v}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={card}>
                <div className="mb-3 font-semibold">Risk ka distribution (cells)</div>
                <div className="space-y-3 text-sm">
                  {d.distribution.map((x) => (
                    <div key={x.label}>
                      <div className="flex justify-between">
                        <span>{x.label}</span>
                        <span className="text-slate-400">{x.cells}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500"
                          style={{ width: `${(x.cells / maxC) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={card}>
                <div className="mb-3 font-semibold">Top {d.top_areas.length} risky areas</div>
                <div className="space-y-2 text-sm">
                  {d.top_areas.map((a, i) => (
                    <div key={a.cell_id}>
                      <div className="flex justify-between">
                        <span>
                          {i + 1}. {a.place_name}
                        </span>
                        <span className="text-slate-400">
                          {pct(a.risk_probability)} | {a.rain_mm} mm
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/10">
                        <div
                          className="h-1.5 rounded-full bg-red-500"
                          style={{ width: `${(a.risk_probability / maxP) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {d.mode === "forecast" ? "Live/forecast based estimate." : "2024 observed data par model estimate."} Ye
              prototype hai, emergency warning nahi.
            </p>
          </>
        )}
      </main>
    </div>
  );
}