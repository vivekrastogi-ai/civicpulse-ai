"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, getUser } from "../lib/api";

type Metric = {
  model: string;
  pr_auc: number;
  roc_auc: number;
  brier: number;
  precision?: number;
  recall?: number;
  f1?: number;
};
type Info = {
  model_version: string;
  data: string;
  features: string[];
  test_metrics: Metric[];
  limitations: string[];
};

export default function ModelPage() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!getUser()) {
      router.replace("/login");
      return;
    }
    fetch(`${API}/api/v1/model-info`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setErr("Model info nahi mili. Backend chal raha hai?"));
  }, [router]);

  const maxAp = Math.max(0.01, ...(info?.test_metrics ?? []).map((m) => m.pr_auc));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <h1 className="text-3xl font-extrabold">Model & Data</h1>
        {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}
        {info && (
          <>
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
              {info.data}. Neeche ke numbers nakli data par hain, asli duniya ki accuracy nahi.
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-3 font-semibold text-sky-300">Test results (2024)</h2>
              <div className="space-y-3 text-sm">
                {info.test_metrics.map((m) => (
                  <div key={m.model}>
                    <div className="flex justify-between">
                      <span>{m.model}</span>
                      <span className="text-slate-400">
                        PR-AUC {m.pr_auc} | ROC-AUC {m.roc_auc} | Brier {m.brier}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-sky-500 to-violet-500"
                        style={{ width: `${(m.pr_auc / maxAp) * 100}%` }}
                      />
                    </div>
                    {m.precision !== undefined && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        Precision {m.precision} | Recall {m.recall} | F1 {m.f1}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Random andaze ka PR-AUC lagbhag 0.008 hota hai (test mein positive rate).
              </p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-2 font-semibold text-sky-300">Model ke features ({info.features.length})</h2>
              <div className="flex flex-wrap gap-2 text-xs">
                {info.features.map((f) => (
                  <span key={f} className="rounded-full bg-white/10 px-2 py-1 text-slate-300">
                    {f}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5">
              <h2 className="mb-2 font-semibold text-red-300">Limitations</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                {info.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}