// functions/_middleware.js — the site moved to https://jiaxuanchen.pages.dev (2026-10-13).
// Runs only on the git-connected Cloudflare Pages project `cv`. On its OLD production
// hostname every request is answered with a permanent 301 to the same path on the new
// address, so old links, bookmarks, shared cards and search results keep working.
// Branch previews (<branch>.cv-2ad.pages.dev) and any other host pass straight through.
// scripts/deploy-pages.sh strips this folder from the `jiaxuanchen` upload, so the live
// site itself never spends a Worker invocation on it.
const OLD_HOSTS = new Set(["cv-2ad.pages.dev"]);
const NEW_ORIGIN = "https://jiaxuanchen.pages.dev";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (OLD_HOSTS.has(url.hostname)) {
    return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
  }
  return context.next();
}
