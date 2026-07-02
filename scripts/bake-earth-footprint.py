#!/usr/bin/env python3
"""Bake the real 602,733-point GPS footprint into a small glowing equirectangular
texture for the 3D orrery Earth — so the trace is visible from the space view
without shipping the 4.8 MB .f32 to the landing page. Static, baked once."""
import numpy as np
from PIL import Image, ImageFilter

W, H = 2048, 1024
raw = np.frombuffer(open("data/footprint-points.f32", "rb").read(), dtype=np.float32)
lat = raw[0::2]; lon = raw[1::2]
m = np.isfinite(lat) & np.isfinite(lon) & (np.abs(lat) < 85)
lat, lon = lat[m], lon[m]

# equirectangular pixel coords
px = ((lon + 180.0) / 360.0 * W).astype(np.int64) % W
py = np.clip(((90.0 - lat) / 180.0 * H).astype(np.int64), 0, H - 1)

acc = np.zeros((H, W), dtype=np.float32)
np.add.at(acc, (py, px), 1.0)

# The real footprint is geographically CONCENTRATED (home cities + travel legs), so
# raw hits are near-invisible specks. Dilate each hit into a legible glow: keep a
# sharp core (density image) and grow a spatial "presence" mask so a lone route still
# reads from orbit.
core = np.sqrt(acc)                              # density: cities hot, routes faint
core = core / (np.percentile(core[core > 0], 99.0) + 1e-6)
core = np.clip(core, 0.0, 1.0)

# presence: any hit → a soft ~6px-radius blob, so sparse travel is visible from space
pres_img = Image.fromarray((np.clip(acc, 0, 1) * 255).astype(np.uint8), "L")
pres_img = pres_img.filter(ImageFilter.MaxFilter(5))          # fatten specks to dots
pres = np.asarray(pres_img.filter(ImageFilter.GaussianBlur(3.2)), dtype=np.float32) / 255.0
pres = np.clip(pres * 2.4, 0.0, 1.0)                          # lift the halo

d = np.clip(np.maximum(core, pres * 0.72), 0.0, 1.0)

# warm ramp: dim amber (faint travel) → hot gold-white (home cities)
low = np.array([0.70, 0.34, 0.18])
mid = np.array([0.97, 0.72, 0.42])
hot = np.array([1.00, 0.97, 0.85])
t = d[..., None]
col = np.where(t < 0.5, low + (mid - low) * (t / 0.5), mid + (hot - mid) * ((t - 0.5) / 0.5))
rgb = (np.clip(col, 0, 1) * 255).astype(np.uint8)
alpha = (np.clip(d * 1.45, 0, 1) * 255).astype(np.uint8)

img = Image.fromarray(np.dstack([rgb, alpha[..., None]]), "RGBA")
glow = img.filter(ImageFilter.GaussianBlur(2.2))
img = Image.alpha_composite(glow, img)                        # soft bloom under the trace
img.save("data/footprint-earth.png", optimize=True)

img.convert("RGB").resize((768, 384)).save("scripts/_fp-preview.png")
print("wrote data/footprint-earth.png", img.size, "| points", lat.size,
      "| lit px", int((alpha > 12).sum()))
