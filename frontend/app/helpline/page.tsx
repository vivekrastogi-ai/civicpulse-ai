"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { getUser } from "../lib/api";

const BEFORE = [
  "Mausam update aur traffic advisory dekhte raho.",
  "Basement ya ground floor ka zaroori saamaan unchai par rakho.",
  "Mobile, power bank charge rakho aur zaroori documents plastic mein rakho.",
  "Naale aur drain ke paas kachra mat daalo.",
];
const DURING = [
  "Bhare paani mein gaadi ya paidal mat chalo, khaaskar underpass mein.",
  "Bijli ke khambe, khule taar aur lagi hui metal cheezon se door raho.",
  "Bijli ke switch band kar do agar ghar mein paani aa raha ho.",
  "Unchi surakshit jagah par raho aur bachchon/bujurgon ka dhyan rakho.",
];
const AFTER = [
  "Paani utarne ke baad bhi gile switch/appliance mat chhuo.",
  "Peene ka paani ubal ke piyo.",
  "Nuksaan ki tasveer le lo aur sambandhit vibhag ko batao.",
];

function Block({ t, c, items }: { t: string; c: string; items: string[] }) {
  return (
    <div className={`rounded-2xl border p-5 ${c}`}>
      <div className="mb-2 font-semibold">{t}</div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Helpline() {
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
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <h1 className="text-3xl font-extrabold">Helpline & Guide</h1>

        <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
          <div className="text-xs uppercase tracking-widest text-red-300">Emergency</div>
          <div className="mt-1 text-4xl font-extrabold">112</div>
          <p className="mt-1 text-sm text-slate-300">Bharat ka rashtriya emergency number. Jaan ko khatra ho toh seedha call karo.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          <div className="mb-1 font-semibold text-sky-300">Nagar nigam / sarkari shikayat</div>
          Delhi nagar nigam (MCD) aur Delhi sarkar ke official helpline number aur shikayat portal ke liye unki
          official website dekho. Galat number se bachne ke liye sirf official site ka hi number use karo.
          <div className="mt-2 text-xs text-slate-500">
            (Project owner: yahan official number/link khud daalo, jab official site se verify kar lo.)
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Block t="Barish se pehle" c="border-sky-400/20 bg-sky-400/5" items={BEFORE} />
          <Block t="Barish ke dauran" c="border-amber-400/20 bg-amber-400/5" items={DURING} />
          <Block t="Barish ke baad" c="border-emerald-400/20 bg-emerald-400/5" items={AFTER} />
        </div>

        <p className="text-xs text-slate-500">
          Ye general safety salah hai. CivicPulse AI prototype hai aur emergency warning system nahi hai.
        </p>
      </main>
    </div>
  );
}