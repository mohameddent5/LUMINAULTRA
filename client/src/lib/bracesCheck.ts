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

/** Blue-cast share of the non-mask pixels inside a tooth's box (elastics and brackets show up as holes in the mask). */
export function box_blue(e: TeethEngine, t: TeethEngine["teeth"][number]): number {
  const er = e.erased;
  let n = 0;
  let b = 0;
  for (let y = 0; y < t.bh; y++) {
    for (let x = 0; x < t.bw; x++) {
      if (t.own.data[(y * t.bw + x) * 4 + 3] > 0) continue;
      const X = t.bx + x, Y = t.by + y;
      if (X < 0 || Y < 0 || X >= er.width || Y >= er.height) continue;
      const i = (Y * er.width + X) * 4;
      n++;
      if (er.data[i + 2] > er.data[i] + 30 && er.data[i + 2] > er.data[i + 1] + 10) b++;
    }
  }
  return n < 80 ? 0 : b / n;
}

export function bracesSuspected(e: TeethEngine | null): boolean {
  if (!e || e.teeth.length < 3) return false;
  const shares = e.teeth.map(tooth_hardware);
  const hit = shares.filter((s) => s >= 0.12).length;
  const blue = e.teeth.map((t) => box_blue(e, t)).filter((x) => x >= 0.07).length;
  return (hit >= 3 && hit / shares.length >= 0.4) || (blue >= 3 && blue / shares.length >= 0.4);
}
