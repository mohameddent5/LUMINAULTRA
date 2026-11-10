import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  attachStreamToVideo,
  checkCameraSupport,
  describeCameraError,
  detachVideo,
  listVideoInputs,
  openCamera,
  stopStream,
  watchStreamEnded,
  type CameraFailure,
} from "@/lib/camera";
import { Camera, Sparkles, Ruler, SwitchCamera, Loader2, Download, Eye, Grid3X3, Home, Upload, RotateCcw, AlertTriangle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { calibrateFromLandmarks, toMillimetres, type Calibration } from "@/lib/clinicalScale";
import { buildReport, metricValue } from "@/lib/dsdBridge";
import {
  decodeAndGate,
  loadDentalNet,
  preprocess,
  runDentalNet,
  type Landmark,
  type LoadedNet,
} from "@/lib/dentalNet";
import type { DsdReport } from "@/lib/dsd";

const MEDIAPIPE_ESM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Render a measured value, or "n/a" when the frame could not support it. */
const fmt = (value: number, digits = 0, suffix = ""): string =>
  Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "n/a";

interface DSDMeasurements {
  facialMidlineDeviation: number;
  centralIncisorsWLRatio: number;
  goldenRatioLateral: number;
  goldenRatioCanine: number;
  redProportion: number;
  smileArcDeviation: number;
  gingivalMarginDev: number[];
  gingivalSymmetry: number;
  midlineDeviation: number;
  smileFullness: number;
  caninePositionDev: number;
  buccalCorridors: number;
  toothTilt: number[];
  occlusalPlaneCant: number;
  incisorEdgePositions: number[];
  lipSupportScore: number;
  profileAnalysisNeeded: boolean;
  verticalDimensionRatio: number;
  smileConvexityScore: number;
  toothVisibilityAtRest: number;
  smileAnimationPathway: string;
  intercanineWidth: number;
  intercommissuralWidth: number;
}

interface AnalysisResult {
  measurements: DSDMeasurements;
  calibration: Calibration;
  overallHarmony: number;
  clinicalRecommendations: string[];
  classificationNotes: string;
  measurementConfidence: Record<string, number>;
  /** Evidence-banded metrics from the measurement core. */
  report: DsdReport;
}

export function ARCanvas() {
  const [, navigate] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unwatchStreamRef = useRef<(() => void) | null>(null);
  const cameraSessionRef = useRef(0);
  const detectFailuresRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineAttempt, setEngineAttempt] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "starting" | "live" | "failed">("idle");
  const [cameraFailure, setCameraFailure] = useState<CameraFailure | null>(null);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  const [showFacialGuides, setShowFacialGuides] = useState(true);
  const [showDentalGuides, setShowDentalGuides] = useState(true);
  const [showGingival, setShowGingival] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showDeviation, setShowDeviation] = useState(true);
  
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [displayedHarmony, setDisplayedHarmony] = useState(0);
  const faceLandmarkerRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  const teethRef = useRef<Landmark[] | null>(null);
  const netRef = useRef<LoadedNet | null>(null);
  const netBusyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const waitForSdk = async (timeoutMs: number) => {
      const startedAt = Date.now();
      while (!cancelled && Date.now() - startedAt < timeoutMs) {
        if (window.FilesetResolver && window.FaceLandmarker) return true;
        await new Promise<void>((resolve) => {
          retryTimer = setTimeout(resolve, 250);
        });
      }
      return Boolean(window.FilesetResolver && window.FaceLandmarker);
    };

    const createLandmarker = async (delegate: "GPU" | "CPU") => {
      const filesetResolver = await window.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      return window.FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        outputFaceBlendshapes: false,
        runningMode: "VIDEO",
        numFaces: 1,
      });
    };

    const initMediaPipe = async () => {
      setIsLoaded(false);
      setEngineError(null);

      try {
        let sdkReady = await waitForSdk(12000);

        // The inline CDN script can be blocked by a network or an extension;
        // fall back to importing the very same module directly.
        if (!sdkReady) {
          try {
            const sdk: any = await import(/* @vite-ignore */ MEDIAPIPE_ESM_URL);
            window.FaceLandmarker = sdk.FaceLandmarker;
            window.FilesetResolver = sdk.FilesetResolver;
            window.DrawingUtils = sdk.DrawingUtils;
            sdkReady = Boolean(window.FaceLandmarker && window.FilesetResolver);
          } catch (importError) {
            console.error("MediaPipe module import failed:", importError);
          }
        }

        if (!sdkReady) {
          throw new Error("Face-analysis engine could not be downloaded.");
        }

        let landmarker: any;
        try {
          landmarker = await createLandmarker("GPU");
        } catch (gpuError) {
          console.warn("GPU delegate unavailable, retrying with CPU:", gpuError);
          landmarker = await createLandmarker("CPU");
        }

        if (cancelled) {
          landmarker?.close?.();
          return;
        }

        faceLandmarkerRef.current?.close?.();
        faceLandmarkerRef.current = landmarker;
        setIsLoaded(true);
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
        if (!cancelled) {
          setEngineError(
            "The face-analysis engine could not load. Check your internet connection, then press Retry.",
          );
        }
      }
    };

    initMediaPipe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      faceLandmarkerRef.current?.close?.();
      faceLandmarkerRef.current = null;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [engineAttempt]);

  // Animate harmony score
  useEffect(() => {
    if (!analysis) {
      setDisplayedHarmony(0);
      return;
    }

    let currentValue = displayedHarmony;
    const target = analysis.overallHarmony;
    const diff = target - currentValue;
    
    const interval = setInterval(() => {
      currentValue += diff * 0.15; // Easing factor
      if (Math.abs(target - currentValue) < 1) {
        setDisplayedHarmony(target);
        clearInterval(interval);
      } else {
        setDisplayedHarmony(Math.round(currentValue));
      }
    }, 30);

    return () => clearInterval(interval);
  }, [analysis?.overallHarmony]);

  // Sample tooth keypoints a few times per second. The dental network is heavier
  // than the face mesh, so it runs on a throttle instead of every frame and the
  // overlay reuses the most recent accepted result.
  useEffect(() => {
    if (cameraStatus !== "live" || photoMode) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || netBusyRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      netBusyRef.current = true;
      try {
        if (!netRef.current) netRef.current = await loadDentalNet();
        if (cancelled || !netRef.current) return;
        const outputs = await runDentalNet(netRef.current, preprocess(video));
        const decoded = decodeAndGate(outputs);
        teethRef.current = decoded.landmarks.filter((l) => l.accepted);
      } catch {
        teethRef.current = null;
      } finally {
        netBusyRef.current = false;
      }
    };

    const timer = setInterval(tick, 1000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cameraStatus, photoMode]);

  const calculateDSDMeasurements = useCallback((landmarks: any[], w: number, h: number): AnalysisResult => {
    const measurements: DSDMeasurements = {
      facialMidlineDeviation: 0,
      centralIncisorsWLRatio: 78,
      goldenRatioLateral: 62,
      goldenRatioCanine: 62,
      redProportion: 70,
      smileArcDeviation: 0,
      gingivalMarginDev: [0, 0, 0, 0, 0, 0],
      gingivalSymmetry: 95,
      midlineDeviation: 0,
      smileFullness: 85,
      caninePositionDev: 0,
      buccalCorridors: 2.5,
      toothTilt: [0, 0, 0, 0, 0, 0],
      occlusalPlaneCant: 0,
      incisorEdgePositions: [0, 0, 0, 0, 0, 0],
      lipSupportScore: 85,
      profileAnalysisNeeded: true,
      verticalDimensionRatio: 50,
      smileConvexityScore: 70,
      toothVisibilityAtRest: 0,
      smileAnimationPathway: "Balanced",
      intercanineWidth: 0,
      intercommissuralWidth: 0,
    };

    // Derive the metric scale from the face itself (iris diameter) so that
    // millimetre values rest on an anatomical reference instead of an
    // assumed pixel factor. Falls back to IPD, then face width.
    const calibration = calibrateFromLandmarks(landmarks, w, h);
    const toMm = (pixels: number) => toMillimetres(pixels, calibration);

    try {
      const glabella = landmarks[10];
      const chin = landmarks[152];
      const facialMidX = (glabella.x + chin.x) / 2;
      const centerX = 0.5;
      measurements.facialMidlineDeviation = toMm(Math.abs(facialMidX - centerX) * w);

      const upperMidpoint = landmarks[13];
      const dentalMidX = upperMidpoint.x;
      measurements.midlineDeviation = toMm(Math.abs(dentalMidX - facialMidX) * w);

      const leftMouthCorner = landmarks[61];
      const rightMouthCorner = landmarks[291];
      const mouthWidth = Math.abs(rightMouthCorner.x - leftMouthCorner.x) * w;
      
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const mouthHeight = Math.abs(lowerLip.y - upperLip.y) * h;
      
      const centralWidth = mouthWidth * 0.35;
      measurements.centralIncisorsWLRatio = Math.min(Math.max((centralWidth / (mouthHeight || 1)) * 100, 50), 100);

      const lateralWidth = mouthWidth * 0.25;
      const canineWidth = mouthWidth * 0.20;
      measurements.goldenRatioLateral = (lateralWidth / centralWidth) * 100;
      measurements.goldenRatioCanine = (canineWidth / lateralWidth) * 100;

      measurements.redProportion = measurements.centralIncisorsWLRatio;

      const lowerlipPoints = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
      let smileArcDev = 0;
      for (let i = 1; i < lowerlipPoints.length; i++) {
        const prev = landmarks[lowerlipPoints[i - 1]];
        const curr = landmarks[lowerlipPoints[i]];
        const curvature = Math.abs(curr.y - prev.y);
        smileArcDev += curvature;
      }
      measurements.smileArcDeviation = Math.min(smileArcDev * 50, 100);

      const upperInnerLip = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
      measurements.gingivalMarginDev = upperInnerLip.map((idx) => {
        const pt = landmarks[idx];
        const expectedY = landmarks[13].y;
        return Math.abs(pt.y - expectedY) * 100;
      });

      const leftGingival = measurements.gingivalMarginDev.slice(0, 3);
      const rightGingival = measurements.gingivalMarginDev.slice(3).reverse();
      let symmetryDiff = 0;
      for (let i = 0; i < Math.min(leftGingival.length, rightGingival.length); i++) {
        symmetryDiff += Math.abs(leftGingival[i] - rightGingival[i]);
      }
      measurements.gingivalSymmetry = Math.max(0, 100 - symmetryDiff * 5);

      const mouthDisplay = Math.abs(upperLip.y - lowerLip.y) * h;
      const faceHeight = Math.abs(glabella.y - chin.y) * h;
      measurements.smileFullness = (mouthDisplay / (faceHeight || 1)) * 100;

      // Buccal corridor is the gap between the commissure and the inner cheek.
      // This previously reused the mouth corners as "cheek width", so the value
      // was always zero; the cheek landmarks give a real measurement.
      const faceWidthPx = Math.abs(landmarks[454].x - landmarks[234].x) * w;
      measurements.buccalCorridors = Math.max(0, toMm((faceWidthPx - mouthWidth) / 2));

      const canineExpectedX = leftMouthCorner.x + (rightMouthCorner.x - leftMouthCorner.x) * 0.15;
      const canineActualX = landmarks[291].x;
      measurements.caninePositionDev = Math.abs((canineActualX - canineExpectedX) * 100);

      const teethCenters = [82, 83, 84, 13, 314, 315, 316];
      measurements.toothTilt = teethCenters.map((idx, i) => {
        if (i > 0) {
          const prev = landmarks[teethCenters[i - 1]];
          const curr = landmarks[idx];
          const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x) * (180 / Math.PI);
          return Math.abs(angle);
        }
        return 0;
      });

      // OCCLUSAL PLANE CANT (Critical finding - horizontal tilt)
      const leftCuspidTip = landmarks[61]; // Left mouth corner
      const rightCuspidTip = landmarks[291]; // Right mouth corner
      const leftTeethMid = landmarks[84]; // Left tooth area
      const rightTeethMid = landmarks[314]; // Right tooth area
      
      const leftEdgeHeight = (leftCuspidTip.y + leftTeethMid.y) / 2;
      const rightEdgeHeight = (rightCuspidTip.y + rightTeethMid.y) / 2;
      // Reported in degrees, as the label claims: a slope, not a normalised ratio.
      const cantDx = Math.abs(rightCuspidTip.x - leftCuspidTip.x) * w;
      const cantDy = Math.abs(rightEdgeHeight - leftEdgeHeight) * h;
      measurements.occlusalPlaneCant = cantDx > 0 ? (Math.atan2(cantDy, cantDx) * 180) / Math.PI : 0;

      // INCISOR EDGE POSITIONS (Per-tooth vertical alignment)
      const incisorPoints = [82, 83, 84, 13, 314, 315, 316]; // Anterior teeth
      const avgTeethHeight = incisorPoints.reduce((sum, idx) => sum + landmarks[idx].y, 0) / incisorPoints.length;
      measurements.incisorEdgePositions = incisorPoints.map((idx) => {
        // Vertical incisal step in millimetres, capped at a plausible step.
        const stepMm = toMm(Math.abs(landmarks[idx].y - avgTeethHeight) * h);
        return Math.min(stepMm, 20);
      });

      // LIP SUPPORT ASSESSMENT (How well teeth support upper lip)
      const upperLipThickness = Math.abs(landmarks[13].y - landmarks[12].y) * h;
      const toothSupportWidth = Math.abs(rightMouthCorner.x - leftMouthCorner.x) * w;
      measurements.lipSupportScore = Math.min((toothSupportWidth / (h * 0.3)) * 100, 100);

      // Profile analysis detection
      measurements.profileAnalysisNeeded = true;

      // VERTICAL DIMENSION RATIO (Critical for VDO assessment)
      // Ratio of lower facial height to total facial height
      const upperFaceHeight = Math.abs(glabella.y - landmarks[13].y) * h; // Glabella to upper lip
      const lowerFaceHeight = Math.abs(landmarks[13].y - chin.y) * h; // Upper lip to chin
      const totalFaceHeight = Math.abs(glabella.y - chin.y) * h;
      measurements.verticalDimensionRatio = totalFaceHeight > 0 ? (lowerFaceHeight / totalFaceHeight) * 100 : 50;
      // Clinical ideal: 43-45% lower face height. 40-50% is acceptable range

      // SMILE CONVEXITY SCORE (Arc smoothness - affects perception)
      // Measure how smooth/curved the smile line is vs straight
      const smileCurvePoints = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
      let curvatureTotal = 0;
      for (let i = 1; i < smileCurvePoints.length - 1; i++) {
        const prev = landmarks[smileCurvePoints[i - 1]];
        const curr = landmarks[smileCurvePoints[i]];
        const next = landmarks[smileCurvePoints[i + 1]];
        const curve = Math.abs((prev.y + next.y) / 2 - curr.y);
        curvatureTotal += curve;
      }
      measurements.smileConvexityScore = Math.min((curvatureTotal * 500), 100); // Smooth curve = high score

      // TOOTH VISIBILITY AT REST (How many teeth show with lips closed)
      // If lips are touching but show some teeth, count visible tooth pixels
      const upperLipLine = landmarks[13].y;
      const lowerLipLine = landmarks[14].y;
      const lipGapRatio = Math.abs(lowerLipLine - upperLipLine);
      // Approximate tooth visibility (0-100%): how much gap shows teeth
      measurements.toothVisibilityAtRest = Math.min((lipGapRatio * 200), 30); // Max 30% visible at rest is gummy

      // SMILE ANIMATION PATHWAY (How lips move: horizontal vs vertical)
      // Compare horizontal mouth expansion vs vertical lip elevation
      const restMouthWidth = Math.abs(landmarks[291].x - landmarks[61].x) * w;
      const smileMouthWidth = restMouthWidth * 1.15; // Approximate 15% expansion when smiling
      const lipElevation = Math.abs(upperLip.y - landmarks[13].y) * h; // Upper lip lift
      const horizontalMovement = smileMouthWidth - restMouthWidth;
      
      if (horizontalMovement > lipElevation * 2) {
        measurements.smileAnimationPathway = "Horizontal-Dominant";
      } else if (lipElevation > horizontalMovement * 2) {
        measurements.smileAnimationPathway = "Vertical-Dominant";
      } else {
        measurements.smileAnimationPathway = "Balanced";
      }

      // INTERCANINE WIDTH (Distance between canine tips - arch width indicator)
      // Face-mesh landmarks do not include the canine cusps, so this is the
      // intercommissural span converted with the iris scale and labelled as a
      // mouth-width proxy rather than pretending to be a true intercanine width.
      measurements.intercommissuralWidth = toMm(Math.abs(rightMouthCorner.x - leftMouthCorner.x) * w);
      measurements.intercanineWidth = measurements.intercommissuralWidth;
    } catch (e) {
      console.error("Measurement calculation error:", e);
    }

    const deviations = [
      Math.min(measurements.facialMidlineDeviation, 50),
      Math.abs(measurements.centralIncisorsWLRatio - 78) / 78 * 100,
      Math.abs(measurements.goldenRatioLateral - 62) / 62 * 100,
      Math.abs(measurements.goldenRatioCanine - 62) / 62 * 100,
      measurements.gingivalSymmetry < 80 ? (80 - measurements.gingivalSymmetry) : 0,
      Math.min(measurements.smileArcDeviation, 50),
    ];

    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const overallHarmony = Math.max(0, Math.round(100 - avgDeviation));

    const recommendations: string[] = [];
    
    if (measurements.facialMidlineDeviation > 2) {
      recommendations.push(`Screening flag: facial midline deviation ${measurements.facialMidlineDeviation.toFixed(1)} mm (reference <2 mm) — verify clinically before planning correction`);
    }
    if (Math.abs(measurements.midlineDeviation) > 1.5) {
      recommendations.push(`Screening flag: dental-to-facial midline discrepancy ${measurements.midlineDeviation.toFixed(1)} mm — verify clinically before any repositioning`);
    }
    if (Math.abs(measurements.centralIncisorsWLRatio - 78) > 12) {
      recommendations.push(`Screening flag: central incisor width/length ratio ${measurements.centralIncisorsWLRatio.toFixed(0)}% (esthetic reference ~78%) — discuss proportional options with the clinician`);
    }
    if (Math.abs(measurements.goldenRatioLateral - 62) > 10) {
      recommendations.push(`Screening flag: lateral-to-central width ratio ${measurements.goldenRatioLateral.toFixed(0)}% (reference ~62%) — review proportion with the clinician`);
    }
    if (measurements.gingivalSymmetry < 80) {
      recommendations.push(`Screening flag: gingival symmetry index ${measurements.gingivalSymmetry.toFixed(0)}% — confirm on clinical examination`);
    }
    if (measurements.smileArcDeviation > 40) {
      recommendations.push("Screening flag: smile arc does not follow the lower lip — verify clinically");
    }
    if (measurements.buccalCorridors > 4.5) {
      recommendations.push(`Screening flag: buccal corridor ${measurements.buccalCorridors.toFixed(1)} mm per side — review arch width on examination`);
    }
    if (measurements.smileFullness < 60) {
      recommendations.push("Screening flag: limited smile fullness — evaluate vertical dimension clinically");
    }
    if (measurements.smileFullness > 100) {
      recommendations.push("Screening flag: excessive gingival display — assess lip length and gingival margins clinically");
    }
    if (measurements.occlusalPlaneCant > 2) {
      recommendations.push(`Screening flag: occlusal plane cant ${measurements.occlusalPlaneCant.toFixed(1)}° — confirm on clinical photographs`);
    }
    if (Math.max(...measurements.incisorEdgePositions) > 1) {
      recommendations.push("Screening flag: anterior incisal edge step — verify individual tooth position clinically");
    }
    if (measurements.lipSupportScore < 70) {
      recommendations.push("Screening flag: reduced lip support — evaluate vertical dimension and posterior support");
    }
    if (measurements.verticalDimensionRatio < 42 || measurements.verticalDimensionRatio > 48) {
      recommendations.push(`Screening flag: lower-to-total facial height ${measurements.verticalDimensionRatio.toFixed(1)}% (reference 43-45%) — assess vertical dimension clinically`);
    }
    if (measurements.smileConvexityScore < 50) {
      recommendations.push("Screening flag: smile line convexity is low — verify smile arc clinically");
    }
    if (measurements.toothVisibilityAtRest > 25) {
      recommendations.push(`Screening flag: ${measurements.toothVisibilityAtRest.toFixed(0)}% tooth display at rest — assess for gummy smile presentation`);
    }
    if (measurements.smileAnimationPathway === "Vertical-Dominant") {
      recommendations.push("Note: smile shows predominantly vertical movement — review with the clinician");
    }

    if (calibration.confidence < 0.7) {
      recommendations.push(
        `Measurement note: scale derived from ${calibration.label} (confidence ${(calibration.confidence * 100).toFixed(0)}%). Treat millimetre values as indicative and re-capture with both irises clearly visible.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("✓ All screened parameters fall within esthetic reference ranges — no flags raised");
    }

    let classificationNotes = "";
    if (measurements.smileFullness > 80) {
      classificationNotes += "High/Gummy Smile | ";
    }
    if (measurements.smileFullness < 50) {
      classificationNotes += "Low Smile | ";
    }
    if (measurements.buccalCorridors > 4) {
      classificationNotes += "Buccal Corridors Present | ";
    }
    if (measurements.gingivalSymmetry < 80) {
      classificationNotes += "Asymmetrical Gingiva | ";
    }
    if (classificationNotes === "") {
      classificationNotes = "Balanced Smile Characteristics";
    }

    // Everything above derives from face-mesh landmarks. Tooth-level values are
    // only trustworthy when the dental network accepted keypoints on this frame,
    // so measured values replace the landmark estimates and anything that cannot
    // be measured is marked unavailable instead of shown as a plausible number.
    const report = buildReport({
      facePoints: landmarks,
      teeth: teethRef.current,
      calibration,
      width: w,
      height: h,
      profile: "clinician",
    });

    const measured = (id: string): number => metricValue(report, id) ?? Number.NaN;

    measurements.centralIncisorsWLRatio = measured("central_wl_ratio");
    measurements.goldenRatioLateral = measured("lateral_central_width_ratio");
    measurements.goldenRatioCanine = measured("canine_lateral_width_ratio");
    measurements.redProportion = Number.NaN; // not found in natural dentition; report-only
    measurements.smileArcDeviation = measured("smile_arc");
    measurements.gingivalSymmetry = measured("gingival_margin_diff");
    measurements.midlineDeviation = measured("dental_midline_shift");
    measurements.occlusalPlaneCant = measured("occlusal_plane_cant");
    measurements.toothVisibilityAtRest = measured("incisor_display_rest");
    measurements.buccalCorridors = measured("buccal_corridor");
    measurements.smileFullness = Number.NaN;
    measurements.lipSupportScore = Number.NaN;
    measurements.verticalDimensionRatio = Number.NaN;
    measurements.smileConvexityScore = Number.NaN;
    measurements.caninePositionDev = Number.NaN;
    measurements.intercanineWidth = Number.NaN;
    measurements.intercommissuralWidth = Number.NaN;
    measurements.gingivalMarginDev = [];
    measurements.toothTilt = [];
    measurements.incisorEdgePositions = [];
    measurements.smileAnimationPathway = "Unmeasured";

    // Confidence follows the calibration basis and whether tooth keypoints exist,
    // rather than a fixed table of reassuring numbers.
    const basis = Math.round(Math.min(100, Math.max(0, calibration.confidence * 100)));
    const teethSeen = (teethRef.current?.length ?? 0) > 0;
    const measurementConfidence: Record<string, number> = {
      "W/L": teethSeen ? basis : 0,
      "GR-L": teethSeen ? basis : 0,
      "Sym": teethSeen ? basis : 0,
      "Cant": teethSeen ? basis : 0,
      "VDO": 0,
      "Conv": 0,
      "RestTooth": teethSeen ? basis : 0,
      "Pathway": 0,
      "IcW": 0,
    };

    return {
      measurements,
      calibration,
      overallHarmony: report.score ?? 0,
      clinicalRecommendations: recommendations,
      classificationNotes: classificationNotes.replace(/\s\|\s$/, ""),
      measurementConfidence,
      report,
    };
  }, []);

  const draw = useCallback(() => {
    if (photoMode) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const overlayCtx = overlayCanvas?.getContext("2d");

    if (!video || !canvas || !ctx || !overlayCanvas || !overlayCtx || !faceLandmarkerRef.current || video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(draw);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;
    }

    // Ensure canvas has valid dimensions before processing
    if (canvas.width === 0 || canvas.height === 0) {
      requestRef.current = requestAnimationFrame(draw);
      return;
    }

    const startTimeMs = performance.now();
    let results: any;
    try {
      results = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);
      detectFailuresRef.current = 0;
    } catch (detectError) {
      // A lost WebGL context, or a GPU the driver refuses to use, can make
      // detection throw on every single frame. Count consecutive failures,
      // warn once, then stop the loop instead of spinning the CPU forever
      // with one uncaught exception per animation frame.
      detectFailuresRef.current += 1;
      if (detectFailuresRef.current === 30) {
        console.warn("AR detection repeatedly failed, stopping render loop:", detectError);
        toast({
          title: "AR engine stalled",
          description:
            "The face tracker stopped responding on this device. Reload the page or analyze a photo instead.",
          variant: "destructive",
        });
      }
      if (detectFailuresRef.current >= 30) return;
      requestRef.current = requestAnimationFrame(draw);
      return;
    }

    // Draw webcam frame to canvas
    ctx.save();
    if (cameraFacingMode === "user") {
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    overlayCtx.save();
    if (cameraFacingMode === "user") {
      overlayCtx.scale(-1, 1);
      overlayCtx.translate(-overlayCanvas.width, 0);
    }

    if (results.faceLandmarks) {
      for (const landmarks of results.faceLandmarks) {
        const analysisResult = calculateDSDMeasurements(landmarks, canvas.width, canvas.height);
        setAnalysis(analysisResult);

        if (showFacialGuides) {
          drawFacialGuides(overlayCtx, landmarks, canvas.width, canvas.height);
        }
        if (showDentalGuides) {
          drawDentalGuides(overlayCtx, landmarks, canvas.width, canvas.height);
        }
        if (showGingival) {
          drawGingivalAnalysis(overlayCtx, landmarks, canvas.width, canvas.height, analysisResult);
        }
        if (showMeasurements) {
          drawMeasurementAnnotations(overlayCtx, landmarks, canvas.width, canvas.height, analysisResult);
        }
        if (showDeviation) {
          drawDeviationIndicators(overlayCtx, landmarks, canvas.width, canvas.height, analysisResult);
        }
      }
    }

    overlayCtx.restore();
    requestRef.current = requestAnimationFrame(draw);
  }, [calculateDSDMeasurements, showFacialGuides, showDentalGuides, showGingival, showMeasurements, showDeviation, cameraFacingMode, photoMode]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [draw]);

  const drawFacialGuides = (ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number) => {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "hsl(180, 100%, 50%)";

    const top = landmarks[10];
    const bottom = landmarks[152];
    ctx.beginPath();
    ctx.moveTo(top.x * w, top.y * h);
    ctx.lineTo(bottom.x * w, bottom.y * h);
    ctx.stroke();

    ctx.strokeStyle = "hsl(50, 100%, 50%)";
    const leftPupil = landmarks[468];
    const rightPupil = landmarks[473];
    ctx.beginPath();
    ctx.moveTo(leftPupil.x * w, leftPupil.y * h);
    ctx.lineTo(rightPupil.x * w, rightPupil.y * h);
    ctx.stroke();

    ctx.strokeStyle = "rgba(200, 200, 200, 0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    const refY = landmarks[13].y * h;
    ctx.beginPath();
    ctx.moveTo(0, refY);
    ctx.lineTo(w, refY);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawDentalGuides = (ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number) => {
    ctx.lineWidth = 2;
    
    ctx.strokeStyle = "hsl(180, 100%, 50%)";
    const smilePath = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
    ctx.beginPath();
    smilePath.forEach((idx, i) => {
      const pt = landmarks[idx];
      if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
      else ctx.lineTo(pt.x * w, pt.y * h);
    });
    ctx.stroke();

    ctx.strokeStyle = "hsl(50, 100%, 50%)";
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];
    ctx.beginPath();
    ctx.moveTo(leftMouth.x * w, leftMouth.y * h);
    ctx.lineTo(rightMouth.x * w, rightMouth.y * h);
    ctx.stroke();

    ctx.strokeStyle = "hsl(180, 100%, 50%)";
    ctx.lineWidth = 2;
    const upperMid = landmarks[13];
    const lowerMid = landmarks[14];
    ctx.beginPath();
    ctx.moveTo(upperMid.x * w, (upperMid.y - 0.15) * h);
    ctx.lineTo(lowerMid.x * w, (lowerMid.y + 0.15) * h);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(100, 200, 255, 0.3)";
    const teethCenters = [82, 83, 84, 13, 314, 315, 316];
    teethCenters.forEach((idx) => {
      const pt = landmarks[idx];
      const offset = 0.08;
      ctx.beginPath();
      ctx.moveTo(pt.x * w, (pt.y - offset) * h);
      ctx.lineTo(pt.x * w, (pt.y + offset) * h);
      ctx.stroke();
    });
  };

  const drawGingivalAnalysis = (ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number, analysis: AnalysisResult) => {
    ctx.lineWidth = 2;
    
    const upperInner = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
    const referenceLine = landmarks[13].y;
    
    ctx.strokeStyle = "hsl(0, 100%, 50%)";
    ctx.beginPath();
    upperInner.forEach((idx, i) => {
      const pt = landmarks[idx];
      if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
      else ctx.lineTo(pt.x * w, pt.y * h);
    });
    ctx.stroke();

    ctx.strokeStyle = "rgba(0, 200, 100, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const firstPt = landmarks[upperInner[0]];
    const lastPt = landmarks[upperInner[upperInner.length - 1]];
    ctx.beginPath();
    ctx.moveTo(firstPt.x * w, referenceLine * h);
    ctx.lineTo(lastPt.x * w, referenceLine * h);
    ctx.stroke();
    ctx.setLineDash([]);

    upperInner.forEach((idx, i) => {
      const pt = landmarks[idx];
      const deviation = Math.abs(pt.y - referenceLine) * 100;
      
      if (deviation > 5) {
        ctx.fillStyle = "rgba(255, 100, 100, 0.6)";
      } else if (deviation > 2) {
        ctx.fillStyle = "rgba(255, 200, 100, 0.6)";
      } else {
        ctx.fillStyle = "rgba(100, 255, 100, 0.6)";
      }
      
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawMeasurementAnnotations = (ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number, analysis: AnalysisResult) => {
    ctx.font = "12px 'Outfit', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.textAlign = "center";

    const meas = analysis.measurements;
    const upperLip = landmarks[13];
    ctx.fillText(`W/L: ${meas.centralIncisorsWLRatio.toFixed(0)}%`, upperLip.x * w, (upperLip.y + 0.05) * h);

    const mouthCenter = landmarks[14];
    ctx.fillText(`Fullness: ${meas.smileFullness.toFixed(0)}%`, mouthCenter.x * w, (mouthCenter.y + 0.08) * h);

    const noseBase = landmarks[2];
    ctx.fillText(`Symmetry: ${meas.gingivalSymmetry.toFixed(0)}%`, noseBase.x * w, (noseBase.y + 0.1) * h);
  };

  const drawDeviationIndicators = (ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number, analysis: AnalysisResult) => {
    const meas = analysis.measurements;
    const centerX = w * 0.5;
    const topY = h * 0.05;

    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    
    const metrics = [
      { label: "W/L", val: meas.centralIncisorsWLRatio, ideal: 78, range: 15 },
      { label: "GR-L", val: meas.goldenRatioLateral, ideal: 62, range: 8 },
      { label: "Symm", val: meas.gingivalSymmetry, ideal: 95, range: 10 },
      { label: "SFA", val: 100 - Math.min(meas.smileArcDeviation, 50), ideal: 90, range: 20 },
    ];

    metrics.forEach((m, i) => {
      const x = centerX - 120 + i * 80;
      const deviation = Math.abs(m.val - m.ideal);
      
      let color = "hsl(120, 100%, 50%)";
      if (deviation > m.range * 0.5) color = "hsl(0, 100%, 50%)";
      else if (deviation > m.range * 0.25) color = "hsl(50, 100%, 50%)";
      
      ctx.fillStyle = color;
      ctx.fillRect(x, topY, 60, 3);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.textAlign = "center";
      ctx.fillText(`${m.label}`, x + 30, topY + 16);
      ctx.fillText(`${m.val.toFixed(0)}%`, x + 30, topY + 27);
    });
  };

  const paintOverlays = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    w: number,
    h: number,
    analysisResult: AnalysisResult,
  ) => {
    if (showFacialGuides) drawFacialGuides(ctx, landmarks, w, h);
    if (showDentalGuides) drawDentalGuides(ctx, landmarks, w, h);
    if (showGingival) drawGingivalAnalysis(ctx, landmarks, w, h, analysisResult);
    if (showMeasurements) drawMeasurementAnnotations(ctx, landmarks, w, h, analysisResult);
    if (showDeviation) drawDeviationIndicators(ctx, landmarks, w, h, analysisResult);
  };

  const startCamera = useCallback(
    async (options?: { deviceId?: string | null; facingMode?: "user" | "environment" }) => {
      const session = cameraSessionRef.current + 1;
      cameraSessionRef.current = session;

      // Release whatever a previous attempt still holds before asking for the
      // device again, otherwise the OS reports the camera as busy.
      unwatchStreamRef.current?.();
      unwatchStreamRef.current = null;
      detachVideo(videoRef.current);
      stopStream(streamRef.current);
      streamRef.current = null;

      const support = checkCameraSupport();
      if (!support.supported) {
        setCameraStatus("failed");
        setCameraFailure(support.failure ?? null);
        return;
      }

      setCameraStatus("starting");
      setCameraFailure(null);

      try {
        const opened = await openCamera({
          deviceId: options?.deviceId ?? null,
          facingMode: options?.facingMode ?? cameraFacingMode,
        });

        // A newer attempt started while this one was still pending.
        if (session !== cameraSessionRef.current) {
          stopStream(opened.stream);
          return;
        }

        streamRef.current = opened.stream;
        if (opened.deviceId) setActiveDeviceId(opened.deviceId);

        const video = videoRef.current;
        if (!video) {
          stopStream(opened.stream);
          streamRef.current = null;
          return;
        }

        await attachStreamToVideo(video, opened.stream);

        if (session !== cameraSessionRef.current) {
          stopStream(opened.stream);
          return;
        }

        setCameraStatus("live");

        // Detect the camera vanishing mid-session (USB unplugged, laptop lid
        // closed, another app grabbing the device) instead of freezing on the
        // last frame with no explanation.
        unwatchStreamRef.current = watchStreamEnded(opened.stream, () => {
          if (session !== cameraSessionRef.current) return;
          setCameraStatus("failed");
          setCameraFailure({
            code: "disconnected",
            title: "Camera disconnected",
            message:
              "The camera was unplugged or taken over by another app. Reconnect it, then retry.",
            recoverable: true,
          });
        });

        void listVideoInputs().then((inputs) => setVideoInputs(inputs));
      } catch (error) {
        if (session !== cameraSessionRef.current) return;
        const described =
          error && typeof error === "object" && "code" in error
            ? (error as CameraFailure)
            : describeCameraError(error);
        console.warn("Camera start failed:", described.code, error);
        setCameraStatus("failed");
        setCameraFailure(described);
      }
    },
    [cameraFacingMode],
  );

  // Start on mount, restart when the facing preference changes, and release the
  // device completely when photo mode takes over or the page unmounts.
  useEffect(() => {
    if (photoMode) return;
    void startCamera({ facingMode: cameraFacingMode });
    return () => {
      cameraSessionRef.current += 1;
      unwatchStreamRef.current?.();
      unwatchStreamRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      detachVideo(videoRef.current);
    };
  }, [photoMode, startCamera, cameraFacingMode]);

  // Keep the device list current so hot-plugged webcams appear immediately.
  useEffect(() => {
    void listVideoInputs().then((inputs) => setVideoInputs(inputs));
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!mediaDevices || typeof mediaDevices.addEventListener !== "function") return;
    const handleDeviceChange = () => {
      void listVideoInputs().then((inputs) => setVideoInputs(inputs));
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

  const retryCamera = useCallback(() => {
    void startCamera({ deviceId: activeDeviceId, facingMode: cameraFacingMode });
  }, [startCamera, activeDeviceId, cameraFacingMode]);

  const useCameraMode = async () => {
    try {
      await faceLandmarkerRef.current?.setOptions?.({ runningMode: "VIDEO" });
    } catch (error) {
      console.warn("Could not switch AR engine back to video mode:", error);
    }
    // The camera effect restarts the stream once photo mode is off; calling
    // startCamera here as well would open the device twice and race for it.
    setPhotoMode(false);
  };

  const analyzePhoto = async (file: File) => {
    const landmarker = faceLandmarkerRef.current;
    if (!landmarker) {
      toast({
        title: "AR engine not ready",
        description: "Wait for the engine to finish loading, then try the photo again.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzingPhoto(true);
    const objectUrl = URL.createObjectURL(file);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("That file could not be read as an image."));
        image.src = objectUrl;
      });

      const canvas = canvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      const overlayCtx = overlayCanvas?.getContext("2d");
      if (!canvas || !overlayCanvas || !ctx || !overlayCtx) {
        throw new Error("The display is not ready yet. Try again in a moment.");
      }

      const maxWidth = 1280;
      const sourceWidth = img.naturalWidth || maxWidth;
      const sourceHeight = img.naturalHeight || maxWidth;
      const scale = Math.min(1, maxWidth / sourceWidth);

      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      overlayCanvas.width = canvas.width;
      overlayCanvas.height = canvas.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      let results: any;
      try {
        await landmarker.setOptions?.({ runningMode: "IMAGE" });
        results = await landmarker.detect(img);
      } catch (detectError) {
        console.warn("Image-mode detection failed, retrying in video mode:", detectError);
        results = landmarker.detectForVideo(img, performance.now());
      }

      const landmarks = results?.faceLandmarks?.[0];
      setPhotoMode(true);

      if (!landmarks) {
        toast({
          title: "No face detected",
          description: "Use a clear, front-facing photo where the whole face and smile are visible.",
          variant: "destructive",
        });
        return;
      }

      const analysisResult = calculateDSDMeasurements(landmarks, canvas.width, canvas.height);
      setAnalysis(analysisResult);
      paintOverlays(overlayCtx, landmarks, canvas.width, canvas.height, analysisResult);

      toast({
        title: "Photo analyzed",
        description: "Smile measurements are drawn on your photo.",
      });
    } catch (error) {
      console.error("Photo analysis failed:", error);
      toast({
        title: "Photo analysis failed",
        description: error instanceof Error ? error.message : "Please try a different photo.",
        variant: "destructive",
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsAnalyzingPhoto(false);
    }
  };

  const switchCamera = useCallback(() => {
    void (async () => {
      const inputs = await listVideoInputs();
      setVideoInputs(inputs);

      // Previously this flipped facingMode blindly. On a laptop with a single
      // front camera that requested a required "environment" device and threw
      // OverconstrainedError, killing the camera until a full remount.
      if (inputs.length <= 1) {
        toast({
          title: "Only one camera detected",
          description: "This machine has a single camera, so there is nothing to switch to.",
        });
        return;
      }

      const currentIndex = inputs.findIndex((device) => device.deviceId === activeDeviceId);
      const next = inputs[(currentIndex + 1) % inputs.length];
      setActiveDeviceId(next.deviceId);
      await startCamera({ deviceId: next.deviceId, facingMode: cameraFacingMode });
    })();
  }, [activeDeviceId, cameraFacingMode, startCamera]);

  const generateReport = () => {
    if (!analysis) return;

    const meas = analysis.measurements;
    const timestamp = new Date().toLocaleString();
    const report = `
═══════════════════════════════════════════════════════════════
LUMINA ULTRA - CLINICAL DSD ANALYSIS REPORT
═══════════════════════════════════════════════════════════════
Generated: ${timestamp}
Platform Version: 1.0 Clinical Grade

═══ OVERALL HARMONY SCORE ═══
${analysis.overallHarmony}/100 ${
      analysis.overallHarmony >= 85
        ? "✓ EXCELLENT"
        : analysis.overallHarmony >= 70
          ? "△ ACCEPTABLE"
          : "⚠ REQUIRES ATTENTION"
    }

═══ SMILE CLASSIFICATION ═══
${analysis.classificationNotes}

═══ FACIAL ANALYSIS ═══
• Facial Midline Deviation: ${meas.facialMidlineDeviation.toFixed(2)}mm
  (Clinical threshold: <2mm) ${meas.facialMidlineDeviation < 2 ? "✓" : "⚠"}
• Inter-Pupillary Reference: Established

═══ DENTAL ANALYSIS ═══
• Central Incisor W/L Ratio: ${meas.centralIncisorsWLRatio.toFixed(1)}%
  Ideal Range: 75-80% (Clinical Standard)
  Status: ${Math.abs(meas.centralIncisorsWLRatio - 78) <= 5 ? "✓ IDEAL" : "△ DEVIATION"}

• Dental Midline Deviation: ${meas.midlineDeviation.toFixed(2)}mm from facial midline
  Clinical threshold: <1.5mm ${meas.midlineDeviation < 1.5 ? "✓" : "⚠"}

═══ GOLDEN PROPORTION ANALYSIS ═══
(Peer-reviewed DSD protocol: Preston & Forster proportions)

• Lateral/Central Incisor Ratio: ${meas.goldenRatioLateral.toFixed(1)}%
  Ideal: 62% (Range: 54-66% clinically acceptable)
  Status: ${Math.abs(meas.goldenRatioLateral - 62) <= 8 ? "✓" : "△"}

• Canine/Lateral Incisor Ratio: ${meas.goldenRatioCanine.toFixed(1)}%
  Ideal: 62% (Range: 54-66% clinically acceptable)
  Status: ${Math.abs(meas.goldenRatioCanine - 62) <= 8 ? "✓" : "△"}

• RED (Recurring Esthetic Dental) Proportion: ${meas.redProportion.toFixed(1)}%
  Acceptable Range: 62-80% (Ward, 2001)
  Status: ${meas.redProportion >= 62 && meas.redProportion <= 80 ? "✓ WITHIN RANGE" : "⚠ OUTSIDE RANGE"}

═══ GINGIVAL ANALYSIS ═══
• Bilateral Symmetry Score: ${meas.gingivalSymmetry.toFixed(1)}/100
  Clinical threshold: >85% ${meas.gingivalSymmetry > 85 ? "✓" : "⚠"}

• Gingival Margin Deviations (mm):
  ${meas.gingivalMarginDev.map((d, i) => `  Tooth ${i + 1}: ${d.toFixed(2)}mm`).join("\n  ")}

═══ SMILE CHARACTERISTICS ═══
• Smile Arc Deviation Score: ${(100 - Math.min(meas.smileArcDeviation, 50)).toFixed(0)}/100
  (Should follow lower lip curve)
  
• Smile Fullness: ${meas.smileFullness.toFixed(1)}%
  Classification: ${meas.smileFullness > 80 ? "High/Gummy Smile" : meas.smileFullness < 50 ? "Low Smile" : "Normal Smile"}
  ${meas.smileFullness >= 50 && meas.smileFullness <= 80 ? "✓" : "⚠"}

• Buccal Corridors: ${meas.buccalCorridors.toFixed(2)}mm
  Ideal Range: 2-4mm (Tooth visibility optimization)
  Status: ${meas.buccalCorridors >= 2 && meas.buccalCorridors <= 4 ? "✓ IDEAL" : "△ ADJUSTMENT SUGGESTED"}

• Canine Position Deviation: ${meas.caninePositionDev.toFixed(2)}mm
  (Should be at smile corner)

═══ TOOTH INCLINATION ═══
(Ideal: ~0° from vertical for anterior teeth)
${meas.toothTilt.map((tilt, i) => `• Tooth ${i}: ${tilt.toFixed(1)}° from vertical ${tilt < 10 ? "✓" : "⚠"}`).join("\n")}

═══ CLINICAL RECOMMENDATIONS ═══
${analysis.clinicalRecommendations.map((rec, i) => `${i + 1}. ${rec}`).join("\n")}

═══ TREATMENT PLAN SUGGESTIONS ═══
${generateTreatmentPlan(analysis)}

═══ CLINICAL NOTES ═══
Esthetic reference values are taken from published smile-design literature:
• Snow's Golden Percentage (1999)
• Ward's RED Proportion (2001)
• Preston proportions
• Peer-reviewed literature on smile esthetics

This implementation has NOT been clinically validated against measured patients.
Every value is a visualisation aid, not a clinical finding.

═══ MEASUREMENT SCALE ═══
Reference basis: ${analysis.calibration.label}
Millimetres per pixel: ${analysis.calibration.mmPerPixel > 0 ? analysis.calibration.mmPerPixel.toFixed(4) : "n/a"}
Scale confidence: ${(analysis.calibration.confidence * 100).toFixed(0)}%
${analysis.calibration.note}

═══ PRIVACY ═══
All analysis runs locally in this browser. Images are never uploaded to or
stored on a server.

⚠ DISCLAIMER: Decision-support tool for education and communication. It does
not diagnose, does not replace clinical examination, and is not a medical
device. Every flagged parameter must be confirmed by a qualified clinician.

═══════════════════════════════════════════════════════════════
End of Report | Lumina Ultra™ v1.0
═══════════════════════════════════════════════════════════════
    `;

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(report));
    element.setAttribute("download", `lumina-dsd-report-${Date.now()}.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    toast({
      title: "Report Generated",
      description: "Clinical DSD analysis report downloaded.",
    });
  };

  const generateTreatmentPlan = (analysis: AnalysisResult): string => {
    const meas = analysis.measurements;
    const recommendations = [];

    if (Math.abs(meas.centralIncisorsWLRatio - 78) > 12) {
      recommendations.push("→ Cosmetic/Prosthodontic: Veneers, crowns, or composite restorations to achieve W/L ratio optimization");
    }
    if (meas.gingivalSymmetry < 80) {
      recommendations.push("→ Periodontics: Gingival contouring, osseous contouring, or gingivectomy for symmetry");
    }
    if (Math.abs(meas.midlineDeviation) > 1.5) {
      recommendations.push("→ Orthodontics: Anterior tooth repositioning for midline alignment");
    }
    if (meas.smileFullness < 60) {
      recommendations.push("→ Prosthodontics/Orthodontics: Vertical dimension adjustment; evaluate posterior support");
    }
    if (meas.smileFullness > 100) {
      recommendations.push("→ Periodontics/Oral Surgery: Gingival contouring or lip repositioning for excess display");
    }
    if (meas.buccalCorridors > 4.5) {
      recommendations.push("→ Implant/Orthodontic: Buccal corridor reduction via implants or orthodontic smile expansion");
    }
    if (Math.abs(meas.goldenRatioLateral - 62) > 10) {
      recommendations.push("→ Cosmetic Dentistry: Lateral incisor width adjustment via veneers or orthodontics");
    }

    return recommendations.length > 0
      ? recommendations.join("\n")
      : "→ Maintenance: Continue existing treatment plan. Periodic DSD monitoring recommended.";
  };

  const takeSnapshot = () => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!canvas || !overlayCanvas) return;

    // Create composite canvas with video frame + overlays
    const composite = document.createElement("canvas");
    composite.width = canvas.width;
    composite.height = canvas.height;
    const compositeCtx = composite.getContext("2d");
    if (!compositeCtx) return;

    // Draw video frame first
    compositeCtx.drawImage(canvas, 0, 0);
    // Draw overlays on top
    compositeCtx.drawImage(overlayCanvas, 0, 0);

    // Save to localStorage for smile simulator
    const imageData = composite.toDataURL("image/jpeg");
    const snapshots = JSON.parse(localStorage.getItem("capturedSnapshots") || "[]");
    const snapshot = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      image: imageData,
      analysis: analysis,
    };
    snapshots.push(snapshot);
    localStorage.setItem("capturedSnapshots", JSON.stringify(snapshots));

    // The archive, dashboard, comparison and prescription screens all read
    // "patientArchive", but nothing wrote to it, so they stayed empty forever.
    try {
      const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
      const enteredName = window.prompt(
        "Patient name for the archive (leave blank for an anonymous record):",
        "",
      );
      const patientName =
        enteredName && enteredName.trim() ? enteredName.trim() : `Unnamed patient ${archive.length + 1}`;

      archive.push({
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        patientName,
        harmony: analysis?.overallHarmony ?? 0,
        measurements: Object.fromEntries(
          Object.entries(analysis?.measurements ?? {}).filter(
            ([, value]) => typeof value === "number",
          ),
        ),
        notes: analysis?.classificationNotes || "DSD capture",
        clinicalNotes: analysis?.clinicalRecommendations?.join("\n") ?? "",
        visitHistory: [
          {
            date: new Date().toLocaleDateString(),
            harmony: analysis?.overallHarmony ?? 0,
            notes: "AR scanner capture",
          },
        ],
      });
      localStorage.setItem("patientArchive", JSON.stringify(archive));
    } catch (archiveError) {
      console.error("Could not add patient to archive:", archiveError);
    }

    // Also download
    const link = document.createElement("a");
    link.download = `lumina-dsd-${Date.now()}.png`;
    link.href = imageData;
    link.click();

    toast({
      title: "Snapshot Saved",
      description: "Saved to the patient archive and Smile Simulator, and downloaded.",
    });
  };

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void analyzePhoto(file);
          event.target.value = "";
        }}
      />

      {!isLoaded && !engineError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm px-6 text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-muted-foreground font-medium">Loading Clinical DSD Engine...</p>
          <p className="text-xs text-muted-foreground/70 mt-2 max-w-xs">
            The first load downloads the face-analysis model. This can take a few seconds on mobile data.
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-2 max-w-xs">
            Runs entirely on your device — no images are uploaded.
          </p>
        </div>
      )}

      {engineError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 px-6 text-center gap-3">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <p className="text-lg font-semibold text-white">AR engine unavailable</p>
          <p className="text-sm text-muted-foreground max-w-sm">{engineError}</p>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Button onClick={() => setEngineAttempt((attempt) => attempt + 1)}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            <Button variant="secondary" onClick={() => navigate("/")}>
              Back to home
            </Button>
          </div>
        </div>
      )}

      {isAnalyzingPhoto && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-6 text-center">
          <Loader2 className="w-9 h-9 text-primary animate-spin mb-3" />
          <p className="text-white font-medium">Analyzing your photo...</p>
        </div>
      )}

      <div className="relative flex-1 w-full h-full">
        {!photoMode && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {cameraStatus === "starting" && !photoMode && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center pointer-events-none">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-white/70">Starting camera…</p>
          </div>
        )}

        {/* Deliberately not gated on isLoaded/engineError: if the model CDN is
            blocked AND there is no camera, the user must still see why. */}
        {cameraStatus === "failed" && !photoMode && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 px-6 text-center gap-3">
            <Camera className="w-10 h-10 text-white/70" />
            <p className="text-lg font-semibold text-white">
              {cameraFailure?.title ?? "Camera not available"}
            </p>
            <p className="text-sm text-white/60 max-w-sm">
              {cameraFailure?.message ??
                "The camera could not be started. Analyze a photo instead — it uses the same analysis."}
            </p>
            {(cameraFailure?.code === "insecure-context" ||
              cameraFailure?.code === "unsupported" ||
              cameraFailure?.code === "no-device") && (
              <p className="text-xs text-white/40 max-w-sm">
                Photo analysis works fully without a camera.
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              <Button onClick={() => photoInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Analyze a photo
              </Button>
              {(cameraFailure?.recoverable ?? true) && (
                <Button variant="secondary" onClick={retryCamera}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Try camera again
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-20 flex justify-between items-start">
          <div>
            <h1 className="text-lg font-heading font-bold text-white">
              Lumina<span className="text-primary">Ultra</span>
            </h1>
            <p className="text-xs text-white/60">Clinical DSD Analysis</p>
          </div>
          <div className="flex gap-2">
            {photoMode ? (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-white/10 hover:bg-white/20 text-white"
                onClick={() => void useCameraMode()}
                title="Back to live camera"
              >
                <Camera className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-white/10 hover:bg-white/20 text-white"
                onClick={switchCamera}
                title="Switch camera"
              >
                <SwitchCamera className="w-5 h-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-white/10 hover:bg-white/20 text-white"
              onClick={() => navigate("/")}
            >
              <Home className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {analysis && (
          <div className="absolute top-24 right-4 z-20 animate-in fade-in slide-in-from-right-4">
            <div className="flex flex-col items-end gap-1">
              <Badge
                className={`px-4 py-2 text-lg font-bold shadow-lg ${
                  displayedHarmony >= 85
                    ? "bg-green-900/60 text-green-300"
                    : displayedHarmony >= 70
                      ? "bg-yellow-900/60 text-yellow-300"
                      : "bg-red-900/60 text-red-300"
                }`}
              >
                {displayedHarmony}/100
              </Badge>
              <p className="text-[10px] text-white/50">Harmony Score</p>
            </div>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="relative z-30 bg-card/90 backdrop-blur-xl border-t border-white/10 p-6 pb-8 space-y-4 rounded-t-3xl shadow-2xl max-h-[45%] overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Facial", state: showFacialGuides, setter: setShowFacialGuides },
            { label: "Dental", state: showDentalGuides, setter: setShowDentalGuides },
            { label: "Gingival", state: showGingival, setter: setShowGingival },
            { label: "Measures", state: showMeasurements, setter: setShowMeasurements },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
              <Label className="text-xs font-medium cursor-pointer">{item.label}</Label>
              <Switch checked={item.state} onCheckedChange={item.setter} />
            </div>
          ))}
        </div>

        {analysis && (
          <div className="bg-black/40 rounded-lg p-3 space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2 text-muted-foreground text-xs animate-in fade-in-50">
              <div className="flex flex-col">
                <span>W/L: {analysis.measurements.centralIncisorsWLRatio.toFixed(0)}%</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["W/L"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>GR-L: {analysis.measurements.goldenRatioLateral.toFixed(0)}%</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["GR-L"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>Sym: {analysis.measurements.gingivalSymmetry.toFixed(0)}%</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["Sym"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>Cant: {analysis.measurements.occlusalPlaneCant.toFixed(1)}°</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["Cant"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>VDO: {analysis.measurements.verticalDimensionRatio.toFixed(0)}%</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["VDO"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>Conv: {analysis.measurements.smileConvexityScore.toFixed(0)}</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["Conv"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>Rest: {analysis.measurements.toothVisibilityAtRest.toFixed(0)}%</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["RestTooth"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>Path: {analysis.measurements.smileAnimationPathway}</span>
                <span className="text-[8px] text-white/40">{analysis.measurementConfidence["Pathway"]}% conf</span>
              </div>
              <div className="flex flex-col">
                <span>Mouth: {analysis.measurements.intercommissuralWidth.toFixed(1)}mm</span>
                <span className="text-[8px] text-white/40">{analysis.calibration.mmPerPixel > 0 ? `${(analysis.calibration.confidence * 100).toFixed(0)}% scale` : "uncalibrated"}</span>
              </div>
            </div>
            {analysis.measurements.profileAnalysisNeeded && (
              <div className="mt-2 p-2 bg-blue-900/30 border border-blue-500/50 rounded text-[10px] text-blue-200">
                💡 Lateral Profile + Occlusal Photo Recommended for complete 3D & functional assessment
              </div>
            )}

            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="font-semibold text-white mb-1">Classification:</p>
              <p className="text-[10px] text-white/70">{analysis.classificationNotes}</p>
            </div>

            <div className="mt-2 border-t border-white/10 pt-2">
              <p className="font-semibold text-white mb-1">Key Findings:</p>
              <ul className="space-y-1 text-white/70">
                {analysis.clinicalRecommendations.slice(0, 3).map((rec, i) => (
                  <li key={i} className="text-[10px] leading-snug">{rec}</li>
                ))}
              </ul>
            </div>

            <div className="mt-2 border-t border-white/10 pt-2">
              <p className="font-semibold text-white mb-1">Measurement basis:</p>
              <p className="text-[10px] text-white/70">
                {analysis.calibration.mmPerPixel > 0
                  ? `${analysis.calibration.label} · ${(analysis.calibration.confidence * 100).toFixed(0)}% scale confidence`
                  : "No scale reference detected — millimetre values unavailable"}
              </p>
              <p className="text-[10px] text-amber-200/80 mt-1">
                Decision-support only, not a diagnosis. All analysis runs on your device; images are never uploaded.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={takeSnapshot}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
          >
            <Camera className="w-4 h-4 mr-2" />
            Snapshot
          </Button>
          <Button
            onClick={generateReport}
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-lg"
          >
            <Download className="w-4 h-4 mr-2" />
            Report
          </Button>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => photoInputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-2" />
          {photoMode ? "Analyze another photo" : "Analyze a photo (no camera needed)"}
        </Button>
      </div>
    </div>
  );
}
