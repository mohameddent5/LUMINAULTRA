import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Contrast,
  Download,
  FolderOpen,
  ImagePlus,
  Languages,
  RefreshCw,
  Save,
  Share2,
  ShieldCheck,
  Sparkles,
  Type,
  UserRound,
} from "lucide-react";
import { segmentTeeth, renderTeeth, whitenInPlace, type TeethEngine } from "@/lib/smileEngine";
import { evaluateCapture, type CaptureQuality } from "@/lib/captureQuality";

/* ------------------------------------------------------------------ text */

type Lang = "en" | "ar";

const T = {
  en: {
    brand: "Smile Studio",
    steps: ["Patient", "Photo", "Design", "Share"],
    step: (i: number, n: number) => `Step ${i} of ${n}`,
    next: "Next",
    back: "Back",
    tools: "All tools",
    archive: "Patient files",
    lang: "العربية",
    textSize: "Text size",
    contrast: "High contrast",
    p1Title: "Who is this smile for?",
    p1Name: "Patient name",
    p1NamePh: "Type the name (optional)",
    p1ConsentTitle: "Patient consent",
    p1Consent:
      "The patient was told what is captured (a photo of the face and smile), why (to preview a smile design), and how long it is kept. They agreed, and can withdraw and ask for deletion at any time.",
    p1Assist: "A visual aid for the dentist. It does not diagnose anything, and the dentist reviews every result.",
    p1Need: "Tick the consent box to continue.",
    p2Title: "Take a smile photo",
    p2Hint: "Ask the patient to smile and show their teeth. Face the camera, level head, good light.",
    openCamera: "Open camera",
    choosePhoto: "Choose a photo",
    shutter: "Take photo",
    flip: "Flip camera",
    cancel: "Cancel",
    cameraError: "The camera could not open. Allow camera access, or choose a photo instead.",
    reading: "Finding the smile...",
    p3Title: "Design the smile",
    before: "Before",
    after: "After",
    drag: "Drag to compare before and after",
    looks: "Look",
    natural: "Natural",
    fresh: "Fresh",
    bright: "Bright",
    fine: "Fine tune",
    subtle: "Softer",
    strong: "Brighter",
    notes: "What we see",
    tapTooth: "Wrong teeth highlighted? Tap a tooth in the photo and the preview follows.",
    tapMouth: "The smile could not be found automatically. Tap the teeth in the photo.",
    foundMouth: "Smile found.",
    retake: "Retake photo",
    levelOf: ["Very subtle", "Natural", "Fresh", "Bright", "Very bright"],
    shapeTitle: "Shape tools",
    smooth: "Smooth edges",
    smoothHint: "Closes chips and uneven edges",
    straighten: "Straighten",
    straightenHint: "Turns tilted teeth toward the row",
    balance: "Balance sizes",
    balanceHint: "Grows small teeth toward their neighbours",
    shapeRefused: "Shape tools are off: not enough clear, separate teeth in this photo to reshape them honestly.",
    relGood: "Reliable preview",
    relGoodWhy: "Sharp, well lit, teeth clearly visible.",
    relLow: "Low-confidence preview",
    relLowWhy: "Treat this as a rough idea only. Retake for a reliable one:",
    rotate: "Rotate photo",
    live_ready: "Ready. Hold still.",
    live_light: "More light, please.",
    live_dark: "Too bright or too dark. Change the light.",
    live_blur: "Hold still. The picture is soft.",
    live_teeth: "Show the teeth: smile wider or retract the lips.",
    live_closer: "Move closer.",
    burstBtn: "Capture best smile",
    burstHint: "Takes a 2 second burst and keeps the best frame.",
    singleBtn: "Single photo",
    bursting: "Smile! Hold still...",
    picking: "Choosing the best frame...",
    caseId: "Case ID",
    verified: "Capture verified",
    unverified: "Low-confidence capture",
    n_close: "Close-up photo: teeth were found by colour. Check the preview looks right.",
    n_teeth_ok: "Teeth are visible.",
    n_teeth_no: "Few teeth are showing. Ask for a bigger smile and retake for a better preview.",
    n_tilt: "The head is tilted. Retake with a level head for the best preview.",
    n_level: "The head is level.",
    n_warm: "Teeth have a warm, yellow tone. Whitening will make a clear difference.",
    n_mid: "Teeth have a slightly warm tone.",
    n_light: "Teeth are already light. A subtle look will keep them natural.",
    n_dark: "The mouth is in shadow. Better light gives a more accurate preview.",
    p4Title: "Save and share",
    save: "Save to patient file",
    saved: "Saved to the patient file.",
    download: "Download picture",
    share: "Share with patient",
    shareFail: "Sharing is not available here. Use Download instead.",
    newPatient: "New patient",
    disclaimer: "Visual preview made by software. Not a guarantee of the final result.",
    consentOn: "Consent recorded",
    preview: "Your smile preview",
  },
  ar: {
    brand: "استوديو الابتسامة",
    steps: ["المريض", "الصورة", "التصميم", "المشاركة"],
    step: (i: number, n: number) => `الخطوة ${i} من ${n}`,
    next: "التالي",
    back: "رجوع",
    tools: "كل الأدوات",
    archive: "ملفات المرضى",
    lang: "English",
    textSize: "حجم الخط",
    contrast: "تباين عالٍ",
    p1Title: "لمن هذه الابتسامة؟",
    p1Name: "اسم المريض",
    p1NamePh: "اكتب الاسم (اختياري)",
    p1ConsentTitle: "موافقة المريض",
    p1Consent:
      "تم إبلاغ المريض بما يتم التقاطه (صورة للوجه والابتسامة) ولماذا (لمعاينة تصميم الابتسامة) ومدة الاحتفاظ بها. وافق المريض، وله الحق في سحب موافقته وطلب الحذف في أي وقت.",
    p1Assist: "أداة بصرية مساعدة للطبيب. لا تشخّص أي حالة، والطبيب يراجع كل نتيجة.",
    p1Need: "فعّل خانة الموافقة للمتابعة.",
    p2Title: "التقط صورة للابتسامة",
    p2Hint: "اطلب من المريض أن يبتسم ويُظهر أسنانه. وجه للكاميرا، رأس مستقيم، إضاءة جيدة.",
    openCamera: "افتح الكاميرا",
    choosePhoto: "اختر صورة",
    shutter: "التقاط",
    flip: "قلب الكاميرا",
    cancel: "إلغاء",
    cameraError: "تعذّر فتح الكاميرا. اسمح بالوصول إلى الكاميرا أو اختر صورة.",
    reading: "جارٍ البحث عن الابتسامة...",
    p3Title: "صمّم الابتسامة",
    before: "قبل",
    after: "بعد",
    drag: "اسحب للمقارنة بين قبل وبعد",
    looks: "المظهر",
    natural: "طبيعي",
    fresh: "منتعش",
    bright: "ناصع",
    fine: "ضبط دقيق",
    subtle: "أهدأ",
    strong: "أكثر نصاعة",
    notes: "ما نراه",
    tapTooth: "هل الأسنان المحددة غير صحيحة؟ المس سناً في الصورة وستتبعه المعاينة.",
    tapMouth: "تعذّر إيجاد الابتسامة تلقائياً. المس الأسنان في الصورة.",
    foundMouth: "تم إيجاد الابتسامة.",
    retake: "إعادة التقاط",
    levelOf: ["هادئ جداً", "طبيعي", "منتعش", "ناصع", "ناصع جداً"],
    shapeTitle: "Shape tools",
    smooth: "Smooth edges",
    smoothHint: "Closes chips and uneven edges",
    straighten: "Straighten",
    straightenHint: "Turns tilted teeth toward the row",
    balance: "Balance sizes",
    balanceHint: "Grows small teeth toward their neighbours",
    shapeRefused: "Shape tools are off: not enough clear, separate teeth in this photo to reshape them honestly.",
    relGood: "Reliable preview",
    relGoodWhy: "Sharp, well lit, teeth clearly visible.",
    relLow: "Low-confidence preview",
    relLowWhy: "Treat this as a rough idea only. Retake for a reliable one:",
    rotate: "Rotate photo",
    live_ready: "Ready. Hold still.",
    live_light: "More light, please.",
    live_dark: "Too bright or too dark. Change the light.",
    live_blur: "Hold still. The picture is soft.",
    live_teeth: "Show the teeth: smile wider or retract the lips.",
    live_closer: "Move closer.",
    burstBtn: "Capture best smile",
    burstHint: "Takes a 2 second burst and keeps the best frame.",
    singleBtn: "Single photo",
    bursting: "Smile! Hold still...",
    picking: "Choosing the best frame...",
    caseId: "Case ID",
    verified: "Capture verified",
    unverified: "Low-confidence capture",
    n_close: "صورة مقرّبة: تم إيجاد الأسنان بحسب اللون. تأكد أن المعاينة تبدو سليمة.",
    n_teeth_ok: "الأسنان ظاهرة.",
    n_teeth_no: "الأسنان قليلة الظهور. اطلب ابتسامة أكبر وأعد التقاط الصورة لمعاينة أفضل.",
    n_tilt: "الرأس مائل. أعد التقاط الصورة برأس مستقيم لأفضل معاينة.",
    n_level: "الرأس مستقيم.",
    n_warm: "الأسنان بلون أصفر دافئ. التبييض سيُحدث فرقاً واضحاً.",
    n_mid: "الأسنان بلون دافئ قليلاً.",
    n_light: "الأسنان فاتحة أصلاً. المظهر الهادئ يُبقيها طبيعية.",
    n_dark: "الفم في الظل. إضاءة أفضل تعطي معاينة أدق.",
    p4Title: "احفظ وشارك",
    save: "احفظ في ملف المريض",
    saved: "تم الحفظ في ملف المريض.",
    download: "تنزيل الصورة",
    share: "مشاركة مع المريض",
    shareFail: "المشاركة غير متاحة هنا. استخدم التنزيل.",
    newPatient: "مريض جديد",
    disclaimer: "معاينة بصرية من إنتاج البرنامج. لا تضمن النتيجة النهائية.",
    consentOn: "تم تسجيل الموافقة",
    preview: "معاينة ابتسامتك",
  },
} as const;

