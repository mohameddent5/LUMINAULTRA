// usage: node regress.mjs TAG name1 name2 ...   writes /tmp/reg_TAG/<name>.json  (needs window.__sam build on :5058)
import puppeteer from "puppeteer-core"; import fs from "fs";
const [tag, ...names] = process.argv.slice(2); const W = Number(process.env.SCORE_W || 1280);
const man = JSON.parse(fs.readFileSync("/downloads/border-manifest.private.json","utf8"));
fs.mkdirSync(`/tmp/reg_${tag}`, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto("http://localhost:5058/", { waitUntil: "networkidle2" });
for (const it of man.filter(x => names.includes(x.name))) {
  const data = fs.readFileSync(it.photo).toString("base64");
  const mime = it.photo.endsWith(".png") ? "image/png" : "image/jpeg";
  const r = await p.evaluate(async (d, mime, W) => {
    const img = new Image(); img.src = `data:${mime};base64,${d}`; await img.decode();
    const sc = Math.min(1, W / img.naturalWidth); const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    for (let i = 0; i < 50 && !window.__sam; i++) await new Promise(r => setTimeout(r, 200));
    const res = await window.__sam(c, null);
    return res ? { w: c.width, count: res.count, borders: res.borders, boxes: res.boxes, lower: res.lowerBoxes } : null;
  }, data, mime, W);
  const truth = it.truth, TOL = 14;
  let row = { name: it.name, truthN: truth.length, refused: !r };
  if (r) {
    const f = r.borders.map(x => x * (1280 / r.w));
    const hit = truth.filter(t => f.some(c => Math.abs(c - t) <= TOL)).length;
    const good = f.filter(c => truth.some(t => Math.abs(c - t) <= TOL)).length;
    const errs = truth.map(t => Math.min(...f.map(c => Math.abs(c - t)))).sort((a, b) => a - b);
    row = { ...row, found: f.length, hits: hit, recall: hit / truth.length, precision: f.length ? good / f.length : null, medErr: Math.round(errs[Math.floor(errs.length / 2)]), teeth: r.count, lower: (r.lower || []).length, borders: f.map(Math.round) };
  }
  fs.writeFileSync(`/tmp/reg_${tag}/${it.name}.json`, JSON.stringify(row));
  console.log(JSON.stringify({ ...row, borders: undefined }));
}
await b.close();
