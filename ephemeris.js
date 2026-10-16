/* ephemeris.js — true positions for the true-scale universe (build 240+).
   Planets: JPL "Keplerian Elements for Approximate Positions of the Major Planets" (E. M. Standish, JPL/Caltech),
   Table 1 (valid 1800–2050 AD): elements at J2000 + rates per Julian century, heliocentric, J2000 ecliptic & equinox.
   Pluto: the same table's mean elements (fine for 1800–2050 at this site's needs).
   Moon: Meeus, "Astronomical Algorithms" ch. 47, the principal periodic terms (≈0.01° in longitude, ≈100 km).
   Everything returns heliocentric ECLIPTIC (J2000) cartesian in astronomical units unless stated:
     x toward the vernal equinox, y 90° along the ecliptic, z toward the north ecliptic pole. */

export var AU_KM = 149597870.7;
export var KM_PER_PC = 3.0856775814913673e13;

// [a (AU), e, I (deg), L (deg), varpi (deg), Omega (deg)] and their rates per Julian century
var EL = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  pluto:   [[39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684], [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]]
};

var D2R = Math.PI / 180;
function norm360(x) { x %= 360; return x < 0 ? x + 360 : x; }
export function julianCenturies(date) { return (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525; }

/* heliocentric ecliptic J2000 position of a planet, AU */
export function planetHelio(name, date) {
  var e0 = EL[name][0], r = EL[name][1], T = julianCenturies(date);
  var a = e0[0] + r[0] * T, e = e0[1] + r[1] * T, I = (e0[2] + r[2] * T) * D2R;
  var L = e0[3] + r[3] * T, varpi = e0[4] + r[4] * T, Om = (e0[5] + r[5] * T) * D2R;
  var w = varpi * D2R - Om, M = norm360(L - varpi);
  if (M > 180) M -= 360;
  M *= D2R;
  var E = M + e * Math.sin(M);
  for (var k = 0; k < 30; k++) { var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-12) break; }
  var xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  var cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp
  };
}

/* geocentric ecliptic position of the Moon (of date — the ~0.3° precession since J2000 is removed below), km */
export function moonGeo(date) {
  var T = julianCenturies(date);
  var Lp = norm360(218.3164477 + 481267.88123421 * T);
  var D = norm360(297.8501921 + 445267.1114034 * T) * D2R;
  var M = norm360(357.5291092 + 35999.0502909 * T) * D2R;
  var Mp = norm360(134.9633964 + 477198.8675055 * T) * D2R;
  var F = norm360(93.2720950 + 483202.0175233 * T) * D2R;
  var E = 1 - 0.002516 * T;
  // principal longitude (1e-6 deg) and distance (1e-3 km) terms, Meeus table 47.A (largest 24)
  var LR = [
    [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
    [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149], [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
    [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
    [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210], [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
    [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831]
  ];
  var B = [   // latitude terms (1e-6 deg), table 47.B (largest 12)
    [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
    [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324]
  ];
  var sl = 0, sr = 0, sb = 0;
  for (var i = 0; i < LR.length; i++) {
    var t = LR[i], arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F, ef = Math.abs(t[1]) === 1 ? E : (Math.abs(t[1]) === 2 ? E * E : 1);
    sl += t[4] * ef * Math.sin(arg); sr += t[5] * ef * Math.cos(arg);
  }
  for (var j = 0; j < B.length; j++) {
    var b = B[j], argb = b[0] * D + b[1] * M + b[2] * Mp + b[3] * F, efb = Math.abs(b[1]) === 1 ? E : 1;
    sb += b[4] * efb * Math.sin(argb);
  }
  var lon = (Lp + sl / 1e6 - 1.3972 * T) * D2R;   // −1.3972°/century: back from equinox of date to J2000
  var lat = (sb / 1e6) * D2R, dist = 385000.56 + sr / 1000;
  return { x: dist * Math.cos(lat) * Math.cos(lon), y: dist * Math.cos(lat) * Math.sin(lon), z: dist * Math.sin(lat) };
}

/* apparent geocentric ecliptic longitude (deg) of a body — used to check the ephemeris against the natal chart */
export function geoLongitude(name, date) {
  var e = planetHelio("earth", date);
  if (name === "sun") return norm360(Math.atan2(-e.y, -e.x) / D2R);
  if (name === "moon") { var m = moonGeo(date); return norm360(Math.atan2(m.y, m.x) / D2R); }
  var p = planetHelio(name, date);
  return norm360(Math.atan2(p.y - e.y, p.x - e.x) / D2R);
}

/* physical data (km): equatorial radius, and for ringed planets the ring span */
export var BODY = {
  sun: { r: 695700 }, mercury: { r: 2439.7 }, venus: { r: 6051.8 }, earth: { r: 6378.137 }, moon: { r: 1737.4 },
  mars: { r: 3396.2 }, jupiter: { r: 71492 }, saturn: { r: 60268, ringIn: 74658, ringOut: 136775 },
  uranus: { r: 25559 }, neptune: { r: 24764 }, pluto: { r: 1188.3 }, charon: { r: 606 }
};
