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
      if (/[?&]forcegl\b/.test(location.search)) return true;   // verification override (Playwright/CI): accept software GL; real visitors never carry this param
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
    // mobile: the 3D world is OPT-IN (tap-to-enter from the flat menu); once chosen it
    // sticks, and the explicit choice overrides the low-power heuristic
    if (isMobile()) return (stored === "calm" || stored === "full") ? "calm" : "flat";
    if (lowPower()) return "flat";
    return stored === "full" ? "full" : "calm"; // desktop default = Calm
  }

  var TIER = decideTier();
  window.__space = { tier: TIER, ready: false };
  var COSMOS = document.body.classList.contains("cosmos");
  if (COSMOS && TIER !== "flat") {   // belt & braces: the 3D page must never show the flat wall
    var flatBB = document.getElementById("cosmos-flat"); if (flatBB) flatBB.hidden = true;
    if (isMobile()) document.body.classList.add("is-mobile-3d");   // CSS hook: compact nav + exit affordance
  }
  if (TIER === "flat") {
    // no 3D — the flat fallback on the home page IS a full, usable mobile menu
    if (COSMOS) {
      document.body.classList.add("is-flat");   // CSS hook: retire floating orrery chrome, reveal the menu
      var flatEl = document.getElementById("cosmos-flat"); if (flatEl) flatEl.hidden = false;
      var hintEl = document.getElementById("cosmos-hint"); if (hintEl) hintEl.style.display = "none";
      // tap-to-enter: the doorway into the full 3D world (hidden when the device truly can't)
      var enter3d = document.getElementById("flat-enter3d");
      if (enter3d) {
        if (!webglOK() || reduced()) { enter3d.style.display = "none"; }
        else enter3d.addEventListener("click", function () {
          try { localStorage.setItem(MOTION_KEY, "calm"); } catch (e) {}
          location.reload();
        });
      }
    }
    return;
  }

  /* ---------------- M1 stage + M2 fusion ---------------- */
  var THREE_URL = "/vendor/three/three.module.js";   // vendored (mainland-reliable; same URL the importmap maps "three" to, so addons share this module instance)
  import(THREE_URL).then(function (THREE) {
    var canvas = document.getElementById("deep");
    if (!canvas) return;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, alpha: true, antialias: true,
      premultipliedAlpha: false, powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);            // transparent — NEVER a second background
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.35));   // cap DPR well below the Retina 2 → far less fragment work every frame (a big heat lever) for a barely-perceptible sharpness change on a starfield

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0a09, 0.0018); // fog === body colour --page; no back wall
    // NEVER set scene.background — one black on the page (CSS --page)

    var camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 200000);  // far plane: MAXCAM 118000 (beyond-horizon tier) + the CMB horizon shell on the far side (56000) → 174000; headroom to 200000 so nothing ever clips. All far-tier materials are additive + depthWrite:false, so the huge near/far ratio costs no z-fighting
    /* ===== TRUE SCALE (build 240) =====
       `camera` stays the NAVIGATION camera: the controls, glides, rail and every tier threshold keep running in
       the ladder space they were tuned in. Two render cameras are derived from it every frame:
         · farCam  — the sky (stars, constellations, deep sky, the cosmic tiers) on layer 1. Inside the Solar
                     System it only turns, never moves: the stars hang at infinity, as they really do.
         · nearCam — the Solar System on layer 0 at TRUE scale (real distances, real sizes), placed through the
                     ladder map in truescale.js, drawn in depth slices so 0.006 … 10⁸ units never z-fight.
       ?scale=legacy keeps the old compressed orrery for comparison. */
    var TRUE_SCALE = !/[?&]scale=legacy\b/.test(location.search);
    var nearCam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 1e9); nearCam.layers.set(0);
    var farCam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 200000); farCam.layers.set(1);
    // Phase 3: every cosmic tier is built LINEAR around us at its own rate (scene units per light-year), so each gets
    // its own camera standing at (true position × rate). natal-sky's crossfades still run on the ladder (lodCam).
    var TS_RATE = { mw: 2600 / 5e4, lg: 5720 / 2.5e6, sheet: 612e-6, virgo: 239e-6, lani: 52.6e-6, lss: 200 / 3.2616e6, web: 1440 / 228e6, obs: 56000 / 46.5e9 };
    // rail stops: the galaxy and the horizon sit exactly where their linear models look as the ladder framed them; the
    // stops between keep their framing distances (1.35 × each structure's real radius)
    var TS_LADDER_RATES = { "milky-way": TS_RATE.mw, "observable-universe": TS_RATE.obs };
    // the models that are actually built beyond the galaxy (the per-tier LG/Sheet/Virgo/Laniakea builders were retired
    // in July for ONE real-coordinate survey model): the CMB horizon, the survey universe (200 units/Mpc), Andromeda
    var TS_TIERS = [   // drawn far → near, each by its own camera; `extent` = model radius for the apparent-size fade
      { layer: 8, rate: TS_RATE.obs, roots: ["TierObservable", "UnobservedHorizonField"], fadePx: 0 },
      { layer: 6, rate: TS_RATE.lss, prefix: ["LargeScaleStructure", "CosmicWebLines", "DSOPick_lss_"], extent: 40000, fadePx: [40, 200] },
      { layer: 2, rate: TS_RATE.lg,  roots: ["Andromeda", "DSO_andromeda", "DSOPick_andromeda"], extent: 900, fadePx: [3, 30] }
    ];
    var TS_ROOT_LAYER = {}; TS_TIERS.forEach(function (t) { (t.roots || []).forEach(function (nm) { TS_ROOT_LAYER[nm] = t; }); t.cam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 1e7); t.cam.layers.set(t.layer); t.objs = []; });
    var TS_LAYER_TIER = {}; TS_TIERS.forEach(function (t) { TS_LAYER_TIER[t.layer] = t; });
    function tsTierFor(nm) {                          // which cosmic model an object belongs to (by root name or prefix)
      if (TS_ROOT_LAYER[nm]) return TS_ROOT_LAYER[nm];
      for (var k = 0; k < TS_TIERS.length; k++) { var px = TS_TIERS[k].prefix; if (px) for (var q = 0; q < px.length; q++) if (nm.indexOf(px[q]) === 0) return TS_TIERS[k]; }
      return null;
    }
    var lodCam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 200000); lodCam.layers.set(9);   // the ladder camera: natal-sky's crossfades + the ember dust
    var _ts = null;   // the mounted true-scale world: { L, bodies, clusters, farRoots } — null until the Solar System is placed
    var _tsMods = null, _tsFailed = !TRUE_SCALE, _tsSpaceSky = 0;   // _tsSpaceSky: 1 while the sky hangs at infinity (inside the Solar System)

    /* ================= SPACEENGINE-GRADE PIPELINE (build 220) =================
       ACES filmic tonemapping + selective HDR bloom via EffectComposer. The additive layers
       stack well past 1.0 — exactly what the bloom threshold catches (dense cores, the Sun,
       the galactic core, city lights), while faint dust stays quiet. Wired to the dynamic-
       resolution governor: bloom is shed at __cvQuality>=2 and the composer follows every
       pixel-ratio change. If the addon import fails (offline/no importmap), we fall back to
       the plain renderer path unchanged.
       DELIBERATE LAW REVISION: with the composer active we DO set scene.background — synced
       to the live page colour (and re-synced on theme change), pixel-identical to the CSS
       --page behind the canvas. An opaque base is required for bloom to spread past sprite
       footprints on a transparent canvas; #field (z-index 0) still paints above #deep (-2). */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;   // near-neutral: ACES supplies the highlight rolloff; the low end must stay close to the tuned direct-path art
    var composer = null, bloomPass = null, _acUniforms = null, _sceneRT = null, _quantUniforms = null;
    /* ===== THE BASE-VIEW NIGHT SKY (build 227) =====
       Painted per pixel inside the alpha composite, BEHIND everything the scene drew: a real dark-site
       night instead of a flat page colour. From the visitor's own vantage (the base frame) it computes:
       deep blue-black zenith → lifted haze at the limb, the green 557.7 nm airglow ring ~10° up, the warm
       light dome of the city (strongest toward Boston, the region's biggest), and the Milky Way at its TRUE
       place — the galactic frame comes from natal-sky's own transform, so the band runs through the very
       constellations drawn above. The band itself is baked ONCE into a galactic-coordinate map
       (bakeMilkyWay), so the per-pixel cost is one texture read. Off the ground uSkyAmt = 0 and this is
       the old composite, bit for bit. */
    var _skyUp = null, _skyNorth = null, _skyEast = null, _milkyRT = null, _milkyTried = false;
    /* build 230 — the REAL naked-eye sky: the Yale Bright Star Catalogue (5th ed., Harvard CfA; 9,096 stars to
       mag 6.5) packed as Int16 quads [RA h·1365, Dec °·360, mag·100, class·10+subclass] (data/stars-bsc5.bin) */
    var _bsc = null, _bscLoading = null;
    function loadBSC() {
      if (_bsc) return Promise.resolve(_bsc);
      if (_bscLoading) return _bscLoading;
      _bscLoading = fetch("data/stars-bsc5.bin").then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (ab) { _bsc = ab ? new Int16Array(ab) : null; return _bsc; }).catch(function () { return null; });
      return _bscLoading;
    }
    var _galX = new THREE.Vector3(1, 0, 0), _galY = new THREE.Vector3(0, 1, 0), _galZ = new THREE.Vector3(0, 0, 1);
    var MILKY_B = 0.70;   // the baked map covers galactic latitude ±40°; the band is ~0 beyond
    var SKY_GLSL_COMMON =
      "vec3 L(vec3 s){ return pow(s / 255.0, vec3(2.2)); }\n";
    function makeSkyComposite(sceneTex) {
      return {
        uniforms: {
          tScene: { value: sceneTex }, uBg: { value: new THREE.Color(0x0b0a09) },
          uSkyAmt: { value: 0 }, uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix3() },
          uUp: { value: new THREE.Vector3(0, 1, 0) }, uCityDir: { value: new THREE.Vector3(0, 0, 1) },
          uGalX: { value: _galX }, uGalY: { value: _galY }, uGalZ: { value: _galZ },
          tMilky: { value: null }, uMilkyGain: { value: 0 }, uHorizon: { value: -0.0925 }, uSpaceSky: { value: 0 }
        },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: [
          "uniform sampler2D tScene; uniform vec3 uBg; uniform float uSkyAmt;",
          "uniform mat4 uInvProj; uniform mat3 uCamRot; uniform vec3 uUp; uniform vec3 uCityDir;",
          "uniform vec3 uGalX; uniform vec3 uGalY; uniform vec3 uGalZ;",
          "uniform sampler2D tMilky; uniform float uMilkyGain; uniform float uHorizon; uniform float uSpaceSky;",
          "varying vec2 vUv;",
          SKY_GLSL_COMMON,
          // the Milky Way from the baked galactic map (sqrt-encoded for 8-bit dark precision)
          "vec3 milkyAt(vec3 d){",
          "  vec3 g = vec3(dot(d, uGalX), dot(d, uGalY), dot(d, uGalZ));",
          "  float b = asin(clamp(g.z, -1.0, 1.0));",
          "  if (abs(b) >= " + MILKY_B.toFixed(3) + ") return vec3(0.0);",
          "  vec3 mw = texture2D(tMilky, vec2(atan(g.y, g.x) / 6.2831853 + 0.5, b / " + (2 * MILKY_B).toFixed(3) + " + 0.5)).rgb;",
          "  return mw * mw;",
          "}",
          "vec3 skyAt(vec3 d){",
          "  float h = dot(d, uUp);",
          "  float alt = asin(clamp(h, -1.0, 1.0)) - uHorizon;",          // altitude above the VISIBLE limb
          "  vec3 hz = d - uUp * h; float hl = length(hz); hz = hl > 1e-4 ? hz / hl : uCityDir;",
          // 1. the night: deep blue-black zenith, lifting to a cool grey-blue haze along the limb
          "  float t = clamp(alt / 1.25, 0.0, 1.0);",
          "  vec3 col = mix(L(vec3(17.0, 21.0, 31.0)), L(vec3(8.0, 11.0, 22.0)), smoothstep(0.0, 0.32, t));",
          "  col = mix(col, L(vec3(4.0, 6.0, 13.0)), smoothstep(0.22, 1.0, t));",
          // 2. airglow — the faint olive-green oxygen ring every long exposure records ~10° up
          "  col += L(vec3(9.0, 17.0, 12.0)) * exp(-pow((alt - 0.17) / 0.075, 2.0));",
          // 3. the light dome: warm city glow sitting on the horizon, strongest toward the big city
          "  float az = max(0.0, dot(hz, uCityDir));",
          "  float dome = exp(-max(alt, 0.0) / 0.08) * (0.32 + 0.68 * az * az * az);",
          "  col += L(vec3(64.0, 38.0, 22.0)) * dome;",
          // 4. the Milky Way, from the baked galactic map (sqrt-encoded for 8-bit dark precision)
          "  if (uMilkyGain > 0.0) col += milkyAt(d) * uMilkyGain * smoothstep(-0.01, 0.34, alt) * (1.0 - 0.55 * dome);",   // extinction + glow washout at the limb
          // below the visible limb: dark land with a thin ember of the city glow (terrain/city draw over it)
          "  vec3 land = L(vec3(4.0, 3.6, 3.2)) + L(vec3(34.0, 20.0, 12.0)) * exp(min(alt, 0.0) / 0.018) * (0.3 + 0.7 * az);",
          "  return mix(land, col, smoothstep(-0.010, 0.004, alt));",
          "}",
          "void main(){",
          "  vec4 c = texture2D(tScene, vUv);",
          "  vec3 bg = uBg;",
          "  if (uSkyAmt > 0.001 || uSpaceSky > 0.001) {",
          "    vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);",
          "    vec3 d = normalize(uCamRot * (v.xyz / v.w));",
          // true scale: in space the band hangs at infinity behind the Solar System — no air, no horizon, no dome
          "    vec3 sp = uBg + (uMilkyGain > 0.0 ? milkyAt(d) * uMilkyGain * 1.15 * uSpaceSky : vec3(0.0));",
          "    bg = uSkyAmt > 0.001 ? mix(sp, skyAt(d), uSkyAmt) : sp;",
          "  }",
          "  vec3 o = c.rgb * c.a + bg * (1.0 - c.a);",
          "  if (uSkyAmt <= 0.001 && uSpaceSky <= 0.001) o = floor(clamp(o, 0.0, 1.0) * 255.0 + 0.5) / 255.0;",   // legacy space: exactly the old 8-bit composite target
          "  gl_FragColor = vec4(o, 1.0);",
          "}"
        ].join("\n")
      };
    }
    /* the Milky Way, baked once into a galactic (l, b) map. A model of how the band reads to the eye /
       a short exposure from a dark site: a bright, thick central bulge (Sgr–Sco–Oph), the Cygnus star cloud,
       a long thinning arc between; mottled star clouds; the Great Rift's dark lanes running along the plane
       from Cygnus to Sagittarius; a warm old-star core fading to cooler arms; a few H-alpha knots. */
    function bakeMilkyWay() {
      _milkyTried = true;
      var W = MOBILE ? 2048 : 4096, H = W / 4;
      var rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false });
      rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.generateMipmaps = false;
      rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
      var mat = new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: [
          "varying vec2 vUv;",
          // Ashima / Stefan Gustavson 3-D simplex noise (MIT)
          "vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }",
          "vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }",
          "vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }",
          "vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }",
          "float snoise(vec3 v){",
          "  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);",
          "  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);",
          "  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);",
          "  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;",
          "  i = mod289(i);",
          "  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));",
          "  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;",
          "  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);",
          "  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);",
          "  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);",
          "  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));",
          "  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;",
          "  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);",
          "  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));",
          "  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;",
          "  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;",
          "  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));",
          "}",
          "float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return 0.5 + 0.5 * s; }",
          "void main(){",
          "  float l = (vUv.x - 0.5) * 6.2831853, b = (vUv.y - 0.5) * " + (2 * MILKY_B).toFixed(4) + ";",
          "  vec3 gd = vec3(cos(b) * cos(l), cos(b) * sin(l), sin(b));",
          "  float bulge = exp(-(pow(l / 0.36, 2.0) + pow(b / 0.16, 2.0)));",                    // the peanut bulge, ~±20° × ±9°
          "  float nearC = exp(-pow(l / 0.9, 2.0));",
          "  float cyg = exp(-pow((l - 1.36) / 0.40, 2.0));",                                   // the Cygnus star cloud, l≈78°
          "  float sct = exp(-pow((l - 0.47) / 0.12, 2.0));",                                   // the Scutum star cloud, l≈27°
          "  float cas = exp(-pow((l - 2.10) / 0.45, 2.0));",                                   // Cassiopeia–Cepheus
          "  float car = exp(-pow((l + 1.15) / 0.40, 2.0));",                                   // Carina–Crux–Centaurus, l≈290–310°: the rich southern band
          "  float lon = 0.14 + 0.46 * exp(-pow(l / 1.45, 2.0)) + 0.32 * cyg + 0.30 * sct + 0.10 * cas + 0.34 * car;",
          "  float wid = 0.060 + 0.028 * cyg + 0.022 * nearC + 0.018 * car;",
          "  float warp = 0.012 * sin(l * 2.0) + 0.006 * sin(l * 5.0 + 1.3);",
          "  float n1 = fbm(gd * 3.4), n2 = fbm(gd * 9.0 + 5.2), n3 = fbm(gd * 30.0 + 1.7);",
          "  float core = exp(-pow((b - warp) / wid, 2.0));",
          "  float wide = exp(-pow((b - warp) / (wid * 2.6), 2.0));",
          "  float clouds = 0.22 + 1.55 * pow(n1, 1.7) + 0.35 * (n2 - 0.5);",                    // clumpy star clouds, not a smooth tube
          "  float I = (core * clouds + wide * 0.20) * lon + bulge * (0.85 + 0.55 * n2);",
          // dust: the Great Rift splitting the band from Cygnus to Sagittarius (positive l), plus wisps everywhere
          "  float rift = smoothstep(-0.15, 0.25, l) * (1.0 - smoothstep(1.35, 1.70, l));",
          "  float dn = fbm(gd * 4.6 + 11.0), dw = fbm(gd * 2.2 + 41.0);",
          "  float lc = b - 0.006 - 0.018 * sin(l * 2.3 + 0.4) - 0.012 * (dw - 0.5);",          // the lane meanders
          "  float lane = exp(-pow(lc / (0.026 + 0.020 * bulge + 0.012 * cyg), 2.0));",
          "  float lane2 = exp(-pow((lc + 0.034) / 0.012, 2.0)) * smoothstep(0.45, 0.75, dw);",  // a fainter parallel filament
          "  float dust = (lane * (0.42 + 0.58 * smoothstep(0.22, 0.70, dn)) + 0.5 * lane2) * (0.18 + 0.82 * rift);",
          "  dust += exp(-pow((b - warp) / (wid * 1.15), 2.0)) * smoothstep(0.50, 0.80, fbm(gd * 12.0 + 3.0)) * 0.55;",
          "  dust += bulge * smoothstep(0.55, 0.85, fbm(gd * 7.0 + 31.0)) * 0.6;",                 // the dark lanes across the bulge (Pipe, Ophiuchus)
          "  I *= clamp(1.0 - dust * 0.88, 0.05, 1.0);",
          "  I *= 0.74 + 0.52 * n3;",
          "  I *= 1.0 - smoothstep(" + (MILKY_B * 0.72).toFixed(3) + ", " + MILKY_B.toFixed(3) + ", abs(b));",
          // colour (ClarkVision-true): a gold old-star core, tan-neutral arms, a cool thin rim; a few H-alpha knots
          "  vec3 gold = vec3(1.0, 0.80, 0.56), tan = vec3(0.93, 0.86, 0.76), rim = vec3(0.62, 0.70, 0.88);",
          "  vec3 col = mix(rim, tan, smoothstep(0.05, 0.6, core));",
          "  col = mix(col, gold, clamp(bulge * 1.2 + 0.35 * nearC * core, 0.0, 1.0));",
          "  col *= I;",
          "  col += vec3(0.95, 0.28, 0.36) * pow(clamp(fbm(gd * 15.0 + 23.0), 0.0, 1.0), 8.0) * core * 3.0 * I;",
          // build 228 — RESOLVED STARS: a long exposure shows the band as countless individual stars, not a smooth
          // fog. One hash per texel; density follows the band's own brightness, magnitudes are power-law.
          "  vec2 tx = floor(vUv * vec2(" + (MOBILE ? "2048.0, 512.0" : "4096.0, 1024.0") + "));",
          "  float h1 = fract(sin(dot(tx, vec2(12.9898, 78.233))) * 43758.5453);",
          "  float h2 = fract(sin(dot(tx, vec2(39.3468, 11.1350))) * 24634.6345);",
          "  float h3s = fract(sin(dot(tx, vec2(73.1560, 52.2350))) * 15731.7431);",
          "  float dens = clamp(0.012 + 0.30 * I, 0.0, 0.42) * (1.0 - smoothstep(" + (MILKY_B * 0.55).toFixed(3) + ", " + MILKY_B.toFixed(3) + ", abs(b)));",   // no seam where the map ends
          "  float st = step(1.0 - dens, h1) * (0.35 + 2.2 * pow(h2, 7.0));",
          "  vec3 sc = h3s < 0.18 ? vec3(0.78, 0.86, 1.0) : (h3s > 0.80 ? vec3(1.0, 0.82, 0.62) : vec3(1.0, 0.96, 0.90));",
          "  col += sc * st * (0.55 + 0.45 * clamp(I, 0.0, 1.0));",
          "  gl_FragColor = vec4(sqrt(clamp(col / 2.2, 0.0, 1.0)), 1.0);",
          "}"
        ].join("\n")
      });
      var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;   // clip-space quad: never let the scene camera cull it
      var bakeScene = new THREE.Scene(); bakeScene.add(quad);
      var prevRT = renderer.getRenderTarget(), prevTM = renderer.toneMapping;
      try {
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(bakeScene, camera);
        _milkyRT = rt;
      } catch (e) { window.__space.milkyError = String(e); rt.dispose(); }
      renderer.setRenderTarget(prevRT); renderer.toneMapping = prevTM;
      quad.geometry.dispose(); mat.dispose();
    }
    /* per frame, before the composite runs: feed it the camera ray basis, the base frame, the galactic frame */
    var _skyM3 = new THREE.Matrix3();
    function updateSkyUniforms(skyAmt) {
      if (!_acUniforms) return;
      var u = _acUniforms;
      u.uSkyAmt.value = (_skyUp && skyAmt > 0.001 && !window.__skyOff) ? skyAmt : 0;
      u.uSpaceSky.value = (_ts && !window.__skyOff) ? _tsSpaceSky * (1 - skyAmt) : 0;
      if (!u.uSkyAmt.value && !u.uSpaceSky.value) return;
      if (!_milkyRT && !_milkyTried && natalSky && natalSky.skyDir) bakeMilkyWay();
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamRot.value.setFromMatrix4(camera.matrixWorld);
      if (_skyUp) {
        u.uUp.value.copy(_skyUp);
        // the region's brightest light dome: Boston, ~37° east of north from Providence
        u.uCityDir.value.copy(_skyNorth).multiplyScalar(Math.cos(0.646)).addScaledVector(_skyEast, Math.sin(0.646)).normalize();
      }
      if (_milkyRT && natalSky && natalSky.skyDir) {
        natalSky.skyDir(17.7611, -29.0078, _galX);          // the galactic centre (Sgr A*)
        natalSky.skyDir(12.8573, 27.1283, _galZ);           // the north galactic pole
        _galZ.addScaledVector(_galX, -_galZ.dot(_galX)).normalize();
        _galY.crossVectors(_galZ, _galX).normalize();       // l = 90° (toward Cygnus)
        u.uGalX.value.copy(_galX); u.uGalY.value.copy(_galY); u.uGalZ.value.copy(_galZ);   // (the pass holds its own cloned vectors)
        u.tMilky.value = _milkyRT.texture;
        u.uMilkyGain.value = 0.085;
      }
    }
    // the sky's own ease (time-based, ~1 s): the ground-dim ease is per-FRAME and crawls at the idle
    // frame rate, which left the sky at 40% for half a minute after landing
    var _skyAmt = 0, _skyT = 0, _skyState = { amt: 0, baked: false, gain: 0 };
    // build 230: the ground-dim ease (night falling over the local world) was 0.035 PER FRAME — at the idle render
    // governor (~2.5 fps) the base stayed half-lit (a bright blue globe surface underfoot) for ~30 s. Time-based now.
    var _gdT = 0;
    function _gdRate() { var now = performance.now(), dt = _gdT ? Math.min(0.25, (now - _gdT) / 1000) : 0.016; _gdT = now; return Math.min(1, dt * 2.4); }
    window.__space.debugMilky = function () {   // verification: the baked galactic map, downsampled, as a data URL
      if (!_milkyRT) return null;
      var W = _milkyRT.width, H = _milkyRT.height, buf = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(_milkyRT, 0, 0, W, H, buf);
      var cv = document.createElement("canvas"); cv.width = 1024; cv.height = 256; var cx = cv.getContext("2d");
      var img = cx.createImageData(1024, 256), sx = W / 1024, sy = H / 256, mx = 0;
      for (var y = 0; y < 256; y++) for (var x = 0; x < 1024; x++) {
        var si = (((H - 1 - Math.floor(y * sy)) * W) + Math.floor(x * sx)) * 4, di = (y * 1024 + x) * 4;
        img.data[di] = buf[si]; img.data[di + 1] = buf[si + 1]; img.data[di + 2] = buf[si + 2]; img.data[di + 3] = 255; mx = Math.max(mx, buf[si]);
      }
      cx.putImageData(img, 0, 0); return { max: mx, url: cv.toDataURL("image/png") };
    };
    /* ===== TRUE SCALE: frames, cameras, slices (build 240) ===== */
    var _tsV = new THREE.Vector3(), _tsA = new THREE.Vector3(), _tsB = new THREE.Vector3(), _tsD = new THREE.Vector3();
    var _nav = { a: null, b: null, p: 1, start: new THREE.Vector3(), dest: new THREE.Vector3(), flight: null };
    function tsWarp(pL, out) {                       // the Earth's frame: same direction, true distance
      var r = pL.length();
      return r < 1e-12 ? out.copy(pL) : out.copy(pL).multiplyScalar(_ts.L.G(r) / r);
    }
    function tsBodyFrame(b, pL, out) {               // a focused body's frame (truescale.bodyDistance)
      _tsD.copy(pL).sub(b.proxy); var rho = _tsD.length();
      if (rho < 1e-12) return out.copy(b.T);
      return out.copy(b.T).addScaledVector(_tsD, _ts.bodyDistance(_ts.L, b.s, b.kappa, rho) / rho);
    }
    function tsFrame(f, pL, out) { return f ? tsBodyFrame(f, pL, out) : tsWarp(pL, out); }
    function tsBodyAt(pL) {                          // the body whose ladder proxy sits at this point (null = Earth frame)
      if (!_ts || !pL) return null;
      for (var i = 0; i < _ts.frames.length; i++) { var b = _ts.frames[i]; if (pL.distanceToSquared(b.proxy) < b.tol2) return b; }
      return null;
    }
    function tsGlideDest() {                         // where the active glide is taking the pivot
      if (glide.param && glide.param.flight) return glide.param.body;
      if (glide.param) return glide.param.t1;
      if (glide.frames > 0 && glide.targetTo) return glide.targetTo;
      return null;
    }
    function tsGlideEndCam(out) {                    // where the active glide will leave the navigation camera
      var G2 = glide.param;
      if (G2 && G2.flight) return out.copy(G2.P3);
      if (G2) return out.copy(G2.d1).multiplyScalar(Math.exp(G2.lnR1));
      if (glide.frames > 0 && glide.camTo) return out.copy(glide.camTo);
      return null;
    }
    var _tsEnd = new THREE.Vector3();
    function tsUpdateNav() {
      // the frame only changes when a glide CARRIES the pivot somewhere new; orbit / zoom / pan keep it
      var P = controls ? controls.target : HOME;
      var dest = (controls && controls.isGround()) ? HOME : tsGlideDest();
      if (dest) {
        var fb = tsBodyAt(dest);
        if (fb !== _nav.b) {
          var wasGal = !!(_nav.b && _nav.b.galactic) || !!(_nav.a && _nav.a.galactic && _nav.p < 1);
          _nav.a = _nav.p >= 0.5 ? _nav.b : _nav.a;
          _nav.b = fb; _nav.p = 0; _nav.start.copy(P);
          // into or out of the galaxy's frame: a true flight. The two ends differ by up to thousands of light-years, and
          // blending the frames in place made the camera swing out sideways; instead fly a straight line in TRUE space
          // from here to where the glide will land, on the glide's own clock (it lands exactly on the frame's mapping)
          _nav.flight = null;
          if ((wasGal || (fb && fb.galactic)) && glide.param && tsGlideEndCam(_tsEnd))
            _nav.flight = { from: nearCam.position.clone(), to: tsFrame(fb, _tsEnd, new THREE.Vector3()), ref: glide.param };
        }
        _nav.dest.copy(dest);
      }
      if (_nav.flight) {
        if (glide.param === _nav.flight.ref) { var GP = glide.param; _nav.p = Math.min(1, GP.ease(GP.t)); return; }
        _nav.flight = null; _nav.p = 1; _nav.a = _nav.b; return;   // the glide finished (or was taken over by the hand)
      }
      if (_nav.p < 1) {
        var d0 = _nav.start.distanceTo(_nav.dest), d1 = P.distanceTo(_nav.dest);
        _nav.p = Math.max(_nav.p, d0 < 1e-9 ? 1 : Math.min(1, 1 - d1 / d0));
        if (_nav.p > 0.9999) { _nav.p = 1; _nav.a = _nav.b; }
      }
    }
    function tsFocusWeight() {                       // how much a non-Earth body frame owns the view
      var w = _nav.b ? 1 : 0, wa = _nav.a ? 1 : 0, e = _nav.p * _nav.p * (3 - 2 * _nav.p);
      return wa + (w - wa) * e;
    }
    function syncCams() {
      tsUpdateNav();
      if (_nav.flight) _tsB.copy(_nav.flight.from).lerp(_nav.flight.to, _nav.p);   // a true flight between frames
      else {
        var e = _nav.p * _nav.p * (3 - 2 * _nav.p);
        tsFrame(_nav.b, camera.position, _tsB);
        if (e < 1) { tsFrame(_nav.a, camera.position, _tsA); _tsB.lerp(_tsA, 1 - e); }
      }
      nearCam.position.copy(_tsB);
      nearCam.quaternion.copy(camera.quaternion);
      // THE SKY CAMERA. The Milky-Way tier (and every galactic nebula in it) is built LINEAR: the Sun at the origin,
      // 0.052 units per light-year. So inside the galaxy the sky camera stands at the visitor's TRUE position in that
      // frame: ≈ the origin anywhere in the Solar System (the stars hang at infinity), the real place out among the
      // stars, and — in a nebula's frame — exactly the navigation camera. It meets the ladder at the 67-kly rail stop;
      // past it the ladder rules. Only a wonder WITHOUT a true frame (the extragalactic ones) is admired in ladder space.
      var cl = camera.position.length();
      _tsD.copy(nearCam.position).sub(_ts.sun.T).multiplyScalar(_ts.kpu / 9460730472580.8);   // the TRUE position, light-years from the Sun
      farCam.position.copy(_tsD).multiplyScalar(TS_RATE.mw);
      for (var ti = 0; ti < TS_TIERS.length; ti++) {
        var tc = TS_TIERS[ti].cam;
        tc.position.copy(_tsD).multiplyScalar(TS_TIERS[ti].rate); tc.quaternion.copy(camera.quaternion);
        tc.fov = camera.fov; tc.aspect = camera.aspect; tc.near = Math.max(1e-4, Math.min(camera.near, 0.02 * tc.position.length() + 1e-3));
        tc.far = Math.max(2e5, tc.position.length() * 2.5); tc.updateProjectionMatrix(); tc.updateMatrixWorld();
      }
      // natal-sky's crossfades and lazy builds still read the LADDER distance
      if (cl < 3500) { lodCam.position.copy(farCam.position); if (lodCam.position.length() > cl) lodCam.position.setLength(cl); }
      else lodCam.position.copy(camera.position);
      lodCam.quaternion.copy(camera.quaternion); lodCam.fov = camera.fov; lodCam.aspect = camera.aspect; lodCam.near = camera.near; lodCam.far = camera.far;
      lodCam.updateProjectionMatrix(); lodCam.updateMatrixWorld();
      var fFrame = _nav.p >= 0.5 ? _nav.b : _nav.a;
      var fd = farCam.position.length();
      // the baked Milky-Way band is the sky from INSIDE the disc; it hands over as the galaxy tier fades in (400 → 1500)
      var kb = Math.max(0, Math.min(1, (fd - 400) / 1100));
      _tsSpaceSky = 1 - kb * kb * (3 - 2 * kb);
      farCam.quaternion.copy(camera.quaternion);
      if (nearCam.fov !== camera.fov || nearCam.aspect !== camera.aspect) { nearCam.fov = camera.fov; nearCam.aspect = camera.aspect; }
      farCam.fov = camera.fov; farCam.aspect = camera.aspect;
      farCam.near = fd > 40 ? camera.near : Math.max(camera.near, 0.5);
      if (fFrame && fFrame.galactic && controls) farCam.near = Math.min(farCam.near, Math.max(1e-4, 0.15 * controls.getRadius()));   // a small nebula is admired from a fraction of a unit
      farCam.far = Math.max(camera.far, fd * 2.5);   // seen from another galaxy, ours must stay drawable until it is a speck
      farCam.updateProjectionMatrix();
      nearCam.updateMatrixWorld(); farCam.updateMatrixWorld();
    }
    // depth slices: only the depth ranges that actually hold something, each ≤ 2500:1 so 24-bit depth stays exact
    var _slices = [], _iv = [];
    function nearSlices(ground) {
      var cp = nearCam.position, n0 = ground ? 0.006 : 0.2, hiMax = 0;
      _iv.length = 0;
      for (var i = 0; i < _ts.clusters.length; i++) {
        var c = _ts.clusters[i], d = cp.distanceTo(c.pos);
        if (c.body && !ground) n0 = Math.min(n0, Math.max(0.0015, 0.3 * (d - c.body)));   // never clip a surface you stand close to
        if (d + c.R > 0) _iv.push([Math.max(1e-4, d - c.R), d + c.R]);
      }
      _iv.push([0, 2]);                                 // the camera's own neighbourhood (the lens-flare sprites)
      for (var j = 0; j < _iv.length; j++) { if (_iv[j][0] < n0) _iv[j][0] = n0; if (_iv[j][1] > hiMax) hiMax = _iv[j][1]; }
      _iv.sort(function (a, b) { return a[0] - b[0]; });
      _slices.length = 0;
      var lo = -1, hi = -1;
      function emit(a, b) { var x = a; while (x < b) { var y = Math.min(b, x * 2500); _slices.push(x, y); x = y; } }
      for (var m = 0; m < _iv.length; m++) {
        var a = _iv[m][0], b = _iv[m][1]; if (b <= a) continue;
        if (lo < 0) { lo = a; hi = b; } else if (a <= hi * 1.001) hi = Math.max(hi, b); else { emit(lo, hi); lo = a; hi = b; }
      }
      if (lo >= 0) emit(lo, hi);
      return _slices;
    }
    var _tsMW = null, _focusVd = 220;
    function tsTierOpacity(tier, f) {                 // scale every material in a tier for one render; returns what to restore
      var saved = [];
      for (var i = 0; i < tier.objs.length; i++) tier.objs[i].traverse(function (o) { if (o.material && o.material.opacity != null) { saved.push(o.material, o.material.opacity); o.material.opacity *= f; } });
      return saved;
    }
    function tsTierRestore(saved) { for (var i = 0; i < saved.length; i += 2) saved[i].opacity = saved[i + 1]; }
    function renderWorld() {
      if (!_ts) { renderer.render(scene, camera); return; }
      syncCams();
      var ac = renderer.autoClear, fog = scene.fog; renderer.autoClear = false;
      for (var tt = 0; tt < TS_TIERS.length; tt++) {     // 1a · the cosmic tiers, each from its own true-scale camera, far → near
        var tier = TS_TIERS[tt], on = false;
        for (var to = 0; to < tier.objs.length && !on; to++) on = tier.objs[to].visible && tier.objs[to].parent;
        if (on && tier.fadePx) {   // a model shrunk to a few pixels would pile its fixed-size points into a white blob: it fades out instead
          var apx = tier.extent / Math.max(1e-9, tier.cam.position.length()) / Math.tan(tier.cam.fov * Math.PI / 360) * innerHeight * 0.5;
          var tf = Math.max(0, Math.min(1, (apx - tier.fadePx[0]) / (tier.fadePx[1] - tier.fadePx[0])));
          if (tf <= 0.003) on = false;
          else if (tf < 0.999) { var saved = tsTierOpacity(tier, tf); renderer.clearDepth(); renderer.render(scene, tier.cam); tsTierRestore(saved); on = false; }
        }
        if (on) { renderer.clearDepth(); renderer.render(scene, tier.cam); }
      }
      renderer.clearDepth(); renderer.render(scene, lodCam);   // 1b · the ember dust, on the ladder as it was tuned
      // 1c · the galaxy and everything in it (true scale, Sun at the origin). Seen from another galaxy it is just a small
      // spiral; once it shrinks to a few pixels its 118k fixed-size points would pile into a white blob — it fades instead
      if (!_tsMW) { _tsMW = ["MilkyWayGalaxy", "MilkyWayGlow", "MilkyWayImpostor"].map(function (n) { return scene.getObjectByName(n); }).filter(Boolean); if (_tsMW.length < 2) _tsMW = null; }
      var mwF = 1;
      if (_tsMW) { var mwPx = 2600 / Math.max(1e-9, farCam.position.length()) / Math.tan(farCam.fov * Math.PI / 360) * innerHeight * 0.5; mwF = Math.max(0, Math.min(1, (mwPx - 1.5) / 7)); }
      // once the galaxy itself is under ~1.5 px nothing in this pass (its stars, nebulae, satellites) is bigger, so the pass is
      // skipped: drawing it at zero opacity still cost the full fill of 119k points piled on one pixel (build 246: from the
      // Virgo Cluster that halved the frame rate)
      if (!(_tsMW && mwF <= 0.003)) {
        var mwSaved = null;
        if (mwF < 0.999 && _tsMW) mwSaved = _tsMW.map(function (o) { var v = o.material.opacity; o.material.opacity = v * mwF; return v; });
        renderer.clearDepth(); renderer.render(scene, farCam);
        if (mwSaved) _tsMW.forEach(function (o, i) { o.material.opacity = mwSaved[i]; });
      }
      if (_trueStars && syncTrueStars() > 0.01) renderer.render(_trueStars.scene, _trueStars.cam);   // 1b · the stars, at their true distances
      scene.fog = null;                                 // 2 · the Solar System, true scale, far slice → near slice
      // (from light-years out nothing in it is bigger than a pixel — and depth slices that far out lose precision)
      var sl = nearCam.position.distanceTo(_ts.sun.T) > _ts.nearSkip ? [] : nearSlices(!!(controls && controls.isGround()));
      for (var i = sl.length - 2; i >= 0; i -= 2) {
        renderer.clearDepth();
        nearCam.near = sl[i]; nearCam.far = sl[i + 1] * 1.0005; nearCam.updateProjectionMatrix();
        renderer.render(scene, nearCam);
      }
      scene.fog = fog; renderer.autoClear = ac;
    }
    function tsDistanceInfo() {                       // the true distance the visitor stands from what they orbit
      if (!_ts) return null;
      var f = _nav.p >= 0.5 ? _nav.b : _nav.a, anchor = f ? f.T : HOME;
      var km = nearCam.position.distanceTo(anchor) * _ts.kpu, kmSun = nearCam.position.distanceTo(_ts.sun.T) * _ts.kpu;
      return { from: f ? f.name : "Earth", label: f && f.label, km: km, text: _ts.fmt(km), sunKm: kmSun, sunText: _ts.fmt(kmSun) };
    }
    window.__space.tsDist = tsDistanceInfo;
    window.__space.tsTiers = function () { return TS_TIERS; };   // verification: the cosmic-model cameras
    window.__space.tsNav = function () {   // verification: the navigation frame state
      if (!_ts) return null;
      function fi(f) { return f && { name: f.name, s: f.s, kappa: f.kappa, rate: f.rate, T: +f.T.length().toExponential(4), proxy: +f.proxy.length().toFixed(2) }; }
      var b = _nav.b, rho = b ? camera.position.distanceTo(b.proxy) : camera.position.length();
      return { a: fi(_nav.a), b: fi(b), p: _nav.p, flight: !!_nav.flight, rho: rho, nearToB: b ? nearCam.position.distanceTo(b.T) : null,
               expect: b ? _ts.bodyDistance(_ts.L, b.s, b.kappa, rho) : null };
    };
    var TS_NEAR_ROOTS = { NyeArmature: 1, SunFlareChain: 1, GroundTerrain: 1, LocalMapGround: 1, BaseCity: 1, GroundHorizonDome: 1 };
    function markFarLayers() {                         // layer 0 = the Solar System + the ground · 1 = the galaxy frame · 2–8 = the cosmic tiers · 9 = the ladder (ember dust)
      var bg = natalSky && natalSky.bodyGroup;
      TS_TIERS.forEach(function (t) { t.objs.length = 0; });
      function tierOf(o) { return o.name ? tsTierFor(o.name) : null; }
      function walk(o, layer) {
        if (o === bg) layer = 0;
        else if (layer !== 0) { var t = tierOf(o); if (t) { layer = t.layer; t.objs.push(o); } }
        o.layers.set(layer);
        for (var i = 0; i < o.children.length; i++) walk(o.children[i], layer);
      }
      for (var r = 0; r < scene.children.length; r++) { var c = scene.children[r]; walk(c, TS_NEAR_ROOTS[c.name] ? 0 : c.name === "deepEmbers" ? 9 : 1); }
    }
    function renderComposed() {
      renderer.setRenderTarget(_sceneRT); renderer.clear(); renderWorld(); renderer.setRenderTarget(null);
      var now = performance.now(), dt = _skyT ? Math.min(0.25, (now - _skyT) / 1000) : 0; _skyT = now;
      var onGround = !!(controls && controls.isGround && controls.isGround());
      _skyAmt += ((onGround ? 1 : 0) - _skyAmt) * Math.min(1, dt * 2.6);
      if (_skyAmt < 0.002) _skyAmt = 0;
      updateSkyUniforms(_skyAmt);
      if (_quantUniforms) _quantUniforms.uKeep.value = _acUniforms && (_acUniforms.uSkyAmt.value > 0 || _acUniforms.uSpaceSky.value > 0) ? 1 : 0;
      if (natalSky && natalSky.setGroundSky) natalSky.setGroundSky(Math.max(_skyAmt, _ts ? _tsSpaceSky : 0));   // the procedural field steps back wherever the real catalogue leads
      _skyState.amt = _skyAmt; _skyState.baked = !!_milkyRT; _skyState.gain = _acUniforms ? _acUniforms.uMilkyGain.value : 0;
      window.__space.sky = _skyState;
      composer.render();
    }
    function syncSceneBg() {
      // the page colour feeds the ALPHA-COMPOSITE pass (not scene.background) — re-synced on theme change
      if (!_acUniforms) return;
      try { _acUniforms.uBg.value.set(getComputedStyle(document.body).backgroundColor); }
      catch (e) { _acUniforms.uBg.value.set(0x0b0a09); }
    }
    Promise.all([
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/UnrealBloomPass.js"),
      import("three/addons/postprocessing/OutputPass.js"),
      import("three/addons/postprocessing/ShaderPass.js")
    ]).then(function (mods) {
      /* THE KEY DISCOVERY (A/B against the direct path): the site's tuned look was silently shaped by
         straight-alpha CSS compositing — faint additive sprites accumulate rgb but near-zero ALPHA, so
         the page compositor (rgb×a) hid most of the field; only dense stacks became visible. A composer
         bypasses that and exposes the raw (much brighter) scene. So we REPRODUCE the same composite
         explicitly: base render keeps its alpha, then rgb×a + pageColour×(1−a), and only THEN bloom —
         so bloom sees exactly what the eye saw on the direct path and lifts only its real hot cores.
         LDR (UnsignedByte) base keeps the clamped-accumulation art; samples:4 restores MSAA (WebGL2). */
      /* BUILD 227: the scene still renders into its OWN fixed LDR target (_sceneRT — clamped accumulation,
         MSAA, exactly as before), but every pass AFTER the alpha composite now runs in HalfFloat. An 8-bit
         LINEAR buffer has no codes between black and ~13/255 sRGB, so the real night sky the composite now
         paints behind the base view (gradient, airglow, city glow, the Milky Way) would have banded into
         rings. Space views are unchanged: there the composite is the same rgb×a + page×(1−a) as ever. */
      var baseRT = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.UnsignedByteType, samples: 4 });
      var postRT = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });
      var c = new mods[0].EffectComposer(renderer, postRT);
      var _composerSetSize = c.setSize.bind(c);
      c.setSize = function (w, h) {   // the scene target follows every resize / dynamic-resolution step
        _composerSetSize(w, h);
        baseRT.setSize(Math.max(1, Math.floor(w * c._pixelRatio)), Math.max(1, Math.floor(h * c._pixelRatio)));
      };
      c.setPixelRatio(renderer.getPixelRatio());
      c.setSize(innerWidth, innerHeight);
      // no RenderPass: renderComposed() draws the scene into baseRT itself, so the scene target never
      // ping-pongs into the float buffers; the composite reads it through tScene ("tNone" = don't rebind)
      var alphaComposite = new mods[4].ShaderPass(makeSkyComposite(baseRT.texture), "tNone");
      alphaComposite.uniforms.tScene.value = baseRT.texture;   // ShaderPass deep-clones uniforms, and a render-target texture clones to null
      _sceneRT = baseRT;
      _acUniforms = alphaComposite.uniforms;
      c.addPass(alphaComposite);
      bloomPass = new mods[2].UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.32, 0.86);
      c.addPass(bloomPass);
      // SPACE STAYS BIT-FAITHFUL: the old pipeline stored composite AND bloom in 8-bit linear, which rounded
      // away the faintest bloom halos (< 0.5/255) — the tuned "sparse dark" space look depends on that floor.
      // Off the ground we round exactly as the old buffer did; on the ground (uKeep → 1) the float precision
      // is kept so the night-sky gradient never bands.
      var quantize = new mods[4].ShaderPass({
        uniforms: { tDiffuse: { value: null }, uKeep: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform sampler2D tDiffuse; uniform float uKeep; varying vec2 vUv;\n" +
          "void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 q = floor(clamp(c.rgb, 0.0, 1.0) * 255.0 + 0.5) / 255.0;\n" +
          "  gl_FragColor = vec4(mix(q, c.rgb, uKeep), 1.0); }"
      });
      _quantUniforms = quantize.uniforms;
      c.addPass(quantize);
      c.addPass(new mods[3].OutputPass());
      composer = c;
      syncSceneBg();
      new MutationObserver(syncSceneBg).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }).catch(function () { /* graceful: plain render path (no bloom) */ });
    /* cosmos: the camera orbits the world with the REAL Nye Clock's premium
       trackball — world-space angular velocity about ANY axis, up-vector riding
       along (ported from nye-clock-bazi.html createPremiumOrbitControls).
       No pole lock, no plane that fights the hand. */
    function createPremiumOrbitControls(cam, domElement, T3) {
      var target = new T3.Vector3();
      var minDistance = 8, maxDistance = 340;
      var angVel = new T3.Vector3();
      var tmpPull = new T3.Vector3(0, 0.22, 1);
      var rotateSpeed = 0.00068, maxEventDelta = 0.045, dampingFactor = 0.032, zoomStep = 0.031, pinchGamma = 0.79;
      // ---- silky log-space zoom (geometric glide) ----
      // the wheel accumulates a TARGET radius in ln-space (so N notches in then N out return to
      // the exact start radius); update() eases the live radius toward it every frame — scale-
      // invariant (same feel near the Earth and far out), magnitude-aware, damped, clip-proof.
      var zoomTarget = -1;        // desired radius; -1 = unseeded → adopt the live radius on first use
      var externalDrive = false;  // true while an entrance/glide owns the radius this frame (don't ease)
      var zoomStepLn = 0.34;      // ln(r) shift per one firm scroll unit (≈ one mouse-wheel notch)
      var zoomRef = 118;          // px-equivalent that counts as 1.0 firm unit
      var zoomHi = 1.85;          // per-EVENT upper clamp on units (anti-fling); no lower floor
      var zoomEase = 0.215;       // per-frame log-space easing coefficient (critically-damped feel)
      var zoomGov = null;         // true scale: fn(radius) → step multiplier (caps the TRUE distance change per notch)
      /* ---- GROUND MODE (the base 根据地): lying at a place on the Earth, looking up ----
         The camera stands ON the globe; drag = look around the sky (yaw/pitch, first person),
         wheel/pinch OUT = lift off (handled by the onLiftoff callback the page provides).
         The orbit model is suspended: update() leaves the camera alone entirely. */
      var groundMode = false, gEast = null, gNorth = null, gNormal = null;
      var gYaw = 0, gPitch = 1.15, gLiftoff = null, gLiftFired = false;
      var gVelYaw = 0, gVelPitch = 0;   // flick inertia: release a drag and the gaze glides to rest
      var _glDir = new T3.Vector3();
      function applyGroundLook() {
        var ch = Math.cos(gPitch), sh = Math.sin(gPitch), cy2 = Math.cos(gYaw), sy2 = Math.sin(gYaw);
        var d = _glDir.set(0, 0, 0)
          .addScaledVector(gNorth, ch * cy2).addScaledVector(gEast, ch * sy2).addScaledVector(gNormal, sh).normalize();
        cam.up.copy(gNormal);
        target.copy(cam.position).addScaledVector(d, 400);   // the "target" is a far sky point along the gaze
        cam.lookAt(target);
      }
      function safeLookAtTarget() {
        var dx = target.x - cam.position.x, dy = target.y - cam.position.y, dz = target.z - cam.position.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!isFinite(d) || d < 1e-5) {
          tmpPull.set(0, 0.22, 1).normalize().multiplyScalar(Math.max(minDistance, 2.2));
          cam.position.copy(target).add(tmpPull); cam.up.set(0, 1, 0);
        }
        cam.lookAt(target);
      }
      // L3: shared scratch instances — these run every frame during drag/glide; per-frame
      // .clone()/new allocations here were feeding minor-GC pauses (hitching mid-gesture).
      var _sOff = null, _sAxis = null, _sQ = null;
      function safeOrbitOffset() {
        if (!_sOff) _sOff = new T3.Vector3();
        var off = _sOff.copy(cam.position).sub(target);
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
      var _avAxis = null, _avQ = null, _avOff = null;
      function applyAngVel(av, scale) {
        var len = av.length() * (scale > 0 ? scale : 1); if (len < 1e-10 || !isFinite(len)) return;
        if (!_avAxis) { _avAxis = new T3.Vector3(); _avQ = new T3.Quaternion(); _avOff = new T3.Vector3(); }
        var axis = _avAxis.copy(av).normalize();
        if (!isFinite(axis.x + axis.y + axis.z) || axis.lengthSq() < 1e-20) return;
        var q = _avQ.setFromAxisAngle(axis, len);
        var off = _avOff.copy(cam.position).sub(target).applyQuaternion(q);
        cam.position.copy(target).add(off);
        cam.up.applyQuaternion(q);
        safeLookAtTarget();
      }
      var scope = {
        target: target,
        setDistanceLimits: function (mn, mx) { minDistance = mn; maxDistance = mx; },
        setZoomGovernor: function (fn) { zoomGov = fn; },
        setInteractionTuning: function (o2) {
          if (!o2) return;
          if (o2.rotateSpeed != null) rotateSpeed = o2.rotateSpeed;
          if (o2.maxEventDelta != null) maxEventDelta = o2.maxEventDelta;
          if (o2.dampingFactor != null) dampingFactor = o2.dampingFactor;
          if (o2.zoomStep != null) zoomStep = o2.zoomStep;
          if (o2.zoomStepLn != null) zoomStepLn = o2.zoomStepLn;
          if (o2.zoomRef != null) zoomRef = o2.zoomRef;
          if (o2.zoomHi != null) zoomHi = o2.zoomHi;
          if (o2.zoomEase != null) zoomEase = o2.zoomEase;
          if (o2.pinchGamma != null) pinchGamma = o2.pinchGamma;
        },
        clearDelta: function () { angVel.set(0, 0, 0); },
        setExternalDrive: function (v) { externalDrive = !!v; },
        setGroundMode: function (o) {
          groundMode = true; gLiftFired = false; gVelYaw = 0; gVelPitch = 0;
          gNormal = o.normal.clone().normalize();
          var upW = new T3.Vector3(0, 1, 0);
          gEast = new T3.Vector3().crossVectors(upW, gNormal);
          if (gEast.lengthSq() < 1e-6) gEast.set(1, 0, 0);
          gEast.normalize();
          gNorth = new T3.Vector3().crossVectors(gNormal, gEast).normalize();
          gYaw = (o.yaw != null ? o.yaw : 0.35); gPitch = (o.pitch != null ? o.pitch : 1.12);
          gLiftoff = o.onLiftoff || null;
          cam.position.copy(o.position);
          angVel.set(0, 0, 0);
          applyGroundLook();
        },
        exitGroundMode: function () { groundMode = false; },   // deliberately touches nothing — the caller's glide steers the handoff
        isGround: function () { return groundMode; },
        isSettling: function () {   // R8: true while inertia / zoom-ease is still visibly moving the camera
          if (groundMode) return Math.abs(gVelYaw) > 2e-5 || Math.abs(gVelPitch) > 2e-5;
          if (angVel.lengthSq() > 4e-9) return true;
          var r = cam.position.distanceTo(target);
          return zoomTarget > 0 && Math.abs(Math.log(r / Math.max(1e-8, zoomTarget))) > 3e-4;
        },
        groundDrift: function (dYaw) { if (groundMode) { gYaw += dYaw; applyGroundLook(); } },
        rotateWorld: function (axis, ang) {                 // idle turn / glides ride the same math
          var q = new T3.Quaternion().setFromAxisAngle(axis, ang);
          var off = cam.position.clone().sub(target).applyQuaternion(q);
          cam.position.copy(target).add(off); cam.up.applyQuaternion(q); safeLookAtTarget();
        },
        setRadius: function (r) {
          var off = safeOrbitOffset(); var r0 = off.length(); if (!isFinite(r0) || r0 < 1e-8) return;
          var rc = Math.max(minDistance, Math.min(maxDistance, r));
          off.normalize(); cam.position.copy(target).add(off.multiplyScalar(rc));
          zoomTarget = rc;                 // keep the zoom accumulator glued to the driven radius
          safeLookAtTarget();
        },
        getRadius: function () { return cam.position.distanceTo(target); },
        update: function (dtF) {
          var dn = (dtF > 0 && isFinite(dtF)) ? dtF : 1;   // frames-equivalent step (offline pump() passes nothing → 1)
          if (groundMode) {   // the orbit model is suspended — only the flick inertia glides out
            if (!dragging && (Math.abs(gVelYaw) > 2e-5 || Math.abs(gVelPitch) > 2e-5)) {
              gYaw += gVelYaw * dn;
              gPitch = Math.max(-0.10, Math.min(1.52, gPitch + gVelPitch * dn));
              var gd = Math.pow(0.935, dn); gVelYaw *= gd; gVelPitch *= gd;   // longer silk glide on release (dt-correct)
              applyGroundLook();
            }
            return;
          }
          applyAngVel(angVel, dn);
          // R1: while DRAGGING, damp hard (0.30/frame → the world follows the hand, τ≈3 frames ≈55ms);
          // on release the gentler dampingFactor gives a ~1.2s silk coast instead of a 2-3s float-out.
          angVel.multiplyScalar(Math.pow(1 - (dragging ? 0.30 : dampingFactor), dn));
          if (angVel.lengthSq() < 1e-14) angVel.set(0, 0, 0);
          var off = safeOrbitOffset(); var r = off.length();
          if (!isFinite(r) || r < 1e-8) return;
          if (externalDrive) {
            // an entrance/glide owns the radius this frame — don't ease and NEVER clamp-reposition
            // against an authored path (ground launches/landings legitimately fly inside minDistance).
            // Keep the target glued (clamped) so the wheel resumes cleanly the instant control
            // returns — if a cancelled glide strands the camera out of bounds, the ease below
            // recovers it smoothly on the next free frame.
            zoomTarget = Math.max(minDistance, Math.min(maxDistance, r));
          } else {
            if (zoomTarget < 0) zoomTarget = r;                         // first frame: adopt live radius
            zoomTarget = Math.max(minDistance, Math.min(maxDistance, zoomTarget));
            // critically-damped ease in LOG space → scale-invariant, geometry-exact, no overshoot
            var lnR = Math.log(r), lnT = Math.log(zoomTarget), d = lnT - lnR, lnNext;
            if (Math.abs(d) < 1e-4) { lnNext = lnT; zoomTarget = Math.exp(lnT); }  // snap: kill float creep
            else { lnNext = lnR + (1 - Math.pow(1 - zoomEase, dn)) * d; }
            var rNext = Math.exp(lnNext);
            if (rNext < minDistance) rNext = minDistance;
            else if (rNext > maxDistance) rNext = maxDistance;         // re-clamp the eased radius every frame
            if (Math.abs(rNext - r) > 1e-7) {
              off.normalize(); cam.position.copy(target).add(off.multiplyScalar(rNext)); safeLookAtTarget();
            }
          }
        }
      };
      var _arRight = new T3.Vector3(), _arUp = new T3.Vector3();
      function _arClp(v) { return Math.max(-maxEventDelta, Math.min(maxEventDelta, v)); }
      function addRotation(dx, dy) {   // runs per pointermove (up to 240Hz mid-drag) — allocation-free
        cam.updateMatrixWorld();
        _arRight.setFromMatrixColumn(cam.matrixWorld, 0);
        _arUp.setFromMatrixColumn(cam.matrixWorld, 1);
        angVel.addScaledVector(_arUp, _arClp(-dx * rotateSpeed));
        angVel.addScaledVector(_arRight, _arClp(-dy * rotateSpeed));
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
        lastTouch = performance.now(); userMoved = true;
        activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (pinchActive) {
          if (groundMode) {   // any pinch on the ground = lift off toward space
            if (!gLiftFired && gLiftoff) { gLiftFired = true; gLiftoff(); }
            e.stopPropagation(); return;
          }
          var d = getPinchDist();
          if (pinchLastDist > 0 && d > 0) {
            var off = safeOrbitOffset();
            var ratio = Math.pow(Math.max(0.25, Math.min(4, pinchLastDist / d)), pinchGamma * (zoomGov ? zoomGov(off.length()) : 1));
            var r0 = off.length(); if (!isFinite(r0) || r0 < 1e-8) return;
            var r = Math.max(minDistance, Math.min(maxDistance, r0 * ratio));
            off.normalize(); cam.position.copy(target).add(off.multiplyScalar(r));
            zoomTarget = r;   // R2: keep the log-zoom accumulator glued, or update()'s ease pulls the radius straight back (pinch was a no-op)
          }
          pinchLastDist = d; e.stopPropagation(); return;
        }
        if (!dragging) return;
        if (groundMode) {
          // first-person look-around: grab the SKY — drag right pans the gaze left,
          // drag down pulls the sky down (gaze rises). Pitch may dip to the visible limb.
          var gdx = e.clientX - lastX, gdy = e.clientY - lastY;
          gYaw -= gdx * 0.0028;
          gPitch = Math.max(-0.10, Math.min(1.52, gPitch + gdy * 0.0028));
          gVelYaw = -gdx * 0.0028 * 0.42;                 // remember the flick — it glides on after release
          gVelPitch = gdy * 0.0028 * 0.42;
          applyGroundLook();
          lastX = e.clientX; lastY = e.clientY;
          e.stopPropagation(); return;
        }
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
        // normalize delta across deltaMode (0=px, 1=lines, 2=pages) to px-equivalents
        var norm = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
        if (!isFinite(norm) || norm === 0) { e.stopPropagation(); return; }
        if (groundMode) {
          // on the ground, pulling BACK is the launch gesture — you rise off the Earth
          if (norm > 0 && !gLiftFired && gLiftoff) { gLiftFired = true; gLiftoff(); }
          e.stopPropagation(); return;
        }
        // magnitude-aware unit, UPPER-clamped only (anti-fling); NO lower floor so tiny trackpad
        // events stay tiny and sum smoothly. ~zoomRef px == one firm mouse notch == 1.0 unit.
        var unit = Math.min(zoomHi, Math.abs(norm) / zoomRef);
        // preserve the original direction: this is the log-space form of r*=(1+sign(norm)*s),
        // i.e. scroll forward (deltaY<0) → smaller r → zoom IN; scroll back (deltaY>0) → zoom OUT
        var dLn = Math.sign(norm) * zoomStepLn * unit;
        // seed the target from the LIVE radius on first use, or right after an external drive ends
        var r0 = cam.position.distanceTo(target);
        if (zoomGov) dLn *= zoomGov(zoomTarget > 0 && !externalDrive ? zoomTarget : r0);
        if (zoomTarget < 0 || externalDrive) zoomTarget = r0;
        // accumulate in log space; clamp the TARGET (not the camera) so it can never slam/clip
        zoomTarget = Math.exp(Math.max(Math.log(minDistance), Math.min(Math.log(maxDistance), Math.log(zoomTarget) + dLn)));
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
    var ECL_TILT = 23.4392911 * Math.PI / 180;
    function skyDirWorld(raH, decDeg, r) {
      var a = raH * 15 * Math.PI / 180, d = decDeg * Math.PI / 180;
      var lon = Math.atan2(Math.sin(a) * Math.cos(ECL_TILT) + Math.tan(d) * Math.sin(ECL_TILT), Math.cos(a));
      var lat = Math.asin(Math.sin(d) * Math.cos(ECL_TILT) - Math.cos(d) * Math.sin(ECL_TILT) * Math.sin(a));
      return new THREE.Vector3((r || 1) * Math.cos(lat) * Math.cos(lon), (r || 1) * Math.sin(lat), (r || 1) * Math.cos(lat) * Math.sin(lon))
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), ECL_TILT);
    }
    var lastTouch = 0, userMoved = false, entranceUntil = 0;
    var glide = { frames: 0, axis: null, step: 0, distTarget: 0, param: null };
    function glideActive() { return glide.frames > 0 || !!glide.param; }
    var easeAddressPivot = function () {};
    /* ===== choreographed flight (the game-camera): direction nlerp + LOG-radius =====
       Launches and landings follow an authored curve instead of a raw lerp: radius is
       interpolated in ln-space (equal time = equal RATIO — a rocket's accelerating rise,
       a lander's double-soft touchdown) while the direction arcs and the gaze pivots. */
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeSoftOut(t) { t = t * t * (3 - 2 * t); return 1 - Math.pow(1 - t, 3); }   // derivative 0 at t=0: no frame-one jolt, still front-loaded
    var _pgDir = new THREE.Vector3();
    function paramGlide(o) {
      var camFrom = camera.position.clone(), camTo = o.camTo;
      glide.frames = 0; glide.camTo = null; glide.targetTo = null; glide.axis = null; glide.distTarget = 0;
      glide.param = {
        t: 0, n: o.frames || 90, ease: o.ease || easeInOutCubic,
        tease: o.targetEase || null,                       // the gaze may sweep on its own clock
        d0: camFrom.clone().normalize(), d1: camTo.clone().normalize(),
        lnR0: Math.log(Math.max(0.001, camFrom.length())), lnR1: Math.log(Math.max(0.001, camTo.length())),
        t0: controls.target.clone(), t1: o.targetTo.clone(),
        up1: o.up ? o.up.clone() : UP_Y,
        fovK: o.fovKick || 0, fov0: camera.fov
      };
      glide.onDone = o.onDone || null;
      lastTouch = performance.now(); userMoved = true;
    }

    /* ===== the FLIGHT DIRECTOR — first-person voyages, the grammar of flying games =====
       A cubic Bézier through space: depart TANGENTIALLY (along the current gaze — or
       straight up off the ground), arc through the cruise, and brake in ALONG THE FINAL
       SIGHTLINE so the destination grows dead ahead. The gaze leads the velocity early
       (you look where you fly) and locks onto the body late; the camera BANKS into
       turns; the lens breathes with the burn. This is what replaces "zooming". */
    var groundHintHook = null;   // the interaction closure installs groundHint here (flyTo lives at module scope)
    function flyTo(o) {
      var P0 = camera.position.clone();
      var P3 = o.camTo.clone();
      var body = o.lookAt ? o.lookAt.clone() : o.targetTo.clone();
      var dist = P0.distanceTo(P3);
      var fromGround = controls.isGround();
      var depart;
      if (fromGround) {
        controls.exitGroundMode();
        if (groundHintHook) groundHintHook(false);
        depart = P0.clone().normalize();                    // off the pad: straight up
      } else {
        depart = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);   // along the gaze
        // if the destination is behind us, soften the tangent so the arc stays graceful
        var toDest = P3.clone().sub(P0).normalize();
        if (depart.dot(toDest) < -0.2) depart.lerp(toDest, 0.65).normalize();
      }
      var P1 = P0.clone().addScaledVector(depart, Math.max(2.5, dist * (fromGround ? 0.42 : 0.30)));
      var arriveDir = P3.clone().sub(body).normalize();     // brake in along the final sightline
      if (!isFinite(arriveDir.x) || arriveDir.lengthSq() < 1e-6) arriveDir = P3.clone().sub(P0).normalize().negate();
      var P2 = P3.clone().addScaledVector(arriveDir, Math.max(2.0, dist * 0.28));
      glide.frames = 0; glide.camTo = null; glide.targetTo = null; glide.axis = null; glide.distTarget = 0;
      glide.param = {
        flight: true, t: 0,
        n: o.frames || Math.round(Math.max(120, Math.min(300, 80 + dist * 1.4))),
        ease: easeInOutCubic,
        P0: P0, P1: P1, P2: P2, P3: P3,
        body: body, t0: controls.target.clone(),
        bank: 0, prevV: null,
        fovK: (o.fovKick != null ? o.fovKick : 6), fov0: camera.fov
      };
      glide.onDone = o.onDone || null;
      lastTouch = performance.now(); userMoved = true;
    }
    function bez(P, e, out) {   // cubic Bézier point
      var u = 1 - e;
      out.set(0, 0, 0)
        .addScaledVector(P.P0, u * u * u)
        .addScaledVector(P.P1, 3 * u * u * e)
        .addScaledVector(P.P2, 3 * u * e * e)
        .addScaledVector(P.P3, e * e * e);
      return out;
    }
    var _fPos = new THREE.Vector3(), _fAhead = new THREE.Vector3(), _fLook = new THREE.Vector3(),
        _fVel = new THREE.Vector3(), _fRight = new THREE.Vector3(), _fUp = new THREE.Vector3();

    /* ===== THE BASE (根据地): where the visitor actually is =====
       On load we resolve the visitor's place from their IP (client-side, city-level,
       cached) and the site OPENS lying on the ground at that spot, looking up at the
       natal sky. Everything else — lift-off, tours, the whole orrery — starts from there. */
    var DEFAULT_BASE = { lat: 41.824, lon: -71.4128, city: "Providence" };   // the author's home: used only when the visitor can't be placed
    var baseGeo = null, groundEntered = false, tryGroundEntrance = null, groundDome = null, groundStars = null, groundMilky = null;
    var groundTerrain = null, _terrainMat = null, _heightmap = null, _hmMeta = null, _hmLoading = null;   // base-view REAL ETOPO terrain
    /* the sky is live: cross-fade the first-paint poster out (styles.css .sky-poster), then — once the
       entrance has settled — release the far-field textures (deep-sky clouds, planet maps) that used
       to compete with the first frame for bandwidth. Idempotent; safe from every entrance path. */
    var _skyLiveDone = false;
    function skyLive() {
      if (_skyLiveDone) return; _skyLiveDone = true;
      document.body.classList.add("sky-live");
      setTimeout(function () {
        var rel = function () { try { if (natalSky && natalSky.releaseLazyTextures) natalSky.releaseLazyTextures(); } catch (e) {} };
        if ("requestIdleCallback" in window) requestIdleCallback(rel, { timeout: 2500 }); else rel();
      }, 1600);
    }
    var _earthDayTex = null, _earthDayLoading = null;   // NASA-style day map for ground albedo (lazy)
    var groundDimTarget = 0, _earthUni = null, _traceMat = null;   // eased toward the target every frame in the frame loop
    var _localMap = null, _localMapMat = null, _localMapTex = null;   // base-view REAL local street map (geo-ui-maps / prettymaps)
    var _city = null, _cityMat = null, _cityData = null, _cityLoading = null;   // base-view REAL extruded OSM buildings (geo-ui-map 3D)
    /* the ground-view ATMOSPHERE: a warm band of light hugging the horizon all around
       the base — additive, baked once per landing, zero per-frame cost */
    function makeGroundDome(pos, normal) {
      removeGroundDome();
      var c = document.createElement("canvas"); c.width = 4; c.height = 256;
      var g2 = c.getContext("2d");
      var gr = g2.createLinearGradient(0, 0, 0, 256);           // canvas top row = texture v=1 = zenith
      // the band hugs the VISIBLE limb, not the level plane: at this eye height the
      // horizon dips ~14 deg (sqrt(2h/R)), so the glow sits where the planet's edge is
      // build 227: the composite now paints the real limb (haze, airglow, city light dome) behind the scene;
      // this additive band only keeps a thin warm line where the land meets the sky
      gr.addColorStop(0.0, "rgba(0,0,0,0)");
      gr.addColorStop(0.50, "rgba(0,0,0,0)");
      gr.addColorStop(0.522, "rgba(224,150,110,0.10)");
      gr.addColorStop(0.529, "rgba(255,200,150,0.26)");         // the horizon line (dip ≈5.3° at the low eye)
      gr.addColorStop(0.545, "rgba(120,72,48,0.06)");
      gr.addColorStop(1.0, "rgba(0,0,0,0)");
      g2.fillStyle = gr; g2.fillRect(0, 0, 4, 256);
      var tex = new THREE.CanvasTexture(c);
      groundDome = new THREE.Mesh(
        new THREE.SphereGeometry(40, 32, 24),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })
      );
      groundDome.name = "GroundHorizonDome";
      groundDome.position.copy(pos);
      groundDome.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      groundDome.renderOrder = 1;
      groundDome.visible = false;   // build 227: retired — drawn with depthTest off it glowed IN FRONT of the buildings; the composite paints the limb behind the scene
      scene.add(groundDome);
      var east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
      if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
      east.normalize();
      var north = new THREE.Vector3().crossVectors(normal, east).normalize();
      _skyUp = normal.clone(); _skyEast = east.clone(); _skyNorth = north.clone();   // the composite's sky frame
      // the REAL galactic plane in this sky (same transform as the drawn constellations) — when the
      // composite paints the Milky Way, the band stars must crowd along the very same arc
      var galOK = !!(composer && natalSky && natalSky.skyDir), gX = null, gY = null, gZ = null;
      if (galOK) {
        gX = natalSky.skyDir(17.7611, -29.0078); gZ = natalSky.skyDir(12.8573, 27.1283);
        gZ.addScaledVector(gX, -gZ.dot(gX)).normalize(); gY = new THREE.Vector3().crossVectors(gZ, gX).normalize();
      }
      if (galOK && _bsc) { buildRealStars(pos, normal); return; }
      if (galOK) loadBSC().then(function () {   // arrives after landing → swap the placeholder field for the real sky
        if (_bsc && groundStars && controls.isGround() && !groundStars.userData.real) {
          scene.remove(groundStars); groundStars.geometry.dispose(); groundStars.material.dispose(); groundStars = null;
          buildRealStars(pos, normal);
        }
      });
      var nField = MOBILE ? 1100 : 2200, nBand = MOBILE ? 2000 : 4200, n = nField + nBand;
      var gp = new Float32Array(n * 3), gc2 = new Float32Array(n * 3), gs = new Float32Array(n);
      var seed = 0x91ab7;
      function grndRand() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }
      // real stars span a range of spectral COLOURS — hot blue-white O/B/A → white → gold F/G → orange K → red M.
      function starRGB(t) {
        if (t < 0.11) return [0.62, 0.75, 1.0];        // O/B hot blue-white
        if (t < 0.29) return [0.82, 0.90, 1.0];        // A blue-white
        if (t < 0.54) return [1.0, 1.0, 0.97];         // white
        if (t < 0.75) return [1.0, 0.92, 0.74];        // F/G yellow-gold
        if (t < 0.90) return [1.0, 0.80, 0.55];        // K orange
        return [1.0, 0.64, 0.46];                      // M red-orange
      }
      // fallback band (no composite sky): the old tilted great circle
      var bandPole = new THREE.Vector3().addScaledVector(east, 0.86).addScaledVector(north, 0.50).addScaledVector(normal, 0.08).normalize();
      var b1 = new THREE.Vector3().crossVectors(bandPole, normal); if (b1.lengthSq() < 1e-4) b1.copy(east); b1.normalize();
      var b2 = new THREE.Vector3().crossVectors(bandPole, b1).normalize();
      if (galOK) { bandPole.copy(gZ); b1.copy(gX); b2.copy(gY); }
      for (var si = 0; si < n; si++) {
        var band = si >= nField, v = new THREE.Vector3(), okAbove = false;
        for (var tr = 0; tr < 16 && !okAbove; tr++) {
          if (band) {
            // galactic longitude, denser toward the centre (Sgr) and in Cygnus; latitude ~gaussian, thicker at the bulge
            var th = 0, acc = false;
            for (var rj = 0; rj < 8 && !acc; rj++) {
              th = (grndRand() * 2 - 1) * Math.PI;
              var wl = 0.30 + 0.70 * Math.exp(-Math.pow(th / 1.2, 2)) + 0.25 * Math.exp(-Math.pow((th - 1.36) / 0.42, 2));
              acc = grndRand() < wl;
            }
            var wB = 0.07 + 0.09 * Math.exp(-Math.pow(th / 0.5, 2));
            var off = (grndRand() + grndRand() + grndRand() - 1.5) * wB * 1.4;
            v.copy(b1).multiplyScalar(Math.cos(th)).addScaledVector(b2, Math.sin(th)).multiplyScalar(Math.cos(off)).addScaledVector(bandPole, Math.sin(off)).normalize();
          } else {
            var az = grndRand() * Math.PI * 2, alt = 0.16 + Math.pow(grndRand(), 0.72) * 1.26, ca = Math.cos(alt), sa = Math.sin(alt);
            v.copy(north).multiplyScalar(Math.cos(az) * ca).addScaledVector(east, Math.sin(az) * ca).addScaledVector(normal, sa).normalize();
          }
          if (v.dot(normal) >= 0.12) okAbove = true;   // keep every star above the horizon (depthTest is off)
        }
        var rSky = 34 + grndRand() * 4, pk = si * 3;
        gp[pk] = pos.x + v.x * rSky; gp[pk + 1] = pos.y + v.y * rSky; gp[pk + 2] = pos.z + v.z * rSky;
        if (!okAbove) { gc2[pk] = gc2[pk + 1] = gc2[pk + 2] = 0; gs[si] = 0; continue; }
        // a real magnitude hierarchy: almost all stars faint pinpricks, a few bright ones that carry the sky
        var tb = Math.pow(grndRand(), band ? 9 : 6.5);
        var lum = band ? (0.10 + 0.34 * Math.pow(grndRand(), 2.0) + 0.6 * tb) : (0.26 + 0.30 * grndRand() + 0.95 * tb);
        gs[si] = band ? (1.05 + 0.9 * Math.pow(grndRand(), 3) + 2.0 * tb) : (1.25 + 0.6 * grndRand() + 3.3 * tb);
        var c = starRGB(grndRand());
        gc2[pk] = c[0] * lum; gc2[pk + 1] = c[1] * lum; gc2[pk + 2] = c[2] * lum;
      }
      var sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(gp, 3));
      sg.setAttribute("color", new THREE.BufferAttribute(gc2, 3));
      sg.setAttribute("aSize", new THREE.BufferAttribute(gs, 1));
      // round, soft-cored points sized per star (the old PointsMaterial drew every star the same 3.8px)
      var starMat = new THREE.ShaderMaterial({
        uniforms: { uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 0.92 } },
        vertexShader: "uniform float uPR; attribute float aSize; varying vec3 vC;\n" +
          "void main(){ vC = color; gl_PointSize = aSize * uPR * 1.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uOpacity; varying vec3 vC;\n" +
          "void main(){ vec2 p = gl_PointCoord - 0.5; float r2 = dot(p, p) * 4.0; float a = exp(-r2 * 6.0); if (a < 0.012) discard;\n" +
          "  gl_FragColor = vec4(vC, a * uOpacity); }",
        vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false
      });
      starMat.opacity = 0.92;   // the frame loop fades .opacity on launch; onBeforeRender carries it into the shader
      groundStars = new THREE.Points(sg, starMat);
      groundStars.onBeforeRender = function () { starMat.uniforms.uOpacity.value = starMat.opacity; starMat.uniforms.uPR.value = renderer.getPixelRatio(); };
      groundStars.name = "GroundSkyStars"; groundStars.frustumCulled = false; groundStars.renderOrder = 3;
      scene.add(groundStars);
      if (galOK) return;   // the composite paints the Milky Way itself — no haze sprites
      // FALLBACK (no composer): big, dim, soft sprites packed on the band so it still reads as a river
      var gc = document.createElement("canvas"); gc.width = gc.height = 32;
      var gx = gc.getContext("2d"), gg = gx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gg.addColorStop(0, "rgba(255,255,255,1)"); gg.addColorStop(0.28, "rgba(255,244,224,.72)");
      gg.addColorStop(0.72, "rgba(255,220,176,.10)"); gg.addColorStop(1, "rgba(255,220,176,0)");
      gx.fillStyle = gg; gx.fillRect(0, 0, 32, 32);
      var starTex = new THREE.CanvasTexture(gc);
      var nh = MOBILE ? 340 : 700, hp = new Float32Array(nh * 3), hc = new Float32Array(nh * 3);
      for (var hi = 0; hi < nh; hi++) {
        var hv = new THREE.Vector3(), okh = false;
        for (var ht = 0; ht < 16 && !okh; ht++) {
          var hth = grndRand() * Math.PI * 2, hoff = (grndRand() + grndRand() + grndRand() - 1.5) * 0.075;
          hv.copy(b1).multiplyScalar(Math.cos(hth)).addScaledVector(b2, Math.sin(hth)).addScaledVector(bandPole, hoff).normalize();
          if (hv.dot(normal) >= 0.14) okh = true;
        }
        var hr = 33 + grndRand() * 3, hk = hi * 3;
        hp[hk] = pos.x + hv.x * hr; hp[hk + 1] = pos.y + hv.y * hr; hp[hk + 2] = pos.z + hv.z * hr;
        if (!okh) { hc[hk] = hc[hk + 1] = hc[hk + 2] = 0; continue; }
        var hl = 0.022 + 0.028 * grndRand();
        hc[hk] = hl * 1.0; hc[hk + 1] = hl * 0.95; hc[hk + 2] = hl * 0.84;
      }
      var hg = new THREE.BufferGeometry();
      hg.setAttribute("position", new THREE.BufferAttribute(hp, 3));
      hg.setAttribute("color", new THREE.BufferAttribute(hc, 3));
      groundMilky = new THREE.Points(hg, new THREE.PointsMaterial({
        map: starTex, size: (MOBILE ? 24 : 34) * Math.min(devicePixelRatio || 1, 1.6),
        sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.6,
        depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false
      }));
      if ("toneMapped" in groundMilky.material) groundMilky.material.toneMapped = false;
      groundMilky.name = "GroundMilkyHaze"; groundMilky.frustumCulled = false; groundMilky.renderOrder = 2;
      scene.add(groundMilky);
    }
    /* the real sky from the base: every catalogue star at its true place in THIS sky (natalSky.skyDir — the
       transform the drawn figures use), brightness and size from its magnitude (perceptually compressed: the
       eye, not the photometer), colour from its spectral class (gently desaturated, as the eye sees it), and
       depth-tested so roofs, ridges and the limb really hide what is behind them. The ~25 brightest carry a
       camera's glare: a soft halo and four faint diffraction spikes (the SpaceEngine / astrophoto signature). */
    var _glareTex = null, groundGlare = null;
    function glareTexture() {
      if (_glareTex) return _glareTex;
      var N = 128, cv = document.createElement("canvas"); cv.width = cv.height = N;
      var x = cv.getContext("2d"), img = x.createImageData(N, N), h = N / 2;
      for (var yy = 0; yy < N; yy++) for (var xx = 0; xx < N; xx++) {
        var dx = (xx + 0.5 - h) / h, dy = (yy + 0.5 - h) / h, r = Math.sqrt(dx * dx + dy * dy);
        var halo = 1 / (1 + Math.pow(r / 0.055, 2.1)) * Math.pow(Math.max(0, 1 - r), 2);
        var sp = (Math.exp(-Math.pow(dy * h / 0.9, 2)) * Math.exp(-Math.abs(dx) * 3.2) + Math.exp(-Math.pow(dx * h / 0.9, 2)) * Math.exp(-Math.abs(dy) * 3.2)) * 0.30 * Math.max(0, 1 - r);
        var v = Math.min(1, halo + sp), k = (yy * N + xx) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(v * 255);
      }
      x.putImageData(img, 0, 0);
      _glareTex = new THREE.CanvasTexture(cv);
      return _glareTex;
    }
    function buildRealStars(pos, normal) {
      var d = _bsc, n = d.length / 4, P = [], C = [], S = [], GP = [], GC = [], GS = [], v = new THREE.Vector3();
      var CL = [[0.61, 0.69, 1.0], [0.68, 0.76, 1.0], [0.80, 0.85, 1.0], [0.97, 0.96, 1.0], [1.0, 0.94, 0.86], [1.0, 0.80, 0.60], [1.0, 0.70, 0.46]];
      for (var i = 0; i < n; i++) {
        var mag = d[i * 4 + 2] / 100; if (mag > 6.6) continue;
        natalSky.skyDir(d[i * 4] / 1365, d[i * 4 + 1] / 360, v);
        if (v.dot(normal) < -0.03) continue;                       // well below the limb: the land hides it anyway
        var sc = d[i * 4 + 3], c0 = Math.min(6, Math.floor(sc / 10)), f = (sc % 10) / 10, c1 = Math.min(6, c0 + 1);
        var col = [0, 1, 2].map(function (j) { var cc = CL[c0][j] * (1 - f) + CL[c1][j] * f; return cc * 0.68 + 0.32; });   // the eye desaturates starlight
        var t = Math.max(0, Math.min(1, (6.6 - mag) / 8.1)), inten = 0.24 + 0.76 * Math.pow(t, 1.35);
        var rr = 36;
        P.push(pos.x + v.x * rr, pos.y + v.y * rr, pos.z + v.z * rr);
        C.push(col[0] * inten, col[1] * inten, col[2] * inten);
        S.push(1.45 + 3.1 * Math.pow(t, 1.9));
        if (mag < 1.7) {
          GP.push(pos.x + v.x * rr, pos.y + v.y * rr, pos.z + v.z * rr);
          var gI = 0.35 + 0.65 * Math.pow((1.7 - mag) / 3.2, 0.8);
          GC.push(col[0] * gI, col[1] * gI, col[2] * gI);
          GS.push(18 + 54 * Math.pow((1.7 - mag) / 3.2, 1.1));
        }
      }
      var sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
      sg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(C), 3));
      sg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(S), 1));
      var starMat = new THREE.ShaderMaterial({
        uniforms: { uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 1 } },
        vertexShader: "uniform float uPR; attribute float aSize; varying vec3 vC;\n" +
          "void main(){ vC = color; gl_PointSize = aSize * uPR * 1.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uOpacity; varying vec3 vC;\n" +
          // a ~2 px point never samples its own centre: a narrow gaussian left its pixels at alpha ≈ 0.04, and the
          // alpha-gated composite (rgb×a) erased 640 of 644 stars. A broad, flat-topped core keeps every star.
          "void main(){ vec2 p = gl_PointCoord - 0.5; float r2 = dot(p, p) * 4.0; float a = pow(clamp(1.0 - r2, 0.0, 1.0), 1.6); if (a < 0.02) discard;\n" +
          "  gl_FragColor = vec4(vC, a * uOpacity); }",
        vertexColors: true, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false
      });
      starMat.opacity = 1;
      groundStars = new THREE.Points(sg, starMat);
      groundStars.onBeforeRender = function () { starMat.uniforms.uOpacity.value = starMat.opacity; starMat.uniforms.uPR.value = renderer.getPixelRatio(); };
      groundStars.name = "GroundSkyStars"; groundStars.userData.real = true; groundStars.frustumCulled = false; groundStars.renderOrder = 3;
      scene.add(groundStars);
      if (GP.length) {
        var gg = new THREE.BufferGeometry();
        gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(GP), 3));
        gg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(GC), 3));
        gg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(GS), 1));
        var gMat = new THREE.ShaderMaterial({
          uniforms: { uPR: { value: renderer.getPixelRatio() }, uTex: { value: glareTexture() }, uOpacity: { value: 1 } },
          vertexShader: "uniform float uPR; attribute float aSize; varying vec3 vC;\n" +
            "void main(){ vC = color; gl_PointSize = aSize * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: "uniform sampler2D uTex; uniform float uOpacity; varying vec3 vC;\n" +
            "void main(){ float a = texture2D(uTex, gl_PointCoord).a; if (a < 0.004) discard; gl_FragColor = vec4(vC, a * uOpacity); }",
          vertexColors: true, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false
        });
        groundGlare = new THREE.Points(gg, gMat);
        groundGlare.onBeforeRender = function () { gMat.uniforms.uOpacity.value = starMat.opacity; gMat.uniforms.uPR.value = renderer.getPixelRatio(); };
        groundGlare.name = "GroundStarGlare"; groundGlare.frustumCulled = false; groundGlare.renderOrder = 3.1;
        scene.add(groundGlare);
      }
      window.__space.realStars = P.length / 3;
    }
    /* TRUE SCALE: the real catalogue as the sky of SPACE too — all 9,096 Bright Star Catalogue stars at infinity
       (a far-layer sphere the sky camera only turns inside), the same star look as the base view minus the air.
       It replaces the procedural ember "snow" that used to stand in for stars around the orrery. */
    var _spaceStars = null, _spaceGlare = null;
    function buildSpaceStars() {
      if (_spaceStars || !_bsc || !natalSky || !natalSky.skyDir) return;
      var d = _bsc, n = d.length / 4, P = [], C = [], S = [], GP = [], GC = [], GS = [], v = new THREE.Vector3(), R = 4000;
      var CL = [[0.61, 0.69, 1.0], [0.68, 0.76, 1.0], [0.80, 0.85, 1.0], [0.97, 0.96, 1.0], [1.0, 0.94, 0.86], [1.0, 0.80, 0.60], [1.0, 0.70, 0.46]];
      for (var i = 0; i < n; i++) {
        var mag = d[i * 4 + 2] / 100; if (mag > 6.6) continue;
        natalSky.skyDir(d[i * 4] / 1365, d[i * 4 + 1] / 360, v);
        var sc = d[i * 4 + 3], c0 = Math.min(6, Math.floor(sc / 10)), f = (sc % 10) / 10, c1 = Math.min(6, c0 + 1);
        var col = [0, 1, 2].map(function (j) { var cc = CL[c0][j] * (1 - f) + CL[c1][j] * f; return cc * 0.78 + 0.22; });   // above the air: a touch more colour
        var t = Math.max(0, Math.min(1, (6.6 - mag) / 8.1)), inten = 0.22 + 0.78 * Math.pow(t, 1.4);
        P.push(v.x * R, v.y * R, v.z * R); C.push(col[0] * inten, col[1] * inten, col[2] * inten); S.push(1.3 + 2.9 * Math.pow(t, 2.0));
        if (mag < 1.6) { GP.push(v.x * R, v.y * R, v.z * R); var gI = 0.3 + 0.6 * Math.pow((1.6 - mag) / 3.1, 0.8); GC.push(col[0] * gI, col[1] * gI, col[2] * gI); GS.push(14 + 40 * Math.pow((1.6 - mag) / 3.1, 1.1)); }
      }
      function pts(PP, CC, SS, frag, extraU, name, order) {
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PP), 3));
        g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(CC), 3));
        g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(SS), 1));
        var u = { uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 0 } }; for (var k in extraU) u[k] = extraU[k];
        var m = new THREE.ShaderMaterial({ uniforms: u, vertexColors: true, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
          vertexShader: "uniform float uPR; attribute float aSize; varying vec3 vC;\nvoid main(){ vC = color; gl_PointSize = aSize * uPR * " + (name === "SpaceStars" ? "1.6" : "1.0") + "; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: frag });
        var o = new THREE.Points(g, m); o.name = name; o.frustumCulled = false; o.renderOrder = order; o.layers.set(1);
        o.onBeforeRender = function () { u.uPR.value = renderer.getPixelRatio(); };
        scene.add(o); return o;
      }
      _spaceStars = pts(P, C, S, "uniform float uOpacity; varying vec3 vC;\nvoid main(){ vec2 p = gl_PointCoord - 0.5; float r2 = dot(p, p) * 4.0; float a = pow(clamp(1.0 - r2, 0.0, 1.0), 1.6); if (a < 0.02) discard;\n  gl_FragColor = vec4(vC, a * uOpacity); }", {}, "SpaceStars", 3);
      if (GP.length) _spaceGlare = pts(GP, GC, GS, "uniform sampler2D uTex; uniform float uOpacity; varying vec3 vC;\nvoid main(){ float a = texture2D(uTex, gl_PointCoord).a; if (a < 0.004) discard; gl_FragColor = vec4(vC, a * uOpacity); }", { uTex: { value: glareTexture() } }, "SpaceStarGlare", 3.1);
    }
    /* ===== TRUE SCALE · PHASE 2: the stars at their real distances (HYG v4.0, CC BY-SA 4.0) =====
       17,753 stars — every one brighter than magnitude 7 plus every star within 25 pc — placed in parsecs in their
       own scene and drawn by their own camera, which stands at the visitor's TRUE position relative to the Sun.
       The GPU computes each star's apparent magnitude from there (m = M + 5·log10(d/10 pc)), so from inside the
       Solar System this IS the real night sky, and once you leave it the near stars swing by in true parallax,
       the constellations come apart, and the Sun becomes one magnitude-4.8 star among the rest. */
    var KM_PER_PC = 3.0856775814913673e13;
    var _trueStars = null;   // { scene, cam, core, glare, sun, names: [{i, en, p}] }
    var TS_STAR_ZH = { Sirius: "天狼星", Canopus: "老人星", Arcturus: "大角星", "Rigil Kentaurus": "南门二", Vega: "织女星", Capella: "五车二",
      Rigel: "参宿七", Procyon: "南河三", Achernar: "水委一", Betelgeuse: "参宿四", Hadar: "马腹一", Altair: "河鼓二", Acrux: "十字架二",
      Aldebaran: "毕宿五", Spica: "角宿一", Antares: "心宿二", Pollux: "北河三", Fomalhaut: "北落师门", Mimosa: "十字架三", Deneb: "天津四",
      Toliman: "南门二 B", Regulus: "轩辕十四", Adhara: "弧矢七", Castor: "北河二", Gacrux: "十字架一", Shaula: "尾宿八", Bellatrix: "参宿五",
      Elnath: "五车五", Alnilam: "参宿二", Alnitak: "参宿一", Alioth: "玉衡", Dubhe: "天枢", Alkaid: "摇光", Mirfak: "天船三", Wezen: "弧矢一",
      Polaris: "北极星", Alphard: "星宿一", Hamal: "娄宿三", Algol: "大陵五", Kochab: "北极二", Saiph: "参宿六", Mirzam: "军市一", Nunki: "斗宿四",
      Menkalinan: "五车三", Alhena: "井宿三", Rasalhague: "候", Alpheratz: "壁宿二", Mirach: "奎宿九", Diphda: "土司空", Algieba: "轩辕十二",
      "Kaus Australis": "箕宿三", Ran: "天苑四", "Barnard's Star": "巴纳德星", "Proxima Centauri": "比邻星", "Wolf 359": "沃尔夫 359",
      "Lalande 21185": "拉朗德 21185", "Luyten's Star": "鲁坦星", "Kapteyn's Star": "卡普坦星", "Ross 128": "罗斯 128", "Ross 154": "罗斯 154",
      "Ross 248": "罗斯 248", "Groombridge 34": "格鲁姆布里奇 34", "Lacaille 9352": "拉卡伊 9352", "Lacaille 8760": "拉卡伊 8760",
      Miaplacidus: "南船五", Avior: "海石一", Alsephina: "天社一", Alnair: "鹤一", Atria: "三角形三", Peacock: "孔雀十一", Tiaki: "鹤二",
      Sargas: "尾宿五", Menkent: "库楼三", "Struve 2398 A": "斯特鲁维 2398 A", "Struve 2398 B": "斯特鲁维 2398 B", "EZ Aqr": "宝瓶座 EZ" };
    // the catalogue is fetched at page start (it is only 284 KB, but on a slow line it must not queue behind the scene);
    // it is BUILT once the true-scale world exists
    var _hygP = TRUE_SCALE ? Promise.all([
      fetch("data/stars-hyg.bin").then(function (r) { return r.ok ? r.arrayBuffer() : null; }),
      fetch("data/stars-hyg-names.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).catch(function (e) { window.__space.trueStarsError = String(e); return [null, null]; }) : null;
    function loadTrueStars() {
      if (_trueStars || loadTrueStars._p || !_hygP) return;
      loadTrueStars._p = _hygP.then(function (res) { if (res && res[0] && natalSky && natalSky.skyDir) buildTrueStars(res[0], res[1]); })
        .catch(function (e) { window.__space.trueStarsError = String(e && e.stack || e); });
    }
    function buildTrueStars(buf, names) {
      var n = new Uint32Array(buf, 0, 1)[0];
      var xyz = new Float32Array(buf, 4, n * 3), M = new Int16Array(buf, 4 + n * 12, n), CI = new Int16Array(buf, 4 + n * 14, n);
      var sc = new THREE.Scene(), root = new THREE.Group(); sc.add(root);
      // HYG is equatorial J2000 (x → RA 0h, z → north pole): orient it exactly as this sky's own frame does
      var ex = natalSky.skyDir(0, 0, new THREE.Vector3()), ey = natalSky.skyDir(6, 0, new THREE.Vector3()), ez = natalSky.skyDir(0, 90, new THREE.Vector3());
      root.matrixAutoUpdate = false; root.matrix.makeBasis(ex, ey, ez); root.updateMatrixWorld(true);
      var col = new Float32Array(n * 3), am = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var ci = CI[i] / 1000, t = Math.max(0, Math.min(1, (ci + 0.3) / 2.2));   // B−V → a blackbody-ish tint (blue-white … orange-red)
        var r = t < 0.35 ? 0.66 + t : 1.0, g = t < 0.5 ? 0.74 + 0.5 * t : 1.0 - 0.62 * (t - 0.5), bl = t < 0.3 ? 1.0 : Math.max(0.42, 1.0 - 1.1 * (t - 0.3));
        col[i * 3] = r * 0.78 + 0.22; col[i * 3 + 1] = g * 0.78 + 0.22; col[i * 3 + 2] = bl * 0.78 + 0.22;   // the eye desaturates starlight
        am[i] = M[i] / 100;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(xyz), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aAbs", new THREE.BufferAttribute(am, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      var U = { uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 0 }, uPx: { value: 1 }, uTex: { value: glareTexture() } };
      // apparent magnitude from where the camera truly stands, then the same star look as the base view
      var vs = "uniform float uPR; uniform float uPx; attribute float aAbs; varying vec3 vC; varying float vT; varying float vF;\n" +
        "void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(length(mv.xyz), 1e-7);\n" +
        "  float m = aAbs + 5.0 * log(d / 10.0) / 2.302585;\n" +
        "  float t = clamp((7.0 - m) / 8.1, 0.0, 1.6); vT = t; vF = clamp((7.2 - m) / 0.9, 0.0, 1.0);\n" +
        "  vC = color * (0.22 + 0.78 * pow(min(t, 1.0), 1.4)) * (1.0 + 0.6 * max(t - 1.0, 0.0));\n" +
        "  gl_PointSize = (m > 7.2 ? 0.0 : SIZE) * uPR * uPx;\n" +
        "  gl_Position = projectionMatrix * mv; }";
      function mat(size, frag) {
        return new THREE.ShaderMaterial({ uniforms: U, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
          vertexShader: vs.replace("SIZE", size), fragmentShader: frag });
      }
      var core = new THREE.Points(geo, mat("(1.3 + 2.9 * pow(min(t, 1.0), 2.0) + 6.0 * max(t - 1.0, 0.0)) * 1.6",
        "uniform float uOpacity; varying vec3 vC; varying float vT; varying float vF;\nvoid main(){ vec2 p = gl_PointCoord - 0.5; float a = pow(clamp(1.0 - dot(p, p) * 4.0, 0.0, 1.0), 1.6); if (a < 0.02) discard;\n" +
        "  gl_FragColor = vec4(vC, a * uOpacity * vF); }"));
      var glare = new THREE.Points(geo, mat("(t > 0.69 ? 14.0 + 40.0 * pow(clamp((t - 0.69) / 0.6, 0.0, 1.6), 1.1) : 0.0)",
        "uniform float uOpacity; uniform sampler2D uTex; varying vec3 vC; varying float vT; varying float vF;\nvoid main(){ float a = texture2D(uTex, gl_PointCoord).a; if (a < 0.004) discard;\n" +
        "  gl_FragColor = vec4(vC, a * uOpacity * 0.85 * clamp((vT - 0.69) / 0.12, 0.0, 1.0)); }"));
      core.frustumCulled = glare.frustumCulled = false; root.add(core); root.add(glare);
      // the Sun as one of them: absolute magnitude 4.83, G2 V — shown once you stand outside its system
      var sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
      sg.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1.0, 0.94, 0.84]), 3));
      sg.setAttribute("aAbs", new THREE.BufferAttribute(new Float32Array([4.83]), 1));
      var SU = { uPR: U.uPR, uOpacity: { value: 0 }, uPx: U.uPx, uTex: U.uTex };
      var sunPts = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: SU, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: vs.replace("SIZE", "(3.0 + 30.0 * pow(clamp(t, 0.0, 1.6), 1.5))"),
        fragmentShader: "uniform float uOpacity; uniform sampler2D uTex; varying vec3 vC; varying float vT; varying float vF;\nvoid main(){ float a = max(texture2D(uTex, gl_PointCoord).a, pow(clamp(1.0 - dot(gl_PointCoord - 0.5, gl_PointCoord - 0.5) * 9.0, 0.0, 1.0), 2.0)); if (a < 0.004) discard; gl_FragColor = vec4(vC, a * uOpacity); }" }));
      sunPts.frustumCulled = false; root.add(sunPts);
      var cam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 1e-9, 1e6);
      var nm = [];
      if (names && names.names) names.names.forEach(function (e) { var i = e[0]; if (i < n) nm.push({ i: i, en: e[1], zh: TS_STAR_ZH[e[1]] || e[1], p: new THREE.Vector3(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]).applyMatrix4(root.matrix), M: M[i] / 100 }); });
      _trueStars = { scene: sc, cam: cam, core: core, glare: glare, sun: sunPts, U: U, SU: SU, names: nm, n: n };
      window.__space.trueStars = n;
    }
    function syncTrueStars() {             // the star camera stands where the visitor truly is, in parsecs from the Sun
      var T = _trueStars, c = T.cam;
      c.position.copy(nearCam.position).sub(_ts.sun.T).multiplyScalar(_ts.kpu / KM_PER_PC);
      c.quaternion.copy(camera.quaternion); c.fov = camera.fov; c.aspect = camera.aspect; c.updateProjectionMatrix(); c.updateMatrixWorld();
      var dpc = c.position.length();
      // inside the Solar System they are the sky of space (off on the ground, where the base view's own sky leads);
      // past ~1 kpc the catalogue thins into the Milky Way tier that takes over
      var op = 0.95 * (1 - _skyAmt) * (1 - Math.max(0, Math.min(1, (Math.log(dpc) - Math.log(900)) / (Math.log(3500) - Math.log(900)))));
      T.U.uOpacity.value = op; T.U.uPR.value = renderer.getPixelRatio();
      T.U.uPx.value = Math.max(0.6, Math.min(1.4, innerHeight / 900));
      // the Sun's own point appears as its true disc and glare leave (≈ 2,000 → 20,000 AU out)
      var au = dpc * 206264.8;
      T.SU.uOpacity.value = op * Math.max(0, Math.min(1, (Math.log(au) - Math.log(2000)) / (Math.log(20000) - Math.log(2000))));
      return op;
    }
    function removeGroundDome() {
      if (groundDome) {
        scene.remove(groundDome);
        if (groundDome.material.map) groundDome.material.map.dispose();
        groundDome.material.dispose(); groundDome.geometry.dispose();
        groundDome = null;
      }
      if (groundStars) {
        scene.remove(groundStars);
        if (groundStars.material.map) groundStars.material.map.dispose();
        groundStars.material.dispose(); groundStars.geometry.dispose();
        groundStars = null;
      }
      if (groundGlare) { scene.remove(groundGlare); groundGlare.geometry.dispose(); groundGlare.material.dispose(); groundGlare = null; }
      if (groundMilky) {
        scene.remove(groundMilky);
        groundMilky.material.dispose(); groundMilky.geometry.dispose();
        groundMilky = null;
      }
      removeGroundTerrain();
    }

    /* ---- base-view REAL TERRAIN: a modeled local relief patch built ONCE per landing from
       real NOAA ETOPO1 elevation (data/earth-heightmap.i16, public domain) sampled around the
       visitor's lat/lon. Lives ONLY in ground mode — built on descent, disposed on exit — so
       the space / orrery / LSS views never construct it and stay byte-identical. Dark night
       ground; distant ranges dissolve into the horizon glow (aerial perspective); ridges
       occlude low stars (they set behind the mountains). The sky stays the star. ---- */
    function loadEarthDayMap() {
      if (_earthDayTex) return Promise.resolve(_earthDayTex);
      if (_earthDayLoading) return _earthDayLoading;
      _earthDayLoading = new Promise(function (resolve) {
        var loader = new THREE.TextureLoader();
        loader.load("data/earth-map.jpg?v=2", function (tex) {   // build 228: the armature's exact URL → an HTTP-cache hit, not a second 1.2 MB download
          tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
          tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = Math.min(8, (renderer.capabilities.getMaxAnisotropy && renderer.capabilities.getMaxAnisotropy()) || 1);
          _earthDayTex = tex; resolve(tex);
        }, undefined, function () { _earthDayLoading = null; resolve(null); });
      });
      return _earthDayLoading;
    }
    function loadHeightmap() {
      if (_heightmap) return Promise.resolve(_heightmap);
      if (_hmLoading) return _hmLoading;
      // build 228: the terrain only ever spans ±11° around the base, and the base is Providence for every
      // visitor — a 77 KB regional crop of the same ETOPO grid replaces the 4.7 MB global file that used
      // to hold the whole near ground (city and streets included) hostage on slow networks
      var g0 = baseGeo || DEFAULT_BASE;
      var regional = g0 && g0.lat >= 39 && g0.lat <= 45 && g0.lon >= -75.2 && g0.lon <= -66.8;
      var hmBase = regional ? "data/earth-heightmap-ne" : "data/earth-heightmap";
      _hmLoading = fetch(hmBase + ".json").then(function (r) { return r.json(); }).then(function (meta) {
        _hmMeta = meta;
        return fetch(hmBase + ".i16").then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
          _heightmap = new Int16Array(buf); window.__space.heightmapPts = _heightmap.length; return _heightmap;
        });
      }).catch(function (e) { window.__space.hmError = String(e); _hmLoading = null; return null; });
      return _hmLoading;
    }
    function sampleElevM(lat, lon) {                     // bilinear metres from the ETOPO grid
      var m = _hmMeta; if (!m || !_heightmap) return 0;
      while (lon < -180) lon += 360; while (lon > 180) lon -= 360;
      var fr = (lat - m.lat0) / (m.lat1 - m.lat0) * (m.nlat - 1);
      var fc = (lon - m.lon0) / (m.lon1 - m.lon0) * (m.nlon - 1);
      fr = Math.max(0, Math.min(m.nlat - 1.0001, fr));
      if (m.crop) fc = Math.max(0, Math.min(m.nlon - 1.0001, fc));   // a regional crop clamps; only the global grid wraps
      var r0 = Math.floor(fr), c0 = ((Math.floor(fc) % m.nlon) + m.nlon) % m.nlon;
      var dr = fr - Math.floor(fr), dc = fc - Math.floor(fc);
      var r1 = Math.min(m.nlat - 1, r0 + 1), c1 = (c0 + 1) % m.nlon;
      var a = _heightmap[r0 * m.nlon + c0] * (1 - dc) + _heightmap[r0 * m.nlon + c1] * dc;
      var b = _heightmap[r1 * m.nlon + c0] * (1 - dc) + _heightmap[r1 * m.nlon + c1] * dc;
      return a * (1 - dr) + b * dr;
    }
    function buildGroundTerrain(geo) {
      removeTerrainMesh();   // build 228: only the relief — the street map and city are built on landing and must survive this
      if (!nyeArmature || !nyeArmature.earthSurfacePoint || !_heightmap) return;
      var Rv = nyeArmature.earthRadiusVis || 0.95;
      var EARTH_M = 6371000, EXAG = 26;                 // vertical exaggeration — true relief is invisibly small vs the radius
      var mToScene = (Rv / EARTH_M) * EXAG;
      var em = nyeArmature.group.getObjectByName("NyeEarthMesh"); if (!em) return;
      em.updateWorldMatrix(true, false);
      var M = em.matrixWorld, ctr = new THREE.Vector3().setFromMatrixPosition(M), lv = new THREE.Vector3();
      var N = MOBILE ? 160 : 280, SPAN = 11.0, DEG = Math.PI / 180;   // denser grid → smoother ridgelines (same real data, finer sampling)
      var cl = Math.max(0.30, Math.cos(geo.lat * DEG));
      var dLa = (2 * SPAN) / (N - 1), dLo = (2 * SPAN / cl) / (N - 1);
      var pos = new Float32Array(N * N * 3), up = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3);
      var uvs = new Float32Array(N * N * 2), loc = new Float32Array(N * N * 2), elev = new Float32Array(N * N);
      var k = 0, k2 = 0, ke = 0;
      function elevUse(la2, lo2) { var ee = sampleElevM(la2, lo2); return ee > 0 ? ee : 0; }
      for (var iy = 0; iy < N; iy++) {
        var v = iy / (N - 1), la = geo.lat + (v - 0.5) * 2 * SPAN;
        for (var ix = 0; ix < N; ix++) {
          var u = ix / (N - 1), lo = geo.lon + (u - 0.5) * 2 * SPAN / cl;
          var eUse = elevUse(la, lo);
          var r = Rv + 0.0008 + eUse * mToScene;                 // +epsilon lifts the patch off the globe (no z-fight at sea level)
          var th = (90 - la) * DEG, ph = (lo + 180) * DEG, st = Math.sin(th);
          lv.set(-r * st * Math.cos(ph), r * Math.cos(th), r * st * Math.sin(ph)).applyMatrix4(M);
          pos[k] = lv.x; pos[k + 1] = lv.y; pos[k + 2] = lv.z;
          var nx = lv.x - ctr.x, ny = lv.y - ctr.y, nz = lv.z - ctr.z, il = 1 / Math.hypot(nx, ny, nz);
          var ux = nx * il, uy = ny * il, uz = nz * il;
          up[k] = ux; up[k + 1] = uy; up[k + 2] = uz;
          // REAL slope normal from ETOPO finite differences (geography owns the lighting)
          var eE = elevUse(la, lo + dLo), eW = elevUse(la, lo - dLo);
          var eNn = elevUse(la + dLa, lo), eSs = elevUse(la - dLa, lo);
          var stepE = Math.max(1e-6, Rv * dLo * DEG * cl), stepN = Math.max(1e-6, Rv * dLa * DEG);
          var sx = ((eE - eW) * 0.5 * mToScene) / stepE, sy = ((eNn - eSs) * 0.5 * mToScene) / stepN;
          // east = normalize(cross(worldY, up)); north = normalize(cross(up, east))
          var ex = uz, ey = 0, ez = -ux, el = Math.hypot(ex, ey, ez);
          if (el < 1e-6) { ex = 1; ey = 0; ez = 0; } else { ex /= el; ey /= el; ez /= el; }
          var nxE = uy * ez - uz * ey, nyE = uz * ex - ux * ez, nzE = ux * ey - uy * ex;
          var nl = Math.hypot(nxE, nyE, nzE); if (nl > 1e-6) { nxE /= nl; nyE /= nl; nzE /= nl; }
          var nnx = ux - ex * sx * 1.35 - nxE * sy * 1.35;
          var nny = uy - ey * sx * 1.35 - nyE * sy * 1.35;
          var nnz = uz - ez * sx * 1.35 - nzE * sy * 1.35;
          var nil = 1 / Math.hypot(nnx, nny, nnz);
          nrm[k] = nnx * nil; nrm[k + 1] = nny * nil; nrm[k + 2] = nnz * nil; k += 3;
          // equirectangular UV — match Three.js SphereGeometry + earth-map.jpg (north → v=1)
          uvs[k2] = ((lo + 180) / 360) % 1; if (uvs[k2] < 0) uvs[k2] += 1;
          uvs[k2 + 1] = (la + 90) / 180;
          loc[k2] = u; loc[k2 + 1] = v; k2 += 2;
          elev[ke++] = Math.max(0, Math.min(1, eUse / 4500));   // 0 sea → 1 ~Himalaya, for biome shading
        }
      }
      var idx = [];
      for (var y = 0; y < N - 1; y++) for (var x = 0; x < N - 1; x++) {
        var a0 = y * N + x, b0 = a0 + 1, c0i = a0 + N, d0 = c0i + 1;
        idx.push(a0, c0i, b0, b0, c0i, d0);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
      g.setAttribute("aUp", new THREE.BufferAttribute(up, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      g.setAttribute("aLoc", new THREE.BufferAttribute(loc, 2));
      g.setAttribute("aElev", new THREE.BufferAttribute(elev, 1));
      g.setIndex(idx);
      var placeholder = new THREE.DataTexture(new Uint8Array([8, 6, 5, 255]), 1, 1);
      placeholder.needsUpdate = true;
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uFade: { value: 0 },
          uMap: { value: _earthDayTex || placeholder },
          uUseMap: { value: _earthDayTex ? 1 : 0 }
        }, fog: false,
        vertexShader:
          "attribute vec3 aUp; attribute vec2 aLoc; attribute float aElev;\n" +
          "varying vec3 vN; varying vec3 vUp; varying vec3 vWp; varying vec2 vUv; varying vec2 vLoc; varying float vElev;\n" +
          "void main(){ vUv=uv; vLoc=aLoc; vElev=aElev; vUp=normalize(mat3(modelMatrix)*aUp);\n" +
          "  vec4 wp=modelMatrix*vec4(position,1.0); vWp=wp.xyz; vN=normalize(mat3(modelMatrix)*normal);\n" +
          "  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader:
          "varying vec3 vN; varying vec3 vUp; varying vec3 vWp; varying vec2 vUv; varying vec2 vLoc; varying float vElev;\n" +
          "uniform float uFade; uniform sampler2D uMap; uniform float uUseMap;\n" +
          "float th(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n" +
          "float tn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);\n" +
          "  return mix(mix(th(i),th(i+vec2(1.0,0.0)),u.x),mix(th(i+vec2(0.0,1.0)),th(i+vec2(1.0,1.0)),u.x),u.y);}\n" +
          "float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*tn(p);p=p*2.04+vec2(3.1,1.7);a*=0.5;}return v;}\n" +
          "void main(){\n" +
          "  vec3 N=normalize(vN), up=normalize(vUp); N=(dot(N,up)<0.0)?-N:N;\n" +
          "  vec3 east=normalize(cross(vec3(0.0,1.0,0.0),up)); if(dot(east,east)<0.5) east=vec3(1.0,0.0,0.0);\n" +
          "  vec3 north=normalize(cross(up,east));\n" +
          // micro-grain on top of REAL ETOPO slopes (silhouettes + lighting from elevation)
          "  vec2 P=vLoc*720.0; float e=0.75;\n" +
          "  float h0=fbm(P), hx=fbm(P+vec2(e,0.0)), hy=fbm(P+vec2(0.0,e));\n" +
          "  float bumpAmt=mix(0.55,2.2,smoothstep(0.02,0.35,vElev));\n" +
          "  vec3 Nb=normalize(N - (east*(hx-h0)+north*(hy-h0))*bumpAmt);\n" +
          "  float sky=max(dot(Nb,up),0.0), slope=clamp(1.0-dot(Nb,up),0.0,1.0);\n" +
          "  float ao=0.48+0.95*smoothstep(0.18,0.78,h0)*mix(0.85,1.0,vElev);\n" +
          "  vec3 alb=vec3(0.04,0.035,0.028);\n" +
          "  if(uUseMap>0.5){ alb=texture2D(uMap,vUv).rgb; }\n" +
          "  float ocean=smoothstep(0.035,0.0,vElev);\n" +
          "  alb=mix(alb,vec3(0.015,0.03,0.07),ocean*0.62);\n" +
          "  alb=mix(alb,vec3(0.58,0.60,0.64),smoothstep(0.52,0.92,vElev)*0.38);\n" +
          "  vec3 col=alb*ao*(0.048+0.12*sky);\n" +
          "  col+=vec3(0.035,0.045,0.075)*sky*0.32*(1.0-ocean);\n" +
          "  col+=vec3(0.95,0.58,0.36)*slope*(0.045+0.05*fbm(P*0.12))*(0.25+0.75*(1.0-ocean));\n" +
          "  float g=fbm(P*4.0)*0.26+0.20; col*=0.70+0.50*g;\n" +
          "  float d=length(cameraPosition-vWp), haze=smoothstep(0.026,0.145,d);\n" +
          "  col=mix(col,vec3(0.034,0.022,0.019),haze*0.85);\n" +   // build 227: fade into the dark limb of the real night sky (was a bright amber wall)
          "  gl_FragColor=vec4(col*uFade,1.0);\n" +
          "}"
      });
      if ("toneMapped" in mat) mat.toneMapped = false;
      groundTerrain = new THREE.Mesh(g, mat);
      groundTerrain.name = "GroundTerrain"; groundTerrain.frustumCulled = false; groundTerrain.renderOrder = 0;
      _terrainMat = mat; scene.add(groundTerrain);
      // if the day map arrives after the mesh, hot-swap without rebuilding the ETOPO grid
      if (!_earthDayTex) {
        loadEarthDayMap().then(function (tex) {
          if (!tex || !_terrainMat || _terrainMat !== mat) return;
          mat.uniforms.uMap.value = tex; mat.uniforms.uUseMap.value = 1;
        });
      }
      // the REAL local street map goes on LAST (built with the terrain, cleared with it) so the terrain
      // rebuild's removeGroundTerrain() can't wipe it — your actual streets underfoot at the base.
      var _sp = nyeArmature.earthSurfacePoint(geo.lat, geo.lon, 0.0002);   // on the GROUND (well below the ~0.004 eye), so the map is the floor you stand on, not a ceiling
      if (_sp && !_localMap && !_city && !_cityPending && !_nearPending) buildNearWorld(_sp);   // normally already built on landing
    }
    function removeTerrainMesh() {
      if (groundTerrain) {
        scene.remove(groundTerrain);
        groundTerrain.geometry.dispose(); groundTerrain.material.dispose();
        groundTerrain = null; _terrainMat = null;
      }
    }
    function removeGroundTerrain() {
      removeTerrainMesh();
      removeLocalMapGround();
      removeBaseCity();
    }
    // LOCAL STREET-MAP GROUND (geo-ui-maps): a real prettymaps rendering of the base city (Providence)
    // laid in the tangent plane at the base point, so standing at the base your actual streets recede
    // toward the horizon under the natal sky. The regional ETOPO patch carries the far relief; this
    // carries the near human geography. Scale is exaggerated (a 3 km map → a neighborhood-to-horizon
    // patch) because the base view is a symbolic first-person tableau, not a survey.
    var _localMapOwnTex = null;
    function buildLocalMapGround(sp, srcTex, raw) {
      removeLocalMapGround();
      var mapTex = srcTex;
      if (!mapTex) {                                    // the baked Providence map (offline fallback)
        if (!_localMapTex) {
          _localMapTex = new THREE.TextureLoader().load("data/base-map-providence.jpg", function (t) {
            if ("colorSpace" in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
          });
        }
        mapTex = _localMapTex;
      } else _localMapOwnTex = srcTex;
      var up = sp.normal.clone().normalize();
      var east = new THREE.Vector3(0, 1, 0).cross(up); if (east.lengthSq() < 1e-6) east.set(1, 0, 0); east.normalize();
      var north = up.clone().cross(east).normalize();   // map north → geographic north at the base
      // The base view can only look ~6° below the horizon, so the map must be BROAD (a circular disc that
      // reaches toward the horizon) with the fade only at the very outer rim — the near ground you can see
      // is then your real streets, not a generic wash. Lifted enough to clear nearby ETOPO relief.
      var R = 0.155;
      var geo = new THREE.PlaneGeometry(2 * R, 2 * R, 1, 1);
      _localMapMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: mapTex }, uFade: { value: 0 }, uRaw: { value: raw ? 1 : 0 } },
        transparent: true, depthWrite: false, fog: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader:
          "varying vec2 vUv; uniform sampler2D uMap; uniform float uFade; uniform float uRaw;\n" +
          "void main(){\n" +
          "  vec3 src=texture2D(uMap,vUv).rgb;\n" +
          // build 229: a world-ground map is drawn already in night colours (dark land, water, lamp-lit asphalt)
          "  if(uRaw>0.5){ float d0=distance(vUv,vec2(0.5)); gl_FragColor=vec4(src*1.15, (1.0-smoothstep(0.40,0.50,d0))*uFade); return; }\n" +
          "  float lum=dot(src,vec3(0.30,0.54,0.16));\n" +
          // night remapping: dark wash → warm gold streets under starlight (not a daytime postcard)
          "  vec3 night=mix(vec3(0.010,0.009,0.008), vec3(0.62,0.38,0.18), smoothstep(0.10,0.48,lum));\n" +   // build 227: sodium-amber streets, not a gold postcard
          "  night=mix(night, src*vec3(1.05,0.78,0.55)*0.30, 0.18);\n" +
          "  float d=distance(vUv,vec2(0.5));\n" +
          "  float rim=1.0-smoothstep(0.38,0.50,d);\n" +
          "  float center=smoothstep(0.50,0.12,d);\n" +
          "  night*=0.72+0.55*center;\n" +
          "  gl_FragColor=vec4(night, rim*uFade*0.92); }"
      });
      if ("toneMapped" in _localMapMat) _localMapMat.toneMapped = false;
      _localMap = new THREE.Mesh(geo, _localMapMat);
      _localMap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, up));
      _localMap.position.copy(sp.position).addScaledVector(up, 0.00105);   // clear nearby ETOPO relief, still below the eye
      _localMap.name = "LocalMapGround"; _localMap.renderOrder = 0.5; _localMap.frustumCulled = false;
      scene.add(_localMap);
    }
    function removeLocalMapGround() {
      if (_localMap) { scene.remove(_localMap); _localMap.geometry.dispose(); _localMap.material.dispose(); _localMap = null; _localMapMat = null; }
      if (_localMapOwnTex) { _localMapOwnTex.dispose(); _localMapOwnTex = null; }
    }
    /* ===== build 229 — the NEAR WORLD for wherever the base is: real OSM streets, buildings and streetlights
       (world-ground.js, tiles through /api/tile). The baked Providence data stays as the offline fallback. ===== */
    var _world = null, _worldLoading = null, _nearPending = false;
    function loadNearWorld(geo) {
      var key = geo.lat.toFixed(4) + "," + geo.lon.toFixed(4);
      if (_world && _world.key === key) return Promise.resolve(_world);
      if (_worldLoading && _worldLoading.key === key) return _worldLoading.p;
      var p = import("./world-ground.js?v=6").then(function (mod) {
        return mod.loadWorldGround(geo.lat, geo.lon, { radius: 1500, maxBuildings: MOBILE ? 3500 : 9000, mapSize: MOBILE ? 1024 : 2048 });
      }).then(function (w) { if (w) { w.key = key; _world = w; } return w; })
        .catch(function (e) { window.__space.worldError = String(e); return null; });
      _worldLoading = { key: key, p: p };
      return p;
    }
    function buildNearWorld(sp) {
      var geo = baseGeo || DEFAULT_BASE;
      var isPvd = Math.abs(geo.lat - DEFAULT_BASE.lat) < 0.05 && Math.abs(geo.lon - DEFAULT_BASE.lon) < 0.07;
      _nearPending = true;
      loadNearWorld(geo).then(function (w) {
        _nearPending = false;
        if (!controls.isGround()) return;
        if (w && w.map && (w.b.length || w.roads)) {
          var tex = new THREE.CanvasTexture(w.map);
          if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
          buildLocalMapGround(sp, tex, true);
          buildBaseCity(sp, { b: w.b }, w.lamps);
          window.__space.world = { buildings: w.b.length, lamps: w.lamps.length / 3, roads: w.roads, tiles: w.tiles };
        } else if (isPvd) { buildLocalMapGround(sp); buildBaseCity(sp); }   // offline: the baked Providence data
      });
    }
    // BASE CITY (geo-ui-map 3D): real OSM building footprints (data/base-buildings-providence.json, in local
    // ENU metres) extruded as low prisms on the same tangent frame + scale as the street map — so standing at
    // the base you're among your real city's 3D blocks, downtown towers on the skyline, windows lit at night.
    function loadCityData() {
      if (_cityData) return Promise.resolve(_cityData);
      if (_cityLoading) return _cityLoading;
      _cityLoading = fetch("data/base-buildings-providence.json").then(function (r) { return r.json(); })
        .then(function (j) { _cityData = j; return j; }).catch(function () { return null; });
      return _cityLoading;
    }
    var CITY_SCALE = 0.155 / 1500;   // metres → scene units, matched to the street-map disc (R=0.155 ≙ 1500 m)
    var _cityPending = false, _lampMat = null, _moonL = new THREE.Vector3(0, 0, 1), _cityInvQ = new THREE.Quaternion();
    function buildBaseCity(sp, data, lamps) {
      removeBaseCity();
      _cityPending = true;
      var up = sp.normal.clone().normalize();
      var east = new THREE.Vector3(0, 1, 0).cross(up); if (east.lengthSq() < 1e-6) east.set(1, 0, 0); east.normalize();
      var north = up.clone().cross(east).normalize();
      var qpos = sp.position.clone().addScaledVector(up, 0.00108);   // bases sit just on the street map
      var quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, up));
      (data ? Promise.resolve(data) : loadCityData()).then(function (j) {
        _cityPending = false;
        if (!j || !j.b || !controls.isGround()) return;
        var S = CITY_SCALE, B = j.b, P = [], I = [];   // position (local), aInfo (topFrac, kind: 1 facade · 0.5 plant · 0 roof, seed)
        // a box on the roof (stair/lift house, plant room): walls with no windows + a flat lid
        function roofBox(cx0, cy0, hx, hy, z0, hh, seed0) {
          var X = [cx0 - hx, cx0 + hx, cx0 + hx, cx0 - hx], Y = [cy0 - hy, cy0 - hy, cy0 + hy, cy0 + hy], z1 = z0 + hh;
          for (var q = 0; q < 4; q++) {
            var q1 = (q + 1) % 4;
            P.push(X[q], Y[q], z0, X[q1], Y[q1], z0, X[q1], Y[q1], z1,  X[q], Y[q], z0, X[q1], Y[q1], z1, X[q], Y[q], z1);
            I.push(0, 0.5, seed0, 0, 0.5, seed0, 1, 0.5, seed0,  0, 0.5, seed0, 1, 0.5, seed0, 1, 0.5, seed0);
          }
          P.push(X[0], Y[0], z1, X[1], Y[1], z1, X[2], Y[2], z1,  X[0], Y[0], z1, X[2], Y[2], z1, X[3], Y[3], z1);
          I.push(1, 0, seed0, 1, 0, seed0, 1, 0, seed0,  1, 0, seed0, 1, 0, seed0, 1, 0, seed0);
        }
        for (var bi = 0; bi < B.length; bi++) {
          var r = B[bi].r, Hm = B[bi].h, H = Hm * S, m = r.length >> 1;
          if (m < 3) continue;
          var seed = (bi * 0.6180339887) % 1;
          var cx = 0, cy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (var k = 0; k < m; k++) {
            var rx = r[k * 2], ry = r[k * 2 + 1]; cx += rx; cy += ry;
            if (rx < x0) x0 = rx; if (rx > x1) x1 = rx; if (ry < y0) y0 = ry; if (ry > y1) y1 = ry;
          }
          cx = cx / m * S; cy = cy / m * S;
          for (var e0 = 0; e0 < m; e0++) {
            var e1 = (e0 + 1) % m;
            var ax = r[e0 * 2] * S, ay = r[e0 * 2 + 1] * S, bx = r[e1 * 2] * S, by = r[e1 * 2 + 1] * S;
            // wall quad (two tris): bottom a,b → top b,a
            P.push(ax, ay, 0, bx, by, 0, bx, by, H,  ax, ay, 0, bx, by, H, ax, ay, H);
            I.push(0, 1, seed, 0, 1, seed, 1, 1, seed,  0, 1, seed, 1, 1, seed, 1, 1, seed);
            // roof fan from centroid (flat top)
            P.push(cx, cy, H, ax, ay, H, bx, by, H);
            I.push(1, 0, seed, 1, 0, seed, 1, 0, seed);
          }
          // build 228 — the skyline gets its roof clutter: mid-rises and towers carry a plant room / stair house
          // (two on big floor plates), sized from the real footprint, so the silhouette stops reading as clean boxes
          var bw = x1 - x0, bd = y1 - y0;
          if (Hm > 13 && bw > 9 && bd > 9) {
            var rs = (bi * 0.7548776662) % 1, rt = (bi * 0.5698402910) % 1;
            var hx = Math.max(2.2, bw * (0.12 + 0.10 * rs)) * S, hy = Math.max(2.2, bd * (0.12 + 0.10 * rt)) * S;
            roofBox(cx + (rs - 0.5) * bw * 0.25 * S, cy + (rt - 0.5) * bd * 0.25 * S, hx, hy, H, (2.6 + 2.8 * rs) * S, seed);
            if (bw * bd > 900) roofBox(cx - (rs - 0.5) * bw * 0.32 * S, cy + (0.5 - rt) * bd * 0.30 * S, hx * 0.6, hy * 0.7, H, (1.6 + 1.4 * rt) * S, seed);
          }
        }
        if (!P.length) return;
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
        g.setAttribute("aInfo", new THREE.BufferAttribute(new Float32Array(I), 3));
        _cityMat = new THREE.ShaderMaterial({
          uniforms: { uFade: { value: 0 }, uScale: { value: S }, uHorizon: { value: new THREE.Color(0.030, 0.021, 0.019) },   // build 227: the real night limb (was bright amber)
                      uMoonL: { value: _moonL }, uMoonI: { value: 0 } },   // build 229: moonlight in the city's local frame
          side: THREE.DoubleSide, depthWrite: true, depthTest: true, fog: false,
          extensions: { derivatives: true },
          vertexShader:
            "attribute vec3 aInfo; varying vec3 vLocal; varying vec3 vInfo; varying float vDist;\n" +
            "void main(){ vLocal=position; vInfo=aInfo; vec4 wp=modelMatrix*vec4(position,1.0);\n" +
            "  vDist=distance(wp.xyz, cameraPosition);\n" +
            "  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
          /* build 228 — a night facade with the grain of a photograph, not a grid of identical lit squares:
             every building draws its own storey height, bay width, how awake it is and its light temperature
             (2700 K homes, 3500 K, 5000 K offices); whole office floors left on; unlit panes are dark glass
             holding a little sky; shopfronts at street level; the street-level dark where walls meet the ground;
             a thin roofline edge catching the city's light dome. */
          fragmentShader:
            "precision highp float; varying vec3 vLocal; varying vec3 vInfo; varying float vDist;\n" +
            "uniform float uFade; uniform float uScale; uniform vec3 uHorizon; uniform vec3 uMoonL; uniform float uMoonI;\n" +
            "float h3(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }\n" +
            "void main(){\n" +
            "  float top=vInfo.x, kind=vInfo.y, seed=vInfo.z;\n" +
            "  vec3 m=vLocal/uScale;\n" +                                   // local metres (east, north, height)
            "  vec3 N=normalize(cross(dFdx(vLocal), dFdy(vLocal)));\n" +
            "  float s1=h3(vec3(seed,1.7,3.1)), s2=h3(vec3(seed,8.3,0.7)), s3=h3(vec3(seed,4.4,9.2));\n" +
            "  vec3 base=mix(vec3(0.0060,0.0058,0.0062), vec3(0.0150,0.0142,0.0150), s1);\n" +
            "  float ao=0.42+0.58*smoothstep(0.0,7.0,m.z);\n" +
            "  vec3 col=base;\n" +
            "  if(kind>0.75){\n" +
            "    float floorH=3.0+1.3*s1, bayW=2.3+2.4*s2;\n" +
            "    float u=abs(N.x)>abs(N.y) ? m.y : m.x;\n" +
            "    float fi=floor(m.z/floorH), fy=fract(m.z/floorH), bi=floor(u/bayW), bx=fract(u/bayW);\n" +
            "    float wr=0.16+0.12*s3;\n" +
            "    float pane=smoothstep(wr-0.05,wr,bx)*smoothstep(1.0-wr+0.05,1.0-wr,bx)*smoothstep(0.18,0.26,fy)*smoothstep(0.90,0.80,fy);\n" +
            "    float room=h3(vec3(bi,fi,seed*97.0));\n" +
            "    float awake=mix(0.05,0.40,pow(s3,1.3));\n" +
            "    float office=step(0.93,h3(vec3(fi,seed*31.0,2.0)))*step(0.62,s2);\n" +
            "    float lit=max(step(1.0-awake,room), office*step(0.2,room))*step(0.5,fi);\n" +
            "    vec3 tint=s2<0.60 ? vec3(1.0,0.62,0.30) : (s2<0.90 ? vec3(1.0,0.78,0.52) : vec3(0.84,0.89,1.0));\n" +
            "    float hv=h3(vec3(bi,fi,seed*7.0)); float var=0.32+0.68*hv*hv;\n" +   // most rooms dim-lit, a few bright
            "    float blind=step(0.55,h3(vec3(bi,fi,seed*3.0)));\n" +
            "    float inner=mix(0.55+0.45*smoothstep(0.22,0.86,fy), 0.30+0.70*step(0.62,fy), blind);\n" +   // ceiling light falls down the pane; some rooms behind half-drawn blinds
            "    col=mix(col*ao, vec3(0.016,0.019,0.027), pane*0.85);\n" +
            "    col+=pane*lit*tint*var*inner*0.72;\n" +
            "    float shop=(1.0-step(0.5,fi))*step(0.55,h3(vec3(bi,seed,5.0)));\n" +
            "    col+=shop*pane*vec3(1.0,0.70,0.40)*0.50;\n" +
            "  } else if(kind>0.25){\n" +
            "    col=base*1.35*ao;\n" +
            "  } else {\n" +
            "    col=vec3(0.0095,0.0100,0.0125)+vec3(0.005,0.0035,0.0025)*s1;\n" +
            "  }\n" +
            "  col+=smoothstep(0.955,1.0,top)*step(0.25,kind)*vec3(0.048,0.034,0.026);\n" +   // the roofline edge
            // build 229: the Moon lights the city — faces turned to it catch a faint cool light, so the blocks read as VOLUMES
            "  col+=vec3(0.011,0.013,0.019)*max(dot(N,normalize(uMoonL)),0.0)*uMoonI*(kind>0.75 ? 1.0 : 1.25);\n" +
            "  col+=vec3(0.0035,0.0040,0.0055)*max(N.z,0.0)*(0.4+0.6*uMoonI);\n" +   // skylight on roofs
            "  float haze=smoothstep(0.02,0.15,vDist);\n" +
            "  col=mix(col, uHorizon, haze*0.80);\n" +
            "  gl_FragColor=vec4(col*uFade, 1.0); }"
        });
        if ("toneMapped" in _cityMat) _cityMat.toneMapped = false;
        _city = new THREE.Mesh(g, _cityMat);
        _city.quaternion.copy(quat); _city.position.copy(qpos);
        _city.name = "BaseCity"; _city.renderOrder = 0.6; _city.frustumCulled = false; _city.visible = false;
        _cityInvQ.copy(quat).invert();
        // build 229 — STREETLIGHTS on the real roads (world-ground.js): a lamp head ~7 m up each post, sodium
        // amber or LED white, sized by true distance (sub-pixel ones fade rather than vanish), occluded by the
        // buildings, bright enough to bloom. Their light pools are already painted into the ground map.
        if (lamps && lamps.length) {
          var nL = lamps.length / 3, LP = new Float32Array(nL * 3), LC = new Float32Array(nL * 3);
          for (var li = 0; li < nL; li++) {
            var led = lamps[li * 3 + 2] > 0.5, hj = (li * 0.6180339887) % 1;
            LP[li * 3] = lamps[li * 3] * S; LP[li * 3 + 1] = lamps[li * 3 + 1] * S; LP[li * 3 + 2] = (6.2 + 1.8 * hj) * S;
            var cc = led ? [1.15, 1.18, 1.25] : [1.6, 0.95, 0.40];
            LC[li * 3] = cc[0]; LC[li * 3 + 1] = cc[1]; LC[li * 3 + 2] = cc[2];
          }
          var lgeo = new THREE.BufferGeometry();
          lgeo.setAttribute("position", new THREE.BufferAttribute(LP, 3));
          lgeo.setAttribute("color", new THREE.BufferAttribute(LC, 3));
          _lampMat = new THREE.ShaderMaterial({
            uniforms: { uFade: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uPx: { value: 900 }, uS: { value: S } },
            vertexColors: true, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
            vertexShader:
              "uniform float uPR; uniform float uPx; uniform float uS; varying vec3 vC; varying float vI;\n" +
              "void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); float d=max(-mv.z,1e-7);\n" +
              "  float px=0.9*uS/d*uPx;\n" +                                   // a ~0.9 m glare core at its true distance
              "  vI=clamp(px/1.4,0.22,1.0);\n" +
              "  gl_PointSize=clamp(px*3.2,1.7,13.0)*uPR; vC=color; gl_Position=projectionMatrix*mv; }",
            fragmentShader:
              "uniform float uFade; varying vec3 vC; varying float vI;\n" +
              "void main(){ vec2 p=gl_PointCoord-0.5; float r2=dot(p,p)*4.0; float a=exp(-r2*8.0)+0.22*exp(-r2*2.0); if(a<0.012) discard;\n" +
              "  gl_FragColor=vec4(vC*vI, min(1.0,a*1.3)*uFade); }"
          });
          if ("toneMapped" in _lampMat) _lampMat.toneMapped = false;
          var lampPts = new THREE.Points(lgeo, _lampMat);
          lampPts.name = "BaseStreetlights"; lampPts.frustumCulled = false; lampPts.renderOrder = 0.7;
          lampPts.onBeforeRender = function () { _lampMat.uniforms.uPR.value = renderer.getPixelRatio(); _lampMat.uniforms.uPx.value = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360)); };
          _city.add(lampPts);
        }
        scene.add(_city);
      });
    }
    function removeBaseCity() {
      if (_city) {
        _city.traverse(function (o) { if (o !== _city && o.geometry) { o.geometry.dispose(); if (o.material) o.material.dispose(); } });
        scene.remove(_city); _city.geometry.dispose(); _city.material.dispose(); _city = null; _cityMat = null; _lampMat = null;
      }
    }
    function fetchBase() {
      function viaIpwho() {
        return fetch("https://ipwho.is/").then(function (r) { return r.json(); }).then(function (j) {
          if (j && j.success !== false && isFinite(j.latitude) && isFinite(j.longitude)) return { lat: j.latitude, lon: j.longitude, city: j.city || "" };
          throw new Error("ipwho");
        });
      }
      function viaGeojs() {
        return fetch("https://get.geojs.io/v1/ip/geo.json").then(function (r) { return r.json(); }).then(function (j) {
          var la = parseFloat(j.latitude), lo = parseFloat(j.longitude);
          if (isFinite(la) && isFinite(lo)) return { lat: la, lon: lo, city: j.city || "" };
          throw new Error("geojs");
        });
      }
      var p = (typeof Promise.any === "function") ? Promise.any([viaIpwho(), viaGeojs()])
                                                  : viaIpwho().catch(viaGeojs);
      return p.then(function (g) {
        try { localStorage.setItem("cv-base", JSON.stringify(g)); } catch (e) {}
        return g;
      }).catch(function () { return null; });
    }
    function resolveBase() {
      /* build 229 — the base is where the VISITOR actually stands (owner, 2026-10-15: "我的物理位置都不在
         providence了…没有真的根据实际情况切换所在base"). Build 197 had pinned everyone to Providence because the
         only street map was Providence's and the lookup was third-party; both are gone now: the near world is
         built from real OpenStreetMap tiles for any place (world-ground.js), and the location comes from this
         site's own edge function (/api/where: Cloudflare's city-level geolocation of the request, nothing
         stored). ?base=lat,lon[,City] overrides it (testing / sharing a view). Unknown → Providence. */
      try {
        var q = new URLSearchParams(location.search).get("base");
        if (q) {
          var qa = q.split(","), qla = parseFloat(qa[0]), qlo = parseFloat(qa[1]);
          if (isFinite(qla) && isFinite(qlo) && Math.abs(qla) <= 85) return Promise.resolve({ lat: qla, lon: qlo, city: (qa.slice(2).join(",") || "").trim() });
        }
      } catch (eQ) {}
      try {
        var cached = JSON.parse(sessionStorage.getItem("cv-where") || "null");
        if (cached && isFinite(cached.lat) && isFinite(cached.lon)) return Promise.resolve(cached);
      } catch (eC) {}
      return Promise.race([
        fetch("/api/where", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }),
        new Promise(function (res) { setTimeout(function () { res(null); }, 4500); })   // measured ~1.6 s through a proxy: give it room
      ]).then(function (j) {
        if (!j || !isFinite(j.lat) || !isFinite(j.lon) || j.lat === null) return DEFAULT_BASE;
        var g = { lat: +j.lat, lon: +j.lon, city: j.city || "" };
        try { sessionStorage.setItem("cv-where", JSON.stringify(g)); } catch (eS) {}
        return g;
      }).catch(function () { return DEFAULT_BASE; });
    }
    var basePromise = COSMOS ? resolveBase() : Promise.resolve(null);
    if (COSMOS) loadBSC();   // 73 KB, in parallel with the scene — the real sky is ready by landing

    if (COSMOS) {
      // the visitor wakes on the GROUND (ground entrance below); the canvas stays dark
      // until the base resolves, then the sky fades in overhead. The old deep-space dive
      // remains only as the fallback if the armature or geolocation never arrive.
      camera.position.set(HOME.x - 150, HOME.y + 116, HOME.z - 132);
      camera.lookAt(HOME);
      controls = createPremiumOrbitControls(camera, canvas, THREE);
      if (_ts) controls.setZoomGovernor(tsZoomGovernor);
      controls.target.copy(HOME);
      controls.setDistanceLimits(5.0, (window.CosmicLOD ? window.CosmicLOD.MAXCAM : 46000));   // 5.0 floor clears the Moon (2.99); ceiling widened to the cosmic-address MAXCAM (46000) so the log zoom reaches the observable-universe tier
      // silkier desktop feel: slightly softer damping + gentler log-zoom ease (still returns to rest)
      controls.setInteractionTuning({ rotateSpeed: 0.00085, dampingFactor: 0.045, zoomStepLn: 0.29, zoomRef: 126, zoomHi: 1.72, zoomEase: 0.148, maxEventDelta: 0.045 });
      canvas.style.opacity = "0.001";
      setTimeout(function () {   // fallback: never leave the visitor in the dark
        if (!groundEntered) {
          canvas.style.transition = "opacity 1s ease"; canvas.style.opacity = "1";
          entranceUntil = performance.now() + 4600;
          skyLive();
        }
      }, 6500);
    } else { camera.position.set(0, 0, 60); }


    var MOBILE = innerWidth < 700;
    function resize() {
      if (!camera) return;                          // (Codex M1 critique) guard the temporal dependency
      renderer.setSize(innerWidth, innerHeight, false);
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      if (deepFusion) deepFusion.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
      if (QUALITY) {   // L4: the dynamic-resolution budget was derived from innerWidth<700 once at construction;
        var _m = innerWidth < 700;   // re-derive on resize so a phone rotated across the 700px line keeps its mobile-tuned cap/floor
        QUALITY.cap = Math.min(devicePixelRatio || 1, _m ? 1.25 : 1.35);
        QUALITY.floor = _m ? 0.5 : 0.58;
        QUALITY.dpr = Math.min(QUALITY.cap, Math.max(QUALITY.floor, QUALITY.dpr));
        QUALITY.applied = Math.min(QUALITY.cap, Math.max(QUALITY.floor, QUALITY.applied));
      }
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
          // NOT a shell any more — the far embers fill a DEEP VOLUME (200 → 6500), the same space the
          // starfield / constellations / galaxy / nebulae live in, so there is no "solar-system球壳" and
          // no empty void beyond it: stars everywhere, all the way out. (This was the real shell all along.)
          var shellR = COSMOS ? lerp(200, 6500, Math.pow(shellJitter, 0.5)) : lerp(285, 405, Math.pow(shellJitter, 0.72)), ob = 0.92 + rnd() * 0.08;
          pos[k] = x * shellR; pos[k + 1] = y * shellR * ob; pos[k + 2] = z * shellR;
          // a fraction still lean toward the ecliptic band → a faint dust weather in the plane
          if (COSMOS && rnd() < 0.4) pos[k + 1] *= 0.5;
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
      var farMat = makeMaterial(0.0, mobile ? 8.0 : 10.0, COSMOS ? 1900.0 : 330.0, calm ? 74.0 : 96.0);   // ref-depth matched to the deep volumetric spread so near embers are big, far ones fade — a real field, not a shell
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

    /* ===== the NIGHT SKY: ~10k stars + the Milky Way on the celestial sphere =====
       The single biggest realism layer: a magnitude-distributed starfield with color
       temperatures and a tilted galactic band. Fully static — four draw calls, baked
       once, zero per-frame cost. Sits at R=700, outside every camera path. */
    function buildNightSky() {
      var R = 700, seed = 20020102 >>> 0;
      var DPR = Math.min(devicePixelRatio || 1, 2);   // PointsMaterial sizes are DEVICE px — scale or the stars shrink on retina
      // a dedicated star sprite: hard WHITE core + tight falloff. The shared ember-glow
      // texture has a translucent warm core — fine for dust, too dim for a star.
      var sc = document.createElement("canvas"); sc.width = sc.height = 64;
      var sg = sc.getContext("2d");
      var sgrd = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
      sgrd.addColorStop(0.0, "rgba(255,255,255,1)");
      sgrd.addColorStop(0.16, "rgba(255,255,255,0.92)");
      sgrd.addColorStop(0.38, "rgba(255,236,210,0.38)");
      sgrd.addColorStop(0.70, "rgba(255,220,180,0.07)");
      sgrd.addColorStop(1.0, "rgba(255,220,180,0)");
      sg.fillStyle = sgrd; sg.fillRect(0, 0, 64, 64);
      var starTex = new THREE.CanvasTexture(sc);
      function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
      var bN = new THREE.Vector3(0.42, 0.82, 0.39).normalize();          // the galactic plane's normal
      var bU = new THREE.Vector3().crossVectors(bN, new THREE.Vector3(1, 0, 0)).normalize();
      var bV = new THREE.Vector3().crossVectors(bN, bU).normalize();
      function makeLayer(count, sizePx, opacity, bandFrac, bandSpread) {
        var pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
        for (var i = 0; i < count; i++) {
          var v;
          if (rand() < bandFrac) {                                        // a Milky Way star
            var th = rand() * Math.PI * 2;
            var gs = (rand() + rand() + rand() - 1.5) / 1.5;              // ~gaussian across the band
            v = bU.clone().multiplyScalar(Math.cos(th))
                 .add(bV.clone().multiplyScalar(Math.sin(th)))
                 .add(bN.clone().multiplyScalar(gs * bandSpread)).normalize();
          } else {                                                        // a field star
            var z = rand() * 2 - 1, ph = rand() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
            v = new THREE.Vector3(rr * Math.cos(ph), z, rr * Math.sin(ph));
          }
          pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;
          var t = rand(), r_, g_, b_;                                     // color temperature
          if (t < 0.70) { r_ = 1; g_ = 0.96; b_ = 0.88; }                 // warm white (most)
          else if (t < 0.92) { r_ = 0.80; g_ = 0.87; b_ = 1; }            // blue-white
          else { r_ = 1; g_ = 0.76; b_ = 0.52; }                          // amber giants
          var lum = 0.58 + rand() * 0.42;
          col[i * 3] = r_ * lum; col[i * 3 + 1] = g_ * lum; col[i * 3 + 2] = b_ * lum;
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        var pm = new THREE.PointsMaterial({
          size: sizePx * DPR, map: starTex, transparent: true, opacity: opacity, vertexColors: true,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
        });
        var pts = new THREE.Points(geo, pm);
        pts.frustumCulled = false;
        return pts;
      }
      var sky = new THREE.Group(); sky.name = "NightSky";
      sky.add(makeLayer(2600, 3.4, 1.0, 0.26, 0.24));    // the main field
      sky.add(makeLayer(4200, 2.2, 0.75, 0.60, 0.20));   // faint field, band-weighted
      sky.add(makeLayer(3200, 1.7, 0.45, 0.88, 0.14));   // the Milky Way haze itself
      sky.add(makeLayer(750, 5.8, 1.0, 0.22, 0.26));     // the bright named-feeling stars
      scene.add(sky);
    }
    // NOTE: buildNightSky() is a legacy CELESTIAL-SPHERE SHELL — ~10.7k stars pinned at radius 700 — which
    // was THE "太阳系球壳": from inside it wraps you as "the stars", from outside it's a hard silhouette sphere,
    // and beyond it only the galaxy shows. In cosmos mode the volumetric starfield + real 3-D galaxy + the
    // apparent-sky constellation annotation + the spread embers already fill the near sky, so this shell is removed entirely.
    if (COSMOS && false) buildNightSky();
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
    var TS_KM_LOCAL = 6378.137 / 0.95;                 // km per armature-local unit (the Earth's radius is 0.95)
    var TS_UTC = Date.UTC(2002, 0, 2, 7, 45, 0);       // the birth instant: 15:45 Beijing
    var TS_POLES = {                                   // IAU/WGCCRE north poles (RA°, Dec°, J2000) — the true spin axes
      mercury: [281.010, 61.416], venus: [272.76, 67.16], mars: [317.681, 52.887], jupiter: [268.057, 64.495],
      saturn: [40.589, 83.537], uranus: [257.311, -15.175], neptune: [299.36, 43.46], pluto: [132.993, -6.163]
    };
    /* true physical widths of the nebulae as their pictures frame them (ly) — each matches the real angular size seen
       from Earth (Orion 24 ly at 1,340 ly ≈ 1°, Lagoon 1.5°, Carina ≈ 2°, Crab 0.1°, Ring and Helix a fraction of a degree) */
    var TS_DSO_WIDTH_LY = { orion: 24, rosette: 130, pillars: 9, crab: 11, horsehead: 8, lagoon: 110, ring: 3, pleiades: 22, carina: 240, helix: 4.5 };
    var TS_GAL_PER_LY = 2600 / 5e4;                     // the Milky-Way tier's linear frame: units per light-year
    function tsAddGalacticFrame(name, obj, worldL, widthLy, dsoId, rate) {
      // an object of a LINEAR tier as a navigation frame (rate = that tier's units per light-year; the galaxy's 0.052 by
      // default): its ladder proxy IS its place in that tier, one ladder unit there is 1/rate ly of true space — so every
      // flight to it is a true flight, and every tier's camera lands exactly where its own model puts you
      rate = rate || TS_GAL_PER_LY;
      var LYW = 9460730472580.8 / _ts.kpu / rate;   // scene units per ladder unit in this frame
      var T = _ts.sun.T.clone().addScaledVector(worldL, LYW);
      var f = { name: name, obj: obj, T: T, Rt: widthLy * 0.5 * 9460730472580.8 / _ts.kpu, Ro: widthLy * 0.5 * rate, s: LYW, kappa: 1e-9, rate: rate,
                proxy: worldL.clone(), tol2: Math.pow(Math.max(1e-4, 1e-3 * worldL.length()), 2), dso: dsoId, galactic: true };
      _ts.frames.push(f); _ts.frameNames[name] = f; return f;
    }
    // the far landmarks appear lazily with their tiers: register each pick shell as a frame once it exists
    var TS_EXTRA_NAMES = { m33: { en: "Triangulum Galaxy", zh: "三角座星系" }, virgo: { en: "Virgo Cluster", zh: "室女座星系团" },
      laniakea: { en: "Great Attractor", zh: "巨引源" }, galcore: { en: "Sagittarius A*", zh: "人马座 A*" } };
    var _tsWS = new THREE.Vector3();
    function tsRegisterLandmarks() {
      if (!natalSky || !natalSky.dsoPicks) return;
      natalSky.group.updateMatrixWorld(true);
      natalSky.dsoPicks.children.forEach(function (sh) {
        if (!sh.name || sh.name.indexOf("DSOPick_") !== 0) return;
        var id = sh.name.slice(8), fname = "DSO_" + id;
        if (_ts.frameNames[fname]) return;
        var tier = tsTierFor(sh.name), rate = tier ? tier.rate : TS_GAL_PER_LY;
        if (!sh.geometry.boundingSphere) sh.geometry.computeBoundingSphere();
        sh.getWorldScale(_tsWS);
        var widthLy = 2 * sh.geometry.boundingSphere.radius * _tsWS.x / rate;
        var f = tsAddGalacticFrame(fname, sh, sh.getWorldPosition(new THREE.Vector3()), widthLy, id, rate);
        f.label = (sh.userData && sh.userData.dsoName) || TS_EXTRA_NAMES[id] || null;
        f.extragalactic = !!tier;
      });
    }
    function tsEclToLocal(x, y, z) {                   // J2000 ecliptic km → equatorial → the armature's (x, z, −y) local units
      var ce = Math.cos(ECL_TILT), se = Math.sin(ECL_TILT), ye = y * ce - z * se, ze = y * se + z * ce;
      return [x / TS_KM_LOCAL, ze / TS_KM_LOCAL, -ye / TS_KM_LOCAL];
    }
    function tsArmatureSpec(E) {
      var d = new Date(TS_UTC), AU = E.AU_KM, eh = E.planetHelio("earth", d), mg = E.moonGeo(d);
      var earth = tsEclToLocal(eh.x * AU, eh.y * AU, eh.z * AU), m = tsEclToLocal(mg.x, mg.y, mg.z);
      return { earth: earth, moon: [earth[0] + m[0], earth[1] + m[1], earth[2] + m[2]],
               sunR: E.BODY.sun.r / TS_KM_LOCAL, moonR: E.BODY.moon.r / TS_KM_LOCAL, auLocal: AU / TS_KM_LOCAL };
    }
    /* once the orrery is aligned to the chart: place the planets at true scale and register every body for
       navigation. Each body gets a LADDER PROXY — the point in navigation space whose true-scale image is the
       body — so every glide, focus and pick in the old code flies to the right place unchanged. */
    function setupTrueScale() {
      if (_ts || _tsFailed || !_tsMods || !nyeArmature || !natalSky || !natalSky.applyTrueScale) return;
      try {
        var E = _tsMods.eph, armScale = MOBILE ? 2.4 : 3.0, kpu = TS_KM_LOCAL / armScale;
        var L = _tsMods.ladder.makeLadder(kpu, window.CosmicLOD ? window.CosmicLOD.LAYERS : [], TS_LADDER_RATES);
        // true scale makes each tier shrink by perspective — the ladder's "collapse" animations would shrink them twice
        if (window.CosmicLOD && !window.CosmicLOD._tsCollapse) { var LODc = window.CosmicLOD; LODc._tsCollapse = LODc.collapse; LODc.collapse = function () { return _ts ? 1 : LODc._tsCollapse.apply(LODc, arguments); }; }
        var d = new Date(TS_UTC), AU = E.AU_KM, eh = E.planetHelio("earth", d);
        var geo = { sun: [-eh.x * AU, -eh.y * AU, -eh.z * AU] };
        ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"].forEach(function (n) {
          var pp = E.planetHelio(n, d); geo[n] = [(pp.x - eh.x) * AU, (pp.y - eh.y) * AU, (pp.z - eh.z) * AU];
        });
        var rkm = {}; Object.keys(E.BODY).forEach(function (k2) { rkm[k2] = E.BODY[k2].r; });
        var planets = natalSky.applyTrueScale({ unitPerKm: 1 / kpu, geo: geo, radiusKm: rkm, poles: TS_POLES, charonKm: 19591, auKm: AU });
        scene.updateMatrixWorld(true);
        var RoE = 0.95 * armScale, bodies = [], clusters = [], AUw = AU / kpu;   // RoE: the Earth's radius (scene units)
        function add(name, obj, Rt, Ro, proxy) {
          var T = obj.getWorldPosition(new THREE.Vector3()), r = T.length();
          var px = proxy || T.clone().multiplyScalar(L.Ginv(r) / r);
          // κ: the linear (framing-exact) zone reaches ~6 tuned radii out, so every authored focus distance frames
          // the real body exactly; past it the global ladder's growth takes over
          var b = { name: name, obj: obj, T: T, Rt: Rt, Ro: Ro, s: Rt / Ro, kappa: Math.min(1, 8 / (6 * Ro)), proxy: px,
                    tol2: Math.pow(Math.max(1e-4, 1e-3 * px.length()), 2) };
          bodies.push(b); return b;
        }
        var bSun = add("NyeSun", nyeArmature.group.getObjectByName("NyeSun"), E.BODY.sun.r / kpu, 18 * 0.1346 * armScale);
        var bMoon = add("NyeMoon", nyeArmature.group.getObjectByName("NyeMoon"), E.BODY.moon.r / kpu, 0.95 * 11 * 0.0525 * armScale);
        var bPluto = null;
        planets.forEach(function (pl) { var b = add(pl.name, pl.obj, pl.Rt, pl.Ro); if (pl.id === "pluto") bPluto = b; });
        var charon = natalSky.group.getObjectByName("NatalPlutoMoon");
        if (charon && bPluto) {
          var cT = charon.getWorldPosition(new THREE.Vector3());
          add("NatalPlutoMoon", charon, E.BODY.charon.r / kpu, 0.08, bPluto.proxy.clone().add(cT.sub(bPluto.T).divideScalar(bPluto.s)));
        }
        // depth clusters: what occupies which depth range (the slicer only draws where something is)
        clusters.push({ pos: new THREE.Vector3(), R: 8, body: RoE });                    // the Earth, its air, the ground, the hour ring
        clusters.push({ pos: new THREE.Vector3(), R: bMoon.T.length() * 1.35 });         // the day ring rides the lunar orbit
        clusters.push({ pos: new THREE.Vector3(), R: 1.75 * AUw });                      // the year ring: Earth-centred, through the Sun
        clusters.push({ pos: bSun.T.clone(), R: 3.8 * AUw });                            // the month ring + the asteroid belt
        bodies.forEach(function (b) { clusters.push({ pos: b.T, R: b.Rt * (b.name === "NatalPluto" ? 24 : b.name === "NyeSun" ? 2.6 : 3.4), body: b.Rt }); });
        _ts = { L: L, bodyDistance: _tsMods.ladder.bodyDistance, bodySlope: _tsMods.ladder.bodySlope, fmt: _tsMods.ladder.formatDistance,
                kpu: kpu, bodies: bodies, clusters: clusters, sun: bSun, moon: bMoon, frames: bodies.slice(), nearSkip: 2e5 * AU / kpu, frameNames: {} };
        // the nebulae at their true distances and sizes (Phase 2c) — each one a navigation frame
        if (natalSky.applyTrueDSO) {
          natalSky.applyTrueDSO(TS_GAL_PER_LY, TS_DSO_WIDTH_LY).forEach(function (dd) {
            if (dd.world && dd.shell) { var fr = tsAddGalacticFrame("DSO_" + dd.id, dd.shell, dd.world, dd.widthLy, dd.id, TS_GAL_PER_LY); fr.label = dd.name; fr.ly = dd.ly; }
          });
        }
        // the orbits: one period of each Keplerian path, in the same geocentric frame as the bodies
        if (natalSky.addTrueOrbits) {
          var ORB = [["mercury", 0x9a958e], ["venus", 0xd9c08a], ["earth", 0x6f9fdc], ["mars", 0xc4724e], ["jupiter", 0xc9a77a],
                     ["saturn", 0xd8c48f], ["uranus", 0x8fd0d6], ["neptune", 0x6f8fe0], ["pluto", 0x9b8f86]], orbs = [];
          ORB.forEach(function (o) {
            var SMA = { mercury: 0.387, venus: 0.723, earth: 1, mars: 1.524, jupiter: 5.203, saturn: 9.537, uranus: 19.19, neptune: 30.07, pluto: 39.48 };
            var n0 = o[0] === "pluto" ? 720 : 360, P = 365.25 * Math.pow(SMA[o[0]], 1.5);   // one sidereal period (Kepler III)
            var km = new Float64Array(n0 * 3);
            for (var i = 0; i < n0; i++) {
              var q = E.planetHelio(o[0], new Date(TS_UTC + (i / n0) * P * 86400000));
              km[i * 3] = (q.x - eh.x) * AU; km[i * 3 + 1] = (q.y - eh.y) * AU; km[i * 3 + 2] = (q.z - eh.z) * AU;
            }
            orbs.push({ id: o[0], km: km, color: o[1] });
          });
          var mk = new Float64Array(240 * 3);
          for (var mi = 0; mi < 240; mi++) { var mq = E.moonGeo(new Date(TS_UTC + (mi / 240) * 27.3217 * 86400000)); mk[mi * 3] = mq.x; mk[mi * 3 + 1] = mq.y; mk[mi * 3 + 2] = mq.z; }
          orbs.push({ id: "moon", km: mk, color: 0xa9a49c });
          _ts.orbits = natalSky.addTrueOrbits(orbs, 1 / kpu);
        }
        tsBuildOverlay();
        loadTrueStars();
        if (natalSky.setTrueGalaxy) natalSky.setTrueGalaxy(true);
        markFarLayers();
        if (controls && controls.setZoomGovernor) controls.setZoomGovernor(tsZoomGovernor);
        window.__space.ts = { bodies: bodies.map(function (b) { return { name: b.name, s: +b.s.toFixed(3), proxyR: +b.proxy.length().toFixed(2), trueKm: Math.round(b.T.length() * kpu) }; }),
                              anchors: L.anchors.map(function (a) { return [a[0], _ts.fmt(a[1])]; }) };
      } catch (e) { _tsFailed = true; _ts = null; window.__space.tsError = String(e && e.stack || e); }
    }
    /* ===== the true-scale overlay: what makes a real-scale Solar System legible =====
       A real planet is usually far under a pixel. As SpaceEngine does, each body keeps a dot and a quiet name when
       it is too small to see; the orbits trace the system; the Sun becomes a star once its disc is too small to
       read; one instrument line says how far away you truly are. */
    var TS_NAMES = { NyeSun: ["Sun", "太阳", 10], Earth: ["Earth", "地球", 9], NatalJupiter: ["Jupiter", "木星", 8], NatalSaturn: ["Saturn", "土星", 7],
      NyeMoon: ["Moon", "月球", 6], NatalVenus: ["Venus", "金星", 5], NatalMars: ["Mars", "火星", 5], NatalMercury: ["Mercury", "水星", 4],
      NatalUranus: ["Uranus", "天王星", 4], NatalNeptune: ["Neptune", "海王星", 4], NatalPluto: ["Pluto", "冥王星", 3], NatalPlutoMoon: ["Charon", "卡戎", 2] };
    var _tsT0 = performance.now();
    var _tsTags = [], _tsTagHost = null, _tsReadout = null, _tsStar = null, _tsP = new THREE.Vector3();
    var _tsPV = new THREE.Vector3();
    function tsProject(v, out, cam) {   // NDC x/y through a camera (default nearCam), false if behind — independent of the slice's near/far
      cam = cam || nearCam;
      _tsPV.copy(v).applyMatrix4(cam.matrixWorldInverse);
      if (_tsPV.z > -1e-12 * Math.max(1, _tsPV.length())) return false;
      var fh = Math.tan(cam.fov * Math.PI / 360);
      out.set(_tsPV.x / (-_tsPV.z * fh * cam.aspect), _tsPV.y / (-_tsPV.z * fh), 0);
      return true;
    }
    /* the nebulae carry their names while they are small — SpaceEngine-style — and lose them once they fill the view */
    var _dsoTags = {};
    function tsDsoTags(placed) {
      if (!_tsTagHost) return;
      var ground = !!(controls && controls.isGround()), fh = Math.tan(nearCam.fov * Math.PI / 360), H = innerHeight, W = innerWidth;
      var fF = _nav.p >= 0.5 ? _nav.b : _nav.a;
      for (var i = 0; i < _ts.frames.length; i++) {
        var f = _ts.frames[i]; if (!f.galactic || !f.label) continue;
        var clT = camera.position.length(), inGal = nearCam.position.distanceTo(_ts.sun.T) * _ts.kpu < 2e5 * 9460730472580.8;
        var band = f.extragalactic ? (clT > 2600 && clT < 60000 && f.obj && f.obj.parent) : (clT < 3400 && inGal);   // a landmark is named while its own tier is the one in view (and our nebulae only from inside our galaxy)
        var tg = _dsoTags[f.name], show = !ground && f !== fF && band && tsProject(f.T, _stV) && Math.abs(_stV.x) < 0.97 && Math.abs(_stV.y) < 0.95;
        var x = (_stV.x * 0.5 + 0.5) * W, y = (-_stV.y * 0.5 + 0.5) * H, rpx = 0;
        if (show) { rpx = f.Rt / Math.max(1e-9, f.T.distanceTo(nearCam.position)) / fh * H * 0.5; if (rpx > 70) show = false; }
        for (var j = 0; show && j < placed.length; j++) if (Math.abs(placed[j][0] - x) < 70 && Math.abs(placed[j][1] - y) < 14) show = false;
        if (show && !tg) { tg = document.createElement("div"); tg.className = "ts-tag ts-tag--dso"; tg.innerHTML = '<i></i><span class="i18n-en">' + f.label.en + '</span><span class="i18n-zh">' + f.label.zh + '</span>'; _tsTagHost.appendChild(tg); _dsoTags[f.name] = tg; }
        if (!tg) continue;
        if (show) { placed.push([x, y]); tg.style.transform = "translate3d(" + (x + Math.max(rpx, 3) + 2).toFixed(1) + "px," + y.toFixed(1) + "px,0)"; tg.style.opacity = soloBody === "dso" ? "0.35" : "0.9"; }
        if (show !== !!tg._on) { tg._on = show; tg.classList.toggle("is-on", show); }
      }
    }
    /* out among the stars: the brightest named stars in view (and the Sun, home) carry a quiet name */
    var _starTags = [], _starSun = { en: "Sun", zh: "太阳", p: new THREE.Vector3(), M: 4.83 }, _stV = new THREE.Vector3();
    function tsStarTags(placed) {
      if (!_trueStars || !_tsTagHost) return;
      var T = _trueStars, cp = T.cam.position, dpc = cp.length(), W = innerWidth, H = innerHeight;
      var A = (controls && controls.isGround()) || soloBody === "dso" || soloBody === "galcore" ? 0 : Math.max(0, Math.min(1, (Math.log(Math.max(dpc, 1e-12)) - Math.log(0.012)) / (Math.log(0.06) - Math.log(0.012)))) * T.U.uOpacity.value;
      var cand = [];
      if (A > 0.02) {
        var list = T.names.concat([_starSun]);
        for (var i = 0; i < list.length; i++) {
          var st = list[i], d = Math.max(1e-9, st.p.distanceTo(cp)), m = st.M + 5 * Math.log10(d / 10);
          if ((m < 3.6 || st === _starSun) && tsProject(st.p, _stV, T.cam) && Math.abs(_stV.x) < 0.98 && Math.abs(_stV.y) < 0.96)
            cand.push({ st: st, m: st === _starSun ? -99 : m, x: (_stV.x * 0.5 + 0.5) * W, y: (-_stV.y * 0.5 + 0.5) * H });
        }
        cand.sort(function (a2, b2) { return a2.m - b2.m; });
      }
      var shown = 0;
      for (var c = 0; c < cand.length && shown < 10; c++) {
        var q = cand[c], clash = false;
        for (var j = 0; j < placed.length; j++) if (Math.abs(placed[j][0] - q.x) < 64 && Math.abs(placed[j][1] - q.y) < 14) { clash = true; break; }
        if (clash) continue;
        placed.push([q.x, q.y]);
        var tg = _starTags[shown];
        if (!tg) { tg = document.createElement("div"); tg.className = "ts-tag ts-tag--star"; tg.innerHTML = '<i></i><span class="i18n-en"></span><span class="i18n-zh"></span>'; _tsTagHost.appendChild(tg); _starTags.push(tg); }
        if (tg._st !== q.st) { tg._st = q.st; tg.children[1].textContent = q.st.en; tg.children[2].textContent = q.st.zh; tg.classList.toggle("is-home", q.st === _starSun); }
        tg.style.transform = "translate3d(" + (q.x + 3).toFixed(1) + "px," + q.y.toFixed(1) + "px,0)";
        tg.style.opacity = A.toFixed(3);
        if (!tg._on) { tg._on = true; tg.classList.add("is-on"); }
        shown++;
      }
      for (var k2 = shown; k2 < _starTags.length; k2++) if (_starTags[k2]._on) { _starTags[k2]._on = false; _starTags[k2].classList.remove("is-on"); }
    }
    function tsBuildOverlay() {
      _tsTagHost = document.createElement("div"); _tsTagHost.className = "ts-tags no-print"; _tsTagHost.setAttribute("aria-hidden", "true");
      document.body.appendChild(_tsTagHost);
      var list = _ts.bodies.slice(); list.push({ name: "Earth", T: new THREE.Vector3(), Rt: 0.95 * (MOBILE ? 2.4 : 3.0), obj: { visible: true } });
      list.forEach(function (b) {
        var nm = TS_NAMES[b.name]; if (!nm) return;
        var el = document.createElement("div"); el.className = "ts-tag";
        el.innerHTML = '<i></i><span class="i18n-en">' + nm[0] + '</span><span class="i18n-zh">' + nm[1] + '</span>';
        _tsTagHost.appendChild(el);
        _tsTags.push({ b: b, el: el, rank: nm[2], on: false, x: 0, y: 0 });
      });
      _tsTags.sort(function (a2, b2) { return b2.rank - a2.rank; });
      _tsReadout = document.createElement("div"); _tsReadout.className = "ts-readout no-print"; _tsReadout.setAttribute("aria-live", "off");
      document.body.appendChild(_tsReadout);
      // the Sun as a STAR: a screen-sized glare at its true place, for when its true disc is too small to see
      var cv = document.createElement("canvas"); cv.width = cv.height = 128; var cx = cv.getContext("2d");
      var gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,252,244,1)"); gr.addColorStop(0.07, "rgba(255,240,214,0.95)"); gr.addColorStop(0.2, "rgba(255,206,150,0.38)");
      gr.addColorStop(0.5, "rgba(255,170,110,0.08)"); gr.addColorStop(1, "rgba(255,160,100,0)");
      cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
      cx.globalCompositeOperation = "lighter"; cx.strokeStyle = "rgba(255,236,210,0.22)"; cx.lineWidth = 1.2;   // faint diffraction spikes
      cx.beginPath(); cx.moveTo(4, 64); cx.lineTo(124, 64); cx.moveTo(64, 4); cx.lineTo(64, 124); cx.stroke();
      var st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace;
      var sm = new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false });
      if ("toneMapped" in sm) sm.toneMapped = false;
      _tsStar = new THREE.Sprite(sm); _tsStar.name = "SunStar"; _tsStar.position.copy(_ts.sun.T); _tsStar.renderOrder = 5;
      _tsStar.frustumCulled = false;
      nyeArmature.group.add(_tsStar); nyeArmature.group.worldToLocal(_tsStar.position);   // lives in the Solar System (near layer)
    }
    function tsOverlayTick() {
      if (!_ts || !_tsTagHost) return;
      var ground = !!(controls && controls.isGround());
      var info = tsDistanceInfo(), f = _nav.p >= 0.5 ? _nav.b : _nav.a, Ra = f ? f.Rt : 0.95 * (MOBILE ? 2.4 : 3.0);
      var dA = nearCam.position.distanceTo(f ? f.T : HOME), sunAU = info.sunKm / 149597870.7;
      // the system's annotations fade in once you stand ~300 radii off what you orbit, and out past ~3000 AU
      var lnR = Math.log(Math.max(1e-9, dA / Ra)), aIn = Math.max(0, Math.min(1, (lnR - Math.log(260)) / (Math.log(2600) - Math.log(260))));
      var aOut = 1 - Math.max(0, Math.min(1, (Math.log(sunAU) - Math.log(400)) / (Math.log(4000) - Math.log(400))));
      var A = ground || soloBody === "dso" || soloBody === "galcore" ? 0 : aIn * aOut;
      var fh = Math.tan(nearCam.fov * Math.PI / 360), H = innerHeight, W = innerWidth, placed = [];
      for (var i = 0; i < _tsTags.length; i++) {
        var t = _tsTags[i], b = t.b, show = A > 0.02 && b.obj.visible !== false;
        if (show) show = tsProject(b.T, _tsP) && Math.abs(_tsP.x) < 1.05 && Math.abs(_tsP.y) < 1.05;
        var x = (_tsP.x * 0.5 + 0.5) * W, y = (-_tsP.y * 0.5 + 0.5) * H, rpx = 0;
        if (show) {
          rpx = b.Rt / Math.max(1e-9, b.T.distanceTo(nearCam.position)) / fh * H * 0.5;
          if (rpx > 60) show = false;                                  // it fills the view — it needs no name
          for (var j = 0; show && j < placed.length; j++) if (Math.abs(placed[j][0] - x) < 54 && Math.abs(placed[j][1] - y) < 13) show = false;
        }
        if (show) {
          placed.push([x, y]);
          t.el.style.transform = "translate3d(" + (x + Math.max(rpx, 2) - 2).toFixed(1) + "px," + y.toFixed(1) + "px,0)";
          t.el.style.opacity = A.toFixed(3);
          t.el.classList.toggle("is-dot", rpx < 2.2);
        }
        if (show !== t.on) { t.on = show; t.el.classList.toggle("is-on", show); }
      }
      tsStarTags(placed);
      tsDsoTags(placed);
      if (natalSky && natalSky.setSoloDso) { var fF = _nav.p >= 0.5 ? _nav.b : _nav.a; natalSky.setSoloDso(soloBody === "dso" && fF && fF.dso ? fF.dso : null); }
      // the black-hole marker at the galactic centre is a galaxy-scale sign; from inside the disc Sgr A* is hidden by dust
      if (_ts.galcore && _ts.galcore.obj && farCam.position.length() < 400 && !(fF && fF === _ts.galcore)) { var gcG = natalSky.group.getObjectByName("DSO_galcore"); if (gcG) gcG.visible = false; }
      if (frameNo % 60 === 0) { tsRegisterLandmarks(); _ts.galcore = _ts.frameNames.DSO_galcore || null; }   // far landmarks build lazily with their tiers
      // orbits: global fade × each orbit melts as you near its own planet
      if (_ts.orbits) {
        for (var o = 0; o < _ts.orbits.children.length; o++) {
          var ln = _ts.orbits.children[o], id = ln.userData.orbitOf, bb = null;
          for (var q = 0; q < _ts.bodies.length; q++) if (_ts.bodies[q].name.toLowerCase() === "natal" + id || (id === "moon" && _ts.bodies[q] === _ts.moon)) bb = _ts.bodies[q];
          var near = 1;
          if (id === "earth" || id === "moon") { var de = nearCam.position.length() / (0.95 * (MOBILE ? 2.4 : 3.0)); near = Math.max(0, Math.min(1, (Math.log(de) - Math.log(id === "moon" ? 90 : 400)) / 1.6)); }
          else if (bb) { var dp = nearCam.position.distanceTo(bb.T) / bb.Rt; near = Math.max(0, Math.min(1, (Math.log(dp) - Math.log(120)) / 2.3)); }
          ln.material.opacity = 0.34 * A * near;
          ln.visible = ln.material.opacity > 0.004;
        }
      }
      // the Sun as a star: fades in as its disc shrinks under ~5 px; sized by its brightness from here
      if (_tsStar) {
        var dS = nearCam.position.distanceTo(_ts.sun.T), discPx = 2 * _ts.sun.Rt / Math.max(1e-9, dS) / fh * H * 0.5;
        var farOut = _trueStars ? Math.max(0, Math.min(1, (Math.log(Math.max(sunAU, 1e-9)) - Math.log(2000)) / (Math.log(20000) - Math.log(2000))))   // the true-star Sun takes over
                                : Math.max(0, Math.min(1, (camera.position.length() - 600) / 1400));
        var starA = Math.max(0, Math.min(1, (7 - discPx) / 4)) * (1 - farOut) * (ground ? 0 : 1);
        var px = Math.max(14, Math.min(70, 70 / Math.pow(Math.max(1, sunAU), 0.22)));
        var sc = px * 2 * fh / H, ps = new THREE.Vector3(); nyeArmature.group.getWorldScale(ps);
        _tsStar.scale.set(sc / ps.x, sc / ps.x, 1);
        _tsStar.material.opacity = starA; _tsStar.visible = starA > 0.01;
      }
      // the sky of space: the real catalogue at infinity (off on the ground, where the base view's own sky leads)
      if (!_spaceStars && _bsc && !_trueStars && loadTrueStars._p && performance.now() - _tsT0 > 15000) buildSpaceStars();   // fallback only if the true catalogue never arrives
      if (_spaceStars) {
        var so = _trueStars ? 0 : 0.95 * _tsSpaceSky * (1 - _skyAmt);
        _spaceStars.material.uniforms.uOpacity.value = so; _spaceStars.visible = so > 0.01;
        if (_spaceGlare) { _spaceGlare.material.uniforms.uOpacity.value = so * 0.85; _spaceGlare.visible = so > 0.01; }
      }
      // the ember dust was the old orrery's stand-in for a starry backdrop: inside the true Solar System it goes
      if (deepFusion && deepFusion.group && farCam.position.length() < 1500) deepFusion.group.visible = false;
      // the zodiac figures hang at infinity: true for anyone in the Solar System, false once the real stars swing by
      var dpcF = info.sunKm / KM_PER_PC;
      if (natalSky && natalSky.setFigureFade) natalSky.setFigureFade(1 - Math.max(0, Math.min(1, (Math.log(Math.max(dpcF, 1e-9)) - Math.log(0.03)) / (Math.log(1.5) - Math.log(0.03)))));
      if (natalSky && natalSky.setStarfieldGain) natalSky.setStarfieldGain(_trueStars ? 1 - Math.max(0, Math.min(1, (Math.log(Math.max(dpcF, 1e-9)) - Math.log(0.05)) / (Math.log(5) - Math.log(0.05)))) : 1);
      // the instrument line: how far you truly stand
      if (_tsReadout) {
        var on = !ground && info && camera.position.length() > 8.6;
        if (on) {
          var nmA = info.label ? [info.label.en, info.label.zh] : (TS_NAMES[info.from] || TS_NAMES.Earth);
          var txt = '<b>' + '<span class="i18n-en">' + nmA[0] + '</span><span class="i18n-zh">' + nmA[1] + '</span></b>' +
            '<span class="i18n-en">' + info.text + '</span><span class="i18n-zh">' + tsFmtZh(info.km) + '</span>';
          if (txt !== _tsReadout._t) { _tsReadout.innerHTML = txt; _tsReadout._t = txt; }
        }
        if (!!on !== !!_tsReadout._on) { _tsReadout._on = !!on; _tsReadout.classList.toggle("is-on", !!on); }
      }
    }
    function tsFmtZh(km) {                             // 中文读数：公里 · 万公里 · 亿公里 · 天文单位 · 光年
      if (!(km > 0)) return "";
      var au = km / 149597870.7, ly = km / 9460730472580.8;
      if (km < 1e4) return km.toFixed(0) + " 公里";
      if (km < 1e8) return (km / 1e4).toFixed(km < 1e5 ? 1 : 0) + " 万公里";
      if (au < 0.1) return (km / 1e8).toFixed(2) + " 亿公里";
      if (au < 5000) return (au < 10 ? au.toFixed(2) : au.toFixed(au < 100 ? 1 : 0)) + " 天文单位";
      if (ly < 1e4) return (ly < 10 ? ly.toFixed(2) : ly.toFixed(ly < 100 ? 1 : 0)) + " 光年";
      if (ly < 1e8) return (ly / 1e4).toFixed(ly < 1e5 ? 1 : 0) + " 万光年";
      return (ly / 1e8).toFixed(ly < 1e9 ? 1 : 0) + " 亿光年";
    }
    /* the zoom governor: one wheel notch never moves the TRUE distance by more than ×3.3 inside the Solar
       System (the ladder's steep stretches would otherwise leap from the Earth to Saturn in four notches) */
    function tsZoomGovernor(rho) {
      if (!_ts) return 1;
      var f = _nav.b && _nav.p >= 1 ? _nav.b : null, cl = camera.position.length();
      var sl = f ? _ts.bodySlope(_ts.L, f.s, f.kappa, rho) : _ts.L.slope(Math.max(1e-6, cl));
      var m = Math.min(1, 3.53 / Math.max(1e-6, sl));
      var far = Math.max(0, Math.min(1, (cl - 300) / 300));
      return m + (1 - m) * far;
    }
    /* where navigation should fly for a body: its ladder proxy (legacy: the body itself) */
    function navPos(obj, out) {
      out = out || new THREE.Vector3();
      if (_ts) for (var i = 0; i < _ts.bodies.length; i++) if (_ts.bodies[i].obj === obj) return out.copy(_ts.bodies[i].proxy);
      return obj.getWorldPosition(out);
    }
    function tryAlignChart() {
      if (!nyeArmature || !natalSky || !natalSky.getPlanetDir) return;
      try {
        var sunObj = nyeArmature.group.getObjectByName("NyeSun");
        var moonObj = nyeArmature.group.getObjectByName("NyeMoon");
        var sunDir = sunObj.getWorldPosition(new THREE.Vector3()).normalize();
        var sunTarget = natalSky.getPlanetDir("sun");
        if (!sunTarget) return;
        var moonDir = moonObj ? moonObj.getWorldPosition(new THREE.Vector3()).normalize() : null;
        var moonTarget = natalSky.getPlanetDir("moon");
        var q;
        if (moonDir && moonTarget) {
          // TRIAD alignment: one rigid rotation that lands the Sun on Capricornus AND the Moon on Leo.
          // A single setFromUnitVectors(sun) leaves a free spin about the Sun axis, so the Moon drifts off
          // Leo. Build an orthonormal triad from (Sun, Moon) in each frame and map orrery→natal-sky.
          var bO = new THREE.Vector3().crossVectors(sunDir, moonDir);
          if (bO.lengthSq() < 1e-8) bO.set(0, 1, 0); bO.normalize();
          var cO = new THREE.Vector3().crossVectors(sunDir, bO).normalize();
          var bN = new THREE.Vector3().crossVectors(sunTarget, moonTarget);
          if (bN.lengthSq() < 1e-8) bN.set(0, 1, 0); bN.normalize();
          var cN = new THREE.Vector3().crossVectors(sunTarget, bN).normalize();
          var Mo = new THREE.Matrix4().makeBasis(sunDir.clone(), bO, cO);
          var Mn = new THREE.Matrix4().makeBasis(sunTarget.clone(), bN, cN);
          var Rm = new THREE.Matrix4().multiplyMatrices(Mn, Mo.clone().transpose());
          q = new THREE.Quaternion().setFromRotationMatrix(Rm);
        } else {
          q = new THREE.Quaternion().setFromUnitVectors(sunDir, sunTarget);
        }
        nyeArmature.group.quaternion.premultiply(q);
        nyeArmature.group.updateMatrixWorld(true);
        var sunNow = sunObj.getWorldPosition(new THREE.Vector3()).normalize();
        var moonNow = moonObj ? moonObj.getWorldPosition(new THREE.Vector3()).normalize() : null;
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
          var atmoM = nyeArmature.group.getObjectByName("NyeEarthAtmosphere");   // the air too — it kept the pre-alignment (local) direction
          if (atmoM && atmoM.material.uniforms.uSunDirWorld) atmoM.material.uniforms.uSunDirWorld.value.copy(earthMesh.material.uniforms.uSunDirWorld.value);
        }
        if (moonObj && moonObj.material && moonObj.material.uniforms && moonObj.material.uniforms.uSunDirWorld) {
          var mW = moonObj.getWorldPosition(new THREE.Vector3());
          moonObj.material.uniforms.uSunDirWorld.value.copy(sunW.clone().sub(mW).normalize());
        }
        // ...and let the sunward embers catch the light (dust + planets share one sun)
        deepFusion.uniforms.uSunDir.value.copy(sunW.clone().normalize());
        deepFusion.uniforms.uSunGlow.value = 0.85;
        if (natalSky && natalSky.setSunWorld) natalSky.setSunWorld(sunW);   // build 236: the planets are sunlit
        setupTrueScale();
      } catch (e) { window.__space.alignError = String(e); }
    }

    // burn the REAL footprint (602k raw GPS points) onto the Earth as a glowing trace,
    // and dress the Earth in real continents + night lights
    function dressEarth(earthGrp) {
      var earthMesh = earthGrp.getObjectByName("NyeEarthMesh");
      if (!earthMesh) return;
      // the ARMATURE owns the earth maps (self-hosted full-res albedo + brightened night
      // lights). The CDN loads that used to live here raced it and silently clobbered
      // both — the "cities never burn" mystery. dressEarth now dresses ONLY the trace.
      function srgb(t) { if ("colorSpace" in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t; }
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
          _traceMat = traceMat;   // the ground-dim ease attenuates this so the footprint fades to an intimate underfoot glow (A)
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

    var _tsModsP = TRUE_SCALE
      ? Promise.all([import("./ephemeris.js?v=1"), import("./truescale.js?v=2")]).then(function (m) { return { eph: m[0], ladder: m[1] }; }).catch(function () { return null; })
      : Promise.resolve(null);
    Promise.all([import("./nye-armature.js?v=53"), _tsModsP]).then(function (mods2) {
      var mod = mods2[0];
      _tsMods = mods2[1]; if (!_tsMods) _tsFailed = true;
      try {
        var armScale = MOBILE ? 2.4 : 3.0;
        nyeArmature = mod.mountNyeArmature(THREE, scene, {
          // the birth instant is 15:45 in BEIJING = 07:45 UTC. The legacy path built it in the visitor's own zone,
          // which turned the Earth up to 12 h wrong for anyone not in UTC+8.
          instant: _tsMods ? new Date(Date.UTC(2002, 0, 2, 7, 45, 0)) : new Date(2002, 0, 2, 15, 45, 0, 0),
          warm: true,
          scale: armScale,
          trueScale: _tsMods ? tsArmatureSpec(_tsMods.eph) : null
        });
        /* GEOCENTRIC: shift the solar system so the EARTH sits at the world origin —
           the axis everything orbits. The Sun then stands toward tropical Capricorn
           (主外) and the Moon toward Leo (主内), exactly as the natal chart reads. */
        var solar = nyeArmature.group.getObjectByName("NyeSolarSystem");
        earthGrpRef = nyeArmature.group.getObjectByName("NyeEarth");
        /* SUN LENS FLARE (build 221, custom) — the three.js Lensflare addon does framebuffer
           copies that break against our multisampled composer target (it rendered a black box).
           This lightweight replacement draws the classic ghost chain as screen-anchored sprites:
           project the Sun to NDC each frame, place ghosts along the sun→centre axis, fade on
           viewport exit and behind-camera, and occlude via a 120ms-throttled ray against the
           Earth/Moon. Procedural canvas textures; ~zero per-frame cost. */
        (function () {
          function flareTex(px, stops, ring) {
            var cnv = document.createElement("canvas"); cnv.width = cnv.height = px;
            var ctx = cnv.getContext("2d");
            var g = ctx.createRadialGradient(px/2, px/2, ring ? px*0.30 : 0, px/2, px/2, px/2);
            stops.forEach(function (st) { g.addColorStop(st[0], st[1]); });
            ctx.fillStyle = g; ctx.fillRect(0, 0, px, px);
            var t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; return t;
          }
          var texGlow = flareTex(256, [[0, "rgba(255,244,224,0.9)"], [0.22, "rgba(255,208,146,0.5)"], [0.5, "rgba(236,146,86,0.15)"], [1, "rgba(236,146,86,0)"]]);
          var texGhost = flareTex(128, [[0, "rgba(255,255,255,0)"], [0.55, "rgba(160,200,255,0.10)"], [0.78, "rgba(170,208,255,0.26)"], [1, "rgba(170,208,255,0)"]], true);
          var texDot = flareTex(64, [[0, "rgba(255,230,200,0.45)"], [0.6, "rgba(255,214,170,0.13)"], [1, "rgba(255,214,170,0)"]]);
          // [texture, px size, distance along sun→centre (0=sun, 1=centre, >1 past), tint, base opacity]
          var DEFS = [
            [texGlow, 210, 0.0, null, 0.85],
            [texGhost, 64, 0.33, 0x8cb8ff, 0.5],
            [texDot, 40, 0.55, 0xffc78c, 0.5],
            [texGhost, 100, 0.82, 0x739ef2, 0.4],
            [texDot, 28, 1.05, 0xffb380, 0.45]
          ];
          _flare = { grp: new THREE.Group(), sprites: [], occ: 1, occT: 0, sun: null, earth: null, moon: null, ray: new THREE.Raycaster(), v: new THREE.Vector3(), dir: new THREE.Vector3() };
          DEFS.forEach(function (d) {
            var m = new THREE.SpriteMaterial({ map: d[0], transparent: true, opacity: d[4], depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
            if (d[3] != null) m.color = new THREE.Color(d[3]);
            if ("toneMapped" in m) m.toneMapped = false;
            var sp = new THREE.Sprite(m); sp.renderOrder = 990; sp.visible = false; sp.userData._def = d;
            _flare.grp.add(sp); _flare.sprites.push(sp);
          });
          _flare.grp.name = "SunFlareChain";
          scene.add(_flare.grp);
        })();
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
        if (tryGroundEntrance) tryGroundEntrance();   // the armature is up — wake at the base
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
    var DOSSIER = {};   // the data-hook registry (keyed by pick-id) → the focus card; blank entries render nothing
    var _galSfx = (MOBILE || /[?&]gallite=1/.test(location.search)) ? "_lite" : "";
    /* build 231 — the ground entrance waits for the natal sky, and the natal sky used to wait for ~720 KB of galaxy-
       survey / cosmic-web arrays that only matter past camLen ≈ 2200 (built lazily by ensureCosmicWeb). On a slow
       link that held the first landing back by tens of seconds. Mount with the chart + LSS outline only; the survey
       arrays stream in behind and are written into the SAME opts object the lazy builder reads (if someone reaches
       the cosmic web before they land, the procedural skeleton covers, as it always did on a failed load). */
    var natalOpts = null;
    var surveyP = Promise.all([
      fetch("data/galaxies2_xyz" + _galSfx + ".i16?v=3").then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; }),
      fetch("data/galaxies2_attr" + _galSfx + ".u8?v=3").then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; }),
      fetch("data/weblines_xyz" + _galSfx + ".i16?v=3").then(function (r) { return r.arrayBuffer(); }).catch(function () { return null; }),
      fetch("data/weblines_rgb" + _galSfx + ".u8?v=3").then(function (r) { return r.arrayBuffer(); }).catch(function () { return null; })
    ]);
    Promise.all([
      fetch("data/natal-sky.json?v=17").then(function (r) { return r.json(); }),
      fetch("data/large-scale.json?v=1").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (arr) {
      var natalData = arr[0], lssData = arr[1];
      DOSSIER = natalData.dossier || {};
      return import("./natal-sky.js?v=163").then(function (mod) {
        natalOpts = {
          tex: tex, vertexShader: DEEP_VERTEX_SHADER, fragmentShader: DEEP_FRAGMENT_SHADER,
          group: COSMOS ? natalRoot : deepFusion.group, R_STAR: COSMOS ? 410 : 372,
          mobile: MOBILE, calm: (TIER !== "full"),
          camera: TRUE_SCALE ? lodCam : camera, interactive: true, lss: lssData,   // true scale: the sky module's crossfades + star picks run on the ladder camera
          galXYZ: null, galRGB: null, webXYZ: null, webRGB: null
        };
        surveyP.then(function (sv) {
          // build 246: 2M++ / 2MRS / UNGC galaxies (Mpc × 64) + 8 catalogue bytes each; the dot layer's density
          // luminance is byte 0, spread to the grey rgb the layer builder reads
          var gA = sv[1] ? new Uint8Array(sv[1]) : null, gRGB = null;
          if (gA) { gRGB = new Uint8Array((gA.length >> 3) * 3); for (var gi = 0, gn = gA.length >> 3; gi < gn; gi++) gRGB[gi * 3] = gRGB[gi * 3 + 1] = gRGB[gi * 3 + 2] = gA[gi * 8]; }
          natalOpts.galXYZ = sv[0] && gA ? new Int16Array(sv[0]) : null; natalOpts.galRGB = gRGB; natalOpts.galAttr = gA; natalOpts.galScale = 1 / 64;
          natalOpts.webXYZ = sv[2] ? new Int16Array(sv[2]) : null; natalOpts.webRGB = sv[3] ? new Uint8Array(sv[3]) : null;
        });
        natalSky = mod.buildNatalSky(THREE, scene, natalData, natalOpts);
        natalSky.applyTheme(root.getAttribute("data-theme") === "dark");
        window.__space.natal = natalSky;
        if (natalSky.onConstellationClick) natalSky.onConstellationClick(function (cid) { window.__space.focusCon(cid); });
        if (natalSky.onNodeClick) natalSky.onNodeClick(function (info) { window.__space.focusStar(info); });
        window.__space.natalStats = natalSky.stats;
        window.__space.getStarAtlas = function () { return natalSky && natalSky.getNodes ? natalSky.getNodes() : []; };
        try { window.dispatchEvent(new CustomEvent("space:atlas-ready", { detail: { count: window.__space.getStarAtlas().length } })); } catch (e) {}
        tryAlignChart();
        applySceneLocale();
        if (tryGroundEntrance) tryGroundEntrance();   // the chart is ALIGNED now — safe to wake on the ground
      });
    }).catch(function (e) { window.__space.natalError = String(e); });

    /* ===== the hand on the world: trackball rotate (controls), right/shift-drag PAN,
       wheel zoom (controls), clean-click routing, double-click home ===== */
    if (COSMOS) {
      var downX = 0, downY = 0, panOn = false, plx = 0, ply = 0, hintFaded = false, movedAcc = 0, ptrDown = false;
      var _pr = new THREE.Vector3(), _pu = new THREE.Vector3(), _pm = new THREE.Vector3();
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      addEventListener("pointerup", function () { ptrDown = false; canvas.style.cursor = "grab"; }, { passive: true });
      canvas.style.cursor = "grab";
      canvas.addEventListener("pointerdown", function (e) {
        ptrDown = true; canvas.style.cursor = "grabbing";
        lastTouch = performance.now(); userMoved = true;
        downX = e.clientX; downY = e.clientY; movedAcc = 0;
        glide.frames = 0; glide.param = null;               // a touch cancels any glide (param too)
        panOn = (e.button === 2 || e.button === 1 || e.shiftKey);
        plx = e.clientX; ply = e.clientY;
      }, true);
      /* hovering the Earth summons the footprint doorway; hovering the Sun, the journey doorway */
      var earthCta = document.getElementById("earth-cta"), sunCta = document.getElementById("sun-cta"), ctaOn = false, sunCtaOn = false, ctaTick = 0;
      var _ctaRay = new THREE.Raycaster(), _ctaNdc = new THREE.Vector2(), _ctaV = new THREE.Vector3();
      _ctaRay.layers.enableAll();
      var TS_PLANET_PICKS = { jupiter: 1, saturn: 1, mercury: 1, venus: 1, mars: 1, uranus: 1, neptune: 1, pluto: 1, charon: 1 };
      var ctaOffT = null, sunCtaOffT = null;   // hysteresis: doors linger briefly, no flicker
      function setCta(on) {
        if (!earthCta) return;
        if (on) { if (ctaOffT) { clearTimeout(ctaOffT); ctaOffT = null; } if (!ctaOn) { ctaOn = true; earthCta.classList.add("is-on"); } }
        else if (ctaOn && !ctaOffT) ctaOffT = setTimeout(function () { ctaOffT = null; ctaOn = false; earthCta.classList.remove("is-on"); }, 240);
      }
      function setSunCta(on) {
        if (!sunCta) return;
        if (on) { if (sunCtaOffT) { clearTimeout(sunCtaOffT); sunCtaOffT = null; } if (!sunCtaOn) { sunCtaOn = true; sunCta.classList.add("is-on"); } }
        else if (sunCtaOn && !sunCtaOffT) sunCtaOffT = setTimeout(function () { sunCtaOffT = null; sunCtaOn = false; sunCta.classList.remove("is-on"); }, 240);
      }
      function dsoPickInScale(owner) {
        var ud = owner && owner.userData; if (!ud) return true;
        var cl = camera.position.length();
        if (ud.dsoMinCam && cl < ud.dsoMinCam) return false;
        if (isFinite(ud.dsoMaxCam) && cl > ud.dsoMaxCam) return false;
        return true;
      }
      var _ctaLastT = 0, _ctaEarthRef = null, _ctaSunRef = null;
      function updateCta(e) {
        if (!earthCta || !nyeArmature) return;
        // R3: never raycast mid-gesture (the battery cost 0.7-2.5ms per hit during drags), never at
        // deep cosmic scales (nothing here is interactive past camLen 1300), and throttle by TIME
        // (~50ms) instead of every-3rd-event — event rate varies 60-240Hz across devices.
        if (ptrDown || panOn) {
          if (ctaOn) { ctaOn = false; earthCta.classList.remove("is-on"); }
          if (sunCtaOn && sunCta) { sunCtaOn = false; sunCta.classList.remove("is-on"); }
          return;
        }
        if (!controls.isGround() && camera.position.length() >= 1300) return;
        var _ctaNow = performance.now();
        if (_ctaNow - _ctaLastT < 50) return; _ctaLastT = _ctaNow;
        if (controls.isGround()) {   // on the ground the SKY is the interface: everything up there is a door
          if (ctaOn) { ctaOn = false; earthCta.classList.remove("is-on"); }
          if (sunCtaOn && sunCta) { sunCtaOn = false; sunCta.classList.remove("is-on"); }
          if (!ptrDown) {
            _ctaNdc.x = (e.clientX / innerWidth) * 2 - 1; _ctaNdc.y = -(e.clientY / innerHeight) * 2 + 1;
            var gHits = tsPickHits(_ctaRay, _ctaNdc, e.clientX, e.clientY, false);
            var overSky = false;
            for (var gI = 0; gI < gHits.length; gI++) {
              var gO = gHits[gI].object, gPk = null;
              while (gO && !gPk) { gPk = gO.userData && gO.userData.nyePick; gO = gO.parent; }
              if (gPk === "sun" || gPk === "moon" || gPk === "jupiter" || gPk === "saturn" || gPk === "mercury" || gPk === "venus" || gPk === "mars" || gPk === "uranus" || gPk === "neptune" || gPk === "pluto" || gPk === "charon") { overSky = true; break; }
            }
            if (!overSky && natalSky && natalSky.isOverInteractive) overSky = !!natalSky.isOverInteractive(e.clientX, e.clientY);
            canvas.style.cursor = overSky ? "pointer" : "grab";
          }
          return;
        }
        _ctaNdc.x = (e.clientX / innerWidth) * 2 - 1; _ctaNdc.y = -(e.clientY / innerHeight) * 2 + 1;
        var hits = tsPickHits(_ctaRay, _ctaNdc, e.clientX, e.clientY, false);
        var onEarth = false, onSun = false;
        for (var hI = 0; hI < hits.length; hI++) {
          if (hits[hI].object.name === "NyeEarthPickShell") continue;   // the oversized shell is not the globe
          var oo = hits[hI].object, pk = null;
          while (oo && !pk) { pk = oo.userData && oo.userData.nyePick; oo = oo.parent; }
          if (pk === "beacon") { canvas.style.cursor = "pointer"; return; }   // the way home glows under the hand
          if (pk === "earth") { onEarth = true; break; }   // ring glyphs may sit in front — scan on
          if (pk === "sun") { onSun = true; break; }
        }
        if (onEarth) {
          if (!_ctaEarthRef) _ctaEarthRef = nyeArmature.group.getObjectByName("NyeEarthMesh");
          var ew = _ctaEarthRef.getWorldPosition(_ctaV).project(_ts ? nearCam : camera);
          earthCta.style.left = ((ew.x * 0.5 + 0.5) * innerWidth) + "px";
          earthCta.style.top = ((-ew.y * 0.5 + 0.5) * innerHeight - 46) + "px";
        }
        if (onSun && sunCta) {
          if (!_ctaSunRef) _ctaSunRef = nyeArmature.group.getObjectByName("NyeSunCore");
          var sw = _ctaSunRef.getWorldPosition(_ctaV).project(_ts ? nearCam : camera);
          sunCta.style.left = ((sw.x * 0.5 + 0.5) * innerWidth) + "px";
          sunCta.style.top = ((-sw.y * 0.5 + 0.5) * innerHeight - 58) + "px";
        }
        setCta(onEarth); setSunCta(onSun);
        /* the canvas owns the cursor: pointer over ANY clickable body/star, grab otherwise */
        var overClickable = onSun || onEarth;
        if (!overClickable) {
          for (var mI = 0; mI < hits.length; mI++) {
            var mo = hits[mI].object, mp = null;
            while (mo && !mp) { mp = mo.userData && mo.userData.nyePick; mo = mo.parent; }
            if (mp === "moon") { overClickable = true; break; }
          }
        }
        if (!overClickable && natalSky) {
          for (var gI = 0; gI < hits.length; gI++) {         // the planets (hits already holds the Solar System)
            var go = hits[gI].object, gp = null;
            while (go && !gp) { gp = go.userData && go.userData.nyePick; go = go.parent; }
            if (gp && TS_PLANET_PICKS[gp]) { overClickable = true; break; }
          }
          if (_ts && !overClickable) _ctaRay.setFromCamera(_ctaNdc, farCam);   // the sky is cast from the sky camera
          if (!overClickable && natalSky.dsoPicks) {
            var dh = _ctaRay.intersectObject(natalSky.dsoPicks, true);
            for (var dhi = 0; dhi < dh.length; dhi++) { if (dsoPickInScale(dh[dhi].object)) { overClickable = true; break; } }
          }   // a deep-sky wonder under the hand, but only at its real scale
          if (!overClickable && natalSky.conPicks && _ctaRay.intersectObject(natalSky.conPicks, true).length) overClickable = true;   // a constellation under the hand
          if (!overClickable && natalSky.isOverInteractive && natalSky.isOverInteractive(e.clientX, e.clientY)) overClickable = true;
        }
        if (!ptrDown) canvas.style.cursor = overClickable ? "pointer" : "grab";   // never fight the grabbing cursor mid-drag
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
      var ringFadeMats = null, ringFade = 1, soloBody = null, backdropDim = 0, _bdGalPrev = false;   /* "sun"|"moon": rings step aside entirely; backdropDim eases when admiring a deep-sky wonder; _bdGalPrev tracks the galactic-centre keep-galaxy mode */
      function collectRingMats() {
        if (!nyeArmature) return;
        if (ringFadeMats && ringFadeMats.length) return;   // already collected; but a lazily-built ring set starts EMPTY → re-collect once it exists
        if (nyeArmature.hasRings && !nyeArmature.hasRings()) { ringFadeMats = null; return; }
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
        // admiring one deep-sky wonder → the backdrop steps aside. For a lone nebula the galaxy fades too;
        // for the galactic-centre black hole the galaxy STAYS (the hole lives at its heart — keep the context).
        var isGal = (soloBody === "galcore"), wantBD = (soloBody === "dso" || isGal) ? 1 : 0;
        if (Math.abs(backdropDim - wantBD) > 0.002 || (wantBD > 0 && isGal !== _bdGalPrev)) { backdropDim += (wantBD - backdropDim) * 0.06; if (natalSky && natalSky.setBackdropDim) natalSky.setBackdropDim(backdropDim, isGal); _bdGalPrev = isGal; }
        if (!nyeArmature) return;
        collectRingMats(); if (!ringFadeMats) return;
        var r = controls.getRadius();
        // the birth-chart rings/glyphs melt away as you close in on the Earth (the landing is a
        // clean world + its footprint, nothing blocking it) and reassemble as you pull back out
        // to the natal-chart overview. Only near the Earth — a constellation is handled by soloBody.
        var nearEarth = controls.target.lengthSq() < 1.0;
        var proximity = nearEarth ? Math.max(0, Math.min(1, (r - 8.5) / 8.0)) : 1;   // 0 at r≤8.5 → 1 at r≥16.5
        var zoomOut = Math.max(0, Math.min(1, (camera.position.length() - 520) / 380));  // the solar-system gear-rings melt away as you pull out to galaxy scale (like the zodiac)
        var want = (soloBody || (ctaOn && r < 16)) ? 0 : Math.min(proximity, 1 - zoomOut);
        if (controls.isGround()) want = 0;   // lying on the ground, the sky must be pure — no gear-rings overhead
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

      /* ===== GROUND VIEW: lying at the base (根据地), looking up at the natal sky =====
         The visitor's own place on the Earth is the site's home. The session OPENS here —
         flat on the ground, the constellations overhead — and every departure is a LAUNCH:
         rise off the base first, then soar to wherever was asked. */
      var groundHintEl = document.getElementById("ground-hint");
      var groundCityEl = document.getElementById("ground-city");
      var baseBtn = document.getElementById("cosmos-base");
      function groundHint(on) {
        if (groundHintEl) groundHintEl.classList.toggle("is-on", !!on);
        if (on && groundCityEl) {   // an instrument stamp: where you lie, to the hundredth of a degree
          var gc = "";
          if (baseGeo && isFinite(baseGeo.lat) && isFinite(baseGeo.lon)) {
            gc = Math.abs(baseGeo.lat).toFixed(2) + "°" + (baseGeo.lat >= 0 ? "N" : "S") + " " + Math.abs(baseGeo.lon).toFixed(2) + "°" + (baseGeo.lon >= 0 ? "E" : "W");
          }
          groundCityEl.textContent = [(baseGeo && baseGeo.city) || "", gc].filter(Boolean).join("  ·  ") || "⌂";
        }
        document.body.classList.toggle("on-ground", !!on);
        // you're standing AT the beacon: hide it on the ground or its screen-filling
        // additive glow washes the whole night white (it pulses, too — the wandering haze)
        if (nyeArmature && nyeArmature.group) {
          var bk = nyeArmature.group.getObjectByName("BaseBeacon");
          if (bk) bk.visible = !on;
        }
        groundDimTarget = on ? 1 : 0;   // the local world darkens to night underfoot, blooms back on launch
      }
      groundHintHook = groundHint;   // flyTo (module scope) launches from the ground through this hook
      function enterGroundView(opts) {
        if (!nyeArmature || !nyeArmature.earthSurfacePoint || !controls || !baseGeo) return;
        var sp = nyeArmature.earthSurfacePoint(baseGeo.lat, baseGeo.lon, 0.004);   // LOW: the horizon reads level, like a body on the ground
        camera.near = 0.006; camera.updateProjectionMatrix();   // the ground is centimeters away in scene scale
        soloBody = null; clearSel();
        glide.frames = 0; glide.onDone = null;
        /* aim the waking gaze at the richest thing in THIS sky — the Moon if it's up,
           else the highest constellation. The zodiac hugs the ecliptic band, so a blind
           zenith stare can open onto empty sky; the first sight must never be empty. */
        var aim = null;
        var nrm = sp.normal, upW = new THREE.Vector3(0, 1, 0);
        var east = new THREE.Vector3().crossVectors(upW, nrm); if (east.lengthSq() < 1e-6) east.set(1, 0, 0); east.normalize();
        var north = new THREE.Vector3().crossVectors(nrm, east).normalize();
        var best = null, bestScore = -2;
        var consider = function (getP, bonus) {
          try {                                          // each candidate fails ALONE — one bad
            var p = getP(); if (!p) return;              // constellation must never cost us the Moon
            var d = p.clone().sub(sp.position).normalize();
            var alt = d.dot(nrm);                        // sine of the altitude above the horizon
            if (alt > 0.08 && alt + (bonus || 0) > bestScore) { bestScore = alt + (bonus || 0); best = d; }
          } catch (eC) { window.__aimErr = String(eC); }
        };
        consider(function () { var m = nyeArmature.group.getObjectByName("NyeMoon"); return m && m.getWorldPosition(new THREE.Vector3()); }, 0.22);
        ["leo", "cancer", "gemini", "capricorn"].forEach(function (cid) {
          consider(function () { return natalSky && natalSky.getConCentroid ? natalSky.getConCentroid(cid) : null; }, 0);
        });
        if (best) {
          aim = {
            yaw: Math.atan2(best.dot(east), best.dot(north)),
            pitch: Math.max(0.46, Math.min(1.28, Math.asin(Math.max(-1, Math.min(1, best.dot(nrm)))) + 0.10))  // aim at the visible Moon/constellation itself, not past it into an empty zenith
          };
        }
        /* build 228 — the waking gaze faces the MILKY WAY at its true place (owner: "初始视角对着银河，保持真实位置").
           Scan the real galactic plane for the brightest stretch standing 15–35° over the skyline (the bulge, the
           Scutum and Cygnus clouds weigh most) and frame it like a night photograph: the city along the bottom
           ~18% of the frame, the band rising out of it. Falls back to the Moon/constellation aim above. */
        try {
          if (natalSky && natalSky.skyDir) {
            var gX2 = natalSky.skyDir(17.7611, -29.0078), gZ2 = natalSky.skyDir(12.8573, 27.1283);
            gZ2.addScaledVector(gX2, -gZ2.dot(gX2)).normalize();
            var gY2 = new THREE.Vector3().crossVectors(gZ2, gX2).normalize();
            var mwAim = null, mwS = -9, md = new THREE.Vector3(), sunDirB = null;
            try { var sunO = nyeArmature.group.getObjectByName("NyeSun"); if (sunO) sunDirB = sunO.getWorldPosition(new THREE.Vector3()).sub(sp.position).normalize(); } catch (eS) {}
            for (var li = -72; li < 72; li++) {
              var Lg = li * Math.PI / 72;
              md.copy(gX2).multiplyScalar(Math.cos(Lg)).addScaledVector(gY2, Math.sin(Lg));
              var altM = Math.asin(Math.max(-1, Math.min(1, md.dot(nrm))));
              if (altM < 0.17) continue;                 // lower than that the city's light dome swallows it
              var brM = 0.2 + Math.exp(-Math.pow(Lg / 0.6, 2)) + 0.45 * Math.exp(-Math.pow((Lg - 1.36) / 0.4, 2)) + 0.35 * Math.exp(-Math.pow((Lg - 0.47) / 0.15, 2)) + 0.45 * Math.exp(-Math.pow((Lg + 1.15) / 0.4, 2));
              var scM = brM * (0.35 + 0.65 * Math.exp(-Math.pow((altM - 0.42) / 0.3, 2)));
              if (scM > mwS) { mwS = scM; mwAim = md.clone(); }
            }
            if (mwAim) {
              // the band's brightest stretch sits beside the (symbolic, user-sized ~15°) natal Sun in Sagittarius:
              // keep the core in frame but turn the gaze AWAY from the Sun until its disc leaves the frame
              var focusM = mwAim.clone();
              if (sunDirB) {
                var aS = Math.acos(Math.max(-1, Math.min(1, mwAim.dot(sunDirB))));
                if (aS < 1.06) {
                  var away = mwAim.clone().multiplyScalar(mwAim.dot(sunDirB)).sub(sunDirB);
                  if (away.lengthSq() > 1e-8) {
                    away.normalize();
                    var dl = Math.min(0.55, 1.06 - aS);
                    mwAim = mwAim.clone().multiplyScalar(Math.cos(dl)).addScaledVector(away, Math.sin(dl)).normalize();
                  }
                }
              }
              var vfov = camera.fov * Math.PI / 180;
              var horizonDip = -0.0925;                   // the visible limb at the low eye (see the composite's uHorizon)
              var below = Math.atan(0.64 * Math.tan(vfov / 2));   // put the limb ~82% of the way down the frame
              var altT = Math.asin(Math.max(-1, Math.min(1, focusM.dot(nrm))));   // the frame must still hold the bright core
              var pitchC = horizonDip + below;            // the limb at ~82% of the frame height: the city along the bottom
              if (altT - pitchC > 0.78 * vfov / 2) pitchC = altT - 0.78 * vfov / 2;   // …unless the band would leave the top
              aim = { yaw: Math.atan2(mwAim.dot(east), mwAim.dot(north)), pitch: pitchC };
            }
          }
        } catch (eM) { window.__aimErr = String(eM); }
        controls.setGroundMode({
          position: sp.position, normal: sp.normal,
          yaw: (opts && opts.yaw != null) ? opts.yaw : (aim ? aim.yaw : 0.35),
          pitch: (opts && opts.pitch != null) ? opts.pitch : (aim ? aim.pitch : 1.35),
          onLiftoff: function () { ascendThen(null, 12); }
        });
        makeGroundDome(sp.position, sp.normal);   // the horizon glows all around the base
        // build 228: the near world — your real streets and city — goes up NOW, from ~0.5 MB of local data;
        // it no longer waits behind the far relief (which used to need a 4.7 MB global heightmap first)
        try {
          var spNear = nyeArmature.earthSurfacePoint(baseGeo.lat, baseGeo.lon, 0.0002);
          if (spNear) buildNearWorld(spNear);
        } catch (eN) { window.__space.nearGroundError = String(eN); }
        // real modeled terrain around this base (ETOPO1), lazy-loaded once then built; the
        // sky is already usable while it streams in — it fades up with the ground-dim ease
        // ETOPO relief + Blue Marble albedo in parallel (arnis idea: real geography → walkable volume;
        // here: real elev + real albedo → night-ground patch, not Minecraft voxels)
        setTimeout(function () {   // after the entrance cross-fade: the heightmap must not race the first frame
          if (!controls.isGround()) return;
          Promise.all([loadHeightmap(), loadEarthDayMap()]).then(function (pair) {
            if (pair[0] && controls.isGround()) buildGroundTerrain(baseGeo);
          });
        }, 1800);
        groundHint(true);
      }
      /* the launch: straight up off the base — the gaze pivots from the sky down to the
         world shrinking beneath — then hand over to whatever comes next */
      function ascendThen(fn, highR) {
        if (!controls || !controls.isGround()) { if (fn) fn(); return false; }
        controls.exitGroundMode();
        groundHint(false);
        // the LAUNCH v2 — ascent must read as RISING, not zooming. The gaze sweeps down
        // to the pad EARLY (easeOut, while the craft is still low), so the whole climb is
        // spent WATCHING the ground fall away, sliding east beneath you — parallax is the
        // language of altitude; a gaze fixed on infinite stars reads as nothing at all
        var up = camera.position.clone().normalize();
        var east = new THREE.Vector3().crossVectors(UP_Y, up); if (east.lengthSq() < 1e-6) east.set(1, 0, 0); east.normalize();
        var camTo = up.clone().multiplyScalar(highR || 12).addScaledVector(east, 5.0);
        paramGlide({
          camTo: camTo, targetTo: HOME.clone(),
          frames: fn ? 170 : 210,        // ~2.8s / ~3.5s — still reads as a climb, no longer an eternity
          ease: easeInOutCubic, targetEase: easeOutCubic, fovKick: 7, onDone: fn || null
        });
        return true;
      }
      /* the homecoming: from anywhere in space, descend onto the base and lie back down */
      function glideToBase() {
        if (!nyeArmature || !nyeArmature.earthSurfacePoint || !baseGeo || !controls || controls.isGround()) return;
        clearSel(); soloBody = null;
        var sp = nyeArmature.earthSurfacePoint(baseGeo.lat, baseGeo.lon, 0.004);
        camera.near = 0.006; camera.updateProjectionMatrix();   // the ground must render all the way down
        // the HOMECOMING: swift approach from orbit easing into a double-soft touchdown
        // (easeOut in log-radius: big radii sweep by, the last meters settle like a feather)
        function easeInCubic(t) { return t * t * t; }
        paramGlide({
          camTo: sp.position.clone(),
          targetTo: sp.position.clone().addScaledVector(sp.normal, 60),   // gaze lifts to the sky only at touchdown
          frames: 260, ease: easeSoftOut, targetEase: easeInCubic, up: sp.normal,
          onDone: function () { enterGroundView({ pitch: 1.32 }); }
        });
      }
      if (baseBtn) baseBtn.addEventListener("click", glideToBase);
      var exit3d = document.getElementById("exit3d");
      if (exit3d) exit3d.addEventListener("click", function () {
        try { localStorage.setItem(MOTION_KEY, "flat"); } catch (e) {}
        location.reload();
      });
      /* the entrance: once the armature is up and the visitor's place is known, wake on the ground */
      tryGroundEntrance = function () {
        Promise.race([basePromise, new Promise(function (res) { setTimeout(function () { res(null); }, 5000); })])   // the poster covers the wait; landing in the wrong city is worse
          .then(function (g) {
            // require BOTH the armature and the natal sky: tryAlignChart rotates the whole
            // orrery when the second one arrives — entering earlier would leave the camera
            // hovering over the wrong place once the globe turns to its aligned position
            if (groundEntered || !nyeArmature || !natalSky) return;
            baseGeo = g || DEFAULT_BASE;
            try { nyeArmature.setBaseMarker(baseGeo.lat, baseGeo.lon); } catch (e2) {}
            enterGroundView();
            groundEntered = true;
            canvas.style.transition = "opacity 1.25s ease";
            canvas.style.opacity = "1";
            skyLive();
          });
      };
      window.__space.ground = {
        enter: function (lat, lon, city) {
          baseGeo = { lat: lat, lon: lon, city: city || "" };
          if (nyeArmature && nyeArmature.setBaseMarker) nyeArmature.setBaseMarker(lat, lon);
          enterGroundView();
        },
        lift: function () { ascendThen(null, 12); },
        toBase: glideToBase,
        is: function () { return !!(controls && controls.isGround()); }
      };

      /* ===== the TOUR: the nav asks, the camera travels, the door opens ===== */
      window.__space.glideToBody = function (n, d, f) { lastTouch = performance.now(); userMoved = true; if (controls.isGround()) { controls.exitGroundMode(); groundHint(false); } glideToBody(n, d, f); };   // verification hook
      window.__space.tour = function (name, href) {
        lastTouch = performance.now(); userMoved = true; glide.onDone = null;
        // (body/star/constellation destinations fly via flyTo, which departs vertically
        // from the ground on its own; the classic radial glides below must exit manually)
        if (controls.isGround() && (name === "footprint" || name === "pillars" || name === "zodiac")) {
          controls.exitGroundMode(); groundHint(false);
        }
        if (name === "pillars" || name === "zodiac" || name === "footprint") { soloBody = null; clearSel(); }
        if (name === "footprint") {
          glide.axis = null; glide.step = 0; glide.frames = 110; glide.distTarget = 9;
          glide.targetTo = new THREE.Vector3(0, 0, 0);
          glide.onDone = openFootprintMap;
        } else if (name === "sun") {
          glideToBody("NyeSun", 21, 175);   /* the journey anchor: park where the blaze fills ~40° of sky */
        } else if (name === "moon") {
          glideToBody("NyeMoon", 5.2, 150);   /* a ~35° close-up of the real lunar face, a real ride away */
          if (natalSky) { natalSky.highlight("leo", true); setTimeout(function () { natalSky.highlight("leo", false); }, 4200); }
        } else if (name === "jupiter") {
          glideToBody("NatalJupiter", 13, 190);
          if (natalSky) { natalSky.highlight("cancer", true); setTimeout(function () { natalSky.highlight("cancer", false); }, 4200); }
        } else if (name === "saturn") {
          glideToBody("NatalSaturn", 16, 200);
          if (natalSky) { natalSky.highlight("gemini", true); setTimeout(function () { natalSky.highlight("gemini", false); }, 4200); }
        } else if (name === "venus") {
          glideToBody("NatalVenus", 4.0, 170);
        } else if (name === "mercury") {
          glideToBody("NatalMercury", 2.2, 170);
        } else if (name === "pillars" || name === "zodiac") {
          /* return to the canonical framing: keep the current azimuth (the sky keeps
             turning) but restore the entrance elevation — never arrive edge-on */
          var hOff = camera.position.clone().sub(controls.target);
          var hAz = (hOff.x * hOff.x + hOff.z * hOff.z > 1e-6) ? Math.atan2(hOff.x, hOff.z) : 0.8;
          var hEl = 0.517;
          var hDir = new THREE.Vector3(Math.sin(hAz) * Math.cos(hEl), Math.sin(hEl), Math.cos(hAz) * Math.cos(hEl));
          paramGlide({ camTo: HOME.clone().add(hDir.multiplyScalar(name === "pillars" ? 92 : 390)), targetTo: HOME.clone(),
            frames: name === "pillars" ? 130 : 150, ease: easeInOutCubic, targetEase: easeOutCubic, fovKick: 4, onDone: null });
        } else if (name && name.indexOf("star:") === 0) {
          focusConstellation(name.slice(5), 110);
        }
        // the nav asks → the camera flies to that place in the chart → it HOVERS a
        // beat so you register where the content lives → then the door opens
        if (href) glide.onDone = function () { setTimeout(function () { location.href = href; }, 850); };
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
      canvas.addEventListener("pointermove", function (e) {
        lastTouch = performance.now();   // R11: hover wakes full-rate rendering (do NOT set userMoved — hover isn't navigation)
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
      canvas.addEventListener("wheel", function () {
        lastTouch = performance.now(); userMoved = true;
        // R5: scrolling during a flight hands control back instantly (the controls wheel handler
        // re-seeds zoomTarget from the live radius when externalDrive was set) — parity with pointerdown.
        if (glideActive() && !controls.isGround()) { glide.frames = 0; glide.param = null; glide.onDone = null; }
      }, { passive: true });

      // clean-click routing: a drag is never a click
      var pickRay = new THREE.Raycaster(), pickNdc = new THREE.Vector2(), _lastPickAt = 0;
      pickRay.layers.enableAll();
      /* every pickable hit under a screen point, nearest first. True scale: the Solar System is cast from the
         true-scale camera, the sky from the sky camera (always behind), and a planet too small to hit by ray
         is still caught within ~16 px of its true position — a real-scale planet is often under a pixel. */
      var _tpV = new THREE.Vector3();
      function tsPickHits(ray, ndc, sx, sy, withFar) {
        var near, far = [];
        if (!_ts) {
          ray.setFromCamera(ndc, camera);
          near = ray.intersectObject(nyeArmature.group, true);
          if (natalSky && natalSky.bodyGroup) near = near.concat(ray.intersectObject(natalSky.bodyGroup, true));
          if (withFar && natalSky && natalSky.dsoPicks) near = near.concat(ray.intersectObject(natalSky.dsoPicks, true));
          if (withFar && natalSky && natalSky.conPicks) near = near.concat(ray.intersectObject(natalSky.conPicks, true));
          return near.sort(function (h1, h2) { return h1.distance - h2.distance; });
        }
        ray.setFromCamera(ndc, nearCam);
        near = ray.intersectObject(nyeArmature.group, true);
        if (natalSky && natalSky.bodyGroup) near = near.concat(ray.intersectObject(natalSky.bodyGroup, true));
        var fh = Math.tan(nearCam.fov * Math.PI / 360);
        var nearSys = nearCam.position.distanceTo(_ts.sun.T) < _ts.nearSkip;   // light-years out, the planets are no longer under your hand
        for (var i = 0; nearSys && i < _ts.bodies.length; i++) {
          var b = _ts.bodies[i]; if (!b.obj.visible) continue;
          if (!tsProject(b.T, _tpV)) continue;
          var px = (_tpV.x * 0.5 + 0.5) * innerWidth, py = (-_tpV.y * 0.5 + 0.5) * innerHeight, dd = b.T.distanceTo(nearCam.position);
          var rpx = b.Rt / Math.max(1e-9, dd) / fh * innerHeight * 0.5;
          if (rpx < 16 && Math.hypot(px - sx, py - sy) < 16) {
            var po = null; b.obj.traverse(function (c) { if (!po && c.userData && c.userData.nyePick) po = c; });
            if (po) near.push({ object: po, distance: dd, point: b.T.clone() });
          }
        }
        near.sort(function (h1, h2) { return h1.distance - h2.distance; });
        if (withFar) {
          // a true-scale nebula is often only a few pixels across: catch it within ~14 px of its true place
          for (var gi = 0; gi < _ts.frames.length; gi++) {
            var gf = _ts.frames[gi]; if (!gf.galactic || !gf.obj) continue;
            if (!tsProject(gf.T, _tpV)) continue;
            var gx = (_tpV.x * 0.5 + 0.5) * innerWidth, gy = (-_tpV.y * 0.5 + 0.5) * innerHeight;
            if (Math.hypot(gx - sx, gy - sy) < 14) far.push({ object: gf.obj, distance: gf.T.distanceTo(nearCam.position), point: gf.T.clone() });
          }
          // each sky layer is cast from the camera that draws it (the cosmic tiers stand at different true-scale spots)
          var layersToCast = [1].concat(TS_TIERS.map(function (t) { return t.layer; }));
          for (var lc = 0; lc < layersToCast.length; lc++) {
            var ly = layersToCast[lc], lcam = ly === 1 ? farCam : TS_LAYER_TIER[ly].cam;
            ray.layers.set(ly); ray.setFromCamera(ndc, lcam);
            if (natalSky && natalSky.dsoPicks) far = far.concat(ray.intersectObject(natalSky.dsoPicks, true));
            if (ly === 1 && natalSky && natalSky.conPicks) far = far.concat(ray.intersectObject(natalSky.conPicks, true));
          }
          ray.layers.enableAll();
          far.sort(function (h1, h2) { return h1.distance - h2.distance; });
        }
        return near.concat(far);
      }
      var _flare = null;   // custom sun lens-flare chain (built at armature mount)
      var FOCUS_MIN = { NyeSun: 9.5, NyeMoon: 2.2, NatalJupiter: 4.5, NatalSaturn: 4.5, NatalMercury: 0.9, NatalVenus: 1.6, NatalMars: 1.1, NatalUranus: 1.9, NatalNeptune: 1.8, NatalPluto: 0.5, NatalPlutoMoon: 0.35 };   // closest approach per body (must clear each surface + the near-plane)
      function glideToBody(objName, viewDist, nFrames) {
        var obj = nyeArmature.group.getObjectByName(objName);
        if (!obj && natalSky && natalSky.group) obj = natalSky.group.getObjectByName(objName);
        if (!obj) return;
        soloBody = ({ NyeSun: "sun", NyeMoon: "moon", NatalJupiter: "jupiter", NatalSaturn: "saturn", NatalMercury: "mercury", NatalVenus: "venus", NatalMars: "mars", NatalUranus: "uranus", NatalNeptune: "neptune", NatalPluto: "pluto", NatalPlutoMoon: "charon" })[objName] || soloBody;
        clearSel();
        var _bodyPick = ({ NyeSun: "sun", NyeMoon: "moon", NatalJupiter: "jupiter", NatalSaturn: "saturn", NatalMercury: "mercury", NatalVenus: "venus", NatalMars: "mars", NatalUranus: "uranus", NatalNeptune: "neptune", NatalPluto: "pluto", NatalPlutoMoon: "charon" })[objName];
        if (_bodyPick) showDossier(_bodyPick, null);   // its dossier (blank now) can be filled later
        controls.setDistanceLimits(FOCUS_MIN[objName] || 5.0, 15000);   // AFTER clearSel — clearSel resets the floor to the earth-anchored 5.0; 15000 lets you pull back from any focused body to the full-system overview
        var w = navPos(obj);                                  // true scale: the body's ladder proxy (legacy: the body)
        var wT = obj.getWorldPosition(new THREE.Vector3());   // …while sunlight directions come from the TRUE geometry
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
            var toSun = sunObj.getWorldPosition(new THREE.Vector3()).sub(wT).normalize();
            outward.multiplyScalar(0.5).addScaledVector(toSun, 0.85).normalize();
          }
          outward.multiplyScalar(Math.cos(0.22)).addScaledVector(ringN, Math.sin(0.22)).normalize();
        } else if (objName !== "NyeSun") {
          /* build 236: the planets are sunlit now, so arrive on their DAY side (a three-quarter phase, as SpaceEngine
             frames a body) — the old Earth→body sightline looked at their night side and saw a thin crescent */
          var sunO2 = nyeArmature.group.getObjectByName("NyeSun");
          outward.applyAxisAngle(ringN, -0.5);
          if (sunO2) {
            var toSun2 = sunO2.getWorldPosition(new THREE.Vector3()).sub(wT).normalize();
            outward.multiplyScalar(0.42).addScaledVector(toSun2, 0.92).normalize();
          }
          outward.multiplyScalar(Math.cos(0.30)).addScaledVector(ringN, Math.sin(0.30)).normalize();
        } else {
          outward.applyAxisAngle(ringN, -0.5);   /* this side keeps the year-seal beside, not before, the body */
          outward.multiplyScalar(Math.cos(0.42)).addScaledVector(ringN, Math.sin(0.42)).normalize();
        }
        // the FLIGHT: tangential departure, banked arc, braking in along the sightline
        flyTo({
          camTo: w.clone().add(outward.multiplyScalar(viewDist || 40)),
          targetTo: w.clone(), lookAt: w.clone(),
          frames: nFrames || null, fovKick: 6
        });
      }
      /* any constellation becomes the pivot: stand INSIDE the belt looking outward,
         so the Earth, the Sun and the rings are all BEHIND the camera — nothing can veil it */
      function focusConstellation(id, nFrames) {
        if (!natalSky) return;
        var f = natalSky.getConFrame ? natalSky.getConFrame(id) : null;
        var c = natalSky.getConCentroid ? natalSky.getConCentroid(id) : null;
        if (f && f.dir && c) {
          // the figure is a compact cluster OUT in the deep field. Stay near the origin (on the Earth→figure
          // sightline, where the pattern reads) and look OUT at the figure's own centre, so it resolves into
          // its recognisable shape and orbiting pivots around it. Camera stays close in → the sky stays lit.
          var cd = Math.min((f.near || 1200) * 0.4, 500);
          var camPos = f.dir.clone().multiplyScalar(cd);
          flyTo({ camTo: camPos, targetTo: c.clone(), lookAt: c.clone(), frames: nFrames ? Math.round(nFrames * 2.2) : null, fovKick: 5, onDone: null });
        } else if (c) {
          var dir = c.clone().normalize();
          flyTo({ camTo: c.clone().sub(dir.multiplyScalar(85)), targetTo: c.clone(), lookAt: c.clone(), frames: nFrames ? Math.round(nFrames * 2.2) : null, fovKick: 5, onDone: null });
        } else return;
        soloBody = "sky"; clearSel();
        showDossier("con_" + id, null);
        natalSky.highlight(id, true); setTimeout(function () { natalSky.highlight(id, false); }, 4200);
      }
      window.__space.focusCon = focusConstellation;

      /* the star protocol: first click gives the star the pivot and summons its door;
         the second click (or the door itself) opens it. Nothing navigates by surprise. */
      var selStar = null, starCta = document.getElementById("star-cta");
      var focusCard = document.getElementById("focus-card");
      function hideDossier() { if (focusCard) focusCard.classList.remove("is-on"); }
      function showDossier(id, fallback) {
        if (!focusCard) return;
        var d = (DOSSIER && DOSSIER[id]) || null;
        var nm = fallback || (natalSky && natalSky.getPickName ? natalSky.getPickName(id) : null) || null;
        var tEn = (d && d.titleEn) || (nm && nm.en) || "";
        var tZh = (d && d.titleZh) || (nm && nm.zh) || tEn;
        if (!tEn && !(d && (d.blurbEn || d.blurbZh))) { hideDossier(); return; }   // truly nothing to show → stay invisible (honors the unlabeled-sky decree)
        var status = d && d.status ? '<span class="focus-card__chip">' + d.status + '</span>' : "";
        var blurb = d && (d.blurbEn || d.blurbZh) ? '<p class="focus-card__b"><span class="i18n-en">' + (d.blurbEn || "") + '</span><span class="i18n-zh">' + (d.blurbZh || d.blurbEn || "") + '</span></p>' : "";
        var links = (d && d.links && d.links.length) ? '<div class="focus-card__links">' + d.links.map(function (l) { return '<a href="' + l.href + '" target="_blank" rel="noopener"><span class="i18n-en">' + (l.labelEn || l.href) + ' ↗</span><span class="i18n-zh">' + (l.labelZh || l.labelEn || l.href) + ' ↗</span></a>'; }).join("") + '</div>' : "";
        focusCard.innerHTML = '<div class="focus-card__h"><span class="i18n-en">' + tEn + '</span><span class="i18n-zh">' + tZh + '</span>' + status + '</div>' + blurb + links;
        focusCard.classList.add("is-on");
      }
      window.__space.showDossier = showDossier;
      function clearSel() {
        selStar = null; if (starCta) starCta.classList.remove("is-on");
        hideDossier();
        try { window.dispatchEvent(new CustomEvent("space:star-clear")); } catch (e) {}
        if (controls) controls.setDistanceLimits(5.0, (window.CosmicLOD ? window.CosmicLOD.MAXCAM : 46000));   // leaving any body-focus: the earth-anchored floor returns; ceiling stays at the cosmic-address MAXCAM so you can pull back to the web/observable tiers
      }
      window.__space.clearSel = clearSel;
      function openStarDoor() {
        if (!selStar || !selStar.href) return;
        if (/^https?:/.test(selStar.href)) { window.open(selStar.href, "_blank", "noopener"); return; }
        document.body.classList.add("to-map");
        var h = selStar.href;
        setTimeout(function () { location.href = h; }, 380);
      }
      function focusStar(info) {
        if (!info) { clearSel(); return; }                       // a click into the void lets go
        // (flyTo departs vertically when starting from the ground — no chain needed)
        if (selStar && selStar.id === info.id) { openStarDoor(); return; }
        selStar = info;
        showDossier(info.id, { en: info.titleEn, zh: info.titleZh });
        try { window.dispatchEvent(new CustomEvent("space:star-focus", { detail: info })); } catch (e) {}
        if (starCta) {
          var te = info.titleEn.length > 34 ? info.titleEn.slice(0, 33) + "…" : info.titleEn;
          var tz = info.titleZh.length > 17 ? info.titleZh.slice(0, 16) + "…" : info.titleZh;
          starCta.innerHTML = '<span class="i18n-en">Open · ' + te + ' ↗</span><span class="i18n-zh">打开 · ' + tz + ' ↗</span>';
        }
        var dir = info.world.clone().normalize(), tb = tsBodyAt(info.world), camTo;
        if (tb) {
          // true scale: a planet door is approached like any body — from its sunlit side, ~4 radii out
          var toSunT = _ts.sun.T.clone().sub(tb.T).normalize(), side = dir.clone().negate().multiplyScalar(0.45).add(toSunT).normalize();
          controls.setDistanceLimits(Math.max(0.3, tb.Ro * 1.5), 15000);
          camTo = info.world.clone().addScaledVector(side, tb.Ro * 3.8);
        } else camTo = info.world.clone().sub(dir.multiplyScalar(38));
        flyTo({
          camTo: camTo,
          targetTo: info.world.clone(), lookAt: info.world.clone(),
          fovKick: 5, onDone: null
        });
        soloBody = "sky";
      }
      if (starCta) starCta.addEventListener("click", openStarDoor);
      window.__space.focusStar = focusStar;
      window.__space.focusStarById = function (id) {
        var info = natalSky && natalSky.getNodeById ? natalSky.getNodeById(id) : null;
        if (!info) return false;
        focusStar(info);
        return true;
      };
      function focusGiant(objName, id, titleEn, titleZh, href, con) {
        var o = natalSky && natalSky.group.getObjectByName(objName); if (!o) return;
        if (con && natalSky) { natalSky.highlight(con, true); setTimeout(function () { natalSky.highlight(con, false); }, 4200); }
        focusStar({ id: id, href: href, titleEn: titleEn, titleZh: titleZh, world: navPos(o) });
      }
      window.__space.focusGiant = focusGiant;
      /* a deep-sky wonder becomes the pivot: fly OUT past it along the Earth→cloud line, swung
         a little aside so the Sun and rings never crowd the frame, then orbit and zoom to admire.
         No content door — these are pure spectacle. */
      function focusDeepSky(id, shell) {
        var vd = 220, fmin = 60;
        if (!shell && natalSky && natalSky.dsoPicks) shell = natalSky.dsoPicks.getObjectByName("DSOPick_" + id) || null;   // called by id (tour/search): the shell carries the framing
        if (shell && shell.userData) { vd = shell.userData.dsoViewDist || vd; fmin = shell.userData.dsoFocusMin || fmin; }
        _focusVd = vd;
        var obj = (natalSky && natalSky.group.getObjectByName("DSO_" + id)) || shell;
        if (!obj) return;
        var w = obj.getWorldPosition(new THREE.Vector3());
        soloBody = (id === "galcore") ? "galcore" : "dso";   // the galactic centre keeps its galaxy; a lone nebula owns an empty frame
        clearSel();
        showDossier("dso_" + id, shell && shell.userData && shell.userData.dsoName);
        controls.setDistanceLimits(fmin, Math.max(15000, vd * 1.6));   // far basins (Virgo/GA/Shapley…) are admired from supercluster distances — the ceiling must clear their viewDist
        var outward = w.clone().normalize();
        if (outward.lengthSq() < 1e-9) outward.set(0, 0, 1);
        // approach nearly along the Earth→cloud line so the cloud (which faces home) is seen FACE-ON,
        // with just a small lift so the distant Sun/rings don't sit dead-centre behind it
        var ringN = new THREE.Vector3(0, 1, 0).applyQuaternion(nyeArmature.group.getWorldQuaternion(new THREE.Quaternion())).normalize();
        outward.applyAxisAngle(ringN, -0.1);
        outward.multiplyScalar(Math.cos(0.12)).addScaledVector(ringN, Math.sin(0.12)).normalize();
        // a far cosmic-web node (the Great Attractor) is approached from the NEAR side, gazing OUTWARD into the
        // void — so the whole Milky Way sits behind the camera and never smears an edge-on bar across the frame
        var side = (shell && shell.userData && shell.userData.dsoFromInside) ? -1 : 1;
        flyTo({ camTo: w.clone().add(outward.multiplyScalar(vd * side)), targetTo: w.clone(), lookAt: w.clone(), frames: null, fovKick: 5, onDone: null });
      }
      window.__space.focusDeepSky = focusDeepSky;
      var _selV = new THREE.Vector3();
      /* return to the whole-sky overview — a smooth glide to the canonical home frame */
      var homeBtn = document.getElementById("cosmos-home");
      function goHome() {
        userMoved = true;   // "whole sky" is genuine navigation → lets the scale director build the orrery rings
        if (controls.isGround()) {
          // from the ground, "whole sky" is one clean launch all the way to the overview
          controls.exitGroundMode(); groundHint(false);
          clearSel(); soloBody = null;
          var gdir = camera.position.clone().normalize();
          paramGlide({ camTo: gdir.multiplyScalar(128), targetTo: HOME.clone(), frames: 220, ease: easeInOutCubic, targetEase: easeOutCubic, fovKick: 5, onDone: null });
          return;
        }
        clearSel(); soloBody = null;             // the whole chart returns — rings and all
        var az = (function () { var o = camera.position.clone().sub(controls.target); return (o.x * o.x + o.z * o.z > 1e-6) ? Math.atan2(o.x, o.z) : 0.8; })();
        var el = 0.26, dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        // R9: the legacy exponential glide teleported 10-12% of the distance on frame one from deep
        // scales — route home through the authored paramGlide (smooth start, distance-scaled duration).
        paramGlide({ camTo: HOME.clone().add(dir.multiplyScalar(128)), targetTo: HOME.clone(),
          frames: Math.min(300, 90 + Math.round(55 * Math.abs(Math.log(Math.max(1, camera.position.length()) / 128)))),
          ease: easeInOutCubic, targetEase: easeOutCubic, fovKick: 5, onDone: null });   // home never navigates away
      }
      window.__space.goHome = goHome;
      if (homeBtn) homeBtn.addEventListener("click", goHome);

      /* ---- THE COSMIC ADDRESS RAIL: built once from window.CosmicLOD, highlighted per-frame
              from camLen. Clicking a tier flies the camera to that scale (its camLenPeak). ---- */
      var LOD = window.CosmicLOD, railEl = document.getElementById("cosmos-rail"), railItems = [], _railCur = null;
      function fallbackScaleTarget(id, peak) {
        if (id === "local-group") return skyDirWorld(0.712, 41.27, 5720 * 0.36);
        if (id === "virgo-supercluster") return skyDirWorld(12.44, 12.72, 4600);
        if (id === "laniakea") return skyDirWorld(16.25, -60.95, 5000);
        if (id === "cosmic-web") {
          var cLan = LOD && LOD.collapse ? LOD.collapse(peak || 49300, "laniakea", 0.12) : 0.12;
          return skyDirWorld(16.25, -60.95, 12000 * cLan);
        }
        return HOME.clone();
      }
      function targetForScale(peak) {
        var id = LOD && LOD.currentLayerId ? LOD.currentLayerId(peak) : null;
        if (natalSky && natalSky.scaleTarget) {
          var st = natalSky.scaleTarget(id, peak);
          if (st) return st.clone ? st.clone() : new THREE.Vector3(st.x || 0, st.y || 0, st.z || 0);
        }
        return fallbackScaleTarget(id, peak);
      }
      // allocation-free variant for PER-FRAME callers (easeAddressPivot) — writes into `out`
      function targetForScaleInto(peak, out) {
        var id = LOD && LOD.currentLayerId ? LOD.currentLayerId(peak) : null;
        if (natalSky && natalSky.scaleTarget) {
          var st = natalSky.scaleTarget(id, peak);
          if (st) return out.set(st.x || 0, st.y || 0, st.z || 0);
        }
        return out.copy(fallbackScaleTarget(id, peak));
      }
      var _pivT = new THREE.Vector3();
      function cameraOnScaleSphere(target, dir, scale) {
        var r = Math.max(0.001, scale || 1);
        var p = target && target.clone ? target.clone() : HOME.clone();
        var d = dir && dir.clone ? dir.clone() : new THREE.Vector3(0.42, 0.26, 0.88);
        if (d.lengthSq() < 1e-8) d.set(0.42, 0.26, 0.88);
        d.normalize();
        var pd = p.dot(d), disc = pd * pd + r * r - p.lengthSq();
        if (!isFinite(disc) || disc < 1e-6) return d.multiplyScalar(r);
        var rootDisc = Math.sqrt(disc);
        var dist = -pd + rootDisc;
        if (!isFinite(dist) || dist < 0.001) dist = -pd - rootDisc;
        if (!isFinite(dist) || dist < 0.001) return d.multiplyScalar(r);
        return p.add(d.multiplyScalar(dist));
      }
      function flyToScale(peak) {
        userMoved = true; clearSel(); soloBody = null;
        if (controls.isGround()) { controls.exitGroundMode(); groundHint(false); }
        var target = targetForScale(peak);
        var dir = camera.position.clone().sub(controls.target || HOME); if (dir.lengthSq() < 1e-6) dir.set(0.42, 0.26, 0.88);
        dir.normalize();
        var frames = Math.round(90 + Math.abs(Math.log(peak / Math.max(1, camera.position.length()))) * 62);
        paramGlide({ camTo: cameraOnScaleSphere(target, dir, peak), targetTo: target, frames: Math.min(300, frames), ease: easeInOutCubic, targetEase: easeOutCubic, fovKick: 5.5, onDone: null });
      }
      easeAddressPivot = function () {
        if (!LOD || !LOD.weight || !natalSky || !userMoved || controls.isGround() || glideActive() || soloBody || ptrDown || panOn) return;
        if (_ts && _nav.b && _nav.b.galactic) return;   // orbiting a true-scale landmark: its frame owns the pivot until you fly elsewhere
        var cl = camera.position.length();
        var wLG = LOD.weight(cl, "local-group"), wSheet = LOD.weight(cl, "local-sheet"), wVir = LOD.weight(cl, "virgo-supercluster"), wLani = LOD.weight(cl, "laniakea"), wWeb = LOD.weight(cl, "cosmic-web");
        var target = null, rate = 0;   // scratch-based: this runs per frame — no allocations (L3)
        if (wLG > 0.04 && cl >= 4300 && cl <= 12200) {
          target = targetForScaleInto(cl, _pivT);
          rate = 0.016 * wLG;
        } else if (wSheet > 0.035 && cl >= 11200 && cl <= 15400) {
          target = _pivT.copy(HOME);
          rate = 0.018 * wSheet;
        } else if (wVir > 0.035 && cl >= 19800 && cl <= 23200) {
          target = targetForScaleInto(cl, _pivT);
          rate = 0.007 * wVir;
        } else if (wLani > 0.04 && cl >= 28600 && cl <= 35400) {
          target = targetForScaleInto(cl, _pivT);
          rate = 0.0045 * wLani;
        } else if (wWeb > 0.04 && cl >= 39000 && cl <= 52000) {
          target = targetForScaleInto(cl, _pivT);
          rate = 0.0038 * wWeb;
        }
        if (!target || rate <= 0) return;
        var delta = target.sub(controls.target);
        if (delta.lengthSq() < 1e-4) return;
        delta.multiplyScalar(rate);
        controls.target.add(delta);
        camera.position.add(delta);
      };
      if (railEl && LOD) {
        LOD.LAYERS.forEach(function (ly) {
          if (ly.rail === false) return;                     // quiet tiers (the Local Sheet) are scene layers, not rail stops
          var cap = "";                                      // no "10ˣ ly" science annotation — the rail is a clean navigation address (tier names only)
          var it = document.createElement("button"); it.type = "button"; it.className = "cosmos-rail__i"; it.dataset.id = ly.id;
          it.setAttribute("aria-label", (ly.label && (ly.label.en + " / " + ly.label.zh)) || ly.id);
          it.innerHTML = '<span class="cosmos-rail__l"><span class="i18n-en">' + ly.label.en + '</span><span class="i18n-zh">' + ly.label.zh + '</span>' +
            (cap ? '<span class="cosmos-rail__s">' + cap + '</span>' : "") + '</span><span class="cosmos-rail__t" aria-hidden="true"></span>';
          it.addEventListener("click", function () { flyToScale(ly.camLenPeak); });
          railEl.appendChild(it); railItems.push({ el: it, id: ly.id, peak: ly.camLenPeak });
        });
        // keyboard: [ / ] or ↑ / ↓ step the cosmic address; B = Base, H = Whole sky (skip when typing)
        document.addEventListener("keydown", function (e) {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          var tag = (e.target && e.target.tagName) || "";
          if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
          var k = e.key;
          if (k === "b" || k === "B") {
            if (baseBtn && !controls.isGround()) { e.preventDefault(); baseBtn.click(); }
            return;
          }
          if (k === "h" || k === "H") {
            if (homeBtn) { e.preventDefault(); goHome(); }
            return;
          }
          if (k !== "[" && k !== "]" && k !== "ArrowUp" && k !== "ArrowDown") return;
          if (!railItems.length || controls.isGround()) return;
          e.preventDefault();
          var cur = -1;
          for (var ri = 0; ri < railItems.length; ri++) if (railItems[ri].el.classList.contains("is-cur")) cur = ri;
          if (cur < 0) cur = 0;
          var next = (k === "]" || k === "ArrowDown") ? Math.min(railItems.length - 1, cur + 1) : Math.max(0, cur - 1);
          if (next === cur && (k === "[" || k === "ArrowUp") && cur === 0) { if (baseBtn) baseBtn.click(); return; }
          flyToScale(railItems[next].peak);
        });
      }
      // nearest RAIL stop in log-space (currentLayerId may name a quiet tier like the Local Sheet;
      // the rail then highlights its nearest listed neighbour, so the address never goes blank)
      function railCurrentId(cl2) {
        var L2 = Math.log(Math.max(1e-3, cl2)), best = null, bd = Infinity;
        for (var i2 = 0; i2 < LOD.LAYERS.length; i2++) {
          var ly2 = LOD.LAYERS[i2]; if (ly2.rail === false) continue;
          var d2 = Math.abs(L2 - Math.log(ly2.camLenPeak));
          if (d2 < bd) { bd = d2; best = ly2; }
        }
        return best ? best.id : null;
      }
      window.__space.flyToScale = flyToScale;
      /* headless-verification hook: jump straight to a scale (no glide) so screenshots can sample
         every tier deterministically. Counts as genuine navigation (userMoved) so lazy layers build. */
      window.__space.teleport = function (r) {
        userMoved = true; clearSel(); soloBody = null;
        groundEntered = true; tryGroundEntrance = null;
        glide.frames = 0; glide.param = null; glide.camTo = null; glide.targetTo = null;
        glide.axis = null; glide.step = 0; glide.distTarget = 0; glide.onDone = null;
        if (controls.isGround()) { controls.exitGroundMode(); groundHint(false); }
        var target = targetForScale(r);
        var dir = camera.position.clone().sub(controls.target || HOME); if (dir.lengthSq() < 1e-6) dir.set(0.42, 0.26, 0.88);
        dir.normalize();
        var camTo = cameraOnScaleSphere(target, dir, r);
        var orbitRadius = Math.max(0.006, camTo.distanceTo(target));
        if (controls.setDistanceLimits) controls.setDistanceLimits(0.006, Math.max(340, orbitRadius * 1.18));
        camera.position.copy(camTo);
        controls.target.copy(target);
        if (controls.setRadius) controls.setRadius(orbitRadius);
        if (window.__space.uiTick) window.__space.uiTick();
      };
      var quantumEl = document.getElementById("quantum-note");
      var dataNoteEl = document.getElementById("cosmos-data-note");

      window.__space.uiTick = function () {
        // zoomed back out BY HAND → the chart reassembles (never mid-flight). A deep-sky wonder is
        // admired from far out (view-dist ~400), so its focus only releases when you truly pull away.
        if (soloBody && soloBody !== "dso" && soloBody !== "galcore" && !glideActive() && controls.getRadius() > 130) { soloBody = null; clearSel(); }
        if ((soloBody === "dso" || soloBody === "galcore") && !glideActive() && controls.getRadius() > Math.max(900, 3.2 * _focusVd)) { soloBody = null; clearSel(); }   // (a supercluster is admired from thousands of units: release relative to its own framing)
        // constellations are apparent Earth-sky annotations, not physical 3-D galaxy structures.
        if (natalSky && natalSky.setZodiacFade) natalSky.setZodiacFade(camera.position.length() >= 1300 ? 1 : 0);
        // the orrery (esp. the SUN) must NEVER hide — it's the anchor you click to fly back to the solar
        // system. It stays drawn at every scale; the gear-rings fade themselves via ringFade, the Earth is a
        // cheap speck when tiny, and the Sun's glow keeps it findable from across the galaxy.
        if (nyeArmature && !nyeArmature.group.visible) nyeArmature.group.visible = true;
        if (selStar && starCta) {
          _selV.copy(selStar.world).project(camera);
          if (_selV.z > 1 || Math.abs(_selV.x) > 1.05 || Math.abs(_selV.y) > 1.05) { starCta.classList.remove("is-on"); }
          else {
            starCta.style.left = ((_selV.x * 0.5 + 0.5) * innerWidth) + "px";
            starCta.style.top = ((-_selV.y * 0.5 + 0.5) * innerHeight - 40) + "px";
            starCta.classList.add("is-on");
          }
        }
        // the "full view" affordance appears only once the visitor has left the overview
        if (homeBtn) {
          var away = soloBody || selStar || controls.getRadius() < 104 || controls.target.lengthSq() > 36;
          homeBtn.classList.toggle("is-on", !!away && !glideActive());
        }
        // the "⌂ base" affordance appears whenever you're OFF the ground (and a base exists)
        if (baseBtn) baseBtn.classList.toggle("is-on", !!baseGeo && !!nyeArmature && !controls.isGround() && !glideActive());
        // THE COSMIC ADDRESS rail: reveal once you've left the ground; highlight the current tier
        if (railEl && LOD) {
          var offGround = !controls.isGround();
          railEl.classList.toggle("is-on", offGround && !!natalSky && userMoved);
          if (offGround) {
            var curId = railCurrentId(camera.position.length());
            if (curId !== _railCur) {
              _railCur = curId;
              for (var ri = 0; ri < railItems.length; ri++) railItems[ri].el.classList.toggle("is-cur", railItems[ri].id === curId);
            }
          }
        }
        // THE FLUCTUATION's whisper — one line, only at the loop's end, linking to the book it echoes
        if (quantumEl && LOD) {
          var _qW = LOD.weight(camera.position.length(), "fluctuation");
          quantumEl.style.opacity = (_qW * 0.9).toFixed(3);
          quantumEl.style.pointerEvents = _qW > 0.5 ? "auto" : "none";
        }
        // data-provenance note: fade in across the large-scale-structure scales (Virgo-SC → Cosmic Web),
        // so the real-galaxy field (2M++ / 2MRS / UNGC) is honestly labelled; hidden near the ground and past the horizon.
        if (dataNoteEl && LOD) {
          var _dcl = camera.position.length();
          var _dW = LOD.smooth(4200, 6000, _dcl) * (1 - LOD.smooth(80000, 95000, _dcl));
          dataNoteEl.style.opacity = (_dW * 0.62).toFixed(3);
        }
      };

      addEventListener("click", function (e) {
        if (e.target !== canvas) return;              // DOM buttons/links are none of our business
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) {
          _lastPickAt = performance.now(); e.stopImmediatePropagation(); e.preventDefault(); return;
        }
        if (!nyeArmature) return;
        pickNdc.x = (e.clientX / innerWidth) * 2 - 1; pickNdc.y = -(e.clientY / innerHeight) * 2 + 1;
        var hits = tsPickHits(pickRay, pickNdc, e.clientX, e.clientY, true);
        for (var i = 0; i < hits.length; i++) {
          if (hits[i].object.name === "NyeEarthPickShell") continue;   // the oversized shell is not the globe
          var pick = null, o = hits[i].object, pickOwner = null;
          while (o && !pick) {
            if (o.userData && o.userData.nyePick) { pick = o.userData.nyePick; pickOwner = o; }
            o = o.parent;
          }
          var isDso = pick && pick.indexOf && pick.indexOf("dso_") === 0;
          var isCon = pick && pick.indexOf && pick.indexOf("con_") === 0;
          if (!isDso && !isCon && pick !== "sun" && pick !== "moon" && pick !== "earth" && pick !== "jupiter" && pick !== "saturn" && pick !== "beacon" && pick !== "mercury" && pick !== "venus" && pick !== "mars" && pick !== "uranus" && pick !== "neptune" && pick !== "pluto" && pick !== "charon") continue;   // glyphs never swallow a click
          if (isDso && !dsoPickInScale(pickOwner)) continue;
          if (pick === "beacon") {                       // the beacon is the door home
            // on the ground the camera sits INSIDE the beacon's pick bubble (and the
            // raycaster ignores visible=false) — look PAST it to the real target
            if (controls.isGround()) continue;
            _lastPickAt = performance.now(); glideToBase(); e.stopImmediatePropagation(); return;
          }
          if (pick === "earth" && controls.isGround()) continue;   // you're standing on it (hour-ring ticks etc. walk to 'earth' at d≈0) — look PAST it to the sky
          if (pick === "sun") {
            if (natalSky) { natalSky.highlight("capricorn", true); setTimeout(function () { natalSky.highlight("capricorn", false); }, 2800); }
            glideToBody("NyeSun", 21);
          } else if (pick === "moon") {
            if (natalSky) { natalSky.highlight("leo", true); setTimeout(function () { natalSky.highlight("leo", false); }, 2800); }
            glideToBody("NyeMoon", 5.2);
          } else if (pick === "jupiter") {
            focusGiant("NatalJupiter", "jupiter", "An Invitation After Abundance", "An Invitation After Abundance", "books/invitation.html", "cancer");
          } else if (pick === "saturn") {
            focusGiant("NatalSaturn", "saturn", "Sovereign Scintillation", "Sovereign Scintillation", "books/sovereign.html", "gemini");
          } else if (pick === "mercury") {
            focusGiant("NatalMercury", "mercury", "Nye Clock 弐时仪", "弐时仪 · Nye Clock", "products/nyeclock.html", null);
          } else if (pick === "venus") {
            focusGiant("NatalVenus", "venus", "Omytea", "Omytea", "products/omytea.html", null);
          } else if (pick === "mars") {
            glideToBody("NatalMars", 2.8);
          } else if (pick === "uranus") {
            glideToBody("NatalUranus", 6.5);
          } else if (pick === "neptune") {
            glideToBody("NatalNeptune", 6.2);
          } else if (pick === "pluto") {
            glideToBody("NatalPluto", 1.1);
          } else if (pick === "charon") {
            glideToBody("NatalPlutoMoon", 0.7);
          } else if (isDso) {
            focusDeepSky(pick.slice(4), hits[i].object);   // a cosmic wonder: fly out to it, orbit it, admire — no door
          } else if (isCon) {
            focusConstellation(pick.slice(4), 110);        // a constellation: fly to it, it becomes the pivot, admire the figure
          } else if (pick === "earth") {
            glide.axis = null; glide.step = 0; glide.frames = 30; glide.distTarget = 7;
            glide.targetTo = new THREE.Vector3(0, 0, 0);      // orbit the Earth itself
          }
          _lastPickAt = performance.now(); e.stopImmediatePropagation();
          return;
        }
      }, true);
      canvas.addEventListener("dblclick", function () {
        if (performance.now() - _lastPickAt < 450) return;   // R14: two quick clicks on a body are an approach, not "go home"
        goHome();
      });
    }

    var running = true;
    var frameNo = 0, prevSec = 0, _clk = 0, beltCentered = false;
    /* ADAPTIVE QUALITY — the anti-stutter lever. The wide additive glow tiers of the survey field
       (*Glow2/*Glow3: ~80k points × 12-23px sprites) are fill-rate bombs at the deep tiers: proven to
       stall the GPU for seconds. Instead of dimming the art for everyone, MEASURE the real frame
       cadence and shed load only when this device struggles: level 1 hides the widest halos, level 2
       the mid halos, level 3 also drops render resolution a notch. Climbs back when the device breathes.
       natal-sky's tick reads window.__cvQuality and owns the actual glow visibility (single owner). */
    var QUALITY = {
      glow: (innerWidth < 700 || (navigator.deviceMemory || 8) <= 4) ? 1 : 0,   // glow-shed level: 0 full · 1 drop *Glow3 · 2 drop *Glow2
      ema: 18, prevT: 0, lastStep: 0, lastDprStep: 0,
      cap: Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.35),      // top resolution (already DPR-capped)
      floor: innerWidth < 700 ? 0.5 : 0.58, dpr: 0, applied: 0
    };
    QUALITY.dpr = QUALITY.cap; QUALITY.applied = QUALITY.cap;
    window.__cvQuality = QUALITY.glow;
    function frame(t) {
      if (!running) return;
      var busy = true;
      var sec = (t || 0) * 0.001;
      var dt = Math.min(0.1, Math.max(0.001, sec - prevSec)); prevSec = sec;
      var dtF = Math.min(3, dt * 60);   // R10: frames-equivalent step — all authored 60fps constants scale by this (120Hz no longer runs 2×; capped so a stall never teleports an ease)
      frameNo++;
      // (frame cadence is measured inside the COSMOS block below, gated to full-rate active frames only,
      //  so the deliberate at-rest / inertial-tail throttle never fools the governor into degrading)
      if (COSMOS && controls) {
        var nowMs = performance.now();
        /* thermal guard: when the visitor rests, render at half rate — the slow
           drift is indistinguishable at 30fps, the GPU cools. Any touch, glide,
           entrance or stirred dust restores 60fps instantly. */
        var inputAge = nowMs - lastTouch;
        var glid = glideActive() || controls.isSettling() || (!userMoved && nowMs < entranceUntil);   // flights AND the inertia/zoom settle stay at full rate (no 60→30 judder mid-coast)
        var freshInput = inputAge < 1150 || ptrDown || panOn;
        busy = freshInput || (inputAge < 3600) || glid || deepFusion.uniforms.uPointerAmt.value > 0.05;
        // DYNAMIC-RESOLUTION governor (the games trick: hold the frame budget by scaling internal
        // resolution). Measure the true render cadence ONLY on full-rate frames (active input or a
        // choreographed glide) — the at-rest / inertial-tail throttle is deliberate and must NOT read
        // as GPU strain. Then continuously scale the pixel ratio toward a ~20 ms (50 fps) budget
        // (resolution IS the fill-rate lever); only when even the floor resolution can't cope do we
        // shed the wide additive glow halos (natal-sky reads window.__cvQuality). Recover gently.
        if (freshInput || glid) {
          if (QUALITY.prevT > 0) { var _qd = t - QUALITY.prevT; if (_qd > 4 && _qd < 500) QUALITY.ema += (_qd - QUALITY.ema) * 0.12; }
          QUALITY.prevT = t;
          if ((frameNo & 3) === 0) {
            var em = QUALITY.ema;
            // Move the *target* resolution toward the frame budget (widened 14-24 ms deadband so a scene
            // hovering near budget doesn't oscillate). The target may drift every tick; APPLYING it is
            // strictly rate-limited below — because setPixelRatio → setSize reallocates the WebGL drawing
            // buffer (a 2-16 ms stall). Build 207 applied on every non-deadband tick and let that stall
            // pollute the EMA → self-reinforcing hitch cascade during drag. Fixed here.
            if (em > 24 && QUALITY.dpr > QUALITY.floor) QUALITY.dpr = Math.max(QUALITY.floor, QUALITY.dpr * 0.88);
            else if (em < 14 && QUALITY.dpr < QUALITY.cap) QUALITY.dpr = Math.min(QUALITY.cap, QUALITY.dpr * 1.05);
            // quantize to coarse rungs (0.12) so sub-rung dither can't fire, apply at most ~once/600 ms, and
            // DISCARD the realloc-polluted next interval (prevT=0) + reset the EMA so the stall never feeds back.
            var rung = Math.min(QUALITY.cap, Math.max(QUALITY.floor, Math.round(QUALITY.dpr / 0.12) * 0.12));
            if (Math.abs(rung - QUALITY.applied) > 0.06 && nowMs - QUALITY.lastDprStep > 600) {
              renderer.setPixelRatio(rung); QUALITY.applied = rung; QUALITY.lastDprStep = nowMs;
              if (composer) { composer.setPixelRatio(rung); composer.setSize(innerWidth, innerHeight); }
              QUALITY.prevT = 0; QUALITY.ema = 18;   // the realloc stall is not a real cadence sample
            }
            // glow-halo backstop: only when resolution is pinned at the floor and the scene is STILL slow
            // (toggling .visible via window.__cvQuality is cheap — no buffer realloc — so it's unthrottled here)
            else {
              var qf = (innerWidth < 700 || (navigator.deviceMemory || 8) <= 4) ? 1 : 0;
              if (QUALITY.dpr <= QUALITY.floor + 0.02 && em > 32 && QUALITY.glow < 2 && nowMs - QUALITY.lastStep > 900) { QUALITY.glow++; window.__cvQuality = QUALITY.glow; QUALITY.lastStep = nowMs; QUALITY.ema = 18; }
              else if (QUALITY.dpr >= QUALITY.cap - 0.02 && em < 12 && QUALITY.glow > qf && nowMs - QUALITY.lastStep > 4000) { QUALITY.glow--; window.__cvQuality = QUALITY.glow; QUALITY.lastStep = nowMs; QUALITY.ema = 18; }
            }
          }
        } else { QUALITY.prevT = 0; }   // reset the interval clock on throttled frames so the next active burst measures cleanly
        // FRAME-RATE CAP (the big thermal lever): active hand motion and choreographed flights run at
        // full refresh; the inertial tail drops to half-rate, and true rest idles cold on a frozen scene.
        if (!glid) {
          if (!freshInput && busy) { if (frameNo & 1) { requestAnimationFrame(frame); return; } }
          else if (!busy && frameNo % 24) { requestAnimationFrame(frame); return; }
        }
        // cinematic arrival: dive from deep space and LAND on the Earth — the visitor
        // meets the home world first (its real footprint glowing on it), then rotates to
        // the starfield and pulls out to the whole orrery ("✦ Whole sky" invites it).
        if (!userMoved && nowMs < entranceUntil) {
          var r0 = controls.getRadius();
          controls.setRadius(r0 + (7.6 - r0) * (1 - Math.pow(0.955, dtF)));   // land close on the Earth, not the wide overview (dt-correct)
        }
        // choreographed flight (launch / landing) — a standard glide starting takes precedence
        if (glide.param && glide.frames > 0) glide.param = null;
        if (glide.param && glide.param.flight) {
          var F = glide.param;
          F.t = Math.min(1, F.t + dtF / F.n);
          var fe = F.ease(F.t);
          bez(F, fe, _fPos);
          _fVel.copy(_fPos).sub(camera.position);           // this frame's velocity
          camera.position.copy(_fPos);
          // the gaze: lead along the path early, lock the body late
          bez(F, Math.min(1, fe + 0.06), _fAhead);
          var lockAmt = F.t < 0.25 ? 0 : F.t > 0.72 ? 1 : (F.t - 0.25) / 0.47;
          lockAmt = lockAmt * lockAmt * (3 - 2 * lockAmt);
          _fLook.copy(_fAhead).lerp(F.body, lockAmt);
          controls.target.copy(F.t0).lerp(_fLook, Math.min(1, F.t * 3));   // hand the pivot over quickly, smoothly
          // BANKING: roll into the turn (lateral velocity change), settle level for arrival
          if (F.prevV && _fVel.lengthSq() > 1e-10) {
            _fRight.crossVectors(_fVel, UP_Y).normalize();
            var lat = (_fVel.x - F.prevV.x) * _fRight.x + (_fVel.y - F.prevV.y) * _fRight.y + (_fVel.z - F.prevV.z) * _fRight.z;
            var bankTarget = Math.max(-0.30, Math.min(0.30, -lat * 55));
            bankTarget *= 1 - Math.max(0, (F.t - 0.82) / 0.18);            // wings level before the dock
            F.bank += (bankTarget - F.bank) * 0.07;
          }
          F.prevV = F.prevV || new THREE.Vector3(); F.prevV.copy(_fVel);
          _fUp.copy(UP_Y);
          if (Math.abs(F.bank) > 0.002 && _fVel.lengthSq() > 1e-10) {
            _fUp.applyAxisAngle(_fVel.clone().normalize(), F.bank);
          }
          camera.up.lerp(_fUp, 0.14).normalize();
          camera.lookAt(controls.target);
          if (F.fovK) { camera.fov = F.fov0 + Math.sin(Math.PI * F.t) * F.fovK; camera.updateProjectionMatrix(); }
          if (F.t >= 1) {
            if (F.fovK) { camera.fov = F.fov0; camera.updateProjectionMatrix(); }
            controls.target.copy(F.body);                    // the pivot IS the body now
            camera.up.copy(UP_Y); camera.lookAt(F.body);
            glide.param = null;
            if (glide.onDone) { var fF = glide.onDone; glide.onDone = null; fF(); }
          }
        } else if (glide.param) {
          var P = glide.param;
          P.t = Math.min(1, P.t + dtF / P.n);
          var pe = P.ease(P.t);
          var pr = Math.exp(P.lnR0 + (P.lnR1 - P.lnR0) * pe);
          _pgDir.copy(P.d0).lerp(P.d1, pe).normalize();
          camera.position.copy(_pgDir).multiplyScalar(pr);
          controls.target.copy(P.t0).lerp(P.t1, P.tease ? P.tease(P.t) : pe);
          camera.up.lerp(P.up1, 0.08).normalize();
          camera.lookAt(controls.target);
          if (P.fovK) {   // the lens breathes with the burn — speed you can feel
            camera.fov = P.fov0 + Math.sin(Math.PI * P.t) * P.fovK;
            camera.updateProjectionMatrix();
          }
          if (P.t >= 1) {
            if (P.fovK) { camera.fov = P.fov0; camera.updateProjectionMatrix(); }
            glide.param = null;
            if (glide.onDone) { var fP = glide.onDone; glide.onDone = null; fP(); }
          }
        }
        // guided glide after clicking a body (any touch cancels) — eases are dt-correct (R10)
        if (glide.frames > 0) {
          var _lgK = 1 - Math.pow(0.9, dtF), _lgKu = 1 - Math.pow(0.92, dtF), _lgKt = 1 - Math.pow(0.88, dtF);
          if (glide.camTo) {
            controls.target.lerp(glide.targetTo, _lgK);
            camera.position.lerp(glide.camTo, _lgK);
            camera.up.lerp(UP_Y, _lgKu).normalize();
            camera.lookAt(controls.target);
          } else {
            if (glide.targetTo) { var dT = glide.targetTo.clone().sub(controls.target).multiplyScalar(_lgKt); controls.target.add(dT); camera.position.add(dT); }
            if (glide.axis) controls.rotateWorld(glide.axis, glide.step * dtF);
            if (glide.distTarget) { var rg = controls.getRadius(); controls.setRadius(rg + (glide.distTarget - rg) * _lgKt); }
          }
          glide.frames -= dtF;
          if (glide.frames <= 0) {
            glide.frames = 0;
            glide.targetTo = null; glide.camTo = null;
            if (glide.onDone) { var fD = glide.onDone; glide.onDone = null; fD(); }
          }
        }
        // NO perpetual auto-rotation: at rest the world holds still (static modelling → zero wasted GPU / heat).
        // The scene only moves under the visitor's own hand or a choreographed glide. (Ground breath kept — it's
        // a deliberate, brief ambiance while lying down, and ground mode is a held, low-cost view.)
        if (controls.isGround() && !glideActive() && nowMs - lastTouch > 2500) controls.groundDrift(0.008 * dt);
        // once truly back in space, restore the normal near-plane (ground views need 0.008).
        // At cosmic distances scale the near-plane with camLen (near = max(0.2, camLen·0.0005))
        // so depth precision stays sane out to the 46k ceiling — kills z-fighting on the web
        // filaments without touching the ground's 0.006 near.
        if (!controls.isGround() && !glideActive() && camera.position.length() > 9) {
          var _wantNear = Math.max(0.2, camera.position.length() * 0.0005);
          if (Math.abs(camera.near - _wantNear) > _wantNear * 0.15) { camera.near = _wantNear; camera.updateProjectionMatrix(); }
        }
        // the horizon glow dissolves behind you as you climb
        if (groundDome && !controls.isGround()) {
          groundDome.material.opacity *= 0.94;
          if (groundStars && groundStars.material) groundStars.material.opacity *= 0.90;
          if (groundDome.material.opacity < 0.02) removeGroundDome();
        }
        // the ground-night dimmer: eases the earth shader toward its target (ground=night)
        if (!_earthUni && nyeArmature) {
          var _em = nyeArmature.group.getObjectByName("NyeEarthMesh");
          if (_em && _em.material.uniforms && _em.material.uniforms.uGroundDim) _earthUni = _em.material.uniforms;
        }
        if (_earthUni) {
          _earthUni.uGroundDim.value += (groundDimTarget - _earthUni.uGroundDim.value) * _gdRate();
          // the REAL footprint blazes at 0.95 in space, fades to ~0.17 when lying at the base — an
          // owner-local visitor genuinely rests on the owner's real roads (A). Exact 0.95 when gDim=0.
          if (_traceMat) _traceMat.opacity = 0.95 * (1.0 - 0.82 * _earthUni.uGroundDim.value);
          if (_terrainMat) {
            _terrainMat.uniforms.uFade.value = _earthUni.uGroundDim.value;   // terrain fades up/down with the base
            if (groundTerrain) groundTerrain.visible = _earthUni.uGroundDim.value > 0.01;   // never a black patch on the globe off-base
          }
          if (_localMapMat) {
            _localMapMat.uniforms.uFade.value = _earthUni.uGroundDim.value;   // the real street map fades in/out with the base
            if (_localMap) _localMap.visible = _earthUni.uGroundDim.value > 0.01;
          }
          if (_cityMat) {
            _cityMat.uniforms.uFade.value = _earthUni.uGroundDim.value;        // the extruded city dims/hides with the base
            if (_city) _city.visible = _earthUni.uGroundDim.value > 0.02;
            if (_lampMat) _lampMat.uniforms.uFade.value = _earthUni.uGroundDim.value;
            // moonlight: the real Moon's direction from the base, in the city's local frame (east, north, up)
            if (_city && _city.visible && nyeArmature && nyeArmature.group) {
              var mo = nyeArmature.group.getObjectByName("NyeMoon");
              if (mo) {
                mo.getWorldPosition(_moonL); _moonL.sub(_ts ? nearCam.position : camera.position).normalize().applyQuaternion(_cityInvQ);
                _cityMat.uniforms.uMoonI.value = Math.max(0, Math.min(1, _moonL.z * 4.0 + 0.15));   // set below the horizon → dark
              }
            }
          }
        }
        // the entrance/glide owns the radius this frame → update() must NOT ease against it;
        // otherwise the wheel's log-target owns it. Recomputed every frame, so it clears cleanly.
        controls.setExternalDrive(glideActive() || (!userMoved && nowMs < entranceUntil));
        controls.update(dtF);
        easeAddressPivot();
        if (!beltCentered && (!TRUE_SCALE || _tsFailed) && natalSky && nyeArmature) {   // one-shot: the WHOLE planetary system (planets + belt) orbits the SUN, not the Earth
          var _bodies = natalSky.group.getObjectByName("NatalBodies");
          var _sunM = nyeArmature.group.getObjectByName("NyeSunCore");
          if (_bodies && _sunM) {
            nyeArmature.group.updateMatrixWorld(true); _bodies.parent.updateMatrixWorld(true);
            _bodies.position.copy(_bodies.parent.worldToLocal(_sunM.getWorldPosition(new THREE.Vector3())));
            beltCentered = true;
          }
        }
        if (window.__space.applyRingFade) window.__space.applyRingFade();
      if (window.__space.uiTick) window.__space.uiTick();
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
          // the 2D breath-dust is a FAR-VIEW veil only. On the ground it must vanish —
          // it painted a milky wash over the whole night sky (in ground mode getRadius()
          // is the 400-away gaze point, which drove the veil to maximum brightness).
          if (controls.isGround()) fieldEl2.style.opacity = "0.14";
          else {
            var rr2 = controls.getRadius();
            fieldEl2.style.opacity = (0.5 + 0.28 * Math.max(0, Math.min(1, (rr2 - 90) / 320))).toFixed(2);
          }
        }
      } else if (COSMOS) {
        /* unreachable guard */
      } else {
        var sy = (typeof scrollY === "number" ? scrollY : 0);
        var targetCamY = Math.max(-14, Math.min(14, -sy * 0.006));
        camera.position.y += (targetCamY - camera.position.y) * 0.06;
        camera.lookAt(0, camera.position.y * 0.4, -300);
      }
      if (busy) _clk += dt;                     // ACCUMULATE (not snap to sec): waking from rest must not fast-forward every uTime effect + the fusion rotation by the whole idle span — that was a visible lurch exactly when attention returns
      // LAZY-BY-SCALE: build the heavy far structures ONLY on genuine user navigation (userMoved gates out
      // the auto-entrance + the fallback deep-space dive, which both transiently fling the camera far). The
      // ground & whole-sky view therefore never pays for the galaxy / black hole / cosmic web.
      if (userMoved) {
        var _farCl = camera.position.length();
        if (natalSky && _farCl > 350) natalSky.ensureFarLayers();      // galaxy + black hole, once you rise past the constellation sphere toward galactic scale
        if (natalSky && natalSky.ensureMidLayers && _farCl > 3200) natalSky.ensureMidLayers();   // Local Group / Local Sheet / Virgo supercluster: built just before the LG crossfade begins (fadeIn 5000)
        if (natalSky && _farCl > 12000) natalSky.ensureCosmicWeb();     // the Laniakea flow basin + neighbour basins + the whole web (fadeIn 24200 — built well ahead)
        if (natalSky && natalSky.ensureUniverse && _farCl > 30000) natalSky.ensureUniverse();   // far foam + CMB horizon + unobserved-boundary cue (active from 56000)
        // R4: IDLE PREWARM — after the entrance, quietly enqueue the two layers every session hits
        // (galaxy at the first zoom-out, the survey field right after) so their build cost lands on
        // idle frames instead of the first gesture. Then drain ONE builder per rendered frame and
        // pre-compile its shaders off the interactive path.
        if (natalSky && !userMoved && nowMs > entranceUntil && natalSky.ensureMidLayers) { natalSky.ensureFarLayers(); natalSky.ensureMidLayers(); }
        if (natalSky && natalSky.drainBuild) natalSky.drainBuild();
        // (build 226) compileAsync REMOVED: without KHR_parallel_shader_compile it degrades to
        // SYNCHRONOUSLY compiling every program in the scene, once per drained builder — a
        // multi-second GPU stall felt as a total freeze. Materials compile on first render as pre-224.
        // FOG DENSITY by scale: the scene keeps its near-field fog (0.0018, the "no back wall" look); at web
        // scale ease it MUCH thinner so the 36500-radius lattice's far side dissolves into black rather than
        // clipping (0.75/36500 ≈ 0.00002 → half-lost at the rim). Only fog:true materials (the web) respond —
        // the galaxy etc. are fog:false. Ease smoothly (no pop, no nulling the init fog).
        if (scene.fog) { var _fTgt = _farCl > 11000 ? 0.00002 : 0.0018; scene.fog.density += (_fTgt - scene.fog.density) * 0.08; }
        // deep embers are a near-field ornament — fade them out once intergalactic tiers own the frame
        if (deepFusion && deepFusion.group && window.CosmicLOD) {
          var _embFade = _farCl < 5500 ? 1 : Math.max(0, 1 - window.CosmicLOD.smooth(Math.log(5500), Math.log(16000), Math.log(_farCl)));
          deepFusion.group.visible = _embFade > 0.04;
        }
        // 干支 GEAR-RINGS: solar-system-scale ornament — built ONLY when the visitor enters the orrery band
        // (never at init/ground, never at galaxy scale). The existing ringFade hides them once you pass ~900 out;
        // collectRingMats self-heals to pick up the freshly-built ring materials.
        if (nyeArmature && nyeArmature.buildRings && _farCl > 18 && _farCl < 800 && !nyeArmature.hasRings()) nyeArmature.buildRings();
        // UNLOAD the inner solar system at galaxy scale (the Sun always persists): hide Moon/atmosphere/footprint
        // and the outer planets once you leave the solar system, so nothing paints overdraw at the wrong scale.
        if (nyeArmature && nyeArmature.setInnerDetail) nyeArmature.setInnerDetail(_farCl < 400, _farCl < 7800);
        if (natalSky && natalSky.bodyGroup) natalSky.bodyGroup.visible = (_farCl < 400);
      }
      deepFusion.tick(_clk);
      // gentle LIFE: the deep-space ember background drifts very slowly (ambient motion at the far
      // scales). Alignment-safe — it is not the orrery or the natal sky, so the 四柱 / Sun→Capricorn /
      // Moon→Leo stay put. Absolute-time driven so it stays smooth under the idle frame governor.
      if (deepFusion && deepFusion.group) deepFusion.group.rotation.y = _clk * 0.006;
      if (nyeArmature) nyeArmature.tick(_clk);
      if (_ts) { syncCams(); tsOverlayTick(); }   // the true-scale cameras for this frame (flare, air, moonlight, labels read them)
      var fc = _ts ? nearCam : camera, fDist = _ts ? 1.0 : 50;
      if (nyeArmature && nyeArmature.atmoFar) nyeArmature.atmoFar(fc.position);
      if (_flare) {
        var fs = _flare;
        if (!fs.sun) { fs.sun = nyeArmature && nyeArmature.group.getObjectByName("NyeSunCore"); fs.earth = nyeArmature && nyeArmature.group.getObjectByName("NyeEarthMesh"); fs.moon = nyeArmature && nyeArmature.group.getObjectByName("NyeMoon"); }
        var sunVisible = fs.sun && fs.sun.visible && fs.sun.parent;
        if (sunVisible) {
          fs.sun.getWorldPosition(fs.v);
          fs.dir.copy(fs.v).sub(fc.position);
          var behind = fs.dir.dot(fc.getWorldDirection(_pivT)) <= 0;   // _pivT reused as scratch here (frame-local)
          var ndc = fs.v.project(fc);                                   // fs.v now holds NDC
          var inView = !behind && ndc.x > -1.25 && ndc.x < 1.25 && ndc.y > -1.25 && ndc.y < 1.25;
          if (inView) {
            var nowF = performance.now();
            if (nowF - fs.occT > 120) {                                     // throttled occlusion: is the Sun hidden by Earth/Moon?
              fs.occT = nowF;
              fs.sun.getWorldPosition(fs.dir);
              fs.ray.set(fc.position, fs.dir.sub(fc.position).normalize());
              var occHit = false, sunDist = fc.position.distanceTo(fs.sun.getWorldPosition(_pivT));
              var tests = [fs.earth, fs.moon];
              for (var ti = 0; ti < tests.length; ti++) {
                if (!tests[ti] || !tests[ti].visible) continue;
                var hs = fs.ray.intersectObject(tests[ti], false);
                if (hs.length && hs[0].distance < sunDist - 0.01) { occHit = true; break; }
              }
              fs._occTarget = occHit ? 0 : 1;
            }
            fs.occ += ((fs._occTarget == null ? 1 : fs._occTarget) - fs.occ) * 0.18;
            var edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
            var fade = fs.occ * (1 - Math.max(0, (edge - 0.92)) / 0.33);
            if (_ts) {   // a lens flare belongs to a blinding disc: it fades as the Sun recedes into a star (30 → 300 AU)
              var fAU = fc.position.distanceTo(_ts.sun.T) * _ts.kpu / 149597870.7;
              fade *= 1 - Math.max(0, Math.min(1, (Math.log(Math.max(fAU, 1e-9)) - Math.log(30)) / (Math.log(300) - Math.log(30))));
            }
            var fovH = Math.tan(fc.fov * Math.PI / 360);
            for (var fi = 0; fi < fs.sprites.length; fi++) {
              var sp2 = fs.sprites[fi], d2 = sp2.userData._def;
              if (fade <= 0.02) { sp2.visible = false; continue; }
              var gx = ndc.x * (1 - d2[2]), gy = ndc.y * (1 - d2[2]);
              _pivT.set(gx, gy, 0.5).unproject(fc).sub(fc.position).normalize();
              sp2.position.copy(fc.position).addScaledVector(_pivT, fDist);
              var w = 2 * fDist * fovH * (d2[1] / innerHeight);
              sp2.scale.set(w, w, 1);
              sp2.material.opacity = d2[4] * fade;
              sp2.visible = true;
            }
          } else for (var fh = 0; fh < fs.sprites.length; fh++) fs.sprites[fh].visible = false;
        } else for (var fo = 0; fo < fs.sprites.length; fo++) fs.sprites[fo].visible = false;
      }
      if (_ts && frameNo % 30 === 0) markFarLayers();   // lazily built sky tiers join the sky layer
      else if (!_ts && TRUE_SCALE) {                    // until the true-scale world is up, the sky cameras ARE the camera
        [farCam, lodCam].forEach(function (fc2) {
          fc2.position.copy(camera.position); fc2.quaternion.copy(camera.quaternion);
          fc2.fov = camera.fov; fc2.aspect = camera.aspect; fc2.near = camera.near; fc2.far = camera.far;
          fc2.updateProjectionMatrix(); fc2.updateMatrixWorld();
        });
      }
      if (natalSky) natalSky.tick(_clk);
      if (composer) {
        if (bloomPass) bloomPass.enabled = (window.__cvQuality || 0) < 2;   // shed the bloom pass under real load
        renderComposed();
      } else { if (_ts) renderer.clear(); renderWorld(); }
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
    window.__space.scene = scene;   // verification: scene-graph inventory
    window.__space.pump = function (n2) { var base = performance.now(); for (var q = 0; q < (n2 || 1); q++) frame(base + q * 16.7); };
    window.__space.snap = function () {
      if (COSMOS && controls) controls.update(1 / 60);   // was dtF — undefined in this scope (snap threw ReferenceError)
      if (composer) renderComposed(); else { if (_ts) renderer.clear(); renderWorld(); } return canvas.toDataURL("image/jpeg", 0.8);
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
