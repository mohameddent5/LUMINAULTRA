/**
 * Screening measurements for the dentist, computed from landmarks the app already finds
 * (eye line, facial midline and mouth corners from the face mesh, upper tooth boxes from the tooth finder).
 * Every value comes from one 2D photo: no scale, no depth. Camera roll and head roll cannot be told apart.
 * Thresholds are the usual DSD expectations (reference lines parallel, midlines coincident); the cut-offs
 * between "ok", "note" and "check" are NEITHER-sourced and not clinically validated. A prompt to look, not a finding.
 */
export type P2 = { x: number; y: number };
export interface ScreenTooth { cx: number; cy: number; bx: number; by: number; bw: number; bh: number; incisalDown: boolean }
export interface ScreenInput {
  face?: { irisPx?: number; ipl: [P2, P2]; mid: [P2, P2]; com: [P2, P2]; marks?: { glabella: P2; subnasale: P2; stomion: P2; menton: P2; upperLip?: P2 } } | null;
  /** tooth boxes in region coordinates; region.x0 and y0 convert them to canvas pixels */
  teeth: ScreenTooth[];
  region: { x0: number; y0: number };
}
export type Level = "ok" | "note" | "check";
export interface Finding {
  id: string;
  label: string;
  /** measured value with unit, or "n/a" */
  value: string;
  level: Level;
  /** set when the number is not trustworthy on this photo: the reason. Show "not reliable, check by eye" instead of the value. */
  unreliable?: string;
  /** what it means and how sure we are */
  note: string;
}

/** assumed width of an upper central incisor, only used to turn a ratio into an approximate mm figure */
export const CENTRAL_WIDTH_MM = 8.5;
/** mean horizontal visible iris diameter in adults, about 11.7 mm (individual spread about 5 to 6%) */
export const IRIS_MM = 11.7;

/** Which scale to use for mm: the dentist's own width, else the iris (if the implied central width is plausible), else the assumed width. */
export function scaleOf(L: RefLines): { ppm: number; tag: "calibrated" | "iris" | "assumed"; errPct: number; text: string } {
  if (L.pxPerMm) return { ppm: L.pxPerMm, tag: "calibrated", errPct: 5, text: "calibrated on the entered central width" };
  if (L.irisPx && L.cw) {
    const ppm = L.irisPx / IRIS_MM, cwMm = L.cw / ppm;
    if (cwMm >= 6.5 && cwMm <= 11) return { ppm, tag: "iris", errPct: 12, text: `scaled from the iris (${IRIS_MM} mm average, about 12% error incl. depth difference between eye and teeth)` };
  }
  return { ppm: (L.cw || 1) / CENTRAL_WIDTH_MM, tag: "assumed", errPct: 20, text: `scaled by assuming a ${CENTRAL_WIDTH_MM} mm central incisor (about 20% error)` };
}

const ang = (a: P2, b: P2) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const r1 = (v: number) => Math.round(v * 10) / 10;
const side = (dx: number) => (dx > 0 ? "patient's left" : "patient's right");

export interface RefLines {
  /** facial thirds landmarks (face mesh) */
  marks?: { glabella: P2; subnasale: P2; stomion: P2; menton: P2; upperLip?: P2 };
  /** iris diameter in pixels (face mesh), the automatic scale */
  irisPx?: number;
  ipl?: [P2, P2];
  mid?: [P2, P2];
  com?: [P2, P2];
  /** dental midline */
  dmid?: [P2, P2];
  /** incisal plane */
  inc?: [P2, P2];
  /** width of a central incisor in pixels, the scale for percent and mm values */
  cw?: number;
  /** image y of the top of the two central tooth boxes (about the gingival margin) */
  ctop?: number;
  /** pixels per mm once the dentist has calibrated on a tooth; absent means the 8.5 mm assumption is used */
  pxPerMm?: number;
}

const wrap90 = (a: number) => { while (a > 90) a -= 180; while (a < -90) a += 180; return a; };

