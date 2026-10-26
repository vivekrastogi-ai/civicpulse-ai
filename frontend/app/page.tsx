"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Community from "./components/Community";
import UserMenu from "./components/UserMenu";
import Compare from "./components/Compare";
import Confidence from "./components/Confidence";
import ReminderWatcher from "./components/ReminderWatcher";
import Highlights from "./components/Highlights";
import Timeline from "./components/Timeline";
import FloodScore from "./components/FloodScore";
import Insights from "./components/Insights";
import type { Cell, Focus } from "./components/RiskMap";
import { API, api, authHeaders, clearSession, getUser, setSession, type User } from "./lib/api";


const RiskMap = dynamic(() => import("./components/RiskMap"), { ssr: false });

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
type Report = { id: string; kind: string; text: string; author: string; created_at: number; status: string };

const KINDS: Record<string, { label: string; cls: string }> = {
  waterlogging: { label: "Paani bhara hai", cls: "bg-red-500/20 text-red-300" },
  drain_blocked: { label: "Naala jam hai", cls: "bg-orange-500/20 text-orange-300" },
  traffic: { label: "Jam / raasta band", cls: "bg-yellow-500/20 text-yellow-300" },
  all_clear: { label: "Sab theek hai", cls: "bg-emerald-500/20 text-emerald-300" },
  other: { label: "Anya", cls: "bg-slate-500/30 text-slate-300" },
};
const STATUS_LABEL: Record<string, string> = {
  new: "New",
  forwarded: "Forwarded",
  in_progress: "In progress",
  resolved: "Resolved",
};

const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};
const pct = (p: number) => (p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);

/* ---------- awaaz ---------- */
function speak(roman: string, devanagari: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const hi = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("hi"));
  const u = new SpeechSynthesisUtterance(hi ? devanagari : roman);
  if (hi) {
    u.voice = hi;
    u.lang = "hi-IN";
  } else {
    u.lang = "en-IN";
  }
  u.rate = 0.95;
  synth.speak(u);
}

const WELCOME_ROMAN =
  "Namaste! CivicPulse AI mein aapka swagat hai. Main aapko Delhi mein paani bharne ka khatra pehle se samajhne mein madad karunga. Aap kisi bhi jagah ka risk dekh sakte hain, savdhaniyan jaan sakte hain, aur logon ke reports bhi padh sakte hain. Chaliye shuru karte hain.";
const WELCOME_DEV =
  "नमस्ते! सिविकपल्स ए आई में आपका स्वागत है। मैं आपको दिल्ली में पानी भरने का खतरा पहले से समझने में मदद करूंगा। आप किसी भी जगह का रिस्क देख सकते हैं, सावधानियां जान सकते हैं, और लोगों के रिपोर्ट भी पढ़ सकते हैं। चलिए शुरू करते हैं।";

/* ---------- guided tour ---------- */
const TOUR = [
  { id: "tour-dates", title: "Tareekh chuno", text: "Yahan se Aaj, Kal ya agle kuch din chuno. Live mausam forecast se risk nikalta hai. '2024 demo' purana barish wala data dikhata hai." },
  { id: "tour-search", title: "Jagah dhundho", text: "Delhi ki koi bhi jagah likho, jaise East Azad Nagar. Map wahan chala jayega aur uska risk dikhega." },
  { id: "tour-status", title: "Risk ka saar", text: "Us din kitne cells High, Medium aur Low hain, yahan dikhta hai. Badge batata hai ki data live hai ya 2024 ka." },
  { id: "tour-map", title: "Risk map", text: "Har circle 1 km ka ilaaka hai. Laal matlab zyada risk, peela medium, hara kam. Kisi bhi circle par click karo." },
  { id: "tour-legend", title: "Rang ka matlab", text: "Ye rang us din ke cells ki aapas mein tulna hain. Asli probability sidebar mein milti hai." },
  { id: "tour-aside", title: "Detail panel", text: "Click ke baad yahan jagah ka naam, risk gauge, savdhaniyan, what-if slider, wajah, logon ke reports aur AI assistant aate hain." },
  { id: "tour-feedback", title: "Feedback", text: "App kaisa laga, yahan bataiye. Aapka feedback hume behtar banata hai." },
];

