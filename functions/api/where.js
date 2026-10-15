// GET /api/where — the visitor's approximate place, so the base view opens where they actually stand.
// City-level, from Cloudflare's own edge geolocation of this very request: first-party, no third-party
// lookup, nothing stored or logged by this function. The browser falls back to Providence if it's empty.
export function onRequestGet({ request }) {
  const cf = request.cf || {};
  const lat = parseFloat(cf.latitude), lon = parseFloat(cf.longitude);
  const body = Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat, lon, city: cf.city || "", country: cf.country || "" }
    : { lat: null, lon: null };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
}
