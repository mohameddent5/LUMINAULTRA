/**
 * Frame -> dental analysis. Crop the mouth ROI, run the network (injected), decode keypoints, gate them for
 * visibility, and refine incisal edges on the source pixels with the subpixel locator.
 * Everything produced here is INFERRED (network-seeded). Refinement improves localisation, not provenance.
 */
import { decodeKeypoints, KEYPOINT_LAYOUT, invertTransform, type KeypointKind, type RoiTransform } from '../dental.js';
import { type Provenance, type Quantity, makeQuantity, insufficientEvidence } from '../epistemic.js';
import { type GateModel, gateFeatures, gateScore, groupOf, softmaxPlanes } from '../gate.js';
import { locateEdge, sampleProfile, type GrayImage } from '../subpixel.js';

export const NET_W = 192, NET_H = 128, NET_STRIDE = 4;
export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export interface Point { x: number; y: number }
export interface CropBox { x0: number; y0: number; w: number; h: number }
export interface NetOutputs { seg: Float32Array; ident: Float32Array; kp: Float32Array }
export interface NetRunner { run(chw: Float32Array): Promise<NetOutputs> }

/** The training crops have the mouth opening spanning ~86% of the width and centred; reproduce that framing. */
export function polygonBox(poly: Point[], fill = 0.86): CropBox {
  if (poly.length < 3) throw new RangeError('polygon needs >= 3 points');
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const w = (maxX - minX) / fill, h = (w * NET_H) / NET_W;
  return { x0: (minX + maxX) / 2 - w / 2, y0: (minY + maxY) / 2 - h / 2, w, h };
}

export function cropTransform(b: CropBox): RoiTransform {
  const s = b.w / NET_W;
  return { scale: s, ox: b.x0 + 0.5 * s - 0.5, oy: b.y0 + 0.5 * s - 0.5 };
}

function bilinear(img: RgbaImage, x: number, y: number, c: number): number {
  const xc = Math.min(Math.max(x, 0), img.width - 1), yc = Math.min(Math.max(y, 0), img.height - 1);
  const x0 = Math.floor(xc), y0 = Math.floor(yc), x1 = Math.min(x0 + 1, img.width - 1), y1 = Math.min(y0 + 1, img.height - 1);
  const fx = xc - x0, fy = yc - y0, d = img.data, w = img.width;
  const a = d[(y0 * w + x0) * 4 + c] as number, b = d[(y0 * w + x1) * 4 + c] as number, e = d[(y1 * w + x0) * 4 + c] as number, f = d[(y1 * w + x1) * 4 + c] as number;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + e * (1 - fx) * fy + f * fx * fy;
}

/** Area-averaged resample of the crop into CHW float [0,1] (n x n bilinear taps per output pixel when downscaling). */
export function cropToTensor(img: RgbaImage, b: CropBox): Float32Array {
  const s = b.w / NET_W, n = Math.max(1, Math.min(4, Math.ceil(s)));
  const out = new Float32Array(3 * NET_W * NET_H);
  for (let j = 0; j < NET_H; j++) for (let i = 0; i < NET_W; i++) for (let c = 0; c < 3; c++) {
    let acc = 0;
    for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
      const sx = b.x0 + (i + (u + 0.5) / n) * s - 0.5, sy = b.y0 + (j + (v + 0.5) / n) * s - 0.5;
      acc += bilinear(img, sx, sy, c);
    }
    out[c * NET_W * NET_H + j * NET_W + i] = acc / (n * n) / 255;
  }
  return out;
}

export type KeypointState = 'ACCEPTED' | 'GATED_OUT' | 'REFUSED';
export interface AnalyzedKeypoint {
  channel: number; kind: KeypointKind; fdi?: number; between?: [number, number];
  state: KeypointState; gateP: number | null; peak: number;
  /** Source-image pixels. value === null unless ACCEPTED. */
  xy: Quantity<[number, number]>;
  roiXY: [number, number] | null;
  refinedBy?: 'subpixel_edge'; edgeShiftPx?: number;
}
export interface DentalAnalysis {
  box: CropBox; tf: RoiTransform; classMap: Uint8Array; /** FDI slot index 0..7 per tooth pixel, -1 elsewhere */ slotMap: Int8Array; slotAreas: number[]; toothPixels: number;
  keypoints: AnalyzedKeypoint[]; flags: string[]; refusal?: 'INSUFFICIENT_VISUAL_EVIDENCE'; ms: number;
}

export interface AnalyzeOptions { refineEdges?: boolean; minToothPixels?: number; minSlots?: number; minPeak?: number }

