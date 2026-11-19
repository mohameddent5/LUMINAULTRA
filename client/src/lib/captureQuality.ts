/**
 * Capture quality gate.
 *
 * The frame gate in `fusion.ts` answers "is the *pose and calibration* good
 * enough?". It cannot see the pixels, so it happily accepts a blurry, dim or
 * tiny frame. This module answers the other half: is the *image itself* able to
 * carry a measurement?
 *
 * Everything here is pure: it takes a luma buffer and landmark-derived numbers
 * and returns numbers. No DOM, no canvas, no camera. That keeps it unit-testable
 * with synthetic buffers, which is the only way to prove a threshold behaves.
 *
 * Thresholds are engineering limits chosen to be conservative, not clinical
 * evidence. They are stated as constants so a reviewer can see and change them.
 */

export interface MouthPoint {
  x: number;
  y: number;
}

export interface CaptureSample {
  /** Luma channel, 0..255, row-major, length width*height. */
  luma: ArrayLike<number>;
  width: number;
  height: number;
  /** Mouth-region landmarks in normalised 0..1 coordinates. */
  mouthPoints?: readonly MouthPoint[];
  /** Tooth keypoints the dental network accepted on this frame. */
  teethCount: number;
}

export type CaptureSignalId = "sharpness" | "exposure" | "resolution" | "mouthVisibility";

export interface CaptureSignal {
  id: CaptureSignalId;
  label: string;
  /** The measured quantity, in `unit`. */
  value: number;
  unit: string;
  ok: boolean;
  note: string;
}

export interface CaptureQuality {
  /** 0..1 aggregate; only meaningful alongside `signals`. */
  score: number;
  signals: CaptureSignal[];
  /** One line per failed signal, phrased for the operator. */
  reasons: string[];
  /** True only when every signal passed. */
  acceptable: boolean;
}

/** Engineering limits. Conservative by design. */
export const CAPTURE_LIMITS = {
  /** Variance of the 4-neighbour Laplacian below this is treated as soft. */
  minLaplacianVariance: 60,
  /** Fraction of pixels at the top of the range before highlights are clipped. */
  maxClippedHigh: 0.02,
  /** Fraction of pixels at the bottom before shadows are crushed. */
  maxClippedLow: 0.1,
  /** Acceptable mean luma band. */
  minMeanLuma: 40,
  maxMeanLuma: 215,
  /** Both dimensions must reach this for a metric-grade frame. */
  minEdgePx: 480,
  /** Mouth bounding-box width as a fraction of image width. */
  minMouthWidthRatio: 0.08,
  /** Accepted tooth keypoints needed before the dentition can be measured. */
  minTeeth: 4,
} as const;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Variance of the 4-neighbour Laplacian over the interior of the buffer.
 *
 * High variance means strong high-frequency edges (sharp). Low variance means
 * the image is smooth (defocused, motion-blurred, or genuinely featureless).
 * Returns 0 for a degenerate buffer rather than NaN.
 */
export function laplacianVariance(luma: ArrayLike<number>, width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w < 3 || h < 3 || luma.length < w * h) return 0;

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const centre = luma[i] as number;
      const lap =
        4 * centre -
        (luma[i - 1] as number) -
        (luma[i + 1] as number) -
        (luma[i - w] as number) -
        (luma[i + w] as number);
      if (!Number.isFinite(lap)) continue;
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return variance > 0 ? variance : 0;
}

export interface ExposureStats {
  /** Fraction of pixels at or below the shadow cut. */
  clippedLow: number;
  /** Fraction of pixels at or above the highlight cut. */
  clippedHigh: number;
  mean: number;
}

/** Clipping fractions and mean level of a luma buffer. */
export function exposureStats(luma: ArrayLike<number>, length = luma.length): ExposureStats {
  const n = Math.floor(length);
  if (!Number.isFinite(n) || n <= 0) return { clippedLow: 0, clippedHigh: 0, mean: 0 };
  let low = 0;
  let high = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const v = luma[i] as number;
    if (!Number.isFinite(v)) continue;
    if (v <= 4) low += 1;
    if (v >= 251) high += 1;
    total += v;
  }
  return { clippedLow: low / n, clippedHigh: high / n, mean: total / n };
}

/**
 * Mouth width as a fraction of image width, from the mouth landmarks.
 *
 * A mouth that occupies too little of the frame cannot carry a reliable
 * millimetre measurement even when the pose is perfect, because each pixel then
 * represents more anatomy than the scale calibration assumes.
 */
export function mouthWidthRatio(
  points: readonly MouthPoint[] | undefined,
  width: number,
): number {
  if (!points || points.length < 2 || !Number.isFinite(width) || width <= 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x)) continue;
    if (p.x < min) min = p.x;
    if (p.x > max) max = p.x;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return 0;
  return (max - min) * width > 0 ? max - min : 0;
}

