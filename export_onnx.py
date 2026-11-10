"""Hand-build the ONNX graph from trained JAX params and verify against JAX and onnxruntime."""
import pickle, pathlib, sys
import numpy as np, onnx, onnxruntime as ort
from onnx import helper, TensorProto as TP, numpy_helper
import jax, jax.numpy as jnp
from model import SPEC, SPEC_BY, forward, H, W, NK

HERE = pathlib.Path(__file__).parent
params = {k: np.asarray(v, np.float32) for k, v in pickle.load(open(HERE / "ckpt.pkl", "rb"))["params"].items()}
nodes, inits = [], []
def const(name, arr): inits.append(numpy_helper.from_array(np.asarray(arr, np.float32 if np.asarray(arr).dtype.kind == "f" else np.int64), name))
for n, _, _, _, _ in SPEC:
    const(n + ".w", params[n + "/w"]); const(n + ".b", params[n + "/b"])
const("c_half", np.array(0.5, np.float32)); const("c_four", np.array(4.0, np.float32))
const("scale2", np.array([1, 1, 2, 2], np.float32))
nodes += [helper.make_node("Sub", ["image", "c_half"], ["x0"]), helper.make_node("Mul", ["x0", "c_four"], ["x"])]
def conv(name, inp, out):
    _, _, _, k, s = SPEC_BY[name]
    nodes.append(helper.make_node("Conv", [inp, name + ".w", name + ".b"], [out + "_c"], kernel_shape=[k, k], strides=[s, s], pads=[k // 2] * 4))
def convrelu(name, inp, out): conv(name, inp, out); nodes.append(helper.make_node("Relu", [out + "_c"], [out]))
def up2(inp, out): nodes.append(helper.make_node("Resize", [inp, "", "scale2"], [out], mode="nearest", coordinate_transformation_mode="asymmetric", nearest_mode="floor"))
convrelu("e0a", "x", "e0a"); convrelu("e0b", "e0a", "e0")
convrelu("e1a", "e0", "e1a"); convrelu("e1b", "e1a", "e1")
convrelu("e2a", "e1", "e2a"); convrelu("e2b", "e2a", "e2")
convrelu("e3a", "e2", "e3a"); convrelu("e3b", "e3a", "e3")
convrelu("e4a", "e3", "e4a"); convrelu("e4b", "e4a", "e4")
up2("e4", "u4"); nodes.append(helper.make_node("Concat", ["u4", "e3"], ["cat3"], axis=1)); convrelu("d3", "cat3", "d3")
up2("d3", "u3"); nodes.append(helper.make_node("Concat", ["u3", "e2"], ["cat2"], axis=1)); convrelu("d2", "cat2", "d2")
convrelu("hm0", "d2", "h"); conv("heat", "h", "heat"); nodes.append(helper.make_node("Sigmoid", ["heat_c"], ["kp"]))
up2("d2", "u2"); nodes.append(helper.make_node("Concat", ["u2", "e1"], ["cat1"], axis=1)); convrelu("d1", "cat1", "d1")
conv("seg", "d1", "seg"); conv("ident", "d1", "ident")
for o in ("seg", "ident"):
    nodes.append(helper.make_node("Resize", [o + "_c", "", "scale2"], [o], mode="linear", coordinate_transformation_mode="half_pixel"))
g = helper.make_graph(nodes, "lumina_dental_net",
    [helper.make_tensor_value_info("image", TP.FLOAT, [1, 3, H, W])],
    [helper.make_tensor_value_info("seg", TP.FLOAT, [1, 6, H, W]), helper.make_tensor_value_info("ident", TP.FLOAT, [1, 8, H, W]), helper.make_tensor_value_info("kp", TP.FLOAT, [1, NK, H // 4, W // 4])], inits)
m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)], producer_name="lumina")
m.ir_version = 9
m.metadata_props.add(key="contract", value="image[1,3,128,192] RGB 0..1; seg[1,6,H,W]; ident[1,8,H,W]; kp[1,40,32,48] stride4 sigmoid")
m.metadata_props.add(key="training", value="synthetic data only (perception/synth.py); NOT validated on real photographs")
onnx.checker.check_model(m)
out = HERE.parent.parent / "app" / "public" / "models"; out.mkdir(parents=True, exist_ok=True)
onnx.save(m, str(out / "lumina_dental_net.onnx"))
sz = (out / "lumina_dental_net.onnx").stat().st_size
# parity check
d = np.load(HERE.parent / "shards" / "val.npz"); imgs = d["img"][:8].astype(np.float32) / 255.0
sess = ort.InferenceSession(str(out / "lumina_dental_net.onnx"), providers=["CPUExecutionProvider"])
worst = [0, 0, 0]
for im in imgs:
    x = np.transpose(im, (2, 0, 1))[None]
    seg, ident, kp = sess.run(None, {"image": x})
    js, ji, jk = [np.asarray(a) for a in forward({k: jnp.asarray(v) for k, v in params.items()}, jnp.asarray(x))]
    worst = [max(worst[0], float(np.abs(seg - js).max())), max(worst[1], float(np.abs(ident - ji).max())), max(worst[2], float(np.abs(kp - jk).max()))]
print("onnx bytes", sz, "max|ort-jax| seg/ident/kp", worst)
