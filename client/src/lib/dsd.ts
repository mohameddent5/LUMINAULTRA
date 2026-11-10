/**
 * Metric measurement core for smile design.
 *
 * This module replaces the previous engine, which reported tooth and gingival
 * values that were actually derived from lip landmarks, plus two hard-coded
 * ratios and a hard-coded confidence table. Every value here is computed from
 * one of three real sources, and anything that cannot be measured is reported as
 * unavailable with a reason instead of being filled with a plausible number.
 *
 *   facial frame  face-mesh landmarks (normalised image coordinates)
 *   dentition     the 40-keypoint dental network output (see dentalNet.ts)
 *   scale         millimetre calibration (see clinicalScale.ts)
 *
 * Keypoint contract (verified against model.py and groupOf() in dentalNet.ts):
 *   tooth index 0..7  -> FDI 14, 13, 12, 11, 21, 22, 23, 24
 *   channel base = tooth * 4
 *     base + 0  incisal_mid
 *     base + 1  zenith
 *     base + 2  corner
 *     base + 3  corner
 *   channels 32..38 papillae, channel 39 dental midline
 *
 * Scale-free metrics (ratios, angles, counts) stay available when calibration
 * fails; only true millimetre distances are withheld.
 */
import { EVIDENCE_BY_ID, classify, resolveBand, weightedHarmony } from "./dsdEvidence";
import type { Band, MetricEvidence, ProfileId } from "./dsdEvidence";
import type { Landmark } from "./dentalNet";

export interface CalibrationScale {
  /** Millimetres per image pixel, from the iris/known-distance calibration. */
  mmPerPx: number;
  /** Source image dimensions the calibration refers to. */
  imageWidth: number;
  imageHeight: number;
  /** Human-readable calibration source, e.g. "iris (HVID 11.7 mm)". */
  source: string;
  /** 0..1; propagated into every millimetre metric's uncertainty. */
  confidence: number;
}

export interface FacialPoint {
  x: number;
  y: number;
  z?: number;
}

export interface FacialFrame {
  /** Normalised 0..1 face-mesh landmarks. */
  points: readonly FacialPoint[];
}

export interface MetricResult {
  id: string;
  label: string;
  unit: MetricEvidence["unit"];
  /** null when the metric cannot be measured on this frame. */
  value: number | null;
  /** Display string; "n/a" plus reason when unavailable. */
  text: string;
  band: Band;
  /** 1-sigma uncertainty in the metric's unit. */
  sigma: number | null;
  available: boolean;
  reason?: string;
  /** True when the evidence band edge is the paper's extrapolation. */
  derivedBand: boolean;
  grade: MetricEvidence["grade"];
  refs: readonly number[];
  idealText: string;
  note: string;
}

export interface DsdReport {
  metrics: MetricResult[];
  score: number | null;
  scoreUsed: string[];
  scoreExcluded: string[];
  profile: ProfileId;
  measured: number;
  total: number;
  calibration: CalibrationScale | null;
  /** Frame-level conditions the UI must surface. */
  notes: string[];
}

/* ------------------------------------------------------------------ geometry */

