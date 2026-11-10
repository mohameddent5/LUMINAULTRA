/**
 * Signal fusion.
 *
 * The system has four independent signals about a frame:
 *
 *  - face-mesh depth / head pose  (`poseDepth.ts`)
 *  - optional ONNX depth weights  (`depthModel.ts`)
 *  - dental keypoints             (`dentalNet.ts`)
 *  - millimetre calibration       (`clinicalScale.ts`)
 *
 * `fuseFrame` combines them into one verdict so the rest of the app asks a
 * single question — "is this frame measurement-grade?" — instead of re-deriving
 * it from scattered flags. When a signal is missing or contradicts the others,
 * the frame is downgraded and the reason is stated. Nothing is averaged into a
 * reassuring number.
 */
import { foreshorteningFactor } from "./poseDepth";
import type { PoseEstimate } from "./poseDepth";

export type FrameGrade = "measurement-grade" | "screening-grade" | "refused";

export interface FusedSignal {
  id: "pose" | "depth" | "teeth" | "calibration";
  label: string;
  available: boolean;
  /** 0..1 contribution of this signal to the frame verdict. */
  quality: number;
  note?: string;
}

export interface FusedFrame {
  grade: FrameGrade;
  /** 0..1 overall confidence in the frame, not in the patient. */
  confidence: number;
  signals: FusedSignal[];
  /** Human-readable reasons for a downgrade; empty at measurement grade. */
  reasons: string[];
  /** Divisor applied to vertical distances for rotational foreshortening. */
  foreshortening: number;
  /** Which depth signal produced the result. */
  depthSource: "face-mesh" | "onnx" | "none";
  pose: PoseEstimate | null;
}

export interface FuseInput {
  pose: PoseEstimate | null | undefined;
  /** True when ONNX depth weights loaded. */
  onnxDepthAvailable?: boolean;
  /** Number of dental keypoints the tooth model accepted on this frame. */
  teethCount: number;
  /** True when a usable millimetre calibration exists. */
  calibrated: boolean;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Combine the available signals into a single frame verdict.
 *
 * Measurement grade requires all four signals: a valid pose, a calibration, at
 * least one accepted tooth keypoint, and a depth source. Anything less is
 * screening grade, which still reports scale-free proportions. A frame is only
 * refused when there is no face at all.
 */
export function fuseFrame(input: FuseInput): FusedFrame {
  const { pose, teethCount, calibrated } = input;
  const onnxDepthAvailable = input.onnxDepthAvailable === true;

  const reasons: string[] = [];

  if (!pose) {
    return {
      grade: "refused",
      confidence: 0,
      signals: [
        { id: "pose", label: "Head pose", available: false, quality: 0, note: "no face landmarks" },
        { id: "depth", label: "Depth", available: false, quality: 0, note: "needs face landmarks" },
        { id: "teeth", label: "Tooth keypoints", available: teethCount > 0, quality: teethCount > 0 ? 0.5 : 0, note: `${teethCount} accepted` },
        { id: "calibration", label: "Calibration", available: calibrated, quality: calibrated ? 0.5 : 0 },
      ],
      reasons: ["no face landmarks on this frame"],
      foreshortening: 1,
      depthSource: "none",
      pose: null,
    };
  }

  const poseQuality = pose.measurementGrade ? clamp01(pose.reliability) : clamp01(pose.reliability) * 0.4;
  if (!pose.measurementGrade) {
    for (const reason of pose.reasons) reasons.push(reason);
  }

  const depthSource: FusedFrame["depthSource"] = onnxDepthAvailable ? "onnx" : "face-mesh";
  const depthQuality = onnxDepthAvailable ? 0.95 : 0.7;

  const teethAvailable = teethCount > 0;
  if (!teethAvailable) reasons.push("no accepted tooth keypoints");

  if (!calibrated) reasons.push("no millimetre calibration");

  const signals: FusedSignal[] = [
    {
      id: "pose",
      label: "Head pose",
      available: true,
      quality: poseQuality,
      note: `yaw ${pose.yawDeg.toFixed(0)}°, pitch ${pose.pitchDeg.toFixed(0)}°, roll ${pose.rollDeg.toFixed(0)}°`,
    },
    {
      id: "depth",
      label: "Depth",
      available: true,
      quality: depthQuality,
      note: onnxDepthAvailable ? "ONNX depth weights" : "face-mesh depth channel",
    },
    {
      id: "teeth",
      label: "Tooth keypoints",
      available: teethAvailable,
      quality: teethAvailable ? clamp01(Math.min(1, teethCount / 12)) : 0,
      note: `${teethCount} accepted`,
    },
    {
      id: "calibration",
      label: "Calibration",
      available: calibrated,
      quality: calibrated ? 1 : 0,
    },
  ];

  const measurementGrade =
    pose.measurementGrade && calibrated && teethAvailable && pose.reliability >= 0.3;

  const confidence = clamp01(
    poseQuality *
      (calibrated ? 1 : 0.55) *
      (teethAvailable ? 1 : 0.5) *
      (onnxDepthAvailable ? 1 : 0.85),
  );

  return {
    grade: measurementGrade ? "measurement-grade" : "screening-grade",
    confidence,
    signals,
    reasons,
    // Only meaningful once the pose is accepted; a refused frame gets no correction.
    foreshortening: pose.measurementGrade ? foreshorteningFactor(pose) : 1,
    depthSource,
    pose,
  };
}

/** Short badge text for the HUD. */
export function gradeLabel(grade: FrameGrade): string {
  switch (grade) {
    case "measurement-grade":
      return "Measurement grade";
    case "screening-grade":
      return "Screening only";
    default:
      return "No frame";
  }
}
