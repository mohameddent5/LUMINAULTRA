/**
 * Optional monocular-depth model loader.
 *
 * The system has two independent depth signals:
 *
 *  1. `poseDepth.ts` — the face-mesh `z` channel. Always available, ~0 bytes,
 *     good enough for head pose and foreshortening.
 *  2. This module — an optional YOLO-style depth ONNX (e.g. an exported
 *     ultralytics depth head). Better absolute depth, but 25–50 MB and a second
 *     network per frame.
 *
 * On a 1 vCPU / 1 GB deployment the second one is a real risk to camera
 * stability, so it is never bundled and never required. It is probed at runtime:
 * if the weights are present it is used, if they are absent the system reports
 * `available: false` and keeps working on the face-mesh signal alone.
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

export const DEPTH_DISCLAIMER =
  "Optional depth weights are not bundled. When absent the system uses the face-mesh depth channel and states which source produced the result.";
