import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  MODEL_CARD,
  NET_H,
  NET_W,
  type DecodedResult,
  type LoadedNet,
  type NetOutputs,
  decodeAndGate,
  loadDentalNet,
  preprocess,
  runDentalNet,
  segArgmax,
  SEG_PALETTE,
} from "@/lib/dentalNet";

const SAMPLES = [
  { file: "/samples/img0.png", label: "easy" },
  { file: "/samples/img1.png", label: "shadow" },
  { file: "/samples/img2.png", label: "specular" },
  { file: "/samples/img3.png", label: "compression" },
];

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg leading-tight text-foreground">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{k}</span>
      <span className="text-right font-mono text-xs text-foreground">{v}</span>
    </div>
  );
}

function drawResult(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  outputs: NetOutputs,
  result: DecodedResult,
) {
  const scale = 3;
  const width = NET_W * scale;
  const height = NET_H * scale;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, width, height);

  const [sc, sh, sw] = outputs.segDims;
  if (sc > 0 && sh > 0 && sw > 0) {
    const classes = segArgmax(outputs.seg, sc, sh, sw);
    const mask = document.createElement("canvas");
    mask.width = sw;
    mask.height = sh;
    const mctx = mask.getContext("2d");
    if (mctx) {
      const image = mctx.createImageData(sw, sh);
      for (let i = 0; i < classes.length; i += 1) {
        const cls = classes[i];
        const rgb = SEG_PALETTE[cls] ?? [255, 255, 255];
        const o = i * 4;
        image.data[o] = rgb[0];
        image.data[o + 1] = rgb[1];
        image.data[o + 2] = rgb[2];
        image.data[o + 3] = cls === 0 ? 0 : 105;
      }
      mctx.putImageData(image, 0, 0);
      ctx.drawImage(mask, 0, 0, width, height);
    }
  }

  const kx = width / NET_W;
  const ky = height / NET_H;
  for (const lm of result.landmarks) {
    const x = (lm.x + 0.5) * kx;
    const y = (lm.y + 0.5) * ky;
    ctx.beginPath();
    ctx.arc(x, y, lm.accepted ? 4 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = lm.accepted ? "#10b981" : "#f59e0b";
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.stroke();
  }
}

