#!/usr/bin/env python3
"""Build the site's galaxy field (build 246) from real catalogues.

Inputs (VizieR asu-tsv downloads, in DL dir):
  2mpp_full.tsv   2M++ catalogue (Lavaux & Hudson 2011, J/MNRAS/416/2840/catalog)
  2mpp_groups.tsv 2M++ groups (…/group)
  2mrs.tsv        2MRS (Huchra+ 2012, J/ApJS/199/26/table3): morphological type, b/a, Rext
  xsc.tsv         2MASS XSC (VII/233) K20<12.8: r_ext, super-coadd b/a and PA
  ungc.tsv        Updated Nearby Galaxy Catalog (Karachentsev+ 2013, J/AJ/145/101): distances
  evcc.tsv        Extended Virgo Cluster Catalog (Kim+ 2014, J/ApJS/215/22/table2): Virgo members, morphology
  OLD dir         the build-245 field — `git show 5f39be3:data/galaxies_xyz.i16`, `…:data/galaxies_rgb.u8` — whose
                  density palette is transferred, plus data/large-scale.json (the curated cluster seats)
Run: python3 -P scripts/build-galaxies.py <download dir> <old dir> <out dir>   (numpy + scipy)

Outputs (OUT dir):
  galaxies2_xyz.i16 / _lite   int16 supergalactic Cartesian, Mpc x 64
  galaxies2_attr.u8 / _lite   8 bytes per galaxy:
      0 density luminance L (0..255, old palette quantile-matched per distance shell)
      1 T-type + 10 (0..30), 255 = not typed
      2 diameter, log-coded: kly = 10**(b/255*3.3 - 0.3)
      3,4,5 disc normal (SG frame), signed: (b-128)/127
      6 absolute K magnitude: M_K = b/255*18 - 27
      7 flags: 1 measured PA, 2 measured b/a or inclination, 4 measured size, 8 distance from UNGC (redshift-independent),
               16 fingers-of-God collapsed (group member)
"""
import sys, math, json
import numpy as np
from scipy.spatial import cKDTree

DL, OLD, OUT = sys.argv[1:4]
H0 = 70.0
XYZ_SCALE = 64.0
rng = np.random.default_rng(246)


def read_tsv(path, first_table_only=True):
    hdr, rows, skip = None, [], 0
    with open(path) as f:
        for line in f:
            if line.startswith('#'):
                if hdr is not None and first_table_only and line.startswith('#Table'):
                    break
                continue
            if not line.strip():
                if hdr is not None and rows and first_table_only:
                    break
                continue
            parts = line.rstrip('\n').split('\t')
            if hdr is None:
                hdr = [p.strip() for p in parts]; skip = 2; continue
            if skip:
                skip -= 1; continue
            rows.append([p.strip() for p in parts])
    return hdr, rows


def fnum(s, default=np.nan):
    try:
        return float(s)
    except ValueError:
        return default


# ---------- frames ----------
T_EQ2GAL = np.array([[-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
                     [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
                     [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669]])


def unit_lb(l, b):
    l, b = np.radians(l), np.radians(b)
    return np.array([np.cos(b) * np.cos(l), np.cos(b) * np.sin(l), np.sin(b)])


SGZ = unit_lb(47.37, 6.32)
SGX = unit_lb(137.37, 0.0)
SGY = np.cross(SGZ, SGX)
G2SG = np.stack([SGX, SGY, SGZ])
EQ2SG = G2SG @ T_EQ2GAL


def eq_unit(ra, dec):
    ra, dec = np.radians(ra), np.radians(dec)
    return np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)], -1)


def sg_lb(v):
    v = v / np.linalg.norm(v)
    return math.degrees(math.atan2(v[1], v[0])) % 360, math.degrees(math.asin(v[2]))


m87 = EQ2SG @ eq_unit(187.70593, 12.39112)
print('check M87 SGL/SGB', [round(x, 2) for x in sg_lb(m87)], '(lit 102.88 / -2.35)')

