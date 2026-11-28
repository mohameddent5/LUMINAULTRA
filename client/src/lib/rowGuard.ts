/**
 * Lower-row guard: did the tooth finder lock onto the lower arch? True when a tooth-sized, bright mask that is not one of
 * the found teeth sits above the found row, centred over it and clear of the image border.
 * Thresholds NEITHER-sourced: fitted on one positive photo (severe caries, broken upper teeth), 0 false triggers on 20 others.
 */
export type GuardMask = { x0: number; x1: number; y0: number; y1: number; cy: number; area: number; lum: number };

export function upperRowSuspect(
  teeth: GuardMask[],
  others: GuardMask[],
  big: { x0: number; x1: number },
  bigH: number,
  lumThreshold: number,
  imgW: number,
  imgH: number,
): boolean {
  if (teeth.length < 1) return false;
  const medArea = [...teeth].map((t) => t.area).sort((x, y) => x - y)[Math.floor(teeth.length / 2)];
  const rowTop = Math.min(...teeth.map((t) => t.y0));
  const rowX0 = Math.min(...teeth.map((t) => t.x0));
  const rowX1 = Math.max(...teeth.map((t) => t.x1));
  return others.some((k) => {
    const mx = (k.x0 + k.x1) / 2;
    return k.x0 > 0 && k.y0 > 0 && k.x1 < imgW - 1 && k.y1 < imgH - 1 && mx > rowX0 && mx < rowX1 &&
      k.area > 0.5 * medArea && k.area < 4 * medArea && k.lum > lumThreshold &&
      k.cy < rowTop - 0.3 * bigH && k.y1 < rowTop + 0.2 * bigH && (k.x1 - k.x0) < 2.5 * (big.x1 - big.x0);
  });
}
