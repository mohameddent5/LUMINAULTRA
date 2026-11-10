/**
 * Threshold evidence for smile-design metrics.
 *
 * Every number here is transcribed from `DSD_Metrics_Evidence_Paper.pdf`
 * (39 PubMed-indexed sources; abstracts only), which is the project's own
 * evidence review. Nothing in this file is invented: where the paper marks a
 * band edge as an extrapolation, `derived` is true and the UI must say so.
 *
 * Two consequences the paper is explicit about, and which the previous
 * implementation violated:
 *
 *   1. Golden proportion / RED proportion / golden percentage were NOT found in
 *      natural dentition (meta-analysis of 26 studies, 3,786 people, 12
 *      countries). They must never be pass/fail. They are report-only.
 *   2. The composite smile score must be weighted by the effect sizes in the
 *      paper's Section 3, not an equal average of every metric.
 *
 * Bands are configurable perception defaults, not diagnoses.
 */

export type EvidenceGrade = "high" | "moderate" | "low-moderate" | "low";
export type Band = "green" | "amber" | "red" | "report-only" | "unavailable";
export type ProfileId = "clinician" | "patient";

export interface BandRange {
  /** Values inside this inclusive interval are acceptable. */
  green: readonly [number, number];
  /** Values inside this inclusive interval warrant a review prompt. */
  amber: readonly [number, number];
  /** True when the paper marks this edge as the author's extrapolation. */
  derived?: boolean;
}

export interface EffectWeight {
  /** Standardised effect on attractiveness, laypeople (negative = penalised). */
  lay: number;
  /** Standardised effect, dental professionals. */
  dental: number;
}

export interface MetricEvidence {
  id: string;
  label: string;
  unit: "mm" | "deg" | "%" | "count" | "category";
  idealText: string;
  grade: EvidenceGrade;
  /** Reference indices into REFERENCES. */
  refs: readonly number[];
  note: string;
  /**
   * Effect size from the 1,040-rater study [16]. A zero weight means the paper
   * reports no effect size for this metric, so it is excluded from the score
   * rather than given an invented one.
   */
  weight: EffectWeight;
  bands: Record<ProfileId, BandRange | null>;
  /** Gingival display has a sex-specific amber edge in the dynamic study [3]. */
  sexBands?: { male: BandRange; female: BandRange };
  /** Report the value; no pass/fail band exists in the literature. */
  reportOnly?: boolean;
}

const range = (
  green: readonly [number, number],
  amber: readonly [number, number],
  derived = false,
): BandRange => ({ green, amber, derived });

