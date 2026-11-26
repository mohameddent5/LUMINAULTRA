// Server-backed data layer. Replaces the old localStorage keys
// (patientArchive, capturedSnapshots, treatmentPlans, clinicSettings).
export interface PatientAnalysis {
  id: string;
  date: string;
  patientName: string;
  harmony: number;
  measurements: Record<string, number>;
  notes: string;
  clinicalNotes?: string;
  visitHistory?: { date: string; harmony: number; notes: string }[];
}
export interface CapturedSnapshot {
  id: string;
  date: string;
  time: string;
  image: string;
  analysis?: any;
}
export interface SavedPlan { id: string; date: string; measurements: Record<string, number>; harmony: number }

async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const err: any = new Error(j.message || res.statusText);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const d = (iso: string) => new Date(iso).toLocaleDateString();
const toPatient = (r: any): PatientAnalysis => ({
  id: r.id, date: d(r.createdAt), patientName: r.patientName, harmony: r.harmony,
  measurements: r.measurements ?? {}, notes: r.notes ?? "", clinicalNotes: r.clinicalNotes ?? undefined,
  visitHistory: r.visitHistory ?? [],
});
const toSnap = (r: any): CapturedSnapshot => ({
  id: r.id, date: d(r.createdAt), time: new Date(r.createdAt).toLocaleTimeString(), image: r.image, analysis: r.analysis,
});
const toPlan = (r: any): SavedPlan => ({ id: r.id, date: d(r.createdAt), measurements: r.measurements, harmony: r.harmony });

export const auth = {
  me: () => api<{ id: string; username: string }>("GET", "/api/auth/me"),
  login: (username: string, password: string) => api("POST", "/api/auth/login", { username, password }),
  register: (username: string, password: string) => api("POST", "/api/auth/register", { username, password }),
  logout: () => api("POST", "/api/auth/logout", {}),
};

export const patientsApi = {
  list: async () => (await api<any[]>("GET", "/api/patients")).map(toPatient),
  create: async (p: { patientName: string; harmony: number; measurements: Record<string, number>; notes?: string }) =>
    toPatient(await api("POST", "/api/patients", p)),
  update: async (id: string, p: Partial<{ clinicalNotes: string; notes: string }>) => toPatient(await api("PATCH", `/api/patients/${id}`, p)),
  remove: (id: string) => api("DELETE", `/api/patients/${id}`),
};
export const snapshotsApi = {
  list: async () => (await api<any[]>("GET", "/api/snapshots")).map(toSnap),
  create: async (image: string, analysis: unknown, patientId?: string) =>
    toSnap(await api("POST", "/api/snapshots", { image, analysis, patientId })),
  remove: (id: string) => api("DELETE", `/api/snapshots/${id}`),
};
export const plansApi = {
  list: async () => (await api<any[]>("GET", "/api/plans")).map(toPlan),
  create: async (measurements: Record<string, number>, harmony: number, patientId?: string) =>
    toPlan(await api("POST", "/api/plans", { measurements, harmony, patientId })),
};
export const settingsApi = {
  get: () => api<Record<string, any>>("GET", "/api/settings"),
  save: (data: Record<string, unknown>) => api("PUT", "/api/settings", data),
};

/** Legacy browser data from before the database existed. */
export const legacy = {
  read() {
    const j = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
    return { patients: j("patientArchive") ?? [], snapshots: j("capturedSnapshots") ?? [], plans: j("treatmentPlans") ?? [], settings: j("clinicSettings") };
  },
  hasData() { const l = legacy.read(); return l.patients.length + l.snapshots.length + l.plans.length > 0; },
  async importAll() {
    const r = await api("POST", "/api/import-local", legacy.read());
    ["patientArchive", "capturedSnapshots", "treatmentPlans"].forEach((k) => localStorage.removeItem(k));
    return r;
  },
};
