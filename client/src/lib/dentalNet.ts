/**
 * Browser inference for lumina_dental_net.onnx.
 *
 * The network is executed with onnxruntime-web against self-hosted wasm, so the
 * deployed demo does not depend on a CDN or on a Python runtime.
 *
 * Contract (from export_onnx.py metadata):
 *   input  image float32 [1, 3, 128, 192]  RGB in 0..1  (graph normalises (x-0.5)*4 internally)
 *   output seg   float32 [1, 6, 128, 192]  softmax-able segmentation logits
 *   output ident float32 [1, 8, 128, 192]  tooth-identity logits
 *   output kp    float32 [1, 40, 32, 48]   per-landmark heatmaps, stride 4
 *
 * decodeKeypoints is a line-by-line port of decode_np in model.py, and the gate is
 * the logistic model exported by gate.py, so the browser agrees with the Python
 * reference instead of inventing its own decoding rules.
 */
import * as ort from "onnxruntime-web";
import gateRaw from "../../../shared/visibility_gate.json?raw";

export const NET_W = 192;
export const NET_H = 128;
export const NK = 40;
export const SEG_CLASSES = 6;
export const IDENT_CLASSES = 8;
export const KP_STRIDE = 4;
export const KP_H = NET_H / KP_STRIDE; // 32
export const KP_W = NET_W / KP_STRIDE; // 48

export const MODEL_URL = "/models/lumina_dental_net.onnx";
export const MODEL_URL_INT8 = "/models/lumina_dental_net.int8.onnx";

export const MODEL_CARD = {
  file: "lumina_dental_net.onnx",
  bytes: 1769000,
  int8Bytes: 473738,
  opset: 17,
  input: "image",
  inputShape: "[1, 3, 128, 192]",
  outputs: [
    { name: "seg", shape: "[1, 6, 128, 192]", meaning: "segmentation logits, 6 classes" },
    { name: "ident", shape: "[1, 8, 128, 192]", meaning: "tooth-identity logits, 8 classes" },
    { name: "kp", shape: "[1, 40, 32, 48]", meaning: "40 landmark heatmaps at stride 4" },
  ],
  training: "synthetic renders only — not validated on real photographs",
} as const;

/* ------------------------------------------------------------------ runtime */

let ortConfigured = false;

function configureOrt(): void {
  if (ortConfigured) return;
  // Self-hosted wasm: no CDN, works offline on venue wifi.
  ort.env.wasm.wasmPaths = "/ort/";
  // Single-threaded avoids the SharedArrayBuffer requirement, which would need
  // COOP/COEP headers the static host does not send.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.logLevel = "error";
  ortConfigured = true;
}

export interface LoadedNet {
  session: ort.InferenceSession;
  loadMs: number;
  inputName: string;
  outputNames: string[];
}

export async function loadDentalNet(url: string = MODEL_URL): Promise<LoadedNet> {
  configureOrt();
  const t0 = performance.now();
  const session = await ort.InferenceSession.create(url, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return {
    session,
    loadMs: performance.now() - t0,
    inputName: session.inputNames[0] ?? MODEL_CARD.input,
    outputNames: [...session.outputNames],
  };
}

/* -------------------------------------------------------------- preprocessing */

/** Draws any image source onto a 192x128 canvas and returns RGB CHW in 0..1. */
export function preprocess(source: CanvasImageSource): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = NET_W;
  canvas.height = NET_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(source, 0, 0, NET_W, NET_H);
  const { data } = ctx.getImageData(0, 0, NET_W, NET_H);
  const plane = NET_H * NET_W;
  const chw = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i += 1, p += 4) {
    chw[i] = data[p] / 255;
    chw[plane + i] = data[p + 1] / 255;
    chw[2 * plane + i] = data[p + 2] / 255;
  }
  return chw;
}

/* ---------------------------------------------------------------- inference */

export interface NetOutputs {
  seg: Float32Array;
  ident: Float32Array;
  kp: Float32Array;
  segDims: [number, number, number];
  identDims: [number, number, number];
  kpDims: [number, number, number];
  inferMs: number;
}

function pickTensor(
  out: Record<string, ort.Tensor>,
  name: string,
  matches: (dims: readonly number[]) => boolean,
): ort.Tensor {
  const direct = out[name];
  if (direct) return direct;
  for (const tensor of Object.values(out)) {
    if (matches(tensor.dims as readonly number[])) return tensor;
  }
  throw new Error(`model output "${name}" not found in [${Object.keys(out).join(", ")}]`);
}

function triple(tensor: ort.Tensor): [number, number, number] {
  const d = tensor.dims as readonly number[];
  return [Number(d[1] ?? 0), Number(d[2] ?? 0), Number(d[3] ?? 0)];
}

