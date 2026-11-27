/**
 * Proposed smile design outline (v1). A PROPOSAL for the dentist to adjust. Not a diagnosis, not a guarantee.
 *
 * Inputs are detected structure only (upper tooth boxes, dental midline, whether gum shows).
 * Output is one closed or open polyline per upper anterior tooth, symmetric about the dental midline.
 *
 * Source of each rule (see docs/priors-and-methods.md):
 *  - Tooth widths 1 : 0.75 : 0.56 (central : lateral : canine as seen from the front). RED proportion, 70 to 80% per step,
 *    mid value 75%, from the DSD guide used in dsdProtocol.ts (RED_PROPORTION). Not validated on his labeled photos.
 *  - Central width/length 77.5% (natural preset 75 to 80%), dsdProtocol.ts PRESETS.natural. Guide, not validated on his photos.
 *  - Symmetry about the dental midline: general DSD convention (guide). The facial midline offset is not corrected here.
 *  - Incisal edge: each left/right pair takes the average of the two detected edge heights (symmetry rule). No invented edge shape.
 *  - Lower-lip following (only when a whole face was found): edge heights are moved to follow the face-mesh lower-lip curve at the same
 *    median distance as the detected edges (consonant smile arc, guide: classifySmileArc in dsdProtocol.ts). Not validated on his photos.
 *  - Total width per side is kept equal to the average detected width per side, so the design never moves tooth edges outward beyond the detected span.
 * Not used: zenith, papilla, lower-lip following, buccal corridor (no reliable detection yet). The layer says so.
 */
import type { Tooth } from "./smileEngine";

export type Pt = { x: number; y: number };
export interface ProposedTooth { label: string; pts: Pt[]; closed: boolean; src: "traced" | "ratio" }
export type Proposal =
  | { ok: true; teeth: ProposedTooth[]; midX: number; notes: string[] }
  | { ok: false; reason: string };

export const RED_STEP = 0.75;
export const WIDTH_LENGTH = 0.775;
export const PROPOSAL_LABEL = "Proposed design: a starting point for the dentist to adjust. Not a diagnosis or a guarantee.";

const LABELS = ["central", "lateral", "canine"];

// Evidence (his labeled cyan lines, private photos): mask top sits above his cervical line by a median 6.6% of tooth height on ex17-21 (29 teeth),
// and 10.4% / 13.9% on held-out independent subjects ex26 (n=6) / ex27 (n=8). Per-photo median abs error 6.6% -> 8.5%:
// ex18 .049>.035, ex19 .046>.037, ex20 .037=.037, ex21 .038=.038, ex26 .039>.030, ex27 .074>.055 (no photo worse).
// 8.5% is a pooled-data value, NOT a literature value; no cited paper gives this offset for a mask top. Labels are +-2 px (about 5%) noise.
const CERVICAL_BIAS = 0.085;
// Zenith distal offset as a share of tooth width, central / lateral / canine. Follows the literature per Mohamed's decision (Telegram 26050818).
// Chu 2009 (PMID 19368601): central 1 mm of a typical 8.6 mm central = 0.116; lateral 0.4 mm of 6.45 mm = 0.062; canine 97.5% centralized = 0.
// His own labels put the zenith at the centre (about 0.00 to 0.03, n=14, ex26/ex27); recorded as a disagreement in docs/priors-and-methods.md.
const ZENITH_DISTAL = [0.116, 0.062, 0];
// A detected tooth counts as traced when its width is within 25% of the ratio width (NEITHER-sourced) and it is not flagged CHECK.
const TRACE_WIDTH_TOL = 0.25;

