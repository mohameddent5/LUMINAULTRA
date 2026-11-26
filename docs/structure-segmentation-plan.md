# Oral structure segmentation target

Status: plan. Nothing here is implemented in the engine yet.

## Classes (from the reference annotation)
Region masks: upper teeth (instance per tooth), lower teeth, gingiva, papillae (points), upper lip, lower lip, mouth opening (dark cavity), tongue, skin/beard (background).
Per-tooth curves: mesial border, distal border, incisal edge, cervical margin.
Points: zenith (gingival apex per tooth), papilla tip, midline.
Curves: gingiva margin, inner and outer lip borders.

## What a small private set can and cannot support
- Cannot: train a general network for all classes. A few dozen photos from one patient pool will overfit, and no accuracy claim would be valid.
- Can: score the engine honestly (boundary error in tooth-widths), tune classical steps (colour/edge, gum-line, lip contour from dark-cavity edge), and fine-tune a pretrained model only if its licence is commercial-OK and held-out photos exist.
- Labeled photos stay private and out of git. Only code, schema and aggregate scores are committed.

## Path
1. Schema + exporter in /annotate: add edge labels, gingiva margin, lip borders, tongue region.
2. Renderer that draws the reference style from any annotation (engine or human).
3. Classical baseline per structure: lips and cavity from colour/darkness, gingiva from pink band above teeth, tongue from cavity interior. Each emits confidence and refuses if weak.
4. Score against his labels (held-out photos, report per-class error). Ship only classes that pass; others show as "not detected".
5. Optional learned model once licence-clean weights and enough labels exist.

## Clinical knowledge layer
Source of truth: client/src/lib/dsdEvidence.ts. It holds graded metrics (high to low), bands for clinician and patient views, effect weights from a 1,040-rater study, and 39 PubMed references (PMIDs in the file). Covered: midline shift and cant, occlusal plane and commissure cant, gingival display, incisor display at rest, smile arc, buccal corridor, central width/length ratio, left-right width, edge height and gingival margin differences, lateral position and angulation, diastema, golden percentage.
Rules kept: golden proportion, RED and golden percentage are report-only (not found in natural dentition in a 26-study meta-analysis). Edges the source marks as extrapolated are shown as such. Bands are perception defaults, not diagnoses.
Gaps: papilla height/fill and tooth-form (square, oval, triangular) norms have no verified entry yet. They are added only after a source is read and checked.
Wiring: Studio does not yet read this table. Each metric is shown only when the structure it needs passed its quality check; otherwise it shows "not measurable on this photo" with the reason.
