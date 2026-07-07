import { chromium } from "playwright";
const EXTRA = process.env.EXTRA || "";
const CAM = Number(process.argv[2] || 0);
const b = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
await p.addInitScript(() => { try { localStorage.setItem("cv-motion","calm"); } catch(e){} });
const errs = [];
p.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
p.on("crash", () => errs.push("PAGECRASH"));
p.on("console", m => { const t = m.text(); if (/error|nan|undefined|cannot|exception|fail|throw/i.test(t) && !/GSAP|ReadPixels|GL Driver/i.test(t)) errs.push("CONSOLE: " + t.slice(0,160)); });
try {
  await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=d" + EXTRA, { waitUntil: "domcontentloaded", timeout: 60000 });
  let ready = false;
  try { await p.waitForFunction(() => window.__space && window.__space.ready, null, { timeout: 40000 }); ready = true; } catch(e){ errs.push("READY_TIMEOUT"); }
  const info = await p.evaluate(() => {
    const s = window.__space || {};
    let lss = 0; try { const root = s.scene; root && root.traverse(o => { if (o.name === "LargeScaleStructure") lss = o.geometry.attributes.position.count; }); } catch(e){}
    return { ready: !!s.ready, natalError: s.natalError || null, hasTeleport: !!s.teleport, lssPoints: lss, camLen: s.camera ? Math.round(s.camera.position.length()) : null };
  });
  console.log("INFO", JSON.stringify(info));
  if (CAM && info.hasTeleport) {
    try {
      await p.evaluate(c => window.__space.teleport(c), CAM);
      for (let i=0;i<4;i++) await p.evaluate(() => window.__space.pump(6));
      const after = await p.evaluate(() => { const s=window.__space; let lss=0,nan=0; s.scene.traverse(o=>{if(o.name==="LargeScaleStructure"){lss=o.geometry.attributes.position.count;const a=o.geometry.attributes.position.array;for(let k=0;k<Math.min(a.length,120000);k++)if(!isFinite(a[k]))nan++;}}); return {camLen:Math.round(s.camera.position.length()),lssPoints:lss,nan}; });
      console.log("AFTER_TELEPORT", JSON.stringify(after));
    } catch(e) { console.log("TELEPORT_FAIL:", e.message.slice(0,120)); }
  }
} catch(e) { console.log("LOAD_FAIL:", e.message.slice(0,160)); }
console.log("ERRS", JSON.stringify(errs.slice(0,10)));
await b.close();
