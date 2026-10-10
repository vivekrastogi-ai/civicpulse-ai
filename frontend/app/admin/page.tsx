"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, clearSession, getUser, type User } from "../lib/api";

type AReport = {
  id: string;
  cell_id: number;
  place_name: string | null;
  kind: string;
  text: string;
  author: string;
  user_email?: string | null;
  status: string;
  hidden: boolean;
  verified?: boolean;
  note: string | null;
  created_at: number;
};
type Summary = {
  total_reports: number;
  total_users: number;
  by_status: Record<string, number>;
  by_kind: Record<string, number>;
  feedback_count: number;
  feedback_avg: number | null;
};
type Hotspot = { cell_id: number; place_name: string | null; reports: number; reporters: number };

const KIND_LABEL: Record<string, string> = {
  waterlogging: "Paani bhara hai",
  drain_blocked: "Naala jam hai",
  traffic: "Jam / raasta band",
  all_clear: "Sab theek hai",
  other: "Anya",
};
const STATUSES = ["new", "forwarded", "in_progress", "resolved"];
const STATUS_LABEL: Record<string, string> = {
  new: "New",
  forwarded: "Forwarded",
  in_progress: "In progress",
  resolved: "Resolved",
};
const STATUS_CLS: Record<string, string> = {
  new: "bg-red-500/20 text-red-300",
  forwarded: "bg-amber-500/20 text-amber-300",
  in_progress: "bg-sky-500/20 text-sky-300",
  resolved: "bg-emerald-500/20 text-emerald-300",
};

const card = "rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur";

