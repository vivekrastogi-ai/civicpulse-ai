"use client";

import { useEffect, useState } from "react";
import { API, authHeaders, type User } from "../lib/api";

type Item = { id: string; name: string; rating: number; message: string; created_at: number };

const ago = (t: number) => {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return "abhi abhi";
  if (s < 3600) return `${Math.floor(s / 60)} min pehle`;
  if (s < 86400) return `${Math.floor(s / 3600)} ghante pehle`;
  return `${Math.floor(s / 86400)} din pehle`;
};

export default function Community({ user }: { user: User | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch(`${API}/api/v1/feedback`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setAvg(d.avg ?? null);
        setCount(d.count ?? 0);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const send = () => {
    if (!rating) {
      setMsg("Pehle star rating do.");
      return;
    }
    fetch(`${API}/api/v1/feedback`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rating, message: text }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Feedback nahi gaya");
        return d;
      })
      .then((d) => {
        setMsg(d.thanks);
        setRating(0);
        setText("");
        load();
      })
      .catch((e) => setMsg(e.message));
  };

  return (
    <section id="community" className="bg-slate-950 px-4 py-14 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> LIVE
          </div>
          <h2 className="mt-3 text-3xl font-extrabold">Log CivicPulse AI ke baare mein kya keh rahe hain</h2>
          <p className="mt-1 text-sm text-slate-400">
            {count} feedback{avg ? ` | average ${avg} ★` : ""} | har 8 second mein apne aap update hota hai
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="max-h-[30rem] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4 lg:col-span-3">
            {items.length === 0 && <p className="text-sm text-slate-400">Abhi koi feedback nahi. Pehla aap do!</p>}
            {items.map((f) => (
              <div key={f.id} className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{f.name}</span>
                  <span className="text-amber-400">
                    {"★".repeat(f.rating)}
                    <span className="text-slate-600">{"★".repeat(5 - f.rating)}</span>
                  </span>
                </div>
                {f.message && <p className="mt-1 text-sm text-slate-200">{f.message}</p>}
                <div className="mt-1 text-[11px] text-slate-500">{ago(f.created_at)}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 lg:col-span-2">
            <div className="mb-2 font-semibold text-sky-300">Aapka feedback ({user?.name ?? "Guest"})</div>
            <div className="mb-3 flex gap-1 text-3xl">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)} className={s <= rating ? "text-amber-400" : "text-slate-600"}>
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Kya accha laga? Kya sudhaarna chahiye?"
              className="mb-3 w-full rounded-lg bg-white/10 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-sky-200">{msg}</span>
              <button onClick={send} className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-white hover:bg-sky-400">
                Bhejo
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">Aapka naam feedback ke saath sabko dikhega.</p>
          </div>
        </div>

        <div className="mt-12 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-900/40 p-8 text-center">
          <div className="text-xs uppercase tracking-widest text-slate-400">Is project ko banaya</div>
          <h3 className="mt-2 text-3xl font-extrabold">Vivek Rastogi</h3>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
            <a href="mailto:rastogivivek067@gmail.com" className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20">
              ✉ rastogivivek067@gmail.com
            </a>
            <a
              href="https://www.linkedin.com/in/vivek-rastogi-78401430b/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#0a66c2] px-4 py-2 font-semibold text-white hover:bg-[#0b5cad]"
            >
              in LinkedIn par jud&apos;ein
            </a>
          </div>
          <p className="mt-6 text-[11px] text-slate-500">
            CivicPulse AI | Prototype, synthetic data par trained. Emergency warning system nahi hai.
          </p>
        </div>
      </div>
    </section>
  );
}