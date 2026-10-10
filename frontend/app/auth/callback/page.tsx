"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { API, setSession } from "../../lib/api";

export default function OAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
      router.replace("/login?error=Login%20nahi%20ho%20paya");
      return;
    }
    fetch(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((user) => {
        setSession(token, user);
        sessionStorage.removeItem("cp_welcomed");
        router.replace("/");
      })
      .catch(() => router.replace("/login?error=Login%20nahi%20ho%20paya"));
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
      Login ho raha hai...
    </div>
  );
}