#!/usr/bin/env bash
# Fetch + process ALL celestial textures for the 3D orrery:
#   data/earth-map.jpg    — full 4096px blue-marble albedo (three-globe, MIT-hosted imagery)
#   data/earth-night.jpg  — city lights, brightened 2.8x^0.78 + 1px fattened so they read from orbit
#   data/moon-map.jpg     — real lunar surface (solarsystemscope.com, CC BY 4.0)
set -euo pipefail
cd "$(dirname "$0")/.."
curl -sL "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg" -o /tmp/earth-src.jpg
curl -sL "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-night.jpg" -o /tmp/night-src.jpg
curl -sL "https://www.solarsystemscope.com/textures/download/2k_moon.jpg" -o /tmp/moon-src.jpg
python3 - <<'PY'
from PIL import Image, ImageFilter
import numpy as np
Image.open("/tmp/earth-src.jpg").convert("RGB").save("data/earth-map.jpg", quality=82, optimize=True)
n = Image.open("/tmp/night-src.jpg").convert("RGB")
a = np.clip(np.asarray(n, dtype=np.float32)/255 * 2.8, 0, 1) ** 0.78
img = Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).resize((2048,1024), Image.LANCZOS)
img.save("data/earth-night.jpg", quality=82, optimize=True)
Image.open("/tmp/moon-src.jpg").convert("RGB").resize((1024,512), Image.LANCZOS).save("data/moon-map.jpg", quality=82, optimize=True)
print("earth-map, earth-night, moon-map written")
PY
