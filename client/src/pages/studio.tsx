import { lesionFlags, INVESTIGATIONAL } from "@/lib/lesionFlags";
import { screen } from "@/lib/screening";
import { spacingNotes } from "@/lib/spacingGeometry";
import { bracesSuspected } from "@/lib/bracesCheck";
import { INTENDED_USE } from "@/lib/intendedUse";
import { PeakTracker, measureFrame } from "@/lib/peakGum";
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
import { samTeethRobust, type SamTeeth } from "@/lib/samTeeth";
import { proposeOutline, PROPOSAL_LABEL, type Proposal } from "@/lib/proposedOutline";
import { segmentTeeth, renderTeeth, whitenInPlace, type TeethEngine, type ToothEdit, type ShapeOptions } from "@/lib/smileEngine";
import { jpegToPdf } from "@/lib/pdf";
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
    foundMouth: "Smile found.",
    retake: "Retake photo",
    levelOf: ["Very subtle", "Natural", "Fresh", "Bright", "Very bright"],
    optTitle: "Compare options",
    optWhiten: "Whitening",
    optWhitenHint: "Colour only",
    optBond: "Bonding",
    optBondHint: "Repairs edges, natural shine",
    optVeneer: "Veneers style",
    optVeneerHint: "Edges, alignment, sizes, bright",
    optRefused: "Bonding and veneers previews need a clear, sharp photo with separate teeth.",
    optNoOverlay: "The design overlay is not drawn on this photo. The previews above are colour and shape suggestions only.",
    natural_depth: "Natural depth",
    natural_depthHint: "Translucent edges, warmer necks",
    guides: "Show guides",
    guidesHint: "Midline and edge curve",
    guideLegend: "Cyan dashed: dental midline. White: smooth edge curve. Yellow: current edge line. Red: incisal edge. Blue: mesial side. Black: distal side. Cyan: cervical edge (only where gum shows). Pink dots: gum line (only where gum shows).",
    tapTeeth: "Tap a tooth to adjust it.",
    editTitle: "Adjust this tooth",
    longer: "Longer",
    shorter: "Shorter",
    wider: "Wider",
    narrower: "Narrower",
    turnL: "Turn left",
    turnR: "Turn right",
    resetTooth: "Reset tooth",
    done: "Done",
    replay: "Replay reveal",
    report: "Patient report (PDF)",
    reportShare: "Share report",
    tierA: "Preview confidence A: every check passed and enough clear teeth were found.",
    tierB: "Preview confidence B: usable with care. Some checks are borderline.",
    tierC: "Preview confidence C: a rough idea only. Do not rely on the shape tools.",
    clinician: "Clinician details",
    chipOk: "passed",
    chipNo: "not passed",
    teethFound: "Separate teeth found",
    outlineQ: "Outline quality",
    offline: "Works offline once installed (add to home screen).",
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
    n_close: "No whole face found, so the teeth were located by colour only. For a reliable result, step back until your whole face is in view, look straight at the camera and smile.",
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
    foundMouth: "تم إيجاد الابتسامة.",
    retake: "إعادة التقاط",
    levelOf: ["هادئ جداً", "طبيعي", "منتعش", "ناصع", "ناصع جداً"],
    optTitle: "خيارات المقارنة",
    optWhiten: "تبييض",
    optWhitenHint: "اللون فقط",
    optBond: "ترميم بالحشو التجميلي",
    optBondHint: "يصلح الحواف ويعطي لمعاناً طبيعياً",
    optVeneer: "نمط القشور",
    optVeneerHint: "الحواف والمحاذاة والأحجام والإشراق",
    optRefused: "معاينة الحشو التجميلي والقشور تحتاج صورة واضحة وحادة بأسنان منفصلة.",
    optNoOverlay: "لم يُرسم تصميم المحيطات على هذه الصورة. المعاينات أعلاه مجرد اقتراحات للون والشكل.",
    natural_depth: "عمق طبيعي",
    natural_depthHint: "حواف شفافة وعنق أدفأ",
    guides: "إظهار الخطوط الإرشادية",
    guidesHint: "خط المنتصف ومنحنى الحافة",
    guideLegend: "Cyan dashed: dental midline. White: smooth edge curve. Yellow: current edge line. Red: incisal edge. Blue: mesial side. Black: distal side. Cyan: cervical edge (only where gum shows). Pink dots: gum line (only where gum shows).",
    tapTeeth: "المس سناً لتعديله.",
    editTitle: "عدّل هذا السن",
    longer: "أطول",
    shorter: "أقصر",
    wider: "أعرض",
    narrower: "أضيق",
    turnL: "أدر لليسار",
    turnR: "أدر لليمين",
    resetTooth: "إعادة السن",
    done: "تم",
    replay: "إعادة العرض",
    report: "تقرير المريض (PDF)",
    reportShare: "مشاركة التقرير",
    tierA: "ثقة المعاينة A: نجحت كل الفحوص وتم العثور على عدد كافٍ من الأسنان الواضحة.",
    tierB: "ثقة المعاينة B: صالحة مع الحذر. بعض الفحوص حدّية.",
    tierC: "ثقة المعاينة C: فكرة تقريبية فقط. لا تعتمد على أدوات الشكل.",
    clinician: "تفاصيل للطبيب",
    chipOk: "نجح",
    chipNo: "لم ينجح",
    teethFound: "أسنان منفصلة تم العثور عليها",
    outlineQ: "جودة المحيط",
    offline: "يعمل دون اتصال بعد التثبيت (أضفه إلى الشاشة الرئيسية).",
    shapeTitle: "أدوات الشكل",
    smooth: "تنعيم الحواف",
    smoothHint: "يغلق التشوّهات والحواف غير المنتظمة",
    straighten: "تعديل الميلان",
    straightenHint: "يميل بالأسنان المائلة نحو الصف",
    balance: "موازنة الأحجام",
    balanceHint: "يكبّر الأسنان الصغيرة نحو جاراتها",
    shapeRefused: "أدوات الشكل متوقفة: لا توجد أسنان واضحة ومنفصلة بما يكفي في هذه الصورة لإعادة تشكيلها بأمانة.",
    relGood: "معاينة موثوقة",
    relGoodWhy: "حادة ومضاءة جيداً والأسنان ظاهرة بوضوح.",
    relLow: "معاينة منخفضة الثقة",
    relLowWhy: "اعتبرها فكرة تقريبية فقط. أعد التصوير للحصول على معاينة موثوقة:",
    rotate: "تدوير الصورة",
    live_ready: "جاهز. ثبّت الهاتف.",
    live_light: "نحتاج إضاءة أكثر.",
    live_dark: "الإضاءة قوية جداً أو ضعيفة جداً. غيّر الإضاءة.",
    live_blur: "ثبّت الهاتف. الصورة غير حادة.",
    live_teeth: "أظهر الأسنان: ابتسم أوسع أو اسحب الشفتين.",
    live_closer: "اقترب أكثر.",
    burstBtn: "التقاط أفضل ابتسامة",
    burstHint: "يلتقط تسلسلاً لمدة ثانيتين ويحتفظ بأفضل لقطة.",
    singleBtn: "صورة واحدة",
    bursting: "ابتسم! ثبّت الهاتف...",
    picking: "جارٍ اختيار أفضل لقطة...",
    caseId: "رقم الحالة",
    verified: "تم التحقق من الالتقاط",
    unverified: "التقاط منخفض الثقة",
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
// MediaPipe face mesh outer lip ring (upper lip left to right, then lower lip right to left)
const OUTER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
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
  face?: FaceGuides;
  /** outer lip ring from the face mesh (only when a whole face was found) */
  outerLip?: Pt[];
};

/** Lines worked out automatically from the 478 face landmarks. All in canvas pixels. */
type FaceGuides = {
  ipl: [Pt, Pt]; // pupil to pupil
  mid: [Pt, Pt]; // forehead point to chin, perpendicular drop used for display
  com: [Pt, Pt]; // mouth corner to mouth corner
  lipMid: Pt;
  comCantDeg: number; // commissure line angle relative to the eye line
  midOffsetPct: number; // mouth centre vs facial midline, % of mouth width (+ = patient's left)
};

