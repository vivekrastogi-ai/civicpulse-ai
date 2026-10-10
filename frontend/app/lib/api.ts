export const API = "http://127.0.0.1:8000";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  tour_done: boolean;
};

export const getToken = (): string | null =>
  typeof window === "undefined" ? null : localStorage.getItem("cp_token");

export const getUser = (): User | null => {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("cp_user") || "null");
  } catch {
    return null;
  }
};

export const setSession = (token: string, user: User) => {
  localStorage.setItem("cp_token", token);
  localStorage.setItem("cp_user", JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem("cp_token");
  localStorage.removeItem("cp_user");
  sessionStorage.removeItem("cp_welcomed");
};

export const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t
    ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
    : { "Content-Type": "application/json" };
};

export async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data.detail === "string" ? data.detail : "Kuch galat ho gaya";
    const err: Error & { status?: number } = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}