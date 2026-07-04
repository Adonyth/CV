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
  var THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
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

    var camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.2, 55000);  // far plane: maxDist 3400 (pull OUT to behold the galaxy) + the vast disc rim (~3950) + far nebulae now pushed to ~6800 + the deep starfield (7200) → nothing clips from any vantage
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
      // ---- silky log-space zoom (geometric glide) ----
      // the wheel accumulates a TARGET radius in ln-space (so N notches in then N out return to
      // the exact start radius); update() eases the live radius toward it every frame — scale-
      // invariant (same feel near the Earth and far out), magnitude-aware, damped, clip-proof.
      var zoomTarget = -1;        // desired radius; -1 = unseeded → adopt the live radius on first use
      var externalDrive = false;  // true while an entrance/glide owns the radius this frame (don't ease)
      var zoomStepLn = 0.40;      // ln(r) shift per one firm scroll unit (≈ one mouse-wheel notch)
      var zoomRef = 100;          // px-equivalent that counts as 1.0 firm unit
      var zoomHi = 2.2;           // per-EVENT upper clamp on units (anti-fling); no lower floor
      var zoomEase = 0.18;        // per-frame log-space easing coefficient (critically-damped feel)
      /* ---- GROUND MODE (the base 根据地): lying at a place on the Earth, looking up ----
         The camera stands ON the globe; drag = look around the sky (yaw/pitch, first person),
         wheel/pinch OUT = lift off (handled by the onLiftoff callback the page provides).
         The orbit model is suspended: update() leaves the camera alone entirely. */
      var groundMode = false, gEast = null, gNorth = null, gNormal = null;
      var gYaw = 0, gPitch = 1.15, gLiftoff = null, gLiftFired = false;
      var gVelYaw = 0, gVelPitch = 0;   // flick inertia: release a drag and the gaze glides to rest
      function applyGroundLook() {
        var ch = Math.cos(gPitch), sh = Math.sin(gPitch), cy2 = Math.cos(gYaw), sy2 = Math.sin(gYaw);
        var d = new T3.Vector3()
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
        update: function () {
          if (groundMode) {   // the orbit model is suspended — only the flick inertia glides out
            if (!dragging && (Math.abs(gVelYaw) > 4e-5 || Math.abs(gVelPitch) > 4e-5)) {
              gYaw += gVelYaw;
              gPitch = Math.max(-0.10, Math.min(1.52, gPitch + gVelPitch));
              gVelYaw *= 0.90; gVelPitch *= 0.90;
              applyGroundLook();
            }
            return;
          }
          applyAngVel(angVel);
          angVel.multiplyScalar(1 - dampingFactor);
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
            else { lnNext = lnR + zoomEase * d; }
            var rNext = Math.exp(lnNext);
            if (rNext < minDistance) rNext = minDistance;
            else if (rNext > maxDistance) rNext = maxDistance;         // re-clamp the eased radius every frame
            if (Math.abs(rNext - r) > 1e-7) {
              off.normalize(); cam.position.copy(target).add(off.multiplyScalar(rNext)); safeLookAtTarget();
            }
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
          if (groundMode) {   // any pinch on the ground = lift off toward space
            if (!gLiftFired && gLiftoff) { gLiftFired = true; gLiftoff(); }
            e.stopPropagation(); return;
          }
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
    var lastTouch = 0, userMoved = false, entranceUntil = 0;
    var glide = { frames: 0, axis: null, step: 0, distTarget: 0, param: null };
    function glideActive() { return glide.frames > 0 || !!glide.param; }
    /* ===== choreographed flight (the game-camera): direction nlerp + LOG-radius =====
       Launches and landings follow an authored curve instead of a raw lerp: radius is
       interpolated in ln-space (equal time = equal RATIO — a rocket's accelerating rise,
       a lander's double-soft touchdown) while the direction arcs and the gaze pivots. */
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
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
        n: o.frames || Math.round(Math.max(150, Math.min(430, 90 + dist * 2.1))),
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
    var DEFAULT_BASE = { lat: 41.824, lon: -71.4128, city: "Providence" };   // the author's home, if the visitor can't be placed
    var baseGeo = null, groundEntered = false, tryGroundEntrance = null, groundDome = null;
    var groundDimTarget = 0, _earthUni = null;   // eased toward the target every frame in the frame loop
    /* the ground-view ATMOSPHERE: a warm band of light hugging the horizon all around
       the base — additive, baked once per landing, zero per-frame cost */
    function makeGroundDome(pos, normal) {
      removeGroundDome();
      var c = document.createElement("canvas"); c.width = 4; c.height = 256;
      var g2 = c.getContext("2d");
      var gr = g2.createLinearGradient(0, 0, 0, 256);           // canvas top row = texture v=1 = zenith
      // the band hugs the VISIBLE limb, not the level plane: at this eye height the
      // horizon dips ~14 deg (sqrt(2h/R)), so the glow sits where the planet's edge is
      gr.addColorStop(0.0, "rgba(0,0,0,0)");                    // zenith: pure night
      gr.addColorStop(0.36, "rgba(24,38,84,0.06)");             // high sky: night blue arrives
      gr.addColorStop(0.47, "rgba(38,58,120,0.14)");            // the blue hour band
      gr.addColorStop(0.512, "rgba(224,135,106,0.30)");         // warmth gathers at the edge
      gr.addColorStop(0.529, "rgba(255,208,150,0.74)");         // the horizon LINE itself burns (dip ≈5.3° at the low eye)
      gr.addColorStop(0.56, "rgba(140,82,56,0.22)");            // just below: embered land
      gr.addColorStop(0.78, "rgba(30,18,12,0.05)");             // the dark of the near ground
      gr.addColorStop(1.0, "rgba(0,0,0,0)");
      g2.fillStyle = gr; g2.fillRect(0, 0, 4, 256);
      var tex = new THREE.CanvasTexture(c);
      groundDome = new THREE.Mesh(
        new THREE.SphereGeometry(40, 32, 24),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      groundDome.name = "GroundHorizonDome";
      groundDome.position.copy(pos);
      groundDome.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      groundDome.renderOrder = 1;
      scene.add(groundDome);
    }
    function removeGroundDome() {
      if (!groundDome) return;
      scene.remove(groundDome);
      if (groundDome.material.map) groundDome.material.map.dispose();
      groundDome.material.dispose(); groundDome.geometry.dispose();
      groundDome = null;
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
      try {
        var c = JSON.parse(localStorage.getItem("cv-base") || "null");
        if (c && isFinite(c.lat) && isFinite(c.lon)) { fetchBase(); /* refresh for next visit */ return Promise.resolve(c); }
      } catch (e) {}
      return fetchBase();
    }
    var basePromise = COSMOS ? resolveBase() : Promise.resolve(null);

    if (COSMOS) {
      // the visitor wakes on the GROUND (ground entrance below); the canvas stays dark
      // until the base resolves, then the sky fades in overhead. The old deep-space dive
      // remains only as the fallback if the armature or geolocation never arrive.
      camera.position.set(HOME.x - 150, HOME.y + 116, HOME.z - 132);
      camera.lookAt(HOME);
      controls = createPremiumOrbitControls(camera, canvas, THREE);
      controls.target.copy(HOME);
      controls.setDistanceLimits(5.0, 15000);   // 5.0 floor clears the Moon (2.99); 1600 lets you pull all the way back and comfortably frame the whole system + the expanded zodiac shell (R_STAR 410, far stars ~615) in one view
      controls.setInteractionTuning({ rotateSpeed: 0.00050, dampingFactor: 0.042, zoomStepLn: 0.40, zoomRef: 100, zoomHi: 2.2, zoomEase: 0.18, maxEventDelta: 0.014 });
      canvas.style.opacity = "0.001";
      setTimeout(function () {   // fallback: never leave the visitor in the dark
        if (!groundEntered) {
          canvas.style.transition = "opacity 1s ease"; canvas.style.opacity = "1";
          entranceUntil = performance.now() + 4600;
        }
      }, 6500);
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
    // deep-field constellations + the spread embers already fill all of space, so this shell is removed entirely.
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

    import("./nye-armature.js?v=34").then(function (mod) {
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
    fetch("data/natal-sky.json?v=16").then(function (r) { return r.json(); }).then(function (natalData) {
      DOSSIER = natalData.dossier || {};
      return import("./natal-sky.js?v=97").then(function (mod) {
        natalSky = mod.buildNatalSky(THREE, scene, natalData, {
          tex: tex, vertexShader: DEEP_VERTEX_SHADER, fragmentShader: DEEP_FRAGMENT_SHADER,
          group: COSMOS ? natalRoot : deepFusion.group, R_STAR: COSMOS ? 410 : 372,
          mobile: MOBILE, calm: (TIER !== "full"),
          camera: camera, interactive: true
        });
        natalSky.applyTheme(root.getAttribute("data-theme") === "dark");
        window.__space.natal = natalSky;
        if (natalSky.onConstellationClick) natalSky.onConstellationClick(function (cid) { window.__space.focusCon(cid); });
        if (natalSky.onNodeClick) natalSky.onNodeClick(function (info) { window.__space.focusStar(info); });
        window.__space.natalStats = natalSky.stats;
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
      function updateCta(e) {
        if (!earthCta || !nyeArmature) return;
        if (controls.isGround()) {   // on the ground the SKY is the interface: everything up there is a door
          if (ctaOn) { ctaOn = false; earthCta.classList.remove("is-on"); }
          if (sunCtaOn && sunCta) { sunCtaOn = false; sunCta.classList.remove("is-on"); }
          if (!ptrDown && (ctaTick = (ctaTick + 1) % 3) === 0) {
            _ctaNdc.x = (e.clientX / innerWidth) * 2 - 1; _ctaNdc.y = -(e.clientY / innerHeight) * 2 + 1;
            _ctaRay.setFromCamera(_ctaNdc, camera);
            var gHits = _ctaRay.intersectObject(nyeArmature.group, true);
            if (natalSky && natalSky.bodyGroup) gHits = gHits.concat(_ctaRay.intersectObject(natalSky.bodyGroup, true));
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
        if ((ctaTick = (ctaTick + 1) % 3) !== 0) return;
        _ctaNdc.x = (e.clientX / innerWidth) * 2 - 1; _ctaNdc.y = -(e.clientY / innerHeight) * 2 + 1;
        _ctaRay.setFromCamera(_ctaNdc, camera);
        var hits = _ctaRay.intersectObject(nyeArmature.group, true);
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
          if (natalSky.bodyGroup) {
            var gh = _ctaRay.intersectObject(natalSky.bodyGroup, true);
            for (var gI = 0; gI < gh.length; gI++) {
              var go = gh[gI].object, gp = null;
              while (go && !gp) { gp = go.userData && go.userData.nyePick; go = go.parent; }
              if (gp === "jupiter" || gp === "saturn") { overClickable = true; break; }
            }
          }
          if (!overClickable && natalSky.dsoPicks && _ctaRay.intersectObject(natalSky.dsoPicks, true).length) overClickable = true;   // a deep-sky wonder under the hand
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
        if (on && groundCityEl) groundCityEl.textContent = (baseGeo && baseGeo.city) ? ("⌂ " + baseGeo.city) : "⌂";
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
            pitch: Math.max(1.32, Math.min(1.5, Math.asin(Math.max(-1, Math.min(1, best.dot(nrm)))) + 0.9))   // wake gazing UP near the local zenith — "lying at your base, looking up at your natal sky." A lower gaze opens onto the dark near-horizon band (empty since the 2D field was retired); the glowing horizon still rims the very bottom of frame
          };
        }
        controls.setGroundMode({
          position: sp.position, normal: sp.normal,
          yaw: (opts && opts.yaw != null) ? opts.yaw : (aim ? aim.yaw : 0.35),
          pitch: (opts && opts.pitch != null) ? opts.pitch : (aim ? aim.pitch : 1.35),
          onLiftoff: function () { ascendThen(null, 12); }
        });
        makeGroundDome(sp.position, sp.normal);   // the horizon glows all around the base
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
          frames: fn ? 210 : 290,        // ~3.5s when a flight follows, ~5s for the pure climb — nobody reaches space in two seconds
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
          frames: 260, ease: easeOutCubic, targetEase: easeInCubic, up: sp.normal,
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
        Promise.race([basePromise, new Promise(function (res) { setTimeout(function () { res(null); }, 2600); })])
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
          glide.targetTo = HOME.clone();
          glide.camTo = HOME.clone().add(hDir.multiplyScalar(name === "pillars" ? 92 : 390));
          glide.axis = null; glide.step = 0; glide.distTarget = 0;
          glide.frames = name === "pillars" ? 90 : 110;
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
      var FOCUS_MIN = { NyeSun: 9.5, NyeMoon: 2.2, NatalJupiter: 4.5, NatalSaturn: 4.5, NatalMercury: 0.9, NatalVenus: 1.6, NatalMars: 1.1, NatalUranus: 1.9, NatalNeptune: 1.8, NatalPluto: 0.5, NatalPlutoMoon: 0.35 };   // closest approach per body (must clear each surface + the near-plane)
      function glideToBody(objName, viewDist, nFrames) {
        var obj = nyeArmature.group.getObjectByName(objName);
        if (!obj && natalSky && natalSky.group) obj = natalSky.group.getObjectByName(objName);
        if (!obj) return;
        soloBody = ({ NyeSun: "sun", NyeMoon: "moon", NatalJupiter: "jupiter", NatalSaturn: "saturn", NatalMercury: "mercury", NatalVenus: "venus", NatalMars: "mars", NatalUranus: "uranus", NatalNeptune: "neptune", NatalPluto: "pluto", NatalPlutoMoon: "charon" })[objName] || soloBody;
        clearSel();
        var _bodyPick = ({ NyeSun: "sun", NyeMoon: "moon", NatalJupiter: "jupiter", NatalSaturn: "saturn", NatalMercury: "mercury", NatalVenus: "venus", NatalMars: "mars", NatalUranus: "uranus", NatalNeptune: "neptune", NatalPluto: "pluto", NatalPlutoMoon: "charon" })[objName];
        if (_bodyPick) showDossier(_bodyPick, null);   // its dossier (blank now) can be filled later
        controls.setDistanceLimits(FOCUS_MIN[objName] || 5.0, 15000);   // AFTER clearSel — clearSel resets the floor to the earth-anchored 5.0; 1600 lets you pull back from any focused body to the full-system overview
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
        if (controls) controls.setDistanceLimits(5.0, 15000);   // leaving any body-focus: the earth-anchored floor returns; 1600 keeps the full-system overview reachable
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
        if (starCta) {
          var te = info.titleEn.length > 34 ? info.titleEn.slice(0, 33) + "…" : info.titleEn;
          var tz = info.titleZh.length > 17 ? info.titleZh.slice(0, 16) + "…" : info.titleZh;
          starCta.innerHTML = '<span class="i18n-en">Open · ' + te + ' ↗</span><span class="i18n-zh">打开 · ' + tz + ' ↗</span>';
        }
        var dir = info.world.clone().normalize();
        flyTo({
          camTo: info.world.clone().sub(dir.multiplyScalar(38)),
          targetTo: info.world.clone(), lookAt: info.world.clone(),
          fovKick: 5, onDone: null
        });
        soloBody = "sky";
      }
      if (starCta) starCta.addEventListener("click", openStarDoor);
      window.__space.focusStar = focusStar;
      function focusGiant(objName, id, titleEn, titleZh, href, con) {
        var o = natalSky && natalSky.group.getObjectByName(objName); if (!o) return;
        if (con && natalSky) { natalSky.highlight(con, true); setTimeout(function () { natalSky.highlight(con, false); }, 4200); }
        focusStar({ id: id, href: href, titleEn: titleEn, titleZh: titleZh, world: o.getWorldPosition(new THREE.Vector3()) });
      }
      window.__space.focusGiant = focusGiant;
      /* a deep-sky wonder becomes the pivot: fly OUT past it along the Earth→cloud line, swung
         a little aside so the Sun and rings never crowd the frame, then orbit and zoom to admire.
         No content door — these are pure spectacle. */
      function focusDeepSky(id, shell) {
        var vd = 220, fmin = 60;
        if (shell && shell.userData) { vd = shell.userData.dsoViewDist || vd; fmin = shell.userData.dsoFocusMin || fmin; }
        var obj = (natalSky && natalSky.group.getObjectByName("DSO_" + id)) || shell;
        if (!obj) return;
        var w = obj.getWorldPosition(new THREE.Vector3());
        soloBody = (id === "galcore") ? "galcore" : "dso";   // the galactic centre keeps its galaxy; a lone nebula owns an empty frame
        clearSel();
        showDossier("dso_" + id, shell && shell.userData && shell.userData.dsoName);
        controls.setDistanceLimits(fmin, 15000);
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
          paramGlide({ camTo: gdir.multiplyScalar(128), targetTo: HOME.clone(), frames: 300, ease: easeInOutCubic, targetEase: easeOutCubic, fovKick: 5, onDone: null });
          return;
        }
        clearSel(); soloBody = null;             // the whole chart returns — rings and all
        var az = (function () { var o = camera.position.clone().sub(controls.target); return (o.x * o.x + o.z * o.z > 1e-6) ? Math.atan2(o.x, o.z) : 0.8; })();
        var el = 0.26, dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        glide.targetTo = HOME.clone();
        glide.camTo = HOME.clone().add(dir.multiplyScalar(128));
        glide.axis = null; glide.step = 0; glide.distTarget = 0; glide.frames = 90; glide.onDone = null;   // home never navigates away
      }
      window.__space.goHome = goHome;
      if (homeBtn) homeBtn.addEventListener("click", goHome);

      window.__space.uiTick = function () {
        // zoomed back out BY HAND → the chart reassembles (never mid-flight). A deep-sky wonder is
        // admired from far out (view-dist ~400), so its focus only releases when you truly pull away.
        if (soloBody && soloBody !== "dso" && soloBody !== "galcore" && !glideActive() && controls.getRadius() > 130) soloBody = null;
        if ((soloBody === "dso" || soloBody === "galcore") && !glideActive() && controls.getRadius() > 900) soloBody = null;
        // the constellations are genuine deep-field objects now — they must NOT vanish when you zoom out.
        // Keep the figures fully lit at every scale; only ease them off at the very edge of the world (past
        // all the nebulae) so the extreme long-shot doesn't clutter. (user: don't hide the zodiac on zoom.)
        if (natalSky && natalSky.setZodiacFade) natalSky.setZodiacFade((camera.position.length() - 800) / 1800);   // the busy zodiac FIGURE-LINES recede as you leave the star-chart scale (full at whole-sky ~128, faint ghosts by galaxy scale ~2600) so the galaxy + nebulae read clean; the constellation STARS stay
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
      };

      addEventListener("click", function (e) {
        if (e.target !== canvas) return;              // DOM buttons/links are none of our business
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) {
          e.stopImmediatePropagation(); e.preventDefault(); return;
        }
        if (!nyeArmature) return;
        pickNdc.x = (e.clientX / innerWidth) * 2 - 1; pickNdc.y = -(e.clientY / innerHeight) * 2 + 1;
        pickRay.setFromCamera(pickNdc, camera);
        var hits = pickRay.intersectObject(nyeArmature.group, true);
        if (natalSky && natalSky.bodyGroup) hits = hits.concat(pickRay.intersectObject(natalSky.bodyGroup, true));
        if (natalSky && natalSky.dsoPicks) hits = hits.concat(pickRay.intersectObject(natalSky.dsoPicks, true));
        if (natalSky && natalSky.conPicks) hits = hits.concat(pickRay.intersectObject(natalSky.conPicks, true));
        hits.sort(function (h1, h2) { return h1.distance - h2.distance; });
        for (var i = 0; i < hits.length; i++) {
          if (hits[i].object.name === "NyeEarthPickShell") continue;   // the oversized shell is not the globe
          var pick = null, o = hits[i].object;
          while (o && !pick) { pick = o.userData && o.userData.nyePick; o = o.parent; }
          var isDso = pick && pick.indexOf && pick.indexOf("dso_") === 0;
          var isCon = pick && pick.indexOf && pick.indexOf("con_") === 0;
          if (!isDso && !isCon && pick !== "sun" && pick !== "moon" && pick !== "earth" && pick !== "jupiter" && pick !== "saturn" && pick !== "beacon" && pick !== "mercury" && pick !== "venus" && pick !== "mars" && pick !== "uranus" && pick !== "neptune" && pick !== "pluto" && pick !== "charon") continue;   // glyphs never swallow a click
          if (pick === "beacon") {                       // the beacon is the door home
            // on the ground the camera sits INSIDE the beacon's pick bubble (and the
            // raycaster ignores visible=false) — look PAST it to the real target
            if (controls.isGround()) continue;
            glideToBase(); e.stopImmediatePropagation(); return;
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
          e.stopImmediatePropagation();
          return;
        }
      }, true);
      canvas.addEventListener("dblclick", goHome);   // double-click also returns to the whole sky (now a smooth glide)
    }

    var running = true;
    var frameNo = 0, prevSec = 0, _clk = 0, beltCentered = false;
    function frame(t) {
      if (!running) return;
      var busy = true;
      var sec = (t || 0) * 0.001;
      var dt = Math.min(0.1, Math.max(0.001, sec - prevSec)); prevSec = sec;
      frameNo++;
      if (COSMOS && controls) {
        var nowMs = performance.now();
        /* thermal guard: when the visitor rests, render at half rate — the slow
           drift is indistinguishable at 30fps, the GPU cools. Any touch, glide,
           entrance or stirred dust restores 60fps instantly. */
        var glid = glideActive() || (!userMoved && nowMs < entranceUntil);       // choreographed flight → keep it buttery at 60fps
        busy = (nowMs - lastTouch < 2500) || glid || deepFusion.uniforms.uPointerAmt.value > 0.05;
        // FRAME-RATE CAP (the big thermal lever): only choreographed flights run at 60fps. Manual orbit/zoom
        // runs at 30fps (indistinguishable for this slow scene, HALF the GPU) and at rest it idles at ~3fps
        // on a frozen scene. Any touch instantly restores 30fps; a glide restores 60.
        if (!glid) {
          if (busy) { if (frameNo & 1) { requestAnimationFrame(frame); return; } }
          else if (frameNo % 20) { requestAnimationFrame(frame); return; }
        }
        // cinematic arrival: dive from deep space and LAND on the Earth — the visitor
        // meets the home world first (its real footprint glowing on it), then rotates to
        // the starfield and pulls out to the whole orrery ("✦ Whole sky" invites it).
        if (!userMoved && nowMs < entranceUntil) {
          var r0 = controls.getRadius();
          controls.setRadius(r0 + (7.6 - r0) * 0.045);   // land close on the Earth, not the wide overview
        }
        // choreographed flight (launch / landing) — a standard glide starting takes precedence
        if (glide.param && glide.frames > 0) glide.param = null;
        if (glide.param && glide.param.flight) {
          var F = glide.param;
          F.t = Math.min(1, F.t + 1 / F.n);
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
          P.t = Math.min(1, P.t + 1 / P.n);
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
        // NO perpetual auto-rotation: at rest the world holds still (static modelling → zero wasted GPU / heat).
        // The scene only moves under the visitor's own hand or a choreographed glide. (Ground breath kept — it's
        // a deliberate, brief ambiance while lying down, and ground mode is a held, low-cost view.)
        if (controls.isGround() && !glideActive() && nowMs - lastTouch > 2500) controls.groundDrift(0.008 * dt);
        // once truly back in space, restore the normal near-plane (ground views need 0.008)
        if (camera.near < 0.1 && !controls.isGround() && !glideActive() && camera.position.length() > 9) {
          camera.near = 0.2; camera.updateProjectionMatrix();
        }
        // the horizon glow dissolves behind you as you climb
        if (groundDome && !controls.isGround()) {
          groundDome.material.opacity *= 0.94;
          if (groundDome.material.opacity < 0.02) removeGroundDome();
        }
        // the ground-night dimmer: eases the earth shader toward its target (ground=night)
        if (!_earthUni && nyeArmature) {
          var _em = nyeArmature.group.getObjectByName("NyeEarthMesh");
          if (_em && _em.material.uniforms && _em.material.uniforms.uGroundDim) _earthUni = _em.material.uniforms;
        }
        if (_earthUni) _earthUni.uGroundDim.value += (groundDimTarget - _earthUni.uGroundDim.value) * 0.035;
        // the entrance/glide owns the radius this frame → update() must NOT ease against it;
        // otherwise the wheel's log-target owns it. Recomputed every frame, so it clears cleanly.
        controls.setExternalDrive(glideActive() || (!userMoved && nowMs < entranceUntil));
        controls.update();
        if (!beltCentered && natalSky && nyeArmature) {   // one-shot: the WHOLE planetary system (planets + belt) orbits the SUN, not the Earth
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
          if (controls.isGround()) fieldEl2.style.opacity = "0.04";
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
      if (busy) _clk = sec;                     // the animation clock only advances while active → at rest the scene is frozen (no twinkle/dust/disc churn, no wasted GPU)
      // LAZY-BY-SCALE: build the heavy far structures ONLY on genuine user navigation (userMoved gates out
      // the auto-entrance + the fallback deep-space dive, which both transiently fling the camera far). The
      // ground & whole-sky view therefore never pays for the galaxy / black hole / cosmic web.
      if (userMoved) {
        var _farCl = camera.position.length();
        if (natalSky && _farCl > 350) natalSky.ensureFarLayers();      // galaxy + black hole, once you rise past the constellation sphere toward galactic scale
        if (natalSky && _farCl > 2200) natalSky.ensureCosmicWeb();      // the cosmic web, only if you truly voyage out to intergalactic distance
        // FOG DENSITY by scale: the scene keeps its near-field fog (0.0018, the "no back wall" look); at web
        // scale ease it MUCH thinner (0.000115) so the far cosmic-web foam recedes into black yet the near
        // filaments stay bright. Only fog:true materials (the web) respond — the galaxy etc. are fog:false. Ease
        // smoothly (no pop, no nulling the init fog).
        if (scene.fog) { var _fTgt = _farCl > 2200 ? 0.00006 : 0.0018; scene.fog.density += (_fTgt - scene.fog.density) * 0.08; }
        // 干支 GEAR-RINGS: solar-system-scale ornament — built ONLY when the visitor enters the orrery band
        // (never at init/ground, never at galaxy scale). The existing ringFade hides them once you pass ~900 out;
        // collectRingMats self-heals to pick up the freshly-built ring materials.
        if (nyeArmature && nyeArmature.buildRings && _farCl > 18 && _farCl < 800 && !nyeArmature.hasRings()) nyeArmature.buildRings();
        // UNLOAD the inner solar system at galaxy scale (the Sun always persists): hide Moon/atmosphere/footprint
        // and the outer planets once you leave the solar system, so nothing paints overdraw at the wrong scale.
        if (nyeArmature && nyeArmature.setInnerDetail) nyeArmature.setInnerDetail(_farCl < 400);
        if (natalSky && natalSky.bodyGroup) natalSky.bodyGroup.visible = (_farCl < 400);
      }
      deepFusion.tick(_clk);
      if (nyeArmature) nyeArmature.tick(_clk);
      if (natalSky) natalSky.tick(_clk);
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
