/* ============================================================
   footprint.js — the raw-trace globe.
   602,733 real GPS points (2024→, US · Norway · China) plotted RAW as
   warm ember-points on a dark globe. No cities, no arcs, no stats —
   the driving routes emerge from density alone. Same warm-stone light
   as the rest of the site; its own contained WebGL canvas in the
   #footprint section (lazy-loaded on scroll, so the 4.6MB never costs
   the first paint). Drag to rotate · wheel/pinch to zoom.
   ============================================================ */
(function () {
  var THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
  var DATA_URL = "data/footprint-points.f32";
  var host = document.getElementById("footprint-globe");
  if (!host) return;

  function reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function isMobile() { try { return innerWidth < 700 || matchMedia("(pointer:coarse)").matches; } catch (e) { return innerWidth < 700; } }
  function webglOK() { try { var c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }

  var started = false;
  function boot() {
    if (started) return; started = true;
    if (!webglOK()) { host.classList.add("footprint-globe--fallback"); return; }
    host.classList.add("is-loading");
    Promise.all([
      import(THREE_URL),
      fetch(DATA_URL).then(function (r) { if (!r.ok) throw new Error("data " + r.status); return r.arrayBuffer(); })
    ]).then(function (res) { build(res[0], res[1]); })
      .catch(function (e) { host.classList.remove("is-loading"); host.classList.add("footprint-globe--fallback"); host.setAttribute("data-err", String(e)); });
  }

  // lazy: only when the section nears the viewport
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); boot(); } });
    }, { rootMargin: "300px" });
    io.observe(host);
  } else { boot(); }

  function lonLatToVec3(latDeg, lonDeg, r, out) {
    var la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180, cl = Math.cos(la);
    out[0] = r * cl * Math.cos(lo); out[1] = r * Math.sin(la); out[2] = r * cl * Math.sin(lo);
  }

  function build(THREE, buf) {
    var RG = 100;                                   // globe radius
    var mobile = isMobile();
    var raw = new Float32Array(buf);                // interleaved [lat, lon, lat, lon, ...]
    var total = (raw.length / 2) | 0;
    var stride = mobile ? 2 : 1;                    // subsample on mobile for the fill-rate
    var count = Math.ceil(total / stride);

    var pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count);
    var tmp = [0, 0, 0], j = 0;
    for (var i = 0; i < total; i += stride) {
      var lat = raw[i * 2], lon = raw[i * 2 + 1];
      if (!isFinite(lat) || !isFinite(lon)) continue;
      lonLatToVec3(lat, lon, RG * 1.002, tmp);
      var k = j * 3; pos[k] = tmp[0]; pos[k + 1] = tmp[1]; pos[k + 2] = tmp[2];
      // warm ember ramp, faint per-point jitter; density does the rest (additive)
      var h = (Math.sin((lat * 12.9898 + lon * 78.233)) * 43758.5453) % 1; h = h < 0 ? h + 1 : h;
      col[k] = 1.0; col[k + 1] = (120 + 55 * h) / 255; col[k + 2] = (66 + 40 * h) / 255;  // warm terracotta→amber
      sz[j] = 1.0 + 0.9 * h;
      j++;
    }
    count = j;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, count * 3), 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col.subarray(0, count * 3), 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sz.subarray(0, count), 1));
    geo.computeBoundingSphere();

    // shared GLOW sprite (same brushstroke as the deep embers)
    var gc = document.createElement("canvas"); gc.width = gc.height = 64;
    var gx = gc.getContext("2d"), grd = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,190,140,0.95)"); grd.addColorStop(0.4, "rgba(226,120,70,0.4)");
    grd.addColorStop(0.7, "rgba(194,93,60,0.10)"); grd.addColorStop(1, "rgba(194,93,60,0)");
    gx.fillStyle = grd; gx.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(gc);

    var VERT = [
      "attribute vec3 aColor; attribute float aSize;",
      "uniform float uPixelRatio; uniform float uMaxSize;",
      "varying vec3 vColor;",
      "void main(){",
      "  vColor=aColor;",
      "  vec4 mv=modelViewMatrix*vec4(position,1.0);",
      "  gl_PointSize=clamp(aSize*uPixelRatio*(220.0/max(40.0,-mv.z)),1.0,uMaxSize);",
      "  gl_Position=projectionMatrix*mv;",
      "}"
    ].join("\n");
    var FRAG = [
      "uniform sampler2D uMap; varying vec3 vColor;",
      "void main(){",
      "  vec4 s=texture2D(uMap,gl_PointCoord); float a=s.a*0.44;",
      "  if(a<0.01) discard;",
      "  gl_FragColor=vec4(vColor*s.rgb,a);",
      "}"
    ].join("\n");
    var ptMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uPixelRatio: { value: Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2) }, uMaxSize: { value: mobile ? 3.0 : 4.5 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    var scene = new THREE.Scene();
    var globe = new THREE.Group(); scene.add(globe);

    // dark occlusion sphere → the back-hemisphere points are hidden, so it reads as a globe not a ball
    // (a hair warmer than the page so the sphere is faintly present under the trace)
    var core = new THREE.Mesh(new THREE.SphereGeometry(RG * 0.985, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x18120c }));
    globe.add(core);
    // faint warm fresnel rim — gives the globe its edge
    var rim = new THREE.Mesh(new THREE.SphereGeometry(RG * 1.02, 64, 64), new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(0xe0876a) } },
      vertexShader: "varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uC; varying vec3 vN; varying vec3 vP; void main(){ float f=pow(1.0-max(dot(normalize(vN),normalize(cameraPosition-vP)),0.0),2.6); gl_FragColor=vec4(uC,f*0.85); }",
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
    }));
    globe.add(rim);

    var points = new THREE.Points(geo, ptMat); points.frustumCulled = false; globe.add(points);

    // orient so North America (where the trace lives) faces the camera at rest
    var usDir = [0, 0, 0]; lonLatToVec3(39, -98, 1, usDir);
    var camDist = RG * 2.6;
    var scene_cam = new THREE.PerspectiveCamera(42, 1, 0.1, 4000);

    function sizeCanvas() {
      var w = host.clientWidth || 640, h = host.clientHeight || 460;
      renderer.setSize(w, h, false); scene_cam.aspect = w / h; scene_cam.updateProjectionMatrix();
    }
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    host.classList.remove("is-loading"); host.classList.add("is-live");

    // manual orbit: yaw/pitch on the globe, dolly on wheel
    var yaw = Math.atan2(usDir[0], usDir[2]) + Math.PI, pitch = -0.32, targetYaw = yaw, targetPitch = pitch, dist = camDist, targetDist = camDist;
    var dragging = false, lx = 0, ly = 0, idle = 0;
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.addEventListener("pointerdown", function (e) { dragging = true; lx = e.clientX; ly = e.clientY; idle = 0; renderer.domElement.setPointerCapture(e.pointerId); });
    addEventListener("pointerup", function () { dragging = false; });
    addEventListener("pointermove", function (e) {
      if (!dragging) return; idle = 0;
      targetYaw -= (e.clientX - lx) * 0.006; targetPitch -= (e.clientY - ly) * 0.006;
      targetPitch = Math.max(-1.2, Math.min(1.2, targetPitch)); lx = e.clientX; ly = e.clientY;
    });
    renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); targetDist = Math.max(RG * 1.35, Math.min(RG * 5, targetDist * (1 + Math.sign(e.deltaY) * 0.08))); idle = 0; }, { passive: false });

    var ro = ("ResizeObserver" in window) ? new ResizeObserver(sizeCanvas) : null;
    if (ro) ro.observe(host); else addEventListener("resize", sizeCanvas);
    sizeCanvas();

    var still = reduced();
    var running = true, inView = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { inView = e.isIntersecting; }); }, { threshold: 0 }).observe(host);
    }
    function frame() {
      if (!running) return;
      requestAnimationFrame(frame);
      if (!inView) return;
      idle++;
      if (!dragging && !still && idle > 90) targetYaw += 0.0016;      // gentle drift after idle
      yaw += (targetYaw - yaw) * 0.08; pitch += (targetPitch - pitch) * 0.08; dist += (targetDist - dist) * 0.08;
      globe.rotation.y = yaw; globe.rotation.x = pitch;
      scene_cam.position.set(0, 0, dist); scene_cam.lookAt(0, 0, 0);
      renderer.render(scene, scene_cam);
    }
    requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", function () { if (document.hidden) running = false; else if (!running) { running = true; requestAnimationFrame(frame); } });

    window.__footprint = {
      points: count, total: total,
      setSize: function (s) { ptMat.uniforms.uMaxSize.value = s; },
      teardown: function () { running = false; try { geo.dispose(); ptMat.dispose(); tex.dispose(); renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch (e) {} }
    };
  }
})();