function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR[i];

  useEffect(() => {
    const el = document.getElementById(step.id);
    if (!el) {
      if (i < TOUR.length - 1) setI(i + 1);
      else onDone();
      return;
    }
    const upd = () => setRect(el.getBoundingClientRect());
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rect) return null;
  const W = typeof window !== "undefined" ? window.innerWidth : 1200;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  const big = rect.height > H * 0.6 || rect.width > W * 0.6;
  const boxW = 320;
  let top: number;
  let left: number;
  let arrow: "up" | "down" | "none" = "none";
  if (big) {
    top = Math.max(80, rect.top + rect.height / 2 - 90);
    left = rect.left + rect.width / 2 - boxW / 2;
  } else if (rect.bottom + 190 < H) {
    top = rect.bottom + 14;
    left = rect.left + rect.width / 2 - boxW / 2;
    arrow = "up";
  } else {
    top = rect.top - 190;
    left = rect.left + rect.width / 2 - boxW / 2;
    arrow = "down";
  }
  left = Math.min(Math.max(12, left), W - boxW - 12);
  top = Math.max(12, top);
  const arrowLeft = Math.min(Math.max(20, rect.left + rect.width / 2 - left - 8), boxW - 36);
  const last = i === TOUR.length - 1;

  return (
    <div className="fixed inset-0 z-[3000]">
      <div
        className="absolute rounded-xl ring-2 ring-sky-400 transition-all duration-300"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          boxShadow: "0 0 0 9999px rgba(2,6,23,0.72)",
        }}
      />
      <div
        className="absolute rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm shadow-2xl"
        style={{ top, left, width: boxW }}
      >
        {arrow === "up" && (
          <div className="absolute -top-2 h-4 w-4 rotate-45 border-l border-t border-white/10 bg-slate-900" style={{ left: arrowLeft }} />
        )}
        {arrow === "down" && (
          <div className="absolute -bottom-2 h-4 w-4 rotate-45 border-b border-r border-white/10 bg-slate-900" style={{ left: arrowLeft }} />
        )}
        <div className="mb-1 text-xs text-sky-300">
          Step {i + 1} / {TOUR.length}
        </div>
        <div className="mb-1 text-base font-bold text-white">{step.title}</div>
        <p className="mb-3 text-slate-300">{step.text}</p>
        <div className="flex items-center justify-between">
          <button onClick={onDone} className="text-xs text-slate-400 hover:text-white">
            Skip
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="rounded-lg bg-white/10 px-3 py-1 text-slate-200">
                Peeche
              </button>
            )}
            <button
              onClick={() => (last ? onDone() : setI(i + 1))}
              className="rounded-lg bg-sky-500 px-3 py-1 font-semibold text-white"
            >
              {last ? "Khatam" : "Aage"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Gauge({ p, level }: { p: number; level: string }) {
  const v = Math.min(1, p / 0.25);
  const color = level === "High" ? "#ef4444" : level === "Medium" ? "#f59e0b" : "#22c55e";
  const len = Math.PI * 80;
  return (
    <div className="relative mx-auto w-52">
      <svg viewBox="0 0 200 110" className="w-full">
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-3xl font-extrabold text-white">{pct(p)}</div>
        <div className="text-xs font-semibold tracking-wide" style={{ color }}>
          {level.toUpperCase()} RISK
        </div>
      </div>
    </div>
  );
}

const card = "rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTour, setShowTour] = useState(false);

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
  const [heat, setHeat] = useState(false);

  const [reports, setReports] = useState<Report[]>([]);
  const [rKind, setRKind] = useState("waterlogging");
  const [rText, setRText] = useState("");
  const [rMsg, setRMsg] = useState("");
  const [rPhoto, setRPhoto] = useState<File | null>(null);

  
  const [fbOpen, setFbOpen] = useState(false);
  const [fbRating, setFbRating] = useState(0);
  const [fbText, setFbText] = useState("");
  const [fbMsg, setFbMsg] = useState("");

  const placeName = focus?.name ?? expl?.place_name ?? "";

  /* login check */
  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    api("/api/v1/auth/me")
      .then((fresh: User) => {
        setUser(fresh);
        const tok = localStorage.getItem("cp_token");
        if (tok) setSession(tok, fresh);
        setReady(true);
        if (!sessionStorage.getItem("cp_welcomed")) setShowWelcome(true);
        else if (!fresh.tour_done) setShowTour(true);
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      });
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, [router]);

  const startWelcome = () => {
    speak(WELCOME_ROMAN, WELCOME_DEV);
    sessionStorage.setItem("cp_welcomed", "1");
    setShowWelcome(false);
    if (user && !user.tour_done) setShowTour(true);
  };

  const finishTour = () => {
    setShowTour(false);
    window.speechSynthesis?.cancel();
    api("/api/v1/auth/tour-done", { method: "POST" }).catch(() => {});
    if (user) {
      const u = { ...user, tour_done: true };
      setUser(u);
      const tok = localStorage.getItem("cp_token");
      if (tok) setSession(tok, u);
    }
  };

  const logout = () => {
    clearSession();
    router.replace("/login");
  };

  useEffect(() => {
    setDate(addDays(0));
  }, []);

  useEffect(() => {
    if (!date || !ready) return;
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
  }, [date, ready]);

  useEffect(() => {
    if (selected === null || !date) return;
    fetch(`${API}/api/v1/predict?cell_id=${selected}&date=${date}`)
      .then((r) => r.json())
      .then(setExpl)
      .catch(() => setExpl(null));
  }, [selected, date]);

  useEffect(() => {
    if (selected === null) {
      setReports([]);
      return;
    }
    const load = () =>
      fetch(`${API}/api/v1/reports?cell_id=${selected}`)
        .then((r) => r.json())
        .then((d) => setReports(d.reports ?? []))
        .catch(() => {});
    load();
    setRMsg("");
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [selected]);

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

  const openArea = (a: { cell_id: number; place_name: string }) => {
    const c = cells.find((x) => x.cell_id === a.cell_id);
    if (c) setFocus({ lat: c.lat, lon: c.lon, name: a.place_name });
    setSelected(a.cell_id);
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

  const postReport = async () => {
    if (selected === null || rText.trim().length < 3) {
      setRMsg("Kam se kam 3 akshar likho.");
      return;
    }
    try {
      let photo: string | null = null;
      if (rPhoto) {
        const fd = new FormData();
        fd.append("file", rPhoto);
        const t = localStorage.getItem("cp_token");
        const up = await fetch(`${API}/api/v1/uploads`, {
          method: "POST",
          headers: t ? { Authorization: `Bearer ${t}` } : {},
          body: fd,
        });
        const uj = await up.json();
        if (!up.ok) throw new Error(typeof uj.detail === "string" ? uj.detail : "Photo upload nahi hui");
        photo = uj.url;
      }
      const r = await fetch(`${API}/api/v1/reports`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ cell_id: selected, place_name: placeName || null, kind: rKind, text: rText, photo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Report nahi gaya");
      setReports((x) => [d, ...x]);
      setRText("");
      setRPhoto(null);
      setRMsg("Report jud gaya, shukriya!");
    } catch (e) {
      setRMsg((e as Error).message);
    }
  };

  const sendFeedback = () => {
    if (!fbRating) {
      setFbMsg("Pehle star rating do.");
      return;
    }
    fetch(`${API}/api/v1/feedback`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rating: fbRating, message: fbText }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Feedback nahi gaya");
        return d;
      })
      .then((d) => {
        setFbMsg(d.thanks);
        setFbRating(0);
        setFbText("");
        setTimeout(() => {
          setFbOpen(false);
          setFbMsg("");
        }, 1800);
      })
      .catch((e) => setFbMsg(e.message));
  };

  const quick = [
    { label: "Kal se pehle", d: addDays(-1) },
    { label: "Aaj", d: addDays(0) },
    { label: "Kal", d: addDays(1) },
    { label: "+2 din", d: addDays(2) },
    { label: "+3 din", d: addDays(3) },
    { label: "2024 demo", d: "2024-09-13" },
  ];

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">Load ho raha hai...</div>
    );
  }

  return (
    <>
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="relative z-[1100] flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur">
        <div className="mr-2">
          <h1 className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-xl font-extrabold text-transparent">
            CivicPulse AI
          </h1>
          <div className="text-[11px] text-slate-400">Delhi waterlogging risk | prototype</div>
        </div>

        <div id="tour-dates" className="flex flex-wrap items-center gap-1 rounded-full p-1">
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={() => setDate(q.d)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${
                date === q.d ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30" : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {q.label}
            </button>
          ))}
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="ml-1 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-100 [color-scheme:dark]"
          />
        </div>

        <div id="tour-search" className="relative ml-auto rounded-full">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Delhi mein jagah dhundho (jaise East Azad Nagar)"
              className="w-72 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-sm text-white placeholder-slate-400 outline-none focus:border-sky-400"
            />
            <button
              onClick={doSearch}
              className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-1.5 text-sm font-semibold text-white shadow-lg hover:opacity-90"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          {(hits.length > 0 || searchMsg) && (
            <div className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
              {searchMsg && <div className="p-3 text-sm text-slate-400">{searchMsg}</div>}
              {hits.map((h, i) => (
                <button
                  key={i}
                  onClick={() => pick(h)}
                  className="block w-full border-b border-white/5 px-4 py-2 text-left text-sm hover:bg-white/10"
                >
                  {h.place_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <UserMenu onGuide={() => setShowTour(true)} />
      </header>

      <div id="tour-status" className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-slate-900/50 px-4 py-1.5 text-xs">
        {mode && (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              mode === "forecast" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/30 text-slate-300"
            }`}
          >
            {mode === "forecast" ? "LIVE / FORECAST" : "2024 OBSERVED"}
          </span>
        )}
        <span className="text-red-400">High: {summary.High ?? 0}</span>
        <span className="text-amber-400">Medium: {summary.Medium ?? 0}</span>
        <span className="text-emerald-400">Low: {summary.Low ?? 0}</span>
        <Confidence date={date} />
        {loading && <span className="text-sky-300">Loading... (live data pehli baar 1 min le sakta hai)</span>}
        {error && <span className="text-red-300">{error}</span>}
      </div>

      <div className="border-b border-white/5 bg-slate-900/40 px-4 py-2">
        <FloodScore date={date} />
      </div>  
      <div className="flex min-h-0 flex-1">
        <div id="tour-map" className="relative flex-1">
          <RiskMap cells={cells} selected={selected} onSelect={onMapSelect} focus={focus} heat={heat} />
          <button
            onClick={() => setHeat((h) => !h)}
            className="absolute right-4 top-4 z-[500] rounded-full border border-white/10 bg-slate-900/80 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-slate-800"
          >
            {heat ? "Circles dikhao" : "Heatmap dikhao"}
          </button>
          <div id="tour-legend" className="absolute bottom-4 left-4 z-[500] rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs backdrop-blur">
            <div className="mb-1 font-semibold text-slate-200">Risk level</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> High</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Medium</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Low</div>
          </div>
        </div>

        <aside id="tour-aside" className="w-[26rem] space-y-3 overflow-y-auto border-l border-white/10 bg-slate-900/70 p-4 backdrop-blur">
          {!expl ? (
            <div className={card}>
              <div className="mb-1 text-lg font-bold">Shuru karein</div>
              <p className="text-sm text-slate-400">
                Map par kisi circle par click karo, ya upar search box mein Delhi ki koi jagah likho. Uska risk,
                wajah, savdhaniyan aur logon ke reports yahan dikhenge.
              </p>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-bold leading-tight">{placeName}</h2>
                <div className="text-xs text-slate-400">
                  Cell {selected} | {date} | barish {expl.rain_mm.toFixed(1)} mm
                </div>
              </div>

              <div className={card}>
                <Gauge p={expl.risk_probability} level={expl.risk_level} />
              </div>

              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm">
                <div className="mb-2 font-semibold text-amber-300">Savdhaniyan (kya karein)</div>
                <ul className="list-disc space-y-1 pl-5 text-slate-200">
                  {expl.precautions.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4 text-sm">
                <div className="font-semibold text-sky-300">What-if: barish badlo</div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.25}
                  value={mult}
                  onChange={(e) => setMult(parseFloat(e.target.value))}
                  className="my-2 w-full accent-sky-400"
                />
                <div>Barish: {mult}x</div>
                {sim ? (
                  <div className="mt-2 space-y-1">
                    <div>
                      Barish: {sim.original_rain_mm.toFixed(1)} mm → <b>{sim.scenario_rain_mm.toFixed(1)} mm</b>
                    </div>
                    <div>
                      Risk: {pct(sim.original_probability)} → <b>{pct(sim.scenario_probability)}</b>
                    </div>
                    <p className="text-xs text-slate-400">{sim.disclaimer}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Slider hilao, naya risk yahan dikhega.</p>
                )}
              </div>
              <Timeline cellId={selected as number} />
                            <Insights
                cellId={selected as number}
                placeName={placeName}
                riskPct={expl.risk_probability < 0.001 ? "<0.1%" : `${(expl.risk_probability * 100).toFixed(1)}%`}
                level={expl.risk_level}
                date={date}
              />
              <Compare date={date} current={selected !== null ? { cell_id: selected, place_name: placeName } : null} />

              <div className={card}>
                <div className="mb-2 text-sm font-semibold">Mukhya wajah</div>
                <ul className="space-y-2 text-sm">
                  {expl.top_factors.map((f) => {
                    const up = f.direction === "increases_risk";
                    const w = Math.min(100, Math.abs(f.contribution) * 30);
                    return (
                      <li key={f.label}>
                        <div className="flex justify-between">
                          <span>{f.label}</span>
                          <span className={up ? "text-red-400" : "text-emerald-400"}>
                            {f.contribution > 0 ? "+" : ""}
                            {f.contribution.toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-white/10">
                          <div className={`h-1.5 rounded-full ${up ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${w}%` }} />
                        </div>
                        <div className="text-[11px] text-slate-500">value: {f.value.toFixed(2)}</div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-slate-500">{expl.disclaimer}</p>
              </div>

              <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4 text-sm">
                <div className="mb-1 font-semibold text-violet-300">Logon ke reports ({placeName})</div>
                <p className="mb-2 text-[11px] text-slate-400">
                  Ye logon ke comments hain, verified nahi. Inhe sarkari alert na samjhein.
                </p>
                                <div className={`mb-2 rounded-lg px-2 py-1 text-[11px] ${
                  expl.risk_level === "High" ? "bg-red-500/15 text-red-300"
                  : expl.risk_level === "Medium" ? "bg-amber-500/15 text-amber-300"
                  : "bg-emerald-500/15 text-emerald-300"}`}>
                  AI cross-check: model is din {expl.risk_level} risk bata raha hai ({pct(expl.risk_probability)}).
                  {reports.some((r) => r.kind === "waterlogging") && expl.risk_level === "Low"
                    ? " Logon ki report aur model alag hain, jaanch zaroori."
                    : ""}
                </div>
                <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                  {reports.length === 0 && <p className="text-xs text-slate-400">Abhi koi report nahi. Pehla report aap daalo!</p>}
                  {reports.map((r) => (
                    <div key={r.id} className="rounded-lg bg-white/5 p-2">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                        <span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KINDS[r.kind]?.cls}`}>
                            {KINDS[r.kind]?.label ?? r.kind}
                          </span>
                          <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                            {STATUS_LABEL[r.status] ?? "New"}
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-500">{new Date(r.created_at * 1000).toLocaleString()}</span>
                      </div>
                      <div>{r.text}</div>
                      <div className="text-[11px] text-slate-500">- {r.author}</div>
                    </div>
                  ))}
                </div>
                <select
                  value={rKind}
                  onChange={(e) => setRKind(e.target.value)}
                  className="mb-2 w-full rounded-lg bg-slate-800 px-2 py-1.5 text-slate-100"
                >
                  {Object.entries(KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <textarea
                  value={rText}
                  onChange={(e) => setRText(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Yahan kya ho raha hai? (jaise: underpass mein ghutne tak paani)"
                  className="mb-2 w-full rounded-lg bg-white/10 px-2 py-1.5 text-slate-100 placeholder-slate-500 outline-none"
                  
                />
                                <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10">
                  📷 {rPhoto ? rPhoto.name : "Photo jodo (optional, JPG/PNG, 3 MB tak)"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setRPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">Aap {user?.name} ke naam se report karoge</span>
                  <button onClick={postReport} className="rounded-lg bg-violet-500 px-3 py-1.5 font-semibold text-white hover:bg-violet-400">
                    Report karo
                  </button>
                </div>
                {rMsg && <div className="mt-1 text-xs text-violet-200">{rMsg}</div>}
              </div>

              <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4 text-sm">
                <div className="font-semibold text-fuchsia-300">AI assistant ({placeName})</div>
                <div className="my-2 max-h-56 space-y-2 overflow-y-auto">
                  {chat.length === 0 && (
                    <p className="text-xs text-slate-400">
                      Jaise: &quot;kis jagah ki baat ho rahi hai?&quot;, &quot;savdhani kya rakhein?&quot;,
                      &quot;kyun risk high hai?&quot;, &quot;barish 2x ho jaye toh?&quot;
                    </p>
                  )}
                  {chat.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "rounded-lg bg-white/10 p-2 text-right" : "rounded-lg bg-fuchsia-500/15 p-2"}>
                      <div>{m.text}</div>
                      {m.source && <div className="mt-1 text-[10px] text-slate-500">source: {m.source}</div>}
                    </div>
                  ))}
                  {asking && <p className="text-xs text-slate-400">Soch raha hoon...</p>}
                </div>
                <div className="flex gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && ask()}
                    placeholder="Apna sawal likho..."
                    className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-slate-100 placeholder-slate-500 outline-none"
                  />
                  <button onClick={ask} disabled={asking} className="rounded-lg bg-fuchsia-500 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
                    Puchho
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-white/10 bg-slate-900/80 px-4 py-2 text-xs text-slate-400">
        <span>CivicPulse AI | Prototype, synthetic data par trained. Emergency warning system nahi hai.</span>
        <a href="#community" className="rounded-full bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-300 hover:bg-emerald-500/30">
          Live feedback ↓
        </a>
        <button
          id="tour-feedback"
          onClick={() => setFbOpen(true)}
          className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-1 font-semibold text-white"
        >
          Feedback do
        </button>
      </footer>

      {fbOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-bold">Aapka feedback</h3>
              <button onClick={() => setFbOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="mb-3 flex gap-1 text-3xl">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setFbRating(s)} className={s <= fbRating ? "text-amber-400" : "text-slate-600"}>
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={fbText}
              onChange={(e) => setFbText(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Kya accha laga? Kya sudhaarna chahiye?"
              className="mb-3 w-full rounded-lg bg-white/10 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-sky-300">{fbMsg}</span>
              <button onClick={sendFeedback} className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-white hover:bg-sky-400">
                Bhejo
              </button>
            </div>
          </div>
        </div>
      )}

      {showWelcome && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-950/95 p-4">
          <div className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur">
            <div className="text-5xl">🌧️</div>
            <h2 className="mt-3 text-2xl font-bold">Namaste, {user?.name}!</h2>
            <h1 className="mt-1 bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-4xl font-extrabold text-transparent">
              CivicPulse AI
            </h1>
            <p className="mt-1 text-slate-300">mein aapka swagat hai</p>
            <p className="mt-4 text-sm text-slate-400">
              Delhi mein paani bharne ka khatra pehle se samjhein. Kisi bhi jagah ka risk dekhein, savdhaniyan jaanein
              aur logon ke reports padhein.
            </p>
            <button
              onClick={startWelcome}
              className="mt-6 rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-8 py-3 text-lg font-semibold text-white shadow-lg hover:opacity-90"
            >
              🔊 Shuru karein
            </button>
            <div className="mt-3 text-[11px] text-slate-500">Is button par click karte hi site aapko bolkar swagat karegi.</div>
          </div>
        </div>
      )}

            {showTour && <Tour onDone={finishTour} />}
    </div>
    <Highlights onOpenArea={openArea} />
    <Community user={user} />
    </>
  );
}