/**
 * Physiological plausibility bounds.
 *
 * Why this module exists
 * ----------------------
 * The measurement core computes geometry from landmarks. Landmark output is not
 * perfectly repeatable: on some frames the dental network places a gingival
 * zenith inside the lip, or the face mesh puts a mouth corner 3 cm away from
 * where it belongs on the previous frame. Geometry built from those points is
 * arithmetically valid and clinically impossible: a -40 mm gingival display, a
 * 300 % width/length ratio, an 89 degree cant. Reporting those numbers is worse
 * than reporting nothing, because a reader cannot tell a real finding from a
 * tracking failure, and a score built from them is meaningless.
 *
 * So every metric now passes through a hard physiological gate before it can be
 * graded. The bounds below are deliberately WIDER than the aesthetic ideal band:
 * they are not "this is unattractive", they are "a human being cannot have this
 * measurement, therefore the input points were wrong".
 *
 * A rejected value is not clamped and not repaired. It becomes unavailable with
 * a stated reason, which the UI renders as n/a. Clamping would silently invent a
 * borderline measurement, which is exactly the failure this module prevents.
 */

export interface PhysioBound {
  /** Smallest value physically possible for this metric. */
  min: number;
  /** Largest value physically possible for this metric. */
  max: number;
  unit: "mm" | "deg" | "%" | "count" | "category";
  /** Why the bound sits where it does, in one line, for the audit trail. */
  rationale: string;
}

/**
 * Bounds by metric id. The reference points are anatomical, not aesthetic:
 *
 *   maxillary central incisor crown is ~9-11 mm tall and ~8-9 mm wide, so a
 *   width/length ratio cannot exceed ~110 % or fall below ~50 % in a dentate
 *   adult; beyond that the "crown" being measured is not a crown.
 *
 *   gingival display at a full smile is at most the full crown plus a little
 *   sulcus, hence 12 mm. A negative value is legitimate (lip covers the zenith
 *   at rest), so the lower bound is -8 mm, not zero.
 *
 *   A midline or occlusal cant beyond ~15 degrees is a facial asymmetry, not a
 *   dental measurement, and on a photograph it is a head-tilt artefact.
 */
export const PHYSIO_BOUNDS: Readonly<Record<string, PhysioBound>> = {
  dental_midline_shift: {
    min: 0,
    max: 8,
    unit: "mm",
    rationale: "a dentate upper midline discrepancy beyond 8 mm is not a measurement error but a cleft/agenesis case outside this tool's scope",
  },
  midline_cant: {
    min: 0,
    max: 15,
    unit: "deg",
    rationale: "beyond 15 degrees the inter-incisal axis is dominated by head tilt or a facial asymmetry, not dental cant",
  },
  occlusal_plane_cant: {
    min: 0,
    max: 15,
    unit: "deg",
    rationale: "occlusal plane relative to the interpupillary line cannot exceed 15 degrees without a gross facial asymmetry",
  },
  commissural_cant: {
    min: 0,
    max: 15,
    unit: "deg",
    rationale: "commissural line versus interpupillary line beyond 15 degrees indicates head roll in the capture",
  },
  gingival_display: {
    min: -8,
    max: 12,
    unit: "mm",
    rationale: "negative when the lip covers the zenith at rest; above 12 mm exceeds a full crown plus sulcus",
  },
  incisor_display_rest: {
    min: 0,
    max: 14,
    unit: "mm",
    rationale: "maxillary incisor display at rest is 0-14 mm across the adult range including full-crown display",
  },
  smile_arc: {
    min: -2,
    max: 2,
    unit: "category",
    rationale:
      "the fitted arc ratio is signed: negative follows the lower lip (consonant), positive is a reverse arc, and beyond +/-2 the fit is not a smile line at all",
  },
  buccal_corridor: {
    min: 0,
    max: 60,
    unit: "%",
    rationale: "corridor cannot exceed 60 % of smile width while any anterior teeth are visible",
  },
  visible_teeth: {
    min: 0,
    max: 8,
    unit: "count",
    rationale: "eight maxillary anterior teeth are tracked; more than eight is a duplicate-keypoint artefact",
  },
  central_wl_ratio: {
    min: 50,
    max: 110,
    unit: "%",
    rationale: "a maxillary central crown wider than tall (above 110 %) or narrower than half its height (below 50 %) is not a central incisor",
  },
  central_width_diff: {
    min: 0,
    max: 6,
    unit: "mm",
    rationale: "left-right central width difference above 6 mm indicates one crown was mis-segmented",
  },
  central_edge_height_diff: {
    min: 0,
    max: 6,
    unit: "mm",
    rationale: "incisal edge height difference above 6 mm is a fracture or a mis-placed keypoint",
  },
  gingival_margin_diff: {
    min: 0,
    max: 6,
    unit: "mm",
    rationale: "left-right gingival margin difference above 6 mm exceeds any gingival asymmetry",
  },
  lateral_vs_central: {
    min: 0,
    max: 6,
    unit: "mm",
    rationale: "lateral-to-central edge or margin offset above 6 mm indicates a missed lateral keypoint",
  },
  lateral_angulation: {
    min: 0,
    max: 35,
    unit: "deg",
    rationale: "lateral incisor long axis beyond 35 degrees from vertical is a keypoint artefact",
  },
  diastema: {
    min: 0,
    max: 12,
    unit: "mm",
    rationale: "a midline diastema above 12 mm would exceed the width of a central incisor",
  },
  lateral_central_width_ratio: {
    min: 30,
    max: 100,
    unit: "%",
    rationale: "lateral width as a share of central width sits near 60-70 %; 30-100 % covers the adult range",
  },
  canine_lateral_width_ratio: {
    min: 40,
    max: 120,
    unit: "%",
    rationale: "canine width as a share of lateral width sits near 80 %; beyond 40-120 % a keypoint is wrong",
  },
  golden_percentage: {
    min: 20,
    max: 70,
    unit: "%",
    rationale: "the central incisor's share of the central+lateral+canine width cannot fall outside 20-70 %",
  },
};

export interface PlausibilityResult {
  ok: boolean;
  /** Present only when ok === false; states the value, the bound and the cause. */
  reason?: string;
}

/**
 * Gate a metric value against its physiological bound.
 *
 * Returns ok:false with a human-readable reason rather than a corrected value.
 * Unknown metric ids pass through: a metric with no bound is not silently
 * trusted, it is simply outside this gate's responsibility, and every metric in
 * the core is listed above.
 */
export function plausibility(id: string, value: number): PlausibilityResult {
  if (!Number.isFinite(value)) {
    return { ok: false, reason: "measurement was not a finite number" };
  }
  const bound = PHYSIO_BOUNDS[id];
  if (!bound) return { ok: true };
  if (value < bound.min || value > bound.max) {
    const unit = bound.unit === "category" || bound.unit === "count" ? "" : ` ${bound.unit}`;
    return {
      ok: false,
      reason:
        `${format(value)}${unit} is outside the physiological range for this metric ` +
        `(${format(bound.min)}-${format(bound.max)}${unit}), so the underlying keypoints were unstable on this frame. ` +
        `Reason: ${bound.rationale}.`,
    };
  }
  return { ok: true };
}

/** Trim float noise for display inside reasons. */
function format(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Every id the gate covers, for tests and for the audit panel. */
export const BOUNDED_METRIC_IDS: readonly string[] = Object.keys(PHYSIO_BOUNDS);
