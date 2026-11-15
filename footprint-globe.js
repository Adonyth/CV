/* footprint-globe.js — the GPS footprint, drawn on the 3-D Earth as one fine line.

   mountFootprintGlobe(THREE, earthMesh, opts) → { trace, material, ready }
     trace     the "FootprintTrace" mesh: a sphere 0.6% larger than the Earth, child of the Earth mesh (it turns with
               it, and whatever hides the Earth mesh or the trace itself, nye-armature's setInnerDetail, hides it)
     material  its material. `material.opacity` is honoured (the ground-dim ease in space.js drives it)
     ready     Promise → the bake's metadata ({ points, groundKm, … }) once the map is on the GPU; rejects if it fails
   opts: { mobile, renderer }   mobile → the 2048 map; renderer → pixel ratio, WebGL level and the GPU's texture limit

   Nothing here touches the 738,021 raw points. scripts/blender/bake_footprint.py turns them into
     data/footprint-globe.webp (-2k.webp)   R  distance to the nearest stretch of track, G/B  where time was spent
     data/footprint-globe.json              the point count and the constants that decode R
   Everything the phone recorded is in the map; only the gaps it did not record are left out, and nothing is drawn in
   their place.
   The line is drawn from the DISTANCE, not from painted pixels: every fragment asks "how far am I from the track, in
   screen pixels?", so the stroke keeps one weight from 100,000 km down to the ground and never beads.

   Compositing. The frame is shown as rgb·alpha + background·(1−alpha). The trace only ever lies over the opaque Earth:
   it is laid OVER it (src·1 + dst·(1−a)) and leaves alpha alone, so it can be dark ink on a sunlit cloud as well as
   light on the night side. Additive light cannot do the first. */

