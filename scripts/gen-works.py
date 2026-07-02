#!/usr/bin/env python3
"""gen-works.py — every work gets its own page.
Reads data/works.json → emits research/<id>.html, humanities/<id>.html,
books/<id>.html and the three index pages (research.html, humanities.html,
books.html), all in the journey.html family style. Static output, no runtime.
Run from the repo root:  python3 scripts/gen-works.py
"""
import json, pathlib, html

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.load(open(ROOT / "data" / "works.json", encoding="utf-8"))["works"]
BUILD = "build 45 · 07-02"

CLS = {
    "research":   {"dir": "research",   "index": "research.html",
                   "zh": "科学研究", "en": "Sciences",
                   "eyebrow_zh": "研究 · 科学研究", "eyebrow_en": "RESEARCH · SCIENCES",
                   "sky_zh": "摩羯座 · 主外之言", "sky_en": "Capricornus — the outward word"},
    "humanities": {"dir": "humanities", "index": "humanities.html",
                   "zh": "人文社科研究", "en": "Humanities & Social Science",
                   "eyebrow_zh": "研究 · 人文社科", "eyebrow_en": "RESEARCH · HUMANITIES",
                   "sky_zh": "双子座 · 土星所在", "sky_en": "Gemini — where Saturn stood"},
    "books":      {"dir": "books",      "index": "books.html",
                   "zh": "书籍著作", "en": "Books",
                   "eyebrow_zh": "创造 · 著作", "eyebrow_en": "CREATION · BOOKS",
                   "sky_zh": "巨蟹座 · 木星所在", "sky_en": "Cancer — where Jupiter stood"},
}

