"use client";

import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function speak(text: string, lang = "en-IN") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  synth.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export default function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const [lang, setLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const [msg, setMsg] = useState("");
  const rec = useRef<any>(null);

  useEffect(() => {
    const w = window as any;
    setOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const start = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    stopSpeaking();
    const r = new SR();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onstart = () => { setOn(true); setMsg("Listening..."); };
    r.onend = () => setOn(false);
    r.onerror = (e: any) => {
      setOn(false);
      setMsg(e.error === "not-allowed" ? "Mic permission blocked. Allow it in the browser." : "Could not hear you, try again.");
    };
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript as string;
      setMsg("");
      onText(t);
    };
    rec.current = r;
    r.start();
  };

  const stop = () => rec.current?.stop();

  if (!ok) return <span className="text-[11px] text-slate-500">Voice needs Chrome or Edge</span>;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={on ? stop : start}
        title="Speak your question"
        className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${
          on ? "animate-pulse bg-red-500" : "bg-white/10 hover:bg-white/20"
        }`}
      >
        🎤
      </button>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as "en-IN" | "hi-IN")}
        className="rounded-lg bg-slate-800 px-1 py-1 text-[11px]"
      >
        <option value="en-IN">English</option>
        <option value="hi-IN">हिन्दी</option>
      </select>
      {msg && <span className="text-[11px] text-slate-400">{msg}</span>}
    </div>
  );
}