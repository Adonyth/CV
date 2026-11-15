#!/usr/bin/env python3
"""Bake the character atlas of the 干支 rings.

  data/ring-glyphs.webp   960×640 — 6×4 tiles of 160², one signed-distance field per character:
                            tiles 0–9   天干  甲乙丙丁戊己庚辛壬癸
                            tiles 10–21 地支  子丑寅卯辰巳午未申酉戌亥
                          grey value = 0.5 + distance / (2·SPREAD); 0.5 is the stroke's edge, brighter is inside.

A distance field keeps the stroke razor-sharp at any size on screen (the shader thresholds it with the pixel's own
footprint) and gives the soft glow around the stroke for free. The old runtime drew each character on a 128-px
canvas with whatever serif the visitor's machine had; this is the same 宋体 voice, identical everywhere.

The shapes are rasterised from the system typeface Songti SC Bold: only these 22 raster tiles ship, never the font.

Usage: python3 scripts/blender/bake_ring_assets.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STEMS, BRANCHES = "甲乙丙丁戊己庚辛壬癸", "子丑寅卯辰巳午未申酉戌亥"
FONT, FACE = "/System/Library/Fonts/Supplemental/Songti.ttc", ("Songti SC", "Bold")
T, SS = 160, 6                       # tile size, supersampling of the mask the distance is measured on
SPREAD = 0.14                        # distance range kept on each side of the edge, in half-tile units
N = T * SS


def face_index():
    for i in range(16):
        try:
            if ImageFont.truetype(FONT, 32, index=i).getname() == FACE:
                return i
        except OSError:
            break
    raise SystemExit("Songti SC Bold not found in %s — nothing baked" % FONT)


IDX = face_index()


def tile(ch):
    box = int(N * 0.74)                                    # the character's box inside the tile (room for the glow)
    f = ImageFont.truetype(FONT, int(box * 1.0), index=IDX)
    l, t, r, b = f.getbbox(ch)
    im = Image.new("L", (N, N), 0)
    ImageDraw.Draw(im).text(((N - (r - l)) / 2 - l, (N - (b - t)) / 2 - t), ch, font=f, fill=255)
    m = np.asarray(im, dtype=np.float32) / 255.0 > 0.5
    sd = (ndi.distance_transform_edt(m) - ndi.distance_transform_edt(~m)) / (N / 2)
    g = np.clip(0.5 + sd / (2 * SPREAD), 0, 1)
    return Image.fromarray((g * 255 + 0.5).astype(np.uint8), "L").resize((T, T), Image.LANCZOS)


COLS, ROWS = 6, 4
atlas = Image.new("L", (COLS * T, ROWS * T), 0)
for i, ch in enumerate(list(STEMS) + list(BRANCHES)):
    atlas.paste(tile(ch), ((i % COLS) * T, (i // COLS) * T))
out = os.path.join(ROOT, "data", "ring-glyphs.webp")
atlas.convert("RGB").save(out, lossless=True, method=6)
print("ring-glyphs.webp  %d KB  %s  (%s %s, spread %.2f)" % (os.path.getsize(out) // 1024, atlas.size, FACE[0], FACE[1], SPREAD))