/* ------------------------------------------------------------ face engine */

const MP_ESM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
const MP_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MP_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
// Inner lip loop, in order.
const INNER_LIP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

let landmarkerPromise: Promise<any> | null = null;
function getLandmarker(): Promise<any> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const sdk: any = await import(/* @vite-ignore */ MP_ESM);
      const files = await sdk.FilesetResolver.forVisionTasks(MP_WASM);
      return sdk.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })().catch((e) => {
      landmarkerPromise = null;
      throw e;
    });
  }
  return landmarkerPromise;
}

type Pt = { x: number; y: number };
type Analysis = {
  polygon: Pt[];
  auto: boolean;
  close?: boolean;
  seed?: Pt;
  tiltDeg: number | null;
};

async function findSmile(canvas: HTMLCanvasElement): Promise<Analysis> {
  const w = canvas.width;
  const h = canvas.height;
  try {
    const lm = await Promise.race([
      getLandmarker(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
    ]);
    const res = lm.detect(canvas);
    const f = res?.faceLandmarks?.[0];
    if (f && f.length > 400) {
      const polygon = INNER_LIP.map((i) => ({ x: f[i].x * w, y: f[i].y * h }));
      const a = f[33];
      const b = f[263];
      const tilt = (Math.atan2((b.y - a.y) * h, (b.x - a.x) * w) * 180) / Math.PI;
      return { polygon, auto: true, tiltDeg: tilt };
    }
  } catch (e) {
    console.warn("Face engine unavailable:", e);
  }
  // No whole face in the photo (a close-up of the teeth): look for teeth by colour across the picture.
  return { polygon: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], auto: true, close: true, tiltDeg: null };
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Pt[] {
  return Array.from({ length: 24 }, (_, i) => {
    const t = (i / 24) * Math.PI * 2;
    return { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
  });
}

/* ------------------------------------------------------------ tooth mask */

type Region = {
  x0: number;
  y0: number;
  w: number;
  h: number;
  base: ImageData;
  mask: Float32Array;
  yellow: number;
  luma: number;
  toothShare: number;
};

function buildRegion(src: HTMLCanvasElement, polygon: Pt[], close = false): Region | null {
  const pad = 6;
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - pad);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - pad);
  const x1 = Math.min(src.width, Math.ceil(Math.max(...xs)) + pad);
  const y1 = Math.min(src.height, Math.ceil(Math.max(...ys)) + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 8 || h < 4) return null;

  const m = document.createElement("canvas");
  m.width = w;
  m.height = h;
  const mc = m.getContext("2d")!;
  mc.fillStyle = "#fff";
  mc.beginPath();
  polygon.forEach((p, i) => (i ? mc.lineTo(p.x - x0, p.y - y0) : mc.moveTo(p.x - x0, p.y - y0)));
  mc.closePath();
  mc.fill();
  const poly = mc.getImageData(0, 0, w, h).data;

  const base = src.getContext("2d")!.getImageData(x0, y0, w, h);
  const d = base.data;
  const mask = new Float32Array(w * h);
  let inside = 0;
  let teeth = 0;
  let sy = 0;
  let sl = 0;
  for (let i = 0; i < w * h; i++) {
    if (poly[i * 4 + 3] < 128) continue;
    inside++;
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    // Teeth: bright enough and not red like gum, lip or tongue.
    const ok = close
      ? mx > 105 && r - g < 40 && b < r + 4 && sat < 0.62 && g > 0.7 * r
      : mx > 85 && r - g < 62 && sat < 0.6;
    if (ok) {
      mask[i] = 1;
      teeth++;
      sy += (r + g) / 2 - b;
      sl += 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  // Soften the edge so the effect never shows a hard outline.
  blur(mask, w, h, 2);
  blur(mask, w, h, 2);
  return {
    x0,
    y0,
    w,
    h,
    base,
    mask,
    yellow: teeth ? sy / teeth : 0,
    luma: teeth ? sl / teeth : 0,
    toothShare: inside ? teeth / inside : 0,
  };
}

/** Close-up photos: grow the tooth colour from one seed point (auto-picked, or tapped by the dentist). */
function autoSeed(src: HTMLCanvasElement): Pt {
  const w = src.width;
  const h = src.height;
  const d = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const step = Math.max(8, Math.round(w / 90));
  let best = { x: w / 2, y: h / 2 };
  let bestScore = -1e9;
  for (let y = step * 2; y < h - step * 2; y += step)
    for (let x = step * 2; x < w - step * 2; x += step) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = -step; dy <= step; dy += step / 2)
        for (let dx = -step; dx <= step; dx += step / 2) {
          const i = (Math.round(y + dy) * w + Math.round(x + dx)) * 4;
          sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++;
        }
      sr /= n; sg /= n; sb /= n;
      const lum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
      if (sb > sr || sg < 0.7 * sr) continue;
      const score = lum - 3 * (sr - sg) - 0.2 * Math.abs(x - w / 2) * (255 / w) - 0.2 * Math.abs(y - h / 2) * (255 / h);
      if (lum > 110 && score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  return best;
}

function buildSeeded(src: HTMLCanvasElement, seed: Pt): Region | null {
  const w0 = src.width;
  const h0 = src.height;
  const rx = w0 * 0.42;
  const ry = w0 * 0.3;
  const x0 = Math.max(0, Math.floor(seed.x - rx));
  const y0 = Math.max(0, Math.floor(seed.y - ry));
  const x1 = Math.min(w0, Math.ceil(seed.x + rx));
  const y1 = Math.min(h0, Math.ceil(seed.y + ry));
  const w = x1 - x0;
  const h = y1 - y0;
  const base = src.getContext("2d")!.getImageData(x0, y0, w, h);
  const d = base.data;
  // seed colour = mean of a small patch
  let sr = 0, sg = 0, sb = 0, n = 0;
  const pr = Math.max(3, Math.round(w0 / 200));
  for (let dy = -pr; dy <= pr; dy++)
    for (let dx = -pr; dx <= pr; dx++) {
      const xx = Math.round(seed.x - x0 + dx);
      const yy = Math.round(seed.y - y0 + dy);
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const i = (yy * w + xx) * 4;
      sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++;
    }
  if (!n) return null;
  sr /= n; sg /= n; sb /= n;
  const sl = 0.299 * sr + 0.587 * sg + 0.114 * sb;
  const sd = sr - sg;
  const sy = sg - sb;
  const mask = new Float32Array(w * h);
  let teeth = 0, yel = 0, lum = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ex = (x + x0 - seed.x) / rx;
      const ey = (y + y0 - seed.y) / ry;
      if (ex * ex + ey * ey > 1) continue;
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (Math.abs(l - sl) < 48 && Math.abs(r - g - sd) < 13 && Math.abs(g - b - sy) < 26 && Math.max(r, g, b) > 90) {
        mask[y * w + x] = 1;
        teeth++;
        yel += (r + g) / 2 - b;
        lum += l;
      }
    }
  blur(mask, w, h, 1);
  blur(mask, w, h, 1);
  return { x0, y0, w, h, base, mask, yellow: teeth ? yel / teeth : 0, luma: teeth ? lum / teeth : 0, toothShare: teeth / (w * h) };
}

function blur(a: Float32Array, w: number, h: number, r: number) {
  const t = new Float32Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += a[y * w + xx];
          n++;
        }
      }
      t[y * w + x] = s / n;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += t[yy * w + x];
          n++;
        }
      }
      a[y * w + x] = s / n;
    }
}

