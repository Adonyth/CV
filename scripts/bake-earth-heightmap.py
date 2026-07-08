#!/usr/bin/env python3
"""bake-earth-heightmap.py — a REAL global elevation heightmap for the base-view terrain.

Source: NOAA NGDC ETOPO1 ice-surface global relief (PUBLIC DOMAIN, U.S. Government work),
fetched server-side-downsampled from the NOAA CoastWatch ERDDAP (stride 10 ≈ 1 arc-min → ~18.5 km).
This is the same authoritative dataset the site credits in its data-provenance note.

Output (loaded lazily by space.js only when the visitor descends to the base):
  data/earth-heightmap.i16   — Int16 little-endian elevation in METERS, row-major, lat -90→90, lon -180→180
  data/earth-heightmap.json  — dims + ranges + provenance

Re-bake:  python3 scripts/bake-earth-heightmap.py
"""
import urllib.request, io, json, pathlib
import numpy as np
from scipy.io import netcdf_file

ROOT = pathlib.Path(__file__).resolve().parent.parent
# stride 10 on the 10801x21601 grid → ~1081x2161 (~18.5 km/px): enough for regional landforms
# (mountain ranges, coastlines) as a base-view silhouette; near-field micro-relief is added procedurally.
URL = ("https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.nc?"
       "altitude%5B(-90):10:(90)%5D%5B(-180):10:(180)%5D")

print("fetching NOAA ETOPO1 (public domain) via ERDDAP, stride 10 …")
buf = urllib.request.urlopen(URL, timeout=180).read()
print("  downloaded", len(buf), "bytes")
nc = netcdf_file(io.BytesIO(buf), mmap=False)
alt = np.array(nc.variables["altitude"][:]).astype(np.int32)   # (nlat, nlon), meters
lat = np.array(nc.variables["latitude"][:], dtype=float)
lon = np.array(nc.variables["longitude"][:], dtype=float)
nlat, nlon = alt.shape

alt[alt == 32767] = 0                       # _FillValue → sea level (ETOPO1 is fully covered; this is defensive)
alt = np.clip(alt, -11000, 9000).astype("<i2")

# ensure lat is ascending -90→90 and lon ascending -180→180 (ERDDAP returns ascending; assert to be safe)
assert lat[0] < lat[-1] and lon[0] < lon[-1], "expected ascending lat/lon"

out = ROOT / "data" / "earth-heightmap.i16"
alt.tofile(out)
meta = {
    "nlat": int(nlat), "nlon": int(nlon),
    "lat0": round(float(lat[0]), 5), "lat1": round(float(lat[-1]), 5),
    "lon0": round(float(lon[0]), 5), "lon1": round(float(lon[-1]), 5),
    "emin": int(alt.min()), "emax": int(alt.max()),
    "units": "meters", "dtype": "int16-le", "order": "row-major lat(-90..90) x lon(-180..180)",
    "source": "NOAA NGDC ETOPO1 ice-surface global relief (public domain), via CoastWatch ERDDAP, stride 10 (~18.5 km)",
    "sourceUrl": "https://www.ngdc.noaa.gov/mgg/global/global.html",
}
json.dump(meta, open(ROOT / "data" / "earth-heightmap.json", "w"), indent=2)
print("wrote", out.name, alt.shape, alt.dtype, "min", int(alt.min()), "max", int(alt.max()),
      "| size", out.stat().st_size, "bytes")
# spot-check a few known points
def sample(latq, lonq):
    r = int(round((latq - lat[0]) / (lat[-1] - lat[0]) * (nlat - 1)))
    c = int(round((lonq - lon[0]) / (lon[-1] - lon[0]) * (nlon - 1)))
    return int(alt[r, c])
print("spot-checks (m): Everest~%d (exp≈8000+)  Tibet(30,90)=%d  NL-plains(52,5)=%d  midPacific(0,-150)=%d"
      % (sample(28.0, 86.9), sample(30, 90), sample(52, 5), sample(0, -150)))
