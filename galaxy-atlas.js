/* galaxy-atlas.js — the Atlas panel: browse the work-stars, travel to one. The scene (space.js) decides
   what is selected (and fills the selection card); this file lists the stars, marks the current one,
   and keeps the panel a well-behaved dialog. */
(function () {
  if (window.__galaxyAtlasBooted) return;
  window.__galaxyAtlasBooted = true;

  var panel = document.getElementById("star-atlas");
  var btn = document.getElementById("atlasbtn");
  var list = document.getElementById("star-atlas-list");
  if (!panel || !btn || !list) return;

  var L = window.__layers || null;   // the shared overlay stack (menu.js / search.js)
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

  /* ---------------- the panel: a dialog that keeps the sky in view ---------------- */
  function isOpen() { return !panel.hidden; }
  function setOpen(on) {
    on = !!on;
    if (on === isOpen()) return;
    // remembers the opener; on a phone the Atlas button lives in the "More" sheet, which closes behind it — fall back to that sheet's button
    if (on && L) L.open("atlas", { close: function () { setOpen(false); }, root: panel,
                                   fallback: document.body.classList.contains("is-compact") ? (document.getElementById("morebtn") || btn) : btn });
    panel.hidden = !on;
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    document.body.classList.toggle("atlas-open", on);
    if (on) {
      setTimeout(function () {   // move focus INTO the dialog: the current star's row if there is one, else the close control
        if (!isOpen()) return;
        var cur = activeId ? list.querySelector('.star-atlas__row.is-active .star-atlas__go') : null;
        (cur || closeBtn || panel).focus({ preventScroll: !cur });
      }, 40);
    } else if (L) L.closed("atlas");   // focus returns to the opener
    else if (document.activeElement && panel.contains(document.activeElement)) btn.focus();
  }
  function setActive(id) {
    activeId = id || "";
    Array.prototype.forEach.call(list.querySelectorAll(".star-atlas__row"), function (row) {
      var on = row.getAttribute("data-node-id") === activeId;
      row.classList.toggle("is-active", on);
      var go = row.querySelector(".star-atlas__go");
      if (go) { if (on) go.setAttribute("aria-current", "true"); else go.removeAttribute("aria-current"); }
    });
  }
  function rowHtml(n) {
    var meta = [n.role, conLabel(n)].filter(Boolean).join(" · ");
    var on = n.id === activeId;
    return '<div class="star-atlas__row' + (on ? " is-active" : "") + '" role="listitem" data-node-id="' + esc(n.id) + '">' +
      '<button class="star-atlas__go" type="button" data-star-id="' + esc(n.id) + '"' + (on ? ' aria-current="true"' : "") + '>' +
      '<span class="star-atlas__title">' + esc(label(n)) + '</span>' +
      (meta ? '<span class="star-atlas__meta">' + esc(meta) + '</span>' : "") +
      '</button>' +
      (n.href ? '<a class="star-atlas__open" href="' + esc(n.href) + '" aria-label="' + (isZh() ? "打开：" : "Open: ") + esc(label(n)) + '"></a>' : "") +
      '</div>';
  }
  function countFor(key) {
    return key === "all" ? nodes.length : nodes.filter(function (n) { return n.constellationId === key; }).length;
  }
  function render() {
    Array.prototype.forEach.call(panel.querySelectorAll("[data-atlas-count]"), function (el) {
      el.textContent = nodes.length ? String(countFor(el.getAttribute("data-atlas-count"))) : "";
    });
    var rows = nodes.filter(function (n) { return filter === "all" || n.constellationId === filter; });
    if (!rows.length) {
      list.innerHTML = '<p class="star-atlas__empty"><span class="i18n-en">No stars</span><span class="i18n-zh">暂无星辰</span></p>';
      return;
    }
    var html = "", last = "";
    rows.forEach(function (n) {
      if (n.constellationId !== last) {
        last = n.constellationId;
        html += '<div class="star-atlas__section"><span>' + esc(conLabel(n)) + '</span><i>' + countFor(n.constellationId) + '</i></div>';
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

  btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(!isOpen()); });
  if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); });
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
    var tab = e.target.closest("[data-atlas-filter]");
    if (tab) {
      filter = tab.getAttribute("data-atlas-filter") || "all";
      Array.prototype.forEach.call(panel.querySelectorAll("[data-atlas-filter]"), function (b) { b.setAttribute("aria-pressed", b === tab ? "true" : "false"); });
      render(); list.scrollTop = 0;
      return;
    }
    var go = e.target.closest("[data-star-id]");
    if (go) { e.preventDefault(); focusStar(go.getAttribute("data-star-id")); }
  });
  // ↑ ↓ Home End walk the star rows (and stay out of the scene's own arrow keys)
  list.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Home" && k !== "End") return;
    var gos = Array.prototype.slice.call(list.querySelectorAll(".star-atlas__go"));
    if (!gos.length) return;
    var row = e.target.closest ? e.target.closest(".star-atlas__row") : null;
    var i = row ? gos.indexOf(row.querySelector(".star-atlas__go")) : -1;
    if (k === "Home") i = 0; else if (k === "End") i = gos.length - 1;
    else i = Math.max(0, Math.min(gos.length - 1, i + (k === "ArrowDown" ? 1 : -1)));
    e.preventDefault(); e.stopPropagation();
    gos[i].focus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
    if (e.key === "Escape" && !L && isOpen()) { setOpen(false); return; }          // (with the layer stack, Esc is handled there)
    if (e.key !== "a" && e.key !== "A") return;
    // another modal on top (search, All pages) owns the keyboard
    if (document.documentElement.dataset.modal && !(L && L.top() && L.top().name === "atlas")) return;
    e.preventDefault(); setOpen(!isOpen());
  });

  // the scene says which star is selected (space.js fills and wires the selection card itself)
  window.addEventListener("space:star-focus", function (e) { setActive(e.detail && e.detail.id); });
  window.addEventListener("space:star-clear", function () { setActive(""); });

  var _lastZh = isZh();
  new MutationObserver(function () {
    if (isZh() === _lastZh) return;            // only a real locale change warrants a re-render
    _lastZh = isZh();
    var keep = (document.activeElement && list.contains(document.activeElement) &&
                document.activeElement.closest("[data-star-id]")) ?
               document.activeElement.closest("[data-star-id]").getAttribute("data-star-id") : null;
    render();
    if (keep) { var again = list.querySelector('[data-star-id="' + keep + '"]'); if (again) again.focus(); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  fetch("data/natal-sky.json?v=20").then(function (r) { return r.json(); }).then(function (data) {
    nodes = normalize(data);
    render();
  }).catch(function () {
    list.innerHTML = '<p class="star-atlas__empty"><span class="i18n-en">Atlas unavailable</span><span class="i18n-zh">星图暂不可用</span></p>';
  });
})();
