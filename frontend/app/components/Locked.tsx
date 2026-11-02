import Link from "next/link";

export default function Locked({ text }: { text: string }) {
  if (!text.includes("Premium")) {
    return <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{text}</div>;
  }
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-amber-400/30 bg-gradient-to-b from-amber-400/10 to-transparent p-8 text-center">
      <div className="text-5xl">👑</div>
      <h2 className="mt-2 text-2xl font-extrabold">Ye Premium feature hai</h2>
      <p className="mt-1 text-sm text-slate-400">Is feature ko use karne ke liye Premium lo.</p>
      <Link href="/premium" className="mt-5 inline-block rounded-full bg-gradient-to-r from-amber-400 to-rose-400 px-8 py-2.5 font-bold text-slate-900 hover:scale-105">
        Premium dekho
      </Link>
    </div>
  );
}