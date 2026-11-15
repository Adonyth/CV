/* search.js — a quiet finder over the whole site. The 3-D cosmos is the hero way to browse; this is the
   fast way to FIND. Press "/" (or click the ⌕ affordance) anywhere → type → jump. Client-side, zero deps,
   loads data/works.json once. Bilingual match (EN + 中文). Invisible until summoned, so the sky stays the
   stage. */
/* LAYERS — one small stack shared by every overlay (search, All pages, Atlas, an open nav menu): Esc closes exactly
   the top layer, Tab stays inside a modal one, focus returns to the opener, <html data-modal="1"> while a modal is up.
   menu.js carries an identical copy (it boots first on the homepage); keep the two blocks the same. */
window.__layers = window.__layers || (function () {
  var stack = [];
  var SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function shown(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" &&
      !(el.closest && el.closest("[inert]"));
  }
  function focusables(root) { return Array.prototype.filter.call(root.querySelectorAll(SEL), shown); }
  function at(name) { for (var i = 0; i < stack.length; i++) if (stack[i].name === name) return i; return -1; }
  function sync() {
    var modal = false;
    for (var i = 0; i < stack.length; i++) if (stack[i].modal) modal = true;
    if (modal) document.documentElement.dataset.modal = "1"; else delete document.documentElement.dataset.modal;
  }
  function top() { return stack[stack.length - 1] || null; }
  /* o: { close: fn (required), modal: bool = true, root: element that holds focus, fallback: element to focus if the opener is gone } */
  function open(name, o) {
    var i = at(name); if (i >= 0) stack.splice(i, 1);
    stack.push({ name: name, close: o.close, modal: o.modal !== false, root: o.root || null,
                 opener: o.opener || document.activeElement, fallback: o.fallback || null });
    sync();
  }
  /* the layer reports that it has closed; restore === false leaves focus where it is */
  function closed(name, restore) {
    var i = at(name); if (i < 0) return;
    var l = stack.splice(i, 1)[0]; sync();
    if (restore === false) return;
    var t = (l.opener && l.opener !== document.body && shown(l.opener)) ? l.opener : l.fallback;
    if (t && t.focus) { try { t.focus({ preventScroll: true }); } catch (e) {} }
  }
  window.addEventListener("keydown", function (e) {
    var l = top(); if (!l) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); l.close(); return; }
    if (e.key !== "Tab" || !l.modal || !l.root) return;
    var f = focusables(l.root), a = document.activeElement;
    if (!f.length) { e.preventDefault(); return; }
    if (!l.root.contains(a)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    else if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }, true);
  return { open: open, closed: closed, top: top, isOpen: function (n) { return at(n) >= 0; }, focusables: focusables };
})();

