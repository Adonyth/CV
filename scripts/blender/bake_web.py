"""bake_web.py — the cosmic web as a density field, from the site's own real galaxy survey (system python: numpy + PIL).

    python3 scripts/blender/bake_web.py [--n 192] [--out data] [--preview DIR]

Reads data/galaxies2_xyz.i16 (supergalactic Cartesian, Mpc x 64) + galaxies2_attr.u8 and writes
  data/web-density.webp   an N^3 density volume as an atlas of N z-slices (tile row = SGY, column = SGX),
                          log-compressed to 8 bits
  data/web-density.json   half-extent (Mpc), N, atlas layout
The survey is flux-limited: fewer galaxies are catalogued farther out. Each galaxy is weighted by the inverse of the
radial selection function, so a filament 250 Mpc away glows like one 50 Mpc away; the weight is capped and the field
tapers to nothing at the survey's edge, where the correction would be amplifying noise. Regions the survey never saw
(the Zone of Avoidance behind our own galaxy's disc) stay empty: they are unobserved, not empty space.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=192)
ap.add_argument("--out", default="data")
ap.add_argument("--preview", default="")
a = ap.parse_args()
N = a.n

xyz = np.fromfile(os.path.join(a.out, "galaxies2_xyz.i16"), dtype="<i2").reshape(-1, 3).astype(np.float64) / 64.0
att = np.fromfile(os.path.join(a.out, "galaxies2_attr.u8"), dtype=np.uint8).reshape(-1, 8)
r = np.linalg.norm(xyz, axis=1)
print("galaxies %d  r: p50 %.0f p90 %.0f p99 %.0f max %.0f Mpc" % (len(r), *np.percentile(r, [50, 90, 99]), r.max()))
# The catalogue reaches ~400 Mpc, but beyond ~240 Mpc it is too sparse to say where the filaments run (the inverse
# selection weight would only inflate single galaxies into glowing balls). The field covers the well-sampled volume —
# Laniakea, Perseus–Pisces, Coma, Hercules, Shapley — and the galaxies beyond it stay what they are: points.
REDGE = 240.0
R = REDGE * 1.04                                         # half-extent of the cube

# radial selection function: observed number density in shells, relative to the well-sampled nearby volume
edges = np.linspace(0, REDGE, 41)
cnt, _ = np.histogram(r, edges)
vol = 4.0 / 3.0 * np.pi * (edges[1:] ** 3 - edges[:-1] ** 3)
dens = cnt / vol
ref = dens[(edges[1:] > 20) & (edges[1:] < 70)].mean()
phi = np.clip(dens / ref, 1e-3, None)
phi = np.minimum.accumulate(np.maximum(phi, 1e-3) * 0 + phi)       # monotone non-increasing envelope
mid = 0.5 * (edges[1:] + edges[:-1])
w = 1.0 / np.clip(np.interp(r, mid, phi), 1.0 / 12.0, 1.0)          # inverse selection, capped at 12x
tp = np.clip((r - 0.50 * REDGE) / (0.50 * REDGE), 0, 1)
w *= (1.0 - tp * tp * (3 - 2 * tp))                                 # a long fade toward the edge: the field thins out, it never ends in a wall
# brighter galaxies trace more mass: a gentle luminosity weight (K-band absolute magnitude)
MK = att[:, 6].astype(np.float64) / 255.0 * 18.0 - 27.0
w *= np.clip(10 ** (-0.4 * (MK + 23.5)), 0.25, 4.0) ** 0.5
print("selection: phi(edge) %.3f  weight p50 %.1f p99 %.1f" % (phi[-1], np.median(w), np.percentile(w, 99)))

# cloud-in-cell deposit
g = (xyz + R) / (2 * R) * N - 0.5
i0 = np.floor(g).astype(np.int64)
f = g - i0
grid = np.zeros((N, N, N), np.float64)                   # [z, y, x]
for dz in (0, 1):
    for dy in (0, 1):
        for dx in (0, 1):
            ix, iy, iz = i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz
            ok = (ix >= 0) & (ix < N) & (iy >= 0) & (iy < N) & (iz >= 0) & (iz < N)
            ww = w * np.where(dx, f[:, 0], 1 - f[:, 0]) * np.where(dy, f[:, 1], 1 - f[:, 1]) * np.where(dz, f[:, 2], 1 - f[:, 2])
            np.add.at(grid, (iz[ok], iy[ok], ix[ok]), ww[ok])

# two scales: tight around the galaxies (the knots and the spines of filaments) + a broader veil that links them
k = np.fft.fftfreq(N)
k2 = k[:, None, None] ** 2 + k[None, :, None] ** 2 + np.fft.rfftfreq(N)[None, None, :] ** 2
F = np.fft.rfftn(grid)
vox = 2 * R / N
def smooth(sig_mpc):
    s = sig_mpc / vox
    return np.fft.irfftn(F * np.exp(-2 * (np.pi * s) ** 2 * k2), s=grid.shape, axes=(0, 1, 2))
# adaptive resolution: tight around the galaxies where the survey is dense (knots, the spines of filaments), broader
# where it thins out — a far filament is drawn as softly as it is known
ax = (np.arange(N) + 0.5) / N * 2 * R - R
rv = np.sqrt(ax[:, None, None] ** 2 + ax[None, :, None] ** 2 + ax[None, None, :] ** 2)
t = np.clip((rv - 60.0) / 140.0, 0, 1); t = t * t * (3 - 2 * t)
rho = 0.60 * (1 - t) * smooth(2.0) + (0.35 + 0.25 * t) * smooth(4.2) + (0.05 + 0.35 * t) * smooth(7.5)
rho = np.clip(rho, 0, None)
mean = rho[rho > 0].mean()
delta = rho / mean
top = float(np.percentile(delta, 99.97))
# only what is denser than the cosmic mean glows — voids must stay dark, or the web drowns in its own fog
KK, D0 = 1.2, 1.0
s = np.clip(np.log1p(KK * np.clip(delta - D0, 0, None)) / np.log1p(KK * (top - D0)), 0, 1)
print("voxel %.2f Mpc  half-extent %.0f Mpc  delta p50 %.2f p99 %.1f top %.1f  filled>0.05: %.1f%%" % (vox, R, np.median(delta), np.percentile(delta, 99), top, 100 * (s > 0.05).mean()))

cols = int(np.ceil(np.sqrt(N)))
rows = int(np.ceil(N / cols))
atlas = np.zeros((rows * N, cols * N), np.uint8)
u8 = (s * 255 + 0.5).astype(np.uint8)
for z in range(N):
    ty, tx = divmod(z, cols)
    atlas[ty * N:(ty + 1) * N, tx * N:(tx + 1) * N] = u8[z]
p = os.path.join(a.out, "web-density.webp")
Image.fromarray(atlas, "L").save(p, "WEBP", quality=90, method=6)
json.dump({"n": N, "cols": cols, "rows": rows, "halfExtentMpc": R, "logK": KK, "floor": D0, "top": top}, open(os.path.join(a.out, "web-density.json"), "w"), indent=1)
print("written %s %d KB (%dx%d)" % (p, os.path.getsize(p) // 1024, atlas.shape[1], atlas.shape[0]))

if a.preview:
    # what the shader will make of it: emission ∝ s^2.2, cool filaments → warm knots, summed along SGZ through a 60-Mpc slab and through everything
    e = s ** 2.2
    def ramp(v):
        c0, c1, c2 = np.array([0.20, 0.32, 0.95]), np.array([0.55, 0.75, 1.0]), np.array([1.0, 0.86, 0.62])
        t = np.clip(v, 0, 1)[..., None]
        return np.where(t < 0.5, c0 + (c1 - c0) * (t / 0.5), c1 + (c2 - c1) * ((t - 0.5) / 0.5))
    half = int(30 / vox)
    for nm, sl in (("slab", slice(N // 2 - half, N // 2 + half)), ("full", slice(0, N))):
        col = (ramp(s[sl]) * e[sl][..., None]).sum(axis=0) * vox / 60.0
        img = np.clip(1 - np.exp(-col * (14.0 if nm == "slab" else 4.0)), 0, 1) ** (1 / 2.2)
        Image.fromarray((img[::-1] * 255).astype(np.uint8)).resize((640, 640), Image.LANCZOS).save(os.path.join(a.preview, "web-%s.png" % nm))
