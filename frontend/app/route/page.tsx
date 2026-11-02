"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, authHeaders, getUser } from "../lib/api";
import type { RouteLine } from "../components/RouteMap";

const RouteMap = dynamic(() => import("../components/RouteMap"), { ssr: false });

type Hit = { cell_id: number; place_name: string; lat: number; lon: number };
type Route = RouteLine & {
  distance_km: number;
  duration_min: number;
  avg_risk: number;
  max_risk: number;
  risky_points: number;
};

const pct = (p: number) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function Picker({ label, value, onPick }: { label: string; value: Hit | null; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState("");
  const search = () => {
    if (!q.trim()) return;
    setMsg("");
    fetch(`${API}/api/v1/search?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then((d: Hit[]) => {
        setHits(d);
        if (!d.length) setMsg("Jagah nahi mili");
      })
      .catch(() => setMsg("Search nahi hua"));
  };
  return (
    <div className="relative flex-1">
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Jagah likho, Enter dabao"
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder-slate-500"
        />
        <button onClick={search} className="rounded-lg bg-sky-500 px-3 text-sm font-semibold">Dhundo</button>
      </div>
      {value && <div className="mt-1 text-xs text-emerald-300">✓ {value.place_name}</div>}
      {(hits.length > 0 || msg) && (
        <div className="absolute left-0 top-full z-[1200] mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl">
          {msg && <div className="p-2 text-xs text-slate-400">{msg}</div>}
          {hits.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                onPick(h);
                setQ(h.place_name);
                setHits([]);
              }}
              className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              {h.place_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoutePage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [a, setA] = useState<Hit | null>(null);
  const [b, setB] = useState<Hit | null>(null);
  const [date, setDate] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [safest, setSafest] = useState(0);
  const [fastest, setFastest] = useState(0);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else {
      setOk(true);
      setDate(iso(new Date()));
    }
  }, [router]);

  const go = () => {
    if (!a || !b) {
      setErr("Dono jagah suggestion list se chuno.");
      return;
    }
    setErr("");
    setBusy(true);
    setRoutes([]);
    const qs = new URLSearchParams({
      from_lat: String(a.lat),
      from_lon: String(a.lon),
      to_lat: String(b.lat),
      to_lon: String(b.lon),
      date,
    });
    fetch(`${API}/api/v1/route?${qs}`, {
    headers: authHeaders()
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Raasta nahi mila");
        return d;
      })
      .then((d) => {
        setRoutes(d.routes);
        setSafest(d.safest);
        setFastest(d.fastest);
        setNote(d.note);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  if (!ok) return null;

  const lines: RouteLine[] = routes.map((r, i) => ({
    geometry: r.geometry,
    color: i === safest ? "#22c55e" : i === fastest ? "#38bdf8" : "#94a3b8",
    weight: i === safest ? 7 : 4,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-4 p-6">
        <h1 className="text-3xl font-extrabold">Safe Route</h1>
        <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-4">
          <Picker label="Kahan se" value={a} onPick={setA} />
          <Picker label="Kahan tak" value={b} onPick={setB} />
          <div>
            <div className="mb-1 text-xs text-slate-400">Tareekh</div>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm [color-scheme:dark]"
            />
          </div>
          <div className="flex items-end">
            <button onClick={go} className="w-full rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 py-2 font-semibold">
              {busy ? "Dhundh raha hai..." : "Raasta dhundo"}
            </button>
          </div>
        </div>
        
        {err && (

  <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">
    <p>{err}</p>
    {err.includes("Premium") && (
      <a href="/premium" className="mt-2 inline-block underline">
        Premium lo 👑
      </a>
    )}
  </div>
)}

        <div className="h-[28rem] overflow-hidden rounded-2xl border border-white/10">
          <RouteMap lines={lines} from={a} to={b} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {routes.map((r, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-4 ${
                i === safest ? "border-emerald-400/40 bg-emerald-400/5" : "border-white/10 bg-white/5"
              }`}
            >
              <div className="mb-1 flex gap-1 text-[11px] font-semibold">
                {i === safest && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">Safest (hara)</span>}
                {i === fastest && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-sky-300">Fastest (neela)</span>}
                {i !== safest && i !== fastest && <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">Vikalp</span>}
              </div>
              <div className="text-2xl font-extrabold">{r.duration_min} min</div>
              <div className="text-sm text-slate-400">{r.distance_km} km</div>
              <div className="mt-2 text-xs text-slate-300">
                Avg risk {pct(r.avg_risk)} | Max {pct(r.max_risk)} | Risky points {r.risky_points}
              </div>
            </div>
          ))}
        </div>
        {note && <p className="text-xs text-slate-500">{note}</p>}
        {routes.length === 1 && (
          <p className="text-xs text-slate-500">Is jodi ke liye sirf ek raasta mila, isliye safest aur fastest wahi hai.</p>
        )}
      </main>
    </div>
  );
}