# ---------- 2M++ ----------
h, R = read_tsv(f'{DL}/2mpp_full.tsv')
ix = {k: i for i, k in enumerate(h)}
gal = []
n_zoa = n_cln = 0
for r in R:
    if r[ix['Ref']].lower().startswith('zoa'):
        n_zoa += 1; continue
    if r[ix['Cln']] == '1':
        n_cln += 1; continue
    hv = fnum(r[ix['HV']])
    if not np.isfinite(hv) or hv > 33000:      # the survey's reliable depth (the old field's limit too)
        continue
    gid = r[ix['GID']]
    gal.append(dict(name=r[ix['Name']], ra=fnum(r[ix['_RA']]), dec=fnum(r[ix['_DE']]), K=fnum(r[ix['Ksmag']]),
                    v=hv, gid=int(gid) if gid else -1, src='2mpp'))
print(f'2M++: {len(R)} rows, {n_zoa} ZoA fakes and {n_cln} cloned redshifts dropped, {len(gal)} kept')
have = {g['name'] for g in gal}

# ---------- 2MRS ----------
h, R = read_tsv(f'{DL}/2mrs.tsv')
ix = {k: i for i, k in enumerate(h)}
mrs = {}
n_add = 0
for r in R:
    nm = r[ix['ID']]
    t = r[ix['type']]
    tt = None
    if len(t) >= 2:
        try:
            tt = int(t[:2])
        except ValueError:
            tt = None
    mrs[nm] = dict(rext=fnum(r[ix['Rext']]), ba=fnum(r[ix['b/a']]), T=tt)
    cz = fnum(r[ix['cz']])
    if nm not in have and np.isfinite(cz) and 100 < cz < 33000:
        gal.append(dict(name=nm, ra=fnum(r[ix['RAJ2000']]), dec=fnum(r[ix['DEJ2000']]), K=fnum(r[ix['Ktmag']]),
                        v=cz, gid=-1, src='2mrs'))
        n_add += 1
print(f'2MRS: {len(mrs)} rows; {n_add} galaxies not in 2M++ added')

# ---------- XSC ----------
h, R = read_tsv(f'{DL}/xsc.tsv')
ix = {k: i for i, k in enumerate(h)}
xsc = {}
for r in R:
    xsc[r[ix['2MASX']]] = dict(rext=fnum(r[ix['r.ext']]), ba=fnum(r[ix['Sb/a']]), pa=fnum(r[ix['Spa']]))
print(f'XSC: {len(xsc)} rows')

# ---------- groups ----------
h, R = read_tsv(f'{DL}/2mpp_groups.tsv')
ix = {k: i for i, k in enumerate(h)}
groups = {}
for r in R:
    groups[int(r[ix['GID']])] = dict(l=fnum(r[ix['GLON']]), b=fnum(r[ix['GLAT']]), v=fnum(r[ix['HV']]),
                                     sig=fnum(r[ix['sigma']]), rich=fnum(r[ix['Rich']]))
print(f'groups: {len(groups)}')

# ---------- UNGC ----------
h, R = read_tsv(f'{DL}/ungc.tsv')
ix = {k: i for i, k in enumerate(h)}
ungc = []
for r in R:
    if len(r) < len(h):
        continue
    ra_s, de_s = r[ix['RAJ2000']].split(), r[ix['DEJ2000']].split()
    if len(ra_s) != 3 or len(de_s) != 3:
        continue
    ra = 15 * (float(ra_s[0]) + float(ra_s[1]) / 60 + float(ra_s[2]) / 3600)
    sgn = -1 if de_s[0].startswith('-') else 1
    dec = sgn * (abs(float(de_s[0])) + float(de_s[1]) / 60 + float(de_s[2]) / 3600)
    dist = fnum(r[ix['Dist']])
    if not np.isfinite(dist):
        continue
    tt = r[ix['TT']]
    ungc.append(dict(name=r[ix['Name']], ra=ra, dec=dec, D=dist, A26=fnum(r[ix['A26']]), ba=fnum(r[ix['b/a']]),
                     inc=fnum(r[ix['i']]), T=int(tt) if tt.lstrip('-').isdigit() else None,
                     KLum=fnum(r[ix['KLum']]), K=fnum(r[ix['Kmag']]), meth=r[ix['f_Dist']]))
