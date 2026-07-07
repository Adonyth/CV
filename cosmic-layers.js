/* ============================================================================
   cosmic-layers.js — THE SINGLE SOURCE OF SCALE TRUTH for the cosmic-address zoom.
   Loaded as a plain global (window.CosmicLOD) BEFORE space.js so both space.js and
   natal-sky.js read the same layer table + driver.

   The address ladder (Earth → Solar System → Milky Way → Local Group → Local Sheet
   → Virgo/Local Supercluster → Laniakea → Cosmic Web → Observable Universe →
   Beyond Observable Horizon) is a CONTINUOUS logarithmic zoom. THE CONTINUITY LAW:
   each tier has a generous overlap window with its parent, but opacity is not
   used as the transition. Each child structure collapses into a trackable node of its parent
   (the collapse() curve below drives the shrink), so the Milky Way never
   "disappears" — it condenses into the Local Group's node, the Local Group into
   the Sheet's, Laniakea into one warm knot of the web.

   camLen = camera.position.length() (distance to world origin = the Sun/us).
   camLenPeak ≈ 1.35× that tier's sceneRadius: the tier is perfectly framed when
   the camera stands ~1.35 radii out.

   realScaleLy = the structure's true radius in light-years (the log-address).
   sceneRadius = the outer extent of that tier's BUILT geometry (scene units).
   The scene is a log-compressed universe: true 10^5 ly (galaxy) → 2600 units,
   true 4.65×10^10 ly (observable) → 56000 units. Ratios between neighbouring
   tiers are honest in ORDER but compressed in MAGNITUDE — the collapse curves
   restore the perceptual "powers of ten" feel.
   ========================================================================== */
