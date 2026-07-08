#!/usr/bin/env python3
# Inject a <noscript> content index into index.html. The site's nav is a JS 3D cosmos, so no-JS visitors
# and non-JS crawlers otherwise hit a dead end. This block is invisible to JS users (so the "sky is the
# only VISIBLE index" design holds) but gives everyone else a real link graph to every content page.
# Re-run after works.json changes. Idempotent (replaces between markers).
import json, os, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKS = json.load(open(os.path.join(ROOT, "data", "works.json"), encoding="utf-8"))["works"]
DIR = {"research": "research", "humanities": "humanities", "books": "books"}
GROUP_LABEL = {
    "research":   ("Research", "研究"),
    "humanities": ("Humanities & social science", "人文社科"),
    "books":      ("Books", "著作"),
}

def li(href, en, zh):
    return f'<li><a href="{html.escape(href)}">{html.escape(en)} · {html.escape(zh)}</a></li>'

parts = ['<noscript><div class="site-index" style="max-width:820px;margin:0 auto;padding:56px 24px;'
         'font-family:Georgia,serif;color:#e9e0d2;background:#0b0a09;line-height:1.6">',
         '<h1 style="font-weight:500">Jiaxuan Chen · 陈嘉轩</h1>',
         '<p style="color:#b9ab93">Physicist · Independent researcher. '
         'This is the text index of the site (the interactive version is a 3-D star chart).</p>']

for cls in ("research", "humanities", "books"):
    items = [w for w in WORKS if w.get("cls") == cls]
    if not items:
        continue
    en, zh = GROUP_LABEL[cls]
    parts.append(f'<h2 style="font-size:18px;margin-top:32px">{en} · {zh}</h2><ul>')
    for w in items:
        parts.append(li(f'{DIR[cls]}/{w["id"]}.html', w["title"]["en"], w["title"]["zh"]))
    parts.append('</ul>')

# products + static pages
parts.append('<h2 style="font-size:18px;margin-top:32px">Making · 创造</h2><ul>')
parts.append(li('products/omytea.html', 'Omytea', 'Omytea'))
parts.append(li('products/nyeclock.html', 'Nye Clock', '弐时仪'))
parts.append('</ul>')
parts.append('<h2 style="font-size:18px;margin-top:32px">Also · 其他</h2><ul>')
parts.append(li('updates.html', 'Latest', '近况'))
parts.append(li('journey.html', 'Journey (education & path)', '履历'))
parts.append(li('footprint.html', 'Footprint (places)', '足迹'))
parts.append(li('music.html', 'Music', '音乐'))
parts.append(li('cv.html', 'Full curriculum vitae', '完整履历'))
parts.append('</ul></div></noscript>')

block = "<!-- NOSCRIPT-INDEX-START -->\n    " + "".join(parts) + "\n    <!-- NOSCRIPT-INDEX-END -->"

idx_path = os.path.join(ROOT, "index.html")
src = open(idx_path, encoding="utf-8").read()
S, E = "<!-- NOSCRIPT-INDEX-START -->", "<!-- NOSCRIPT-INDEX-END -->"
if S in src and E in src:
    pre = src[:src.index(S)]
    post = src[src.index(E) + len(E):]
    src = pre + block + post
else:
    # insert right after <body ...>
    anchor = src.index("<body")
    close = src.index(">", anchor) + 1
    src = src[:close] + "\n    " + block + src[close:]
open(idx_path, "w", encoding="utf-8").write(src)
print(f"noscript index injected: {len([w for w in WORKS])} works + products + 4 static pages")
