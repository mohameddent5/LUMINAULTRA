/**
 * DSD protocol layer.
 *
 * Encodes "DSD Domain Guide for Developers" (uploaded clinical reference) as
 * code so the app follows the guide's developer checklist:
 *   1. normalise to the pupil line
 *   2. calibrate to mm and show uncertainty
 *   3. store view type with every landmark
 *   4. compute measurements, compare to CONFIGURABLE norms, explain the result
 *   5. everything editable by the dentist
 *   6. label simulations as simulations
 *   7. protect patient data
 *
 * Per the guide (p1, p11): these numeric values are widely used clinical norms,
 * NOT absolute rules. They are exposed as configurable parameters and must
 * never be presented as truth. This module is pure (no DOM, no network) so it
 * can be unit-tested and reused by the camera pipeline.
 */

export const GUIDE_SOURCE = "DSD Domain Guide for Developers";

/* ------------------------------------------------------------------ *
 * 1. Capture protocol — the standard photo set (guide 4.1)
 * ------------------------------------------------------------------ */

export type ViewId =
  | "rest"
  | "social"
  | "big"
  | "retracted-frontal"
  | "retracted-lateral"
  | "occlusal"
  | "profile"
  | "phonetic"
  | "shade";

export interface PhotoView {
  id: ViewId;
  label: string;
  shows: string;
  measures: string[];
  /** Views without which a full design cannot be produced. */
  required: boolean;
}

export const PHOTO_VIEWS: PhotoView[] = [
  {
    id: "rest",
    label: "Full face — rest",
    shows: "Whole face, lips relaxed",
    measures: ["Facial midline", "Lip length", "Rest incisal display"],
    required: true,
  },
  {
    id: "social",
    label: "Full face — social smile",
    shows: "Natural-looking smile",
    measures: ["Smile arc", "Buccal corridors", "Dental midline"],
    required: true,
  },
  {
    id: "big",
    label: "Full face — big smile",
    shows: "Maximum smile",
    measures: ["Gingival display (gummy smile)"],
    required: false,
  },
  {
    id: "retracted-frontal",
    label: "Retracted frontal",
    shows: "Teeth only, lips held away",
    measures: ["Tooth proportions", "Gingival margins", "Contacts"],
    required: true,
  },
  {
    id: "retracted-lateral",
    label: "Retracted lateral (L / R)",
    shows: "Side view of the teeth",
    measures: ["Tooth inclination", "Canine relationship"],
    required: false,
  },
  {
    id: "occlusal",
    label: "Occlusal (mirror) views",
    shows: "Upper / lower arches from above",
    measures: ["Arch shape", "Tooth rotations"],
    required: false,
  },
  {
    id: "profile",
    label: "Profile (side face)",
    shows: "Side of the face",
    measures: ["Lip protrusion", "E-line", "Nose–lip–chin balance"],
    required: false,
  },
  {
    id: "phonetic",
    label: "Phonetic images (M / F / V / S)",
    shows: "Patient saying the sounds",
    measures: ["Functional tooth length and position"],
    required: false,
  },
  {
    id: "shade",
    label: "Shade photo",
    shows: "Teeth with a shade tab",
    measures: ["Shade communication to the lab"],
    required: false,
  },
];

/** The guide's warning: the same teeth look different depending on lip position. */
export const VIEW_TYPE_RULE =
  "A design made on a resting-lip photo and one made on a smiling photo answer different questions. Always store the view type with every landmark set.";

/* ------------------------------------------------------------------ *
 * 2. Phonetic validation (guide 4.3)
 * ------------------------------------------------------------------ */

export interface PhoneticCheck {
  sound: string;
  cue: string;
  expect: string;
  validates: string;
}

export const PHONETIC_CHECKS: PhoneticCheck[] = [
  {
    sound: "M",
    cue: '"M" or a relaxed "Mississippi"',
    expect: "Lips at rest; incisal edge slightly visible",
    validates: "Resting incisor display (lip support)",
  },
  {
    sound: "F / V",
    cue: '"F" or "V"',
    expect: "Upper incisal edges lightly touch the wet-dry border of the lower lip",
    validates: "Incisal edge length and position (the classic test)",
  },
  {
    sound: "S",
    cue: '"S" or "Sixty-six"',
    expect: "Upper and lower front teeth come close, with about 1 mm gap",
    validates: "Vertical dimension and incisal edge position",
  },
];

