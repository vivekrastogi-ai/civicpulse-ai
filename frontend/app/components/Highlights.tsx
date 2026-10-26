"use client";

import { useEffect, useRef, useState } from "react";
import { API } from "../lib/api";

type Stats = {
  users: number;
  reports: number;
  resolved: number;
  verified: number;
  feedback_count: number;
  feedback_avg: number | null;
};
type Area = { cell_id: number; place_name: string; risk_probability: number; rain_mm: number };

const pct = (p: number) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/* scroll par fade-in */
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
      { threshold: 0.15 }
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

function Counter({ to }: { to: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let n = 0;
    const step = Math.max(1, Math.ceil(to / 40));
    const t = setInterval(() => {
      n = Math.min(to, n + step);
      setV(n);
      if (n >= to) clearInterval(t);
    }, 35);
    return () => clearInterval(t);
  }, [to]);
  return <>{v}</>;
}

function Title({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-10 text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">{kicker}</div>
      <h2 className="mt-2 bg-gradient-to-r from-white via-sky-200 to-violet-300 bg-clip-text text-4xl font-extrabold text-transparent md:text-5xl">
        {title}
      </h2>
      <div className="mx-auto mt-4 h-1 w-20 rounded-full bg-gradient-to-r from-sky-500 to-violet-500" />
    </div>
  );
}

const HOW = [
  ["🛰️", "Data", "Open-Meteo ka mausam, OpenStreetMap ki sadak aur naale, elevation.", "from-sky-500/20"],
  ["🧩", "Grid", "Delhi 1,621 cells (1 km x 1 km) mein baanta gaya.", "from-teal-500/20"],
  ["🧠", "Model", "XGBoost har cell ka roz ka waterlogging risk nikalta hai.", "from-violet-500/20"],
  ["🔍", "Explain", "SHAP batata hai risk kin wajahon se badha ya ghata.", "from-fuchsia-500/20"],
  ["👥", "Community", "Log report karte hain, admin verify karke action leta hai.", "from-amber-500/20"],
];

const FAQ = [
  ["Kya ye emergency alert hai?", "Nahi. Ye risk ka andaza deta hai, sarkari alert nahi. Jaan ko khatra ho toh 112 par call karo."],
  ["Data kahan se aata hai?", "Mausam Open-Meteo se, sadak aur naale OpenStreetMap se. Waterlogging incidents abhi synthetic hain kyunki Delhi ka koi saaf public dataset nahi hai. Verified reports jama hone par model asli data par dobara train hoga."],
  ["Reports kaun dekhta hai?", "Us jagah ke sab log. Admin unhe verify, status ya hide kar sakta hai."],
  ["'High' ka matlab kya hai?", "Map ke rang us din ke cells ki aapas ki tulna hain. Asli probability sidebar mein dikhti hai."],
  ["Mera data safe hai?", "Passwords hashed store hote hain aur reports mein aapka email dusron ko nahi dikhta."],
];

export default function Highlights({ onOpenArea }: { onOpenArea?: (a: Area) => void }) {
  const [s, setS] = useState<Stats | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [open, setOpen] = useState<number | null>(0);

  useEffect(() => {
    fetch(`${API}/api/v1/public-stats`).then((r) => r.json()).then(setS).catch(() => {});
    fetch(`${API}/api/v1/analytics?date=${iso(new Date())}&top=5`)
      .then((r) => r.json())
      .then((d) => setAreas(d.top_areas ?? []))
      .catch(() => {});
  }, []);

  const stats: [string, number | string, string, string][] = s
    ? [
        ["Users", s.users, "👤", "from-sky-500 to-cyan-400"],
        ["Reports", s.reports, "📝", "from-violet-500 to-fuchsia-400"],
        ["Resolved", s.resolved, "✅", "from-emerald-500 to-teal-400"],
        ["Verified", s.verified, "🛡️", "from-amber-500 to-orange-400"],
        ["Rating", s.feedback_avg ? `${s.feedback_avg}★` : "-", "⭐", "from-pink-500 to-rose-400"],
      ]
    : [];

  return (
    <section className="relative overflow-hidden bg-slate-950 px-4 py-20 text-slate-100">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-1/2 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl space-y-24">
        {stats.length > 0 && (
          <Reveal>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {stats.map(([l, v, ic, g]) => (
                <div key={l} className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur transition hover:-translate-y-1 hover:border-white/20">
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${g}`} />
                  <div className="text-2xl">{ic}</div>
                  <div className={`mt-1 bg-gradient-to-r ${g} bg-clip-text text-4xl font-black text-transparent`}>
                    {typeof v === "number" ? <Counter to={v} /> : v}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-widest text-slate-400">{l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        <div>
          <Reveal>
            <Title kicker="Peeche ki kahani" title="Kaise kaam karta hai" />
          </Reveal>
          <div className="relative grid gap-4 md:grid-cols-5">
            <div className="absolute left-[10%] right-[10%] top-9 hidden h-px bg-gradient-to-r from-transparent via-sky-500/50 to-transparent md:block" />
            {HOW.map(([i, t, d, g], idx) => (
              <Reveal key={t} delay={idx * 120}>
                <div className={`relative h-full rounded-3xl border border-white/10 bg-gradient-to-b ${g} to-transparent p-5 text-center backdrop-blur transition hover:-translate-y-2`}>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-3xl shadow-lg">
                    {i}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">Step {idx + 1}</div>
                  <div className="font-bold text-white">{t}</div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {areas.length > 0 && (
          <div>
            <Reveal>
              <Title kicker="Aaj ka overview" title="Sabse zyada risk wale areas" />
            </Reveal>
            <div className="grid gap-4 md:grid-cols-5">
              {areas.map((a, i) => (
                <Reveal key={a.cell_id} delay={i * 100}>
                  <button
                    onClick={() => {
                      onOpenArea?.(a);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="group relative w-full overflow-hidden rounded-3xl border border-red-400/20 bg-gradient-to-b from-red-500/15 to-transparent p-5 text-left transition hover:-translate-y-2 hover:border-red-400/50 hover:shadow-[0_0_30px_-5px_rgba(239,68,68,0.5)]"
                  >
                    <div className="absolute right-3 top-2 text-5xl font-black text-white/5">{i + 1}</div>
                    <div className="truncate font-semibold">{a.place_name}</div>
                    <div className="mt-2 text-3xl font-black text-red-300">{pct(a.risk_probability)}</div>
                    <div className="text-[11px] text-slate-400">barish {a.rain_mm} mm</div>
                    <div className="mt-3 text-[11px] font-semibold text-red-300 opacity-0 transition group-hover:opacity-100">
                      Map par dekho →
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-3xl">
          <Reveal>
            <Title kicker="Jawab yahin hain" title="Aksar poochhe jaane wale sawal" />
          </Reveal>
          <div className="space-y-3">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={i * 80}>
                <div className={`overflow-hidden rounded-2xl border backdrop-blur transition ${open === i ? "border-sky-400/40 bg-sky-400/5" : "border-white/10 bg-white/5"}`}>
                  <button
                    onClick={() => setOpen(open === i ? null : i)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left font-medium"
                  >
                    {q}
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition ${open === i ? "rotate-45" : ""}`}>
                      +
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <p className="overflow-hidden px-5 text-sm leading-relaxed text-slate-300">
                      <span className="block pb-4">{a}</span>
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}