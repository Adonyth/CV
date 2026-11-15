"""bake_maps.py — bake the site's Milky Way textures from galaxy_model.py (system python: numpy + cv2 + PIL).

    python3 scripts/blender/bake_maps.py [--pano-w 4096] [--disc 2048] [--out data] [--preview DIR]

Writes
  data/mw-disc-a.webp   RGB = old-star modulation, young stars, HII   (sqrt-encoded, face-on, +x right, +y up)
  data/mw-disc-b.webp   RGB = face-on dust optical depth, dust mid-plane warp, fine grain
  data/mw-pano.webp     the band as seen from the Sun: galactic (l, b), b within ±0.70 rad, u grows with l,
                        sqrt-encoded exactly like the map space.js used to bake procedurally
  data/mw-galaxy.json   the constants the browser needs to decode all of the above
"""
import argparse
import json
import os
import time

import cv2
import numpy as np
from PIL import Image

import galaxy_model as gm

C_OLD = np.array([1.00, 0.80, 0.60], np.float32)
C_BULGE = np.array([1.00, 0.72, 0.44], np.float32)
C_YOUNG = np.array([0.60, 0.76, 1.00], np.float32) * 2.2
C_HII = np.array([1.00, 0.30, 0.42], np.float32) * 1.3
EXT = np.array([0.58, 0.80, 0.98], np.float32)        # extinction per unit dust, R:G:B (reddening)
MILKY_B = 0.70


def enc(a, amax):
    return (np.sqrt(np.clip(a / amax, 0, 1)) * 255.0 + 0.5).astype(np.uint8)


def save_webp(path, rgb, q):
    Image.fromarray(rgb[::-1]).save(path, "WEBP", quality=q, method=6)      # row 0 of the arrays is y = -L → flip so +y is up
    return os.path.getsize(path)


def lowpass_levels(tile, levels):
    """band-limited copies of a periodic tile: level L keeps features larger than ~2^L pixels (a mip chain that
    stays periodic). Sampling the level that matches a ray's footprint is what keeps distant detail from aliasing
    into a barcode along the band."""
    n = tile.shape[0]
    kx = np.fft.fftfreq(n)[:, None]; ky = np.fft.rfftfreq(n)[None, :]
    k2 = kx * kx + ky * ky
    F = np.fft.rfft2(tile, axes=(0, 1)) if tile.ndim == 2 else np.fft.rfft2(tile, axes=(0, 1))
    out = []
    for L in range(levels):
        sig = 0.0 if L == 0 else 0.45 * 2.0 ** L
        g = np.exp(-2.0 * (np.pi * sig) ** 2 * k2)
        out.append(np.fft.irfft2(F * (g if tile.ndim == 2 else g[..., None]), s=(n, n), axes=(0, 1)).astype(np.float32))
    return out


