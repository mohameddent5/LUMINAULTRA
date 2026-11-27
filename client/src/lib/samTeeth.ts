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
  /** set by samTeethRobust when the result was found on a rescaled canvas: coordinates are in that scaled frame (canvas size times scale) */
  scale?: number;
  /** canvas sized, 0 = no tooth, 1..count = tooth id (left to right) */
  labels: Int32Array;
  w: number;
  h: number;
  count: number;
  /** x extents of each tooth in canvas pixels, left to right */
  boxes: { x0: number; x1: number; y0: number; y1: number }[];
  /** merged left/right tooth borders, canvas px, sorted */
  borders: number[];
  /** lower-arch tooth boxes (below the upper row), canvas px; analysis only, not drawn */
  lowerBoxes: { x0: number; x1: number; y0: number; y1: number }[];
  ms: number;
}

interface Cand { m: Uint8Array; iou: number; area: number; x0: number; x1: number; y0: number; y1: number; cy: number; lum: number; red: number }

function pct(a: Float32Array, p: number): number {
  const s = Float32Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/** Share of near-white pixels above which the crop is darkened, and by how much. NEITHER-sourced: set by hand from one synthetic overexposure test. */
const SAT_LIMIT = 0.12;
const SAT_SCALE = 0.65;

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
  const idat = cx.getImageData(0, 0, sw, sh);
  const px = idat.data;
  {
    // exposure guard: if a lot of the crop is clipped white, tooth edges vanish into the gaps. Scale it down before the model sees it.
    let sat = 0;
    for (let i = 0; i < sw * sh; i++) if (px[i * 4] >= 245 && px[i * 4 + 1] >= 245 && px[i * 4 + 2] >= 245) sat++;
    const frac = sat / (sw * sh);
    if (frac > SAT_LIMIT) {
      for (let i = 0; i < sw * sh; i++) { px[i * 4] *= SAT_SCALE; px[i * 4 + 1] *= SAT_SCALE; px[i * 4 + 2] *= SAT_SCALE; }
      cx.putImageData(idat, 0, 0);
      console.log("[sam] exposure guard, clipped share", frac.toFixed(3));
    }
  }
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
  const decodeAt = async (fx: number, fy: number, minIou: number, neg: { x: number; y: number }[] = []): Promise<Cand | null> => {
    const out = await dec.run({
      image_embeddings: emb,
      point_coords: new ort.Tensor("float32", Float32Array.from([fx * sw, fy * sh, ...neg.flatMap((q) => [q.x * sw, q.y * sh])]), [1, 1 + neg.length, 2]),
      point_labels: new ort.Tensor("float32", Float32Array.from([1, ...neg.map(() => 0)]), [1, 1 + neg.length]),
      mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
      has_mask_input: new ort.Tensor("float32", Float32Array.from([0]), [1]),
      orig_im_size: new ort.Tensor("float32", Float32Array.from([oh, ow]), [2]),
    });
    const iou = (out.iou_predictions.data as Float32Array)[0];
    if (iou < minIou) return null;
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
    if (area < 75) return null;
    return { m, iou, area, x0, x1, y0, y1, cy: sy / area, lum: sl / area, red: sr / area };
  };
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
      done++;
      if (done % 8 === 0) {
        onProgress?.(done / total);
        await new Promise((r) => setTimeout(r, 0));
      }
      const c0 = await decodeAt(fx, fy, 0.8);
      if (c0) cands.push(c0);
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
  const okShape = (k: Cand) => {
    const bw = k.x1 - k.x0 + 1, bh = k.y1 - k.y0 + 1;
    return k.area > 0.004 * n && k.area < 0.2 * n && k.area / (bw * bh) > 0.55 && bh / bw > 0.6 && bh / bw < 3.5;
  };
  const pool = keep.filter((k) => okShape(k) && k.lum > lt && k.red < rt);
  if (!pool.length) return null;
  const big = pool.reduce((a, b) => (b.area > a.area ? b : a));
  const bigH = big.y1 - big.y0 + 1;
  let teeth = pool.filter((k) => Math.abs(k.cy - big.cy) < 0.55 * bigH).sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1));
  // a deep bite or crowding puts lower incisors in the same height band as upper side teeth: teeth that start well below the top of the largest tooth belong to the lower arch
  const rowLow: Cand[] = [];
  {
    const top = big.y0 + 0.45 * bigH;
    const up = teeth.filter((t) => t.y0 <= top);
    if (up.length >= 3 && up.length < teeth.length) {
      for (const t of teeth) if (t.y0 > top) rowLow.push(t);
      teeth = up;
    }
  }
  if (teeth.length < 1) return null;
  // a failed wide mask often holds one real tooth plus gum or a neighbour: keep only its bright, non-claimed pixels and take the biggest solid blob
  const refineResidual = (k0: Cand, taken: Cand[]): Cand | null => {
    const thr = 0.88 * k0.lum;
    let r = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (k0.m[i] && lum[i] >= thr && !taken.some((t) => t.m[i])) r[i] = 1;
    const erode = (a: Uint8Array) => { const o2 = new Uint8Array(n); for (let y = 1; y < oh - 1; y++) for (let x = 1; x < ow - 1; x++) { const i = y * ow + x; if (a[i] && a[i - 1] && a[i + 1] && a[i - ow] && a[i + ow]) o2[i] = 1; } return o2; };
    const dil = (a: Uint8Array) => { const o2 = new Uint8Array(n); for (let y = 1; y < oh - 1; y++) for (let x = 1; x < ow - 1; x++) { const i = y * ow + x; if (a[i] || a[i - 1] || a[i + 1] || a[i - ow] || a[i + ow]) o2[i] = 1; } return o2; };
    for (let it = 0; it < 3; it++) r = erode(r);
    for (let it = 0; it < 3; it++) r = dil(r);
    // biggest connected blob
    const lab = new Int32Array(n);
    let best = 0, bestId = 0, id = 0;
    for (let i0 = 0; i0 < n; i0++) {
      if (!r[i0] || lab[i0]) continue;
      id++;
      let cnt = 0;
      const st = [i0];
      lab[i0] = id;
      while (st.length) {
        const i = st.pop()!;
        cnt++;
        const x = i % ow;
        for (const j of [i - 1, i + 1, i - ow, i + ow]) {
          if (j < 0 || j >= n || !r[j] || lab[j]) continue;
          if ((j === i - 1 && x === 0) || (j === i + 1 && x === ow - 1)) continue;
          lab[j] = id;
          st.push(j);
        }
      }
      if (cnt > best) { best = cnt; bestId = id; }
    }
    if (best < 75) return null;
    const m2 = new Uint8Array(n);
    let area = 0, x0 = ow, x1 = 0, y0 = oh, y1 = 0, sy = 0, sl = 0, sr = 0;
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) { const i = y * ow + x; if (lab[i] === bestId) { m2[i] = 1; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; sy += y; sl += lum[i]; sr += red[i]; } }
    return { m: m2, iou: k0.iou, area, x0, x1, y0, y1, cy: sy / area, lum: sl / area, red: sr / area };
  };
  // two neighbouring teeth are often returned as one merged mask: ask again for the gap between accepted teeth, telling the model which teeth are NOT wanted
  {
    const rowY0 = teeth.reduce((a, t) => a + t.cy, 0) / teeth.length;
    for (let round = 0; round < 3; round++) {
      let added = false;
      for (let ix = 0; ix < G; ix++) {
        const fx = 0.04 + (0.92 * ix) / (G - 1);
        const pxx = fx * ow;
        if (teeth.some((t) => pxx >= t.x0 && pxx <= t.x1)) continue;
        const pi = Math.min(oh - 1, Math.floor((rowY0 / oh) * oh)) * ow + Math.min(ow - 1, Math.floor(pxx));
        if (lum[pi] < lt * 0.9 || red[pi] > rt) continue;
        const negs = [...teeth].sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - pxx) - Math.abs((b.x0 + b.x1) / 2 - pxx)).slice(0, 3).map((t) => ({ x: (t.x0 + t.x1) / 2 / ow, y: t.cy / oh }));
        const k0 = await decodeAt(fx, rowY0 / oh, 0.7, negs);
        let k = k0;
        if (k0 && !okShape(k0)) k = refineResidual(k0, teeth);
        if (!k || !okShape(k) || !(k.lum > lt && k.red < rt)) continue;
        if (Math.abs(k.cy - big.cy) >= 0.55 * bigH) continue;
        const kw = k.x1 - k.x0 + 1;
        const wMed = teeth.map((t) => t.x1 - t.x0 + 1).sort((a, b) => a - b)[Math.floor(teeth.length / 2)];
        if (kw < 0.4 * wMed || kw > 1.6 * wMed) continue;
        const ov = (t: Cand) => Math.max(0, Math.min(t.x1, k.x1) - Math.max(t.x0, k.x0)) / Math.min(t.x1 - t.x0 + 1, kw);
        if (teeth.some((t) => ov(t) > 0.25)) continue;
        teeth = [...teeth, k].sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1));
        added = true;
      }
      if (!added) break;
    }
  }
  // outer teeth are narrow and shadowed, so the coarse grid often misses them: probe outward along the row
  {
    const overl = (a: Cand, k: Cand) => Math.max(0, Math.min(a.x1, k.x1) - Math.max(a.x0, k.x0)) / Math.max(1, Math.min(a.x1 - a.x0 + 1, k.x1 - k.x0 + 1));
    const wAvg = teeth.reduce((a, t) => a + (t.x1 - t.x0 + 1), 0) / teeth.length;
    const rowY = teeth.reduce((a, t) => a + t.cy, 0) / teeth.length;
    for (const dir of [-1, 1]) {
      for (let step = 0; step < 4; step++) {
        const edge = dir < 0 ? teeth[0] : teeth[teeth.length - 1];
        let added: Cand | null = null;
        // outer teeth sit lower than the row mean when the arch curves, so a probe on the row can land on gum (and return the whole frame): also try lower
        const eh = edge.y1 - edge.y0 + 1;
        for (const [off, yo] of [[0.3, 0], [0.5, 0], [0.7, 0], [0.3, 0.35], [0.5, 0.35], [0.7, 0.35], [0.5, 0.7]] as const) {
          const px = dir < 0 ? edge.x0 - off * wAvg : edge.x1 + off * wAvg;
          const py = rowY + yo * eh;
          if (px < 2 || px > ow - 2 || py > oh - 2) continue;
          const k = await decodeAt(px / ow, py / oh, 0.6);
          if (!k) continue;
          const kw = k.x1 - k.x0 + 1, kh = k.y1 - k.y0 + 1;
          const solid = k.area / (kw * kh);
          const gap = dir < 0 ? edge.x0 - k.x1 : k.x0 - edge.x1;
          const ok = k.area > 0.001 * n && k.area < 0.05 * n && solid > 0.45 && kh / kw > 0.5 && kh / kw < 4.5 &&
            kw > 0.3 * wAvg && kw < 1.6 * wAvg && kh < 1.8 * (edge.y1 - edge.y0 + 1) && gap > -0.2 * wAvg && gap < 0.5 * wAvg &&
            !teeth.some((t) => overl(t, k) > 0.25) && k.lum > lt * 0.7 && k.red < rt * 1.3 && Math.abs(k.cy - rowY) < 0.7 * kh + 0.3 * (edge.y1 - edge.y0 + 1);
          if (ok) { added = k; break; }
        }
        if (!added) break;
        teeth = [...teeth, added].sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1));
      }
    }
  }

  // the finder needs 3 teeth in the row, but only after the re-ask and the outward probe had a chance to find the rest (a decayed tooth often fails the first pass)
  if (teeth.length < 3) return null;

  // masks often leak a little into the dark gap beside the tooth (a diastema, a shadow): trim edge columns that are clearly darker than the tooth
  for (const t of teeth) {
    const med = (() => { const v: number[] = []; for (let i = 0; i < n; i++) if (t.m[i]) v.push(lum[i]); v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 0; })();
    const colMean = (x: number) => { let sum = 0, c = 0; for (let y = t.y0; y <= t.y1; y++) { const i = y * ow + x; if (t.m[i]) { sum += lum[i]; c++; } } return c ? sum / c : -1; };
    const colCnt = (x: number) => { let c = 0; for (let y = t.y0; y <= t.y1; y++) if (t.m[y * ow + x]) c++; return c; };
    const maxTrim = Math.round(0.2 * (t.x1 - t.x0 + 1));
    let l = 0;
    while (l < maxTrim && colMean(t.x0 + l) < 0.72 * med) l++;
    let r = 0;
    while (r < maxTrim && colMean(t.x1 - r) < 0.72 * med) r++;
    if (l || r) {
      for (let y = t.y0; y <= t.y1; y++) {
        for (let k = 0; k < l; k++) t.m[y * ow + t.x0 + k] = 0;
        for (let k = 0; k < r; k++) t.m[y * ow + t.x1 - k] = 0;
      }
      t.x0 += l; t.x1 -= r;
    }
    void colCnt;
  }

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
  const tol = 6 * (rw / 1280);
  const groups: number[][] = [];
  for (const x of ext) {
    if (groups.length && x - groups[groups.length - 1][groups[groups.length - 1].length - 1] <= tol) groups[groups.length - 1].push(x);
    else groups.push([x]);
  }
  const borders = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  const upBottom = teeth.reduce((a, t) => a + t.y1, 0) / teeth.length;
  const lowerBoxes = [...rowLow, ...keep]
    .filter((k, i, arr) => arr.indexOf(k) === i && okShape(k) && k.lum > lt * 0.8 && k.red < rt * 1.2 && !teeth.includes(k) && k.cy > upBottom - 0.1 * bigH && k.y0 > upBottom - 0.35 * bigH)
    .map((t) => ({ x0: rx + t.x0 / (sc * Q), x1: rx + t.x1 / (sc * Q), y0: ry + t.y0 / (sc * Q), y1: ry + t.y1 / (sc * Q) }))
    .sort((a, b) => a.x0 - b.x0);
  return { labels, w: canvas.width, h: canvas.height, count: teeth.length, boxes, lowerBoxes, borders, ms: performance.now() - t0 };
}

