// Temporal filtering for live face-landmark measurements.
// Raw per-frame landmarks jitter by a few pixels; derived values (ratios, angles) amplify it.
// 1) One Euro filter on every landmark: strong smoothing when still, low lag when moving.
// 2) Rolling window per measurement: median + stability score (used as real confidence).

export interface LandmarkPoint { x: number; y: number; z?: number; visibility?: number }

class LowPass {
  private last: number | null = null;
  filter(v: number, alpha: number) {
    this.last = this.last === null ? v : alpha * v + (1 - alpha) * this.last;
    return this.last;
  }
  get value() { return this.last; }
}

const alphaFor = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | null = null;
  constructor(private minCutoff = 1.2, private beta = 12, private dCutoff = 1.0) {}
  filter(v: number, tMs: number) {
    if (this.lastT === null) { this.lastT = tMs; return this.x.filter(v, 1); }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-3);
    this.lastT = tMs;
    const prev = this.x.value ?? v;
    const deriv = this.dx.filter((v - prev) / dt, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(deriv);
    return this.x.filter(v, alphaFor(cutoff, dt));
  }
}

/** Smooths a whole landmark array. Landmark coords are normalized (0..1), hence the large beta. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][] = [];
  private lastT = 0;
  constructor(private minCutoff = 1.2, private beta = 12) {}
  reset() { this.filters = []; this.lastT = 0; }
  smooth(landmarks: LandmarkPoint[], tMs: number): LandmarkPoint[] {
    // New face after a gap: start over so the old pose does not drag the estimate.
    if (this.lastT && tMs - this.lastT > 500) this.reset();
    this.lastT = tMs;
    if (this.filters.length !== landmarks.length) {
      this.filters = landmarks.map(() => [0, 1, 2].map(() => new OneEuroFilter(this.minCutoff, this.beta)));
    }
    return landmarks.map((p, i) => ({
      ...p,
      x: this.filters[i][0].filter(p.x, tMs),
      y: this.filters[i][1].filter(p.y, tMs),
      z: p.z === undefined ? undefined : this.filters[i][2].filter(p.z, tMs),
    }));
  }
}

export function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Rolling-window stabilizer for scalar measurements.
 * Output is the window median (rejects single-frame spikes). Stability is 0..100:
 * 100 when the window's spread is small relative to `tolerance`, falling to 0 as it grows.
 */
export class MeasurementStabilizer {
  private win = new Map<string, number[]>();
  constructor(private size = 15) {}
  reset() { this.win.clear(); }
  push(key: string, v: number) {
    if (!Number.isFinite(v)) return;
    const w = this.win.get(key) ?? [];
    w.push(v);
    if (w.length > this.size) w.shift();
    this.win.set(key, w);
  }
  count(key: string) { return this.win.get(key)?.length ?? 0; }
  value(key: string): number | undefined {
    const w = this.win.get(key);
    return w && w.length ? median(w) : undefined;
  }
  /** tolerance = spread (median absolute deviation) at which confidence reaches 0, in the measurement's units. */
  stability(key: string, tolerance: number): number {
    const w = this.win.get(key);
    if (!w || w.length < Math.min(5, this.size)) return 0;
    const m = median(w);
    const mad = median(w.map((v) => Math.abs(v - m)));
    return Math.round(Math.max(0, 1 - mad / tolerance) * 100);
  }
}

/** Whether the face is usable for measurement: roughly frontal, not tiny, not cut off. */
export function faceQuality(lm: LandmarkPoint[]): { ok: boolean; reason?: string } {
  if (lm.length < 468) return { ok: false, reason: "Face not fully detected" };
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of lm) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (minX < 0.01 || maxX > 0.99 || minY < 0.01 || maxY > 0.99) return { ok: false, reason: "Face is cut off, move back" };
  if (maxY - minY < 0.3) return { ok: false, reason: "Move closer" };
  // Yaw proxy: nose tip (1) should sit between the cheek outer points (234, 454).
  const l = lm[234], r = lm[454], n = lm[1];
  const w = Math.abs(r.x - l.x) || 1e-6;
  const yaw = Math.abs((n.x - (l.x + r.x) / 2) / w);
  if (yaw > 0.12) return { ok: false, reason: "Face the camera straight on" };
  // Roll proxy: eye line tilt.
  const roll = Math.abs(Math.atan2(r.y - l.y, r.x - l.x)) * 180 / Math.PI;
  if (roll > 12 && roll < 168) return { ok: false, reason: "Keep your head level" };
  return { ok: true };
}
