"""galaxy_model.py — the single source of truth for the site's Milky Way (pure numpy).

One model, used three ways:
  * bake_maps.py   → top-down maps the browser ray-marches (the galaxy seen from OUTSIDE)
  * build_scene.py → an OpenVDB volume that Cycles renders (the band seen from INSIDE, beauty frames)
  * galaxy-volume.js mirrors the constants below (bulge/bar, scale heights, radial laws)

Frame: galactocentric, right-handed, units = kly. +x is the Sun→centre direction, +y is l = 90°,
+z the north galactic pole; the Sun sits at (-RSUN, 0, ZSUN). The arm equation is the SAME one
natal-sky.js uses for its 118k resolved stars (4 arms, 12° pitch, arm 0 threading the Sun), so the
baked light and the star points land on the same arms.
"""
import numpy as np

RGAL = 50.0                      # kly — the stellar disc's nominal rim (= 2600 scene units)
RSUN = 0.52 * RGAL               # 26 kly, as GAL_RSUN
ZSUN = 0.065                     # the Sun's real height above the mid-plane (~20 pc)
PITCH = np.radians(12.0)
K = float(np.tan(PITCH))
SPAN = 6.6
A0 = RGAL / float(np.exp(K * SPAN))          # radius where the arms begin (≈12.3 kly)
THETA_SUN = float(np.log(RSUN / A0)) / K
PHASE0 = float(np.pi) - THETA_SUN            # arm 0 passes through the Sun
BAR_ANG = PHASE0 + float(np.pi)              # the bar's near end: arms 0 and 2 spring from its tips (l ≈ +28°)
L_MAP = 1.22 * RGAL                          # half-extent of the baked maps
ZMAX = 4.0                                   # half-thickness of the volume

HR_OLD, HR_YOUNG = 8.5, 12.0                 # radial scale lengths
H_OLD0, H_YOUNG, H_DUST = 1.0, 0.42, 0.30    # vertical scale heights (sech^2)
BAR_A, BAR_B, BAR_C = 7.5, 2.4, 1.6          # bar semi-axes
BULGE_R, BULGE_Z = 2.3, 1.8                  # central spheroid
BULGE_AMP, BAR_AMP = 2.6, 0.95               # peak emissivity per kly (old disc mid-plane centre = 0.5)
OLD_MAX, YOUNG_MAX, HII_MAX, TAU_MAX = 2.0, 6.0, 14.0, 6.0   # 8-bit encoding ranges of the maps


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def fft_noise(n, beta, seed, kmin=1.0):
    """periodic gaussian field with a k^-beta power spectrum, zero mean, unit variance"""
    rng = np.random.default_rng(seed)
    kx = np.fft.fftfreq(n)[:, None] * n
    ky = np.fft.rfftfreq(n)[None, :] * n
    k = np.sqrt(kx * kx + ky * ky)
    k[0, 0] = 1.0
    amp = k ** (-beta / 2.0)
    amp[k < kmin] = 0.0
    f = np.fft.irfft2(amp * np.exp(2j * np.pi * rng.random(amp.shape)), s=(n, n))
    f -= f.mean()
    f /= f.std()
    return f.astype(np.float32)


def sample(tile, u, v):
    """bilinear lookup of a periodic tile at (u, v) in tile units"""
    n = tile.shape[0]
    x = np.mod(u, 1.0) * n
    y = np.mod(v, 1.0) * n
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    fx = (x - x0).astype(np.float32)
    fy = (y - y0).astype(np.float32)
    x0 %= n
    y0 %= n
    x1 = (x0 + 1) % n
    y1 = (y0 + 1) % n
    return (tile[y0, x0] * (1 - fx) * (1 - fy) + tile[y0, x1] * fx * (1 - fy)
            + tile[y1, x0] * (1 - fx) * fy + tile[y1, x1] * fx * fy)


def ridged(n, sharp=3.0):
    return np.clip(1.0 - np.abs(n) / 1.6, 0.0, 1.0) ** sharp


