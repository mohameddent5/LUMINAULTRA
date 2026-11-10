/**
 * Regression checks for pose estimation, signal fusion and the detection layer.
 *
 * Run with `npm run test:fusion`. Exits nonzero on the first failed expectation
 * so it is usable as a gate.
 */
import { analyze } from "../client/src/lib/dsd";
import { estimatePose, foreshorteningFactor, poseGate, MEASUREMENT_GRADE_LIMIT_DEG } from "../client/src/lib/poseDepth";
import { fuseFrame, gradeLabel } from "../client/src/lib/fusion";
import { iou, nms, filterKeypoints, toPixels, type Box } from "../client/src/lib/detection";

let passed = 0;
const failed: string[] = [];

function ok(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/** Build a 478-point face mesh with the landmarks the pose estimator reads. */
function makeFace(opts: { noseX?: number; cheekDepth?: number } = {}) {
  const noseX = opts.noseX ?? 0.5;
  const cheekDepth = opts.cheekDepth ?? 0;
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[33] = { x: 0.4, y: 0.4, z: 0 }; // eyeOuterA
  points[263] = { x: 0.6, y: 0.4, z: 0 }; // eyeOuterB
  points[1] = { x: noseX, y: 0.5, z: 0 }; // noseTip
  points[152] = { x: 0.5, y: 0.62, z: 0 }; // chin
  points[10] = { x: 0.5, y: 0.32, z: 0 }; // glabella
  points[234] = { x: 0.3, y: 0.52, z: cheekDepth }; // cheekA
  points[454] = { x: 0.7, y: 0.52, z: -cheekDepth }; // cheekB
  return points;
}

const frontal = makeFace();
const yawed = makeFace({ noseX: 0.56, cheekDepth: 0.05 });

const calibration = {
  mmPerPx: 0.2,
  imageWidth: 1000,
  imageHeight: 1000,
  source: "iris diameter",
  confidence: 0.9,
};

console.log("\nPose estimation");
const frontalPose = estimatePose(frontal);
ok("frontal face is measurement grade", frontalPose.measurementGrade, frontalPose.reasons.join("; "));
ok("frontal yaw is near zero", close(frontalPose.yawDeg, 0, 2), `yaw=${frontalPose.yawDeg}`);
ok("frontal roll is zero", close(frontalPose.rollDeg, 0, 1), `roll=${frontalPose.rollDeg}`);
ok("frontal pitch is near zero", close(frontalPose.pitchDeg, 0, 3), `pitch=${frontalPose.pitchDeg}`);

const yawedPose = estimatePose(yawed);
ok("yawed face is not measurement grade", !yawedPose.measurementGrade);
ok("yawed face reports a reason", yawedPose.reasons.length > 0);
ok(
  "yaw exceeds the measurement limit",
  Math.abs(yawedPose.yawDeg) > MEASUREMENT_GRADE_LIMIT_DEG,
  `yaw=${yawedPose.yawDeg}`,
);
ok("pose gate refuses a yawed frame", !poseGate(yawedPose).ok);
ok("pose gate accepts a frontal frame", poseGate(frontalPose).ok);
ok("missing landmarks are refused, not guessed", estimatePose([]).measurementGrade === false);

console.log("\nForeshortening");
ok("frontal correction is effectively 1", close(foreshorteningFactor(frontalPose), 1, 0.01));
ok("yawed correction exceeds 1", foreshorteningFactor(yawedPose) > 1.05, `f=${foreshorteningFactor(yawedPose)}`);
ok("absent pose applies no correction", foreshorteningFactor(null) === 1);

console.log("\nMillimetre gating in the measurement core");
const yawedReport = analyze({
  face: { points: frontal },
  teeth: null,
  calibration,
  profile: "clinician",
  pose: yawedPose,
});
ok(
  "yawed frame withholds millimetres with a rotation note",
  yawedReport.notes.some((n) => n.includes("Head rotation")),
  yawedReport.notes.join(" | "),
);

const frontalReport = analyze({
  face: { points: frontal },
  teeth: null,
  calibration,
  profile: "clinician",
  pose: frontalPose,
});
ok(
  "frontal frame does not report a rotation refusal",
  !frontalReport.notes.some((n) => n.includes("Head rotation")),
);

const noPoseReport = analyze({ face: { points: frontal }, teeth: null, calibration, profile: "clinician" });
ok("omitting pose leaves prior behaviour intact", !noPoseReport.notes.some((n) => n.includes("Head rotation")));

console.log("\nSignal fusion");
const fusedFrontal = fuseFrame({ pose: frontalPose, teethCount: 12, calibrated: true });
ok("all signals present is measurement grade", fusedFrontal.grade === "measurement-grade", fusedFrontal.grade);
ok("fusion exposes four signals", fusedFrontal.signals.length === 4);
ok("fusion defaults to face-mesh depth", fusedFrontal.depthSource === "face-mesh");
ok("fusion reports high confidence", fusedFrontal.confidence > 0.6, `${fusedFrontal.confidence}`);

const fusedOnnx = fuseFrame({ pose: frontalPose, teethCount: 12, calibrated: true, onnxDepthAvailable: true });
ok("onnx depth is used when available", fusedOnnx.depthSource === "onnx");
ok("onnx depth keeps measurement grade", fusedOnnx.grade === "measurement-grade");

const fusedYawed = fuseFrame({ pose: yawedPose, teethCount: 12, calibrated: true });
ok("yawed frame is screening only", fusedYawed.grade === "screening-grade", fusedYawed.grade);
ok("yawed fusion lists reasons", fusedYawed.reasons.length > 0);
ok("yawed fusion applies no correction", fusedYawed.foreshortening === 1);

const fusedUncalibrated = fuseFrame({ pose: frontalPose, teethCount: 12, calibrated: false });
ok("uncalibrated frame is screening only", fusedUncalibrated.grade === "screening-grade");
ok("uncalibrated fusion names the cause", fusedUncalibrated.reasons.some((r) => r.includes("calibration")));

const fusedNoTeeth = fuseFrame({ pose: frontalPose, teethCount: 0, calibrated: true });
ok("frame without teeth is screening only", fusedNoTeeth.grade === "screening-grade");
ok("frame without teeth names the cause", fusedNoTeeth.reasons.some((r) => r.includes("tooth")));

const fusedNoFace = fuseFrame({ pose: null, teethCount: 0, calibrated: false });
ok("absent face is refused", fusedNoFace.grade === "refused");
ok("refused frame has zero confidence", fusedNoFace.confidence === 0);
ok("grade labels are human readable", gradeLabel("measurement-grade") === "Measurement grade");

console.log("\nDetection layer");
const a: Box = { x: 0, y: 0, w: 10, h: 10, score: 0.9 };
const b: Box = { x: 1, y: 1, w: 10, h: 10, score: 0.8 };
const c: Box = { x: 50, y: 50, w: 10, h: 10, score: 0.7 };
ok("iou of identical boxes is 1", close(iou(a, a), 1, 1e-9));
ok("iou of disjoint boxes is 0", iou(a, c) === 0);
ok("nms keeps the highest scoring overlap", nms([b, a, c]).length === 2, `${nms([b, a, c]).length}`);
ok("nms keeps the best box first", nms([b, a, c])[0].score === 0.9);
ok("nms leaves disjoint boxes untouched", nms([a, c]).length === 2);
ok(
  "low-confidence keypoints are dropped",
  filterKeypoints([
    { x: 1, y: 1, score: 0.9 },
    { x: 2, y: 2, score: 0.1 },
  ]).length === 1,
);
ok(
  "non-finite keypoints are dropped",
  filterKeypoints([{ x: Number.NaN, y: 1, score: 0.9 }]).length === 0,
);
ok(
  "normalised keypoints scale to pixels",
  toPixels([{ x: 0.5, y: 0.5 }], 200, 100)[0].x === 100 &&
    toPixels([{ x: 0.5, y: 0.5 }], 200, 100)[0].y === 50,
);

console.log("");
if (failed.length > 0) {
  console.error(`${failed.length} check(s) failed:`);
  for (const name of failed) console.error(`  - ${name}`);
  process.exit(1);
}
console.log(`${passed} checks passed`);
