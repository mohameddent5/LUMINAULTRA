"""Learned tooth-border candidate scorer, leave-one-photo-out.

Usage: python3 train_borders.py MANIFEST.json   (manifest and photos stay private, never committed)
MANIFEST: [{"name": str, "photo": path, "truth": [x, ...]}, ...]  truth = interproximal/outer border x positions.
Steps: automatic tooth band (colour mask) -> candidates from luminance valleys, mask-coverage gaps and
vertical edge energy -> small logistic regression -> spacing-aware selection.
Reports per photo hits (<= TOL px), false borders and misses, always from a model that never saw that photo.
Experimental, tiny data: not an accuracy claim.
"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import find_peaks

TOL = 14


def load(path):
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    s = 1280.0 / im.shape[1]
    if abs(s - 1) > 0.02:
        im = np.asarray(Image.fromarray(im.astype("uint8")).resize((1280, int(im.shape[0] * s)), Image.LANCZOS)).astype(float)
    return im, s


def tooth_mask(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    red = (r - g) / (lum + 1)
    # teeth: bright and not pink; gum and lips are redder, cavity is dark
    m = (lum > np.percentile(lum, 55)) & (red < np.percentile(red, 60))
    m = ndi.binary_opening(m, iterations=2)
    m = ndi.binary_closing(m, iterations=3)
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        m = lab == (1 + int(np.argmax(sizes)))
        m = ndi.binary_fill_holes(m)
    return m, lum


def profiles(im):
    m, lum = tooth_mask(im)
    ys, xs = np.where(m)
    if len(xs) < 500:
        return None
    rows = m.sum(1)
    ymid = np.where(rows > 0.35 * rows.max())[0]
    y0, y1 = ymid.min(), ymid.max()
    # use the upper 70% of the band: incisal edges and lower teeth blur the gaps
    y1 = int(y0 + 0.7 * (y1 - y0))
    x0, x1 = int(np.percentile(xs, 0.5)), int(np.percentile(xs, 99.5))
    lb = ndi.gaussian_filter(lum, 1.2)
    gx = np.abs(ndi.sobel(lb, axis=1))
    band = slice(y0, y1 + 1)
    prof = ndi.gaussian_filter1d(lb[band].mean(0), 2)
    cov = ndi.gaussian_filter1d(m[band].mean(0), 2)
    edge = ndi.gaussian_filter1d(gx[band].mean(0), 2)
    # vertical-line coherence: edge that persists down the band
    coh = ndi.gaussian_filter1d((gx[band] > np.percentile(gx[band], 80)).mean(0), 2)
    return dict(prof=prof, cov=cov, edge=edge, coh=coh, x0=x0, x1=x1, y0=y0, y1=y1, W=lum.shape[1])


def candidates(P):
    prof, cov, edge, coh = P["prof"], P["cov"], P["edge"], P["coh"]
    sets = []
    pk, _ = find_peaks(-prof, prominence=1.0, distance=10)
    sets += list(pk)
    pk, _ = find_peaks(-cov, prominence=0.04, distance=10)
    sets += list(pk)
    pk, _ = find_peaks(coh, prominence=0.04, distance=10)
    sets += list(pk)
    sets = sorted(set(int(x) for x in sets if P["x0"] - 25 <= x <= P["x1"] + 25))
    merged = []
    for x in sets:
        if merged and x - merged[-1][-1] <= 12:
            merged[-1].append(x)
        else:
            merged.append([x])
    return [int(np.mean(g)) for g in merged]


def feats(P, xs):
    prof, cov, edge, coh = P["prof"], P["cov"], P["edge"], P["coh"]
    ext = max(P["x1"] - P["x0"], 1)
    pm = prof.std() + 1e-6
    F = []
    for x in xs:
        lo, hi = max(0, x - 25), min(len(prof), x + 26)
        loc = prof[lo:hi]
        f = [
            (np.median(loc) - prof[x]) / pm,  # valley depth
            (cov[lo:hi].mean() - cov[x]) / (cov.std() + 1e-6),  # coverage gap
            edge[x] / (edge.mean() + 1e-6),
            coh[x] / (coh.mean() + 1e-6),
            (x - P["x0"]) / ext,
            abs((x - P["x0"]) / ext - 0.5),
            1.0 if (x - P["x0"]) < 0.06 * ext or (P["x1"] - x) < 0.06 * ext else 0.0,  # outer edge zone
            cov[x],
        ]
        F.append(f)
    return np.array(F)


def fit(X, y, l2=1.0, it=600, lr=0.1):
    mu, sd = X.mean(0), X.std(0) + 1e-6
    Z = (X - mu) / sd
    w = np.zeros(Z.shape[1]); b = 0.0
    pw = (len(y) - y.sum()) / max(y.sum(), 1)
    for _ in range(it):
        p = 1 / (1 + np.exp(-(Z @ w + b)))
        sw = np.where(y == 1, pw, 1.0)
        g = (sw * (p - y))
        w -= lr * (Z.T @ g / len(y) + l2 * w / len(y)); b -= lr * g.mean()
    return mu, sd, w, b


def score(model, X):
    mu, sd, w, b = model
    return 1 / (1 + np.exp(-(((X - mu) / sd) @ w + b)))


def select(xs, p, thr, min_gap):
    order = np.argsort(-p)
    keep = []
    for i in order:
        if p[i] < thr:
            break
        if all(abs(xs[i] - xs[j]) >= min_gap for j in keep):
            keep.append(i)
    return sorted(int(xs[i]) for i in keep)


def main():
    man = json.load(open(sys.argv[1]))
    data = []
    for it in man:
        im, s = load(it["photo"])
        P = profiles(im)
        xs = candidates(P)
        truth = [t for t in it["truth"]]
        X = feats(P, xs)
        y = np.array([1 if min(abs(x - t) for t in truth) <= TOL else 0 for x in xs])
        data.append(dict(name=it["name"], P=P, xs=np.array(xs), X=X, y=y, truth=truth))
        recall = sum(any(abs(x - t) <= TOL for x in xs) for t in truth)
        print(f'{it["name"]}: band y {P["y0"]}-{P["y1"]}, x {P["x0"]}-{P["x1"]}, {len(xs)} candidates, candidate recall {recall}/{len(truth)}')
    print("--- leave-one-photo-out (model never saw the scored photo)")
    tot_hit = tot_t = tot_fp = tot_sel = 0
    for k, d in enumerate(data):
        tr = [e for j, e in enumerate(data) if j != k]
        X = np.vstack([e["X"] for e in tr]); y = np.concatenate([e["y"] for e in tr])
        model = fit(X, y)
        p = score(model, d["X"])
        ext = d["P"]["x1"] - d["P"]["x0"]
        sel = select(d["xs"], p, 0.5, 0.07 * ext)
        hits = sum(any(abs(s - t) <= TOL for s in sel) for t in d["truth"])
        fp = sum(all(abs(s - t) > TOL for t in d["truth"]) for s in sel)
        tot_hit += hits; tot_t += len(d["truth"]); tot_fp += fp; tot_sel += len(sel)
        print(f'{d["name"]}: hits {hits}/{len(d["truth"])}, false {fp}, selected {sel}')
    print(f"TOTAL held-out: hits {tot_hit}/{tot_t}, false borders {tot_fp} of {tot_sel} selected")


if __name__ == "__main__":
    main()