/** A result found only by a fallback must show at least this many upper teeth, else the frame stays refused (ex8 fallback gave 3 teeth, 2 of 10 borders right, 91 px median error: worse than refusing). NEITHER-sourced. */
const MIN_FALLBACK_TEETH = 5;

/** Box around the biggest bright, low-red blob (tooth-like colour), padded. Used only when no face ROI is known. NEITHER-sourced thresholds. */
function autoToothRoi(canvas: HTMLCanvasElement): SamBox | null {
  const w = 160, h = Math.max(8, Math.round((canvas.height / canvas.width) * 160));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(canvas, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    m[i] = l > 120 && (r - g) / (l + 1) < 0.3 && (r - b) / (l + 1) < 0.6 ? 1 : 0;
  }
  const seen = new Uint8Array(w * h);
  let best: { n: number; x0: number; x1: number; y0: number; y1: number } | null = null;
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1;
    let n = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (st.length) {
      const p = st.pop()!;
      const x = p % w, y = (p / w) | 0;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w, p - w - 1, p - w + 1, p + w - 1, p + w + 1]) {
        if (q < 0 || q >= w * h || seen[q] || !m[q]) continue;
        if ((q % w === 0 && p % w === w - 1) || (q % w === w - 1 && p % w === 0)) continue;
        seen[q] = 1; st.push(q);
      }
    }
    if (!best || n > best.n) best = { n, x0, x1, y0, y1 };
  }
  if (!best || best.n < 0.01 * w * h) return null;
  const k = canvas.width / w;
  const bw = (best.x1 - best.x0 + 1) * k, bh = (best.y1 - best.y0 + 1) * k;
  const x = Math.max(0, best.x0 * k - 0.15 * bw), y = Math.max(0, best.y0 * k - 0.25 * bh);
  return { x, y, w: Math.min(canvas.width - x, bw * 1.3), h: Math.min(canvas.height - y, bh * 1.5) };
}

