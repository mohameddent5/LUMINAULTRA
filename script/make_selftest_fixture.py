"""Generate the deterministic self-test fixture for the landmark benchmark.

IMPORTANT — what this data is and is not
----------------------------------------
These files exercise every code path of ``evaluate.py`` (accepted vs rejected
landmarks, channels refused by the decoder, hidden-but-accepted landmarks,
gate-probability calibration bins, sigma coverage, refusal reasons). The
coordinates are SYNTHETIC and generated with a fixed seed. They are NOT model
outputs and the resulting numbers must NEVER be reported as model accuracy.

Real numbers require the ONNX weights (``lumina_dental_net.onnx``,
``visibility_gate.json``, ``landmark_uncertainty.json``), the paired shards and
clinician annotations — none of which ship with this repository.

Usage:
    python3 script/make_selftest_fixture.py
Writes:
    shared/benchmark-selftest.gt.json    (lumina.benchmark/1)
    shared/benchmark-selftest.pred.json  (lumina.predictions/1)
"""
from __future__ import annotations

import json
import math
import pathlib
import random

SEED = 7
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_GT = ROOT / "shared" / "benchmark-selftest.gt.json"
OUT_PRED = ROOT / "shared" / "benchmark-selftest.pred.json"

KINDS = ["incisal_mid", "zenith", "mesial_corner", "distal_corner"]
SIGMA = {
    "incisal_mid": 1.1,
    "zenith": 0.9,
    "mesial_corner": 1.4,
    "distal_corner": 1.4,
    "papilla": 1.7,
    "dental_midline": 0.8,
}


def kind_of(c: int) -> str:
    if c < 32:
        return KINDS[c % 4]
    return "papilla" if c < 39 else "dental_midline"


def build_image(idx: int, mm_per_px):
    """Return (gt_image, pred_image) for one synthetic case."""
    rnd = random.Random(SEED + idx)
    image_id = f"selftest-{idx + 1:02d}"
    lm: dict[str, tuple[float, float]] = {}

    # Eight maxillary anterior teeth; mesial/distal corners define crown width.
    for t in range(8):
        base_x = 12.0 + t * 26.0
        mesial = (base_x + rnd.uniform(-0.8, 0.8), 60.0 + rnd.uniform(-0.8, 0.8))
        distal = (mesial[0] + rnd.uniform(22.0, 26.0), mesial[1] + rnd.uniform(-0.6, 0.6))
        width = distal[0] - mesial[0]
        lm[str(t * 4 + 0)] = (mesial[0] + width * 0.5, mesial[1] - rnd.uniform(6.0, 9.0))
        lm[str(t * 4 + 1)] = (mesial[0] + width * 0.45, mesial[1] - rnd.uniform(11.0, 14.0))
        lm[str(t * 4 + 2)] = mesial
        lm[str(t * 4 + 3)] = distal

    # Papillae between adjacent teeth, then the dental midline.
    for k in range(7):
        lm[str(32 + k)] = (12.0 + (k + 1) * 26.0 - 1.5 + rnd.uniform(-0.7, 0.7), 52.0 + rnd.uniform(-0.8, 0.8))
    lm["39"] = (12.0 + 7 * 26.0 / 2 + 1.0, 52.5 + rnd.uniform(-0.5, 0.5))

    # Visibility: most landmarks visible; a few genuinely hidden.
    hidden: set[str] = set()
    if idx == 0:
        hidden |= {"25", "29"}          # zeniths of the last two teeth
    if idx == 2:
        hidden |= {"32"}                # one papilla
    if idx == 3:
        hidden |= {"6", "39"}           # one corner and the midline

    # One image leaves a channel unannotated to exercise the "ignored" path.
    unannotated = {"39"} if idx == 1 else set()

    gt_landmarks = {
        ch: {"x": round(x, 2), "y": round(y, 2), "visible": ch not in hidden}
        for ch, (x, y) in sorted(lm.items(), key=lambda kv: int(kv[0]))
        if ch not in unannotated
    }

    pred_landmarks: dict[str, dict] = {}
    for ch, (x, y) in sorted(lm.items(), key=lambda kv: int(kv[0])):
        if ch in unannotated:
            continue
        # ~12% of annotated channels are refused by the decoder (absent below).
        if rnd.random() < 0.12:
            continue
        kind = kind_of(int(ch))
        sigma_true = SIGMA[kind]
        err = abs(rnd.gauss(0.0, sigma_true * 0.9))
        if rnd.random() < 0.15:
            err *= 2.2                   # occasional gross error
        theta = rnd.uniform(0.0, 2.0 * math.pi)
        px = x + err * math.cos(theta)
        py = y + err * math.sin(theta)
        # Gate probability is correlated with the error, as a real gate should be.
        z = 1.6 - 0.9 * err + rnd.gauss(0.0, 0.5)
        gate_p = 1.0 / (1.0 + math.exp(-z))
        accepted = gate_p >= 0.5
        pred_landmarks[ch] = {
            "x": round(px, 2),
            "y": round(py, 2),
            "accepted": bool(accepted),
            "gate_p": round(gate_p, 4),
            "detection": round(rnd.uniform(0.30, 0.99), 3),
            "sigma_px": round(sigma_true, 2) if rnd.random() < 0.9 else None,
            "reasons": [] if accepted else (["LOW_VISIBILITY"] if gate_p < 0.5 else ["OUTLIER"]),
        }

    gt_image = {"id": image_id, "mm_per_px": mm_per_px, "landmarks": gt_landmarks}
    pred_image = {"id": image_id, "landmarks": pred_landmarks}
    return gt_image, pred_image


def main() -> None:
    gt_images, pred_images = [], []
    for idx, mm_per_px in enumerate([0.085, None, 0.11, 0.095]):
        g, p = build_image(idx, mm_per_px)
        gt_images.append(g)
        pred_images.append(p)

    gt = {
        "schema": "lumina.benchmark/1",
        "_note": "Synthetic self-test fixture (seed 7). Not model output; not accuracy evidence.",
        "images": gt_images,
    }
    pred = {
        "schema": "lumina.predictions/1",
        "_note": "Synthetic self-test fixture (seed 7). Not model output; not accuracy evidence.",
        "images": pred_images,
    }
    OUT_GT.write_text(json.dumps(gt, indent=1) + "\n")
    OUT_PRED.write_text(json.dumps(pred, indent=1) + "\n")
    print(f"wrote {OUT_GT.relative_to(ROOT)} and {OUT_PRED.relative_to(ROOT)}")
    print(f"images={len(gt_images)} annotated={sum(len(g['landmarks']) for g in gt_images)}")


if __name__ == "__main__":
    main()
