/* menu.js — the plain-language wayfinding layer that sits OVER the living orrery,
   never inside it. Pure DOM + localStorage, with ZERO dependency on Three.js or WebGL,
   so a goal-directed visitor always reaches the work even if the 3-D scene never renders:

     (0) LAYERS — one small stack shared by every overlay on the site (search, All pages,
         Atlas, an open nav menu): Esc closes exactly the top layer, Tab stays inside a
         modal one, focus returns to whatever opened it, and <html data-modal="1"> tells
         the scene to leave its own shortcut keys alone while a modal is up.

     (1) INDEX — "All pages" reveals the already-existing #cosmos-flat list (identity +
         every work + books + products + more) as a scrim overlay ABOVE the running sky.
         On the flat tier (mobile / reduced-motion / no-WebGL) the same list IS the page.

     (2) NAV — the four content doors: click / Enter / Space / ArrowDown open a menu, arrows
         move, Esc and an outside press close, aria-expanded follows. What a leaf DOES is
         space.js's business; this file only announces what is hovered or focused
         (window "cosmos:preview") so the scene can light the matching stars.

     (3) COMPACT FRAME (phones, touch tablets, a narrow window) — the same controls, re-seated: the four
         doors become a bottom bar whose menus rise as sheets; the links, the Atlas, star dust and the
         simple view fold into one "More" sheet. Sheets close on an outside tap, the grip, Esc and Back.

     (4) RECOVERY — failed or slow scene startup exposes the real directory with a retry.
         Healthy startup opens directly in the sky; there is no first-load fork.

   The cosmos scene is untouched: everything here is DOM chrome at a high z-index. */

