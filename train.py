"""Resumable, time-boxed trainer. usage: python3 train.py <minutes> [total_steps]"""
import sys, time, pickle, pathlib, os
os.environ.setdefault("XLA_FLAGS", "--xla_cpu_multi_thread_eigen=true")
import numpy as np, jax, jax.numpy as jnp, optax
jax.config.update("jax_compilation_cache_dir", "/tmp/jaxcache")
jax.config.update("jax_persistent_cache_min_compile_time_secs", 0)
from model import init_params, loss_fn, forward
from data import heatmaps

HERE = pathlib.Path(__file__).parent
CKPT = HERE / "ckpt.pkl"
minutes = float(sys.argv[1]); TOTAL = int(sys.argv[2]) if len(sys.argv) > 2 else 1600
BATCH = 16

def load(names):
    d = [np.load(HERE.parent / "shards" / n) for n in names]
    return {k: np.concatenate([x[k] for x in d]) for k in ("img", "lab", "ident", "kp")}

data = load(["train_a.npz", "train_b.npz"]); N = len(data["img"])
sched = optax.warmup_cosine_decay_schedule(0.0, 2e-3, 40, TOTAL, 1e-4)
opt = optax.adam(sched)
if CKPT.exists():
    s = pickle.load(open(CKPT, "rb")); params = jax.tree.map(jnp.asarray, s["params"]); opt_state = jax.tree.map(jnp.asarray, s["opt"]); step = s["step"]; rng = np.random.default_rng(s["seed"] + step)
else:
    params = init_params(jax.random.PRNGKey(0)); opt_state = opt.init(params); step = 0; rng = np.random.default_rng(1)

@jax.jit
def train_step(params, opt_state, img, lab, ident, hm):
    (l, parts), g = jax.value_and_grad(loss_fn, has_aux=True)(params, img, lab, ident, hm)
    up, opt_state = opt.update(g, opt_state, params)
    return optax.apply_updates(params, up), opt_state, l, parts

def batch():
    idx = rng.integers(0, N, BATCH)
    img = data["img"][idx].astype(np.float32) / 255.0
    gain = rng.uniform(0.85, 1.15, (BATCH, 1, 1, 1)); gamma = rng.uniform(0.85, 1.2, (BATCH, 1, 1, 1))
    img = np.clip(img ** gamma * gain + rng.normal(0, rng.uniform(0, 0.02), img.shape), 0, 1)
    img = np.transpose(img, (0, 3, 1, 2)).astype(np.float32)
    return jnp.asarray(img), jnp.asarray(data["lab"][idx].astype(np.int32)), jnp.asarray(data["ident"][idx].astype(np.int32)), jnp.asarray(heatmaps(data["kp"][idx]))

def save():
    pickle.dump(dict(params=jax.tree.map(np.asarray, params), opt=jax.tree.map(np.asarray, opt_state), step=step, seed=1), open(CKPT, "wb"))

t0 = time.time(); last = t0; acc = []
while time.time() - t0 < minutes * 60 and step < TOTAL:
    params, opt_state, l, parts = train_step(params, opt_state, *batch())
    step += 1; acc.append([float(l)] + [float(v) for v in parts.values()])
    if step % 25 == 0:
        m = np.mean(acc[-25:], 0); print(f"step {step} loss {m[0]:.3f} seg {m[1]:.3f} dice {m[2]:.3f} ident {m[3]:.3f} heat {m[4]:.3f} ({(time.time()-t0)/max(1,len(acc)):.2f}s/step)", flush=True)
    if time.time() - last > 90: save(); last = time.time()
save(); print("saved step", step, "of", TOTAL)
