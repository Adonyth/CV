import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("crash",()=>errs.push("PAGE CRASHED"));
await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=iso",{waitUntil:"networkidle",timeout:90000});
await p.waitForFunction(()=>window.__space&&window.__space.ready,null,{timeout:120000});
// directly call the builder in isolation, catching any throw
const r = await p.evaluate(()=>{
  try {
    const s=window.__space, n=s.natal;
    if(!n) return {err:"no natal"};
    // teleport small to trigger ensureMidLayers via the tick
    s.teleport(5000);
    for(let i=0;i<6;i++) s.pump(6);
    const root=s.scene||n.group; let cnt=0, bad=0;
    root.traverse(o=>{ if(o.name==="LargeScaleStructure"){ cnt=o.geometry.attributes.position.count; const a=o.geometry.attributes.position.array; for(let k=0;k<a.length;k++) if(!isFinite(a[k])) bad++; } });
    return {lssPoints:cnt, nonFinite:bad, camLen:Math.round(s.camera.position.length())};
  } catch(e){ return {err:String(e).slice(0,200)}; }
});
console.log("RESULT "+JSON.stringify(r));
console.log("ERRORS "+JSON.stringify(errs.slice(0,3)));
await b.close();
