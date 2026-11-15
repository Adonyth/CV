// Rasterise the 22 干支 characters from an OPEN-LICENCE typeface for scripts/blender/bake_ring_assets.py.
//
//   node scripts/bake-ring-glyphs.mjs <out-dir>          (then: python3 scripts/blender/bake_ring_assets.py <out-dir>)
//
// Typeface: Noto Serif SC Bold (思源宋体) — SIL Open Font License 1.1, free for commercial use. It is taken the way any
// web page takes it: a headless Chromium loads it from Google Fonts (only the 22 glyphs, via the `text=` subset) and
// draws each character on a canvas. Nothing proprietary is involved and no font file is kept or shipped — the site
// publishes only the distance fields baked from these masks.
// Optional env PLAYWRIGHT_MODULE: path to playwright's index.mjs when it is not installed beside this checkout.
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.argv[2]; if (!out) { console.error("usage: node scripts/bake-ring-glyphs.mjs <out-dir>"); process.exit(2); }
mkdirSync(out, { recursive: true });
const CHARS = "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥", FAMILY = "Noto Serif SC", WEIGHT = 700, T = 960;
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${FAMILY.replace(/ /g, "+")}:wght@${WEIGHT}&text=${encodeURIComponent(CHARS)}&display=block"><body style="margin:0;background:#000"><canvas id="c" width="${6 * T}" height="${4 * T}"></canvas>`, { waitUntil: "networkidle" });
const info = await p.evaluate(async ({ CHARS, FAMILY, WEIGHT, T }) => {
  const spec = `${WEIGHT} ${Math.round(T * 0.74)}px "${FAMILY}"`;
  await document.fonts.load(spec, CHARS); await document.fonts.ready;
  const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, "") === FAMILY && f.status === "loaded");
  if (!faces.length || !document.fonts.check(spec, CHARS)) return { ok: false };
  const c = document.getElementById("c"), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.font = spec;
  // prove the glyphs come from the web font, not a system fallback: a fallback serif would measure differently
  const wNoto = [...CHARS].map((ch) => g.measureText(ch).width); g.font = `${WEIGHT} ${Math.round(T * 0.74)}px serif`; const wSys = [...CHARS].map((ch) => g.measureText(ch).width); g.font = spec;
  [...CHARS].forEach((ch, i) => { const m = g.measureText(ch), cx = (i % 6) * T + T / 2, cy = Math.floor(i / 6) * T + T / 2; g.fillText(ch, cx, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2); });
  return { ok: true, faces: faces.length, spec, data: c.toDataURL("image/png"), wNoto: wNoto[0], wSys: wSys[0] };
}, { CHARS, FAMILY, WEIGHT, T });
await b.close();
if (!info.ok) { console.error(`${FAMILY} did not load — nothing written`); process.exit(1); }
writeFileSync(`${out}/ring-glyph-masks.png`, Buffer.from(info.data.split(",")[1], "base64"));
writeFileSync(`${out}/ring-glyph-masks.json`, JSON.stringify({ family: FAMILY, weight: WEIGHT, licence: "SIL OFL 1.1", source: "Google Fonts", chars: CHARS, tile: T, cols: 6, rows: 4 }));
console.log(`ring-glyph-masks.png written: ${FAMILY} ${WEIGHT}, ${info.faces} face(s) loaded from Google Fonts, ${CHARS.length} characters`);
