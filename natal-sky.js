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
  var conNear = [], conFar = [], conDir = [];    // per-constellation framing (for navigation): nearest/farthest star depth + mean sightline direction
  var conPickGroup = new T.Group(); conPickGroup.name = "ConstellationPicks"; belt.add(conPickGroup);   // generous invisible click targets so a whole figure is easy to grab
  cons.forEach(function (c, ci) {
    var ecl = c.stars.map(function (s) { return raDecToEcl(s.raH, s.decDeg); });
    // TRUE SKY POSITIONS — no more re-seating onto even 30° sign cells. Each star keeps its REAL
    // direction (lon, lat), so the zodiac no longer forms an artificial flat ring; it scatters along
    // the true ecliptic band. The Sun's sign is its birth ECLIPTIC LONGITUDE (a coordinate fact),
    // wholly independent of where the constellation art sits — so nothing astrological is lost.
    var nodeByStar = {};
    c.dataNodes.forEach(function (n) { nodeByStar[n.starIndex] = n; });
    var inFigure = {};
    c.figureLines.forEach(function (seg) { inFigure[seg[0]] = 1; inFigure[seg[1]] = 1; });
    var centroid = new T.Vector3(), dirSum = new T.Vector3(), near = 1e9, far = 0;
    c._starPos = [];
    // VOLUMETRIC BUT READABLE: each CONSTELLATION sits at its own distance (450–3150, scattered wide → no
    // shell, no flat ring), while its OWN stars stay at a similar depth (±18%) so the figure holds its
    // shape and still connects into the recognisable pattern from Earth. (Full per-star true distances
    // shears the lines into unreadable depth-streaks from anywhere but the exact origin — this keeps both.)
    var conBase = 1200 * Math.pow(4.2, hash(ci * 977 + 31));                    // each constellation is OUT in the deep star field (1200–5000, light-years away, NOT a shell around the solar system), scattered among the background stars, the galaxy and reaching toward the nebulae — so the whole space is one continuous star-filled volume and nothing is abrupt. (Angular size from Earth is unchanged by distance — the figure looks the same, just genuinely far and with less parallax shear.)
    ecl.forEach(function (e, si) {
      var dist = conBase * (0.94 + 0.12 * hash(ci * 131 + si + 7));             // its stars within ±6% depth → the figure lies nearly flat to the sightline and reads cleanly (no receding beams)
      var pos = eclVec(e.lon, e.lat, dist);
      c._starPos[si] = pos;
      centroid.add(pos); dirSum.add(pos.clone().normalize());
      if (dist < near) near = dist; if (dist > far) far = dist;
      var node = nodeByStar[si] || null;
      var importance = node ? 1.0 : (inFigure[si] ? 0.7 : 0.35);
      stars.push({ pos: pos, mag: c.stars[si].mag, importance: importance, conIdx: ci, node: node });
    });
    conCentroid[ci] = centroid.multiplyScalar(1 / (ecl.length || 1));
    conDir[ci] = dirSum.clone().normalize(); conNear[ci] = near; conFar[ci] = far;
    // a generous invisible pick sphere covering the whole figure → clicking anywhere over the
    // constellation grabs it (the tiny deep star-points are far too small to raycast reliably)
    var bR = 0;
    for (var bi = 0; bi < c._starPos.length; bi++) { var bd = c._starPos[bi].distanceTo(conCentroid[ci]); if (bd > bR) bR = bd; }
    bR = Math.max(bR * 1.15, conFar[ci] * 0.14);
    var pshell = new T.Mesh(new T.SphereGeometry(bR, 12, 10), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    pshell.position.copy(conCentroid[ci]); pshell.name = "ConPick_" + c.id; pshell.userData.nyePick = "con_" + c.id;
    conPickGroup.add(pshell);
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
    aSize[i] = lerp(2.4, 8.0, w) + (st.importance === 1.0 ? 3.0 : 0) + (st.importance >= 0.7 ? 3.2 : 0) + (keyCon && st.importance >= 0.7 ? 2.0 : 0);   // figure stars stand out boldly
    aAlpha[i] = Math.min(1.0, lerp(0.6, 1.0, w) * (st.importance >= 0.7 ? 1.25 : 1.0) * (keyCon ? 1.12 : 1.0));
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
    uMaxPointSize: { value: mobile ? 7.0 : 10.0 }, uRefDepth: { value: 2600.0 }, // ref-depth matched to the deep-field constellation distances (1200–5000) so the far figure stars keep a natural, visible size
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
      var Dseg = Math.max(1, sg.a.clone().add(sg.b).multiplyScalar(0.5).length());
      // spacing scales with the segment's DISTANCE → constant SCREEN-space dot density at ANY depth, so a
      // far-scattered constellation is a delicate sparse chain, never a thick beam of piled-up dots
      var n = Math.max(4, Math.min(160, Math.round(L / Dseg * (c.loadBearing ? 264 : 210))));
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
    var base = c.loadBearing ? 0.85 : 0.72;   // BRIGHT, unmistakable figure-lines (now genuine deep-field constellations — they should read boldly); uiTick multiplies this base each frame
    var prx = Math.min((typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1, mobile ? 1.5 : 2);
    var mat = new T.PointsMaterial({
      map: o.tex, color: c.loadBearing ? 0xffc79a : 0xf6b088, size: (c.loadBearing ? 8.4 : 6.8) * prx, sizeAttenuation: false,
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
    // A VOLUMETRIC point-cloud nebula: the photo is rejection-sampled by brightness so the SHAPE reads
    // (recognizable), each point is given real 3-D DEPTH from a coherent noise field + shells + jitter
    // (so orbiting reveals parallax — not a flat sticker), colour is hue-normalized + brightness-capped
    // (so additive stacking keeps its hue, not white), and a soft glow underlay binds it into gas.
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    var Wu = (d.size || 160) * 1.8 * (d._sizeScale || 1), Hu = Wu * (H / W), Zu = 0.5 * Wu;   // world size AFTER the true-scale shrink (in-galaxy nebulae are tiny vs the 2600-unit galaxy); real depth so it never foreshortens to a line when you orbit
    var sd = d.seed; if (sd == null) { sd = 7; for (var si = 0; si < (d.id || "").length; si++) sd = (sd * 33 + d.id.charCodeAt(si)) >>> 0; }
    var rng = gRng((sd * 131 + 7) >>> 0), zfb = gFbm((sd * 17 + 3) >>> 0, 8), cfb = gFbm((sd * 29 + 5) >>> 0, 8);
    var wr = 300, sc = Math.min(1, wr / Math.max(W, H));
    var sw = Math.max(4, Math.round(W * sc)), sh = Math.max(4, Math.round(H * sc));
    var cv = document.createElement("canvas"); cv.width = sw; cv.height = sh;
    var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, sw, sh);
    var px = cx.getImageData(0, 0, sw, sh).data, np = sw * sh;
    // luminance + brightness centroid (for the vignette so the frame edge dissolves)
    var lum = new Float32Array(np), cbx = 0, cby = 0, lsum = 0;
    for (var q = 0; q < np; q++) { var L = (0.2126 * px[q * 4] + 0.7152 * px[q * 4 + 1] + 0.0722 * px[q * 4 + 2]) / 255; lum[q] = L; cbx += (q % sw) * L; cby += ((q / sw) | 0) * L; lsum += L; }
    cbx /= (lsum || 1); cby /= (lsum || 1);
    // placement weight: brightness^gamma (dusty spread), black-point cut (dust lanes empty), organic clumping, vignette
    var wgt = new Float32Array(np), wmax = 1e-4, vigR = Math.max(sw, sh) * 0.62;
    for (var q2 = 0; q2 < np; q2++) {
      var Lv = lum[q2]; if (Lv < 0.055) { wgt[q2] = 0; continue; }
      var qx = q2 % sw, qy = (q2 / sw) | 0, dcx = (qx - cbx) / vigR, dcy = (qy - cby) / vigR, dc = Math.sqrt(dcx * dcx + dcy * dcy);
      var vig = 1 - Math.max(0, Math.min(1, (dc - 0.45) / 0.7));
      var clump = 0.45 + 0.75 * cfb(qx * 0.09, qy * 0.09);
      var wv = Math.pow(Lv, 0.62) * vig * clump; wgt[q2] = wv; if (wv > wmax) wmax = wv;
    }
    for (var q3 = 0; q3 < np; q3++) wgt[q3] /= wmax;
    var lsort = Float32Array.from(lum); Array.prototype.sort.call(lsort, function (a, b) { return a - b; });
    var lLo = lsort[(np * 0.35) | 0], lHi = lsort[Math.min(np - 1, (np * 0.99) | 0)], lSpan = Math.max(0.001, lHi - lLo);   // auto-levels — the photo's own contrast curve, now applied to the PARTICLES so bright cores blaze and faint gas stays dim (the beauty lives in the grain, not a flat overlay)
    var N = mobile ? 9000 : 15000, PC = [], CC = [], GP = [], GC = [], placed = 0, guard = 0, lim = N * 45;   // fewer grain particles (the 3-D relief mesh + glow now carry the read) → lighter, less stutter
    while (placed < N && guard++ < lim) {
      var xi = (rng() * sw) | 0, yi = (rng() * sh) | 0, k = yi * sw + xi;
      if (rng() > wgt[k]) continue;
      var u = (xi + rng()) / sw, v = (yi + rng()) / sh;
      var x = (u - 0.5) * Wu, y = (0.5 - v) * Hu;
      var z = (zfb(x * 0.02, y * 0.02) * 2 - 1) * Zu * 0.6 + (rng() + rng() - 1) * Zu * 0.5 + (rng() - 0.5) * Zu * 0.14;  // a real 3-D VOLUME wrapping the recognisable image plane
      x += (rng() - 0.5) * Wu * 0.02; y += (rng() - 0.5) * Wu * 0.02;
      var i4 = k * 4, r = px[i4] / 255, g = px[i4 + 1] / 255, b = px[i4 + 2] / 255, av = (r + g + b) / 3, sB = 1.5;
      r = Math.max(0, av + (r - av) * sB); g = Math.max(0, av + (g - av) * sB); b = Math.max(0, av + (b - av) * sB);   // vivid saturation lift — recover the photo's rich colour
      var mxc = Math.max(r, g, b, 1e-3), Lstr = Math.max(0, Math.min(1, (lum[k] - lLo) / lSpan)), depthT = Math.max(0, Math.min(1, z / Zu * 0.45 + 0.5));
      var bright = Math.min(0.94, 0.24 + 1.05 * Lstr) * (0.7 + 0.3 * depthT);       // contrast-stretched: bright cores blaze, faint gas dim + far side dimmer → the photo's beauty, carried BY the particles
      var jt = 0.88 + 0.24 * rng();
      PC.push(x, y, z); CC.push((r / mxc) * bright * jt, (g / mxc) * bright * jt, (b / mxc) * bright * jt);  // hue kept
      if (rng() < 0.55) { GP.push(x, y, z); GC.push((r / mxc) * bright * 0.95, (g / mxc) * bright * 0.95, (b / mxc) * bright * 0.95); }   // over HALF also feed the lush glow → a continuous, beautiful nebula, not sparse dots
      placed++;
    }
    var grp = new T.Group();
    // (RECOGNISABLE) the nebula's REAL photo — contrast-stretched + colour-lifted + radially masked — as a
    // WORLD-ORIENTED plane embedded at the middle of the particle volume (NOT a camera-facing billboard).
    // Because it's world-fixed like the grain, image + particles TURN TOGETHER when you orbit — they can
    // never fall out of sync (that was the disharmony). You arrive face-on and read WHAT it is; the volume
    // wraps it in real 3-D grain. A "3-D sticker" that actually rotates.
    (function () {
      var cap = 360, sc2 = Math.min(1, cap / Math.max(W, H));
      var sw2 = Math.max(2, Math.round(W * sc2)), sh2 = Math.max(2, Math.round(H * sc2));
      var cv2 = document.createElement("canvas"); cv2.width = sw2; cv2.height = sh2;
      var cx2 = cv2.getContext("2d"); cx2.drawImage(img, 0, 0, sw2, sh2);
      var id2 = cx2.getImageData(0, 0, sw2, sh2), p2 = id2.data, npx2 = sw2 * sh2, srt = new Float32Array(npx2);
      for (var q2 = 0; q2 < npx2; q2++) srt[q2] = (0.299 * p2[q2 * 4] + 0.587 * p2[q2 * 4 + 1] + 0.114 * p2[q2 * 4 + 2]) / 255;
      Array.prototype.sort.call(srt, function (a, b) { return a - b; });
      var lo2 = srt[(npx2 * 0.35) | 0], hi2 = srt[Math.min(npx2 - 1, (npx2 * 0.99) | 0)], span2 = Math.max(0.001, hi2 - lo2);
      for (var yy = 0; yy < sh2; yy++) for (var xx = 0; xx < sw2; xx++) {
        var ii = (yy * sw2 + xx) * 4, rr2 = p2[ii] / 255, gg2 = p2[ii + 1] / 255, bb2 = p2[ii + 2] / 255, avg2 = (rr2 + gg2 + bb2) / 3, sbb = 1.55;
        rr2 = Math.max(0, Math.min(1, avg2 + (rr2 - avg2) * sbb)); gg2 = Math.max(0, Math.min(1, avg2 + (gg2 - avg2) * sbb)); bb2 = Math.max(0, Math.min(1, avg2 + (bb2 - avg2) * sbb));
        var lm2 = ((0.299 * rr2 + 0.587 * gg2 + 0.114 * bb2) - lo2) / span2; lm2 = lm2 < 0 ? 0 : lm2 > 1 ? 1 : lm2;
        var boost2 = 0.35 + 1.15 * lm2;
        p2[ii] = Math.min(255, rr2 * 255 * boost2); p2[ii + 1] = Math.min(255, gg2 * 255 * boost2); p2[ii + 2] = Math.min(255, bb2 * 255 * boost2);
        var rx = (xx / (sw2 - 1) - 0.5) * 2, ry = (yy / (sh2 - 1) - 0.5) * 2, rad2 = Math.sqrt(rx * rx + ry * ry);
        p2[ii + 3] = 255 * (1 - Math.max(0, Math.min(1, (rad2 - 0.56) / 0.56)));
      }
      cx2.putImageData(id2, 0, 0);
      var tex = new T.CanvasTexture(cv2); if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      var sm = new T.MeshBasicMaterial({ map: tex, blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide, opacity: d.opacity != null ? d.opacity : 0.8, fog: false });
      if ("toneMapped" in sm) sm.toneMapped = false;
      // a 3-D RELIEF, not a flat sticker: subdivide the plane and push each vertex forward by the photo's
      // local brightness → the bright nebula BULGES toward you into a real 3-D cloud, the dark gas recedes.
      // Recognisable (it IS the photo) AND three-dimensional AND world-fixed → it turns WITH the particle volume.
      var SEG = 48, pgeo = new T.PlaneGeometry(Wu, Hu, SEG, SEG), pa = pgeo.attributes.position;
      var Zr = Zu * 1.2, zfb2 = gFbm((sd * 23 + 9) >>> 0, 8);
      for (var vi = 0; vi < pa.count; vi++) {
        var vx = pa.getX(vi), vy = pa.getY(vi);
        var uu2 = Math.max(0, Math.min(1, vx / Wu + 0.5)), vv2 = Math.max(0, Math.min(1, 0.5 - vy / Hu));
        // a SMOOTH cloud relief: a soft dome (the core bulges toward you) + low-frequency rolling. NO sharp
        // per-pixel steps (those shattered the mesh into shards). The image still reads; the FORM is 3-D.
        var rc = Math.min(1, ((uu2 - 0.5) * (uu2 - 0.5) + (vv2 - 0.5) * (vv2 - 0.5)) * 4);   // 0 centre → 1 rim
        pa.setZ(vi, (1 - rc * rc) * Zr * 0.85 + (zfb2(uu2 * 2.2, vv2 * 2.2) * 2 - 1) * Zr * 0.35);
      }
      pa.needsUpdate = true;
      var face = new T.Mesh(pgeo, sm); face.renderOrder = -1; grp.add(face);
    })();
    var gg = new T.BufferGeometry();
    gg.setAttribute("position", new T.BufferAttribute(new Float32Array(GP), 3));
    gg.setAttribute("color", new T.BufferAttribute(new Float32Array(GC), 3));
    var gm = new T.PointsMaterial({ map: DSO_SOFT, size: (d.psize || 2.7) * 3.8, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in gm) gm.toneMapped = false; grp.add(new T.Points(gg, gm));
    var cg2 = new T.BufferGeometry();
    cg2.setAttribute("position", new T.BufferAttribute(new Float32Array(PC), 3));
    cg2.setAttribute("color", new T.BufferAttribute(new Float32Array(CC), 3));
    var cm = new T.PointsMaterial({ map: DSO_SOFT, size: d.psize || 2.7, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.66, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in cm) cm.toneMapped = false; grp.add(new T.Points(cg2, cm));
    return grp;
  }
  var dsoPickGroup = new T.Group(); dsoPickGroup.name = "DeepSkyPicks"; belt.add(dsoPickGroup);
  var _dsoCount = (data.deepSky || []).length;

  /* ---- GALACTIC FRAME at MODULE scope (pure function of two RA/Dec constants) so it exists at EAGER
     DSO-placement time AND the LAZY buildMilkyWayGalaxy reuses the SAME basis → a nebula placed now lands
     exactly where the galaxy's disc will be drawn later. No null-deref, no coordination race. ---- */
  var GAL_RGAL = 2600, GAL_RSUN = 0.52 * 2600, GAL_HSUN = 140;
  var _gcE = raDecToEcl(17.7608, -28.94), _npE = raDecToEcl(12.8571, 27.13);   // Sgr A*, galactic N pole
  var GAL_W = eclVec(_npE.lon, _npE.lat, 1).normalize();
  var GAL_UU = eclVec(_gcE.lon, _gcE.lat, 1); GAL_UU.addScaledVector(GAL_W, -GAL_UU.dot(GAL_W)).normalize();
  var GAL_VV = new T.Vector3().crossVectors(GAL_W, GAL_UU).normalize();
  var GAL_C = GAL_UU.clone().multiplyScalar(GAL_RSUN).addScaledVector(GAL_W, -GAL_HSUN);
  /* ---- TRUE-SCALE COMPRESSION: real distance (ly) → scene radius. In-galaxy nebulae (444–7500 ly) sit
     INSIDE the disc in true DIRECTION + true relative ORDER (log-compressed); the two extragalactic tiers
     land beyond the rim. Sun = scene origin, embedded in the disc. ---- */
  var GAL_RIM = GAL_RGAL;
  var LY_NEAR = 400, LY_FAR = 7600, R_NEAR = 0.10 * GAL_RIM, R_FAR = 0.60 * GAL_RIM;
  function nebulaSceneRadius(ly) {
    var t = Math.log(Math.max(LY_NEAR, Math.min(LY_FAR, ly)) / LY_NEAR) / Math.log(LY_FAR / LY_NEAR);
    return R_NEAR + (R_FAR - R_NEAR) * t;                 // 260 (Pleiades) … 1560 (Carina) from the Sun
  }
  var R_MAGELLANIC = 1.05 * GAL_RIM;                       // 2730 — satellite tier, just beyond the disc edge
  var R_ANDROMEDA = 2.2 * GAL_RIM;                         // 5720 — M31: the Local Group's OTHER great spiral (the LG tier is scaled around this anchor)

  /* ---- THE SUPERGALACTIC FRAME (module scope): the real plane that threads the Local Sheet →
     the Virgo/Local Supercluster disc → the Hydra–Centaurus spine of Laniakea. One shared basis
     means those three tiers are VISIBLY the same slab at growing scale — scientific continuity.
     SG north pole: RA 18.916h, Dec +15.7° (galactic l=47.37°, b=+6.32°). The Local Void lies
     toward +SG_W (supergalactic north); Virgo lies in-plane along +SG_U. ---- */
  var _sgpE = raDecToEcl(18.916, 15.709);
  var SG_W = eclVec(_sgpE.lon, _sgpE.lat, 1).normalize();               // plane normal (toward the Local Void)
  var _virE = raDecToEcl(12.44, 12.72);                                  // Virgo cluster (M87) — true direction
  var VIRGO_DIR = eclVec(_virE.lon, _virE.lat, 1).normalize();
  var SG_U = VIRGO_DIR.clone().addScaledVector(SG_W, -VIRGO_DIR.dot(SG_W)).normalize();   // in-plane, toward Virgo
  var SG_V = new T.Vector3().crossVectors(SG_W, SG_U).normalize();
  /* true sky directions of the great landmarks (verified: Norma/GA RA16.25h −60.95°, Shapley
     RA13.42h −31°, Perseus–Pisces RA1.83h +36°, Coma RA12.99h +27.98°, Hercules RA16.09h +17.75°) */
  function skyDir(raH, decDeg) { var e = raDecToEcl(raH, decDeg); return eclVec(e.lon, e.lat, 1).normalize(); }
  var DIR_GA = skyDir(16.25, -60.95), DIR_SHAPLEY = skyDir(13.42, -31.0), DIR_PP = skyDir(1.83, 36.0);
  var DIR_COMA = skyDir(12.99, 27.98), DIR_HERC = skyDir(16.09, 17.75);
  /* tier groups (built lazily; every fade is driven by window.CosmicLOD weights in tick) */
  var tierLG = null, tierSheet = null, tierVirgo = null, tierUniverse = null, quantumFoam = null, universeSpark = null;
  var _midBuilt = false, _uniBuilt = false;
  var _tierMats = { lg: [], sheet: [], virgo: [], lani: [], neighbors: [], web: [], obs: [], quant: [] };   // {m, base} pairs per tier — tick multiplies base×weight
  var _youAnchor = null;
  function regTier(key, mat, base) { _tierMats[key].push({ m: mat, base: (base != null ? base : mat.opacity) }); mat.opacity = 0; }
  var _tierPrx = Math.min((typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1, mobile ? 1.5 : 2);
  /* one shared soft-point cloud builder: positions+colors → a registered, weight-driven Points.
     Default: SCREEN-CONSTANT size (sizeAttenuation false) — world-scale tiers stay readable at camLenPeak. */
  function tierPoints(key, P, C, sizePx, opt) {
    opt = opt || {};
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(C), 3));
    var m = new T.PointsMaterial({
      map: DSO_SOFT, size: sizePx * _tierPrx, sizeAttenuation: opt.attenuate === true,
      vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
      blending: T.AdditiveBlending, fog: !!opt.fog
    });
    if ("toneMapped" in m) m.toneMapped = false;
    regTier(key, m, opt.base != null ? opt.base : 1);
    var pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = opt.order != null ? opt.order : -5;
    if (opt.name) pts.name = opt.name;
    return pts;
  }
  /* optional wide under-glow duplicate — reads as filaments / streamlines, not sparse dust */
  function tierGlow(key, P, C, sizePx, opt) {
    opt = opt || {};
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(C), 3));
    var m = new T.PointsMaterial({
      map: DSO_SOFT, size: sizePx * _tierPrx, sizeAttenuation: false,
      vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
      blending: T.AdditiveBlending, fog: !!opt.fog
    });
    if ("toneMapped" in m) m.toneMapped = false;
    regTier(key, m, opt.base != null ? opt.base : 0.42);
    var pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = (opt.order != null ? opt.order : -5) - 1;
    if (opt.name) pts.name = opt.name;
    return pts;
  }
  function buildYouAnchor() {
    if (_youAnchor) return;
    var cv = document.createElement("canvas"); cv.width = cv.height = 64;
    var g = cv.getContext("2d");
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 28);
    grd.addColorStop(0, "rgba(255,120,72,0.98)"); grd.addColorStop(0.45, "rgba(255,88,48,0.72)"); grd.addColorStop(1, "rgba(255,60,30,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "rgba(255,240,220,0.95)"; g.beginPath(); g.arc(32, 32, 4.5, 0, Math.PI * 2); g.fill();
    var tex = new T.CanvasTexture(cv);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    var sm = new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in sm) sm.toneMapped = false;
    _youAnchor = new T.Sprite(sm); _youAnchor.name = "YouAreHereAnchor";
    _youAnchor.scale.set(mobile ? 16 : 22, mobile ? 16 : 22, 1); _youAnchor.renderOrder = 12; _youAnchor.visible = false;
    belt.add(_youAnchor);
  }
  function gauss(rng) { return rng() + rng() + rng() + rng() - 2; }   // ~N(0, 0.58)

  (data.deepSky || []).forEach(function (d, idx) {
    if (!d.tex) return;
    // TRUE POSITION: real RA/Dec DIRECTION (no scatter) + a distance that is the real light-years,
    // log-compressed into the scene. In-galaxy nebulae land INSIDE the disc among the arm stars, in
    // true relative order (Pleiades nearest … Carina farthest); Andromeda gets its own far tier.
    var ecl = raDecToEcl(d.raH, d.decDeg);
    var dirU = eclVec(ecl.lon, ecl.lat, 1).normalize();
    var isExternal = (d.tier === "external");
    var world, sizeScale;
    if (isExternal) { world = dirU.clone().multiplyScalar(R_ANDROMEDA); sizeScale = 1.0; }   // its own galaxy, far past the rim
    else { world = dirU.clone().multiplyScalar(nebulaSceneRadius(d.ly || 2000)); sizeScale = 0.28; }   // inside the disc; tiny vs the galaxy → shrink render
    d._sizeScale = sizeScale;
    var Wu = (d.size || 160) * 1.8 * sizeScale;             // world width AFTER scaling (matches dsoParticles)
    // an invisible sphere is the reliable click/hover target — Points raycasting is fickle
    var shell = new T.Mesh(new T.SphereGeometry(Wu * 0.62, 10, 8),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    shell.position.copy(world);
    shell.name = "DSOPick_" + d.id;
    shell.userData.nyePick = "dso_" + d.id;
    shell.userData.dsoViewDist = Wu * 1.35;                  // stand back far enough to frame the whole cloud
    shell.userData.dsoFocusMin = Math.max(12, Wu * 0.5);     // how close you may pull in to admire it
    shell.userData.dsoName = d.name || null;
    if (isExternal) shell.userData.dsoFromInside = true;   // gaze OUT at Andromeda from the Milky Way → our galaxy stays behind the camera (no blown-out edge-on bar)
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

  /* ---------------- the deep-space STARFIELD: thousands of faint stars filling the whole sky in
     every direction and to great depth, so nothing floats in a void — the nebulae are nestled
     among stars, and the eye reads "we are deep inside a galaxy full of stars". Static, one draw. */
  (function buildStarfield() {
    var N = mobile ? 40000 : 78000, R0 = 110, R1 = 7200;                         // THE main star layer now (the old R=700 celestial-sphere shell is gone): a DENSE DEEP VOLUMETRIC field — ~80k stars filling ALL of space from close-in out past the far nebulae, so nothing floats in a void; the 30fps cap pays for the extra points
    var rng = gRng(3391), pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var uax = rng() * 2 - 1, ph = rng() * Math.PI * 2, ss = Math.sqrt(1 - uax * uax);
      var rr = R0 + (R1 - R0) * Math.pow(rng(), 0.6);                            // spread through a deep shell so the field has real depth
      pos[i * 3] = ss * Math.cos(ph) * rr; pos[i * 3 + 1] = uax * rr; pos[i * 3 + 2] = ss * Math.sin(ph) * rr;
      var b = 0.45 + 0.55 * Math.pow(rng(), 1.5);                               // a VISIBLE sky — high floor so even the faintest star reads, a good scatter of brighter ones; space is clearly populated, not empty
      // a REAL stellar-colour distribution (spectral classes): hot blue-white O/B/A, white F, yellow-white G,
      // orange K, red M — a true, subtly-coloured star field, not a wash of identical dots
      var ct = rng(), sr, sg, sb;
      if (ct < 0.14) { sr = 0.72; sg = 0.82; sb = 1.0; }        // hot blue-white
      else if (ct < 0.30) { sr = 0.86; sg = 0.91; sb = 1.0; }   // blue-white
      else if (ct < 0.62) { sr = 1.0; sg = 0.99; sb = 0.96; }   // white
      else if (ct < 0.82) { sr = 1.0; sg = 0.95; sb = 0.80; }   // yellow-white
      else if (ct < 0.94) { sr = 1.0; sg = 0.82; sb = 0.58; }   // orange
      else { sr = 1.0; sg = 0.68; sb = 0.52; }                  // red
      col[i * 3] = Math.min(1, b * sr); col[i * 3 + 1] = Math.min(1, b * sg); col[i * 3 + 2] = Math.min(1, b * sb);
    }
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("color", new T.BufferAttribute(col, 3));
    // a CRISP star sprite (hard white core + tight falloff). The shared ember-glow texture rendered stars as
    // dim translucent smudges — this makes them read as sharp bright points, so the field is actually VISIBLE.
    var stc = document.createElement("canvas"); stc.width = stc.height = 48;
    var stg = stc.getContext("2d"), stgr = stg.createRadialGradient(24, 24, 0, 24, 24, 24);
    stgr.addColorStop(0.0, "rgba(255,255,255,1)"); stgr.addColorStop(0.24, "rgba(255,255,255,0.92)");
    stgr.addColorStop(0.5, "rgba(255,244,224,0.3)"); stgr.addColorStop(1.0, "rgba(255,238,214,0)");
    stg.fillStyle = stgr; stg.fillRect(0, 0, 48, 48);
    var starTex = new T.CanvasTexture(stc); if ("colorSpace" in starTex && T.SRGBColorSpace) starTex.colorSpace = T.SRGBColorSpace;
    var m = new T.PointsMaterial({ map: starTex, size: mobile ? 2.6 : 3.1, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 1.0, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    var pts = new T.Points(g, m); pts.name = "Starfield"; pts.renderOrder = -5; pts.frustumCulled = false;
    belt.add(pts);
  })();

  /* ---------------- the MILKY WAY, for real: a whole SPIRAL GALAXY that the solar system lives
     inside. The galactic centre sits ~880 units toward Sagittarius; the Sun (the scene origin)
     rides ~0.55 of the way out along the ORION ARM — so looking toward Sagittarius you see the
     luminous bulge and the crowded inner arms, and looking outward the disc thins to embers.
     Logarithmic-spiral arms + oblate bulge + patchy dust, warm ember palette, ~82k static points
     in one draw call. A local "bubble" is carved out so no galaxy star clutters the planets or
     the constellations that live nearer than the arm. Built once — zero per-frame cost. -------- */
  var galacticCentre = null, galacticNormal = null, _bhSpin = [], _bhBB = [];    // exposed for the clickable black-hole nucleus; _bhBB = camera-facing Gargantua quads (billboarded + time-driven each tick)
  var _bbPQ = new T.Quaternion(), _bbCQ = new T.Quaternion(), _cosmicWeb = null, _laniakeaFlow = null;
  var _farBuilt = false, _webBuilt = false;   // LAZY-BY-SCALE flags: the galaxy/black-hole and the cosmic web are heavy (~118k + ~100k pts + a 2.3M-iteration web sampler); they build ONLY when the camera actually voyages out to their scale, never at the ground/whole-sky view
  function buildMilkyWayGalaxy() {
    var Rgal = GAL_RGAL, N = mobile ? 78000 : 118000;                          // reuse the MODULE-scope galactic frame so nebulae (placed eagerly) and this disc share ONE basis
    var Rsun = GAL_RSUN, Rin = 42, Rout = 150, hSun = GAL_HSUN;                 // Sun's galactocentric radius; the Orion ARM flows right THROUGH the solar system
    var w = GAL_W, uu = GAL_UU, vv = GAL_VV, C = GAL_C;                         // shared basis (see the GALACTIC FRAME block near the DSO loop)
    galacticCentre = C.clone(); galacticNormal = w.clone();                     // expose for the clickable nucleus
    var arms = 4, bsp = Math.tan(12 * Math.PI / 180), span = 6.6;              // pitch 12°
    var aSpiral = Rgal / Math.exp(bsp * span);                                  // arm inner radius (derived so arms reach the rim)
    var thetaSun = Math.log(Rsun / aSpiral) / bsp, phase0 = Math.PI - thetaSun; // phase arm 0 so it threads the Sun → the Orion Arm
    var rng = gRng(7717), fb = gFbm(4021, 8), fb2 = gFbm(88, 12);
    // the REAL Milky Way palette (astrophotography, not the over-processed blue web version): a warm GOLD
    // nucleus of old Population-II stars ("the colour of lions on the Serengeti") → tan → drifting cool →
    // faint blue rim. Blue lives ONLY in the young-star arms; the core must never be white.
    var RAMP = [[0, [1.0, 0.851, 0.627]], [0.08, [0.961, 0.753, 0.478]], [0.2, [0.91, 0.659, 0.376]], [0.35, [0.851, 0.659, 0.471]], [0.5, [0.784, 0.698, 0.604]], [0.65, [0.682, 0.706, 0.769]], [0.8, [0.624, 0.714, 0.839]], [1, [0.561, 0.659, 0.8]]];
    function ramp(f) { var i; for (i = 1; i < RAMP.length; i++) if (f <= RAMP[i][0]) break; if (i >= RAMP.length) i = RAMP.length - 1; var a = RAMP[i - 1], b = RAMP[i], k = (f - a[0]) / ((b[0] - a[0]) || 1); return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k]; }
    var COOL = [0.663, 0.769, 0.925], PINK = [0.91, 0.361, 0.541];               // young blue-white O/B arm stars; H-alpha magenta-red HII knots
    function G() { return rng() + rng() + rng() + rng() - 2; }                  // ~N(0, sd≈0.58)
    var P = [], Cc = [], GP = [], GC = [];                                       // star layer + a soft GLOW layer (large faint sprites → smooth luminosity)
    function push(pt, r, g2, b2, amp, glowC) {
      var dd = pt.lengthSq();
      if (dd < Rin * Rin) return;                                               // the immediate solar system stays clear
      if (dd < Rout * Rout && rng() > (Math.sqrt(dd) - Rin) / (Rout - Rin)) return;  // fade the galaxy IN gradually — no hard spherical shell
      var cr = r * amp, cg = g2 * amp, cb = b2 * amp, mx = Math.max(cr, cg, cb);
      if (mx > 1) { cr /= mx; cg /= mx; cb /= mx; }                              // hue-preserving cap: bright regions keep their hue, never a flat white
      P.push(pt.x, pt.y, pt.z); Cc.push(cr, cg, cb);
      if (glowC && rng() < glowC) { GP.push(pt.x, pt.y, pt.z); GC.push(cr, cg, cb); }  // a fraction also emit a big soft halo → smooth underglow
    }
    function disk(rr, ang, h) { return C.clone().addScaledVector(uu, rr * Math.cos(ang)).addScaledVector(vv, rr * Math.sin(ang)).addScaledVector(w, h); }
    var armN = Math.round(N * 0.68), bulgeN = Math.round(N * 0.12), haloN = Math.round(N * 0.12), knotN = N - armN - bulgeN - haloN;   // fewer, dimmer bulge points → the core no longer piles up into an additive white blob
    // --- spiral arms: a thick glowing river with a dust rift, warm→cool colour, blue young stars ---
    for (var i = 0; i < armN; i++) {
      var arm = i % arms;
      var theta = Math.pow(rng(), 1.7) * span;                                  // density front-loaded toward the core
      var rC = aSpiral * Math.exp(bsp * theta);
      var ang = theta + phase0 + arm * (2 * Math.PI / arms);
      var rsig = 7 + 0.10 * rC;                                                  // tighter transverse scatter → cleaner, more defined sweeping arms with darker inter-arm gaps
      var tgt = G(); tgt = (tgt < 0 ? -1 : 1) * Math.pow(Math.abs(tgt), 1.35);   // power-law tighten onto the arm ridge (most stars on the arm, a few in the halo skirt)
      var x = rC * Math.cos(ang) + tgt * rsig, z = rC * Math.sin(ang) + G() * rsig;
      var rr = Math.sqrt(x * x + z * z), a2 = Math.atan2(z, x), f = rr / Rgal;
      var zsig = (120 + 0.108 * rC) * (0.5 + 0.5 * Math.exp(-rC / (Rgal * 0.6)));  // 3× thicker disc — a deep, voluminous band, not a thin ribbon
      var h = G() * zsig;
      var dust = 0.22 + 1.0 * fb(ang * 1.8, rC * 0.009); dust = dust < 0 ? 0 : dust;
      var laneW = 22 + 0.012 * rC;                                                // dust rift scales with the thicker disc
      var lane = Math.exp(-(h * h) / (2 * laneW * laneW)) * (0.4 + 0.6 * fb2(ang * 2.2, rC * 0.02));
      if (rng() > 0.42 + 0.58 * (1 - lane)) continue;                            // drop points in the rift → a real dark gap
      var vert = 0.5 + 0.5 * Math.exp(-(h * h) / (2 * (zsig * 0.72) * (zsig * 0.72)));
      var c = ramp(f), cr = c[0], cg = c[1], cb = c[2];
      if (rng() < 0.24 * Math.min(1, f * 2.0)) { var tb = 0.5 + 0.5 * rng(); cr = cr * (1 - tb) + COOL[0] * tb; cg = cg * (1 - tb) + COOL[1] * tb; cb = cb * (1 - tb) + COOL[2] * tb; }  // young blue-white stars, more of them and bluer toward the outer arms
      // power-law brightness (heavy dim tail — most points barely glow, a few are bright) × a radial cap so the inner disc can't wash to white
      var amp = (0.1 + 0.72 * Math.pow(rng(), 2.5)) * Math.min(1.3, dust) * (1 - 0.7 * lane) * vert * (0.62 + 0.38 * Math.min(1, f * 2.2));
      push(disk(rr, a2, h), cr, cg, cb, amp, 0.08);
    }
    // --- central bulge: a COMPACT, round, luminous GOLD core (the realistic tight nucleus, not a
    //     sprawl that swallows the nearby nebulae); many glow points → a blazing centre ---
    for (var j = 0; j < bulgeN; j++) {
      var br = Math.pow(rng(), 1.9) * Rgal * 0.15;
      var uax = rng() * 2 - 1, ph = rng() * Math.PI * 2, ss = Math.sqrt(1 - uax * uax);
      var bpt = C.clone().addScaledVector(uu, br * ss * Math.cos(ph)).addScaledVector(vv, br * ss * Math.sin(ph)).addScaledVector(w, br * uax * 0.7);
      var bc = ramp(0.04 + 0.24 * (br / (Rgal * 0.15)));
      push(bpt, bc[0], bc[1], bc[2], 0.16 + 0.22 * Math.pow(rng(), 2.4), 0.09);  // a warm-gold core held well below white — capped brightness, sparse glow
    }
    // --- faint SMOOTH inter-arm haze so the arms float in a soft glow (no lumpy globular clusters —
    //     those read as ugly blobs strewn across the disc; the disc should be a smooth luminous field) ---
    for (var k = 0; k < haloN; k++) {
      var hr = Math.sqrt(rng()) * Rgal * 1.02, ha = rng() * Math.PI * 2, hc = ramp(hr / Rgal);
      push(disk(hr, ha, G() * (60 + 0.05 * hr)), hc[0], hc[1], hc[2], 0.08 + 0.14 * Math.pow(rng(), 2.4), 0.04);
    }
    // --- PINK HII star-forming knots along the arms: NATURAL complexes, not "20 uniform pink golf balls".
    //     Many small + a few big (power-law size AND richness), elongated + ragged with diffuse skirts,
    //     irregularly placed, blended at arm-level glow → real H-alpha regions, no artificial clumping. ---
    var nKnot = 90;
    for (var kn = 0; kn < nKnot; kn++) {
      var karm = (rng() < 0.85) ? (kn % arms) : ((kn + 1 + ((rng() * 2) | 0)) % arms);   // mostly on-arm, occasionally off → breaks the 4-fold regularity
      var kth = (0.15 + 0.8 * rng()) * span;                                             // pure-random θ → no string-of-pearls
      var krC = aSpiral * Math.exp(bsp * kth), kang = kth + phase0 + karm * (2 * Math.PI / arms);
      var kbase = disk(krC, kang, G() * 30);
      var ks = 12 + 70 * Math.pow(rng(), 2.4);                                            // power-law sizes: mostly small, a rare large complex
      var el = 1.6 + rng();                                                              // elongated along the arm, not a round ball
      var kCount = Math.max(8, Math.round((knotN / nKnot) * 3 * Math.pow(rng(), 2.2)));   // power-law richness: big knots rich, small ones wisps
      for (var mk = 0; mk < kCount; mk++) {
        var kp = kbase.clone().addScaledVector(uu, G() * ks * el).addScaledVector(vv, G() * ks / el).addScaledVector(w, G() * ks * 0.35);
        if (rng() < 0.25) kp.addScaledVector(uu, G() * ks * 1.8).addScaledVector(vv, G() * ks * 1.8);   // a sparse ragged skirt
        push(kp, PINK[0], PINK[1] * (0.8 + 0.3 * rng()), PINK[2] * (0.9 + 0.2 * rng()), (0.22 + 0.5 * Math.pow(rng(), 2.0)), 0.14);
      }
    }
    // --- COMPANION GALAXIES the Milky Way is devouring RIGHT NOW (real, ongoing mergers) ---
    // (a) the SAGITTARIUS DWARF — being tidally shredded this epoch: a small OLD-STAR core below the far side
    //     of the disc, trailing a great tidal STREAM that loops the galaxy in a near-polar orbit.
    var sgrC = C.clone().addScaledVector(uu, -0.62 * Rgal).addScaledVector(w, -0.3 * Rgal);   // out near the disc edge, only slightly below → a distinct blob, not hidden behind the disc
    for (var sg = 0; sg < 2400; sg++) {
      var sgr = Math.pow(rng(), 1.6) * 0.1 * Rgal, sgu = rng() * 2 - 1, sgp = rng() * Math.PI * 2, sgs = Math.sqrt(1 - sgu * sgu);
      var sgpt = sgrC.clone().addScaledVector(uu, sgr * sgs * Math.cos(sgp) * 1.6).addScaledVector(vv, sgr * sgs * Math.sin(sgp)).addScaledVector(w, sgr * sgu * 0.9);
      push(sgpt, 0.98, 0.82, 0.66, 0.34 + 0.36 * Math.pow(rng(), 2), 0.12);   // brighter old-star core so it's easy to pick out beside the disc
    }
    for (var ss = 0; ss < 4000; ss++) {                                        // the tidal stream — a bright polar great-loop of pulled-out stars wrapping the disc
      var phi = rng() * Math.PI * 2, loopR = Rgal * (0.78 + 0.4 * (0.5 + 0.5 * Math.cos(phi)));   // the loop wraps OUTSIDE the disc edge → a clear great ring around the galaxy
      var sp = C.clone().addScaledVector(uu, loopR * Math.cos(phi)).addScaledVector(w, loopR * Math.sin(phi) * 0.92).addScaledVector(vv, G() * (26 + 0.02 * loopR));
      sp.addScaledVector(uu, G() * 42).addScaledVector(w, G() * 42);
      push(sp, 0.94, 0.77, 0.61, (0.1 + 0.16 * Math.pow(rng(), 2)) * (0.45 + 0.55 * Math.abs(Math.sin(phi))), 0.05);
    }
    // (b) the MAGELLANIC CLOUDS — bright irregular satellite galaxies just off the disc: young BLUE stars +
    //     pink HII, trailing the faint Magellanic Stream the Milky Way is stripping from them.
    var lmc = C.clone().addScaledVector(vv, 1.05 * Rgal).addScaledVector(w, -0.32 * Rgal);   // just BEYOND the disc edge, off to the side → an obvious separate satellite galaxy
    for (var lm = 0; lm < 3400; lm++) {
      var lr = Math.pow(rng(), 1.4) * 0.13 * Rgal, lu = rng() * 2 - 1, lp = rng() * Math.PI * 2, lsn = Math.sqrt(1 - lu * lu);
      var lpt = lmc.clone().addScaledVector(uu, lr * lsn * Math.cos(lp) * 1.8).addScaledVector(vv, lr * lsn * Math.sin(lp)).addScaledVector(w, lr * lu * 0.6);
      if (rng() < 0.5) push(lpt, 0.74, 0.84, 1.0, 0.28 + 0.38 * Math.pow(rng(), 2), 0.14);   // young blue stars, brighter so the Cloud is unmistakable
      else if (rng() < 0.16) push(lpt, PINK[0], PINK[1], PINK[2], 0.4 + 0.36 * rng(), 0.32);
      else push(lpt, 0.95, 0.92, 0.88, 0.22 + 0.28 * Math.pow(rng(), 2), 0.12);
    }
    var smc = lmc.clone().addScaledVector(uu, -0.22 * Rgal).addScaledVector(vv, -0.07 * Rgal).addScaledVector(w, -0.05 * Rgal);
    for (var sm = 0; sm < 1300; sm++) {
      var mr = Math.pow(rng(), 1.4) * 0.075 * Rgal, mu = rng() * 2 - 1, mp = rng() * Math.PI * 2, msn = Math.sqrt(1 - mu * mu);
      var mpt = smc.clone().addScaledVector(uu, mr * msn * Math.cos(mp)).addScaledVector(vv, mr * msn * Math.sin(mp) * 1.4).addScaledVector(w, mr * mu * 0.6);
      push(mpt, rng() < 0.45 ? 0.74 : 0.92, 0.83, rng() < 0.45 ? 1.0 : 0.9, 0.16 + 0.26 * Math.pow(rng(), 2), 0.1);
    }
    for (var mb = 0; mb < 900; mb++) {                                         // the Magellanic Stream — a faint gas arc trailing the Clouds
      var tb = rng(), bp = lmc.clone().lerp(smc, tb).addScaledVector(vv, (0.1 + 0.6 * tb) * Rgal * 0.5).addScaledVector(w, G() * 60).addScaledVector(uu, G() * 60);
      push(bp, 0.7, 0.85, 0.95, 0.03 + 0.05 * Math.pow(rng(), 2), 0.0);
    }
    // --- make each companion a hover-nameable, clickable landmark (same interaction model as every nebula &
    //     the black hole): an invisible pick sphere at its centre → hover shows the name, click flies you there ---
    (function () {
      function compShell(pos, r, id, en, zh) {
        var sh = new T.Mesh(new T.SphereGeometry(r, 12, 10), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
        sh.position.copy(pos); sh.name = "DSOPick_" + id;
        sh.userData.nyePick = "dso_" + id; sh.userData.dsoViewDist = r * 2.6; sh.userData.dsoFocusMin = r * 0.7;
        sh.userData.dsoName = { en: en, zh: zh };
        dsoPickGroup.add(sh);
      }
      compShell(lmc, 0.13 * Rgal * 1.35, "lmc", "Large Magellanic Cloud", "大麦哲伦云");
      compShell(smc, 0.075 * Rgal * 1.5, "smc", "Small Magellanic Cloud", "小麦哲伦云");
      compShell(sgrC, 0.11 * Rgal, "sgrdwarf", "Sagittarius Dwarf", "人马矮星系");
    })();
    // the GLOW underlayer — big soft low-opacity sprites blur into a smooth luminous galaxy beneath the stars
    var gg = new T.BufferGeometry();
    gg.setAttribute("position", new T.BufferAttribute(new Float32Array(GP), 3));
    gg.setAttribute("color", new T.BufferAttribute(new Float32Array(GC), 3));
    var gm = new T.PointsMaterial({ map: DSO_SOFT, size: mobile ? 16 : 24, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.17, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in gm) gm.toneMapped = false;
    var glow = new T.Points(gg, gm); glow.name = "MilkyWayGlow"; glow.renderOrder = -5; glow.frustumCulled = false;
    belt.add(glow);
    // the STAR layer on top — constant screen-size so the galaxy reads at every zoom
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(Cc), 3));
    var m = new T.PointsMaterial({ map: DSO_SOFT, size: mobile ? 2.9 : 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    var pts = new T.Points(g, m); pts.name = "MilkyWayGalaxy"; pts.renderOrder = -4; pts.frustumCulled = false;
    belt.add(pts);
  }

  /* ---------------- the GALACTIC CENTRE — a supermassive BLACK HOLE you can fly to: a dark event
     horizon that truly OCCLUDES the bulge stars behind it, ringed by a blazing accretion disc, at the
     heart of the galaxy. Clickable → fly in → it becomes the pivot → admire, like every other wonder. */
  function buildGalacticCore() {
    if (!galacticCentre) return;
    var grp = new T.Group(); grp.name = "DSO_galcore"; grp.position.copy(galacticCentre);
    // (1) the event horizon — a pure-black unlit sphere that OCCLUDES the galaxy behind it (a real void)
    var bh = new T.Mesh(new T.SphereGeometry(74, 40, 28), new T.MeshBasicMaterial({ color: 0x000000, fog: false }));
    bh.renderOrder = 1; grp.add(bh);
    // (2) the GARGANTUA — a camera-facing SHADER quad: a gravitationally-lensed accretion disc whose far side
    //     arcs OVER and UNDER the shadow into a halo, a razor blue-white photon ring, Doppler beaming (one
    //     side brighter/bluer), a hot gold blackbody ramp, swirl, and a soft glow. The most real + beautiful
    //     black hole, cheaply — one small quad, only its own pixels shaded, always presenting the iconic face.
    var bhUnif = { uTime: { value: 0 } };
    var bhFrag = [
      "precision highp float; varying vec2 vUv; uniform float uTime;",
      "vec3 ramp(float t){ vec3 c0=vec3(1.0,0.97,0.90),c1=vec3(1.0,0.80,0.42),c2=vec3(1.0,0.52,0.18),c3=vec3(0.80,0.27,0.09);",
      "  if(t<0.33) return mix(c0,c1,t/0.33); if(t<0.66) return mix(c1,c2,(t-0.33)/0.33); return mix(c2,c3,(t-0.66)/0.34); }",
      "void main(){",
      "  vec2 p=(vUv-0.5)*2.0; float d=length(p), ang=atan(p.y,p.x); float Rs=0.27;",
      "  vec3 col=vec3(0.0); float a=0.0;",
      "  float bs=0.5-0.5*cos(ang); float beam=0.5+0.62*bs;",                              // Doppler: left (approaching) brighter
      "  float sq=0.32; float dEll=length(vec2(p.x,p.y/sq));",                             // thin tilted disc ellipse
      "  float dIn=Rs*1.12, dOut=0.94; float dt=clamp((dEll-dIn)/(dOut-dIn),0.0,1.0);",
      "  float disc=smoothstep(0.0,0.10,dt)*(1.0-smoothstep(0.66,1.0,dt));",
      "  disc*=0.78+0.22*sin(ang*5.0-uTime*0.5+dEll*24.0);",                              // orbiting swirl
      "  col+=ramp(dt)*disc*beam*1.85; a=max(a,disc*beam);",
      "  float halo=smoothstep(0.19,0.015,abs(d-Rs*1.27));",                              // lensed over/under halo
      "  col+=ramp(0.22)*halo*beam*1.2; a=max(a,halo*beam*0.9);",
      "  float photon=smoothstep(0.02,0.0,abs(d-Rs*1.05));",                              // razor photon ring
      "  col+=vec3(0.88,0.94,1.0)*photon*2.8; a=max(a,photon);",
      "  float glow=pow(clamp(1.0-(d-Rs)/(1.35-Rs),0.0,1.0),2.2)*0.15;",                  // soft outer glow
      "  col+=ramp(0.4)*glow; a=max(a,glow);",
      "  float sh=smoothstep(Rs*0.97,Rs*1.0,d); col*=sh; a*=sh;",                          // hard shadow
      "  gl_FragColor=vec4(col,clamp(a,0.0,1.0));",
      "}"
    ].join("\n");
    var bhMat = new T.ShaderMaterial({
      uniforms: bhUnif,
      vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: bhFrag,
      transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false
    });
    var bhQuad = new T.Mesh(new T.PlaneGeometry(560, 560), bhMat); bhQuad.renderOrder = 5; bhQuad.frustumCulled = false; grp.add(bhQuad);
    _bhBB.push({ m: bhQuad, u: bhUnif });
    belt.add(grp);
    var shell = new T.Mesh(new T.SphereGeometry(210, 12, 10), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    shell.position.copy(galacticCentre); shell.name = "DSOPick_galcore";
    shell.userData.nyePick = "dso_galcore"; shell.userData.dsoViewDist = 600; shell.userData.dsoFocusMin = 120;
    shell.userData.dsoName = { en: "Galactic Centre · Sgr A*", zh: "银心 · 人马座 A*" };
    dsoPickGroup.add(shell);
  }

  /* ---------------- ANDROMEDA (M31): a SECOND spiral galaxy — its own inclined disc + bulge, in its TRUE
     sky direction, far beyond the Milky Way rim. Lazy (built with the far layers). ---------------- */
  var andromeda = null;
  function buildAndromeda() {
    if (andromeda) return;
    var m31 = (data.deepSky || []).filter(function (x) { return x.id === "andromeda"; })[0];
    var ecl = raDecToEcl(m31 ? m31.raH : 0.712, m31 ? m31.decDeg : 41.27);
    var center = eclVec(ecl.lon, ecl.lat, R_ANDROMEDA);
    var Rg = 520, NA = mobile ? 9000 : 16000;
    var wN = new T.Vector3(0.35, 0.86, 0.37).normalize();                        // inclined disc normal (M31 seen ~77°)
    var uN = new T.Vector3().crossVectors(wN, new T.Vector3(0, 1, 0)).normalize();
    var vN = new T.Vector3().crossVectors(wN, uN).normalize();
    var rng = gRng(0xA11DA);
    var P = [], Cc = [];
    var RAMP2 = [[0, [1, 0.86, 0.64]], [0.3, [0.9, 0.7, 0.5]], [0.6, [0.72, 0.72, 0.66]], [1, [0.6, 0.68, 0.82]]];
    function ramp2(f) { var i; for (i = 1; i < RAMP2.length; i++) if (f <= RAMP2[i][0]) break; if (i >= RAMP2.length) i = RAMP2.length - 1; var a = RAMP2[i - 1], b = RAMP2[i], k = (f - a[0]) / ((b[0] - a[0]) || 1); return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k]; }
    function G() { return rng() + rng() + rng() + rng() - 2; }
    var bsp = Math.tan(12 * Math.PI / 180), span = 6.4, aSp = Rg / Math.exp(bsp * span);
    var armN = Math.round(NA * 0.7), bulgeN = NA - armN;
    for (var i = 0; i < armN; i++) {
      var arm = i % 2, th = Math.pow(rng(), 1.6) * span, rC = aSp * Math.exp(bsp * th), ang = th + arm * Math.PI;
      var rsig = 6 + 0.09 * rC, x = rC * Math.cos(ang) + G() * rsig, z = rC * Math.sin(ang) + G() * rsig;
      var rr = Math.sqrt(x * x + z * z), h = G() * (60 + 0.05 * rC), f = rr / Rg, c = ramp2(f);
      var pt = center.clone().addScaledVector(uN, x).addScaledVector(vN, z).addScaledVector(wN, h);
      var amp = (0.12 + 0.7 * Math.pow(rng(), 2.4));
      P.push(pt.x, pt.y, pt.z); Cc.push(c[0] * amp, c[1] * amp, c[2] * amp);
    }
    for (var j = 0; j < bulgeN; j++) {
      var br = Math.pow(rng(), 1.9) * Rg * 0.16, ua = rng() * 2 - 1, ph = rng() * Math.PI * 2, ss = Math.sqrt(1 - ua * ua);
      var bpt = center.clone().addScaledVector(uN, br * ss * Math.cos(ph)).addScaledVector(vN, br * ss * Math.sin(ph)).addScaledVector(wN, br * ua * 0.6);
      var bc = ramp2(0.05 + 0.2 * (br / (Rg * 0.16))), a2 = 0.16 + 0.24 * Math.pow(rng(), 2.2);
      P.push(bpt.x, bpt.y, bpt.z); Cc.push(bc[0] * a2, bc[1] * a2, bc[2] * a2);
    }
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(Cc), 3));
    var m = new T.PointsMaterial({ map: DSO_SOFT, size: mobile ? 2.6 : 3.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    andromeda = new T.Points(g, m); andromeda.name = "Andromeda"; andromeda.renderOrder = -4; andromeda.frustumCulled = false;
    belt.add(andromeda);
    var sh = dsoPickGroup.getObjectByName("DSOPick_andromeda");
    if (sh) { sh.userData.dsoViewDist = Rg * 2.4; sh.userData.dsoFocusMin = Rg * 0.5; }
  }

  /* ================================================================================================
     THE MIDDLE TIERS — Local Group → Local Sheet → Virgo/Local Supercluster. These were the missing
     rungs of the cosmic address (the ladder used to jump galaxy → Laniakea). Each is built from the
     REAL geometry: true sky directions, true relative distances (per-tier log-compressed rate), and
     each embeds the previous tier as a condensing node so the zoom is one continuous address.
     ================================================================================================ */

  /* ---- helper: a tiny spiral-galaxy node (a few thousand points) — the "collapsed" form a whole
     galaxy takes when seen at the next tier up. normal = disc plane normal; warm ember palette. ---- */
  function miniSpiral(P, C, center, normal, Rg, n, seed, warm) {
    var rng = gRng(seed), arms = 2, bsp = Math.tan(13 * Math.PI / 180), span = 5.2;
    var aSp = Rg / Math.exp(bsp * span);
    var uN = new T.Vector3().crossVectors(normal, Math.abs(normal.y) < 0.94 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0)).normalize();
    var vN = new T.Vector3().crossVectors(normal, uN).normalize();
    for (var i = 0; i < n; i++) {
      var isBulge = rng() < 0.3;
      var pt, f;
      if (isBulge) {
        var br = Math.pow(rng(), 1.8) * Rg * 0.22, u2 = rng() * 2 - 1, p2 = rng() * Math.PI * 2, s2 = Math.sqrt(1 - u2 * u2);
        pt = center.clone().addScaledVector(uN, br * s2 * Math.cos(p2)).addScaledVector(vN, br * s2 * Math.sin(p2)).addScaledVector(normal, br * u2 * 0.55);
        f = 0.1;
      } else {
        var arm = i % arms, th = Math.pow(rng(), 1.5) * span, rC = aSp * Math.exp(bsp * th), ang = th + arm * Math.PI;
        var rs = Rg * 0.045 + rC * 0.09;
        var x = rC * Math.cos(ang) + gauss(rng) * rs, z = rC * Math.sin(ang) + gauss(rng) * rs;
        pt = center.clone().addScaledVector(uN, x).addScaledVector(vN, z).addScaledVector(normal, gauss(rng) * Rg * 0.05);
        f = Math.sqrt(x * x + z * z) / Rg;
      }
      var amp = (0.2 + 0.6 * Math.pow(rng(), 2)) * (warm || 1);
      var cr = 1.0 - 0.42 * f, cg = 0.84 - 0.3 * f, cb = 0.6 - 0.06 * f;   // gold core → cool rim
      C.push(cr * amp, cg * amp, Math.min(1, cb + 0.3 * f) * amp); P.push(pt.x, pt.y, pt.z);
    }
  }
  /* ---- helper: a small galaxy-group blob (a handful of member galaxies + faint halo) ---- */
  function groupBlob(P, C, center, r, n, seed, col, bright) {
    var rng = gRng(seed);
    for (var i = 0; i < n; i++) {
      var rr = Math.pow(rng(), 1.5) * r, u2 = rng() * 2 - 1, p2 = rng() * Math.PI * 2, s2 = Math.sqrt(1 - u2 * u2);
      var amp = (bright || 1) * (0.3 + 0.7 * Math.pow(rng(), 1.8));
      P.push(center.x + rr * s2 * Math.cos(p2), center.y + rr * s2 * Math.sin(p2), center.z + rr * u2);
      C.push(col[0] * amp, col[1] * amp, col[2] * amp);
    }
  }

  /* ---------------- TIER · LOCAL GROUP (真实: ~10 Mly across; rate ≈2250 units/Mly here).
     A DUMBBELL of two great spirals — the Milky Way (us, at the origin: the condensed node the
     118k-point disc collapses into) and Andromeda M31 (the existing 16k-point galaxy at 5720 IS
     this tier's M31) — plus M33, both satellite swarms and the lonely outer dwarfs, every one at
     its true direction & compressed true distance. ---------------- */
  function buildLocalGroup() {
    tierLG = new T.Group(); tierLG.name = "TierLocalGroup";
    var P = [], C = [];
    // the Milky Way, condensed: a small spiral at the origin SHARING the big disc's plane normal
    // (GAL_W) so the 118k-point galaxy visibly shrinks INTO this node during the crossfade
    miniSpiral(P, C, new T.Vector3(0, 0, 0), GAL_W, 420, mobile ? 1300 : 2200, 0x3a1f, 1.0);
    // its satellite swarm: LMC/SMC as tiny warm-blue smudges just off the disc (true dirs)
    groupBlob(P, C, skyDir(5.4, -69.8).multiplyScalar(390), 60, 60, 0x11a, [0.72, 0.80, 0.98], 0.8);
    groupBlob(P, C, skyDir(0.88, -72.8).multiplyScalar(470), 42, 34, 0x11b, [0.74, 0.80, 0.95], 0.7);
    // M33 Triangulum — the third spiral, near M31 (true: 2.73 Mly, just south of Andromeda)
    miniSpiral(P, C, skyDir(1.564, 30.66).multiplyScalar(6150), new T.Vector3(0.5, 0.72, 0.48).normalize(), 190, mobile ? 420 : 720, 0x33c, 0.85);
    // M31 ANDROMEDA at this tier's own point-size (the 16k-point galaxy is sized for the in-galaxy
    // view — its attenuated points fall below a pixel from LG framing distance, so the tier carries
    // its own brighter proxy at the same seat; the two crossfade in the same window, seamless)
    var m31 = skyDir(0.712, 41.27).multiplyScalar(R_ANDROMEDA);
    miniSpiral(P, C, m31, new T.Vector3(0.35, 0.86, 0.37).normalize(), 520, mobile ? 1500 : 2600, 0xa31d, 1.05);
    groupBlob(P, C, m31.clone().addScaledVector(skyDir(0.7, 40.5), 150), 46, 26, 0x31a, [1.0, 0.86, 0.62], 0.9);
    groupBlob(P, C, m31.clone().addScaledVector(skyDir(0.65, 41.7), -190), 52, 26, 0x31b, [0.98, 0.85, 0.66], 0.8);
    groupBlob(P, C, skyDir(0.55, 48.3).multiplyScalar(R_ANDROMEDA * 0.94), 70, 30, 0x31c, [0.95, 0.83, 0.68], 0.65);
    // the outer dwarfs — faint lone islands at TRUE directions & compressed true distances (×2250/Mly)
    var DW = [
      [19.75, -14.8, 3670, "n6822"], [1.08, 2.1, 5350, "ic1613"], [0.03, -15.5, 6600, "wlm"],
      [23.47, 14.7, 6600, "pegdig"], [9.99, 30.7, 5850, "leoa"], [0.44, -11.0, 5600, "cetus"],
      [20.78, -12.8, 6600, "aqr"], [22.69, -64.4, 6520, "tucana"], [1.85, -44.4, 3240, "phoenix"],
      [10.14, 12.3, 1450, "leo1"], [11.22, 22.2, 1300, "leo2"], [17.33, 57.9, 620, "draco"],
      [15.15, 67.2, 590, "umi"], [1.0, -33.7, 640, "scl-dsph"], [2.66, -34.4, 1050, "fornax-dsph"]
    ];
    for (var d2 = 0; d2 < DW.length; d2++) {
      var e2 = DW[d2];
      groupBlob(P, C, skyDir(e2[0], e2[1]).multiplyScalar(e2[2]), 34, 9, 0x500 + d2, [0.92, 0.84, 0.72], 0.55);
    }
    // the faint tidal BRIDGE hinting the two spirals are bound (they will merge in ~4.5 Gyr)
    var rngB = gRng(0xb219);
    for (var b2 = 0; b2 < (mobile ? 130 : 240); b2++) {
      var tt = rngB(), pB = m31.clone().multiplyScalar(tt);
      pB.x += gauss(rngB) * 520; pB.y += gauss(rngB) * 520; pB.z += gauss(rngB) * 520;
      P.push(pB.x, pB.y, pB.z); C.push(0.16, 0.13, 0.10);
    }
    tierLG.add(tierPoints("lg", P, C, mobile ? 7.5 : 9.5, { name: "LocalGroupCloud", base: 0.88 }));
    tierLG.add(tierGlow("lg", P, C, mobile ? 14 : 17, { name: "LocalGroupGlow", base: 0.38 }));
    // M33 pick (M31 already has its own from the deepSky data)
    var sh33 = new T.Mesh(new T.SphereGeometry(320, 10, 8), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    sh33.position.copy(skyDir(1.564, 30.66).multiplyScalar(6150)); sh33.name = "DSOPick_m33";
    sh33.userData.nyePick = "dso_m33"; sh33.userData.dsoViewDist = 900; sh33.userData.dsoFocusMin = 260; sh33.userData.dsoMinCam = 2600;
    sh33.userData.dsoName = { en: "M33 · Triangulum", zh: "M33 · 三角座星系" };
    dsoPickGroup.add(sh33);
    tierLG.visible = false; belt.add(tierLG);
  }

  /* ---------------- TIER · LOCAL SHEET (真实: a 34-Mly-wide, 1.5-Mpc-THIN wall of galaxies in the
     supergalactic plane — bounded above (+SG_W) by the huge empty LOCAL VOID; ringed by the real
     "Council of Giants"; the Leo Spur runs on a parallel layer below. Rate ≈612 units/Mly. ------- */
  function buildLocalSheet() {
    tierSheet = new T.Group(); tierSheet.name = "TierLocalSheet";
    var P = [], C = [], rng = gRng(0x5eef);
    function inPlane(dir, damp) {   // project a true sky direction toward the SG plane (the sheet IS the plane)
      var d = dir.clone().addScaledVector(SG_W, -dir.dot(SG_W) * (damp == null ? 0.75 : damp));
      return d.normalize();
    }
    // the COUNCIL OF GIANTS — the real ring of bright galaxies encircling the Local Group
    // (name, RA h, Dec °, true Mly): each a small warm galaxy-blob at its compressed true seat
    var CG = [
      ["n253", 0.79, -25.3, 11], ["maffei", 2.60, 59.6, 11], ["ic342", 3.78, 68.1, 11],
      ["m81", 9.93, 69.07, 12], ["m94", 12.85, 41.12, 15], ["m64", 12.94, 21.68, 16],
      ["m83", 13.62, -29.87, 16], ["cenA", 13.42, -43.02, 12], ["n4945", 13.09, -49.47, 12],
      ["circinus", 14.22, -65.34, 14]
    ];
    for (var g2 = 0; g2 < CG.length; g2++) {
      var cgE = CG[g2], seat = inPlane(skyDir(cgE[1], cgE[2])).multiplyScalar(cgE[3] * 612);
      groupBlob(P, C, seat, 190, mobile ? 16 : 26, 0x700 + g2, [1.0, 0.87, 0.64], 1.0);
    }
    // the sheet itself: a THIN diffuse wall of faint galaxies in the SG plane (±~900 = the real 1.5 Mpc),
    // denser toward the centre (us), fading to the rim; NOTHING above it — that darkness IS the Local Void
    var NS = mobile ? 2200 : 4200;
    for (var i = 0; i < NS; i++) {
      var a2 = rng() * Math.PI * 2, rr = Math.pow(rng(), 0.72) * 10400;
      var h2 = gauss(rng) * 620;
      if (h2 > 480) continue;                      // hard ceiling toward the void — the sheet has a clean top
      var pt = new T.Vector3().addScaledVector(SG_U, rr * Math.cos(a2)).addScaledVector(SG_V, rr * Math.sin(a2)).addScaledVector(SG_W, h2);
      var amp = 0.22 + 0.5 * Math.pow(rng(), 2.2);
      P.push(pt.x, pt.y, pt.z); C.push(0.95 * amp, 0.86 * amp, 0.70 * amp);
    }
    // the M101 WALL — the one real spur that climbs off the sheet INTO the Local Void
    var m101dir = inPlane(skyDir(14.05, 54.35), 0.5);
    for (var m3 = 0; m3 < (mobile ? 120 : 220); m3++) {
      var tt3 = rng(), base3 = m101dir.clone().multiplyScalar(5200 + 5200 * tt3);
      base3.addScaledVector(SG_W, tt3 * tt3 * 2900 + gauss(rng) * 260);
      base3.addScaledVector(SG_V, gauss(rng) * 300);
      var amp3 = 0.3 + 0.4 * rng();
      P.push(base3.x, base3.y, base3.z); C.push(0.82 * amp3, 0.76 * amp3, 0.66 * amp3);
    }
    // the LEO SPUR — the neighbouring layer BELOW the sheet (real: next wall at negative SGZ)
    var leoDir = inPlane(skyDir(10.8, 12.0));
    for (var l3 = 0; l3 < (mobile ? 200 : 380); l3++) {
      var s3 = (rng() - 0.5) * 2;
      var pt3 = leoDir.clone().multiplyScalar(7400 + s3 * 3600).addScaledVector(SG_V, gauss(rng) * 1500 + s3 * 900).addScaledVector(SG_W, -1750 + gauss(rng) * 330);
      var amp4 = 0.2 + 0.32 * Math.pow(rng(), 2);
      P.push(pt3.x, pt3.y, pt3.z); C.push(0.78 * amp4, 0.72 * amp4, 0.64 * amp4);
    }
    // two wispy TENDRILS inside the void (real: the Local Void is not perfectly empty — thin wisps lace it)
    for (var w3 = 0; w3 < (mobile ? 80 : 150); w3++) {
      var tw = rng(), dirW = inPlane(skyDir(18.2 + 1.6 * (w3 % 2), 8 + 14 * (w3 % 2)), 0.3);
      var ptW = dirW.multiplyScalar(3400 + 5800 * tw).addScaledVector(SG_W, 1200 + 3400 * tw + gauss(rng) * 380);
      var ampW = 0.10 + 0.14 * rng();
      P.push(ptW.x, ptW.y, ptW.z); C.push(0.62 * ampW, 0.60 * ampW, 0.58 * ampW);
    }
    tierSheet.add(tierPoints("sheet", P, C, mobile ? 5.5 : 7, { name: "LocalSheetCloud", base: 0.82 }));
    tierSheet.add(tierGlow("sheet", P, C, mobile ? 11 : 13.5, { name: "LocalSheetGlow", base: 0.34 }));
    tierSheet.visible = false; belt.add(tierSheet);
  }

  /* ---------------- TIER · VIRGO / LOCAL SUPERCLUSTER (真实: a FLAT disc ~110 Mly across in the SG
     plane, centred on the rich VIRGO CLUSTER 54 Mly away — WE sit on the outskirts, on a minor spur
     feeding in. Radial "clouds" fan out of Virgo; 98% of the volume is empty. Rate ≈239 units/Mly. - */
  function buildVirgoSupercluster() {
    tierVirgo = new T.Group(); tierVirgo.name = "TierVirgo";
    var P = [], C = [], rng = gRng(0x71c0);
    var VC = VIRGO_DIR.clone().multiplyScalar(12900);      // the Virgo cluster — the supercluster's heart (54 Mly × 239)
    // the rich cluster core: ~1300 galaxies swarming in a dense ball + a warm halo
    var NCOR = mobile ? 520 : 900;
    for (var i = 0; i < NCOR; i++) {
      var rr = Math.pow(rng(), 2.1) * 1350, u2 = rng() * 2 - 1, p2 = rng() * Math.PI * 2, s2 = Math.sqrt(1 - u2 * u2);
      var amp = 0.5 + 0.62 * Math.pow(rng(), 1.6);
      P.push(VC.x + rr * s2 * Math.cos(p2), VC.y + rr * s2 * Math.sin(p2), VC.z + rr * u2);
      C.push(1.0 * amp, 0.88 * amp, 0.66 * amp);
    }
    // radial CLOUDS/SPURS fanning out of Virgo IN THE PLANE (real: Canes Venatici cloud — the one
    // we live in — plus Virgo II southern extension, Leo II cloud, Crater cloud)
    var usDir = VC.clone().negate().normalize();           // from Virgo toward US: the Canes spur (we're ON it)
    var spurDirs = [
      usDir,
      new T.Vector3().addScaledVector(SG_V, -0.86).addScaledVector(SG_U, 0.44).normalize(),   // Virgo II (south)
      new T.Vector3().addScaledVector(SG_V, 0.72).addScaledVector(SG_U, -0.62).normalize(),   // Leo II cloud
      new T.Vector3().addScaledVector(SG_U, 0.94).addScaledVector(SG_V, 0.30).normalize()     // toward Hydra (deeper in-plane)
    ];
    for (var sp2 = 0; sp2 < spurDirs.length; sp2++) {
      var sd = spurDirs[sp2].clone().addScaledVector(SG_W, -spurDirs[sp2].dot(SG_W)).normalize();
      var len = sp2 === 0 ? 13400 : 7200 + rng() * 4200;
      var NSP = Math.round((mobile ? 260 : 460) * (sp2 === 0 ? 1.25 : 1));
      for (var q2 = 0; q2 < NSP; q2++) {
        var tq = Math.pow(rng(), 0.85), wob = Math.sin(tq * 5.2 + sp2 * 2.1) * 620 * tq;
        var ptq = VC.clone().addScaledVector(sd, tq * len)
          .addScaledVector(SG_V, wob + gauss(rng) * (300 + 480 * tq))
          .addScaledVector(SG_U, gauss(rng) * (260 + 420 * tq))
          .addScaledVector(SG_W, gauss(rng) * 300);
        var ampq = (0.24 + 0.5 * Math.pow(rng(), 2)) * (1 - 0.35 * tq);
        P.push(ptq.x, ptq.y, ptq.z); C.push(0.96 * ampq, 0.85 * ampq, 0.68 * ampq);
      }
    }
    // the flat DISC of scattered small groups filling the supercluster plane (thin: ±~1500), sparse —
    // most of even a supercluster is emptiness; density rises gently toward Virgo
    var ND = mobile ? 2000 : 3800;
    for (var d3 = 0; d3 < ND; d3++) {
      var a3 = rng() * Math.PI * 2, r3 = Math.pow(rng(), 0.62) * 15800;
      var pt3 = new T.Vector3().addScaledVector(SG_U, r3 * Math.cos(a3)).addScaledVector(SG_V, r3 * Math.sin(a3)).addScaledVector(SG_W, gauss(rng) * 1100);
      var dV = pt3.distanceTo(VC);
      if (rng() < 0.5 * Math.min(1, dV / 16000)) continue;             // thin out away from the heart
      var amp3 = 0.16 + 0.4 * Math.pow(rng(), 2.4) + Math.max(0, 0.3 - dV / 26000);
      P.push(pt3.x, pt3.y, pt3.z); C.push(0.92 * amp3, 0.84 * amp3, 0.70 * amp3);
    }
    // US: the whole Local Sheet condensed to a modest knot at the origin — visibly ON THE EDGE,
    // 82% of the way out of the disc, hanging off the Canes spur. We are not the centre.
    groupBlob(P, C, new T.Vector3(0, 0, 0), 560, mobile ? 60 : 100, 0xa5e, [1.0, 0.62, 0.42], 0.85);
    tierVirgo.add(tierPoints("virgo", P, C, mobile ? 8 : 10, { name: "VirgoSC", base: 0.9 }));
    tierVirgo.add(tierGlow("virgo", P, C, mobile ? 15 : 18, { name: "VirgoSCGlow", base: 0.36 }));
    // pick: the Virgo cluster core
    var shV = new T.Mesh(new T.SphereGeometry(1700, 10, 8), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    shV.position.copy(VC); shV.name = "DSOPick_virgo";
    shV.userData.nyePick = "dso_virgo"; shV.userData.dsoViewDist = 5600; shV.userData.dsoFocusMin = 2200; shV.userData.dsoMinCam = 9000;
    shV.userData.dsoName = { en: "Virgo Cluster · the supercluster's heart", zh: "室女星系团 · 本超星系团之心" };
    dsoPickGroup.add(shV);
    tierVirgo.visible = false; belt.add(tierVirgo);
  }

  /* ---------------- TIER · LANIAKEA — the Tully 2014 watershed, at TRUE internal scale (52.6 u/Mly):
     us at the origin, Virgo 2840 in, the GREAT ATTRACTOR (Norma, true RA 16.25h −61°) 12000 out, the
     basin rim ~14400 (=274 Mly ✓). Thousands of white-gold STREAMLINES comb through the supergalactic
     slab and converge on the Attractor; the rim is an irregular amber watershed-surface; a coral knot
     marks US on the far shore by the Perseus–Pisces divide. Beyond it, the neighbour basins wait in
     cool grey. ---------------- */
  function buildLaniakeaFlow() {
    if (_laniakeaFlow) return;
    var wr = gRng(0x1a71ea), wG = function () { return wr() + wr() + wr() - 1.5; };
    var F = DIR_GA.clone().multiplyScalar(12000);          // the Great Attractor — the basin's floor (true dir + true 228 Mly)
    var RAD = 14400, NLINE = mobile ? 1300 : 2400;
    var VCn = VIRGO_DIR.clone().multiplyScalar(2840);      // Virgo knot: exactly where the collapsing Virgo tier lands (12900×0.22)
    // irregular basin: bulge toward Virgo/us (the long lobe we live in), pinch at the Perseus–Pisces divide
    var AX_US = F.clone().negate().normalize();
    var AX_VIR = VCn.clone().sub(F).normalize();
    function basinLobe(d) {
      return 0.74 + 0.34 * Math.max(0, d.dot(AX_VIR)) + 0.20 * Math.max(0, d.dot(AX_US)) * Math.max(0, d.dot(AX_VIR)) * 2.0
           - 0.22 * Math.max(0, d.dot(DIR_PP)) - 0.10 * Math.max(0, d.dot(SG_W));
    }
    var P = [], C = [];
    function pushFlow(x, y, z, br, wf) { P.push(x, y, z); C.push(0.98 * br, (0.62 + 0.28 * wf) * br, (0.14 + 0.28 * wf) * br); }
    var swirlAxis = SG_W;                                   // the comb curls about the supergalactic normal — flow lives in the slab
    for (var s = 0; s < NLINE; s++) {
      var d0 = new T.Vector3(2 * wr() - 1, 2 * wr() - 1, 2 * wr() - 1); if (d0.lengthSq() < 1e-4) d0.set(1, 0, 0); d0.normalize();
      d0.addScaledVector(SG_W, -0.52 * d0.dot(SG_W)).normalize();       // spawn biased into the slab
      var pos = F.clone().addScaledVector(d0, RAD * (0.30 + 0.70 * Math.pow(wr(), 0.5)) * basinLobe(d0));
      var steps = 24 + (wr() * 16 | 0), handed = d0.dot(SG_W) > 0 ? 1 : -1;
      for (var t = 0; t < steps; t++) {
        var toF = new T.Vector3().subVectors(F, pos), dF = toF.length();
        if (dF < 900) break;                                // the GA node fills the core
        toF.multiplyScalar(1 / dF);
        var tang = new T.Vector3().crossVectors(toF, swirlAxis); if (tang.lengthSq() < 1e-4) tang.set(1, 0, 0); tang.normalize();
        var frac = dF / RAD, stepLen = 235 + 130 * frac;
        pos.addScaledVector(toF, stepLen).addScaledVector(tang, handed * stepLen * (0.26 + 0.42 * frac));
        pos.addScaledVector(SG_W, -pos.clone().sub(F).dot(SG_W) * 0.055);   // the slab keeps combing the flow flat
        pos.x += wG() * 40; pos.y += wG() * 40; pos.z += wG() * 40;
        var prox = 1 - Math.min(1, frac), br = 0.60 + 0.72 * prox * prox, wf = Math.max(0, prox - 0.5) / 0.5;
        pushFlow(pos.x, pos.y, pos.z, br, wf);
      }
    }
    // the GREAT-ATTRACTOR sink: a dense white-gold knot, ELONGATED along the slab — the real
    // Hydra–Centaurus–Norma chain, not a round ball
    var gaU = new T.Vector3().crossVectors(SG_W, DIR_GA).normalize(), gaV = new T.Vector3().crossVectors(SG_W, gaU).normalize();
    for (var n = 0; n < (mobile ? 300 : 520); n++) {
      var nr = Math.pow(wr(), 1.7), u3 = 2 * wr() - 1, p3 = 2 * Math.PI * wr(), s3 = Math.sqrt(1 - u3 * u3);
      var off = gaU.clone().multiplyScalar(s3 * Math.cos(p3) * nr * 1350)
        .addScaledVector(gaV, s3 * Math.sin(p3) * nr * 620).addScaledVector(SG_W, u3 * nr * 480);
      pushFlow(F.x + off.x, F.y + off.y, F.z + off.z, 1.2, 1.0);
    }
    // VIRGO inside the basin — the knot the collapsed Virgo tier hands over to
    for (var v2 = 0; v2 < (mobile ? 90 : 150); v2++) {
      var vr = Math.pow(wr(), 1.8) * 520, vu = 2 * wr() - 1, vp = 2 * Math.PI * wr(), vs = Math.sqrt(1 - vu * vu);
      pushFlow(VCn.x + vr * vs * Math.cos(vp), VCn.y + vr * vs * Math.sin(vp), VCn.z + vr * vu, 0.95, 0.55);
    }
    // US — the warm-coral knot on the basin's far shore (the camera pivot; the "you are here" red dot)
    for (var m2 = 0; m2 < 110; m2++) {
      var mr = Math.pow(wr(), 2) * 380, mu2 = 2 * wr() - 1, mp2 = 2 * Math.PI * wr(), mss = Math.sqrt(1 - mu2 * mu2);
      P.push(mr * mss * Math.cos(mp2), mr * mu2, mr * mss * Math.sin(mp2)); C.push(1.15, 0.46, 0.30);
    }
    // a few ESCAPE LINES flowing on beyond the Attractor toward Shapley — our true long-term fate
    var SHP = DIR_SHAPLEY.clone().multiplyScalar(34200);
    for (var es = 0; es < (mobile ? 40 : 80); es++) {
      var ep = F.clone(); ep.x += wG() * 900; ep.y += wG() * 900; ep.z += wG() * 900;
      var eSteps = 10 + (wr() * 8 | 0);
      for (var et = 0; et < eSteps; et++) {
        var toS = new T.Vector3().subVectors(SHP, ep).normalize();
        ep.addScaledVector(toS, 700); ep.x += wG() * 70; ep.y += wG() * 70; ep.z += wG() * 70;
        var ebr = 0.22 * (1 - et / eSteps) + 0.05;
        pushFlow(ep.x, ep.y, ep.z, ebr, 0.2);
      }
    }
    var flowPts = tierPoints("lani", P, C, mobile ? 3.4 : 4.2, { name: "LaniakeaFlow", base: 0.95 });
    var flowGlow = tierGlow("lani", P, C, mobile ? 7.5 : 9.5, { name: "LaniakeaFlowGlow", base: 0.48 });
    // the irregular RIM — the watershed surface itself, breathing amber dust…
    var RP = [], RC = [], NRIM = mobile ? 900 : 1600;
    for (var r2 = 0; r2 < NRIM; r2++) {
      var ru = 2 * wr() - 1, rp = 2 * Math.PI * wr(), rs = Math.sqrt(1 - ru * ru);
      var rd = new T.Vector3(rs * Math.cos(rp), ru, rs * Math.sin(rp));
      var rr2 = RAD * basinLobe(rd) * (1.0 + (wr() - 0.5) * 0.05);
      var rp3 = F.clone().addScaledVector(rd, rr2);
      RP.push(rp3.x, rp3.y, rp3.z); RC.push(0.55, 0.32, 0.10);
    }
    // …and the iconic ORANGE OUTLINE: the rim's trace along the supergalactic slab (ref image 1)
    for (var o2 = 0; o2 < (mobile ? 480 : 860); o2++) {
      var ph2 = (o2 / (mobile ? 480 : 860)) * Math.PI * 2;
      var rd2 = gaU.clone().multiplyScalar(Math.cos(ph2)).addScaledVector(gaV, Math.sin(ph2));
      rd2.addScaledVector(SG_W, (wr() - 0.5) * 0.13).normalize();
      var rr3 = RAD * basinLobe(rd2) * (1.0 + (wr() - 0.5) * 0.035);
      var rp4 = F.clone().addScaledVector(rd2, rr3);
      RP.push(rp4.x, rp4.y, rp4.z); RC.push(0.96, 0.58, 0.12);
    }
    var rimPts = tierPoints("lani", RP, RC, mobile ? 5.5 : 7, { name: "LaniakeaRim", base: 0.62 });
    var rimGlow = tierGlow("lani", RP, RC, mobile ? 11 : 14, { name: "LaniakeaRimGlow", base: 0.28 });
    _laniakeaFlow = new T.Group(); _laniakeaFlow.name = "TierLaniakea";
    _laniakeaFlow.add(flowGlow); _laniakeaFlow.add(flowPts); _laniakeaFlow.add(rimGlow); _laniakeaFlow.add(rimPts);
    _laniakeaFlow.visible = false; belt.add(_laniakeaFlow);
    // pick: the Great Attractor / the whole basin
    var gaShell = new T.Mesh(new T.SphereGeometry(2600, 12, 10), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    gaShell.position.copy(F); gaShell.name = "DSOPick_laniakea";
    gaShell.userData.nyePick = "dso_laniakea"; gaShell.userData.dsoViewDist = 26000; gaShell.userData.dsoFocusMin = 7000; gaShell.userData.dsoMinCam = 15000;
    gaShell.userData.dsoName = { en: "Laniakea · the Great Attractor", zh: "拉尼亚凯亚 · 巨引源" };
    dsoPickGroup.add(gaShell);
  }

  /* ---------------- the NEIGHBOUR BASINS — Shapley, Coma, Perseus–Pisces, Hercules: the adjacent
     watersheds, all at TRUE directions & true relative distances (52.6 u/Mly). Cool grey-blue
     far-context at the Laniakea tier; they persist as the brightest pinned knots of the web. ------- */
  var _neighborsBuilt = false;
  function buildNeighborBasins() {
    if (_neighborsBuilt) return; _neighborsBuilt = true;
    var grp = new T.Group(); grp.name = "NeighborBasins";
    var P = [], C = [], rng = gRng(0xe16);
    var COOL = [0.60, 0.66, 0.78], PALE = [0.78, 0.80, 0.86];
    // SHAPLEY (650 Mly → 34200): the greatest concentration in the local universe — a rich multi-core swarm
    var SHP = DIR_SHAPLEY.clone().multiplyScalar(34200);
    for (var i = 0; i < (mobile ? 700 : 1300); i++) {
      var sub = (i % 4), subC = SHP.clone().addScaledVector(new T.Vector3(gauss(rng), gauss(rng), gauss(rng)), sub * 900);
      var rr = Math.pow(rng(), 1.7) * 2600, u2 = rng() * 2 - 1, p2 = rng() * Math.PI * 2, s2 = Math.sqrt(1 - u2 * u2);
      var amp = 0.5 + 0.6 * Math.pow(rng(), 1.6);
      P.push(subC.x + rr * s2 * Math.cos(p2), subC.y + rr * s2 * Math.sin(p2), subC.z + rr * u2);
      C.push(PALE[0] * amp, PALE[1] * amp * 0.98, PALE[2] * amp * 0.9);   // pale warm-white: it outshines every neighbour
    }
    // PERSEUS–PISCES (250 Mly → 13150): the great CHAIN just across our divide — a long wall, not a ball
    var PPC = DIR_PP.clone().multiplyScalar(13150);
    var ppAxis = new T.Vector3().crossVectors(DIR_PP, SG_W).normalize();
    for (var pp2 = 0; pp2 < (mobile ? 600 : 1100); pp2++) {
      var tpp = (rng() - 0.5) * 2;
      var ppP = PPC.clone().addScaledVector(ppAxis, tpp * 9000 + Math.sin(tpp * 3.1) * 1100)
        .addScaledVector(SG_W, Math.cos(tpp * 2.2) * 900 + gauss(rng) * 480)
        .addScaledVector(DIR_PP, gauss(rng) * 620);
      if (rng() < 0.16) { var kb = Math.pow(rng(), 1.6) * 900; ppP.addScaledVector(new T.Vector3(gauss(rng), gauss(rng), gauss(rng)).normalize(), kb); }
      var ampp = (0.34 + 0.5 * Math.pow(rng(), 2)) * (1 - 0.4 * Math.abs(tpp));
      P.push(ppP.x, ppP.y, ppP.z); C.push(COOL[0] * ampp, COOL[1] * ampp, COOL[2] * ampp);
    }
    // COMA (330 Mly → 17360): the dense compact cluster anchoring the northern web
    var CMA = DIR_COMA.clone().multiplyScalar(17360);
    for (var cm = 0; cm < (mobile ? 320 : 600); cm++) {
      var cr2 = Math.pow(rng(), 2.0) * 1700, cu = rng() * 2 - 1, cp = rng() * Math.PI * 2, cs = Math.sqrt(1 - cu * cu);
      var campv = 0.44 + 0.56 * Math.pow(rng(), 1.7);
      P.push(CMA.x + cr2 * cs * Math.cos(cp), CMA.y + cr2 * cs * Math.sin(cp), CMA.z + cr2 * cu);
      C.push(PALE[0] * campv * 0.96, PALE[1] * campv * 0.96, PALE[2] * campv);
    }
    // HERCULES (500 Mly → 26300): a looser northern swarm
    var HRC = DIR_HERC.clone().multiplyScalar(26300);
    for (var hc = 0; hc < (mobile ? 220 : 420); hc++) {
      var hr2 = Math.pow(rng(), 1.4) * 2400, hu = rng() * 2 - 1, hp = rng() * Math.PI * 2, hs = Math.sqrt(1 - hu * hu);
      var hampv = 0.3 + 0.42 * Math.pow(rng(), 2);
      P.push(HRC.x + hr2 * hs * Math.cos(hp), HRC.y + hr2 * hs * Math.sin(hp), HRC.z + hr2 * hu);
      C.push(COOL[0] * hampv, COOL[1] * hampv, COOL[2] * hampv);
    }
    grp.add(tierPoints("neighbors", P, C, mobile ? 6.5 : 8, { name: "NeighborCloud", base: 0.68 }));
    grp.add(tierGlow("neighbors", P, C, mobile ? 12 : 14.5, { name: "NeighborGlow", base: 0.32 }));
    grp.visible = false; belt.add(grp);
    _neighborBasins = grp;
    // picks for the great neighbours
    function basinPick(pos, r, id, en, zh, viewDist, minCam) {
      var sh = new T.Mesh(new T.SphereGeometry(r, 10, 8), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      sh.position.copy(pos); sh.name = "DSOPick_" + id;
      sh.userData.nyePick = "dso_" + id; sh.userData.dsoViewDist = viewDist; sh.userData.dsoFocusMin = r * 1.2; sh.userData.dsoMinCam = minCam;
      sh.userData.dsoName = { en: en, zh: zh };
      dsoPickGroup.add(sh);
    }
    basinPick(SHP, 3400, "shapley", "Shapley Concentration", "沙普利超星系团", 11000, 18000);
    basinPick(PPC, 3000, "perseuspisces", "Perseus–Pisces Supercluster", "英仙-双鱼超星系团", 10000, 18000);
    basinPick(CMA, 2200, "coma", "Coma Cluster", "后发星系团", 7000, 18000);
  }
  var _neighborBasins = null;

  /* ---------------- TIER · THE COSMIC WEB — the Millennium lacework, honest to the real geometry:
     ~120 supercluster NODES (Poisson-spaced, so VOIDS of 100-300 Mly open naturally), wired by
     bent, tapering FILAMENT threads to their neighbours; a fifth of the node-triangles filled with
     whisper-faint WALLS; three great voids carved explicitly clean. The user's visual law: filaments
     in deep slate-grey-blue, cluster nodes in warm white-gold — one substance at two temperatures,
     never a purple gradient. Our Laniakea = one middling node at the origin; Shapley/Coma/P-P are
     PINNED at their true seats so the neighbour basins persist seamlessly into the web. ---------------- */
  function buildCosmicWeb() {
    var R_IN = 0, RMAX = 36500;
    var wr = gRng(0x1a91a), wG = function () { return wr() + wr() + wr() - 1.5; };
    var POS = [], COL = [];
    // two colour families, one material: SLATE filament dust → WARM node fire (L: 0 dust … 1 node-core)
    function pushPt(x, y, z, L, inten) {
      var b = inten * (0.7 + 0.5 * wr()), r, g, bl;
      if (L < 0.55) { var t0 = L / 0.55;       r = 0.26 + 0.24 * t0; g = 0.30 + 0.24 * t0; bl = 0.40 + 0.22 * t0; }   // slate-blue-grey thread dust
      else          { var t1 = (L - 0.55) / 0.45; r = 0.50 + 0.62 * t1; g = 0.54 + 0.42 * t1; bl = 0.62 - 0.14 * t1; } // → warm white-gold cluster fire
      POS.push(x, y, z); COL.push(r * b, g * b, bl * b);
    }
    // ---- SEED THE SUPERCLUSTER NODES: Poisson-disc in the sphere; the real landmarks pinned first ----
    var MINSEP = 4300;
    var nodes = [
      { p: new T.Vector3(0, 0, 0),                                mass: 1.0, pin: "laniakea" },
      { p: DIR_SHAPLEY.clone().multiplyScalar(34200),             mass: 1.9, pin: "shapley" },
      { p: DIR_PP.clone().multiplyScalar(13150),                  mass: 1.2, pin: "pp" },
      { p: DIR_COMA.clone().multiplyScalar(17360),                mass: 1.1, pin: "coma" },
      { p: DIR_HERC.clone().multiplyScalar(26300),                mass: 0.9, pin: "hercules" }
    ];
    // three GREAT VOIDS carved explicitly (real: Boötes-class supervoids, 300+ Mly across)
    var voids = [
      { p: skyDir(14.5, 46).multiplyScalar(21000), r: 8600 },
      { p: skyDir(4.6, -18).multiplyScalar(26000), r: 9800 },
      { p: skyDir(20.9, -30).multiplyScalar(19000), r: 7400 }
    ];
    function inVoid(p, shrink) { for (var vi = 0; vi < voids.length; vi++) { if (p.distanceTo(voids[vi].p) < voids[vi].r * (shrink || 1)) return true; } return false; }
    var guard = 0, NWANT = mobile ? 92 : 138;
    while (nodes.length < NWANT && guard++ < 30000) {
      var ct = 2 * wr() - 1, st = Math.sqrt(1 - ct * ct), ph = 2 * Math.PI * wr();
      var rad = 5200 + (RMAX - 5200) * Math.pow(wr(), 0.72);
      var cand = new T.Vector3(st * Math.cos(ph) * rad, ct * rad, st * Math.sin(ph) * rad);
      if (inVoid(cand, 1.0)) continue;
      var ok = true;
      for (var ck = 0; ck < nodes.length; ck++) { if (cand.distanceTo(nodes[ck].p) < MINSEP) { ok = false; break; } }
      if (ok) nodes.push({ p: cand, mass: 0.4 + 0.9 * Math.pow(wr(), 2.2) });
    }
    // ---- NODE FIRES: compact warm knots, richness ∝ mass (the pinned giants blaze) ----
    for (var n = 0; n < nodes.length; n++) {
      var nd = nodes[n];
      if (nd.pin === "shapley" || nd.pin === "pp" || nd.pin === "coma" || nd.pin === "hercules") continue;   // the neighbour-basin clouds already paint these; skip double-painting
      var cn = Math.round((mobile ? 60 : 100) * (0.4 + nd.mass * nd.mass)), cr = 340 + 620 * nd.mass;
      for (var q = 0; q < cn; q++) {
        var r = Math.pow(wr(), 2.0) * cr, u = 2 * wr() - 1, pp = 2 * Math.PI * wr(), sn = Math.sqrt(1 - u * u);
        pushPt(nd.p.x + r * sn * Math.cos(pp), nd.p.y + r * sn * Math.sin(pp), nd.p.z + r * u, 0.72 + 0.28 * wr(), 0.9 + 0.5 * nd.mass);
      }
    }
    // ---- FILAMENTS: each node → its 2-4 nearest neighbours; BENT (one bezier bow per thread) and
    //      TAPERED (thick+bright at the node mouths, thin+dim mid-span) — the lacework itself ----
    var edges = {}, epool = [];
    for (var a2 = 0; a2 < nodes.length; a2++) {
      var order = [];
      for (var b2 = 0; b2 < nodes.length; b2++) if (b2 !== a2) order.push({ b: b2, d: nodes[a2].p.distanceTo(nodes[b2].p) });
      order.sort(function (x, y) { return x.d - y.d; });
      var kn = 2 + (wr() < 0.55 ? 1 : 0) + (nodes[a2].mass > 1.2 ? 1 : 0);
      for (var e2 = 0; e2 < Math.min(kn, order.length); e2++) {
        var bb = order[e2].b, key = Math.min(a2, bb) + "_" + Math.max(a2, bb);
        if (edges[key]) continue; edges[key] = true;
        if (order[e2].d > MINSEP * 2.6) continue;
        epool.push([a2, bb]);
      }
    }
    for (var ei = 0; ei < epool.length; ei++) {
      var A = nodes[epool[ei][0]].p, B = nodes[epool[ei][1]].p;
      var mid = A.clone().add(B).multiplyScalar(0.5);
      var bow = new T.Vector3(wG(), wG(), wG()).multiplyScalar(A.distanceTo(B) * 0.10); mid.add(bow);
      if (inVoid(mid, 0.9)) continue;                        // threads may not cross the carved voids
      var L2 = A.distanceTo(B), nP = Math.max(32, Math.round(L2 / (mobile ? 58 : 42)));
      for (var t2 = 0; t2 < nP; t2++) {
        var f = t2 / (nP - 1), omf = 1 - f;
        var px = omf * omf * A.x + 2 * omf * f * mid.x + f * f * B.x;
        var py = omf * omf * A.y + 2 * omf * f * mid.y + f * f * B.y;
        var pz = omf * omf * A.z + 2 * omf * f * mid.z + f * f * B.z;
        var mouth = 1 - Math.sin(f * Math.PI);               // 1 at the ends, 0 mid-span
        var jit = 130 + 420 * (1 - mouth);                   // taper: tight at nodes, breathing mid-span
        px += wG() * jit; py += wG() * jit; pz += wG() * jit;
        pushPt(px, py, pz, 0.16 + 0.4 * mouth, 0.5 + 0.42 * mouth);
        if (wr() < 0.24) pushPt(px + wG() * jit * 1.9, py + wG() * jit * 1.9, pz + wG() * jit * 1.9, 0.08, 0.3);   // fuzz skirt
      }
    }
    // ---- WALLS: a fifth of the node-triangles filled with whisper-faint sheets (cell faces) ----
    var wallN = 0;
    for (var ei2 = 0; ei2 < epool.length && wallN < (mobile ? 8 : 15); ei2++) {
      var i0 = epool[ei2][0], j0 = epool[ei2][1];
      if (wr() > 0.3) continue;
      for (var k0 = 0; k0 < nodes.length; k0++) {
        if (k0 === i0 || k0 === j0) continue;
        if (edges[Math.min(i0, k0) + "_" + Math.max(i0, k0)] && edges[Math.min(j0, k0) + "_" + Math.max(j0, k0)]) {
          var NW = mobile ? 120 : 210;
          for (var w2 = 0; w2 < NW; w2++) {
            var r1 = wr(), r2 = wr(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
            var wx = nodes[i0].p.x + r1 * (nodes[j0].p.x - nodes[i0].p.x) + r2 * (nodes[k0].p.x - nodes[i0].p.x) + wG() * 300;
            var wy = nodes[i0].p.y + r1 * (nodes[j0].p.y - nodes[i0].p.y) + r2 * (nodes[k0].p.y - nodes[i0].p.y) + wG() * 300;
            var wz = nodes[i0].p.z + r1 * (nodes[j0].p.z - nodes[i0].p.z) + r2 * (nodes[k0].p.z - nodes[i0].p.z) + wG() * 300;
            if (!inVoid(new T.Vector3(wx, wy, wz), 0.9)) pushPt(wx, wy, wz, 0.05, 0.22);
          }
          wallN++; break;
        }
      }
    }
    // ---- the faintest field sprinkle (never inside the carved voids — those stay CLEAN dark) ----
    var strays = mobile ? 900 : 1600;
    for (var v = 0; v < strays; v++) {
      var vr = 5000 + (RMAX - 5000) * Math.pow(wr(), 0.5), vct = 2 * wr() - 1, vst = Math.sqrt(1 - vct * vct), vph = 2 * Math.PI * wr();
      var sx = vr * vst * Math.cos(vph), sy = vr * vct, sz = vr * vst * Math.sin(vph);
      if (inVoid(new T.Vector3(sx, sy, sz), 1.0)) continue;
      pushPt(sx, sy, sz, 0.04, 0.16);
    }
    // ---- OUR node: Laniakea condensed — a small golden basin-swirl at the origin, streamlines
    //      compressed to a whorl so "the flow you just left" is recognisably THIS dot of the web ----
    for (var lk = 0; lk < (mobile ? 260 : 420); lk++) {
      var lt = wr(), lang = lt * 4.2 * Math.PI, lr = 180 + 1450 * lt;
      var lp = new T.Vector3().addScaledVector(SG_U, Math.cos(lang) * lr).addScaledVector(SG_V, Math.sin(lang) * lr).addScaledVector(SG_W, gauss(gRng(lk)) * 190);
      lp.addScaledVector(DIR_GA, lt * 620);
      pushPt(lp.x, lp.y, lp.z, 0.62 + 0.3 * (1 - lt), 0.85);
    }
    _cosmicWeb = new T.Group(); _cosmicWeb.name = "TierCosmicWeb";
    _cosmicWeb.add(tierPoints("web", POS, COL, mobile ? 2.6 : 3.2, { name: "CosmicWebCloud", base: 0.92, fog: true }));
    _cosmicWeb.add(tierGlow("web", POS, COL, mobile ? 5.2 : 6.4, { name: "CosmicWebGlow", base: 0.38, fog: true }));
    _cosmicWeb.visible = false; belt.add(_cosmicWeb);
  }

  /* ---------------- TIER · OBSERVABLE UNIVERSE — beyond the mapped web the lattice CONTINUES but
     evens out (the real "End of Greatness": at gigalight-year scales the foam is statistically
     uniform), receding to the faint spherical CMB HORIZON — the wall of first light, drawn as a
     breathing temperature-speckle shell. We are the exact centre of this sphere, and only of this
     sphere: every observer owns one. ---------------- */
  function buildObservableUniverse() {
    tierUniverse = new T.Group(); tierUniverse.name = "TierObservable";
    var rng = gRng(0x0b5e);
    // (a) the FAR FOAM: tiny uniform web-froth from the mapped web's rim out toward the horizon —
    //     no landmark nodes out here, just the same lattice fabric repeating smaller and fainter
    var P = [], C = [], NF = mobile ? 12000 : 22000;
    var CELL = 4600;   // froth cell size: continues the inner web's texture, unresolved
    for (var i = 0; i < NF; i++) {
      var ct = 2 * rng() - 1, st = Math.sqrt(1 - ct * ct), ph = 2 * Math.PI * rng();
      var rr = 30000 + (52000 - 30000) * Math.pow(rng(), 0.8);
      var p = new T.Vector3(st * Math.cos(ph) * rr, ct * rr, st * Math.sin(ph) * rr);
      // cheap cellular sharpening: snap a fraction of points toward their froth-cell edge → faint net, not noise
      var cx2 = Math.round(p.x / CELL) * CELL, cy2 = Math.round(p.y / CELL) * CELL, cz2 = Math.round(p.z / CELL) * CELL;
      var toC = new T.Vector3(cx2 - p.x, cy2 - p.y, cz2 - p.z);
      p.addScaledVector(toC, -0.55 * rng());                 // push AWAY from cell centres → onto the walls
      var amp = 0.10 + 0.22 * Math.pow(rng(), 2.6);
      P.push(p.x, p.y, p.z); C.push(0.46 * amp, 0.50 * amp, 0.58 * amp);
    }
    tierUniverse.add(tierPoints("obs", P, C, mobile ? 2.6 : 3.2, { name: "FarFoam", base: 0.95, fog: false }));
    tierUniverse.add(tierGlow("obs", P, C, mobile ? 5.2 : 6.5, { name: "FarFoamGlow", base: 0.42, fog: false }));
    // (b) the CMB HORIZON: a vast shell of first light — fbm temperature speckle (Planck's mottling,
    //     desaturated into this site's ember palette), faint, seen from inside OR outside.
    var CMBR = 56000;
    var cmbUnif = { uTime: { value: 0 }, uOp: { value: 0 } };
    var cmbMat = new T.ShaderMaterial({
      uniforms: cmbUnif,
      vertexShader: [
        "varying vec3 vP; varying vec3 vN;",
        "void main(){ vP=position; vN=normalize(normalMatrix*normal);",
        "  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }"
      ].join("\n"),
      fragmentShader: [
        "precision highp float; varying vec3 vP; varying vec3 vN; uniform float uTime; uniform float uOp;",
        "float h(vec3 q){ return fract(sin(dot(q,vec3(127.1,311.7,74.7)))*43758.5453); }",
        "float n3(vec3 q){ vec3 i=floor(q), f=fract(q); f=f*f*(3.0-2.0*f);",
        "  float a=mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y);",
        "  float b=mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y);",
        "  return mix(a,b,f.z); }",
        "void main(){",
        "  vec3 d=normalize(vP);",
        "  float t=n3(d*9.0)*0.55+n3(d*23.0)*0.30+n3(d*52.0)*0.15;",                     // multi-scale temperature mottling
        "  t=t+0.045*sin(uTime*0.11+d.x*7.0);",                                          // the horizon breathes, barely
        "  vec3 cold=vec3(0.10,0.055,0.05), hot=vec3(0.55,0.26,0.12);",                  // ember palette, never blue
        "  vec3 col=mix(cold,hot,smoothstep(0.28,0.75,t));",
        "  col+=vec3(0.25,0.12,0.05)*smoothstep(0.82,0.98,t);",                           // rare hot flecks
        "  gl_FragColor=vec4(col, uOp*(0.5+0.5*t));",
        "}"
      ].join("\n"),
      transparent: true, depthWrite: false, side: T.BackSide, blending: T.AdditiveBlending, fog: false
    });
    var cmb = new T.Mesh(new T.SphereGeometry(CMBR, 48, 32), cmbMat);
    cmb.name = "CMBHorizon"; cmb.renderOrder = -8; cmb.frustumCulled = false;
    tierUniverse.add(cmb);
    // seen from OUTSIDE (the fluctuation tier): the same shell, front faces, dimmer — "the universe, an orb"
    var cmbOut = new T.Mesh(new T.SphereGeometry(CMBR, 48, 32), cmbMat.clone());
    cmbOut.material.side = T.FrontSide; cmbOut.name = "CMBHorizonOut"; cmbOut.renderOrder = -8; cmbOut.frustumCulled = false;
    tierUniverse.add(cmbOut);
    _cmbUnifs = [cmbUnif, cmbOut.material.uniforms];
    tierUniverse.visible = false; belt.add(tierUniverse);
  }
  var _cmbUnifs = null;

  /* ---------------- TIER · THE FLUCTUATION — past the horizon the address LOOPS. The whole
     observable universe shrinks to one warm mote adrift in a field of stochastic QUANTUM
     SCINTILLATIONS — sparse sparks that flicker in and out of existence (Sovereign Scintillation
     over Grand Fluctuation). Zoom on: every spark is a universe; focused, a spark is a quark.
     The scale ends here, folded back on itself. ---------------- */
  function buildQuantumFoam() {
    var N = mobile ? 6000 : 11000, rng = gRng(0x9f0a);
    var pos = new Float32Array(N * 3), ph = new Float32Array(N), sp = new Float32Array(N), am = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var u2 = rng() * 2 - 1, p2 = rng() * Math.PI * 2, s2 = Math.sqrt(1 - u2 * u2);
      var rr = 26000 + (118000 - 26000) * Math.pow(rng(), 0.62);
      pos[i * 3] = s2 * Math.cos(p2) * rr; pos[i * 3 + 1] = u2 * rr; pos[i * 3 + 2] = s2 * Math.sin(p2) * rr;
      ph[i] = rng() * Math.PI * 2; sp[i] = 0.4 + 2.6 * Math.pow(rng(), 2.0); am[i] = 0.25 + 0.75 * Math.pow(rng(), 1.7);
    }
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new T.BufferAttribute(ph, 1));
    g.setAttribute("aSpeed", new T.BufferAttribute(sp, 1));
    g.setAttribute("aAmp", new T.BufferAttribute(am, 1));
    var unif = { uTime: { value: 0 }, uOp: { value: 0 }, uPx: { value: Math.min((typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1, 1.5) } };
    var mat = new T.ShaderMaterial({
      uniforms: unif,
      vertexShader: [
        "attribute float aPhase; attribute float aSpeed; attribute float aAmp;",
        "uniform float uTime; uniform float uPx; varying float vTw;",
        "void main(){",
        "  float tw=0.5+0.5*sin(uTime*aSpeed+aPhase);",
        "  tw=pow(tw,3.0);",                                                             // mostly dark, brief blinks — stochastic, not sinusoidal-looking
        "  vTw=tw*aAmp;",
        "  vec4 mv=modelViewMatrix*vec4(position,1.0);",
        "  gl_PointSize=(1.6+3.4*vTw)*uPx;",
        "  gl_Position=projectionMatrix*mv;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision mediump float; varying float vTw; uniform float uOp;",
        "void main(){",
        "  vec2 q=gl_PointCoord-0.5; float d=length(q);",
        "  float a=smoothstep(0.5,0.06,d)*vTw*uOp;",
        "  vec3 warm=mix(vec3(0.72,0.62,0.52), vec3(1.0,0.93,0.80), vTw);",              // ember-white sparks
        "  gl_FragColor=vec4(warm*a, a);",
        "}"
      ].join("\n"),
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false
    });
    quantumFoam = new T.Points(g, mat); quantumFoam.name = "QuantumFoam"; quantumFoam.renderOrder = -9;
    quantumFoam.frustumCulled = false; quantumFoam.visible = false;
    _quantumUnif = unif;
    belt.add(quantumFoam);
    // THE SPARK AT THE CENTRE: the whole observable universe, now one scintillation among the many —
    // and, looked at the other way, one quark. A slightly warmer, steadier mote at the origin.
    var sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    sg.setAttribute("aPhase", new T.BufferAttribute(new Float32Array([0]), 1));
    sg.setAttribute("aSpeed", new T.BufferAttribute(new Float32Array([0.9]), 1));
    sg.setAttribute("aAmp", new T.BufferAttribute(new Float32Array([1.6]), 1));
    universeSpark = new T.Points(sg, mat);
    universeSpark.name = "UniverseSpark"; universeSpark.renderOrder = -7; universeSpark.frustumCulled = false; universeSpark.visible = false;
    belt.add(universeSpark);
  }
  var _quantumUnif = null;

  // idempotent LAZY-BY-SCALE entry points, called by space.js only on genuine user navigation (never during
  // the auto-entrance) so the ground/whole-sky view is instant & cool and heavy geometry is built on demand.
  function ensureFarLayers() { if (_farBuilt) return; _farBuilt = true; buildMilkyWayGalaxy(); buildGalacticCore(); buildAndromeda(); }   // galaxy MUST precede core (core reads galacticCentre)
  function ensureMidLayers() { if (_midBuilt) return; _midBuilt = true; buildLocalGroup(); buildLocalSheet(); buildVirgoSupercluster(); buildYouAnchor(); }   // the three middle rungs of the address: LG → Sheet → Virgo
  function ensureCosmicWeb() { if (_webBuilt) return; _webBuilt = true; buildLaniakeaFlow(); buildNeighborBasins(); buildCosmicWeb(); }    // the Laniakea flow-basin + neighbour basins + the whole web
  function ensureUniverse() { if (_uniBuilt) return; _uniBuilt = true; buildObservableUniverse(); buildQuantumFoam(); }                     // far foam + CMB horizon + the quantum scintillation field

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
  var t0 = null, backdropMul = 1, zoomMul = 1, _bdCache = null, _sfMat = null, _sfBase = 1, _bdT = 0, _keepGal = false, _galMats = null, _localHide = null, _nsMat = null, _nsBase = 1, _lhTries = 0;
  // drives every registered material of one tier: opacity = base × effectiveWeight; ghostW keeps
  // collapsed parent nodes visible (continuity law) when a deeper tier owns the frame.
  function driveTier(key, grp2, w2, ghostW) {
    var eff = w2 > 0.018 ? w2 : Math.max(w2, (ghostW || 0) * 0.42);
    var list = _tierMats[key], on = eff > 0.004;
    if (grp2) grp2.visible = on;
    if (!on) return;
    var dim = w2 > 0.018 ? 1 : 0.55;
    for (var q2 = 0; q2 < list.length; q2++) list[q2].m.opacity = list[q2].base * eff * dim;
  }
  function lineOpacities(sec) {
    // entrance pulse: the constellations announce themselves, then settle
    if (t0 === null) t0 = sec;
    var age = sec - t0;
    var pulse = age < 9 ? 1 + 0.8 * Math.max(0, 1 - age / 9) : 1;
    for (var ci = 0; ci < lineEntries.length; ci++) {
      var e = lineEntries[ci]; if (!e) continue;
      var hl = isLit(ci) ? 1.9 : 1;
      e.mat.opacity = Math.min(1.0, e.base * (isDark ? 1 : 1.18) * pulse * hl) * backdropMul * zoomMul;
      if (e.glowMat) e.glowMat.opacity = Math.min(0.68, e.base * 0.42 * pulse * hl) * backdropMul * zoomMul;
    }
  }
  /* when the visitor flies IN to admire one deep-sky wonder, the whole backdrop steps aside
     (constellations, galaxy, starfield fade) so the nebula owns the frame; t: 0 normal → 1 dimmed */
  function setBackdropDim(t, keepGalaxy) {
    backdropMul = 1 - 0.9 * t; _bdT = t; _keepGal = !!keepGalaxy;   // Starfield + Galaxy opacity are now owned by the tick (scale-fade × these solo flags); here we only fade the constellation stars
    if (!_bdCache) {
      _bdCache = [];
      if (starPoints && starPoints.material) _bdCache.push({ m: starPoints.material, base: starPoints.material.opacity, nm: "natalStars" });
    }
    for (var i = 0; i < _bdCache.length; i++) { var e = _bdCache[i]; e.m.opacity = e.base * (1 - 0.6 * t); }   // constellation stars fade to 0.4 when admiring a lone wonder
  }
  var api = {
    group: group,
    starPoints: starPoints,
    ensureFarLayers: ensureFarLayers,
    ensureMidLayers: ensureMidLayers,
    ensureCosmicWeb: ensureCosmicWeb,
    ensureUniverse: ensureUniverse,
    getPickName: function (id) {   // fallback name for the dossier card when a registry entry is blank
      if (id.indexOf("dso_") === 0) { var s = dsoPickGroup.getObjectByName("DSOPick_" + id.slice(4)); return s && s.userData.dsoName || null; }
      if (id.indexOf("con_") === 0) { var c = cons.filter(function (k) { return k.id === id.slice(4); })[0]; return c ? (c.name || (c.figureName)) : null; }
      return null;
    },
    tick: function (sec) {
      uniforms.uTime.value = sec;
      lineOpacities(sec);
      for (var _bi = 0; _bi < _bhSpin.length; _bi++) _bhSpin[_bi].rotateZ(0.004);   // (legacy) any spinning disc meshes
      for (var _bb = 0; _bb < _bhBB.length; _bb++) {                                // the Gargantua quad: advance its swirl + billboard it to face the camera
        var _e = _bhBB[_bb]; _e.u.uTime.value = sec;
        if (o.camera && _e.m.parent) { _e.m.parent.getWorldQuaternion(_bbPQ); o.camera.getWorldQuaternion(_bbCQ); _e.m.quaternion.copy(_bbPQ.invert().multiply(_bbCQ)); }
      }
      if (o.camera) {
        var _cl = o.camera.position.length();
        // ===== THE COSMIC-ADDRESS DRIVER owns every scale fade now. One log-space trapezoid per tier
        //       (window.CosmicLOD); no scattered magic numbers. Weights fall back to the old bands if the
        //       LOD module ever fails to load, so the scene never goes dark. =====
        var LOD = window.CosmicLOD, _lg = Math.log(Math.max(1, _cl));
        var _wMW    = LOD ? LOD.weight(_cl, "milky-way")           : Math.max(0, Math.min(1, (4800 - _cl) / 1400));
        var _wLG    = LOD ? LOD.weight(_cl, "local-group")         : 0;
        var _wSheet = LOD ? LOD.weight(_cl, "local-sheet")         : 0;
        var _wVir   = LOD ? LOD.weight(_cl, "virgo-supercluster")  : 0;
        var _wLani  = LOD ? LOD.weight(_cl, "laniakea")            : Math.max(0, Math.min(1, (_cl - 4400) / 1400)) * Math.max(0, Math.min(1, (9600 - _cl) / 1800));
        var _wWeb   = LOD ? LOD.weight(_cl, "cosmic-web")          : Math.max(0, Math.min(1, (_cl - 8200) / 2600));
        var _wObs   = LOD ? LOD.weight(_cl, "observable-universe") : 0;
        var _wQnt   = LOD ? LOD.weight(_cl, "fluctuation")         : 0;
        // ghost context: parent tiers stay as faint trackable nodes while deeper tiers dominate
        var _gLG  = Math.max(_wVir, _wLani, _wWeb, _wObs);
        var _gSh  = Math.max(_wVir, _wLani, _wWeb);
        var _gVir = Math.max(_wLani, _wWeb, _wObs * 0.6);
        var _gLan = Math.max(_wWeb, _wObs * 0.55);
        driveTier("lg",    tierLG,       _wLG,  _gLG);
        driveTier("sheet", tierSheet,    _wSheet, _gSh);
        driveTier("virgo", tierVirgo,    _wVir, _gVir);
        driveTier("lani",  _laniakeaFlow, _wLani, _gLan);
        driveTier("web",   _cosmicWeb,   _wWeb, Math.max(_wObs * 0.22, _wQnt * 0.12));
        driveTier("neighbors", _neighborBasins, Math.max(_wLani * 0.85, _wWeb, _wObs * 0.35));
        // OBSERVABLE UNIVERSE: the far foam fades with its tier; the CMB horizon shell persists into
        // the fluctuation tier (seen from OUTSIDE it becomes "the universe, an orb" — one scintillation)
        driveTier("obs", tierUniverse, Math.max(_wObs, _wQnt * 0.5));
        if (_cmbUnifs) {
          _cmbUnifs[0].uOp.value = 0.42 * _wObs;                                  // inside: the faint wall of first light
          _cmbUnifs[1].uOp.value = Math.max(0.14 * _wObs, 0.38 * _wQnt);          // outside: the whole universe as a warm mote
          _cmbUnifs[0].uTime.value = sec; _cmbUnifs[1].uTime.value = sec;
        }
        // THE FLUCTUATION: stochastic quantum scintillations — the scale's outer loop
        if (quantumFoam) {
          var _qOn = _wQnt > 0.004;
          quantumFoam.visible = _qOn; if (universeSpark) universeSpark.visible = _qOn;
          if (_qOn && _quantumUnif) { _quantumUnif.uOp.value = _wQnt; _quantumUnif.uTime.value = sec; }
        }
        // COLLAPSE CURVES — the continuity law in action: each tier SHRINKS through its fade-out
        // window so it visibly condenses into the node its parent draws at the same seat.
        if (LOD) {
          var _cMW = LOD.collapse(_cl, "milky-way", 0.16);      // 2600 → 416: the disc condenses onto the LG tier's spiral node (R 420)
          var _cLG = LOD.collapse(_cl, "local-group", 0.2);     // M31 5720 → 1144: the dumbbell folds into the Sheet's central knot
          var _cVir = LOD.collapse(_cl, "virgo-supercluster", 0.22);   // Virgo core 12900 → 2838: lands EXACTLY on Laniakea's Virgo knot (2840)
          var _cLani = LOD.collapse(_cl, "laniakea", 0.12);     // GA 12000 → 1440: the basin folds into the web's origin whorl (~1450)
          if (tierLG && tierLG.visible) tierLG.scale.setScalar(_cLG);
          if (tierSheet && tierSheet.visible) tierSheet.scale.setScalar(LOD.collapse(_cl, "local-sheet", 0.25));
          if (tierVirgo && tierVirgo.visible) tierVirgo.scale.setScalar(_cVir);
          if (_laniakeaFlow && _laniakeaFlow.visible) _laniakeaFlow.scale.setScalar(_cLani);
        }
        // STARFIELD (the local night-sky stars) is a MILKY-WAY-and-inward thing: full at the star-chart/galaxy
        // scale, faded out by the Local Group tier so it never drowns the deep structure. (× solo-dim factor.)
        if (!_sfMat) { var _sfo = group.getObjectByName("Starfield"); if (_sfo && _sfo.material) { _sfMat = _sfo.material; _sfBase = _sfo.material.opacity; } }
        if (_sfMat) { var _sfScale = LOD ? Math.max(0.05, 1 - LOD.smooth(Math.log(2600), Math.log(5400), _lg)) : Math.max(0.08, Math.min(1, (7000 - _cl) / 3200)); _sfMat.opacity = _sfBase * _sfScale * (1 - 0.55 * _bdT); }
        // the CONSTELLATION STARS (the clickable work-stars) belong to the star-chart/galaxy scale — fade them out
        // by the Local Group tier so the intergalactic structure (flow, web) reads clean; they return on the way in.
        if (!_nsMat) { var _nso = group.getObjectByName("natalStars"); if (_nso && _nso.material) { _nsMat = _nso.material; _nsBase = _nso.material.opacity; } }
        if (_nsMat) { var _nsScale = LOD ? (1 - LOD.smooth(Math.log(3200), Math.log(6000), _lg)) : 1; _nsMat.opacity = _nsBase * _nsScale * (1 - 0.6 * _bdT); }
        // GALAXY owns the milky-way tier: it fades IN as you leave the whole-sky (~260); through its fade-out
        // window it CONTRACTS (scale → 0.16) while dimming, condensing onto the Local Group's spiral node —
        // never a disappearance, always a condensation. Fully faded → visible=false (the 118k points unload).
        if (!_galMats) {
          var _g1 = group.getObjectByName("MilkyWayGalaxy"), _g2 = group.getObjectByName("MilkyWayGlow");
          if (_g1 && _g2) _galMats = [{ o: _g1, m: _g1.material, base: _g1.material.opacity }, { o: _g2, m: _g2.material, base: _g2.material.opacity }];
        }
        if (_galMats) {
          var _gSolo = _keepGal ? 1 : (1 - 0.86 * _bdT);
          var _mwGhost = Math.max(_wMW, _wLG * 0.55, _gLG * 0.24);
          var _gOn = _mwGhost > 0.004;
          for (var _gi = 0; _gi < _galMats.length; _gi++) {
            var _ge = _galMats[_gi];
            _ge.o.visible = _gOn;
            if (_gOn) {
              var _gDim = _wMW > 0.018 ? 1 : 0.48;
              _ge.m.opacity = _ge.base * _mwGhost * _gSolo * _gDim;
              if (LOD) _ge.o.scale.setScalar(LOD.collapse(_cl, "milky-way", 0.16));
            }
          }
        }
        // LOCAL structures collapse tier by tier. The MW-internal nebulae + black hole now FADE with the
        // galaxy tier (opacity × weight — no hard pop) and ride its contraction; Andromeda (M31) belongs to
        // BOTH the galaxy sky and the Local Group, so it lingers through that tier and contracts with it.
        if (_cl > 800 && (!_localHide || (_localHide.dso.length < _dsoCount && ++_lhTries % 90 === 0))) {
          // INCREMENTAL collect — nebula images load async, so late arrivals must still join the
          // scale-fade. Only never-seen objects are added (their opacity is still pristine base;
          // re-reading an already-faded material would bake the fade into its base — the old trap).
          if (!_localHide) _localHide = { dso: [], andro: null, androBase: 0.5 };
          if (!_localHide.andro) {
            var _andO = group.getObjectByName("Andromeda");
            if (_andO) { _localHide.andro = _andO; _localHide.androBase = _andO.material.opacity; }
          }
          group.traverse(function (ob) {
            if (ob.userData && ob.userData._lodSeen) return;
            if (ob.name && ob.name.indexOf("DSO_") === 0 && ob.name !== "DSO_galcore") {
              ob.userData._lodSeen = true;
              var mats = [];
              ob.traverse(function (ch) { if (ch.material && ch.material.opacity != null) mats.push({ m: ch.material, base: ch.material.opacity }); });
              _localHide.dso.push({ o: ob, mats: mats, basePos: ob.position.clone() });
            }
            if (ob.name === "DSO_galcore" && !_localHide.core) { ob.userData._lodSeen = true; _localHide.core = { o: ob, basePos: ob.position.clone() }; }
          });
        }
        if (_localHide) {
          var _dsoW = Math.min(1, _wMW * 1.3), _dsoOn = _dsoW > 0.01;
          var _cMW2 = LOD ? LOD.collapse(_cl, "milky-way", 0.16) : 1;
          for (var _hi = 0; _hi < _localHide.dso.length; _hi++) {
            var _de = _localHide.dso[_hi];
            _de.o.visible = _dsoOn;
            if (_dsoOn) {
              for (var _mi = 0; _mi < _de.mats.length; _mi++) _de.mats[_mi].m.opacity = _de.mats[_mi].base * _dsoW;
              _de.o.position.copy(_de.basePos).multiplyScalar(_cMW2);   // nebulae ride the disc's contraction
              _de.o.scale.setScalar(_cMW2);
            }
          }
          if (_localHide.core) {   // the black hole rides the contraction too (it IS the galactic centre)
            _localHide.core.o.visible = _wMW > 0.01;
            _localHide.core.o.position.copy(_localHide.core.basePos).multiplyScalar(_cMW2);
            _localHide.core.o.scale.setScalar(_cMW2);
          }
          if (_localHide.andro) {
            var _aW = Math.max(_wMW, _wLG, _gLG * 0.35);
            _localHide.andro.visible = _aW > 0.01;
            _localHide.andro.material.opacity = _localHide.androBase * _aW * (_wLG > 0.018 ? 1 : 0.55);
            if (LOD) _localHide.andro.scale.setScalar(LOD.collapse(_cl, "local-group", 0.2));   // M31 contracts WITH the Local Group fold
          }
        }
        // persistent 3D anchor — the coral "you are here" mote, trackable through every parent tier
        if (_youAnchor) {
          var _yaW = Math.max(_wLG, _wSheet, _wVir, _wLani, _wWeb, _wObs * 0.5);
          var _yaOn = _cl > 4200 && _yaW > 0.03;
          _youAnchor.visible = _yaOn;
          if (_yaOn) _youAnchor.material.opacity = Math.min(1, 0.28 + _yaW * 0.72);
        }
      }
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
    conPicks: conPickGroup,
    getConCentroid: function (id) {
      var ci = lineByCon[id]; if (ci == null || !conCentroid[ci]) return null;
      return belt.localToWorld(conCentroid[ci].clone());
    },
    // framing data for flying to a now-depth-scattered constellation: world-space mean sightline
    // DIRECTION + the nearest/farthest star depth, so the host can stand IN FRONT of all its stars
    // (on the Earth→figure line) where the figure still resolves into its shape.
    getConFrame: function (id) {
      var ci = lineByCon[id]; if (ci == null || !conCentroid[ci]) return null;
      var wq = new T.Quaternion(); belt.getWorldQuaternion(wq);
      var dir = (conDir[ci] || conCentroid[ci].clone().normalize()).clone().applyQuaternion(wq).normalize();
      return { dir: dir, near: conNear[ci] || 300, far: conFar[ci] || 3000, mid: belt.localToWorld(conCentroid[ci].clone()) };
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
    setBackdropDim: setBackdropDim,
    // pulled far enough back that the whole galaxy fills the view → the ecliptic zodiac constellations
    // (a solar-system-scale ring) melt away: they'd sit jarringly inside a galaxy-scale frame. t: 0 shown → 1 hidden
    setZodiacFade: function (t) { zoomMul = 1 - Math.max(0, Math.min(1, t)); },   // the constellation FIGURE-lines belong to the star-chart scale; they ease fully to 0 once you leave for the galaxy/deep tiers (the constellation STARS stay — they're separate) so nothing clutters the cosmic view
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