function faceGuides(f: { x: number; y: number }[], w: number, h: number): FaceGuides {
  const P = (i: number): Pt => ({ x: f[i].x * w, y: f[i].y * h });
  const mean = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // iris centres when present (478 points), else the middle of each eye's corners
  const eyeR = f.length > 473 ? P(468) : mean(P(33), P(133));
  const eyeL = f.length > 473 ? P(473) : mean(P(263), P(362));
  const brow = mean(P(168), P(168));
  const chin = P(152);
  const cL = P(61);
  const cR = P(291);
  const ang = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const iplAng = ang(eyeR, eyeL);
  const comAng = ang(cL, cR);
  // facial midline: line through the bridge of the nose and the chin
  const lipMid = mean(P(13), P(14));
  const dx = chin.x - brow.x;
  const dy = chin.y - brow.y;
  const t = ((lipMid.x - brow.x) * dx + (lipMid.y - brow.y) * dy) / (dx * dx + dy * dy);
  const foot = { x: brow.x + t * dx, y: brow.y + t * dy };
  const mouthW = Math.hypot(cR.x - cL.x, cR.y - cL.y) || 1;
  const sign = Math.sign((lipMid.x - foot.x) * (cR.x - cL.x) + (lipMid.y - foot.y) * (cR.y - cL.y));
  return {
    ipl: [eyeR, eyeL],
    mid: [brow, chin],
    com: [cL, cR],
    lipMid,
    comCantDeg: comAng - iplAng,
    midOffsetPct: (sign * Math.hypot(lipMid.x - foot.x, lipMid.y - foot.y) * 100) / mouthW,
  };
}

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
      const outerLip = OUTER_LIP.map((i) => ({ x: f[i].x * w, y: f[i].y * h }));
      return { polygon, outerLip, auto: true, tiltDeg: tilt, face: faceGuides(f, w, h) };
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
  sam?: SamTeeth | null;
  /** lower-arch tooth boxes in full canvas px (analysis from the SAM pass) */
  lower?: { x0: number; x1: number; y0: number; y1: number }[];
};

