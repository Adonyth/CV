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
  stars.forEach(function (st, i) {
    var k = i * 3; pos[k] = st.pos.x; pos[k + 1] = st.pos.y; pos[k + 2] = st.pos.z;
    var magF = Math.max(0.06, Math.min(1, (6.5 - st.mag) / 6.0));
    var w = magF * (0.55 + 0.45 * st.importance);
    var spark = (st.importance === 1.0) ? 1 : (st.mag < 1.6 ? 1 : 0);
    var h = hash(i * 7 + 3);
    var c = coreCol(h, spark);
    col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
    aSize[i] = lerp(1.5, 6.0, w) + (st.importance === 1.0 ? 2.2 : 0);   // data-nodes read as the bright stars
    aAlpha[i] = Math.min(0.98, lerp(0.30, 0.86, w) * (st.importance === 1.0 ? 1.15 : 1.0));
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
    uMaxPointSize: { value: mobile ? 8.0 : 10.0 }, uRefDepth: { value: 560.0 }, // lift far-hemisphere stars into visibility
    uAmplitude: { value: 6.0 },              // near-frozen: figures hold their shape
    uLayerKind: { value: 0.0 }, uClearInner: { value: -2.0 }, uClearOuter: { value: -1.0 }
  };
  var starMat = new T.ShaderMaterial({
    uniforms: uniforms, vertexShader: o.vertexShader, fragmentShader: o.fragmentShader,
    transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending
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
  var isDark = true, hlSet = {};
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
    var lp = new Float32Array(segs.length * 6);
    segs.forEach(function (s, i) {
      lp[i * 6] = s.a.x; lp[i * 6 + 1] = s.a.y; lp[i * 6 + 2] = s.a.z;
      lp[i * 6 + 3] = s.b.x; lp[i * 6 + 4] = s.b.y; lp[i * 6 + 5] = s.b.z;
    });
    totalSegs += segs.length;
    var lgeo = new T.BufferGeometry();
    lgeo.setAttribute("position", new T.BufferAttribute(lp, 3));
    var base = c.loadBearing ? 0.66 : 0.32;
    var mat = new T.LineBasicMaterial({ color: 0xe0876a, transparent: true, opacity: base, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false });
    var fl = new T.LineSegments(lgeo, mat);
    fl.frustumCulled = false; fl.name = "natalFigure_" + c.id;
    belt.add(fl);
    lineEntries[ci] = { mat: mat, base: base, geo: lgeo };
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
    var ch = GLYPH[p.id]; if (!ch || typeof document === "undefined") return;
    var lon = p.eclLonDeg * Math.PI / 180, lat = (p.eclLatDeg || 0) * Math.PI / 180;
    var big = (p.id === "sun" || p.id === "moon");
    var sp = glyphSprite(ch, big ? 1.6 : 1.1, big);
    sp.position.copy(eclVec(lon, lat, R * 0.965));
    sp.userData.planet = p.id;
    belt.add(sp); planetSprites.push(sp);
  });

  // orient the whole sky so the Sun-sign (Capricornus) greets the camera (+z) at rest, then drift slowly
  (function () {
    var sunP = (data.planets || []).filter(function (p) { return p.id === "sun"; })[0];
    if (!sunP) return;
    var v = eclVec(sunP.eclLonDeg * Math.PI / 180, (sunP.eclLatDeg || 0) * Math.PI / 180, 1).applyAxisAngle(new T.Vector3(1, 0, 0), EPS);
    // rotate azimuth(sun) → π (the −z the camera looks into): ☉ Capricornus greets the viewer
    group.rotation.y = Math.PI - Math.atan2(v.x, v.z);
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
    var m = new T.SpriteMaterial({ map: loc === "zh" ? zhTex : enTex, transparent: true, opacity: key ? 0.96 : 0.62, depthWrite: false, depthTest: false, blending: T.NormalBlending, fog: false });
    if ("toneMapped" in m) m.toneMapped = false;
    var sp = new T.Sprite(m);
    var sc = key ? 40 : 27;
    sp.scale.set(sc, sc * 224 / 512, 1);
    sp.userData.baseOpacity = m.opacity;
    sp.userData.zhTex = zhTex; sp.userData.enTex = enTex;
    return sp;
  }
  function pageLocale() {
    try { return document.documentElement.className.indexOf("locale-zh") >= 0 ? "zh" : "en"; } catch (e) { return "en"; }
  }
  var nameSprites = [];
  if (typeof document !== "undefined") {
    var loc0 = pageLocale();
    cons.forEach(function (c, ci) {
      var sp = makeNameSprite(c.name.zh, c.name.en, c.loadBearing, loc0);
      sp.position.copy(conCentroid[ci]).multiplyScalar(1.10);
      belt.add(sp); nameSprites[ci] = sp;
    });
  }
  /* soft halos behind the stars that carry weight (data-nodes + the two natal figures) */
  (function () {
    stars.forEach(function (st) {
      var key = cons[st.conIdx].loadBearing;
      if (!st.node && !(key && st.importance >= 0.7)) return;
      var m = new T.SpriteMaterial({ map: o.tex, transparent: true, opacity: st.node ? 0.5 : 0.28, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false });
      if ("toneMapped" in m) m.toneMapped = false;
      var h = new T.Sprite(m);
      var sc = st.node ? 11 : 6.5;
      h.scale.set(sc, sc, 1); h.position.copy(st.pos);
      belt.add(h);
    });
  })();

  /* ---------------- interaction: window raycaster (never touches #deep) ---------------- */
  var tip = null, raycaster = null, ndc = null, hovered = -1, onMove = null, onClick = null;
  if (interactive) {
    raycaster = new T.Raycaster(); raycaster.params.Points.threshold = mobile ? 10 : 7;
    ndc = new T.Vector2();
    tip = document.createElement("div"); tip.className = "natal-tip"; tip.setAttribute("role", "status");
    tip.style.cssText = "position:fixed;pointer-events:none;z-index:5;opacity:0;transition:opacity .18s ease;transform:translate(12px,12px);max-width:280px;";
    (document.querySelector(".content") || document.body).appendChild(tip);

    function pickAt(cx, cy) {
      ndc.x = (cx / innerWidth) * 2 - 1; ndc.y = -(cy / innerHeight) * 2 + 1;
      raycaster.setFromCamera(ndc, o.camera);
      var hits = raycaster.intersectObject(starPoints, false);
      for (var i = 0; i < hits.length; i++) { if (nodeIndex[hits[i].index]) return hits[i].index; }
      return -1;
    }
    onMove = function (e) {
      if (!group.visible) return;
      var idx = pickAt(e.clientX, e.clientY);
      if (idx === hovered) { if (idx >= 0) { tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; } return; }
      hovered = idx;
      if (idx >= 0) {
        var nd = nodeIndex[idx].node;
        tip.innerHTML = '<div class="natal-tip__t"><span class="i18n-en">' + nd.title.en + '</span><span class="i18n-zh">' + nd.title.zh + '</span></div>' +
          (nd.role ? '<div class="natal-tip__r">' + nd.role + '</div>' : "");
        tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.style.opacity = "1";
        document.body.style.cursor = "pointer";
        bloom(nodeIndex[idx].pos);
      } else { tip.style.opacity = "0"; document.body.style.cursor = ""; }
    };
    onClick = function (e) {
      var idx = pickAt(e.clientX, e.clientY);
      if (idx < 0) return;
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
  function updateLabels() {
    for (var ci = 0; ci < nameSprites.length; ci++) {
      var sp = nameSprites[ci]; if (!sp) continue;
      var want = hlSet[cons[ci].id] ? 1.0 : sp.userData.baseOpacity;
      sp.material.opacity += (want - sp.material.opacity) * 0.12;
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
      var hl = hlSet[cons[ci].id] ? 1.7 : 1;
      e.mat.opacity = Math.min(0.95, e.base * (isDark ? 1 : 1.18) * pulse * hl);
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
      for (var i = 0; i < lineEntries.length; i++) { var e = lineEntries[i]; if (!e) continue; e.mat.blending = bl; e.mat.needsUpdate = true; }
    },
    highlight: function (id, on) {
      if (lineByCon[id] == null) return;
      hlSet[id] = !!on;
      var ci = lineByCon[id];
      if (on && conCentroid[ci]) bloom(conCentroid[ci]);
    },
    setVisible: function (v) {
      group.visible = !!v;
      if (!v && tip) { tip.style.opacity = "0"; hovered = -1; document.body.style.cursor = ""; }
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
    setStarScale: function (v) { uniforms.uRefDepth.value = 560 * v; },
    stats: { stars: N, segments: totalSegs, dataNodes: nodeIndex.filter(Boolean).length, planets: planetSprites.length, constellations: cons.length },
    dispose: function () {
      if (onMove) removeEventListener("pointermove", onMove);
      if (onClick) removeEventListener("click", onClick);
      if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
      (o.group || scene).remove(group);
      geo.dispose(); starMat.dispose();
      for (var i = 0; i < lineEntries.length; i++) { var e = lineEntries[i]; if (e) { e.geo.dispose(); e.mat.dispose(); } }
      planetSprites.forEach(function (s) { if (s.material.map) s.material.map.dispose(); s.material.dispose(); });
    }
  };
  return api;
}
