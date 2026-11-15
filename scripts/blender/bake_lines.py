"""bake_lines.py — the two line layers of the large-scale tiers, computed offline (numpy + scipy + PIL).

    python3 -I scripts/blender/bake_lines.py <cosmicflows download dir> <data dir> [preview dir]

  data/flow-lines.bin   STREAMLINES of the Cosmicflows-4 velocity field (Courtois et al. 2023, A&A 670, L15), labelled by
                        the watershed basin they start in (Dupuy & Courtois 2023: 1 = Laniakea). This is what Laniakea
                        IS: the volume whose galaxies all flow to one attractor. Lines run downstream and merge like
                        tributaries, so the trunks toward each attractor stand out.
  data/web-spines.bin   FILAMENT SPINES of the site's own density field (data/web-density.webp, from the real galaxy
                        survey): ridge lines of the smoothed field, the skeleton of the cosmic web.
Both are baked geometry: the browser never sees a velocity field, it draws a few tens of thousands of segments.
Format (little-endian): "LNS1", uint32 nVerts, uint32 nLines, int16 xyz[nVerts*3] (supergalactic Mpc x 64, H0 = 70 as
the galaxy files), uint8 attr[nVerts*4] (kind, brightness, arc-length lo, hi — arc length in units of 0.25 Mpc),
uint32 lineStart[nLines].
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cf4_io  # noqa: E402  (adds the user site-packages back under -I)
import numpy as np  # noqa: E402
from scipy import ndimage  # noqa: E402

DL, DATA = sys.argv[1], sys.argv[2]
PREVIEW = sys.argv[3] if len(sys.argv) > 3 else ""
H = 0.70                                              # the site's distances are cz / 70; Cosmicflows grids are in Mpc/h
rng = np.random.default_rng(264)


def write_lines(path, lines, kinds, bright):
    """lines: list of (n,3) arrays in site Mpc; kinds: per-line int; bright: per-line (n,) arrays 0..1"""
    nv = sum(len(l) for l in lines)
    xyz = np.zeros((nv, 3), "<i2"); att = np.zeros((nv, 4), np.uint8); starts = np.zeros(len(lines), "<u4")
    o = 0
    for i, l in enumerate(lines):
        n = len(l); starts[i] = o
        xyz[o:o + n] = np.clip(np.round(l * 64.0), -32767, 32767)
        arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(l, axis=0), axis=1))])
        a16 = np.clip(np.round(arc / 0.25), 0, 65535).astype(np.uint16)
        att[o:o + n, 0] = kinds[i]; att[o:o + n, 1] = np.clip(np.round(bright[i] * 255), 0, 255)
        att[o:o + n, 2] = a16 & 255; att[o:o + n, 3] = a16 >> 8
        o += n
    with open(path, "wb") as f:
        f.write(b"LNS1"); f.write(np.array([nv, len(lines)], "<u4").tobytes())
        f.write(xyz.tobytes()); f.write(att.tobytes()); f.write(starts.tobytes())
    return nv, os.path.getsize(path)


# ------------------------------------------------------------------ 1. Cosmicflows-4 streamlines
_, vel = cf4_io.read_fits(os.path.join(DL, "CF4_new_64-z008_velocity.fits"))            # [3][SGX][SGY][SGZ], x52 = km/s
_, boa = cf4_io.read_fits(os.path.join(DL, "CF4_new_128-z008_watersheds-fits.zip"), "CF4_new_128-z008_BoA.fits")
vel = vel.astype(np.float64) * 52.0
boa = boa.astype(np.int16)
BOX, NV, NB = 1000.0, vel.shape[1], boa.shape[0]


def v_at(x):                                           # x (n,3) Mpc/h → km/s
    g = ((x + BOX / 2) / BOX * NV - 0.5).T
    return np.stack([ndimage.map_coordinates(vel[c], g, order=1, mode="nearest") for c in range(3)], axis=1)


def basin_at(x):
    # NOTE the watershed grids are stored [SGZ][SGY][SGX] — the opposite of the velocity/density grids ([SGX][SGY][SGZ]).
    # Checked against the sky: read this way, label 1 holds us, Virgo, Centaurus, Norma and the Great Attractor, label 5
    # Perseus, label 6 Shapley, label 3 Hercules; and streamlines of the velocity field seeded near us end at
    # (-46, 11, -3) Mpc/h, the Great Attractor's known place.
    i = np.clip(np.floor((x + BOX / 2) / BOX * NB).astype(int), 0, NB - 1)
    return boa[i[:, 2], i[:, 1], i[:, 0]]


vb = (np.argwhere(boa == 1)[:, ::-1] + 0.5) / NB * BOX - BOX / 2
print("Laniakea: %d voxels, centroid %s Mpc/h, equivalent radius %.0f Mpc/h" % (len(vb), vb.mean(axis=0).round(0), (len(vb) * (BOX / NB) ** 3 * 3 / 4 / np.pi) ** (1 / 3)))
seeds_l = vb[rng.choice(len(vb), 800, replace=False)] + rng.uniform(-3.9, 3.9, (800, 3))
cand = rng.uniform(-230, 230, (60000, 3)); cand = cand[np.linalg.norm(cand, axis=1) < 230]
cand = cand[basin_at(cand) != 1][:650]
seeds = np.vstack([seeds_l, cand]); kinds_seed = basin_at(seeds)
order = rng.permutation(len(seeds)); seeds, kinds_seed = seeds[order], kinds_seed[order]

DS, CELL = 3.2, 6.5
occ = {}
flow, fk, fb, ends = [], [], [], []
for s0, k0 in zip(seeds, kinds_seed):
    p = s0.copy(); pts = [p.copy()]; spd = []
    for step in range(130):
        v1 = v_at(p[None])[0]; n1 = np.linalg.norm(v1)
        if n1 < 25.0:
            break                                      # the flow stalls: an attractor
        mid = p + 0.5 * DS * v1 / n1
        v2 = v_at(mid[None])[0]; n2 = np.linalg.norm(v2)
        p = p + DS * v2 / max(n2, 1e-9)
        spd.append(n1)
        if np.linalg.norm(p) > 330:
            break
        pts.append(p.copy())
        key = tuple(np.floor(p / CELL).astype(int))
        if step >= 3 and key in occ and occ[key] != len(flow):
            break                                      # joined a line already drawn: tributaries merge into trunks
    if len(pts) >= 5:
        for q in pts:
            occ.setdefault(tuple(np.floor(q / CELL).astype(int)), len(flow))
        flow.append(np.array(pts) / H); fk.append(int(k0)); ends.append(pts[-1])
        sp = np.array(spd + [spd[-1]] * (len(pts) - len(spd)))
        fb.append(np.clip(0.35 + 0.65 * sp / 600.0, 0, 1))
ends = np.array(ends); fk_a = np.array(fk)
le = ends[fk_a == 1]
print("flow lines %d (Laniakea %d), points %d" % (len(flow), int((fk_a == 1).sum()), sum(len(l) for l in flow)))
print("Laniakea lines end near (median) %s Mpc/h — the Great Attractor region is about (-47, 13, -5)" % np.median(le, axis=0).round(0))
nv, sz = write_lines(os.path.join(DATA, "flow-lines.bin"), flow, fk, fb)
print("flow-lines.bin %d verts %d KB" % (nv, sz // 1024))

# ------------------------------------------------------------------ 2. filament spines of the site's density field
import json  # noqa: E402
from PIL import Image  # noqa: E402

meta = json.load(open(os.path.join(DATA, "web-density.json")))
N, cols, R = meta["n"], meta["cols"], meta["halfExtentMpc"]
atlas = np.asarray(Image.open(os.path.join(DATA, "web-density.webp")).convert("L"), dtype=np.float32) / 255.0
s = np.stack([atlas[(z // cols) * N:(z // cols + 1) * N, (z % cols) * N:(z % cols + 1) * N] for z in range(N)])   # [z][y][x]
f = ndimage.gaussian_filter(s, 1.4)
gz, gy, gx = np.gradient(f)
Hm = np.empty(f.shape + (3, 3), np.float32)
for i, gi in enumerate((gx, gy, gz)):
    dz, dy, dx = np.gradient(gi)
    Hm[..., i, 0], Hm[..., i, 1], Hm[..., i, 2] = dx, dy, dz
Hm = 0.5 * (Hm + np.swapaxes(Hm, -1, -2))
THR = 0.105
cz, cy, cx = np.nonzero(f > THR)
w, e = np.linalg.eigh(Hm[cz, cy, cx])                 # ascending: w0 <= w1 <= w2
fil = w[:, 1] < 0                                      # two negative curvatures: a filament (or a knot on one)
cz, cy, cx, e = cz[fil], cy[fil], cx[fil], e[fil]
P = np.stack([cx, cy, cz], axis=1).astype(np.float64)
e1, e2, e3 = e[:, :, 0], e[:, :, 1], e[:, :, 2]        # e3: along the ridge


def f_at(p):
    return ndimage.map_coordinates(f, [p[:, 2], p[:, 1], p[:, 0]], order=1, mode="nearest")


f0 = f_at(P)
ridge = np.ones(len(P), bool)
for ev in (e1, e2):                                    # non-maximum suppression across the ridge
    ridge &= (f0 >= f_at(P + ev)) & (f0 >= f_at(P - ev))
P, e3, f0 = P[ridge], e3[ridge], f0[ridge]
print("ridge voxels %d (of %d filament-like above threshold)" % (len(P), int(fil.sum())))
idx = {tuple(p.astype(int)): i for i, p in enumerate(P)}
used = np.zeros(len(P), bool)
NB26 = np.array([(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1) if (a, b, c) != (0, 0, 0)])
NBU = NB26 / np.linalg.norm(NB26, axis=1)[:, None]


def walk(i, d):
    out = []
    while True:
        best, bd = -1, 0.42
        for nb, nu in zip(NB26, NBU):
            j = idx.get(tuple((P[i] + nb).astype(int)))
            if j is None or used[j]:
                continue
            dd = float(nu @ d)
            if dd > bd:
                best, bd = j, dd
        if best < 0:
            return out
        d2 = e3[best] if e3[best] @ d >= 0 else -e3[best]
        d = d2 / np.linalg.norm(d2) * 0.6 + d * 0.4; d /= np.linalg.norm(d)
        used[best] = True; out.append(best); i = best


spines, sk, sb = [], [], []
for i in np.argsort(-f0):
    if used[i]:
        continue
    used[i] = True
    fw = walk(i, e3[i].astype(np.float64)); bw = walk(i, -e3[i].astype(np.float64))
    chain = bw[::-1] + [i] + fw
    for j in chain:                                    # a ridge two voxels thick is one filament: consume its flank
        for nb in NB26:
            q = idx.get(tuple((P[j] + nb).astype(int)))
            if q is not None:
                used[q] = True
    if len(chain) < 8:
        continue                                       # short stubs are noise, not filaments
    pts = P[chain]
    for _ in range(4):                                 # smooth the voxel staircase
        pts = np.vstack([pts[:1], (pts[:-2] + 2 * pts[1:-1] + pts[2:]) / 4, pts[-1:]])
    xyz = (pts + 0.5) / N * 2 * R - R
    rr = np.linalg.norm(xyz, axis=1)
    b = np.clip((f0[chain] - THR) / (0.5 - THR), 0, 1) ** 0.7 * (1 - np.clip((rr - 0.80 * R) / (0.20 * R), 0, 1))
    spines.append(xyz); sk.append(0); sb.append(0.25 + 0.75 * b)
nv2, sz2 = write_lines(os.path.join(DATA, "web-spines.bin"), spines, sk, sb)
print("spines %d lines, %d verts, %d KB; median length %.0f Mpc" % (len(spines), nv2, sz2 // 1024, np.median([np.linalg.norm(np.diff(l, axis=0), axis=1).sum() for l in spines])))

if PREVIEW:
    S = 900; im = np.zeros((S, 2 * S + 8, 3), np.float32)
    pal = {1: (1.0, 0.86, 0.55)}
    def draw(lines, col_of, x0, ext):
        for li, l in enumerate(lines):
            q = np.repeat(l, 6, axis=0)[:-5] * 0 + np.concatenate([np.linspace(l[i], l[i + 1], 6, endpoint=False) for i in range(len(l) - 1)] + [l[-1:]])
            u = ((q[:, 0] / ext + 1) / 2 * (S - 1)).astype(int); v = ((1 - (q[:, 1] / ext + 1) / 2) * (S - 1)).astype(int)
            ok = (u >= 0) & (u < S) & (v >= 0) & (v < S) & (np.abs(q[:, 2]) < 60)
            np.add.at(im, (v[ok], u[ok] + x0), np.array(col_of(li)) * 0.5)
    draw(flow, lambda i: pal.get(fk[i], (0.35, 0.50, 0.85)), 0, 360)
    draw(spines, lambda i: (0.6, 0.85, 1.0), S + 8, 260)
    Image.fromarray((np.clip(im, 0, 1) ** 0.6 * 255).astype(np.uint8)).resize((S + 4, S // 2)).save(os.path.join(PREVIEW, "lines-preview.png"))
