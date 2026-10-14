// capture-poster.mjs — render the REAL default sky (base view) on the real GPU and save it as the
// first-paint poster, so a visitor sees the sky at ~0.5s instead of a black screen while the 3-D
// scene streams in. Re-run whenever the base-view look changes:
//
//   node scripts/capture-poster.mjs [url]        # default url: http://localhost:8123/
//
// Writes data/poster-sky.jpg (landscape, desktop first paint) and data/poster-sky-portrait.jpg
// (portrait, the motion-free hero of the mobile / reduced-motion home). Uses the installed Google
// Chrome headless with ANGLE→Metal: software GL (SwiftShader) renders additive glow 2-3x dimmer
// than real GPUs, which would make the poster→live crossfade visibly jump in brightness.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.argv[2] || "http://localhost:8123/";
const SHOTS = [
  { out: "data/poster-sky.jpg", w: 1600, h: 900, final: [1600, 900], q: 72 },
  { out: "data/poster-sky-portrait.jpg", w: 600, h: 1067, final: [600, 1067], q: 72 },
];

const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
try {
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem("cv-motion", "calm"); localStorage.setItem("cv-locale", "en"); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(URL_ + (URL_.includes("?") ? "&" : "?") + "forcegl=1", { waitUntil: "load" });
    // wait for the scene + the ground entrance, then let every texture land and the entrance glide settle
    await page.waitForFunction(() => window.__space && window.__space.ready && window.__space.ground && window.__space.ground.is(), null, { timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(9000);
    // hide every DOM layer except the two canvases: the poster is the sky only, never the chrome
    await page.addStyleTag({ content: "body > *:not(#deep):not(#field){visibility:hidden !important} body.cosmos::before,body.cosmos::after{display:none !important}" });
    await page.waitForTimeout(400);
    const raw = path.join(ROOT, s.out.replace(/\.jpg$/, ".raw.jpg"));
    await page.screenshot({ path: raw, type: "jpeg", quality: 95 });   // JPEG: PNG keeps canvas alpha → false light wash
    execFileSync("python3", ["-c", `
from PIL import Image
im = Image.open(${JSON.stringify(raw)}).convert("RGB").resize((${s.final[0]}, ${s.final[1]}), Image.LANCZOS)
im.save(${JSON.stringify(path.join(ROOT, s.out))}, "JPEG", quality=${s.q}, optimize=True, progressive=True)
import os; os.remove(${JSON.stringify(raw)})
print("wrote", ${JSON.stringify(s.out)}, os.path.getsize(${JSON.stringify(path.join(ROOT, s.out))}) // 1024, "KB")
`], { stdio: "inherit" });
    await ctx.close();
  }
} finally {
  await browser.close();
}
