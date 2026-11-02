"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../components/NavBar";
import { API, api, getUser, setSession } from "../lib/api";

type P = {
  id: string; name: string; email: string; role: string; provider: string; bio: string; city: string;
  phone: string; linkedin: string; github: string; avatar: string | null; joined: number;
  reports: number; verified: number; resolved_total?: number; open_total?: number;
};

const inp = "w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder-slate-500 focus:ring-1 focus:ring-sky-400";

export default function Profile() {
  const router = useRouter();
  const [p, setP] = useState<P | null>(null);
  const [f, setF] = useState({ name: "", bio: "", city: "", phone: "", linkedin: "", github: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const fill = (d: P) => {
    setP(d);
    setF({ name: d.name, bio: d.bio, city: d.city, phone: d.phone, linkedin: d.linkedin, github: d.github });
  };

  useEffect(() => {
    if (!getUser()) { router.replace("/login"); return; }
    api("/api/v1/profile").then(fill).catch((e) => setMsg(e.message));
  }, [router]);

  const save = (extra: object = {}) => {
    setBusy(true); setMsg("");
    return api("/api/v1/profile", { method: "PUT", body: JSON.stringify({ ...f, ...extra }) })
      .then((d: P) => {
        fill(d);
        const tok = localStorage.getItem("cp_token");
        const u = getUser();
        if (tok && u) setSession(tok, { ...u, name: d.name });
        setMsg("Profile save ho gayi.");
      })
      .catch((e) => setMsg(e.message))
      .finally(() => setBusy(false));
  };

  const pickPhoto = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const t = localStorage.getItem("cp_token");
    const r = await fetch(`${API}/api/v1/uploads`, { method: "POST", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
    const j = await r.json();
    if (!r.ok) { setMsg(typeof j.detail === "string" ? j.detail : "Photo upload nahi hui"); return; }
    save({ avatar: j.url });
  };

  if (!p) return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">{msg || "Load ho raha hai..."}</div>;
  const isAdmin = p.role === "admin";
  const stats = isAdmin
    ? [["Kholi hui reports", p.open_total ?? 0], ["Resolved (total)", p.resolved_total ?? 0], ["Meri reports", p.reports]]
    : [["Meri reports", p.reports], ["Verified", p.verified], ["Login", p.provider]];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-indigo-950 p-6">
          <div className="pointer-events-none absolute -top-20 right-10 h-56 w-80 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-5">
            <label className="group relative cursor-pointer">
              <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-slate-900 bg-gradient-to-br from-sky-500 to-violet-500 ring-2 ring-sky-400/50">
                {p.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${API}${p.avatar}`} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-5xl font-black text-white/90">{p.name.charAt(0).toUpperCase()}</div>
                )}
              </div>
              <div className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/60 text-xs group-hover:flex">📷 Badlo</div>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-extrabold">{p.name}</h1>
                <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${isAdmin ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/20 text-sky-300"}`}>{p.role.toUpperCase()}</span>
              </div>
              <div className="text-sm text-slate-400">{p.email}{p.city ? ` | ${p.city}` : ""}</div>
              <p className="mt-2 text-sm text-slate-300">{p.bio || "Abhi koi bio nahi. Neeche apne baare mein likho."}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {p.linkedin && <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#0a66c2] px-3 py-1">in LinkedIn</a>}
                {p.github && <a href={p.github} target="_blank" rel="noopener noreferrer" className="rounded-full bg-slate-700 px-3 py-1">GitHub</a>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {stats.map(([l, v]) => (
            <div key={l as string} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-3xl font-black text-transparent">{v}</div>
              <div className="text-xs text-slate-400">{l}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-semibold">About me (edit karo)</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inp} placeholder="Naam" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className={inp} placeholder="Sheher / ilaaka" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            <input className={inp} placeholder="Phone (optional, kisi ko dikhega nahi)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <input className={inp} placeholder="LinkedIn link (https://...)" value={f.linkedin} onChange={(e) => setF({ ...f, linkedin: e.target.value })} />
            <input className={inp} placeholder="GitHub link (https://...)" value={f.github} onChange={(e) => setF({ ...f, github: e.target.value })} />
          </div>
          <textarea className={inp} rows={4} maxLength={300} placeholder="Apne baare mein kuch likho (300 akshar tak)" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
          <div className="flex items-center gap-3">
            <button onClick={() => save()} disabled={busy} className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-2 font-semibold disabled:opacity-50">Save karo</button>
            <span className="text-sm text-sky-200">{msg}</span>
          </div>
          <p className="text-[11px] text-slate-500">Phone sirf aapko dikhta hai. Bio, naam, city aur links profile par dikhte hain.</p>
        </div>
      </main>
    </div>
  );
}