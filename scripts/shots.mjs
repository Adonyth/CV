// shots.mjs — render-verification screenshots on the REAL GPU (installed Chrome, ANGLE→Metal).
// The Browser pane / headless software GL both lie about this site (paused rAF when hidden;
// SwiftShader dims additive glow 2-3x), so every visual change is accepted from these frames.
//
//   node scripts/shots.mjs <outDir> [baseUrl]      # default baseUrl http://localhost:8123
//
// Captures: home desktop (settled), home desktop with the Research menu open, home mobile
// (the flat home every phone visitor gets), a research page, and the CV hero.
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const OUT = path.resolve(process.argv[2] || "shots");
const BASE = (process.argv[3] || "http://localhost:8123").replace(/\/$/, "");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const shot = async (name, { w, h, url, mobile = false, prep, wait = 1500, locale = "zh" }) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
    isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((loc) => { try { localStorage.setItem("cv-locale", loc); localStorage.removeItem("cv-hint-seen"); } catch (e) {} }, locale);
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "load" });
  await page.waitForTimeout(wait);
  if (prep) await prep(page);
  // JPEG, never PNG: a PNG screenshot keeps the transparent WebGL canvas's alpha, and transparent sky then
  // reads as a light-grey "wash" in any viewer — a capture artifact, not what visitors see (verified 2026-10-14)
  await page.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 88 });
  console.log("shot", name);
  await ctx.close();
};
try {
  await shot("home-desktop", { w: 1440, h: 900, url: "/?forcegl=1", wait: 7000 });
  await shot("home-desktop-menu", { w: 1440, h: 900, url: "/?forcegl=1", wait: 6000,
    prep: async (p) => { await p.hover(".cosmos-nav__group .cosmos-nav__head"); await p.waitForTimeout(500); } });
  await shot("home-mobile", { w: 390, h: 844, url: "/", mobile: true, wait: 2500 });
  await shot("research-page", { w: 1440, h: 900, url: "/research/ringdown.html", wait: 1500 });
  await shot("cv-hero", { w: 1440, h: 900, url: "/cv.html", wait: 2500 });
} finally {
  await browser.close();
}