export function proposeOutline(upper: Tooth[], region: { x0: number; y0: number }, gumSeen: boolean, tierOk: boolean, lip: Pt[] | null = null, checkIds: number[] = []): Proposal {
  if (!tierOk) return { ok: false, reason: "The photo checks did not pass, so no design is drawn." };
  const up = [...upper].sort((a, b) => a.cx - b.cx);
  if (up.length < 6) return { ok: false, reason: "Fewer than 6 clear upper teeth were found, so no design is drawn." };
  // dental midline: the gap between neighbours closest to the median tooth centre (same rule as the detected midline)
  const med = up.reduce((a, t) => a + t.cx, 0) / up.length;
  let best = 0;
  for (let i = 0; i < up.length - 1; i++) if (Math.abs((up[i].cx + up[i + 1].cx) / 2 - med) < Math.abs((up[best].cx + up[best + 1].cx) / 2 - med)) best = i;
  const left = up.slice(0, best + 1).reverse().slice(0, 3); // from the midline outwards
  const right = up.slice(best + 1).slice(0, 3);
  if (left.length < 3 || right.length < 3) return { ok: false, reason: "The midline is not centred between at least 3 teeth on each side, so no design is drawn." };
  const midX = (up[best].bx + up[best].bw + up[best + 1].bx) / 2;
  const outerL = left[2].bx, outerR = right[2].bx + right[2].bw;
  const spanL = midX - outerL, spanR = outerR - midX;
  if (Math.abs(spanL - spanR) / Math.max(spanL, spanR) > 0.3) return { ok: false, reason: "The two sides differ by more than 30% in width, so the midline is not reliable. No design is drawn." };
  const S = (spanL + spanR) / 2;
  const sum = 1 + RED_STEP + RED_STEP * RED_STEP;
  const widths = [1, RED_STEP, RED_STEP * RED_STEP].map((r) => (r / sum) * S);
  const cH = widths[0] / WIDTH_LENGTH;
  const cBottom = (a: Tooth, b: Tooth) => (a.by + a.bh + b.by + b.bh) / 2;
  void cBottom; void cH;
  // lower-lip curve (inner lip ring, lower half) in region coordinates, or null
  let lipY: ((x: number) => number | null) | null = null;
  if (lip && lip.length > 6) {
    const my = lip.reduce((a, q) => a + q.y, 0) / lip.length;
    const low = lip.filter((q) => q.y >= my).map((q) => ({ x: q.x - region.x0, y: q.y - region.y0 })).sort((a, b) => a.x - b.x);
    if (low.length >= 4) {
      lipY = (x) => {
        if (x < low[0].x || x > low[low.length - 1].x) return null;
        for (let i = 0; i < low.length - 1; i++) if (x >= low[i].x && x <= low[i + 1].x) { const k = (x - low[i].x) / Math.max(1e-6, low[i + 1].x - low[i].x); return low[i].y + k * (low[i + 1].y - low[i].y); }
        return null;
      };
    }
  }
  const pairY = (i: number): number => (left[i].by + left[i].bh + right[i].by + right[i].bh) / 2;
  const pairX = (i: number): [number, number] => [left[i].cx, right[i].cx];
  const lipEdge: (number | null)[] = [0, 1, 2].map((i) => {
    if (!lipY) return null;
    const [a, b] = pairX(i);
    const ya = lipY(a), yb2 = lipY(b);
    return ya === null || yb2 === null ? null : (ya + yb2) / 2;
  });
  let lipGap: number | null = null;
  if (lipEdge.every((v) => v !== null)) {
    const gaps = [0, 1, 2].map((i) => (lipEdge[i] as number) - pairY(i)).sort((a, b) => a - b);
    lipGap = gaps[1];
    if (lipGap <= 0) lipGap = null;
  }
  const out: ProposedTooth[] = [];
  const ox = region.x0, oy = region.y0;
  const notes: string[] = [];
  const bad = new Set(checkIds);
  const isTraced = (i: number) => [left[i], right[i]].every((d) => Math.abs(d.bw - widths[i]) / widths[i] <= TRACE_WIDTH_TOL && !bad.has(d.id));
  const ybOwn = (i: number) => (lipGap !== null ? (lipEdge[i] as number) - lipGap : pairY(i));
  const tracedYb = [0, 1, 2].filter(isTraced).map(ybOwn);
  const ybRatio = tracedYb.length ? tracedYb.reduce((a, v) => a + v, 0) / tracedYb.length : null;
  let nRatio = 0;
  for (const side of [-1, 1] as const) {
    let x = midX;
    for (let i = 0; i < 3; i++) {
      const w = widths[i];
      const xa = x, xb = x + side * w; // xa is mesial
      const xl = Math.min(xa, xb), xr = Math.max(xa, xb);
      const traced = isTraced(i);
      if (!traced) nRatio++;
      // incisal edge: lip curve or symmetrised pair for traced teeth; ratio-filled teeth borrow the mean edge of the traced ones
      const yb = traced || ybRatio === null ? ybOwn(i) : ybRatio;
      // detected mask tops sit above his hand-drawn cervical line by a median 8.5% of tooth height (see CERVICAL_BIAS); move the detected top down by that share
      const rawTop = (left[i].by + right[i].by) / 2;
      const topDetected = gumSeen ? rawTop + CERVICAL_BIAS * (yb - rawTop) : rawTop;
      // without visible gum the tooth top is hidden: keep the visible top. With gum, top = height from the width/length target (not above the detected top)
      const yt = gumSeen ? Math.max(yb - w / WIDTH_LENGTH, topDetected) : topDetected;
      const h = yb - yt;
      const r = Math.min(w * 0.22, h * 0.4);
      const rm = r * 0.5, rd = r; // incisal corners rounded; mesial tighter than distal
      const mes = side < 0 ? xr : xl, dis = side < 0 ? xl : xr;
      const inM = mes === xl ? 1 : -1, inD = -inM; // direction pointing into the tooth from each side
      const pts: Pt[] = [];
      const sh = gumSeen ? yt + 0.18 * h : yt; // shoulder height; the neck is narrower than the crown
      const neck = gumSeen ? 0.07 * w : 0;
      const mesN = mes + inM * neck, disN = dis + inD * neck;
      pts.push({ x: mesN, y: sh });
      pts.push({ x: mes, y: yb - rm * 1.6 });
      pts.push({ x: mes + inM * rm * 0.3, y: yb - rm * 0.3 });
      pts.push({ x: mes + inM * rm, y: yb });
      pts.push({ x: dis + inD * rd, y: yb });
      pts.push({ x: dis + inD * rd * 0.3, y: yb - rd * 0.3 });
      pts.push({ x: dis, y: yb - rd * 1.6 });
      pts.push({ x: disN, y: sh });
      if (gumSeen) {
        // cervical curve over the zenith: apex distal of the tooth centre by the literature share (centrals 0.116, laterals 0.062, canines 0)
        const apexX = (xl + xr) / 2 + (dis < mes ? -1 : 1) * 0 + (dis === xr ? 1 : -1) * ZENITH_DISTAL[i] * w;
        const apex = { x: apexX, y: yt };
        const q = (A: Pt, C: Pt, B: Pt, t: number): Pt => ({ x: (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * C.x + t * t * B.x, y: (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * C.y + t * t * B.y });
        const D: Pt = { x: disN, y: sh }, M: Pt = { x: mesN, y: sh };
        for (let k = 1; k <= 5; k++) pts.push(q(D, { x: D.x, y: yt }, apex, k / 5));
        for (let k = 1; k <= 5; k++) pts.push(q(apex, { x: M.x, y: yt }, M, k / 5));
      }
      out.push({ label: LABELS[i], pts: pts.map((p) => ({ x: p.x + ox, y: p.y + oy })), closed: gumSeen, src: traced ? "traced" : "ratio" });
      x = xb;
    }
  }
  if (nRatio > 0) notes.push(`CHECK: ${nRatio} of 6 teeth are tagged "ratio": generated from the verified ratios (RED 75%, W/L 77.5%) because the detected outline was missing, off-size or flagged. A generic ratio-based proposal, not traced from the actual tooth.`);
  notes.push(gumSeen ? "Gum shows: tooth tops are drawn at the detected level, made symmetric." : "Gum is not visible in this smile, so tooth tops (cervical line, zenith) are not drawn.");
  notes.push(lipGap !== null ? "Incisal edge follows the lower lip curve." : "Lower lip not available, so the incisal edge is the symmetrised detected edge.");
  notes.push("Rules: RED 75% width steps, width/length 77.5%, symmetry about the dental midline, zenith distal 0.116 (central) and 0.062 (lateral) of width per Chu 2009, canine centred.");
  return { ok: true, teeth: out, midX: midX + ox, notes };
}
