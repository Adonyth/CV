import { chromium } from "playwright";
const b = await chromium.launch({ headless:true, args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
p.on("pageerror",e=>console.error("PAGEERR:",e.message));
await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=sweep",{waitUntil:"networkidle",timeout:120000});
await p.waitForFunction(()=>window.__space&&window.__space.ready&&window.__space.teleport,null,{timeout:180000});
const WATCH = ["MilkyWayGalaxy","LocalGroupCloud","LocalSheetCloud","VirgoSC","LaniakeaFlow","CosmicWebCloud"];
const CAMS = [3500,5000,7000,9200,12000,16000,21300,27000,32450];
const rows=[];
for(const cl of CAMS){
  try{
    await p.evaluate(r=>window.__space.teleport(r),cl);
    for(let i=0;i<14;i++) await p.evaluate(()=>window.__space.pump(8));
    await p.waitForTimeout(150);
    const r = await p.evaluate((names)=>{
      const s=window.__space, root=s.scene||(s.natal&&s.natal.group);
      function eff(o){for(var q=o;q;q=q.parent){if(!q.visible)return false;}return true;}
      const out={};
      root.traverse(o=>{ if(names.indexOf(o.name)>=0){ const m=Array.isArray(o.material)?o.material[0]:o.material;
        out[o.name]={vis:eff(o), sc:+(Math.abs(o.scale.x)).toFixed(3), op:m?+(+m.opacity).toFixed(2):null}; } });
      return {camLen:Math.round(s.camera.position.length()), tier:window.CosmicLOD.currentLayerId(s.camera.position.length()), objs:out};
    }, WATCH);
    rows.push(r);
  }catch(e){ rows.push({camLen:cl, err:String(e).slice(0,80)}); }
}
console.log("RESULT "+JSON.stringify(rows));
await b.close();