CSS = """
    :root{ --page:#0b0a09; --ink:#f4f0e8; --body:#bdb6a8; --muted:#8a8276;
           --accent:#e0876a; --gold:#e8c37a; --hairline:rgba(255,255,255,.10);
           --mono:"JetBrains Mono",ui-monospace,Menlo,monospace;
           --serif:"Newsreader",Georgia,"Songti SC",serif; }
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:var(--page); color:var(--body); font-family:var(--serif);
         -webkit-font-smoothing:antialiased; overflow-x:hidden; min-height:100vh;
         animation:pageIn .5s ease both;}
    @keyframes pageIn{from{opacity:0; transform:translateY(7px);} to{opacity:1; transform:none;}}
    @media(prefers-reduced-motion:reduce){ body{animation:none;} }
    .locale-en .i18n-zh{display:none!important;} .locale-zh .i18n-en{display:none!important;}
    a{color:inherit;text-decoration:none;}
    :focus-visible{outline:2px solid var(--accent); outline-offset:3px; border-radius:4px;}
    .chrome{position:fixed; top:18px; left:18px; right:18px; z-index:10; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; pointer-events:none;}
    .chrome > *{pointer-events:auto;}
    .backs{display:flex; gap:8px; flex-wrap:wrap;}
    .map-back{display:inline-flex; align-items:center; gap:8px; font-family:var(--mono); font-size:12.5px;
      letter-spacing:.06em; color:var(--ink); background:rgba(11,10,9,.72); border:1px solid rgba(255,255,255,.14);
      border-radius:999px; padding:11px 16px; -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px);}
    .map-back:hover{color:var(--accent); border-color:var(--accent);}
    .lang{display:inline-flex; padding:3px; border-radius:999px; border:1px solid var(--hairline);
      background:rgba(11,10,9,.72); -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); height:fit-content;}
    .lang button{border:none; background:transparent; color:var(--body); font-family:var(--mono);
      font-size:12px; padding:9px 13px; border-radius:999px; cursor:pointer; line-height:1;}
    .lang button[aria-pressed="true"]{background:var(--accent); color:#1a1109;}
    .stamp{position:fixed; right:20px; bottom:8px; z-index:10; font-family:var(--mono); font-size:10px;
      color:var(--muted); opacity:.7; pointer-events:none;}
    main{max-width:760px; margin:0 auto; padding:120px 24px 90px;}
    .eyebrow{font-family:var(--mono); font-size:11.5px; letter-spacing:.22em; color:var(--gold); text-transform:uppercase;}
    h1{font-size:clamp(26px,4.4vw,40px); font-weight:500; color:var(--ink); line-height:1.22; margin:14px 0 16px; letter-spacing:.005em;}
    .meta{font-family:var(--mono); font-size:12px; color:var(--muted); letter-spacing:.06em; line-height:2;}
    .meta b{color:var(--accent); font-weight:500;}
    .rule{height:1px; background:linear-gradient(to right, rgba(232,195,122,.4), transparent); margin:26px 0 28px;}
    .desc p{font-size:16.5px; line-height:1.78; margin-bottom:16px; max-width:64ch;}
    .locale-zh .desc p{line-height:1.9;}
    .links{margin-top:34px; display:flex; flex-wrap:wrap; gap:10px;}
    .links a{font-family:var(--mono); font-size:12.5px; letter-spacing:.05em; color:var(--ink);
      border:1px solid rgba(255,255,255,.16); border-radius:999px; padding:9px 16px;}
    .links a:hover{color:var(--accent); border-color:var(--accent);}
    .skyline{margin-top:44px; font-family:var(--mono); font-size:11px; color:var(--muted); letter-spacing:.14em; opacity:.75;}
    /* prev / next within the constellation */
    .pager{margin-top:52px; padding-top:24px; border-top:1px solid rgba(255,255,255,.08);
      display:flex; justify-content:space-between; gap:16px;}
    .pager a{flex:1 1 0; max-width:48%; text-decoration:none; color:var(--muted);
      font-family:var(--mono); font-size:11px; letter-spacing:.06em; transition:color .2s;}
    .pager a:hover{color:var(--accent);}
    .pager a.next{text-align:right;}
    .pager a .dir{opacity:.6; display:block; margin-bottom:6px;}
    .pager a .nm{font-family:var(--serif); font-size:15px; color:var(--body); line-height:1.3;}
    .pager a:hover .nm{color:var(--ink);}
    .pager a.empty{visibility:hidden;}
    /* index list */
    .lede{font-size:16px; line-height:1.75; margin:14px 0 8px; max-width:62ch;}
    .toc{margin-top:34px; display:flex; flex-direction:column;}
    .toc a{display:block; padding:20px 2px; border-bottom:1px solid rgba(255,255,255,.07);}
    .toc a:hover .t{color:var(--accent);}
    .toc .t{font-size:19px; font-weight:500; color:var(--ink); line-height:1.35; transition:color .2s;}
    .toc .m{font-family:var(--mono); font-size:11.5px; color:var(--muted); letter-spacing:.06em; margin-top:6px;}
    .toc .d{font-size:14.5px; color:var(--body); margin-top:6px; line-height:1.6; max-width:60ch;}
    /* the category's own constellation, faint behind the index */
    .config{position:fixed; top:50%; right:4%; transform:translateY(-50%);
      width:min(46vw,540px); height:min(46vw,540px); z-index:0; pointer-events:none; opacity:.5;}
    .config .cf-l line{stroke:var(--gold); stroke-width:.25; opacity:.22;}
    .config .cf-d circle{fill:var(--gold); opacity:.5;}
    main{position:relative; z-index:1;}
    @media(max-width:760px){ .config{display:none;} }
    @media(max-width:640px){ .stamp{display:none;} main{padding:104px 20px 64px;} .pager{flex-direction:column; gap:22px;} .pager a{max-width:100%;} .pager a.next{text-align:left;} }
    /* a slim footer that connects every category — no page is an island */
    .foot{max-width:760px; margin:0 auto; padding:0 24px 72px; position:relative; z-index:1;}
    .foot__rule{height:1px; background:rgba(255,255,255,.08); margin-bottom:22px;}
    .foot__nav{display:flex; flex-wrap:wrap; gap:8px 20px; align-items:baseline;}
    .foot__nav a, .foot__nav span.lbl{font-family:var(--mono); font-size:11.5px; letter-spacing:.06em; color:var(--muted);}
    .foot__nav a:hover{color:var(--accent);}
    .foot__nav .lbl{color:var(--gold); text-transform:uppercase; letter-spacing:.14em; margin-right:2px;}
    .foot__nav a.cur{color:var(--ink);}
    @media(max-width:640px){ .foot{padding:0 20px 56px;} }
"""

