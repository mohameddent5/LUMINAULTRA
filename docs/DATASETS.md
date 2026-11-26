# Dataset licensing register

Rule: a dataset is used for training or shipped in the product only if its license is confirmed on the source page AND allows commercial use. Unconfirmed or non-commercial sets are not used. No external dataset is currently imported into this repo.

Checked 2026-11-26 from the source pages.

| Dataset | Source | License (as seen) | Status | Why |
|---|---|---|---|---|
| Panoramic Dental Xray Dataset (107 + 60 images, tooth instance masks) | https://data.mendeley.com/datasets/73n3kz2k4k | CC BY 4.0 (Mendeley API) | Approved, not imported | License fine (credit required). Panoramic X-rays do not fit the frontal smile pipeline. |
| Tooth masks, Merged-ICDAS labels (smartphone intraoral photos) | https://zenodo.org/records/24383686 | CC BY 4.0 (per sweep report) | Not imported | Children's occlusal/mandibular caries views, no frontal smiles. Photos come from Zenodo 14827784 (also CC BY 4.0). Zenodo blocked automated download. |
| Annotated intraoral image dataset for dental caries | https://zenodo.org/records/14827784 | CC BY 4.0 (per sweep report) | Not imported | Same fit problem. Download blocked from build environment. |
| SerdarHelli SegmentationOfTeethPanoramicXRayImages | https://huggingface.co/datasets/SerdarHelli/SegmentationOfTeethPanoramicXRayImages | No license stated on dataset card | NOT approved | License unconfirmed. |
| IOP-Compass (5,000 intraoral photos, FDI masks) | see sweep report | Not shown | NOT approved | Needs written permission from the authors. |
| MetaDent, other CC BY-NC sets | see sweep report | Non-commercial | NOT approved | Cannot be used in a product that is sold. |

Attribution: any CC BY dataset later used must be credited here and in the app's About page, with a link to the license and a note of changes.

Model note: `lumina_dental_net.onnx` and `visibility_gate.json` were fit on 1,920 synthetic images only. No real-world accuracy has been measured.

## Private clinic photos (consent stated by the dentist-owner, 2026-11-26)
Patient photos supplied by the owner are kept off GitHub and outside this repo. They are used only as a private annotation set via /annotate (images never leave the device; only exported point JSON does). They must not be committed, and consent records should be kept by the clinic.

Note on the engine: `lumina_dental_net.onnx`, `visibility_gate.json` and all numbers in the benchmark self-test come from synthetic renders (synth.py). The repo's own README states they are not validated on real photographs.

## Frontal tooth instance segmentation sweep (Nov 26)

| Dataset | Source | License (as seen) | Status | Why |
| --- | --- | --- | --- | --- |
| IOP-Compass (5,000 intraoral photos, FDI instance masks) | https://ditto.ing.unimore.it/iop-compass/ | Not stated on the dataset page (account needed to download). Images come from Bite2Text, which the ODIN 2026 challenge lists as CC BY-NC-SA (https://odin2026.grand-challenge.org/datasets/) | NOT approved | Best fit technically, but derived from non-commercial images. Commercial use would need written permission from the maintainers. |
| SegmentAnyTooth weights | https://github.com/thangngoc89/segmentanytooth/ | Code MIT, weights non-commercial | NOT approved | Weights are non-commercial. |
| Annotated intraoral image dataset for dental caries | https://zenodo.org/records/14827784 | CC BY 4.0 | Not usable | Caries detection boxes, not tooth masks. |
| Roboflow "AI in Dentistry ... Yang Dental" | https://universe.roboflow.com/ai-in-dentistry/ai-in-dentistry-images-using-intraoral-cam-at-yang-dental | Public Domain (as listed) | Not usable | 167 images, tooth-crack classes, not tooth instances. |

Result: no confirmed commercial-OK dataset for frontal tooth instance segmentation was found. Other Roboflow sets seen (1.2k, 267, 156, 52 images) show no confirmed licence in the fetched pages and are not approved.
