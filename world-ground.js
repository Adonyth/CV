/* world-ground.js — the base view's NEAR WORLD for wherever the visitor actually stands (build 229).
   Real OpenStreetMap data (OpenFreeMap vector tiles, OpenMapTiles schema, ODbL) for the z14 tiles around
   the base, fetched through this site's own edge function (/api/tile) so the visitor's IP never reaches a
   third party. Returns:
     b      buildings  [{ r: [e0, n0, e1, n1, …] local metres (outer ring), h: metres }]
     lamps  streetlights Float32Array [e, n, kind, …]   (kind 0 = sodium, 1 = LED)
     map    a night ground texture source (canvas): dark land, water, roads lit by the same lamps
   Everything is in local east/north metres around (lat0, lon0), clipped to radius R (default 1500 m).
   A tiny self-contained Mapbox Vector Tile decoder lives here (no dependency). */

var EARTH_R = 6371008.8, DEG = Math.PI / 180, Z = 14;

/* ---------- protobuf / MVT decoding ---------- */
function Reader(buf) { this.b = buf; this.i = 0; this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
Reader.prototype.varint = function () {
  var b = this.b, r = 0, m = 1, c;
  do { c = b[this.i++]; r += (c & 0x7f) * m; m *= 128; } while (c & 0x80);   // plain arithmetic: exact to 2^53, never sign-flips
  return r;
};
Reader.prototype.bytes = function () { var l = this.varint(), s = this.i; this.i += l; return this.b.subarray(s, s + l); };
Reader.prototype.skip = function (t) {
  if (t === 0) this.varint(); else if (t === 2) this.i += this.varint(); else if (t === 5) this.i += 4; else if (t === 1) this.i += 8;
  else throw new Error("mvt: wire type " + t);
};
var TD = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
function str(u8) { return TD ? TD.decode(u8) : String.fromCharCode.apply(null, u8); }
function packed(u8) { var r = new Reader(u8), out = []; while (r.i < u8.length) out.push(r.varint()); return out; }
function value(u8) {
  var r = new Reader(u8), v = null;
  while (r.i < u8.length) {
    var k = r.varint(), f = k >> 3, t = k & 7;
    if (f === 1) v = str(r.bytes());
    else if (f === 2) { v = r.dv.getFloat32(r.i, true); r.i += 4; }
    else if (f === 3) { v = r.dv.getFloat64(r.i, true); r.i += 8; }
    else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) { var z = r.varint(); v = (z >>> 1) ^ -(z & 1); }
    else if (f === 7) v = !!r.varint();
    else r.skip(t);
  }
  return v;
}
function decodeTile(u8, want) {
  var r = new Reader(u8), layers = {};
  while (r.i < u8.length) {
    var k = r.varint();
    if ((k >> 3) !== 3) { r.skip(k & 7); continue; }
    var lu8 = r.bytes(), lr = new Reader(lu8), name = "", feats = [], keys = [], vals = [], extent = 4096;
    while (lr.i < lu8.length) {
      var k2 = lr.varint(), f2 = k2 >> 3;
      if (f2 === 1) name = str(lr.bytes());
      else if (f2 === 2) feats.push(lr.bytes());
      else if (f2 === 3) keys.push(str(lr.bytes()));
      else if (f2 === 4) vals.push(value(lr.bytes()));
      else if (f2 === 5) extent = lr.varint();
      else lr.skip(k2 & 7);
    }
    if (want.indexOf(name) < 0) continue;
    var out = [];
    for (var fi = 0; fi < feats.length; fi++) {
      var fr = new Reader(feats[fi]), tags = null, type = 0, geom = null;
      while (fr.i < feats[fi].length) {
        var k3 = fr.varint(), f3 = k3 >> 3;
        if (f3 === 2) tags = packed(fr.bytes());
        else if (f3 === 3) type = fr.varint();
        else if (f3 === 4) geom = packed(fr.bytes());
        else fr.skip(k3 & 7);
      }
      var props = {};
      if (tags) for (var t = 0; t + 1 < tags.length; t += 2) props[keys[tags[t]]] = vals[tags[t + 1]];
      out.push({ type: type, props: props, rings: geomRings(geom || []), extent: extent });
    }
    layers[name] = out;
  }
  return layers;
}
function geomRings(g) {   // → array of rings/lines, each [x0, y0, x1, y1, …] in tile units
  var rings = [], cur = null, x = 0, y = 0, i = 0;
  while (i < g.length) {
    var c = g[i++], id = c & 7, n = c >> 3;
    if (id === 1 || id === 2) {
      for (var j = 0; j < n; j++) {
        var dx = g[i++], dy = g[i++];
        x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
        if (id === 1) { cur = [x, y]; rings.push(cur); } else if (cur) cur.push(x, y);
      }
    } else if (id === 7) { /* close: rings are implicitly closed */ }
    else break;
  }
  return rings;
}
function ringArea(r) { var a = 0, n = r.length >> 1; for (var i = 0; i < n; i++) { var j = (i + 1) % n; a += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1]; } return a / 2; }