def bake_pano(m, W, H, steps=230):
    """integrate the model along every line of sight from the Sun. Returns float32 [H, W, 3], row 0 = b = -MILKY_B."""
    N = m["old"].shape[0]
    base = np.dstack([m["old"], m["young"], m["hii"], m["tau"]]).astype(np.float32)
    maps = [base] + [cv2.resize(base, (N >> i, N >> i), interpolation=cv2.INTER_AREA) for i in (1, 2, 3)]
    warp = m["warp"].astype(np.float32)
    # dust detail as true 3-D fields: four independent periodic slices per octave, blended linearly along z
    P1, P2 = 2.6, 0.7                                                    # tile periods (kly)
    n1 = lowpass_levels(np.dstack([gm.fft_noise(1024, 2.3, 101 + i, 3.0) for i in range(4)]), 9)
    n2 = lowpass_levels(np.dstack([gm.fft_noise(1024, 2.0, 111 + i, 6.0) for i in range(4)]), 9)

    def slices(tile, U, V, zc):
        v4 = cv2.remap(tile, U, V, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        k = np.mod(zc, 4.0); k0 = np.floor(k).astype(np.int32) % 4; f = (k - np.floor(k)).astype(np.float32)
        a = np.take_along_axis(v4, k0[..., None], axis=2)[..., 0]
        b2 = np.take_along_axis(v4, ((k0 + 1) % 4)[..., None], axis=2)[..., 0]
        return a * (1 - f) + b2 * f

    sech2 = lambda q: 1.0 / np.cosh(np.clip(q, -18, 18)) ** 2
    l = ((np.arange(W, dtype=np.float32) + 0.5) / W - 0.5) * 2 * np.pi
    b = ((np.arange(H, dtype=np.float32) + 0.5) / H - 0.5) * 2 * MILKY_B
    foot = 2 * np.pi / W                                                 # a pixel's footprint per unit distance
    S0, S1 = 0.22, 95.0
    edges = S0 * (S1 / S0) ** (np.arange(steps + 1) / steps)
    out = np.zeros((H, W, 3), np.float32)
    for r0 in range(0, H, 128):
        bb = b[r0:r0 + 128]
        cb, sb = np.cos(bb)[:, None], np.sin(bb)[:, None]
        dx, dy, dz = cb * np.cos(l)[None, :], cb * np.sin(l)[None, :], sb * np.ones((1, W), np.float32)
        col = np.zeros(dx.shape + (3,), np.float32)
        T = np.ones(dx.shape + (3,), np.float32)
        for k in range(steps):
            s = float(np.sqrt(edges[k] * edges[k + 1])); ds = float(edges[k + 1] - edges[k])
            Z = gm.ZSUN + s * dz
            if float(np.abs(Z).min()) > 9.0:
                break                                                    # every ray of this chunk has left the galaxy
            X, Y = -gm.RSUN + s * dx, s * dy
            lv = int(np.clip(np.round(np.log2(max(s * foot / (2 * gm.L_MAP / N), 1.0))), 0, 3))
            Nl = N >> lv
            mx = ((X + gm.L_MAP) / (2 * gm.L_MAP) * Nl - 0.5).astype(np.float32)
            my = ((Y + gm.L_MAP) / (2 * gm.L_MAP) * Nl - 0.5).astype(np.float32)
            v = cv2.remap(maps[lv], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            wz = cv2.remap(warp, ((X + gm.L_MAP) / (2 * gm.L_MAP) * N - 0.5).astype(np.float32), ((Y + gm.L_MAP) / (2 * gm.L_MAP) * N - 0.5).astype(np.float32),
                           cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            R = np.hypot(X, Y)
            ho = gm.h_old(R)
            e_old = v[:, :, 0] * np.exp(-R / gm.HR_OLD) / (2 * ho) * sech2(Z / ho)
            ey = np.exp(-R / gm.HR_YOUNG)
            e_young = v[:, :, 1] * ey / (2 * gm.H_YOUNG) * sech2(Z / gm.H_YOUNG)
            e_hii = v[:, :, 2] * ey / (1.6 * gm.H_YOUNG) * sech2(Z / (0.8 * gm.H_YOUNG))
            e_bulge = gm.bulge_bar(X, Y, Z).astype(np.float32)
            # render-time dust detail, band-limited to this distance's pixel footprint
            # (never finer than the slices are spaced in z: horizontal detail finer than the vertical turns clouds into streaks)
            l1 = int(np.clip(np.round(np.log2(max(s * foot / (P1 / 1024) * 1.5, 1.0))), 5, 8))
            l2 = int(np.clip(np.round(np.log2(max(s * foot / (P2 / 1024) * 1.5, 1.0))), 5, 8))
            d1 = slices(n1[l1], (np.mod(X / P1, 1.0) * 1024).astype(np.float32), (np.mod(Y / P1, 1.0) * 1024).astype(np.float32), Z / 0.12 + 0.5)
            d2 = slices(n2[l2], (np.mod(X / P2 + 0.37, 1.0) * 1024).astype(np.float32), (np.mod(Y / P2 + 0.61, 1.0) * 1024).astype(np.float32), Z / 0.045 + 0.5)
            det = np.exp(1.05 * d1 + 1.25 * d2) / 1.5       # (the band-limited tiles have lost variance: restore the clouds' contrast)
            # THE SUN'S OWN NEIGHBOURHOOD. The model threads a major arm through the Sun (so the resolved-star layer and
            # the baked light share one arm equation), but the real Sun sits in a quiet inter-arm spur inside the
            # nearly dust-free Local Bubble: seen from here, nearby dust and nearby young light are a fraction of the
            # arm's. Without this the local lane hangs over the whole sky and hides the bulge.
            near = float(gm.smoothstep(2.0, 9.0, s))
            hd = gm.H_DUST * np.clip(0.55 + 0.45 * np.exp(0.7 * d1), 0.45, 1.9)           # cloud tops are ragged, not a flat sheet
            kap = v[:, :, 3] / (2 * gm.H_DUST) * sech2((Z - 0.13 * wz - 0.10 * d1) / hd) * det
            kap *= float(gm.smoothstep(0.25, 0.75, s)) * (0.16 + 0.84 * near)
            e_young = e_young * (0.30 + 0.70 * near) * 0.36          # seen from inside, arm light is unresolved stars: fainter than face-on
            e_hii = e_hii * near
            # stars closer than ~1 kly are the resolved night sky (the real catalogue draws them): they absorb, not glow
            w_e = float(gm.smoothstep(0.5, 1.6, s))
            E = (e_old[..., None] * C_OLD + e_bulge[..., None] * C_BULGE + e_young[..., None] * C_YOUNG + e_hii[..., None] * C_HII)
            tau = kap[..., None] * (ds * EXT)
            # emission inside the step is attenuated by half the step's own dust
            col += T * np.exp(-0.5 * tau) * E * (w_e * ds)
            T *= np.exp(-tau)
        out[r0:r0 + 128] = col
    # the Large Magellanic Cloud (l = 280.5°, b = -32.9°): a real, naked-eye part of the southern band's sky
    ll, bb2 = np.meshgrid(l, b)
    dl = np.angle(np.exp(1j * (ll - np.radians(280.5 - 360)))) * np.cos(bb2)
    db = bb2 - np.radians(-32.9)
    a = np.radians(35)
    p, q = dl * np.cos(a) + db * np.sin(a), -dl * np.sin(a) + db * np.cos(a)
    lmc = np.exp(-0.5 * ((p / 0.050) ** 2 + (q / 0.030) ** 2)) + 1.6 * np.exp(-0.5 * ((p / 0.022) ** 2 + (q / 0.008) ** 2))
    out += (lmc * 0.05)[..., None] * np.array([0.86, 0.90, 1.0], np.float32)
    return out


def bake_disc(cfg, N, seed, out, sz):
    m = gm.surface_maps(N, seed, cfg)
    A = np.dstack([enc(m["old"], gm.OLD_MAX), enc(m["young"], gm.YOUNG_MAX), enc(m["hii"], gm.HII_MAX)])
    # B: dust optical depth + the (smooth) mid-plane warp; fine grain is cheaper made in the shader than shipped
    Bm = np.dstack([enc(m["tau"], gm.TAU_MAX), (np.clip(0.5 + 0.25 * m["warp"], 0, 1) * 255).astype(np.uint8),
                    np.full(m["tau"].shape, 128, np.uint8)])
    nm = cfg["name"]
    sz[nm + "-a"] = save_webp(os.path.join(out, nm + "-disc-a.webp"), A, 88)
    sz[nm + "-b"] = save_webp(os.path.join(out, nm + "-disc-b.webp"), Bm, 88)
    meta = {k: (list(v) if isinstance(v, tuple) else v) for k, v in cfg.items() if k not in ("ring_arms", "rings", "hii_ring")}
    meta.update(a0=gm._a0(cfg), texels=N, oldMax=gm.OLD_MAX, youngMax=gm.YOUNG_MAX, hiiMax=gm.HII_MAX, tauMax=gm.TAU_MAX, panoB=MILKY_B)
    json.dump(meta, open(os.path.join(out, nm + "-galaxy.json"), "w"), indent=1)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pano-w", type=int, default=4096)
    ap.add_argument("--disc", type=int, default=2048)
    ap.add_argument("--out", default="data")
    ap.add_argument("--preview", default="")
    ap.add_argument("--no-pano", action="store_true")
    a = ap.parse_args()
    t0 = time.time()
    os.makedirs(a.out, exist_ok=True)
    sz = {}
    m = bake_disc(gm.MW, a.disc, 7, a.out, sz)
    bake_disc(gm.M31, a.disc * 3 // 4, 31, a.out, sz)
    print("discs %.1fs" % (time.time() - t0))
    if not a.no_pano:
        W, H = a.pano_w, a.pano_w // 4
        pano = bake_pano(m, W, H)
        lum = pano.max(axis=2)
        # exposure. The model's range is honest (the bulge clouds are ~10× the band's body); a shoulder on luminance
        # (hue kept) brings the body of the band up to about a quarter of the brightest bulge cloud — how the band
        # reads to the eye — while the bulge keeps its texture instead of clipping.
        ref = float(np.percentile(lum, 99.9))
        x = pano / ref
        lx = np.maximum(x.max(axis=2, keepdims=True), 1e-6)
        c = 0.8 * ref / float(np.percentile(lum, 99.0))
        x = x * ((1.0 + c) / (1.0 + c * lx))
        fade = 1.0 - gm.smoothstep(0.72 * MILKY_B, MILKY_B, np.abs(((np.arange(H) + 0.5) / H - 0.5) * 2 * MILKY_B))
        x *= fade[:, None, None]
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            pv = np.clip(x, 0, 1) ** (1 / 2.2)
            Image.fromarray((pv[::-1] * 255).astype(np.uint8)).resize((1536, 384), Image.LANCZOS).save(os.path.join(a.preview, "mw-pano-preview.png"))
        sz["pano"] = save_webp(os.path.join(a.out, "mw-pano.webp"), enc(x, 1.0), 86)
        print("pano %dx%d p99 %.3f p99.9 %.3f" % (W, H, float(np.percentile(lum, 99)), ref))
    print("written", {k: "%d KB" % (v // 1024) for k, v in sz.items()}, "%.1fs" % (time.time() - t0))


if __name__ == "__main__":
    main()
