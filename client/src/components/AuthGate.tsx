import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearLocal, flushPending, hydrate, installWriteThrough } from "@/lib/serverSync";

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method, credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.message || res.statusText), { status: res.status });
  return j;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncBad, setSyncBad] = useState(false);

  const enter = async (user: { id: string }) => {
    await hydrate(user.id);
    installWriteThrough();
    setState("in");
  };

  useEffect(() => {
    api("GET", "/api/auth/me").then(enter).catch(() => setState("out"));
    const onSync = (e: Event) => setSyncBad(!(e as CustomEvent).detail.ok);
    window.addEventListener("lumina-sync", onSync);
    return () => window.removeEventListener("lumina-sync", onSync);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const user = await api("POST", mode === "login" ? "/api/auth/login" : "/api/auth/register", { username, password });
      await enter(user);
    } catch (err: any) {
      setError(mode === "login" ? "Wrong username or password" : err.message);
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    await flushPending();
    await api("POST", "/api/auth/logout", {}).catch(() => {});
    clearLocal();
    window.location.reload();
  };

  if (state === "loading") return <div className="min-h-screen flex items-center justify-center text-white/60">Loading...</div>;
  if (state === "in") {
    return (
      <>
        {children}
        {syncBad && (
          <div className="fixed bottom-3 left-3 z-[100] rounded bg-red-900/90 text-red-100 text-xs px-3 py-2">
            Changes are not saving to the server. Check your connection; do not clear this browser's data yet.
          </div>
        )}
        <button onClick={signOut} className="fixed top-1 right-1 z-[100] text-xs px-2 py-1 text-white/70 hover:text-white underline">
          Sign out
        </button>
      </>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-accent/5 p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 bg-card/50 border border-white/10 rounded-xl p-6">
        <h1 className="font-heading text-xl font-bold text-white">Lumina Ultra</h1>
        <p className="text-sm text-white/60">{mode === "login" ? "Sign in to your clinic account" : "Create your clinic account"}</p>
        <Input placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Input type="password" placeholder="Password (8+ characters)" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !username || !password}>{mode === "login" ? "Sign in" : "Create account"}</Button>
        <button type="button" className="text-xs text-white/60 underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "New clinic? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
