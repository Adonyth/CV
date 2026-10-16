/* truescale.js — the bridge between the navigation ladder and the true-scale world (build 240+).

   Every gesture, glide, rail stop and tier threshold in space.js still runs in the LADDER space it was
   tuned in: the Earth view sits 8 units out, the whole-sky home at 128, the Milky Way at 3500 … (see
   cosmic-layers.js). What the visitor SEES of the Solar System is now true scale: real distances and real
   sizes. A ladder distance r from the Earth maps to a TRUE distance G(r) (scene units, 1 unit = kmPerUnit):
     · identity up to r = 8 — the ground, the city, the Earth close-up stay exactly as tuned;
     · then a smooth monotone climb (PCHIP in log–log, C1 at every anchor) through the Solar System
       stop (15 AU), the whole-sky home (60 AU), and every cosmic-address tier at its real distance.
   The zoom stays exponential (the right feel for a universe), but what it moves through is now real.
   Pure functions only — no THREE, no DOM — so node can test it. */

export var AU_KM = 149597870.7;
export var LY_KM = 9460730472580.8;

/* the anchors: [ladder distance, TRUE distance in km]. The far tiers come from the cosmic-address table:
   a camera at camLenPeak framing a structure of sceneRadius stands realScale × peak / sceneRadius away. */
export function ladderAnchors(kmPerUnit, layers, rates) {
  // rates (optional): a tier's own internal scale, scene units per light-year. When given, the tier's rail stop sits at
  // exactly the true distance from which its LINEAR model looks the way the ladder framed it (peak / rate) — so a camera
  // placed at true distance × rate stands at the very same spot at every stop.
  var a = [[8, 8 * kmPerUnit], [40, 15 * AU_KM], [128, 60 * AU_KM]];
  var last = 128, lastRate = 0;
  (layers || []).forEach(function (ly) {
    if (!ly || !(ly.camLenPeak > last)) return;
    if (ly.id === "earth" || ly.id === "solar") return;
    var r = rates && rates[ly.id];
    if (r > 0) { a.push([ly.camLenPeak, ly.camLenPeak / r * LY_KM]); lastRate = r; }
    else if (ly.realScaleLy > 0 && ly.sceneRadius > 0) a.push([ly.camLenPeak, ly.realScaleLy * LY_KM * ly.camLenPeak / ly.sceneRadius]);
    else return;
    last = ly.camLenPeak;
  });
  if (last < 118000) a.push([118000, lastRate > 0 ? 118000 / lastRate * LY_KM : 2.0e11 * LY_KM]);   // beyond the observable horizon
  return a;
}

/* monotone cubic Hermite (Fritsch–Carlson) through (x, y) with a fixed first slope */
function pchip(xs, ys, d0) {
  var n = xs.length, h = [], s = [], d = new Array(n);
  for (var i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; s[i] = (ys[i + 1] - ys[i]) / h[i]; }
  d[0] = d0;
  for (var k = 1; k < n - 1; k++) {
    if (s[k - 1] * s[k] <= 0) { d[k] = 0; continue; }
    var w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
    d[k] = (w1 + w2) / (w1 / s[k - 1] + w2 / s[k]);
  }
  d[n - 1] = s[n - 2];
  // keep each first segment monotone (α, β ≤ 3)
  for (var j = 0; j < n - 1; j++) {
    var al = d[j] / s[j], be = d[j + 1] / s[j], tau = al * al + be * be;
    if (tau > 9) { var t3 = 3 / Math.sqrt(tau); d[j] = t3 * al * s[j]; d[j + 1] = t3 * be * s[j]; }
  }
  function seg(x) { var lo = 0, hi = n - 2; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (xs[m] <= x) lo = m; else hi = m - 1; } return lo; }
  return {
    f: function (x) {
      if (x >= xs[n - 1]) return ys[n - 1] + d[n - 1] * (x - xs[n - 1]);
      var i2 = seg(x), t = (x - xs[i2]) / h[i2], t2 = t * t, t3b = t2 * t;
      return (2 * t3b - 3 * t2 + 1) * ys[i2] + (t3b - 2 * t2 + t) * h[i2] * d[i2] + (-2 * t3b + 3 * t2) * ys[i2 + 1] + (t3b - t2) * h[i2] * d[i2 + 1];
    },
    df: function (x) {
      if (x >= xs[n - 1]) return d[n - 1];
      var i2 = seg(x), t = (x - xs[i2]) / h[i2], t2 = t * t;
      return ((6 * t2 - 6 * t) * ys[i2] + (3 * t2 - 4 * t + 1) * h[i2] * d[i2] + (-6 * t2 + 6 * t) * ys[i2 + 1] + (3 * t2 - 2 * t) * h[i2] * d[i2 + 1]) / h[i2];
    }
  };
}