LANG_JS = """
    (function () {
      var root = document.documentElement;
      function apply(loc) {
        root.className = "locale-" + loc; root.lang = loc === "zh" ? "zh" : "en";
        document.getElementById("btn-en").setAttribute("aria-pressed", loc === "en" ? "true" : "false");
        document.getElementById("btn-zh").setAttribute("aria-pressed", loc === "zh" ? "true" : "false");
        try { localStorage.setItem("cv-locale", loc); } catch (e) {}
      }
      var saved = null; try { saved = localStorage.getItem("cv-locale"); } catch (e) {}
      apply(saved === "zh" ? "zh" : "en");   /* default EN, matching the home — no jarring flip */
      document.getElementById("btn-en").addEventListener("click", function () { apply("en"); });
      document.getElementById("btn-zh").addEventListener("click", function () { apply("zh"); });
    })();
"""

def bi(en, zh):
    return f'<span class="i18n-en">{en}</span><span class="i18n-zh">{zh}</span>'

# --- the category's own constellation, drawn faint behind its index (RA/Dec → SVG) ---
FIGS = {
    "research": {  # Capricornus
        "stars": [(20.3,-12.5),(20.35,-14.8),(20.77,-25.3),(20.86,-26.9),(21.44,-22.4),(21.67,-16.7),(21.78,-16.1),(21.1,-17.2),(21.37,-16.8)],
        "lines": [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,8],[8,7],[7,0]]},
    "humanities": {  # Gemini
        "stars": [(7.75,28.0),(7.58,31.9),(6.63,16.4),(6.38,22.5),(6.73,25.1),(6.75,12.9)],
        "lines": [[1,4],[4,0],[4,3],[3,5],[0,2]]},
    "books": {  # Cancer
        "stars": [(8.28,9.2),(8.74,18.1),(8.72,21.5),(8.78,28.8),(8.97,11.9)],
        "lines": [[0,1],[1,2],[2,3],[1,4]]},
}
def constellation_svg(cls):
    f = FIGS[cls]; pts = f["stars"]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, x1 = min(xs), max(xs); y0, y1 = min(ys), max(ys)
    w = max(0.5, x1 - x0); h = max(0.5, y1 - y0)
    def proj(p):                                   # RA increases eastward → flip x; fit a 100-box
        px = (1 - (p[0] - x0) / w) * 90 + 5
        py = ((p[1] - y0) / h) * 90 + 5
        return px, py
    P = [proj(p) for p in pts]
    lines = "".join(f'<line x1="{P[a][0]:.1f}" y1="{P[a][1]:.1f}" x2="{P[b][0]:.1f}" y2="{P[b][1]:.1f}"/>' for a, b in f["lines"])
    dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{1.2 if i == 0 else 0.8}"/>' for i, (x, y) in enumerate(P))
    return (f'<svg class="config" viewBox="0 0 100 100" aria-hidden="true" '
            f'preserveAspectRatio="xMidYMid meet"><g class="cf-l">{lines}</g><g class="cf-d">{dots}</g></svg>')

