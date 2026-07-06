/* verify-tiers.mjs — Playwright screenshot sweep of the cosmic-address ladder.
   For each tier peak: teleport → pump frames (builds lazy layers, settles fades) → screenshot.
   Usage: node scripts/verify-tiers.mjs [desktop|mobile]                                     */
import { chromium, devices } from "playwright";
import { mkdirSync } from "fs";

const MODE = process.argv[2] || "desktop";
const ONLY = process.argv[3] || "";
const OUT = `.wolf/tier-shots/${MODE}`;
mkdirSync(OUT, { recursive: true });

const TIERS = [
  ["milky-way", "milky-way", 3500],
  ["local-group", "local-group", 9200],
  ["local-sheet", "local-sheet", 14000],
  ["virgo", "virgo-supercluster", 21300],
  ["laniakea", "laniakea", 32400],
  ["cosmic-web", "cosmic-web", 49300],
  ["observable", "observable-universe", 75000],
  ["beyond-horizon", "fluctuation", 112000]
];
const RUN_TIERS = ONLY ? TIERS.filter(([name, id]) => name === ONLY || id === ONLY) : TIERS;
if (!RUN_TIERS.length) {
  console.error(`Unknown tier '${ONLY}'. Known tiers: ${TIERS.map(([name]) => name).join(", ")}`);
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]
});
const ctx = await browser.newContext(
  MODE === "mobile"
    ? { ...devices["iPhone 13"], deviceScaleFactor: 2 }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text()); });

await page.addInitScript(() => {
  try { localStorage.setItem("cv-motion", "calm"); } catch (e) {}
});

await page.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=verify", { waitUntil: "networkidle", timeout: 120000 });

await page.waitForFunction(() => {
  var s = window.__space;
  return s && s.ready && typeof s.teleport === "function" && typeof s.pump === "function";
}, null, { timeout: 180000 });

const boot = await page.evaluate(() => ({
  tier: window.__space.tier,
  err: window.__space.error || window.__space.natalError || null
}));
if (boot.err) console.log("BOOT-ERR:", boot.err);
if (boot.tier === "flat") console.log("WARN: flat tier — 3D skipped");
console.log("cosmos ready tier=" + boot.tier);

for (const [name, expectedTier, peak] of RUN_TIERS) {
  await page.evaluate((r) => { window.__space.teleport(r); }, peak);
  for (let i = 0; i < 20; i++) await page.evaluate(() => window.__space.pump(8));
  await page.waitForFunction((id) => {
    const cur = document.querySelector(".cosmos-rail__i.is-cur");
    return cur && cur.dataset.id === id;
  }, expectedTier, { timeout: 60000 });
  await page.waitForTimeout(380);
  const state = await page.evaluate(() => {
    const s = window.__space;
    return {
      camLen: s.camera.position.length().toFixed(0),
      tier: window.CosmicLOD.currentLayerId(s.camera.position.length()),
      mw: window.CosmicLOD.weight(s.camera.position.length(), "milky-way").toFixed(2)
    };
  });
  await page.evaluate(() => window.__space.pump(4));
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });
  console.log(`shot ${name} camLen=${state.camLen} tier=${state.tier} mw=${state.mw}`);
}
await browser.close();
console.log("DONE " + MODE);
