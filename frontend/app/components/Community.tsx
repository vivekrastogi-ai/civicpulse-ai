"use client";

import { useEffect, useRef, useState } from "react";
import { API, authHeaders, type User } from "../lib/api";

type Item = { id: string; name: string; rating: number; message: string; created_at: number };

const ago = (t: number) => {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return "abhi abhi";
  if (s < 3600) return `${Math.floor(s / 60)} min pehle`;
  if (s < 86400) return `${Math.floor(s / 3600)} ghante pehle`;
  return `${Math.floor(s / 86400)} din pehle`;
};

const GRADS = [
  "from-sky-500 to-cyan-400",
  "from-violet-500 to-fuchsia-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-pink-500 to-rose-400",
];

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ${show ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
    >
      {children}
    </div>
  );
}

export default function Community({ user }: { user: User | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
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

  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: items.filter((i) => i.rating === s).length }));
  const maxN = Math.max(1, ...dist.map((d) => d.n));
  const shown = hover || rating;

  return (
    <section id="community" className="relative overflow-hidden bg-slate-950 px-4 py-24 text-slate-100">
      <div className="pointer-events-none absolute -right-40 top-10 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-40 bottom-40 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> LIVE
            </div>
            <h2 className="mt-3 bg-gradient-to-r from-white via-sky-200 to-violet-300 bg-clip-text text-4xl font-extrabold text-transparent md:text-5xl">
              Log kya keh rahe hain
            </h2>
            <div className="mx-auto mt-4 h-1 w-20 rounded-full bg-gradient-to-r from-sky-500 to-violet-500" />
            <p className="mt-3 text-sm text-slate-400">Har 8 second mein apne aap update hota hai</p>
          </div>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-5">
          <Reveal>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur lg:col-span-2">
              <div className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-6xl font-black text-transparent">
                {avg ?? "-"}
              </div>
              <div className="mt-1 text-2xl text-amber-400">
                {"★".repeat(Math.round(avg ?? 0))}
                <span className="text-slate-700">{"★".repeat(5 - Math.round(avg ?? 0))}</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">{count} feedback</div>
              <div className="mt-5 space-y-2">
                {dist.map((d) => (
                  <div key={d.s} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-slate-400">{d.s}★</span>
                    <div className="h-2 flex-1 rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700"
                        style={{ width: `${(d.n / maxN) * 100}%` }}
                      />
                    </div>
                    <span className="w-5 text-right text-slate-500">{d.n}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-600">Bars haal ke feedback par based hain</p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="rounded-3xl border border-sky-400/20 bg-gradient-to-b from-sky-500/10 to-transparent p-6 shadow-[0_0_40px_-15px_rgba(56,189,248,0.5)] backdrop-blur lg:col-span-3">
              <div className="mb-3 font-bold text-sky-300">Aapka feedback, {user?.name ?? "Guest"}</div>
              <div className="mb-3 flex gap-1 text-4xl" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHover(s)}
                    className={`transition hover:scale-125 ${s <= shown ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]" : "text-slate-700"}`}
                  >
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
                className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-sky-400"
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-sky-200">{msg}</span>
                <button
                  onClick={send}
                  className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-2 font-semibold text-white shadow-lg hover:opacity-90"
                >
                  Bhejo
                </button>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">Aapka naam feedback ke saath sabko dikhega.</p>
            </div>
          </Reveal>
        </div>

        <div className="mt-6 grid max-h-[28rem] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {items.length === 0 && <p className="text-sm text-slate-400">Abhi koi feedback nahi. Pehla aap do!</p>}
          {items.map((f, i) => (
            <Reveal key={f.id} delay={(i % 6) * 60}>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition hover:-translate-y-1 hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${GRADS[f.name.length % GRADS.length]} font-bold text-white`}>
                    {(f.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{f.name}</div>
                    <div className="text-[11px] text-slate-500">{ago(f.created_at)}</div>
                  </div>
                  <div className="text-sm text-amber-400">
                    {"★".repeat(f.rating)}
                    <span className="text-slate-700">{"★".repeat(5 - f.rating)}</span>
                  </div>
                </div>
                {f.message && <p className="mt-3 text-sm leading-relaxed text-slate-200">&ldquo;{f.message}&rdquo;</p>}
              </div>
            </Reveal>
          ))}
        </div>

                <Reveal>
          <div className="relative mt-20 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-8 md:p-12">
            <div className="pointer-events-none absolute -top-24 left-1/4 h-64 w-96 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-1/4 h-64 w-96 rounded-full bg-sky-500/20 blur-3xl" />

            <div className="relative grid items-center gap-8 md:grid-cols-5">
              <div className="flex justify-center md:col-span-2">
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-sky-500 via-violet-500 to-fuchsia-500 opacity-70 blur-md" />
                  <div className="relative h-56 w-56 overflow-hidden rounded-full border-4 border-slate-900 bg-gradient-to-br from-sky-500 to-violet-500 md:h-64 md:w-64">
                    <div className="absolute inset-0 flex items-center justify-center text-7xl font-black text-white/80">
                      V
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/vivek.jpg"
                      alt="Vivek Rastogi"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="text-center md:col-span-3 md:text-left">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Is project ko banaya</div>
                <h3 className="mt-1 bg-gradient-to-r from-white via-sky-200 to-violet-300 bg-clip-text text-4xl font-black text-transparent md:text-5xl">
                  Vivek Rastogi
                </h3>
                <p className="mt-1 text-sm font-semibold text-sky-300">Builder of CivicPulse AI</p>
<div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
  <p>
    <b className="text-white">Problem:</b> Delhi mein barish ke baad paani bharna aam hai, aur pata
    ghatna ke baad chalta hai.
  </p>
  <p>
    <b className="text-white">Solution:</b> Mausam forecast, ilaake ki banawat aur logon ki reports ko
    jodkar pehle se risk batana, aur kyun hai ye samjhana.
  </p>
  <p>
    <b className="text-white">Maine kya banaya:</b> data pipeline, ML model, SHAP explanation, live
    forecast, safe route, community reports, admin dashboard, AI assistant.
  </p>
</div>

                <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
                  {["Python", "XGBoost", "SHAP", "FastAPI", "MongoDB", "Next.js", "React", "Tailwind", "Leaflet", "GenAI"].map((s) => (
                    <span key={s} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                      {s}
                    </span>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  {[
                    ["1,621", "Map cells"],
                    ["25+", "Features"],
                    ["10+", "Pages"],
                  ].map(([n, l]) => (
                    <div key={l} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-2xl font-black text-transparent">
                        {n}
                      </div>
                      <div className="text-[11px] text-slate-400">{l}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm md:justify-start">
                  <a
                    href="https://www.linkedin.com/in/vivek-rastogi-78401430b/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-[#0a66c2] px-5 py-2 font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#0b5cad]"
                  >
                    in LinkedIn
                  </a>
                  <a
                    href="mailto:rastogivivek067@gmail.com"
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-2 transition hover:-translate-y-0.5 hover:bg-white/10"
                  >
                    ✉ Email karo
                  </a>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}