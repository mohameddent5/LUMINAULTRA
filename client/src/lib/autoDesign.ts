import { autoLines, scaleOf, type P2, type ScreenInput } from "./screening";
import { gingivalTop } from "./gingival";

/**
 * Idealized proposal for the upper anterior six, generated from norms and a few robust anchors. It is not a trace of the photo.
 * Anchors: facial (else dental) midline, incisal plane (parallel to the eye line, else the detected slope), smile width (span of the detected teeth),
 * lower lip curve (for the incisal curve). Everything else is symmetric and fixed by teaching norms:
 * widths RED 75% (central 1, lateral 0.75, canine 0.5625), central W/H 0.78, centrals and canines at the same gingival level, laterals 1 mm more incisal,
 * incisal curve following the lower lip, fixed papilla depth, template tooth shapes.
 * The measured tracing is compared against it in `corrections` (width and crown length per tooth, with the scale error stated).
 */
export interface DesignTooth { name: string; fdi: number; side: "R" | "L"; poly: P2[]; zenith: P2; edge: P2; widthRel: number; wh: number; source: "fit" | "ratio"; wMm: number; hMm: number; heightFrom: "ideal (width / 0.78)" }
export interface AutoDesign {
  teeth: DesignTooth[];
  gum: P2[]; // zeniths left to right
  /** smooth scalloped gum line through the zeniths, fixed papilla depth (22% of a central height) */
  gumCurve: P2[];
  mmPerPx: number; scaleTag: string; scaleErrPct: number;
  angle: number; origin: P2;
  /** incisal plane through the detected edges (only when it can differ from the reference line) */
  tracedPlane: [P2, P2] | null;
  plane: [P2, P2];
  midline: [P2, P2];
  /** proposed changes from the measured tracing to the ideal, in mm; empty when the tracing is within the measurement error */
  corrections: string[];
  basis: { midline: string; plane: string; span: string; nUsed: number; fitted: number; ratio: number; arc: string; width: string };
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** RED proportion 75%: each tooth is 75% of the apparent width of the one nearer the midline (canine, lateral, central). A teaching choice, not a measured norm. */
const GOLD = [0.5625, 0.75, 1];
const NAMES = ["Canine", "Lateral", "Central"];

export function autoDesign(inp: ScreenInput, photo?: HTMLCanvasElement | null): AutoDesign | null {
  const up = inp.teeth.filter((t) => t.incisalDown).sort((a, b) => a.cx - b.cx);
  if (up.length < 3) return null;
  const { lines } = autoLines(inp);
  const x0 = inp.region.x0, y0 = inp.region.y0;
  const cxAll = up.reduce((s, t) => s + t.cx, 0) / up.length;
  const bottoms = up.map((t) => y0 + t.by + t.bh);
  const meanBot = bottoms.reduce((a, b) => a + b, 0) / bottoms.length;
  let midX: number, midBasis: string;
  const fm = lines.mid;
  if (fm) {
    const t = (meanBot - fm[0].y) / ((fm[1].y - fm[0].y) || 1);
    midX = fm[0].x + t * (fm[1].x - fm[0].x); midBasis = "facial midline (face mesh)";
  } else if (lines.dmid) { midX = lines.dmid[0].x; midBasis = "detected dental midline (no face in frame)"; }
  else { midX = x0 + cxAll; midBasis = "centre of the detected teeth (no face, row not symmetric)"; }
  const sel = [...up].sort((a, b) => Math.abs(x0 + a.cx - midX) - Math.abs(x0 + b.cx - midX)).slice(0, 6).sort((a, b) => a.cx - b.cx);
  const span = sel[sel.length - 1].bx + sel[sel.length - 1].bw - sel[0].bx;
  const S = sel.length >= 6 ? span : (span * 6) / sel.length;
  const spanBasis = sel.length >= 6 ? "width of the 6 detected front teeth" : `estimated from ${sel.length} detected teeth, scaled to 6`;
  const u = S / (2 * (GOLD[0] + GOLD[1] + GOLD[2]));
  // anchor the central width on the two detected centrals when both are there and plausible against the smile-width estimate; the other widths follow by ratio
  const cenDet = [...sel].sort((a, b) => Math.abs(x0 + a.cx - midX) - Math.abs(x0 + b.cx - midX)).slice(0, 2);
  const cMeas = cenDet.length === 2 ? (cenDet[0].bw + cenDet[1].bw) / 2 : 0;
  const cAnch = cMeas >= 0.85 * u && cMeas <= 1.2 * u ? cMeas : u;
  const W = [GOLD[0] * cAnch, GOLD[1] * cAnch, GOLD[2] * cAnch]; // canine, lateral, central
  const cW = W[2];
  const widthBasis = cAnch === u ? "central width from the smile width" : "central width from the two detected centrals";
  let ang = 0, planeBasis = "level (no face, no slope)";
  if (lines.ipl) { ang = Math.atan2(lines.ipl[1].y - lines.ipl[0].y, lines.ipl[1].x - lines.ipl[0].x); planeBasis = "parallel to the eye line"; }
  else if (lines.inc) { ang = Math.atan2(lines.inc[1].y - lines.inc[0].y, lines.inc[1].x - lines.inc[0].x); planeBasis = "detected incisal slope"; }
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const cB = sel.slice(Math.max(0, Math.floor(sel.length / 2) - 1), Math.ceil(sel.length / 2) + 1);
  const edgeY = (cB.length ? cB : sel).reduce((s, t) => s + y0 + t.by + t.bh, 0) / (cB.length ? cB.length : sel.length);
  const origin: P2 = { x: midX, y: edgeY };
  const to = (a: number, b: number): P2 => ({ x: midX + a * cs - b * sn, y: edgeY + a * sn + b * cs });
  const sc = scaleOf(lines.cw ? lines : { ...lines, cw: cW });
  const mmPerPx = 1 / sc.ppm;
  const Hc = cW / 0.78;
  // incisal curve: follows the lower lip curve (consonant arc) when the face mesh gave it, else a fixed gentle curve
  const xk = W[2] + W[1] + W[0] / 2;
  let sag = 0.06 * Hc, arcBasis = "fixed gentle curve (no lip points)";
  const lip = inp.face?.lowerLip;
  if (lip && lip.length >= 5) {
    const loc = lip.map((p) => ({ a: (p.x - midX) * cs + (p.y - edgeY) * sn, b: -(p.x - midX) * sn + (p.y - edgeY) * cs })).sort((p, q) => p.a - q.a);
    const at = (a: number) => { for (let i = 0; i < loc.length - 1; i++) if (a >= loc[i].a && a <= loc[i + 1].a) { const k = (a - loc[i].a) / ((loc[i + 1].a - loc[i].a) || 1); return loc[i].b + k * (loc[i + 1].b - loc[i].b); } return NaN; };
    const mid = at(0), side = (at(-xk) + at(xk)) / 2;
    if (Number.isFinite(mid) && Number.isFinite(side)) { sag = Math.max(0.03 * Hc, Math.min(0.1 * Hc, mid - side)); arcBasis = "follows the lower lip curve (clamped to 3 to 10% of a central height)"; }
  }
  const zenLat = Math.min(1 / mmPerPx, 0.12 * Hc); // 1 mm more incisal, capped
  const teeth: DesignTooth[] = [];
  const corrections: string[] = [];
  const tolMm = Math.max(0.5, (sc.errPct / 100) * 8.5 * 0.5); // do not list a change smaller than half the scale error of a central width
  let fitted = 0;
  for (const side of ["R", "L"] as const) {
    const sgn = side === "R" ? -1 : 1; // patient's right is image left
    let off = 0;
    const mine = sel.filter((t) => (side === "R" ? x0 + t.cx < midX : x0 + t.cx >= midX)).sort((a, b) => Math.abs(x0 + a.cx - midX) - Math.abs(x0 + b.cx - midX));
    for (let i = 2; i >= 0; i--) {
      const slot = 2 - i; // 0 central, 1 lateral, 2 canine
      const w = W[i], a0 = off, a1 = off + w; off = a1;
      const m = ((a0 + a1) / 2) * sgn, xc = (a0 + a1) / 2;
      const edgeB = -sag * Math.pow(xc / xk, 2) * (i === 2 ? 1 : 1);
      const topB = i === 1 ? -Hc + zenLat : -Hc;
      const zen = 0.08 * w * sgn * (i === 1 ? 0 : 1); // central and canine zenith leans distally, lateral centred
      const poly = toothShape(NAMES[i] === "Canine" ? "canine" : i === 1 ? "lateral" : "central", m, w, edgeB, topB, zen, sgn, to);
      const fdi = (side === "R" ? 10 : 20) + slot + 1;
      const h = edgeB - topB;
      teeth.push({ name: `${NAMES[i]} ${side}`, fdi, side, poly, zenith: to(m + zen, topB), edge: to(m, edgeB), widthRel: w / cW, wh: w / h, source: mine[slot] ? "fit" : "ratio", wMm: w * mmPerPx, hMm: h * mmPerPx, heightFrom: "ideal (width / 0.78)" });
      const det = mine[slot];
      if (!det) continue;
      fitted++;
      const dw = det.bw * mmPerPx;
      const nm = `${NAMES[i].toLowerCase()} ${fdi}`;
      if (Math.abs(dw - w * mmPerPx) >= tolMm) corrections.push(`${dw > w * mmPerPx ? "Narrow" : "Widen"} ${nm} by about ${Math.abs(dw - w * mmPerPx).toFixed(1)} mm (traced ${dw.toFixed(1)} mm, ideal ${(w * mmPerPx).toFixed(1)} mm)`);
      if (photo) {
        const gy = gingivalTop(photo, x0 + det.bx, det.bw, y0 + det.by, det.bh);
        if (gy !== null && gy >= y0 + det.by - 0.02 * det.bh && gy <= y0 + det.by + 0.4 * det.bh) {
          const hm = (y0 + det.by + det.bh - gy) * mmPerPx, hi = h * mmPerPx;
          if (Math.abs(hi - hm) >= tolMm) corrections.push(`${hi > hm ? "Lengthen" : "Shorten"} ${nm} by about ${Math.abs(hi - hm).toFixed(1)} mm (traced crown ${hm.toFixed(1)} mm from the gum step, ideal ${hi.toFixed(1)} mm)`);
        }
      }
    }
  }
  teeth.sort((a, b) => a.edge.x - b.edge.x);
  const gum = teeth.map((t) => t.zenith);
  // smooth scallop: half-cosine between neighbouring zeniths, fixed papilla depth, no sharp valleys
  const depth = 0.22 * Hc, gumCurve: P2[] = [];
  for (let k = 0; k < teeth.length - 1; k++) {
    const A = teeth[k].zenith, B = teeth[k + 1].zenith, n = 10;
    for (let j = 0; j < n; j++) {
      const t = j / n, bell = (1 - Math.cos(2 * Math.PI * t)) / 2; // 0 at the zeniths, 1 halfway
      const bx = A.x + (B.x - A.x) * t, by = A.y + (B.y - A.y) * t;
      gumCurve.push({ x: bx + 0, y: by + depth * bell });
    }
  }
  gumCurve.push(teeth[teeth.length - 1].zenith);
  const all = teeth.flatMap((t) => t.poly);
  const bbox = { x0: Math.min(...all.map((p) => p.x)), y0: Math.min(...all.map((p) => p.y)), x1: Math.max(...all.map((p) => p.x)), y1: Math.max(...all.map((p) => p.y)) };
  const half = S * 0.62;
  return {
    teeth, gum, gumCurve, bbox, mmPerPx, scaleTag: sc.tag, scaleErrPct: sc.errPct, angle: ang, origin, corrections, tracedPlane: lines.inc && lines.ipl ? lines.inc : null,
    plane: [to(-half, 0), to(half, 0)],
    midline: [to(0, -Hc * 1.25), to(0, Hc * 0.35)],
    basis: { midline: midBasis, plane: planeBasis, span: spanBasis, nUsed: sel.length, fitted, ratio: 6 - fitted, arc: arcBasis, width: widthBasis },
  };
}

/** Tooth templates: rounded incisal corners, cervical taper, tooth-type specific incisal edge. Points are clockwise from the bottom left and joined by a smooth curve when drawn. */
function toothShape(kind: "central" | "lateral" | "canine", m: number, w: number, edgeB: number, topB: number, zen: number, _sgn: number, to: (a: number, b: number) => P2): P2[] {
  const h = edgeB - topB, hw = w / 2;
  const taper = kind === "central" ? 0.3 : kind === "lateral" ? 0.36 : 0.46;
  const half = (f: number) => hw * (1 - taper * Math.pow(f, 1.5)); // f: 0 at the edge, 1 at the zenith
  const r = (kind === "central" ? 0.16 : 0.22) * w;
  const P = (a: number, f: number) => to(m + a, edgeB - f * h);
  const pts: P2[] = [];
  if (kind === "canine") pts.push(P(-hw, 0.1), P(0, 0), P(hw, 0.1)); // cusp tip with sloping shoulders
  else {
    pts.push(to(m - hw + r, edgeB), to(m, edgeB), to(m + hw - r, edgeB), to(m + hw - 0.1 * r, edgeB - 0.3 * r), to(m + hw, edgeB - r));
  }
  for (const f of [0.35, 0.6, 0.82]) pts.push(P(half(f), f));
  pts.push(to(m + zen + hw * 0.4, topB + h * 0.025), to(m + zen, topB), to(m + zen - hw * 0.4, topB + h * 0.025));
  for (const f of [0.82, 0.6, 0.35]) pts.push(P(-half(f), f));
  if (kind !== "canine") pts.push(to(m - hw, edgeB - r), to(m - hw + 0.1 * r, edgeB - 0.3 * r));
  return pts;
}
