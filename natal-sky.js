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
      var pos = eclVec(e.lon + delta, e.lat, R);
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
    uMaxPointSize: { value: mobile ? 11.0 : 16.0 }, uRefDepth: { value: 640.0 }, // lift constellation stars above the drifting field
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
  var isDark = true, hlSet = {}, hoverCon = -1, conClickCb = null;
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
    var base = c.loadBearing ? 1.0 : 0.92;
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
  function giantTexture(kind) {
    var cv = document.createElement("canvas"); cv.width = 64; cv.height = 256;
    var ctx = cv.getContext("2d");
    var g = ctx.createLinearGradient(0, 0, 0, 256);
    var stops = (kind === "jupiter")
      ? [[0, "#c9a97e"], [.12, "#e2c79a"], [.2, "#b98f66"], [.28, "#e8d3ab"], [.36, "#c19a70"], [.44, "#ecd9b4"], [.5, "#a67f5c"], [.56, "#e5cda4"], [.66, "#c4a077"], [.74, "#ead6ae"], [.84, "#bd9269"], [1, "#cfae83"]]
      : [[0, "#cbb383"], [.18, "#e3d2a6"], [.34, "#c7ab7b"], [.5, "#ead9ae"], [.62, "#c9b083"], [.78, "#e6d4a8"], [1, "#c3a878"]];
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
    var tex = new T.CanvasTexture(cv);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
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
    var cv = document.createElement("canvas"); cv.width = 256; cv.height = 8;
    var ctx = cv.getContext("2d");
    var g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "rgba(214,190,140,0)"); g.addColorStop(.12, "rgba(222,199,150,.5)");
    g.addColorStop(.38, "rgba(201,175,124,.26)"); g.addColorStop(.47, "rgba(160,138,96,.05)");
    g.addColorStop(.56, "rgba(226,205,158,.46)"); g.addColorStop(.85, "rgba(210,186,136,.3)"); g.addColorStop(1, "rgba(210,186,136,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 8);
    var tex = new T.CanvasTexture(cv);
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  (data.planets || []).forEach(function (p) {
    if (!p.body) return;
    var lon2 = p.eclLonDeg * Math.PI / 180, lat2 = (p.eclLatDeg || 0) * Math.PI / 180;
    var grp = new T.Group();
    grp.name = "Natal" + p.id.charAt(0).toUpperCase() + p.id.slice(1);
    grp.position.copy(eclVec(lon2, lat2, p.body.dist));
    var mesh = new T.Mesh(new T.SphereGeometry(p.body.radius, 48, 32), giantMaterial(giantTexture(p.body.kind)));
    mesh.name = grp.name + "Mesh";
    mesh.userData.nyePick = p.id;
    grp.add(mesh);
    if (p.body.ringInner) {
      var rIn = p.body.radius * p.body.ringInner, rOut = p.body.radius * p.body.ringOuter;
      var rg = new T.RingGeometry(rIn, rOut, 96, 1);
      var pos2 = rg.getAttribute("position"), uv2 = rg.getAttribute("uv");
      for (var vi = 0; vi < pos2.count; vi++) {                       // radial uv → the gradient reads as ring bands
        var rr = Math.sqrt(pos2.getX(vi) * pos2.getX(vi) + pos2.getY(vi) * pos2.getY(vi));
        uv2.setXY(vi, (rr - rIn) / (rOut - rIn), 0.5);
      }
      var ring = new T.Mesh(rg, new T.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: T.DoubleSide, depthWrite: false, fog: false }));
      ring.name = grp.name + "Ring";
      ring.rotation.x = (p.body.ringTiltDeg || 26.7) * Math.PI / 180;  // the belt's ecliptic is the XY plane; tilt off it
      ring.userData.nyePick = p.id;
      grp.add(ring);
    }
    bodyGroup.add(grp);
  });

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
  var tip = null, raycaster = null, ndc = null, hovered = -1, onMove = null, onClick = null;
  if (interactive) {
    raycaster = new T.Raycaster(); raycaster.params.Points.threshold = mobile ? 14 : 11;
    ndc = new T.Vector2();
    tip = document.createElement("div"); tip.className = "natal-tip"; tip.setAttribute("role", "status");
    tip.style.cssText = "position:fixed;pointer-events:none;z-index:5;opacity:0;transition:opacity .18s ease;transform:translate(12px,12px);max-width:280px;";
    (document.querySelector(".content") || document.body).appendChild(tip);

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
          tip.style.opacity = "1"; document.body.style.cursor = "pointer";
          bloom(nodeIndex[idx].pos);
        } else { tip.style.opacity = "0"; document.body.style.cursor = ""; }
      }
      if (idx >= 0) { tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; }
    };
    onClick = function (e) {
      var pk2 = pick(e.clientX, e.clientY);
      var idx = pk2.node;
      if (idx < 0) {
        // a click on the constellation itself (not a work-star): hand it to the host —
        // every element has the right to become the pivot
        if (pk2.con >= 0 && conClickCb) conClickCb(cons[pk2.con].id);
        return;
      }
      var href = nodeIndex[idx].node.href;
      if (href && href.charAt(0) === "#") { var t = document.querySelector(href); if (t) { t.scrollIntoView({ behavior: "smooth", block: "start" }); } }
      else if (href) { location.href = href; }
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
    getConCentroid: function (id) {
      var ci = lineByCon[id]; if (ci == null || !conCentroid[ci]) return null;
      return belt.localToWorld(conCentroid[ci].clone());
    },
    onConstellationClick: function (cb) { conClickCb = cb; },
    setVisible: function (v) {
      group.visible = !!v;
      if (!v) { hoverCon = -1; if (tip) { tip.style.opacity = "0"; hovered = -1; document.body.style.cursor = ""; } }
    },
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
    setStarScale: function (v) { uniforms.uRefDepth.value = 640 * v; },
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
