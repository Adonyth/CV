// cv.html → cv.pdf (A4, print media). Run from the repo root, with a static server on the repo root:
//   python3 -m http.server 8123 --bind 127.0.0.1      (another shell; stop it afterwards)
//   node scripts/gen-cv-pdf.mjs
// Optional environment:
//   CV_PORT            port of the local static server                      (default 8123)
//   CV_SHOT            where the full-page print-media screenshot is written (default /tmp/cv-print.png)
//   PLAYWRIGHT_MODULE  path to playwright's index.mjs when it is not installed beside this checkout
//                      (a git worktree has no node_modules of its own)
// Standing rules: the PDF never carries a local address, and it embeds open-licence fonts only.
// (first rule:) the PDF never carries a local address. cv.html links to the site's own pages with
// absolute https://jiaxuanchen.pages.dev/… URLs, and this script exits non-zero if any link in the
// PDF still points at 127.0.0.1 / localhost / a file: URL.
import { readFileSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const port = process.env.CV_PORT || "8123";
const shot = process.env.CV_SHOT || "/tmp/cv-print.png";
const b=await chromium.launch();const p=await b.newPage();
p.on("pageerror",e=>console.log("PE:",e.message.slice(0,90)));
await p.goto(`http://127.0.0.1:${port}/cv.html`,{waitUntil:"networkidle",timeout:60000});
await p.emulateMedia({media:"print"});
// the print layout shows text the screen layout does not, so its web-font slices are requested only now: wait for them,
// or the PDF would embed whatever system font stood in for a moment
await p.waitForLoadState("networkidle");
await p.evaluate(async()=>{await document.fonts.ready;});
await p.waitForTimeout(1200);
await p.evaluate(async()=>{await document.fonts.ready;});
await p.screenshot({path:shot,fullPage:true});
await p.pdf({path:"cv.pdf",format:"A4",printBackground:true,margin:{top:"14mm",bottom:"14mm",left:"14mm",right:"14mm"}});
await b.close();
const uris=[...readFileSync("cv.pdf").toString("latin1").matchAll(/\/URI \(([^)]+)\)/g)].map(m=>m[1]);
const local=uris.filter(u=>/127\.0\.0\.1|localhost|\[::1\]|^file:/i.test(u));
console.log(`cv.pdf written (${uris.length} links) + ${shot}`);
if(local.length){console.error("LOCAL ADDRESS IN cv.pdf — make these links absolute in cv.html:\n  "+local.join("\n  "));process.exit(1);}
// Standing rule: the PDF embeds open-licence typefaces only (the site's web fonts). A system font in it means a glyph
// fell through the font stack — add an open fallback for it rather than shipping the proprietary one.
const names=[...new Set([...readFileSync("cv.pdf").toString("latin1").matchAll(/\/(?:BaseFont|FontName) ?\/([A-Za-z0-9+_\-#]+)/g)].map(m=>m[1].replace(/^[A-Z]{6}\+/,"")))];
const closed=names.filter(n=>/PingFang|Songti|STSong|Heiti|Hiragino|Helvetica|Arial|Georgia|Times|Menlo|Monaco|Courier|AppleSymbols|Apple|SFNS|SFPro|Lucida|Verdana|Tahoma|Segoe|YaHei|SimSun/i.test(n));
console.log("fonts embedded: "+names.join(", "));
if(closed.length){console.error("PROPRIETARY FONT IN cv.pdf: "+closed.join(", "));process.exit(1);}
