/* search.js — a quiet finder over the whole site. The 3-D cosmos is the hero way to browse; this is the
   fast way to FIND. Press "/" (or click the ⌕ affordance) anywhere → type → jump. Client-side, zero deps,
   loads data/works.json once. Bilingual match (EN + 中文). Invisible until summoned, so the sky stays the
   stage. */
(function () {
  "use strict";
  if (window.__searchBooted) return; window.__searchBooted = true;

  // static (non-works) destinations, always searchable
  var STATIC = [
    { t: "Journey · education & path", z: "履历 · 求学之路", h: "/journey.html", g: "page" },
    { t: "Footprint · places", z: "足迹 · 去过的地方", h: "/footprint.html", g: "page" },
    { t: "Music", z: "音乐", h: "/music.html", g: "page" },
    { t: "Latest · recent activity", z: "近况 · 近期动态", h: "/updates.html", g: "page" },
    { t: "Omytea", z: "Omytea", h: "/products/omytea.html", g: "making" },
    { t: "Nye Clock", z: "弐时仪", h: "/products/nyeclock.html", g: "making" },
    { t: "Curriculum Vitae", z: "完整履历", h: "/cv.html", g: "cv" }
  ];
  var DIR = { research: "research", humanities: "humanities", books: "books" };
  // group labels follow the page locale (no bilingual leak in single-language mode)
  var GLABEL_EN = { research: "Research", humanities: "Humanities", books: "Books", making: "Making", page: "Pages", cv: "CV" };
  var GLABEL_ZH = { research: "研究", humanities: "人文社科", books: "著作", making: "创造", page: "页面", cv: "完整履历" };
  function isZh() { return document.documentElement.className.indexOf("locale-zh") >= 0; }

  var items = null, loading = null;
  function load() {
    if (items) return Promise.resolve(items);
    if (loading) return loading;
    loading = fetch("/data/works.json").then(function (r) { return r.json(); }).then(function (j) {
      var out = (j.works || []).map(function (w) {
        return { t: w.title.en, z: w.title.zh, h: "/" + DIR[w.cls] + "/" + w.id + ".html", g: w.cls,
                 sub: (w.status && w.status.en) || "", blob: (w.title.en + " " + w.title.zh + " " +
                   ((w.desc && w.desc.en) || []).join(" ") + " " + ((w.status && w.status.en) || "") + " " +
                   ((w.where && w.where.en) || "")).toLowerCase() };
      });
      STATIC.forEach(function (s) { s.blob = (s.t + " " + s.z).toLowerCase(); });
      items = out.concat(STATIC);
      return items;
    }).catch(function () { items = STATIC.slice(); STATIC.forEach(function (s) { s.blob = (s.t + " " + s.z).toLowerCase(); }); return items; });
    return loading;
  }

  // ---- UI ----
  var st = document.createElement("style");
  st.textContent = "" +
    ".sf-ov{position:fixed;inset:0;z-index:9000;display:none;align-items:flex-start;justify-content:center;" +
      "background:rgba(6,5,4,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}" +
    ".sf-ov.on{display:flex;animation:sf-fade .2s ease-out both}" +
    ".sf-ov.on .sf-box{animation:sf-rise .34s cubic-bezier(0.22,0.61,0.30,1) both}" +
    "@keyframes sf-fade{from{opacity:0}}" +
    "@keyframes sf-rise{from{opacity:0;transform:translateY(-8px) scale(.985)}}" +
    "@media(prefers-reduced-motion:reduce){.sf-ov.on,.sf-ov.on .sf-box{animation:none}}" +
    ".sf-box{margin-top:11vh;width:min(680px,92vw);background:rgba(20,17,14,.94);border:1px solid rgba(224,150,90,.22);" +
      "border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;font-family:'Newsreader',Georgia,serif}" +
    ".sf-in{width:100%;box-sizing:border-box;padding:20px 22px;font-size:22px;background:transparent;border:0;" +
      "color:#f4ecdf;outline:none;font-family:inherit}" +
    ".sf-in::placeholder{color:#8f8067}" +
    ".sf-hd{display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(224,150,90,.14);padding-left:8px;transition:border-color .18s ease}"+
    ".sf-hd:focus-within{border-bottom-color:rgba(224,150,90,.34)}" +
    ".sf-hd .sf-mag{color:#c9975f;font-size:20px;padding-left:14px}" +
    ".sf-list{max-height:52vh;overflow:auto;padding:6px}" +
    ".sf-g{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;" +
      "color:#9a8a6f;padding:12px 14px 5px}" +
    ".sf-row{display:block;padding:10px 14px;border-radius:9px;text-decoration:none;color:#e9e0d2;cursor:pointer;transition:background .12s ease-out}" +
    ".sf-row .z{color:#b9ab93;font-size:14px;margin-left:8px}" +
    ".sf-row .sub{display:block;font-size:12px;color:#8f8067;font-family:'JetBrains Mono',monospace;margin-top:2px}" +
    ".sf-row.sel,.sf-row:hover{background:rgba(224,150,90,.13)}" +
    ".sf-empty{padding:26px 16px;color:#8f8067;text-align:center}" +
    ".sf-hint{padding:9px 16px;border-top:1px solid rgba(224,150,90,.12);color:#8f8067;" +
      "font-family:'JetBrains Mono',monospace;font-size:11px;display:flex;gap:16px;justify-content:center}";
  document.head.appendChild(st);

  var ov = document.createElement("div"); ov.className = "sf-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Search");
  ov.innerHTML = '<div class="sf-box"><div class="sf-hd"><span class="sf-mag">⌕</span>' +
    '<input class="sf-in" type="text" autocomplete="off" spellcheck="false"></div>' +   // placeholder set per-locale in open()
    '<div class="sf-list" id="sf-list"></div>' +
    '<div class="sf-hint">' +
      '<span><span class="i18n-en">↑↓ move</span><span class="i18n-zh">↑↓ 移动</span></span>' +
      '<span><span class="i18n-en">↵ open</span><span class="i18n-zh">↵ 打开</span></span>' +
      '<span><span class="i18n-en">esc close</span><span class="i18n-zh">esc 关闭</span></span>' +
    '</div></div>';
  var mounted = false;
  function mount() { if (!mounted) { document.body.appendChild(ov); mounted = true; } }

  var input = ov.querySelector(".sf-in"), listEl = ov.querySelector("#sf-list");
  var results = [], sel = 0;

  function render(q) {
    var ql = (q || "").trim().toLowerCase();
    var matched = !ql ? items.slice() : items.filter(function (it) {
      return ql.split(/\s+/).every(function (tok) { return it.blob.indexOf(tok) >= 0; });
    });
    results = matched; sel = 0;
    if (!matched.length) { listEl.innerHTML = '<div class="sf-empty"><span class="i18n-en">No match</span><span class="i18n-zh">无结果</span></div>'; return; }
    var GL = isZh() ? GLABEL_ZH : GLABEL_EN;
    var byG = {}, order = [];
    matched.forEach(function (it) { if (!byG[it.g]) { byG[it.g] = []; order.push(it.g); } byG[it.g].push(it); });
    var html = "", idx = 0;
    order.forEach(function (g) {
      html += '<div class="sf-g">' + (GL[g] || g) + "</div>";
      byG[g].forEach(function (it) {
        // one title in the current locale — no bilingual leak (EN mode shows only English)
        html += '<a class="sf-row" data-i="' + idx + '" href="' + it.h + '">' +
          '<span class="i18n-en">' + esc(it.t) + '</span><span class="i18n-zh">' + esc(it.z || it.t) + "</span>" +
          (it.sub ? '<span class="sub">' + esc(it.sub) + "</span>" : "") + "</a>";
        it._i = idx; idx++;
      });
    });
    listEl.innerHTML = html; highlight();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function highlight() {
    var rows = listEl.querySelectorAll(".sf-row");
    rows.forEach(function (r) { r.classList.toggle("sel", +r.dataset.i === sel); });
    var cur = listEl.querySelector(".sf-row.sel"); if (cur) cur.scrollIntoView({ block: "nearest" });
  }
  var lastFocus = null;
  function syncBtn(on) { var b = document.getElementById("searchbtn"); if (b) b.setAttribute("aria-expanded", on ? "true" : "false"); }
  function open() {
    lastFocus = document.activeElement;
    mount(); ov.classList.add("on"); syncBtn(true); input.value = "";
    input.placeholder = isZh() ? "搜索研究 / 著作 / 创造…" : "Search research, writing, making…";
    load().then(function () { render(""); }); setTimeout(function () { input.focus(); }, 20);
  }
  function close() {
    ov.classList.remove("on"); syncBtn(false);
    // return focus where it came from (the modal contract its sibling Index overlay already keeps)
    var back = (lastFocus && document.contains(lastFocus)) ? lastFocus : document.getElementById("searchbtn");
    if (back && back.focus) back.focus();
  }
  // "Search is navigation" (the Galaxy-View idea): when the 3-D sky is live and the hit is a work-STAR
  // (a research/humanities page that has a real star in the scene), FLY to it in-scene instead of leaving
  // the page. Everything else — pages, books, products — navigates by URL as before. This is what makes
  // Search and the Atlas complementary rather than redundant: same destinations, two legible doors.
  function flyOrNav(href) {
    if (!href) return;
    var m = /\/(research|humanities)\/([^\/]+)\.html$/.exec(href);
    if (m && window.__space && window.__space.ready && typeof window.__space.focusStarById === "function" &&
        window.__space.focusStarById(m[2])) { close(); return; }
    location.href = href;
  }
  function go() {
    var cur = listEl.querySelector(".sf-row.sel") || listEl.querySelector(".sf-row");
    if (cur) flyOrNav(cur.getAttribute("href"));
  }
  listEl.addEventListener("click", function (e) {
    var a = e.target.closest("a.sf-row");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/\/(research|humanities)\/[^\/]+\.html$/.test(href) && window.__space && window.__space.ready &&
        typeof window.__space.focusStarById === "function") { e.preventDefault(); flyOrNav(href); }
    // else: let the <a> navigate to the page normally
  });

  input.addEventListener("input", function () { render(input.value); });
  ov.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      var f = [input].concat(Array.prototype.slice.call(listEl.querySelectorAll("a.sf-row")));
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key === "Escape") { close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); highlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); highlight(); }
    else if (e.key === "Enter") { e.preventDefault(); go(); }
  });
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });

  // global "/" opens (unless typing in a field); expose window.__openSearch for an icon button
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ov.classList.contains("on")) { close(); return; }   // Esc works even if focus left the overlay
    var tag = (e.target && e.target.tagName) || "";
    if (e.target && e.target.isContentEditable) return;
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && !ov.classList.contains("on")) { e.preventDefault(); open(); }
  });
  (function () { var b = document.getElementById("searchbtn"); if (b) { b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("aria-expanded", "false"); } })();
  window.__openSearch = open;
})();
