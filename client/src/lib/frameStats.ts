/** Frame-to-frame consensus for the camera capture: median and a robust spread (MAD x 1.4826), so one bad frame cannot move a number. */
export interface FrameSample { eyeDeg: number; comDeg: number; midPct: number; irisRel: number }
export interface Spread { med: number; sd: number }
export interface FrameStats { n: number; eye: Spread; com: Spread; mid: Spread; iris: Spread }

const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const spread = (a: number[]): Spread => { const m = med(a); return { med: m, sd: 1.4826 * med(a.map((v) => Math.abs(v - m))) }; };

export function summarizeFrames(samples: FrameSample[]): FrameStats | null {
  const s = samples.filter((x) => Object.values(x).every((v) => Number.isFinite(v)));
  if (s.length < 5) return null;
  return { n: s.length, eye: spread(s.map((x) => x.eyeDeg)), com: spread(s.map((x) => x.comDeg)), mid: spread(s.map((x) => x.midPct)), iris: spread(s.map((x) => x.irisRel)) };
}

export const EYE_SD_TOL_DEG = 2.5;
