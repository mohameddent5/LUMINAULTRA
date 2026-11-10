"""Learned visibility gate: logistic model per keypoint group on (peak, local class probabilities).
Fit on shards/gate.npz (never on test). Exports app/public/models/visibility_gate.json for the TypeScript runtime."""
import json, pathlib, collections
import numpy as np, onnxruntime as ort
from model import decode_np
HERE = pathlib.Path(__file__).parent
OFFS = [(0, 0), (0, -4), (0, 4), (-4, 0), (4, 0)]
GROUP = lambda c: "incisal_mid" if c < 32 and c % 4 == 0 else "zenith" if c < 32 and c % 4 == 1 else "corner" if c < 32 else "papilla" if c < 39 else "dental_midline"

def softmax(a): e = np.exp(a - a.max(0, keepdims=True)); return e / e.sum(0, keepdims=True)

def features(probs, x, y, peak):
    C, H, W = probs.shape; f = [peak]
    for dx, dy in OFFS:
        xi, yi = int(round(x + dx)), int(round(y + dy))
        x0, x1, y0, y1 = max(xi - 1, 0), min(xi + 2, W), max(yi - 1, 0), min(yi + 2, H)
        f.extend(probs[:, y0:y1, x0:x1].mean((1, 2)) if x1 > x0 and y1 > y0 else np.zeros(C))
    return np.array(f, np.float64)

def collect(npz, sess, n=None, start=0):
    d = np.load(HERE.parent / "shards" / npz); out = collections.defaultdict(lambda: ([], []))
    for i in range(start, len(d["img"]) if n is None else n):
        x = (d["img"][i].astype(np.float32) / 255).transpose(2, 0, 1)[None]; seg, _, kp = sess.run(None, {"image": x})
        probs = softmax(seg[0]); dec = decode_np(kp[0])
        for c in range(40):
            if dec[c] is None: continue
            out[GROUP(c)][0].append(features(probs, *dec[c])); out[GROUP(c)][1].append(float(d["kp"][i][c][2] > 0.5))
    return {k: (np.array(a), np.array(b)) for k, (a, b) in out.items()}

def fit_logistic(X, y, l2=1.0, iters=50):
    mu, sd = X.mean(0), X.std(0) + 1e-6; Z = np.c_[(X - mu) / sd, np.ones(len(X))]; w = np.zeros(Z.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Z @ w)); g = Z.T @ (p - y) + l2 * np.r_[w[:-1], 0]; Hs = (Z * (p * (1 - p))[:, None]).T @ Z + l2 * np.eye(len(w))
        w -= np.linalg.solve(Hs, g)
    return mu, sd, w

def merge(*parts):
    out = {}
    for P in parts:
        for g, (X, y) in P.items():
            if g in out: out[g] = (np.r_[out[g][0], X], np.r_[out[g][1], y])
            else: out[g] = (X, y)
    return out

def save_feats(shard, start=0, end=None, tag=""):
    sess = ort.InferenceSession(str(HERE.parent.parent / "app/public/models/lumina_dental_net.onnx"), providers=["CPUExecutionProvider"])
    G = collect(shard, sess, end, start)
    np.savez(HERE.parent / "shards" / f"feat_{shard}{tag}", **{f"{g}_X": X for g, (X, y) in G.items()}, **{f"{g}_y": y for g, (X, y) in G.items()})

def load_feats(shards):
    parts = [np.load(HERE.parent / "shards" / (f"feat_{s}" if f"feat_{s}".endswith(".npz") else f"feat_{s}.npz")) for s in shards]
    groups = {k[:-2] for k in parts[0].files if k.endswith("_X")}
    return {g: (np.concatenate([p[g + "_X"] for p in parts]), np.concatenate([p[g + "_y"] for p in parts])) for g in groups}

if __name__ == "__main__":
    import sys
    if sys.argv[1] == "collect":
        sh, a, b = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]); save_feats(sh, a, b, f"_{a}"); print("collected", sh, a, b, flush=True)
        sys.exit(0)
    G = load_feats(["gate.npz", "gate2.npz", "gate3.npz_0", "gate3.npz_350"]); T = load_feats(["test.npz"]); model = {}
    print("group | calibration: visible hidden | threshold | TEST: hidden-share of claims; hidden passing gate; visible kept")
    for g, (X, y) in G.items():
        mu, sd, w = fit_logistic(X, y)
        score = lambda X_: 1 / (1 + np.exp(-(np.c_[(X_ - mu) / sd, np.ones(len(X_))] @ w)))
        s = score(X); hid = s[y < 0.5]
        thr = max(float(np.quantile(hid, 0.95)) if len(hid) > 20 else 0.9, 0.3)
        model[g] = dict(mean=mu.tolist(), std=sd.tolist(), w=w.tolist(), threshold=thr, n_features=len(mu))
        Xt, yt = T[g]; st = score(Xt); hid_t, vis_t = st[yt < 0.5], st[yt > 0.5]
        print(f"{g:15s} | {int(y.sum()):6d} {int((1-y).sum()):6d} | {thr:.3f} | {np.mean(yt<0.5):.3f}; {np.mean(hid_t>=thr) if len(hid_t) else 0:.3f} ({len(hid_t)}); {np.mean(vis_t>=thr):.3f} ({len(vis_t)})")
    out = HERE.parent.parent / "app/public/models/visibility_gate.json"
    json.dump(dict(version=1, offsets=OFFS, features="peak + 5 offsets x 6 class probs (3x3 mean)", groups=model, note="fit on 1,920 synthetic calibration images only; threshold = 95th percentile of hidden-claim scores"), open(out, "w"))
    print("wrote", out)
