"use client";

import { useState } from "react";
import { API, authHeaders } from "../lib/api";

type Hit = { cell_id: number; place_name: string };
type F = "briefing" | "watch" | "safety" | "outlook" | "export";

const FEATURES: { id: F; icon: string; title: string; text: string; grad: string }[] = [
  { id: "briefing", icon: "🧠", title: "AI Daily Briefing", text: "Delhi ka poora flood briefing, AI ki zubaani", grad: "from-sky-500/20" },
  { id: "watch", icon: "📡", title: "Watchlist (10 jagah)", text: "10 jagah ka agle 7 din ka risk, ek grid mein", grad: "from-emerald-500/20" },
  { id: "safety", icon: "🛡️", title: "Flood Safety Report", text: "Kisi bhi jagah ka report card aur monsoon record", grad: "from-amber-500/20" },
  { id: "outlook", icon: "🔭", title: "15-Day Outlook", text: "Agle 15 din aur sabse surakshit din", grad: "from-violet-500/20" },
  { id: "export", icon: "📥", title: "Data Export (CSV)", text: "Poore Delhi ka risk-map download karo", grad: "from-rose-500/20" },
];

const pct = (p: number | null) => (p === null ? "-" : p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function Picker({ onPick }: { onPick: (h: Hit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const go = () =>
    q.trim() &&
    fetch(`${API}/api/v1/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then(setHits).catch(() => setHits([]));
  return (
    <div className="relative">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Jagah likho, Enter dabao" className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none" />
        <button onClick={go} className="rounded-lg bg-sky-500 px-3 text-sm font-semibold">Dhundo</button>
      </div>
      {hits.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl">
          {hits.map((h, i) => (
            <button key={i} onClick={() => { onPick(h); setHits([]); setQ(""); }}
              className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/10">{h.place_name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PremiumLab({ premium }: { premium: boolean }) {
  const [f, setF] = useState<F | null>(null);
  const [picks, setPicks] = useState<Hit[]>([]);
  const [date, setDate] = useState(iso(new Date()));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const demo = !premium;
  const choose = (x: F) => { setF(x); setData(null); setErr(""); setPicks([]); };

  const run = async () => {
    if (!f) return;
    setBusy(true); setErr(""); setData(null);
    const dm = demo ? "&demo=true" : "";
    const first = picks[0]?.cell_id ?? 0;
    const url = {
      briefing: `/api/v1/premium/briefing?date=${date}${dm}`,
      watch: `/api/v1/premium/watchlist?cell_ids=${picks.map((p) => p.cell_id).join(",")}${dm}`,
      safety: `/api/v1/premium/safety-report?cell_id=${first}${dm}`,
      outlook: `/api/v1/premium/outlook?cell_id=${first}${dm}`,
      export: `/api/v1/premium/export?date=${date}${dm}`,
    }[f];
    try {
      if (!demo && (f === "watch" || f === "safety") && !picks.length) throw new Error("Pehle jagah chuno.");
      const r = await fetch(`${API}${url}`, { headers: authHeaders() });
      if (f === "export") {
        if (!r.ok) throw new Error((await r.json()).detail || "Export nahi hua");
        const b = await r.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `civicpulse_${demo ? "demo" : date}.csv`;
        a.click();
        setData({ done: true });
      } else {
        const j = await r.json();
        if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Nahi ho paya");
        setData(j);
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const needPlace = f === "watch" || f === "safety" || f === "outlook";
  const multi = f === "watch";

  return (
    <section>
      <div className="mb-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Premium Lab</div>
        <h2 className="mt-1 text-3xl font-extrabold">5 features jo sirf Premium mein hain</h2>
        <p className="mt-1 text-sm text-slate-400">
          {premium ? "Aap Premium ho. Koi bhi feature kholo aur asli data se chalao." : "Neeche kisi par bhi click karke sample demo dekho (2024 ke data par, limited)."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {FEATURES.map((x) => (
          <button key={x.id} onClick={() => choose(x.id)}
            className={`relative rounded-2xl border bg-gradient-to-b ${x.grad} to-transparent p-4 text-left transition hover:-translate-y-1 ${f === x.id ? "border-amber-400/60" : "border-white/10"}`}>
            {!premium && <span className="absolute right-2 top-2 rounded-full bg-amber-400/20 px-2 text-[10px] font-bold text-amber-300">👑 PRO</span>}
            <div className="text-3xl">{x.icon}</div>
            <div className="mt-2 text-sm font-bold">{x.title}</div>
            <p className="mt-1 text-[11px] text-slate-400">{x.text}</p>
          </button>
        ))}
      </div>

      {f && (
        <div className="mt-5 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{FEATURES.find((x) => x.id === f)?.title}</span>
            {demo && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-300">DEMO: 2024-09-13 ka sample data</span>}
          </div>

          {!demo && needPlace && (
            <div className="space-y-2">
              <Picker onPick={(h) => setPicks((p) => (multi ? [...p.filter((x) => x.cell_id !== h.cell_id), h].slice(0, 10) : [h]))} />
              <div className="flex flex-wrap gap-2">
                {picks.map((p) => (
                  <span key={p.cell_id} className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200">
                    {p.place_name}{" "}
                    <button onClick={() => setPicks(picks.filter((x) => x.cell_id !== p.cell_id))}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {!demo && (f === "briefing" || f === "export") && (
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm [color-scheme:dark]" />
          )}

          <button onClick={run} disabled={busy}
            className="rounded-full bg-gradient-to-r from-amber-400 to-rose-400 px-6 py-2 font-bold text-slate-900 disabled:opacity-50">
            {busy ? "Ban raha hai..." : demo ? "Demo chalao" : "Chalao"}
          </button>
          {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}

          {data && f === "briefing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black text-amber-300">{data.score}</div>
                <div className="text-xs text-slate-400">Flood score | {data.high_cells} High, {data.medium_cells} Medium | avg barish {data.avg_rain_mm} mm</div>
              </div>
              <p className="whitespace-pre-line rounded-xl bg-white/5 p-4 text-sm leading-relaxed">{data.briefing}</p>
              <div className="grid gap-2 md:grid-cols-5">
                {data.top_areas.map((t: { place: string; risk: number }, i: number) => (
                  <div key={i} className="rounded-xl bg-red-500/10 p-2 text-center text-xs">
                    <div className="truncate font-semibold">{t.place}</div>
                    <div className="text-lg font-black text-red-300">{pct(t.risk)}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-slate-500">source: {data.source} | {data.note}</div>
            </div>
          )}

          {data && f === "watch" && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="p-2 text-left">Jagah</th>{data.dates.map((d: string) => (<th key={d} className="p-2">{d.slice(5)}</th>))}</tr></thead>
                <tbody>
                  {data.places.map((p: { cell_id: number; place_name: string; risks: (number | null)[] }) => (
                    <tr key={p.cell_id}>
                      <td className="p-2 font-medium">{p.place_name}</td>
                      {p.risks.map((r, i) => {
                        const c = r === null ? "bg-white/5" : r >= data.high_thr ? "bg-red-500/60" : r >= data.low_thr ? "bg-amber-500/50" : "bg-emerald-500/40";
                        return (<td key={i} className="p-1"><div className={`rounded-md py-2 text-center ${c}`}>{pct(r)}</div></td>);
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-500">Hara = Low, peela = Medium, laal = High. Estimate hai.</p>
            </div>
          )}

          {data && f === "safety" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-5">
                <div>
                  <div className="text-xs text-slate-400">{data.place_name}</div>
                  <div className="text-5xl font-black text-amber-300">{data.resilience}<span className="text-lg text-slate-400">/100</span></div>
                  <div className="text-sm font-semibold">{data.grade}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[["Monsoon din", data.monsoon_days], ["High din", data.high_days], ["Sabse kharab din", data.worst_date]].map(([l, v]) => (
                    <div key={l as string} className="rounded-xl bg-white/5 p-3"><div className="text-lg font-black">{v}</div><div className="text-slate-400">{l}</div></div>
                  ))}
                </div>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">{data.advice.map((a: string, i: number) => (<li key={i}>{a}</li>))}</ul>
              <div className="text-[11px] text-slate-500">{data.note}</div>
            </div>
          )}

          {data && f === "outlook" && (
            <div className="space-y-3">
              <div className="text-sm">Sabse surakshit din: <b className="text-emerald-300">{data.best_day}</b> | Sabse risky din: <b className="text-red-300">{data.worst_day}</b></div>
              <div className="flex h-36 items-end gap-1">
                {data.days.map((d: { date: string; city_score: number; cell_risk: number | null }) => (
                  <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end" title={`${d.date}: score ${d.city_score}`}>
                    <div className="text-[9px] text-slate-400">{d.city_score}</div>
                    <div className={`w-full rounded-t ${d.date === data.best_day ? "bg-emerald-500" : d.date === data.worst_day ? "bg-red-500" : "bg-sky-500"}`}
                      style={{ height: `${Math.max(4, d.city_score * 1.1)}px` }} />
                    <div className="text-[9px] text-slate-500">{d.date.slice(8)}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-slate-500">Bars Delhi ka flood score hain. {data.note}</div>
            </div>
          )}

          {data && f === "export" && <div className="rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-200">CSV download ho gayi.{demo ? " (Demo mein sirf top 50 rows.)" : ""}</div>}
        </div>
      )}
    </section>
  );
}