print(f'UNGC: {len(ungc)} galaxies with distances')

# ---------- positions ----------
N = len(gal)
U = EQ2SG @ np.array([eq_unit(g['ra'], g['dec']) for g in gal]).T
U = U.T                                         # N x 3 unit vectors, SG frame
V = np.array([g['v'] for g in gal])
Dist = V / H0
flags = np.zeros(N, np.uint8)

# fingers-of-God: each 2M++ group's radial spread is compressed to its own transverse spread
# the two nearby clusters with surface-brightness-fluctuation distances sit at those, not at their mean redshift
lss_cur = json.load(open(f'{OLD}/large-scale.json'))
LIT_D = {'virgo': 16.5, 'fornax': 20.0}   # Mei+ 2007 (ACSVCS SBF); Blakeslee+ 2009 (ACSFCS SBF)
LIT = {}
for c in lss_cur['clusters']:
    if c['id'] not in LIT_D:
        continue
    cu = np.array(c['sg']) / np.linalg.norm(c['sg'])
    best, br = None, -1
    for gid, G in groups.items():
        if not np.isfinite(G['l']):
            continue
        ang = math.degrees(math.acos(min(1, float((G2SG @ unit_lb(G['l'], G['b'])) @ cu))))
        if ang < 4 and G['rich'] > br:
            best, br = gid, G['rich']
    LIT[best] = LIT_D[c['id']]
    print(f"literature distance: {c['id']} = 2M++ group {best} (richness {br:.0f}, redshift distance {groups[best]['v'] / H0:.1f} Mpc) -> {LIT_D[c['id']]} Mpc")
VIRGO_GID = [g for g, d in LIT.items() if d == 16.5][0]
virgo_fit = {}

members = {}
for i, g in enumerate(gal):
    if g['gid'] >= 0 and g['gid'] in groups:
        members.setdefault(g['gid'], []).append(i)
n_fog = 0
fog_report = []
for gid, idx in members.items():
    G = groups[gid]
    if len(idx) < 2 or not np.isfinite(G['v']):
        continue
    c = G2SG @ unit_lb(G['l'], G['b'])
    Dg = LIT.get(gid, G['v'] / H0)
    idx = np.array(idx)
    th = np.arccos(np.clip(U[idx] @ c, -1, 1))
    sperp = math.sqrt(np.sum((Dg * th) ** 2) / (2 * len(idx)))
    sperp = max(sperp, 0.05)
    sv = G['sig'] if np.isfinite(G['sig']) and G['sig'] > 30 else max(30.0, float(np.std(V[idx])))
    dz = np.clip((V[idx] - G['v']) / sv, -2.5, 2.5) * sperp
    if gid == VIRGO_GID:
        virgo_fit = dict(c=c, D=Dg, v=G['v'], sv=sv, sperp=sperp)
    before = np.std(Dist[idx])
    Dist[idx] = Dg + dz
    flags[idx] |= 16
    n_fog += len(idx)
    if G['rich'] >= 40:
        fog_report.append((int(G['rich']), gid, round(Dg, 1), round(before, 2), round(float(np.std(Dist[idx])), 2), round(sperp, 2)))
print(f'FoG: {n_fog} galaxies in {len(members)} groups collapsed')
for row in sorted(fog_report, reverse=True)[:8]:
    print('  rich %3d gid %4d  D %6.1f  radial sd %5.2f -> %5.2f Mpc (transverse %4.2f)' % row)