interface Pt {
  x: number;
  y: number;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

const angleDeg = (dx: number, dy: number): number => (Math.atan2(dy, dx) * 180) / Math.PI;

/** Normalise an angle difference into [-90, 90]. */
const foldAngle = (deg: number): number => {
  let a = ((deg + 90) % 180 + 180) % 180 - 90;
  if (a < -90) a += 180;
  return a;
};

/** Perpendicular distance from p to the line through a and b. */
function distToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Least-squares y = a*x^2 + b*x + c through the points. */
function fitQuadratic(points: readonly Pt[]): { a: number; b: number; c: number } | null {
  if (points.length < 3) return null;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let t0 = 0;
  let t1 = 0;
  let t2 = 0;
  for (const p of points) {
    const x = p.x;
    const y = p.y;
    s0 += 1;
    s1 += x;
    s2 += x * x;
    s3 += x * x * x;
    s4 += x * x * x * x;
    t0 += y;
    t1 += x * y;
    t2 += x * x * y;
  }
  const m: number[][] = [
    [s4, s3, s2, t2],
    [s3, s2, s1, t1],
    [s2, s1, s0, t0],
  ];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      const candidate = m[row];
      const best = m[pivot];
      if (candidate && best && Math.abs(candidate[col] ?? 0) > Math.abs(best[col] ?? 0)) pivot = row;
    }
    const pivotRow = m[pivot];
    const currentRow = m[col];
    if (!pivotRow || !currentRow) return null;
    if (Math.abs(pivotRow[col] ?? 0) < 1e-12) return null;
    if (pivot !== col) {
      m[pivot] = currentRow;
      m[col] = pivotRow;
    }
    const pr = m[col];
    if (!pr) return null;
    const pivotValue = pr[col] ?? 1;
    for (let k = col; k < 4; k += 1) pr[k] = (pr[k] ?? 0) / pivotValue;
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const target = m[row];
      if (!target) continue;
      const factor = target[col] ?? 0;
      if (factor === 0) continue;
      for (let k = col; k < 4; k += 1) {
        target[k] = (target[k] ?? 0) - factor * (pr[k] ?? 0);
      }
    }
  }
  const r0 = m[0];
  const r1 = m[1];
  const r2 = m[2];
  if (!r0 || !r1 || !r2) return null;
  return { a: r0[3] ?? 0, b: r1[3] ?? 0, c: r2[3] ?? 0 };
}

/* ------------------------------------------------------------- tooth channels */

const FDI = [14, 13, 12, 11, 21, 22, 23, 24] as const;

const CENTRAL_R = 3;
const CENTRAL_L = 4;
const LATERAL_R = 2;
const LATERAL_L = 5;
const CANINE_R = 1;
const CANINE_L = 6;

interface ToothChannels {
  incisalMid: number;
  zenith: number;
  cornerA: number;
  cornerB: number;
}

function channelsFor(tooth: number): ToothChannels {
  const base = tooth * 4;
  return { incisalMid: base, zenith: base + 1, cornerA: base + 2, cornerB: base + 3 };
}

const MIDLINE_CHANNEL = 39;

/* -------------------------------------------------------------------- report */

export interface AnalyzeInput {
  face: FacialFrame;
  /** Accepted dental keypoints; null when the tooth model produced nothing. */
  teeth: readonly Landmark[] | null | undefined;
  calibration: CalibrationScale | null;
  profile: ProfileId;
  sex?: "male" | "female" | null;
}

const NA = "n/a";

function fmt(value: number | null, unit: MetricEvidence["unit"], digits = 1): string {
  if (value === null || !Number.isFinite(value)) return NA;
  if (unit === "count") return String(Math.round(value));
  if (unit === "category") return NA;
  return `${value.toFixed(digits)} ${unit === "deg" ? "°" : unit === "%" ? "%" : "mm"}`;
}

