/* footprint-data.js — one loader for the GPS footprint, shared by the globe (space.js) and the map (footprint-map.js).
   window.__loadFootprint() → Promise<Float32Array> of interleaved (lat, lon), in the order the phone recorded them.
   Fetches data/footprint-points.v1.bin.gz (≈1.6 MB: 1e-5° planar zigzag-varint deltas, gzip; scripts/build-footprint.py)
   and falls back to the float32 file (≈5.9 MB) where the browser lacks DecompressionStream or the compact file fails.
   The float32 file alone took ~17 s through a slow link — long enough for the map page to declare itself broken. */
(function () {
  "use strict";
  function decode(buf) {
    var u = new Uint8Array(buf);
    if (u[0] !== 70 || u[1] !== 80 || u[2] !== 118 || u[3] !== 49) throw new Error("footprint: bad header");
    var n = (u[4] | (u[5] << 8) | (u[6] << 16)) + u[7] * 16777216;
    var out = new Float32Array(n * 2), p = 8;
    for (var c = 0; c < 2; c++) {
      var acc = 0;
      for (var i = 0; i < n; i++) {
        var v = 0, mul = 1, b;
        do { b = u[p++]; v += (b & 127) * mul; mul *= 128; } while (b & 128);
        acc += (v % 2) ? -(v + 1) / 2 : v / 2;
        out[i * 2 + c] = acc * 1e-5;
      }
    }
    return out;
  }
  function legacy() {
    return fetch("/data/footprint-points.f32").then(function (r) {
      if (!r.ok) throw new Error("footprint " + r.status);
      return r.arrayBuffer();
    }).then(function (b) { return new Float32Array(b); });
  }
  var pending = null;
  window.__loadFootprint = function () {
    if (pending) return pending;
    if (typeof DecompressionStream !== "function") return (pending = legacy());
    pending = fetch("/data/footprint-points.v1.bin.gz").then(function (r) {
      if (!r.ok) throw new Error("footprint " + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var h = new Uint8Array(buf, 0, 2);
      if (h[0] !== 0x1f || h[1] !== 0x8b) return decode(buf);   // already inflated on the way (a Content-Encoding: gzip hop)
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer().then(decode);
    }).catch(function () { return legacy(); });
    return pending;
  };
})();
