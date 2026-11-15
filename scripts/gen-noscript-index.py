#!/usr/bin/env python3
# Inject a <noscript> content index into index.html. The site's nav is a JS 3D cosmos, so no-JS visitors
# and non-JS crawlers otherwise hit a dead end. This block is invisible to JS users (so the "sky is the
# only VISIBLE index" design holds) but gives everyone else a real link graph to every content page.
# Re-run after works.json or the CV date changes. Idempotent (replaces between markers).
#
# Two standing rules this script must keep:
#   · no role label on the homepage — the heading is the name alone, with no self-title line under it;
#   · every work carries its period and its status, exactly as works.json states them, so the text
#     index never says more (or less) about a manuscript's stage than the work's own page does.
import json, os, html, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKS = json.load(open(os.path.join(ROOT, "data", "works.json"), encoding="utf-8"))["works"]
DIR = {"research": "research", "humanities": "humanities", "books": "books"}
GROUP_LABEL = {
    "research":   ("Research", "科学研究"),
    "humanities": ("Humanities", "人文社科"),
    "books":      ("Books", "著作"),
}
PRODUCTS = [("products/omytea.html", "Omytea"), ("products/swindo.html", "Swindo"),
            ("products/nyeclock.html", "Nye Clock")]


def cv_date():
    """The CV's own 'last updated' date (cv.html footer <time datetime>), so the two never disagree."""
    src = open(os.path.join(ROOT, "cv.html"), encoding="utf-8").read()
    m = re.search(r'Last updated: <time datetime="(\d{4}-\d{2}-\d{2})"', src)
    if not m:
        raise SystemExit("cv.html: no 'Last updated' <time datetime> found — refusing to guess a date")
    return m.group(1)


def work_li(w):
    e = html.escape
    return (f'<li><a href="{DIR[w["cls"]]}/{w["id"]}.html">{e(w["title"]["en"])} / {e(w["title"]["zh"])}</a>'
            f' — {e(w["period"])}; {e(w["status"]["en"])}</li>')


parts = ['<noscript><div class="site-index" style="max-width:820px;margin:0 auto;padding:56px 24px;'
         'font-family:Georgia,serif;color:#e9e0d2;background:#0b0a09;line-height:1.7">',
         '<h1>Jiaxuan Chen · 陈嘉轩</h1>',
         f'<p><a href="cv.html">CV / 履历</a> · <a href="cv.pdf">Detailed CV PDF / 详细简历（{cv_date()}）</a></p>']

for cls in ("research", "humanities", "books"):
    items = [w for w in WORKS if w.get("cls") == cls]
    if not items:
        continue
    en, zh = GROUP_LABEL[cls]
    parts.append(f'<h2>{en} / {zh}</h2><ul>')
    parts.extend(work_li(w) for w in items)
    parts.append('</ul>')

parts.append('<h2>Products / 产品</h2><p>'
             + ' · '.join(f'<a href="{href}">{html.escape(name)}</a>' for href, name in PRODUCTS)
             + '</p></div></noscript>')

block = "<!-- NOSCRIPT-INDEX-START -->\n    " + "".join(parts) + "\n    <!-- NOSCRIPT-INDEX-END -->"

idx_path = os.path.join(ROOT, "index.html")
src = open(idx_path, encoding="utf-8").read()
S, E = "<!-- NOSCRIPT-INDEX-START -->", "<!-- NOSCRIPT-INDEX-END -->"
if S in src and E in src:
    pre = src[:src.index(S)]
    post = src[src.index(E) + len(E):]
    out = pre + block + post
else:
    # insert right after <body ...>
    anchor = src.index("<body")
    close = src.index(">", anchor) + 1
    out = src[:close] + "\n    " + block + src[close:]
if out != src:
    open(idx_path, "w", encoding="utf-8").write(out)
print(f"noscript index {'updated' if out != src else 'already current'}: {len(WORKS)} works with period and status, "
      f"{len(PRODUCTS)} products, CV dated {cv_date()}; no role line")
