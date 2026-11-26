/**
 * Smile design preview engine (2D, photo based).
 *
 * Takes a tooth mask (from colour/face analysis), splits it into individual teeth,
 * and lets the caller re-draw each tooth with: edge repair (convex fill closes chips
 * and notches), straightening (rotate toward the row's typical tilt) and size
 * balancing (grow small teeth toward their neighbours). This is a visual preview made
 * from pixels. It is not a measurement and not validated against clinical outcomes.
 */

export interface RegionLike {
  w: number;
  h: number;
  base: ImageData;
  mask: Float32Array;
}

export interface Tooth {
  id: number;
  cx: number;
  cy: number;
  area: number;
  /** tilt of the long axis away from vertical, radians (+ = clockwise); 0 if the tooth is too round to tell */
  tilt: number;
  /** true when the incisal (biting) edge is the bottom of the tooth (upper teeth in an upright photo) */
  incisalDown: boolean;
  /** own area / convex hull area: low means a ragged or fragmented mask */
  solidity: number;
  bx: number;
  by: number;
  bw: number;
  bh: number;
  /** RGBA, bbox sized: own pixels plus convex-fill pixels */
  full: ImageData;
  /** RGBA, bbox sized: own pixels only */
  own: ImageData;
}

export interface TeethEngine {
  w: number;
  h: number;
  teeth: Tooth[];
  /** region pixels with all teeth removed and replaced by a dark gap tone */
  erased: ImageData;
  medianTilt: number;
  medianArea: number;
  medianSolidity: number;
}

export interface ToothEdit {
  /** steps: each step is about 6 percent */
  len: number;
  wid: number;
  /** steps: each step is about 2 degrees */
  rot: number;
}

export interface ShapeOptions {
  level: number;
  smooth: boolean;
  straighten: boolean;
  balance: boolean;
  /** translucent incisal edge and warmer neck, so teeth do not look flat */
  enamel?: boolean;
  edits?: Record<number, ToothEdit>;
}

/** Layered enamel: warmer and a little denser at the neck, cooler and more translucent at the biting edge. */
function enamelShade(img: ImageData, t: Tooth, level: number) {
  const d = img.data;
  const { width: w, height: h } = img;
  const k0 = Math.min(1, 0.5 + level * 0.6);
  for (let y = 0; y < h; y++) {
    const v0 = y / Math.max(1, h - 1);
    const v = t.incisalDown ? v0 : 1 - v0; // 0 neck, 1 biting edge
    const warm = Math.max(0, 1 - v * 2.2) * 0.5 * k0;
    const t0 = Math.min(1, Math.max(0, (v - 0.68) / 0.32));
    const trans = t0 * t0 * (3 - 2 * t0) * 0.42 * k0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const m = d[i + 3] / 255;
      if (m < 0.05) continue;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // neck: a touch warmer and a little deeper
      r += 7 * warm;
      g += 2 * warm;
      b -= 7 * warm;
      const dn = 1 - 0.05 * warm;
      r *= dn; g *= dn; b *= dn;
      // edge: pull toward a cool grey-blue and let a little of the dark mouth show through
      const tr = lum * 0.9, tg = lum * 0.96, tb = lum * 1.04 + 6;
      r += (tr - r) * trans;
      g += (tg - g) * trans;
      b += (tb - b) * trans;
      const dark = 1 - 0.1 * trans;
      d[i] = r * dark;
      d[i + 1] = g * dark;
      d[i + 2] = b * dark;
    }
  }
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function erode(bin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const t = new Uint8Array(bin.length);
  const o = new Uint8Array(bin.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let k = -r; k <= r && v; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w || !bin[y * w + xx]) v = 0;
      }
      t[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let k = -r; k <= r && v; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h || !t[yy * w + x]) v = 0;
      }
      o[y * w + x] = v;
    }
  return o;
}

function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

