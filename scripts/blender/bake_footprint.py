"""bake_footprint.py — the GPS footprint as one fine line on the globe (system python: numpy + PIL + scipy).

    python3 scripts/blender/bake_footprint.py [--out data] [--w 8192] [--hop 50] [--preview DIR] [--drop-flights]

Reads data/footprint-points.f32 (interleaved float32 lat, lon, in the order the phone recorded them: a time-ordered
track) and writes
  data/footprint-globe.webp     equirectangular, 8192x4096, lossless. Three independent channels:
                                  R  distance to the nearest stretch of track (0 = on it), great-circle, compressed as
                                     d/(d+k) so the first few texels keep ~1/12-texel precision and the field still
                                     reaches `range` texels out. The page draws the line from this at any zoom with a
                                     constant on-screen weight; a line stored as pixels would bead and thicken.
                                  G  where time was spent: sample density (per unit area), tone-mapped with asinh and
                                     then blurred to sigma ~25 km, so home is the brightest place without ever being a
                                     flat patch
                                  B  the same at sigma ~80 km: a faint aura round the places lived in
  data/footprint-globe-2k.webp  the same at 2048x1024 for phones and small GPUs
  data/footprint-globe.json     what the page needs to read the maps: the point count and the encoding constants

Everything the phone actually recorded is drawn — on the ground or in the air: it is the owner's footprint, and it is
not this script's place to edit it. Two things in the log are not recordings and are left out, with nothing put in
their place (no chord across the map, no arc):
  hops     two consecutive samples further apart than --hop km: the phone did not record the way between them
  spikes   a single sample far from both neighbours while the neighbours sit together: a bad fix
With --drop-flights (off by default) a third class is removed as well:
  flights  stretches recorded IN the air. There are no timestamps, but the logger writes about once every 2-3 s, so a
           step is a speed: a car leaves ~0.1 km steps, a 300 km/h train under 0.3, an airliner 0.4-0.75 in a line
           straighter than any road. Those stretches, their climbs and descents, and anything moving fast over open
           sea (data/earth-heightmap.i16) are airborne.
"""
import argparse
import json
import os
import time

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, gaussian_filter1d, median_filter, minimum_filter, zoom
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="data")
ap.add_argument("--w", type=int, default=8192, help="width of the full texture (<= 8192)")
ap.add_argument("--hop", type=float, default=50.0, help="km between consecutive samples above which the track is cut")
ap.add_argument("--preview", default="", help="write PNG previews of each channel into this folder")
ap.add_argument("--keep-spikes", action="store_true", help="keep single-sample out-and-back jumps")
ap.add_argument("--drop-flights", action="store_true", help="leave out the stretches recorded in the air (default: draw them — they are part of the record)")
a = ap.parse_args()

R_KM = 6371.0
EQ_KM = 2 * np.pi * R_KM          # 40,030 km round the equator
K_TEX, MAX_TEX = 24.0, 64.0       # R channel, in texels of the 8192 map: d/(d+K), reaching MAX texels (~313 km)
SIG_G_KM, SIG_B_KM = 25.0, 80.0   # the two density scales
DENS_KNEE = 400.0                 # samples per 10 km texel where the asinh tone curve turns over (~4 passes along a road)
t0 = time.time()