export const EVIDENCE_TABLE: readonly MetricEvidence[] = [
  {
    id: "dental_midline_shift",
    label: "Dental midline shift vs facial midline",
    unit: "mm",
    idealText: "0 mm",
    grade: "high",
    refs: [9, 10, 1, 11, 12, 16],
    note: "Laypeople accept up to 3 mm [9]. Ratings stayed near the unaltered image at 1 and 2 mm and fell to 57.5 at 4 mm [10]. Specialists detect smaller shifts than general dentists, who detect smaller than laypeople [11][12].",
    weight: { lay: -0.37, dental: -0.49 },
    bands: {
      patient: range([0, 2], [0, 3]),
      clinician: range([0, 1.5], [0, 2.5], true),
    },
  },
  {
    id: "midline_cant",
    label: "Midline cant",
    unit: "deg",
    idealText: "0°",
    grade: "moderate",
    refs: [11, 16],
    note: "Midlines with 0-3.5° of cant were among the most appealing; tested up to 6.5° [11]. Cut-offs above 3.5° are the paper's extrapolation.",
    weight: { lay: -0.36, dental: -0.48 },
    bands: {
      patient: range([0, 3.5], [0, 5], true),
      clinician: range([0, 2.5], [0, 4], true),
    },
  },
  {
    id: "occlusal_plane_cant",
    label: "Occlusal plane cant vs interpupillary line",
    unit: "deg",
    idealText: "0°",
    grade: "moderate",
    refs: [14, 1, 15, 7, 16],
    note: "Scores dropped at 4° and 6° (tested 0, 2, 4, 6) [14]. Lay threshold range 0-4° [1]. Each 1 mm of cant lowered the rating by 3.6% [15].",
    weight: { lay: -0.36, dental: -0.49 },
    bands: {
      patient: range([0, 2], [0, 4]),
      clinician: range([0, 2], [0, 4]),
    },
  },
  {
    id: "commissural_cant",
    label: "Commissural line vs interpupillary line",
    unit: "deg",
    idealText: "0°",
    grade: "low-moderate",
    refs: [34, 17, 18, 16],
    note: "Celebrity best smiles averaged 0.97° vs 1.25° in dental students [34]. With a 3° canted commissure line, 59-61% of laypeople preferred an occlusal plane that follows it [17]. Small effect size [16].",
    weight: { lay: -0.15, dental: -0.17 },
    bands: {
      patient: range([0, 1], [0, 3], true),
      clinician: range([0, 1], [0, 3], true),
    },
  },
  {
    id: "gingival_display",
    label: "Gingival display at full smile",
    unit: "mm",
    idealText: "0 to -2 mm",
    grade: "high",
    refs: [2, 3, 4, 5, 6, 7],
    note: "Pooled lay acceptance +3 to -2.7 mm, median 0 mm (34 studies) [2]. Dynamic video study: acceptable to 3 mm in female and 1.5 mm in male smiles, steep drop after, rated very low above 6 mm [3]. 'Ugly' threshold 3 mm for dentists and 4 mm for non-professionals [4].",
    weight: { lay: -0.42, dental: -0.51 },
    bands: {
      patient: range([-2, 2], [-2, 3]),
      clinician: range([-2, 2], [-2, 3]),
    },
    sexBands: {
      male: range([-2, 1.5], [-2, 3]),
      female: range([-2, 2], [-2, 3]),
    },
  },
  {
    id: "incisor_display_rest",
    label: "Incisor display at rest",
    unit: "mm",
    idealText: "2-4 mm (young adult)",
    grade: "low",
    refs: [8],
    note: "A review states 2-4 mm of maxillary incisor edge at rest as reasonable [8]. Age and lip-length dependent; no threshold study was retrieved, so there is no amber or red band.",
    weight: { lay: -0.24, dental: -0.23 },
    reportOnly: true,
    bands: { patient: null, clinician: null },
  },
  {
    id: "smile_arc",
    label: "Smile arc",
    unit: "category",
    idealText: "Consonant",
    grade: "moderate",
    refs: [15, 5, 32, 33, 30, 31, 16],
    note: "A consonant arc raised the mean rating by 12.6% over inconsonant [15]. Inverted arc had the strongest negative effect [32]. Laypeople sometimes rate flat as equal or better [30][31].",
    weight: { lay: -0.09, dental: -0.21 },
    reportOnly: true,
    bands: { patient: null, clinician: null },
  },
  {
    id: "buccal_corridor",
    label: "Buccal corridor",
    unit: "%",
    idealText: "10-15% of smile width",
    grade: "low",
    refs: [14, 5, 37, 1, 36],
    note: "At 15% raters gave the highest scores; 5% and 25% drew the most visual attention [14]. Evidence is conflicting [5][37] and culture dependent [36]. The paper's instruction is to weight this low and raise no red flag.",
    weight: { lay: 0, dental: 0 },
    bands: {
      patient: range([10, 15], [5, 25]),
      clinician: range([10, 15], [5, 25]),
    },
  },
  {
    id: "visible_teeth",
    label: "Visible teeth in the smile",
    unit: "count",
    idealText: "Report only",
    grade: "low",
    refs: [34, 39],
    note: "Celebrity best smiles showed 12 teeth in 22.2% of cases vs 6.2% of students [34]. No threshold established.",
    weight: { lay: 0, dental: 0 },
    reportOnly: true,
    bands: { patient: null, clinician: null },
  },
  {
    id: "central_wl_ratio",
    label: "Central incisor width/length ratio",
    unit: "%",
    idealText: "80-85%",
    grade: "low-moderate",
    refs: [19, 20, 16],
    note: "Dentists and laypeople rated 85% (centrals) with 80% (laterals and canines) most esthetic [19]. Natural Saudi cast mean is about 89% [20]. The classic 75-80% is a convention, not what these studies found.",
    weight: { lay: -0.26, dental: -0.39 },
    bands: {
      patient: range([75, 85], [70, 90], true),
      clinician: range([75, 85], [70, 90], true),
    },
  },
  {
    id: "central_width_diff",
    label: "Left-right central incisor width difference",
    unit: "mm",
    idealText: "0 mm",
    grade: "moderate",
    refs: [10, 37, 20],
    note: "A single central incisor 2 mm off scored 45.5 vs 90.4 for the control; 1 mm spread across the arch scored 87.8 [10]. Unilateral change of a central was least attractive in all rater groups [37].",
    weight: { lay: 0, dental: 0 },
    bands: {
      patient: range([0, 1], [0, 2], true),
      clinician: range([0, 1], [0, 2], true),
    },
  },
  {
    id: "central_edge_height_diff",
    label: "Left-right central incisor edge height difference",
    unit: "mm",
    idealText: "0 mm",
    grade: "moderate",
    refs: [29, 16],
    note: "A central 0.5 mm shorter was one of only two asymmetries rated esthetic [29]. Incisor edge symmetry: medium effect in laypeople, large in the dental group [16].",
    weight: { lay: -0.46, dental: -0.54 },
    bands: {
      patient: range([0, 0.5], [0, 1], true),
      clinician: range([0, 0.5], [0, 1], true),
    },
  },
  {
    id: "gingival_margin_diff",
    label: "Left-right gingival margin difference, centrals",
    unit: "mm",
    idealText: "0 mm",
    grade: "moderate",
    refs: [28, 29, 16],
    note: "Laypeople and preclinical students noticed only 2 mm or more; specialists, dentists and clinical students were stricter at every level [28]. A 2 mm gingival migration of one central was still rated esthetic [29].",
    weight: { lay: -0.11, dental: -0.01 },
    bands: {
      patient: range([0, 1], [0, 2]),
      clinician: range([0, 1], [0, 2]),
    },
  },
  {
    id: "lateral_vs_central",
    label: "Lateral vs central incisor position",
    unit: "mm",
    idealText: "Edge 1 mm shorter; margin 1 mm coronal",
    grade: "low-moderate",
    refs: [27, 30],
    note: "All rater groups found a lateral gingival margin 1 mm coronal to the central, and a lateral edge 1 mm shorter, most attractive [27]. Equal margins scored 7.16 and a 1 mm difference 7.04, so the difference is trivial [30].",
    weight: { lay: 0, dental: 0 },
    bands: {
      patient: range([0, 1], [0, 2], true),
      clinician: range([0, 1], [0, 2], true),
    },
  },
  {
    id: "lateral_angulation",
    label: "Lateral incisor mesial angulation",
    unit: "deg",
    idealText: "10-15°",
    grade: "low",
    refs: [27],
    note: "Dentists and laypeople scored 10° and 15° highest; orthodontists scored 20° highest [27]. No amber or red band was established.",
    weight: { lay: 0, dental: 0 },
    bands: { patient: range([10, 20], [10, 20]), clinician: range([10, 20], [10, 20]) },
  },
  {
    id: "diastema",
    label: "Midline diastema",
    unit: "mm",
    idealText: "0 mm",
    grade: "high",
    refs: [1, 15, 16],
    note: "Lay threshold 0-2 mm [1]. Each 1 mm of diastema lowered the rating by 8.7% [15]. Large effect size in both lay and dental groups [16].",
    weight: { lay: -0.55, dental: -0.54 },
    bands: {
      patient: range([0, 0], [0, 2]),
      clinician: range([0, 0], [0, 2]),
    },
  },
  {
    id: "central_crown_length_error",
    label: "Central incisor crown length error",
    unit: "mm",
    idealText: "0 mm",
    grade: "low-moderate",
    refs: [4, 20],
    note: "The 'ugly' threshold for central incisor crown length change was 2.0 mm in both dentists and non-professionals [4]. Casts measure anatomic crown, not clinical crown [20].",
    weight: { lay: 0, dental: 0 },
    bands: {
      patient: range([0, 1], [0, 2], true),
      clinician: range([0, 1], [0, 2], true),
    },
  },
  {
    id: "lateral_central_width_ratio",
    label: "Lateral / central apparent width",
    unit: "%",
    idealText: "63-70% observed",
    grade: "low",
    refs: [20, 24, 25, 30],
    note: "Observed 63.7% in Saudi casts [20], 67-70% in Kenyans [24]. Golden 62% matched only 4.0% of Kenyans on one side [24]. An 80% ratio was rated more attractive than 62% and 70% [30].",
    weight: { lay: -0.09, dental: -0.1 },
    bands: {
      patient: range([62, 80], [62, 80]),
      clinician: range([62, 80], [62, 80]),
    },
  },
  {
    id: "canine_lateral_width_ratio",
    label: "Canine / lateral apparent width",
    unit: "%",
    idealText: "78-84% observed",
    grade: "low",
    refs: [20, 24, 25],
    note: "Observed 78.4% in Saudi casts [20], 82-84% in Kenyans [24], up to 78.5% in Gujarati students [25].",
    weight: { lay: -0.09, dental: -0.1 },
    bands: {
      patient: range([78, 84], [78, 84]),
      clinician: range([78, 84], [78, 84]),
    },
  },
  {
    id: "golden_percentage",
    label: "Golden percentage (central / lateral / canine)",
    unit: "%",
    idealText: "Report only",
    grade: "low",
    refs: [23, 24, 25, 26, 22],
    note: "The classic 25/15/10 was not found in a systematic review of 16 studies [23]. Observed 22/15/12 in Kenyans [24] and 22/16/12 in Gujarati students [25]. Reported for interest only, never as a target.",
    weight: { lay: 0, dental: 0 },
    reportOnly: true,
    bands: { patient: null, clinician: null },
  },
] as const;

