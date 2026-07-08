import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const p=await b.newPage({viewport:{width:640,height:400}});
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
try{
  await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=r",{waitUntil:"networkidle",timeout:90000});
  await p.waitForFunction(()=>window.__space&&window.__space.ready,null,{timeout:90000});
  await p.waitForTimeout(3500);
  const a=await p.evaluate(()=>{
    const s=window.__space;
    const ns=s.natal;
    let gp={};
    try{ if(ns&&ns.getPlanetDir){ const su=ns.getPlanetDir("sun"),mo=ns.getPlanetDir("moon");
      gp={sun:su&&[+su.x.toFixed(2),+su.y.toFixed(2),+su.z.toFixed(2)],moon:mo&&[+mo.x.toFixed(2),+mo.y.toFixed(2),+mo.z.toFixed(2)]}; } }catch(e){gp={err:String(e).slice(0,60)};}
    return {align:s.align||null,alignErr:s.alignError||null,hasArm:!!s.natal, hasGetPlanetDir: !!(ns&&ns.getPlanetDir), gp};
  });
  console.log("STATE",JSON.stringify(a));
}catch(e){console.log("FAIL",e.message.slice(0,120));}
await b.close();
