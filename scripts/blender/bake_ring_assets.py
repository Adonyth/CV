#!/usr/bin/env python3
"""Bake the character atlas of the 干支 rings.

  data/ring-glyphs.webp   960×640 — 6×4 tiles of 160², one signed-distance field per character:
                            tiles 0–9   天干  甲乙丙丁戊己庚辛壬癸
                            tiles 10–21 地支  子丑寅卯辰巳午未申酉戌亥
                          grey value = 0.5 + distance / (2·SPREAD); 0.5 is the stroke's edge, brighter is inside.

A distance field keeps the stroke razor-sharp at any size on screen (the shader thresholds it with the pixel's own
footprint). The old runtime drew each character on a 128-px canvas with whatever serif the visitor's machine had.

TYPEFACE — open licence only. The shapes come from **Noto Serif SC Bold** (思源宋体, SIL Open Font License 1.1, free for
commercial use), rasterised by scripts/bake-ring-glyphs.mjs into <dir>/ring-glyph-masks.png. No system or otherwise
proprietary font is used anywhere in this pipeline; the site ships only the 22 distance-field tiles.

Usage: node scripts/bake-ring-glyphs.mjs <dir>  &&  python3 scripts/blender/bake_ring_assets.py <dir>
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else None
if not SRC or not os.path.exists(os.path.join(SRC, "ring-glyph-masks.png")):
    raise SystemExit("usage: python3 scripts/blender/bake_ring_assets.py <dir holding ring-glyph-masks.png (from scripts/bake-ring-glyphs.mjs)>")
meta = json.load(open(os.path.join(SRC, "ring-glyph-masks.json"), encoding="utf-8"))
assert meta["licence"].startswith("SIL OFL"), "the masks must come from an open-licence typeface"
sheet = np.asarray(Image.open(os.path.join(SRC, "ring-glyph-masks.png")).convert("L"), dtype=np.float32) / 255.0
M, COLS, ROWS = meta["tile"], meta["cols"], meta["rows"]
T = 160                              # tile size in the atlas
SPREAD = 0.14                        # distance range kept on each side of the edge, in half-tile units
BOX = 0.74                           # the character's box inside its tile (room for the field around it)


def tile(i):
    m = sheet[(i // COLS) * M:(i // COLS + 1) * M, (i % COLS) * M:(i % COLS + 1) * M] > 0.5
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    g = m[y0:y1, x0:x1]
    # every character sits centred in a square canvas at one common scale (the mask sheet's own em), so the ten
    # stems and twelve branches keep their true relative sizes
    N = M
    c = np.zeros((N, N), bool)
    oy, ox = (N - g.shape[0]) // 2, (N - g.shape[1]) // 2
    c[oy:oy + g.shape[0], ox:ox + g.shape[1]] = g
    sd = (ndi.distance_transform_edt(c) - ndi.distance_transform_edt(~c)) / (N / 2)
    f = np.clip(0.5 + sd / (2 * SPREAD), 0, 1)
    return Image.fromarray((f * 255 + 0.5).astype(np.uint8), "L").resize((T, T), Image.LANCZOS)


atlas = Image.new("L", (COLS * T, ROWS * T), 0)
for i in range(len(meta["chars"])):
    atlas.paste(tile(i), ((i % COLS) * T, (i // COLS) * T))
out = os.path.join(ROOT, "data", "ring-glyphs.webp")
atlas.convert("RGB").save(out, lossless=True, method=6)
print("ring-glyphs.webp  %d KB  %s  (%s %s, %s; spread %.2f)" % (os.path.getsize(out) // 1024, atlas.size, meta["family"], meta["weight"], meta["licence"], SPREAD))