function suggest(rows: AReport[]): string[] {
  const open = rows.filter((r) => r.status !== "resolved" && !r.hidden);
  const c = (k: string) => open.filter((r) => r.kind === k).length;
  const users = new Set(open.map((r) => r.user_email).filter(Boolean)).size;
  const out: string[] = [];
  if (c("drain_blocked") > 0)
    out.push("Naale/drain jam ki report hai: drainage safai team bhejein aur silt/kachra hatwayein.");
  if (c("waterlogging") >= 3)
    out.push("Kai logon ne paani bharne ki report ki: dewatering pump lagwane par vichar karein.");
  else if (c("waterlogging") > 0)
    out.push("Paani bharne ki report: mauke par jaanch karwayein aur drain ka flow dekhein.");
  if (c("traffic") > 0)
    out.push("Jam/raasta band ki report: traffic police ko batayein aur diversion board lagwane par vichar karein.");
  if (users >= 3)
    out.push(`${users} alag users ne shikayat ki hai: is jagah ko priority par rakhein.`);
  if (!out.length) out.push("Abhi koi kholi hui shikayat nahi. Nigrani jaari rakhein.");
  out.push("Ye sirf suggestions hain, sarkari faisla nahi. Reports verified nahi hain, mauke par jaanch zaroori hai.");
  return out;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [hot, setHot] = useState<Hotspot[]>([]);
  const [rows, setRows] = useState<AReport[]>([]);
  const [fStatus, setFStatus] = useState("");
  const [fKind, setFKind] = useState("");
  const [place, setPlace] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState("");

  const load = () => {
    const qs = new URLSearchParams();
    if (fStatus) qs.set("status", fStatus);
    if (fKind) qs.set("kind", fKind);
    qs.set("limit", "300");
    Promise.all([
      api("/api/v1/admin/summary"),
      api("/api/v1/admin/hotspots"),
      api(`/api/v1/admin/reports?${qs.toString()}`),
    ])
      .then(([s, h, r]) => {
        setSum(s);
        setHot(h);
        setRows(r.reports);
        setErr("");
      })
      .catch((e) => {
        setErr(e.message);
        if (e.status === 401 || e.status === 403) {
          clearSession();
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") {
      router.replace(u ? "/" : "/login");
      return;
    }
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [user, fStatus, fKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportIncidents = () => {
    setExportMsg("Export ho raha hai...");
    api("/api/v1/admin/export-incidents", { method: "POST" })
      .then((d) => setExportMsg(`${d.saved} verified incidents save hue (${d.path})`))
      .catch((e) => setExportMsg(e.message));
  };

  const update = (id: string, body: object) =>
    api(`/api/v1/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify(body) })
      .then(load)
      .catch((e) => setErr(e.message));

  const placeRows = useMemo(
    () => (place ? rows.filter((r) => (r.place_name || `Cell ${r.cell_id}`) === place) : []),
    [rows, place]
  );
  const maxKind = Math.max(1, ...Object.values(sum?.by_kind ?? { x: 1 }));

  if (!user) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">Load ho raha hai...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-6 py-3 backdrop-blur">
        <div>
          <h1 className="bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-xl font-extrabold text-transparent">
            CivicPulse AI | Admin Dashboard
          </h1>
          <div className="text-[11px] text-slate-400">Logon ki shikayatein, hotspot areas aur kya karein</div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className="rounded-full bg-white/10 px-4 py-1.5 hover:bg-white/20">Risk map dekho</Link>
          <span className="text-slate-400">{user.name}</span>
          <button
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
            className="rounded-full bg-white/10 px-4 py-1.5 hover:bg-red-500/30"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-6">
        {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}
        {loading && <div className="text-sm text-sky-300">Load ho raha hai...</div>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { l: "Kul reports", v: sum?.total_reports ?? 0, c: "text-sky-300" },
            { l: "Kholi hui (new)", v: sum?.by_status?.new ?? 0, c: "text-red-300" },
            { l: "Registered users", v: sum?.total_users ?? 0, c: "text-violet-300" },
            { l: "Feedback rating", v: sum?.feedback_avg ? `${sum.feedback_avg} ★ (${sum.feedback_count})` : "-", c: "text-amber-300" },
          ].map((x) => (
            <div key={x.l} className={card}>
              <div className="text-xs text-slate-400">{x.l}</div>
              <div className={`mt-1 text-3xl font-extrabold ${x.c}`}>{x.v}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className={card}>
            <div className="mb-3 font-semibold">Shikayat ka prakaar</div>
            <div className="space-y-2 text-sm">
              {Object.entries(sum?.by_kind ?? {}).map(([k, n]) => (
                <div key={k}>
                  <div className="flex justify-between">
                    <span>{KIND_LABEL[k] ?? k}</span>
                    <span className="text-slate-400">{n}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-gradient-to-r from-sky-500 to-violet-500" style={{ width: `${(n / maxKind) * 100}%` }} />
                  </div>
                </div>
              ))}
              {!Object.keys(sum?.by_kind ?? {}).length && <p className="text-slate-400">Abhi koi report nahi.</p>}
            </div>
          </div>

          <div className={card}>
            <div className="mb-3 font-semibold">Hotspot areas (sabse zyada shikayat)</div>
            <div className="space-y-2 text-sm">
              {hot.map((h) => {
                const name = h.place_name || `Cell ${h.cell_id}`;
                return (
                  <button
                    key={h.cell_id}
                    onClick={() => setPlace(name)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-white/10 ${
                      place === name ? "bg-white/10" : "bg-white/5"
                    }`}
                  >
                    <span>{name}</span>
                    <span className="text-xs text-slate-400">
                      {h.reports} reports | {h.reporters} users
                    </span>
                  </button>
                );
              })}
              {!hot.length && <p className="text-slate-400">Abhi koi hotspot nahi.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <div className="mb-2 font-semibold text-emerald-300">Kya karein (suggestions)</div>
            {place ? (
              <>
                <div className="mb-2 text-sm text-slate-300">{place}</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                  {suggest(placeRows).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-slate-400">Kisi hotspot par click karo, uske liye suggestions yahan aayenge.</p>
            )}
          </div>
        </div>

        <div className={card}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="font-semibold">Saari reports</div>
                        <button
              onClick={exportIncidents}
              className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
            >
              Verified incidents export karo
            </button>
            {exportMsg && <span className="text-xs text-emerald-200">{exportMsg}</span>}
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="ml-auto rounded-lg bg-slate-800 px-2 py-1 text-sm">
              <option value="">Saare status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <select value={fKind} onChange={(e) => setFKind(e.target.value)} className="rounded-lg bg-slate-800 px-2 py-1 text-sm">
              <option value="">Saare prakaar</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th className="p-2">Jagah</th>
                  <th className="p-2">Prakaar</th>
                  <th className="p-2">Report</th>
                  <th className="p-2">User</th>
                  <th className="p-2">Samay</th>
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-white/5 ${r.hidden ? "opacity-40" : ""}`}>
                    <td className="p-2">{r.place_name || `Cell ${r.cell_id}`}</td>
                    <td className="p-2">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="max-w-xs p-2">{r.text}</td>
                    <td className="p-2">
                      <div>{r.author}</div>
                      <div className="text-[11px] text-slate-500">{r.user_email || "anonymous"}</div>
                    </td>
                    <td className="whitespace-nowrap p-2 text-xs text-slate-400">{new Date(r.created_at * 1000).toLocaleString()}</td>
                    <td className="p-2">
                      <select
                        value={r.status}
                        onChange={(e) => update(r.id, { status: e.target.value })}
                        className={`rounded-lg px-2 py-1 text-xs ${STATUS_CLS[r.status]}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s} className="bg-slate-800 text-slate-100">{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => update(r.id, { verified: !r.verified })}
                        className={`mr-1 rounded-lg px-2 py-1 text-xs ${
                          r.verified ? "bg-emerald-500/30 text-emerald-200" : "bg-white/10 hover:bg-white/20"
                        }`}
                      >
                        {r.verified ? "✓ Verified" : "Verify"}
                      </button>
                      <button
                        onClick={() => update(r.id, { hidden: !r.hidden })}
                        className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                      >
                        {r.hidden ? "Dikhao" : "Chhupao"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="p-3 text-sm text-slate-400">Koi report nahi mili.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}