export default function Model() {
  const [net, setNet] = useState<LoadedNet | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [outputs, setOutputs] = useState<NetOutputs | null>(null);
  const [result, setResult] = useState<DecodedResult | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [sample, setSample] = useState(0);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadState("loading");
    setLoadError(null);
    setNet(null);
    loadDentalNet()
      .then((loaded) => {
        if (!alive) return;
        setNet(loaded);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const execute = useCallback(
    async (img: HTMLImageElement) => {
      if (!net) return;
      setRunState("running");
      setRunError(null);
      try {
        const chw = preprocess(img);
        const out = await runDentalNet(net, chw);
        const decoded = decodeAndGate(out);
        setOutputs(out);
        setResult(decoded);
        if (canvasRef.current) drawResult(canvasRef.current, img, out, decoded);
        setRunState("done");
      } catch (err: unknown) {
        setRunError(err instanceof Error ? err.message : String(err));
        setRunState("error");
      }
    },
    [net],
  );

  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (img && net) void execute(img);
  }, [execute, net]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-5 flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-xl font-semibold tracking-tight">Neural Network</h1>
        </div>

        <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="text-sm font-medium text-amber-300">
            Real network weights — synthetic-only training
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            These are genuine outputs from the exported network, executed in your browser. The model was
            trained on synthetic renders only and has not been validated on real photographs. Treat the
            landmarks as a demonstration of the pipeline, not as measured clinical accuracy.
          </p>
        </div>

        <section className="mb-5 rounded-lg border border-border/60 bg-card/40 p-4">
          <h2 className="mb-2 text-sm font-semibold">Model card</h2>
          <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
            <div>
              <Row k="Weights" v={`${MODEL_CARD.file} · ${(MODEL_CARD.bytes / 1e6).toFixed(2)} MB`} />
              <Row k="Quantised" v={`lumina_dental_net.int8.onnx · ${(MODEL_CARD.int8Bytes / 1e3).toFixed(0)} KB`} />
              <Row k="Runtime" v="onnxruntime-web · wasm, self-hosted" />
              <Row k="Opset" v={String(MODEL_CARD.opset)} />
            </div>
            <div>
              <Row k="Input" v={`${MODEL_CARD.input} ${MODEL_CARD.inputShape} RGB 0–1`} />
              <Row k="seg" v={MODEL_CARD.outputs[0].shape} />
              <Row k="ident" v={MODEL_CARD.outputs[1].shape} />
              <Row k="kp" v={MODEL_CARD.outputs[2].shape} />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Decoding ports <span className="font-mono">decode_np</span> from model.py (min peak 0.30,
            multimodal rejection 0.60, weighted centroid). Visibility uses the exported logistic gate in{" "}
            <span className="font-mono">visibility_gate.json</span>.
          </p>
        </section>

        <section className="rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Live inference</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {SAMPLES.map((s, i) => (
                <button
                  key={s.file}
                  type="button"
                  onClick={() => setSample(i)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    i === sample
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                disabled={!net || runState === "running"}
                onClick={() => {
                  const img = imgRef.current;
                  if (img) void execute(img);
                }}
                className="rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-40"
              >
                Re-run
              </button>
            </div>
          </div>

          <div className="mb-3 text-xs text-muted-foreground">
            {loadState === "loading" && "Loading weights and wasm runtime…"}
            {loadState === "ready" && net && (
              <>
                Model ready in <span className="font-mono text-foreground">{net.loadMs.toFixed(0)} ms</span>
                {" · "}
                input <span className="font-mono text-foreground">{net.inputName}</span>
                {" · "}
                outputs <span className="font-mono text-foreground">{net.outputNames.join(", ")}</span>
              </>
            )}
            {loadState === "error" && (
              <span className="text-amber-300">
                Could not load the model: {loadError}{" "}
                <button type="button" onClick={retry} className="underline hover:text-foreground">
                  Retry
                </button>
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="overflow-hidden rounded-md border border-border/60 bg-black/40">
              <canvas ref={canvasRef} className="block h-auto w-full" aria-label="Network output overlay" />
              {runState !== "done" && (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  {runState === "running" ? "Running inference…" : "Waiting for model…"}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <StatTile
                label="Inference"
                value={outputs ? `${outputs.inferMs.toFixed(0)} ms` : "—"}
                hint="single 192×128 forward pass"
              />
              <StatTile
                label="Decoded"
                value={result ? `${result.decoded} / ${result.total}` : "—"}
                hint="channels with a valid peak"
              />
              <StatTile
                label="Gate accepted"
                value={result ? `${result.accepted}` : "—"}
                hint={result ? `${result.refused} refused by decode` : "visibility gate"}
              />
            </div>
          </div>

          {runState === "error" && (
            <p className="mt-3 text-xs text-amber-300">Inference failed: {runError}</p>
          )}

          {result && result.landmarks.length > 0 && (
            <div className="mt-4 max-h-64 overflow-auto rounded-md border border-border/60">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-card/90 backdrop-blur">
                  <tr className="text-muted-foreground">
                    <th className="px-3 py-1.5 font-medium">ch</th>
                    <th className="px-3 py-1.5 font-medium">group</th>
                    <th className="px-3 py-1.5 font-medium">x</th>
                    <th className="px-3 py-1.5 font-medium">y</th>
                    <th className="px-3 py-1.5 font-medium">peak</th>
                    <th className="px-3 py-1.5 font-medium">gate p</th>
                    <th className="px-3 py-1.5 font-medium">status</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.landmarks.map((lm) => (
                    <tr key={lm.channel} className="border-t border-border/40">
                      <td className="px-3 py-1">{lm.channel}</td>
                      <td className="px-3 py-1 text-muted-foreground">{lm.group}</td>
                      <td className="px-3 py-1">{lm.x.toFixed(1)}</td>
                      <td className="px-3 py-1">{lm.y.toFixed(1)}</td>
                      <td className="px-3 py-1">{lm.peak.toFixed(3)}</td>
                      <td className="px-3 py-1">{lm.gateP === null ? "—" : lm.gateP.toFixed(3)}</td>
                      <td className={`px-3 py-1 ${lm.accepted ? "text-emerald-400" : "text-amber-400"}`}>
                        {lm.accepted ? "accepted" : "gated"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          The network runs entirely on your device. No image ever leaves the browser — there is no upload
          endpoint and no server-side inference.
        </p>
      </div>

      <img
        ref={imgRef}
        src={SAMPLES[sample].file}
        alt=""
        aria-hidden="true"
        onLoad={onImageLoad}
        className="hidden"
      />
    </div>
  );
}