export function segmentTeeth(region: RegionLike): TeethEngine | null {
  const { w, h, base, mask } = region;
  const d = base.data;
  const bin = new Uint8Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask[i] > 0.5) {
      bin[i] = 1;
      total++;
    }
  }
  if (total < 200) return null;

  // 1. separate touching teeth: erode, label the cores, grow them back inside the mask.
  const r = Math.max(2, Math.round(Math.max(w, h) / 120));
  const core = erode(bin, w, h, r);
  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  let nl = 0;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!core[i] || label[i]) continue;
    nl++;
    let n = 0;
    label[i] = nl;
    stack.push(i);
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const x = c % w;
      const y = (c - x) / w;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (core[j] && !label[j]) {
          label[j] = nl;
          stack.push(j);
        }
      }
    }
    sizes.push(n);
  }
  const minCore = Math.max(12, total * 0.004);
  const keep = new Int32Array(nl + 1);
  let kept = 0;
  for (let l = 1; l <= nl; l++) if (sizes[l] >= minCore) keep[l] = ++kept;
  if (kept < 1) return null;
  const lab = new Int32Array(w * h);
  let queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (label[i] && keep[label[i]]) {
      lab[i] = keep[label[i]];
      queue.push(i);
    }
  }
  while (queue.length) {
    const next: number[] = [];
    for (const c of queue) {
      const x = c % w;
      const y = (c - x) / w;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (bin[j] && !lab[j]) {
          lab[j] = lab[c];
          next.push(j);
        }
      }
    }
    queue = next;
  }

  // 2. gap tone: nearest non-tooth colour, darkened.
  const erased = new ImageData(new Uint8ClampedArray(d), w, h);
  const inner = erode(bin, w, h, 1);
  {
    const col = new Int32Array(w * h).fill(-1);
    const dist = new Uint16Array(w * h);
    let q: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (!bin[i]) {
        col[i] = i;
        q.push(i);
      }
    }
    while (q.length) {
      const nx: number[] = [];
      for (const c of q) {
        const x = c % w;
        const y = (c - x) / w;
        for (const [dx, dy] of N4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (col[j] < 0) {
            col[j] = col[c];
            dist[j] = dist[c] + 1;
            nx.push(j);
          }
        }
      }
      q = nx;
    }
    for (let i = 0; i < w * h; i++) {
      if (!inner[i] || col[i] < 0) continue;
      const s = col[i] * 4;
      // blend into the surroundings at the edge, darker toward the middle of the hole
      const f = 1 - 0.6 * Math.min(1, dist[i] / 5);
      erased.data[i * 4] = d[s] * f;
      erased.data[i * 4 + 1] = d[s + 1] * f * 0.95;
      erased.data[i * 4 + 2] = d[s + 2] * f * 0.95;
    }
  }

  // 3. per tooth data.
  const teeth: Tooth[] = [];
  for (let id = 1; id <= kept; id++) {
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0, sx = 0, sy = 0;
    for (let i = 0; i < w * h; i++) {
      if (lab[i] !== id) continue;
      const x = i % w;
      const y = (i - x) / w;
      n++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (n < minCore) continue;
    const cx = sx / n;
    const cy = sy / n;
    let m20 = 0, m02 = 0, m11 = 0;
    const edge: [number, number][] = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (lab[i] !== id) continue;
        const dx = x - cx;
        const dy = y - cy;
        m20 += dx * dx;
        m02 += dy * dy;
        m11 += dx * dy;
        let isEdge = false;
        for (const [ax, ay] of N4) {
          const xx = x + ax;
          const yy = y + ay;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || lab[yy * w + xx] !== id) {
            isEdge = true;
            break;
          }
        }
        if (isEdge) edge.push([x, y]);
      }
    m20 /= n;
    m02 /= n;
    m11 /= n;
    const common = Math.sqrt(((m20 - m02) / 2) ** 2 + m11 ** 2);
    const l1 = (m20 + m02) / 2 + common;
    const l2 = (m20 + m02) / 2 - common;
    let tilt = 0;
    if (l2 > 0 && l1 / l2 > 1.3) {
      const th = 0.5 * Math.atan2(2 * m11, m20 - m02); // major axis from the x axis
      let dev = th - Math.PI / 2;
      while (dev > Math.PI / 2) dev -= Math.PI;
      while (dev < -Math.PI / 2) dev += Math.PI;
      tilt = dev;
    }

    const bx = Math.max(0, x0 - 3);
    const by = Math.max(0, y0 - 3);
    const bw = Math.min(w, x1 + 4) - bx;
    const bh = Math.min(h, y1 + 4) - by;

    // convex fill, only where no other tooth lives
    const inFill = new Uint8Array(bw * bh);
    const hl = hull(edge);
    let fillOk = false;
    let solidity = 1;
    if (hl.length >= 3) {
      const hc = document.createElement("canvas");
      hc.width = bw;
      hc.height = bh;
      const hx = hc.getContext("2d")!;
      hx.fillStyle = "#fff";
      hx.beginPath();
      hl.forEach(([x, y], k) => (k ? hx.lineTo(x - bx + 0.5, y - by + 0.5) : hx.moveTo(x - bx + 0.5, y - by + 0.5)));
      hx.closePath();
      hx.fill();
      const hd = hx.getImageData(0, 0, bw, bh).data;
      let ha = 0;
      for (let k = 0; k < bw * bh; k++) if (hd[k * 4 + 3] > 128) ha++;
      solidity = ha > 0 ? Math.min(1, n / ha) : 1;
      if (ha <= n * 1.4) {
        fillOk = true;
        for (let y = 0; y < bh; y++)
          for (let x = 0; x < bw; x++) {
            const k = y * bw + x;
            const gi = (y + by) * w + (x + bx);
            if (hd[k * 4 + 3] > 128 && (lab[gi] === id || (lab[gi] === 0 && !bin[gi]))) inFill[k] = 1;
            if (lab[gi] === id) inFill[k] = 1;
          }
      }
    }
    if (!fillOk) {
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) if (lab[(y + by) * w + (x + bx)] === id) inFill[y * bw + x] = 1;
    }

    // colours for added pixels come from the nearest own pixel
    const own = new Uint8ClampedArray(bw * bh * 4);
    const full = new Uint8ClampedArray(bw * bh * 4);
    const srcIdx = new Int32Array(bw * bh).fill(-1);
    let fq: number[] = [];
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const gi = (y + by) * w + (x + bx);
        if (lab[gi] === id) {
          const k = y * bw + x;
          srcIdx[k] = k;
          fq.push(k);
          for (let c = 0; c < 4; c++) {
            const v = c === 3 ? 255 : d[gi * 4 + c];
            own[k * 4 + c] = v;
            full[k * 4 + c] = v;
          }
        }
      }
    while (fq.length) {
      const nx: number[] = [];
      for (const c of fq) {
        const x = c % bw;
        const y = (c - x) / bw;
        for (const [dx, dy] of N4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          const j = yy * bw + xx;
          if (srcIdx[j] < 0 && inFill[j]) {
            srcIdx[j] = srcIdx[c];
            nx.push(j);
          }
        }
      }
      fq = nx;
    }
    for (let k = 0; k < bw * bh; k++) {
      if (srcIdx[k] >= 0 && srcIdx[k] !== k) {
        const s = srcIdx[k];
        full[k * 4] = full[s * 4];
        full[k * 4 + 1] = full[s * 4 + 1];
        full[k * 4 + 2] = full[s * 4 + 2];
        full[k * 4 + 3] = 255;
      }
    }
    // soft edge on both sprites
    for (const arr of [own, full]) {
      const a = new Float32Array(bw * bh);
      for (let k = 0; k < bw * bh; k++) a[k] = arr[k * 4 + 3] / 255;
      const t = new Float32Array(bw * bh);
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          let s = 0, c = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) {
                c++;
                continue;
              }
              s += a[yy * bw + xx];
              c++;
            }
          t[y * bw + x] = s / c;
        }
      for (let k = 0; k < bw * bh; k++) arr[k * 4 + 3] = Math.round(Math.min(1, t[k] * 1.25) * 255);
    }
    teeth.push({
      id,
      cx,
      cy,
      area: n,
      tilt,
      solidity,
      incisalDown: true,
      bx,
      by,
      bw,
      bh,
      full: new ImageData(full, bw, bh),
      own: new ImageData(own, bw, bh),
    });
  }
  if (!teeth.length) return null;
  const meanY = teeth.reduce((a, t) => a + t.cy, 0) / teeth.length;
  const spreadY = Math.max(...teeth.map((t) => t.cy)) - Math.min(...teeth.map((t) => t.cy));
  // Only call teeth "lower" when the photo really shows two rows.
  for (const t of teeth) t.incisalDown = spreadY < h * 0.18 ? true : t.cy <= meanY;
  return {
    w,
    h,
    teeth,
    erased,
    medianTilt: median(teeth.filter((t) => t.tilt !== 0).map((t) => t.tilt)),
    medianArea: median(teeth.map((t) => t.area)),
    medianSolidity: median(teeth.map((t) => t.solidity)),
  };
}