def unit(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def arc_km(u, v):
    c = np.linalg.norm(u - v, axis=-1)
    return 2 * R_KM * np.arcsin(np.clip(c / 2, 0, 1))


def runs_of(mask):
    idx = np.flatnonzero(np.diff(np.concatenate([[0], mask.astype(np.int8), [0]])))
    return idx.reshape(-1, 2)


# ---------------------------------------------------------------------------------------------- the track
p = np.fromfile(os.path.join(a.out, "footprint-points.f32"), dtype="<f4").reshape(-1, 2).astype(np.float64)
p = p[np.isfinite(p).all(axis=1)]
n_raw = len(p)
u = unit(p[:, 0], p[:, 1])

# spikes: one sample far from both its neighbours while the neighbours sit next to each other
n_spike = 0
if not a.keep_spikes:
    for _ in range(3):
        din, dout, skip = arc_km(u[:-2], u[1:-1]), arc_km(u[1:-1], u[2:]), arc_km(u[:-2], u[2:])
        bad = (din > 5.0) & (dout > 5.0) & (skip < 0.2 * np.minimum(din, dout))
        if not bad.any():
            break
        keep = np.ones(len(u), bool)
        keep[1:-1] = ~bad
        n_spike += int(bad.sum())
        p, u = p[keep], u[keep]

step = arc_km(u[:-1], u[1:])
hop = step > a.hop
edges = [0, 1, 5, 20, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200, 300, 500, 1000, 2000, 5000, 20100]
hist, _ = np.histogram(step, bins=edges)
print(f"points {n_raw} (spikes dropped {n_spike}); median step {np.median(step) * 1000:.0f} m")
print("step histogram (km): " + "  ".join(f"{lo}-{hi}:{c}" for lo, hi, c in zip(edges[:-1], edges[1:], hist)))


# ---------------------------------------------------------------------------------------------- flights
def find_airborne():
    """per-step flag: this step was flown, not travelled on the ground"""
    # the turn between consecutive steps, in the tangent plane at the middle sample
    v0, v1, m = u[1:-1] - u[:-2], u[2:] - u[1:-1], u[1:-1]
    v0 = v0 - (v0 * m).sum(1, keepdims=True) * m
    v1 = v1 - (v1 * m).sum(1, keepdims=True) * m
    n0, n1 = np.linalg.norm(v0, axis=1), np.linalg.norm(v1, axis=1)
    turn = np.degrees(np.arccos(np.clip((v0 * v1).sum(1) / np.maximum(n0 * n1, 1e-30), -1, 1)))
    turn[(n0 < 1e-9) | (n1 < 1e-9)] = 90.0                       # standing still is not flying straight
    turn = np.concatenate([[90.0], turn])                        # per step: the turn at its start
    ms7, mt7 = median_filter(step, size=15, mode="nearest"), median_filter(turn, size=15, mode="nearest")
    ms5 = median_filter(step, size=7, mode="nearest")

    # seed A: cruise. A quarter of a kilometre or more between fixes that come every 1-3 s, on a course straighter
    # than any road, for 30 km: only an aircraft does that. (A stretch logged sparsely, a fix every kilometre or more,
    # could be a desert interstate just as well: never a seed.)
    seed = (ms7 >= 0.24) & (ms7 <= 0.90) & (mt7 <= 0.8)
    seed = binary_closing(seed, structure=np.ones(9, bool)) & ~hop   # the logger's rhythm (1 s, 2 s, 1 s, ...) dips the median for a step or two
    for i, j in runs_of(seed):
        if j - i < 12 or step[i:j].sum() < 30.0:                 # a long straight bridge is not a flight
            seed[i:j] = False
    # the same when the log opens or closes in mid-air: ten dense, smooth steps at 100+ m/s right after (or right
    # before) a gap of 100 km or more are the top of a descent (the end of a climb)
    for h in np.flatnonzero(step >= 100.0):
        for w in (slice(h + 1, h + 11), slice(max(h - 10, 0), h)):
            if (w.stop <= len(step) and w.stop - w.start == 10 and np.sort(step[w])[-2] <= 3.0 and step[w].max() <= a.hop
                    and np.median(step[w]) >= 0.24 and np.median(turn[w][1:]) <= 2.5):
                seed[w] = True
    # and a whole crumb of log between two such gaps, every fix of it at that speed and on one course
    big = np.flatnonzero(step >= 100.0)
    for h0, h1 in zip(big[:-1], big[1:]):
        w = slice(h0 + 1, h1)
        if 4 <= h1 - h0 - 1 <= 40 and step[w].max() <= 3.0 and np.median(step[w]) >= 0.24 and np.median(turn[w][1:]) <= 2.5:
            seed[w] = True
    n_a = int(seed.sum())
    # seeds over water. Sea level comes from the site's own relief grid (data/earth-heightmap.i16, ETOPO1 every 18.5 km:
    # it has Hawaii, which the 2k ocean mask lacks). A grid that coarse cannot see a causeway or a small island, so
    # "over water" alone proves nothing near a coast: a ferry (0.03 km steps) and the drive down the Florida Keys (a
    # fix every kilometre, wandering) both stay.
    #   B  the open ocean, no land within ~130 km, and moving: nothing on the ground is out there
    #   C  off a coast, densely logged at 45-100 m/s on a smooth course: an island hop in a small aircraft
    hm = json.load(open(os.path.join(a.out, "earth-heightmap.json")))
    elev = np.fromfile(os.path.join(a.out, "earth-heightmap.i16"), dtype="<i2").reshape(hm["nlat"], hm["nlon"])
    sea = (elev[:, :-1] <= 0).astype(np.uint8)                   # rows south -> north; the last column repeats the first
    Hm, Wm = sea.shape
    wrap = np.concatenate([sea[:, -8:], sea, sea[:, :8]], axis=1)
    yy = np.clip(np.round((p[:, 0] - hm["lat0"]) / (hm["lat1"] - hm["lat0"]) * (hm["nlat"] - 1)).astype(int), 0, Hm - 1)
    xx = np.round((p[:, 1] - hm["lon0"]) / (hm["lon1"] - hm["lon0"]) * (hm["nlon"] - 1)).astype(int) % Wm
    at_sea = (minimum_filter(wrap, size=3)[:, 8:-8] > 0)[yy, xx]
    far_sea = (minimum_filter(wrap, size=15)[:, 8:-8] > 0)[yy, xx]
    seed |= far_sea[:-1] & far_sea[1:] & (ms7 >= 0.20) & ~hop
    hopper = at_sea[:-1] & at_sea[1:] & (ms7 >= 0.13) & (ms7 < 0.30) & (mt7 <= 4.0) & ~hop & ~seed
    for i, j in runs_of(hopper):
        if j - i < 30 or step[i:j].sum() < 20.0:
            hopper[i:j] = False
    seed |= hopper
    n_b = int(seed.sum()) - n_a

    air = seed.copy()
    # climb and descent: outward from every airborne run through samples that are still dense, still faster than
    # anything on a road and still on a smooth course (the taxi out of the airport is none of these), never across a gap
    fast = (ms5 >= 0.13) & (ms5 <= 0.90) & (step <= 3.0) & (median_filter(turn, size=7, mode="nearest") <= 3.0)
    for i, j in runs_of(seed):
        for k, d in ((i - 1, -1), (j, 1)):
            acc = 0.0
            while 0 <= k < len(step) and not air[k] and fast[k] and acc < 150.0:
                air[k] = True
                acc += step[k]
                k += d
    # and the short stretches between two airborne runs of one flight (a noisy minute, a thinner log) where nothing
    # slowed down in between
    R = runs_of(air)
    for (i0, j0), (i1, j1) in zip(R[:-1], R[1:]):
        gap = slice(j0, i1)
        if i1 > j0 and not hop[gap].any() and step[gap].sum() <= 400.0 and (ms7[gap] >= 0.2).all():
            air[gap] = True
    # a crossing: 20 km or more on a steady course, faster than a road allows, over water, and nowhere near any place
    # he was ever logged moving at ground speed. (The Overseas Highway is over water too on this grid, but he has
    # driven it slowly as well, and so it stays.)
    slow = np.concatenate([ms7 < 0.12, [False]]) | np.concatenate([[False], ms7 < 0.12])
    walked = cKDTree(np.unique(np.round(u[slow] / 1.5e-4).astype(np.int32), axis=0) * 1.5e-4)   # one point per ~1 km cell
    sea_here = sea[yy, xx] > 0
    for i0, j0 in runs_of(~air & ~hop & (ms7 >= 0.13)):
        i = i0
        while i < j0:                                            # judged 20 km at a time: a run can start at sea and end in town
            j = i + int(np.searchsorted(np.cumsum(step[i:j0]), 20.0)) + 1
            if j > j0:
                break
            if np.median(mt7[i:j]) <= 3.5 and sea_here[i:j + 1].mean() >= 0.7:
                dd, _ = walked.query(u[i:j + 1], distance_upper_bound=5.0 / R_KM)
                if np.isfinite(dd).mean() < 0.15:
                    air[i:j] = True
            i = j
    # a flight logged thinly (a fix every kilometre) leaves stretches too sparse to be a seed. They belong to the flight
    # when they continue it in a straight line: directly, or across a recording gap on the same course. A crumb of
    # under 30 km with nothing slow in it and the flight on both sides goes with it too. A sparse stretch that wanders
    # is the drive from the airport and stays, even though it touches the flight.
    def bearing(i, j):
        la0, la1 = np.radians(p[i, 0]), np.radians(p[j, 0])
        dl = np.radians(p[j, 1] - p[i, 1])
        return np.degrees(np.arctan2(np.sin(dl) * np.cos(la1), np.cos(la0) * np.sin(la1) - np.sin(la0) * np.cos(la1) * np.cos(dl)))

    def off(b0, b1):
        return abs((b1 - b0 + 180.0) % 360.0 - 180.0)

    for _ in range(12):
        cand = ~air & ~hop & (ms7 >= 0.24)
        changed = False
        for i, j in runs_of(cand):                               # steps i..j-1, samples i..j
            touch = (i > 0 and air[i - 1]) or (j < len(step) and air[j])
            straight = np.median(mt7[i:j]) <= 3.5
            crumb = step[i:j].sum() < 30.0
            before = (i > 0 and air[i - 1]) or (i > 1 and hop[i - 1] and air[i - 2])
            after = (j < len(step) and air[j]) or (j + 1 < len(step) and hop[j] and air[j + 1])
            join = (touch and straight) or (crumb and before and after)
            if not join and straight:
                own = bearing(i, j)
                if i > 1 and hop[i - 1] and air[i - 2] and step[i - 1] <= 600.0:
                    join = off(bearing(max(i - 22, 0), i - 1), bearing(i - 1, i)) <= 25.0 and off(bearing(i - 1, i), own) <= 25.0
                if not join and j + 1 < len(step) and hop[j] and air[j + 1] and step[j] <= 600.0:
                    join = off(own, bearing(j, j + 1)) <= 25.0 and off(bearing(j, j + 1), bearing(j + 1, min(j + 22, len(step)))) <= 25.0
            if join:
                air[i:j] = True
                changed = True
        if not changed:
            break
    return air, n_a, n_b, ms7, mt7, far_sea


n_air_km = 0.0
air = np.zeros(len(step), bool)
if a.drop_flights:
    air, n_a, n_b, ms7, mt7, far_sea = find_airborne()
    n_air_km = float(step[air].sum())
    R = runs_of(air)
    print(f"in the air: {int(air.sum())} steps, {n_air_km:,.0f} km in {len(R)} stretches "
          f"(cruise seeds {n_a} steps, over-water seeds {n_b}) - not drawn")
    # what is left that still looks fast and straight: logged too thinly to tell a flight from a straight road. Kept.
    amb = (~air) & ~hop & (ms7 >= 0.3) & (mt7 <= 1.5)
    amb_runs = [(i, j) for i, j in runs_of(amb) if step[i:j].sum() >= 30.0]
    if amb_runs:
        print(f"kept, ambiguous (fast and straight but sparsely logged): {len(amb_runs)} stretches, "
              f"{sum(step[i:j].sum() for i, j in amb_runs):,.0f} km")
        for i, j in amb_runs:
            print(f"   {step[i:j].sum():5.0f} km  ({p[i, 0]:.2f},{p[i, 1]:.2f}) -> ({p[j, 0]:.2f},{p[j, 1]:.2f})  "
                  f"median step {np.median(step[i:j]):.2f} km")

# a sample is on the ground unless a step on either side of it was flown
on_ground = np.ones(len(u), bool)
on_ground[:-1] &= ~air
on_ground[1:] &= ~air
if a.drop_flights:
    # a lone fix out on the open ocean, or one between two recording gaps with the flight on either side, was taken
    # from a seat: not a place he stood
    lone = np.zeros(len(u), bool)
    lone[2:-2] = hop[1:-2] & hop[2:-1] & air[:-3] & air[3:]
    n_lone = int((on_ground & (far_sea | lone)).sum())
    on_ground &= ~(far_sea | lone)
    print(f"fixes taken in the air between gaps or over open ocean: {n_lone} - not drawn")
draw = ~hop & ~air & on_ground[:-1] & on_ground[1:]   # the steps that become line
print(f"cut at {int(hop.sum())} hops > {a.hop:g} km ({step[hop].sum():,.0f} km not recorded, not drawn); "
      f"{len(runs_of(draw))} ground stretches")

# ground stretches, resampled so that no gap along the drawn line is wider than a fifth of a texel
SPACING_KM = 0.2 * EQ_KM / 8192
g = np.where(draw)[0]
nsub = np.maximum(1, np.ceil(step[g] / SPACING_KM).astype(np.int64))
rep = np.repeat(np.arange(len(g)), nsub)
tt = (np.arange(len(rep)) - np.repeat(np.cumsum(nsub) - nsub, nsub)) / nsub[rep]
line = u[g][rep] * (1 - tt)[:, None] + u[g + 1][rep] * tt[:, None]
line = np.concatenate([line, u[on_ground]])   # every ground sample itself, including a stretch that is one sample long
line /= np.linalg.norm(line, axis=1, keepdims=True)
q = np.unique(np.round(line / (0.1 * 2 * np.pi / 8192)).astype(np.int32), axis=0)   # one point per ~0.5 km cell
line = q.astype(np.float64)
line /= np.linalg.norm(line, axis=1, keepdims=True)
tree = cKDTree(line)
ground_km = float(step[draw].sum())
print(f"ground track {ground_km:,.0f} km drawn, as {len(line):,} points  [{time.time() - t0:.1f}s]")


# ---------------------------------------------------------------------------------------------- R: distance to the track
def texel_dirs(W, ys, xs):
    H = W // 2
    return unit(90.0 - (ys + 0.5) / H * 180.0, (xs + 0.5) / W * 360.0 - 180.0)


def bake_distance(W):
    """uint8 map of d/(d+k), d = great-circle distance to the track in texels of THIS map."""
    H = W // 2
    scale = W / 8192.0
    k, dmax = K_TEX * scale, MAX_TEX * scale
    tex = 2 * np.pi / W                                   # one texel at the equator, radians
    out = np.full((H, W), 255, np.uint8)
    S = 8 if W >= 4096 else 4                             # coarse cells first: only those near the track are refined
    cy, cx = np.meshgrid(np.arange(H // S), np.arange(W // S), indexing="ij")
    cdir = texel_dirs(W, cy.ravel() * S + (S - 1) / 2, cx.ravel() * S + (S - 1) / 2)
    reach = (dmax + S) * tex                              # a cell whose centre is this close may hold a texel in range
    dc, _ = tree.query(cdir, distance_upper_bound=2 * np.sin(reach / 2), workers=-1)
    cand = np.where(np.isfinite(dc))[0]
    yy = (cy.ravel()[cand][:, None, None] * S + np.arange(S)[None, :, None] + np.zeros((1, 1, S), np.int64)).ravel()
    xx = (cx.ravel()[cand][:, None, None] * S + np.zeros((1, S, 1), np.int64) + np.arange(S)[None, None, :]).ravel()
    d = np.full(len(yy), np.inf)
    for s in range(0, len(yy), 2_000_000):
        sl = slice(s, s + 2_000_000)
        dd, _ = tree.query(texel_dirs(W, yy[sl], xx[sl]), distance_upper_bound=2 * np.sin(dmax * tex / 2), workers=-1)
        d[sl] = dd
    ok = np.isfinite(d)
    dt = 2 * np.arcsin(np.clip(d[ok] / 2, 0, 1)) / tex    # chord -> arc, in texels
    v = (dt / (dt + k)) / (dmax / (dmax + k))
    out[yy[ok], xx[ok]] = np.clip(np.round(v * 255), 0, 255).astype(np.uint8)
    return out, k, dmax


# ---------------------------------------------------------------------------------------------- G, B: where time was spent
def bake_density():
    """two float fields on a 4096x2048 grid, 0..1: the tone-mapped visit density at two blur radii"""
    W, H = 4096, 2048
    pg = p[on_ground]
    fx = (pg[:, 1] + 180.0) / 360.0 * W - 0.5
    fy = (90.0 - pg[:, 0]) / 180.0 * H - 0.5
    x0, y0 = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    ax, ay = fx - x0, fy - y0
    acc = np.zeros(H * W)
    for dy, wy in ((0, 1 - ay), (1, ay)):                 # bilinear splat, accumulated in float
        for dx, wx in ((0, 1 - ax), (1, ax)):
            acc += np.bincount(np.clip(y0 + dy, 0, H - 1) * W + (x0 + dx) % W, weights=wy * wx, minlength=H * W)
    acc = acc.reshape(H, W)
    rows = np.where(acc.any(axis=1))[0]
    lat = 90.0 - (np.arange(H) + 0.5) / H * 180.0
    cosl = np.maximum(np.cos(np.radians(lat)), 0.05)
    km_per_tex = EQ_KM / W
    pad = int(np.ceil(4 * SIG_B_KM / km_per_tex)) + 2
    r0, r1 = max(0, rows[0] - pad), min(H, rows[-1] + pad + 1)

    def blur(f, sig_km):
        # a texel is narrower on the ground toward the poles: widen the east-west blur by 1/cos(lat), band by band,
        # and wrap it across the date line
        sig = sig_km / km_per_tex
        f = gaussian_filter1d(f, sig, axis=0, mode="constant")
        B = 8
        for b0 in range(0, f.shape[0], B):
            c = cosl[r0 + b0:r0 + b0 + B].mean()
            f[b0:b0 + B] = gaussian_filter1d(f[b0:b0 + B], sig / c, axis=1, mode="wrap")
        return f

    # samples per unit area, at the scale of a town
    dens = blur(acc[r0:r1], 6.0) / cosl[r0:r1, None]
    # tone-map BEFORE the soft blur. One pass along a road leaves ~100 samples in a 10 km texel and home holds tens of
    # thousands: asinh keeps the first nearly linear (and therefore dark) and folds the second into a single decade.
    # Blurring afterwards gives every place a true Gaussian shoulder; blurring first and compressing after would
    # flatten home into a hard-edged disc.
    tone = np.arcsinh(dens / DENS_KNEE)
    print(f"density: one pass ~100/texel -> {np.arcsinh(100 / DENS_KNEE):.2f}, busiest texel {dens.max():,.0f} -> {tone.max():.2f}")
    out = []
    for sig_km in (SIG_G_KM, SIG_B_KM):
        f = blur(tone.copy(), sig_km)
        full = np.zeros((H, W))
        full[r0:r1] = f / f.max()
        out.append(full)
    return out


def to_size(f, W):
    H = W // 2
    if f.shape[1] == W:
        return f
    if f.shape[1] > W:
        k = f.shape[1] // W
        return f.reshape(H, k, W, k).mean(axis=(1, 3))
    k = W // f.shape[1]
    pad = np.concatenate([f[:, -2:], f, f[:, :2]], axis=1)                      # wrap in longitude before interpolating
    z = zoom(pad, k, order=3, mode="nearest", grid_mode=True)
    return np.clip(z[:, 2 * k:-2 * k], 0, 1)


# ---------------------------------------------------------------------------------------------- write
dens = bake_density()
print(f"density fields  [{time.time() - t0:.1f}s]")

meta = {"v": 2, "points": int(n_raw), "hopKm": a.hop, "groundKm": round(ground_km), "hops": int(hop.sum()),
        "airborneKm": round(n_air_km), "maps": {}}
for name, W in (("footprint-globe.webp", a.w), ("footprint-globe-2k.webp", 2048)):
    sdf, k, dmax = bake_distance(W)
    rgb = np.zeros((W // 2, W, 3), np.uint8)
    rgb[..., 0] = sdf
    rgb[..., 1] = np.round(to_size(dens[0], W) * 255)
    rgb[..., 2] = np.round(to_size(dens[1], W) * 255)
    path = os.path.join(a.out, name)
    Image.fromarray(rgb, "RGB").save(path, "WEBP", lossless=True, quality=100, method=6)
    meta["maps"]["full" if W == a.w else "small"] = {"src": name, "w": W, "h": W // 2, "k": k, "range": dmax}
    print(f"{path}: {W}x{W // 2}, {os.path.getsize(path) / 1024:.0f} KB; track within range on "
          f"{(sdf < 255).mean() * 100:.1f}% of the map  [{time.time() - t0:.1f}s]")
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        for c, ch in enumerate("rgb"):
            Image.fromarray(rgb[..., c]).save(os.path.join(a.preview, f"{os.path.splitext(name)[0]}-{ch}.png"))

path = os.path.join(a.out, "footprint-globe.json")
with open(path, "w") as f:
    json.dump(meta, f, separators=(",", ":"))
print(f"{path}: {os.path.getsize(path)} bytes  [{time.time() - t0:.1f}s]")
