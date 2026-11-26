/**
 * Automatic per-tooth instance masks with MobileSAM, used zero-shot.
 *
 * No weights were trained or changed on patient photos. Models: Apache-2.0 MobileSAM, ONNX export
 * from huggingface.co/Acly/MobileSAM (see public/models/MOBILESAM_LICENSE.txt).
 *
 * Steps: encode the photo (or the mouth crop) once, prompt the decoder with a coarse grid of points,
 * drop duplicate masks, keep the masks that look like upper front teeth (size, shape, brightness,
 * not red, same row), and return one label per tooth. If fewer than 3 teeth survive the gates the
 * result is null and the caller must say so instead of guessing.
 *
 * Measured (private test): see docs/ and the project report. Not a clinical accuracy claim.
 */
import * as ort from "onnxruntime-web/wasm";
import { configureOrt } from "./dentalNet";

const ENC_URL = "/models/mobilesam_encoder.onnx";
const DEC_URL = "/models/mobilesam_decoder.onnx";

let sessions: Promise<{ enc: ort.InferenceSession; dec: ort.InferenceSession }> | null = null;
function load() {
  if (!sessions) {
    configureOrt();
    sessions = (async () => {
      const opt = { executionProviders: ["wasm"], graphOptimizationLevel: "all" } as ort.InferenceSession.SessionOptions;
      const [enc, dec] = await Promise.all([ort.InferenceSession.create(ENC_URL, opt), ort.InferenceSession.create(DEC_URL, opt)]);
      return { enc, dec };
    })().catch((e) => {
      sessions = null;
      throw e;
    });
  }
  return sessions;
}

export interface SamBox { x: number; y: number; w: number; h: number }
export interface SamTeeth {
  /** canvas sized, 0 = no tooth, 1..count = tooth id (left to right) */
  labels: Int32Array;
  w: number;
  h: number;
  count: number;
  /** x extents of each tooth in canvas pixels, left to right */
  boxes: { x0: number; x1: number; y0: number; y1: number }[];
  /** merged left/right tooth borders, canvas px, sorted */
  borders: number[];
  ms: number;
}

interface Cand { m: Uint8Array; iou: number; area: number; x0: number; x1: number; y0: number; y1: number; cy: number; lum: number; red: number }