/* ------------------------------------------------------------------ *
 * 3. Tooth reference data (guide 2.1, 2.2, 5)
 * ------------------------------------------------------------------ */

export interface ToothRef {
  fdi: number;
  name: string;
  nickname: string;
  /** Typical crown width range in mm. */
  widthMm: [number, number];
  /** Typical crown length range in mm; null for teeth the guide gives width only. */
  lengthMm: [number, number] | null;
  /** Share of the central incisor's apparent width (golden proportion). */
  goldenShare: number;
  /** Share of the total width of the six anterior teeth, in percent. */
  goldenPercent: number;
}

/** Upper anterior teeth in FDI order, patient's right first (13 12 11 | 21 22 23). */
export const UPPER_ANTERIOR: ToothRef[] = [
  {
    fdi: 13,
    name: "Upper right canine",
    nickname: "Canine",
    widthMm: [7.0, 8.0],
    lengthMm: [10, 11],
    goldenShare: 0.382,
    goldenPercent: 10,
  },
  {
    fdi: 12,
    name: "Upper right lateral incisor",
    nickname: "Lateral",
    widthMm: [6.0, 7.0],
    lengthMm: [8.5, 9.5],
    goldenShare: 0.618,
    goldenPercent: 15,
  },
  {
    fdi: 11,
    name: "Upper right central incisor",
    nickname: "Central",
    widthMm: [8.5, 9.0],
    lengthMm: [10, 11],
    goldenShare: 1.0,
    goldenPercent: 25,
  },
  {
    fdi: 21,
    name: "Upper left central incisor",
    nickname: "Central",
    widthMm: [8.5, 9.0],
    lengthMm: [10, 11],
    goldenShare: 1.0,
    goldenPercent: 25,
  },
  {
    fdi: 22,
    name: "Upper left lateral incisor",
    nickname: "Lateral",
    widthMm: [6.0, 7.0],
    lengthMm: [8.5, 9.5],
    goldenShare: 0.618,
    goldenPercent: 15,
  },
  {
    fdi: 23,
    name: "Upper left canine",
    nickname: "Canine",
    widthMm: [7.0, 8.0],
    lengthMm: [10, 11],
    goldenShare: 0.382,
    goldenPercent: 10,
  },
];

/** Premolars, seen in wide smiles (guide 2.1). */
export const UPPER_PREMOLARS: ToothRef[] = [
  { fdi: 14, name: "Upper right first premolar", nickname: "First premolar", widthMm: [6.5, 7.0], lengthMm: null, goldenShare: 0, goldenPercent: 0 },
  { fdi: 15, name: "Upper right second premolar", nickname: "Second premolar", widthMm: [6.5, 7.0], lengthMm: null, goldenShare: 0, goldenPercent: 0 },
  { fdi: 24, name: "Upper left first premolar", nickname: "First premolar", widthMm: [6.5, 7.0], lengthMm: null, goldenShare: 0, goldenPercent: 0 },
  { fdi: 25, name: "Upper left second premolar", nickname: "Second premolar", widthMm: [6.5, 7.0], lengthMm: null, goldenShare: 0, goldenPercent: 0 },
];

/** Golden proportion of apparent widths, front to back (guide 5). */
export const GOLDEN_PROPORTION = { central: 1.0, lateral: 0.618, canine: 0.382 } as const;

/** RED proportion: each tooth is the same percentage of the one before it. */
export const RED_PROPORTION = { minPercent: 70, maxPercent: 80 } as const;

/** Golden percentage: apparent width as a share of the six anterior teeth. */
export const GOLDEN_PERCENTAGE = { central: 25, lateral: 15, canine: 10 } as const;

/** FDI quadrant / tooth helpers (guide 2.2). */
export function fdiLabel(fdi: number): string {
  const quadrants: Record<number, string> = { 1: "upper right", 2: "upper left", 3: "lower left", 4: "lower right" };
  const quadrant = Math.floor(fdi / 10);
  const tooth = fdi % 10;
  return `${fdi} — ${quadrants[quadrant] ?? "unknown"} tooth ${tooth}`;
}

/* ------------------------------------------------------------------ *
 * 4. Configurable norms (guide 5, checklist 4)
 * ------------------------------------------------------------------ */