# the Local Volume: redshift-independent distances (TRGB / Cepheid / SBF / TF) from the UNGC
uu = EQ2SG @ np.array([eq_unit(g['ra'], g['dec']) for g in ungc]).T
uu = uu.T
tree = cKDTree(U)
tol = 2 * math.sin(math.radians(1.5 / 60) / 2)
ungc_matched = np.zeros(len(ungc), bool)
gal_ungc = -np.ones(N, int)
for j, g in enumerate(ungc):
    d, i = tree.query(uu[j])
    if d < tol:
        ungc_matched[j] = True
        gal_ungc[i] = j
print(f'UNGC matched to the survey: {ungc_matched.sum()} / {len(ungc)}')
for i in np.where(gal_ungc >= 0)[0]:
    Dist[i] = ungc[gal_ungc[i]]['D']
    flags[i] |= 8
LG_CUT = 1.3   # the Local Group itself is modelled separately (Milky Way + Andromeda tiers)
keep = np.ones(N, bool)
keep &= Dist >= LG_CUT
# inside the UNGC's domain a redshift is not a distance: a survey galaxy the UNGC does not list there is a misplaced one
lowz = (gal_ungc < 0) & (Dist < 9.0)
print(f'dropped: {np.sum(Dist < LG_CUT)} inside the Local Group, {np.sum(lowz & keep)} low-redshift galaxies without a UNGC distance')
keep &= ~lowz

extra = [j for j in range(len(ungc)) if not ungc_matched[j] and LG_CUT <= ungc[j]['D'] <= 11.0]

# the Extended Virgo Cluster Catalog: every certain / possible member, at the cluster's distance with the same
# fingers-of-God compression as its 2M++ group (survey galaxies it lists are moved there too)
h, R = read_tsv(f'{DL}/evcc.tsv')
ix = {k: i for i, k in enumerate(h)}
evcc = []
for r in R:
    if r[ix['MmI']] not in ('M', 'P'):
        continue
    v = fnum(r[ix['cz']])
    if not np.isfinite(v):
        v = fnum(r[ix['cz2']])
    if not np.isfinite(v):
        continue
    tt1 = r[ix['TT1']]
    evcc.append(dict(ra=fnum(r[ix['RAJ2000']]), dec=fnum(r[ix['DEJ2000']]), v=v, code=int(tt1) if tt1.isdigit() else None,
                     rmag=fnum(r[ix['rmag']]), rad=fnum(r[ix['Rad']])))
ue = (EQ2SG @ np.array([eq_unit(g['ra'], g['dec']) for g in evcc]).T).T
vf = virgo_fit
def virgo_D(v):
    return vf['D'] + float(np.clip((v - vf['v']) / vf['sv'], -2.5, 2.5)) * vf['sperp']
tol_e = 2 * math.sin(math.radians(12 / 3600) / 2)
evcc_extra, n_moved = [], 0
for j, g in enumerate(evcc):
    d, i = tree.query(ue[j])
    if d < tol_e:
        if not (flags[i] & 16 and Dist[i] > 0 and abs(Dist[i] - vf['D']) < 4) and gal_ungc[i] < 0:
            Dist[i] = virgo_D(gal[i]['v']); flags[i] |= 16; n_moved += 1
        keep[i] = True
        gal[i]['evcc'] = g
    else:
        evcc_extra.append(j)
print(f'EVCC: {len(evcc)} members; {len(evcc) - len(evcc_extra)} already in the survey ({n_moved} moved to the cluster), {len(evcc_extra)} added')

def evcc_T(code):
    if code is None:
        return None
    if code == 100:
        return -5
    if 200 <= code < 300:
        return {0: -2, 1: 1, 2: 3, 3: 5, 4: 7, 5: 9, 6: 4, 7: 4}.get(code % 10, 4)
    if 300 <= code < 400:
        return 10
    if 400 <= code < 500:
        return -2 if (code // 10) % 10 == 1 else -5
    return None
print(f'UNGC-only galaxies added (dwarfs mostly): {len(extra)}')

# ---------- attributes ----------
def sky_axes(ra, dec):
    ra, dec = math.radians(ra), math.radians(dec)
    u = np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])
    n = np.array([-math.sin(dec) * math.cos(ra), -math.sin(dec) * math.sin(ra), math.cos(dec)])
    e = np.array([-math.sin(ra), math.cos(ra), 0.0])
    return u, n, e


