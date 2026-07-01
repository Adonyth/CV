/* ============================================================
   space.js — the "deep space" 3D layer for the homepage.
   M0: capability gate + motion state (Full / Calm / Flat).
   M1: a TRANSPARENT, additive, palette-locked Three.js canvas (#deep)
       BEHIND #field — never a second background; the beloved 2D
       particle field (home.js / #field) is never touched.
   M2: the deep-ember FUSION — one coupled particle system that fuses
       a celestial star-sphere (Fibonacci rest positions on a thick
       shell) with a quantum-vacuum haze (tangential swirl + FBM echo
       of home.js's flow()), tunable by uFusion (shipped midpoint).
       Built by Claude ⇄ Codex (two independent designs, fused).
   ============================================================ */
(function () {
  var root = document.documentElement;
  var MOTION_KEY = "cv-motion"; // full | calm | flat

  /* ---------------- M0 · capability gate ---------------- */
  function reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function isMobile() { try { return innerWidth < 700 || matchMedia("(pointer:coarse)").matches; } catch (e) { return innerWidth < 700; } }
  function lowPower() {
    var dm = navigator.deviceMemory || 8, hc = navigator.hardwareConcurrency || 8;
    return dm <= 4 || hc <= 4;
  }
  function webglOK() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return false;
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        var r = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
        if (r.indexOf("swiftshader") >= 0 || r.indexOf("llvmpipe") >= 0 || r.indexOf("software") >= 0) return false;
      }
      return true;
    } catch (e) { return false; }
  }
  function readMotion() { try { return localStorage.getItem(MOTION_KEY); } catch (e) { return null; } }

  function decideTier() {
    var stored = readMotion();
    if (stored === "flat") return "flat";
    if (reduced() || !webglOK()) return "flat";
    if (isMobile()) return "flat";      // mobile off-by-default (tap-to-enter is a later milestone)
    if (lowPower()) return "flat";
    return stored === "full" ? "full" : "calm"; // desktop default = Calm
  }

  var TIER = decideTier();
  window.__space = { tier: TIER, ready: false };
  if (TIER === "flat") return; // gate says Flat → nothing loads, today's site is byte-untouched.

  /* ---------------- M1 stage + M2 fusion ---------------- */
  var THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
  import(THREE_URL).then(function (THREE) {
    var canvas = document.getElementById("deep");
    if (!canvas) return;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, alpha: true, antialias: true,
      premultipliedAlpha: false, powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);            // transparent — NEVER a second background
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0a09, 0.0018); // fog === body colour --page; no back wall
    // NEVER set scene.background — one black on the page (CSS --page)

    var camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 1600);
    camera.position.set(0, 0, 60);

    var MOBILE = innerWidth < 700;
    function resize() {
      if (!camera) return;                          // (Codex M1 critique) guard the temporal dependency
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      if (deepFusion) deepFusion.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
    }

    // recreate home.js's exact GLOW sprite as the point texture (same brushstroke)
    var g = document.createElement("canvas"); g.width = g.height = 64;
    var b = g.getContext("2d"), grd = b.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,158,98,0.7)"); grd.addColorStop(0.3, "rgba(226,110,60,0.3)");
    grd.addColorStop(0.65, "rgba(194,93,60,0.08)"); grd.addColorStop(1, "rgba(194,93,60,0)");
    b.fillStyle = grd; b.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(g);

    /* ===== M2 · deep-ember fusion (Claude ⇄ Codex) ===== */
    var DEEP_VERTEX_SHADER = [
      "precision highp float;",
      "attribute vec3 aColor;", "attribute float aSize;", "attribute float aAlpha;",
      "attribute float aSeed;", "attribute float aSpark;",
      "uniform float uTime;", "uniform float uFusion;", "uniform float uPixelRatio;",
      "uniform float uMaxPointSize;", "uniform float uRefDepth;", "uniform float uAmplitude;", "uniform float uLayerKind;",
      // M10 reconciliation: carve a calm clearing around the orrery at world origin
      "uniform float uClearInner;", "uniform float uClearOuter;",
      "varying vec3 vColor;", "varying float vAlpha;",
      // aesthetic echo of home.js flow() at 0.42x phase — parallax, NOT a phase-lock
      "float flowEcho(vec3 p, float t){",
      "  float ft=t*0.42;",
      "  float xy=sin(p.x*0.0017+ft*0.18)+cos(p.y*0.0021-ft*0.14)+sin((p.x+p.y)*0.0012+ft*0.10);",
      "  float yz=sin((p.y+p.z)*0.00135+ft*0.16);",
      "  float zx=cos((p.z-p.x)*0.00110-ft*0.11);",
      "  return (xy+0.72*yz+0.54*zx)*1.7;",
      "}",
      "float fbmFlow(vec3 p, float t){",
      "  float v=0.0; float a=0.56;",
      "  for(int i=0;i<3;i++){ v+=a*flowEcho(p,t); p=p*1.73+vec3(47.1,-31.7,19.3); t*=1.19; a*=0.52; }",
      "  return v;",
      "}",
      "vec3 warpField(vec3 p, float t, float seed){",
      "  vec3 s=vec3(seed*71.0,seed*37.0,seed*19.0);",
      "  float x=fbmFlow(p+s+vec3(13.0,0.0,29.0),t);",
      "  float y=fbmFlow(p.yzx+s+vec3(-17.0,41.0,5.0),t+7.0);",
      "  float z=fbmFlow(p.zxy+s+vec3(31.0,-11.0,23.0),t-5.0);",
      "  return vec3(x,y,z);",
      "}",
      "vec3 safeNorm(vec3 v){ return normalize(v+vec3(0.00001,-0.00002,0.00003)); }",
      "void main(){",
      "  float f=clamp(uFusion,0.0,1.0);",
      "  float haze=pow(f,1.12);",
      "  vec3 normal=safeNorm(position);",
      "  vec3 p0=position;",
      "  vec3 firstWarp=warpField(p0*1.12,uTime,aSeed);",
      "  vec3 warpedDomain=p0+firstWarp*22.0;",
      "  vec3 flow=warpField(warpedDomain*1.08,uTime+11.0,aSeed+0.37);",
      // swirl ALONG the sphere surface (tangential) so the haze folds instead of sliding one way
      "  vec3 tangentA=safeNorm(cross(normal,safeNorm(flow)));",
      "  vec3 tangentB=safeNorm(cross(tangentA,normal));",
      "  float radial=fbmFlow(warpedDomain+vec3(5.0,17.0,-9.0),uTime+aSeed*3.1);",
      "  vec3 displacement=tangentA*flow.x+tangentB*flow.y*0.72+normal*radial*0.34;",
      "  displacement+=flow*0.18;",
      "  float dl=length(displacement);",
      "  displacement=safeNorm(displacement)*min(dl,2.15);",
      "  vec3 displaced=p0+displacement*uAmplitude*haze;",
      "  if(uLayerKind>0.5){ displaced+=normal*uAmplitude*(0.18+0.24*haze); }",
      "  vec3 worldPos=(modelMatrix*vec4(displaced,1.0)).xyz;",
      "  vec4 mvPosition=modelViewMatrix*vec4(displaced,1.0);",
      "  float depth=max(45.0,-mvPosition.z);",
      "  float twinkle=0.88+0.12*sin(uTime*(0.32+aSeed*0.18)+aSeed*6.28318+radial*0.55);",
      "  float sparkLift=mix(1.0,1.16,aSpark);",
      "  float pointSize=aSize*uPixelRatio*(uRefDepth/depth)*twinkle*sparkLift;",
      "  gl_PointSize=clamp(pointSize,1.0,uMaxPointSize);",
      "  gl_Position=projectionMatrix*mvPosition;",
      "  float nearPresence=smoothstep(0.18,0.72,f);",
      "  float farHazeDimming=mix(1.0,0.46,smoothstep(0.62,1.0,f));",
      "  float layerPresence=mix(farHazeDimming,nearPresence,step(0.5,uLayerKind));",
      "  float breath=0.82+0.18*sin(uTime*0.21+aSeed*12.9898);",
      // fade embers OUT of the pocket the orrery sits in (>=uClearOuter untouched)
      "  float clearing=smoothstep(uClearInner,uClearOuter,length(worldPos));",
      "  vAlpha=aAlpha*layerPresence*breath*clearing;",
      "  vColor=aColor;",
      "}"
    ].join("\n");

    var DEEP_FRAGMENT_SHADER = [
      "precision mediump float;",
      "uniform sampler2D uMap;", "varying vec3 vColor;", "varying float vAlpha;",
      "void main(){",
      "  vec4 sprite=texture2D(uMap,gl_PointCoord);",
      "  float alpha=sprite.a*vAlpha;",
      "  if(alpha<0.003) discard;",
      "  gl_FragColor=vec4(vColor*sprite.rgb,alpha);",
      "}"
    ].join("\n");

    function mulberry32(seed) {
      return function () {
        var t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function lerp(a, bb, t) { return a + (bb - a) * t; }
    function coreColRGB(h, spark) { return spark ? [1.0, 228 / 255, 190 / 255] : [1.0, (150 + 45 * h) / 255, (96 + 34 * h) / 255]; }

    function buildDeepLayerGeometry(kind, count, seed) {
      var rnd = mulberry32(seed);
      var pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
      var size = new Float32Array(count), alpha = new Float32Array(count), seeds = new Float32Array(count), sparks = new Float32Array(count);
      var golden = Math.PI * (3 - Math.sqrt(5));
      for (var i = 0; i < count; i++) {
        var u = (i + 0.5) / count, y = 1 - 2 * u, r = Math.sqrt(Math.max(0, 1 - y * y));
        var theta = i * golden + (rnd() - 0.5) * 0.018;
        var x = Math.cos(theta) * r, z = Math.sin(theta) * r, shellJitter = rnd(), k = i * 3;
        if (kind === "far") {
          var shellR = lerp(285, 405, Math.pow(shellJitter, 0.72)), ob = 0.92 + rnd() * 0.08;
          pos[k] = x * shellR; pos[k + 1] = y * shellR * ob; pos[k + 2] = z * shellR;
        } else {
          var hazeR = lerp(42, 190, Math.pow(shellJitter, 0.46)), lobe = 0.72 + 0.28 * Math.sin(theta * 2.0 + y * 4.0);
          pos[k] = x * hazeR * 1.32; pos[k + 1] = y * hazeR * 0.74; pos[k + 2] = z * hazeR * 0.92 + lobe * 28;
        }
        var spark = rnd() < 0.06 ? 1 : 0, ember = rnd() < 0.22, hue = rnd(), c = coreColRGB(hue, spark);
        col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
        if (kind === "far") {
          size[i] = spark ? lerp(2.7, 4.8, rnd()) : ember ? lerp(2.0, 4.1, rnd()) : lerp(1.05, 2.2, rnd());
          alpha[i] = spark ? lerp(0.48, 0.72, rnd()) : ember ? lerp(0.34, 0.58, rnd()) : lerp(0.18, 0.42, rnd());
        } else {
          size[i] = spark ? lerp(10.0, 17.5, rnd()) : ember ? lerp(7.2, 14.2, rnd()) : lerp(4.4, 8.6, rnd());
          alpha[i] = spark ? lerp(0.18, 0.34, rnd()) : ember ? lerp(0.13, 0.25, rnd()) : lerp(0.07, 0.16, rnd());
        }
        seeds[i] = rnd(); sparks[i] = spark;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
      geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
      geo.setAttribute("aSpark", new THREE.BufferAttribute(sparks, 1));
      geo.computeBoundingSphere();
      return geo;
    }

    function createDeepEmberFusion(opts) {
      var mobile = !!opts.mobile, calm = opts.tier !== "full";
      // far budget yields ~100 points to the M11 natal star-layer so the total stays 11000 / 5000
      var farCount = mobile ? 4900 : 10900, nearCount = mobile ? 0 : 3000;
      var common = {
        uMap: { value: tex }, uTime: { value: 0 }, uFusion: { value: 0.52 },
        uPixelRatio: { value: Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2) },
        // clearing DISABLED until the orrery mounts (smoothstep(-2,-1,len)==1 → no fade anywhere)
        uClearInner: { value: -2.0 }, uClearOuter: { value: -1.0 }
      };
      function makeMaterial(layerKind, maxPointSize, refDepth, amplitude) {
        return new THREE.ShaderMaterial({
          uniforms: {
            uMap: common.uMap, uTime: common.uTime, uFusion: common.uFusion, uPixelRatio: common.uPixelRatio,
            uClearInner: common.uClearInner, uClearOuter: common.uClearOuter,
            uMaxPointSize: { value: maxPointSize }, uRefDepth: { value: refDepth }, uAmplitude: { value: amplitude }, uLayerKind: { value: layerKind }
          },
          vertexShader: DEEP_VERTEX_SHADER, fragmentShader: DEEP_FRAGMENT_SHADER,
          transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
        });
      }
      var grp = new THREE.Group(); grp.name = "deepEmbers"; grp.position.set(0, 0, -355);
      var farGeo = buildDeepLayerGeometry("far", farCount, 0xC0DE122);
      var farMat = makeMaterial(0.0, mobile ? 8.0 : 10.0, 330.0, calm ? 74.0 : 96.0);
      var farShell = new THREE.Points(farGeo, farMat); farShell.frustumCulled = false; grp.add(farShell);
      var nearGeo = null, nearMat = null, nearHaze = null;
      if (nearCount > 0) {
        nearGeo = buildDeepLayerGeometry("near", nearCount, 0xF0510A2);
        nearMat = makeMaterial(1.0, 24.0, 165.0, calm ? 42.0 : 58.0);
        nearHaze = new THREE.Points(nearGeo, nearMat); nearHaze.position.set(0, -8, 150); nearHaze.frustumCulled = false; grp.add(nearHaze);
      }
      scene.add(grp);
      return {
        group: grp, farCount: farCount, nearCount: nearCount, uniforms: common,
        setPixelRatio: function (dpr) { common.uPixelRatio.value = Math.min(dpr || 1, mobile ? 1.5 : 2); },
        setFusion: function (v) { common.uFusion.value = Math.max(0, Math.min(1, v)); },
        applyTheme: function (dark) { var bl = dark ? THREE.AdditiveBlending : THREE.NormalBlending; farMat.blending = bl; farMat.needsUpdate = true; if (nearMat) { nearMat.blending = bl; nearMat.needsUpdate = true; } },
        tick: function (sec) {
          common.uTime.value = sec;
          var slow = calm ? 0.0042 : 0.0062;
          grp.rotation.y = sec * slow; grp.rotation.x = Math.sin(sec * 0.027) * 0.025; farShell.rotation.z = Math.sin(sec * 0.018) * 0.018;
          if (nearHaze) { nearHaze.rotation.y = -sec * slow * 0.58; nearHaze.rotation.z = Math.sin(sec * 0.041) * 0.035; }
        },
        dispose: function () { scene.remove(grp); farGeo.dispose(); farMat.dispose(); if (nearGeo) nearGeo.dispose(); if (nearMat) nearMat.dispose(); }
      };
    }

    var deepFusion = createDeepEmberFusion({ mobile: MOBILE, tier: TIER });
    resize(); addEventListener("resize", resize);

    // theme sync + Codex's light-mode insight: in light theme lower the fusion so it reads luminous, not dusty
    function applyTheme() {
      var dark = root.getAttribute("data-theme") === "dark";
      deepFusion.applyTheme(dark);
      deepFusion.setFusion(dark ? 0.52 : 0.34);
      if (natalSky) natalSky.applyTheme(dark);
    }
    applyTheme();
    new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    // honor field-off (3D over nothing looks broken)
    function syncField() { var off = document.body.classList.contains("field-off"); canvas.style.display = off ? "none" : "block"; if (natalSky) natalSky.setVisible(!off); }
    syncField();
    new MutationObserver(syncField).observe(document.body, { attributes: true, attributeFilter: ["class"] });

    // fade in only after the field's 730ms intro has settled
    canvas.style.opacity = "0"; canvas.style.transition = "opacity 1.6s ease";
    setTimeout(function () { canvas.style.opacity = "1"; }, 950);

    /* ===== M10 · the REAL Nye Clock orrery, merged into THIS scene =====
       One scene, one camera, one fog — so the orrery and the embers share
       real depth (no more two-layer "crossing"). It sits at world origin as
       the axis; the shader clearing (above) opens a calm pocket around it. */
    var nyeArmature = null;
    // TEMP REVERT (2026-07-01): the merged orrery regressed "see the whole Nye Clock" — space.js's
    // single camera frames the Sun-centered spread-out layout, not the beloved Earth-centered
    // instrument, and the real clock is meant to be orbited/zoomed (controls.target=earth, min8/max340).
    // Reverted to the iframe backdrop while the interactive Earth-centered + natal-constellation
    // version is designed & verified. Flip MOUNT_NYE=true (and remove the iframe) to re-enable.
    var MOUNT_NYE = false;
    if (MOUNT_NYE) import("./nye-armature.js").then(function (mod) {
      try {
        nyeArmature = mod.mountNyeArmature(THREE, scene, {
          instant: new Date(2002, 0, 2, 15, 45, 0, 0),
          warm: true,
          scale: MOBILE ? 0.82 : 0.92
        });
        // reconcile: open the clearing so embers don't cross the orrery
        deepFusion.uniforms.uClearInner.value = 26.0;
        deepFusion.uniforms.uClearOuter.value = 56.0;
        window.__space.nye = nyeArmature;
        window.__space.setNyeScale = function (s) { if (nyeArmature) nyeArmature.group.scale.setScalar(s); };
        window.__space.setClearing = function (i, o) { deepFusion.uniforms.uClearInner.value = i; deepFusion.uniforms.uClearOuter.value = o; };
      } catch (e) { window.__space.nyeError = String(e); }
    }).catch(function (e) { window.__space.nyeError = String(e); });

    /* ===== M11 · the natal celestial sphere =====
       An additive star-layer INSIDE the deep-ember group: the zodiac
       constellations are the far-field of the same cosmos, each star a real
       piece of the work (☉→Capricorn 主外, ☾→Leo 主内). Same shader, same
       GLOW sprite, same budget. #deep stays pointer-events:none; picking is a
       window raycaster. The iframe Nye Clock is untouched. */
    var natalSky = null;
    fetch("data/natal-sky.json").then(function (r) { return r.json(); }).then(function (natalData) {
      return import("./natal-sky.js").then(function (mod) {
        natalSky = mod.buildNatalSky(THREE, scene, natalData, {
          tex: tex, vertexShader: DEEP_VERTEX_SHADER, fragmentShader: DEEP_FRAGMENT_SHADER,
          group: deepFusion.group, R_STAR: 372, mobile: MOBILE, calm: (TIER !== "full"),
          camera: camera, interactive: true
        });
        natalSky.applyTheme(root.getAttribute("data-theme") === "dark");
        natalSky.setVisible(!document.body.classList.contains("field-off"));
        window.__space.natal = natalSky;
        window.__space.natalStats = natalSky.stats;
      });
    }).catch(function (e) { window.__space.natalError = String(e); });

    var running = true;
    function frame(t) {
      if (!running) return;
      var sec = (t || 0) * 0.001;
      deepFusion.tick(sec);
      if (nyeArmature) nyeArmature.tick(sec);
      if (natalSky) natalSky.tick(sec);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) running = false; else if (!running) { running = true; requestAnimationFrame(frame); }
    });

    // hooks for verification / governor / future scroll-driven fusion
    window.__space.ready = true;
    window.__space.canvas = canvas;
    window.__space.setOpacity = function (o) { canvas.style.opacity = String(o); };
    window.__space.setFusion = deepFusion.setFusion;
    window.__space.fusionStats = {
      farCount: deepFusion.farCount, nearCount: deepFusion.nearCount,
      shippedFusion: deepFusion.uniforms.uFusion.value,
      pointClamps: MOBILE ? "far<=8, near disabled" : "far<=10, near<=24"
    };
    window.__space.teardown = function () {
      running = false; try { if (nyeArmature) nyeArmature.dispose(); deepFusion.dispose(); tex.dispose(); renderer.dispose(); } catch (e) {}
      canvas.style.display = "none"; window.__space.ready = false;
    };
  }).catch(function (e) { window.__space.error = String(e); });
})();
