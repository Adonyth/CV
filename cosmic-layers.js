/* ============================================================================
   cosmic-layers.js — THE SINGLE SOURCE OF SCALE TRUTH for the cosmic-address zoom.
   Loaded as a plain global (window.CosmicLOD) BEFORE space.js so both space.js and
   natal-sky.js read the same layer table + driver. Nothing else in the scene may
   hold a scale/opacity literal — every fade reads layerWeight(camLen, layer).

   The address ladder (Earth → Solar System → Milky Way → Local Group → Local Sheet
   → Virgo/Local Supercluster → Laniakea → Cosmic Web → Observable Universe) is a
   CONTINUOUS logarithmic zoom: adjacent tiers overlap so every boundary is a true
   crossfade, and each child structure collapses to a trackable node of its parent.

   camLen = camera.position.length() (distance to world origin, natal-sky's `_cl`).
   camLenPeak ≈ 1.5× that tier's scene radius, so a tier is framed when the camera
   sits ~1.5 radii out. Bands are placed at the geometric midpoints between peaks.
   ========================================================================== */
(function () {
  "use strict";

  // sceneRadius = outer extent of that tier's built geometry (scene units).
  // The existing anchors it must honour: Milky Way GAL_RGAL 2600, cosmic web RMAX
  // 13500. The Laniakea flow + the three middle tiers are (re)built to this ladder.
  var LAYERS = [
    { id: "solar",               label: { en: "Solar System",        zh: "太阳系" },       you: { en: "1 AU from the Sun",                 zh: "距太阳 1 天文单位" },
      realScaleLy: 0.0032,   sceneRadius: 3,     camLenPeak: 40,    fadeInStart: -1,    fadeInEnd: -1,    fadeOutStart: 150,   fadeOutEnd: 340,   weAreOnEdge: false },
    { id: "milky-way",           label: { en: "Milky Way",           zh: "银河系" },       you: { en: "Orion Spur, 26 kly out",            zh: "猎户臂，距银心 2.6 万光年" },
      realScaleLy: 1e5,      sceneRadius: 2600,  camLenPeak: 3600,  fadeInStart: 260,   fadeInEnd: 1400,  fadeOutStart: 4300,  fadeOutEnd: 5400,  weAreOnEdge: true },
    { id: "local-group",         label: { en: "Local Group",         zh: "本星系群" },     you: { en: "the Milky Way lobe",                zh: "银河系一端" },
      realScaleLy: 1e7,      sceneRadius: 4000,  camLenPeak: 5600,  fadeInStart: 4300,  fadeInEnd: 5400,  fadeOutStart: 6600,  fadeOutEnd: 8000,  weAreOnEdge: false },
    { id: "local-sheet",         label: { en: "Local Sheet",         zh: "本星系片" },     you: { en: "within the sheet plane",            zh: "位于星系片平面内" },
      realScaleLy: 2.3e7,    sceneRadius: 5200,  camLenPeak: 8200,  fadeInStart: 6600,  fadeInEnd: 8000,  fadeOutStart: 9400,  fadeOutEnd: 11200, weAreOnEdge: false },
    { id: "virgo-supercluster",  label: { en: "Virgo Supercluster",  zh: "室女超星系团" }, you: { en: "on the outskirts, 54 Mly from Virgo", zh: "外缘，距室女团 5400 万光年" },
      realScaleLy: 1.1e8,    sceneRadius: 7000,  camLenPeak: 11500, fadeInStart: 9400,  fadeInEnd: 11200, fadeOutStart: 13200, fadeOutEnd: 15600, weAreOnEdge: true },
    { id: "laniakea",            label: { en: "Laniakea",            zh: "拉尼亚凯亚" },   you: { en: "far edge, near the Perseus–Pisces divide", zh: "外缘，近英仙-双鱼分水岭" },
      realScaleLy: 5.2e8,    sceneRadius: 9700,  camLenPeak: 16000, fadeInStart: 13200, fadeInEnd: 15600, fadeOutStart: 18400, fadeOutEnd: 22000, weAreOnEdge: true },
    { id: "cosmic-web",          label: { en: "Cosmic Web",          zh: "宇宙网" },       you: { en: "one basin among many",              zh: "众多流域中的一个" },
      realScaleLy: 2e9,      sceneRadius: 13500, camLenPeak: 23000, fadeInStart: 18400, fadeInEnd: 22000, fadeOutStart: 27000, fadeOutEnd: 33000, weAreOnEdge: true },
    { id: "observable-universe", label: { en: "Observable Universe", zh: "可观测宇宙" },   you: { en: "at the centre of your own sphere",  zh: "自身可观测球的中心" },
      realScaleLy: 9.3e10,   sceneRadius: 19000, camLenPeak: 34000, fadeInStart: 27000, fadeInEnd: 33000, fadeOutStart: -1,    fadeOutEnd: -1,    weAreOnEdge: false }
  ];

  var LN = Math.log, MAXCAM = 46000;

  // smoothstep in log-space so a fade at 260→1400 feels identical to one at
  // 18400→22000 (scale-invariant — matches the controls' native ln(r) zoom ease).
  function smooth(a, b, x) {
    if (b <= a) return x >= b ? 1 : 0;
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  // layerWeight(camLen, layer) → 0..1 : a smoothstep TRAPEZOID in log(camLen).
  // This is THE driver. Every opacity/scale/detail in the whole cosmos reads it.
  function layerWeight(camLen, ly) {
    var L = LN(Math.max(1e-3, camLen)), w = 1;
    if (ly.fadeInStart >= 0)  w *= smooth(LN(ly.fadeInStart),  LN(ly.fadeInEnd),  L);
    if (ly.fadeOutStart >= 0) w *= (1 - smooth(LN(ly.fadeOutStart), LN(ly.fadeOutEnd), L));
    return w;
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

  window.CosmicLOD = {
    LAYERS: LAYERS, MAXCAM: MAXCAM,
    layerWeight: layerWeight, currentLayerId: currentLayerId,
    byId: byId, weight: weight, smooth: smooth
  };
})();