def q0_of(T):
    if T is None:
        return 0.15
    if T <= -4:
        return 0.30
    if T <= -1:
        return 0.20
    if T <= 9 or T == 20:
        return 0.13
    return 0.35


def disc_normal(ra, dec, ba, pa, T, inc=None):
    """the disc normal in the SG frame from the observed axis ratio (or inclination) and sky position angle"""
    u, n, e = sky_axes(ra, dec)
    have_pa = pa is not None and np.isfinite(pa)
    if not have_pa:
        pa = rng.uniform(0, 180)
    p = math.radians(pa)
    s_hat = -math.sin(p) * n + math.cos(p) * e          # the minor axis on the sky
    if inc is not None and np.isfinite(inc):
        ci = math.cos(math.radians(inc))
    elif ba is not None and np.isfinite(ba):
        q0 = q0_of(T)
        ci = math.sqrt(max(0.0, (ba * ba - q0 * q0) / (1 - q0 * q0)))
    else:
        v = rng.normal(size=3); v /= np.linalg.norm(v)
        return EQ2SG @ v, False, False
    si = math.sqrt(max(0.0, 1 - ci * ci)) * (1 if rng.random() < 0.5 else -1)
    nrm = ci * (-u) + si * s_hat
    return EQ2SG @ nrm, have_pa, True


sel = np.where(keep)[0]
NOUT = len(sel) + len(extra) + len(evcc_extra)
pos = np.zeros((NOUT, 3))
attr = np.zeros((NOUT, 8), np.uint8)
Tcode = np.full(NOUT, 255, np.uint8)
diam_kly = np.full(NOUT, np.nan)
MK = np.full(NOUT, np.nan)
nrm = np.zeros((NOUT, 3))
fl = np.zeros(NOUT, np.uint8)
ratio_samples = []

for k, i in enumerate(sel):
    g = gal[i]
    D = Dist[i]
    pos[k] = U[i] * D
    fl[k] = flags[i]
    x = xsc.get(g['name'])
    m = mrs.get(g['name'])
    ug = ungc[gal_ungc[i]] if gal_ungc[i] >= 0 else None
    T = None
    ev = g.get('evcc')
    if ug and ug['T'] is not None:
        T = ug['T']
    elif ev and evcc_T(ev['code']) is not None:
        T = evcc_T(ev['code'])
    elif m and m['T'] is not None and m['T'] not in (98, 19, -9, 12):
        T = m['T']
    if T is not None:
        Tcode[k] = int(np.clip(T + 10, 0, 30)) if T != 20 else 15   # 20 = unclassified spiral -> Sc
    rext = x['rext'] if x and np.isfinite(x['rext']) else (10 ** m['rext'] if m and np.isfinite(m['rext']) else np.nan)
    if ug and np.isfinite(ug['A26']) and np.isfinite(rext):
        ratio_samples.append(ug['A26'] / (2 * rext * 4.848e-3 * ug['D']))
    if ug and np.isfinite(ug['A26']):
        diam_kly[k] = ug['A26'] * 3.26156; fl[k] |= 4
    elif np.isfinite(rext):
        diam_kly[k] = -rext * D     # K-band; converted to an optical diameter below once the ratio is known
        fl[k] |= 4
    ba = x['ba'] if x and np.isfinite(x['ba']) else (m['ba'] if m else np.nan)
    pa = x['pa'] if x else None
    inc = ug['inc'] if ug else None
    nrm[k], hp, hb = disc_normal(g['ra'], g['dec'], ba, pa, T, inc)
    fl[k] |= (1 if hp else 0) | (2 if hb else 0)
    if ug and np.isfinite(ug['KLum']):
        MK[k] = 3.28 - 2.5 * ug['KLum']
    elif np.isfinite(g['K']):
        MK[k] = g['K'] - 25 - 5 * math.log10(max(D, 0.5))