/* ---- (0) LAYERS. search.js carries an identical copy (it also runs on pages without menu.js);
        whichever loads first defines window.__layers — keep the two blocks the same. ---- */
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
  if (window.__menuBooted) return; window.__menuBooted = true;

  var body = document.body;
  if (!body || !body.classList.contains("cosmos")) return;   // homepage only
  var L = window.__layers;

  var MOTION_KEY = "cv-motion";      // full | calm | flat  (shared with space.js)

  /* ---- tier mirror: the same decision space.js makes, so we can tell whether the
          3-D world will actually render (and therefore whether this chrome applies) ---- */
  function stored()  { try { return localStorage.getItem(MOTION_KEY); } catch (e) { return null; } }
  function webglOK() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return false;
      if (/[?&]forcegl\b/.test(location.search)) return true;   // verification override (mirrors space.js)
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        var r = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
        if (r.indexOf("swiftshader") >= 0 || r.indexOf("llvmpipe") >= 0 || r.indexOf("software") >= 0) return false;
      }
      return true;
    } catch (e) { return false; }
  }
  /* mirrors space.js decideTier(): any device with working WebGL opens in the sky. The list is a fallback only —
     no WebGL, or the visitor's own stored choice of the simple view (cv-motion = "flat"). */
  function willFlat() { return stored() === "flat" || !webglOK(); }

  var flat = document.getElementById("cosmos-flat");
  var indexBtn = document.getElementById("indexbtn");
  var flatTier = willFlat();
  var nav = document.querySelector(".cosmos-nav");
  var navGroups = nav ? Array.prototype.slice.call(nav.querySelectorAll(".cosmos-nav__group")) : [];
  var more = null, moreBtn = null;

  /* ---- sheets (compact frame): one scrim, one history entry, one grip per sheet ----
     A sheet is either a door's menu rising from the bottom bar or the "More" sheet. While any is up:
       · a scrim takes the outside tap (and keeps the stray drag off the sky);
       · ONE history entry stands for "a sheet is open", so the system Back gesture closes it — the same
         contract the All-pages overlay keeps with its #index entry;
       · the grip closes on a tap or a downward drag. */
  var sheets = (function () {
    var scrim = document.createElement("div"); scrim.className = "frame-scrim no-print"; scrim.setAttribute("aria-hidden", "true");
    body.appendChild(scrim);
    var held = false;   // we own a history entry
    function anyOpen() { return body.classList.contains("is-compact") && (!!openGroup() || moreOpen()); }
    function sync() {
      var on = anyOpen();
      body.classList.toggle("sheet-open", on);
      body.classList.toggle("sheet-nav", on && !!openGroup());
      if (on && !held) { try { history.pushState({ cvSheet: 1 }, ""); held = true; } catch (e) {} }
      else if (!on && held) { held = false; if (history.state && history.state.cvSheet) { try { history.back(); } catch (e) {} } }
    }
    scrim.addEventListener("click", function () { closeNav(); closeMore(); });
    window.addEventListener("popstate", function () {
      if (held && !(history.state && history.state.cvSheet)) { held = false; closeNav(); closeMore(); }
    });
    function grip(sheet, close) {
      if (!sheet) return;
      var g = document.createElement("div"); g.className = "frame-grip"; g.setAttribute("aria-hidden", "true");
      sheet.insertBefore(g, sheet.firstChild);
      var y0 = null, dy = 0;
      function rest() { y0 = null; sheet.style.transition = ""; sheet.style.transform = ""; }
      g.addEventListener("pointerdown", function (e) { y0 = e.clientY; dy = 0; try { g.setPointerCapture(e.pointerId); } catch (x) {} sheet.style.transition = "none"; });
      g.addEventListener("pointermove", function (e) { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = "translateY(" + dy + "px)"; });
      g.addEventListener("pointerup", function () { if (y0 === null) return; var d = dy; rest(); if (d > 48 || d < 5) close(); });
      g.addEventListener("pointercancel", rest);
    }
    return {
      sync: sync, grip: grip,
      handOver: function () { var h = held; held = false; return h; },                      // the entry now belongs to someone else (the All-pages overlay)
      abandon: function () { if (held) { held = false; try { history.replaceState(null, ""); } catch (e) {} } }   // the page is about to leave: the entry stays, unmarked
    };
  })();
  // 2026-10-08: the actual content belongs to this DOM layer even if space.js never boots.
  if (flatTier && flat) {
    body.classList.add("is-flat");
    flat.hidden = false;
    var enter = document.getElementById("flat-enter3d");
    if (enter) {
      if (!webglOK()) enter.hidden = true;                       // no way into the sky on this device: no control that promises one
      else enter.addEventListener("click", function (e) {         // the visitor is in the simple view by choice: undo the choice
        e.stopImmediatePropagation();
        if (window.__space && typeof window.__space.setSimpleView === "function") { window.__space.setSimpleView(false); return; }
        try { if (localStorage.getItem(MOTION_KEY) === "flat") localStorage.removeItem(MOTION_KEY); } catch (err) {}
        location.reload();
      });
    }
  }

  /* ---- counts are numerals read from the data, never typed into the page ----
     nav leaves: data/works.json (one fetch, shared with search.js through window.__worksData);
     list group heads: the rows actually standing under each head. */
  (function () {
    if (flat) Array.prototype.forEach.call(flat.querySelectorAll(".flat-group"), function (g) {
      var out = g.querySelector(".flat-count"); if (!out) return;
      var n = 0, el = g.nextElementSibling;
      while (el && !el.classList.contains("flat-group")) { if (el.tagName === "A") n++; el = el.nextElementSibling; }
      out.textContent = String(n);
    });
    var slots = document.querySelectorAll("[data-count]");
    if (!slots.length || !window.fetch) return;
    window.__worksData = window.__worksData || fetch("/data/works.json").then(function (r) { return r.json(); });
    window.__worksData.then(function (j) {
      var by = {};
      (j.works || []).forEach(function (w) { by[w.cls] = (by[w.cls] || 0) + 1; });
      Array.prototype.forEach.call(slots, function (el) {
        var n = 0;
        (el.getAttribute("data-count") || "").split("+").forEach(function (k) { n += by[k] || 0; });
        el.textContent = n ? String(n) : "";
      });
    }).catch(function () {});   // no data → the numeral slot stays empty and collapses
  })();

  /* ---------------- (1) INDEX overlay (a real modal) ---------------- */
  // the floating orrery chrome behind the scrim — made inert (unfocusable + hidden from
  // assistive tech) while the modal index is up, so keyboard/SR users can't drive the
  // invisible controls behind it
  var BG_CHROME = ".cosmos-id,.cosmos-ui,.cosmos-nav,.cosmos-dock,.cosmos-rail,#focus-card";
  function indexOpen() { return body.classList.contains("index-open"); }
  function setBgInert(on) {
    var els = document.querySelectorAll(BG_CHROME);
    for (var i = 0; i < els.length; i++) {
      if (on) { try { els[i].inert = true; } catch (e) {} els[i].setAttribute("aria-hidden", "true"); }
      else { try { els[i].inert = false; } catch (e) {} els[i].removeAttribute("aria-hidden"); }
    }
  }

  function openIndex(groupKey) {
    if (body.classList.contains("is-flat")) { if (groupKey) scrollToGroup(groupKey); return; }
    if (!flat || indexOpen()) { if (groupKey) scrollToGroup(groupKey); return; }
    var handed = sheets.handOver();           // an open sheet's history entry becomes the overlay's (a pop here would land under it)
    closeNav(); closeMore();
    L.open("index", { close: closeIndex, root: flat, fallback: indexBtn });   // records the opener before the chrome goes inert
    flat.hidden = false;                       // clears .cosmos-flat[hidden]{display:none}
    // dialog semantics applied only in overlay mode (the same element is the flat-tier page)
    flat.setAttribute("role", "dialog");
    flat.setAttribute("aria-modal", "true");
    flat.setAttribute("aria-label", "All pages · 全部页面");
    body.classList.add("index-open");
    setBgInert(true);
    if (indexBtn) indexBtn.setAttribute("aria-expanded", "true");
    flat.scrollTop = 0;
    // reflect the open index in the URL and add ONE history entry, so the browser Back
    // button (and Esc) return to the sky instead of leaving the page. Purely address-bar
    // + DOM history — no scene state is encoded and the camera is never driven from a hash.
    if (location.hash.indexOf("#index") !== 0) {
      try { if (handed) history.replaceState({ cvIndex: 1 }, "", "#index"); else history.pushState({ cvIndex: 1 }, "", "#index"); } catch (e) {}
    }
    if (groupKey) scrollToGroup(groupKey);
    // focus the close button so keyboard/SR users land inside the dialog
    var cx = flat.querySelector(".flat-close");
    setTimeout(function () { if (cx && indexOpen()) cx.focus({ preventScroll: true }); }, 20);
  }
  function closeIndex(fromPop) {
    if (body.classList.contains("is-flat")) return;
    if (!flat || !indexOpen()) return;
    body.classList.remove("index-open");
    flat.hidden = true;                        // restore the hidden fallback state
    flat.removeAttribute("role"); flat.removeAttribute("aria-modal"); flat.removeAttribute("aria-label");
    setBgInert(false);                         // un-hide the chrome BEFORE returning focus into it
    if (indexBtn) { indexBtn.setAttribute("aria-expanded", "false"); }
    L.closed("index");                         // focus goes back to the opener (or the All pages button)
    // clean the #index hash unless this close WAS the popstate that already moved history
    if (fromPop !== true && location.hash === "#index") { try { history.back(); } catch (e) {} }
  }
  // Back / Forward closes the overlay (the pushed #index entry pops here)
  window.addEventListener("popstate", function () { if (indexOpen() && location.hash.indexOf("#index") !== 0) closeIndex(true); });
  function toggleIndex() { indexOpen() ? closeIndex() : openIndex(); }
  function scrollToGroup(key) {
    if (!flat) return;
    var head = document.getElementById("index-" + key);
    // scroll the overlay's OWN container deterministically — scrollIntoView can no-op
    // depending on how the ancestor scroll resolves. Reading offsetTop forces a sync
    // layout, so this must run AFTER #cosmos-flat is displayed (openIndex does that first).
    if (head && flat.contains(head)) flat.scrollTop = Math.max(0, head.offsetTop - 72);
  }

  if (flat) flat.addEventListener("click", function (e) {
    if (e.target === flat) { closeIndex(); return; }              // backdrop gutter closes
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    // a link click closes too — but target=_blank / mailto / tel / download links do NOT
    // unload the page, so we must FULLY restore the hidden state or an opaque menu would be
    // stranded over the sky with no way out. Internal links unload, so skip history.back()
    // there to avoid racing the navigation.
    var href = a.getAttribute("href") || "";
    var keepsPage = a.target === "_blank" || /^(mailto:|tel:)/i.test(href) || a.hasAttribute("download");
    closeIndex(!keepsPage);
  });
  // #indexbtn is an <a> (so the list is reachable with no JS) presented as a button: give it the Space key too
  if (indexBtn) indexBtn.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggleIndex(); }
  });

  // nav "All / 全部" leaves and the skip-link open the index at a group
  document.querySelectorAll("[data-open-index]").forEach(function (el) {
    el.addEventListener("click", function (e) { e.preventDefault(); openIndex(el.getAttribute("data-open-index") || ""); });
  });

  window.__openIndex = openIndex;
  window.__closeIndex = closeIndex;
  window.__toggleIndex = toggleIndex;

  // Preserve an already-open directory if late scene startup hides the fallback element.
  if (flat && window.MutationObserver) new MutationObserver(function () {
    if (indexOpen() && flat.hidden) flat.hidden = false;
  }).observe(flat, {attributes:true, attributeFilter:["hidden"]});

  // 2026-10-08: a FAILED scene must lead to real content and a reversible recovery action.
  // 2026-11-14: a merely SLOW start never turns the first screen into a list — the sky's poster stays up and
  // the list is offered only on a real failure: the scene reported an error, its module never arrived
  // (no window.__space well after the page finished loading), or it has hung far past any slow network.
  if (!flatTier) {
    var bootStarted = Date.now(), pageLoadedAt = 0, recoveryShown = false;
    var recovery = document.getElementById("scene-recovery");
    var message = document.getElementById("scene-recovery-message");
    if (document.readyState === "complete") pageLoadedAt = Date.now();
    else window.addEventListener("load", function () { pageLoadedAt = Date.now(); });
    var bootWatch = setInterval(function () {
      var scene = window.__space, now = Date.now();
      if (scene && scene.ready) {
        if (recovery) recovery.hidden = true;
        clearInterval(bootWatch);
        return;
      }
      var failed = !!(scene && scene.error) ||
        (!scene && pageLoadedAt && now - pageLoadedAt >= 6000) ||
        (now - bootStarted >= 45000);
      if (failed && !recoveryShown) {
        recoveryShown = true;
        if (message) message.innerHTML = '<span class="i18n-en">The sky could not start.</span><span class="i18n-zh">星空未能启动。</span>';
        if (recovery) recovery.hidden = false;
        openIndex();
      }
      if (scene && scene.error) clearInterval(bootWatch);
    }, 500);
  }

  /* an address that names the list opens it as the proper overlay:
       #index, #index-research … (shared links, content-page breadcrumbs, a nav leaf's own href when
       the scene is not there to take the click) and #cosmos-flat (the no-JS anchor of "All pages" —
       with JS alive it must never leave the raw :target list stranded over the sky). */
  function openFromHash(push) {
    var h = location.hash;
    if (h !== "#cosmos-flat" && h.indexOf("#index") !== 0) return;
    var grp = h.indexOf("#index") === 0 ? h.slice("#index".length).replace(/^-/, "") : "";   // '' | 'research' | 'humanities' | 'books'
    if (flatTier) { if (grp) scrollToGroup(grp); return; }
    try {
      // on load: drop the hash so openIndex pushes ONE clean #index entry (Back then closes the overlay
      // instead of leaving the site). On a later hash change the browser already pushed an entry: rename it.
      if (push) history.replaceState({}, "", location.pathname + location.search);
      else history.replaceState({ cvIndex: 1 }, "", "#index");
    } catch (e) {}
    openIndex(grp || undefined);
    // on the first paint the flat list may not be laid out yet (offsetTop reads 0), so
    // re-apply the group scroll once layout has settled (rAF for real browsers, a timeout
    // fallback for headless/throttled tabs where rAF is paused)
    if (grp) {
      try { requestAnimationFrame(function () { scrollToGroup(grp); }); } catch (e) {}
      setTimeout(function () { if (indexOpen()) scrollToGroup(grp); }, 160);
    }
  }
  openFromHash(true);
  window.addEventListener("hashchange", function () { if (!indexOpen()) openFromHash(false); });

  /* ---------------- (2) NAV — the four content doors ---------------- */
  function headOf(g) { return g.querySelector(".cosmos-nav__head"); }
  function leavesOf(g) { return L.focusables(g.querySelector(".cosmos-nav__kids")); }
  function openGroup() { for (var i = 0; i < navGroups.length; i++) if (navGroups[i].classList.contains("open")) return navGroups[i]; return null; }
  function tops() { return nav ? Array.prototype.slice.call(nav.querySelectorAll(".cosmos-nav__head, .cosmos-nav__link")) : []; }
  var hoverEl = null, focusEl = null, openEl = null, shownEl = null;   // PREVIEW sources, in order of precedence
  function syncNav() {
    var any = null;
    navGroups.forEach(function (g) {
      var on = g.classList.contains("open");
      headOf(g).setAttribute("aria-expanded", on ? "true" : "false");
      if (on) any = g;
    });
    if (any) { if (!L.isOpen("nav")) L.open("nav", { modal: false, close: function () { var g = openGroup(); if (g) setGroup(g, false, true); } }); }
    else L.closed("nav", false);
    openEl = any ? headOf(any) : null;   // an open door keeps its stars lit — on a phone the sheet is the only "hover" there is
    announce();
    sheets.sync();
  }
  function setGroup(g, on, focusHead) {
    navGroups.forEach(function (o) { if (o !== g) o.classList.remove("open"); });
    g.classList.toggle("open", !!on);
    syncNav();
    if (focusHead) headOf(g).focus({ preventScroll: true });
  }
  function closeNav() { var g = openGroup(); if (g) setGroup(g, false, false); }

  /* PREVIEW — say which door (and which leaf) is under the pointer, holds keyboard focus, or stands open.
     detail: { group: "research"|"about"|"creation"|"footprint", tour: <data-tour> | null }, or null when it ends. */
  function announce() {
    var el = hoverEl || focusEl || openEl;
    if (el === shownEl) return; shownEl = el;
    var detail = null;
    if (el) {
      var grp = el.closest("[data-group]");
      detail = { group: grp ? grp.getAttribute("data-group") : null, tour: el.getAttribute("data-tour") || null };
    }
    try { window.dispatchEvent(new CustomEvent("cosmos:preview", { detail: detail })); } catch (e) {}
  }
  function previewOf(n) { return n && n.closest ? n.closest("[data-preview]") : null; }
  function keyFocused(el) { try { return !!el && el.matches(":focus-visible"); } catch (e) { return !!el; } }   // a tap leaves focus behind; only the keyboard's counts

  if (nav) {
    var navPress = false;   // a press inside the bar is about to be handled by click — don't let the blur it causes close first
    nav.addEventListener("pointerdown", function () { navPress = true; }, true);
    window.addEventListener("pointerup", function () { setTimeout(function () { navPress = false; }, 0); }, true);
    window.addEventListener("pointercancel", function () { navPress = false; }, true);

    navGroups.forEach(function (g) {
      var h = headOf(g);
      // registered before space.js boots, so this is the one toggle on the head (its older twin never runs)
      h.addEventListener("click", function (e) { e.stopImmediatePropagation(); setGroup(g, !g.classList.contains("open"), false); });
      // anything else that opens or closes a group (space.js closes them when a leaf fires) keeps aria in step
      if (window.MutationObserver) new MutationObserver(syncNav).observe(g, { attributes: true, attributeFilter: ["class"] });
      g.addEventListener("focusout", function (e) {
        if (navPress || !g.classList.contains("open")) return;
        if (e.relatedTarget && g.contains(e.relatedTarget)) return;
        setTimeout(function () { if (!navPress && !g.contains(document.activeElement)) { g.classList.remove("open"); syncNav(); } }, 0);
      });
      sheets.grip(g.querySelector(".cosmos-nav__kids"), closeNav);
    });
    // a leaf that is a plain link leaves the page: its sheet's history entry stays behind as an ordinary entry (never popped mid-navigation)
    nav.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest(".cosmos-nav__kids a[href]") : null;
      if (a && !a.hasAttribute("data-tour") && !a.hasAttribute("data-open-index") && !e.defaultPrevented) sheets.abandon();
    });
    nav.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target, k = e.key, g = t.closest ? t.closest(".cosmos-nav__group") : null;
      var isHead = !!(t.classList && (t.classList.contains("cosmos-nav__head") || t.classList.contains("cosmos-nav__link")));
      var inMenu = !!(g && t.closest(".cosmos-nav__kids"));
      var list, i, row;
      if (isHead && g && (k === "ArrowDown" || k === "ArrowUp")) {
        setGroup(g, true, false); list = leavesOf(g);
        if (list.length) list[k === "ArrowDown" ? 0 : list.length - 1].focus();
      } else if (inMenu && (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End")) {
        list = leavesOf(g); i = list.indexOf(t);
        if (k === "Home") i = 0; else if (k === "End") i = list.length - 1;
        else i = (i + (k === "ArrowDown" ? 1 : list.length - 1)) % list.length;
        if (list[i]) list[i].focus();
      } else if ((isHead || inMenu) && (k === "ArrowRight" || k === "ArrowLeft")) {
        row = tops(); i = row.indexOf(isHead ? t : headOf(g));
        closeNav();
        i = (i + (k === "ArrowRight" ? 1 : row.length - 1)) % row.length;
        if (row[i]) row[i].focus();
      } else return;
      e.preventDefault(); e.stopPropagation();   // these keys belong to the menu, not to the scene
    });
    // a press anywhere outside the bar closes an open menu (capture: the canvas keeps its own handlers)
    document.addEventListener("pointerdown", function (e) {
      if (openGroup() && !(e.target && e.target.closest && e.target.closest(".cosmos-nav"))) closeNav();
    }, true);

    nav.addEventListener("pointerover", function (e) { if (e.pointerType === "touch") return; hoverEl = previewOf(e.target); announce(); });
    nav.addEventListener("pointerout", function (e) { if (!previewOf(e.relatedTarget)) { hoverEl = null; announce(); } });
    nav.addEventListener("focusin", function (e) { var el = previewOf(e.target); focusEl = keyFocused(e.target) ? el : null; announce(); });
    nav.addEventListener("focusout", function (e) { if (!previewOf(e.relatedTarget)) { focusEl = null; announce(); } });
  }

  /* ---------------- (3) COMPACT FRAME — the phone seating of the same controls ---------------- */
  moreBtn = document.getElementById("morebtn");
  more = document.getElementById("frame-more");
  (function () {
    var ui = document.querySelector(".cosmos-ui"), idBlock = document.querySelector(".cosmos-id"), links = document.querySelector(".cosmos-links");
    var moreLinks = document.getElementById("frame-more-links"), moreRows = document.getElementById("frame-more-rows");
    var atlasBtn = document.getElementById("atlasbtn"), fieldBtn = document.getElementById("fieldbtn"), simpleBtn = document.getElementById("simplebtn");
    var mq = null; try { mq = matchMedia("(max-width:700px), (pointer:coarse)"); } catch (e) {}
    function seat() {
      var c = !!(mq && mq.matches) && !body.classList.contains("is-flat") && !!more && !!moreBtn;
      if (c === body.classList.contains("is-compact")) return;
      if (!c) { closeNav(); closeMore(); }
      body.classList.toggle("is-compact", c);
      // one set of controls, two seats: nothing is duplicated, so every id, handler and state travels with its node
      if (c) {
        if (links && moreLinks) moreLinks.appendChild(links);
        if (atlasBtn && moreRows) moreRows.insertBefore(atlasBtn, simpleBtn);
        if (fieldBtn && moreRows) moreRows.insertBefore(fieldBtn, simpleBtn);
      } else {
        if (links && idBlock) idBlock.appendChild(links);
        if (atlasBtn && ui && indexBtn) ui.insertBefore(atlasBtn, indexBtn);
        if (fieldBtn && ui) ui.insertBefore(fieldBtn, moreBtn);
      }
    }
    seat();
    if (mq) { if (mq.addEventListener) mq.addEventListener("change", seat); else if (mq.addListener) mq.addListener(seat); }
    if (window.MutationObserver) new MutationObserver(seat).observe(body, { attributes: true, attributeFilter: ["class"] });   // (space.js settles is-flat when it boots)

    if (!more || !moreBtn) return;
    sheets.grip(more, function () { closeMore(); });
    moreBtn.addEventListener("click", function () { if (moreOpen()) closeMore(); else openMore(); });
    more.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      if (t.closest("#simplebtn")) {
        closeMore();
        if (window.__space && typeof window.__space.setSimpleView === "function") window.__space.setSimpleView(true);
        else { try { localStorage.setItem(MOTION_KEY, "flat"); } catch (err) {} location.reload(); }
      } else if (t.closest("#atlasbtn")) closeMore();                       // the Atlas opens in its own panel
      else if (t.closest("a[href]")) { sheets.abandon(); closeMore(); }     // a link leaves (or opens a new tab): no history pop racing it
    });
  })();
  function moreOpen() { return !!more && more.classList.contains("is-on"); }
  function openMore() {
    if (!more || moreOpen() || !body.classList.contains("is-compact")) return;
    closeNav();
    L.open("more", { close: function () { closeMore(); }, root: more, fallback: moreBtn });
    more.inert = false; more.classList.add("is-on");
    moreBtn.setAttribute("aria-expanded", "true");
    sheets.sync();
  }
  function closeMore() {
    if (!moreOpen()) return;
    more.classList.remove("is-on"); more.inert = true;
    moreBtn.setAttribute("aria-expanded", "false");
    L.closed("more");
    sheets.sync();
  }
  // a page restored from the back/forward cache comes back exactly as it was left: put every sheet away
  window.addEventListener("pageshow", function (e) { if (e.persisted) { sheets.abandon(); closeNav(); closeMore(); } });

  /* flat (phone) home: the floating controls step aside while reading down the index and come back on any
     scroll up or near the top — so they never sit on top of a title, yet search stays one flick away */
  (function () {
    if (!flat) return;
    var last = 0;
    flat.addEventListener("scroll", function () {
      if (!document.body.classList.contains("is-flat")) return;
      var y = flat.scrollTop, down = y > last + 4, up = y < last - 4;
      if (y < 120 || up) document.body.classList.remove("flat-reading");
      else if (down) document.body.classList.add("flat-reading");
      last = y;
    }, { passive: true });
  })();

  /* (the first-load fork dialog was removed by owner decision 2026-07-19: the site opens DIRECTLY
     in the cosmos — no initialization/entry page. The index remains reachable via All pages,
     the nav, and Search. The ambient gesture captions were removed 2026-11-14: the frame carries
     controls, not instructions.) */
})();
