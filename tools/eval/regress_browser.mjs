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
  const r = await p.evaluate(async (d, mime, W, DEG, NOUP) => { window.__UP = !NOUP; window.__RETRY = false;
    const img = new Image(); img.src = `data:${mime};base64,${d}`; await img.decode();
    const sc = (window.__UP ? W / img.naturalWidth : Math.min(1, W / img.naturalWidth)); const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    { const g2 = c.getContext("2d"); if (DEG === 'lowres') { const t = document.createElement('canvas'); t.width = Math.round(c.width/3); t.height = Math.round(c.height/3); t.getContext('2d').drawImage(img,0,0,t.width,t.height); g2.drawImage(t,0,0,c.width,c.height); } else { if (DEG) g2.filter = DEG; g2.drawImage(img, 0, 0, c.width, c.height); } }
    for (let i = 0; i < 50 && !window.__sam; i++) await new Promise(r => setTimeout(r, 200));
    let res = await window.__sam(c, null);
    if (!res && window.__RETRY) for (const f of [0.8, 1.25]) { const c2 = document.createElement("canvas"); c2.width = Math.round(c.width * f); c2.height = Math.round(c.height * f); c2.getContext("2d").drawImage(c, 0, 0, c2.width, c2.height); res = await window.__sam(c2, null); if (res) { res.borders = res.borders.map(x => x / f); res.w = c.width; break; } }
    if (res && res.scale) { res.borders = res.borders.map(x => x / res.scale); }
    return res ? { w: c.width, count: res.count, borders: res.borders, boxes: res.boxes, lower: res.lowerBoxes } : null;
  }, data, mime, W, process.env.DEG || '', !!process.env.NOUP);
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
