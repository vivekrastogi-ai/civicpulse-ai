"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getUser, type User } from "../lib/api";

const ITEMS = [
  { href: "/profile", label: "My Profile", icon: "👤" },
  { href: "/", label: "Risk Map", icon: "🗺️" },
  { href: "/premium", label: "Premium Lab 👑", icon: "👑" },
  { href: "/reminders", label: "Commute Reminder", icon: "⏰" },
  { href: "/replay", label: "Rain Replay", icon: "🎞️" },
  { href: "/stress", label: "Rain Stress Test", icon: "🌧️" },
  { href: "/route", label: "Safe Route", icon: "🧭" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/my-reports", label: "My Reports", icon: "📝" },
  { href: "/helpline", label: "Helpline & Guide", icon: "🆘" },
  { href: "/model", label: "Model & Data", icon: "🧠" },
  { href: "/about", label: "About", icon: "ℹ️" },
];

export default function UserMenu({ onGuide }: { onGuide?: () => void }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    setUser(getUser());
  }, []);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 hover:bg-white/20"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-500 text-sm font-bold text-white">
          {initial}
        </span>
        <span className="hidden text-sm md:inline">{user?.name}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[1500] mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="font-semibold">{user?.name}</div>
            <div className="truncate text-xs text-slate-400">{user?.email}</div>
            <div className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-slate-300">
              {user?.role}
            </div>
          </div>
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-white/10"
            >
              <span>{i.icon}</span> {i.label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-amber-300 hover:bg-white/10"
            >
              <span>🛡️</span> Admin Dashboard
            </Link>
          )}
          {onGuide && (
            <button
              onClick={() => {
                setOpen(false);
                onGuide();
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10"
            >
              <span>❓</span> Guide dobara dekho
            </button>
          )}
          <button
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
            className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      )}
    </div>
  );
}