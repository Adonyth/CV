#!/usr/bin/env python3
# data/updates.json -> updates.xml (RSS 2.0). Run after editing updates.json.
import json, os, html, datetime

SITE = "https://cv-2ad.pages.dev"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
U = json.load(open(os.path.join(ROOT, "data", "updates.json"), encoding="utf-8")).get("updates", [])

def rfc822(datestr):
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            d = datetime.datetime.strptime(datestr, fmt)
            return d.strftime("%a, %d %b %Y 00:00:00 +0000")
        except ValueError:
            continue
    return datetime.datetime.utcnow().strftime("%a, %d %b %Y 00:00:00 +0000")

items = []
for it in U:
    link = it.get("href", "/updates.html")
    if link.startswith("/"):
        link = SITE + link
    title = html.escape(it.get("en", ""))
    desc = html.escape((it.get("en", "") + " · " + it.get("zh", "")).strip(" ·"))
    items.append(
        "    <item>\n"
        f"      <title>{title}</title>\n"
        f"      <link>{html.escape(link)}</link>\n"
        f"      <guid isPermaLink=\"false\">{html.escape(it.get('date',''))}-{abs(hash(it.get('en','')))%99999}</guid>\n"
        f"      <pubDate>{rfc822(it.get('date',''))}</pubDate>\n"
        f"      <description>{desc}</description>\n"
        "    </item>")

xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
       '<rss version="2.0"><channel>\n'
       "  <title>Jiaxuan Chen · 陈嘉轩 — Latest</title>\n"
       f"  <link>{SITE}/updates.html</link>\n"
       "  <description>Recent preprints, talks, products, and writing.</description>\n"
       "  <language>en</language>\n"
       f"  <atom:link xmlns:atom=\"http://www.w3.org/2005/Atom\" href=\"{SITE}/updates.xml\" rel=\"self\" type=\"application/rss+xml\"/>\n"
       + "\n".join(items) + "\n</channel></rss>\n")
open(os.path.join(ROOT, "updates.xml"), "w", encoding="utf-8").write(xml)
print(f"updates.xml: {len(items)} items")
