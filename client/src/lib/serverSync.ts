// Keeps the app's localStorage collections in step with the server, per signed-in user.
// The pages keep reading and writing localStorage as before; every write is mirrored to the server,
// and sign-in loads the user's server copy first. localStorage is a cache, the server is the record.
import { SYNCED_KEYS } from "@shared/schema";

const KEYS: readonly string[] = SYNCED_KEYS;
const OWNER_KEY = "lumina.owner";
const timers = new Map<string, number>();
let installed = false;
let failures = 0;

const rawSet = Storage.prototype.setItem;
const rawRemove = Storage.prototype.removeItem;

async function push(key: string) {
  const raw = localStorage.getItem(key);
  try {
    const res = raw === null
      ? await fetch(`/api/data/${key}`, { method: "DELETE", credentials: "include" })
      : await fetch(`/api/data/${key}`, {
          method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: raw,
        });
    if (!res.ok) throw new Error(String(res.status));
    failures = 0;
    window.dispatchEvent(new CustomEvent("lumina-sync", { detail: { ok: true } }));
  } catch {
    failures++;
    window.dispatchEvent(new CustomEvent("lumina-sync", { detail: { ok: false, failures } }));
  }
}

function schedule(key: string) {
  window.clearTimeout(timers.get(key));
  timers.set(key, window.setTimeout(() => push(key), 400));
}

export function installWriteThrough() {
  if (installed) return;
  installed = true;
  Storage.prototype.setItem = function (k: string, v: string) {
    rawSet.call(this, k, v);
    if (this === window.localStorage && KEYS.includes(k)) schedule(k);
  };
  Storage.prototype.removeItem = function (k: string) {
    rawRemove.call(this, k);
    if (this === window.localStorage && KEYS.includes(k)) schedule(k);
  };
}

/** Load the user's server data into localStorage. Data from a different account is wiped first. */
export async function hydrate(userId: string) {
  const owner = localStorage.getItem(OWNER_KEY);
  if (owner && owner !== userId) KEYS.forEach((k) => rawRemove.call(localStorage, k));
  const res = await fetch("/api/data", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load your data");
  const server: Record<string, unknown> = await res.json();
  for (const k of KEYS) {
    if (k in server) {
      rawSet.call(localStorage, k, JSON.stringify(server[k]));
    } else if (localStorage.getItem(k) !== null) {
      // First sign-in on a browser that already holds pre-account data: move it to the account.
      await push(k);
    }
  }
  rawSet.call(localStorage, OWNER_KEY, userId);
}

/** Wipe local copies on sign-out so the next person on this device sees nothing. */
export function clearLocal() {
  KEYS.forEach((k) => rawRemove.call(localStorage, k));
  rawRemove.call(localStorage, OWNER_KEY);
}

export async function flushPending() {
  const pending = Array.from(timers.keys());
  timers.forEach((t) => window.clearTimeout(t));
  timers.clear();
  await Promise.all(pending.map(push));
}