export const EVIDENCE_BY_ID: ReadonlyMap<string, MetricEvidence> = new Map(
  EVIDENCE_TABLE.map((metric) => [metric.id, metric]),
);

export interface Reference {
  id: number;
  title: string;
  pmid: string;
  doi?: string;
}

/** Reference list as transcribed from the paper. */
export const REFERENCES: readonly Reference[] = [
  { id: 1, title: "Laypeople's perceptions of frontal smile esthetics: a systematic review (66 studies)", pmid: "27871700", doi: "10.1016/j.ajodo.2016.06.022" },
  { id: 2, title: "Threshold of acceptability of excessive gingival display by laypersons: systematic review (34 studies)", pmid: "35587001" },
  { id: 3, title: "Influence of maxillary gingival display on perception of smile aesthetics (dynamic video)", pmid: "41604296", doi: "10.1177/14653125251412487" },
  { id: 4, title: "Perceptions of dentists and non-professionals on dental factors affecting smile aesthetics (Vietnam)", pmid: "32138374", doi: "10.3390/ijerph17051638" },
  { id: 5, title: "Perception of altered smile esthetics including buccal corridor, gingival display and smile arc", pmid: "41846774", doi: "10.4103/jpbs.jpbs_551_25" },
  { id: 6, title: "Perception of smile attractiveness based on upper dental midline shift and gingival display", pmid: "41536395", doi: "10.7759/cureus.99173" },
  { id: 7, title: "Impact of occlusal plane cant along with gingival display on smile attractiveness", pmid: "26856663", doi: "10.1111/ocr.12118" },
  { id: 8, title: "Functional Aesthetic Occlusal Plane (FAOP)", pmid: "27653271", doi: "10.1590/2177-6709.21.4.114-125.sar" },
  { id: 9, title: "Impact of midline deviation on smile attractiveness among laypersons", pmid: "40134997", doi: "10.7759/cureus.79479" },
  { id: 10, title: "Effect of midline deviation and crown width disproportion on perception of smile esthetics", pmid: "40405774", doi: "10.1111/jerd.13492" },
  { id: 11, title: "Attractive levels of dental midline shift, midline cant, mouth corner, nose and chin asymmetry", pmid: "42851635", doi: "10.1002/hsr2.73348" },
  { id: 12, title: "Smile attractiveness perception across dental professionals and laypersons", pmid: "41209948", doi: "10.7759/cureus.94037" },
  { id: 13, title: "Perception of upper midline discrepancy with gingival display (Iran)", pmid: "36967115", doi: "10.4041/kjod22.164" },
  { id: 14, title: "Impact of dentolabial variables on esthetic perception: eye tracking study", pmid: "41776802", doi: "10.4103/njcp.njcp_42_25" },
  { id: 15, title: "Pleasant and unpleasant smile characteristics in laypeople (Iran)", pmid: "37565945", doi: "10.1016/j.ajodo.2023.04.022" },
  { id: 16, title: "Analysis of the effect magnitude of different parameters on smile attractiveness (1,040 raters)", pmid: "34796640", doi: "10.1111/jerd.12834" },
  { id: 17, title: "Layperson preference on orientation of transverse occlusal plane and commissure line", pmid: "27881322", doi: "10.1016/j.prosdent.2016.07.027" },
  { id: 18, title: "Preferences on occlusal plane and dental midline in asymmetrical faces", pmid: "40771656", doi: "10.1155/ijod/4232915" },
  { id: 19, title: "Width/length ratio in maxillary anterior teeth: esthetic preferences", pmid: "28513973", doi: "10.1111/jopr.12642" },
  { id: 20, title: "Maxillary anterior teeth dimension and relative width proportion (Saudi)", pmid: "33897325", doi: "10.1016/j.jtumed.2020.12.009" },
  { id: 21, title: "Upper anterior tooth dimensions in a young-adult Indian population in the UK", pmid: "29171516", doi: "10.1038/sj.bdj.2017.986" },
  { id: 22, title: "Golden ratio in teeth across countries: systematic review and meta-analysis (26 studies)", pmid: "37932181", doi: "10.1016/j.prosdent.2023.09.032" },
  { id: 23, title: "Golden percentage in natural maxillary anterior teeth: systematic review", pmid: "34340826", doi: "10.1016/j.prosdent.2021.06.015" },
  { id: 24, title: "Golden proportion, golden percentage and RED proportion in Kenyans", pmid: "38970240", doi: "10.1002/cre2.923" },
  { id: 25, title: "Prevalence of golden percentage, RED and Tarulatha-Ruchi proportion", pmid: "39926964", doi: "10.4103/jpbs.jpbs_845_24" },
  { id: 26, title: "Dentist preferences on anterior teeth proportion and harmony (Pakistan)", pmid: "38553673", doi: "10.1186/s12903-024-04100-4" },
  { id: 27, title: "Impact of variations in maxillary lateral incisor dimensions on smile esthetics", pmid: "34417035", doi: "10.1016/j.ajodo.2020.06.047" },
  { id: 28, title: "Impact of gingival margin asymmetries on smile esthetic perception", pmid: "35821722", doi: "10.15644/asc56/2/7" },
  { id: 29, title: "Esthetic evaluation of dental and gingival asymmetries", pmid: "25986710", doi: "10.1016/j.ortho.2015.03.005" },
  { id: 30, title: "Perception of altered smile esthetics by orthodontists, dentists and laypeople", pmid: "42038189", doi: "10.31661/gmj.vi.3947" },
  { id: 31, title: "Influence of smile arc on esthetic perception relative to gingival display (Iran)", pmid: "42146272", doi: "10.18502/fid.v22i46.20328" },
  { id: 32, title: "Impact of facial pattern and smile arc on perception of male facial attractiveness", pmid: "42908359", doi: "10.1111/jerd.70264" },
  { id: 33, title: "Evaluation of aesthetics of posed smiles", pmid: "40119218", doi: "10.1007/s10006-025-01364-0" },
  { id: 34, title: "Quantification of facial and smile esthetics", pmid: "28552284", doi: "10.1016/j.prosdent.2017.04.002" },
  { id: 35, title: "Perception of smile attractiveness regarding buccal corridor space as defined by the eyes", pmid: "36628925", doi: "10.1111/jerd.13005" },
  { id: 36, title: "Laypersons' perception of smile esthetics from different backgrounds", pmid: "39188396" },
  { id: 37, title: "Perception of smile attractiveness among orthodontists, restorative dentists and laypersons", pmid: "30820086", doi: "10.4103/JCD.JCD_429_18" },
  { id: 38, title: "Golden and RED proportions using two methods (Tirupati)", pmid: "42695117", doi: "10.7759/cureus.113953" },
  { id: 39, title: "Effect of smile esthetics on quality of life (Han Chinese)", pmid: "36573304", doi: "10.1111/jerd.12999" },
];

