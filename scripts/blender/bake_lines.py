"""bake_lines.py — the two line layers of the large-scale tiers, computed offline (numpy + scipy + PIL).

    python3 -I scripts/blender/bake_lines.py <cosmicflows download dir> <data dir> [preview dir]

  data/flow-lines.bin   STREAMLINES of the Cosmicflows-4 velocity field (Courtois et al. 2023, A&A 670, L15), labelled by
                        the watershed basin they start in (Dupuy & Courtois 2023: 1 = Laniakea). This is what Laniakea
                        IS: the volume whose galaxies all flow to one attractor. One line starts in every cell of
                        the published 64^3 velocity grid inside the shown volume and runs to its attractor: the
                        data's own density of lines, nothing chosen, thinned or merged.
  data/web-spines.bin   FILAMENT SPINES of the site's own density field (data/web-density.webp, from the real galaxy
                        survey): ridge lines of the smoothed field, the skeleton of the cosmic web.
Both are baked geometry: the browser never sees a velocity field, it draws segments.
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
    # Perseus, label 6 Shapley, label 3 Hercules. Re-checked 2026-11-15 against the velocity field itself: of all 48
    # axis orders and flips, this one agrees best by far with where streamlines actually end (purity 0.845, next
    # 0.652), and label 1 holds 4,079 voxels = 1.94e6 (Mpc/h)^3, the paper's 2e6 for Laniakea.
    # (An earlier note here said lines seeded near us end at (-46, 11, -3), "the Great Attractor's known place". That
    # was wrong: in this 64^3 reconstruction they end at (-46, 11, +48) Mpc/h, by a density peak at (-39, -8, 55) —
    # the classical Great Attractor's SGX and SGY, but ~50 Mpc/h higher in SGZ.)
    i = np.clip(np.floor((x + BOX / 2) / BOX * NB).astype(int), 0, NB - 1)
    return boa[i[:, 2], i[:, 1], i[:, 0]]


vb = (np.argwhere(boa == 1)[:, ::-1] + 0.5) / NB * BOX - BOX / 2
print("Laniakea: %d voxels, centroid %s Mpc/h, equivalent radius %.0f Mpc/h" % (len(vb), vb.mean(axis=0).round(0), (len(vb) * (BOX / NB) ** 3 * 3 / 4 / np.pi) ** (1 / 3)))

# THE REAL SET (owner, 2026-11-15: "我想要真实的线的密度和数量"). No seeds of our own choosing, no thinning, no
# merging of tributaries: ONE streamline from the centre of EVERY cell of the published velocity grid (64^3, 15.6 Mpc/h)
# inside the volume the site shows, each followed all the way to where the flow stalls (its attractor) — the same
# construction the watershed itself is made of. The density of lines is then the data's own: uniform where they start,
# crowding into trunks where the flow converges.
SEED_R = 200.0                                         # Mpc/h: the cosmic-web tier (its density box reaches 175)
cc = (np.arange(NV) + 0.5) / NV * BOX - BOX / 2
gx3, gy3, gz3 = np.meshgrid(cc, cc, cc, indexing="ij")
seeds = np.stack([gx3.ravel(), gy3.ravel(), gz3.ravel()], axis=1)
seeds = seeds[np.linalg.norm(seeds, axis=1) < SEED_R]
kinds_seed = basin_at(seeds)
DS, STALL, R_OUT, NSTEP = 3.2, 25.0, 330.0, 170
n = len(seeds)
P = np.full((NSTEP + 1, n, 3), np.nan); P[0] = seeds
SPD = np.zeros((NSTEP + 1, n))
alive = np.ones(n, bool); npt = np.ones(n, int)
p = seeds.copy()
for step in range(NSTEP):
    idx = np.flatnonzero(alive)
    if not len(idx):
        break
    v1 = v_at(p[idx]); n1 = np.linalg.norm(v1, axis=1)
    SPD[step, idx] = n1
    go = n1 >= STALL                                   # the flow stalls: an attractor
    mid = p[idx] + 0.5 * DS * v1 / np.maximum(n1, 1e-9)[:, None]
    v2 = v_at(mid); n2 = np.linalg.norm(v2, axis=1)
    q = p[idx] + DS * v2 / np.maximum(n2, 1e-9)[:, None]
    go &= np.linalg.norm(q, axis=1) <= R_OUT
    if step >= 8:                                      # circling an attractor instead of arriving: stop there
        back = P[step - 8, idx]
        go &= np.linalg.norm(q - back, axis=1) > 2.2 * DS
    ok = idx[go]
    p[ok] = q[go]; P[step + 1, ok] = q[go]; npt[ok] += 1
    alive[idx[~go]] = False


def simplify(pts, tol):
    """Ramer-Douglas-Peucker: drop the points a smooth line does not need (the file is drawn, not analysed)."""
    keep = np.zeros(len(pts), bool); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]; ab = b - a; L = np.linalg.norm(ab)
        seg = pts[i + 1:j] - a
        d = np.linalg.norm(seg, axis=1) if L < 1e-9 else np.linalg.norm(np.cross(seg, ab / L), axis=1)
        k = int(np.argmax(d))
        if d[k] > tol:
            keep[i + 1 + k] = True; stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return keep


flow, fk, fb, ends = [], [], [], []
for i in rng.permutation(n):                           # random order: a phone may draw the first part of the file
    m = npt[i]
    if m < 4:
        continue                                       # a cell sitting on an attractor: no line to draw
    pts = P[:m, i]; spd = SPD[:m, i].copy(); spd[-1] = spd[-2]
    kp = simplify(pts, 0.45)
    flow.append(pts[kp] / H); fk.append(int(kinds_seed[i])); ends.append(pts[-1])
    fb.append(np.clip(0.35 + 0.65 * spd[kp] / 600.0, 0, 1))
ends = np.array(ends); fk_a = np.array(fk)
le = ends[fk_a == 1]
print("flow lines %d of %d cells (Laniakea %d), points %d; per basin %s" % (len(flow), n, int((fk_a == 1).sum()), sum(len(l) for l in flow),
      dict(zip(*[x.tolist() for x in np.unique(fk_a, return_counts=True)]))))
print("median length %.0f Mpc/h; Laniakea lines end near (median) %s Mpc/h (the classical Great Attractor is about (-47, 13, -5))" % (
      np.median([np.linalg.norm(np.diff(l, axis=0), axis=1).sum() * H for l in flow]), np.median(le, axis=0).round(0)))
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
