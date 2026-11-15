"""cf4_io.py — read the Cosmicflows-4 grids (plain FITS primary HDUs) with numpy only.

The files are downloaded data: run the scripts that read them with `python3 -I` from a directory that is not theirs
(this module adds the user's own site-packages back, which -I leaves out).
Source: https://projets.ip2i.in2p3.fr/cosmicflows/ — Courtois et al. 2023 (A&A 670, L15: density and velocity fields)
and Dupuy & Courtois 2023 (A&A: watershed basins). Cite both if you use them.
"""
import site
import sys

for _p in (site.getusersitepackages(),):
    if _p not in sys.path:
        sys.path.append(_p)
import numpy as np  # noqa: E402


def read_fits(path, member=None):
    """return (header dict, ndarray) of the primary HDU. `member` reads a file inside a zip without extracting it."""
    if member:
        import zipfile
        with zipfile.ZipFile(path) as z:
            raw = z.read(member)
    else:
        raw = open(path, "rb").read()
    hdr, off = {}, 0
    while True:
        block = raw[off:off + 2880]; off += 2880
        done = False
        for i in range(0, 2880, 80):
            card = block[i:i + 80].decode("ascii", "replace")
            key = card[:8].strip()
            if key == "END":
                done = True; break
            if card[8:10] == "= ":
                val = card[10:].split("/")[0].strip().strip("'").strip()
                hdr[key] = val
        if done:
            break
    bitpix = int(hdr["BITPIX"]); naxis = int(hdr["NAXIS"])
    shape = tuple(int(hdr["NAXIS%d" % (n + 1)]) for n in range(naxis))[::-1]      # FITS is Fortran-ordered
    dt = {8: ">u1", 16: ">i2", 32: ">i4", 64: ">i8", -32: ">f4", -64: ">f8"}[bitpix]
    n = int(np.prod(shape))
    a = np.frombuffer(raw, dtype=dt, count=n, offset=off).reshape(shape)
    a = a * float(hdr.get("BSCALE", 1)) + float(hdr.get("BZERO", 0)) if ("BSCALE" in hdr or "BZERO" in hdr) else a
    return hdr, np.ascontiguousarray(a.astype(a.dtype.newbyteorder("=")))
