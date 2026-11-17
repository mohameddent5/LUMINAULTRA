/**
 * Multi-frame consensus and data-quality gating.
 *
 * Why this module exists
 * ----------------------
 * A single video frame is a noisy measurement. Even with every value inside its
 * physiological bound, landmark jitter moves a metric by several millimetres
 * from frame to frame, and one bad frame used to be able to drag the whole
 * screening: a transient occlusion, a blink, a head roll. The result looked like
 * a spike in the readings and made the screening impossible to trust.
 *
 * Two independent defences are applied here, on top of the physiological gate in
 * physioBounds.ts:
 *
 *   1. Outlier rejection. For each metric the tracker keeps a sliding window of
 *      measured values. A median and a median-absolute-deviation are computed,
 *      and any frame further than 3.5 robust sigma from the median is discarded.
 *      A spike therefore cannot reach the report, no matter how extreme it is.
 *
 *   2. Consensus selection. The reported value is the accepted frame whose value
 *      is closest to the median, so the number shown is always a real measured
 *      frame rather than a synthesised average, and its band label, text and
 *      evidence grade stay internally consistent.
 *
 * The tracker also produces a ReportQuality summary. The composite score is
 * withheld when too few metrics could be measured, and the UI states plainly
 * whether the values are settled or provisional. A number nobody can defend is
 * worse than a stated "not measurable yet".
 */
import type { DsdReport, MetricQuality, MetricResult, ReportQuality } from "./dsd";
import { EVIDENCE_BY_ID, weightedHarmony } from "./dsdEvidence";
import { PHYSIO_BOUNDS } from "./physioBounds";

/** A metric value together with the frame it came from. */
interface Sample {
  value: number;
  metric: MetricResult;
}

/** Minimum plausible-value count before a score is allowed at all. */
export const MIN_METRICS_FOR_SCORE = 5;
/** Metrics needed for an unrestricted "ok" gate. */
export const MIN_METRICS_FOR_FULL_GATE = 8;

/** Median of a non-empty array. Returns null for an empty array. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (a === undefined || b === undefined) return null;
  return (a + b) / 2;
}

/**
 * Absolute tolerance below which a deviation is never treated as an outlier.
 * Derived from the metric's own physiological span so a 0.1 mm wiggle in a
 * 0-8 mm metric is not called a spike while a 4 mm jump is.
 */
function toleranceFor(id: string): number {
  const bound = PHYSIO_BOUNDS[id];
  if (!bound) return 0.5;
  return Math.max(0.15, (bound.max - bound.min) * 0.02);
}

export interface RobustEstimate {
  /** Accepted value closest to the median, or null when nothing was usable. */
  value: number | null;
  /** The frame that produced `value`. */
  metric: MetricResult | null;
  /** Samples that survived outlier rejection. */
  used: number;
  /** Samples discarded as outliers. */
  rejected: number;
  /** Robust 1-sigma spread (1.4826 x MAD) of the accepted samples. */
  spread: number | null;
}

/**
 * Robust estimate for one metric from a window of samples.
 *
 * With one sample there is nothing to compare against, so the sample is returned
 * as provisional: it is not rejected, and it is not called stable either.
 */
export function robustEstimate(samples: readonly Sample[], id: string, madK = 3.5): RobustEstimate {
  const values = samples.map((s) => s.value).filter((v) => Number.isFinite(v));
  if (samples.length === 0 || values.length === 0) {
    return { value: null, metric: null, used: 0, rejected: 0, spread: null };
  }
  if (samples.length === 1) {
    const only = samples[0];
    return { value: only?.value ?? null, metric: only?.metric ?? null, used: 1, rejected: 0, spread: null };
  }

  const centre = medianOf(values);
  if (centre === null) {
    const only = samples[0];
    return { value: only?.value ?? null, metric: only?.metric ?? null, used: 1, rejected: 0, spread: null };
  }

  const deviations = values.map((v) => Math.abs(v - centre));
  const mad = medianOf(deviations) ?? 0;
  const spread = 1.4826 * mad;
  const threshold = Math.max(madK * spread, toleranceFor(id));

  const accepted = samples.filter((s) => Number.isFinite(s.value) && Math.abs(s.value - centre) <= threshold);
  const rejected = samples.length - accepted.length;
  if (accepted.length === 0) {
    // Everything disagreed, which means the capture is unusable for this metric.
    return { value: null, metric: null, used: 0, rejected: samples.length, spread };
  }

  // Report a real measured frame: the accepted sample nearest the median.
  let best = accepted[0] as Sample;
  for (const s of accepted) {
    if (Math.abs(s.value - centre) < Math.abs(best.value - centre)) best = s;
  }
  return { value: best.value, metric: best.metric, used: accepted.length, rejected, spread };
}

export interface TrackerOptions {
  /** Frames retained per metric. 24 at ~10 Hz is about 2.4 s of consensus. */
  window?: number;
  /** Accepted samples needed before a metric is called settled. */
  minSamples?: number;
  /** Robust-sigma multiplier for outlier rejection. */
  madK?: number;
}

/**
 * Sliding-window consensus across frames.
 *
 * One instance per capture session. `add()` is called with every raw report;
 * `summarise()` turns the accumulated window into a stabilized report.
 */
export class MetricTracker {
  private readonly window: number;
  private readonly minSamples: number;
  private readonly madK: number;
  private history = new Map<string, Sample[]>();
  private frames = 0;