# --- a slim cross-category footer so no page is a dead-end (products live here too) ---
def footer_nav(depth=0, current=None):
    pre = "../" * depth
    def a(href, en, zh, key=None, ext=False):
        cur = ' cur' if key and key == current else ''
        tgt = ' target="_blank" rel="noopener"' if ext else ''
        h = href if ext else pre + href
        return f'<a class="{cur.strip()}" href="{h}"{tgt}>{bi(en, zh)}</a>'
    return (
        '<footer class="foot"><div class="foot__rule"></div><nav class="foot__nav" aria-label="More">'
        + f'<span class="lbl">{bi("Research", "研究")}</span>'
        + a("research.html", "Sciences", "科学研究", "research")
        + a("humanities.html", "Humanities", "人文社科", "humanities")
        + f'<span class="lbl">{bi("Creation", "创造")}</span>'
        + a("books.html", "Books", "著作", "books")
        + a("music.html", "Music", "音乐", "music")
        + a("https://omyteaai.com", "Omytea ↗", "Omytea ↗", ext=True)
        + a("https://nyeclock.pages.dev", "Nye Clock ↗", "弐时仪 ↗", ext=True)
        + a("journey.html", "Journey", "履历", "journey")
        + a("footprint.html", "Footprint", "足迹", "footprint")
        + a("index.html", "Orrery ↗", "星盘 ↗")
        + a("cv.html", "CV ↗", "完整履历 ↗")
        + '</nav></footer>'
    )

KEYNAV_JS = """
    /* ← / → arrow keys walk the constellation (prev / next within the category) */
    document.addEventListener("keydown", function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") { var p = document.querySelector(".pager a.prev"); if (p) location.href = p.href; }
      else if (e.key === "ArrowRight") { var n = document.querySelector(".pager a.next"); if (n) location.href = n.href; }
    });
"""

def page(title, body, depth=0, pager=False, desc=""):
    pre = "../" * depth
    keynav = KEYNAV_JS if pager else ""
    d = html.escape((desc or "Jiaxuan Chen (陈嘉轩) — physicist and independent researcher.")[:180])
    full_title = f"{title} · Jiaxuan Chen"
    return f"""<!DOCTYPE html>
<html lang="en" class="locale-en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="theme-color" content="#0b0a09" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <title>{html.escape(full_title)}</title>
  <meta name="description" content="{d}" />
  <meta name="author" content="Jiaxuan Chen (陈嘉轩)" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Jiaxuan Chen · 陈嘉轩" />
  <meta property="og:title" content="{html.escape(full_title)}" />
  <meta property="og:description" content="{d}" />
  <meta name="twitter:card" content="summary" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>{CSS}</style>
</head>
<body>
{body}
  <div class="stamp">{BUILD}</div>
  <script src="{pre}magnet.js?v=1"></script>
  <script>{LANG_JS}{keynav}</script>
</body>
</html>
"""

def chrome(backs, depth=0):
    pre = "../" * depth
    links = "".join(
        f'<a class="map-back" data-magnet href="{pre}{href}">⟵ <span>{label}</span></a>' for href, label in backs)
    return f"""  <div class="chrome">
    <div class="backs">{links}</div>
    <div class="lang" role="group" aria-label="Language">
      <button type="button" id="btn-en" aria-pressed="true">EN</button>
      <button type="button" id="btn-zh" aria-pressed="false">中文</button>
    </div>
  </div>"""

# ---------------- item pages (with prev/next within the constellation) ----------------
BY_CLS = {}
for w in DATA:
    BY_CLS.setdefault(w["cls"], []).append(w)

