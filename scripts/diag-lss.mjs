import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
p.on("pageerror",e=>console.log("PAGEERR>",e.message));
p.on("console",m=>{ if(m.type()==="error"&&!/429|Failed to load/.test(m.text())) console.log("CONSOLE>",m.text().slice(0,160)); });
p.on("crash",()=>console.log("CRASH> renderer crashed"));
await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=d",{waitUntil:"networkidle",timeout:90000});
await p.waitForFunction(()=>window.__space&&window.__space.ready&&window.__space.teleport,null,{timeout:120000});
console.log("booted ok");
// wrap teleport in page-side try so a JS throw is caught & reported (not a silent crash)
const r = await p.evaluate(()=>{ try { window.__space.teleport(4200); window.__space.pump(4); return "teleport ok"; } catch(e){ return "THROW: "+String(e).slice(0,200); } }).catch(e=>"EVAL-FAIL: "+String(e).slice(0,120));
console.log("teleport4200:", r);
await new Promise(r=>setTimeout(r,800));
const r2 = await p.evaluate(()=>{ try { for(let i=0;i<8;i++) window.__space.pump(6); const s=window.__space,root=s.scene||(s.natal&&s.natal.group); let c=0; root.traverse(o=>{if(o.name==="LargeScaleStructure")c=o.geometry.attributes.position.count;}); return "lssPoints="+c+" cam="+Math.round(s.camera.position.length()); } catch(e){ return "THROW2: "+String(e).slice(0,200); } }).catch(e=>"EVAL2-FAIL: "+String(e).slice(0,120));
console.log("after-pump:", r2);
await b.close();
