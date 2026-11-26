import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/store";

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { auth.me().then(() => setState("in")).catch(() => setState("out")); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await (mode === "login" ? auth.login(username, password) : auth.register(username, password));
      setState("in");
    } catch (err: any) {
      setError(mode === "login" ? "Wrong username or password" : err.message);
    } finally { setBusy(false); }
  };

  if (state === "loading") return <div className="min-h-screen flex items-center justify-center text-white/60">Loading...</div>;
  if (state === "in") return <>{children}</>;
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