for cls, items in BY_CLS.items():
    c = CLS[cls]
    for i, w in enumerate(items):
        paras = "".join(
            f'<p>{bi(html.escape(e), html.escape(z))}</p>'
            for e, z in zip(w["desc"]["en"], w["desc"]["zh"]))
        links = ""
        if w["links"]:
            links = '<div class="links">' + "".join(
                f'<a href="{l["href"]}" target="_blank" rel="noopener" data-magnet>{html.escape(l["label"])}</a>'
                for l in w["links"]) + "</div>"
        prev_w = items[i - 1] if i > 0 else None
        next_w = items[i + 1] if i < len(items) - 1 else None
        def pager_link(pw, cls_name, arrow_en, arrow_zh):
            if not pw:
                return '<a class="empty" aria-hidden="true"></a>'
            return (f'<a class="{cls_name}" data-magnet href="{pw["id"]}.html">'
                    f'<span class="dir">{bi(arrow_en, arrow_zh)}</span>'
                    f'<span class="nm">{bi(html.escape(pw["title"]["en"]), html.escape(pw["title"]["zh"]))}</span></a>')
        pager = (f'<nav class="pager" aria-label="Within {c["en"]}">'
                 f'{pager_link(prev_w, "prev", "⟵ Previous", "⟵ 上一篇")}'
                 f'{pager_link(next_w, "next", "Next ⟶", "下一篇 ⟶")}</nav>')
        body = chrome([("index.html", "星盘 · Orrery"), (c["index"], bi(c["en"], c["zh"]))], depth=1) + f"""
  <main>
    <div class="eyebrow">{bi(c["eyebrow_en"], c["eyebrow_zh"])}</div>
    <h1>{bi(html.escape(w["title"]["en"]), html.escape(w["title"]["zh"]))}</h1>
    <div class="meta"><b>{html.escape(w["period"])}</b> · {bi(html.escape(w["where"]["en"]), html.escape(w["where"]["zh"]))}<br/>{bi(html.escape(w["status"]["en"]), html.escape(w["status"]["zh"]))}</div>
    <div class="rule"></div>
    <div class="desc">{paras}</div>
    {links}
    <div class="skyline">✦ {bi(c["sky_en"], c["sky_zh"])}</div>
    {pager}
  </main>
  {footer_nav(depth=1, current=cls)}"""
        out = ROOT / c["dir"] / f'{w["id"]}.html'
        out.write_text(page(w["title"]["en"], body, depth=1, pager=True, desc=w["desc"]["en"][0]), encoding="utf-8")

# ---------------- index pages ----------------
LEDE = {
    "research": ("Every topic below is a star in Capricornus — the sun-sign, the outward word. Each opens its own page.",
                 "以下每一个课题都是摩羯座中的一颗星——日座,主外之言。每一题各有其页。"),
    "humanities": ("Three studies in the sign of words, where Saturn — structure and discipline — truly stood in Gemini that night.",
                   "文字之座中的三项研究。出生当夜,主结构与纪律的土星真实驻于双子。"),
    "books": ("Two volumes under the publisher's star: Jupiter stood at opposition in Cancer the night of birth.",
              "出版之星下的两部书:出生当夜,木星在巨蟹座正值冲日。"),
}
for cls, c in CLS.items():
    items = [w for w in DATA if w["cls"] == cls]
    rows = ""
    for w in items:
        rows += f"""      <a href="{c["dir"]}/{w["id"]}.html" data-magnet>
        <h2 class="t">{bi(html.escape(w["title"]["en"]), html.escape(w["title"]["zh"]))}</h2>
        <div class="m">{html.escape(w["period"])} · {bi(html.escape(w["status"]["en"]), html.escape(w["status"]["zh"]))}</div>
        <div class="d">{bi(html.escape(w["desc"]["en"][0]), html.escape(w["desc"]["zh"][0]))}</div>
      </a>\n"""
    body = chrome([("index.html", "星盘 · Orrery")], depth=0) + constellation_svg(cls) + f"""
  <main>
    <div class="eyebrow">{bi(c["eyebrow_en"], c["eyebrow_zh"])}</div>
    <h1>{bi(c["en"], c["zh"])} <span style="font-family:var(--mono);font-size:15px;color:var(--muted);vertical-align:middle;">· {len(items)}</span></h1>
    <p class="lede">{bi(*LEDE[cls])}</p>
    <div class="toc">
{rows}    </div>
    <div class="skyline">✦ {bi(c["sky_en"], c["sky_zh"])}</div>
  </main>
  {footer_nav(depth=0, current=cls)}"""
    (ROOT / c["index"]).write_text(page(c["en"], body, depth=0, desc=LEDE[cls][0]), encoding="utf-8")

print("generated:", len(DATA), "item pages + 3 index pages")
