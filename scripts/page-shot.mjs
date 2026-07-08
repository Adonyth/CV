import { chromium } from "playwright";
const b=await chromium.launch();const p=await b.newPage({viewport:{width:900,height:900}});
p.on("pageerror",e=>console.log("PE:",e.message.slice(0,100)));
try{ await p.goto("http://127.0.0.1:8123/research/paperD.html",{waitUntil:"networkidle",timeout:40000});
  await p.waitForTimeout(600);
  const info=await p.evaluate(()=>({cite:!!document.querySelector('.cite'),bib:!!document.querySelector('.bibtex'),title:document.title.slice(0,40)}));
  console.log("PAGE",JSON.stringify(info));
  await p.screenshot({path:"/tmp/paperD-shot.png",fullPage:false});
}catch(e){console.log("FAIL",e.message.slice(0,100));}
await b.close();
