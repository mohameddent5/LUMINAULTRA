this is v1.0 of the project we pushed it and now its way better we wanted to upload the code to github but it doesnt allow anything above 25 mgb

---

# Neural network in the web app

`lumina_dental_net.onnx` (1.77 MB fp32, 474 KB int8) is executed **in the browser** with
`onnxruntime-web` — no Python, no server-side inference, no CDN.

- Weights: `client/public/models/`
- Runtime wasm: `client/public/ort/` — self-hosted, so a venue wifi that blocks CDNs still works
- Page: `/model` — model card, I/O contract, and a live run over the four bundled 192×128 samples
- Inference layer: `client/src/lib/dentalNet.ts`

Contract (from `export_onnx.py` metadata): input `image` float32 `[1,3,128,192]` RGB 0–1
(the graph normalises `(x-0.5)*4` internally); outputs `seg [1,6,128,192]`,
`ident [1,8,128,192]`, `kp [1,40,32,48]`.

`decode_np` from `model.py`, the group mapping from `gate.py` and the logistic gate in
`visibility_gate.json` are ported to TypeScript line-for-line, so the browser derives the
same landmarks as the Python pipeline (min peak 0.30, multimodal rejection 0.60, weighted
centroid, border rejection).

**Scope:** the network was trained on synthetic renders only and has **not** been validated
on real photographs. `/model` says so on the page; those numbers demonstrate the pipeline
end to end, not clinical accuracy.

# Benchmark tooling

Two Python files were contributed to this repo: `evaluate.py` and `run_synthetic_baseline.py`.
They are part of the *research* toolchain, not the deployed web app. The production image is
Node-only, so nothing in the live site imports them. The live site uses a TypeScript port
(`client/src/lib/benchmark.ts`) that is asserted against the Python output.

## `evaluate.py` — landmark benchmark evaluator

Runs standalone with only `numpy`. This is the authoritative implementation of the metrics.

```bash
python3 evaluate.py gt.json pred.json [tau] [out.json]
```

- `gt.json` — annotation file, schema `lumina.benchmark/1`
- `pred.json` — prediction file, schema `lumina.predictions/1`
- `tau` — acceptance radius in pixels (default `2.0`)

It prints a markdown report and optionally writes JSON. It separates accuracy on
**accepted** landmarks from accuracy on **all** predictions (a visibility gate is only
worthwhile if it improves reliability), and reports gate-probability calibration (ECE)
plus sigma coverage.

## `run_synthetic_baseline.py` — regression baseline

This script does **not** run in this repository. It needs artefacts that were not
committed, and it will fail on import until they exist:

| Required path | Purpose | Present? |
|---|---|---|
| `nn/model.py` | `decode_np` — model output decoding | no |
| `nn/gate.py` | `features`, `softmax`, `GROUP` — visibility gate | no |
| `shards/paired.npz` | held-out paired evaluation set | no |
| `app/public/models/lumina_dental_net.onnx` | the ONNX dental network | no |
| `onnxruntime` | inference runtime (not in `requirements`) | no |

`HERE.parent.parent` also assumes the script lives two levels below the project root, which
is not true here (it is at the repo root). To run it, restore those four paths relative to
the repository root, install `onnxruntime`, and place the script at
`<root>/<subdir>/run_synthetic_baseline.py`.

## Self-test fixture

`script/make_selftest_fixture.py` generates `shared/benchmark-selftest.{gt,pred}.json`
(seed 7, 4 cases, 159 landmarks). It exercises every code path of the evaluator: refused
channels, hidden-but-accepted landmarks, gross errors and gate-probability bins.

**The fixture is synthetic.** The numbers it produces measure the *evaluator*, not the
dental model. No model accuracy is claimed anywhere in this repo, because the trained
network and clinician annotations are not present. Anything shown under `/validation` is
labelled accordingly.

## Parity

```bash
python3 script/make_selftest_fixture.py
python3 evaluate.py shared/benchmark-selftest.gt.json \
    shared/benchmark-selftest.pred.json 2.0 shared/benchmark-selftest.expected.json
npx tsx script/check_benchmark_parity.ts
```

The last command exits non-zero on any mismatch and prints
`PARITY OK — TypeScript port matches evaluate.py on every metric.` when the port is faithful.