/* ---------- geography ---------- */
function tileXY(lat, lon) {
  var n = Math.pow(2, Z), x = (lon + 180) / 360 * n, s = Math.sin(lat * DEG);
  var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x: x, y: y };
}
function hash1(a, b) { var t = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return t - Math.floor(t); }

/* fetch one z14 tile: first-party edge proxy; on a local dev server (no functions) go direct */
function fetchTile(x, y) {
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var viaEdge = fetch("/api/tile?z=" + Z + "&x=" + x + "&y=" + y).then(function (r) { if (!r.ok) throw new Error("edge " + r.status); return r.arrayBuffer(); });
  if (!local) return viaEdge;
  return viaEdge.catch(function () {
    return fetch("https://tiles.openfreemap.org/planet").then(function (r) { return r.json(); }).then(function (tj) {
      return fetch(tj.tiles[0].replace("{z}", Z).replace("{x}", x).replace("{y}", y));
    }).then(function (r) { if (!r.ok) throw new Error("tile " + r.status); return r.arrayBuffer(); });
  });
}

var ROAD_W = { motorway: 20, trunk: 17, primary: 14, secondary: 12, tertiary: 10, minor: 8, service: 4.5, track: 3, path: 0 };
var LAMP_STEP = { motorway: 46, trunk: 42, primary: 36, secondary: 34, tertiary: 32, minor: 30 };

export function loadWorldGround(lat0, lon0, opts) {
  opts = opts || {};
  var R = opts.radius || 1500, MAXB = opts.maxBuildings || 9000, MAP = opts.mapSize || 2048;
  var c = tileXY(lat0, lon0), mPerTile = 2 * Math.PI * EARTH_R * Math.cos(lat0 * DEG) / Math.pow(2, Z);
  var rt = R / mPerTile, tx0 = Math.floor(c.x - rt), tx1 = Math.floor(c.x + rt), ty0 = Math.floor(c.y - rt), ty1 = Math.floor(c.y + rt);   // exactly the tiles the disc touches (2–3 per axis)
  var jobs = [];
  for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) (function (tx, ty) {
    var timed = Promise.race([fetchTile(tx, ty), new Promise(function (res, rej) { setTimeout(function () { rej(new Error("tile timeout")); }, 120000); })]);   /* only a truly hung request: on a slow proxied link a dense tile measured ~40 s */
    jobs.push(timed.then(function (ab) { return { x: tx, y: ty, layers: decodeTile(new Uint8Array(ab), ["building", "transportation", "water"]) }; })
      .catch(function () { return null; }));
  })(tx, ty);
  var cosL = Math.cos(lat0 * DEG), kx = DEG * EARTH_R * cosL, ky = DEG * EARTH_R, n2 = Math.pow(2, Z);
  function toLocal(tx, ty, ext, px, py, out) {
    var lon = (tx + px / ext) / n2 * 360 - 180;
    var yy = Math.PI * (1 - 2 * (ty + py / ext) / n2), lat = Math.atan(0.5 * (Math.exp(yy) - Math.exp(-yy))) / DEG;
    out[0] = (lon - lon0) * kx; out[1] = (lat - lat0) * ky; return out;
  }
  return Promise.all(jobs).then(function (tiles) {
    tiles = tiles.filter(Boolean);
    if (!tiles.length) return null;
    var B = [], roads = [], water = [], tmp = [0, 0];
    tiles.forEach(function (T) {
      (T.layers.building || []).forEach(function (f) {
        if (f.type !== 3) return;
        var h = +f.props.render_height || 0;
        f.rings.forEach(function (ring) {
          if (ringArea(ring) <= 0) return;                     // exterior rings only (MVT: positive area in tile space)
          var m = ring.length >> 1, loc = new Array(m * 2), cx = 0, cy = 0;
          for (var i = 0; i < m; i++) { toLocal(T.x, T.y, f.extent, ring[i * 2], ring[i * 2 + 1], tmp); loc[i * 2] = tmp[0]; loc[i * 2 + 1] = tmp[1]; cx += tmp[0]; cy += tmp[1]; }
          cx /= m; cy /= m;
          if (cx * cx + cy * cy > R * R) return;
          var area = Math.abs(ringArea(loc));
          if (area < 12) return;
          var hh = h;
          if (!hh || hh === 10) {                              // untagged → OpenMapTiles' default 10 m: give it a plausible storey count
            var q = hash1(cx * 0.37, cy * 0.53);
            hh = 4 + 3.2 * Math.round(1 + 2.2 * q * q + Math.min(5, Math.sqrt(area) / 22) * hash1(cy, cx));
          }
          B.push({ r: loc, h: Math.max(3, hh), a: area, d2: cx * cx + cy * cy });
        });
      });
      (T.layers.transportation || []).forEach(function (f) {
        if (f.type !== 2) return;
        var cls = f.props.class, w = ROAD_W[cls];
        if (!w || f.props.brunnel === "tunnel") return;
        f.rings.forEach(function (line) {
          var m = line.length >> 1, loc = new Float32Array(m * 2), near = false;
          for (var i = 0; i < m; i++) { toLocal(T.x, T.y, f.extent, line[i * 2], line[i * 2 + 1], tmp); loc[i * 2] = tmp[0]; loc[i * 2 + 1] = tmp[1]; if (tmp[0] * tmp[0] + tmp[1] * tmp[1] < R * R * 1.1) near = true; }
          if (near) roads.push({ cls: cls, w: w, p: loc });
        });
      });
      (T.layers.water || []).forEach(function (f) {
        if (f.type !== 3) return;
        f.rings.forEach(function (ring) {
          var m = ring.length >> 1, loc = new Float32Array(m * 2);
          for (var i = 0; i < m; i++) { toLocal(T.x, T.y, f.extent, ring[i * 2], ring[i * 2 + 1], tmp); loc[i * 2] = tmp[0]; loc[i * 2 + 1] = tmp[1]; }
          water.push({ outer: ringArea(ring) > 0, p: loc });
        });
      });
    });
    if (B.length > MAXB) { B.sort(function (a, b) { return a.d2 - b.d2; }); B.length = MAXB; }   // keep the nearest
    // streetlights along the real roads: one every ~30–46 m, alternating sides; motorways/trunks LED-white
    var L = [];
    roads.forEach(function (rd, ri) {
      var step = LAMP_STEP[rd.cls]; if (!step) return;
      var led = (rd.cls === "motorway" || rd.cls === "trunk" || hash1(ri, 7.7) < 0.28) ? 1 : 0;
      var carry = hash1(ri, 3.1) * step, side = 1, p = rd.p;
      for (var i = 0; i + 3 < p.length; i += 2) {
        var ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3], dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-3) continue;
        var nx = -dy / len, ny = dx / len, off = rd.w * 0.5 + 1.2;
        for (var s = carry; s < len; s += step) {
          var e = ax + dx * s / len + nx * off * side, nn = ay + dy * s / len + ny * off * side;
          if (e * e + nn * nn < R * R) L.push(e, nn, led);
          side = -side;
        }
        carry = (carry - len) % step; if (carry < 0) carry += step;
      }
    });
    var lamps = new Float32Array(L);
    return { b: B, lamps: lamps, map: drawNightMap(MAP, R, roads, water, lamps), roads: roads.length, tiles: tiles.length };
  });
}

