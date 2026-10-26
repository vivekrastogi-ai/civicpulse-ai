"use client";

import Link from "next/link";
import UserMenu from "./UserMenu";

export default function NavBar() {
  return (
    <header className="sticky top-0 z-[1100] flex items-center gap-3 border-b border-white/10 bg-slate-900/90 px-4 py-3 backdrop-blur">
      <Link href="/" className="mr-2">
        <div className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-xl font-extrabold text-transparent">
          CivicPulse AI
        </div>
      </Link>
      <Link href="/" className="rounded-full bg-white/5 px-3 py-1 text-sm text-slate-300 hover:bg-white/10">
        ← Risk Map
      </Link>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </header>
  );
}