/**
 * samTeeth with fallbacks for a refused frame: (1) retry at 0.8x and 1.25x (the finder is size-sensitive),
 * (2) with no face ROI, retry inside an automatic tooth-colour ROI, at those scales too.
 */
export async function samTeethRobust(canvas: HTMLCanvasElement, roi?: SamBox | null, onProgress?: (f: number) => void): Promise<SamTeeth | null> {
  const tStart = performance.now();
  // Total budget: a retry starts only while under 40 s, so a slow device or a heavy frame ends in an honest refusal, not a multi-minute wait. NEITHER-sourced.
  const underBudget = () => performance.now() - tStart < 40000;
  const first = await samTeeth(canvas, roi, onProgress);
  if (first) return first;
  const scaled = (f: number) => {
    const c2 = document.createElement("canvas");
    c2.width = Math.round(canvas.width * f); c2.height = Math.round(canvas.height * f);
    c2.getContext("2d")!.drawImage(canvas, 0, 0, c2.width, c2.height);
    return c2;
  };
  for (const f of [0.8, 1.25]) {
    if (!underBudget()) break;
    const r = await samTeeth(scaled(f), roi ? { x: roi.x * f, y: roi.y * f, w: roi.w * f, h: roi.h * f } : null);
    if (r && r.count >= MIN_FALLBACK_TEETH) return { ...r, scale: f };
  }
  if (!roi && underBudget()) {
    const a = autoToothRoi(canvas);
    if (a) {
      for (const f of [1]) { // one attempt only: each finder run costs 10 to 15 s, so fallbacks are capped at 3 extra runs
        const r = await samTeeth(f === 1 ? canvas : scaled(f), { x: a.x * f, y: a.y * f, w: a.w * f, h: a.h * f });
        if (r && r.count >= MIN_FALLBACK_TEETH) return { ...r, scale: f };
      }
    }
  }
  return null;
}
