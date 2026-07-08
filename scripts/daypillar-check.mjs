import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist"]});
const p=await b.newPage({viewport:{width:640,height:400}});
await p.addInitScript(()=>{try{localStorage.setItem("cv-motion","calm")}catch(e){}});
try{
  await p.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=r",{waitUntil:"networkidle",timeout:90000});
  await p.waitForFunction(()=>window.__space&&window.__space.ready&&window.__space.teleport,null,{timeout:90000});
  await p.evaluate(()=>window.__space.teleport(150));
  for(let i=0;i<8;i++) await p.evaluate(()=>window.__space.pump(4));
  await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
    let sc=window.__space.natal&&window.__space.natal.group; while(sc&&sc.parent)sc=sc.parent;
    if(!sc) return {err:"no scene"};
    const get=(nm)=>{let f=null; sc.traverse(o=>{if(!f&&o.name===nm)f=o;}); return f;};
    const wp=(o)=>{ if(!o) return null; o.updateWorldMatrix(true,false); const e=o.matrixWorld.elements; return [e[12],e[13],e[14]]; };
    const sub=(a,b2)=>[a[0]-b2[0],a[1]-b2[1],a[2]-b2[2]];
    const nrm=(a)=>{const L=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/L,a[1]/L,a[2]/L];};
    const dot=(a,b2)=>a[0]*b2[0]+a[1]*b2[1]+a[2]*b2[2];
    const names=[]; sc.traverse(o=>{if(o.name&&(o.name.indexOf("DayPillar")===0||o.name==="NyeMoon"||o.name.indexOf("NyeEarth")===0))names.push(o.name);});
    const earth=get("NyeEarthMesh")||get("NyeEarth"); const moon=get("NyeMoon");
    const wu=get("DayPillarGearBranchGlyph_午"); const geng=get("DayPillarGearStemGlyph_庚");
    const e=wp(earth),m=wp(moon),wuP=wp(wu),gP=wp(geng);
    const out={names:names.slice(0,16), hasEarth:!!earth,hasMoon:!!moon,hasWu:!!wu,hasGeng:!!geng};
    if(e&&m){const em=nrm(sub(m,e));
      if(wuP){out.wuDotMoon=+dot(nrm(sub(wuP,e)),em).toFixed(3); out.wuAngleDeg=+(Math.acos(Math.max(-1,Math.min(1,out.wuDotMoon)))*180/Math.PI).toFixed(1);}
      if(gP){out.gengDotMoon=+dot(nrm(sub(gP,e)),em).toFixed(3);}
    }
    return out;
  });
  console.log("DAYPILLAR",JSON.stringify(r));
}catch(e){console.log("FAIL",e.message.slice(0,140));}
await b.close();