for k2, j in enumerate(extra):
    k = len(sel) + k2
    ug = ungc[j]
    u = uu[j]
    pos[k] = u * ug['D']
    fl[k] = 8
    if ug['T'] is not None:
        Tcode[k] = int(np.clip(ug['T'] + 10, 0, 30))
    if np.isfinite(ug['A26']):
        diam_kly[k] = ug['A26'] * 3.26156; fl[k] |= 4
    nrm[k], hp, hb = disc_normal(ug['ra'], ug['dec'], ug['ba'], None, ug['T'], ug['inc'])
    fl[k] |= (2 if hb else 0)
    if np.isfinite(ug['KLum']):
        MK[k] = 3.28 - 2.5 * ug['KLum']

for k3, j in enumerate(evcc_extra):
    k = len(sel) + len(extra) + k3
    ev = evcc[j]
    D = virgo_D(ev['v'])
    pos[k] = ue[j] * D
    fl[k] = 16
    T = evcc_T(ev['code'])
    if T is not None:
        Tcode[k] = int(np.clip(T + 10, 0, 30))
    if np.isfinite(ev['rad']):
        diam_kly[k] = 2 * ev['rad'] * 4.848e-3 * D * 3.26156; fl[k] |= 4      # SDSS r-band Kron aperture
    inc = 86.0 if ev['code'] is not None and 200 <= ev['code'] < 300 and ev['code'] % 10 == 7 else None
    nrm[k], hp, hb = disc_normal(ev['ra'], ev['dec'], None, None, T, inc)
    fl[k] |= (2 if hb else 0)
    if np.isfinite(ev['rmag']):
        MK[k] = ev['rmag'] - 25 - 5 * math.log10(D) - (2.7 if (T is not None and T < 0) else 2.3)

ratio = float(np.median(ratio_samples)) if ratio_samples else 1.6
print(f'optical (A26) / K-band (2 r_ext) diameter ratio, median of {len(ratio_samples)}: {ratio:.2f}')
kb = diam_kly < 0
diam_kly[kb] = (-diam_kly[kb]) * 2 * 4.848e-3 * ratio * 3.26156
# no measured size: the size-luminosity relation of the measured ones (+ its scatter)
okd = np.isfinite(diam_kly) & np.isfinite(MK) & (diam_kly > 0)
A = np.vstack([np.ones(okd.sum()), MK[okd]]).T
coef, *_ = np.linalg.lstsq(A, np.log10(diam_kly[okd]), rcond=None)
resid = np.std(np.log10(diam_kly[okd]) - A @ coef)
print(f'size-luminosity: log10 D_kly = {coef[0]:.3f} + {coef[1]:.3f} M_K  (scatter {resid:.2f} dex)')
miss = ~np.isfinite(diam_kly) | (diam_kly <= 0)
mk_fill = np.where(np.isfinite(MK), MK, -22.0)
diam_kly[miss] = 10 ** (coef[0] + coef[1] * mk_fill[miss] + rng.normal(0, resid, miss.sum()))
MK[~np.isfinite(MK)] = -22.0
print(f'sizes: {np.sum(~miss)} measured, {miss.sum()} from the relation; diameter kly p5/p50/p95 =',
      np.round(np.percentile(diam_kly, [5, 50, 95]), 1))

