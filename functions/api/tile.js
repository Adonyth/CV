// GET /api/tile?z=14&x=…&y=… — one OpenStreetMap vector tile (OpenFreeMap, OpenMapTiles schema, ODbL)
// for the base view's real streets and buildings. Fetched here at the edge so the visitor's IP never
// reaches the third party; cached at the edge for a day. Only z14 is served (not a general tile proxy).
// The tile is cut down to the three layers the base view draws (building, transportation, water) —
// POIs, labels, house numbers and land cover are over half the bytes — and gzipped for the browser.
let TEMPLATE = null, TEMPLATE_AT = 0;
const KEEP = new Set(["building", "transportation", "water"]);

function varint(b, i) {
  let r = 0, m = 1, c;
  do { c = b[i++]; r += (c & 0x7f) * m; m *= 128; } while (c & 0x80);
  return [r, i];
}
function layerName(body) {
  let j = 0;
  while (j < body.length) {
    let k; [k, j] = varint(body, j);
    const f = Math.floor(k / 8), t = k % 8;
    if (t === 2) { let l; [l, j] = varint(body, j); if (f === 1) return new TextDecoder().decode(body.subarray(j, j + l)); j += l; }
    else if (t === 0) { [, j] = varint(body, j); }
    else if (t === 5) j += 4;
    else if (t === 1) j += 8;
    else return null;
  }
  return null;
}
function keepLayers(u8) {
  const parts = []; let i = 0, n = 0;
  while (i < u8.length) {
    const s = i; let k; [k, i] = varint(u8, i);
    if (k % 8 !== 2) return u8;                       // not a plain MVT: pass it through untouched
    let l; [l, i] = varint(u8, i); const e = i + l;
    if (Math.floor(k / 8) === 3 && KEEP.has(layerName(u8.subarray(i, e)))) { parts.push(u8.subarray(s, e)); n += e - s; }
    i = e;
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const z = Number(u.searchParams.get("z")), x = Number(u.searchParams.get("x")), y = Number(u.searchParams.get("y"));
  if (z !== 14 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 16384 || y >= 16384) {
    return new Response("bad tile", { status: 400 });
  }
  if (!TEMPLATE || Date.now() - TEMPLATE_AT > 6 * 3600e3) {
    const tj = await fetch("https://tiles.openfreemap.org/planet", { cf: { cacheTtl: 21600, cacheEverything: true } }).then((r) => r.json());
    TEMPLATE = tj.tiles[0]; TEMPLATE_AT = Date.now();
  }
  const r = await fetch(TEMPLATE.replace("{z}", z).replace("{x}", x).replace("{y}", y), { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
  const slim = keepLayers(new Uint8Array(await r.arrayBuffer()));
  const gz = new Response(new Blob([slim]).stream().pipeThrough(new CompressionStream("gzip")));
  return new Response(gz.body, {
    headers: {
      "content-type": "application/vnd.mapbox-vector-tile", "content-encoding": "gzip",
      "cache-control": "public, max-age=86400",
    },
    encodeBody: "manual",
  });
}
