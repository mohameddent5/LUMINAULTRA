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

## Verified literature values added 2026-11-27 (fetched, not recalled)

| Rule | Value | Source (URL fetched) | Level |
|---|---|---|---|
| Gingival zenith (GZ) of maxillary central incisor sits distal to the tooth long axis | all 20 patients' centrals distal; mean 1 mm (about 0.11 of a typical 8.6 mm central width), 240 sites, 20 healthy adults, calipers on casts | Chu et al, J Esthet Restor Dent 2009, PMID 19368601: https://pubmed.ncbi.nlm.nih.gov/19368601/ ; summary on https://www.drstephenchu.com/dr-stephen-chu-literature-research-articles/gingival-zenith-positions-and-levels-of-the-maxillary-anterior-dentition-8zrez | study, n=20 |
| GZ distal / on axis / mesial share | centrals 96% / 3% / 1%; laterals 84% / 14% / 1%; canines 43% / 44% / 5%; lateral GZ level with the central-canine line in 82% | Martins et al, J Prosthet Dent 2024 meta-analysis, DOI 10.1016/j.prosdent.2024.03.031: https://www.thejpd.org/article/S0022-3913(24)00225-7/abstract (authors rate evidence certainty very low) | meta-analysis, very low certainty |
| Upper central width/length ratio | mean 80 to 85% across populations; males 8.63 x 10.17 mm, females 8.32 x 9.36 mm | Abad Coronel et al, review of 19 studies, 2025: https://www.genesispub.org/jomdr/anthropometry-of-the-upper-central-incisor-a-review-of-the-literature | review |
| Preferred W/L of central | 78% preferred by dentists surveyed (shipped value 77.5%) | Proportional Smile Design, Dent Clin North Am: https://www.dental.theclinics.com/article/S0011-8532(15)00018-X/abstract | survey |

### Where his photos disagree with the literature (zenith)
His hand-placed zenith dots sit at the tooth centre: median offset 0.03 (ex26, n=7, sd 0.16) and 0.00 (ex27, n=7, sd 0.05) of tooth width toward distal, plus the earlier set (median 0.00, sd 0.18, n about 29). Literature says centrals are distal by about 0.11 of width. Differences in method: his dots are drawn on photos by eye (about +-5% of width), the paper measured casts with calipers.
Documented blend for the design layer (NEITHER-sourced weight): central zenith offset = w_his * 0.00 + w_lit * 0.11 with w_his = w_lit = 0.5, i.e. 0.055 of width distal. Lateral and canine zeniths stay on the centre (his data; the literature shares are split 84/43% distal and unquantified here). Revisit when more of his zeniths are labeled.