export const REFERENCE_BY_ID: ReadonlyMap<number, Reference> = new Map(
  REFERENCES.map((reference) => [reference.id, reference]),
);

/** Headline conclusions of the review, for the documentation page. */
export const EVIDENCE_HEADLINES: readonly { text: string; refs: readonly number[] }[] = [
  {
    text: "Strongest evidence (concordant studies or systematic reviews): gingival display, dental midline shift, diastema, occlusal plane cant.",
    refs: [2, 9, 1, 14],
  },
  {
    text: "Golden proportion, RED proportion and golden percentage are not found in natural dentition (meta-analysis of 26 studies, 3,786 people). Never hard-code them as targets.",
    refs: [22, 23],
  },
  {
    text: "Central incisor width/length: the preferred value in the perception study that compared professionals and laypeople was 85%, not 75-80%.",
    refs: [19],
  },
  {
    text: "Professionals are stricter than laypeople on almost every parameter, so the tool ships two threshold profiles.",
    refs: [11, 12, 28],
  },
  {
    text: "Gummy-smile tolerance differs by sex: up to 3 mm for female and 1.5 mm for male smiles in a dynamic video study.",
    refs: [3],
  },
  {
    text: "Shade, diastema, edge symmetry and gum show carry the largest effect sizes. A tool that optimises proportion formulas instead is optimising the wrong thing.",
    refs: [16],
  },
];

