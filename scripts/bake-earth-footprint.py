#!/usr/bin/env python3
"""Bake the real 602,733-point GPS footprint into a glowing equirectangular texture for
the 3D orrery Earth. PRECISE + VERY BRIGHT: the true trace, sharp (no fattening/bloom),
pushed to a blazing gold-white so it reads clearly on the globe from the space view."""
import numpy as np
from PIL import Image, ImageFilter

W, H = 3072, 1536                      # higher res so the real paths stay crisp, not smeared
raw = np.frombuffer(open("data/footprint-points.f32", "rb").read(), dtype=np.float32)
lat = raw[0::2]; lon = raw[1::2]
m = np.isfinite(lat) & np.isfinite(lon) & (np.abs(lat) < 85)
lat, lon = lat[m], lon[m]

# equirectangular pixel coords: px = (lon+180)/360*W, py = (90-lat)/180*H  (north at top)
px = ((lon + 180.0) / 360.0 * W).astype(np.int64) % W
py = np.clip(((90.0 - lat) / 180.0 * H).astype(np.int64), 0, H - 1)

acc = np.zeros((H, W), dtype=np.float32)
np.add.at(acc, (py, px), 1.0)

# perceptual density with a LOW anchor so even a single-visit point burns bright
d = np.sqrt(acc)
d = d / (np.percentile(d[d > 0], 70.0) + 1e-6)   # low anchor → most of the trace is near-max bright
d = np.clip(d, 0.0, 1.0)

# CRISP line, no fuzzy halo: grow each hit by ONE pixel (MaxFilter 3 → ~2-3px sharp line) so the
# route survives minification and reads brightly from space — but NOT the old soft bloom that
# smeared everything into ugly blobs. The density d is likewise dilated so brightness follows.
dimg = Image.fromarray((d * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(3))
d = np.asarray(dimg, dtype=np.float32) / 255.0
lit = d > 0.02

# blazing gold-white ramp: faint legs already bright gold, dense cities white-hot
low = np.array([1.00, 0.82, 0.48])
hot = np.array([1.00, 0.99, 0.92])
t = d[..., None]
rgb = (np.clip(low + (hot - low) * t, 0, 1) * 255).astype(np.uint8)
# very high alpha on every lit pixel so the whole trace is blazing, unlit stays transparent
alpha = np.zeros((H, W), dtype=np.float32)
alpha[lit] = np.clip(0.72 + d[lit] * 1.4, 0.0, 1.0)
alpha = (alpha * 255).astype(np.uint8)

img = Image.fromarray(np.dstack([rgb, alpha[..., None]]), "RGBA")
img = img.filter(ImageFilter.GaussianBlur(0.5))   # sub-pixel AA only — stays sharp, no halo
img.save("data/footprint-earth.png", optimize=True)

img.convert("RGB").resize((768, 384)).save("scripts/_fp-preview.png")
print("wrote data/footprint-earth.png", img.size, "| points", lat.size,
      "| lit px", int((alpha > 12).sum()))
