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
    var Wu = (d.size || 160) * 1.8, Hu = Wu * (H / W), Zu = 0.5 * Wu;               // world width/height + a REAL depth (~half the width → a genuine 3-D body, not a thin slab, so it never foreshortens to a line when you orbit)
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
  (data.deepSky || []).forEach(function (d, idx) {
    if (!d.tex) return;
    // SPREAD the wonders out into deep 3-D so none crowd and none sit buried in the galactic plane:
    // each at its own far DISTANCE (2200→3600, well beyond the galactic core), a golden-angle azimuth
    // nudge, AND a big latitude push so they scatter well OFF the band (up/down out of the plane)
    var dist = 4600 + (idx / Math.max(1, _dsoCount - 1)) * 2200;                     // 4600–6800: FAR beyond the galaxy's outer edge (~3950 from origin) so NONE sit inside the band — the Pillars of Creation especially
    var nud = idx * 2.399963;
    var latOff = (Math.sin(idx * 1.7 + 0.6) > 0 ? 1 : -1) * (0.45 + 0.45 * Math.abs(Math.sin(idx * 2.3 + 0.9)));   // always ≥0.45 rad (26°) off the band, alternating up/down → never buried in the galactic plane
    var ecl = raDecToEcl(d.raH, d.decDeg);
    var latF = Math.max(-1.45, Math.min(1.45, ecl.lat + Math.sin(nud) * 0.12 + latOff));
    var world = eclVec(ecl.lon + Math.cos(nud) * 0.22, latF, dist);
    var Wu = (d.size || 160) * 1.8;                          // matches the world width in dsoParticles
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
  var _bbPQ = new T.Quaternion(), _bbCQ = new T.Quaternion(), _cosmicWeb = null;
  (function buildMilkyWayGalaxy() {
    var Rgal = 2600, N = mobile ? 78000 : 118000;                              // VAST but leaner — a real galaxy the size of the sky; count trimmed to cut additive-overdraw stutter (the glow underlayer keeps it dense-looking)
    var Rsun = 0.52 * Rgal, Rin = 42, Rout = 150, hSun = 140;                   // Sun's galactocentric radius; the Orion ARM flows right THROUGH the solar system (tiny 42-unit clearing only for the planets themselves) → the sun sits embedded in the arm, not in a carved-out hole that truncates it
    var gcE = raDecToEcl(17.7608, -28.94), npE = raDecToEcl(12.8571, 27.13);    // Sgr A* + galactic north pole
    var w = eclVec(npE.lon, npE.lat, 1).normalize();                            // disc normal (galactic pole)
    var uu = eclVec(gcE.lon, gcE.lat, 1); uu.addScaledVector(w, -uu.dot(w)).normalize();  // in-plane, toward the centre
    var vv = new T.Vector3().crossVectors(w, uu).normalize();
    var C = uu.clone().multiplyScalar(Rsun).addScaledVector(w, -hSun);          // the galactic centre in scene space
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
    for (var sg = 0; sg < 1600; sg++) {
      var sgr = Math.pow(rng(), 1.6) * 0.1 * Rgal, sgu = rng() * 2 - 1, sgp = rng() * Math.PI * 2, sgs = Math.sqrt(1 - sgu * sgu);
      var sgpt = sgrC.clone().addScaledVector(uu, sgr * sgs * Math.cos(sgp) * 1.6).addScaledVector(vv, sgr * sgs * Math.sin(sgp)).addScaledVector(w, sgr * sgu * 0.9);
      push(sgpt, 0.96, 0.79, 0.63, 0.26 + 0.32 * Math.pow(rng(), 2), 0.1);
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
    for (var lm = 0; lm < 2600; lm++) {
      var lr = Math.pow(rng(), 1.4) * 0.13 * Rgal, lu = rng() * 2 - 1, lp = rng() * Math.PI * 2, lsn = Math.sqrt(1 - lu * lu);
      var lpt = lmc.clone().addScaledVector(uu, lr * lsn * Math.cos(lp) * 1.8).addScaledVector(vv, lr * lsn * Math.sin(lp)).addScaledVector(w, lr * lu * 0.6);
      if (rng() < 0.5) push(lpt, 0.72, 0.82, 1.0, 0.2 + 0.34 * Math.pow(rng(), 2), 0.12);
      else if (rng() < 0.16) push(lpt, PINK[0], PINK[1], PINK[2], 0.34 + 0.35 * rng(), 0.3);
      else push(lpt, 0.94, 0.91, 0.86, 0.16 + 0.26 * Math.pow(rng(), 2), 0.1);
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
  })();

  /* ---------------- the GALACTIC CENTRE — a supermassive BLACK HOLE you can fly to: a dark event
     horizon that truly OCCLUDES the bulge stars behind it, ringed by a blazing accretion disc, at the
     heart of the galaxy. Clickable → fly in → it becomes the pivot → admire, like every other wonder. */
  (function buildGalacticCore() {
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
  })();

  /* ---------------- the LANIAKEA SUPERCLUSTER — the cosmic web, far beyond the local star field. When you
     dolly WAY out, the ~26k faint galaxies resolve into FILAMENTS + WALLS + dense NODES with empty VOIDS
     between — the real large-scale texture (Voronoi skeleton: cell faces = walls, edges = filaments, verts
     = clusters, interiors = voids). Static, one draw, faded in only when the camera leaves the galaxy. --- */
  (function buildCosmicWeb() {
    var COUNT = mobile ? 32000 : 62000, R_IN = 5200, R_OUT = 30000, NUM_SEEDS = 60;   // vast + closer-in so it blooms as you leave the galaxy, ~62k galaxies across the whole observable-universe web
    var WALL_EPS = 0.06, FILA_EPS = 0.095, WALL_KEEP = 0.22;
    var wr = gRng(0x1a91a), wG = function () { return wr() + wr() + wr() - 1.5; };
    var GA = Math.PI * (3 - Math.sqrt(5)), seeds = [];
    for (var si = 0; si < NUM_SEEDS; si++) {
      var yy = 1 - (si / (NUM_SEEDS - 1)) * 2, rr0 = Math.sqrt(Math.max(0, 1 - yy * yy)), th0 = GA * si;
      var dir = new T.Vector3(Math.cos(th0) * rr0, yy + wG() * 0.06, Math.sin(th0) * rr0).normalize();
      var rad = (R_IN + (R_OUT - R_IN) * wr()) * (0.85 + 0.15 * wr());
      seeds.push(dir.multiplyScalar(rad).add(new T.Vector3(wG(), wG(), wG()).multiplyScalar(1400)));
    }
    function nearest3(px, py, pz) {
      var d1 = 1e18, d2 = 1e18, d3 = 1e18;
      for (var s = 0; s < seeds.length; s++) {
        var sd = seeds[s], dx = px - sd.x, dy = py - sd.y, dz = pz - sd.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < d1) { d3 = d2; d2 = d1; d1 = d; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) { d3 = d; }
      }
      return [d1, d2, d3];
    }
    var POS = [], COL = [], kinds = [], tries = 0, lim = COUNT * 30;
    var cWarm = [1.0, 0.95, 0.85], cGold = [1.0, 0.85, 0.63], cBlue = [0.85, 0.9, 1.0], cNode = [1.0, 0.91, 0.76];
    function add(px, py, pz, kind, t) {
      var roll = wr(), r, g2, b;
      if (kind === 2) { r = cNode[0]; g2 = cNode[1]; b = cNode[2]; }
      else if (roll < 0.75) { var m = wr() * 0.7; r = cWarm[0] + (cGold[0] - cWarm[0]) * m; g2 = cWarm[1] + (cGold[1] - cWarm[1]) * m; b = cWarm[2] + (cGold[2] - cWarm[2]) * m; }
      else if (roll < 0.93) { r = cBlue[0]; g2 = cBlue[1]; b = cBlue[2]; }
      else { r = cWarm[0]; g2 = cWarm[1]; b = cWarm[2]; }
      var base = kind === 2 ? 1.0 : kind === 1 ? 0.58 : 0.22;   // brighter nodes + filaments, walls still faint → clear filament↔void contrast reads from far out
      var bright = Math.min(1, base + t * (kind === 2 ? 0.1 : 0.5) * (0.6 + 0.4 * wr()));
      POS.push(px, py, pz); COL.push(r * bright, g2 * bright, b * bright); kinds.push(kind);
    }
    while (POS.length / 3 < COUNT && tries++ < lim) {
      var rad2 = Math.cbrt(R_IN * R_IN * R_IN + (R_OUT * R_OUT * R_OUT - R_IN * R_IN * R_IN) * wr());
      var ct = 2 * wr() - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * Math.PI * wr();
      var px = rad2 * st * Math.cos(ph), py = rad2 * ct, pz = rad2 * st * Math.sin(ph);
      var nn = nearest3(px, py, pz), gap2 = (nn[1] - nn[0]) / nn[0], gap3 = (nn[2] - nn[0]) / nn[0];
      var kind = -1, t = 0;
      if (gap3 < FILA_EPS) { kind = 1; t = 0.55 + 0.45 * (1 - gap3 / FILA_EPS); }
      else if (gap2 < WALL_EPS) { if (wr() < WALL_KEEP) { kind = 0; t = 0.15 + 0.25 * (1 - gap2 / WALL_EPS); } }
      if (kind < 0) continue;
      if (kind === 1 && Math.abs(nn[2] - nn[1]) / nn[0] < 0.03) { kind = 2; t = 1.0; }   // node (Voronoi vertex → cluster)
      px += wG() * 260; py += wG() * 260; pz += wG() * 260;
      add(px, py, pz, kind, t);
      if (kind === 2) { var nb = 18 + (wr() * 36) | 0, sig = 360 + wr() * 360; for (var q = 0; q < nb; q++) add(px + wG() * sig, py + wG() * sig, pz + wG() * sig, 2, 0.85 + 0.15 * wr()); }
    }
    var wgeo = new T.BufferGeometry();
    wgeo.setAttribute("position", new T.BufferAttribute(new Float32Array(POS), 3));
    wgeo.setAttribute("color", new T.BufferAttribute(new Float32Array(COL), 3));
    var wmat = new T.PointsMaterial({ map: DSO_SOFT, size: mobile ? 40 : 52, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    if ("toneMapped" in wmat) wmat.toneMapped = false;
    _cosmicWeb = new T.Points(wgeo, wmat); _cosmicWeb.name = "CosmicWeb"; _cosmicWeb.renderOrder = -6; _cosmicWeb.frustumCulled = false; _cosmicWeb.visible = false;
    belt.add(_cosmicWeb);
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
  var t0 = null, backdropMul = 1, zoomMul = 1, _bdCache = null;
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
    backdropMul = 1 - 0.9 * t;
    if (!_bdCache) {
      _bdCache = [];
      ["Starfield", "MilkyWayGalaxy", "MilkyWayGlow"].forEach(function (nm) {
        var o = group.getObjectByName(nm);
        if (o && o.material) _bdCache.push({ m: o.material, base: o.material.opacity, nm: nm });
      });
      if (starPoints && starPoints.material) _bdCache.push({ m: starPoints.material, base: starPoints.material.opacity, nm: "natalStars" });
    }
    for (var i = 0; i < _bdCache.length; i++) {
      var e = _bdCache[i], gal = (e.nm === "MilkyWayGalaxy" || e.nm === "MilkyWayGlow");
      // flying to the galactic-centre black hole, the galaxy STAYS (it's the context — the hole lives at its heart);
      // for a lone nebula the galaxy steps aside too. Constellations + starfield always fade so the wonder owns the frame.
      var keep = gal ? (keepGalaxy ? 1 : 0.14) : (e.nm === "Starfield" ? 0.45 : 0.4);
      e.m.opacity = e.base * (1 - (1 - keep) * t);
    }
  }
  var api = {
    group: group,
    starPoints: starPoints,
    tick: function (sec) {
      uniforms.uTime.value = sec;
      lineOpacities(sec);
      for (var _bi = 0; _bi < _bhSpin.length; _bi++) _bhSpin[_bi].rotateZ(0.004);   // (legacy) any spinning disc meshes
      for (var _bb = 0; _bb < _bhBB.length; _bb++) {                                // the Gargantua quad: advance its swirl + billboard it to face the camera
        var _e = _bhBB[_bb]; _e.u.uTime.value = sec;
        if (o.camera && _e.m.parent) { _e.m.parent.getWorldQuaternion(_bbPQ); o.camera.getWorldQuaternion(_bbCQ); _e.m.quaternion.copy(_bbPQ.invert().multiply(_bbCQ)); }
      }
      if (_cosmicWeb && o.camera) {                                                 // the cosmic web blooms in as the camera dollies out past the galaxy — earlier + brighter so it's unmissable
        var _cwo = Math.max(0, Math.min(1, (o.camera.position.length() - 3800) / 5000)) * 0.9;
        if (_cwo > 0.008) { _cosmicWeb.visible = true; _cosmicWeb.material.opacity = _cwo; } else if (_cosmicWeb.visible) { _cosmicWeb.visible = false; }
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
    setZodiacFade: function (t) { zoomMul = 1 - Math.max(0, Math.min(1, t)); },
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
