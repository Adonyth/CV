import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=lc",{waitUntil:"networkidle",timeout:120000});
await p.waitForFunction(()=>window.__space&&window.__space.ready&&window.__space.teleport,null,{timeout:180000});
const TIERS=[["milky-way",3500],["local-group",9200],["local-sheet",14000],["virgo",21300],["laniakea",32400],["cosmic-web",49300]];
for(const [name,cl] of TIERS){
  await p.evaluate(r=>window.__space.teleport(r),cl);
  for(let i=0;i<16;i++) await p.evaluate(()=>window.__space.pump(8));
  await p.waitForTimeout(150);
  const r=await p.evaluate(()=>{
    const s=window.__space,cam=s.camera,root=s.scene||(s.natal&&s.natal.group);
    cam.updateMatrixWorld(true);
    const view=cam.matrixWorldInverse.elements,proj=cam.projectionMatrix.elements;
    function mul(m,x,y,z,w){return[m[0]*x+m[4]*y+m[8]*z+m[12]*w,m[1]*x+m[5]*y+m[9]*z+m[13]*w,m[2]*x+m[6]*y+m[10]*z+m[14]*w,m[3]*x+m[7]*y+m[11]*z+m[15]*w];}
    function eff(o){for(var q=o;q;q=q.parent){if(!q.visible)return false;}return true;}
    const out=[];
    root.traverse(o=>{if(!(o.isPoints||o.isSprite||o.isMesh)||!eff(o))return;o.updateWorldMatrix(true,false);const e=o.matrixWorld.elements;const cc=mul(proj,...mul(view,e[12],e[13],e[14],1));if(cc[3]<=0)return;let wr=0;const sc=Math.max(Math.abs(e[0]),Math.abs(e[5]),Math.abs(e[10]));if(o.isSprite)wr=o.scale.x*0.5;else if(o.geometry){if(!o.geometry.boundingSphere){try{o.geometry.computeBoundingSphere()}catch(x){}}wr=(o.geometry.boundingSphere?o.geometry.boundingSphere.radius:0)*sc;}const dist=Math.hypot(e[12]-cam.matrixWorld.elements[12],e[13]-cam.matrixWorld.elements[13],e[14]-cam.matrixWorld.elements[14]);const px=wr&&dist?wr/dist*900:0;const m=Array.isArray(o.material)?o.material[0]:o.material;out.push({n:o.name||o.type,px:Math.round(px),op:m?+(+m.opacity).toFixed(2):0});});
    out.sort((a,b)=>b.px-a.px);
    return {camLen:Math.round(cam.position.length()),top:out.filter(o=>o.op>0.05).slice(0,5)};
  });
  console.log(name.padEnd(12)+" cam"+r.camLen+" → "+r.top.map(o=>`${o.n}(px${o.px}/op${o.op})`).join("  "));
}
await b.close();