export interface Norm {
  id: string;
  label: string;
  unit: string;
  /** Human-readable target, shown beside the measurement. */
  target: string;
  min: number;
  max: number;
  /** Optional borderline band outside the target before it counts as outside. */
  reviewBelow?: number;
  reviewAbove?: number;
  rationale: string;
}

export const NORMS: Norm[] = [
  {
    id: "widthLength",
    label: "Width/length ratio (central incisor)",
    unit: "%",
    target: "75–80%",
    min: 75,
    max: 80,
    reviewBelow: 70,
    reviewAbove: 85,
    rationale: "Under ~70% looks long, over ~85% looks square or short.",
  },
  {
    id: "midlineDeviation",
    label: "Dental midline vs facial midline",
    unit: "mm",
    target: "0–2 mm",
    min: 0,
    max: 2,
    reviewAbove: 3,
    rationale: "Shifts under ~2 mm are often tolerated; tilt matters more than shift.",
  },
  {
    id: "gingivalZenithAsymmetry",
    label: "Gingival zenith asymmetry (left vs right)",
    unit: "mm",
    target: "0–1 mm",
    min: 0,
    max: 1,
    reviewAbove: 1.5,
    rationale: "Right and left centrals should be symmetrical; over ~1 mm is noticeable.",
  },
  {
    id: "gummyDisplay",
    label: "Gingival display at full smile",
    unit: "mm",
    target: "0–2 mm",
    min: 0,
    max: 2,
    reviewAbove: 3,
    rationale: "Over ~3 mm of gum show is considered excessive by many clinicians.",
  },
  {
    id: "overjet",
    label: "Overjet (horizontal overlap)",
    unit: "mm",
    target: "2–3 mm",
    min: 2,
    max: 3,
    reviewBelow: 1,
    reviewAbove: 4,
    rationale: "Lengthening or pushing out front teeth changes the overjet.",
  },
  {
    id: "overbite",
    label: "Overbite (vertical overlap)",
    unit: "mm",
    target: "2–3 mm",
    min: 2,
    max: 3,
    reviewBelow: 1,
    reviewAbove: 4,
    rationale: "Normal is about 2–3 mm, roughly 20–30% of the lower incisors.",
  },
  {
    id: "lateralEdgeShort",
    label: "Lateral incisal edge vs central (gull wing)",
    unit: "mm",
    target: "0.5–1 mm shorter",
    min: 0.5,
    max: 1,
    reviewAbove: 1.5,
    rationale: "Classic gull-wing: central and canine edges level, lateral slightly shorter.",
  },
  {
    id: "lateralZenithLower",
    label: "Lateral gingival zenith vs central",
    unit: "mm",
    target: "≈1 mm lower",
    min: 0.5,
    max: 1.5,
    reviewAbove: 2,
    rationale: "Central and canine zeniths roughly level; the lateral sits about 1 mm lower.",
  },
  {
    id: "redProportion",
    label: "RED proportion (tooth to the one before)",
    unit: "%",
    target: "70–80%",
    min: 70,
    max: 80,
    reviewBelow: 65,
    reviewAbove: 85,
    rationale: "More flexible than the golden proportion; many clinicians prefer it.",
  },
];

export type NormStatus = "within" | "review" | "outside";

export interface NormResult {
  status: NormStatus;
  /** Measurement and norm side by side, e.g. "82% — target 75–80%". */
  text: string;
  detail: string;
}

function fmtValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  return unit === "%" ? `${rounded}%` : `${rounded} ${unit}`;
}

/**
 * Compare a measurement to its norm. Always returns the number AND the norm,
 * as the guide requires, so the UI can explain the result rather than just flag it.
 */
export function evaluateNorm(id: string, value: number): NormResult {
  const norm = NORMS.find((n) => n.id === id);
  if (!norm) throw new Error(`Unknown norm: ${id}`);
  if (!Number.isFinite(value)) {
    return { status: "outside", text: `n/a — target ${norm.target}`, detail: "Measurement unavailable; not estimated." };
  }

  const measured = fmtValue(value, norm.unit);
  const reviewBelow = norm.reviewBelow ?? norm.min;
  const reviewAbove = norm.reviewAbove ?? norm.max;

  if (value >= norm.min && value <= norm.max) {
    return { status: "within", text: `${measured} — target ${norm.target}`, detail: norm.rationale };
  }
  const borderline = value >= reviewBelow && value <= reviewAbove;
  return {
    status: borderline ? "review" : "outside",
    text: `${measured} — target ${norm.target}`,
    detail: norm.rationale,
  };
}

