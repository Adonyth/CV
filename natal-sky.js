/* ============================================================
   natal-sky.js — M11: the natal celestial sphere.
   The FAR-FIELD of the deep embers becomes the birth sky.
   Zodiac constellations = the knowledge graph: each star a real
   piece of the work, ☉→Capricorn (主外) ☾→Leo (主内), placed on
   the verified natal chart (2002-01-02 15:45 CST, Huozhou).

   Contract (obeyed, never violated):
   - additive layer INSIDE the existing deepEmbers group; shares the
     one GLOW `tex` + the unmodified DEEP_*_SHADER; same FogExp2.
   - #deep stays pointer-events:none / z-index:-2. Picking is a
     window raycaster gated by hit — never flips pointer-events.
   - the iframe Nye Clock is untouched. No OrbitControls, no camera.

   buildNatalSky(THREE, scene, data, opts) -> { group, tick, applyTheme, setVisible, dispose }
   opts: { tex, vertexShader, fragmentShader, group, R_STAR, mobile, calm,
           camera, interactive, labelHost }
   ============================================================ */
export function buildNatalSky(THREE, scene, data, opts) {
  var T = THREE, o = opts || {};
  var R = o.R_STAR || 372;
  var EPS = 23.4393 * Math.PI / 180;          // obliquity of the ecliptic
  var mobile = !!o.mobile, calm = o.calm !== false;
  var interactive = (o.interactive !== false) && (typeof document !== "undefined") && !!o.camera;

  var group = new T.Group();                    // outer: rotates the whole sky so the Sun-sign greets the camera
  group.name = "natalSky";
  (o.group || scene).add(group);
  var belt = new T.Group();                     // inner: ecliptic tilt
  belt.rotation.x = EPS;
  group.add(belt);

  /* ---------------- math ---------------- */
  function raDecToEcl(raH, decDeg) {            // equatorial -> ecliptic (radians)
    var a = raH * 15 * Math.PI / 180, d = decDeg * Math.PI / 180;
    var lon = Math.atan2(Math.sin(a) * Math.cos(EPS) + Math.tan(d) * Math.sin(EPS), Math.cos(a));
    var lat = Math.asin(Math.sin(d) * Math.cos(EPS) - Math.cos(d) * Math.sin(EPS) * Math.sin(a));
    return { lon: lon, lat: lat };
  }
  function eclVec(lon, lat, r) {                // ecliptic (radians) -> Vector3
    // ecliptic plane lies in x–z (a horizon band sweeping THROUGH the view), latitude rises toward y —
    // so the zodiac reads like a real sky, and one y-rotation can center any sign in the camera's gaze
    return new T.Vector3(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon));
  }
  function hash(i) { var t = (i + 1) * 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function coreCol(h, spark) { return spark ? [1.0, 228 / 255, 190 / 255] : [1.0, (150 + 45 * h) / 255, (96 + 34 * h) / 255]; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function circMeanLon(lons) {                  // circular mean of longitudes (radians)
    var sx = 0, sy = 0; for (var i = 0; i < lons.length; i++) { sx += Math.cos(lons[i]); sy += Math.sin(lons[i]); }
    return Math.atan2(sy, sx);
  }

  /* ---------------- normalize constellations (full + brief) ---------------- */
  function normFull(c) {
    return {
      id: c.id, signIndex: c.signIndex, name: c.figureName, loadBearing: !!c.loadBearing, polarity: c.polarity,
      stars: c.stars.map(function (s) { return { raH: s.raH, decDeg: s.decDeg, mag: s.mag }; }),
      figureLines: c.figureLines || [], dataNodes: c.dataNodes || []
    };
  }
  function normBrief(c) {
    return {
      id: c.id, signIndex: c.signIndex, name: c.figureName, loadBearing: false, polarity: c.polarity,
      stars: c.stars.map(function (t) { return { raH: t[1], decDeg: t[2], mag: t[3] }; }),
      figureLines: c.figureLines || [], dataNodes: c.dataNodes || []
    };
  }
  var cons = (data.constellations || []).map(normFull).concat((data.briefConstellations || []).map(normBrief));

  /* ---------------- place stars (tropical belt) ---------------- */
  // Each star gets a local position; the constellation figure is re-seated so its
  // circular-mean longitude lands at its 30deg sign-cell centre (planets stay true).
  var stars = [];        // { pos, mag, importance, conIdx, node }
  var conCentroid = [];  // Vector3 per constellation (for labels / back-hemisphere cull)
  cons.forEach(function (c, ci) {
    var ecl = c.stars.map(function (s) { return raDecToEcl(s.raH, s.decDeg); });
    var meanLon = circMeanLon(ecl.map(function (e) { return e.lon; }));
    var cell = (30 * c.signIndex + 15) * Math.PI / 180;
    var delta = cell - meanLon;
    var nodeByStar = {};
    c.dataNodes.forEach(function (n) { nodeByStar[n.starIndex] = n; });
    var inFigure = {};
    c.figureLines.forEach(function (seg) { inFigure[seg[0]] = 1; inFigure[seg[1]] = 1; });
    var centroid = new T.Vector3();
    c._starPos = [];
    ecl.forEach(function (e, si) {
      // VOLUMETRIC ZODIAC: each star sits at its own radial DEPTH, not a single shell.
      // Only the distance varies — the angular direction (lon+delta, lat) is untouched —
      // so the figure reads identically from the Earth at origin, yet becomes a true 3D
      // scatter the moment you fly into it. Deterministic per (constellation, star).
      var df = 0.88 + 0.62 * hash(ci * 131 + si + 7);   // depth ∈ [0.88 R … 1.50 R]
      var pos = eclVec(e.lon + delta, e.lat, R * df);
      c._starPos[si] = pos;
      centroid.add(pos);
      var node = nodeByStar[si] || null;
      var importance = node ? 1.0 : (inFigure[si] ? 0.7 : 0.35);
      stars.push({ pos: pos, mag: c.stars[si].mag, importance: importance, conIdx: ci, node: node });
    });
    conCentroid[ci] = centroid.multiplyScalar(1 / (ecl.length || 1));
  });

  /* ---------------- star-embers: ONE Points, deep-ember shader ---------------- */
  var N = stars.length;
  var pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  var aSize = new Float32Array(N), aAlpha = new Float32Array(N), aSeed = new Float32Array(N), aSpark = new Float32Array(N);
  var nodeIndex = [];  // point-index -> data node (for raycast)
  var starConIdx = [];  // point-index -> constellation index (for hover reveal)
  stars.forEach(function (st, i) {
    var k = i * 3; pos[k] = st.pos.x; pos[k + 1] = st.pos.y; pos[k + 2] = st.pos.z;
    var magF = Math.max(0.06, Math.min(1, (6.5 - st.mag) / 6.0));
    var w = magF * (0.55 + 0.45 * st.importance);
    var spark = (st.importance === 1.0) ? 1 : (st.mag < 1.6 ? 1 : 0);
    var h = hash(i * 7 + 3);
    var c = coreCol(h, spark);
    col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
    var keyCon = cons[st.conIdx].loadBearing;
    aSize[i] = lerp(2.4, 8.0, w) + (st.importance === 1.0 ? 3.0 : 0) + (keyCon && st.importance >= 0.7 ? 2.0 : 0);
    aAlpha[i] = Math.min(1.0, lerp(0.52, 0.98, w) * (st.importance === 1.0 ? 1.15 : 1.0) * (keyCon ? 1.12 : 1.0));
    starConIdx[i] = st.conIdx;
    aSeed[i] = hash(i * 13 + 1);
    aSpark[i] = spark;
    if (st.node) nodeIndex[i] = { node: st.node, base: aAlpha[i], pos: st.pos };
  });
  var geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new T.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new T.BufferAttribute(aSize, 1));
  geo.setAttribute("aAlpha", new T.BufferAttribute(aAlpha, 1));
  geo.setAttribute("aSeed", new T.BufferAttribute(aSeed, 1));
  geo.setAttribute("aSpark", new T.BufferAttribute(aSpark, 1));
  geo.computeBoundingSphere();

  var uniforms = {
    uMap: { value: o.tex }, uTime: { value: 0 }, uFusion: { value: 0.52 },
    uPixelRatio: { value: Math.min((typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1, mobile ? 1.5 : 2) },
    uMaxPointSize: { value: mobile ? 7.0 : 10.0 }, uRefDepth: { value: 840.0 }, // dimmer zodiac (owner: too bright) — smaller point cap + shorter ref-depth quiets the star field while keeping the depth cue
    uAmplitude: { value: 6.0 },              // near-frozen: figures hold their shape
    uLayerKind: { value: 0.0 }, uClearInner: { value: -2.0 }, uClearOuter: { value: -1.0 }
  };
  var starMat = new T.ShaderMaterial({
    uniforms: uniforms, vertexShader: o.vertexShader, fragmentShader: o.fragmentShader,
    transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending
  });
  var starPoints = new T.Points(geo, starMat);
  starPoints.frustumCulled = false; starPoints.name = "natalStars";
  belt.add(starPoints);

  /* ---------------- figure-lines: one LineSegments PER constellation ----------------
     (per-constellation materials -> the two load-bearing figures read brighter, and
     portals/hover can bloom a single constellation) */
  var q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), EPS); // bake belt tilt for sort only
  var lineEntries = [];  // { mat, base }  indexed by constellation
  var lineByCon = {};
  var totalSegs = 0;
  var isDark = true, hlSet = {}, hoverCon = -1, conClickCb = null, nodeClickCb = null;
  cons.forEach(function (c, ci) {
    var segs = [];
    c.figureLines.forEach(function (seg) {
      var a = c._starPos[seg[0]], b = c._starPos[seg[1]];
      if (!a || !b) return;
      var mid = a.clone().add(b).multiplyScalar(0.5).applyQuaternion(q);
      segs.push({ a: a, b: b, midZ: mid.z });
    });
    if (!segs.length) { lineEntries[ci] = null; return; }
    segs.sort(function (p, r) { return p.midZ - r.midZ; });  // far first, near last → additive reads clean
    /* the figures are drawn in STARDUST — chains of the same GLOW embers as
       everything else in this cosmos (no more vector-CAD lines) */
    var pts = [];
    segs.forEach(function (sg) {
      var L = sg.a.distanceTo(sg.b);
      var n = Math.max(4, Math.round(L / (c.loadBearing ? 1.55 : 1.95)));
      for (var ii = 0; ii <= n; ii++) {
        var t = ii / n;
        pts.push(
          sg.a.x + (sg.b.x - sg.a.x) * t + (hash(pts.length * 3 + ci * 17) - 0.5) * 0.9,
          sg.a.y + (sg.b.y - sg.a.y) * t + (hash(pts.length * 5 + ci * 29) - 0.5) * 0.9,
          sg.a.z + (sg.b.z - sg.a.z) * t + (hash(pts.length * 7 + ci * 41) - 0.5) * 0.9
        );
      }
    });
    totalSegs += segs.length;
    var lgeo = new T.BufferGeometry();
    lgeo.setAttribute("position", new T.BufferAttribute(new Float32Array(pts), 3));
    var base = c.loadBearing ? 0.50 : 0.42;   // dimmer figure-lines (owner: zodiac too bright); uiTick multiplies this base each frame
    var prx = Math.min((typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1, mobile ? 1.5 : 2);
    var mat = new T.PointsMaterial({
      map: o.tex, color: c.loadBearing ? 0xffc79a : 0xf6b088, size: (c.loadBearing ? 7.0 : 5.4) * prx, sizeAttenuation: false,
      transparent: true, opacity: base, depthWrite: false, depthTest: true, blending: T.AdditiveBlending
    });
    mat.fog = false;
    if ("toneMapped" in mat) mat.toneMapped = false;
    var fl = new T.Points(lgeo, mat);
    fl.frustumCulled = false; fl.name = "natalFigure_" + c.id;
    belt.add(fl);
    /* wide soft under-glow beneath the crisp chain — the figure reads as a
       LUMINOUS BRUSHSTROKE, unmistakable against the loose star sea */
    var glowMat = new T.PointsMaterial({
      map: o.tex, color: c.loadBearing ? 0xf7a877 : 0xe8946c, size: (c.loadBearing ? 15.5 : 12.0) * prx, sizeAttenuation: false,
      transparent: true, opacity: base * 0.42, depthWrite: false, depthTest: true, blending: T.AdditiveBlending
    });
    glowMat.fog = false;
    if ("toneMapped" in glowMat) glowMat.toneMapped = false;
    var flGlow = new T.Points(lgeo, glowMat);
    flGlow.frustumCulled = false; flGlow.name = "natalFigureGlow_" + c.id;
    belt.add(flGlow);
    lineEntries[ci] = { mat: mat, glowMat: glowMat, base: base, geo: lgeo };
    lineByCon[c.id] = ci;
  });

  /* ---------------- planet glyphs (☉ in Capricorn, ☾ in Leo, …) ---------------- */
  var GLYPH = { sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃", saturn: "♄" };
  function glyphSprite(ch, sizeScale, bright) {
    var cv = document.createElement("canvas"); cv.width = cv.height = 128;
    var g = cv.getContext("2d"); g.clearRect(0, 0, 128, 128);
    g.fillStyle = bright ? "rgba(244,234,210,0.98)" : "rgba(224,135,106,0.92)";
    g.font = '700 78px "Songti SC","STSong","Noto Serif SC",serif';
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ch, 64, 68);
    var tex = new T.CanvasTexture(cv);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    var m = new T.SpriteMaterial({ map: tex, transparent: true, opacity: bright ? 0.98 : 0.88, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    var sp = new T.Sprite(m); var s = (mobile ? 18 : 24) * sizeScale; sp.scale.set(s, s, 1);
    return sp;
  }
  var planetSprites = [];
  (data.planets || []).forEach(function (p) {
    // NO planet symbols anywhere (founder: the sky carries no labels at all);
    // invisible markers keep the chart-alignment math alive
    var lon = p.eclLonDeg * Math.PI / 180, lat = (p.eclLatDeg || 0) * Math.PI / 180;
    var mk = new T.Object3D();
    mk.position.copy(eclVec(lon, lat, R * 0.965));
    mk.userData.planet = p.id;
    belt.add(mk); planetSprites.push(mk);
  });

  /* ---------------- the giant witnesses ----------------
     Jupiter and Saturn as real bodies at their true birth-night stations
     (ephemeris-verified: Jupiter at opposition in Cancer, Saturn in Gemini).
     The scene has no THREE lights — a small limb-darkening shader carries the
     roundness; at opposition the face the Earth sees is the lit face. */
  var bodyGroup = new T.Group(); bodyGroup.name = "NatalBodies"; belt.add(bodyGroup);
  /* baked once at load — per-frame cost stays one texture sample per pixel */
  function gRng(seed) { var a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gNoise(seed, px) {          // x-periodic value noise
    var rng = gRng(seed), lat = [], y, x;
    for (y = 0; y < 48; y++) { lat[y] = []; for (x = 0; x < px; x++) lat[y][x] = rng(); }
    return function (xx, yy) {
      var xi = Math.floor(xx), yi = Math.floor(yy), xf = xx - xi, yf = yy - yi;
      var ux = xf * xf * (3 - 2 * xf), uy = yf * yf * (3 - 2 * yf);
      var X0 = ((xi % px) + px) % px, X1 = (X0 + 1) % px;
      var Y0 = Math.min(47, Math.max(0, yi)), Y1 = Math.min(47, Y0 + 1);
      return (lat[Y0][X0] * (1 - ux) + lat[Y0][X1] * ux) * (1 - uy) + (lat[Y1][X0] * (1 - ux) + lat[Y1][X1] * ux) * uy;
    };
  }
  function gFbm(seed, px) {
    var o = [gNoise(seed, px), gNoise(seed + 3, px * 2), gNoise(seed + 11, px * 4)];
    return function (x, y) { return 0.5 * o[0](x, y) + 0.32 * o[1](x * 2, y * 2) + 0.18 * o[2](x * 4, y * 4); };
  }
  function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rampAt(stops, v) {          // stops: [pos, "#hex"] sorted
    var i; for (i = 1; i < stops.length; i++) if (v <= stops[i][0]) break;
    if (i >= stops.length) i = stops.length - 1;
    var a = stops[i - 1], b = stops[i];
    var t = (v - a[0]) / Math.max(1e-6, b[0] - a[0]); t = Math.max(0, Math.min(1, t));
    var ca = hexRGB(a[1]), cb = hexRGB(b[1]);
    return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
  }
  var JUPITER_RAMP = [ // v: 0 = north pole … 1 = south pole (true belt/zone rhythm)
    [0.00, "#a58a66"], [0.10, "#ab8f6d"], [0.16, "#d9c49a"], [0.22, "#a5794f"], [0.28, "#e4d4ae"],
    [0.34, "#b08453"], [0.40, "#96562f"], [0.46, "#a86636"], [0.485, "#f0e3c0"], [0.535, "#eee0ba"],
    [0.56, "#9c5c33"], [0.63, "#aa6a3d"], [0.68, "#e0d0a8"], [0.74, "#b3895c"], [0.80, "#d6c298"],
    [0.88, "#a98d68"], [1.00, "#9d8261"]
  ];
  var SATURN_RAMP = [
    [0.00, "#a98f68"], [0.12, "#bda87e"], [0.24, "#d3bd8e"], [0.36, "#c8ae7e"], [0.46, "#e2cfa0"],
    [0.54, "#e6d3a8"], [0.64, "#cdb384"], [0.76, "#d8c193"], [0.90, "#b89e73"], [1.00, "#a3895f"]
  ];
  var URANUS_RAMP = [ // pale aquamarine, near-featureless — Voyager 2 saw an almost blank disk
    [0.00, "#9ccad6"], [0.30, "#a8dce6"], [0.50, "#b8e6ec"], [0.70, "#a8dce6"], [1.00, "#9ccad6"]
  ];
  var NEPTUNE_RAMP = [ // deeper azure with the faintest banding
    [0.00, "#3350cf"], [0.30, "#3f5ee0"], [0.50, "#4a6ae6"], [0.62, "#4060e0"], [0.80, "#354fce"], [1.00, "#2c43bc"]
  ];
  function giantTexture(kind) {
    var W = 1024, H = 512, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
    var jup = kind === "jupiter";
    var ice = (kind === "uranus" || kind === "neptune");           // ice giants: nearly smooth spheres
    var ramp = jup ? JUPITER_RAMP : kind === "uranus" ? URANUS_RAMP : kind === "neptune" ? NEPTUNE_RAMP : SATURN_RAMP;
    var warp = gFbm(jup ? 5 : 71, 6), swirl = gFbm(jup ? 29 : 83, 12);
    var wAmp = jup ? 0.030 : ice ? 0.004 : 0.008;
    var y, x;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var u = x / W, v = y / H;
        var vv = v + (warp(u * 6, v * 3) - 0.5) * wAmp * (1 + 1.6 * Math.abs(Math.sin(v * Math.PI * 7)));
        var c = rampAt(ramp, Math.max(0, Math.min(1, vv)));
        var tone = 0.94 + 0.12 * (swirl(u * 12, v * 6) - 0.5) * (jup ? 1.0 : ice ? 0.22 : 0.45);
        var i4 = (y * W + x) * 4;
        img.data[i4] = Math.min(255, c[0] * tone);
        img.data[i4 + 1] = Math.min(255, c[1] * tone);
        img.data[i4 + 2] = Math.min(255, c[2] * tone);
        img.data[i4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (jup) {
      // the Great Red Spot (~22°S) with its pale collar, plus a string of white ovals
      var gx = 0.31 * W, gy = 0.625 * H;
      var halo = ctx.createRadialGradient(gx, gy, 2, gx, gy, 0.075 * W);
      halo.addColorStop(0, "rgba(240,226,196,0.9)"); halo.addColorStop(1, "rgba(240,226,196,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.ellipse(gx, gy, 0.075 * W, 0.045 * H, 0, 0, Math.PI * 2); ctx.fill();
      var spot = ctx.createRadialGradient(gx, gy, 1, gx, gy, 0.052 * W);
      spot.addColorStop(0, "rgba(201,96,60,0.98)"); spot.addColorStop(0.7, "rgba(180,84,52,0.9)"); spot.addColorStop(1, "rgba(180,84,52,0)");
      ctx.fillStyle = spot; ctx.beginPath(); ctx.ellipse(gx, gy, 0.052 * W, 0.030 * H, 0, 0, Math.PI * 2); ctx.fill();
      var ovr = gRng(3);
      ctx.fillStyle = "rgba(238,230,208,0.75)";
      for (var k = 0; k < 4; k++) {
        var ox = (0.52 + 0.11 * k + 0.03 * ovr()) * W, oy = (0.70 + 0.012 * ovr()) * H;
        ctx.beginPath(); ctx.ellipse(ox, oy, 0.011 * W, 0.007 * H, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    var tex = new T.CanvasTexture(cv);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = T.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }
  function terrestrialTexture(kind) {
    var W = 512, H = 256, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
    var spec = {
      mercury: { base: "#8f8a86", lo: "#5c5854", hi: "#b4afa8", seed: 12, spots: 60, mottle: 0.5 },
      venus:   { base: "#d8c48c", lo: "#c2a86a", hi: "#efe4bd", seed: 34, spots: 0,  mottle: 0.35 },
      mars:    { base: "#b25a35", lo: "#7f3b22", hi: "#d59a6a", seed: 56, spots: 26, mottle: 0.55 },
      pluto:   { base: "#cda783", lo: "#a9855f", hi: "#ece0cb", seed: 78, spots: 7,  mottle: 0.5 },  // tholin butterscotch + icy highs
      charon:  { base: "#9a968e", lo: "#6f6b64", hi: "#c6c2b8", seed: 91, spots: 12, mottle: 0.45 }  // grey water-ice
    }[kind] || { base: "#999", lo: "#666", hi: "#ccc", seed: 1, spots: 20, mottle: 0.4 };
    var fb = gFbm(spec.seed, 8);
    var cB = hexRGB(spec.base), cL = hexRGB(spec.lo), cH = hexRGB(spec.hi);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var u = x / W, v = y / H;
      var m = fb(u * 8, v * 4);                       // 0..1 mottle
      var t = (m - 0.5) * 2 * spec.mottle;            // -mottle..+mottle
      var c = t < 0 ? [cB[0] + (cL[0] - cB[0]) * -t, cB[1] + (cL[1] - cB[1]) * -t, cB[2] + (cL[2] - cB[2]) * -t]
                    : [cB[0] + (cH[0] - cB[0]) * t, cB[1] + (cH[1] - cB[1]) * t, cB[2] + (cH[2] - cB[2]) * t];
      var i4 = (y * W + x) * 4;
      img.data[i4] = c[0]; img.data[i4 + 1] = c[1]; img.data[i4 + 2] = c[2]; img.data[i4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (spec.spots) {                                 // craters (Mercury/Mars): dark floor, bright rim
      var rng = gRng(spec.seed + 100);
      for (var k = 0; k < spec.spots; k++) {
        var cx = rng() * W, cy = (0.08 + 0.84 * rng()) * H, r = 3 + 14 * Math.pow(rng(), 2.2);
        for (var ox = -W; ox <= W; ox += W) {
          var grd = ctx.createRadialGradient(cx + ox, cy, r * 0.1, cx + ox, cy, r);
          grd.addColorStop(0, "rgba(40,34,30,0.34)"); grd.addColorStop(0.8, "rgba(210,196,176,0.20)"); grd.addColorStop(1, "rgba(180,170,150,0)");
          ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx + ox, cy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    var tex = new T.CanvasTexture(cv);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = T.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }
  function giantMaterial(tex) {
    return new T.ShaderMaterial({
      uniforms: { uMap: { value: tex } },
      vertexShader: "varying vec3 vN; varying vec3 vV; varying vec2 vUv;\n" +
        "void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
      fragmentShader: "uniform sampler2D uMap; varying vec3 vN; varying vec3 vV; varying vec2 vUv;\n" +
        "void main(){ vec3 c=texture2D(uMap, vUv).rgb; float limb=pow(max(dot(normalize(vN),normalize(vV)),0.0),0.6); gl_FragColor=vec4(c*(0.22+0.78*limb),1.0); }"
    });
  }
  function ringTexture() {
    var W = 1024, H = 16, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
    var streak = gNoise(57, 128);
    function profile(t) {            // [alpha, brightness] across C → B → Cassini → A
      var a = 0, b = 1;
      if (t < 0.16) { a = 0.10 + 0.10 * (t / 0.16); b = 0.72; }                       // C ring — translucent
      else if (t < 0.50) { a = 0.62 + 0.14 * Math.sin((t - 0.16) * 22.0); b = 1.0; }  // B ring — dense, banded
      else if (t < 0.585) { a = 0.045; b = 0.62; }                                    // Cassini division
      else if (t < 0.93) {                                                            // A ring
        a = 0.40; b = 0.9;
        if (Math.abs(t - 0.865) < 0.007) a = 0.05;                                    // Encke gap
      } else { a = 0.40 * Math.max(0, 1 - (t - 0.93) / 0.07); b = 0.85; }             // outer fade
      if (t < 0.02) a *= t / 0.02;                                                    // inner fade
      return [a, b];
    }
    var base = hexRGB("#dcc79c");
    for (var x = 0; x < W; x++) {
      var t = x / W;
      var pr = profile(t);
      var fine = 0.86 + 0.28 * streak(t * 128, 0.5);                                  // fine radial banding
      var al = Math.max(0, Math.min(1, pr[0] * fine));
      for (var y = 0; y < H; y++) {
        var i4 = (y * W + x) * 4;
        img.data[i4] = Math.min(255, base[0] * pr[1]);
        img.data[i4 + 1] = Math.min(255, base[1] * pr[1]);
        img.data[i4 + 2] = Math.min(255, base[2] * pr[1]);
        img.data[i4 + 3] = Math.round(al * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new T.CanvasTexture(cv);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  (data.planets || []).forEach(function (p) {
    if (!p.body) return;
    var lon2 = p.eclLonDeg * Math.PI / 180, lat2 = (p.eclLatDeg || 0) * Math.PI / 180;
    var grp = new T.Group();
    grp.name = "Natal" + p.id.charAt(0).toUpperCase() + p.id.slice(1);
    grp.position.copy(eclVec(lon2, lat2, p.body.dist));
    var terra = (p.body.kind === "mercury" || p.body.kind === "venus" || p.body.kind === "mars" || p.body.kind === "pluto" || p.body.kind === "charon");
    var mesh = new T.Mesh(new T.SphereGeometry(p.body.radius, 48, 32), giantMaterial(terra ? terrestrialTexture(p.body.kind) : giantTexture(p.body.kind)));
    mesh.name = grp.name + "Mesh";
    if (!p.decorative) mesh.userData.nyePick = p.id;   // decorative outer planets are scenery, not content anchors
    grp.add(mesh);
    if (!p.decorative) {
      var pickR = Math.max(p.body.radius * 2.2, 1.25);   // a forgiving click target even for Mercury
      var pb = new T.Mesh(new T.SphereGeometry(pickR, 10, 10), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      pb.userData.nyePick = p.id;
      grp.add(pb);
    }
    // the REAL planet (solarsystemscope photographs, CC BY 4.0) replaces the painted
    // placeholder the moment it loads — procedural-only bodies (no shipped map) keep the paint
    if (!p.body.procOnly) (function (kind, mm) {
      new T.TextureLoader().load("data/planet-" + kind + ".jpg", function (ptex) {
        if ("colorSpace" in ptex && T.SRGBColorSpace) ptex.colorSpace = T.SRGBColorSpace;
        ptex.wrapS = T.RepeatWrapping; ptex.anisotropy = 4;
        mm.material.uniforms.uMap.value = ptex;
      });
    })(p.body.kind, mesh);
    if (p.body.ringInner) {
      var rIn = p.body.radius * p.body.ringInner, rOut = p.body.radius * p.body.ringOuter;
      var rg = new T.RingGeometry(rIn, rOut, 96, 1);
      var pos2 = rg.getAttribute("position"), uv2 = rg.getAttribute("uv");
      for (var vi = 0; vi < pos2.count; vi++) {                       // radial uv → the gradient reads as ring bands
        var rr = Math.sqrt(pos2.getX(vi) * pos2.getX(vi) + pos2.getY(vi) * pos2.getY(vi));
        uv2.setXY(vi, (rr - rIn) / (rOut - rIn), 0.5);
      }
      var ringMat = new T.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: T.DoubleSide, depthWrite: false, fog: false });
      new T.TextureLoader().load("data/saturn-ring.png", function (rtex) {
        if ("colorSpace" in rtex && T.SRGBColorSpace) rtex.colorSpace = T.SRGBColorSpace;
        rtex.anisotropy = 4;
        ringMat.map = rtex; ringMat.needsUpdate = true;   // Cassini's real shadows and gaps
      });
      var ring = new T.Mesh(rg, ringMat);
      ring.name = grp.name + "Ring";
      ring.rotation.x = (p.body.ringTiltDeg || 26.7) * Math.PI / 180;  // the belt's ecliptic is the XY plane; tilt off it
      if (!p.decorative) ring.userData.nyePick = p.id;
      grp.add(ring);
    }
    if (p.body.moon) {   // a bound companion (Charon over Pluto) offset along the local ecliptic tangent
      var mo = p.body.moon;
      var mmesh = new T.Mesh(new T.SphereGeometry(mo.radius, 32, 24), giantMaterial(terrestrialTexture(mo.kind)));
      mmesh.name = grp.name + "Moon";
      mmesh.userData.nyePick = mo.kind;                 // Charon is independently clickable + focusable
      var radial = eclVec(lon2, lat2, 1).normalize();
      var tangent = new T.Vector3().crossVectors(radial, new T.Vector3(0, 1, 0)).normalize();
      var moff = tangent.multiplyScalar(mo.dist || (p.body.radius * 6));
      mmesh.position.copy(moff);
      grp.add(mmesh);
      var cpb = new T.Mesh(new T.SphereGeometry(Math.max(mo.radius * 2.6, 0.9), 10, 10), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      cpb.userData.nyePick = mo.kind; cpb.position.copy(moff);   // a forgiving click target for the tiny moon
      grp.add(cpb);
    }
    bodyGroup.add(grp);
  });

  /* the asteroid belt: a static cloud of faint points between Mars and Jupiter.
     One BufferGeometry, one draw call, zero per-frame cost. */
  if (data.asteroidBelt) {
    var ab = data.asteroidBelt, an = ab.count | 0;
    var pos = new Float32Array(an * 3), col = new Float32Array(an * 3);
    var arng = gRng(4242);
    for (var ai = 0; ai < an; ai++) {
      var lon3 = arng() * Math.PI * 2;
      var lat3 = (arng() - 0.5) * (ab.latSpread || 5) * Math.PI / 180;
      var dist3 = ab.rInner + arng() * (ab.rOuter - ab.rInner);
      var vpos = eclVec(lon3, lat3, dist3);
      pos[ai * 3] = vpos.x; pos[ai * 3 + 1] = vpos.y; pos[ai * 3 + 2] = vpos.z;
      var g = 0.30 + 0.34 * arng();                 // dimmer, so the belt reads as dust not sparks
      col[ai * 3] = g * 0.72; col[ai * 3 + 1] = g * 0.58; col[ai * 3 + 2] = g * 0.42;
    }
    var abGeo = new T.BufferGeometry();
    abGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
    abGeo.setAttribute("color", new T.BufferAttribute(col, 3));
    var abMat = new T.PointsMaterial({ size: 0.9, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: T.NormalBlending, fog: false });   // rocky specks, not additive glow
    if ("toneMapped" in abMat) abMat.toneMapped = false;
    var abPts = new T.Points(abGeo, abMat);
    abPts.name = "AsteroidBelt";
    bodyGroup.add(abPts);
  }

  // orient the whole sky so the Sun-sign (Capricornus) greets the camera (+z) at rest, then drift slowly
  (function () {
    var sunP = (data.planets || []).filter(function (p) { return p.id === "sun"; })[0];
    if (!sunP) return;
    var v = eclVec(sunP.eclLonDeg * Math.PI / 180, (sunP.eclLatDeg || 0) * Math.PI / 180, 1).applyAxisAngle(new T.Vector3(1, 0, 0), EPS);
    // rotate azimuth(sun) → π (the −z the camera looks into): ☉ Capricornus greets the viewer
    group.rotation.y = Math.PI - Math.atan2(v.x, v.z);
  })();

  /* every constellation rests on a nebula under-light — twelve soft clouds you
     can count across the sky at any distance; the two NATAL signs burn warmest */
  cons.forEach(function (c, ci) {
    var key3 = c.loadBearing;
    var bm2 = new T.SpriteMaterial({ map: o.tex, transparent: true, opacity: key3 ? 0.22 : 0.14, depthWrite: false, depthTest: true, blending: T.AdditiveBlending, fog: false, color: key3 ? 0xe8916c : 0xd9855f });
    if ("toneMapped" in bm2) bm2.toneMapped = false;
    var aura = new T.Sprite(bm2);
    var asc = key3 ? 78 : 58;
    aura.scale.set(asc, asc, 1);
    aura.position.copy(conCentroid[ci]);
    aura.name = (key3 ? "natalAura_" : "conAura_") + c.id;
    belt.add(aura);
  });

  /* ---------------- famous deep-sky objects, MODELLED AS WARM STAR-CLOUDS: each real
     astrophoto is sampled into a genuine 3-D cloud of glowing POINTS — x,y from the photo
     so the object's shape reads, a z-DEPTH so it has real volume you can fly around (not a
     flat panel), and every point RE-COLOURED through the scene's own warm ember ramp
     (rust → coral → gold → cream) so it belongs to this world, not a photograph. Per-image
     auto-levels + brightness-weighted density carve the structure out so it reads as
     something built from stars. Built once at load; one Points cloud + one draw call each —
     zero per-frame cost. ---------------- */
  var DSO_SOFT = (function () {                  // one soft round star point
    var s = 64, cv = document.createElement("canvas"); cv.width = cv.height = s;
    var cx = cv.getContext("2d"), g = cx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,0.92)"); g.addColorStop(0.4, "rgba(255,255,255,0.3)"); g.addColorStop(1, "rgba(255,255,255,0)");   // softer, wider core → points melt into smooth dust, no hot white pinpoints
    cx.fillStyle = g; cx.fillRect(0, 0, s, s);
    var t = new T.CanvasTexture(cv); if ("colorSpace" in t && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  })();
  var DSO_RAMP = [[0, [0.05, 0.03, 0.02]], [0.32, [0.40, 0.17, 0.09]], [0.58, [0.80, 0.42, 0.26]], [0.80, [0.90, 0.66, 0.38]], [1.0, [0.96, 0.80, 0.52]]];   // warm-LOCKED: the top is gold, never white — so additive stacking builds warm light, not silver clip
  function dsoRamp(t) {                          // the scene's warm ember ladder (coral #e0876a, gold #e8c37a)
    for (var i = 1; i < DSO_RAMP.length; i++) { if (t <= DSO_RAMP[i][0]) { var k = (t - DSO_RAMP[i - 1][0]) / (DSO_RAMP[i][0] - DSO_RAMP[i - 1][0]), a = DSO_RAMP[i - 1][1], b = DSO_RAMP[i][1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; } }
    return DSO_RAMP[4][1];
  }
  function dsoParticles(d, img) {
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    var cap = d.sample || 230, sc = Math.min(1, cap / Math.max(W, H));
    var sw = Math.max(2, Math.round(W * sc)), sh = Math.max(2, Math.round(H * sc));
    var cv = document.createElement("canvas"); cv.width = sw; cv.height = sh;
    var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, sw, sh);
    var px = cx.getImageData(0, 0, sw, sh).data, npx = sw * sh;
    var lumA = new Float32Array(npx), srt = new Float32Array(npx);
    for (var q = 0; q < npx; q++) { var l0 = (0.299 * px[q * 4] + 0.587 * px[q * 4 + 1] + 0.114 * px[q * 4 + 2]) / 255; lumA[q] = l0; srt[q] = l0; }
    Array.prototype.sort.call(srt, function (a, b) { return a - b; });
    var lo = srt[(npx * 0.40) | 0], hi = srt[Math.min(npx - 1, (npx * 0.995) | 0)], span = Math.max(0.001, hi - lo);  // per-image auto-levels
    var sd = d.seed; if (sd == null) { sd = 7; for (var si = 0; si < (d.id || "").length; si++) sd = (sd * 33 + d.id.charCodeAt(si)) >>> 0; }  // per-object dithering so no two clouds share a grain pattern
    var rng = gRng((sd * 131 + 7) >>> 0);
    var dens = d.density != null ? d.density : 0.72, gamma = d.gamma != null ? d.gamma : 0.72, bright = d.bright != null ? d.bright : 1.7;
    var Wu = (d.size || 160) * 1.5, Hu = Wu * (sh / sw), depth = (d.depth != null ? d.depth : 0.4) * Wu;  // ×1.5 world size: the clouds can't be flown into, so they must be big enough to read shape+colour from afar
    var P = [], C = [];
    for (var y = 0; y < sh; y++) for (var x = 0; x < sw; x++) {
      var ln = Math.max(0, Math.min(1, (lumA[y * sw + x] - lo) / span));            // normalised brightness
      var rx = (x / (sw - 1) - 0.5) * 2, ry = (y / (sh - 1) - 0.5) * 2, rad = Math.sqrt(rx * rx + ry * ry);
      var edge = 1 - Math.max(0, Math.min(1, (rad - 0.66) / 0.5));                  // dissolve the frame edge → an organic cloud, not a photo cut-out
      if (ln <= 0.02 || rng() > dens * Math.min(1, Math.pow(ln, 0.45) * 1.35) * edge) continue;  // flatter brightness-density so bright cores don't pile up and clip; still fades at the rim
      var wx = (x / (sw - 1) - 0.5) * Wu, wy = (0.5 - y / (sh - 1)) * Hu, wz = ((ln - 0.5) * 0.5 + (rng() - 0.5)) * depth;
      var col = dsoRamp(Math.pow(ln, gamma)), w = 0.5 + 0.5 * ln;                   // dim points for dim regions → contrast
      var cr = col[0] * bright * w, cg = col[1] * bright * w, cb = col[2] * bright * w, cmax = Math.max(cr, cg, cb);
      if (cmax > 1) { cr /= cmax; cg /= cmax; cb /= cmax; }                          // hue-preserving cap: a bright point stays saturated-warm, never washes to white
      P.push(wx, wy, wz);
      C.push(cr, cg, cb);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
    geo.setAttribute("color", new T.BufferAttribute(new Float32Array(C), 3));
    var m = new T.PointsMaterial({ map: DSO_SOFT, size: d.psize || 3.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: d.opacity != null ? d.opacity : 0.6, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    return new T.Points(geo, m);
  }
  var dsoPickGroup = new T.Group(); dsoPickGroup.name = "DeepSkyPicks"; belt.add(dsoPickGroup);
  (data.deepSky || []).forEach(function (d) {
    if (!d.tex) return;
    var ecl = raDecToEcl(d.raH, d.decDeg), world = eclVec(ecl.lon, ecl.lat, d.dist || 900);
    var Wu = (d.size || 160) * 1.5;                          // matches the world width in dsoParticles
    // an invisible sphere is the reliable click/hover target — Points raycasting is fickle
    var shell = new T.Mesh(new T.SphereGeometry(Wu * 0.62, 10, 8),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    shell.position.copy(world);
    shell.name = "DSOPick_" + d.id;
    shell.userData.nyePick = "dso_" + d.id;
    shell.userData.dsoViewDist = Wu * 1.35;                  // stand back far enough to frame the whole cloud
    shell.userData.dsoFocusMin = Math.max(24, Wu * 0.5);     // how close you may pull in to admire it
    shell.userData.dsoName = d.name || null;
    dsoPickGroup.add(shell);
    var img = new Image();
    img.onload = function () {
      try {
        var pts = dsoParticles(d, img);
        belt.add(pts);
        pts.position.copy(world);
        pts.updateWorldMatrix(true, false);       // so lookAt reads the true world position (incl. belt tilt)
        pts.lookAt(0, 0, 0);                       // the star-cloud's face turns toward the viewer's home; depth runs back
        if (d.roll) pts.rotateZ(d.roll * Math.PI / 180);
        pts.name = "DSO_" + d.id;
        pts.raycast = function () {};              // the invisible shell owns picking; the cloud points never intercept rays
        pts.renderOrder = -2;                      // the farthest backdrop, painted before the near sky
      } catch (e) { if (typeof window !== "undefined" && window.__space) window.__space.dsoError = String(e); }
    };
    img.src = "data/" + d.tex;
  });

  /* ---------------- the MILKY WAY, for real: a whole SPIRAL GALAXY that the solar system lives
     inside. The galactic centre sits ~880 units toward Sagittarius; the Sun (the scene origin)
     rides ~0.55 of the way out along the ORION ARM — so looking toward Sagittarius you see the
     luminous bulge and the crowded inner arms, and looking outward the disc thins to embers.
     Logarithmic-spiral arms + oblate bulge + patchy dust, warm ember palette, ~82k static points
     in one draw call. A local "bubble" is carved out so no galaxy star clutters the planets or
     the constellations that live nearer than the arm. Built once — zero per-frame cost. -------- */
  (function buildMilkyWayGalaxy() {
    var Rgal = 1600, N = mobile ? 34000 : 82000;
    var Rsun = 0.55 * Rgal, Rhole = 470;                                        // Sun's galactocentric radius; local bubble kept clear
    var gcE = raDecToEcl(17.7608, -28.94), npE = raDecToEcl(12.8571, 27.13);    // Sgr A* + galactic north pole
    var w = eclVec(npE.lon, npE.lat, 1).normalize();                            // disc normal (galactic pole)
    var uu = eclVec(gcE.lon, gcE.lat, 1); uu.addScaledVector(w, -uu.dot(w)).normalize();  // in-plane, toward the centre
    var vv = new T.Vector3().crossVectors(w, uu).normalize();
    var C = uu.clone().multiplyScalar(Rsun);                                    // the galactic centre in scene space
    var arms = 4, bsp = Math.tan(12 * Math.PI / 180), span = 6.6;              // pitch 12°
    var aSpiral = Rgal / Math.exp(bsp * span);                                  // arm inner radius (derived so arms reach the rim)
    var thetaSun = Math.log(Rsun / aSpiral) / bsp, phase0 = Math.PI - thetaSun; // phase arm 0 so it threads the Sun → the Orion Arm
    var rng = gRng(7717), fb = gFbm(4021, 8);
    var RAMP = [[0, [1.0, 0.93, 0.80]], [0.12, [1.0, 0.82, 0.50]], [0.34, [0.97, 0.58, 0.31]], [0.62, [0.82, 0.36, 0.20]], [1, [0.5, 0.20, 0.16]]];
    function ramp(f) { var i; for (i = 1; i < RAMP.length; i++) if (f <= RAMP[i][0]) break; if (i >= RAMP.length) i = RAMP.length - 1; var a = RAMP[i - 1], b = RAMP[i], k = (f - a[0]) / ((b[0] - a[0]) || 1); return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k]; }
    function G() { return rng() + rng() + rng() + rng() - 2; }                  // ~N(0, sd≈0.58)
    var P = [], Cc = [];
    function push(pt, f, bright) {
      if (pt.lengthSq() < Rhole * Rhole) return;                                // carve the local bubble
      var c = ramp(f < 0 ? 0 : f > 1 ? 1 : f);
      P.push(pt.x, pt.y, pt.z);
      Cc.push(Math.min(1, c[0] * bright), Math.min(1, c[1] * bright), Math.min(1, c[2] * bright));
    }
    function disk(rr, ang, h) { return C.clone().addScaledVector(uu, rr * Math.cos(ang)).addScaledVector(vv, rr * Math.sin(ang)).addScaledVector(w, h); }
    var armN = Math.round(N * 0.72), bulgeN = Math.round(N * 0.16), haloN = N - armN - bulgeN;
    // --- spiral arms ---
    for (var i = 0; i < armN; i++) {
      var arm = i % arms;
      var theta = Math.pow(rng(), 1.7) * span;                                  // density front-loaded toward the core
      var rC = aSpiral * Math.exp(bsp * theta);
      var ang = theta + phase0 + arm * (2 * Math.PI / arms);
      var rsig = 9 + 0.15 * rC;                                                 // arms fan out with radius → soft bands, not lines
      var x = rC * Math.cos(ang) + G() * rsig, z = rC * Math.sin(ang) + G() * rsig;
      var rr = Math.sqrt(x * x + z * z), a2 = Math.atan2(z, x);
      var zsig = (12 + 0.018 * rC) * (0.4 + 0.6 * Math.exp(-rC / (Rgal * 0.55)));
      var dust = 0.45 + 0.85 * fb(ang * 1.9, rC * 0.010);                       // large-scale patchiness → clouds & dark dust
      dust = dust < 0 ? 0 : dust > 1.25 ? 1.25 : dust;
      var bright = (0.20 + 0.80 * Math.pow(rng(), 2.2)) * Math.min(1.15, dust); // heavy dim tail so few points are hot
      push(disk(rr, a2, G() * zsig), rr / Rgal, bright * 0.9);
    }
    // --- central bulge (oblate, brightest, warmest) ---
    for (var j = 0; j < bulgeN; j++) {
      var br = Math.pow(rng(), 2.6) * Rgal * 0.19;
      var uax = rng() * 2 - 1, ph = rng() * Math.PI * 2, ss = Math.sqrt(1 - uax * uax);
      var bpt = C.clone().addScaledVector(uu, br * ss * Math.cos(ph)).addScaledVector(vv, br * ss * Math.sin(ph)).addScaledVector(w, br * uax * 0.55);
      push(bpt, 0.02 + 0.30 * (br / (Rgal * 0.19)), 0.5 + 0.6 * Math.pow(rng(), 1.6));
    }
    // --- faint inter-arm disc fill + a few globular clumps ---
    var clumpN = Math.round(haloN * 0.18), smoothN = haloN - clumpN;
    for (var k = 0; k < smoothN; k++) {
      var hr = Math.sqrt(rng()) * Rgal * 1.02, ha = rng() * Math.PI * 2;
      push(disk(hr, ha, G() * (24 + 0.02 * hr)), hr / Rgal, 0.10 + 0.16 * Math.pow(rng(), 2.4));
    }
    for (var cc = 0; cc < 7; cc++) {
      var clR = Rgal * (0.3 + rng() * 0.7), clA = rng() * Math.PI * 2, clH = (rng() * 2 - 1) * Rgal * 0.22, clS = Rgal * (0.02 + rng() * 0.03);
      var base = disk(clR, clA, clH);
      for (var m2 = 0; m2 < clumpN / 7; m2++) {
        var cp = base.clone().addScaledVector(uu, G() * clS).addScaledVector(vv, G() * clS).addScaledVector(w, G() * clS);
        push(cp, 0.6 + 0.3 * rng(), 0.28 + 0.3 * Math.pow(rng(), 2));
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(Cc), 3));
    var m = new T.PointsMaterial({ map: DSO_SOFT, size: mobile ? 2.4 : 3.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    var pts = new T.Points(g, m); pts.name = "MilkyWayGalaxy"; pts.renderOrder = -4; pts.frustumCulled = false;
    belt.add(pts);
  })();

  /* ---------------- constellation names: IN-SCENE Songti sprites (same craft as the 干支 glyphs) ---------------- */
  function nameTexture(zh, en, key, loc) {
    var cv = document.createElement("canvas"); cv.width = 512; cv.height = 224;
    var ctx = cv.getContext("2d"); ctx.clearRect(0, 0, 512, 224);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (loc === "zh") {
      ctx.fillStyle = key ? "rgba(236,147,118,0.98)" : "rgba(216,204,186,0.85)";
      ctx.font = (key ? "600 " : "500 ") + '76px "Songti SC","STSong","Noto Serif SC",serif';
      ctx.fillText(zh, 256, 112);
    } else {
      ctx.fillStyle = key ? "rgba(236,147,118,0.98)" : "rgba(216,204,186,0.85)";
      ctx.font = (key ? "600 " : "500 ") + '54px "Newsreader",Georgia,serif';
      ctx.fillText(en.toUpperCase(), 256, 112);
    }
    var tx = new T.CanvasTexture(cv);
    if ("colorSpace" in tx && T.SRGBColorSpace) tx.colorSpace = T.SRGBColorSpace;
    return tx;
  }
  function makeNameSprite(zh, en, key, loc) {
    var zhTex = nameTexture(zh, en, key, "zh"), enTex = nameTexture(zh, en, key, "en");
    var m = new T.SpriteMaterial({ map: loc === "zh" ? zhTex : enTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.NormalBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    var sp = new T.Sprite(m);
    var sc = key ? 48 : 31;
    sp.scale.set(sc, sc * 224 / 512, 1);
    sp.userData.shownOpacity = key ? 1.0 : 0.85;
    sp.userData.zhTex = zhTex; sp.userData.enTex = enTex;
    return sp;
  }
  function pageLocale() {
    try { return document.documentElement.className.indexOf("locale-zh") >= 0 ? "zh" : "en"; } catch (e) { return "en"; }
  }
  var nameSprites = [];   // nameplates retired by decree: the sky is unlabeled,
                          // like the Sun and Moon themselves (hover tooltips on
                          // work-stars remain — they are the knowledge graph)
  /* soft halos behind the stars that carry weight (data-nodes + the two natal figures) */
  (function () {
    stars.forEach(function (st) {
      var key = cons[st.conIdx].loadBearing;
      if (!st.node && st.importance < 0.7) return;      // every figure vertex glows
      var m = new T.SpriteMaterial({ map: o.tex, transparent: true, opacity: st.node ? 0.62 : (key ? 0.48 : 0.38), depthWrite: false, depthTest: true, blending: T.AdditiveBlending, fog: false });
      if ("toneMapped" in m) m.toneMapped = false;
      var h = new T.Sprite(m);
      var sc = st.node ? 12 : (key ? 9 : 7.5);
      h.scale.set(sc, sc, 1); h.position.copy(st.pos);
      belt.add(h);
    });
  })();

  /* ---------------- interaction: window raycaster (never touches #deep) ---------------- */
  var tip = null, raycaster = null, ndc = null, hovered = -1, onMove = null, onClick = null, pickFn = null;
  if (interactive) {
    raycaster = new T.Raycaster(); raycaster.params.Points.threshold = mobile ? 14 : 11;
    ndc = new T.Vector2();
    tip = document.createElement("div"); tip.className = "natal-tip"; tip.setAttribute("role", "status");
    tip.style.cssText = "position:fixed;pointer-events:none;z-index:5;opacity:0;transition:opacity .18s ease;transform:translate(12px,12px);max-width:280px;";
    (document.querySelector(".content") || document.body).appendChild(tip);

    pickFn = pick;
    function pick(cx, cy) {
      ndc.x = (cx / innerWidth) * 2 - 1; ndc.y = -(cy / innerHeight) * 2 + 1;
      raycaster.setFromCamera(ndc, o.camera);
      var hits = raycaster.intersectObject(starPoints, false);
      var nodeIdx = -1, con = -1;
      if (hits.length) {
        con = (starConIdx[hits[0].index] != null) ? starConIdx[hits[0].index] : -1;
        for (var i = 0; i < hits.length; i++) { if (nodeIndex[hits[i].index]) { nodeIdx = hits[i].index; break; } }
      }
      return { node: nodeIdx, con: con };
    }
    onMove = function (e) {
      if (!group.visible) { hoverCon = -1; return; }
      var pk = pick(e.clientX, e.clientY);
      hoverCon = pk.con;                                  // hovering a constellation reveals ONLY its name
      var idx = pk.node;
      if (idx !== hovered) {
        hovered = idx;
        if (idx >= 0) {
          var nd = nodeIndex[idx].node;
          tip.innerHTML = '<div class="natal-tip__t"><span class="i18n-en">' + nd.title.en + '</span><span class="i18n-zh">' + nd.title.zh + '</span></div>' +
            (nd.role ? '<div class="natal-tip__r">' + nd.role + '</div>' : "");
          tip.style.opacity = "1";   /* the canvas owns the cursor (space.js) */
          bloom(nodeIndex[idx].pos);
        } else { tip.style.opacity = "0"; }
      }
      if (idx >= 0) { tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; }
    };
    onClick = function (e) {
      var pk2 = pick(e.clientX, e.clientY);
      var idx = pk2.node;
      if (idx < 0) {
        // constellation body (not a work-star) → the sign takes the pivot;
        // true void → the host may clear any selection
        if (pk2.con >= 0 && conClickCb) conClickCb(cons[pk2.con].id);
        else if (nodeClickCb) nodeClickCb(null);
        return;
      }
      var nd = nodeIndex[idx].node;
      if (nodeClickCb) {
        // FIRST CLICK NEVER NAVIGATES — the host focuses the star and offers the door
        nodeClickCb({ id: nd.id, href: nd.href || "",
          titleEn: nd.title && nd.title.en || "", titleZh: nd.title && nd.title.zh || "",
          world: belt.localToWorld(nodeIndex[idx].pos.clone()) });
      } else if (nd.href) { location.href = nd.href; }
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("click", onClick, { passive: true });
  }

  // transient hover bloom (a brief brighter sprite at the node)
  var bloomSprite = null;
  if (interactive) {
    var bm = new T.SpriteMaterial({ map: o.tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in bm) bm.toneMapped = false;
    bloomSprite = new T.Sprite(bm); bloomSprite.scale.set(26, 26, 1); bloomSprite.visible = false;
    belt.add(bloomSprite);
  }
  var bloomT = 0;
  function bloom(p) { if (!bloomSprite) return; bloomSprite.position.copy(p); bloomSprite.visible = true; bloomT = 1.0; }

  /* ---------------- labels projection + housekeeping per frame ---------------- */
  function isLit(ci) { return !!hlSet[cons[ci].id] || hoverCon === ci; }
  function updateLabels() {
    for (var ci = 0; ci < nameSprites.length; ci++) {
      var sp = nameSprites[ci]; if (!sp) continue;
      var want = isLit(ci) ? sp.userData.shownOpacity : 0;
      sp.material.opacity += (want - sp.material.opacity) * 0.16;
    }
  }

  /* ---------------- lifecycle ---------------- */
  var t0 = null;
  function lineOpacities(sec) {
    // entrance pulse: the constellations announce themselves, then settle
    if (t0 === null) t0 = sec;
    var age = sec - t0;
    var pulse = age < 9 ? 1 + 0.8 * Math.max(0, 1 - age / 9) : 1;
    for (var ci = 0; ci < lineEntries.length; ci++) {
      var e = lineEntries[ci]; if (!e) continue;
      var hl = isLit(ci) ? 1.9 : 1;
      e.mat.opacity = Math.min(1.0, e.base * (isDark ? 1 : 1.18) * pulse * hl);
      if (e.glowMat) e.glowMat.opacity = Math.min(0.68, e.base * 0.42 * pulse * hl);
    }
  }
  var api = {
    group: group,
    starPoints: starPoints,
    tick: function (sec) {
      uniforms.uTime.value = sec;
      lineOpacities(sec);
      if (bloomSprite && bloomT > 0) { bloomT = Math.max(0, bloomT - 0.045); bloomSprite.material.opacity = bloomT * 0.7; if (bloomT === 0) bloomSprite.visible = false; }
      updateLabels();
    },
    applyTheme: function (dark) {
      isDark = dark;
      var bl = dark ? T.AdditiveBlending : T.NormalBlending;
      starMat.blending = bl; starMat.needsUpdate = true;
      for (var i = 0; i < lineEntries.length; i++) { var e = lineEntries[i]; if (!e) continue; e.mat.blending = bl; e.mat.needsUpdate = true; if (e.glowMat) { e.glowMat.blending = bl; e.glowMat.needsUpdate = true; } }
    },
    highlight: function (id, on) {
      if (lineByCon[id] == null) return;
      hlSet[id] = !!on;
      var ci = lineByCon[id];
      if (on && conCentroid[ci]) bloom(conCentroid[ci]);
    },
    group: group,
    bodyGroup: bodyGroup,
    dsoPicks: dsoPickGroup,
    getConCentroid: function (id) {
      var ci = lineByCon[id]; if (ci == null || !conCentroid[ci]) return null;
      return belt.localToWorld(conCentroid[ci].clone());
    },
    onConstellationClick: function (cb) { conClickCb = cb; },
    onNodeClick: function (cb) { nodeClickCb = cb; },
    setVisible: function (v) {
      group.visible = !!v;
      if (!v) { hoverCon = -1; if (tip) { tip.style.opacity = "0"; hovered = -1; } }
    },
    // does the pointer sit over a clickable star or constellation? (for the host's cursor)
    isOverInteractive: function (x, y) { if (!group.visible || !pickFn) return false; var p = pickFn(x, y); return p.node >= 0 || p.con >= 0; },
    // language of the in-scene nameplates follows the page locale (EN mode shows no Chinese)
    setLocale: function (loc) {
      for (var i = 0; i < nameSprites.length; i++) {
        var sp = nameSprites[i]; if (!sp) continue;
        sp.material.map = (loc === "zh") ? sp.userData.zhTex : sp.userData.enTex;
        sp.material.needsUpdate = true;
      }
    },
    // world-space direction (from the sky's own center) toward a planet glyph — for aligning the orrery
    getPlanetDir: function (id) {
      for (var i = 0; i < planetSprites.length; i++) {
        if (planetSprites[i].userData.planet === id) {
          var pw = planetSprites[i].getWorldPosition(new T.Vector3());
          var gw = group.getWorldPosition(new T.Vector3());
          return pw.sub(gw).normalize();
        }
      }
      return null;
    },
    // live tuning levers (for judging on the real machine)
    setLineOpacity: function (v) { for (var i = 0; i < lineEntries.length; i++) { var e = lineEntries[i]; if (e) e.base = cons[i].loadBearing ? v : v * 0.48; } },
    setStarScale: function (v) { uniforms.uRefDepth.value = 840 * v; },
    stats: { stars: N, segments: totalSegs, dataNodes: nodeIndex.filter(Boolean).length, planets: planetSprites.length, constellations: cons.length },
    dispose: function () {
      if (onMove) removeEventListener("pointermove", onMove);
      if (onClick) removeEventListener("click", onClick);
      if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
      (o.group || scene).remove(group);
      geo.dispose(); starMat.dispose();
      for (var i = 0; i < lineEntries.length; i++) { var e = lineEntries[i]; if (e) { e.geo.dispose(); e.mat.dispose(); if (e.glowMat) e.glowMat.dispose(); } }
      planetSprites.forEach(function (s) { if (!s.material) return; if (s.material.map) s.material.map.dispose(); s.material.dispose(); });
    }
  };
  return api;
}
