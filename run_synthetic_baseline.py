"""Run the shipped engine (net + DARK + gate) on the held-out paired set and evaluate it: the regression baseline. python3 run_synthetic_baseline.py"""
import json, pathlib, sys, numpy as np, onnxruntime as ort
HERE = pathlib.Path(__file__).resolve().parent; sys.path.insert(0, str(HERE.parent / "nn")); sys.path.insert(0, str(HERE))
from model import decode_np
from gate import features, softmax, GROUP
from evaluate import evaluate, to_markdown, kind_of
root = HERE.parent.parent; models = root / "app/public/models"
sess = ort.InferenceSession(str(models / "lumina_dental_net.onnx"), providers=["CPUExecutionProvider"]); gate = json.load(open(models / "visibility_gate.json"))["groups"]; unc = json.load(open(models / "landmark_uncertainty.json"))["kinds"]
d = np.load(HERE.parent / "shards/paired.npz"); gt = dict(schema="lumina.benchmark/1", images=[]); pr = dict(schema="lumina.predictions/1", images=[])
for i in range(len(d["small"])):
    mm = float(str(d["meta"][i]).split("|")[2]) / 2.0
    gt["images"].append(dict(id=str(i), mm_per_px=1.0 / mm, landmarks={str(c): dict(x=float(d["kp_small"][i][c][0]), y=float(d["kp_small"][i][c][1]), visible=bool(d["kp_small"][i][c][2] > .5)) for c in range(40)}))
    x = (d["small"][i].astype(np.float32) / 255).transpose(2, 0, 1)[None]; seg, _, kp = sess.run(None, {"image": x}); probs = softmax(seg[0]); dec = decode_np(kp[0]); lm = {}
    for c in range(40):
        if dec[c] is None: continue
        g = gate[GROUP(c)]; f = features(probs, *dec[c]); z = np.r_[(f - np.array(g["mean"])) / np.array(g["std"]), 1.0] @ np.array(g["w"]); p = float(1 / (1 + np.exp(-z))); ok = p >= g["threshold"]
        lm[str(c)] = dict(x=dec[c][0], y=dec[c][1], accepted=bool(ok), gate_p=p, detection=dec[c][2], sigma_px=unc[kind_of(c)]["sigma_px"], reasons=[] if ok else ["LOW_VISIBILITY"])
    pr["images"].append(dict(id=str(i), landmarks=lm))
res = evaluate(gt, pr, 2.0); json.dump(res, open(HERE / "synthetic_baseline.json", "w"), indent=1)
md = to_markdown(res, "Synthetic held-out baseline (220 images): the regression reference for the shipped engine") + "\nSynthetic only. Real-photo performance is unmeasured; use the same evaluation on clinician annotations.\n"
(root / "docs/BENCHMARK_BASELINE.md").write_text(md); print(md)
