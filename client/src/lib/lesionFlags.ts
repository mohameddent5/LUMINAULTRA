import type { TeethEngine } from "./smileEngine";

/**
 * "Possible caries" flag layer. Colour only: dark, brown or grey patches inside a tooth mask.
 * It cannot tell caries from stain, calculus, a dark restoration, a shadow or an amalgam.
 * It is a prompt to look, never a diagnosis. Dev-set only: tuned by eye on about ten
 * unverified photos, no clinical ground truth, accuracy unknown.
 */
export type ToothFlag = { id: number; share: number; level: "possible" | "marked" };

export function lesionFlags(e: TeethEngine | null): ToothFlag[] {
  if (!e) return [];
  const out: ToothFlag[] = [];
  for (const t of e.teeth) {
    const d = t.own.data;
    const lum: number[] = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    if (lum.length < 80) continue;
    const s = [...lum].sort((a, b) => a - b);
    const ref = s[Math.floor(s.length * 0.75)];
    let n = 0;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const R = d[i], G = d[i + 1], B = d[i + 2];
      const l = 0.299 * R + 0.587 * G + 0.114 * B;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const sat = mx ? (mx - mn) / mx : 0;
      n++;
      const veryDark = l < ref * 0.45;
      const brown = R > G && G > B && sat > 0.5 && l < ref * 0.7;
      if (veryDark || brown) dark++;
    }
    const share = dark / n;
    if (share >= 0.12) out.push({ id: t.id, share, level: share >= 0.3 ? "marked" : "possible" });
  }
  return out;
}