export function lumaOf(img: RgbaImage): GrayImage {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * (img.data[i * 4] as number) + 0.587 * (img.data[i * 4 + 1] as number) + 0.114 * (img.data[i * 4 + 2] as number);
  return { data: out, width: img.width, height: img.height };
}

export async function analyzeMouth(img: RgbaImage, polygon: Point[], net: NetRunner, gate: GateModel, prov: Provenance, opt: AnalyzeOptions = {}): Promise<DentalAnalysis> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const box = polygonBox(polygon), tf = cropTransform(box);
  const out = await net.run(cropToTensor(img, box));
  const plane = NET_W * NET_H, flags: string[] = [];
  const probs = softmaxPlanes(out.seg, 6, plane);
  const classMap = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) { let b = 0, bv = -1; for (let c = 0; c < 6; c++) { const v = (probs[c] as Float32Array)[i] as number; if (v > bv) { bv = v; b = c; } } classMap[i] = b; }
  const slotAreas = new Array<number>(8).fill(0);
  const slotMap = new Int8Array(plane).fill(-1);
  let toothPixels = 0;
  for (let i = 0; i < plane; i++) {
    if (classMap[i] !== 5) continue;
    toothPixels++;
    let b = 0, bv = -Infinity;
    for (let s = 0; s < 8; s++) { const v = out.ident[s * plane + i] as number; if (v > bv) { bv = v; b = s; } }
    slotAreas[b] = (slotAreas[b] as number) + 1;
    slotMap[i] = b;
  }
  const visibleSlots = slotAreas.filter((a) => a >= 60).length;
  const decoded = decodeKeypoints({ data: out.kp, channels: KEYPOINT_LAYOUT.length, height: NET_H / NET_STRIDE, width: NET_W / NET_STRIDE, stride: NET_STRIDE }, tf, prov, { minPeak: opt.minPeak ?? 0.3 });
  const keypoints: AnalyzedKeypoint[] = decoded.map((d) => {
    const base = { channel: d.channel, kind: d.kind, peak: d.peak, ...(d.fdi !== undefined ? { fdi: d.fdi } : {}), ...(d.between ? { between: d.between } : {}) };
    if (d.xy.value === null) return { ...base, state: 'REFUSED' as const, gateP: null, xy: d.xy, roiXY: null };
    const roi = invertTransform(d.xy.value, tf);
    const g = gateScore(gate, groupOf(d.channel), gateFeatures(probs, NET_W, NET_H, roi[0], roi[1], d.peak, gate.offsets));
    if (!g.pass) return { ...base, state: 'GATED_OUT' as const, gateP: g.p, xy: insufficientEvidence('px', prov, 'keypoint judged hidden by visibility gate'), roiXY: roi };
    return { ...base, state: 'ACCEPTED' as const, gateP: g.p, xy: d.xy, roiXY: roi };
  });
  if (opt.refineEdges !== false) refineIncisalEdges(img, keypoints, tf.scale, prov);
  const res: DentalAnalysis = { box, tf, classMap, slotMap, slotAreas, toothPixels, keypoints, flags, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 };
  if (toothPixels < (opt.minToothPixels ?? 400)) flags.push('FEW_TOOTH_PIXELS');
  if (visibleSlots < (opt.minSlots ?? 4)) flags.push('FEW_TEETH_VISIBLE');
  if (flags.length) res.refusal = 'INSUFFICIENT_VISUAL_EVIDENCE';
  return res;
}

/** Snap accepted incisal midpoints to the strongest falling luminance edge on the SOURCE pixels (subpixel). */
export function refineIncisalEdges(img: RgbaImage, kps: AnalyzedKeypoint[], scale: number, prov: Provenance): void {
  const gray = lumaOf(img);
  for (const k of kps) {
    if (k.state !== 'ACCEPTED' || k.kind !== 'incisal_mid' || k.xy.value === null) continue;
    const [x, y] = k.xy.value;
    const half = Math.max(3, 2.5 * scale), step = Math.max(0.1, 0.25 * Math.min(1, scale));
    const e = locateEdge(sampleProfile(gray, x, y, 0, 1, half, step), { sigmaG: Math.max(0.8, 0.8 * scale), minStrength: 2 });
    if (!e || e.polarity !== -1 || Math.abs(e.offsetPx) > 1.5 * scale + 1) continue; // tooth(bright) -> cavity(dark) only, and only a local nudge
    k.edgeShiftPx = e.offsetPx; k.refinedBy = 'subpixel_edge';
    k.xy = makeQuantity<[number, number]>({ value: [x, y + e.offsetPx], unit: 'px', status: 'INFERRED', modelScore: k.peak, provenance: prov, note: 'network-seeded, subpixel-refined on source pixels' });
  }
}
