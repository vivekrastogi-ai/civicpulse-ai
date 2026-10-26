"use client";

import { useEffect, useState } from "react";
import { API, api, getUser } from "../lib/api";

type Rem = { id: string; label: string; place_name: string; cell_id: number; time: string };
type Alert = { id: string; title: string; message: string };

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function ReminderWatcher() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    if (!getUser()) return;
    const run = async () => {
      try {
        const list: Rem[] = await api("/api/v1/reminders");
        const out: Alert[] = [];
        for (const r of list) {
          const res = await fetch(
            `${API}/api/v1/reminder-check?cell_id=${r.cell_id}&date=${today()}&time_hhmm=${r.time}`
          );
          if (!res.ok) continue;
          const c = await res.json();
          if (c.alert) {
            const title = `${r.label} (${r.place_name}) | ${r.time}`;
            out.push({ id: r.id, title, message: c.message });
            const key = `cp_notified_${r.id}_${today()}`;
            if ("Notification" in window && Notification.permission === "granted" && !sessionStorage.getItem(key)) {
              new Notification("CivicPulse AI: barish ka risk", { body: `${title}\n${c.message}` });
              sessionStorage.setItem(key, "1");
            }
          }
        }
        setAlerts(out);
      } catch {
        /* chup raho */
      }
    };
    run();
    const t = setInterval(run, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!alerts.length) return null;
  return (
    <div className="fixed bottom-16 right-4 z-[2500] w-80 space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className="rounded-2xl border border-red-400/40 bg-slate-900/95 p-4 text-sm shadow-2xl backdrop-blur">
          <div className="font-bold text-red-300">⚠ {a.title}</div>
          <p className="mt-1 text-slate-200">{a.message}</p>
          <button onClick={() => setAlerts((x) => x.filter((y) => y.id !== a.id))} className="mt-2 text-xs text-slate-400 hover:text-white">
            Theek hai
          </button>
        </div>
      ))}
    </div>
  );
}