(function () {
  "use strict";
  if (window.__searchBooted) return; window.__searchBooted = true;
  var L = window.__layers;

  // static (non-works) destinations, always searchable
  var STATIC = [
    { t: "Journey · education & path", z: "旅程 · 求学之路", h: "/journey.html", g: "page" },
    { t: "Footprint · places", z: "足迹 · 去过的地方", h: "/footprint.html", g: "page" },
    { t: "Music", z: "音乐", h: "/music.html", g: "page" },
    { t: "Latest · recent activity", z: "近况 · 近期动态", h: "/updates.html", g: "page" },
    { t: "Omytea", z: "Omytea", h: "/products/omytea.html", g: "making" },
    { t: "Swindo · golf-motion capture and calibration", z: "Swindo · 高尔夫动作采集与校准", h: "/products/swindo.html", g: "making" },
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
    var get = function () { return fetch("/data/works.json").then(function (r) { return r.json(); }); };
    loading = (window.__worksData ? window.__worksData.catch(get) : get()).then(function (j) {
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
  var EASE = "cubic-bezier(0.22,0.61,0.30,1)";
  var st = document.createElement("style");
  st.textContent = "" +
    ".sf-ov{position:fixed;inset:0;z-index:9000;display:none;align-items:flex-start;justify-content:center;" +
      "background:rgba(6,5,4,.66);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}" +
    ".sf-ov.on{display:flex;animation:sf-fade .18s " + EASE + " both}" +
    ".sf-ov.on .sf-box{animation:sf-rise .2s " + EASE + " both}" +
    "@keyframes sf-fade{from{opacity:0}}" +
    "@keyframes sf-rise{from{opacity:0;transform:translateY(-8px)}}" +
    "@media(prefers-reduced-motion:reduce){.sf-ov.on,.sf-ov.on .sf-box{animation:none}}" +
    ".sf-box{margin-top:11vh;width:min(680px,92vw);max-height:78vh;display:flex;flex-direction:column;background:#14110e;" +
      "border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;" +
      "font-family:'Newsreader','Noto Serif','Noto Serif SC',serif;color:#e9e0d2}" +
    ".sf-hd{display:flex;align-items:center;gap:4px;padding:6px 6px 6px 18px;border-bottom:1px solid rgba(255,255,255,.10);" +
      "transition:box-shadow .18s " + EASE + "}" +
    ".sf-hd:focus-within{box-shadow:inset 0 -2px 0 #e0876a}" +
    ".sf-mag{flex:none;width:20px;height:20px;color:#c9b59a}" +
    ".sf-in{flex:1;min-width:0;box-sizing:border-box;height:52px;padding:0 10px;font-size:21px;line-height:1.2;background:transparent;border:0;" +
      "color:#f4ecdf;font-family:inherit;outline:2px solid transparent}" +
    ".sf-in::placeholder{color:#a39478;opacity:1}" +
    ".sf-x{flex:none;position:relative;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:#c9b59a;" +
      "cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .16s " + EASE + ",color .16s " + EASE + ",transform .12s " + EASE + "}" +
    ".sf-x svg{width:16px;height:16px;display:block;margin:auto}" +
    ".sf-x:active{transform:scale(.97)}" +
    ".sf-x:focus-visible,.sf-row:focus-visible{outline:2px solid transparent;box-shadow:0 0 0 2px #14110e,0 0 0 4px #e0876a}" +
    ".sf-list{flex:1;min-height:0;overflow:auto;padding:6px;overscroll-behavior:contain}" +
    ".sf-g{font-family:'JetBrains Mono','Noto Sans SC','Noto Sans Symbols','Noto Sans Math',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;" +
      "color:#a39478;padding:14px 14px 6px}" +
    ".sf-row{display:flex;flex-direction:column;justify-content:center;min-height:44px;box-sizing:border-box;padding:9px 14px;border-radius:10px;" +
      "font-size:17px;line-height:1.3;text-decoration:none;color:#e9e0d2;cursor:pointer;-webkit-tap-highlight-color:transparent;" +
      "transition:background-color .14s " + EASE + ",color .14s " + EASE + "}" +
    ".sf-row .sub{display:block;font-size:12px;line-height:1.4;color:#a39478;font-family:'JetBrains Mono','Noto Sans SC','Noto Sans Symbols','Noto Sans Math',monospace;margin-top:3px}" +
    ".sf-row.sel{background:rgba(224,135,106,.16);color:#fff7ec}" +
    "@media(hover:hover){.sf-row:hover{background:rgba(255,255,255,.06)}.sf-row.sel:hover{background:rgba(224,135,106,.20)}" +
      ".sf-x:hover{background:rgba(255,255,255,.08);color:#f4ecdf}}" +
    ".sf-row:active{background:rgba(224,135,106,.24)}" +
    ".sf-empty{padding:28px 16px;color:#a39478;text-align:center;font-size:16px}" +
    ".sf-keys{flex:none;display:flex;gap:14px;justify-content:flex-end;padding:9px 14px;border-top:1px solid rgba(255,255,255,.08)}" +
    ".sf-keys span{display:inline-flex;gap:4px}" +
    ".sf-keys kbd{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;box-sizing:border-box;padding:0 6px;" +
      "border:1px solid rgba(255,255,255,.18);border-bottom-width:2px;border-radius:6px;background:rgba(255,255,255,.04);" +
      "font:500 11px/1 'JetBrains Mono','Noto Sans SC','Noto Sans Symbols','Noto Sans Math',monospace;color:#c9b59a}" +
    "@media(hover:none),(pointer:coarse){.sf-keys{display:none}}" +
    "@media(max-width:560px){.sf-box{margin-top:max(12px,env(safe-area-inset-top));width:calc(100vw - 24px);max-height:calc(100dvh - 24px)}.sf-in{font-size:18px}}";
  document.head.appendChild(st);

  var ov = document.createElement("div"); ov.className = "sf-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Search · 搜索");
  ov.innerHTML = '<div class="sf-box"><div class="sf-hd">' +
    '<svg class="sf-mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' +
    '<input class="sf-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="Search · 搜索" aria-controls="sf-list">' +   // placeholder set per-locale in open()
    '<button class="sf-x" type="button" aria-label="Close · 关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<div class="sf-list" id="sf-list"></div>' +
    // the keys that work here, as key-caps — no captions
    '<div class="sf-keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd></span><span><kbd>↵</kbd></span><span><kbd>esc</kbd></span></div></div>';
  var mounted = false;
  function mount() { if (!mounted) { document.body.appendChild(ov); mounted = true; } }

  var input = ov.querySelector(".sf-in"), listEl = ov.querySelector("#sf-list");
  var results = [], sel = 0;

  function render(q) {
    if (!items) return;
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
    var cur = listEl.querySelector(".sf-row.sel"); if (!cur) return;
    cur.scrollIntoView({ block: "nearest" });
    if (listEl.contains(document.activeElement)) cur.focus({ preventScroll: true });   // arrows carry focus along once it is in the list
  }
  function syncBtn(on) { var b = document.getElementById("searchbtn"); if (b) b.setAttribute("aria-expanded", on ? "true" : "false"); }
  function isOpen() { return ov.classList.contains("on"); }
  function open() {
    if (isOpen()) { input.focus(); return; }
    L.open("search", { close: close, root: ov, fallback: document.getElementById("searchbtn") });   // remembers what had focus
    mount(); ov.classList.add("on"); syncBtn(true); input.value = "";
    input.placeholder = isZh() ? "搜索" : "Search";
    load().then(function () { render(input.value); });
    try { input.focus({ preventScroll: true }); } catch (e) {}   // at once: a quick typist's first letters land in the box
    setTimeout(function () { if (document.activeElement !== input) input.focus(); }, 20);
  }
  function close() {
    if (!isOpen()) return;
    ov.classList.remove("on"); syncBtn(false);
    L.closed("search");   // focus returns to whatever opened the finder
  }
  // "Search is navigation" (the Galaxy-View idea): when the 3-D sky is live and the hit is a work-STAR
  // (a research/humanities page that has a real star in the scene), travel to it in-scene instead of leaving
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
    var a = document.activeElement;
    var cur = (a && a.classList && a.classList.contains("sf-row")) ? a : (listEl.querySelector(".sf-row.sel") || listEl.querySelector(".sf-row"));
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
  // Esc and the Tab loop belong to the layer stack; the list keys live here
  ov.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { sel = Math.min(results.length - 1, sel + 1); highlight(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); highlight(); }
    else if (e.key === "Enter") { if (e.target && e.target.classList && e.target.classList.contains("sf-x")) return; go(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  // a row reached with Tab becomes the selected row, so Enter and the highlight never disagree
  listEl.addEventListener("focusin", function (e) {
    var r = e.target && e.target.closest ? e.target.closest("a.sf-row") : null;
    if (r) { sel = +r.dataset.i; listEl.querySelectorAll(".sf-row").forEach(function (o) { o.classList.toggle("sel", o === r); }); }
  });
  ov.querySelector(".sf-x").addEventListener("click", close);
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });

  // global "/" opens (unless typing in a field); expose window.__openSearch for an icon button
  window.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // typed while the overlay opens but before focus arrived: carry the letter into the box instead of losing it
    var onBtn = !!(e.target && e.target.tagName === "BUTTON");   // Space must still press the close button
    if (isOpen() && e.target !== input && e.key.length === 1 && !(onBtn && e.key === " ")) {
      e.preventDefault(); input.value += e.key; input.focus(); input.dispatchEvent(new Event("input", { bubbles: true })); return;
    }
    var tag = (e.target && e.target.tagName) || "";
    if (e.target && e.target.isContentEditable) return;
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && !isOpen()) { e.preventDefault(); open(); }
  });
  (function () { var b = document.getElementById("searchbtn"); if (b) { b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("aria-expanded", "false"); } })();
  window.__openSearch = open;
})();
