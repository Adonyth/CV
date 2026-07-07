import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
p.on("pageerror",e=>console.log("PAGEERR>",e.message)); p.on("crash",()=>console.log("CRASH>"));
await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=d2",{waitUntil:"networkidle",timeout:90000});
await p.waitForFunction(()=>window.__space&&window.__space.ready&&window.__space.teleport,null,{timeout:120000});
console.log("booted");
for (const cam of [4200, 12000, 22000, 30000]) {
  const r = await p.evaluate((c)=>{ try { window.__space.teleport(c); for(let i=0;i<6;i++) window.__space.pump(6); const s=window.__space,root=s.scene||(s.natal&&s.natal.group); let n=0; root.traverse(o=>{if(o.name==="LargeScaleStructure")n=o.geometry.attributes.position.count;}); return "ok cam="+Math.round(s.camera.position.length())+" pts="+n; } catch(e){ return "THROW: "+String(e).slice(0,150); } }).catch(e=>"EVAL-FAIL(crash?): "+String(e).slice(0,100));
  console.log("cam"+cam+":", r);
  if (String(r).includes("FAIL")) break;
}
// now try a screenshot at a settled mid framing
try { await p.evaluate(()=>window.__space.teleport(20000)); for(let i=0;i<8;i++) await p.evaluate(()=>window.__space.pump(6)); await p.screenshot({path:"/tmp/lss-20k.png",timeout:60000}); console.log("screenshot ok /tmp/lss-20k.png"); } catch(e){ console.log("screenshot FAIL:", String(e).slice(0,120)); }
await b.close();
