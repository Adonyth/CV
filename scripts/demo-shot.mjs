import { chromium } from "playwright";
const b=await chromium.launch();const p=await b.newPage({viewport:{width:920,height:1000}});
p.on("pageerror",e=>console.log("PE:",e.message.slice(0,110)));
try{ await p.goto("http://127.0.0.1:8123/research/ringdown.html",{waitUntil:"networkidle",timeout:40000});
  await p.waitForTimeout(1200);
  const info=await p.evaluate(()=>{
    const rd=document.querySelector('.rd');
    const rows=[...document.querySelectorAll('.rd-row')].map(r=>r.textContent.replace(/\s+/g,' ').trim());
    return {mounted:!!rd, hasCanvas:!!document.querySelector('.rd-canvas'), rows};
  });
  console.log("DEMO",JSON.stringify(info));
  // move the spin slider and re-read
  await p.evaluate(()=>{const s=document.querySelector('.rd-spin');s.value='0.95';s.dispatchEvent(new Event('input'))});
  await p.waitForTimeout(300);
  const after=await p.evaluate(()=>[...document.querySelectorAll('.rd-row')].map(r=>r.textContent.replace(/\s+/g,' ').trim()));
  console.log("AT_a=0.95",JSON.stringify(after));
  await p.screenshot({path:"/tmp/ringdown-demo.png"});
}catch(e){console.log("FAIL",e.message.slice(0,120));}
await b.close();
