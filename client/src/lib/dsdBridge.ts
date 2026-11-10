/**
 * Bridge between the live camera pipeline and the measurement core.
 *
 * The overlay historically computed its own numbers inline, including values
 * that were constants, ratios derived from lip landmarks, and a hard-coded
 * confidence table. This module is the single place where camera state is
 * converted into the inputs `analyze()` expects, so the overlay can display
 * measured values instead of local guesses.
 */
import { analyze, type CalibrationScale, type DsdReport } from "./dsd";
import type { Landmark } from "./dentalNet";
import type { Calibration } from "./clinicalScale";
import type { PoseEstimate } from "./poseDepth";

export interface FacePointInput {
  x: number;
  y: number;
  z?: number;
}

/**
 * Convert the camera calibration into the scale the core expects. Returns null
 * when the frame is unusable, which makes the core withhold millimetre metrics
 * rather than invent them.
 */
export function toCalibrationScale(
  calibration: Calibration | null,
  width: number,
  height: number,
): CalibrationScale | null {
  if (!calibration) return null;
  const mmPerPx = calibration.mmPerPixel;
  if (!Number.isFinite(mmPerPx) || mmPerPx <= 0) return null;
  if (!(width > 0) || !(height > 0)) return null;
  return {
    mmPerPx,
    imageWidth: width,
    imageHeight: height,
    source: calibration.label,
    confidence: Number.isFinite(calibration.confidence) ? calibration.confidence : 0,
  };
}

export function buildReport(args: {
  facePoints: readonly FacePointInput[];
  teeth: readonly Landmark[] | null | undefined;
  calibration: Calibration | null;
  width: number;
  height: number;
  profile?: "clinician" | "patient";
  /** Head pose; when beyond the measurement-grade limit, mm metrics are withheld. */
  pose?: PoseEstimate | null;
}): DsdReport {
  return analyze({
    face: { points: args.facePoints },
    teeth: args.teeth ?? null,
    calibration: toCalibrationScale(args.calibration, args.width, args.height),
    profile: args.profile ?? "clinician",
    pose: args.pose ?? null,
  });
}

/** Look up a metric value, returning null when it could not be measured. */
export function metricValue(report: DsdReport, id: string): number | null {
  const metric = report.metrics.find((m) => m.id === id);
  return metric && metric.value !== null && Number.isFinite(metric.value) ? metric.value : null;
}

/** Look up the display text, e.g. a category label or "n/a". */
export function metricText(report: DsdReport, id: string): string {
  const metric = report.metrics.find((m) => m.id === id);
  return metric ? metric.text : "n/a";
}
