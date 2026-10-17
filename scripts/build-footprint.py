#!/usr/bin/env python3
"""Build the footprint data from the phone's GPS export (the 一生足迹 CSV: dataTime, locType, longitude, latitude, …).

Writes, in CSV order (the order every consumer has always drawn in):
  data/footprint-points.f32        interleaved float32 (lat, lon) — the fallback for browsers without DecompressionStream
  data/footprint-points.v1.bin.gz  the same points at 1e-5° (≈1.1 m, finer than the GPS's ~5 m median accuracy):
                                   b"FPv1", uint32 n (LE), then planar zigzag-varint deltas — n for lat, n for lon —
                                   gzip'd. ~3.6x smaller than the float32 file; decoded by footprint-data.js.
Run: python3 scripts/build-footprint.py <export.csv>
"""
import gzip, struct, sys
import numpy as np

src = sys.argv[1]
a = np.genfromtxt(src, delimiter=",", skip_header=1, usecols=(2, 3), dtype=np.float64)
lon, lat = a[:, 0], a[:, 1]
ok = np.isfinite(lat) & np.isfinite(lon) & (np.abs(lat) <= 90) & (np.abs(lon) <= 180) & ~((lat == 0) & (lon == 0))
pts = np.stack([lat[ok], lon[ok]], 1)
n = len(pts)
pts.astype("<f4").tofile("data/footprint-points.f32")

q = np.round(pts * 1e5).astype(np.int64)
dq = np.diff(q, axis=0, prepend=np.zeros((1, 2), np.int64))
zz = (dq << 1) ^ (dq >> 63)
out = bytearray(b"FPv1" + struct.pack("<I", n))
for col in (0, 1):
    for v in zz[:, col].tolist():
        while v >= 0x80:
            out.append((v & 0x7F) | 0x80)
            v >>= 7
        out.append(v)
with open("data/footprint-points.v1.bin.gz", "wb") as f:
    f.write(gzip.compress(bytes(out), 9, mtime=0))

# round-trip check: decode exactly as the browser does
raw = gzip.decompress(open("data/footprint-points.v1.bin.gz", "rb").read())
assert raw[:4] == b"FPv1" and struct.unpack("<I", raw[4:8])[0] == n
p, dec = 8, np.zeros((n, 2))
for col in (0, 1):
    acc = 0
    for i in range(n):
        v = s = 0
        while True:
            b = raw[p]; p += 1
            v |= (b & 0x7F) << s; s += 7
            if not b & 0x80:
                break
        acc += -(v + 1) // 2 if v & 1 else v // 2
        dec[i, col] = acc * 1e-5
err = np.abs(dec - pts).max()
assert err < 1e-5, err
print(f"{n} points · f32 {n * 8} B · v1.bin.gz {len(open('data/footprint-points.v1.bin.gz', 'rb').read())} B · max error {err:.2e}°")