/* ------------------------------------------------------------------ *
 * 5. Presets the clinician can override (guide 5, 8.2)
 * ------------------------------------------------------------------ */

export type PresetId = "natural" | "youthful" | "bold";

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  /** Width/length target range for the central incisor, in percent. */
  widthLength: [number, number];
  /** Resting incisal display range, in mm. */
  restDisplayMm: [number, number];
}

export const PRESETS: Record<PresetId, Preset> = {
  natural: {
    id: "natural",
    label: "Natural",
    description: "Balanced and age-typical. The guide's baseline; older faces naturally show less incisor.",
    widthLength: [75, 80],
    restDisplayMm: [1, 3],
  },
  youthful: {
    id: "youthful",
    label: "Youthful",
    description: "Slightly fuller display, within the guide's 1–3 mm younger-adult range.",
    widthLength: [76, 82],
    restDisplayMm: [2, 3],
  },
  bold: {
    id: "bold",
    label: "Bold",
    description: "Squarer, more dominant centrals. Still inside the 70–85% envelope.",
    widthLength: [80, 85],
    restDisplayMm: [1, 3],
  },
};

export const PRESET_RULE =
  "Do not hard-code one ideal smile. Offer presets and let the clinician and patient choose.";

/* ------------------------------------------------------------------ *
 * 6. Shape classifications (guide 5, 7.2)
 * ------------------------------------------------------------------ */

export type SmileArcType = "consonant" | "flat" | "reverse";

export interface SmileArcResult {
  type: SmileArcType;
  /** Vertical drop of the canine edge below the central edge, in mm. */
  dropMm: number;
  note: string;
}

/**
 * Classify the smile arc from incisal edge heights.
 * Image coordinates: y grows downward. A consonant arc follows the lower lip,
 * so the canine edges sit lower (larger y) than the central edges.
 */
export function classifySmileArc(
  centralEdgeY: number,
  canineEdgeY: number,
  pxPerMm: number,
): SmileArcResult {
  if (!Number.isFinite(centralEdgeY) || !Number.isFinite(canineEdgeY) || !(pxPerMm > 0)) {
    return { type: "flat", dropMm: NaN, note: "Landmarks unavailable; arc not classified." };
  }
  const dropMm = (canineEdgeY - centralEdgeY) / pxPerMm;
  if (dropMm > 0.3) {
    return { type: "consonant", dropMm, note: "Edges follow the lower lip curve — the ideal 'consonant' arc." };
  }
  if (dropMm < -0.3) {
    return { type: "reverse", dropMm, note: "Edges rise at the corners — a reverse arc reads as older or less attractive." };
  }
  return { type: "flat", dropMm, note: "Edges are level — a flat arc loses the natural curve." };
}

export type EdgePattern = "gull-wing" | "level" | "lateral-dominant";

export interface EdgeLineResult {
  pattern: EdgePattern;
  /** How much shorter the lateral is than the central, in mm. */
  lateralShortMm: number;
  note: string;
}

/**
 * Classify the incisal edge line (guide 5): central and canine roughly level,
 * lateral about 0.5–1 mm shorter. A shorter tooth's edge sits higher in the
 * image (smaller y), so lateralShortMm = (lateralY - centralY) / pxPerMm.
 */
export function classifyEdgeLine(
  centralEdgeY: number,
  lateralEdgeY: number,
  canineEdgeY: number,
  pxPerMm: number,
): EdgeLineResult {
  if (!(pxPerMm > 0) || ![centralEdgeY, lateralEdgeY, canineEdgeY].every(Number.isFinite)) {
    return { pattern: "level", lateralShortMm: NaN, note: "Landmarks unavailable; edge line not classified." };
  }
  const lateralShortMm = (lateralEdgeY - centralEdgeY) / pxPerMm;
  if (lateralShortMm >= 0.5 && lateralShortMm <= 1.0) {
    return {
      pattern: "gull-wing",
      lateralShortMm,
      note: "Classic gull wing: central and canine level, lateral 0.5–1 mm shorter.",
    };
  }
  if (lateralShortMm < 0.5) {
    return {
      pattern: "lateral-dominant",
      lateralShortMm,
      note: "Lateral is not shorter than the central; the gull-wing step is missing.",
    };
  }
  return {
    pattern: "level",
    lateralShortMm,
    note: "Lateral drop exceeds the typical 0.5–1 mm; check the canine level too.",
  };
}

