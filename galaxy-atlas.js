(function () {
  if (window.__galaxyAtlasBooted) return;
  window.__galaxyAtlasBooted = true;

  var panel = document.getElementById("star-atlas");
  var btn = document.getElementById("atlasbtn");
  var list = document.getElementById("star-atlas-list");
  var search = document.getElementById("star-atlas-search");
  if (!panel || !btn || !list) return;

  var closeBtn = panel.querySelector(".star-atlas__close");
  var filter = "all";
  var activeId = "";
  var nodes = [];

  function isZh() { return document.documentElement.className.indexOf("locale-zh") >= 0; }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }
  function byId(id) {
    for (var i = 0; i < nodes.length; i++) if (nodes[i].id === id) return nodes[i];
    return null;
  }
  function label(n) { return isZh() ? (n.titleZh || n.titleEn || n.id) : (n.titleEn || n.titleZh || n.id); }
  function conLabel(n) { return isZh() ? (n.constellationZh || n.constellationEn || n.constellationId) : (n.constellationEn || n.constellationZh || n.constellationId); }
  function normalize(data) {
    var out = [];
    (data.constellations || []).concat(data.briefConstellations || []).forEach(function (c) {
      var cname = c.figureName || c.name || {};
      (c.dataNodes || []).forEach(function (n) {
        var title = n.title || {};
        out.push({
          id: n.id,
          href: n.href || "",
          titleEn: title.en || n.titleEn || n.id,
          titleZh: title.zh || n.titleZh || title.en || n.id,
          role: n.role || "",
          importance: (n.importance != null) ? n.importance : 0,
          constellationId: c.id || "",
          constellationEn: cname.en || c.id || "",
          constellationZh: cname.zh || cname.en || c.id || ""
        });
      });
    });
    return out;
  }
  function setOpen(on) {
    panel.hidden = !on;
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    document.body.classList.toggle("atlas-open", !!on);
    if (on && search) setTimeout(function () { search.focus({ preventScroll: true }); }, 40);
  }
  function setActive(id) {
    activeId = id || "";
    Array.prototype.forEach.call(list.querySelectorAll(".star-atlas__row"), function (row) {
      row.classList.toggle("is-active", row.getAttribute("data-node-id") === activeId);
    });
  }
  function rowHtml(n) {
    var meta = [n.role, conLabel(n)].filter(Boolean).join(" · ");
    return '<div class="star-atlas__row' + (n.id === activeId ? " is-active" : "") + '" role="listitem" data-node-id="' + esc(n.id) + '">' +
      '<button class="star-atlas__go" type="button" data-star-id="' + esc(n.id) + '">' +
      '<span class="star-atlas__title">' + esc(label(n)) + '</span>' +
      (meta ? '<span class="star-atlas__meta">' + esc(meta) + '</span>' : "") +
      '</button>' +
      (n.href ? '<a class="star-atlas__open" href="' + esc(n.href) + '" aria-label="Open ' + esc(label(n)) + '">↗</a>' : "") +
      '</div>';
  }
  function render() {
    var term = search ? search.value.trim().toLowerCase() : "";
    var rows = nodes.filter(function (n) {
      if (filter !== "all" && n.constellationId !== filter) return false;
      if (!term) return true;
      return [n.titleEn, n.titleZh, n.role, n.constellationEn, n.constellationZh].join(" ").toLowerCase().indexOf(term) >= 0;
    });
    if (!rows.length) {
      list.innerHTML = '<p class="star-atlas__empty"><span class="i18n-en">No matching stars.</span><span class="i18n-zh">没有匹配星辰。</span></p>';
      return;
    }
    var html = "", last = "";
    rows.forEach(function (n) {
      if (n.constellationId !== last) {
        last = n.constellationId;
        html += '<div class="star-atlas__section"><span>' + esc(conLabel(n)) + '</span><i>' +
          rows.filter(function (m) { return m.constellationId === n.constellationId; }).length + '</i></div>';
      }
      html += rowHtml(n);
    });
    list.innerHTML = html;
  }
  function focusStar(id) {
    var n = byId(id);
    setActive(id);
    var ok = false;
    if (window.__space && window.__space.focusStarById) ok = window.__space.focusStarById(id);
    else if (window.__space && window.__space.tour && n && n.constellationId) { window.__space.tour("star:" + n.constellationId); ok = true; }
    if (!ok) {
      window.addEventListener("space:atlas-ready", function retry() {
        if (window.__space && window.__space.focusStarById) window.__space.focusStarById(id);
      }, { once: true });
    }
    if (innerWidth < 820) setOpen(false);
  }
  function focusContext(info) {
    var card = document.getElementById("focus-card");
    if (!card || !info || !info.id) return;
    var current = byId(info.id) || info;
    var group = nodes.filter(function (n) { return n.constellationId === current.constellationId; });
    if (!group.length) return;
    var old = card.querySelector(".focus-card__atlas");
    if (old) old.remove();
    var idx = group.findIndex(function (n) { return n.id === current.id; });
    var prev = group[(idx + group.length - 1) % group.length];
    var next = group[(idx + 1) % group.length];
    var wrap = document.createElement("div");
    wrap.className = "focus-card__atlas";
    var links = "";
    if (group.length > 1 && prev && prev.id !== current.id) links += '<button type="button" data-star-id="' + esc(prev.id) + '">' + esc(label(prev)) + '</button>';
    if (group.length > 1 && next && next.id !== current.id) links += '<button type="button" data-star-id="' + esc(next.id) + '">' + esc(label(next)) + '</button>';
    wrap.innerHTML = '<div class="focus-card__atlas-k">' + esc(conLabel(current)) + ' · ' + group.length + '</div>' +
      (links ? '<div class="focus-card__atlas-links">' + links + '</div>' : "");
    card.appendChild(wrap);
  }

  btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(panel.hidden); });
  if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); });
  if (search) search.addEventListener("input", render);
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
    var tab = e.target.closest("[data-atlas-filter]");
    if (tab) {
      filter = tab.getAttribute("data-atlas-filter") || "all";
      Array.prototype.forEach.call(panel.querySelectorAll("[data-atlas-filter]"), function (b) { b.setAttribute("aria-pressed", b === tab ? "true" : "false"); });
      render();
      return;
    }
    var go = e.target.closest("[data-star-id]");
    if (go) { e.preventDefault(); focusStar(go.getAttribute("data-star-id")); }
  });
  document.addEventListener("click", function (e) {
    var go = e.target.closest(".focus-card__atlas [data-star-id]");
    if (go) { e.preventDefault(); e.stopPropagation(); focusStar(go.getAttribute("data-star-id")); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) setOpen(false); });
  window.addEventListener("space:star-focus", function (e) { setActive(e.detail && e.detail.id); focusContext(e.detail); });
  window.addEventListener("space:star-clear", function () {
    setActive("");
    var card = document.getElementById("focus-card");
    var old = card && card.querySelector(".focus-card__atlas");
    if (old) old.remove();
  });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  fetch("data/natal-sky.json?v=17").then(function (r) { return r.json(); }).then(function (data) {
    nodes = normalize(data);
    render();
  }).catch(function () {
    list.innerHTML = '<p class="star-atlas__empty"><span class="i18n-en">Atlas data unavailable.</span><span class="i18n-zh">星图数据暂不可用。</span></p>';
  });
})();
