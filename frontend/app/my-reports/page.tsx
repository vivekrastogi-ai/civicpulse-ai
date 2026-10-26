"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, api, getUser } from "../lib/api";

type Center = { name: string; type: string; distance_km: number; phone: string | null; lat: number; lon: number };
type R = {
  id: string;
  place_name: string | null;
  cell_id: number;
  kind: string;
  text: string;
  status: string;
  verified?: boolean;
  photo?: string | null;
  help_info?: { note: string; centers: Center[]; sent_at: number } | null;
  created_at: number;
};

const KIND: Record<string, string> = {
  waterlogging: "Paani bhara hai",
  drain_blocked: "Naala jam hai",
  traffic: "Jam / raasta band",
  all_clear: "Sab theek hai",
  other: "Anya",
};
const STATUS: Record<string, { t: string; c: string }> = {
  new: { t: "New", c: "bg-red-500/20 text-red-300" },
  forwarded: { t: "Forwarded", c: "bg-amber-500/20 text-amber-300" },
  in_progress: { t: "In progress", c: "bg-sky-500/20 text-sky-300" },
  resolved: { t: "Resolved", c: "bg-emerald-500/20 text-emerald-300" },
};

export default function MyReports() {
  const router = useRouter();
  const [rows, setRows] = useState<R[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/login");
      return;
    }
    api("/api/v1/my-reports")
      .then((d) => setRows(d.reports))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-3xl font-extrabold">Meri Reports</h1>
        <p className="text-sm text-slate-400">Aapki bheji hui reports, unka status aur admin ki bheji madad ki jaankari.</p>
        {loading && <p className="text-sky-300">Load ho raha hai...</p>}
        {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}
        {!loading && !rows.length && !err && (
          <p className="text-slate-400">Abhi koi report nahi. Risk Map par kisi jagah se report bhejo.</p>
        )}
        {rows.map((r) => {
          const s = STATUS[r.status] ?? STATUS.new;
          return (
            <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{r.place_name || `Cell ${r.cell_id}`}</div>
                <div className="flex gap-1">
                  {r.verified && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">✓ Verified</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${s.c}`}>{s.t}</span>
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-400">{KIND[r.kind] ?? r.kind}</div>
              <p className="mt-2 text-sm">{r.text}</p>
              {r.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API}${r.photo}`} alt="Aapki photo" className="mt-3 max-h-56 rounded-xl border border-white/10 object-cover" />
              )}
              <div className="mt-1 text-[11px] text-slate-500">{new Date(r.created_at * 1000).toLocaleString()}</div>

              {r.help_info && (
                <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm">
                  <div className="font-semibold text-emerald-300">🆘 Admin ne madad ki jaankari bheji</div>
                  {r.help_info.note && <p className="mt-1 text-slate-200">{r.help_info.note}</p>}
                  <ul className="mt-2 space-y-2">
                    {r.help_info.centers.map((c, i) => (
                      <li key={i} className="rounded-lg bg-white/5 p-2">
                        <div className="font-medium">{c.type}: {c.name}</div>
                        <div className="text-xs text-slate-400">
                          {c.distance_km} km door{c.phone ? ` | ${c.phone}` : ""}
                        </div>
                        <a
                          href={`https://www.google.com/maps?q=${c.lat},${c.lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sky-300 hover:underline"
                        >
                          Map par dekho →
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-500">Jaan ko khatra ho toh seedha 112 par call karo.</p>
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}