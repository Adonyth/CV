#!/usr/bin/env python3
# Generate sitemap.xml so crawlers can reach the content pages — the site's navigation is a JS 3D
# cosmos (click a star), so WITHOUT a sitemap the 23 work pages are invisible to search engines.
# Also refreshes robots.txt to point at the sitemap. Domain is the single SITE constant below.
import os, glob, datetime, html

SITE = "https://cv-2ad.pages.dev"          # production domain — change here if a custom domain is added
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (path, priority, changefreq). Root pages first, then the one-object-one-page content.
STATIC = [
    ("index.html",     "1.0", "monthly"),
    ("cv.html",        "0.9", "monthly"),
    ("journey.html",   "0.7", "yearly"),
    ("footprint.html", "0.6", "yearly"),
    ("music.html",     "0.5", "yearly"),
]
CONTENT_DIRS = ["research", "humanities", "books", "products"]
EXCLUDE = {"nye-clock-backdrop.html", "nye-clock-bazi.html"}

def url_for(relpath):
    # pretty root; keep .html for sub-pages (that is how they are linked in-site)
    if relpath == "index.html":
        return SITE + "/"
    return SITE + "/" + relpath.replace(os.sep, "/")

def lastmod(relpath):
    p = os.path.join(ROOT, relpath)
    try:
        return datetime.date.fromtimestamp(os.path.getmtime(p)).isoformat()
    except OSError:
        return datetime.date.today().isoformat()

entries = []
for path, prio, freq in STATIC:
    if os.path.exists(os.path.join(ROOT, path)):
        entries.append((url_for(path), lastmod(path), prio, freq))
for d in CONTENT_DIRS:
    for f in sorted(glob.glob(os.path.join(ROOT, d, "*.html"))):
        base = os.path.basename(f)
        if base in EXCLUDE:
            continue
        rel = os.path.join(d, base)
        prio = "0.8" if d in ("research", "humanities", "books") else "0.75"
        entries.append((url_for(rel), lastmod(rel), prio, "monthly"))

lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, mod, prio, freq in entries:
    lines += ["  <url>",
              f"    <loc>{html.escape(loc)}</loc>",
              f"    <lastmod>{mod}</lastmod>",
              f"    <changefreq>{freq}</changefreq>",
              f"    <priority>{prio}</priority>",
              "  </url>"]
lines.append("</urlset>")
open(os.path.join(ROOT, "sitemap.xml"), "w").write("\n".join(lines) + "\n")

# robots.txt → allow all + point at the sitemap
open(os.path.join(ROOT, "robots.txt"), "w").write(
    "User-agent: *\nAllow: /\n\nSitemap: " + SITE + "/sitemap.xml\n")

print(f"sitemap.xml: {len(entries)} urls  ·  robots.txt → {SITE}/sitemap.xml")
for e in entries[:6]:
    print("  ", e[0])
print("   ...")