/** level 0..1. Removes yellow and lifts brightness inside the tooth mask only. */
function renderAfter(original: HTMLCanvasElement, out: HTMLCanvasElement, region: Region | null, level: number) {
  out.width = original.width;
  out.height = original.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(original, 0, 0);
  if (!region || level <= 0) return;
  const img = new ImageData(new Uint8ClampedArray(region.base.data), region.w, region.h);
  for (let i = 0; i < region.w * region.h; i++) img.data[i * 4 + 3] = Math.round(region.mask[i] * 255);
  whitenInPlace(img.data, level);
  // put back with full alpha so the photo underneath is replaced, not blended
  for (let i = 0; i < region.w * region.h; i++) {
    const m = region.mask[i];
    if (m <= 0.01) {
      img.data[i * 4] = region.base.data[i * 4];
      img.data[i * 4 + 1] = region.base.data[i * 4 + 1];
      img.data[i * 4 + 2] = region.base.data[i * 4 + 2];
    }
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, region.x0, region.y0);
}

/* ------------------------------------------------------------ utilities */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("image"));
    im.src = src;
  });
}

function toCanvas(img: CanvasImageSource, iw: number, ih: number, maxW = 1000): HTMLCanvasElement {
  const s = Math.min(1, maxW / iw);
  const c = document.createElement("canvas");
  c.width = Math.round(iw * s);
  c.height = Math.round(ih * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function thumb(c: HTMLCanvasElement, maxW = 480): string {
  const s = Math.min(1, maxW / c.width);
  const t = document.createElement("canvas");
  t.width = Math.round(c.width * s);
  t.height = Math.round(c.height * s);
  t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.8);
}

function clinicName(): string {
  try {
    return JSON.parse(localStorage.getItem("clinicSettings") || "{}").clinicName || "";
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------- component */

function lumaOf(c: HTMLCanvasElement): Uint8Array {
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  const out = new Uint8Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return out;
}

type Graded = {
  c: HTMLCanvasElement;
  analysis: Analysis;
  region: Region | null;
  engine: TeethEngine | null;
  quality: CaptureQuality;
  teethPx: number;
};

function regrade(c: HTMLCanvasElement, analysis: Analysis, region: Region | null): Graded {
  const engine = region ? segmentTeeth(region) : null;
  let pts: { x: number; y: number }[] | undefined;
  if (analysis.close && engine && region) {
    const x0 = Math.min(...engine.teeth.map((t) => t.bx)) + region.x0;
    const x1 = Math.max(...engine.teeth.map((t) => t.bx + t.bw)) + region.x0;
    pts = [
      { x: x0 / c.width, y: 0.5 },
      { x: x1 / c.width, y: 0.5 },
    ];
  } else if (!analysis.close) {
    pts = analysis.polygon.map((p) => ({ x: p.x / c.width, y: p.y / c.height }));
  }
  const quality = evaluateCapture({
    luma: lumaOf(c),
    width: c.width,
    height: c.height,
    mouthPoints: pts,
    teethCount: engine ? engine.teeth.length : 0,
  });
  return { c, analysis, region, engine, quality, teethPx: engine ? engine.teeth.reduce((a, t) => a + t.area, 0) : 0 };
}

async function gradeFrame(c: HTMLCanvasElement): Promise<Graded> {
  const a = await findSmile(c);
  let region: Region | null;
  if (a.close) {
    a.seed = autoSeed(c);
    region = buildSeeded(c, a.seed);
  } else region = buildRegion(c, a.polygon);
  return regrade(c, a, region);
}

async function sha256(c: HTMLCanvasElement): Promise<string> {
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
  if (!blob) return "";
  const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const LOOKS = [
  { key: "natural", level: 0.35 },
  { key: "fresh", level: 0.6 },
  { key: "bright", level: 0.85 },
] as const;

export default function Studio() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("studioLang") === "ar" ? "ar" : "en"));
  const [big, setBig] = useState(() => localStorage.getItem("studioBig") === "1");
  const [hc, setHc] = useState(() => localStorage.getItem("studioHc") === "1");
  const t = T[lang];

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const consentAt = useRef<string | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [camError, setCamError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const beforeShow = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [level, setLevel] = useState(0.6);
  const [split, setSplit] = useState(50);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [engine, setEngine] = useState<TeethEngine | null>(null);
  const [quality, setQuality] = useState<CaptureQuality | null>(null);
  const [smooth, setSmooth] = useState(false);
  const [straighten, setStraighten] = useState(false);
  const [balance, setBalance] = useState(false);
  const [live, setLive] = useState<{ ok: boolean; text: string } | null>(null);
  const [burstMsg, setBurstMsg] = useState("");
  const [caseId, setCaseId] = useState("");
  const sourceRef = useRef<"file" | "camera-single" | "camera-burst">("file");
  const shapeOk = !!engine && engine.teeth.length >= 4 && engine.medianSolidity >= 0.9 && !!quality && quality.signals.find((x) => x.id === "sharpness")!.ok;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("studioLang", lang);
    return () => {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
    };
  }, [lang]);
  useEffect(() => localStorage.setItem("studioBig", big ? "1" : "0"), [big]);
  useEffect(() => localStorage.setItem("studioHc", hc ? "1" : "0"), [hc]);

  /* camera */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      setCamError(false);
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 } },
          audio: false,
        });
        streamRef.current = s;
        setCameraOn(true);
        setFacing(mode);
        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            void videoRef.current.play();
          }
        });
      } catch {
        setCamError(true);
        setCameraOn(false);
      }
    },
    [],
  );

  /* process a photo */
  const apply = useCallback((g: Graded) => {
    originalRef.current = g.c;
    setHasPhoto(true);
    setAnalysis(g.analysis);
    setRegion(g.region);
    setEngine(g.engine);
    setQuality(g.quality);
    setSmooth(false);
    setStraighten(false);
    setBalance(false);
    setCaseId("");
    void sha256(g.c).then((h) => setCaseId(h.slice(0, 10)));
  }, []);

  const process = useCallback(
    async (c: HTMLCanvasElement) => {
      setBusy(true);
      setSaved(false);
      setMsg("");
      apply(await gradeFrame(c));
      setBusy(false);
      setStep(2);
    },
    [apply],
  );

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    sourceRef.current = "file";
    const url = URL.createObjectURL(f);
    try {
      const im = await loadImage(url);
      await process(toCanvas(im, im.naturalWidth, im.naturalHeight));
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const snap = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    sourceRef.current = "camera-single";
    const c = toCanvas(v, v.videoWidth, v.videoHeight);
    stopCamera();
    await process(c);
  };

  const burst = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const frames: HTMLCanvasElement[] = [];
    setBurstMsg(t.bursting);
    for (let i = 0; i < 10; i++) {
      frames.push(toCanvas(v, v.videoWidth, v.videoHeight, 800));
      await new Promise((r) => setTimeout(r, 200));
    }
    stopCamera();
    setBusy(true);
    setBurstMsg(t.picking);
    const graded: Graded[] = [];
    for (const f of frames) graded.push(await gradeFrame(f));
    const good = graded.filter((g) => g.quality.acceptable);
    const pool = good.length ? good : graded;
    const peak = (g: Graded) => g.quality.score * 0.6 + Math.min(1, g.teethPx / (g.c.width * g.c.height) / 0.08) * 0.4;
    let best = pool[0];
    for (const g of pool) if (peak(g) > peak(best)) best = g;
    sourceRef.current = "camera-burst";
    setBurstMsg("");
    setSaved(false);
    setMsg("");
    apply(best);
    setBusy(false);
    setStep(2);
  };

  const rotate = async () => {
    const o = originalRef.current;
    if (!o) return;
    const c = document.createElement("canvas");
    c.width = o.height;
    c.height = o.width;
    const x = c.getContext("2d")!;
    x.translate(c.width, 0);
    x.rotate(Math.PI / 2);
    x.drawImage(o, 0, 0);
    setBusy(true);
    apply(await gradeFrame(c));
    setBusy(false);
  };

  /* live capture gate */
  useEffect(() => {
    if (!cameraOn) {
      setLive(null);
      return;
    }
    let stop = false;
    let running = false;
    const tick = async () => {
      const v = videoRef.current;
      if (stop || running || !v || !v.videoWidth) return;
      running = true;
      try {
        const g = await gradeFrame(toCanvas(v, v.videoWidth, v.videoHeight, 640));
        if (stop) return;
        const bad = g.quality.signals.find((x) => !x.ok);
        const text = !bad
          ? t.live_ready
          : bad.id === "sharpness"
            ? t.live_blur
            : bad.id === "exposure"
              ? t.live_dark
              : bad.id === "resolution"
                ? t.live_closer
                : g.engine && g.engine.teeth.length > 0
                  ? t.live_closer
                  : t.live_teeth;
        setLive({ ok: !bad, text });
      } catch {
        /* keep last status */
      } finally {
        running = false;
      }
    };
    const id = setInterval(tick, 900);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [cameraOn, t]);

  /* redraw */
  useEffect(() => {
    const o = originalRef.current;
    if (step !== 2 && step !== 3) return;
    if (!o || !afterRef.current || !beforeShow.current) return;
    beforeShow.current.width = o.width;
    beforeShow.current.height = o.height;
    beforeShow.current.getContext("2d")!.drawImage(o, 0, 0);
    if (engine && region && (smooth || straighten || balance)) {
      const out = afterRef.current;
      out.width = o.width;
      out.height = o.height;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(o, 0, 0);
      renderTeeth(engine, ctx, region.x0, region.y0, { level, smooth, straighten, balance });
    } else renderAfter(o, afterRef.current, region, level);
  }, [step, region, level, hasPhoto, engine, smooth, straighten, balance]);

  const dragMoves = useRef(false);
  const tapSeed = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originalRef.current;
    if (!o || !analysis) return;
    const r = e.currentTarget.getBoundingClientRect();
    const seed = { x: ((e.clientX - r.left) / r.width) * o.width, y: ((e.clientY - r.top) / r.height) * o.height };
    dragMoves.current = true;
    const na = { ...analysis, seed };
    const reg = buildSeeded(o, seed);
    const g = regrade(o, na, reg);
    setAnalysis(na);
    setRegion(reg);
    setEngine(g.engine);
    setQuality(g.quality);
  };
  const tapMouth = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originalRef.current;
    if (!o || !analysis || analysis.auto) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * o.width;
    const y = ((e.clientY - r.top) / r.height) * o.height;
    const poly = ellipse(x, y, o.width * 0.17, o.width * 0.06);
    setAnalysis({ ...analysis, polygon: poly });
    setRegion(buildRegion(o, poly));
  };

  const notes = useMemo(() => {
    if (!analysis) return [] as string[];
    const out: string[] = [];
    if (analysis.tiltDeg !== null) out.push(Math.abs(analysis.tiltDeg) > 5 ? t.n_tilt : t.n_level);
    if (!region || region.toothShare < (analysis.close ? 0.02 : 0.12)) {
      out.push(t.n_teeth_no);
    } else {
      out.push(t.n_teeth_ok);
      if (region.luma < 110) out.push(t.n_dark);
      else if (region.yellow > 58) out.push(t.n_warm);
      else if (region.yellow > 38) out.push(t.n_mid);
      else out.push(t.n_light);
    }
    return out;
  }, [analysis, region, t]);

  const levelWord = t.levelOf[Math.min(4, Math.floor(level * 5))];

  /* compare slider */
  const dragging = useRef(false);
  const setFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSplit(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };

  /* outputs */
  const composite = (): HTMLCanvasElement | null => {
    const o = originalRef.current;
    const a = afterRef.current;
    if (!o || !a) return null;
    const w = 900;
    const h = Math.round((o.height / o.width) * w);
    const bar = 90;
    const c = document.createElement("canvas");
    c.width = w * 2;
    c.height = h + bar;
    const x = c.getContext("2d")!;
    x.fillStyle = "#0b1220";
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(o, 0, 0, w, h);
    x.drawImage(a, w, 0, w, h);
    x.fillStyle = "rgba(0,0,0,0.55)";
    x.fillRect(0, 0, 150, 48);
    x.fillRect(w, 0, 150, 48);
    x.fillStyle = "#fff";
    x.font = "bold 28px sans-serif";
    x.fillText("Before", 18, 34);
    x.fillText("After", w + 18, 34);
    x.font = "22px sans-serif";
    x.fillStyle = "#cbd5e1";
    const clinic = clinicName();
    x.fillText(`${clinic ? clinic + "  |  " : ""}Visual preview made by software. Not a guarantee of the final result.`, 18, h + 40);
    x.fillText(`${quality?.acceptable ? "Capture verified" : "Low-confidence capture"}  |  Consent recorded${caseId ? "  |  Case " + caseId : ""}`, 18, h + 72);
    return c;
  };

  const download = () => {
    const c = composite();
    if (!c) return;
    const a = document.createElement("a");
    a.download = `smile-preview-${Date.now()}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  };

  const share = async () => {
    const c = composite();
    if (!c) return;
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], "smile-preview.png", { type: "image/png" });
    const nav: any = navigator;
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: t.preview, text: t.disclaimer });
        return;
      } catch {
        return;
      }
    }
    setMsg(t.shareFail);
  };

  const save = () => {
    const o = originalRef.current;
    const a = afterRef.current;
    if (!o || !a) return;
    try {
      const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
      const when = new Date();
      archive.push({
        id: Date.now(),
        date: when.toLocaleDateString(),
        patientName: name.trim() || `Unnamed patient ${archive.length + 1}`,
        harmony: 0,
        measurements: {},
        consent: {
          confirmedAt: consentAt.current,
          statement:
            "Clinician confirmed the patient was told what is captured, why, and how long it is kept, and agreed.",
        },
        studio: { before: thumb(o), after: thumb(a), look: levelWord, lookLevel: Math.round(level * 100) / 100 },
        audit: {
          engine: "smile-studio/1",
          capturedAt: when.toISOString(),
          source: sourceRef.current,
          photoSha256Prefix: caseId,
          consentAt: consentAt.current,
          capture: quality
            ? { verified: quality.acceptable, reasons: quality.reasons, signals: quality.signals.map((x) => ({ id: x.id, ok: x.ok })) }
            : null,
          edits: { whiteningLevel: Math.round(level * 100) / 100, smooth, straighten, balance },
        },
        notes: "Smile Studio preview",
        clinicalNotes: "",
        visitHistory: [{ date: when.toLocaleDateString(), harmony: 0, notes: "Smile Studio preview" }],
      });
      localStorage.setItem("patientArchive", JSON.stringify(archive));
      setSaved(true);
      setMsg(t.saved);
    } catch (e) {
      console.error(e);
      setMsg("Could not save: browser storage is full or blocked.");
    }
  };

  const reset = () => {
    setStep(0);
    setName("");
    setConsent(false);
    consentAt.current = null;
    originalRef.current = null;
    setHasPhoto(false);
    setAnalysis(null);
    setRegion(null);
    setSaved(false);
    setMsg("");
  };

  /* look and feel */
  const fs = big ? "text-xl" : "text-lg";
  const bg = hc ? "bg-black text-white" : "bg-gradient-to-b from-[#0b1220] to-[#111c33] text-slate-100";
  const card = hc ? "border-2 border-white bg-black" : "border border-white/15 bg-white/5";
  const muted = hc ? "text-white" : "text-slate-300";
  const btnBase =
    "min-h-[56px] px-6 rounded-2xl font-semibold inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-[0.98]";
  const primary = `${btnBase} ${hc ? "bg-yellow-300 text-black" : "bg-cyan-400 text-slate-900 hover:bg-cyan-300"}`;
  const ghost = `${btnBase} ${hc ? "border-2 border-white text-white" : "border border-white/25 text-white hover:bg-white/10"}`;
  const iconBtn = `min-h-[44px] min-w-[44px] px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 ${
    hc ? "border-2 border-white" : "border border-white/20 hover:bg-white/10"
  }`;

  const Next = lang === "ar" ? ArrowLeft : ArrowRight;
  const Prev = lang === "ar" ? ArrowRight : ArrowLeft;
  const canNext = step === 0 ? consent : step === 2 ? true : false;

  return (
    <div className={`min-h-screen ${bg} ${fs}`} data-testid="studio">
      <header className="sticky top-0 z-20 backdrop-blur bg-black/40 border-b border-white/10 px-3 sm:px-6 pr-16 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 me-auto">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-yellow-300 text-slate-900 font-bold flex items-center justify-center">
            <Sparkles className="w-5 h-5" aria-hidden />
          </span>
          <span className="font-bold text-xl">{t.brand}</span>
        </div>
        <button className={iconBtn} onClick={() => setLang(lang === "en" ? "ar" : "en")} aria-label="Language">
          <Languages className="w-4 h-4" aria-hidden />
          {t.lang}
        </button>
        <button className={iconBtn} onClick={() => setBig(!big)} aria-pressed={big} aria-label={t.textSize}>
          <Type className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">{t.textSize}</span>
        </button>
        <button className={iconBtn} onClick={() => setHc(!hc)} aria-pressed={hc} aria-label={t.contrast}>
          <Contrast className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">{t.contrast}</span>
        </button>
        <Link href="/patient-archive" className={iconBtn} aria-label={t.archive}>
          <FolderOpen className="w-4 h-4" aria-hidden />
          <span className="hidden md:inline">{t.archive}</span>
        </Link>
        <Link href="/workspace" className={iconBtn}>
          {t.tools}
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-40" id="main">
        {/* progress */}
        <nav aria-label={t.step(step + 1, 4)} className="mb-6">
          <ol className="flex items-center gap-2">
            {t.steps.map((s, i) => (
              <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
                <div
                  className={`h-2 rounded-full ${
                    i <= step ? (hc ? "bg-yellow-300" : "bg-cyan-400") : hc ? "bg-white/30" : "bg-white/15"
                  }`}
                />
                <p className={`mt-1 text-sm ${i === step ? "font-bold text-white" : muted}`}>{s}</p>
              </li>
            ))}
          </ol>
        </nav>

        <div aria-live="polite" className="sr-only">
          {t.step(step + 1, 4)}: {t.steps[step]}
        </div>

        {/* STEP 1 */}
        {step === 0 && (
          <section className="space-y-5">
            <h1 className="text-3xl sm:text-4xl font-bold">{t.p1Title}</h1>
            <div className={`rounded-2xl p-5 ${card}`}>
              <label htmlFor="pname" className="flex items-center gap-2 font-semibold mb-2">
                <UserRound className="w-5 h-5" aria-hidden />
                {t.p1Name}
              </label>
              <input
                id="pname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.p1NamePh}
                autoComplete="off"
                className="w-full min-h-[56px] rounded-xl px-4 bg-black/40 border-2 border-white/30 focus:border-cyan-300 focus:outline-none text-white placeholder:text-slate-400"
              />
            </div>
            <div className={`rounded-2xl p-5 ${card}`}>
              <h2 className="flex items-center gap-2 font-semibold mb-2">
                <ShieldCheck className="w-5 h-5" aria-hidden />
                {t.p1ConsentTitle}
              </h2>
              <label className="flex items-start gap-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    consentAt.current = e.target.checked ? new Date().toISOString() : null;
                  }}
                  className="mt-1 w-8 h-8 shrink-0 accent-cyan-400"
                />
                <span className={muted}>{t.p1Consent}</span>
              </label>
              <p className={`mt-4 text-base ${muted}`}>{t.p1Assist}</p>
              {!consent && <p className="mt-3 text-base text-yellow-300">{t.p1Need}</p>}
            </div>
          </section>
        )}

        {/* STEP 2 */}
        {step === 1 && (
          <section className="space-y-5">
            <h1 className="text-3xl sm:text-4xl font-bold">{t.p2Title}</h1>
            <p className={muted}>{t.p2Hint}</p>

            {cameraOn ? (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-black" dir="ltr">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className={`w-full max-h-[60vh] object-contain ${facing === "user" ? "-scale-x-100" : ""}`}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  >
                    <div className="w-[48%] aspect-[3/4] rounded-[50%] border-4 border-dashed border-white/60" />
                  </div>
                </div>
                <p
                  role="status"
                  aria-live="polite"
                  className={`rounded-xl p-3 font-semibold text-center ${
                    live?.ok ? "bg-emerald-400 text-black" : "bg-yellow-300 text-black"
                  }`}
                >
                  {burstMsg || live?.text || t.reading}
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button className={`${primary} flex-1`} onClick={burst} disabled={!!burstMsg}>
                    <Camera className="w-6 h-6" aria-hidden />
                    {t.burstBtn}
                  </button>
                  <button className={ghost} onClick={snap} disabled={!!burstMsg}>
                    {t.singleBtn}
                  </button>
                  <button className={ghost} onClick={() => startCamera(facing === "user" ? "environment" : "user")}>
                    <RefreshCw className="w-5 h-5" aria-hidden />
                    {t.flip}
                  </button>
                  <button className={ghost} onClick={stopCamera}>
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : busy ? (
              <div className={`rounded-2xl p-10 text-center ${card}`} role="status">
                <div className="mx-auto mb-4 w-12 h-12 rounded-full border-4 border-cyan-300 border-t-transparent animate-spin" />
                {t.reading}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <button className={`${primary} min-h-[140px] flex-col text-2xl`} onClick={() => startCamera(facing)}>
                  <Camera className="w-10 h-10" aria-hidden />
                  {t.openCamera}
                </button>
                <button className={`${ghost} min-h-[140px] flex-col text-2xl`} onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="w-10 h-10" aria-hidden />
                  {t.choosePhoto}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  data-testid="photo-input"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
            {camError && (
              <p role="alert" className="text-yellow-300">
                {t.cameraError}
              </p>
            )}
          </section>
        )}

        {/* STEP 3 and 4 share the preview */}
        {(step === 2 || step === 3) && (
          <section className="space-y-5">
            <h1 className="text-3xl sm:text-4xl font-bold">{step === 2 ? t.p3Title : t.p4Title}</h1>

            <div
              dir="ltr"
              className="relative rounded-2xl overflow-hidden select-none touch-none bg-black"
              style={{ aspectRatio: originalRef.current ? `${originalRef.current.width}/${originalRef.current.height}` : "4/3" }}
              onPointerDown={(e) => {
                dragging.current = true;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const onHandle = !!(e.target as HTMLElement).closest("[role=slider]");
                if (analysis?.close && step === 2 && !onHandle) tapSeed(e);
                else setFromPointer(e);
              }}
              onPointerMove={(e) => dragging.current && !dragMoves.current && setFromPointer(e)}
              onPointerUp={() => { dragging.current = false; dragMoves.current = false; }}
              onPointerCancel={() => (dragging.current = false)}
            >
              <canvas ref={afterRef} className="absolute inset-0 w-full h-full" aria-label={t.after} />
              <canvas
                ref={beforeShow}
                className="absolute inset-0 w-full h-full"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                aria-label={t.before}
              />
              <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/70 text-white text-base font-semibold">
                {t.before}
              </span>
              <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/70 text-white text-base font-semibold">
                {t.after}
              </span>
              <div
                role="slider"
                tabIndex={0}
                aria-label={t.drag}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(split)}
                aria-valuetext={split > 66 ? t.before : split < 34 ? t.after : `${t.before} / ${t.after}`}
                onKeyDown={(e) => {
                  const dirn = lang === "ar" ? 1 : 1;
                  if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - 5 * dirn));
                  if (e.key === "ArrowRight") setSplit((s) => Math.min(100, s + 5 * dirn));
                  if (e.key === "Home") setSplit(0);
                  if (e.key === "End") setSplit(100);
                }}
                className="absolute top-0 bottom-0 w-12 -ml-6 flex items-center justify-center cursor-ew-resize focus:outline-none group"
                style={{ left: `${split}%` }}
              >
                <div className="absolute inset-y-0 w-1 bg-white shadow" />
                <div className="relative w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg group-focus-visible:ring-4 ring-yellow-300 font-bold">
                  ⇄
                </div>
              </div>
            </div>
            <p className={`text-base ${muted}`}>{t.drag}</p>

            {step === 2 && (
              <>
                {analysis?.close && (
                  <p role="status" className="rounded-xl p-3 bg-cyan-300 text-black font-semibold">
                    {t.tapTooth}
                  </p>
                )}
                {analysis && !analysis.auto && (
                  <p role="status" className="rounded-xl p-3 bg-yellow-300 text-black font-semibold">
                    {t.tapMouth}
                  </p>
                )}
                {quality && (
                  <div
                    role="status"
                    className={`rounded-2xl p-4 border-2 ${
                      quality.acceptable
                        ? hc ? "border-white" : "border-emerald-400/70 bg-emerald-400/10"
                        : hc ? "border-yellow-300" : "border-yellow-300/80 bg-yellow-300/10"
                    }`}
                  >
                    <p className="font-bold flex items-center gap-2">
                      {quality.acceptable ? (
                        <ShieldCheck className="w-6 h-6 text-emerald-300" aria-hidden />
                      ) : (
                        <span aria-hidden>⚠</span>
                      )}
                      {quality.acceptable ? t.relGood : t.relLow}
                    </p>
                    {quality.acceptable ? (
                      <p className={`text-base ${muted}`}>{t.relGoodWhy}</p>
                    ) : (
                      <>
                        <p className={`text-base ${muted}`}>{t.relLowWhy}</p>
                        <ul className={`text-base list-disc ps-6 ${muted}`}>
                          {quality.reasons.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                <div className={`rounded-2xl p-5 space-y-4 ${card}`}>
                  <h2 className="font-semibold">{t.looks}</h2>
                  <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t.looks}>
                    {LOOKS.map((l) => {
                      const on = Math.abs(level - l.level) < 0.001;
                      return (
                        <button
                          key={l.key}
                          role="radio"
                          aria-checked={on}
                          onClick={() => setLevel(l.level)}
                          className={`min-h-[64px] rounded-2xl font-bold text-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 ${
                            on
                              ? hc
                                ? "bg-yellow-300 text-black"
                                : "bg-cyan-400 text-slate-900"
                              : hc
                                ? "border-2 border-white"
                                : "border border-white/25 hover:bg-white/10"
                          }`}
                        >
                          {t[l.key]}
                          {on && <Check className="inline w-5 h-5 ms-1" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                  <div>
                    <label htmlFor="fine" className="block mb-2 text-base font-semibold">
                      {t.fine}: {levelWord}
                    </label>
                    <div className="flex items-center gap-3" dir="ltr">
                      <span className="text-sm w-16 text-end">{t.subtle}</span>
                      <input
                        id="fine"
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(level * 100)}
                        onChange={(e) => setLevel(Number(e.target.value) / 100)}
                        aria-valuetext={levelWord}
                        className="flex-1 h-10 accent-cyan-400"
                      />
                      <span className="text-sm w-20">{t.strong}</span>
                    </div>
                  </div>
                </div>

                <div className={`rounded-2xl p-5 space-y-3 ${card}`} data-solidity={engine ? engine.medianSolidity.toFixed(2) : ""} data-teeth={engine ? engine.teeth.length : 0}>
                  <h2 className="font-semibold">{t.shapeTitle}</h2>
                  {!shapeOk && <p className="text-yellow-300 text-base">{t.shapeRefused}</p>}
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[
                      { k: "smooth", on: smooth, set: setSmooth, label: t.smooth, hint: t.smoothHint },
                      { k: "straighten", on: straighten, set: setStraighten, label: t.straighten, hint: t.straightenHint },
                      { k: "balance", on: balance, set: setBalance, label: t.balance, hint: t.balanceHint },
                    ].map((x) => (
                      <button
                        key={x.k}
                        role="switch"
                        aria-checked={x.on}
                        disabled={!shapeOk}
                        onClick={() => x.set(!x.on)}
                        className={`min-h-[72px] rounded-2xl px-3 py-2 text-start focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 disabled:opacity-40 ${
                          x.on ? (hc ? "bg-yellow-300 text-black" : "bg-cyan-400 text-slate-900") : hc ? "border-2 border-white" : "border border-white/25 hover:bg-white/10"
                        }`}
                      >
                        <span className="block font-bold text-lg">
                          {x.on && <Check className="inline w-5 h-5 me-1" aria-hidden />}
                          {x.label}
                        </span>
                        <span className="block text-sm opacity-90">{x.hint}</span>
                      </button>
                    ))}
                  </div>
                  <button className={ghost} onClick={rotate}>
                    <RefreshCw className="w-5 h-5" aria-hidden />
                    {t.rotate}
                  </button>
                </div>

                <div className={`rounded-2xl p-5 ${card}`}>
                  <h2 className="font-semibold mb-2">{t.notes}</h2>
                  <ul className={`space-y-2 ${muted}`}>
                    {[...(analysis?.close ? [t.n_close] : analysis?.auto ? [t.foundMouth] : []), ...notes].map((n) => (
                      <li key={n} className="flex gap-2">
                        <Check className="w-5 h-5 mt-1 shrink-0 text-emerald-300" aria-hidden />
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className={`flex items-center gap-2 ${muted}`}>
                  <ShieldCheck className="w-5 h-5 text-emerald-300" aria-hidden />
                  {t.consentOn}
                  {name.trim() ? ` · ${name.trim()}` : ""}
                  {caseId ? ` · ${t.caseId} ${caseId}` : ""}
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <button className={primary} onClick={save} disabled={saved}>
                    {saved ? <Check className="w-5 h-5" aria-hidden /> : <Save className="w-5 h-5" aria-hidden />}
                    {saved ? t.saved : t.save}
                  </button>
                  <button className={ghost} onClick={download}>
                    <Download className="w-5 h-5" aria-hidden />
                    {t.download}
                  </button>
                  <button className={ghost} onClick={share}>
                    <Share2 className="w-5 h-5" aria-hidden />
                    {t.share}
                  </button>
                </div>
                <p role="status" className="min-h-[1.5rem] text-emerald-300">
                  {msg}
                </p>
                <p className={`text-base ${muted}`}>{t.disclaimer}</p>
                <button className={ghost} onClick={reset}>
                  <UserRound className="w-5 h-5" aria-hidden />
                  {t.newPatient}
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* sticky nav */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-black/70 backdrop-blur border-t border-white/10 px-4 py-3">
        <div className="max-w-4xl mx-auto flex gap-3">
          <button
            className={ghost}
            disabled={step === 0}
            onClick={() => {
              if (step === 2) {
                setStep(1);
                setHasPhoto(false);
              } else setStep(Math.max(0, step - 1));
            }}
          >
            <Prev className="w-5 h-5" aria-hidden />
            {step === 2 ? t.retake : t.back}
          </button>
          {step < 3 && step !== 1 && (
            <button className={`${primary} flex-1`} disabled={!canNext} onClick={() => setStep(step + 1)}>
              {t.next}
              <Next className="w-5 h-5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
