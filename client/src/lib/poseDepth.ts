/**
 * Monocular depth and head-pose estimation from the face mesh.
 *
 * The face-mesh landmarker returns a `z` channel alongside x and y. That channel
 * is a relative depth estimate (roughly normalised by image width, not metric),
 * and it is the only monocular-depth signal this system has without loading a
 * second network. It is used for one job: deciding whether a frame is
 * measurement-grade, and correcting the foreshortening that rotation introduces.
 *
 * Why this matters for millimetres
 * --------------------------------
 * Calibration is derived from a *horizontal* reference (iris diameter or
 * interpupillary distance). When the head is yawed by theta, horizontal
 * distances foreshorten by cos(theta) and the calibration foreshortens with
 * them, so horizontal measurements largely cancel out. Vertical distances do
 * not foreshorten with yaw, yet they are still scaled by that shrunken
 * calibration, so every vertical millimetre is underestimated by roughly
 * cos(yaw) * cos(pitch). `foreshorteningFactor` returns the divisor that undoes
 * it.
 *
 * Beyond a small rotation the correction stops being trustworthy (the projected
 * geometry is no longer close to affine), so the frame is refused instead of
 * silently corrected. Refusing is the honest behaviour: a clinician is told the
 * photo was taken at an angle rather than handed a wrong number.
 *
 * This is a heuristic estimator, not a validated pose measurement. The
 * `reliability` field exists so callers can show it as an estimate.
 */

/** Minimal landmark shape, kept local so this module has no import cycle. */
export interface PosePoint {
  x: number;
  y: number;
  z?: number;
}

/** MediaPipe refined face-mesh indices used by the estimator. */
export const POSE_INDEX = {
  /** Outer eye corner, one side. */
  eyeOuterA: 33,
  /** Outer eye corner, other side. */
  eyeOuterB: 263,
  noseTip: 1,
  chin: 152,
  glabella: 10,
  cheekA: 234,
  cheekB: 454,
} as const;

const DEG = 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rotation beyond this is refused for millimetre measurement. */
export const MEASUREMENT_GRADE_LIMIT_DEG = 10;
/** Roll does not foreshorten distance, so it tolerates more tilt. */
export const ROLL_LIMIT_DEG = 12;

export interface PoseEstimate {
  /** Positive = turned toward image-right. */
  yawDeg: number;
  /** Positive = chin lifted away from the camera. */
  pitchDeg: number;
  rollDeg: number;
  /** 0..1 confidence in the estimate itself, not in the face. */
  reliability: number;
  /** True when rotation is small enough for millimetre measurement. */
  measurementGrade: boolean;
  /** Why the frame is not measurement-grade; empty when it is. */
  reasons: readonly string[];
}

const EMPTY: PoseEstimate = {
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  reliability: 0,
  measurementGrade: false,
  reasons: ["face landmarks unavailable"],
};

function get(points: readonly PosePoint[], index: number): PosePoint | null {
  const p = points[index];
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return p;
}

/**
 * Estimate head pose from face-mesh landmarks.
 *
 * Yaw is taken from two independent cues — left/right cheek asymmetry and the
 * depth difference between the cheeks — and averaged, which is steadier than
 * either alone. Missing landmarks yield a refused frame rather than a guess.
 */
