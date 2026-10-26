"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { API, api, clearSession, getUser, type User } from "../lib/api";

type Center = { name: string; type: string; distance_km: number; phone: string | null; lat: number; lon: number };
type AReport = {
  id: string; cell_id: number; place_name: string | null; kind: string; text: string; author: string;
  user_email?: string | null; status: string; hidden: boolean; verified?: boolean; photo?: string | null;
  help_info?: { note: string; centers: Center[]; sent_at: number } | null; created_at: number;
};
type Summary = {
  total_reports: number; total_users: number; by_status: Record<string, number>;
  by_kind: Record<string, number>; feedback_count: number; feedback_avg: number | null;
};
type Hotspot = { cell_id: number; place_name: string | null; reports: number; reporters: number };
type Trend = { date: string; reports: number };
type AUser = { id: string; name: string; email: string; role: string; provider: string; reports: number; created_at: number };
type FB = { id: string; name: string; rating: number; message: string; created_at: number };

const KIND: Record<string, string> = {
  waterlogging: "Paani bhara hai", drain_blocked: "Naala jam hai", traffic: "Jam / raasta band",
  all_clear: "Sab theek hai", other: "Anya",
};
const STATUSES = ["new", "forwarded", "in_progress", "resolved"];
const SLABEL: Record<string, string> = { new: "New", forwarded: "Forwarded", in_progress: "In progress", resolved: "Resolved" };
const SCLS: Record<string, string> = {
  new: "bg-red-500/20 text-red-300", forwarded: "bg-amber-500/20 text-amber-300",
  in_progress: "bg-sky-500/20 text-sky-300", resolved: "bg-emerald-500/20 text-emerald-300",
};
const SBAR: Record<string, string> = {
  new: "bg-red-500", forwarded: "bg-amber-500", in_progress: "bg-sky-500", resolved: "bg-emerald-500",
};
const card = "rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur";

const TABS = [
  ["overview", "📊", "Overview"], ["reports", "📝", "Reports"], ["hotspots", "🔥", "Hotspots"],
  ["users", "👥", "Users"], ["feedback", "💬", "Feedback"],
] as const;
type Tab = (typeof TABS)[number][0];

