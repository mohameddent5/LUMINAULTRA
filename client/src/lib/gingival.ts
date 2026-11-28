/**
 * Gingival margin by colour step: down the middle of a tooth box, the Lab a* (redness) profile drops from gum to tooth.
 * Checked on one hand-labelled photo only (ex6, 7 teeth): median error 8 to 9% of box height against 16% for the box top.
 * One photo cannot support a leave-one-out check, so this is used as a cross-check on the box top, never as the only value.
 */
const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const aStar = (r: number, g: number, b: number) => {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  return 500 * (f(X) - f(Y));
};
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

/** Returns the image y of the gum-to-tooth step for a tooth box (canvas pixels), or null when the profile is flat. */
export function gingivalTop(cv: HTMLCanvasElement, bx: number, bw: number, by: number, bh: number): number | null {
  const x0 = Math.max(0, Math.round(bx + bw * 0.25)), x1 = Math.min(cv.width, Math.round(bx + bw * 0.75));
  const y0 = Math.max(0, Math.round(by - 0.25 * bh)), y1 = Math.min(cv.height, Math.round(by + 0.7 * bh));
  if (x1 - x0 < 3 || y1 - y0 < 8) return null;
  const d = cv.getContext("2d")!.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const w = x1 - x0, rows: number[] = [];
  for (let y = 0; y < y1 - y0; y++) {
    const col: number[] = [];
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; col.push(aStar(d[i], d[i + 1], d[i + 2])); }
    rows.push(pct(col, 0.5));
  }
  const sm = rows.map((_, i) => { let s = 0, n = 0; for (let k = -2; k <= 2; k++) if (rows[i + k] !== undefined) { s += rows[i + k]; n++; } return s / n; });
  const lo = pct(sm, 0.1), hi = pct(sm, 0.9);
  if (hi - lo < 4) return null; // no gum-to-tooth contrast
  const thr = lo + 0.4 * (hi - lo);
  let seen = false;
  for (let i = 0; i < sm.length; i++) {
    if (sm[i] >= thr) seen = true;
    else if (seen && i > 3) return y0 + i;
  }
  return null;
}
