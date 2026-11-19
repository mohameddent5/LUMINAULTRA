/**
 * Capture quality gate tests.
 *
 * Synthetic buffers only: a threshold is only trustworthy if it can be shown to
 * accept a good frame, reject a bad one, and never emit NaN for degenerate
 * input. Run with `npm run test:capture`.
 */
import {
  CAPTURE_LIMITS,
  anyAcceptable,
  evaluateCapture,
  exposureStats,
  laplacianVariance,
  mouthWidthRatio,
  pickBestFrame,
} from "../client/src/lib/captureQuality";
import type { CaptureQuality } from "../client/src/lib/captureQuality";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(name: string, actual: number, expected: number, tolerance = 1e-6): void {
  check(
    name,
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `got ${actual}, expected ${expected}`,
  );
}

/** Checkerboard between two levels: sharp, and well exposed when lo/hi are mid-range. */
function checker(width: number, height: number, lo: number, hi: number): number[] {
  const out = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[y * width + x] = (x + y) % 2 === 0 ? hi : lo;
    }
  }
  return out;
}

function flat(width: number, height: number, level: number): number[] {
  return new Array<number>(width * height).fill(level);
}

const MOUTH = [
  { x: 0.3, y: 0.55 },
  { x: 0.7, y: 0.55 },
];

console.log("\nSharpness — Laplacian variance");
{
  const sharp = laplacianVariance(checker(64, 64, 60, 190), 64, 64);
  check("checkerboard reads as sharp", sharp > CAPTURE_LIMITS.minLaplacianVariance, `variance ${sharp}`);
  near("flat field has zero variance", laplacianVariance(flat(64, 64, 128), 64, 64), 0);
  near("degenerate 0x0 buffer returns 0", laplacianVariance([], 0, 0), 0);
  near("buffer shorter than w*h returns 0", laplacianVariance([1, 2, 3], 64, 64), 0);
  near("3x3 minimum is honoured", laplacianVariance(flat(3, 3, 10), 3, 3), 0);
  const withNaN = [Number.NaN, ...checker(16, 16, 60, 190)];
  check("NaN pixels do not produce NaN", Number.isFinite(laplacianVariance(withNaN, 16, 16)));
}

console.log("\nExposure — clipping and mean");
{
  const dark = exposureStats(flat(32, 32, 0));
  near("all-black clippedLow is 1", dark.clippedLow, 1);
  const blown = exposureStats(flat(32, 32, 255));
  near("all-white clippedHigh is 1", blown.clippedHigh, 1);
  const mid = exposureStats(flat(32, 32, 128));
  near("mid-grey mean", mid.mean, 128);
  near("mid-grey has no clipping", mid.clippedLow + mid.clippedHigh, 0);
  const empty = exposureStats([], 0);
  check("empty buffer is finite", Number.isFinite(empty.mean) && Number.isFinite(empty.clippedLow));
}

console.log("\nMouth visibility");
{
  near("two corners span 0.4 of the width", mouthWidthRatio(MOUTH, 1000), 0.4, 1e-9);
  near("undefined points give 0", mouthWidthRatio(undefined, 1000), 0);
  near("single point gives 0", mouthWidthRatio([{ x: 0.5, y: 0.5 }], 1000), 0);
  near("invalid points give 0", mouthWidthRatio([{ x: Number.NaN, y: 0 }], 1000), 0);
  near("zero width gives 0", mouthWidthRatio(MOUTH, 0), 0);
}

console.log("\nFrame verdict");
{
  const good = evaluateCapture({
    luma: checker(640, 480, 60, 190),
    width: 640,
    height: 480,
    mouthPoints: MOUTH,
    teethCount: 8,
  });
  check("sharp, exposed, large frame is acceptable", good.acceptable, good.reasons.join("; "));
  check("score is within 0..1", good.score >= 0 && good.score <= 1, `score ${good.score}`);

  const blurry = evaluateCapture({
    luma: flat(640, 480, 128),
    width: 640,
    height: 480,
    mouthPoints: MOUTH,
    teethCount: 8,
  });
  check("soft frame is refused", !blurry.acceptable);
  check("soft frame names sharpness", blurry.reasons.some((r) => r.includes("soft")), blurry.reasons.join("; "));

  const dark = evaluateCapture({
    luma: checker(640, 480, 0, 255),
    width: 640,
    height: 480,
    mouthPoints: MOUTH,
    teethCount: 8,
  });
  check("clipped frame is refused", !dark.acceptable);

  const small = evaluateCapture({
    luma: checker(320, 240, 60, 190),
    width: 320,
    height: 240,
    mouthPoints: MOUTH,
    teethCount: 8,
  });
  check("low-resolution frame is refused", !small.acceptable);
  check("low resolution names its reason", small.reasons.some((r) => r.includes("short edge")));

  const distant = evaluateCapture({
    luma: checker(640, 480, 60, 190),
    width: 640,
    height: 480,
    mouthPoints: [
      { x: 0.48, y: 0.55 },
      { x: 0.52, y: 0.55 },
    ],
    teethCount: 8,
  });
  check("mouth too small in frame is refused", !distant.acceptable);

  const noTeeth = evaluateCapture({
    luma: checker(640, 480, 60, 190),
    width: 640,
    height: 480,
    mouthPoints: MOUTH,
    teethCount: 0,
  });
  check("no accepted teeth is refused", !noTeeth.acceptable);

  const noMouth = evaluateCapture({
    luma: checker(640, 480, 60, 190),
    width: 640,
    height: 480,
    teethCount: 8,
  });
  check("missing mouth landmarks are refused", !noMouth.acceptable);

  // Adversarial: absurd and non-finite dimensions must not throw or emit NaN.
  const adversarial = evaluateCapture({
    luma: [Number.NaN, Number.POSITIVE_INFINITY],
    width: Number.NaN,
    height: -5,
    mouthPoints: [{ x: Number.POSITIVE_INFINITY, y: 0 }],
    teethCount: Number.NaN,
  });
  check("non-finite input yields a finite score", Number.isFinite(adversarial.score));
  check("non-finite input is not acceptable", !adversarial.acceptable);
}

console.log("\nBest-frame selection");
{
  const make = (score: number, acceptable = false): CaptureQuality => ({
    score,
    signals: [],
    reasons: [],
    acceptable,
  });
  check("empty buffer returns -1", pickBestFrame([]) === -1);
  check("single frame returns 0", pickBestFrame([make(0.5)]) === 0);
  check("highest score wins", pickBestFrame([make(0.2), make(0.9), make(0.4)]) === 1);
  check("ties resolve to the earliest frame", pickBestFrame([make(0.5), make(0.5)]) === 0);
  check("non-finite scores are skipped", pickBestFrame([make(Number.NaN), make(0.3)]) === 1);
  check("all-invalid buffer returns -1", pickBestFrame([make(Number.NaN)]) === -1);
  check("anyAcceptable finds a passing frame", anyAcceptable([make(0.1), make(0.9, true)]));
  check("anyAcceptable is false when none pass", !anyAcceptable([make(0.1), make(0.2)]));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