  constructor(options: TrackerOptions = {}) {
    this.window = Math.max(3, options.window ?? 24);
    this.minSamples = Math.max(2, options.minSamples ?? 5);
    this.madK = options.madK ?? 3.5;
  }

  /** Forget everything, e.g. when the subject leaves the frame or a new photo loads. */
  reset(): void {
    this.history = new Map();
    this.frames = 0;
  }

  /** Frames aggregated so far. */
  get framesSeen(): number {
    return this.frames;
  }

  /** Record one raw frame. Only plausible, available values are stored. */
  add(report: DsdReport): void {
    this.frames += 1;
    for (const metric of report.metrics) {
      if (metric.value === null || !metric.available || !Number.isFinite(metric.value)) continue;
      const samples = this.history.get(metric.id) ?? [];
      samples.push({ value: metric.value, metric });
      if (samples.length > this.window) samples.splice(0, samples.length - this.window);
      this.history.set(metric.id, samples);
    }
  }

  /** Samples currently held for a metric, for tests and diagnostics. */
  samplesFor(id: string): readonly Sample[] {
    return this.history.get(id) ?? [];
  }

  /**
   * Build the stabilized report: per-metric consensus, quality summary, and a
   * score that is withheld when the capture cannot support one.
   */
  summarise(raw: DsdReport): DsdReport {
    const perMetric: MetricQuality[] = [];
    const metrics: MetricResult[] = raw.metrics.map((metric) => {
      const samples = this.history.get(metric.id) ?? [];
      if (samples.length === 0) {
        perMetric.push({ samples: 0, rejected: 0, spread: null, stable: false });
        return metric;
      }
      const estimate = robustEstimate(samples, metric.id, this.madK);
      const stable = estimate.used >= this.minSamples;
      perMetric.push({
        samples: estimate.used,
        rejected: estimate.rejected,
        spread: estimate.spread,
        stable,
      });
      if (!estimate.metric || estimate.value === null) {
        // Every frame disagreed: report unavailable rather than a guess.
        return {
          ...metric,
          value: null,
          text: "n/a",
          band: "unavailable" as const,
          available: false,
          sigma: null,
          reason: `frames disagreed across ${samples.length} captures, so this value is not reportable`,
        };
      }
      return estimate.metric;
    });

    const available = metrics.filter((m) => m.available && m.value !== null);
    const stableMetrics = perMetric.filter((q, i) => q.stable && (metrics[i]?.available ?? false)).length;
    const provisionalMetrics = available.length - stableMetrics;
    const withheldMetrics = metrics.length - available.length;

    const reasons: string[] = [];
    let gate: ReportQuality["gate"] = "ok";

    if (this.frames < 3) {
      reasons.push(
        `Values come from ${this.frames === 1 ? "a single frame" : `${this.frames} frames`}, so they are provisional. ` +
          `Hold the smile steady for a moment to settle them.`,
      );
    }

    if (available.length < MIN_METRICS_FOR_SCORE) {
      gate = "insufficient";
      reasons.push(
        `Only ${available.length} of ${metrics.length} metrics could be measured on this capture. ` +
          `At least ${MIN_METRICS_FOR_SCORE} are needed before a composite score means anything, so no score is shown.`,
      );
    } else if (available.length < MIN_METRICS_FOR_FULL_GATE || this.frames < 3) {
      gate = "limited";
      if (available.length < MIN_METRICS_FOR_FULL_GATE) {
        reasons.push(
          `${available.length} of ${metrics.length} metrics were measurable; the score rests on fewer metrics than a full assessment uses.`,
        );
      }
    }

    const rejectedTotal = perMetric.reduce((sum, q) => sum + q.rejected, 0);
    if (rejectedTotal > 0) {
      reasons.push(
        `${rejectedTotal} outlying frame ${rejectedTotal === 1 ? "reading was" : "readings were"} discarded as unstable, so a single bad frame cannot move the result.`,
      );
    }

    // Recompute the score from the stabilized bands, never from the raw ones.
    const harmony = weightedHarmony(
      metrics.map((m) => ({ id: m.id, band: m.band })),
      raw.profile,
    );
    const score = gate === "insufficient" ? null : harmony.score;

    return {
      ...raw,
      metrics,
      score,
      scoreUsed: harmony.used,
      scoreExcluded: harmony.excluded,
      measured: available.length,
      notes: [...raw.notes, ...reasons],
      quality: {
        frames: this.frames,
        stableMetrics,
        provisionalMetrics,
        withheldMetrics,
        gate,
        reasons,
        perMetric,
      },
    };
  }
}

/** Human-readable one-liner for the quality badge. */
export function qualityLabel(quality: ReportQuality | null): string {
  if (!quality) return "single frame";
  if (quality.gate === "insufficient") return "not measurable yet";
  const settled = `${quality.stableMetrics} settled`;
  const provisional = quality.provisionalMetrics > 0 ? ` · ${quality.provisionalMetrics} provisional` : "";
  return `${settled}${provisional} · ${quality.frames} frames`;
}

/** Metrics that carry an evidence grade, for the audit panel. */
export function gradedMetricCount(report: DsdReport): number {
  return report.metrics.filter((m) => EVIDENCE_BY_ID.has(m.id) && m.available).length;
}