/**
 * Angle between the incisal edge line and the interpupillary line, in degrees.
 * The guide's horizontal reference is the pupil line, never the image edge.
 */
export function edgeLineCantDeg(
  leftPupil: { x: number; y: number },
  rightPupil: { x: number; y: number },
  leftEdge: { x: number; y: number },
  rightEdge: { x: number; y: number },
): number {
  const pupilAngle = Math.atan2(rightPupil.y - leftPupil.y, rightPupil.x - leftPupil.x);
  const edgeAngle = Math.atan2(rightEdge.y - leftEdge.y, rightEdge.x - leftEdge.x);
  const delta = ((edgeAngle - pupilAngle) * 180) / Math.PI;
  return Math.abs(((delta + 180) % 360) - 180);
}

/** Head pose guard: warn when landmarks are unreliable (guide 8.2). */
export function poseWarning(yawDeg: number, pitchDeg: number): string | null {
  if (Math.abs(yawDeg) > 10 || Math.abs(pitchDeg) > 10) {
    return "Head is rotated or tilted; landmarks are unreliable. Re-capture facing the camera.";
  }
  if (Math.abs(yawDeg) > 5 || Math.abs(pitchDeg) > 5) {
    return "Slight head rotation detected; measurements carry extra uncertainty.";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 7. Safety, disclaimers and edge cases (guide 8)
 * ------------------------------------------------------------------ */

export const SAFETY_RULES: string[] = [
  "AI proposes, the dentist decides. Every design must be editable.",
  "Label AI output as a suggestion until a clinician approves it.",
  "Never claim a diagnosis. This software plans aesthetics; it does not diagnose gum disease, cavities, bone loss, or whether treatment is advisable.",
  "Show the measurement and the norm side by side, with the norm configurable per clinic.",
  "Expose confidence scores and allow manual correction of every landmark.",
  "Keep original photos immutable; edits are layers and versions.",
];

export const EDGE_CASES: { situation: string; action: string }[] = [
  { situation: "Head tilted or rotated", action: "Normalise to the pupil line; warn when yaw or pitch is large." },
  { situation: "Smile does not show enough teeth", action: "Request a better photo or mark measurements as low confidence." },
  { situation: "Missing teeth, implants, crowns, bridges", action: "Detect and mark as not natural; do not use them for natural proportions." },
  { situation: "Braces, aligner attachments, heavy staining", action: "Reduce confidence and notify the user." },
  { situation: "Very crowded or rotated teeth", action: "Flag that orthodontics may be better than veneers." },
  { situation: "Worn or short teeth (bruxism)", action: "Flag for occlusion assessment; do not simply lengthen them." },
  { situation: "Dentures", action: "Different workflow; standard DSD references do not apply." },
  { situation: "Children, mixed dentition", action: "Out of scope for adult DSD; warn." },
  { situation: "Ethnic and age diversity", action: "Never hard-code one ideal smile; offer presets." },
  { situation: "Phone wide-angle distortion", action: "Flag it; measurements near the image edge are off." },
];

export const PRIVACY_RULES: string[] = [
  "Face photos and dental records are health data: encrypt in transit and at rest, control access, keep consent records.",
  "Obtain explicit patient consent for AI processing and for any use of images in training or marketing.",
  "Follow local rules (Egypt's personal data protection law, GDPR for EU patients, HIPAA for US).",
  "Medical-device regulation may apply if the tool claims to guide treatment decisions.",
  "Never train on patient data without a documented lawful basis and de-identification.",
];

/** Guide checklist 6: before/after previews must say they are simulations. */
export const SIMULATION_NOTICE =
  "Simulation only. This is not a guaranteed outcome and not a diagnosis. A licensed clinician must review every proposal before treatment.";

export const SUGGESTION_LABEL = "AI suggestion — requires clinician approval";

/** Guide 8.1: results are simulations, and calibration is approximate. */
export const CALIBRATION_NOTICE =
  "Millimetre values are derived from a calibrated reference and are approximate. Lens distortion and camera angle add uncertainty; never present them as exact.";

/** What each photo view can actually be measured from. */
export function viewsForMetric(metric: string): PhotoView[] {
  const needle = metric.toLowerCase();
  return PHOTO_VIEWS.filter((v) => v.measures.some((m) => m.toLowerCase().includes(needle)));
}
