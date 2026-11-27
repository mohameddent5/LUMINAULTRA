import type { TeethEngine } from "./smileEngine";

/**
 * Braces / brackets guess. Orthodontic hardware (metal brackets, wires, coloured elastics) sits inside the tooth
 * masks as sharp edges or blue-ish pixels, which sound enamel does not have. Per tooth we count the share of
 * interior pixels with a strong local luminance step or a blue cast. If most teeth carry it, we say braces.
 * NEITHER literature nor his labels: thresholds tuned by eye on a handful of photos, one braces example.
 */
export function tooth_hardware(t: TeethEngine["teeth"][number]): number {
  const { data, width: w, height: h } = t.own;
  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  let n = 0;
  let hw = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0 || data[i + 7] === 0 || data[i + w * 4 + 3] === 0 || data[i - 1] === 0 || data[i - w * 4 + 3] === 0) continue;
      n++;
      const step = Math.abs(lum(i) - lum(i + 4)) + Math.abs(lum(i) - lum(i + w * 4));
      const R = data[i], G = data[i + 1], B = data[i + 2];
      if (step > 70 || (B > R + 30 && B > G + 10)) hw++;
    }
  }
  return n < 80 ? 0 : hw / n;
}

export function bracesSuspected(e: TeethEngine | null): boolean {
  if (!e || e.teeth.length < 3) return false;
  const shares = e.teeth.map(tooth_hardware);
  const hit = shares.filter((s) => s >= 0.08).length;
  return hit >= 3 && hit / shares.length >= 0.4;
}
