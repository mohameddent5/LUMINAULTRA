/**
 * Detection and annotation layer.
 *
 * This is the browser-side equivalent of what Roboflow's `supervision` library
 * does on the Python side: one uniform `Detector` contract, boxes and keypoints
 * as first-class data, non-maximum suppression, and annotation drawing. It
 * exists so the dental keypoint network, any future YOLO-style detector, and the
 * depth model all plug into the same pipeline instead of each having bespoke
 * glue in the overlay.
 *
 * `supervision` itself is a Python library, not a model, and cannot run in a
 * browser. This module provides the capability rather than the package.
 */

/** Axis-aligned box in pixel space. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Detector confidence, 0..1. */
  score: number;
  /** Optional class label. */
  label?: string;
}

/** A single keypoint in pixel space. */
export interface Keypoint {
  x: number;
  y: number;
  /** 0..1 detector confidence for this point. */
  score?: number;
  /** Stable name so annotations and metrics agree on identity. */
  name?: string;
}

/** Everything one detector produced for one frame. */
export interface Detections {
  boxes: readonly Box[];
  keypoints: readonly Keypoint[];
  /** Which detector produced this, for provenance in the UI. */
  source: string;
}

export const EMPTY_DETECTIONS: Detections = { boxes: [], keypoints: [], source: "none" };

/** A detector is any function that turns a frame into detections. */
export type Detector<F> = (frame: F) => Promise<Detections> | Detections;

/** Intersection-over-union of two boxes, 0..1. */
export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const interW = x2 - x1;
  const interH = y2 - y1;
  if (interW <= 0 || interH <= 0) return 0;
  const inter = interW * interH;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Greedy non-maximum suppression. Keeps the highest-scoring box, drops any box
 * overlapping it above `threshold`. This is the standard post-processing step a
 * YOLO-style detector needs before its output is usable.
 */
export function nms(boxes: readonly Box[], threshold = 0.45): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const candidate of sorted) {
    if (kept.every((k) => iou(k, candidate) <= threshold)) kept.push(candidate);
  }
  return kept;
}

/** Drop keypoints below a confidence floor. */
export function filterKeypoints(keypoints: readonly Keypoint[], minScore = 0.3): Keypoint[] {
  return keypoints.filter((k) => (k.score ?? 1) >= minScore && Number.isFinite(k.x) && Number.isFinite(k.y));
}

export interface AnnotateOptions {
  boxColor?: string;
  keypointColor?: string;
  keypointRadius?: number;
  lineWidth?: number;
  label?: boolean;
}

/**
 * Draw detections onto a 2D context. Coordinates are pixel space, matching the
 * canvas the camera is rendered into, so no rescaling is needed.
 */
export function annotate(
  ctx: CanvasRenderingContext2D,
  detections: Detections,
  options: AnnotateOptions = {},
): void {
  const {
    boxColor = "rgba(56, 189, 248, 0.9)",
    keypointColor = "rgba(250, 204, 21, 0.95)",
    keypointRadius = 2.5,
    lineWidth = 1.5,
    label = false,
  } = options;

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = boxColor;
  for (const box of detections.boxes) {
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    if (label && box.label) {
      ctx.fillStyle = boxColor;
      ctx.font = "11px sans-serif";
      ctx.fillText(box.label, box.x, Math.max(0, box.y - 3));
    }
  }

  ctx.fillStyle = keypointColor;
  for (const point of detections.keypoints) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, keypointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Normalised (0..1) keypoints to pixel space, for detectors that emit ratios. */
export function toPixels(keypoints: readonly Keypoint[], width: number, height: number): Keypoint[] {
  return keypoints.map((k) => ({ ...k, x: k.x * width, y: k.y * height }));
}
