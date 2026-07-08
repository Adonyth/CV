import { chromium } from "playwright";
const b=await chromium.launch();const p=await b.newPage({viewport:{width:820,height:640}});
p.on("pageerror",e=>console.log("PE:",e.message.slice(0,90)));
try{ await p.goto("http://127.0.0.1:8123/updates.html",{waitUntil:"networkidle",timeout:40000});
  await p.waitForTimeout(700);
  const n=await p.evaluate(()=>document.querySelectorAll("#feed li").length);
  console.log("FEED items:",n);
  await p.screenshot({path:"/tmp/updates-shot.png"});
}catch(e){console.log("FAIL",e.message.slice(0,100));}
await b.close();