export async function runDentalNet(net: LoadedNet, chw: Float32Array): Promise<NetOutputs> {
  const tensor = new ort.Tensor("float32", chw, [1, 3, NET_H, NET_W]);
  const t0 = performance.now();
  const out = (await net.session.run({ [net.inputName]: tensor })) as unknown as Record<string, ort.Tensor>;
  const inferMs = performance.now() - t0;

  const segT = pickTensor(out, "seg", (d) => d.length === 4 && d[1] === SEG_CLASSES);
  const identT = pickTensor(out, "ident", (d) => d.length === 4 && d[1] === IDENT_CLASSES);
  const kpT = pickTensor(out, "kp", (d) => d.length === 4 && d[1] === NK);

  return {
    seg: segT.data as Float32Array,
    ident: identT.data as Float32Array,
    kp: kpT.data as Float32Array,
    segDims: triple(segT),
    identDims: triple(identT),
    kpDims: triple(kpT),
    inferMs,
  };
}

/* ------------------------------------------------------------------ decoding */

export interface DecodedKeypoint {
  channel: number;
  /** Input-pixel coordinates in the 192x128 network frame. */
  x: number;
  y: number;
  peak: number;
}

export interface DecodeOptions {
  stride?: number;
  minPeak?: number;
  hw?: number;
  multimodal?: number;
}

/**
 * Port of decode_np (model.py): per-channel argmax, border rejection, multimodal
 * rejection, then a thresholded weighted centroid for sub-pixel placement.
 */
export function decodeKeypoints(
  heat: Float32Array,
  channels: number,
  height: number,
  width: number,
  options: DecodeOptions = {},
): (DecodedKeypoint | null)[] {
  const stride = options.stride ?? KP_STRIDE;
  const minPeak = options.minPeak ?? 0.3;
  const hw = options.hw ?? 3;
  const multimodal = options.multimodal ?? 0.6;
  const plane = height * width;
  const result: (DecodedKeypoint | null)[] = [];

  for (let c = 0; c < channels; c += 1) {
    const base = c * plane;
    let best = -Infinity;
    let bestIndex = 0;
    for (let i = 0; i < plane; i += 1) {
      const v = heat[base + i];
      if (v > best) {
        best = v;
        bestIndex = i;
      }
    }
    const py = Math.floor(bestIndex / width);
    const px = bestIndex % width;

    // Refuse weak peaks and peaks that touch the border.
    if (best < minPeak || px < hw || py < hw || px >= width - hw || py >= height - hw) {
      result.push(null);
      continue;
    }

    // Refuse ambiguous peaks: a comparable maximum outside the window.
    const wy0 = Math.max(0, py - 2 * hw);
    const wy1 = Math.min(height, py + 2 * hw + 1);
    const wx0 = Math.max(0, px - 2 * hw);
    const wx1 = Math.min(width, px + 2 * hw + 1);
    let outsideMax = -Infinity;
    for (let y = 0; y < height; y += 1) {
      const rowInside = y >= wy0 && y < wy1;
      for (let x = 0; x < width; x += 1) {
        if (rowInside && x >= wx0 && x < wx1) continue;
        const v = heat[base + y * width + x];
        if (v > outsideMax) outsideMax = v;
      }
    }
    if (outsideMax >= multimodal * best) {
      result.push(null);
      continue;
    }

    // Weighted centroid in the (2*hw+1)^2 window.
    const cut = 0.2 * best;
    let sum = 0;
    let sx = 0;
    let sy = 0;
    for (let dy = -hw; dy <= hw; dy += 1) {
      for (let dx = -hw; dx <= hw; dx += 1) {
        const v = heat[base + (py + dy) * width + (px + dx)] - cut;
        if (v > 0) {
          sum += v;
          sx += v * dx;
          sy += v * dy;
        }
      }
    }
    const cx = sum > 0 ? px + sx / sum : px;
    const cy = sum > 0 ? py + sy / sum : py;
    result.push({
      channel: c,
      x: (cx + 0.5) * stride - 0.5,
      y: (cy + 0.5) * stride - 0.5,
      peak: best,
    });
  }
  return result;
}

/* ---------------------------------------------------------------- visibility */

export interface GateGroup {
  mean: number[];
  std: number[];
  w: number[];
  threshold: number;
  n_features: number;
}

export interface GateModel {
  version: number;
  offsets: [number, number][];
  features: string;
  note?: string;
  groups: Record<string, GateGroup>;
}

let gateCache: GateModel | null = null;

export function gateModel(): GateModel {
  if (!gateCache) gateCache = JSON.parse(gateRaw) as GateModel;
  return gateCache;
}

