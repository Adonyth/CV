// GET /api/tile?z=14&x=…&y=… — one OpenStreetMap vector tile (OpenFreeMap, OpenMapTiles schema, ODbL)
// for the base view's real streets and buildings. Fetched here at the edge so the visitor's IP never
// reaches the third party; cached at the edge for a day. Only z14 is served (not a general tile proxy).
let TEMPLATE = null, TEMPLATE_AT = 0;
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
  return new Response(r.body, {
    headers: { "content-type": "application/vnd.mapbox-vector-tile", "cache-control": "public, max-age=86400" },
  });
}
