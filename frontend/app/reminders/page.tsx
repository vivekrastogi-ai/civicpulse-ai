"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, api, getUser } from "../lib/api";

type Hit = { cell_id: number; place_name: string };
type Rem = { id: string; label: string; place_name: string; cell_id: number; time: string };

export default function Reminders() {
  const router = useRouter();
  const [list, setList] = useState<Rem[]>([]);
  const [label, setLabel] = useState("Office");
  const [time, setTime] = useState("10:00");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pick, setPick] = useState<Hit | null>(null);
  const [msg, setMsg] = useState("");
  const [perm, setPerm] = useState("");

  const load = () => api("/api/v1/reminders").then(setList).catch(() => {});

  useEffect(() => {
    if (!getUser()) {
      router.replace("/login");
      return;
    }
    load();
    if ("Notification" in window) setPerm(Notification.permission);
  }, [router]);

  const search = () => {
    if (!q.trim()) return;
    fetch(`${API}/api/v1/search?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then(setHits)
      .catch(() => setHits([]));
  };

  const add = () => {
    if (!pick) {
      setMsg("Pehle jagah list se chuno.");
      return;
    }
    api("/api/v1/reminders", {
      method: "POST",
      body: JSON.stringify({ label, place_name: pick.place_name, cell_id: pick.cell_id, time }),
    })
      .then(() => {
        setMsg("Reminder save ho gaya.");
        setPick(null);
        setQ("");
        load();
      })
      .catch((e) => setMsg(e.message));
  };

  const del = (id: string) => api(`/api/v1/reminders/${id}`, { method: "DELETE" }).then(load);

  const ask = () => {
    if ("Notification" in window) Notification.requestPermission().then(setPerm);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <h1 className="text-3xl font-extrabold">Commute Reminder</h1>
        <p className="text-sm text-slate-400">
          Apni jagah aur jaane ka time set karo. Risk Medium/High hone par pehle se alert milega.
        </p>

        {perm !== "granted" && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
            <span>Browser notification band hai. Alert dikhane ke liye permission do.</span>
            <button onClick={ask} className="rounded-full bg-amber-500 px-4 py-1.5 font-semibold text-slate-900">
              Allow karo
            </button>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Naam (Office)"
              className="rounded-lg bg-white/10 px-3 py-2 text-sm outline-none" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm [color-scheme:dark]" />
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Jagah dhundo" className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none" />
              <button onClick={search} className="rounded-lg bg-sky-500 px-3 text-sm font-semibold">Dhundo</button>
            </div>
          </div>
          {hits.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-white/10">
              {hits.map((h, i) => (
                <button key={i} onClick={() => { setPick(h); setHits([]); }}
                  className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/10">
                  {h.place_name}
                </button>
              ))}
            </div>
          )}
          {pick && <div className="text-xs text-emerald-300">✓ {pick.place_name}</div>}
          <div className="flex items-center gap-3">
            <button onClick={add} className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-2 font-semibold">
              Reminder save karo
            </button>
            <span className="text-sm text-sky-200">{msg}</span>
          </div>
        </div>

        <div className="space-y-2">
          {list.length === 0 && <p className="text-slate-400">Abhi koi reminder nahi.</p>}
          {list.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl">⏰</div>
              <div className="flex-1">
                <div className="font-semibold">{r.label} | {r.time}</div>
                <div className="text-xs text-slate-400">{r.place_name}</div>
              </div>
              <button onClick={() => del(r.id)} className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-red-500/30">
                Hatao
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}