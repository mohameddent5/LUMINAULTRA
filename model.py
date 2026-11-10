"""
LuminaDental-Net: small multi-task fully-convolutional network (JAX, NCHW).

  input  image  [B,3,128,192]  RGB in [0,1] (graph normalises internally)
  output seg    [B,6,128,192]  logits: skin, upper_lip, lower_lip, gingiva, cavity, tooth
  output ident  [B,8,128,192]  logits per FDI slot (14,13,12,11,21,22,23,24), meaningful on tooth pixels
  output kp     [B,40,32,48]   sigmoid heatmaps at stride 4, channel order = KEYPOINT_LAYOUT

Explicit symmetric padding and nearest/linear resizes are used so the hand-built ONNX graph is numerically identical.
"""
from __future__ import annotations
import math
import jax, jax.numpy as jnp
import numpy as np

H, W, NK = 128, 192, 40
# (name, cin, cout, k, stride)
SPEC = [
    ("e0a", 3, 16, 3, 1), ("e0b", 16, 16, 3, 1),
    ("e1a", 16, 32, 3, 2), ("e1b", 32, 32, 3, 1),
    ("e2a", 32, 48, 3, 2), ("e2b", 48, 48, 3, 1),
    ("e3a", 48, 64, 3, 2), ("e3b", 64, 64, 3, 1),
    ("e4a", 64, 96, 3, 2), ("e4b", 96, 96, 3, 1),
    ("d3", 96 + 64, 64, 3, 1),
    ("d2", 64 + 48, 48, 3, 1),
    ("hm0", 48, 48, 3, 1),
    ("d1", 48 + 32, 32, 3, 1),
    ("heat", 48, NK, 1, 1),
    ("seg", 32, 6, 1, 1),
    ("ident", 32, 8, 1, 1),
]
SPEC_BY = {s[0]: s for s in SPEC}


def init_params(key):
    p = {}
    for name, cin, cout, k, _ in SPEC:
        key, sub = jax.random.split(key)
        std = math.sqrt(2.0 / (cin * k * k)) if name not in ("heat", "seg", "ident") else 0.01 * math.sqrt(2.0 / cin) * 10
        p[name + "/w"] = jax.random.normal(sub, (cout, cin, k, k), jnp.float32) * std
        p[name + "/b"] = jnp.zeros((cout,), jnp.float32)
    # bias heatmap logits low so the model starts by predicting "no keypoint"
    p["heat/b"] = jnp.full((NK,), -4.0, jnp.float32)
    return p


def conv(p, name, x):
    _, _, _, k, s = SPEC_BY[name]
    pad = k // 2
    y = jax.lax.conv_general_dilated(x, p[name + "/w"], (s, s), ((pad, pad), (pad, pad)), dimension_numbers=("NCHW", "OIHW", "NCHW"))
    return y + p[name + "/b"][None, :, None, None]


def up2(x):
    return jnp.repeat(jnp.repeat(x, 2, axis=2), 2, axis=3)


def forward(p, img01):
    x = (img01 - 0.5) * 4.0
    relu = jax.nn.relu
    e0 = relu(conv(p, "e0b", relu(conv(p, "e0a", x))))
    e1 = relu(conv(p, "e1b", relu(conv(p, "e1a", e0))))
    e2 = relu(conv(p, "e2b", relu(conv(p, "e2a", e1))))
    e3 = relu(conv(p, "e3b", relu(conv(p, "e3a", e2))))
    e4 = relu(conv(p, "e4b", relu(conv(p, "e4a", e3))))
    d3 = relu(conv(p, "d3", jnp.concatenate([up2(e4), e3], axis=1)))
    d2 = relu(conv(p, "d2", jnp.concatenate([up2(d3), e2], axis=1)))
    h = relu(conv(p, "hm0", d2))
    heat = jax.nn.sigmoid(conv(p, "heat", h))
    d1 = relu(conv(p, "d1", jnp.concatenate([up2(d2), e1], axis=1)))
    B = img01.shape[0]
    seg = jax.image.resize(conv(p, "seg", d1), (B, 6, H, W), method="linear")
    ident = jax.image.resize(conv(p, "ident", d1), (B, 8, H, W), method="linear")
    return seg, ident, heat


CLASS_W = jnp.array([0.5, 1.0, 1.0, 1.5, 1.0, 2.0])


def loss_fn(p, img01, lab, ident, heat_t):
    seg, idl, heat = forward(p, img01)
    logp = jax.nn.log_softmax(seg, axis=1)
    onehot = jax.nn.one_hot(lab, 6, axis=1)
    ce = -(onehot * logp).sum(1)
    w = CLASS_W[lab]
    seg_ce = (ce * w).sum() / w.sum()
    pt = jnp.exp(logp[:, 5])
    gt = (lab == 5).astype(jnp.float32)
    dice = 1 - (2 * (pt * gt).sum() + 1) / (pt.sum() + gt.sum() + 1)
    m = (ident >= 0).astype(jnp.float32)
    lp = jax.nn.log_softmax(idl, axis=1)
    oh = jax.nn.one_hot(jnp.maximum(ident, 0), 8, axis=1)
    id_ce = (-(oh * lp).sum(1) * m).sum() / (m.sum() + 1.0)
    hm = ((heat - heat_t) ** 2 * (1.0 + 30.0 * heat_t)).mean() * 40.0
    total = seg_ce + 0.5 * dice + id_ce + hm
    return total, dict(seg=seg_ce, dice=dice, ident=id_ce, heat=hm)


def decode_np(heat: np.ndarray, stride=4, min_peak=0.3, hw=3, multimodal=0.6):
    """Numpy mirror of src/dental.ts decodeKeypoints. heat [C,Hh,Ww] -> list of (x,y,peak) or None (refused)."""
    out = []
    C, Hh, Ww = heat.shape
    for c in range(C):
        m = heat[c]
        i = int(np.argmax(m)); py, px = divmod(i, Ww); best = float(m[py, px])
        if best < min_peak or px < hw or py < hw or px >= Ww - hw or py >= Hh - hw:
            out.append(None); continue
        mask = np.ones_like(m, bool); mask[max(0, py - 2 * hw): py + 2 * hw + 1, max(0, px - 2 * hw): px + 2 * hw + 1] = False
        if m[mask].size and float(m[mask].max()) >= multimodal * best:
            out.append(None); continue
        win = m[py - hw: py + hw + 1, px - hw: px + hw + 1]
        wgt = np.maximum(0, win - 0.2 * best)
        ys, xs = np.mgrid[-hw: hw + 1, -hw: hw + 1]
        sw = wgt.sum()
        cx = px + (wgt * xs).sum() / sw; cy = py + (wgt * ys).sum() / sw
        out.append(((cx + 0.5) * stride - 0.5, (cy + 0.5) * stride - 0.5, best))
    return out