# One model, several galaxies: everything that differs between them lives in a config.
MW = dict(
    name="mw", rgal=RGAL, pitch=PITCH, span=SPAN, arms=4, arm_amp=(1.0, 0.62, 1.0, 0.62), phase0=PHASE0, bar_ang=BAR_ANG,
    lmap=L_MAP, zmax=ZMAX, hr_old=HR_OLD, hr_young=HR_YOUNG, h_old0=H_OLD0, h_young=H_YOUNG, h_dust=H_DUST,
    bar=(BAR_A, BAR_B, BAR_C), bulge=(BULGE_R, BULGE_Z), bulge_amp=BULGE_AMP, bar_amp=BAR_AMP,
    sig=(0.55, 0.045), rings=((14.0, 3.8, 0.9, 0.8),), ring_arms=(), hole_r=6.5, hr_dust=16.0,
    young_gain=2.4, lane_gain=2.3, bar_lanes=True, hii_n=520, hii_p=(0.31, 0.19, 0.31, 0.19), hii_ring=None, hii_len=26.0, diffuse_dust=0.17, dust_inner=0.0, feather=0.95)

# Andromeda (M31): an Sb spiral ~1.6× the Milky Way. Two tightly wound arms (pitch ~9°), a big classical bulge, only a
# weak bar, modest star formation — most of it in the famous 10-kpc ring (R ≈ 33 kly) with a fainter outer ring near
# 49 kly — and dust that lives in those rings and lanes, thin enough face-on (tau < ~1) that at 77.5° the near side
# only dims the bulge in lanes instead of hiding half of it. (Disc radius from the D25 isophote, ~152 kly across.)
_m31_pitch = np.radians(9.0)
M31 = dict(
    name="m31", rgal=80.0, pitch=_m31_pitch, span=float(np.log(80.0 / 15.0) / np.tan(_m31_pitch)), arms=2, arm_amp=(1.0, 0.85),
    phase0=0.6, bar_ang=0.9, lmap=1.22 * 80.0, zmax=10.0, hr_old=17.0, hr_young=26.0, h_old0=1.3, h_young=0.5, h_dust=0.34,
    bar=(6.0, 3.6, 2.4), bulge=(3.6, 2.7), bulge_amp=3.0, bar_amp=0.35,
    sig=(0.80, 0.032), rings=((33.0, 3.4, 1.2, 1.0), (49.0, 4.2, 0.5, 0.5)), ring_arms=((33.0, 2.3, 1.15, 1.0), (49.0, 3.0, 0.40, 0.45)),
    hole_r=9.0, hr_dust=30.0, young_gain=1.35, lane_gain=1.1, bar_lanes=False, hii_n=440, hii_p=(0.5, 0.5), hii_ring=(33.0, 1.6, 0.55), hii_len=48.0, diffuse_dust=0.06, dust_inner=11.0, feather=0.45)


def _k(cfg):
    return float(np.tan(cfg["pitch"]))


def _a0(cfg):
    return cfg["rgal"] / float(np.exp(_k(cfg) * cfg["span"]))


def h_old(R, cfg=None):
    cfg = cfg or MW
    return cfg["h_old0"] * (1.0 + 0.45 * (R / cfg["rgal"]) ** 2)          # the old disc flares outward


def bulge_bar(X, Y, Z, cfg=None):
    """3-D emissivity of the bar + central spheroid (analytic; mirrored in GLSL)"""
    cfg = cfg or MW
    ba, bb_, bc = cfg["bar"]
    cb, sb = np.cos(cfg["bar_ang"]), np.sin(cfg["bar_ang"])
    xb = X * cb + Y * sb
    yb = -X * sb + Y * cb
    m_bar = np.sqrt((xb / ba) ** 2 + (yb / bb_) ** 2 + (Z / bc) ** 2)
    m_b = np.sqrt((X * X + Y * Y) / cfg["bulge"][0] ** 2 + (Z / cfg["bulge"][1]) ** 2)
    return cfg["bar_amp"] * np.exp(-m_bar ** 1.7) + cfg["bulge_amp"] * np.exp(-1.35 * m_b - (m_b / 3.6) ** 4)   # (the quartic term ends the spheroid: no endless faint halo)


