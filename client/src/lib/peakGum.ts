/**
 * Gingival display tracker for the live camera. Ratios only, never mm.
 * Port of tools/eval/peak_gum.py. Dev-set only: gates tuned on four consented clips,
 * no dentist ground truth for the ratio or for which frame is the "most natural" smile.
 */
export type LM = { x: number; y: number }[];

export type FrameMeasure = {
  ok: boolean;
  ratio: number; // gum rows above the first tooth run / height of that run, central band
  ear: number; // smaller eye aspect ratio, below about 0.12 means eyes shut
  roll: number; // degrees, eye line vs horizontal
  yaw: number; // nose offset from eye midpoint, as a share of eye distance
  move: number; // mean brightness change vs previous frame (0-255)
};

export const NATURAL = { ear: 0.12, roll: 8, yaw: 0.12, move: 6 };

export function measureFrame(c: HTMLCanvasElement, f: LM, prev: Uint8Array | null): { m: FrameMeasure; small: Uint8Array } {
  const w = c.width;
  const h = c.height;
  const P = (i: number) => ({ x: f[i].x * w, y: f[i].y * h });
  // movement on a tiny grey copy
  const sm = document.createElement("canvas");
  sm.width = 48;
  sm.height = 64;
  sm.getContext("2d")!.drawImage(c, 0, 0, 48, 64);
  const d = sm.getContext("2d")!.getImageData(0, 0, 48, 64).data;
  const small = new Uint8Array(48 * 64);
  for (let i = 0; i < small.length; i++) small[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let move = 0;
  if (prev) {
    for (let i = 0; i < small.length; i++) move += Math.abs(small[i] - prev[i]);
    move /= small.length;
  }
  const ear = (a: number, b: number, l: number, r: number) => Math.abs(P(a).y - P(b).y) / Math.max(1e-6, Math.abs(P(l).x - P(r).x));
  const earMin = Math.min(ear(159, 145, 33, 133), ear(386, 374, 362, 263));
  const er = P(33);
  const el = P(263);
  const roll = (Math.atan2(el.y - er.y, el.x - er.x) * 180) / Math.PI;
  const fw = Math.abs(el.x - er.x) || 1;
  const yaw = (P(1).x - (er.x + el.x) / 2) / fw;
  const top = P(13);
  const bot = P(14);
  const mw = Math.hypot(P(291).x - P(61).x, P(291).y - P(61).y);
  const cx = (top.x + bot.x) / 2;
  const x0 = Math.max(0, Math.floor(cx - 0.12 * mw));
  const x1 = Math.min(w, Math.floor(cx + 0.12 * mw));
  const y0 = Math.max(0, Math.floor(top.y));
  const y1 = Math.min(h, Math.floor(bot.y));
  const bad = { ok: false, ratio: 0, ear: earMin, roll, yaw, move };
  if (y1 - y0 < 6 || x1 - x0 < 6) return { m: bad, small };
  const px = c.getContext("2d")!.getImageData(x0, y0, x1 - x0, y1 - y0);
  const bw = x1 - x0;
  const bh = y1 - y0;
  const toothRow = new Uint8Array(bh);
  const gumRow = new Uint8Array(bh);
  for (let y = 0; y < bh; y++) {
    let t = 0;
    let g = 0;
    for (let x = 0; x < bw; x++) {
      const i = (y * bw + x) * 4;
      const R = px.data[i];
      const G = px.data[i + 1];
      const B = px.data[i + 2];
      const mx = Math.max(R, G, B);
      const mn = Math.min(R, G, B);
      const S = mx ? ((mx - mn) / mx) * 255 : 0;
      if (S < 95 && mx > 120 && R - G < 45) t++;
      else if (R - G >= 45 && S >= 70 && mx > 110) g++;
    }
    toothRow[y] = t / bw > 0.5 ? 1 : 0;
    gumRow[y] = g / bw > 0.5 ? 1 : 0;
  }
  let first = -1;
  for (let y = 0; y < bh; y++) if (toothRow[y]) { first = y; break; }
  if (first < 0) return { m: bad, small };
  let last = first;
  let n = 0;
  for (let y = first; y < bh; y++) {
    if (!toothRow[y]) continue;
    if (y - last <= 3) { last = y; n++; } else break;
  }
  if (n < 3) return { m: bad, small };
  const th = last - first + 1;
  let gh = 0;
  for (let y = 0; y < first; y++) gh += gumRow[y];
  return { m: { ok: true, ratio: gh / th, ear: earMin, roll, yaw, move }, small };
}

export const isNatural = (m: FrameMeasure) =>
  m.ok && m.move < NATURAL.move && m.ear > NATURAL.ear && Math.abs(m.roll) < NATURAL.roll && Math.abs(m.yaw) < NATURAL.yaw;

/** Keeps the best natural frame (by 5-frame median ratio) and says when the peak has passed. */
export class PeakTracker<T> {
  private ratios: number[] = [];
  private best: { ratio: number; frame: T; idx: number } | null = null;
  private n = 0;
  natural = 0;
  add(m: FrameMeasure, frame: () => T) {
    const idx = this.n++;
    this.ratios.push(m.ok ? m.ratio : NaN);
    if (!isNatural(m)) return;
    this.natural++;
    const win = this.ratios.slice(-5).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    if (win.length < 3) return;
    const med = win[Math.floor(win.length / 2)];
    if (!this.best || med > this.best.ratio) this.best = { ratio: med, frame: frame(), idx };
  }
  /** at least 8 natural frames and no new peak in the last 6 frames */
  get done() {
    return !!this.best && this.natural >= 8 && this.n - 1 - this.best.idx >= 6;
  }
  get pick() {
    return this.best;
  }
  get range(): [number, number] | null {
    const v = this.ratios.filter((x) => !Number.isNaN(x));
    return v.length ? [Math.min(...v), Math.max(...v)] : null;
  }
}
