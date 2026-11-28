/** lesionFlags and bracesCheck on synthetic teeth. Run with `npm run test:flags`. Behaviour pins only, not accuracy claims. */
import { readFileSync } from "fs";
import { lesionFlags, INVESTIGATIONAL } from "../client/src/lib/lesionFlags";
import { bracesSuspected, tooth_hardware } from "../client/src/lib/bracesCheck";
let failed = 0;
const check = (n: string, ok: boolean) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${n}`); if (!ok) failed++; };
type Px = (x: number, y: number) => [number, number, number];
const W = 60, H = 80;
function tooth(id: number, px: Px, bx = 0): any {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px(x, y); const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { id, bx, by: 0, bw: W, bh: H, own: { data, width: W, height: H } };
}
const eng = (teeth: any[]): any => ({ teeth, erased: { data: new Uint8ClampedArray(W * 10 * H * 4).fill(200), width: W * 10, height: H } });
const white: Px = () => [230, 228, 220];
const smooth: Px = (x, y) => [225 + (x % 5), 222, 215 + (y % 4)];
const dark: Px = (x, y) => (x > 18 && x < 42 && y > 25 && y < 55 ? [60, 40, 30] : [230, 228, 220]);
const checker: Px = (x, y) => ((x >> 1) + (y >> 1)) % 2 ? [250, 250, 250] : [20, 20, 20];
const blue: Px = () => [120, 140, 215];
check("null engine: no flags", lesionFlags(null).length === 0);
check("clean teeth: no flags", lesionFlags(eng([tooth(1, white), tooth(2, smooth)])).length === 0);
const f = lesionFlags(eng([tooth(1, white), tooth(2, dark)]));
check("dark interior patch flags only that tooth", f.length === 1 && f[0].id === 2);
check("large dark patch is marked", f[0]?.level === "marked" || f[0]?.level === "possible");
check("border-only dark ring is ignored (gum, shadow)", lesionFlags(eng([tooth(1, (x, y) => (x < 5 || y < 5 || x > 54 || y > 74 ? [30, 20, 20] : [230, 228, 220]))])).length === 0);
check("tiny mask skipped", lesionFlags(eng([{ ...tooth(1, dark), own: { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 } }])).length === 0);
check("hardware share: clean tooth 0", tooth_hardware(tooth(1, white)) === 0);
check("hardware share: checker high", tooth_hardware(tooth(1, checker)) > 0.5);
check("braces: needs 3+ teeth", bracesSuspected(eng([tooth(1, checker), tooth(2, checker)])) === false);
check("braces: null engine false", bracesSuspected(null) === false);
check("braces: clean row false", bracesSuspected(eng([1, 2, 3, 4, 5].map((i) => tooth(i, smooth)))) === false);
check("braces: edge-heavy row true", bracesSuspected(eng([1, 2, 3, 4, 5].map((i) => tooth(i, checker)))) === true);
check("braces: blue-cast row true", bracesSuspected(eng([1, 2, 3, 4, 5].map((i) => tooth(i, blue)))) === true);
check("braces: 1 of 5 edge-heavy false", bracesSuspected(eng([tooth(1, checker), ...[2, 3, 4, 5].map((i) => tooth(i, smooth))])) === false);
check("investigational label present in English and Arabic", /Investigational/.test(INVESTIGATIONAL.en) && /dentist/.test(INVESTIGATIONAL.en) && /[\u0600-\u06FF]/.test(INVESTIGATIONAL.ar));
check("detection unchanged by the label: same flags as before", JSON.stringify(lesionFlags(eng([tooth(1, white), tooth(2, dark)])).map((x) => x.id)) === "[2]");
{
  const src = readFileSync("client/src/pages/studio.tsx", "utf8");
  check("every decay flag surface uses the label (screen, report, CHECK note, tier-C text)", (src.match(/INVESTIGATIONAL\./g) || []).length >= 8);
}
{
  const src2 = readFileSync("client/src/pages/studio.tsx", "utf8");
  check("overlay-refused note exists in English and Arabic and is shown only when shape tools are on and the design is refused", (src2.match(/optNoOverlay/g) || []).length === 3 && /shapeOk && designNote && !designNote\.ok/.test(src2));
}
console.log(failed ? `flags: ${failed} FAILED` : "flags: all checks passed");
process.exit(failed ? 1 : 0);