def surface_maps(N, seed=7, cfg=None):
    """face-on maps on an N×N grid over [-lmap, lmap]^2 (row = y, column = x).
    old / young are stored as MODULATIONS of their smooth exponential discs (the consumer multiplies
    exp(-R/h) back in) so 8 bits never band in the faint outer disc; tau is the face-on optical depth."""
    cfg = cfg or MW
    RG, LM, PIT, KK, AA, PH0, NA = cfg["rgal"], cfg["lmap"], cfg["pitch"], _k(cfg), _a0(cfg), cfg["phase0"], cfg["arms"]
    DA = 2 * np.pi / NA                                # azimuth between neighbouring arms
    ax = ((np.arange(N, dtype=np.float32) + 0.5) / N * 2.0 - 1.0) * LM
    X, Y = np.meshgrid(ax, ax, indexing="xy")
    R = np.hypot(X, Y)
    PHI = np.arctan2(Y, X)
    U0, V0 = X / (2 * LM) + 0.5, Y / (2 * LM) + 0.5

    n_low = fft_noise(1024, 3.2, seed + 1, 2.0)      # arm wobble, mid-plane warp
    n_mid = fft_noise(1024, 2.4, seed + 2, 4.0)      # star clouds
    n_fine = fft_noise(1024, 2.0, seed + 3, 8.0)     # fine mottling
    n_fil = fft_noise(1024, 2.1, seed + 4, 3.0)      # filaments (sampled in spiral coordinates)
    n_fea = fft_noise(1024, 2.2, seed + 5, 3.0)      # feathers / spurs

    wob = 0.16 * sample(n_low, U0, V0) + 0.05 * sample(n_low, 3 * U0 + 0.31, 3 * V0 + 0.77)
    psi = np.log(np.maximum(R, 0.05) / AA) / KK
    q = (PHI - psi - PH0 + wob) / DA
    ai = np.round(q)
    daz = (q - ai) * DA
    sgn = np.where(daz >= 0, 1.0, -1.0).astype(np.float32)      # the neighbouring arm on this point's side
    dperp = R * daz * np.sin(PIT)                    # kly across the arm; + = the concave (inner) side
    sig = cfg["sig"][0] + cfg["sig"][1] * R
    w_arm = smoothstep(0.80 * AA, 1.25 * AA, R) * (1.0 - smoothstep(0.80 * RG, 1.10 * RG, R))
    ring_y = sum(by * np.exp(-((R - r0) / w0) ** 2) for r0, w0, by, bd in cfg["rings"])      # star-forming rings boost what the arms carry
    ring_d = sum(bd * np.exp(-((R - r0) / w0) ** 2) for r0, w0, by, bd in cfg["rings"])
    cl = np.exp(0.85 * sample(n_mid, 2 * U0, 2 * V0) + 0.35 * sample(n_fine, 5 * U0, 5 * V0)) / 1.5

    # filaments follow the arms: noise sampled in (across-arm, along-arm) coordinates, stretched 5:1
    fil = ridged(sample(n_fil, q * 2.0, psi * 1.25), 2.6)
    bead = np.exp(0.7 * sample(n_low, q * 0.5 + 0.13, psi * 0.35))
    # each arm brightens and fades along its length (the minor ones break into segments). The arm's identity must be
    # its index modulo the arm count: the raw index jumps across the azimuth branch cut and would seam the arm there.
    def arm_amp(idx):
        aidx = np.mod(idx, NA).astype(np.int32)
        a = np.asarray(cfg["arm_amp"], np.float32)[aidx]
        sid = aidx.astype(np.float32)
        seg = sample(n_low, sid * 0.371 + 0.2, psi * 0.21 + sid * 0.53)
        a = a * np.where(a >= 1.0, 0.78 + 0.34 * seg, smoothstep(-1.1, 0.5, seg) * (0.9 + 0.3 * seg)).astype(np.float32)
        return np.clip(a, 0.0, 1.5)

    amp1, amp2 = arm_amp(ai), arm_amp(ai + sgn)
    dperp2 = R * (daz - sgn * DA) * np.sin(PIT)

    def arms(offset, width):
        """a gaussian ridge along every arm, each with its own amplitude. Summing the two nearest arms keeps the field
        continuous across the mid-line between them (one arm alone leaves a step there — a hairline arc in the disc)."""
        return (amp1 * np.exp(-0.5 * ((dperp - offset) / width) ** 2) + amp2 * np.exp(-0.5 * ((dperp2 - offset) / width) ** 2)) * w_arm

    # feathers: steeper-pitch spurs crossing the arms
    psi2 = np.log(np.maximum(R, 0.05)) / np.tan(np.radians(38.0))
    fea = ridged(sample(n_fea, (PHI - psi2) / (2 * np.pi) * 26.0, np.log(np.maximum(R, 0.05)) * 2.2), 3.2)

    # --- old stars: a smooth exponential disc (divided out), an inner depression, broad arms ---
    aw = arms(0.0, 1.2 * sig)
    edge = 1.0 - smoothstep(0.92 * RG, 1.20 * RG, R)
    old = (1.0 - 0.55 * np.exp(-(R / cfg["hole_r"]) ** 2)) * (1.0 + 0.60 * aw) * (1.0 + 0.10 * sample(n_mid, U0, V0)) * edge

    # --- young blue stars: on the arm ridge, clumped into star clouds ---
    ya = arms(-0.10 * sig, 0.60 * sig)
    young = (ya * (0.22 + 1.05 * cl) * bead + 0.035 * w_arm) * (1.0 + ring_y) * edge * cfg["young_gain"]

    # --- dust: lanes on the concave edge of each arm, filamentary; feathers; a patchy diffuse layer ---
    lane = arms(0.55 * sig, 0.40 * sig)
    a_wide = (np.exp(-0.5 * ((dperp - 0.10 * sig) / (1.35 * sig)) ** 2) + np.exp(-0.5 * ((dperp2 - 0.10 * sig) / (1.35 * sig)) ** 2)) * w_arm
    w_dust = 1.0 - smoothstep(0.78 * RG, 1.06 * RG, R)
    tau = cfg["lane_gain"] * lane * (0.30 + 1.25 * fil + 0.30 * cl) * (1.0 + ring_d)
    tau += cfg["feather"] * fea * a_wide * (0.4 + 0.6 * cl)
    diffuse = cfg["diffuse_dust"] * np.exp(-R / cfg["hr_dust"]) * (0.35 + 0.65 * cl) * 2.2
    if cfg["dust_inner"] > 0:
        diffuse = diffuse * (1.0 - np.exp(-(R / cfg["dust_inner"]) ** 2))     # a nearly dust-free centre (M31: its dust lives in the rings)
    tau += diffuse
    if cfg["bar_lanes"]:
        # the bar's own lanes, along its leading edges (rotation is toward decreasing azimuth)
        cb, sb = np.cos(cfg["bar_ang"]), np.sin(cfg["bar_ang"])
        xb, yb = X * cb + Y * sb, -X * sb + Y * cb
        blane = np.exp(-0.5 * ((yb + np.sign(xb) * (0.85 - 0.035 * np.abs(xb))) / 0.36) ** 2)
        tau += 2.0 * blane * smoothstep(0.6, 2.2, np.abs(xb)) * (1.0 - smoothstep(0.82 * AA, 1.08 * AA, np.abs(xb))) * (0.5 + 0.7 * fil)
    # rings that are structures in their own right (M31's 10-kpc ring): slightly eccentric, beaded, with a dust ring inside
    for r0, w0, gy, gt in cfg["ring_arms"]:
        Re = R * (1.0 + 0.05 * sample(n_low, 2 * U0 + 0.5, 2 * V0 + 0.1))
        rb = np.exp(0.6 * sample(n_low, PHI / (2 * np.pi) * 3.0, np.full_like(PHI, 0.37)))
        young = young + gy * np.exp(-((Re - r0) / w0) ** 2) * (0.25 + 1.0 * cl) * rb * edge * cfg["young_gain"]
        rf = ridged(sample(n_fil, PHI / (2 * np.pi) * 24.0, Re / 4.0), 2.2)
        tau += gt * np.exp(-((Re - 0.965 * r0) / (0.8 * w0)) ** 2) * (0.30 + 1.2 * rf + 0.3 * cl)
    young = np.minimum(young, YOUNG_MAX)
    tau = np.minimum(tau * w_dust, TAU_MAX)

    # --- HII regions: discrete pink knots just downstream of the lanes ---
    rng = np.random.default_rng(seed + 9)
    hii = np.zeros((N, N), np.float32)
    px = 2 * LM / N
    for _ in range(cfg["hii_n"]):
        on_ring = cfg["hii_ring"] is not None and rng.random() < cfg["hii_ring"][2]
        j = rng.choice(NA, p=cfg["hii_p"])
        th = 0.15 + (cfg["span"] - 0.5) * rng.random() ** 1.25
        r = AA * np.exp(KK * th)
        if on_ring:
            r2 = cfg["hii_ring"][0] + rng.normal(0, cfg["hii_ring"][1]); ph = rng.random() * 2 * np.pi; sg = cfg["sig"][0] + cfg["sig"][1] * r2
        else:
            if rng.random() > np.exp(-(r - AA) / cfg["hii_len"]) * (1 - smoothstep(0.80 * RG, 1.02 * RG, r)):
                continue
            sg = cfg["sig"][0] + cfg["sig"][1] * r
            r2 = r - rng.normal(0.22 * sg, 0.34 * sg) / np.cos(PIT)
            ph = th + PH0 + j * DA + rng.normal(0, 0.012)
        cx, cy = r2 * np.cos(ph), r2 * np.sin(ph)
        s = 0.10 + 0.70 * rng.random() ** 3.5
        flux = (s / 0.3) ** 1.3 * (0.5 + 1.1 * rng.random()) * (1.0 if cfg["arm_amp"][j] >= 1.0 else 0.75)
        el, an = 1.0 + 0.9 * rng.random(), rng.random() * np.pi
        w = int(np.ceil(4.5 * s * el / px))
        ix, iy = int((cx + LM) / px), int((cy + LM) / px)
        x0, x1, y0, y1 = max(ix - w, 0), min(ix + w + 1, N), max(iy - w, 0), min(iy + w + 1, N)
        if x0 >= x1 or y0 >= y1:
            continue
        dx = ax[x0:x1][None, :] - cx
        dy = ax[y0:y1][:, None] - cy
        da, db = dx * np.cos(an) + dy * np.sin(an), -dx * np.sin(an) + dy * np.cos(an)
        d2 = (da / (s * el)) ** 2 + (db / s) ** 2
        hii[y0:y1, x0:x1] += flux * (np.exp(-0.5 * d2) + 0.25 * np.exp(-0.5 * d2 / 6.0))
    hii *= 1.0 + 0.5 * sample(n_fine, 9 * U0, 9 * V0)
    np.clip(hii, 0, HII_MAX, out=hii)

    warp = sample(n_low, 1.7 * U0 + 0.4, 1.7 * V0 + 0.9)      # mid-plane waviness of the dust layer (unit variance)
    grain = sample(n_fine, 11 * U0 + 0.2, 11 * V0 + 0.6)      # extra detail for the consumer
    f32 = lambda a: np.ascontiguousarray(a, dtype=np.float32)
    return {"old": f32(old), "young": f32(young), "hii": f32(hii), "tau": f32(tau),
            "warp": f32(warp), "grain": f32(grain), "R": f32(R), "X": f32(X), "Y": f32(Y)}