/**
 * Score one captured frame.
 *
 * `score` is a weighted mean of the individual sub-scores so the UI can show
 * progress while a subject settles; `acceptable` is the hard verdict and is
 * true only when every signal passes.
 */
export function evaluateCapture(sample: CaptureSample): CaptureQuality {
  const { luma, width, height, mouthPoints, teethCount } = sample;

  const sharp = laplacianVariance(luma, width, height);
  const sharpOk = sharp >= CAPTURE_LIMITS.minLaplacianVariance;

  const exposure = exposureStats(luma, Math.floor(width) * Math.floor(height));
  const exposureOk =
    exposure.clippedHigh <= CAPTURE_LIMITS.maxClippedHigh &&
    exposure.clippedLow <= CAPTURE_LIMITS.maxClippedLow &&
    exposure.mean >= CAPTURE_LIMITS.minMeanLuma &&
    exposure.mean <= CAPTURE_LIMITS.maxMeanLuma;

  const edge = Math.min(
    Number.isFinite(width) ? width : 0,
    Number.isFinite(height) ? height : 0,
  );
  const resolutionOk = edge >= CAPTURE_LIMITS.minEdgePx;

  const mouthRatio = mouthWidthRatio(mouthPoints, width);
  const teeth = Number.isFinite(teethCount) ? Math.max(0, Math.floor(teethCount)) : 0;
  const mouthOk = mouthRatio >= CAPTURE_LIMITS.minMouthWidthRatio && teeth >= CAPTURE_LIMITS.minTeeth;

  const signals: CaptureSignal[] = [
    {
      id: "sharpness",
      label: "Sharpness",
      value: sharp,
      unit: "laplacian variance",
      ok: sharpOk,
      note: sharpOk
        ? "edges are crisp"
        : "image is soft — hold still, clean the lens, or move closer to a light",
    },
    {
      id: "exposure",
      label: "Exposure",
      value: exposure.mean,
      unit: "mean luma",
      ok: exposureOk,
      note: exposureOk
        ? "no clipping"
        : `lighting is out of range (mean ${exposure.mean.toFixed(0)}, ${(exposure.clippedHigh * 100).toFixed(1)}% blown, ${(exposure.clippedLow * 100).toFixed(1)}% crushed)`,
    },
    {
      id: "resolution",
      label: "Resolution",
      value: edge,
      unit: "px",
      ok: resolutionOk,
      note: resolutionOk ? "sufficient" : `frame is only ${edge.toFixed(0)} px on its short edge`,
    },
    {
      id: "mouthVisibility",
      label: "Mouth visibility",
      value: mouthRatio,
      unit: "fraction of width",
      ok: mouthOk,
      note: mouthOk
        ? `${teeth} tooth keypoints accepted`
        : mouthRatio < CAPTURE_LIMITS.minMouthWidthRatio
          ? "mouth is too small in frame — move closer"
          : `only ${teeth} tooth keypoints accepted — retract the lips or smile wider`,
    },
  ];

  const reasons = signals.filter((s) => !s.ok).map((s) => s.note);

  // Sub-scores are each clamped to 0..1 so one catastrophic signal cannot be
  // masked by three good ones.
  const sharpScore = clamp01(sharp / (CAPTURE_LIMITS.minLaplacianVariance * 2));
  const exposureScore = exposureOk
    ? 1
    : clamp01(1 - Math.max(exposure.clippedHigh * 10, exposure.clippedLow * 4));
  const resolutionScore = clamp01(edge / (CAPTURE_LIMITS.minEdgePx * 2));
  const mouthScore = clamp01(mouthRatio / (CAPTURE_LIMITS.minMouthWidthRatio * 2)) * 0.6 +
    clamp01(teeth / (CAPTURE_LIMITS.minTeeth * 3)) * 0.4;

  const score =
    (sharpScore * 0.35 + exposureScore * 0.25 + resolutionScore * 0.1 + mouthScore * 0.3);

  return {
    score: clamp01(score),
    signals,
    reasons,
    acceptable: sharpOk && exposureOk && resolutionOk && mouthOk,
  };
}

/**
 * Index of the best frame in a short buffer, or -1 when the buffer is empty.
 * Ties resolve to the earliest frame so the choice is deterministic.
 */
export function pickBestFrame(frames: readonly CaptureQuality[]): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (!frame || !Number.isFinite(frame.score)) continue;
    if (frame.score > bestScore) {
      bestScore = frame.score;
      best = i;
    }
  }
  return best;
}

/** True when at least one frame in the buffer passes the gate. */
export function anyAcceptable(frames: readonly CaptureQuality[]): boolean {
  return frames.some((f) => f.acceptable);
}
