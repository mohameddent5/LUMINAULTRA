import { autoLines, scaleOf, type P2, type ScreenInput } from "./screening";
import { gingivalTop } from "./gingival";

/**
 * Automatic proposed design for the upper anterior six, drawn from ratios only (no gate, no decay check).
 * Everything is an estimate from rough tooth boxes: widths follow the average proportions (central 1 : lateral 0.75 : canine 0.7),
 * height = width / 0.78, laterals 7% shorter at the edge with their gum zenith 8% lower than the centrals.
 * Output is in canvas pixels, ready to draw.
 */
export interface DesignTooth { name: string; side: "R" | "L"; poly: P2[]; zenith: P2; edge: P2; widthRel: number; wh: number; source: "fit" | "ratio"; wMm: number; hMm: number; /** where the crown height comes from */ heightFrom: "gum colour step" | "derived (width / 0.78)" }
export interface AutoDesign {
  teeth: DesignTooth[];
  gum: P2[]; // zeniths left to right
  /** scalloped gum line through zeniths and papilla points, left to right (papilla height is schematic, 22% of crown height below the zenith) */
  gumCurve: P2[];
  mmPerPx: number; scaleTag: string;
  /** direction of the incisal plane, for full-width reference lines */
  angle: number; origin: P2;
  plane: [P2, P2];
  midline: [P2, P2];
  basis: { midline: string; plane: string; span: string; nUsed: number; fitted: number; ratio: number };
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** RED proportion 75%: each tooth is 75% of the apparent width of the one nearer the midline (canine, lateral, central). A teaching choice, not a measured norm; the golden proportion is weak evidence and is not used. */
const GOLD = [0.5625, 0.75, 1];

export function autoDesign(inp: ScreenInput, photo?: HTMLCanvasElement | null): AutoDesign | null {
  const up = inp.teeth.filter((t) => t.incisalDown).sort((a, b) => a.cx - b.cx);
  if (up.length < 3) return null;
  const { lines } = autoLines(inp);
  const x0 = inp.region.x0, y0 = inp.region.y0;
  const cxAll = up.reduce((s, t) => s + t.cx, 0) / up.length;
  // midline x at mouth height
  const bottoms = up.map((t) => y0 + t.by + t.bh);
  const meanBot = bottoms.reduce((a, b) => a + b, 0) / bottoms.length;
  let midX: number, midBasis: string;
  const fm = lines.mid;
  if (fm) {
    const t = (meanBot - fm[0].y) / ((fm[1].y - fm[0].y) || 1);
    midX = fm[0].x + t * (fm[1].x - fm[0].x); midBasis = "facial midline (face mesh)";
  } else if (lines.dmid) { midX = lines.dmid[0].x; midBasis = "detected dental midline (no face in frame)"; }
  else { midX = x0 + cxAll; midBasis = "centre of the detected teeth (no face, row not symmetric)"; }
  // span of the six teeth nearest the middle
  const sel = [...up].sort((a, b) => Math.abs(x0 + a.cx - midX) - Math.abs(x0 + b.cx - midX)).slice(0, 6).sort((a, b) => a.cx - b.cx);
  const span = sel[sel.length - 1].bx + sel[sel.length - 1].bw - sel[0].bx;
  const S = sel.length >= 6 ? span : (span * 6) / sel.length;
  const spanBasis = sel.length >= 6 ? "width of the 6 detected front teeth" : `estimated from ${sel.length} detected teeth, scaled to 6`;
  const u = S / (2 * (GOLD[0] + GOLD[1] + GOLD[2]));
  const cW = GOLD[2] * u, lW = GOLD[1] * u, kW = GOLD[0] * u;
  // plane: parallel to the eye line when there is a face, else the detected incisal slope
  let ang = 0, planeBasis = "level (no face, no slope)";
  if (lines.ipl) { ang = Math.atan2(lines.ipl[1].y - lines.ipl[0].y, lines.ipl[1].x - lines.ipl[0].x); planeBasis = "parallel to the eye line"; }
  else if (lines.inc) { ang = Math.atan2(lines.inc[1].y - lines.inc[0].y, lines.inc[1].x - lines.inc[0].x); planeBasis = "detected incisal slope"; }
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const cB = sel.length ? sel.slice(Math.max(0, Math.floor(sel.length / 2) - 1), Math.ceil(sel.length / 2) + 1) : sel;
  const edgeY = (cB.length ? cB : sel).reduce((s, t) => s + y0 + t.by + t.bh, 0) / (cB.length ? cB.length : sel.length);
  const to = (a: number, b: number): P2 => ({ x: midX + a * cs - b * sn, y: edgeY + a * sn + b * cs });
  const Hc = cW / 0.78;
  const defs = [
    { name: "Canine", w: kW, h: Hc * 0.97, edge: 0, top: -Hc * 0.97 },
    { name: "Lateral", w: lW, h: Hc * 0.85, edge: -0.07 * Hc, top: -Hc + 0.08 * Hc },
    { name: "Central", w: cW, h: Hc, edge: 0, top: -Hc },
  ];
  const teeth: DesignTooth[] = [];
  const sc = scaleOf(lines.cw ? lines : { ...lines, cw: cW });
  const mmPerPx = 1 / sc.ppm;
  let fitted = 0, ratioN = 0;
  // build from the midline outward on each side
  for (const side of ["R", "L"] as const) {
    const sgn = side === "R" ? -1 : 1; // patient's right is image left
    let off = 0;
    // detected teeth on this side, nearest the midline first (patient's right = image left)
    const mine = sel.filter((t) => (side === "R" ? x0 + t.cx < midX : x0 + t.cx >= midX)).sort((a, b) => Math.abs(x0 + a.cx - midX) - Math.abs(x0 + b.cx - midX));
    for (let i = 2; i >= 0; i--) {
      const slot = 2 - i; // 0 central, 1 lateral, 2 canine
      const det = mine[slot];
      const fitOk = !!det && det.bw >= 0.8 * defs[i].w && det.bw <= 1.25 * defs[i].w && det.bw / Math.max(1, det.bh) >= 0.5 && det.bw / Math.max(1, det.bh) <= 1.2;
      // crown height from the colour-step gum margin on this tooth when it falls in the plausible band (box top to box top + 40% of box height)
      let gumB: number | null = null;
      if (fitOk && photo) {
        const gy = gingivalTop(photo, x0 + det!.bx, det!.bw, y0 + det!.by, det!.bh);
        if (gy !== null && gy >= y0 + det!.by - 0.02 * det!.bh && gy <= y0 + det!.by + 0.4 * det!.bh) gumB = (gy - edgeY) * cs; // vertical offset from the plane, tilt ignored
      }
      const base = { ...defs[i], w: fitOk ? det!.bw : defs[i].w };
      let hh = base.h, hFrom: DesignTooth["heightFrom"] = "derived (width / 0.78)";
      if (gumB !== null) {
        const hd = base.edge - gumB;
        const ratioH = hd / base.h;
        if (ratioH >= 0.75 && ratioH <= 1.35 && base.w / hd >= 0.5 && base.w / hd <= 1.2) { hh = hd; hFrom = "gum colour step"; }
      }
      const d = { ...base, h: hh, top: hFrom === "gum colour step" ? base.edge - hh : base.top };
      if (fitOk) fitted++; else ratioN++;
      const src = fitOk ? ("fit" as const) : ("ratio" as const);
      const a0 = off, a1 = off + d.w; off = a1;
      const m = (a0 + a1) / 2 * sgn;
      const l = Math.min(a0, a1) * sgn, r = a1 * sgn;
      const edgeB = d.edge, topB = d.top;
      const lo = Math.min(l, r), hi = Math.max(l, r), wid = hi - lo;
      const zen = (i === 1 ? 0 : 0.08) * wid * sgn * -1; // central and canine zenith leans distally, lateral centred
      const zenith = to(m + zen, topB);
      const poly = toothShape(i === 2 ? "canine" : i === 1 ? "lateral" : "central", m, wid, edgeB, topB, zen, sgn, to);
      teeth.push({ name: `${d.name} ${side}`, side, poly, zenith, edge: to(m, edgeB), widthRel: d.w / (cW), wh: d.w / d.h, source: src, wMm: d.w * mmPerPx, hMm: d.h * mmPerPx, heightFrom: hFrom });
    }
  }
  teeth.sort((a, b) => a.edge.x - b.edge.x);
  const cws = teeth.filter((t) => t.name.startsWith("Central")).map((t) => t.widthRel * cW);
  const cRef = cws.length ? cws.reduce((a, b) => a + b, 0) / cws.length : cW;
  for (const t of teeth) t.widthRel = (t.widthRel * cW) / cRef;
  const gum = teeth.map((t) => t.zenith);
  const gumCurve: P2[] = [];
  teeth.forEach((t, k) => {
    if (k > 0) { const u = teeth[k - 1]; gumCurve.push({ x: (u.edge.x + t.edge.x) / 2 - (0), y: (u.zenith.y + 0.22 * (u.edge.y - u.zenith.y) + t.zenith.y + 0.22 * (t.edge.y - t.zenith.y)) / 2 }); }
    gumCurve.push(t.zenith);
  });
  const all = teeth.flatMap((t) => t.poly);
  const bbox = { x0: Math.min(...all.map((p) => p.x)), y0: Math.min(...all.map((p) => p.y)), x1: Math.max(...all.map((p) => p.x)), y1: Math.max(...all.map((p) => p.y)) };
  const half = S * 0.62;
  return {
    teeth, gum, gumCurve, bbox, mmPerPx, scaleTag: sc.tag, angle: ang, origin: to(0, 0),
    plane: [to(-half, 0), to(half, 0)],
    midline: [to(0, -Hc * 1.25), to(0, Hc * 0.35)],
    basis: { midline: midBasis, plane: planeBasis, span: spanBasis, nUsed: sel.length, fitted, ratio: ratioN },
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