def volume_grids(N=768, NZ=64, seed=7, cfg=None):
    """dense emissivity / extinction grids, shape (N, N, NZ) indexed [x, y, z], units per kly"""
    cfg = cfg or MW
    m = surface_maps(N, seed, cfg)
    z = ((np.arange(NZ, dtype=np.float32) + 0.5) / NZ * 2.0 - 1.0) * cfg["zmax"]
    R = m["R"].T[:, :, None]
    X, Y = m["X"].T[:, :, None], m["Y"].T[:, :, None]
    Z = z[None, None, :]

    def slab(col, h, z0=0.0):
        return (col / (2.0 * h)) / np.cosh(np.clip((Z - z0) / h, -20, 20)) ** 2

    ho = h_old(R, cfg)
    out = {}
    out["old"] = slab(m["old"].T[:, :, None] * np.exp(-R / cfg["hr_old"]), ho).astype(np.float32)
    out["bulge"] = bulge_bar(X, Y, Z, cfg).astype(np.float32)
    ycol = m["young"].T[:, :, None] * np.exp(-R / cfg["hr_young"])
    out["young"] = slab(ycol, cfg["h_young"]).astype(np.float32)
    out["hii"] = slab(m["hii"].T[:, :, None] * np.exp(-R / cfg["hr_young"]), 0.8 * cfg["h_young"]).astype(np.float32)
    out["dust"] = slab(m["tau"].T[:, :, None], cfg["h_dust"], 0.11 * m["warp"].T[:, :, None]).astype(np.float32)
    return out, {"dx": 2 * cfg["lmap"] / N, "dz": 2 * cfg["zmax"] / NZ}
