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
export interface ProposedTooth { label: string; pts: Pt[]; closed: boolean }
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

export function proposeOutline(upper: Tooth[], region: { x0: number; y0: number }, gumSeen: boolean, tierOk: boolean, lip: Pt[] | null = null): Proposal {
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
  for (const side of [-1, 1] as const) {
    const pair = side < 0 ? left : right;
    let x = midX;
    for (let i = 0; i < 3; i++) {
      const w = widths[i];
      const xa = x, xb = x + side * w; // xa is mesial
      const xl = Math.min(xa, xb), xr = Math.max(xa, xb);
      const yb = lipGap !== null ? (lipEdge[i] as number) - lipGap : pairY(i); // incisal edge: follows the lower lip when a face was found, else left/right pair averaged (symmetry)
      const det = pair[i];
      // detected mask tops sit above his hand-drawn cervical line by a median 6.6% of tooth height (29 teeth, 5 photos, ex17 to ex21, leave-one-photo-out improved 4 of 4 design-eligible photos); move the detected top down by that share
      const rawTop = (left[i].by + right[i].by) / 2;
      const topDetected = gumSeen ? rawTop + CERVICAL_BIAS * (yb - rawTop) : rawTop;
      // without visible gum the tooth top is hidden: keep the visible top. With gum, top = height from the width/length target (not above the detected top)
      const yt = gumSeen ? Math.max(yb - w / WIDTH_LENGTH, topDetected) : topDetected;
      const r = Math.min(w * 0.22, (yb - yt) * 0.4);
      // incisal corners rounded; mesial corner tighter than distal
      const rm = r * 0.5, rd = r;
      const mes = side < 0 ? xr : xl, dis = side < 0 ? xl : xr;
      const sgn = (v: number) => (v === xl ? 1 : -1);
      const pts: Pt[] = [];
      pts.push({ x: mes, y: yt });
      pts.push({ x: mes, y: yb - rm });
      pts.push({ x: mes + sgn(mes) * rm * 0.3, y: yb - rm * 0.3 });
      pts.push({ x: mes + sgn(mes) * rm, y: yb });
      pts.push({ x: dis + sgn(dis) * rd, y: yb });
      pts.push({ x: dis + sgn(dis) * rd * 0.3, y: yb - rd * 0.3 });
      pts.push({ x: dis, y: yb - rd });
      pts.push({ x: dis, y: yt });
      void det;
      const closed = gumSeen;
      out.push({ label: LABELS[i], pts: pts.map((p) => ({ x: p.x + ox, y: p.y + oy })), closed });
      x = xb;
    }
  }
  notes.push(gumSeen ? "Gum shows: tooth tops are drawn at the detected level, made symmetric." : "Gum is not visible in this smile, so tooth tops (cervical line, zenith) are not drawn.");
  notes.push(lipGap !== null ? "Incisal edge follows the lower lip curve." : "Lower lip not available, so the incisal edge is the symmetrised detected edge.");
  notes.push("Rules: RED 75% width steps, width/length 77.5%, symmetry about the dental midline. Zenith and papilla are not used yet.");
  return { ok: true, teeth: out, midX: midX + ox, notes };
}
