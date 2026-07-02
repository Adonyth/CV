#!/usr/bin/env bash
# Fetch + downsize the equirectangular Earth albedo used by the 3D orrery globe,
# so the baked GPS footprint (data/footprint-earth.png) lands on the real continents.
set -euo pipefail
cd "$(dirname "$0")/.."
curl -sL "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg" -o /tmp/earth-src.jpg
python3 - <<'PY'
from PIL import Image
Image.open("/tmp/earth-src.jpg").convert("RGB").resize((2048,1024), Image.LANCZOS).save("data/earth-map.jpg", quality=84, optimize=True)
print("wrote data/earth-map.jpg")
PY
