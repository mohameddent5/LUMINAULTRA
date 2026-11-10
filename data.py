"""
Training data for the neural dental-perception model: small canvas, domain randomisation, exact targets.

Canvas: 192x128 (W x H). Heatmaps at stride 4 -> 48x32 cells, cell centre (i+0.5)*4-0.5 in image px
(identical to src/dental.ts). Channel order = KEYPOINT_LAYOUT (same order as synth.Sample.keypoints).
"""
from __future__ import annotations
import sys, pathlib
import numpy as np
from PIL import Image
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from synth import render, LABELS, FDI

W, H, STRIDE, NK = 192, 128, 4, 40
HW, HH = W // STRIDE, H // STRIDE
STRESSES = [None, None, None, "lowcontrast", "shadow", "specular", "compression"]


def make_sample(seed: int, stress="random"):
    rng = np.random.default_rng(seed + 777)
    if stress == "random":
        stress = STRESSES[int(rng.integers(len(STRESSES)))]
    hard = bool(rng.random() < 0.3)
    sm = render(seed, hard=hard, stress=stress, ss=2)          # 384x256 render, 2x supersampling
    big = Image.fromarray(sm.image)
    img = np.asarray(big.resize((W, H), Image.BOX))             # area average -> 192x128
    lab = sm.labels[::2, ::2].copy()                            # nearest (pixel (2i,2j))
    ins = sm.instances[::2, ::2].copy()
    # coordinates: big pixel-centre convention -> small
    conv = lambda v: (v + 0.5) / 2.0 - 0.5
    kp = np.zeros((NK, 3), np.float32)
    for i, k in enumerate(sm.keypoints):
        kp[i] = (conv(k.x), conv(k.y), 1.0 if k.visible else 0.0)
    return img, lab, ins, kp, dict(stress=stress, hard=hard, px_per_mm=sm.px_per_mm / 2.0, seed=seed)


def make_shard(path: str, seeds):
    imgs, labs, idents, kps, metas = [], [], [], [], []
    for sd in seeds:
        img, lab, ins, kp, meta = make_sample(int(sd))
        imgs.append(img); labs.append(lab); idents.append(np.where(ins > 0, ins.astype(np.int16) - 1, -1).astype(np.int8)); kps.append(kp)
        metas.append(f"{meta['stress']}|{int(meta['hard'])}|{meta['px_per_mm']:.3f}|{meta['seed']}")
    np.savez_compressed(path, img=np.stack(imgs), lab=np.stack(labs), ident=np.stack(idents), kp=np.stack(kps), meta=np.array(metas))


def heatmaps(kp: np.ndarray, sigma: float = 1.5) -> np.ndarray:
    """kp [B,40,3] (x,y,visible) in image px -> targets [B,40,HH,HW]; invisible -> all zeros."""
    B = kp.shape[0]
    gx = np.arange(HW, dtype=np.float32)[None, None, None, :]
    gy = np.arange(HH, dtype=np.float32)[None, None, :, None]
    cx = ((kp[..., 0] + 0.5) / STRIDE - 0.5)[:, :, None, None]
    cy = ((kp[..., 1] + 0.5) / STRIDE - 0.5)[:, :, None, None]
    hm = np.exp(-((gx - cx) ** 2 + (gy - cy) ** 2) / (2 * sigma ** 2)).astype(np.float32)
    vis = (kp[..., 2] > 0.5)[:, :, None, None]
    inside = ((kp[..., 0] >= -2) & (kp[..., 0] < W + 2) & (kp[..., 1] >= -2) & (kp[..., 1] < H + 2))[:, :, None, None]
    return hm * vis * inside


if __name__ == "__main__":
    # usage: python3 nn/data.py <out.npz> <seed_start> <count>
    out, s0, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    make_shard(out, range(s0, s0 + n))
    print("wrote", out, n)
