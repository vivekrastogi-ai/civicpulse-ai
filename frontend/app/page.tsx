"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Cell, Focus } from "./components/RiskMap";

const RiskMap = dynamic(() => import("./components/RiskMap"), { ssr: false });
const API = "http://127.0.0.1:8000";

type Factor = { label: string; value: number; contribution: number; direction: string };
type Explanation = {
  risk_probability: number;
  risk_level: string;
  place_name: string;
  mode: string;
  rain_mm: number;
  precautions: string[];
  top_factors: Factor[];
  disclaimer: string;
};
type Simulation = {
  original_rain_mm: number;
  scenario_rain_mm: number;
  original_probability: number;
  scenario_probability: number;
  disclaimer: string;
};
type ChatMsg = { role: "user" | "bot"; text: string; source?: string };
type Hit = { cell_id: number; place_name: string; lat: number; lon: number };

const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

export default function Home() {
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("");
  const [cells, setCells] = useState<Cell[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [expl, setExpl] = useState<Explanation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mult, setMult] = useState(1);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");
  const [focus, setFocus] = useState<Focus>(null);

  const placeName = focus?.name ?? expl?.place_name ?? "";

  useEffect(() => {
    setDate(addDays(0));
  }, []);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setError("");
    setSelected(null);
    setExpl(null);
    setFocus(null);
    fetch(`${API}/api/v1/risk-map?date=${date}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || "Data nahi mila");
        return d;
      })
      .then((d) => {
        setCells(d.cells);
        setSummary(d.summary);
        setMode(d.mode);
      })
      .catch((e) => {
        setCells([]);
        setSummary({});
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    if (selected === null || !date) return;
    fetch(`${API}/api/v1/predict?cell_id=${selected}&date=${date}`)
      .then((r) => r.json())
      .then(setExpl)
      .catch(() => setExpl(null));
  }, [selected, date]);

  useEffect(() => {
    setMult(1);
    setSim(null);
    setChat([]);
    setQuestion("");
  }, [selected, date]);

  useEffect(() => {
    if (selected === null || mult === 1) {
      setSim(null);
      return;
    }
    const t = setTimeout(() => {
      fetch(`${API}/api/v1/simulations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cell_id: selected, date, rain_multiplier: mult }),
      })
        .then((r) => r.json())
        .then(setSim)
        .catch(() => setSim(null));
    }, 300);
    return () => clearTimeout(t);
  }, [mult, selected, date]);

  const doSearch = () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setHits([]);
    setSearchMsg("");
    fetch(`${API}/api/v1/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d: Hit[]) => {
        if (!d.length) setSearchMsg("Delhi mein ye jagah nahi mili");
        setHits(d);
      })
      .catch(() => setSearchMsg("Search nahi ho paya"))
      .finally(() => setSearching(false));
  };

  const pick = (h: Hit) => {
    setFocus({ lat: h.lat, lon: h.lon, name: h.place_name });
    setSelected(h.cell_id);
    setHits([]);
    setQuery(h.place_name);
  };

  const onMapSelect = (id: number) => {
    setFocus(null);
    setSelected(id);
  };

  const ask = () => {
    const q = question.trim();
    if (!q || selected === null || asking) return;
    setChat((c) => [...c, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    fetch(`${API}/api/v1/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cell_id: selected, date, question: q, place_name: placeName || null }),
    })
      .then((r) => r.json())
      .then((d) => setChat((c) => [...c, { role: "bot", text: d.answer, source: d.source }]))
      .catch(() => setChat((c) => [...c, { role: "bot", text: "Server se jawab nahi aaya." }]))
      .finally(() => setAsking(false));
  };

  const levelColor =
    expl?.risk_level === "High"
      ? "text-red-600"
      : expl?.risk_level === "Medium"
      ? "text-yellow-600"
      : "text-green-600";

  const quick = [
    { label: "Kal se pehle", d: addDays(-1) },
    { label: "Aaj", d: addDays(0) },
    { label: "Kal", d: addDays(1) },
    { label: "+2 din", d: addDays(2) },
    { label: "+3 din", d: addDays(3) },
    { label: "2024 demo", d: "2024-09-13" },
  ];

  return (
    <div className="flex h-screen flex-col bg-gray-100 text-gray-900">
      <header className="relative z-[1000] flex flex-wrap items-center gap-3 bg-slate-900 px-4 py-3 text-white">
        <h1 className="text-lg font-bold">CivicPulse AI - Delhi Waterlogging Risk</h1>

        <div className="flex flex-wrap items-center gap-1">
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={() => setDate(q.d)}
              className={`rounded px-2 py-1 text-xs ${
                date === q.d ? "bg-blue-600" : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              {q.label}
            </button>
          ))}
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="ml-1 rounded bg-white px-2 py-1 text-xs text-gray-900"
          />
        </div>

        <div className="relative">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Delhi mein jagah dhundho (jaise East Azad Nagar)"
              className="w-72 rounded bg-white px-3 py-1 text-gray-900"
            />
            <button
              onClick={doSearch}
              className="rounded bg-blue-600 px-3 py-1 font-semibold hover:bg-blue-500"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          {(hits.length > 0 || searchMsg) && (
            <div className="absolute left-0 top-full mt-1 w-full overflow-hidden rounded bg-white text-gray-900 shadow-xl">
              {searchMsg && <div className="p-2 text-sm text-gray-500">{searchMsg}</div>}
              {hits.map((h, i) => (
                <button
                  key={i}
                  onClick={() => pick(h)}
                  className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-blue-50"
                >
                  {h.place_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 text-sm">
          <span className="text-red-400">High: {summary.High ?? 0}</span>
          <span className="text-yellow-400">Medium: {summary.Medium ?? 0}</span>
          <span className="text-green-400">Low: {summary.Low ?? 0}</span>
        </div>
        {mode && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              mode === "forecast" ? "bg-emerald-600" : "bg-slate-600"
            }`}
          >
            {mode === "forecast" ? "LIVE / FORECAST" : "2024 OBSERVED"}
          </span>
        )}
        {loading && <span className="text-sm">Loading... (live data pehli baar 1 min le sakta hai)</span>}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex-1">
          <RiskMap cells={cells} selected={selected} onSelect={onMapSelect} focus={focus} />
        </div>

        <aside className="w-96 overflow-y-auto bg-white p-4 shadow-lg">
          {!expl ? (
            <p className="text-sm text-gray-500">
              Map par kisi circle par click karo, ya upar search box mein Delhi ki koi jagah likho.
              Uska risk, wajah aur savdhaniyan yahan dikhengi.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">{placeName}</h2>
                <div className="text-xs text-gray-500">
                  Cell {selected} | {date} | barish {expl.rain_mm.toFixed(1)} mm
                </div>
              </div>

              <div className="rounded border p-3">
                <div className="text-3xl font-bold">{(expl.risk_probability * 100).toFixed(1)}%</div>
                <div className={`font-semibold ${levelColor}`}>{expl.risk_level} risk</div>
              </div>

              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="mb-1 font-semibold">Savdhaniyan (kya karein)</div>
                <ul className="list-disc space-y-1 pl-5">
                  {expl.precautions.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
                <div className="font-semibold">What-if: barish badlo</div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.25}
                  value={mult}
                  onChange={(e) => setMult(parseFloat(e.target.value))}
                  className="my-2 w-full"
                />
                <div>Barish: {mult}x</div>
                {sim ? (
                  <div className="mt-2 space-y-1">
                    <div>
                      Barish: {sim.original_rain_mm.toFixed(1)} mm →{" "}
                      <b>{sim.scenario_rain_mm.toFixed(1)} mm</b>
                    </div>
                    <div>
                      Risk: {(sim.original_probability * 100).toFixed(1)}% →{" "}
                      <b>{(sim.scenario_probability * 100).toFixed(1)}%</b>
                    </div>
                    <p className="text-xs text-gray-500">{sim.disclaimer}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Slider hilao, naya risk yahan dikhega.</p>
                )}
              </div>

              <h3 className="text-sm font-semibold">Mukhya wajah</h3>
              <ul className="space-y-2 text-sm">
                {expl.top_factors.map((f) => (
                  <li key={f.label} className="rounded bg-gray-50 p-2">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-gray-600">
                      value: {f.value.toFixed(2)} |{" "}
                      <span className={f.direction === "increases_risk" ? "text-red-600" : "text-green-600"}>
                        {f.contribution > 0 ? "+" : ""}
                        {f.contribution.toFixed(2)}{" "}
                        {f.direction === "increases_risk" ? "(risk badhata hai)" : "(risk ghatata hai)"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500">{expl.disclaimer}</p>

              <div className="rounded border border-purple-200 bg-purple-50 p-3 text-sm">
                <div className="font-semibold">AI assistant se poochho ({placeName})</div>
                <div className="my-2 max-h-56 space-y-2 overflow-y-auto">
                  {chat.length === 0 && (
                    <p className="text-xs text-gray-500">
                      Jaise: &quot;kis jagah ki baat ho rahi hai?&quot;, &quot;savdhani kya rakhein?&quot;,
                      &quot;kyun risk high hai?&quot;, &quot;barish 2x ho jaye toh?&quot;
                    </p>
                  )}
                  {chat.map((m, i) => (
                    <div
                      key={i}
                      className={m.role === "user" ? "rounded bg-white p-2 text-right" : "rounded bg-purple-100 p-2"}
                    >
                      <div>{m.text}</div>
                      {m.source && <div className="mt-1 text-[10px] text-gray-500">source: {m.source}</div>}
                    </div>
                  ))}
                  {asking && <p className="text-xs text-gray-500">Soch raha hoon...</p>}
                </div>
                <div className="flex gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && ask()}
                    placeholder="Apna sawal likho..."
                    className="min-w-0 flex-1 rounded border px-2 py-1"
                  />
                  <button
                    onClick={ask}
                    disabled={asking}
                    className="rounded bg-purple-600 px-3 py-1 text-white disabled:opacity-50"
                  >
                    Puchho
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}