/** Findings from a set of reference lines. Used for the automatic lines and again after the dentist drags them. */
export function measureLines(L: RefLines): Finding[] {
  const out: Finding[] = [];
  const ipl = L.ipl ? wrap90(ang(L.ipl[0], L.ipl[1])) : null;
  if (L.ipl && ipl !== null) {
    const a = Math.abs(ipl);
    out.push({
      id: "eye-line", label: "Eye line vs image horizontal", value: `${r1(ipl)}°`, level: a > 5 ? "check" : a > 2 ? "note" : "ok",
      note: "Head roll or camera roll: one photo cannot tell which. Above about 2° the other angles below are less reliable; retake level if it matters.",
    });
    if (L.com) {
      const c = wrap90(ang(L.com[0], L.com[1]) - ang(L.ipl[0], L.ipl[1]));
      const ac = Math.abs(c);
      out.push({
        id: "commissure", label: "Mouth-corner line vs eye line", value: `${r1(c)}°`, level: ac > 4 ? "check" : ac > 2 ? "note" : "ok",
        note: "DSD expects the two roughly parallel. Mouth corners come from the face mesh and move with the expression (about 1 to 2° error).",
      });
    }
  } else {
    out.push({ id: "no-face", label: "Facial references", value: "n/a", level: "note", note: "No whole face in the frame, so eye line, facial midline and mouth-corner line were not measured. Teeth angles below are against the image horizontal only and include any camera tilt." });
  }
  if (L.marks && L.mid) {
    const m = L.marks;
    // distances along the facial midline direction
    const d = Math.hypot(L.mid[1].x - L.mid[0].x, L.mid[1].y - L.mid[0].y) || 1;
    const ux = (L.mid[1].x - L.mid[0].x) / d, uy = (L.mid[1].y - L.mid[0].y) / d;
    const al = (a: P2, b: P2) => (b.x - a.x) * ux + (b.y - a.y) * uy;
    const mid = al(m.glabella, m.subnasale), low = al(m.subnasale, m.menton), up = al(m.subnasale, m.stomion);
    if (mid > 0 && low > 0) {
      const r = low / mid;
      out.push({ id: "thirds", label: "Facial thirds: lower vs middle third", value: `${r1(r * 100)}% (subnasale to menton as a share of glabella to subnasale)`, level: Math.abs(r - 1) > 0.25 ? "check" : Math.abs(r - 1) > 0.12 ? "note" : "ok", note: "Glabella, subnasale and menton come from the face mesh and the hair line is not measured, so only middle vs lower is compared (ideal about 100%). Expression and head pitch move these points; about 5 to 10% error." });
      if (up > 0) out.push({ id: "lower-third", label: "Lower third split: subnasale to lips vs lips to menton", value: `1 : ${r1((low - up) / up)}`, level: Math.abs((low - up) / up - 2) > 0.7 ? "note" : "ok", note: "Ideal is about 1 : 2. The lip point is the middle of the lip opening, so a wide smile shifts it." });
    }
  }
  if (L.mid && L.dmid && L.cw) {
    const [p, q] = L.mid;
    const my = (L.dmid[0].y + L.dmid[1].y) / 2, mx = (L.dmid[0].x + L.dmid[1].x) / 2;
    const t = q.y === p.y ? 0 : (my - p.y) / (q.y - p.y);
    const dx = mx - (p.x + t * (q.x - p.x));
    const ratio = Math.abs(dx) / Math.max(1, L.cw);
    const sc = scaleOf(L);
    const mm = Math.abs(dx) / sc.ppm;
    out.push({
      id: "midline", label: "Dental midline vs facial midline",
      value: `${r1(ratio * 100)}% of central width (${sc.tag === "calibrated" ? "" : "about "}${r1(mm)} mm, ${sc.tag}) toward ${side(dx)}`,
      level: ratio > 0.35 ? "check" : ratio > 0.2 ? "note" : "ok",
      note: "Dental midline is the gap found between the two central teeth boxes; facial midline is the nose-bridge to chin line. Box edges are rough (about 5 to 10% of a central width); the mm figure is an estimate unless calibrated.",
    });
    if (L.dmid) {
      const tilt = wrap90(ang(L.dmid[0], L.dmid[1]) - 90);
      const fm = L.mid ? wrap90(ang(L.mid[0], L.mid[1]) - 90) : 0;
      const d = tilt - fm;
      out.push({ id: "midline-angle", label: "Dental midline angle vs facial midline", value: `${r1(d)}°`, level: Math.abs(d) > 4 ? "check" : Math.abs(d) > 2 ? "note" : "ok", note: "Both midlines should be about parallel. The dental midline is vertical unless the dentist drags it." });
    }
  }
  if (L.inc) {
    const rel = wrap90(ang(L.inc[0], L.inc[1]) - (ipl ?? 0));
    const a = Math.abs(rel);
    out.push({
      id: "incisal-plane", label: ipl === null ? "Incisal plane vs image horizontal" : "Incisal plane cant vs eye line", value: `${r1(rel)}° (${rel > 0 ? "patient's left side lower" : "patient's right side lower"})`,
      level: a > 4 ? "check" : a > 2 ? "note" : "ok",
      note: "Line through the incisal edge points of the front upper teeth. Edge points come from the tooth boxes and a curved arch tilts the fit a little, so about 2 to 3° error. The occlusal plane itself needs a profile or an intraoral view.",
    });
  }
  if (L.irisPx && L.cw && !L.pxPerMm) {
    const cwMm = L.cw / (L.irisPx / IRIS_MM);
    const bad = cwMm < 6.5 || cwMm > 11;
    out.push({
      id: "scale-check", label: "Scale cross-check: central width implied by the iris", value: bad ? `${r1(cwMm)} mm (not plausible, mm values use the assumed width)` : `${r1(cwMm)} mm`,
      level: bad ? "check" : cwMm < 7.5 || cwMm > 10 ? "note" : "ok",
      note: "Independent of the tooth boxes: the iris (about 11.7 mm) gives a scale, and an upper central is normally about 8 to 9.5 mm wide. A value far outside means the tooth box or the iris reading is off, so mm figures are unreliable.",
    });
  }
  if (L.marks?.upperLip && L.ctop !== undefined && L.cw) {
    const sc = scaleOf(L), ppm = sc.ppm;
    const gum = (L.ctop - L.marks.upperLip.y) / ppm;
    const cal = sc.text;
    out.push({
      id: "gum-show", label: "Gum show at this smile (upper lip edge to top of the central teeth)", value: gum <= 0 ? `none (lip covers about ${r1(-gum)} mm of crown)` : `${r1(gum)} mm`,
      level: gum > 3 ? "check" : gum > 2 ? "note" : "ok",
      note: `Goal: 0 to 2 mm ok, 2 to 3 mm borderline, above 3 mm gummy. Only valid if the photo is a natural posed smile. The top of the tooth box stands in for the gingival margin; on the one photo with hand-marked cervical margins it sat 7 to 21% of the box height above them (median 16%, 7 teeth), so this number is probably too high by 1 to 2 mm, and the lip edge comes from the face mesh; ${cal}.`,
    });
  }
  // cross-checks between independent estimates: a number that fails one is shown as not reliable
  if (L.marks && L.mid && L.cw) {
    const m = L.marks;
    const gx = m.glabella.x, gy = m.glabella.y, sx = m.subnasale.x, sy = m.subnasale.y;
    const y = m.stomion.y;
    const altX = sy !== gy ? gx + ((y - gy) / (sy - gy)) * (sx - gx) : sx;
    const t = (y - L.mid[0].y) / ((L.mid[1].y - L.mid[0].y) || 1);
    const mainX = L.mid[0].x + t * (L.mid[1].x - L.mid[0].x);
    const d = Math.abs(altX - mainX) / L.cw;
    if (d > 0.5) for (const f of out) if (f.id === "midline" || f.id === "midline-angle") f.unreliable = `two facial midline estimates (glabella to subnasale vs bridge to chin) differ by ${r1(d * 100)}% of a central width at the mouth (face turned or asymmetric)`;
  }
  const sc = out.find((f) => f.id === "scale-check");
  if (sc && sc.level === "check") for (const f of out) if (f.id === "gum-show") f.unreliable = "iris scale and tooth box disagree, so mm are not trustworthy";
  return out;
}