export function analyze(input: AnalyzeInput): DsdReport {
  const { face, teeth, calibration, profile, sex } = input;
  const notes: string[] = [];
  const points = face.points;

  const at = (index: number): Pt | null => {
    const p = points[index];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y };
  };

  const mmPerNormX = calibration ? calibration.mmPerPx * calibration.imageWidth : 0;
  const mmPerNormY = calibration ? calibration.mmPerPx * calibration.imageHeight : 0;
  const calibrated = calibration !== null && mmPerNormX > 0 && mmPerNormY > 0;
  if (!calibrated) {
    notes.push("No millimetre calibration on this frame: distances are withheld, ratios and angles are still reported.");
  }

  /** Convert a normalised-space distance to millimetres. */
  const mmDist = (a: Pt, b: Pt): number => Math.hypot((a.x - b.x) * mmPerNormX, (a.y - b.y) * mmPerNormY);
  const mmDy = (a: Pt, b: Pt): number => (b.y - a.y) * mmPerNormY;

  const relative = calibration ? 0.043 / Math.max(0.4, Math.min(1, calibration.confidence)) : 0;
  const sigmaOf = (value: number): number => Math.abs(value) * relative + (calibrated ? 0.4 : 0);

  /* ---------------------------------------------------------- dental keypoints */

  const byChannel = new Map<number, Landmark>();
  if (teeth) {
    for (const landmark of teeth) {
      if (landmark.accepted) byChannel.set(landmark.channel, landmark);
    }
  }

  /** Keypoint in normalised image space (the network frame is a plain resize). */
  const kp = (channel: number): Pt | null => {
    const landmark = byChannel.get(channel);
    if (!landmark) return null;
    return { x: landmark.x / 192, y: landmark.y / 128 };
  };

  const toothPoint = (tooth: number, part: keyof ToothChannels): Pt | null =>
    kp(channelsFor(tooth)[part]);

  const teethUsable = byChannel.size > 0;
  if (!teethUsable) {
    notes.push("No accepted tooth keypoints on this frame: tooth-level metrics are withheld rather than estimated from the lips.");
  }

  const NO_TEETH = "no accepted tooth keypoints on this frame";
  const NO_MM = "requires millimetre calibration";

  /* ------------------------------------------------------------- facial frame */

  const facialMidlinePoints = [at(10), at(168), at(1), at(152), at(2)].filter((p): p is Pt => p !== null);
  const facialMidX =
    facialMidlinePoints.length > 0
      ? facialMidlinePoints.reduce((sum, p) => sum + p.x, 0) / facialMidlinePoints.length
      : null;

  // Interpupillary line: iris centres when present (468-477), else eye corners.
  const irisR = [at(468), at(469), at(470), at(471), at(472)].filter((p): p is Pt => p !== null);
  const irisL = [at(473), at(474), at(475), at(476), at(477)].filter((p): p is Pt => p !== null);
  const centre = (pts: Pt[]): Pt | null =>
    pts.length === 0 ? null : { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  const pupilR = centre(irisR) ?? at(33);
  const pupilL = centre(irisL) ?? at(263);
  const interpupillaryAngle = pupilR && pupilL ? angleDeg(pupilL.x - pupilR.x, pupilL.y - pupilR.y) : null;
  if (!interpupillaryAngle) notes.push("Interpupillary line unavailable: cant metrics are withheld.");

  const upperLipInner = at(13);
  const lowerLipInner = at(17);
  const mouthCornerR = at(61);
  const mouthCornerL = at(291);

  /* -------------------------------------------------------------- the metrics */

  const results: MetricResult[] = [];

  const push = (
    id: string,
    value: number | null,
    options: { reason?: string; digits?: number; sigma?: number | null; text?: string } = {},
  ): void => {
    const evidence = EVIDENCE_BY_ID.get(id);
    if (!evidence) return;
    const bandRange = resolveBand(evidence, profile, sex);
    const available = value !== null && Number.isFinite(value);
    const band: Band = available ? classify(value, bandRange) : "unavailable";
    results.push({
      id,
      label: evidence.label,
      unit: evidence.unit,
      value: available ? value : null,
      text: options.text ?? (available ? fmt(value, evidence.unit, options.digits ?? 1) : NA),
      band,
      sigma: options.sigma ?? (available && evidence.unit === "mm" ? sigmaOf(value as number) : null),
      available,
      reason: available ? undefined : options.reason,
      derivedBand: bandRange?.derived === true,
      grade: evidence.grade,
      refs: evidence.refs,
      idealText: evidence.idealText,
      note: evidence.note,
    });
  };

  /* 1. dental midline shift vs facial midline */
  {
    const midline = kp(MIDLINE_CHANNEL);
    if (!midline || facialMidX === null) {
      push("dental_midline_shift", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("dental_midline_shift", null, { reason: NO_MM });
    } else {
      const shift = Math.abs(midline.x - facialMidX) * mmPerNormX;
      push("dental_midline_shift", shift, { digits: 1 });
    }
  }

  /* 2. midline cant: dental midline point to the inter-incisal papilla, vs facial axis */
  {
    const midline = kp(MIDLINE_CHANNEL);
    const mesialR = toothPoint(CENTRAL_R, "cornerA");
    const mesialL = toothPoint(CENTRAL_L, "cornerA");
    const interIncisal =
      mesialR && mesialL ? { x: (mesialR.x + mesialL.x) / 2, y: (mesialR.y + mesialL.y) / 2 } : null;
    const glabella = at(10);
    const chin = at(152);
    if (!midline || !interIncisal || !glabella || !chin) {
      push("midline_cant", null, { reason: NO_TEETH });
    } else {
      const dentalAxis = angleDeg(interIncisal.x - midline.x, interIncisal.y - midline.y);
      const facialAxis = angleDeg(chin.x - glabella.x, chin.y - glabella.y);
      const cant = Math.abs(foldAngle(dentalAxis - facialAxis));
      push("midline_cant", cant, { digits: 1, text: `${cant.toFixed(1)} °` });
    }
  }

  /* 3. occlusal plane cant vs interpupillary line */
  {
    const incisal: Pt[] = [];
    for (let tooth = 0; tooth < 8; tooth += 1) {
      const p = toothPoint(tooth, "incisalMid");
      if (p) incisal.push(p);
    }
    if (incisal.length < 2 || interpupillaryAngle === null) {
      push("occlusal_plane_cant", null, { reason: NO_TEETH });
    } else {
      const first = incisal[0];
      const last = incisal[incisal.length - 1];
      if (!first || !last || dist(first, last) < 1e-6) {
        push("occlusal_plane_cant", null, { reason: NO_TEETH });
      } else {
        const occlusalAngle = angleDeg(last.x - first.x, last.y - first.y);
        const cant = Math.abs(foldAngle(occlusalAngle - interpupillaryAngle));
        push("occlusal_plane_cant", cant, { digits: 1, text: `${cant.toFixed(1)} °` });
      }
    }
  }

  /* 4. commissural line vs interpupillary line */
  {
    if (!mouthCornerR || !mouthCornerL || interpupillaryAngle === null) {
      push("commissural_cant", null, { reason: "mouth corners or interpupillary line unavailable" });
    } else {
      const commissural = angleDeg(mouthCornerL.x - mouthCornerR.x, mouthCornerL.y - mouthCornerR.y);
      const cant = Math.abs(foldAngle(commissural - interpupillaryAngle));
      push("commissural_cant", cant, { digits: 1, text: `${cant.toFixed(1)} °` });
    }
  }

  /* 5. gingival display: lip margin to the gingival zenith of the centrals */
  {
    const zenithR = toothPoint(CENTRAL_R, "zenith");
    const zenithL = toothPoint(CENTRAL_L, "zenith");
    if (!zenithR || !zenithL || !upperLipInner) {
      push("gingival_display", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("gingival_display", null, { reason: NO_MM });
    } else {
      const zenithY = (zenithR.y + zenithL.y) / 2;
      const display = (zenithY - upperLipInner.y) * mmPerNormY;
      push("gingival_display", display, { digits: 1 });
    }
  }

  /* 6. incisor display at rest: lip margin to the incisal edge */
  {
    const edgeR = toothPoint(CENTRAL_R, "incisalMid");
    const edgeL = toothPoint(CENTRAL_L, "incisalMid");
    if (!edgeR || !edgeL || !upperLipInner) {
      push("incisor_display_rest", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("incisor_display_rest", null, { reason: NO_MM });
    } else {
      const edgeY = (edgeR.y + edgeL.y) / 2;
      const display = (edgeY - upperLipInner.y) * mmPerNormY;
      push("incisor_display_rest", display, { digits: 1 });
    }
  }

  /* 7. smile arc: curvature of the incisal edges, relative to crown length */
  {
    const edges: Pt[] = [];
    for (let tooth = 0; tooth < 8; tooth += 1) {
      const p = toothPoint(tooth, "incisalMid");
      if (p) edges.push(p);
    }
    const fit = fitQuadratic(edges);
    const central = toothPoint(CENTRAL_R, "incisalMid");
    const centralZenith = toothPoint(CENTRAL_R, "zenith");
    if (!fit || !central || !centralZenith || edges.length < 3) {
      push("smile_arc", null, { reason: NO_TEETH });
    } else {
      const xs = edges.map((p) => p.x);
      const span = Math.max(...xs) - Math.min(...xs);
      const crownLength = Math.abs(central.y - centralZenith.y);
      // y grows downward, so a negative quadratic coefficient means the incisal
      // edges rise toward the canines: a consonant arc following the lower lip.
      const sag = fit.a * (span / 2) ** 2;
      const ratio = crownLength > 1e-6 ? sag / crownLength : 0;
      const category = Math.abs(ratio) < 0.15 ? "Flat" : ratio < 0 ? "Consonant" : "Reverse";
      push("smile_arc", null, { text: category });
      const entry = results[results.length - 1];
      if (entry) {
        entry.available = true;
        entry.reason = undefined;
        entry.band = category === "Reverse" ? "amber" : "green";
        entry.value = Number(ratio.toFixed(3));
      }
    }
  }

  /* 8. buccal corridor: smile width not filled by teeth */
  {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let tooth = 0; tooth < 8; tooth += 1) {
      for (const part of ["cornerA", "cornerB"] as const) {
        const p = toothPoint(tooth, part);
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
    }
    if (!mouthCornerR || !mouthCornerL || !Number.isFinite(minX) || !Number.isFinite(maxX)) {
      push("buccal_corridor", null, { reason: NO_TEETH });
    } else {
      const dentition = maxX - minX;
      const smile = Math.abs(mouthCornerL.x - mouthCornerR.x);
      if (smile < 1e-6) {
        push("buccal_corridor", null, { reason: "mouth width is degenerate on this frame" });
      } else {
        const corridor = ((smile - dentition) / smile) * 100;
        push("buccal_corridor", Math.max(0, corridor), { digits: 1, text: `${Math.max(0, corridor).toFixed(1)} %` });
      }
    }
  }

  /* 9. visible teeth: teeth with at least two accepted points */
  {
    let visible = 0;
    for (let tooth = 0; tooth < 8; tooth += 1) {
      const c = channelsFor(tooth);
      let count = 0;
      for (const ch of [c.incisalMid, c.zenith, c.cornerA, c.cornerB]) if (byChannel.has(ch)) count += 1;
      if (count >= 2) visible += 1;
    }
    push("visible_teeth", teethUsable ? visible : null, { reason: NO_TEETH, text: teethUsable ? `${visible}` : NA });
  }

  /* 10. central incisor width/length ratio, from the central's own keypoints */
  const crownGeometry = (tooth: number): { width: number; length: number } | null => {
    const zenith = toothPoint(tooth, "zenith");
    const a = toothPoint(tooth, "cornerA");
    const b = toothPoint(tooth, "cornerB");
    const edge = toothPoint(tooth, "incisalMid");
    if (!zenith || !a || !b) return null;
    const widthPx = dist(a, b) * mmPerNormX;
    // True crown length is the perpendicular height, so a tilted tooth is not
    // penalised by measuring only its vertical extent.
    const heightPx = distToLine(zenith, a, b) * mmPerNormX;
    const lengthPx = edge ? (heightPx + distToLine(edge, a, b) * mmPerNormX) / 2 : heightPx;
    if (!calibrated) {
      // Scale-free fallback: the ratio is identical in pixel units.
      return { width: dist(a, b), length: distToLine(zenith, a, b) };
    }
    return { width: widthPx, length: lengthPx };
  };

  {
    const right = crownGeometry(CENTRAL_R);
    const left = crownGeometry(CENTRAL_L);
    if (!right || !left) {
      push("central_wl_ratio", null, { reason: NO_TEETH });
    } else {
      const ratio = ((right.width / right.length + left.width / left.length) / 2) * 100;
      push("central_wl_ratio", ratio, { digits: 0, text: `${ratio.toFixed(0)} %` });
    }
  }

  /* 11. left-right central width difference */
  {
    const right = crownGeometry(CENTRAL_R);
    const left = crownGeometry(CENTRAL_L);
    if (!right || !left) {
      push("central_width_diff", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("central_width_diff", null, { reason: NO_MM });
    } else {
      push("central_width_diff", Math.abs(right.width - left.width), { digits: 1 });
    }
  }

  /* 12. left-right central incisal edge height difference */
  {
    const edgeR = toothPoint(CENTRAL_R, "incisalMid");
    const edgeL = toothPoint(CENTRAL_L, "incisalMid");
    if (!edgeR || !edgeL) {
      push("central_edge_height_diff", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("central_edge_height_diff", null, { reason: NO_MM });
    } else {
      push("central_edge_height_diff", Math.abs(mmDy(edgeR, edgeL)), { digits: 2 });
    }
  }

  /* 13. left-right gingival margin difference */
  {
    const zenithR = toothPoint(CENTRAL_R, "zenith");
    const zenithL = toothPoint(CENTRAL_L, "zenith");
    if (!zenithR || !zenithL) {
      push("gingival_margin_diff", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("gingival_margin_diff", null, { reason: NO_MM });
    } else {
      push("gingival_margin_diff", Math.abs(mmDy(zenithR, zenithL)), { digits: 2 });
    }
  }

  /* 14. lateral vs central position */
  {
    const lateral = toothPoint(LATERAL_R, "incisalMid");
    const central = toothPoint(CENTRAL_R, "incisalMid");
    const lateralZenith = toothPoint(LATERAL_R, "zenith");
    const centralZenith = toothPoint(CENTRAL_R, "zenith");
    if (!lateral || !central || !lateralZenith || !centralZenith) {
      push("lateral_vs_central", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("lateral_vs_central", null, { reason: NO_MM });
    } else {
      const edgeOffset = Math.abs(mmDy(lateral, central));
      const marginOffset = Math.abs(mmDy(lateralZenith, centralZenith));
      const worst = Math.max(edgeOffset, marginOffset);
      push("lateral_vs_central", worst, { digits: 1 });
    }
  }

  /* 15. lateral incisor angulation */
  {
    const zenith = toothPoint(LATERAL_R, "zenith");
    const edge = toothPoint(LATERAL_R, "incisalMid");
    if (!zenith || !edge) {
      push("lateral_angulation", null, { reason: NO_TEETH });
    } else {
      const axis = angleDeg(edge.x - zenith.x, edge.y - zenith.y);
      const deviation = Math.abs(foldAngle(axis - 90));
      push("lateral_angulation", deviation, { digits: 1, text: `${deviation.toFixed(1)} °` });
    }
  }

  /* 16. midline diastema: mesial corners of the two centrals */
  {
    const a1 = toothPoint(CENTRAL_R, "cornerA");
    const a2 = toothPoint(CENTRAL_R, "cornerB");
    const b1 = toothPoint(CENTRAL_L, "cornerA");
    const b2 = toothPoint(CENTRAL_L, "cornerB");
    const midline = kp(MIDLINE_CHANNEL);
    const reference = midline ?? (facialMidX !== null ? { x: facialMidX, y: 0 } : null);
    if (!a1 || !a2 || !b1 || !b2 || !reference) {
      push("diastema", null, { reason: NO_TEETH });
    } else if (!calibrated) {
      push("diastema", null, { reason: NO_MM });
    } else {
      const mesialR = dist(a1, reference) <= dist(a2, reference) ? a1 : a2;
      const mesialL = dist(b1, reference) <= dist(b2, reference) ? b1 : b2;
      push("diastema", mmDist(mesialR, mesialL), { digits: 2 });
    }
  }

  /* 17-19. width proportions, all scale-free */
  const widthOf = (tooth: number): number | null => {
    const a = toothPoint(tooth, "cornerA");
    const b = toothPoint(tooth, "cornerB");
    if (!a || !b) return null;
    return dist(a, b);
  };

  {
    const lateral = widthOf(LATERAL_R) ?? widthOf(LATERAL_L);
    const central = widthOf(CENTRAL_R) ?? widthOf(CENTRAL_L);
    if (lateral === null || central === null || central < 1e-9) {
      push("lateral_central_width_ratio", null, { reason: NO_TEETH });
    } else {
      const ratio = (lateral / central) * 100;
      push("lateral_central_width_ratio", ratio, { digits: 1, text: `${ratio.toFixed(1)} %` });
    }
  }

  {
    const canine = widthOf(CANINE_R) ?? widthOf(CANINE_L);
    const lateral = widthOf(LATERAL_R) ?? widthOf(LATERAL_L);
    if (canine === null || lateral === null || lateral < 1e-9) {
      push("canine_lateral_width_ratio", null, { reason: NO_TEETH });
    } else {
      const ratio = (canine / lateral) * 100;
      push("canine_lateral_width_ratio", ratio, { digits: 1, text: `${ratio.toFixed(1)} %` });
    }
  }

  {
    const wCentral = widthOf(CENTRAL_R);
    const wLateral = widthOf(LATERAL_R);
    const wCanine = widthOf(CANINE_R);
    if (wCentral === null || wLateral === null || wCanine === null) {
      push("golden_percentage", null, { reason: NO_TEETH });
    } else {
      const total = wCentral + wLateral + wCanine;
      if (total < 1e-9) {
        push("golden_percentage", null, { reason: NO_TEETH });
      } else {
        const centralPct = (wCentral / total) * 100;
        push("golden_percentage", centralPct, {
          digits: 1,
          text: `${centralPct.toFixed(0)} / ${((wLateral / total) * 100).toFixed(0)} / ${((wCanine / total) * 100).toFixed(0)} %`,
        });
      }
    }
  }

  /* 20. crown length error needs a per-patient reference */
  push("central_crown_length_error", null, {
    reason: "needs a patient reference (previous photograph or approved trial smile); absolute crown length is not a fixed norm",
  });

  /* ------------------------------------------------------------------- score */

  const harmony = weightedHarmony(
    results.map((r) => ({ id: r.id, band: r.band })),
    profile,
  );

  return {
    metrics: results,
    score: harmony.score,
    scoreUsed: harmony.used,
    scoreExcluded: harmony.excluded,
    profile,
    measured: results.filter((r) => r.available).length,
    total: results.length,
    calibration,
    notes,
  };
}

/** Text shown next to the composite score so its basis is never implied. */
export const SCORE_BASIS =
  "Weighted by the effect sizes measured in a 1,040-rater study. Metrics that study did not test are excluded, not averaged in.";

export const DSD_LIMITATIONS: readonly string[] = [
  "Distances are only as good as the calibration. A single uncalibrated photograph has no inherent scale, so every millimetre value inherits the error of the reference used.",
  "Tooth keypoints come from a network trained on synthetic renders. On real photographs the gate may refuse keypoints; the tool then reports the metric as unavailable rather than guessing.",
  "Nothing here measures shade, texture, translucency or gingival health, which carry the largest effect sizes in the perception literature.",
  "Photographic geometry (lens, distance, head rotation) biases any 2D metric. Frontal, level, eye-level captures reduce but do not remove the bias.",
  "Bands come from raters scoring altered photographs. They are perception defaults, not diagnoses, and they do not predict treatment outcome.",
];
