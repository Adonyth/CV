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
  var COSMOS = document.body.classList.contains("cosmos");
  if (COSMOS && TIER !== "flat") {   // belt & braces: the 3D page must never show the flat wall
    var flatBB = document.getElementById("cosmos-flat"); if (flatBB) flatBB.hidden = true;
  }
  if (TIER === "flat") {
    // one-world page has no scroll content — show the graceful flat fallback
    if (COSMOS) {
      var flatEl = document.getElementById("cosmos-flat"); if (flatEl) flatEl.hidden = false;
      var hintEl = document.getElementById("cosmos-hint"); if (hintEl) hintEl.style.display = "none";
    }
    return;
  }

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
    /* cosmos: the camera orbits the world with the REAL Nye Clock's premium
       trackball — world-space angular velocity about ANY axis, up-vector riding
       along (ported from nye-clock-bazi.html createPremiumOrbitControls).
       No pole lock, no plane that fights the hand. */
    function createPremiumOrbitControls(cam, domElement, T3) {
      var target = new T3.Vector3();
      var minDistance = 8, maxDistance = 340;
      var angVel = new T3.Vector3();
      var tmpPull = new T3.Vector3(0, 0.22, 1);
      var rotateSpeed = 0.00032, maxEventDelta = 0.008, dampingFactor = 0.036, zoomStep = 0.031, pinchGamma = 0.79;
      function safeLookAtTarget() {
        var dx = target.x - cam.position.x, dy = target.y - cam.position.y, dz = target.z - cam.position.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!isFinite(d) || d < 1e-5) {
          tmpPull.set(0, 0.22, 1).normalize().multiplyScalar(Math.max(minDistance, 2.2));
          cam.position.copy(target).add(tmpPull); cam.up.set(0, 1, 0);
        }
        cam.lookAt(target);
      }
      function safeOrbitOffset() {
        var off = cam.position.clone().sub(target);
        if (!isFinite(off.length()) || off.length() < 1e-8) {
          tmpPull.set(0, 0.22, 1).normalize().multiplyScalar(Math.max(minDistance, 2.2));
          cam.position.copy(target).add(tmpPull); cam.up.set(0, 1, 0); safeLookAtTarget();
          off.copy(cam.position).sub(target);
        }
        return off;
      }
      var activePointers = {}, pinchActive = false, pinchLastDist = 0, dragging = false, lastX = 0, lastY = 0;
      function getPinchDist() {
        var ids = Object.keys(activePointers); if (ids.length < 2) return 0;
        var a = activePointers[ids[0]], b = activePointers[ids[1]];
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
      }
      function applyAngVel(av) {
        var len = av.length(); if (len < 1e-10 || !isFinite(len)) return;
        var axis = av.clone().normalize();
        if (!isFinite(axis.x + axis.y + axis.z) || axis.lengthSq() < 1e-20) return;
        var q = new T3.Quaternion().setFromAxisAngle(axis, len);
        var off = cam.position.clone().sub(target).applyQuaternion(q);
        cam.position.copy(target).add(off);
        cam.up.applyQuaternion(q);
        safeLookAtTarget();
      }
      var scope = {
        target: target,
        setDistanceLimits: function (mn, mx) { minDistance = mn; maxDistance = mx; },
        setInteractionTuning: function (o2) {
          if (!o2) return;
          if (o2.rotateSpeed != null) rotateSpeed = o2.rotateSpeed;
          if (o2.maxEventDelta != null) maxEventDelta = o2.maxEventDelta;
          if (o2.dampingFactor != null) dampingFactor = o2.dampingFactor;
          if (o2.zoomStep != null) zoomStep = o2.zoomStep;
          if (o2.pinchGamma != null) pinchGamma = o2.pinchGamma;
        },
        clearDelta: function () { angVel.set(0, 0, 0); },
        rotateWorld: function (axis, ang) {                 // idle turn / glides ride the same math
          var q = new T3.Quaternion().setFromAxisAngle(axis, ang);
          var off = cam.position.clone().sub(target).applyQuaternion(q);
          cam.position.copy(target).add(off); cam.up.applyQuaternion(q); safeLookAtTarget();
        },
        setRadius: function (r) {
          var off = safeOrbitOffset(); var r0 = off.length(); if (!isFinite(r0) || r0 < 1e-8) return;
          off.normalize(); cam.position.copy(target).add(off.multiplyScalar(Math.max(minDistance, Math.min(maxDistance, r))));
          safeLookAtTarget();
        },
        getRadius: function () { return cam.position.distanceTo(target); },
        update: function () {
          applyAngVel(angVel);
          angVel.multiplyScalar(1 - dampingFactor);
          if (angVel.lengthSq() < 1e-14) angVel.set(0, 0, 0);
          var off = safeOrbitOffset(); var r = off.length();
          if (!isFinite(r) || r < 1e-8) return;
          if (r < minDistance || r > maxDistance) {
            r = Math.max(minDistance, Math.min(maxDistance, r));
            off.normalize(); cam.position.copy(target).add(off.multiplyScalar(r)); safeLookAtTarget();
          }
        }
      };
      function addRotation(dx, dy) {
        cam.updateMatrixWorld();
        var right = new T3.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        var up = new T3.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        function clp(v) { return Math.max(-maxEventDelta, Math.min(maxEventDelta, v)); }
        angVel.addScaledVector(up, clp(-dx * rotateSpeed));
        angVel.addScaledVector(right, clp(-dy * rotateSpeed));
      }
      function onDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;   // right/middle stay free for PAN
        activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        try { domElement.setPointerCapture(e.pointerId); } catch (_) {}
        if (Object.keys(activePointers).length >= 2) { pinchActive = true; pinchLastDist = getPinchDist(); dragging = false; }
        else { dragging = true; lastX = e.clientX; lastY = e.clientY; }
        domElement.style.cursor = "grabbing";
      }
      function onMove(e) {
        if (!(e.pointerId in activePointers)) { return; }
        activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (pinchActive) {
          var d = getPinchDist();
          if (pinchLastDist > 0 && d > 0) {
            var off = safeOrbitOffset();
            var ratio = Math.pow(Math.max(0.25, Math.min(4, pinchLastDist / d)), pinchGamma);
            var r0 = off.length(); if (!isFinite(r0) || r0 < 1e-8) return;
            var r = Math.max(minDistance, Math.min(maxDistance, r0 * ratio));
            off.normalize(); cam.position.copy(target).add(off.multiplyScalar(r));
          }
          pinchLastDist = d; e.stopPropagation(); return;
        }
        if (!dragging) return;
        addRotation(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
        e.stopPropagation();
      }
      function onUp(e) {
        delete activePointers[e.pointerId];
        var ids = Object.keys(activePointers);
        if (ids.length < 2) pinchActive = false;
        if (ids.length === 1) { var rem = activePointers[ids[0]]; lastX = rem.x; lastY = rem.y; dragging = true; }
        else if (ids.length === 0) { dragging = false; domElement.style.cursor = "grab"; }
        try { if (e && e.pointerId != null) domElement.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      domElement.addEventListener("pointerdown", onDown, true);
      domElement.addEventListener("pointermove", onMove, true);
      domElement.addEventListener("pointerup", onUp, true);
      domElement.addEventListener("pointercancel", onUp, true);
      domElement.addEventListener("wheel", function (e) {
        e.preventDefault();
        var off = safeOrbitOffset(); var r0 = off.length(); if (!isFinite(r0) || r0 < 1e-8) return;
        var norm = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
        var r = Math.max(minDistance, Math.min(maxDistance, r0 * (1 + Math.sign(norm) * zoomStep)));
        off.normalize(); cam.position.copy(target).add(off.multiplyScalar(r));
        e.stopPropagation();
      }, { passive: false, capture: true });
      return scope;
    }

    var controls = null;
    var fieldEl2 = document.getElementById("field"), fmT2 = 0;
    /* parallax lock: project a world-fixed far point; its per-frame screen delta is
       handed to the 2D star-sky so BOTH layers turn as ONE celestial sphere */
    var _refFar = null, _refPrev = { x: 0, y: 0, ok: false };
    var HOME = new THREE.Vector3(0, 0, 0), UP_Y = new THREE.Vector3(0, 1, 0);
    var lastTouch = 0, userMoved = false, entranceUntil = 0;
    var glide = { frames: 0, axis: null, step: 0, distTarget: 0 };
    if (COSMOS) {
      // entrance: arrive from deep space; the frame loop eases the radius home
      camera.position.set(HOME.x - 116, HOME.y + 88, HOME.z + 102);
      camera.lookAt(HOME);
      controls = createPremiumOrbitControls(camera, canvas, THREE);
      controls.target.copy(HOME);
      controls.setDistanceLimits(3.2, 430);
      controls.setInteractionTuning({ rotateSpeed: 0.00050, dampingFactor: 0.042, zoomStep: 0.045, maxEventDelta: 0.014 });
      entranceUntil = performance.now() + 4600;
    } else { camera.position.set(0, 0, 60); }


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
      // fusion: embers toward the Sun's quarter of the sky catch its light
      "uniform vec3 uSunDir;",
      "uniform vec3 uPointer;", "uniform float uPointerAmt;",
      "varying vec3 vColor;", "varying float vAlpha;", "varying float vGlow;",
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
      "  vec3 wp0=(modelMatrix*vec4(displaced,1.0)).xyz;",
      "  float pd=distance(wp0,uPointer);",
      "  float pf=uPointerAmt*smoothstep(22.0,2.0,pd);",
      "  displaced+=normalize(wp0-uPointer+vec3(0.0001,0.0,0.0))*pf*5.5;",
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
      "  vGlow=pow(max(dot(normalize(worldPos+vec3(0.0001)),uSunDir),0.0),3.0);",
      "  vAlpha=aAlpha*layerPresence*breath*clearing*(1.0+pf*1.4);",
      "  vColor=aColor;",
      "}"
    ].join("\n");

    var DEEP_FRAGMENT_SHADER = [
      "precision mediump float;",
      "uniform sampler2D uMap;", "uniform float uSunGlow;",
      "varying vec3 vColor;", "varying float vAlpha;", "varying float vGlow;",
      "void main(){",
      "  vec4 sprite=texture2D(uMap,gl_PointCoord);",
      "  float g=uSunGlow*vGlow;",
      "  float alpha=sprite.a*vAlpha*(1.0+0.45*g);",
      "  if(alpha<0.003) discard;",
      "  vec3 lit=vColor*(1.0+1.15*g)+vec3(0.30,0.20,0.10)*g;",   // sunlit embers warm toward the fire
      "  gl_FragColor=vec4(lit*sprite.rgb,alpha);",
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
        if (kind === "breath") {
          // near dust with the 2D field's own presence — parallaxes, occludes, breathes
          var bR = lerp(26, 132, Math.pow(shellJitter, 0.6));
          pos[k] = x * bR * 1.15; pos[k + 1] = y * bR * 0.85; pos[k + 2] = z * bR;
        } else if (kind === "far") {
          var shellR = lerp(285, 405, Math.pow(shellJitter, 0.72)), ob = 0.92 + rnd() * 0.08;
          pos[k] = x * shellR; pos[k + 1] = y * shellR * ob; pos[k + 2] = z * shellR;
          // cosmos: two-thirds of the far embers settle into a nebula LANE that hugs the
          // ecliptic band — the dust and the zodiac share one plane, one weather
          if (COSMOS && rnd() < 0.66) pos[k + 1] *= 0.32;
        } else {
          var hazeR = lerp(42, 190, Math.pow(shellJitter, 0.46)), lobe = 0.72 + 0.28 * Math.sin(theta * 2.0 + y * 4.0);
          pos[k] = x * hazeR * 1.32; pos[k + 1] = y * hazeR * 0.74; pos[k + 2] = z * hazeR * 0.92 + lobe * 28;
        }
        var spark = rnd() < 0.06 ? 1 : 0, ember = rnd() < 0.22, hue = rnd(), c = coreColRGB(hue, spark);
        col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
        if (kind === "breath") {
          size[i] = spark ? lerp(11.0, 18.0, rnd()) : ember ? lerp(8.0, 14.0, rnd()) : lerp(4.5, 9.0, rnd());
          alpha[i] = spark ? lerp(0.30, 0.52, rnd()) : ember ? lerp(0.22, 0.40, rnd()) : lerp(0.10, 0.22, rnd());
        } else if (kind === "far") {
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
        uClearInner: { value: -2.0 }, uClearOuter: { value: -1.0 },
        // sun-coupling OFF until the chart aligns (uSunGlow 0 → identity)
        uSunDir: { value: new THREE.Vector3(0, 0, -1) }, uSunGlow: { value: 0.0 },
        uPointer: { value: new THREE.Vector3(0, 0, 9999) }, uPointerAmt: { value: 0.0 }
      };
      function makeMaterial(layerKind, maxPointSize, refDepth, amplitude) {
        return new THREE.ShaderMaterial({
          uniforms: {
            uMap: common.uMap, uTime: common.uTime, uFusion: common.uFusion, uPixelRatio: common.uPixelRatio,
            uClearInner: common.uClearInner, uClearOuter: common.uClearOuter,
            uSunDir: common.uSunDir, uSunGlow: common.uSunGlow,
            uPointer: common.uPointer, uPointerAmt: common.uPointerAmt,
            uMaxPointSize: { value: maxPointSize }, uRefDepth: { value: refDepth }, uAmplitude: { value: amplitude }, uLayerKind: { value: layerKind }
          },
          vertexShader: DEEP_VERTEX_SHADER, fragmentShader: DEEP_FRAGMENT_SHADER,
          transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending
        });
      }
      var grp = new THREE.Group(); grp.name = "deepEmbers";
      // cosmos: the ember shell wraps the orrery at the ORIGIN (a sky dome around the world)
      grp.position.set(0, 0, COSMOS ? 0 : -355);
      var farGeo = buildDeepLayerGeometry("far", farCount, 0xC0DE122);
      var farMat = makeMaterial(0.0, mobile ? 8.0 : 10.0, 330.0, calm ? 74.0 : 96.0);
      var farShell = new THREE.Points(farGeo, farMat); farShell.frustumCulled = false; grp.add(farShell);
      var nearGeo = null, nearMat = null, nearHaze = null;
      if (nearCount > 0) {
        nearGeo = buildDeepLayerGeometry("near", nearCount, 0xF0510A2);
        nearMat = makeMaterial(1.0, 24.0, 165.0, calm ? 42.0 : 58.0);
        nearHaze = new THREE.Points(nearGeo, nearMat); nearHaze.position.set(0, -8, COSMOS ? 0 : 150); nearHaze.frustumCulled = false; grp.add(nearHaze);
      }
      var breathPts = null, breathMat = null, breathGeo = null;
      if (COSMOS) {
        breathGeo = buildDeepLayerGeometry("breath", mobile ? 1100 : 2600, 0xB4EA71);
        breathMat = makeMaterial(1.0, 26.0, 130.0, calm ? 24.0 : 32.0);
        // the breath keeps its own small clearing so the instrument's heart stays readable
        breathMat.uniforms.uClearInner = { value: 14.0 };
        breathMat.uniforms.uClearOuter = { value: 26.0 };
        breathPts = new THREE.Points(breathGeo, breathMat);
        breathPts.frustumCulled = false; breathPts.name = "breathDust";
        grp.add(breathPts);
      }
      scene.add(grp);
      return {
        group: grp, farCount: farCount, nearCount: nearCount, uniforms: common,
        setPixelRatio: function (dpr) { common.uPixelRatio.value = Math.min(dpr || 1, mobile ? 1.5 : 2); },
        setFusion: function (v) { common.uFusion.value = Math.max(0, Math.min(1, v)); },
        applyTheme: function (dark) { var bl = dark ? THREE.AdditiveBlending : THREE.NormalBlending; farMat.blending = bl; farMat.needsUpdate = true; if (nearMat) { nearMat.blending = bl; nearMat.needsUpdate = true; } },
        tick: function (sec) {
          common.uTime.value = sec;
          common.uPointerAmt.value *= 0.955;   // the stirred dust settles
          if (breathPts) { breathPts.rotation.y = -sec * 0.0035; }
          var slow = calm ? 0.0042 : 0.0062;
          // scroll-linked drift: the whole cosmos (embers + natal sky ride the same group)
          // turns gently as you travel down the page — one space, one journey
          var drift = (typeof scrollY === "number" ? scrollY : 0) * 0.00026;
          // cosmos: the nebula lane leans onto the ecliptic (same tilt as the zodiac belt)
          var baseTilt = COSMOS ? 0.409 : 0;
          grp.rotation.y = sec * slow + drift; grp.rotation.x = baseTilt + Math.sin(sec * 0.027) * 0.025; farShell.rotation.z = Math.sin(sec * 0.018) * 0.018;
          if (nearHaze) { nearHaze.rotation.y = -(sec * slow + drift) * 0.58; nearHaze.rotation.z = Math.sin(sec * 0.041) * 0.035; }
        },
        dispose: function () { scene.remove(grp); farGeo.dispose(); farMat.dispose(); if (nearGeo) nearGeo.dispose(); if (nearMat) nearMat.dispose(); if (breathGeo) breathGeo.dispose(); if (breathMat) breathMat.dispose(); }
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

    // honor field-off: on the cosmos page the 3D IS the site, so the toggle only rests the 2D field
    function syncField() {
      if (COSMOS) return;
      var off = document.body.classList.contains("field-off");
      canvas.style.display = off ? "none" : "block"; if (natalSky) natalSky.setVisible(!off);
    }
    syncField();
    new MutationObserver(syncField).observe(document.body, { attributes: true, attributeFilter: ["class"] });

    // fade in only after the field's 730ms intro has settled
    canvas.style.opacity = "0"; canvas.style.transition = "opacity 1.6s ease";
    setTimeout(function () { canvas.style.opacity = "1"; }, 950);

    /* ===== M10 · the REAL Nye Clock orrery, merged into THIS scene =====
       One scene, one camera, one fog — so the orrery and the embers share
       real depth (no more two-layer "crossing"). It sits at world origin as
       the axis; the shader clearing (above) opens a calm pocket around it. */
    var nyeArmature = null, earthGrpRef = null;

    // once BOTH the orrery and the natal sky exist: swing the orrery so its real Sun
    // points exactly at the drawn Capricornus (and report how close the Moon lands to Leo)
    function tryAlignChart() {
      if (!nyeArmature || !natalSky || !natalSky.getPlanetDir) return;
      try {
        var sunObj = nyeArmature.group.getObjectByName("NyeSun");
        var moonObj = nyeArmature.group.getObjectByName("NyeMoon");
        var sunDir = sunObj.getWorldPosition(new THREE.Vector3()).normalize();
        var sunTarget = natalSky.getPlanetDir("sun");
        if (!sunTarget) return;
        var q = new THREE.Quaternion().setFromUnitVectors(sunDir, sunTarget);
        nyeArmature.group.quaternion.premultiply(q);
        nyeArmature.group.updateMatrixWorld(true);
        var sunNow = sunObj.getWorldPosition(new THREE.Vector3()).normalize();
        var moonNow = moonObj ? moonObj.getWorldPosition(new THREE.Vector3()).normalize() : null;
        var moonTarget = natalSky.getPlanetDir("moon");
        window.__space.align = {
          sunDot: +sunNow.dot(sunTarget).toFixed(4),
          moonDot: moonNow && moonTarget ? +moonNow.dot(moonTarget).toFixed(4) : null
        };
        // the alignment turned the whole orrery — relight Earth & Moon from where the Sun NOW burns
        var sunW = sunObj.getWorldPosition(new THREE.Vector3());
        var earthMesh = nyeArmature.group.getObjectByName("NyeEarthMesh");
        if (earthMesh && earthMesh.material.uniforms && earthMesh.material.uniforms.uSunDirWorld) {
          var eW = earthMesh.getWorldPosition(new THREE.Vector3());
          earthMesh.material.uniforms.uSunDirWorld.value.copy(sunW.clone().sub(eW).normalize());
        }
        if (moonObj && moonObj.material && moonObj.material.uniforms && moonObj.material.uniforms.uSunDirWorld) {
          var mW = moonObj.getWorldPosition(new THREE.Vector3());
          moonObj.material.uniforms.uSunDirWorld.value.copy(sunW.clone().sub(mW).normalize());
        }
        // ...and let the sunward embers catch the light (dust + planets share one sun)
        deepFusion.uniforms.uSunDir.value.copy(sunW.clone().normalize());
        deepFusion.uniforms.uSunGlow.value = 0.85;
      } catch (e) { window.__space.alignError = String(e); }
    }

    // burn the REAL footprint (602k raw GPS points) onto the Earth as a glowing trace,
    // and dress the Earth in real continents + night lights
    function dressEarth(earthGrp) {
      var earthMesh = earthGrp.getObjectByName("NyeEarthMesh");
      if (!earthMesh) return;
      var uni = earthMesh.material.uniforms;
      var loader = new THREE.TextureLoader(); loader.crossOrigin = "anonymous";
      function srgb(t) { if ("colorSpace" in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t; }
      loader.load("https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg", function (t) {
        srgb(t); uni.uAlbedoMap.value = t; uni.uUseAlbedoMap.value = 1;
      });
      loader.load("https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-night.jpg", function (t) {
        srgb(t); uni.uNightMap.value = t; uni.uUseNightMap.value = 1;
      });
      function bakeTrace() {
        fetch("data/footprint-points.f32").then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
          var raw = new Float32Array(buf);
          var W = MOBILE ? 2048 : 6144, H = W / 2;   // finer: the smaller globe is viewed closer
          var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
          var ctx = cv.getContext("2d");
          // two passes: a soft warm bed, then a bright core — the roads must READ
          ctx.fillStyle = "rgba(255,150,90,0.32)";
          for (var i = 0; i < raw.length; i += 2) {
            var lat = raw[i], lon = raw[i + 1];
            if (!isFinite(lat) || !isFinite(lon)) continue;
            ctx.fillRect(((lon + 180) / 360) * W - 1, ((90 - lat) / 180) * H - 1, 3.4, 3.4);
          }
          ctx.fillStyle = "rgba(255,210,155,0.95)";
          for (var i2 = 0; i2 < raw.length; i2 += 2) {
            var lat2 = raw[i2], lon2 = raw[i2 + 1];
            if (!isFinite(lat2) || !isFinite(lon2)) continue;
            ctx.fillRect(((lon2 + 180) / 360) * W, ((90 - lat2) / 180) * H, 1.7, 1.7);
          }
          var tex2 = new THREE.CanvasTexture(cv); srgb(tex2);
          var rr = earthMesh.geometry.parameters.radius * 1.006;
          var traceMat = new THREE.MeshBasicMaterial({ map: tex2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 });
          if ("toneMapped" in traceMat) traceMat.toneMapped = false;
          var trace = new THREE.Mesh(new THREE.SphereGeometry(rr, 96, 96), traceMat);
          trace.name = "FootprintTrace";
          earthMesh.add(trace);          // child of the rotating Earth → trace stays glued to the continents
          window.__space.tracePoints = raw.length / 2;
        }).catch(function (e) { window.__space.traceError = String(e); });
      }
      // Do-Not-Repeat: never rely on requestIdleCallback alone — load-event + timeout fallback
      var baked = false; function once() { if (!baked) { baked = true; bakeTrace(); } }
      if ("requestIdleCallback" in window) requestIdleCallback(once, { timeout: 4000 });
      setTimeout(once, 4500);
    }

    import("./nye-armature.js?v=9").then(function (mod) {
      try {
        nyeArmature = mod.mountNyeArmature(THREE, scene, {
          instant: new Date(2002, 0, 2, 15, 45, 0, 0),
          warm: true,
          scale: MOBILE ? 2.4 : 3.0
        });
        /* GEOCENTRIC: shift the solar system so the EARTH sits at the world origin —
           the axis everything orbits. The Sun then stands toward tropical Capricorn
           (主外) and the Moon toward Leo (主内), exactly as the natal chart reads. */
        var solar = nyeArmature.group.getObjectByName("NyeSolarSystem");
        earthGrpRef = nyeArmature.group.getObjectByName("NyeEarth");
        if (solar && earthGrpRef) {
          solar.position.copy(earthGrpRef.position).negate();
          nyeArmature.group.updateMatrixWorld(true);
        }
        // calm pocket in the embers around the orrery
        deepFusion.uniforms.uClearInner.value = 42.0;
        deepFusion.uniforms.uClearOuter.value = 96.0;
        /* 月柱大环与地月系在空间上分开(而不是让文字透视压在足迹上):
           lift the month gear-plane + orbit trace off the Earth along the ecliptic
           normal — ring and 庚子 read clear, the footprint on the globe stays untouched */
        var eclPlane = nyeArmature.group.getObjectByName("MonthEclipticGearPlane");
        var orbTrace = nyeArmature.group.getObjectByName("EarthOrbitTrace");
        if (eclPlane) {
          var eclN = new THREE.Vector3(0, 0, 1).applyQuaternion(eclPlane.quaternion).normalize();
          eclPlane.position.addScaledVector(eclN, 3.1);
          if (orbTrace) orbTrace.position.addScaledVector(eclN, 3.1);
          nyeArmature.group.updateMatrixWorld(true);
        }
        dressEarth(earthGrpRef);
        tryAlignChart();
        window.__space.nye = nyeArmature;
        applySceneLocale();
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
    function pageLocale() { return root.className.indexOf("locale-zh") >= 0 ? "zh" : "en"; }
    function applySceneLocale() {
      var loc = pageLocale();
      if (natalSky && natalSky.setLocale) natalSky.setLocale(loc);
      if (nyeArmature) nyeArmature.group.traverse(function (o) {
        if (o.name && /Readout$/.test(o.name)) o.visible = false;   /* legacy nye-clock readout plates — the ring glyphs already say it */
      });
    }
    new MutationObserver(applySceneLocale).observe(root, { attributes: true, attributeFilter: ["class"] });

    var natalSky = null;
    // the natal sphere holds STILL around the world (the chart is a fact, not weather);
    // the embers drift through it as living dust
    var natalRoot = new THREE.Group(); natalRoot.name = "natalRoot"; scene.add(natalRoot);
    fetch("data/natal-sky.json?v=4").then(function (r) { return r.json(); }).then(function (natalData) {
      return import("./natal-sky.js?v=15").then(function (mod) {
        natalSky = mod.buildNatalSky(THREE, scene, natalData, {
          tex: tex, vertexShader: DEEP_VERTEX_SHADER, fragmentShader: DEEP_FRAGMENT_SHADER,
          group: COSMOS ? natalRoot : deepFusion.group, R_STAR: COSMOS ? 205 : 372,
          mobile: MOBILE, calm: (TIER !== "full"),
          camera: camera, interactive: true
        });
        natalSky.applyTheme(root.getAttribute("data-theme") === "dark");
        window.__space.natal = natalSky;
        window.__space.natalStats = natalSky.stats;
        tryAlignChart();
        applySceneLocale();
      });
    }).catch(function (e) { window.__space.natalError = String(e); });

    /* ===== the hand on the world: trackball rotate (controls), right/shift-drag PAN,
       wheel zoom (controls), clean-click routing, double-click home ===== */
    if (COSMOS) {
      var downX = 0, downY = 0, panOn = false, plx = 0, ply = 0, hintFaded = false, movedAcc = 0;
      var _pr = new THREE.Vector3(), _pu = new THREE.Vector3(), _pm = new THREE.Vector3();
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("pointerdown", function (e) {
        lastTouch = performance.now(); userMoved = true;
        downX = e.clientX; downY = e.clientY; movedAcc = 0;
        glide.frames = 0;                                   // a touch cancels any glide
        panOn = (e.button === 2 || e.button === 1 || e.shiftKey);
        plx = e.clientX; ply = e.clientY;
      }, true);
      /* hovering the Earth summons the footprint doorway; hovering the Sun, the journey doorway */
      var earthCta = document.getElementById("earth-cta"), sunCta = document.getElementById("sun-cta"), ctaOn = false, sunCtaOn = false, ctaTick = 0;
      var _ctaRay = new THREE.Raycaster(), _ctaNdc = new THREE.Vector2(), _ctaV = new THREE.Vector3();
      function setCta(on) {
        if (!earthCta || on === ctaOn) return;
        ctaOn = on;
        earthCta.classList.toggle("is-on", on);
      }
      function setSunCta(on) {
        if (!sunCta || on === sunCtaOn) return;
        sunCtaOn = on;
        sunCta.classList.toggle("is-on", on);
      }
      function updateCta(e) {
        if (!earthCta || !nyeArmature) return;
        if ((ctaTick = (ctaTick + 1) % 3) !== 0) return;
        _ctaNdc.x = (e.clientX / innerWidth) * 2 - 1; _ctaNdc.y = -(e.clientY / innerHeight) * 2 + 1;
        _ctaRay.setFromCamera(_ctaNdc, camera);
        var hits = _ctaRay.intersectObject(nyeArmature.group, true);
        var onEarth = false, onSun = false;
        for (var hI = 0; hI < hits.length; hI++) {
          if (hits[hI].object.name === "NyeEarthPickShell") continue;   // the oversized shell is not the globe
          var oo = hits[hI].object, pk = null;
          while (oo && !pk) { pk = oo.userData && oo.userData.nyePick; oo = oo.parent; }
          if (pk === "earth") { onEarth = true; break; }   // ring glyphs may sit in front — scan on
          if (pk === "sun") { onSun = true; break; }
        }
        if (onEarth) {
          var ew = nyeArmature.group.getObjectByName("NyeEarthMesh").getWorldPosition(_ctaV).project(camera);
          earthCta.style.left = ((ew.x * 0.5 + 0.5) * innerWidth) + "px";
          earthCta.style.top = ((-ew.y * 0.5 + 0.5) * innerHeight - 46) + "px";
        }
        if (onSun && sunCta) {
          var sw = nyeArmature.group.getObjectByName("NyeSunCore").getWorldPosition(_ctaV).project(camera);
          sunCta.style.left = ((sw.x * 0.5 + 0.5) * innerWidth) + "px";
          sunCta.style.top = ((-sw.y * 0.5 + 0.5) * innerHeight - 58) + "px";
        }
        setCta(onEarth); setSunCta(onSun);
      }
      function openFootprintMap() {
        document.body.classList.add("to-map");
        setTimeout(function () { location.href = "footprint.html"; }, 380);
      }
      if (earthCta) {
        earthCta.addEventListener("mouseenter", function () { setCta(true); earthCta.classList.add("is-on"); });
        earthCta.addEventListener("click", openFootprintMap);
      }
      function openJourney() {
        document.body.classList.add("to-map");
        setTimeout(function () { location.href = "journey.html"; }, 380);
      }
      if (sunCta) {
        sunCta.addEventListener("mouseenter", function () { setSunCta(true); sunCta.classList.add("is-on"); });
        sunCta.addEventListener("click", openJourney);
      }

      /* when the Earth owns the page (close zoom) and the hand hovers it, the
         干支 rings step aside — the globe becomes the sole subject */
      var ringFadeMats = null, ringFade = 1, soloBody = null;   /* "sun"|"moon": rings step aside entirely */
      function collectRingMats() {
        if (ringFadeMats || !nyeArmature) return;
        ringFadeMats = [];
        ["MonthEclipticGearPlane", "EarthOrbitTrace", "YearEclipticPlane", "DayClockOrbitPlane", "HeroHourLocalRing", "HourPillarReadout"].forEach(function (nm) {
          var rootO = nyeArmature.group.getObjectByName(nm); if (!rootO) return;
          rootO.traverse(function (oo) {
            var mats = Array.isArray(oo.material) ? oo.material : (oo.material ? [oo.material] : []);
            mats.forEach(function (mm) { ringFadeMats.push({ m: mm, base: (mm.opacity != null ? mm.opacity : 1), o: oo }); });
          });
        });
      }
      function applyRingFade() {
        if (!nyeArmature) return;
        collectRingMats(); if (!ringFadeMats) return;
        var want = (soloBody || (ctaOn && controls.getRadius() < 16)) ? 0 : 1;
        if (Math.abs(ringFade - want) < 0.004) { ringFade = want; return; }
        ringFade += (want - ringFade) * 0.1;
        for (var rf = 0; rf < ringFadeMats.length; rf++) {
          var e2 = ringFadeMats[rf];
          e2.m.transparent = true;
          e2.m.opacity = e2.base * ringFade;
          e2.o.visible = ringFade > 0.03;
        }
      }
      window.__space.applyRingFade = applyRingFade;

      /* ===== the TOUR: the nav asks, the camera travels, the door opens ===== */
      window.__space.tour = function (name, href) {
        lastTouch = performance.now(); userMoved = true; glide.onDone = null;
        soloBody = (name === "sun" || name === "moon" || name === "jupiter" || name === "saturn") ? name : null;
        if (name === "footprint") {
          glide.axis = null; glide.step = 0; glide.frames = 110; glide.distTarget = 9;
          glide.targetTo = new THREE.Vector3(0, 0, 0);
          glide.onDone = openFootprintMap;
        } else if (name === "sun") {
          glideToBody("NyeSun", 34, 110);   /* the sun = the journey (履历) anchor */
          glide.onDone = openJourney;
        } else if (name === "moon") {
          glideToBody("NyeMoon", 9, 110);
          if (natalSky) { natalSky.highlight("leo", true); setTimeout(function () { natalSky.highlight("leo", false); }, 4200); }
        } else if (name === "jupiter") {
          glideToBody("NatalJupiter", 13, 110);
          if (natalSky) { natalSky.highlight("cancer", true); setTimeout(function () { natalSky.highlight("cancer", false); }, 4200); }
        } else if (name === "saturn") {
          glideToBody("NatalSaturn", 16, 110);
          if (natalSky) { natalSky.highlight("gemini", true); setTimeout(function () { natalSky.highlight("gemini", false); }, 4200); }
        } else if (name === "pillars" || name === "zodiac") {
          /* return to the canonical framing: keep the current azimuth (the sky keeps
             turning) but restore the entrance elevation — never arrive edge-on */
          var hOff = camera.position.clone().sub(controls.target);
          var hAz = (hOff.x * hOff.x + hOff.z * hOff.z > 1e-6) ? Math.atan2(hOff.x, hOff.z) : 0.8;
          var hEl = 0.517;
          var hDir = new THREE.Vector3(Math.sin(hAz) * Math.cos(hEl), Math.sin(hEl), Math.cos(hAz) * Math.cos(hEl));
          glide.targetTo = HOME.clone();
          glide.camTo = HOME.clone().add(hDir.multiplyScalar(name === "pillars" ? 92 : 390));
          glide.axis = null; glide.step = 0; glide.distTarget = 0;
          glide.frames = name === "pillars" ? 90 : 110;
        } else if (name === "star:capricorn" || name === "star:leo") {
          /* travel to face the constellation (the Sun stands in Capricorn, the Moon in Leo),
             bloom it, then walk through to the linked record */
          var pid = (name === "star:capricorn") ? "sun" : "moon";
          var cid = (name === "star:capricorn") ? "capricorn" : "leo";
          if (natalSky && natalSky.getPlanetDir) {
            var cdir = natalSky.getPlanetDir(pid);
            if (cdir) {
              glide.targetTo = HOME.clone();
              glide.camTo = HOME.clone().sub(cdir.multiplyScalar(130));   // stand opposite, gaze through home to the sign
              glide.axis = null; glide.step = 0; glide.distTarget = 0; glide.frames = 110;
            }
            natalSky.highlight(cid, true); setTimeout(function () { natalSky.highlight(cid, false); }, 4600);
          }
        }
        if (href) glide.onDone = function () { setTimeout(function () { location.href = href; }, 600); };
      };
      document.querySelectorAll("[data-tour]").forEach(function (el) {
        el.addEventListener("click", function (ev) { ev.preventDefault(); closeNavGroups(); window.__space.tour(el.getAttribute("data-tour"), el.getAttribute("data-href")); });
      });
      // accordion tour bar: click pins one group open (closing every other), click
      // again releases it, and clicking anywhere else — or firing any leaf — closes all
      var navGroups = document.querySelectorAll(".cosmos-nav__group");
      function closeNavGroups() { navGroups.forEach(function (o) { o.classList.remove("open"); }); }
      document.querySelectorAll(".cosmos-nav__head").forEach(function (el) {
        el.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var g = el.parentElement, was = g.classList.contains("open");
          closeNavGroups();
          if (!was) g.classList.add("open");
        });
      });
      document.addEventListener("click", function (e) {
        if (!(e.target.closest && e.target.closest(".cosmos-nav"))) closeNavGroups();
      });

      var _stir = new THREE.Vector3();
      canvas.addEventListener("pointerdown", function () { soloBody = null; }, { passive: true });
      canvas.addEventListener("pointermove", function (e) {
        updateCta(e);
        // the visitor's hand stirs the breath-dust: cursor ray → a point in the volume
        _stir.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, 0.5).unproject(camera)
          .sub(camera.position).normalize().multiplyScalar(Math.min(70, controls.getRadius() * 0.9)).add(camera.position);
        deepFusion.uniforms.uPointer.value.copy(_stir);
        deepFusion.uniforms.uPointerAmt.value = 1.0;
        movedAcc += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        if (!hintFaded && movedAcc > 40) { hintFaded = true; var h = document.getElementById("cosmos-hint"); if (h) h.classList.add("is-faded"); }
        if (!panOn) return;
        var dx = e.clientX - plx, dy = e.clientY - ply; plx = e.clientX; ply = e.clientY;
        var k = controls.getRadius() * 0.0012;
        camera.updateMatrixWorld();
        _pr.setFromMatrixColumn(camera.matrixWorld, 0);
        _pu.setFromMatrixColumn(camera.matrixWorld, 1);
        _pm.set(0, 0, 0).addScaledVector(_pr, -dx * k).addScaledVector(_pu, dy * k);
        var nt = controls.target.clone().add(_pm);
        var dHome = nt.clone().sub(HOME);
        if (dHome.length() > 150) { dHome.setLength(150); nt.copy(HOME).add(dHome); _pm.copy(nt).sub(controls.target); }
        controls.target.copy(nt); camera.position.add(_pm);
      }, true);
      addEventListener("pointerup", function () { panOn = false; });
      canvas.addEventListener("wheel", function () { lastTouch = performance.now(); userMoved = true; }, { passive: true });

      // clean-click routing: a drag is never a click
      var pickRay = new THREE.Raycaster(), pickNdc = new THREE.Vector2();
      function glideToBody(objName, viewDist, nFrames) {
        var obj = nyeArmature.group.getObjectByName(objName);
        if (!obj && natalSky && natalSky.group) obj = natalSky.group.getObjectByName(objName);
        if (!obj) return;
        var w = obj.getWorldPosition(new THREE.Vector3());
        /* stand OUTSIDE the body along the Earth→body line, swung aside within the
           gear-ring plane AND lifted above it — the sightline can never pass through
           the Earth, the Sun, or the glyph medallions riding the rings */
        var outward = w.clone().normalize();
        if (outward.lengthSq() < 1e-9) outward.set(0, 0, 1);
        var ringN = new THREE.Vector3(0, 1, 0)
          .applyQuaternion(nyeArmature.group.getWorldQuaternion(new THREE.Quaternion())).normalize();
        if (objName === "NyeMoon") {
          /* arrive from the sunlit side — the moon shows her lit face, Earth hangs behind */
          var sunObj = nyeArmature.group.getObjectByName("NyeSun");
          if (sunObj) {
            var toSun = sunObj.getWorldPosition(new THREE.Vector3()).sub(w).normalize();
            outward.multiplyScalar(0.5).addScaledVector(toSun, 0.85).normalize();
          }
          outward.multiplyScalar(Math.cos(0.22)).addScaledVector(ringN, Math.sin(0.22)).normalize();
        } else {
          outward.applyAxisAngle(ringN, -0.5);   /* this side keeps the year-seal beside, not before, the body */
          outward.multiplyScalar(Math.cos(0.42)).addScaledVector(ringN, Math.sin(0.42)).normalize();
        }
        glide.targetTo = w.clone();
        glide.camTo = w.clone().add(outward.multiplyScalar(viewDist || 40));
        glide.axis = null; glide.step = 0; glide.distTarget = 0;
        glide.frames = nFrames || 42;
      }
      addEventListener("click", function (e) {
        if (e.target !== canvas) return;              // DOM buttons/links are none of our business
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) {
          e.stopImmediatePropagation(); e.preventDefault(); return;
        }
        if (!nyeArmature) return;
        pickNdc.x = (e.clientX / innerWidth) * 2 - 1; pickNdc.y = -(e.clientY / innerHeight) * 2 + 1;
        pickRay.setFromCamera(pickNdc, camera);
        var hits = pickRay.intersectObject(nyeArmature.group, true);
        if (natalSky && natalSky.bodyGroup) {
          hits = hits.concat(pickRay.intersectObject(natalSky.bodyGroup, true));
          hits.sort(function (h1, h2) { return h1.distance - h2.distance; });
        }
        for (var i = 0; i < hits.length; i++) {
          if (hits[i].object.name === "NyeEarthPickShell") continue;   // the oversized shell is not the globe
          var pick = null, o = hits[i].object;
          while (o && !pick) { pick = o.userData && o.userData.nyePick; o = o.parent; }
          if (pick !== "sun" && pick !== "moon" && pick !== "earth" && pick !== "jupiter" && pick !== "saturn") continue;   // glyphs never swallow a click
          if (pick === "sun") {
            if (natalSky) { natalSky.highlight("capricorn", true); setTimeout(function () { natalSky.highlight("capricorn", false); }, 2800); }
            glideToBody("NyeSun", 34);
          } else if (pick === "moon") {
            if (natalSky) { natalSky.highlight("leo", true); setTimeout(function () { natalSky.highlight("leo", false); }, 2800); }
            glideToBody("NyeMoon", 9);
          } else if (pick === "jupiter" || pick === "saturn") {
            window.__space.tour(pick);                        // same journey as the nav would give
          } else if (pick === "earth") {
            glide.axis = null; glide.step = 0; glide.frames = 30; glide.distTarget = 7;
            glide.targetTo = new THREE.Vector3(0, 0, 0);      // orbit the Earth itself
          }
          e.stopImmediatePropagation();
          return;
        }
      }, true);
      canvas.addEventListener("dblclick", function () {
        controls.target.copy(HOME);
        camera.up.set(0, 1, 0);
        camera.position.set(HOME.x, HOME.y + 80 * Math.sin(0.18), HOME.z + 80 * Math.cos(0.18));
        camera.lookAt(HOME);
        controls.clearDelta(); glide.frames = 0;
      });
    }

    var running = true;
    var frameNo = 0, prevSec = 0;
    function frame(t) {
      if (!running) return;
      var sec = (t || 0) * 0.001;
      var dt = Math.min(0.1, Math.max(0.001, sec - prevSec)); prevSec = sec;
      frameNo++;
      if (COSMOS && controls) {
        var nowMs = performance.now();
        /* thermal guard: when the visitor rests, render at half rate — the slow
           drift is indistinguishable at 30fps, the GPU cools. Any touch, glide,
           entrance or stirred dust restores 60fps instantly. */
        var busy = (nowMs - lastTouch < 2500) || glide.frames > 0 ||
                   (!userMoved && nowMs < entranceUntil) ||
                   deepFusion.uniforms.uPointerAmt.value > 0.05;
        if (!busy && (frameNo & 1)) { requestAnimationFrame(frame); return; }
        // cinematic approach: ease the radius home until the visitor takes over
        if (!userMoved && nowMs < entranceUntil) {
          var r0 = controls.getRadius();
          controls.setRadius(r0 + (80 - r0) * 0.045);
        }
        // guided glide after clicking a body (any touch cancels)
        if (glide.frames > 0) {
          if (glide.camTo) {
            controls.target.lerp(glide.targetTo, 0.1);
            camera.position.lerp(glide.camTo, 0.1);
            camera.up.lerp(UP_Y, 0.08).normalize();
            camera.lookAt(controls.target);
          } else {
            if (glide.targetTo) { var dT = glide.targetTo.clone().sub(controls.target).multiplyScalar(0.12); controls.target.add(dT); camera.position.add(dT); }
            if (glide.axis) controls.rotateWorld(glide.axis, glide.step);
            if (glide.distTarget) { var rg = controls.getRadius(); controls.setRadius(rg + (glide.distTarget - rg) * 0.12); }
          }
          glide.frames--;
          if (glide.frames === 0) {
            glide.targetTo = null; glide.camTo = null;
            if (glide.onDone) { var fD = glide.onDone; glide.onDone = null; fD(); }
          }
        }
        // after 20s of stillness the world turns slowly on its own; manual always wins (dt-based: same speed at any frame rate)
        if (userMoved && nowMs - lastTouch > 20000 && glide.frames === 0) controls.rotateWorld(camera.up, 0.0108 * dt);
        if (!userMoved && nowMs >= entranceUntil) controls.rotateWorld(camera.up, 0.0108 * dt);
        controls.update();
        if (window.__space.applyRingFade) window.__space.applyRingFade();
        if (!_refFar) _refFar = new THREE.Vector3();
        _refFar.set(0, 0, -800).project(camera);
        if (_refFar.z < 1 && isFinite(_refFar.x)) {
          var rsx = (_refFar.x * 0.5 + 0.5) * innerWidth, rsy = (-_refFar.y * 0.5 + 0.5) * innerHeight;
          if (_refPrev.ok) {
            var pdx = rsx - _refPrev.x, pdy = rsy - _refPrev.y;
            if (Math.abs(pdx) < 140 && Math.abs(pdy) < 140) {
              if (!window.__viewDelta) window.__viewDelta = { x: 0, y: 0 };
              window.__viewDelta.x += pdx; window.__viewDelta.y += pdy;   // consumer resets
            }
          }
          _refPrev.x = rsx; _refPrev.y = rsy; _refPrev.ok = true;
        } else { _refPrev.ok = false; }
        if (fieldEl2 && (fmT2 = (fmT2 + 1) % 12) === 0) {
          var rr2 = controls.getRadius();
          fieldEl2.style.opacity = (0.5 + 0.28 * Math.max(0, Math.min(1, (rr2 - 90) / 320))).toFixed(2);
        }
      } else if (COSMOS) {
        /* unreachable guard */
      } else {
        var sy = (typeof scrollY === "number" ? scrollY : 0);
        var targetCamY = Math.max(-14, Math.min(14, -sy * 0.006));
        camera.position.y += (targetCamY - camera.position.y) * 0.06;
        camera.lookAt(0, camera.position.y * 0.4, -300);
      }
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

    // self-diagnosing build stamp: 日=orrery 盘=chart 皮=earth-skin 迹=trace — truth at a glance
    function stampStatus() {
      var el = document.querySelector(".cosmos-build"); if (!el) return;
      var s = window.__space, bits = [];
      bits.push(s.nye ? "日✓" : (s.nyeError ? "日✗" : "日…"));
      bits.push(s.natal ? "盘✓" : (s.natalError ? "盘✗" : "盘…"));
      bits.push(s.tracePoints ? "迹✓" : (s.traceError ? "迹✗" : "迹…"));
      el.textContent = el.textContent.replace(/ · [日盘迹].*$/, "") + " · " + bits.join(" ");
    }
    setInterval(stampStatus, 1500); setTimeout(stampStatus, 800);

    // hooks for verification / governor / future scroll-driven fusion
    window.__space.ready = true;
    window.__space.canvas = canvas;
    window.__space.controls = controls;
    window.__space.camera = camera;
    window.__space.pump = function (n2) { var base = performance.now(); for (var q = 0; q < (n2 || 1); q++) frame(base + q * 16.7); };
    window.__space.snap = function () {
      if (COSMOS && controls) controls.update();
      renderer.render(scene, camera); return canvas.toDataURL("image/jpeg", 0.8);
    };
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
