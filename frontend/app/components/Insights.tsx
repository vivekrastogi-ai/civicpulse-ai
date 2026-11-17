"use client";

import { useEffect, useState } from "react";
import { API } from "../lib/api";
import { makeRiskCard } from "./shareCard";

type Res = {
  score: number;
  grade: string;
  parts: Record<string, number>;
  underpasses: number;
  note: string;
};

export default function Insights({
  cellId,
  placeName,
  riskPct,
  level,
  date,
}: {
  cellId: number;
  placeName: string;
  riskPct: string;
  level: string;
  date: string;
}) {
  const [r, setR] = useState<Res | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setR(null);
    fetch(`${API}/api/v1/resilience?cell_id=${cellId}`)
      .then((x) => x.json())
      .then(setR)
      .catch(() => setR(null));
  }, [cellId]);

    const share = async () => {
    try {
      const blob = await makeRiskCard({ place: placeName, date, riskPct, level, score: r?.score ?? null });
      const file = new File([blob], "civicpulse-risk.png", { type: "image/png" });
      const text = `${placeName}: ${riskPct} (${level}) on ${date}. CivicPulse AI`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: "CivicPulse AI" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "civicpulse-risk.png";
        a.click();
        setMsg("Card download ho gaya, ab kahin bhi share karo.");
      }
    } catch {
      setMsg("Share nahi hua.");
    }
  };

  const color = !r ? "#64748b" : r.score >= 65 ? "#22c55e" : r.score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <>
      {r && r.underpasses > 0 && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm">
          <div className="font-bold text-red-300">⚠ Underpass alert</div>
          <p className="mt-1 text-slate-200">
            Is ilaake mein {r.underpasses} underpass/tunnel hain. Barish mein ye sabse pehle bharte hain. Paani dikhe
            toh andar na ghusein, doosra raasta lein.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Resilience score</div>
          {r && <span className="text-xs text-slate-400">{r.grade}</span>}
        </div>
        {!r ? (
          <p className="text-xs text-slate-400">Load ho raha hai...</p>
        ) : (
          <>
            <div className="mb-2 flex items-end gap-2">
              <div className="text-4xl font-black" style={{ color }}>
                {r.score}
              </div>
              <div className="pb-1 text-xs text-slate-400">/ 100 (zyada = behtar)</div>
            </div>
            <div className="mb-3 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full" style={{ width: `${r.score}%`, background: color }} />
            </div>
            <div className="space-y-1">
              {Object.entries(r.parts).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-[11px]">
                  <span className="w-32 text-slate-400">{k}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-white/10">
                    <div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${v}%` }} />
                  </div>
                  <span className="w-6 text-right text-slate-500">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">{r.note}</p>
          </>
        )}
      </div>

      <button
        onClick={share}
        className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-400/10 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/20"
      >
        📤 Share risk card (image)
      </button>
      {msg && <div className="text-xs text-emerald-200">{msg}</div>}
    </>
  );
}