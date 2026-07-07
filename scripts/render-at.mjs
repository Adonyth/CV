import { chromium } from "playwright";
const CAM = Number(process.argv[2]||32400), OUT = process.argv[3]||"/tmp/render-at.png";
const EXTRA = process.env.EXTRA || "";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const p=await b.newPage({viewport:{width:900,height:560}});
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
p.on("pageerror",e=>console.log("PAGEERROR:",e.message));
p.on("crash",()=>console.log("PAGECRASH"));
p.on("console",m=>{const t=m.text(); if(/error|nan|undefined|cannot|exception/i.test(t)) console.log("CONSOLE:",t.slice(0,180));});
try {
  await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=r"+EXTRA,{waitUntil:"networkidle",timeout:90000});
  await p.waitForFunction(()=>window.__space&&window.__space.ready&&window.__space.teleport,null,{timeout:120000});
  await p.evaluate(c=>window.__space.teleport(c),CAM);
  for(let i=0;i<5;i++) await p.evaluate(()=>window.__space.pump(5));
  await p.waitForTimeout(250);
  const info=await p.evaluate(()=>{const s=window.__space,root=s.scene||(s.natal&&s.natal.group);let has=0,fl=0,nan=0;root.traverse(o=>{if(o.name==="LargeScaleStructure"&&o.visible){has=o.geometry.attributes.position.count;const a=o.geometry.attributes.position.array;for(let k=0;k<a.length;k++)if(!isFinite(a[k]))nan++;}if(o.name==="LaniakeaFlow2"&&o.visible)fl=o.geometry.attributes.position.count;});return{camLen:Math.round(s.camera.position.length()),lssPoints:has,flowPoints:fl,nan:nan};});
  console.log(JSON.stringify(info));
  await p.screenshot({path:OUT, timeout:120000});
  console.log("SCREENSHOT_OK");
} catch(e) {
  console.log("FAIL:", e.message);
}
await b.close();
