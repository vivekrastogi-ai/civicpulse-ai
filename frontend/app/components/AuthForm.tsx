"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API, setSession } from "../lib/api";

const RULES: { t: string; ok: (p: string) => boolean }[] = [
  { t: "Kam se kam 8 akshar", ok: (p) => p.length >= 8 },
  { t: "Ek bada letter (A-Z)", ok: (p) => /[A-Z]/.test(p) },
  { t: "Ek chhota letter (a-z)", ok: (p) => /[a-z]/.test(p) },
  { t: "Ek number (0-9)", ok: (p) => /\d/.test(p) },
  { t: "Ek special character (@ # ! $ ...)", ok: (p) => /[^A-Za-z0-9]/.test(p) },
];

const BUILDINGS = Array.from({ length: 32 }, (_, i) => ({
  x: i * 38,
  w: 32,
  h: 70 + ((i * 37) % 7) * 24,
}));

function Background() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-sky-950">
      <style>{`
        @keyframes cpfall { from { transform: translateY(-12vh); } to { transform: translateY(112vh); } }
        @keyframes cpwave { from { transform: translateX(0); } to { transform: translateX(-200px); } }
        @keyframes cpflash { 0%,92%,100% { opacity: 0 } 94% { opacity: .35 } 96% { opacity: .05 } 98% { opacity: .25 } }
      `}</style>
      <div className="absolute inset-0 bg-white" style={{ animation: "cpflash 9s infinite", opacity: 0 }} />
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
      {Array.from({ length: 70 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 w-px bg-gradient-to-b from-transparent to-sky-300/60"
          style={{
            left: `${(i * 17) % 100}%`,
            height: 14 + (i % 3) * 10,
            animation: `cpfall ${0.9 + (i % 5) * 0.25}s linear ${((i * 0.37) % 2).toFixed(2)}s infinite`,
          }}
        />
      ))}
      <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1216 360" preserveAspectRatio="xMidYMax slice">
        <g fill="#0b1324">
          {BUILDINGS.map((b, i) => (
            <rect key={i} x={b.x} y={300 - b.h} width={b.w} height={b.h + 60} />
          ))}
          <path d="M540 300 V150 Q608 70 676 150 V300 Z" />
          <rect x="520" y="140" width="176" height="14" />
        </g>
        <g fill="#fde68a" opacity="0.5">
          {BUILDINGS.filter((_, i) => i % 3 === 0).map((b, i) => (
            <rect key={i} x={b.x + 8} y={300 - b.h + 14} width="5" height="7" />
          ))}
        </g>
        <g style={{ animation: "cpwave 6s linear infinite" }}>
          <path
            d="M0 318 q50 -14 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 V360 H0 Z"
            fill="#0ea5e9"
            opacity="0.35"
          />
        </g>
      </svg>
    </div>
  );
}

const SOCIAL = [
  { id: "google", label: "Google", cls: "bg-white text-slate-800 hover:bg-slate-100", mark: "G" },
  { id: "github", label: "GitHub", cls: "bg-slate-800 text-white hover:bg-slate-700", mark: "GH" },
  { id: "linkedin", label: "LinkedIn", cls: "bg-[#0a66c2] text-white hover:bg-[#0b5cad]", mark: "in" },
];

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [prov, setProv] = useState<Record<string, boolean>>({});
  const isLogin = mode === "login";
  const allOk = RULES.every((r) => r.ok(password));

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("error");
    if (q) setErr(q);
    fetch(`${API}/api/v1/auth/oauth/providers`)
      .then((r) => r.json())
      .then(setProv)
      .catch(() => {});
  }, []);

  const submit = async () => {
    setErr("");
    if (!isLogin && !allOk) {
      setErr("Password ke saare 5 rules poore karo.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogin ? { email, password } : { name, email, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Details check karo");
      setSession(d.token, d.user);
      sessionStorage.removeItem("cp_welcomed");
      router.push(d.user.role === "admin" ? "/admin" : "/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-white placeholder-slate-400 outline-none focus:border-sky-400";

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 text-slate-100">
      <Background />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-3xl font-extrabold text-transparent">
          CivicPulse AI
        </h1>
        <p className="mb-5 mt-1 text-sm text-slate-300">
          Delhi mein paani bharne ka khatra, pehle se. {isLogin ? "Login karein" : "Naya account banayein"}
        </p>

        <div className="space-y-2">
          {SOCIAL.map((s) => {
            const on = prov[s.id];
            return (
              <button
                key={s.id}
                disabled={!on}
                title={on ? "" : "Is login ke liye developer keys abhi set nahi hain"}
                onClick={() => (window.location.href = `${API}/api/v1/auth/oauth/${s.id}/start`)}
                className={`flex w-full items-center justify-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition ${s.cls} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span className="rounded bg-black/10 px-1.5 text-xs font-bold">{s.mark}</span>
                {s.label} se continue karein
                {!on && <span className="text-[10px] font-normal">(setup baaki)</span>}
              </button>
            );
          })}
        </div>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-white/10" /> ya email se <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-3">
          {!isLogin && (
            <input className={input} placeholder="Aapka naam" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className={input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />

          {!isLogin && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
              <div className="mb-1 font-semibold text-slate-200">Password mein ye 5 cheezein zaroori hain:</div>
              <ul className="space-y-1">
                {RULES.map((r) => {
                  const ok = r.ok(password);
                  return (
                    <li key={r.t} className={ok ? "text-emerald-400" : "text-slate-400"}>
                      {ok ? "✓" : "○"} {r.t}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {err && <div className="rounded-lg bg-red-500/15 p-2 text-sm text-red-300">{err}</div>}
          <button
            onClick={submit}
            disabled={busy || (!isLogin && !allOk)}
            className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 py-2.5 font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Ruko..." : isLogin ? "Login" : "Account banao"}
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-slate-300">
          {isLogin ? (
            <>
              Naye ho?{" "}
              <Link href="/register" className="text-sky-400 hover:underline">Account banao</Link>
            </>
          ) : (
            <>
              Pehle se account hai?{" "}
              <Link href="/login" className="text-sky-400 hover:underline">Login karo</Link>
            </>
          )}
        </p>
        <p className="mt-3 text-center text-[11px] text-slate-500">Prototype. Emergency warning system nahi hai.</p>
      </div>
    </div>
  );
}