/** Port of GROUP in gate.py. */
export function groupOf(channel: number): string {
  if (channel < 32 && channel % 4 === 0) return "incisal_mid";
  if (channel < 32 && channel % 4 === 1) return "zenith";
  if (channel < 32) return "corner";
  if (channel < 39) return "papilla";
  return "dental_midline";
}

/** Channel-wise softmax over the seg logits: [C,H,W] -> probabilities. */
export function softmaxPlanes(
  logits: Float32Array,
  channels: number,
  height: number,
  width: number,
): Float32Array {
  const plane = height * width;
  const probs = new Float32Array(channels * plane);
  for (let i = 0; i < plane; i += 1) {
    let max = -Infinity;
    for (let c = 0; c < channels; c += 1) {
      const v = logits[c * plane + i];
      if (v > max) max = v;
    }
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      const e = Math.exp(logits[c * plane + i] - max);
      probs[c * plane + i] = e;
      sum += e;
    }
    if (sum > 0) {
      for (let c = 0; c < channels; c += 1) probs[c * plane + i] /= sum;
    }
  }
  return probs;
}

/** Port of features() in gate.py: peak + offsets x class probs (3x3 mean). */
export function gateFeatures(
  probs: Float32Array,
  channels: number,
  height: number,
  width: number,
  x: number,
  y: number,
  peak: number,
  offsets: [number, number][],
): Float64Array {
  const plane = height * width;
  const out = new Float64Array(1 + offsets.length * channels);
  out[0] = peak;
  let cursor = 1;
  for (const [dx, dy] of offsets) {
    const xi = Math.round(x + dx);
    const yi = Math.round(y + dy);
    const x0 = Math.max(xi - 1, 0);
    const x1 = Math.min(xi + 2, width);
    const y0 = Math.max(yi - 1, 0);
    const y1 = Math.min(yi + 2, height);
    if (x1 <= x0 || y1 <= y0) {
      cursor += channels;
      continue;
    }
    const count = (x1 - x0) * (y1 - y0);
    for (let c = 0; c < channels; c += 1) {
      let sum = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) sum += probs[c * plane + yy * width + xx];
      }
      out[cursor + c] = sum / count;
    }
    cursor += channels;
  }
  return out;
}

/** Port of the per-group logistic score in gate.py. */
export function gateScore(features: Float64Array, group: GateGroup): number {
  const n = group.w.length;
  let z = group.w[n - 1] ?? 0; // bias
  for (let i = 0; i < n - 1 && i < features.length; i += 1) {
    const std = group.std[i] || 1e-6;
    z += ((features[i] - group.mean[i]) / std) * group.w[i];
  }
  return 1 / (1 + Math.exp(-z));
}

export interface Landmark extends DecodedKeypoint {
  group: string;
  gateP: number | null;
  accepted: boolean;
}

export interface DecodedResult {
  landmarks: Landmark[];
  decoded: number;
  accepted: number;
  refused: number;
  total: number;
}

export function decodeAndGate(outputs: NetOutputs, gate: GateModel = gateModel()): DecodedResult {
  const [kc, kh, kw] = outputs.kpDims;
  const [sc, sh, sw] = outputs.segDims;
  const decoded = decodeKeypoints(outputs.kp, kc, kh, kw);
  const probs = softmaxPlanes(outputs.seg, sc, sh, sw);

  const landmarks: Landmark[] = [];
  let accepted = 0;
  for (const kp of decoded) {
    if (!kp) continue;
    const group = groupOf(kp.channel);
    const params = gate.groups[group];
    let gateP: number | null = null;
    let ok = true;
    if (params) {
      const features = gateFeatures(probs, sc, sh, sw, kp.x, kp.y, kp.peak, gate.offsets);
      gateP = gateScore(features, params);
      ok = gateP >= params.threshold;
    }
    if (ok) accepted += 1;
    landmarks.push({ ...kp, group, gateP, accepted: ok });
  }

  return {
    landmarks,
    decoded: landmarks.length,
    accepted,
    refused: kc - landmarks.length,
    total: kc,
  };
}

/* -------------------------------------------------------------- visualisation */

/** argmax class per pixel, for drawing the segmentation mask. */
export function segArgmax(logits: Float32Array, channels: number, height: number, width: number): Uint8Array {
  const plane = height * width;
  const out = new Uint8Array(plane);
  for (let i = 0; i < plane; i += 1) {
    let best = -Infinity;
    let bestC = 0;
    for (let c = 0; c < channels; c += 1) {
      const v = logits[c * plane + i];
      if (v > best) {
        best = v;
        bestC = c;
      }
    }
    out[i] = bestC;
  }
  return out;
}

export const SEG_PALETTE: [number, number, number][] = [
  [0, 0, 0],
  [34, 211, 238],
  [16, 185, 129],
  [251, 191, 36],
  [244, 114, 182],
  [167, 139, 250],
];
