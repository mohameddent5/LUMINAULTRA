# Oral structure segmentation target

Status: plan. Nothing here is implemented in the engine yet.

## Classes (from the reference annotation)
Region masks: upper teeth (instance per tooth), lower teeth, free gingiva (the collar from the gingival margin to the groove), attached gingiva (the firmer band past the groove, up to the mucogingival line), gingiva overall, papillae (points), upper lip, lower lip, mouth opening (dark cavity), tongue, skin/beard (background).
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

## Reference examples (unverified origin, schema only, not ground truth)
1. Upper arch, 10 teeth, full legend: mesial/distal/incisal, zenith, papilla, cervical margin, gingiva margin, lip borders.
2. Same style on a different mouth, with lower arch: lower incisal line, lower papillae with short vertical tooth-boundary lines, and a midline diastema between the upper centrals (visible gap, dark space behind). Schema implications: lower-arch instances and boundaries; diastema as its own measurable gap (width between the two central mesial borders), already a metric in dsdEvidence.ts; the papilla points must allow a "missing or open" state; the gingiva margin may be absent on posterior teeth.
The images themselves are private and not stored in the repo.
3. Wider crop with nose and full lips, a different person and skin tone, low gingival display: the gingiva margin is one dashed line along the lip rather than per-tooth scallops, and teeth are small in frame. Schema implications: the gingiva margin needs a "coarse" mode when zeniths are hard to see; the mouth crop must be found first (the tooth outlines here are about 5 percent of the image width per tooth); skin tone variety must be in any test set before claiming robustness.

## Free vs attached gingiva (hard target)
Classes: free gingiva region, attached gingiva region, and the boundary line between them (the free gingival groove). The yellow line the user drew is the free gingival margin, the edge of the free gingiva next to the tooth.
Limits: in a smile photo the groove is a subtle change of texture and shade, often hidden by the upper lip, and many mouths show only a thin free band. Colour alone is unlikely to separate the two.
Rule: ship only if it passes scoring on held-out labelled photos (boundary distance as a fraction of tooth height, per tooth). Until then the UI says "not detected" for these three classes and shows no guess. Needed from the user: hand labels of the groove on photos where it is visible (a thin line, with "not visible" noted when it is hidden).

## UX references from commercial DSD software (ideas only; images not stored)
Two third-party screenshots showed: facial midline, interpupillary line, commissure line, chin and face-oval guides, smile-arc curve, a transferred proportion grid over the teeth, tooth outlines, a calibrated ruler in the intraoral view, and a horizontal reference line through an incisal edge.
Reusable with what the engine can do today: dentist-placed, draggable guide lines (midline, horizontal reference, commissure line, incisal reference) with offsets read in tooth-widths; a proportion grid drawn from the dentist's own placed borders; the incisal edge curve when teeth pass the plausibility check.
Needs a scale first: any mm or degree readout. The engine has no scale. A ruler or known-size object in frame, or a dentist-entered tooth width, is required, and the UI must say which one was used.
Out of reach now: automatic face, eye and interpupillary detection (no face model in the engine), 3D arch and mock-up views (need a 3D scan), lower-arch outlines.
