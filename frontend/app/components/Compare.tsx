"use client";

import { useState } from "react";
import { API } from "../lib/api";

type Factor = { label: string; contribution: number; direction: string };
type Place = {
  cell_id: number;
  place_name: string;
  risk_probability: number;
  risk_level: string;
  rain_mm: number;
  elevation: number;
  top_factors: Factor[];
};
type Hit = { cell_id: number; place_name: string };

const pct = (p: number) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);
const lvl = (l: string) =>
  l === "High" ? "text-red-400" : l === "Medium" ? "text-amber-400" : "text-emerald-400";

function Picker({ label, onPick }: { label: string; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const search = () => {
    if (!q.trim()) return;
    fetch(`${API}/api/v1/search?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then(setHits)
      .catch(() => setHits([]));
  };
  return (
    <div className="relative flex-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && search()}
        placeholder={label}
        className="w-full rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none"
      />
      {hits.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl">
          {hits.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                onPick(h);
                setQ(h.place_name);
                setHits([]);
              }}
              className="block w-full border-b border-white/5 px-3 py-1.5 text-left text-xs hover:bg-white/10"
            >
              {h.place_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Compare({ date, current }: { date: string; current: Hit | null }) {
  const [a, setA] = useState<Hit | null>(current);
  const [b, setB] = useState<Hit | null>(null);
  const [res, setRes] = useState<{ places: Place[]; summary: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = () => {
    const first = a ?? current;
    if (!first || !b) {
      setErr("Dono jagah chuno.");
      return;
    }
    setErr("");
    setBusy(true);
    fetch(`${API}/api/v1/compare?cell_a=${first.cell_id}&cell_b=${b.cell_id}&date=${date}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Compare nahi hua");
        return d;
      })
      .then(setRes)
      .catch((e) => {
        setRes(null);
        setErr(e.message);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="rounded-2xl border border-orange-400/20 bg-orange-400/5 p-4 text-sm">
      <div className="mb-2 font-semibold text-orange-300">Do jagah compare karo</div>
      <div className="mb-2 flex gap-2">
        <Picker label={current ? `Pehli: ${current.place_name}` : "Pehli jagah"} onPick={setA} />
        <Picker label="Dusri jagah" onPick={setB} />
      </div>
      <button onClick={run} className="mb-2 rounded-lg bg-orange-500 px-3 py-1.5 font-semibold text-white hover:bg-orange-400">
        {busy ? "..." : "Compare"}
      </button>
      {err && <div className="text-xs text-red-300">{err}</div>}
      {res && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {res.places.map((p) => (
              <div key={p.cell_id} className="rounded-xl bg-white/5 p-3">
                <div className="truncate text-xs text-slate-300">{p.place_name}</div>
                <div className="text-2xl font-extrabold">{pct(p.risk_probability)}</div>
                <div className={`text-xs font-semibold ${lvl(p.risk_level)}`}>{p.risk_level}</div>
                <div className="mt-1 text-[11px] text-slate-400">
                  barish {p.rain_mm} mm | unchai {p.elevation} m
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px]">
                  {p.top_factors.map((f) => (
                    <li key={f.label} className={f.direction === "increases_risk" ? "text-red-300" : "text-emerald-300"}>
                      {f.direction === "increases_risk" ? "▲" : "▼"} {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-300">{res.summary}</p>
        </>
      )}
    </div>
  );
}