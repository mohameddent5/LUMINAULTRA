/**
 * Metric calibration for single-camera facial measurement.
 *
 * A single uncalibrated image has no inherent scale: a pixel distance only
 * becomes a millimetre once we know how many pixels a known anatomical
 * distance spans. This module derives that scale from the face mesh itself.
 *
 * Primary reference: horizontal visible iris diameter (HVID), which is the most
 * stable adult facial metric available in a landmark mesh (~11.7 mm, SD ~0.5 mm).
 * Iris landmarks are present when the 478-point refined mesh is used.
 *
 * Fallbacks, in decreasing order of reliability:
 *   1. interpupillary distance (~63 mm adult average)
 *   2. bizygomatic (cheekbone) width (~140 mm adult average)
 *
 * Every result reports which reference was used and how much to trust it, so
 * the UI and the exported report can state the basis instead of implying that
 * an uncalibrated photo yields exact millimetres.
 */

export const IRIS_DIAMETER_MM = 11.7;
export const INTERPUPILLARY_MM = 63;
export const BIZYGOMATIC_MM = 140;

export type CalibrationMethod = "iris" | "interpupillary" | "face-width";

export interface Calibration {
  /** Millimetres represented by one pixel at the face plane. */
  mmPerPixel: number;
  method: CalibrationMethod;
  /** 0..1 - how much the measurement basis can be trusted. */
  confidence: number;
  /** Size of the reference distance in pixels. */
  referencePixels: number;
  /** Short human-readable basis, e.g. "iris diameter". */
  label: string;
  /** Full sentence for reports and tooltips. */
  note: string;
}

interface Landmark {
  x: number;
  y: number;
  z?: number;
}

// MediaPipe refined face mesh: iris ring + centre points.
const LEFT_IRIS_HORIZONTAL: [number, number] = [469, 471];
const RIGHT_IRIS_HORIZONTAL: [number, number] = [474, 476];
const LEFT_EYE_CORNERS: [number, number] = [33, 133];
const RIGHT_EYE_CORNERS: [number, number] = [362, 263];
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

const pixelDistance = (a: Landmark, b: Landmark, w: number, h: number) =>
  Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);

const midpoint = (a: Landmark, b: Landmark) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const at = (landmarks: Landmark[], index: number): Landmark | undefined => {
  const point = landmarks[index];
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
};

/** Reject implausible scales so a bad frame never produces nonsense millimetres. */
const isPlausible = (mmPerPixel: number) =>
  Number.isFinite(mmPerPixel) && mmPerPixel > 0.02 && mmPerPixel < 2;

const build = (
  referencePixels: number,
  referenceMm: number,
  method: CalibrationMethod,
  confidence: number,
  label: string,
  note: string,
): Calibration => ({
  mmPerPixel: referenceMm / referencePixels,
  method,
  confidence,
  referencePixels,
  label,
  note,
});

/**
 * Estimate the millimetre-per-pixel scale of the face plane.
 * Always returns a usable calibration; check `method` to see the basis.
 */
export function calibrateFromLandmarks(
  landmarks: Landmark[],
  width: number,
  height: number,
): Calibration {
  const w = width || 1;
  const h = height || 1;

  // 1. Iris diameter (most reliable when the refined mesh is available).
  const leftIrisA = at(landmarks, LEFT_IRIS_HORIZONTAL[0]);
  const leftIrisB = at(landmarks, LEFT_IRIS_HORIZONTAL[1]);
  const rightIrisA = at(landmarks, RIGHT_IRIS_HORIZONTAL[0]);
  const rightIrisB = at(landmarks, RIGHT_IRIS_HORIZONTAL[1]);

  if (leftIrisA && leftIrisB && rightIrisA && rightIrisB) {
    const leftSpan = pixelDistance(leftIrisA, leftIrisB, w, h);
    const rightSpan = pixelDistance(rightIrisA, rightIrisB, w, h);
    const irisPixels = (leftSpan + rightSpan) / 2;
    if (irisPixels > 4) {
      const calibration = build(
        irisPixels,
        IRIS_DIAMETER_MM,
        "iris",
        0.92,
        "iris diameter (11.7 mm)",
        "Scaled from horizontal iris diameter (11.7 mm), the standard photographic reference for facial measurement.",
      );
      if (isPlausible(calibration.mmPerPixel)) return calibration;
    }
  }

  // 2. Interpupillary distance.
  const leftOuter = at(landmarks, LEFT_EYE_CORNERS[0]);
  const leftInner = at(landmarks, LEFT_EYE_CORNERS[1]);
  const rightInner = at(landmarks, RIGHT_EYE_CORNERS[0]);
  const rightOuter = at(landmarks, RIGHT_EYE_CORNERS[1]);

  if (leftOuter && leftInner && rightInner && rightOuter) {
    const ipdPixels = pixelDistance(
      midpoint(leftOuter, leftInner),
      midpoint(rightInner, rightOuter),
      w,
      h,
    );
    if (ipdPixels > 8) {
      const calibration = build(
        ipdPixels,
        INTERPUPILLARY_MM,
        "interpupillary",
        0.7,
        "interpupillary distance (63 mm)",
        "Iris landmarks were unavailable, so scale is estimated from interpupillary distance (63 mm average). Expect larger error.",
      );
      if (isPlausible(calibration.mmPerPixel)) return calibration;
    }
  }

  // 3. Bizygomatic width - crude, but keeps the UI numeric instead of blank.
  const leftCheek = at(landmarks, LEFT_CHEEK);
  const rightCheek = at(landmarks, RIGHT_CHEEK);

  if (leftCheek && rightCheek) {
    const facePixels = pixelDistance(leftCheek, rightCheek, w, h);
    if (facePixels > 10) {
      const calibration = build(
        facePixels,
        BIZYGOMATIC_MM,
        "face-width",
        0.4,
        "face width (140 mm)",
        "Only coarse landmarks were detected, so scale is estimated from cheekbone width (140 mm average). Treat millimetre values as indicative only.",
      );
      if (isPlausible(calibration.mmPerPixel)) return calibration;
    }
  }

  return {
    mmPerPixel: 0,
    method: "face-width",
    confidence: 0,
    referencePixels: 0,
    label: "uncalibrated",
    note: "No reliable scale reference was detected in this frame, so millimetre values are unavailable. Use ratios and percentages instead.",
  };
}

/** Convert a pixel distance to millimetres for this calibration. */
export const toMillimetres = (pixels: number, calibration: Calibration) =>
  calibration.mmPerPixel > 0 ? pixels * calibration.mmPerPixel : 0;

export const formatMillimetres = (value: number, calibration: Calibration, digits = 1) =>
  calibration.mmPerPixel > 0 ? `${value.toFixed(digits)} mm` : "n/a (uncalibrated)";

export const CALIBRATION_DISCLAIMER =
  "Decision-support visualisation only. Not a diagnosis, not a validated medical device, and not a substitute for clinical examination.";