export const EVIDENCE_SCOPE_NOTE =
  "Every threshold comes from raters scoring digitally altered photographs, often of a single model. This is perception data, not clinical outcome data. Bands are configurable defaults that the clinician overrides, and no band is a diagnosis.";

/** Resolve the band range for a metric, profile and optional sex. */
export function resolveBand(
  metric: MetricEvidence,
  profile: ProfileId,
  sex?: "male" | "female" | null,
): BandRange | null {
  if (metric.reportOnly) return null;
  if (metric.sexBands && sex) return metric.sexBands[sex];
  return metric.bands[profile] ?? null;
}

/** Classify a measured value against a band range. */
export function classify(value: number | null, band: BandRange | null): Band {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  if (!band) return "report-only";
  const [greenMin, greenMax] = band.green;
  if (value >= greenMin && value <= greenMax) return "green";
  const [amberMin, amberMax] = band.amber;
  if (value >= amberMin && value <= amberMax) return "amber";
  return "red";
}

/**
 * Effect-size weighted harmony score.
 *
 * The paper's Section 3 measured how much each alteration lowered attractiveness
 * in 1,040 raters. Metrics the study did not test carry weight 0 and are
 * excluded, instead of being averaged in with an invented weight.
 *
 * Returns null when nothing measurable carries a weight.
 */
export function weightedHarmony(
  entries: readonly { id: string; band: Band }[],
  profile: ProfileId,
): { score: number | null; used: string[]; excluded: string[] } {
  const penalty: Record<Band, number | null> = {
    green: 0,
    amber: 0.5,
    red: 1,
    "report-only": null,
    unavailable: null,
  };

  let weighted = 0;
  let totalWeight = 0;
  const used: string[] = [];
  const excluded: string[] = [];

  for (const entry of entries) {
    const metric = EVIDENCE_BY_ID.get(entry.id);
    if (!metric) continue;
    const weight = Math.abs(profile === "clinician" ? metric.weight.dental : metric.weight.lay);
    const penaltyValue = penalty[entry.band];
    if (weight === 0 || penaltyValue === null) {
      excluded.push(entry.id);
      continue;
    }
    weighted += weight * penaltyValue;
    totalWeight += weight;
    used.push(entry.id);
  }

  if (totalWeight === 0) return { score: null, used, excluded };
  const score = Math.round(Math.max(0, Math.min(100, 100 * (1 - weighted / totalWeight))));
  return { score, used, excluded };
}