function pct(a: Float32Array, p: number): number {
  const s = Float32Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export async function samTeeth(
  canvas: HTMLCanvasElement,
  roi?: SamBox | null,
  onProgress?: (f: number) => void,
): Promise<SamTeeth | null> {
  const t0 = performance.now();
  const { enc, dec } = await load();
  const rx = Math.max(0, Math.round(roi?.x ?? 0));
  const ry = Math.max(0, Math.round(roi?.y ?? 0));
  const rw = Math.min(canvas.width - rx, Math.round(roi?.w ?? canvas.width));
  const rh = Math.min(canvas.height - ry, Math.round(roi?.h ?? canvas.height));
  if (rw < 64 || rh < 32) return null;
  const sc = 1024 / Math.max(rw, rh);
  const sw = Math.round(rw * sc);
  const sh = Math.round(rh * sc);
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(canvas, rx, ry, rw, rh, 0, 0, sw, sh);
  const px = cx.getImageData(0, 0, sw, sh).data;
  const img = new Float32Array(sw * sh * 3);
  for (let i = 0; i < sw * sh; i++) {
    img[i * 3] = px[i * 4]; img[i * 3 + 1] = px[i * 4 + 1]; img[i * 3 + 2] = px[i * 4 + 2];
  }
  // masks are produced at half size: 4x less work in the decoder, the gates and the dedupe
  const Q = 0.5;
  const ow = Math.round(sw * Q), oh = Math.round(sh * Q);
  const n = ow * oh;
  const hc = document.createElement("canvas");
  hc.width = ow; hc.height = oh;
  const hx = hc.getContext("2d", { willReadFrequently: true })!;
  hx.drawImage(c, 0, 0, ow, oh);
  const hp = hx.getImageData(0, 0, ow, oh).data;
  const lum = new Float32Array(n);
  const red = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = hp[i * 4], g = hp[i * 4 + 1], b = hp[i * 4 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    red[i] = (r - g) / (lum[i] + 1);
  }
  const tEnc0 = performance.now();
  const emb = (await enc.run({ input_image: new ort.Tensor("float32", img, [sh, sw, 3]) })).image_embeddings;

  console.info(`[sam] encoder ${Math.round(performance.now() - tEnc0)} ms, load+prep ${Math.round(tEnc0 - t0)} ms`);
  const lt0 = pct(lum, 50) * 0.95;
  const rt0 = pct(red, 70);
  const G = 14;
  const rows = Math.max(4, Math.round((G * oh) / ow));
  const total = G * rows;
  const cands: Cand[] = [];
  let done = 0;
  for (let iy = 0; iy < rows; iy++) {
    const fy = 0.08 + (0.84 * iy) / (rows - 1);
    for (let ix = 0; ix < G; ix++) {
      const fx = 0.04 + (0.92 * ix) / (G - 1);
      // skip points that are not tooth-coloured, or already inside a good tooth-sized mask
      const pi = Math.min(oh - 1, Math.floor(fy * oh)) * ow + Math.min(ow - 1, Math.floor(fx * ow));
      if (lum[pi] < lt0 || red[pi] > rt0 || cands.some((k) => k.m[pi] && k.area > 0.004 * n && k.area < 0.2 * n)) {
        done++;
        continue;
      }
      const out = await dec.run({
        image_embeddings: emb,
        point_coords: new ort.Tensor("float32", Float32Array.from([fx * sw, fy * sh]), [1, 1, 2]),
        point_labels: new ort.Tensor("float32", Float32Array.from([1]), [1, 1]),
        mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor("float32", Float32Array.from([0]), [1]),
        orig_im_size: new ort.Tensor("float32", Float32Array.from([oh, ow]), [2]),
      });
      const iou = (out.iou_predictions.data as Float32Array)[0];
      done++;
      if (done % 8 === 0) {
        onProgress?.(done / total);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (iou < 0.8) continue;
      const md = out.masks.data as Float32Array;
      const m = new Uint8Array(n);
      let area = 0, x0 = ow, x1 = 0, y0 = oh, y1 = 0, sy = 0, sl = 0, sr = 0;
      for (let y = 0; y < oh; y++)
        for (let x = 0; x < ow; x++) {
          const i = y * ow + x;
          if (md[i] > 0) {
            m[i] = 1;
            area++;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
            sy += y;
            sl += lum[i];
            sr += red[i];
          }
        }
      if (area < 75) continue;
      cands.push({ m, iou, area, x0, x1, y0, y1, cy: sy / area, lum: sl / area, red: sr / area });
    }
  }

  console.info(`[sam] decode done at ${Math.round(performance.now() - t0)} ms, ${cands.length} candidates`);
  // drop duplicates
  cands.sort((a, b) => b.iou - a.iou);
  const keep: Cand[] = [];
  for (const c1 of cands) {
    let dup = false;
    for (const k of keep) {
      if (c1.x1 < k.x0 || c1.x0 > k.x1 || c1.y1 < k.y0 || c1.y0 > k.y1) continue;
      let inter = 0;
      for (let i = 0; i < n; i++) if (c1.m[i] && k.m[i]) inter++;
      if (inter / (c1.area + k.area - inter) >= 0.8) { dup = true; break; }
    }
    if (!dup) keep.push(c1);
  }

  // tooth gates
  const lt = pct(lum, 50) * 0.95;
  const rt = pct(red, 70);
  const pool = keep.filter((k) => {
    const bw = k.x1 - k.x0 + 1, bh = k.y1 - k.y0 + 1;
    return k.area > 0.004 * n && k.area < 0.2 * n && k.area / (bw * bh) > 0.55 && k.lum > lt && k.red < rt && bh / bw > 0.6 && bh / bw < 3.5;
  });
  if (!pool.length) return null;
  const big = pool.reduce((a, b) => (b.area > a.area ? b : a));
  const bigH = big.y1 - big.y0 + 1;
  const teeth = pool.filter((k) => Math.abs(k.cy - big.cy) < 0.55 * bigH).sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1));
  if (teeth.length < 3) return null;

  // labels in canvas coordinates; smaller masks win overlaps
  const labels = new Int32Array(canvas.width * canvas.height);
  const order = teeth.map((t, i) => ({ t, id: i + 1 })).sort((a, b) => b.t.area - a.t.area);
  for (let y = 0; y < rh; y++) {
    const sy2 = Math.min(oh - 1, Math.floor(y * sc * Q));
    for (let x = 0; x < rw; x++) {
      const si = sy2 * ow + Math.min(ow - 1, Math.floor(x * sc * Q));
      for (const o of order) if (o.t.m[si]) labels[(y + ry) * canvas.width + (x + rx)] = o.id;
    }
  }
  const boxes = teeth.map((t) => ({ x0: rx + t.x0 / (sc * Q), x1: rx + t.x1 / (sc * Q), y0: ry + t.y0 / (sc * Q), y1: ry + t.y1 / (sc * Q) }));
  const ext = boxes.flatMap((b) => [b.x0, b.x1]).sort((a, b) => a - b);
  const tol = 14 * (rw / 1280);
  const groups: number[][] = [];
  for (const x of ext) {
    if (groups.length && x - groups[groups.length - 1][groups[groups.length - 1].length - 1] <= tol) groups[groups.length - 1].push(x);
    else groups.push([x]);
  }
  const borders = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  return { labels, w: canvas.width, h: canvas.height, count: teeth.length, boxes, borders, ms: performance.now() - t0 };
}