function regrade(c: HTMLCanvasElement, analysis: Analysis, region: Region | null, inst?: Int32Array): Graded {
  const engine = region ? segmentTeeth(region, inst) : null;
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
  const kS = 640 / c.width;
  const sc640 = document.createElement("canvas");
  sc640.width = 640;
  sc640.height = Math.max(8, Math.round(c.height * kS));
  const sctx = sc640.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(c, 0, 0, sc640.width, sc640.height);
  const quality = evaluateCapture({
    sharpLuma: { luma: lumaOf(sc640), width: sc640.width, height: sc640.height },
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

/** One careful pass on the chosen frame: one mask per tooth (MobileSAM, zero-shot). Slow, so never run on live frames. */
/** Give up on a step that takes too long, so the screen never sticks on "Reading each tooth". */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}
const GRADE_LIMIT_MS = 25000;
const SAM_LIMIT_MS = 100000;

async function refineWithSam(g: Graded, onProgress?: (f: number) => void): Promise<Graded> {
  try {
    const c = g.c;
    // samTeethRobust retries a refused frame at 0.8x and 1.25x and, with no face ROI, inside an automatic tooth-colour ROI
    const k0 = Math.min(1, 1280 / Math.max(c.width, c.height));
    let sc = c;
    if (k0 < 1) {
      sc = document.createElement("canvas");
      sc.width = Math.round(c.width * k0);
      sc.height = Math.round(c.height * k0);
      sc.getContext("2d")!.drawImage(c, 0, 0, sc.width, sc.height);
    }
    let roi: { x: number; y: number; w: number; h: number } | null = null;
    if (!g.analysis.close) {
      const xs = g.analysis.polygon.map((p) => p.x * k0);
      const ys = g.analysis.polygon.map((p) => p.y * k0);
      const mw = Math.max(...xs) - Math.min(...xs);
      const mh = Math.max(...ys) - Math.min(...ys);
      roi = { x: Math.min(...xs) - mw * 0.1, y: Math.min(...ys) - mh * 0.3, w: mw * 1.2, h: mh * 1.6 };
    }
    const sam = await samTeethRobust(sc, roi, onProgress);
    const k = k0 * (sam?.scale ?? 1);
    if (!sam) return { ...g, sam: null };
    const region = buildRegion(c, g.analysis.polygon);
    if (!region) return { ...g, sam: null };
    const inst = new Int32Array(region.w * region.h);
    for (let y = 0; y < region.h; y++) {
      const sy = Math.min(sam.h - 1, Math.floor((y + region.y0) * k));
      for (let x = 0; x < region.w; x++) {
        const sx = Math.min(sam.w - 1, Math.floor((x + region.x0) * k));
        inst[y * region.w + x] = sam.labels[sy * sam.w + sx];
      }
    }
    const r = regrade(c, g.analysis, region, inst);
    if (r.engine && sam.upperRowSuspect) (r.engine as { rowSuspect?: boolean }).rowSuspect = true;
    const lower = sam.lowerBoxes.map((b) => ({ x0: b.x0 / k, x1: b.x1 / k, y0: b.y0 / k, y1: b.y1 / k }));
    return r.engine ? { ...r, sam, lower } : { ...g, sam: null };
  } catch (e) {
    console.warn("SAM unavailable:", e);
    samEngineFailed = true;
    return { ...g, sam: null };
  }
}

/** set when the tooth-reading engine threw (model load, wasm, memory): the photo is not at fault, so the notice must not tell the user to retake it */
let samEngineFailed = false;

async function sha256(c: HTMLCanvasElement): Promise<string> {
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
  if (!blob) return "";
  const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type PresetKey = "whiten" | "bonding" | "veneers";
const PRESETS: Record<PresetKey, { level: number; smooth: boolean; straighten: boolean; balance: boolean; enamel: boolean }> = {
  whiten: { level: 0.6, smooth: false, straighten: false, balance: false, enamel: false },
  bonding: { level: 0.4, smooth: true, straighten: false, balance: false, enamel: true },
  veneers: { level: 0.85, smooth: true, straighten: true, balance: true, enamel: true },
};

function paintAfter(
  o: HTMLCanvasElement,
  out: HTMLCanvasElement,
  region: Region | null,
  engine: TeethEngine | null,
  opt: ShapeOptions,
) {
  const hasEdits = !!opt.edits && Object.values(opt.edits).some((e) => e.len || e.wid || e.rot);
  if (engine && region && (opt.smooth || opt.straighten || opt.balance || opt.enamel || hasEdits)) {
    out.width = o.width;
    out.height = o.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(o, 0, 0);
    renderTeeth(engine, ctx, region.x0, region.y0, opt);
  } else renderAfter(o, out, region, opt.level);
}

/** Share of upper teeth with visible pink gum right above them. Lip is darker and redder, so only light, low-saturation pink counts. */
function gumVisibleShare(o: HTMLCanvasElement, region: Region, up: { cx: number; bw: number; by: number; bh: number }[]): number {
  const g = o.getContext("2d");
  if (!g || !up.length) return 0;
  let seen = 0;
  for (const t of up) {
    const h = Math.max(4, Math.round(t.bh * 0.2));
    const w = Math.max(4, Math.round(t.bw * 0.5));
    const x = Math.round(t.cx + region.x0 - w / 2), y = Math.round(t.by + region.y0 - h);
    if (x < 0 || y < 0 || x + w > o.width || y + h > o.height) continue;
    const d = g.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2], sat = (r - gg) / Math.max(1, r);
      if (r > 150 && sat > 0.18 && sat < 0.5 && b > gg * 0.8 && b < r) n++;
    }
    if (n / (w * h) > 0.35) seen++;
  }
  return seen / up.length;
}

function drawGuides(
  cv: HTMLCanvasElement,
  o: HTMLCanvasElement,
  region: Region | null,
  engine: TeethEngine | null,
  showGuides: boolean,
  selected: number | null,
  face?: FaceGuides | null,
  lower: { x0: number; x1: number; y0: number; y1: number }[] = [],
  lips: { inner: Pt[]; outer: Pt[] } | null = null,
  design: Proposal | null = null,
) {
  cv.width = o.width;
  cv.height = o.height;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, cv.width, cv.height);
  if (face) {
    const fl = Math.max(2, o.width / 500);
    const ext = (a: Pt, b: Pt, k: number): [Pt, Pt] => [
      { x: a.x - (b.x - a.x) * k, y: a.y - (b.y - a.y) * k },
      { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k },
    ];
    const line = (a: Pt, b: Pt, col: string) => {
      g.strokeStyle = col;
      g.lineWidth = fl;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    };
    const [i0, i1] = ext(face.ipl[0], face.ipl[1], 0.35);
    line(i0, i1, "rgba(226,232,240,0.85)");
    const [m0, m1] = ext(face.mid[0], face.mid[1], 0.25);
    line(m0, m1, "rgba(226,232,240,0.85)");
    const [c0, c1] = ext(face.com[0], face.com[1], 0.3);
    line(c0, c1, "rgba(252,211,77,0.95)");
  }
  if (!engine || !region) return;
  const lw = Math.max(2, o.width / 400);
  if (showGuides) {
    // one outline per tooth, plus each upper tooth's width as a share of the widest one
    const upAll = engine.teeth.filter((t) => t.incisalDown).sort((a, b) => a.cx - b.cx);
    const widest = Math.max(1, ...upAll.map((t) => t.bw));
    // legend (his): red incisal edge, blue mesial side (towards the midline), black distal side, cyan cervical edge (only where gum is visible)
    const midX = upAll.length ? upAll.map((t) => t.cx).sort((a, b) => a - b)[Math.floor(upAll.length / 2)] : 0;
    const gumSeen = gumVisibleShare(o, region, upAll) >= 0.5;
    for (const t of engine.teeth) {
      const W = t.own.width, H = t.own.height, a = t.own.data;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (a[(y * W + x) * 4 + 3] < 128) continue;
          const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || a[(y * W + x - 1) * 4 + 3] < 128 || a[(y * W + x + 1) * 4 + 3] < 128 || a[((y - 1) * W + x) * 4 + 3] < 128 || a[((y + 1) * W + x) * 4 + 3] < 128;
          if (!edge) continue;
          const fy = y / H, fx = x / W;
          const incisal = t.incisalDown ? fy > 0.86 : fy < 0.14;
          const cervical = t.incisalDown ? fy < 0.16 : fy > 0.84;
          if (cervical && !gumSeen) continue;
          const mesialRight = t.cx < midX;
          const mesial = fx > 0.5 === mesialRight;
          // his legend: red incisal, cyan cervical, blue mesial, black distal (distal gets a white halo so it shows on dark teeth and gums)
          g.fillStyle = incisal ? "#ef4444" : cervical ? "#22d3ee" : mesial ? "#3b82f6" : "#000000";
          const sz = Math.max(1, lw * 0.9);
          if (!incisal && !cervical && !mesial) { g.fillStyle = "rgba(255,255,255,0.8)"; g.fillRect(t.bx + x + region.x0 - 1, t.by + y + region.y0 - 1, sz + 2, sz + 2); g.fillStyle = "#000000"; }
          g.fillRect(t.bx + x + region.x0, t.by + y + region.y0, sz, sz);
        }
    }
    g.font = `600 ${Math.max(11, Math.round(o.width / 55))}px sans-serif`;
    g.textAlign = "center";
    for (const t of upAll) {
      const txt = `${Math.round((t.bw / widest) * 100)}%`;
      const x = t.cx + region.x0, y = t.by + t.bh + region.y0 + Math.max(14, o.width / 45);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.strokeText(txt, x, y);
      g.fillStyle = "#fff";
      g.fillText(txt, x, y);
    }
    const up = engine.teeth.filter((t) => t.incisalDown).sort((a, b) => a.cx - b.cx);
    if (up.length >= 3) {
      const pts = up.map((t) => ({ x: t.cx + region.x0, y: t.by + t.bh + region.y0 }));
      // least squares parabola y = a x^2 + b x + c
      const n = pts.length;
      let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
      const mx = pts.reduce((a, p) => a + p.x, 0) / n;
      for (const p of pts) {
        const x = p.x - mx;
        sx += x; sx2 += x * x; sx3 += x ** 3; sx4 += x ** 4; sy += p.y; sxy += x * p.y; sx2y += x * x * p.y;
      }
      // solve 3x3
      const M = [
        [sx4, sx3, sx2, sx2y],
        [sx3, sx2, sx, sxy],
        [sx2, sx, n, sy],
      ];
      for (let i = 0; i < 3; i++) {
        let piv = i;
        for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
        [M[i], M[piv]] = [M[piv], M[i]];
        if (Math.abs(M[i][i]) < 1e-9) continue;
        for (let k = 0; k < 3; k++) {
          if (k === i) continue;
          const f = M[k][i] / M[i][i];
          for (let c = i; c < 4; c++) M[k][c] -= f * M[i][c];
        }
      }
      const A = M[0][3] / M[0][0] || 0, B = M[1][3] / M[1][1] || 0, C = M[2][3] / M[2][2] || 0;
      g.lineWidth = lw;
      g.strokeStyle = "#fde047";
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
      g.strokeStyle = "#ffffff";
      g.setLineDash([lw * 4, lw * 3]);
      g.beginPath();
      const xa = pts[0].x - 10, xb = pts[pts.length - 1].x + 10;
      for (let x = xa; x <= xb; x += 6) {
        const y = A * (x - mx) ** 2 + B * (x - mx) + C;
        x === xa ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);
      // gum line only when gum is actually visible in this smile; hidden gum means no line and no guess
      if (gumVisibleShare(o, region, up) >= 0.5) {
      g.strokeStyle = "#f472b6";
      g.fillStyle = "#f472b6";
      g.lineWidth = lw;
      g.beginPath();
      up.forEach((t, i) => {
        const x = t.cx + region.x0, y = t.by + region.y0;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
      for (const t of up) {
        g.beginPath();
        g.arc(t.cx + region.x0, t.by + region.y0, lw * 2.2, 0, Math.PI * 2);
        g.fill();
      }
      }
    }
    // lip borders (orange): face-mesh lip rings, a real detection, drawn only when a whole face was found
    if (lips) {
      g.strokeStyle = "#f97316";
      g.lineWidth = lw;
      for (const ring of [lips.outer, lips.inner]) {
        g.beginPath();
        ring.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        g.closePath();
        g.stroke();
      }
    }
    // lower arch (analysis only): tooth edges from the lower-row boxes, drawn in the same legend. Edges within 6 px are merged. Incisal edge is the top of the box.
    if (lower.length >= 3 && upAll.length >= 3) {
      const xs = lower.flatMap((b) => [b.x0, b.x1]).sort((a, b) => a - b);
      const merged: number[] = [];
      let grp: number[] = [];
      for (const x of xs) {
        if (grp.length && x - grp[grp.length - 1] > 6) { merged.push(grp.reduce((a, b) => a + b, 0) / grp.length); grp = []; }
        grp.push(x);
      }
      if (grp.length) merged.push(grp.reduce((a, b) => a + b, 0) / grp.length);
      const ytop = lower.reduce((a, b) => a + b.y0, 0) / lower.length, ybot = lower.reduce((a, b) => a + b.y1, 0) / lower.length;
      g.lineWidth = lw;
      for (const b of lower) {
        const mesialLeft = (b.x0 + b.x1) / 2 > midX + region.x0;
        g.strokeStyle = mesialLeft ? "#3b82f6" : "#000000";
        g.beginPath(); g.moveTo(b.x0, b.y0 + (b.y1 - b.y0) * 0.1); g.lineTo(b.x0, b.y1 - (b.y1 - b.y0) * 0.15); g.stroke();
        g.strokeStyle = mesialLeft ? "#000000" : "#3b82f6";
        g.beginPath(); g.moveTo(b.x1, b.y0 + (b.y1 - b.y0) * 0.1); g.lineTo(b.x1, b.y1 - (b.y1 - b.y0) * 0.15); g.stroke();
        g.strokeStyle = "#ef4444";
        g.beginPath(); g.moveTo(b.x0, b.y0); g.lineTo(b.x1, b.y0); g.stroke();
      }
      void merged; void ytop; void ybot;
    }
    // dental midline between the two most central teeth
    const all = [...engine.teeth].sort((a, b) => a.cx - b.cx);
    if (all.length >= 2) {
      const med = all.reduce((a, t) => a + t.cx, 0) / all.length;
      let best = 0;
      for (let i = 0; i < all.length - 1; i++) {
        if (Math.abs((all[i].cx + all[i + 1].cx) / 2 - med) < Math.abs((all[best].cx + all[best + 1].cx) / 2 - med)) best = i;
      }
      const mxl = (all[best].cx + all[best + 1].cx) / 2 + region.x0;
      g.strokeStyle = "#22d3ee";
      g.lineWidth = lw;
      g.setLineDash([lw * 5, lw * 4]);
      g.beginPath();
      g.moveTo(mxl, region.y0);
      g.lineTo(mxl, region.y0 + region.h);
      g.stroke();
      g.setLineDash([]);
    }
  }
  if (design && design.ok) {
    // design layer: proposed outline per upper tooth (violet, white halo)
    for (const [col, wd] of [["rgba(255,255,255,0.9)", lw * 2.6], ["#c026d3", lw * 1.4]] as const) {
      g.strokeStyle = col;
      g.lineWidth = wd;
      g.lineJoin = "round";
      for (const tt of design.teeth) {
        g.beginPath();
        tt.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        if (tt.closed) g.closePath();
        g.stroke();
      }
    }
    // tag each tooth: ratio-filled teeth carry "ratio", traced ones "traced" (small, above the tooth)
    g.font = `bold ${Math.max(10, Math.round(o.width / 90))}px sans-serif`;
    g.textAlign = "center";
    for (const tt of design.teeth) {
      const ys = tt.pts.map((q) => q.y), xs = tt.pts.map((q) => q.x);
      g.fillStyle = tt.src === "ratio" ? "#fde047" : "#e9d5ff";
      const tw = Math.max(...xs) - Math.min(...xs);
      const word = g.measureText(tt.src).width <= tw * 0.95 ? tt.src : tt.src === "ratio" ? "R" : "T"; // narrow tooth: one letter (T traced, R ratio) so tags never overlap
      g.fillText(word, (Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys) - 3);
    }
  }
  if (selected !== null) {
    const t = engine.teeth.find((x) => x.id === selected);
    if (t) {
      g.strokeStyle = "#22d3ee";
      g.lineWidth = lw * 1.5;
      g.strokeRect(t.bx + region.x0 - 2, t.by + region.y0 - 2, t.bw + 4, t.bh + 4);
    }
  }
}

function tierOf(q: CaptureQuality | null, e: TeethEngine | null, closeUp = false): "A" | "B" | "C" {
  if ((e as { rowSuspect?: boolean } | null)?.rowSuspect) return "C";
  if (bracesSuspected(e)) return "C";
  if (!q || !q.acceptable) return "C";
  // visible decay or fracture-like dark patches: the shape tools assume sound crowns, so refuse them
  const fl = lesionFlags(e);
  if (fl.length >= 3 || fl.some((f) => f.level === "marked")) return "C";
  if (fl.length) return "B";
  // a mouth-only crop has no face to check viewing angle, midline or age of dentition against: never A
  if (!closeUp && e && e.teeth.length >= 6 && e.medianSolidity >= 0.92) return "A";
  return "B";
}

/** Teeth to mark "check": every tooth when braces are suspected, else the colour-flagged ones. Empty when the photo is plain. */
function checkTeeth(e: TeethEngine | null): number[] {
  if (!e) return [];
  if (bracesSuspected(e)) return e.teeth.map((t) => t.id);
  const fl = lesionFlags(e);
  return fl.length >= 3 || fl.some((f) => f.level === "marked") ? fl.map((f) => f.id) : [];
}
/** Photo checks passed (sharp, lit, teeth visible) but braces or decay flags made it tier C: draw the design with a CHECK banner instead of refusing. */
function checkMode(q: CaptureQuality | null, e: TeethEngine | null): boolean {
  return !!q && q.acceptable && checkTeeth(e).length > 0;
}

const RETAKE_TIPS: Record<Lang, Record<string, string>> = {
  en: {
    resolution: "The photo is too small to see the teeth. Use the phone's back camera and hold it about an arm's length away, so the whole smile fills the frame.",
    sharpness: "The photo is blurry. Hold the phone still with both hands, tap the teeth on the screen to focus, and wipe the lens.",
    exposure: "The light is too dark or too bright. Face a window or a lamp, and avoid flash and strong light from behind.",
    mouthVisibility: "The teeth are not clear. Smile wide so the upper teeth show, and look straight at the camera.",
  },
  ar: {
    resolution: "الصورة صغيرة جدا ولا تظهر الأسنان بوضوح. استخدم الكاميرا الخلفية وأبقها على بعد ذراع تقريبا ليملأ الابتسام الإطار.",
    sharpness: "الصورة غير واضحة. ثبّت الهاتف بكلتا اليدين، المس الأسنان على الشاشة للتركيز، وامسح العدسة.",
    exposure: "الإضاءة ضعيفة أو قوية جدا. واجه نافذة أو مصباحا وتجنب الفلاش والضوء من الخلف.",
    mouthVisibility: "الأسنان غير واضحة. ابتسم ابتسامة واسعة لتظهر الأسنان العليا وانظر مباشرة إلى الكاميرا.",
  },
};

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
  const [engineDown, setEngineDown] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [engine, setEngine] = useState<TeethEngine | null>(null);
  const [lowerBoxes, setLowerBoxes] = useState<{ x0: number; x1: number; y0: number; y1: number }[]>([]);
  const [quality, setQuality] = useState<CaptureQuality | null>(null);
  const [smooth, setSmooth] = useState(false);
  const [straighten, setStraighten] = useState(false);
  const [balance, setBalance] = useState(false);
  const [enamel, setEnamel] = useState(false);
  const [edits, setEdits] = useState<Record<number, ToothEdit>>({});
  const [sel, setSel] = useState<number | null>(null);
  const [showGuides, setShowGuides] = useState(false);
  const [showDetect, setShowDetect] = useState(false); // detected structure lines: advanced, off by default
  const [designNote, setDesignNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [showFace, setShowFace] = useState(true);
  const [preset, setPreset] = useState<PresetKey | null>(null);
  const [thumbs, setThumbs] = useState<Partial<Record<PresetKey, string>>>({});
  const [photoVersion, setPhotoVersion] = useState(0);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const revealed = useRef(0);
  const [live, setLive] = useState<{ ok: boolean; text: string } | null>(null);
  const [burstMsg, setBurstMsg] = useState("");
  const [caseId, setCaseId] = useState("");
  const runRef = useRef(0); // bumped by every new analysis and by Back, so a cancelled analysis cannot pull the user forward
  const sourceRef = useRef<"file" | "camera-single" | "camera-burst">("file");
  // merged neighbours (very wide blobs) or slivers (very flat blobs) mean the outlines are not real single teeth
  const shapesPlausible = !!engine && engine.teeth.every((t) => t.bw / t.bh <= 1.3 && t.bw / t.bh >= 0.2) && Math.max(...engine.teeth.map((t) => t.area)) <= 2.2 * engine.medianArea;
  const rowSuspect = !!(engine as { rowSuspect?: boolean } | null)?.rowSuspect;
  const shapeOk = !rowSuspect && !!engine && engine.teeth.length >= 4 && engine.medianSolidity >= 0.9 && shapesPlausible && !!quality && quality.signals.find((x) => x.id === "sharpness")!.ok;

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
    setLowerBoxes(g.lower ?? []);
    setQuality(g.quality);
    setSmooth(false);
    setStraighten(false);
    setBalance(false);
    setEnamel(false);
    setEdits({});
    setSel(null);
    setShowGuides(!!g.sam && (tierOf(g.quality, g.engine, !!g.analysis.close) !== "C" || checkMode(g.quality, g.engine))); // no lines on a frame the checks rejected
    setPreset("whiten");
    setPhotoVersion((v) => v + 1);
    setCaseId("");
    void sha256(g.c).then((h) => setCaseId(h.slice(0, 10)));
  }, []);

  const process = useCallback(
    async (c: HTMLCanvasElement) => {
      setBusy(true);
      setSaved(false);
      setMsg("");
      const myRun = ++runRef.current;
      try {
        let g = await withTimeout(gradeFrame(c), GRADE_LIMIT_MS);
        if (runRef.current !== myRun) return;
        setMsg("Reading each tooth...");
        let note = "";
        samEngineFailed = false;
        let live = true; // late progress from a run that timed out must not overwrite the notice
        try {
          g = await withTimeout(refineWithSam(g, (f) => { if (live) setMsg(`Reading each tooth... ${Math.round(f * 100)}%`); }), SAM_LIMIT_MS);
        } catch {
          live = false;
          // the detailed tooth reading took too long: keep the quick result, say so, and draw no design from it
          g = { ...g, sam: null };
          note = "The detailed tooth reading took too long, so only a quick estimate is shown and no design is drawn. Retake the photo closer and in better light, or try again.";
        }
        if (runRef.current !== myRun) return; // user went Back or started another photo: drop this result
        setEngineDown(samEngineFailed);
        if (samEngineFailed) note = "The tooth-reading engine could not start (check the connection and try again). This is not a problem with your photo, and no design is drawn.";
        apply(g);
        setMsg(note);
        setStep(2);
      } catch {
        if (runRef.current !== myRun) return;
        setMsg("This photo could not be read. Retake it, or choose a different photo. If it keeps happening, reload the page.");
        setStep(1);
      } finally {
        if (runRef.current === myRun) setBusy(false);
      }
    },
    [apply],
  );

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    sourceRef.current = "file";
    const url = URL.createObjectURL(f);
    try {
      const im = await loadImage(url);
      await process(toCanvas(im, im.naturalWidth, im.naturalHeight, 1280));
    } catch {
      setMsg("This file could not be opened as a photo. Choose a JPG or PNG photo, or use the camera.");
      setBusy(false);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const snap = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    sourceRef.current = "camera-single";
    const c = toCanvas(v, v.videoWidth, v.videoHeight, 1280);
    stopCamera();
    await process(c);
  };

  const burst = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const frames: HTMLCanvasElement[] = [];
    setBurstMsg(t.bursting);
    for (let i = 0; i < 10; i++) {
      frames.push(toCanvas(v, v.videoWidth, v.videoHeight, 1280));
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
    setMsg("Reading each tooth...");
    let live = true;
    let bestSam: Graded = best;
    let note = "";
    try {
      bestSam = await withTimeout(refineWithSam(best, (f) => { if (live) setMsg(`Reading each tooth... ${Math.round(f * 100)}%`); }), SAM_LIMIT_MS);
    } catch {
      live = false;
      bestSam = { ...best, sam: null };
      note = "The detailed tooth reading took too long, so only a quick estimate is shown and no design is drawn. Retake the photo closer and in better light, or try again.";
    }
    setMsg(note);
    apply(bestSam);
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

  const burstRef = useRef<() => Promise<void>>(async () => {});
  burstRef.current = burst;

  /** Watch the smile for up to 8 s, keep the natural frame with the most gum showing, then run the design on it. */
  const trackPeak = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBurstMsg("Smile naturally, hold it...");
    const tr = new PeakTracker<HTMLCanvasElement>();
    let prev: Uint8Array | null = null;
    const t0 = Date.now();
    try {
      const lm = await getLandmarker();
      while (Date.now() - t0 < 8000 && !tr.done) {
        const small = toCanvas(v, v.videoWidth, v.videoHeight, 640);
        const f = lm.detect(small)?.faceLandmarks?.[0];
        if (f && f.length > 400) {
          const r = measureFrame(small, f, prev);
          prev = r.small;
          tr.add(r.m, () => toCanvas(v, v.videoWidth, v.videoHeight, 1280));
        }
        await new Promise((r) => setTimeout(r, 60));
      }
    } catch (e) {
      console.warn("peak tracker unavailable, using burst", e);
    }
    const pick = tr.pick;
    if (!pick) return burstRef.current();
    stopCamera();
    setBusy(true);
    setBurstMsg("");
    sourceRef.current = "camera-burst";
    setSaved(false);
    setMsg("Reading each tooth...");
    const g = await gradeFrame(pick.frame);
    const withSam = await refineWithSam(g, (x) => setMsg(`Reading each tooth... ${Math.round(x * 100)}%`));
    const rg = tr.range;
    setMsg("");
    apply(withSam);
    console.info("[peak] gum ratio of picked frame (median of 5)", pick.ratio.toFixed(2), "range seen", rg?.map((x) => x.toFixed(2)).join("-"), "natural frames", tr.natural);
    setBusy(false);
    setStep(2);
  };
  const trackRef = useRef<() => Promise<void>>(async () => {});
  trackRef.current = trackPeak;

  /* live capture gate */
  useEffect(() => {
    if (!cameraOn) {
      setLive(null);
      return;
    }
    let stop = false;
    let running = false;
    let prev: Uint8Array | null = null;
    let steady = 0;
    const tick = async () => {
      const v = videoRef.current;
      if (stop || running || !v || !v.videoWidth) return;
      running = true;
      try {
        const g = await gradeFrame(toCanvas(v, v.videoWidth, v.videoHeight, 640));
        if (stop) return;
        // the live check runs on a 640 px copy; judge resolution on the real video size instead
        const resOk = Math.min(v.videoWidth, v.videoHeight) >= 480;
        // the fast colour pass miscounts single teeth on live frames; trust the share of tooth-coloured pixels in the mouth instead
        const teethSeen = !!g.region && g.region.toothShare >= (g.analysis.close ? 0.02 : 0.12);
        const bad = g.quality.signals.find((x) => !x.ok && !(x.id === "resolution" && resOk) && !(x.id === "sharpness" && Number(x.value) >= 15) && !(x.id === "mouthVisibility" && teethSeen && x.value >= 0.08));
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
        if (localStorage.getItem("dbgLive")) console.info("[live]", g.quality.signals.map((x) => `${x.id}:${x.ok ? "ok" : "NO"}(${Number(x.value).toFixed(2)})`).join(" "), `teeth=${g.engine?.teeth.length ?? 0} share=${g.region?.toothShare.toFixed(3)}`);
        // steadiness: mean brightness change on a tiny copy of two frames in a row
        const sm = document.createElement("canvas");
        sm.width = 48;
        sm.height = 36;
        sm.getContext("2d")!.drawImage(g.c, 0, 0, 48, 36);
        const px = sm.getContext("2d")!.getImageData(0, 0, 48, 36).data;
        const cur = new Uint8Array(48 * 36);
        for (let i = 0; i < cur.length; i++) cur[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        let diff = 99;
        if (prev) {
          diff = 0;
          for (let i = 0; i < cur.length; i++) diff += Math.abs(cur[i] - prev[i]);
          diff /= cur.length;
        }
        prev = cur;
        const still = diff < 5;
        steady = !bad && still ? steady + 1 : 0;
        setLive({ ok: !bad && still, text: !bad && !still ? "Hold still..." : text });
        // good frame held steady for three checks in a row: capture by itself
        if (steady >= 3) {
          steady = 0;
          stop = true;
          void trackRef.current();
        }
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
    paintAfter(o, afterRef.current, region, engine, { level, smooth, straighten, balance, enamel, edits });
    let design: Proposal | null = null;
    if (engine && region && showGuides) {
      const upT = engine.teeth.filter((t) => t.incisalDown);
      design = rowSuspect
        ? { ok: false, reason: "The tool may have picked up the lower front teeth instead of the upper ones, because another tooth-sized shape sits above the teeth it found. No design is drawn. Retake with the upper front teeth fully visible and in focus, or check the upper teeth by eye." }
        : !shapeOk
        ? { ok: false, reason: "The teeth are not clear and separate enough to draw a design honestly (damaged, merged or crowded outlines). No design is drawn." }
        : proposeOutline(upT, region, gumVisibleShare(o, region, upT) >= 0.5, true, analysis && !analysis.close && analysis.outerLip ? analysis.polygon : null, checkTeeth(engine));
      if (design.ok && checkMode(quality, engine)) design = { ...design, notes: ["CHECK: braces or possible decay were flagged on this photo, so outlines on the marked teeth are less reliable. Verify each marked tooth clinically before using the design. Decay flags: " + INVESTIGATIONAL.en + " " + INVESTIGATIONAL.ar, ...design.notes] };
      if (design.ok && analysis?.close) design = { ...design, notes: ["No face in frame: the facial midline and lips were not checked, so the dental midline is used as the reference.", ...design.notes] };
    } else if (engine && region && (engine as { rowSuspect?: boolean }).rowSuspect) design = { ok: false, reason: "The tool may have picked up the lower front teeth instead of the upper ones, because another tooth-sized shape sits above the teeth it found. No design is drawn. Retake with the upper front teeth fully visible and in focus, or check the upper teeth by eye." };
    else if (engine && region) design = { ok: false, reason: "The photo checks did not pass, so no design is drawn." };
    const dn = design ? (design.ok ? { ok: true, text: design.notes.join(" ") } : { ok: false, text: design.reason }) : null;
    setDesignNote((p) => (p && dn && p.ok === dn.ok && p.text === dn.text ? p : dn));
    if (guideRef.current) drawGuides(guideRef.current, o, region, engine, showDetect, sel, showFace ? analysis?.face : null, lowerBoxes, analysis && !analysis.close && analysis.outerLip ? { inner: analysis.polygon, outer: analysis.outerLip } : null, design);
    if (guideRef.current && engine && region && design && design.ok && checkMode(quality, engine)) {
      const g2 = guideRef.current.getContext("2d");
      const ids = new Set(checkTeeth(engine));
      if (g2) {
        g2.font = `bold ${Math.max(12, Math.round(o.width / 70))}px sans-serif`;
        g2.fillStyle = "#facc15";
        g2.textAlign = "center";
        for (const t of engine.teeth) if (ids.has(t.id)) g2.fillText(g2.measureText("check").width <= t.bw * 0.95 ? "check" : "!", t.bx + region.x0 + t.bw / 2, t.by + region.y0 - 4);
      }
    }
  }, [step, region, level, hasPhoto, engine, smooth, straighten, balance, enamel, edits, showGuides, sel, showFace, analysis, lowerBoxes, showDetect, shapeOk, quality]);

  /* option previews (whitening / bonding / veneers style) */
  useEffect(() => {
    const o = originalRef.current;
    if (step !== 2 || !o || !region) return;
    const next: Partial<Record<PresetKey, string>> = {};
    const tmp = document.createElement("canvas");
    (Object.keys(PRESETS) as PresetKey[]).forEach((k) => {
      if (k !== "whiten" && !shapeOk) return;
      paintAfter(o, tmp, region, engine, { ...PRESETS[k] });
      next[k] = thumb(tmp, 360);
    });
    setThumbs(next);
  }, [step, region, engine, shapeOk, photoVersion]);

  const choosePreset = (k: PresetKey) => {
    const pz = PRESETS[k];
    setLevel(pz.level);
    setSmooth(pz.smooth);
    setStraighten(pz.straighten);
    setBalance(pz.balance);
    setEnamel(pz.enamel);
    setEdits({});
    setSel(null);
    setPreset(k);
  };

  /* animated reveal */
  const playReveal = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setSplit(50);
      return;
    }
    const t0 = performance.now();
    const dur = 1600;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setSplit(100 - e * 50);
      if (p < 1) requestAnimationFrame(tick);
    };
    setSplit(100);
    requestAnimationFrame(tick);
  }, []);
  useEffect(() => {
    if (step === 2 && hasPhoto && revealed.current !== photoVersion) {
      revealed.current = photoVersion;
      const id = setTimeout(playReveal, 350);
      return () => clearTimeout(id);
    }
  }, [step, hasPhoto, photoVersion, playReveal]);

  const dragMoves = useRef(false);
  const toothAt = (e: React.PointerEvent<HTMLDivElement>): number | null => {
    const o = originalRef.current;
    if (!o || !engine || !region || !shapeOk) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * o.width - region.x0);
    const y = Math.round(((e.clientY - r.top) / r.height) * o.height - region.y0);
    for (const t of [...engine.teeth].sort((a, b) => a.area - b.area)) {
      const lx = x - t.bx;
      const ly = y - t.by;
      if (lx < 0 || ly < 0 || lx >= t.bw || ly >= t.bh) continue;
      if (t.own.data[(ly * t.bw + lx) * 4 + 3] > 100) return t.id;
    }
    return null;
  };
  const bump = (k: keyof ToothEdit, d: number) => {
    if (sel === null) return;
    setPreset(null);
    setEdits((m) => {
      const cur = m[sel] ?? { len: 0, wid: 0, rot: 0 };
      return { ...m, [sel]: { ...cur, [k]: Math.max(-6, Math.min(6, cur[k] + d)) } };
    });
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

  const tier = tierOf(quality, engine, !!analysis?.close);
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
    x.fillText(`${quality?.acceptable ? "Capture verified" : "Low-confidence capture"} (confidence ${tier})  |  Consent recorded${caseId ? "  |  Case " + caseId : ""}`, 18, h + 72);
    return c;
  };

  const coverDraw = (x: CanvasRenderingContext2D, im: CanvasImageSource, iw: number, ih: number, dx: number, dy: number, dw: number, dh: number) => {
    const sc = Math.max(dw / iw, dh / ih);
    const sw = dw / sc;
    const sh = dh / sc;
    x.save();
    x.beginPath();
    x.roundRect(dx, dy, dw, dh, 18);
    x.clip();
    x.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh);
    x.restore();
  };

  const wrap = (x: CanvasRenderingContext2D, text: string, mx: number, y: number, maxW: number, lh: number): number => {
    const words = text.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (x.measureText(test).width > maxW && line) {
        x.fillText(line, mx, y);
        y += lh;
        line = w;
      } else line = test;
    }
    if (line) {
      x.fillText(line, mx, y);
      y += lh;
    }
    return y;
  };

  const buildReport = async (): Promise<HTMLCanvasElement | null> => {
    const o = originalRef.current;
    const a = afterRef.current;
    if (!o || !a) return null;
    const W = 1240, H = 1754, M = 70;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d")!;
    const rtl = lang === "ar"; // Arabic report: right-aligned, right-to-left canvas text. English stays the default and is unchanged.
    const L = (en: string, ar: string) => (rtl ? ar : en);
    const ax = (px: number) => (rtl ? W - px : px);
    const align = () => { x.direction = rtl ? "rtl" : "ltr"; x.textAlign = rtl ? "right" : "left"; };
    align();
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, W, H);
    x.fillStyle = "#0b1220";
    x.fillRect(0, 0, W, 170);
    x.fillStyle = "#ffffff";
    x.font = "bold 54px sans-serif";
    x.fillText(L("Your smile preview", "معاينة ابتسامتك"), ax(M), 85);
    x.font = "28px sans-serif";
    x.fillStyle = "#67e8f9";
    const clinic = clinicName();
    x.fillText(`${clinic || L("Dental clinic", "عيادة الأسنان")}  |  ${new Date().toLocaleDateString(rtl ? "ar-EG" : undefined)}`, ax(M), 135);
    x.fillStyle = "#0f172a";
    x.font = "bold 34px sans-serif";
    x.fillText(name.trim() || L("Patient", "المريض"), ax(M), 235);

    const iw = (W - M * 2 - 30) / 2;
    const ih = 470;
    coverDraw(x, o, o.width, o.height, rtl ? M + iw + 30 : M, 265, iw, ih); // Arabic reads right to left: before on the right
    coverDraw(x, a, a.width, a.height, rtl ? M : M + iw + 30, 265, iw, ih);
    x.font = "bold 26px sans-serif";
    x.fillStyle = "#ffffff";
    const bx0 = rtl ? M + iw + 30 + 14 : M + 14, ax0 = rtl ? M + 14 : M + iw + 44;
    x.fillRect(bx0, 279, 120, 40);
    x.fillRect(ax0, 279, 100, 40);
    x.fillStyle = "#0f172a";
    if (rtl) { x.textAlign = "center"; x.fillText("قبل", bx0 + 60, 308); x.fillText("بعد", ax0 + 50, 308); align(); }
    else { x.fillText("Before", M + 26, 308); x.fillText("After", M + iw + 58, 308); }

    let y = 265 + ih + 50;
    const optImgs: [string, string | undefined][] = [
      [L("Whitening", "تبييض"), thumbs.whiten],
      [L("Bonding", "ترميم بالحشو التجميلي"), thumbs.bonding],
      [L("Veneers style", "نمط القشور"), thumbs.veneers],
    ];
    if (thumbs.bonding && thumbs.veneers) {
      x.fillStyle = "#0f172a";
      x.font = "bold 30px sans-serif";
      x.fillText(L("Options we can discuss", "خيارات يمكننا مناقشتها"), ax(M), y);
      y += 24;
      const ow = (W - M * 2 - 40) / 3;
      const oh = 250;
      for (let i = 0; i < 3; i++) {
        const [label, src] = optImgs[i];
        if (!src) continue;
        const im = await loadImage(src);
        const col = rtl ? 2 - i : i;
        coverDraw(x, im, im.width, im.height, M + col * (ow + 20), y, ow, oh);
        x.fillStyle = "#0f172a";
        x.font = "bold 24px sans-serif";
        x.fillText(label, M + col * (ow + 20) + (rtl ? ow : 0), y + oh + 34);
      }
      y += 250 + 80;
    }

    x.fillStyle = "#0f172a";
    x.font = "bold 30px sans-serif";
    x.fillText(L("What we see", "ما نراه"), ax(M), y);
    y += 40;
    x.font = "26px sans-serif";
    x.fillStyle = "#334155";
    for (const n of notes) y = wrap(x, "• " + n, ax(M), y, W - M * 2, 36);

    // record box
    const by = Math.max(y + 30, 1230);
    const flagLine = engine && bracesSuspected(engine)
      ? L("Flag for the dentist: braces or brackets look present, outlines are less reliable.", "تنبيه للطبيب: يبدو أن هناك تقويماً أو حاصرات على الأسنان، والمحيطات عليها أقل موثوقية.")
      : engine && lesionFlags(engine).length
        ? L(`Flag for the dentist: colour prompt on ${lesionFlags(engine).length} ${lesionFlags(engine).length === 1 ? "tooth" : "teeth"} (possible decay or stain), not a diagnosis. ${INVESTIGATIONAL.en}`, `تنبيه للطبيب: إشارة لونية على ${lesionFlags(engine).length} ${lesionFlags(engine).length === 1 ? "سن" : "أسنان"} (تسوس محتمل أو تصبغ)، وليست تشخيصاً. ${INVESTIGATIONAL.ar}`)
        : "";
    x.fillStyle = "#f1f5f9";
    x.beginPath();
    x.roundRect(M, by, W - M * 2, 270 + (flagLine ? 38 : 0), 18);
    x.fill();
    x.fillStyle = "#0f172a";
    x.font = "bold 28px sans-serif";
    x.fillText(L("Case record", "سجل الحالة"), ax(M + 28), by + 48);
    x.font = "24px sans-serif";
    x.fillStyle = "#334155";
    const used = (rtl ? [smooth && "تنعيم الحواف", straighten && "تعديل الميلان", balance && "موازنة الأحجام", enamel && "عمق طبيعي", Object.keys(edits).length ? "تعديلات على الأسنان" : ""] : [smooth && "smooth edges", straighten && "straighten", balance && "balance sizes", enamel && "natural depth", Object.keys(edits).length ? "tooth adjustments" : ""]).filter(Boolean).join(rtl ? "، " : ", ") || L("whitening only", "تبييض فقط");
    const consentDate = consentAt.current ? new Date(consentAt.current).toLocaleString("ar-EG") : "";
    const lines = rtl ? [
      `الموافقة: أكد الطبيب موافقة المريض${consentDate ? " بتاريخ " + consentDate : ""}`,
      `التقاط الصورة: ${quality?.acceptable ? "اجتازت كل الفحوص" : "لم تجتز كل الفحوص، اعتبرها فكرة تقريبية"}. ثقة المعاينة ${tier}.`,
      `أدوات الشكل: ${shapeOk ? "متاحة لهذه الصورة" : engine && bracesSuspected(engine) ? "غير متاحة، توجد تقويمات أو حاصرات" : "غير متاحة، الصورة غير واضحة بما يكفي لإعادة تشكيل الأسنان بأمانة"}.`,
      ...(flagLine ? [flagLine] : []),
      `التعديلات المطبقة: ${used}. مستوى التبييض: ${levelWord}.`,
      `رقم الحالة ${caseId || "-"} | استوديو الابتسامة | مصدر الصورة: ${sourceRef.current}`,
    ] : [
      `Consent: patient agreement confirmed by the dentist${consentAt.current ? " on " + new Date(consentAt.current).toLocaleString() : ""}`,
      `Photo capture: ${quality?.acceptable ? "passed all checks" : "did not pass all checks, treat as a rough idea"}. Preview confidence ${tier}.`,
      `Shape tools: ${shapeOk ? "available for this photo" : engine && bracesSuspected(engine) ? "not offered, braces or brackets are present" : "not offered, the photo was not clear enough to reshape teeth honestly"}.`,
      ...(flagLine ? [flagLine] : []),
      `Edits applied: ${used}. Whitening level: ${levelWord.toLowerCase()}.`,
      `Case ID ${caseId || "-"} | Smile Studio engine 1 | Photo source: ${sourceRef.current}`,
    ];
    let ly = by + 88;
    for (const l of lines) ly = wrap(x, l, ax(M + 28), ly, W - M * 2 - 56, 34);

    x.fillStyle = "#64748b";
    x.font = "22px sans-serif";
    wrap(x, L("This is a visual preview made by software to help a conversation with your dentist. It is not a diagnosis and does not guarantee the final result. Your dentist reviews every result.", "هذه معاينة مرئية أعدّها برنامج لمساعدتك في الحوار مع طبيبك. وهي ليست تشخيصاً ولا تضمن النتيجة النهائية. يراجع طبيبك كل نتيجة."), ax(M), H - 100, W - M * 2, 30);
    return c;
  };

  const reportPdf = async (): Promise<Blob | null> => {
    const c = await buildReport();
    if (!c) return null;
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return null;
    return jpegToPdf(new Uint8Array(await blob.arrayBuffer()), c.width, c.height, "Smile preview report");
  };

  const downloadReport = async () => {
    const b = await reportPdf();
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smile-report-${caseId || Date.now()}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const shareReport = async () => {
    const b = await reportPdf();
    if (!b) return;
    const file = new File([b], "smile-report.pdf", { type: "application/pdf" });
    const nav: any = navigator;
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: t.preview });
      } catch {
        /* cancelled */
      }
    } else setMsg(t.shareFail);
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
          tier,
          option: preset,
          edits: { whiteningLevel: Math.round(level * 100) / 100, smooth, straighten, balance, enamel, tooth: edits },
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
  const bg = hc ? "bg-black text-white" : "bg-[#111827] text-slate-100";
  const card = hc ? "border-2 border-white bg-black" : "border border-white/15 bg-white/5";
  const muted = hc ? "text-white" : "text-slate-300";
  const btnBase =
    "min-h-[56px] px-6 rounded-2xl font-semibold inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-[0.98]";
  const primary = `${btnBase} ${hc ? "bg-amber-200 text-black" : "bg-sky-700 text-white hover:bg-sky-600"}`;
  const ghost = `${btnBase} ${hc ? "border-2 border-white text-white" : "border border-white/25 text-white hover:bg-white/10"}`;
  const iconBtn = `min-h-[44px] min-w-[44px] px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 ${
    hc ? "border-2 border-white" : "border border-white/20 hover:bg-white/10"
  }`;

  const Next = lang === "ar" ? ArrowLeft : ArrowRight;
  const Prev = lang === "ar" ? ArrowRight : ArrowLeft;
  const needRetake = step === 2 && !!quality && !quality.acceptable;
  const canNext = step === 0 ? consent : step === 2 ? true : false;

  return (
    <div className={`min-h-screen ${bg} ${fs}`} data-testid="studio">
      <header className="sticky top-0 z-20 backdrop-blur bg-black/40 border-b border-white/10 px-3 sm:px-6 pr-16 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 me-auto">
          <span className="w-10 h-10 rounded-xl bg-sky-300/20 border border-sky-300/40 text-sky-200 font-bold flex items-center justify-center">
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
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-40" id="main">
        {/* progress */}
        <nav aria-label={t.step(step + 1, 4)} className="mb-6">
          <ol className="flex items-center gap-2">
            {t.steps.map((s, i) => (
              <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
                <div
                  className={`h-2 rounded-full ${
                    i <= step ? (hc ? "bg-amber-200" : "bg-sky-300") : hc ? "bg-white/30" : "bg-white/15"
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
        {!busy && msg && (step === 1 || step === 2) && (
          <p role="alert" data-testid="notice" className="text-base text-amber-200 border border-amber-300/40 rounded-xl p-3 mb-3">{msg}</p>
        )}
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
                className="w-full min-h-[56px] rounded-xl px-4 bg-black/40 border-2 border-white/30 focus:border-sky-200 focus:outline-none text-white placeholder:text-slate-400"
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
                  className="mt-1 w-8 h-8 shrink-0 accent-sky-300"
                />
                <span className={muted}>{t.p1Consent}</span>
              </label>
              <p className={`mt-4 text-base ${muted}`}>{t.p1Assist}</p>
              {!consent && <p className="mt-3 text-base text-amber-200">{t.p1Need}</p>}
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
                    live?.ok ? "bg-emerald-300 text-black" : "bg-amber-200 text-black"
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
                <div className="mx-auto mb-4 w-12 h-12 rounded-full border-4 border-sky-200 border-t-transparent animate-spin" />
                {msg || t.reading}
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
              <p role="alert" className="text-amber-200">
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
                const hit: number | null = null;
                if (hit !== null) {
                  setSel(hit);
                  dragMoves.current = true;
                } else setFromPointer(e);
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
              <canvas
                ref={guideRef}
                aria-hidden
                className="absolute inset-0 w-full h-full pointer-events-none"
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
                <div className="relative w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg group-focus-visible:ring-4 ring-amber-200 font-bold">
                  ⇄
                </div>
              </div>
            </div>
            <p className={`text-base ${muted}`}>{t.drag}</p>
            {engineDown && (
              <p role="alert" data-testid="engine-down" className="text-base text-amber-200">The tooth-reading engine could not start (check the connection and try again). This is not a problem with your photo, so there is no need to retake it.</p>
            )}
            {designNote && (
              <p role="status" className={`text-base ${designNote.ok ? "text-fuchsia-200" : "text-amber-200"}`}>
                {designNote.ok ? `${PROPOSAL_LABEL} ${designNote.text}` : `No design drawn: ${designNote.text}`}
              </p>
            )}
            {designNote?.ok && !bracesSuspected(engine) && (
              <p className="text-sm text-amber-200" data-testid="braces-note">
                {lang === "ar" ? "قد لا يتم اكتشاف الحاصرات الشفافة أو الخزفية. إذا كان المريض يرتدي تقويماً، أعد التقاط الصورة بعد إزالته قبل استخدام أي تصميم." : "Clear or ceramic brackets are not always detected. If this patient wears braces, retake the photo after they are removed before using any design."}
              </p>
            )}
            {engine && (
              <label className={`flex items-center gap-2 text-base ${muted}`}>
                <input type="checkbox" checked={showDetect} onChange={(e) => setShowDetect(e.target.checked)} />
                {lang === "ar" ? "البنية المكتشفة (متقدم)" : "Detected structure (advanced)"}
              </label>
            )}

            {step === 2 && (
              <>
                {quality && (
                  <div
                    role="status"
                    className={`rounded-2xl p-4 border-2 ${
                      quality.acceptable
                        ? hc ? "border-white" : "border-emerald-300/70 bg-emerald-300/10"
                        : hc ? "border-amber-200" : "border-amber-200/80 bg-amber-200/10"
                    }`}
                  >
                    <p className="font-bold flex items-center gap-2">
                      {tier !== "C" ? (
                        <ShieldCheck className="w-6 h-6 text-emerald-300" aria-hidden />
                      ) : (
                        <span aria-hidden>⚠</span>
                      )}
                      {tier !== "C" ? t.relGood : t.relLow}
                      <span
                        className={`ms-auto rounded-full px-3 py-1 text-base font-bold ${
                          tier === "A" ? "bg-emerald-300 text-black" : tier === "B" ? "bg-amber-200 text-black" : "bg-red-300 text-black"
                        }`}
                      >
                        {tier}
                      </span>
                    </p>
                    <p className={`text-base ${muted}`}>{tier === "A" ? t.tierA : tier === "B" ? t.tierB : t.tierC}</p>
                    {!bracesSuspected(engine) && quality.acceptable && spacingNotes(engine).length > 0 && (
                      <p className={`text-base ${muted}`} data-testid="flag-spacing">
                        {spacingNotes(engine).some((n) => n.kind === "missing") ? "Possible missing tooth or a wide gap between two teeth. " : "Possible spacing between two teeth. "}
                        Geometry only, not validated. Verify clinically.
                      </p>
                    )}
                    {!bracesSuspected(engine) && quality.acceptable && lesionFlags(engine).length > 0 && (
                      <p className={`text-base ${muted}`} data-testid="flag-caries">
                        Possible caries on {lesionFlags(engine).length} {lesionFlags(engine).length > 1 ? "teeth" : "tooth"} (dark or brown patches). Not a diagnosis. Verify clinically. Colour only: stain, calculus or a dark filling look the same. <strong data-testid="flag-investigational">{INVESTIGATIONAL.en}</strong> <span dir="rtl" lang="ar">{INVESTIGATIONAL.ar}</span>
                      </p>
                    )}
                    {bracesSuspected(engine) ? (
                      <p className={`text-base ${muted}`} data-testid="flag-braces">Braces or brackets look present on the teeth. The colour flags assume plain enamel, so no decay flags are shown. Any design is marked CHECK and is less reliable on brackets. This is a caution, not a finding.</p>
                    ) : quality.acceptable && tier === "C" && rowSuspect ? (
                      <p className={`text-base ${muted}`}>The tool may have found the lower front teeth instead of the upper ones, so no design is drawn. Retake with the upper front teeth fully visible, or check them by eye.</p>
                    ) : quality.acceptable && tier === "C" ? (
                      <p className={`text-base ${muted}`}>The photo itself is fine, but dark patches suggest decay or damage. Any design is marked CHECK on those teeth because the shape tools assume sound crowns. <strong>{INVESTIGATIONAL.en}</strong> <span dir="rtl" lang="ar">{INVESTIGATIONAL.ar}</span></p>
                    ) : quality.acceptable ? (
                      <p className={`text-base ${muted}`}>{t.relGoodWhy}</p>
                    ) : (
                      <>
                        <p className={`text-base ${muted}`}>{t.relLowWhy}</p>
                        <ul className={`text-base list-disc ps-6 ${muted}`} data-testid="retake-tips">
                          {quality.signals.filter((x) => !x.ok).map((x) => (
                            <li key={x.id}>{RETAKE_TIPS[lang][x.id] ?? x.note}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <details className="mt-3">
                      <summary className="cursor-pointer font-semibold min-h-[44px] flex items-center">{t.clinician}</summary>
                      <ul className={`mt-2 space-y-1 text-base ${muted}`}>
                        {quality.signals.map((x) => (
                          <li key={x.id}>
                            {x.label}: {x.ok ? t.chipOk : t.chipNo}. {x.note}
                          </li>
                        ))}
                        <li>
                          {t.teethFound}: {engine ? engine.teeth.length : 0}
                        </li>
                        <li>
                          {t.outlineQ}: {engine ? Math.round(engine.medianSolidity * 100) + "%" : "-"}
                        </li>
                        <li>Shape tools: {shapeOk ? "enabled (at least 4 clear single teeth, outlines solid, photo sharp)" : "refused (needs at least 4 clear single teeth with no merged or sliver outlines, median outline quality 90% or more, and a sharp photo)"}</li>
                        <li>Measured values: {quality.signals.map((x) => `${x.label} ${Number.isFinite(x.value) ? Math.round(x.value * 10) / 10 : "-"}`).join(", ")}</li>
                        <li>Basis: 2D pixel analysis of this one photo. Not verified against measured clinical landmarks. The thresholds are not yet calibrated on real phone photos.</li>
                        <li>Use: a visual preview to talk with the patient. Not a diagnosis, and not a treatment plan.</li>
                        <li>
                          {t.caseId}: {caseId}
                        </li>
                      </ul>
                    </details>
                  </div>
                )}
                {engine && region && quality?.acceptable && (() => {
                  const fs = screen({ face: analysis?.face || null, teeth: engine.teeth, region });
                  const dot = (l: string) => (l === "check" ? "bg-red-400" : l === "note" ? "bg-amber-300" : "bg-emerald-400");
                  return (
                    <section className={`rounded-2xl p-5 space-y-2 ${card}`} data-testid="dentist-screen" aria-label="Screening for the dentist">
                      <h2 className="font-semibold">Screening for the dentist</h2>
                      <p className={`text-sm ${muted}`}>Measured on this one photo with no scale or depth. Cut-offs are not clinically validated. Prompts to look, not findings.</p>
                      <ul className="space-y-2">
                        {fs.map((f) => (
                          <li key={f.id} className="text-base" data-testid={`screen-${f.id}`}>
                            <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 align-baseline ${dot(f.level)}`} aria-hidden />
                            <span className="font-semibold">{f.label}: {f.value}</span>
                            <span className="sr-only"> ({f.level})</span>
                            <span className={`block text-sm ${muted}`}>{f.note}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })()}
                <div className={`rounded-2xl p-5 space-y-3 ${card}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="font-semibold">{t.optTitle}</h2>
                    <button className={iconBtn} onClick={playReveal}>
                      <RefreshCw className="w-4 h-4" aria-hidden />
                      {t.replay}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t.optTitle}>
                    {([
                      ["whiten", t.optWhiten, t.optWhitenHint],
                      ["bonding", t.optBond, t.optBondHint],
                      ["veneers", t.optVeneer, t.optVeneerHint],
                    ] as [PresetKey, string, string][]).map(([k, label, hint]) => {
                      const off = k !== "whiten" && !shapeOk;
                      const on = preset === k;
                      return (
                        <button
                          key={k}
                          role="radio"
                          aria-checked={on}
                          disabled={off}
                          onClick={() => choosePreset(k)}
                          className={`rounded-2xl overflow-hidden text-start focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:opacity-40 ${
                            on ? (hc ? "border-4 border-amber-200" : "border-4 border-sky-300") : hc ? "border-2 border-white" : "border-2 border-white/20"
                          }`}
                        >
                          <div className="aspect-[4/3] bg-black/40">
                            {thumbs[k] ? <img src={thumbs[k]} alt="" className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="p-2">
                            <p className="font-bold text-base">
                              {on && <Check className="inline w-4 h-4 me-1" aria-hidden />}
                              {label}
                            </p>
                            <p className="text-sm opacity-80">{hint}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!shapeOk && <p className="text-amber-200 text-base">{t.optRefused}</p>}
                  {shapeOk && designNote && !designNote.ok && <p className="text-amber-200 text-base" data-testid="opt-no-overlay">{t.optNoOverlay}</p>}
                </div>

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
                          className={`min-h-[64px] rounded-2xl font-bold text-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 ${
                            on
                              ? hc
                                ? "bg-amber-200 text-black"
                                : "bg-sky-700 text-white"
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
                </div>

                {!shapeOk && <p role="status" className="rounded-xl p-3 bg-amber-200 text-black font-semibold">{t.shapeRefused}</p>}

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
                <div className="grid sm:grid-cols-2 gap-3">
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
                  <button className={ghost} onClick={downloadReport} data-testid="report-pdf">
                    <Download className="w-5 h-5" aria-hidden />
                    {t.report}
                  </button>
                  <button className={ghost} onClick={shareReport}>
                    <Share2 className="w-5 h-5" aria-hidden />
                    {t.reportShare}
                  </button>
                </div>
                <p role="status" className="min-h-[1.5rem] text-emerald-300">
                  {msg}
                </p>
                <p className={`text-base ${muted}`}>{t.disclaimer}</p>
                <details className={`text-sm ${muted}`}>
                  <summary className="cursor-pointer underline underline-offset-2">Intended use and limits</summary>
                  <p className="mt-2 leading-relaxed">{INTENDED_USE}</p>
                </details>
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
            className={needRetake ? `${primary} flex-1` : ghost}
            disabled={step === 0}
            onClick={() => {
              runRef.current++; // cancels any analysis still running
              setBusy(false);
              stopCamera(); // leaving the photo step must switch the camera off
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
            <button className={needRetake ? `${ghost} flex-1` : `${primary} flex-1`} disabled={!canNext} onClick={() => setStep(step + 1)}>
              {t.next}
              <Next className="w-5 h-5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