/* the ladder: G (ladder → true scene units), Ginv, and the local log–log slope dlnG/dlnr */
export function makeLadder(kmPerUnit, layers, rates) {
  var A = ladderAnchors(kmPerUnit, layers, rates);
  var R0 = A[0][0];
  var xs = A.map(function (p) { return Math.log(p[0]); }), ys = A.map(function (p) { return Math.log(p[1] / kmPerUnit); });
  var P = pchip(xs, ys, 1);   // slope 1 at r = 8 joins the identity smoothly
  function G(r) { return r <= R0 ? r : Math.exp(P.f(Math.log(r))); }
  function slope(r) { return r <= R0 ? 1 : P.df(Math.log(r)); }
  function Ginv(D) {
    if (D <= R0) return D;
    var lo = Math.log(R0), hi = Math.log(1e7), lD = Math.log(D);
    for (var i = 0; i < 80; i++) { var m = 0.5 * (lo + hi); if (P.f(m) < lD) lo = m; else hi = m; }
    return Math.exp(0.5 * (lo + hi));
  }
  return { G: G, Ginv: Ginv, slope: slope, kmPerUnit: kmPerUnit, anchors: A, R0: R0 };
}

/* A focused body's local frame. Near it the ladder offset maps LINEARLY with the body's own scale s
   (true radius / the radius the ladder-space framing was tuned for), so every authored focus distance
   frames the real body exactly as it framed the old one; far out the global ladder's growth takes over,
   so zooming out from any body still opens onto the whole Solar System and beyond.
     D(ρ) = s·ρ + (G(κρ) − κρ)/κ,   κ = min(1, 8 / ρ0),  ρ0 = 8 · (tuned radius / the Earth's tuned radius) */
export function bodyDistance(L, s, kappa, rho) {
  var x = kappa * rho;
  return s * rho + (L.G(x) - x) / kappa;
}
export function bodySlope(L, s, kappa, rho) {   // dlnD/dlnρ for the zoom governor
  var D = bodyDistance(L, s, kappa, rho), x = kappa * rho;
  var dG = L.G(x) * L.slope(x) / Math.max(1e-12, x);   // dG/dx
  return (s + dG - 1) * rho / Math.max(1e-12, D);
}

/* human-readable true distance */
export function formatDistance(km) {
  if (!(km > 0)) return "";
  if (km < 1e6) return (km < 1e4 ? km.toFixed(0) : (km / 1000).toFixed(0) + " thousand") + " km";
  var au = km / AU_KM;
  if (au < 0.1) return (km / 1e6).toFixed(km < 1e7 ? 2 : 1) + " million km";
  if (au < 5000) return (au < 10 ? au.toFixed(2) : au.toFixed(au < 100 ? 1 : 0)) + " AU";
  var ly = km / LY_KM;
  if (ly < 1e3) return (ly < 10 ? ly.toFixed(2) : ly.toFixed(ly < 100 ? 1 : 0)) + " ly";
  if (ly < 1e6) return (ly / 1e3).toFixed(ly < 1e4 ? 1 : 0) + " thousand ly";
  if (ly < 1e9) return (ly / 1e6).toFixed(ly < 1e7 ? 1 : 0) + " million ly";
  return (ly / 1e9).toFixed(1) + " billion ly";
}
