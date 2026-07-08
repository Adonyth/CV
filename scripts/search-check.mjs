import { chromium } from "playwright";
const b=await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader","--use-angle=swiftshader"]});
const p=await b.newPage({viewport:{width:900,height:600}});
p.on("pageerror",e=>console.log("PE:",e.message.slice(0,100)));
try{
  await p.goto("http://127.0.0.1:8123/index.html",{waitUntil:"domcontentloaded",timeout:60000});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>window.__openSearch&&window.__openSearch());
  await p.waitForTimeout(400);
  await p.fill(".sf-in","born");
  await p.waitForTimeout(300);
  const r=await p.evaluate(()=>{const rows=[...document.querySelectorAll(".sf-row")].map(a=>({t:a.querySelector("span").textContent,h:a.getAttribute("href")}));return {open:document.querySelector(".sf-ov").classList.contains("on"),n:rows.length,rows:rows.slice(0,4)};});
  console.log("SEARCH",JSON.stringify(r));
}catch(e){console.log("FAIL",e.message.slice(0,120));}
await b.close();
