import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader"]});
const p=await b.newPage({viewport:{width:1000,height:640}});
try{
  await p.goto("http://127.0.0.1:8123/index.html",{waitUntil:"domcontentloaded",timeout:60000});
  await p.waitForTimeout(2000);
  await p.evaluate(()=>window.__openSearch&&window.__openSearch());
  await p.waitForTimeout(400); await p.fill(".sf-in","quantum");
  await p.waitForTimeout(400); await p.screenshot({path:"/tmp/search-shot.png"});
  console.log("shot ok");
}catch(e){console.log("FAIL",e.message.slice(0,100));}
await b.close();