export function mountFootprintGlobe(THREE, earthMesh, opts) {
  opts = opts || {};
  var T = THREE;
  var renderer = opts.renderer || null;
  var caps = renderer && renderer.capabilities ? renderer.capabilities : null;
  var gl2 = caps ? !!caps.isWebGL2 : (typeof WebGL2RenderingContext !== "undefined");
  var maxTex = caps && caps.maxTextureSize ? caps.maxTextureSize : 4096;
  var DATA = new URL("./data/", import.meta.url).href;
  var R0 = earthMesh.geometry.parameters.radius;
  var rr = R0 * 1.006;

  /* ---------------------------------------------------------------- the ground track ---------------------------------------------------------------- */
  var blank = new T.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, T.RGBAFormat);   // "no track anywhere, no glow"
  blank.needsUpdate = true;
  var uni = {
    uSdf: { value: blank }, uGlow: { value: blank },
    uOpacity: { value: 0.95 },
    uK: { value: 24 }, uU1: { value: 64 / 88 },          // distance decode: d = K·u/(1−u) texels, u = red·U1
    uTexLen: { value: 2 * Math.PI * rr / 8192 },          // one texel along the surface, in the mesh's own units
    uHalfPx: { value: 0.5 },                              // half the stroke, in device pixels: a one-pixel line
    uSunDir: { value: new T.Vector3(0, 0, 1) }            // world space, Earth → Sun
  };
  var mat = new T.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, fog: false,
    blending: T.CustomBlending, blendEquation: T.AddEquation,
    blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
    vertexShader: [
      "varying vec2 vUv; varying vec3 vP; varying vec3 vWn; varying vec3 vWp;",
      "void main(){",
      "  vUv = uv; vP = position;",
      "  vec4 wp = modelMatrix * vec4(position, 1.0);",
      "  vWp = wp.xyz; vWn = normalize(mat3(modelMatrix) * normal);",
      "  gl_Position = projectionMatrix * viewMatrix * wp;",
      "}"
    ].join("\n"),
    fragmentShader: [
      "precision highp float;",
      "uniform sampler2D uSdf; uniform sampler2D uGlow;",
      "uniform float uOpacity; uniform float uK; uniform float uU1; uniform float uTexLen; uniform float uHalfPx;",
      "uniform vec3 uSunDir;",
      "varying vec2 vUv; varying vec3 vP; varying vec3 vWn; varying vec3 vWp;",
      "void main(){",
      "  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);",                                  // the maps are uploaded unflipped: row 0 is north
      // distance to the track along the surface. Always read from the finest level: a distance field needs no
      // prefiltering (it cannot skip a line the way a painted one does), and averaging it would only blunt the stroke
      "  float u = texture2D(uSdf, uv, -16.0).r * uU1;",
      "  float d = uK * u / max(1.0 - u, 1e-4) * uTexLen;",
      // how much surface one screen pixel spans here: the two axes of the pixel's footprint on the sphere
      "  vec3 px = dFdx(vP), py = dFdy(vP);",
      "  float a = dot(px, px), c = dot(py, py), b = dot(px, py);",
      "  float h = sqrt(max((a - c) * (a - c) + 4.0 * b * b, 0.0));",
      "  float sMin = sqrt(max(0.5 * (a + c - h), 1e-24)), sMax = sqrt(max(0.5 * (a + c + h), 1e-24));",
      "  float s = max(sMin, 0.45 * sMax);",                                    // toward the limb the stroke foreshortens like ink on a globe, but never below ~half its weight
      "  float half_ = max(uHalfPx * s, 0.72 * uTexLen);",                      // constant on screen; held at 1.4 texels once the map itself is magnified
      "  float line = clamp((half_ - d) / s + 0.5, 0.0, 1.0);",                 // one-pixel analytic edge
      "  float core = clamp((0.36 * half_ - d) / s + 0.5, 0.0, 1.0);",          // the paler heart of the stroke
      "  float moat = clamp((half_ + 1.5 * s - d) / (2.4 * s) + 0.5, 0.0, 1.0);",   // a soft dark casing round it
      // too far out for the field to resolve a stroke (its reach is under a few pixels): let the line go, keep the glow
      "  float reach = uK * uU1 / max(1.0 - uU1, 1e-4) * uTexLen / s;",
      "  float lineK = smoothstep(2.6, 4.6, reach);",
      "  vec3 N = normalize(vWn);",
      "  float ndv = dot(N, normalize(cameraPosition - vWp));",
      "  lineK *= smoothstep(0.02, 0.20, ndv);",                                // and at the very limb, where the surface turns edge-on
      "  float day = smoothstep(-0.07, 0.20, dot(N, normalize(uSunDir)));",
      "  vec2 g = texture2D(uGlow, uv).gb;",
      "  g *= smoothstep(0.0, 0.10, ndv);",
      // The scene is linear light, tone-mapped (ACES) and bloomed above 0.86 afterwards: every colour below is linear,
      // and the brightest of them stays under the bloom threshold so a crowded place cannot blow out to white.
      // night: light. Gold with a paler heart, amber where time was spent: finer, warmer and brighter than the city lights
      // day:   ink. Deeper and more saturated, cased in shadow, because a sunlit cloud is already as bright as light gets
      "  core *= 1.0 - smoothstep(0.30, 0.85, g.x);",                           // where the strokes crowd into a patch, keep it gold: the pale heart is for a single line
      "  vec3 cLine = mix(mix(vec3(1.0, 0.50, 0.13), vec3(1.0, 0.80, 0.44), core), mix(vec3(0.46, 0.115, 0.004), vec3(0.95, 0.42, 0.035), core), day);",
      "  float aLine = line * lineK;",
      "  float aMoat = moat * lineK * mix(0.28, 0.55, day);",                   // barely there at night (it only parts the stroke from the city lights); by day it is what makes ink readable
      "  float glowA = g.x * 0.30 + g.y * 0.07;",
      "  vec3 glowNight = vec3(1.0, 0.30, 0.045) * glowA;",                     // added light
      "  float aStain = glowA * 1.1 * day;",                                    // by day the same field is a warm stain laid over the surface
      "  vec3 cStain = vec3(0.80, 0.24, 0.015);",
      // bottom → top: casing (darkens the Earth), stain / glow, the stroke. Premultiplied.
      "  vec3 rgb = vec3(0.0); float al = aMoat;",
      "  rgb = rgb * (1.0 - aStain) + cStain * aStain; al = al + aStain * (1.0 - al);",
      "  rgb += glowNight * (1.0 - day);",
      "  rgb = rgb * (1.0 - aLine) + cLine * aLine; al = al + aLine * (1.0 - al);",
      "  if (al < 0.002 && max(rgb.r, rgb.g) < 0.002) discard;",
      "  gl_FragColor = vec4(rgb * uOpacity, al * uOpacity);",
      "}"
    ].join("\n")
  });
  mat.extensions = { derivatives: true };   // WebGL1 only; built in on WebGL2
  mat.opacity = 0.95;
  if ("toneMapped" in mat) mat.toneMapped = false;

  // the same construction as the Earth's own sphere (u = (lon+180)/360, v top = north), so the track cannot drift off the continents
  var trace = new T.Mesh(new T.SphereGeometry(rr, 96, 96), mat);
  trace.name = "FootprintTrace";
  earthMesh.add(trace);

  var _root = null, _sun = null, _v = new T.Vector3(), _e = new T.Vector3();
  function sunDir(out) {
    var eu = earthMesh.material && earthMesh.material.uniforms;
    if (eu && eu.uSunDirWorld) return out.copy(eu.uSunDirWorld.value);   // exactly the light the Earth itself is drawn with
    if (!_sun) { _root = earthMesh; while (_root.parent) _root = _root.parent; _sun = _root.getObjectByName("NyeSun"); }
    if (!_sun) return out.set(0, 0, 1);
    return out.copy(_sun.getWorldPosition(_v)).sub(earthMesh.getWorldPosition(_e)).normalize();
  }
  function pixelRatio(r) { return r && r.getPixelRatio ? r.getPixelRatio() : 1; }
  trace.onBeforeRender = function (r) {
    uni.uOpacity.value = mat.opacity;
    uni.uHalfPx.value = 0.5 * Math.max(1, pixelRatio(r));
    sunDir(uni.uSunDir.value);
  };

  /* ---------------------------------------------------------------- loading ---------------------------------------------------------------- */
  function bitmap(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("footprint map " + r.status); return r.blob(); }).then(function (blob) {
      if (typeof createImageBitmap !== "function") throw new Error("no createImageBitmap");
      return createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }).catch(function () { return createImageBitmap(blob); });
    }).catch(function () {   // a browser without createImageBitmap: decode through an <img>
      return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("footprint map failed")); }; im.src = url; });
    });
  }
  function common(tx) { tx.wrapS = T.RepeatWrapping; tx.wrapT = T.ClampToEdgeWrapping; tx.flipY = false; tx.premultiplyAlpha = false; if ("colorSpace" in tx) tx.colorSpace = T.NoColorSpace || ""; return tx; }
  function useMap(img, m) {
    var sdf, glow;
    if (m.w > 2048) {
      // the big map: the distance field alone goes to the GPU, one byte a texel (33 MB, not 180 with a mip chain),
      // and the two glow fields, which are smooth, as a quarter-size copy with mips
      sdf = common(new T.Texture(img));
      sdf.format = gl2 ? T.RedFormat : T.LuminanceFormat;
      sdf.generateMipmaps = false; sdf.minFilter = T.LinearFilter; sdf.magFilter = T.LinearFilter;
      var cv = document.createElement("canvas"); cv.width = 2048; cv.height = 1024;
      var cx = cv.getContext("2d"); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; cx.drawImage(img, 0, 0, 2048, 1024);
      glow = common(new T.CanvasTexture(cv));
      sdf.onUpdate = function () { sdf.onUpdate = null; if (img.close) { try { img.close(); } catch (e) {} } };   // uploaded: free the 134 MB decode
    } else {
      sdf = glow = common(new T.Texture(img));
    }
    glow.generateMipmaps = true; glow.minFilter = T.LinearMipmapLinearFilter; glow.magFilter = T.LinearFilter; glow.anisotropy = 4;
    sdf.needsUpdate = true; glow.needsUpdate = true;
    uni.uK.value = m.k; uni.uU1.value = m.range / (m.range + m.k); uni.uTexLen.value = 2 * Math.PI * rr / m.w;
    uni.uSdf.value = sdf; uni.uGlow.value = glow;
  }
  var ready = fetch(DATA + "footprint-globe.json?v=1").then(function (r) { if (!r.ok) throw new Error("footprint meta " + r.status); return r.json(); }).then(function (meta) {
    var m = (opts.mobile || maxTex < meta.maps.full.w) ? meta.maps.small : meta.maps.full;
    return bitmap(DATA + m.src + "?v=1").then(function (img) { useMap(img, m); return meta; });
  });

  return { trace: trace, material: mat, ready: ready };
}
