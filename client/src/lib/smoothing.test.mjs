// Run: npx tsx client/src/lib/smoothing.test.mjs
import { OneEuroFilter, MeasurementStabilizer } from "./smoothing.ts";
import assert from "node:assert";
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const f = new OneEuroFilter(); let rawVar = 0, outVar = 0, n = 0;
for (let i = 0; i < 300; i++) {
  const raw = 0.5 + (rnd() - 0.5) * 0.01; const out = f.filter(raw, i * 33);
  if (i > 30) { rawVar += (raw - 0.5) ** 2; outVar += (out - 0.5) ** 2; n++; }
}
console.log("jitter std raw/filtered:", Math.sqrt(rawVar / n).toFixed(5), Math.sqrt(outVar / n).toFixed(5));
assert(outVar < rawVar * 0.3, "filter should cut still-jitter by >70% variance");
const g = new OneEuroFilter(); let last = 0;
for (let i = 0; i < 30; i++) last = g.filter(i < 15 ? 0.2 : 0.8, i * 33);
assert(last > 0.7, "filter must follow a real step quickly"); 
const st = new MeasurementStabilizer(15);
for (let i = 0; i < 15; i++) st.push("x", i === 7 ? 500 : 50 + (rnd() - 0.5));
assert(Math.abs(st.value("x") - 50) < 1, "median rejects a spike");
assert(st.stability("x", 5) > 80, "spike does not ruin stability");
for (let i = 0; i < 15; i++) st.push("y", rnd() * 100);
assert(st.stability("y", 5) < 20, "noisy signal has low stability");
console.log("ok");
