"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Cell } from "./components/RiskMap";

const RiskMap = dynamic(() => import("./components/RiskMap"), { ssr: false });
const API = "http://127.0.0.1:8000";

type Factor = {
  label: string;
  value: number;
  contribution: number;
  direction: string;
};
type Explanation = {
  risk_probability: number;
  risk_level: string;
  top_factors: Factor[];
  disclaimer: string;
};

type Simulation = {
  original_rain_mm: number;
  scenario_rain_mm: number;
  original_probability: number;
  scenario_probability: number;
  scenario_level: string;
  disclaimer: string;
};

export default function Home() {
  const [date, setDate] = useState("2024-09-13");
  const [cells, setCells] = useState<Cell[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [expl, setExpl] = useState<Explanation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mult, setMult] = useState(1);
  const [sim, setSim] = useState<Simulation | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    setSelected(null);
    setExpl(null);
    fetch(`${API}/api/v1/risk-map?date=${date}`)
      .then((r) => {
        if (!r.ok) throw new Error("Is date ka data nahi hai (2024-06-01 se 2024-09-30 chuno)");
        return r.json();
      })
      .then((d) => {
        setCells(d.cells);
        setSummary(d.summary);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    if (selected === null) return;
    fetch(`${API}/api/v1/predict?cell_id=${selected}&date=${date}`)
      .then((r) => r.json())
      .then(setExpl)
      .catch(() => setExpl(null));
  }, [selected, date]);

    useEffect(() => {
    setMult(1);
    setSim(null);
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

  return (
    <div className="flex h-screen flex-col bg-gray-100 text-gray-900">
      <header className="flex flex-wrap items-center gap-4 bg-slate-900 px-4 py-3 text-white">
        <h1 className="text-lg font-bold">CivicPulse AI - Delhi Waterlogging Risk</h1>
        <input
          type="date"
          value={date}
          min="2024-06-01"
          max="2024-09-30"
          onChange={(e) => setDate(e.target.value)}
          className="rounded bg-white px-2 py-1 text-gray-900"
        />
        <div className="flex gap-3 text-sm">
          <span className="text-red-400">High: {summary.High ?? 0}</span>
          <span className="text-yellow-400">Medium: {summary.Medium ?? 0}</span>
          <span className="text-green-400">Low: {summary.Low ?? 0}</span>
        </div>
        {loading && <span className="text-sm">Loading...</span>}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex-1">
          <RiskMap cells={cells} selected={selected} onSelect={setSelected} />
        </div>

        <aside className="w-80 overflow-y-auto bg-white p-4 shadow-lg">
          {!expl ? (
            <p className="text-sm text-gray-500">
              Map par kisi cell (circle) par click karo, uska risk aur explanation yahan dikhega.
            </p>
          ) : (
            <div className="space-y-3">
              <h2 className="font-bold">Cell {selected}</h2>
              <div className="rounded border p-3">
                <div className="text-2xl font-bold">
                  {(expl.risk_probability * 100).toFixed(1)}%
                </div>
                <div
                  className={
                    expl.risk_level === "High"
                      ? "font-semibold text-red-600"
                      : expl.risk_level === "Medium"
                      ? "font-semibold text-yellow-600"
                      : "font-semibold text-green-600"
                  }
                >
                  {expl.risk_level} risk
                </div>
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
                  <p className="text-xs text-gray-500">
                    Slider hilao, naya risk yahan dikhega.
                  </p>
                )}
              </div>
              <h3 className="text-sm font-semibold">Mukhya wajah</h3>
              
              <ul className="space-y-2 text-sm">
                {expl.top_factors.map((f) => (
                  <li key={f.label} className="rounded bg-gray-50 p-2">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-gray-600">
                      value: {f.value.toFixed(2)} |{" "}
                      <span
                        className={
                          f.direction === "increases_risk" ? "text-red-600" : "text-green-600"
                        }
                      >
                        {f.contribution > 0 ? "+" : ""}
                        {f.contribution.toFixed(2)}{" "}
                        {f.direction === "increases_risk" ? "(risk badhata hai)" : "(risk ghatata hai)"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500">{expl.disclaimer}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}