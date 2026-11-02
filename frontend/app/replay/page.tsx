"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, authHeaders, getUser } from "../lib/api";
import type { Cell } from "../components/RiskMap";

const RiskMap = dynamic(() => import("../components/RiskMap"), { ssr: false });

type Day = { date: string; score: number; high_cells: number; avg_rain_mm: number };

const col = (s: number) => (s < 15 ? "#22c55e" : s < 40 ? "#f59e0b" : "#ef4444");

export default function Replay() {
  const router = useRouter();
  const [days, setDays] = useState<Day[]>([]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);
  const [cells, setCells] = useState<Cell[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const cache = useRef<Record<string, Cell[]>>({});

  useEffect(() => {
    if (!getUser()) {
      router.replace("/login");
      return;
    }
    fetch(`${API}/api/v1/replay`, {
  headers: authHeaders()
})
      .then((r) => r.json())
      .then((d) => {
        const ds: Day[] = d.days ?? [];
        setDays(ds);
        // sabse badi barish wale din se shuru
        const best = ds.reduce((b, x, k) => (x.score > (ds[b]?.score ?? -1) ? k : b), 0);
        setI(Math.max(0, best - 3));
      })
      .catch(() => setErr("Replay data nahi mila. Backend chal raha hai?"))
      .finally(() => setLoading(false));
  }, [router]);

  const cur = days[i];

  useEffect(() => {
    if (!cur) return;
    let stale = false;
    const d = cur.date;
    if (cache.current[d]) {
      setCells(cache.current[d]);
      return;
    }
    fetch(`${API}/api/v1/risk-map?date=${d}`)
      .then((r) => r.json())
      .then((j) => {
        cache.current[d] = j.cells;
        if (!stale) setCells(j.cells);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [cur]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setI((k) => {
        if (k >= days.length - 1) {
          setPlaying(false);
          return k;
        }
        return k + 1;
      });
    }, speed);
    return () => clearInterval(t);
  }, [playing, speed, days.length]);

  const maxS = Math.max(1, ...days.map((d) => d.score));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">Rain Replay: Monsoon 2024</h1>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Model ka estimate</span>
        </div>
        {loading && <p className="text-sky-300">Load ho raha hai... (pehli baar 1 minute lag sakta hai)</p>}
        
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

        {cur && (
          <>
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div>
                <div className="text-xs text-slate-400">Tareekh</div>
                <div className="text-2xl font-black">{cur.date}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Flood score</div>
                <div className="text-2xl font-black" style={{ color: col(cur.score) }}>{cur.score}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">High cells</div>
                <div className="text-2xl font-black text-red-300">{cur.high_cells}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Avg barish</div>
                <div className="text-2xl font-black text-sky-300">{cur.avg_rain_mm} mm</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-2 font-semibold"
                >
                  {playing ? "⏸ Pause" : "▶ Play"}
                </button>
                <select
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="rounded-lg bg-slate-800 px-2 py-2 text-sm"
                >
                  <option value={2000}>Dheema</option>
                  <option value={1200}>Normal</option>
                  <option value={600}>Tez</option>
                </select>
              </div>
            </div>

            <div className="h-[28rem] overflow-hidden rounded-2xl border border-white/10">
              <RiskMap cells={cells} selected={null} onSelect={() => {}} focus={null} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-sm font-semibold">Din-wise Flood Score (bar par click karo)</div>
              <div className="flex h-24 items-end gap-px">
                {days.map((d, k) => (
                  <button
                    key={d.date}
                    onClick={() => {
                      setPlaying(false);
                      setI(k);
                    }}
                    title={`${d.date}: score ${d.score}, barish ${d.avg_rain_mm} mm`}
                    className="flex-1"
                    style={{
                      height: `${Math.max(3, (d.score / maxS) * 96)}px`,
                      background: k === i ? "#ffffff" : col(d.score),
                      opacity: k === i ? 1 : 0.7,
                    }}
                  />
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, days.length - 1)}
                value={i}
                onChange={(e) => {
                  setPlaying(false);
                  setI(Number(e.target.value));
                }}
                className="mt-3 w-full accent-sky-400"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                June se September 2024. Har din ka map model ke estimate par based hai.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}