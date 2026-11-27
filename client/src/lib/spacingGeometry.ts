import type { TeethEngine } from "./smileEngine";

/**
 * Gaps between neighbouring upper teeth, as a share of the median tooth width. Geometry only, measured on his photos,
 * NOT validated and NOT from a paper (NEITHER-sourced thresholds): never a diagnosis.
 */
export type GapReading = { between: [number, number]; gap: number };

export function upperGaps(e: TeethEngine | null): GapReading[] {
  if (!e || e.teeth.length < 4) return [];
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const mh = med(e.teeth.map((t) => t.bh));
  const mc = med(e.teeth.map((t) => t.by + t.bh / 2));
  const row = e.teeth.filter((t) => Math.abs(t.by + t.bh / 2 - mc) < 0.6 * mh).sort((a, b) => a.bx - b.bx);
  if (row.length < 4) return [];
  const mw = med(row.map((t) => t.bw));
  const out: GapReading[] = [];
  for (let i = 0; i + 1 < row.length; i++) out.push({ between: [row[i].id, row[i + 1].id], gap: (row[i + 1].bx - (row[i].bx + row[i].bw)) / mw });
  return out;
}

export type SpacingNote = { kind: "space" | "missing"; between: [number, number]; extra: number };

/**
 * Spacing is read against the row's own median gap (boxes of a curved arch overlap, so absolute gaps are negative:
 * -6 to -29% of tooth width on his 5 plain photos ex2, ex26, ex27, be3c1457 and the median offset stayed within 12%).
 * A pair more than 30% of a tooth width wider than the median gap is "possible spacing"; more than 70% is "possible
 * missing tooth". No photo of his has either yet, so the thresholds are untested NEITHER-sourced guesses.
 */
export function spacingNotes(e: TeethEngine | null): SpacingNote[] {
  const g = upperGaps(e);
  if (g.length < 3) return [];
  const m = [...g.map((x) => x.gap)].sort((a, b) => a - b)[Math.floor(g.length / 2)];
  return g
    .map((x) => ({ between: x.between, extra: x.gap - m }))
    .filter((x) => x.extra > 0.3)
    .map((x) => ({ kind: x.extra > 0.7 ? ("missing" as const) : ("space" as const), between: x.between, extra: x.extra }));
}
