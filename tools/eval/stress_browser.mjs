// Browser stress run: node stress_browser.mjs IMG... (prod build on :5057). Screenshots go to /downloads as *.private.png, never to git.
import puppeteer from "puppeteer-core";
const imgs=process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const base="http://localhost:5057"; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const p0 = await b.newPage(); await p0.setViewport({ width: 1100, height: 900 });
await p0.goto(base,{waitUntil:"networkidle2"});
if (await p0.$("input[placeholder=Username]")) { await p0.type("input[placeholder=Username]","dr"+Date.now()); await p0.type("input[type=password]","longenough1"); await p0.click("button[type=submit]"); await sleep(2500);
  if (await p0.$("input[placeholder=Username]")) { await p0.click("button[type=button].text-xs"); await p0.click("button[type=submit]"); await sleep(2500);} }
const cookies=await p0.cookies();
for (const f of imgs) {
  const id=f.split("/").pop().replace(/\..*/,"");
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 900 }); await p.setCookie(...cookies);
  const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  const click=(re)=>p.evaluate((s)=>{const e=[...document.querySelectorAll("button")].find(b=>new RegExp(s).test(b.textContent)); if(e) e.click(); return !!e;}, re);
  await p.goto(base,{waitUntil:"networkidle2"}); await sleep(1500);
  await p.type("#pname","Stress"); await p.click("input[type=checkbox]"); await click("Next"); await sleep(400);
  const t0=Date.now();
  await (await p.$("[data-testid=photo-input]")).uploadFile(f);
  let txt="";
  for (let i=0;i<30;i++){ await sleep(3000); txt=await p.evaluate(()=>document.body.innerText.replace(/\n+/g," | ")); if(/Preview confidence|Clinician details|Retake|retake|could not|No teeth/i.test(txt)&&!/Reading each tooth|Finding the smile/.test(txt)) break; }
  await sleep(1500);
  await p.screenshot({path:`/downloads/stress_${id}.private.png`});
  console.log("==",id,Math.round((Date.now()-t0)/1000)+"s", txt.slice(150,1100), "ERR:", errs.join("|")||"none");
  await p.close();
}
await b.close();