export function estimatePose(points: readonly PosePoint[]): PoseEstimate {
  const eyeA = get(points, POSE_INDEX.eyeOuterA);
  const eyeB = get(points, POSE_INDEX.eyeOuterB);
  const nose = get(points, POSE_INDEX.noseTip);
  const chin = get(points, POSE_INDEX.chin);
  const cheekA = get(points, POSE_INDEX.cheekA);
  const cheekB = get(points, POSE_INDEX.cheekB);

  if (!eyeA || !eyeB || !nose || !chin || !cheekA || !cheekB) return EMPTY;

  const eyeDx = eyeB.x - eyeA.x;
  const eyeDy = eyeB.y - eyeA.y;
  const eyeDist = Math.hypot(eyeDx, eyeDy);
  if (!(eyeDist > 1e-6)) return EMPTY;

  // Roll: the eye line against horizontal.
  const rollDeg = Math.atan2(eyeDy, eyeDx) * DEG;

  // Yaw cue 1: projected cheek distances. A yawed face compresses one side.
  const dA = Math.abs(nose.x - cheekA.x);
  const dB = Math.abs(cheekB.x - nose.x);
  const sum = dA + dB;
  const yawSamples: number[] = [];
  if (sum > 1e-6) {
    const asym = (dB - dA) / sum; // -1..1
    yawSamples.push(Math.asin(clamp(asym, -0.95, 0.95)) * DEG);
  }

  // Yaw cue 2: relative depth between the cheeks.
  const za = cheekA.z;
  const zb = cheekB.z;
  if (typeof za === "number" && typeof zb === "number" && Number.isFinite(za) && Number.isFinite(zb)) {
    yawSamples.push(Math.asin(clamp((zb - za) / eyeDist, -0.95, 0.95)) * DEG);
  }

  if (yawSamples.length === 0) return EMPTY;
  const yawDeg = yawSamples.reduce((a, b) => a + b, 0) / yawSamples.length;

  // Pitch: where the nose sits between the eye line and the chin. A frontal face
  // puts it a little under half way down.
  const eyeMidY = (eyeA.y + eyeB.y) / 2;
  const upper = nose.y - eyeMidY;
  const lower = chin.y - nose.y;
  const span = upper + lower;
  const pitchDeg = span > 1e-6 ? clamp((upper / span - 0.45) * 120, -60, 60) : 0;

  // Reliability: a depth cue makes yaw far steadier, so it earns extra weight.
  const hasDepth = yawSamples.length > 1;
  const geometryOk = eyeDist > 0.02 && span > 0.02;
  const reliability = clamp((hasDepth ? 0.85 : 0.55) * (geometryOk ? 1 : 0.5), 0, 1);

  const reasons: string[] = [];
  if (Math.abs(yawDeg) > MEASUREMENT_GRADE_LIMIT_DEG) {
    reasons.push(`yaw ${Math.abs(yawDeg).toFixed(0)}° exceeds ${MEASUREMENT_GRADE_LIMIT_DEG}°`);
  }
  if (Math.abs(pitchDeg) > MEASUREMENT_GRADE_LIMIT_DEG) {
    reasons.push(`pitch ${Math.abs(pitchDeg).toFixed(0)}° exceeds ${MEASUREMENT_GRADE_LIMIT_DEG}°`);
  }
  if (Math.abs(rollDeg) > ROLL_LIMIT_DEG) {
    reasons.push(`roll ${Math.abs(rollDeg).toFixed(0)}° exceeds ${ROLL_LIMIT_DEG}°`);
  }

  return {
    yawDeg,
    pitchDeg,
    rollDeg,
    reliability,
    measurementGrade: reasons.length === 0,
    reasons,
  };
}

/**
 * Divisor that corrects vertical distances for rotational foreshortening.
 *
 * Calibration is horizontal, so horizontal measurements cancel; vertical ones
 * are short by cos(yaw) * cos(pitch) and must be divided by it. Returns 1 when
 * the estimate is unusable, so callers never apply a phantom correction.
 */
export function foreshorteningFactor(pose: PoseEstimate | null | undefined): number {
  if (!pose) return 1;
  const yaw = clamp(pose.yawDeg, -60, 60) / DEG;
  const pitch = clamp(pose.pitchDeg, -60, 60) / DEG;
  const product = Math.cos(yaw) * Math.cos(pitch);
  if (!Number.isFinite(product) || product <= 0) return 1;
  return clamp(1 / product, 0.5, 2);
}

/** Convenience gate: the reasons a frame cannot support millimetre measurement. */
export function poseGate(pose: PoseEstimate | null | undefined): {
  ok: boolean;
  reasons: readonly string[];
} {
  if (!pose) return { ok: true, reasons: [] };
  return { ok: pose.measurementGrade, reasons: pose.reasons };
}

export const POSE_DISCLAIMER =
  "Head pose is estimated from face-mesh geometry as a monocular depth proxy. It is used to accept or refuse a frame and to correct foreshortening, not as a clinical posture measurement.";