/* the ground under the lamps: dark land, black-blue water, asphalt that only exists where light falls on it */
function drawNightMap(S, R, roads, water, lamps) {
  if (typeof document === "undefined") return null;
  var cv = document.createElement("canvas"); cv.width = cv.height = S;
  var x = cv.getContext("2d"), k = S / (2 * R);
  function P(e, n) { return [(e + R) * k, (R - n) * k]; }
  x.fillStyle = "rgb(7,7,7)"; x.fillRect(0, 0, S, S);
  // water (even-odd so islands stay land)
  x.beginPath();
  water.forEach(function (w) { var p = w.p; for (var i = 0; i < p.length; i += 2) { var q = P(p[i], p[i + 1]); if (i === 0) x.moveTo(q[0], q[1]); else x.lineTo(q[0], q[1]); } x.closePath(); });
  x.fillStyle = "rgb(3,5,9)"; x.fill("evenodd");
  // roads: dim asphalt bands (unlit stretches stay near-black)
  x.lineCap = "round"; x.lineJoin = "round";
  roads.forEach(function (rd) {
    x.strokeStyle = rd.cls === "service" ? "rgb(14,12,10)" : "rgb(20,17,14)";
    x.lineWidth = Math.max(1, rd.w * k); x.beginPath();
    var p = rd.p; for (var i = 0; i < p.length; i += 2) { var q = P(p[i], p[i + 1]); if (i === 0) x.moveTo(q[0], q[1]); else x.lineTo(q[0], q[1]); }
    x.stroke();
  });
  // light pools under every lamp — the street exists where the light falls (additive)
  x.globalCompositeOperation = "lighter";
  var rad = Math.max(3, 15 * k);
  var gS = x.createRadialGradient(0, 0, 0, 0, 0, rad); gS.addColorStop(0, "rgba(255,160,70,0.55)"); gS.addColorStop(0.45, "rgba(200,105,40,0.18)"); gS.addColorStop(1, "rgba(120,60,20,0)");
  var gL = x.createRadialGradient(0, 0, 0, 0, 0, rad); gL.addColorStop(0, "rgba(220,226,240,0.50)"); gL.addColorStop(0.45, "rgba(150,160,185,0.16)"); gL.addColorStop(1, "rgba(80,90,110,0)");
  for (var i = 0; i < lamps.length; i += 3) {
    var q = P(lamps[i], lamps[i + 1]);
    x.save(); x.translate(q[0], q[1]); x.fillStyle = lamps[i + 2] ? gL : gS; x.fillRect(-rad, -rad, rad * 2, rad * 2); x.restore();
  }
  x.globalCompositeOperation = "source-over";
  return cv;
}