function suggest(rows: AReport[]): string[] {
  const open = rows.filter((r) => r.status !== "resolved" && !r.hidden);
  const c = (k: string) => open.filter((r) => r.kind === k).length;
  const users = new Set(open.map((r) => r.user_email).filter(Boolean)).size;
  const out: string[] = [];
  if (c("drain_blocked") > 0) out.push("Naale/drain jam ki report hai: safai team bhejein aur silt/kachra hatwayein.");
  if (c("waterlogging") >= 3) out.push("Kai logon ne paani bharne ki report ki: dewatering pump lagwane par vichar karein.");
  else if (c("waterlogging") > 0) out.push("Paani bharne ki report: mauke par jaanch karwayein aur drain ka flow dekhein.");
  if (c("traffic") > 0) out.push("Jam/raasta band ki report: traffic police ko batayein, diversion board lagwane par vichar karein.");
  if (users >= 3) out.push(`${users} alag users ne shikayat ki hai: is jagah ko priority par rakhein.`);
  if (!out.length) out.push("Abhi koi kholi hui shikayat nahi. Nigrani jaari rakhein.");
  out.push("Ye sirf suggestions hain, sarkari faisla nahi. Reports verify hone tak pakki nahi hain.");
  return out;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [sum, setSum] = useState<Summary | null>(null);
  const [hot, setHot] = useState<Hotspot[]>([]);
  const [rows, setRows] = useState<AReport[]>([]);
  const [trend, setTrend] = useState<Trend[]>([]);
  const [users, setUsers] = useState<AUser[]>([]);
  const [fbs, setFbs] = useState<FB[]>([]);
  const [fStatus, setFStatus] = useState("");
  const [fKind, setFKind] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [place, setPlace] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState<string | null>(null);
  const [centers, setCenters] = useState<Center[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [cBusy, setCBusy] = useState(false);
  const [cMsg, setCMsg] = useState("");

  const load = () => {
    const qs = new URLSearchParams();
    if (fStatus) qs.set("status", fStatus);
    if (fKind) qs.set("kind", fKind);
    qs.set("limit", "300");
    Promise.all([
      api("/api/v1/admin/summary"),
      api("/api/v1/admin/hotspots"),
      api(`/api/v1/admin/reports?${qs.toString()}`),
      api("/api/v1/admin/trend?days=14"),
      api("/api/v1/admin/users"),
      fetch(`${API}/api/v1/feedback?limit=50`).then((r) => r.json()),
    ])
      .then(([s, h, r, t, u, f]) => {
        setSum(s); setHot(h); setRows(r.reports); setTrend(t); setUsers(u); setFbs(f.items ?? []); setErr("");
      })
      .catch((e) => {
        setErr(e.message);
        if (e.status === 401 || e.status === 403) { clearSession(); router.replace("/login"); }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") { router.replace(u ? "/" : "/login"); return; }
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [user, fStatus, fKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (id: string, body: object) =>
    api(`/api/v1/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(load).catch((e) => setErr(e.message));

  const bulk = (body: object) => {
    if (!sel.length) return;
    api("/api/v1/admin/bulk", { method: "POST", body: JSON.stringify({ ids: sel, ...body }) })
      .then((d) => { setMsg(`${d.updated} reports update hui.`); setSel([]); load(); })
      .catch((e) => setErr(e.message));
  };

  const exportIncidents = () => {
    setMsg("Export ho raha hai...");
    api("/api/v1/admin/export-incidents", { method: "POST" })
      .then((d) => setMsg(`${d.saved} verified incidents save hue (${d.path})`))
      .catch((e) => setMsg(e.message));
  };

  const hotCount = useMemo(() => {
    const m: Record<number, number> = {};
    rows.filter((r) => r.status !== "resolved" && !r.hidden).forEach((r) => (m[r.cell_id] = (m[r.cell_id] || 0) + 1));
    return m;
  }, [rows]);

  const priority = (r: AReport) =>
    (hotCount[r.cell_id] || 0) * 2 + (r.kind === "waterlogging" ? 3 : 0) + (r.verified ? 2 : 0) +
    (r.status === "new" ? 2 : 0) + (r.photo ? 1 : 0);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows
      .filter((r) => !t || `${r.place_name} ${r.text} ${r.author} ${r.user_email}`.toLowerCase().includes(t))
      .sort((a, b) => priority(b) - priority(a));
  }, [rows, q, hotCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = rows.find((r) => r.id === openId) ?? null;

  const openReport = (id: string) => {
    setOpenId(id); setCenters([]); setPicked([]); setNote(""); setCMsg("");
  };

  const findCenters = () => {
    if (!open) return;
    setCBusy(true); setCMsg("");
    api(`/api/v1/admin/reports/${open.id}/help-centers`)
      .then((d) => { setCenters(d.centers); setPicked(d.centers.slice(0, 3).map((_: Center, i: number) => i)); setCMsg(d.note); })
      .catch((e) => setCMsg(e.message))
      .finally(() => setCBusy(false));
  };

  const sendHelp = () => {
    if (!open || !picked.length) { setCMsg("Kam se kam ek madad kendra chuno."); return; }
    setCBusy(true);
    api(`/api/v1/admin/reports/${open.id}/send-help`, {
      method: "POST",
      body: JSON.stringify({ note, centers: picked.map((i) => centers[i]) }),
    })
      .then((d) => { setCMsg(d.emailed ? "User ko bhej diya (email bhi gaya)." : "User ko bhej diya (Meri Reports mein dikhega)."); load(); })
      .catch((e) => setCMsg(e.message))
      .finally(() => setCBusy(false));
  };

  const placeRows = useMemo(
    () => (place ? rows.filter((r) => (r.place_name || `Cell ${r.cell_id}`) === place) : []),
    [rows, place]
  );
  const maxT = Math.max(1, ...trend.map((t) => t.reports));
  const maxKind = Math.max(1, ...Object.values(sum?.by_kind ?? { x: 1 }));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  if (!user) return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">Load ho raha hai...</div>;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-4 md:flex">
        <div className="bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-xl font-extrabold text-transparent">CivicPulse Admin</div>
        <div className="mb-6 text-[11px] text-slate-500">Control center</div>
        <nav className="space-y-1">
          {TABS.map(([k, ic, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                tab === k ? "bg-gradient-to-r from-sky-500/30 to-violet-500/20 text-white shadow-lg" : "text-slate-400 hover:bg-white/5"}`}>
              <span>{ic}</span> {l}
              {k === "reports" && (sum?.by_status?.new ?? 0) > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-2 text-[10px] font-bold text-white">{sum?.by_status?.new}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-sm">
          <Link href="/" className="block rounded-xl bg-white/10 px-3 py-2 text-center hover:bg-white/20">🗺️ Risk map</Link>
          <button onClick={() => { clearSession(); router.replace("/login"); }} className="w-full rounded-xl bg-white/10 px-3 py-2 hover:bg-red-500/30">Logout</button>
          <div className="text-center text-[11px] text-slate-500">{user.name}</div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-4 p-4 md:p-6">
        <div className="flex gap-1 overflow-x-auto md:hidden">
          {TABS.map(([k, ic, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${tab === k ? "bg-sky-500" : "bg-white/10"}`}>{ic} {l}</button>
          ))}
        </div>
        <h1 className="text-2xl font-extrabold">{TABS.find((t) => t[0] === tab)?.[2]}</h1>
        {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}
        {msg && <div className="rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-300">{msg}</div>}
        {loading && <div className="text-sm text-sky-300">Load ho raha hai...</div>}

        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Kul reports", sum?.total_reports ?? 0, "text-sky-300", "📝"],
                ["Kholi hui (new)", sum?.by_status?.new ?? 0, "text-red-300", "🚨"],
                ["Registered users", sum?.total_users ?? 0, "text-violet-300", "👥"],
                ["Feedback rating", sum?.feedback_avg ? `${sum.feedback_avg} ★ (${sum.feedback_count})` : "-", "text-amber-300", "⭐"],
              ].map(([l, v, c, ic]) => (
                <div key={l as string} className={`${card} transition hover:-translate-y-1`}>
                  <div className="flex justify-between text-xs text-slate-400">{l} <span className="text-lg">{ic}</span></div>
                  <div className={`mt-1 text-3xl font-extrabold ${c}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className={`${card} lg:col-span-2`}>
                <div className="mb-3 font-semibold">Pichhle 14 din ki reports</div>
                <div className="flex h-40 items-end gap-1">
                  {trend.map((t) => (
                    <div key={t.date} className="flex h-full flex-1 flex-col items-center justify-end" title={`${t.date}: ${t.reports}`}>
                      <div className="mb-1 text-[9px] text-slate-400">{t.reports || ""}</div>
                      <div className="w-full rounded-t bg-gradient-to-t from-sky-500 to-violet-500 transition-all duration-700" style={{ height: `${Math.max(4, (t.reports / maxT) * 110)}px` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-1">{trend.map((t) => (<div key={t.date} className="flex-1 text-center text-[9px] text-slate-500">{t.date.slice(8)}</div>))}</div>
              </div>
              <div className={card}>
                <div className="mb-3 font-semibold">Status ka hisaab</div>
                <div className="space-y-3 text-sm">
                  {STATUSES.map((s) => {
                    const n = sum?.by_status?.[s] ?? 0;
                    const tot = Math.max(1, sum?.total_reports ?? 1);
                    return (
                      <div key={s}>
                        <div className="flex justify-between"><span>{SLABEL[s]}</span><span className="text-slate-400">{n}</span></div>
                        <div className="mt-1 h-2 rounded-full bg-white/10"><div className={`h-2 rounded-full ${SBAR[s]}`} style={{ width: `${(n / tot) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className={card}>
              <div className="mb-3 font-semibold">Shikayat ka prakaar</div>
              <div className="space-y-2 text-sm">
                {Object.entries(sum?.by_kind ?? {}).map(([k, n]) => (
                  <div key={k}>
                    <div className="flex justify-between"><span>{KIND[k] ?? k}</span><span className="text-slate-400">{n}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-sky-500 to-violet-500" style={{ width: `${(n / maxKind) * 100}%` }} /></div>
                  </div>
                ))}
                {!Object.keys(sum?.by_kind ?? {}).length && <p className="text-slate-400">Abhi koi report nahi.</p>}
              </div>
            </div>
          </>
        )}

        {tab === "reports" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jagah, user ya text se dhundo..."
                className="min-w-0 flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm outline-none placeholder-slate-500" />
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-xl bg-slate-800 px-2 py-2 text-sm">
                <option value="">Saare status</option>
                {STATUSES.map((s) => (<option key={s} value={s}>{SLABEL[s]}</option>))}
              </select>
              <select value={fKind} onChange={(e) => setFKind(e.target.value)} className="rounded-xl bg-slate-800 px-2 py-2 text-sm">
                <option value="">Saare prakaar</option>
                {Object.entries(KIND).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
              <button onClick={exportIncidents} className="rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30">Verified export</button>
            </div>

            {sel.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-500/10 p-3 text-xs">
                <b>{sel.length} chuni hui:</b>
                <button onClick={() => bulk({ verified: true })} className="rounded-lg bg-emerald-500/30 px-3 py-1">Verify</button>
                <button onClick={() => bulk({ status: "forwarded" })} className="rounded-lg bg-amber-500/30 px-3 py-1">Forward</button>
                <button onClick={() => bulk({ status: "in_progress" })} className="rounded-lg bg-sky-500/30 px-3 py-1">In progress</button>
                <button onClick={() => bulk({ status: "resolved" })} className="rounded-lg bg-emerald-500/30 px-3 py-1">Resolve</button>
                <button onClick={() => bulk({ hidden: true })} className="rounded-lg bg-white/10 px-3 py-1">Chhupao</button>
                <button onClick={() => setSel([])} className="ml-auto text-slate-400">Clear</button>
              </div>
            )}

            {shown.map((r) => {
              const p = priority(r);
              return (
                <div key={r.id} className={`flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-sky-400/40 ${r.hidden ? "opacity-40" : ""}`}>
                  <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} className="mt-1" />
                  <button onClick={() => openReport(r.id)} className="flex min-w-0 flex-1 gap-3 text-left">
                    {r.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${API}${r.photo}`} alt="report" className="h-20 w-20 shrink-0 rounded-xl border border-white/10 object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl text-slate-600">📍</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="truncate">{r.place_name || `Cell ${r.cell_id}`}</b>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${SCLS[r.status]}`}>{SLABEL[r.status]}</span>
                        {r.verified && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">✓ Verified</span>}
                        {r.help_info && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-300">🆘 Madad bheji</span>}
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${p >= 8 ? "bg-red-500/30 text-red-200" : p >= 5 ? "bg-amber-500/30 text-amber-200" : "bg-white/10 text-slate-300"}`}>P{p}</span>
                      </div>
                      <div className="text-xs text-slate-400">{KIND[r.kind] ?? r.kind} | {r.author} | {new Date(r.created_at * 1000).toLocaleString()}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-200">{r.text}</p>
                    </div>
                  </button>
                </div>
              );
            })}
            {!shown.length && <p className="p-3 text-sm text-slate-400">Koi report nahi mili.</p>}
            <p className="text-[11px] text-slate-500">Priority = us jagah ke open reports x2 + paani bharna +3 + verified +2 + new +2 + photo +1. Report par click karke detail aur madad bhejo.</p>
          </div>
        )}

        {tab === "hotspots" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={card}>
              <div className="mb-3 font-semibold">Hotspot areas</div>
              <div className="space-y-2 text-sm">
                {hot.map((h) => {
                  const name = h.place_name || `Cell ${h.cell_id}`;
                  return (
                    <button key={h.cell_id} onClick={() => setPlace(name)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-white/10 ${place === name ? "bg-white/10" : "bg-white/5"}`}>
                      <span>{name}</span><span className="text-xs text-slate-400">{h.reports} reports | {h.reporters} users</span>
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
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">{suggest(placeRows).map((s, i) => (<li key={i}>{s}</li>))}</ul>
                </>
              ) : (<p className="text-sm text-slate-400">Kisi hotspot par click karo.</p>)}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className={card}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-400"><tr><th className="p-2">Naam</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Login</th><th className="p-2">Reports</th><th className="p-2">Joined</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-white/5">
                      <td className="p-2">{u.name}</td><td className="p-2 text-slate-400">{u.email}</td>
                      <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs ${u.role === "admin" ? "bg-amber-500/20 text-amber-300" : "bg-white/10"}`}>{u.role}</span></td>
                      <td className="p-2 text-xs text-slate-400">{u.provider}</td><td className="p-2 font-bold">{u.reports}</td>
                      <td className="whitespace-nowrap p-2 text-xs text-slate-500">{u.created_at ? new Date(u.created_at * 1000).toLocaleDateString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "feedback" && (
          <div className="grid gap-3 md:grid-cols-2">
            {fbs.length === 0 && <p className="text-slate-400">Abhi koi feedback nahi.</p>}
            {fbs.map((f) => (
              <div key={f.id} className={card}>
                <div className="flex justify-between"><b>{f.name}</b><span className="text-amber-400">{"★".repeat(f.rating)}<span className="text-slate-700">{"★".repeat(5 - f.rating)}</span></span></div>
                {f.message && <p className="mt-2 text-sm text-slate-200">{f.message}</p>}
                <div className="mt-1 text-[11px] text-slate-500">{new Date(f.created_at * 1000).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </main>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setOpenId(null)}>
          <div className="h-full w-full max-w-lg space-y-3 overflow-y-auto border-l border-white/10 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{open.place_name || `Cell ${open.cell_id}`}</h2>
                <div className="text-xs text-slate-400">{KIND[open.kind]} | {new Date(open.created_at * 1000).toLocaleString()}</div>
              </div>
              <button onClick={() => setOpenId(null)} className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20">✕</button>
            </div>

            {open.photo ? (
              <a href={`${API}${open.photo}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API}${open.photo}`} alt="Report photo" className="max-h-72 w-full rounded-xl border border-white/10 object-cover" />
              </a>
            ) : (<div className="rounded-xl bg-white/5 p-4 text-center text-sm text-slate-500">Is report mein photo nahi hai</div>)}

            <p className="rounded-xl bg-white/5 p-3 text-sm">{open.text}</p>
            <div className="text-xs text-slate-400">{open.author} | {open.user_email || "anonymous"}</div>
            <p className="text-[11px] text-slate-500">Photo user ne upload ki hai, verify hone tak pakki nahi. Galat ya aapatti-jankar photo ho toh report ko "Chhupao" karo.</p>

            <div className="flex flex-wrap items-center gap-2">
              <select value={open.status} onChange={(e) => update(open.id, { status: e.target.value })} className={`rounded-lg px-2 py-1.5 text-sm ${SCLS[open.status]}`}>
                {STATUSES.map((s) => (<option key={s} value={s} className="bg-slate-800 text-slate-100">{SLABEL[s]}</option>))}
              </select>
              <button onClick={() => update(open.id, { verified: !open.verified })} className={`rounded-lg px-3 py-1.5 text-sm ${open.verified ? "bg-emerald-500/30 text-emerald-200" : "bg-white/10 hover:bg-white/20"}`}>
                {open.verified ? "✓ Verified" : "Verify"}
              </button>
              <button onClick={() => update(open.id, { hidden: !open.hidden })} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">{open.hidden ? "Dikhao" : "Chhupao"}</button>
            </div>

            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
              <div className="mb-2 font-semibold text-emerald-300">🆘 Nazdiki madad kendra</div>
              <button onClick={findCenters} disabled={cBusy} className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50">
                {cBusy && !centers.length ? "Dhundh raha hai..." : "Hospital, police, fire station dhundo"}
              </button>
              {centers.length > 0 && (
                <>
                  <div className="mt-3 space-y-2">
                    {centers.map((c, i) => (
                      <label key={i} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white/5 p-2 text-sm">
                        <input type="checkbox" checked={picked.includes(i)} className="mt-1"
                          onChange={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} />
                        <div>
                          <div className="font-medium">{c.type}: {c.name}</div>
                          <div className="text-xs text-slate-400">{c.distance_km} km{c.phone ? ` | ${c.phone}` : " | phone nahi mila"}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={3}
                    placeholder="User ke liye sandesh (jaise: Paani bhare raaste se bachein, neeche ke kendra se sampark karein)"
                    className="mt-3 w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder-slate-500" />
                  <button onClick={sendHelp} disabled={cBusy} className="mt-2 rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-1.5 text-sm font-semibold disabled:opacity-50">
                    User ko bhejo
                  </button>
                </>
              )}
              {cMsg && <p className="mt-2 text-xs text-emerald-200">{cMsg}</p>}
              {open.help_info && <p className="mt-2 text-xs text-sky-300">Pehle bheja ja chuka hai ({new Date(open.help_info.sent_at * 1000).toLocaleString()}).</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}