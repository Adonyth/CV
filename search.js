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
    { t: "Omytea", z: "Omytea", h: "/products/omytea.html", g: "making" },
    { t: "Nye Clock", z: "弐时仪", h: "/products/nyeclock.html", g: "making" },
    { t: "Curriculum Vitae", z: "完整履历", h: "/cv.html", g: "cv" }
  ];
  var DIR = { research: "research", humanities: "humanities", books: "books" };
  var GLABEL = { research: "Research · 研究", humanities: "Humanities · 人文社科", books: "Books · 著作",
                 making: "Making · 创造", page: "Pages", cv: "CV" };

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
    ".sf-ov.on{display:flex}" +
    ".sf-box{margin-top:11vh;width:min(680px,92vw);background:rgba(20,17,14,.94);border:1px solid rgba(224,150,90,.22);" +
      "border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;font-family:'Newsreader',Georgia,serif}" +
    ".sf-in{width:100%;box-sizing:border-box;padding:20px 22px;font-size:22px;background:transparent;border:0;" +
      "color:#f4ecdf;outline:none;font-family:inherit}" +
    ".sf-in::placeholder{color:#8f8067}" +
    ".sf-hd{display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(224,150,90,.14);padding-left:8px}" +
    ".sf-hd .sf-mag{color:#c9975f;font-size:20px;padding-left:14px}" +
    ".sf-list{max-height:52vh;overflow:auto;padding:6px}" +
    ".sf-g{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;" +
      "color:#9a8a6f;padding:12px 14px 5px}" +
    ".sf-row{display:block;padding:10px 14px;border-radius:9px;text-decoration:none;color:#e9e0d2;cursor:pointer}" +
    ".sf-row .z{color:#b9ab93;font-size:14px;margin-left:8px}" +
    ".sf-row .sub{display:block;font-size:12px;color:#8f8067;font-family:'JetBrains Mono',monospace;margin-top:2px}" +
    ".sf-row.sel,.sf-row:hover{background:rgba(224,150,90,.13)}" +
    ".sf-empty{padding:26px 16px;color:#8f8067;text-align:center}" +
    ".sf-hint{padding:9px 16px;border-top:1px solid rgba(224,150,90,.12);color:#7d7059;" +
      "font-family:'JetBrains Mono',monospace;font-size:11px;display:flex;gap:16px;justify-content:center}";
  document.head.appendChild(st);

  var ov = document.createElement("div"); ov.className = "sf-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Search");
  ov.innerHTML = '<div class="sf-box"><div class="sf-hd"><span class="sf-mag">⌕</span>' +
    '<input class="sf-in" type="text" autocomplete="off" spellcheck="false" ' +
    'placeholder="Search research, writing, making… · 搜索研究 / 著作 / 创造"></div>' +
    '<div class="sf-list" id="sf-list"></div>' +
    '<div class="sf-hint"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div></div>';
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
    if (!matched.length) { listEl.innerHTML = '<div class="sf-empty">No match · 无结果</div>'; return; }
    var byG = {}, order = [];
    matched.forEach(function (it) { if (!byG[it.g]) { byG[it.g] = []; order.push(it.g); } byG[it.g].push(it); });
    var html = "", idx = 0;
    order.forEach(function (g) {
      html += '<div class="sf-g">' + (GLABEL[g] || g) + "</div>";
      byG[g].forEach(function (it) {
        html += '<a class="sf-row" data-i="' + idx + '" href="' + it.h + '"><span>' + esc(it.t) +
          '</span><span class="z">' + esc(it.z) + "</span>" + (it.sub ? '<span class="sub">' + esc(it.sub) + "</span>" : "") + "</a>";
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
  function open() { mount(); ov.classList.add("on"); input.value = ""; load().then(function () { render(""); }); setTimeout(function () { input.focus(); }, 20); }
  function close() { ov.classList.remove("on"); }
  function go() { var it = results[sel]; if (it) location.href = it.h; }

  input.addEventListener("input", function () { render(input.value); });
  ov.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); highlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); highlight(); }
    else if (e.key === "Enter") { e.preventDefault(); go(); }
  });
  ov.addEventListener("click", function (e) { if (e.target === ov) close(); });

  // global "/" opens (unless typing in a field); expose window.__openSearch for an icon button
  window.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && !ov.classList.contains("on")) { e.preventDefault(); open(); }
  });
  window.__openSearch = open;
})();