# ---------- density luminance: the old palette, quantile-matched shell by shell ----------
old = np.fromfile(f'{OLD}/galaxies_xyz.i16', dtype='<i2').reshape(-1, 3) / 8.0
oldrgb = np.fromfile(f'{OLD}/galaxies_rgb.u8', dtype=np.uint8).reshape(-1, 3)
oldL = oldrgb.astype(float).sum(1) / 765
oldD = np.linalg.norm(old, axis=1)
t3 = cKDTree(pos)
dk, _ = t3.query(pos, k=9)
dens = 8 / (4 / 3 * math.pi * np.maximum(dk[:, -1], 0.05) ** 3)
newD = np.linalg.norm(pos, axis=1)
edges = [0, 6, 12, 20, 30, 45, 65, 90, 120, 160, 220, 300, 600]
Lb = np.zeros(NOUT)
for a, b in zip(edges[:-1], edges[1:]):
    ni = np.where((newD >= a) & (newD < b))[0]
    oi = np.where((oldD >= a) & (oldD < b))[0]
    if len(ni) == 0:
        continue
    if len(oi) < 20:
        oi = np.where((oldD >= a * 0.5) & (oldD < b * 1.5))[0]
    q = np.argsort(np.argsort(dens[ni])) / max(1, len(ni) - 1)
    Lb[ni] = np.quantile(oldL[oi], q)
attr[:, 0] = np.clip(np.round(Lb * 255), 0, 255)
attr[:, 1] = Tcode
attr[:, 2] = np.clip(np.round((np.log10(diam_kly) + 0.3) / 3.3 * 255), 0, 255)
attr[:, 3:6] = np.clip(np.round(nrm * 127 + 128), 1, 255)
attr[:, 6] = np.clip(np.round((MK + 27) / 18 * 255), 0, 255)
attr[:, 7] = fl

xyz = np.clip(np.round(pos * XYZ_SCALE), -32767, 32767).astype('<i2')
print(f'OUTPUT: {NOUT} galaxies; max distance {newD.max():.1f} Mpc; typed {np.sum(Tcode < 255)}; '
      f'measured PA {np.sum(fl & 1 > 0)}, b/a {np.sum(fl & 2 > 0)}, size {np.sum(fl & 4 > 0)}, UNGC distance {np.sum(fl & 8 > 0)}, FoG {np.sum(fl & 16 > 0)}')

xyz.tofile(f'{OUT}/galaxies2_xyz.i16')
attr.tofile(f'{OUT}/galaxies2_attr.u8')
# the phone set: every Local-Volume galaxy and every Virgo member, plus an even random thinning of the rest (the web's
# density contrast survives)
vc = np.array(next(c['sg'] for c in lss_cur['clusters'] if c['id'] == 'virgo'))
lv = np.where((newD < 11.5) | (np.linalg.norm(pos - vc, axis=1) < 4.0))[0]
rest = np.setdiff1d(np.arange(NOUT), lv)
NL = 24000
pick = np.sort(np.concatenate([lv, rng.choice(rest, NL - len(lv), replace=False)]))
xyz[pick].tofile(f'{OUT}/galaxies2_xyz_lite.i16')
attr[pick].tofile(f'{OUT}/galaxies2_attr_lite.u8')

# landmarks: where the survey's own groups put the named clusters vs the curated catalogue
lss = json.load(open(f'{OLD}/large-scale.json'))
for c in lss['clusters']:
    p = np.array(c['sg'])
    d = np.linalg.norm(pos - p, axis=1)
    near = d < max(2.0, 0.08 * np.linalg.norm(p))
    if near.sum():
        cen = pos[near].mean(0)
        print(f"  {c['id']:11s} curated {np.linalg.norm(p):6.1f} Mpc  survey galaxies within: {near.sum():4d}  their centroid {np.linalg.norm(cen):6.1f} Mpc, offset {np.linalg.norm(cen - p):5.2f}")
    else:
        print(f"  {c['id']:11s} curated {np.linalg.norm(p):6.1f} Mpc  survey galaxies within: 0")
for nm in ('NGC3031', 'NGC5128', 'NGC0253', 'NGC5236', 'NGC5457', 'IC0342', 'NGC4258', 'Maffei1', 'NGC0055', 'NGC0300'):
    hit = [g for g in ungc if g['name'].replace(' ', '') == nm]
    if hit:
        g = hit[0]; print(f'  UNGC {nm:8s} D={g["D"]:5.2f} ({g["meth"]})')