/** Texture-preserving whitening: removes the colour cast, lifts brightness gently, soft-clips highlights so enamel keeps its shading. */
export function whitenInPlace(d: Uint8ClampedArray, level: number) {
  if (level <= 0) return;
  const clip = (v: number) => (v > 232 ? 232 + (v - 232) * 0.35 : v);
  for (let i = 0; i < d.length; i += 4) {
    const m = d[i + 3] / 255;
    if (m <= 0.01) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const k = m * level;
    const desat = 1 - 0.62 * k;
    r = lum + (r - lum) * desat;
    g = lum + (g - lum) * desat;
    b = lum + (b - lum) * desat + 5 * k;
    const gain = 1 + 0.07 * k + 0.1 * k * (1 - lum / 255);
    d[i] = clip(r * gain);
    d[i + 1] = clip(g * gain);
    d[i + 2] = clip(b * gain);
  }
}

/** Draws the redesigned teeth over the photo at (x0, y0) of `out`. */
export function renderTeeth(eng: TeethEngine, out: CanvasRenderingContext2D, x0: number, y0: number, o: ShapeOptions) {
  const rc = document.createElement("canvas");
  rc.width = eng.w;
  rc.height = eng.h;
  const rx = rc.getContext("2d")!;
  rx.imageSmoothingQuality = "high";
  rx.putImageData(eng.erased, 0, 0);
  const tc = document.createElement("canvas");
  const order = [...eng.teeth].sort((a, b) => a.area - b.area);
  for (const t of order) {
    const src = o.smooth ? t.full : t.own;
    const img = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    whitenInPlace(img.data, o.level);
    if (o.enamel) enamelShade(img, t, o.level);
    tc.width = t.bw;
    tc.height = t.bh;
    tc.getContext("2d")!.putImageData(img, 0, 0);
    let rot = 0;
    if (o.straighten && t.tilt !== 0) {
      rot = Math.max(-0.21, Math.min(0.21, eng.medianTilt - t.tilt));
    }
    let sc = 1;
    if (o.balance && t.area < eng.medianArea) {
      sc = Math.min(1.18, Math.sqrt(eng.medianArea / t.area));
    }
    rx.save();
    rx.translate(t.cx, t.cy);
    rx.rotate(rot);
    rx.scale(sc, sc);
    rx.translate(-t.cx, -t.cy);
    const ed = o.edits?.[t.id];
    if (ed && (ed.len || ed.wid || ed.rot)) {
      // length and width change from the neck, so the biting edge moves, not the gum line
      const ax = t.cx;
      const ay = t.incisalDown ? t.by : t.by + t.bh;
      rx.translate(ax, ay);
      rx.rotate((ed.rot * 2 * Math.PI) / 180);
      rx.scale(1 + ed.wid * 0.06, 1 + ed.len * 0.06);
      rx.translate(-ax, -ay);
    }
    rx.drawImage(tc, t.bx, t.by);
    rx.restore();
  }
  out.drawImage(rc, x0, y0);
}
