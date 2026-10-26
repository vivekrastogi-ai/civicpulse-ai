"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { getUser } from "../lib/api";

const STEPS = [
  ["1. Data", "Open-Meteo se barish/mausam, OpenStreetMap se sadak, naale aur underpass, elevation data."],
  ["2. Grid", "Delhi ko 1 km x 1 km ke 1,621 cells mein baanta gaya."],
  ["3. Model", "XGBoost model har cell ke liye roz ka waterlogging risk nikalta hai, calibration ke saath."],
  ["4. Explain", "SHAP batata hai ki risk kin wajahon se badha ya ghata."],
  ["5. Live", "Aaj aur agle 7 din ka forecast Open-Meteo se aata hai."],
  ["6. Community", "Log reports bhejte hain, admin verify karke status badalta hai."],
];

export default function About() {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else setOk(true);
  }, [router]);

  if (!ok) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <section>
          <h1 className="text-3xl font-extrabold">CivicPulse AI kya hai?</h1>
          <p className="mt-2 text-slate-300">
            Delhi mein baarish ke baad paani bharna aam samasya hai, aur ise aksar ghatna ke baad hi pata chalta hai.
            CivicPulse AI mausam, ilaake ki banawat aur logon ki reports ko jodkar pehle se risk ka andaza lagata hai,
            aur batata hai ki risk kyun hai aur kya savdhani rakhein.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {STEPS.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="font-semibold text-sky-300">{t}</div>
              <p className="mt-1 text-sm text-slate-300">{d}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
          <h2 className="font-semibold text-amber-300">Zaroori sachchai</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
            <li>Ye prototype hai, emergency warning system nahi.</li>
            <li>Model abhi synthetic (nakli) incident data par trained hai, isliye uski accuracy asli duniya ki accuracy nahi hai.</li>
            <li>Verified reports jama hone par model asli data par dobara train kiya ja sakta hai.</li>
            <li>Logon ki reports verified nahi hoti jab tak admin verify na kare.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
          <div className="text-xs uppercase tracking-widest text-slate-400">Banaya</div>
          <div className="text-2xl font-bold">Vivek Rastogi</div>
          <a
            href="https://www.linkedin.com/in/vivek-rastogi-78401430b/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block rounded-full bg-[#0a66c2] px-4 py-1.5 text-sm font-semibold"
          >
            LinkedIn
          </a>
        </section>
      </main>
    </div>
  );
}