(function () {
  "use strict";

  var LAYERS = [
    { id: "earth", rail: true,
      label: { en: "Earth", zh: "地球" },
      you:   { en: "here", zh: "此地" },
      realScaleLy: 1.35e-9, sceneRadius: 1, camLenPeak: 8,
      fadeInStart: -1, fadeInEnd: -1, fadeOutStart: -1, fadeOutEnd: -1, weAreOnEdge: false },

    { id: "solar", rail: true,
      label: { en: "Solar System", zh: "太阳系" },
      you:   { en: "1 AU from the Sun", zh: "距太阳 1 天文单位" },
      realScaleLy: 0.0032, sceneRadius: 3, camLenPeak: 40,
      fadeInStart: -1, fadeInEnd: -1, fadeOutStart: 150, fadeOutEnd: 340, weAreOnEdge: false },

    // camLen 128 is the "whole sky" star-chart home — the constellation shell; not a rail stop.

    { id: "milky-way", rail: true,
      label: { en: "Milky Way", zh: "银河系" },
      you:   { en: "Orion Spur, 26 kly from the core", zh: "猎户臂，距银心 2.6 万光年" },
      realScaleLy: 5e4, sceneRadius: 2600, camLenPeak: 3500,
      fadeInStart: 400, fadeInEnd: 1500, fadeOutStart: 5000, fadeOutEnd: 8000, weAreOnEdge: true },

    { id: "local-group", rail: true,
      label: { en: "Local Group", zh: "本星系群" },
      you:   { en: "the Milky Way — one of two great spirals", zh: "银河系——两大旋涡之一" },
      realScaleLy: 5e6, sceneRadius: 6800, camLenPeak: 6000,
      fadeInStart: 5000, fadeInEnd: 8000, fadeOutStart: 10400, fadeOutEnd: 14200, weAreOnEdge: false },

    // the Local Sheet is a full address rung: subtle in the scene, but named on
    // the rail so the Virgo handoff never reads as a blank scale.
    { id: "local-sheet", rail: true,
      label: { en: "Local Sheet", zh: "本星系片" },
      you:   { en: "in the sheet plane, beside the Local Void", zh: "薄片平面内，本地空洞之侧" },
      realScaleLy: 1.7e7, sceneRadius: 10400, camLenPeak: 9000,
      fadeInStart: 10400, fadeInEnd: 14200, fadeOutStart: 15800, fadeOutEnd: 21000, weAreOnEdge: true },

    { id: "virgo-supercluster", rail: true,
      label: { en: "Virgo / Local Supercluster", zh: "室女 · 本超星系团" },
      you:   { en: "on the outskirts — 54 Mly from Virgo", zh: "外缘——距室女团 5400 万光年" },
      realScaleLy: 5.5e7, sceneRadius: 15800, camLenPeak: 13000,
      fadeInStart: 15800, fadeInEnd: 21000, fadeOutStart: 24200, fadeOutEnd: 32000, weAreOnEdge: true },

    { id: "laniakea", rail: true,
      label: { en: "Laniakea", zh: "拉尼亚凯亚" },
      you:   { en: "far shore of the basin, near the Perseus–Pisces divide", zh: "流域远岸，近英仙-双鱼分水岭" },
      realScaleLy: 2.6e8, sceneRadius: 24000, camLenPeak: 22000,
      fadeInStart: 24200, fadeInEnd: 32000, fadeOutStart: 37000, fadeOutEnd: 48000, weAreOnEdge: true },

    { id: "cosmic-web", rail: true,
      label: { en: "Cosmic Web", zh: "宇宙网" },
      you:   { en: "one basin among thousands", zh: "千万流域之一" },
      realScaleLy: 1e9, sceneRadius: 36500, camLenPeak: 72000,
      fadeInStart: 37000, fadeInEnd: 48000, fadeOutStart: 56000, fadeOutEnd: 72000, weAreOnEdge: true },

    { id: "observable-universe", rail: true,
      label: { en: "Observable Universe", zh: "可观测宇宙" },
      you:   { en: "at the centre of your own horizon", zh: "自身视界的中心" },
      realScaleLy: 4.65e10, sceneRadius: 56000, camLenPeak: 75000,
      fadeInStart: 56000, fadeInEnd: 72000, fadeOutStart: 88000, fadeOutEnd: 105000, weAreOnEdge: false },

    // Beyond the observable horizon is not a mapped astronomical structure. Keep the
    // implementation id stable for camera/test code, but present it as an honest
    // boundary: unobserved, not a quark/universe loop.
    { id: "fluctuation", rail: true,
      label: { en: "Beyond Horizon", zh: "视界之外" },
      you:   { en: "unobserved; no mapped structure", zh: "未观测；不绘制结构" },
      realScaleLy: -1, sceneRadius: 118000, camLenPeak: 112000,
      fadeInStart: 88000, fadeInEnd: 105000, fadeOutStart: -1, fadeOutEnd: -1, weAreOnEdge: false }
  ];

  var LN = Math.log, MAXCAM = 118000;

  // smoothstep in log-space so a fade at 260→1400 feels identical to one at
  // 18400→22000 (scale-invariant — matches the controls' native ln(r) zoom ease).
  function smooth(a, b, x) {
    if (b <= a) return x >= b ? 1 : 0;
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  // layerWeight(camLen, layer) -> 0|1 : a hard scale-presence gate. It is NOT
  // an opacity weight. Tier transitions must be true geometric zoom/collapse,
  // never fade-in/fade-out.
  function layerWeight(camLen, ly) {
    var r = Math.max(1e-3, camLen);
    if (ly.fadeInStart >= 0 && r < ly.fadeInStart) return 0;
    if (ly.fadeOutEnd >= 0 && r > ly.fadeOutEnd) return 0;
    return 1;
  }

  // collapse(camLen, layer) → 1..collapseTo : the CHILD-INTO-PARENT-NODE shrink.
  // 1 while the tier owns the frame; eases down through its fadeOut window so the
  // structure visibly CONDENSES into the node its parent tier draws at the same spot.
  function collapse(camLen, ly, to) {
    return 1;   // [2026-07-07 RIGID ZOOM: no per-frame collapse deformation — structures hold scale 1.0; perspective (camera dolly) handles apparent size. The fade windows still gate which tier owns the frame, preventing doubling/clutter.]
  }

  // nearest-peak-in-log → the breadcrumb id. Stable (no flicker at a 50/50 crossfade).
  function currentLayerId(camLen) {
    var L = LN(Math.max(1e-3, camLen)), best = LAYERS[0], bd = Infinity;
    for (var i = 0; i < LAYERS.length; i++) {
      var d = Math.abs(L - LN(LAYERS[i].camLenPeak));
      if (d < bd) { bd = d; best = LAYERS[i]; }
    }
    return best.id;
  }

  function byId(id) { for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].id === id) return LAYERS[i]; return null; }
  function weight(camLen, id) { var ly = byId(id); return ly ? layerWeight(camLen, ly) : 0; }
  function collapseOf(camLen, id, to) { var ly = byId(id); return ly ? collapse(camLen, ly, to) : 1; }

  // short scale caption for the rail ticks: "10⁵ ly" style, from realScaleLy
  var SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  function scaleCaption(ly) {
    if (!ly || ly.realScaleLy == null || ly.realScaleLy <= 0) return "";
    var e = Math.round(Math.log(ly.realScaleLy) / Math.LN10);
    var s = String(e).split("").map(function (c) { return SUP[c] || c; }).join("");
    return "10" + s + " ly";
  }

  window.CosmicLOD = {
    LAYERS: LAYERS, MAXCAM: MAXCAM,
    layerWeight: layerWeight, currentLayerId: currentLayerId,
    byId: byId, weight: weight, smooth: smooth,
    collapse: collapseOf, scaleCaption: scaleCaption
  };
  /* alias for the ScaleDirector / LODDirector contract in the spatial spec */
  window.ScaleDirector = window.CosmicLOD;
  window.LODDirector = window.CosmicLOD;
})();
