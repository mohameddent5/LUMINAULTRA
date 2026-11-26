# Literature priors and methods for the landmark-first engine

Soft priors only. They shape which candidates are believable; they never override pixels, and
they are never shown as a target the patient "should" match. All are population averages with
large spread, and several are ethnicity dependent. Evidence level is stated for each.

## Tooth width priors (frontal view, apparent width)
- Apparent widths in natural dentition, digital photographs: central incisor about 22%, lateral about 15%, canine about 13% of the six-tooth width (per side pair summed to 100%). Golden proportion (62% steps) held in only 14 to 25% of subjects, RED proportion was not constant and rose distally. Cross-sectional photo study, no ethnic adjustment. https://pmc.ncbi.nlm.nih.gov/articles/PMC2813089/
- Width to height ratio on 2304 teeth of 384 subjects (casts and photos): central 92.4%, lateral 87.2%, canine 89.8%; men and women differ significantly, and lateral width could not be predicted from central width in women. Cross-sectional, one population. https://www.nature.com/articles/s41598-018-36770-w
- A narrative review states that ideal proportions are only partly found in natural dentition and vary with population. https://www.mdpi.com/2304-6767/12/1/3 (title "Maxillary Anterior Teeth Dimensions and Relative Width Proportions", narrative review, low evidence level)
Use in the engine: a candidate row whose width pattern is far from these (for example one tooth over 40% of the row) is flagged as likely merged or fragmented, not corrected.

## Gingival zenith priors
- The zenith of the central incisor and canine sits slightly distal to the tooth long axis, and the lateral incisor zenith is typically at or slightly below the line joining central and canine zeniths. Several cast and photo studies (J Esthet Restor Dent 2009; J Periodontol 2008). The exact millimetre values were not read in full here, so none are used as numbers yet.

## Methods for few labels
- SegmentAnyTooth (YOLO11 plus HQ-SAM on 5000 intraoral photos, open): https://pmc.ncbi.nlm.nih.gov/articles/PMC11993027/ . Needs retracted intraoral views, not smile photos.
- Per-tooth detection from unretracted smile photographs: https://pmc.ncbi.nlm.nih.gov/articles/PMC13689640/ . The task closest to ours. Licensing of weights not checked yet.
- IOSSAM, label-efficient prompt-driven tooth segmentation with SAM (MICCAI 2024): https://papers.miccai.org/miccai-2024/paper/2519_paper.pdf . Idea reused: prompts from a cheap detector into SAM, which is what the engine already does zero-shot.
Open: none of these is validated on our photos. Any model fit on his labeled photos stays leave-one-photo-out, and scores on his third-party photos stay evaluation only.