/** Automatic reference lines from the landmarks, plus whether the dental midline can be trusted. */
export function autoLines(inp: ScreenInput): { lines: RefLines; trusted: boolean; asym: Finding | null; enough: boolean } {
  const f = inp.face || null;
  const L: RefLines = {};
  if (f) { L.ipl = f.ipl; L.mid = f.mid; L.com = f.com; L.marks = f.marks; L.irisPx = f.irisPx; }
  const up = inp.teeth.filter((t) => t.incisalDown).sort((a, b) => a.cx - b.cx);
  if (up.length < 4) return { lines: L, trusted: false, asym: null, enough: false };
  const med = up.reduce((s, t) => s + t.cx, 0) / up.length;
  let best = 0;
  for (let i = 0; i < up.length - 1; i++) if (Math.abs((up[i].cx + up[i + 1].cx) / 2 - med) < Math.abs((up[best].cx + up[best + 1].cx) / 2 - med)) best = i;
  const A = up[best], B = up[best + 1];
  const midX = inp.region.x0 + (A.bx + A.bw + B.bx) / 2;
  const top = inp.region.y0 + Math.min(A.by, B.by), bot = inp.region.y0 + Math.max(A.by + A.bh, B.by + B.bh);
  L.cw = (A.bw + B.bw) / 2;
  L.ctop = inp.region.y0 + (A.by + B.by) / 2;
  // the dental midline is only trusted when 3 teeth sit each side and the two sides have similar width (same rule as the design)
  const nl = best + 1, nr = up.length - best - 1;
  const first = up[Math.max(0, best - 2)], last = up[Math.min(up.length - 1, best + 3)];
  const spanL = A.bx + A.bw - first.bx, spanR = last.bx + last.bw - B.bx;
  const trusted = nl >= 3 && nr >= 3 && Math.abs(spanL - spanR) / Math.max(spanL, spanR) <= 0.3;
  if (trusted) L.dmid = [{ x: midX, y: top }, { x: midX, y: bot }];
  const lo = Math.max(0, best - 2), hi = Math.min(up.length - 1, best + 3);
  const pts = up.slice(lo, hi + 1).map((t) => ({ x: inp.region.x0 + t.bx + t.bw / 2, y: inp.region.y0 + t.by + t.bh }));
  if (pts.length >= 4) {
    const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length, my = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    let sxx = 0, sxy = 0;
    for (const q of pts) { sxx += (q.x - mx) ** 2; sxy += (q.x - mx) * (q.y - my); }
    const k = sxx ? sxy / sxx : 0;
    const x0 = Math.min(...pts.map((q) => q.x)), x1 = Math.max(...pts.map((q) => q.x));
    L.inc = [{ x: x0, y: my + k * (x0 - mx) }, { x: x1, y: my + k * (x1 - mx) }];
  }
  let asym: Finding | null = null;
  if (trusted) {
    const dh = ((B.by + B.bh) - (A.by + A.bh)) / Math.max(1, (A.bh + B.bh) / 2);
    asym = {
      id: "incisal-asym", label: "Central incisal edges, height difference", value: `${r1(Math.abs(dh) * 100)}% of central length (${dh > 0 ? "patient's left lower" : "patient's right lower"})`,
      level: Math.abs(dh) > 0.12 ? "check" : Math.abs(dh) > 0.06 ? "note" : "ok",
      note: "From the bottom of the two central tooth boxes. Includes any plane cant, and box bottoms are rough (about 5%).",
    };
  }
  return { lines: L, trusted, asym, enough: true };
}

export function screen(inp: ScreenInput): Finding[] {
  const { lines, trusted, asym, enough } = autoLines(inp);
  const out = measureLines(lines);
  if (!enough) {
    out.push({ id: "no-teeth", label: "Upper teeth", value: "n/a", level: "note", note: "Fewer than 4 upper teeth were found, so no dental measurements were made." });
    return out;
  }
  if (!trusted) out.push({ id: "midline-unreliable", label: "Dental midline and central edges", value: "n/a", level: "note", note: "The row found is not symmetric enough (fewer than 3 teeth on a side, or the two sides differ by more than 30% in width, e.g. a missing, broken or merged tooth), so the dental midline and the central edge heights were not measured. Mark them by eye." });
  if (asym) out.push(asym);
  return out;
}
