/**
 * Optional monocular-depth model loader.
 *
 * The system has two independent depth signals:
 *
 *  1. `poseDepth.ts` — the face-mesh `z` channel. Always available, ~0 bytes,
 *     good enough for head pose and foreshortening.
 *  2. This module — MiDaS v2.1 (small) monocular depth, exported to ONNX and
 *     dynamically quantised to int8, shipped at 17.3 MB. Gives relative inverse
 *     depth (structure, not millimetres) at the cost of a second network pass
 *     on sampled frames only.
 *
 * On a 1 vCPU / 1 GB deployment the second one is a real risk to camera
 * stability, so it is never required and never loaded on first paint. The
 * shipped weights are input 1x3x256x256 NCHW -> output 1x256x256 inverse depth.
 * They are fetched lazily, only once the camera is already running, so a slow
 * download cannot delay or break the preview. If the file is absent the system
 * reports `available: false` and keeps working on the face-mesh signal alone.
 *
 * Nothing here fabricates a depth value. An absent model yields no estimate,
 * which is why `estimate` returns null rather than a default.
 */
import * as ort from "onnxruntime-web/wasm";

export const DEPTH_MODEL_URL = "/models/lumina_depth.onnx";

export interface DepthProbe {
  available: boolean;
  url: string;
  /** Why the model is unavailable; absent when it loaded. */
  reason?: string;
}

export interface DepthModel {
  probe: DepthProbe;
  /** Relative depth scale for the frame, or null when it cannot be computed. */
  estimate: (session: ort.InferenceSession, input: Float32Array) => Promise<number | null>;
  session: ort.InferenceSession;
}

/**
 * Check whether depth weights exist without downloading them. A HEAD request
 * keeps the page light on venue wifi; a missing file is a normal, expected
 * result, not an error.
 */
export async function probeDepthModel(url: string = DEPTH_MODEL_URL): Promise<DepthProbe> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      return { available: false, url, reason: `no depth weights at ${url} (HTTP ${response.status})` };
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 0 && length < 1024) {
      return { available: false, url, reason: `depth weights at ${url} look truncated (${length} bytes)` };
    }
    return { available: true, url };
  } catch {
    return { available: false, url, reason: `depth weights at ${url} could not be probed` };
  }
}

/**
 * Mean of the predicted depth map, used as a relative scale. Returns null when
 * the output is empty or non-finite so callers never apply a phantom value.
 */
async function estimateMeanDepth(
  session: ort.InferenceSession,
  input: Float32Array,
): Promise<number | null> {
  const feeds: Record<string, ort.Tensor> = {};
  const name = session.inputNames[0];
  if (!name) return null;
  feeds[name] = new ort.Tensor("float32", input, [1, 3, 256, 256]);

  const output = await session.run(feeds);
  const key = session.outputNames[0];
  const tensor = key ? output[key] : Object.values(output)[0];
  if (!tensor) return null;

  const data = tensor.data as Float32Array;
  if (!data || data.length === 0) return null;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = data[i];
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * Load the depth model if its weights exist. Returns null (never throws) when
 * they do not, so the camera pipeline cannot be broken by a missing file.
 */
export async function loadDepthModel(url: string = DEPTH_MODEL_URL): Promise<DepthModel | null> {
  const probe = await probeDepthModel(url);
  if (!probe.available) return null;

  try {
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(url, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    return { probe, session, estimate: estimateMeanDepth };
  } catch (error) {
    return null;
  }
}

export const DEPTH_INPUT_SIZE = 256;

/** ImageNet statistics — the normalisation MiDaS v2.1 was trained with. */
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/**
 * Convert an RGBA frame into the NCHW float tensor the model expects.
 *
 * Nearest-neighbour resampling to 256x256 is deliberate: bilinear filtering
 * would smooth the tooth edges the measurement pass depends on, and the depth
 * signal only needs coarse structure. Channels are RGB (not BGR) and normalised
 * with ImageNet statistics, matching the MiDaS training preprocessing.
 */
export function preprocessFrame(frame: ImageData): Float32Array {
  const size = DEPTH_INPUT_SIZE;
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  const { data, width, height } = frame;
  if (width < 1 || height < 1) return out;

  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y * height) / size));
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x * width) / size));
      const src = (sy * width + sx) * 4;
      const dst = y * size + x;
      out[dst] = (data[src] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      out[plane + dst] = (data[src + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      out[2 * plane + dst] = (data[src + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    }
  }
  return out;
}

/** Run one frame through the session and return the raw depth plane. */
async function runFrame(
  session: ort.InferenceSession,
  input: Float32Array,
): Promise<Float32Array | null> {
  const name = session.inputNames[0];
  if (!name) return null;
  const feeds: Record<string, ort.Tensor> = {};
  feeds[name] = new ort.Tensor("float32", input, [1, 3, DEPTH_INPUT_SIZE, DEPTH_INPUT_SIZE]);

  const output = await session.run(feeds);
  const key = session.outputNames[0];
  const tensor = key ? output[key] : Object.values(output)[0];
  if (!tensor) return null;
  const data = tensor.data as Float32Array;
  return data && data.length > 0 ? data : null;
}

/**
 * A loaded depth model that can be sampled repeatedly.
 *
 * `meanDepth` is the scalar the fusion layer consumes; `depthMap` returns the
 * full plane normalised to 0..1 for callers that want structure. Both return
 * null rather than a fabricated number when the frame cannot be processed.
 */
export interface DepthEstimator {
  probe: DepthProbe;
  meanDepth: (frame: ImageData) => Promise<number | null>;
  depthMap: (frame: ImageData) => Promise<Float32Array | null>;
  close: () => Promise<void>;
}

/**
 * Load the shipped weights and return a reusable estimator, or null when the
 * weights are absent or unreadable. Never throws, so the camera pipeline can
 * call this optimistically without a failure path of its own.
 */
export async function loadDepthEstimator(
  url: string = DEPTH_MODEL_URL,
): Promise<DepthEstimator | null> {
  const probe = await probeDepthModel(url);
  if (!probe.available) return null;

  try {
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(url, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });

    const depthMap = async (frame: ImageData): Promise<Float32Array | null> => {
      try {
        const raw = await runFrame(session, preprocessFrame(frame));
        if (!raw) return null;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < raw.length; i += 1) {
          const v = raw[i];
          if (Number.isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-6) return null;
        const span = max - min;
        const normalised = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) {
          const v = raw[i];
          normalised[i] = Number.isFinite(v) ? (v - min) / span : 0;
        }
        return normalised;
      } catch {
        return null;
      }
    };

    const meanDepth = async (frame: ImageData): Promise<number | null> => {
      const map = await depthMap(frame);
      if (!map) return null;
      let sum = 0;
      for (let i = 0; i < map.length; i += 1) sum += map[i];
      return sum / map.length;
    };

    const close = async (): Promise<void> => {
      try {
        await session.release();
      } catch {
        /* already released */
      }
    };

    return { probe, meanDepth, depthMap, close };
  } catch {
    return null;
  }
}

export const DEPTH_DISCLAIMER =
  "Depth uses MiDaS v2.1 small (int8 ONNX, 17.3 MB) for relative inverse depth. That is relative structure only — millimetre scale still comes from iris calibration — and the system always states which depth source produced a result.";
