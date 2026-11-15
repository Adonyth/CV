// og-cover.png — the 1200×630 card shown when the site is shared. Open-licence typefaces only (Newsreader,
// Noto Serif SC, JetBrains Mono — all SIL OFL, loaded from Google Fonts), the site's real address, and — like the
// homepage — the name alone, with no role line under it.
//   node scripts/gen-og-cover.mjs            (env PLAYWRIGHT_MODULE: path to playwright's index.mjs if not installed here)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Noto+Serif+SC:wght@600&family=JetBrains+Mono:wght@400&text=${encodeURIComponent("Jiaxuan Chen陈嘉轩Theskyatthemomentofbirthcarriesthebodyofwork—alivingorreryofresearch,writing,andmaking.jiaxuanchen.pages.dev")}&display=block">
<style>
  html,body{margin:0;width:1200px;height:630px;background:#0b0a09;overflow:hidden}
  canvas{position:absolute;inset:0}
  .sun{position:absolute;left:820px;top:-110px;width:520px;height:520px;border-radius:50%;
       background:radial-gradient(circle at 50% 50%, rgba(240,186,128,.98) 0%, rgba(228,140,82,.86) 22%, rgba(196,104,58,.46) 46%, rgba(120,60,36,.14) 66%, rgba(11,10,9,0) 78%);}
  .t{position:absolute;left:88px;right:88px}
  .name{top:196px;font:500 96px/1 "Newsreader",serif;color:#f6f0e4;letter-spacing:-.012em;font-variation-settings:"opsz" 72;white-space:nowrap}
  .name span{font:600 62px/1 "Noto Serif SC",serif;color:#e8c37a;letter-spacing:.02em;margin-left:22px;position:relative;top:-6px}
  .rule{top:328px;width:120px;height:2px;background:linear-gradient(90deg,#e8c37a,rgba(232,195,122,0))}
  .tag{top:356px;font:400 31px/1.42 "Newsreader",serif;color:#d8cdb8;font-variation-settings:"opsz" 30;max-width:780px}
  .url{top:470px;font:400 18px/1 "JetBrains Mono",monospace;color:#9a8f7d;letter-spacing:.12em}
</style>
<canvas id="c" width="1200" height="630"></canvas><div class="sun"></div>
<div class="t name">Jiaxuan Chen<span>陈嘉轩</span></div><div class="t rule"></div>
<div class="t tag">The sky at the moment of birth carries the body of work — a living orrery of research, writing, and making.</div>
<div class="t url">jiaxuanchen.pages.dev</div>
<script>
  // a fixed field of faint stars (seeded, so the card is reproducible)
  let s = 20261115; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = document.getElementById("c").getContext("2d");
  for (let i = 0; i < 230; i++) { const x = r() * 1200, y = r() * 630, m = r(); g.fillStyle = "rgba(233,224,210," + (0.10 + 0.5 * m * m).toFixed(3) + ")"; g.beginPath(); g.arc(x, y, 0.5 + m * 0.9, 0, 6.2832); g.fill(); }
</script>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: "networkidle" });
const ok = await p.evaluate(async () => { await document.fonts.ready; return ['500 96px "Newsreader"', '600 62px "Noto Serif SC"', '400 18px "JetBrains Mono"'].every((f) => document.fonts.check(f, "Jiaxuan陈嘉轩")); });
if (!ok) { console.error("a web font did not load — og-cover.png not written"); await b.close(); process.exit(1); }
await p.screenshot({ path: "og-cover.png" });
await b.close();
console.log("og-cover.png written (1200×630; Newsreader, Noto Serif SC, JetBrains Mono)");
