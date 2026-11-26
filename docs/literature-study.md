# Literature and data study: detecting teeth, borders, gingiva and smile landmarks from photos

Checked 2026-11-26 from the source pages listed. Claims are limited to what those pages state.

## What the papers show

| Source | What it did | Key numbers (as reported) | Data and licence |
|---|---|---|---|
| Chen et al., J Dent Sci 2026, https://pmc.ncbi.nlm.nih.gov/articles/PMC13689640/ | Per-tooth detection (YOLO family) on natural smile photographs, then box-prompted HQ-SAM masks, no dental fine-tuning of SAM | YOLO12x mAP50-95 0.915 on 100 held-out photos; HQ-SAM Dice 0.970 +/- 0.055 on 709 matched teeth; a model trained on retracted views scored mAP50 0.600 on smile photos vs 0.959 for the smile-trained one | 1,471 single-clinic photos (not released as far as the page shows); article CC BY-NC-ND |
| Nguyen et al., SegmentAnyTooth, J Dent Sci 2025, https://pmc.ncbi.nlm.nih.gov/articles/PMC11993027/ | YOLO11n detector + HQ-SAM on five standard intraoral views | Dice 0.920 to 0.983 across views | Article CC BY-NC-ND; the model weights are non-commercial (per https://github.com/AImageLab-zip/IOP-Compass) |
| Lee and Kim (cited in the Chen paper above) | YOLACT++ per-tooth on 5,500 public facial photos | tooth AP50 0.604, called hard to use clinically by the authors | not checked |
| J Clin Med 2022, 11(3):852, https://www.mdpi.com/2077-0383/11/3/852 | Real-time instance segmentation of teeth, gingiva, eyes, nose, lips on face photos for 2D digital smile design | AP above 0.9 at IoU 0.5 for eye, nose, lips; teeth lower | FFHQ-based faces (images from the NVIDIA FFHQ set); data availability not confirmed |
| Zou et al., Teeth-SEG, CVPR 2024, https://openaccess.thecvf.com/content/CVPR2024/papers/Zou_Teeth-SEG_An_Efficient_Instance_Segmentation_Framework_for_Orthodontic_Treatment_based_on_Multi-Scale_Aggregation_and_Anthropic_Prior_Knowledge_CVPR_2024_paper.pdf | Instance segmentation with tooth-shape priors, IO150K photo set | n/a | The IOP-Compass authors report they got no response when asking for the code or data. Not usable. |

Other items found but not read in full (so not relied on): dental midline localization on posed smiles (doi 10.1093/ejo/cjag056, page would not load), gummy-smile gingival display segmentation (J Dent 2026), Dynasmile (doi 10.1016/j.identj.2025.105483), SAM-assisted auto-annotation with YOLOv8-seg (doi 10.1117/12.3115426).

## Lessons that change the build

1. Domain matters more than model size. A retracted-view model fell from 0.959 to 0.600 on smile photos. Our own photos are mixed (retracted close-ups, a bearded smile, inflamed and decayed teeth), so a detector trained on someone else's clinic would not carry over.
2. Zero-shot SAM masks are accurate once the tooth is located (Dice 0.970 with box prompts). That removes the need for a tooth-mask training set. The open question is the locating step.
3. Lip-retracted vs smile views are different tasks, so honest refusal on non-frontal or unreadable input is needed.

## Usable data (commercial training rule: licence confirmed AND commercial-OK)

| Dataset | Content | Licence seen | Use |
|---|---|---|---|
| MIO, https://zenodo.org/records/22047269 | 765 intraoral photos, image-level gingiva class only | CC BY 4.0 | Commercial-OK, but no masks or borders. Possible later for gingiva health context only. Not imported. |
| Zenodo 14827784 | caries boxes, 6,313 images | CC BY 4.0 | boxes of decay, not teeth. Not used. |
| IOP-Compass | 5,000 photos, FDI masks | not stated; images derive from CC BY-NC-SA Bite2Text | Not approved |
| GingivitisSeg, https://arxiv.org/html/2611.15184 | gingivitis masks | CC BY-NC-SA | Non-commercial: reference only |
| SegmentAnyTooth weights | tooth masks model | non-commercial | Not approved |

## Models usable commercially (licence read on the repo page)

- MobileSAM, https://github.com/ChaoningZhang/MobileSAM: Apache-2.0.
- Segment Anything, https://github.com/facebookresearch/segment-anything: Apache-2.0.
- MediaPipe Face Landmarker: Apache-2.0 (tasks-vision package).
Ultralytics YOLO is AGPL-3.0 by default, so a YOLO detector would need a commercial licence or a different detector. This is why the build uses SAM masks plus rules rather than a YOLO tooth detector (licence read from memory, to be confirmed before any YOLO use).

## Applied to the detector

Zero-shot MobileSAM automatic masks, then a tooth filter (size, solidity, brightness, redness, same-row grouping), then borders from mask extents. Scores on the dentist's four held-out photos are in the project report. Nothing here was trained on his photos.
