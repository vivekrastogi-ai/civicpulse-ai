"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, api, getUser, setSession } from "../lib/api";
import PremiumLab from "../components/PremiumLab";

type Plan = { id: string; label: string; price_inr: number; days: number };
declare global {
  interface Window {
    Razorpay: new (o: object) => { open: () => void };
  }
}

const PERKS = [
  ["🧭", "Safe Route", "Risky areas se bachkar sabse surakshit raasta"],
  ["🌧️", "Rain Stress Test", "Agar 100 mm barish ho toh Delhi ka kya haal"],
  ["🎞️", "Rain Replay", "Monsoon 2024 ka din-ba-din time-lapse"],
  ["⏰", "Commute Reminder", "Office jaane se pehle risk alert + email"],
];

const FREE = ["Risk map aur search", "SHAP wajah aur savdhaniyan", "AI assistant", "Community reports"];

const FAQ = [
  ["Payment kaise hoti hai?", "Razorpay ke surakshit popup se: card, UPI, net banking ya wallet. Aapki card/UPI details hamare server par nahi aati."],
  ["Kya subscription apne aap renew hoti hai?", "Nahi. Ye ek baar ka payment hai, validity khatam hone par dobara lena padega."],
  ["Refund milega?", "Refund policy page par likhi shartein lagu hongi."],
];

function loadScript() {
  return new Promise<boolean>((res) => {
    if (window.Razorpay) return res(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res(true);
    s.onerror = () => res(false);
    document.body.appendChild(s);
  });
}

export default function Premium() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [until, setUntil] = useState(0);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<number | null>(0);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/login");
      return;
    }
    fetch(`${API}/api/v1/billing/plans`).then((r) => r.json()).then(setPlans).catch(() => {});
    api("/api/v1/billing/status").then((d) => setUntil(d.premium ? d.premium_until : 0)).catch(() => {});
  }, [router]);

  const buy = async (plan: Plan) => {
    setMsg("");
    setBusy(plan.id);
    try {
      if (!(await loadScript())) throw new Error("Payment popup load nahi hua, net check karo.");
      const o = await api("/api/v1/billing/order", { method: "POST", body: JSON.stringify({ plan: plan.id }) });
      const u = getUser();
      const rz = new window.Razorpay({
        key: o.key_id,
        amount: o.amount,
        currency: o.currency,
        order_id: o.order_id,
        name: "CivicPulse AI",
        description: o.label,
        prefill: { name: u?.name, email: u?.email },
        theme: { color: "#6366f1" },
        handler: async (resp: Record<string, string>) => {
          try {
            const v = await api("/api/v1/billing/verify", { method: "POST", body: JSON.stringify(resp) });
            const me = await api("/api/v1/auth/me");
            const tok = localStorage.getItem("cp_token");
            if (tok) setSession(tok, me);
            setUntil(v.premium_until);
            setOk(true);
            setMsg("Payment ho gayi. Premium chalu ho gaya!");
          } catch (e) {
            setOk(false);
            setMsg((e as Error).message);
          }
        },
        modal: { ondismiss: () => setBusy("") },
      });
      rz.open();
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-40 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl" />

        <main className="relative mx-auto max-w-5xl space-y-12 px-4 py-14">
          <section className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1 text-xs font-semibold tracking-widest text-amber-300">
              👑 CIVICPULSE PREMIUM
            </div>
            <h1 className="mt-4 bg-gradient-to-r from-white via-amber-200 to-rose-300 bg-clip-text text-5xl font-black text-transparent md:text-6xl">
              Barish se ek kadam aage
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">
              Safe route, stress test, replay aur commute alerts, sab ek jagah. Card, UPI ya net banking se.
            </p>
          </section>

          {until > 0 && (
            <div className="mx-auto max-w-xl rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center">
              <div className="font-bold text-emerald-300">✓ Aap Premium ho</div>
              <div className="text-sm text-slate-300">Valid: {new Date(until * 1000).toLocaleDateString()} tak</div>
            </div>
          )}
          <PremiumLab premium={until > 0 || getUser()?.role === "admin"} />

          <section className="grid gap-4 md:grid-cols-2">
            {PERKS.map(([ic, t, d]) => (
              <div key={t} className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:-translate-y-1 hover:border-amber-400/40 hover:bg-white/10">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-rose-400/20 text-2xl">{ic}</div>
                <div className="mt-3 font-bold">{t}</div>
                <p className="mt-1 text-sm text-slate-400">{d}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm font-semibold text-slate-400">FREE</div>
              <div className="my-2 text-4xl font-black">₹0</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {FREE.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <div className="mt-5 rounded-full bg-white/10 py-2 text-center text-sm text-slate-400">Aapka abhi ka plan</div>
            </div>

            {plans.map((p) => {
              const best = p.id === "yearly";
              return (
                <div
                  key={p.id}
                  className={`relative rounded-3xl border p-6 ${
                    best
                      ? "border-amber-400/60 bg-gradient-to-b from-amber-400/10 to-transparent shadow-[0_0_50px_-15px_rgba(251,191,36,0.6)]"
                      : "border-violet-400/30 bg-violet-400/5"
                  }`}
                >
                  {best && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-rose-400 px-3 py-0.5 text-[11px] font-bold text-slate-900">
                      SABSE KIFAYATI
                    </div>
                  )}
                  <div className="text-sm font-semibold text-slate-300">{p.label}</div>
                  <div className="my-2 text-4xl font-black">
                    ₹{p.price_inr}
                    <span className="text-sm font-normal text-slate-400"> / {p.days} din</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    <li>✓ Free ke saare features</li>
                    <li>✓ Safe Route, Stress Test</li>
                    <li>✓ Rain Replay</li>
                    <li>✓ Commute Reminder + email</li>
                  </ul>
                  <button
                    onClick={() => buy(p)}
                    disabled={!!busy}
                    className={`mt-5 w-full rounded-full py-2.5 font-bold transition hover:scale-[1.02] disabled:opacity-50 ${
                      best ? "bg-gradient-to-r from-amber-400 to-rose-400 text-slate-900" : "bg-gradient-to-r from-sky-500 to-violet-500"
                    }`}
                  >
                    {busy === p.id ? "Khul raha hai..." : "Upgrade karo"}
                  </button>
                </div>
              );
            })}
          </section>

          {msg && (
            <div className={`rounded-xl p-3 text-center text-sm ${ok ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-300"}`}>{msg}</div>
          )}

          <section className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-center text-2xl font-extrabold">Aksar poochhe jaane wale sawal</h2>
            <div className="space-y-2">
              {FAQ.map(([q, a], i) => (
                <div key={q} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between px-5 py-3 text-left font-medium">
                    {q} <span className="text-slate-400">{open === i ? "−" : "+"}</span>
                  </button>
                  {open === i && <p className="px-5 pb-4 text-sm text-slate-300">{a}</p>}
                </div>
              ))}
            </div>
          </section>

          <p className="text-center text-[11px] text-slate-500">Test mode mein asli paisa nahi katta.</p>
        </main>
      </div>
    </div>
  );
}