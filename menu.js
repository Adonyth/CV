/* menu.js — the plain-language wayfinding layer that sits OVER the living orrery,
   never inside it. Two jobs, both pure DOM + localStorage, with ZERO dependency on
   Three.js or WebGL, so a goal-directed visitor always reaches the work even if the
   3-D scene never renders:

     (1) INDEX (P0-1) — a first-class "☰ Index / 目录" toggle in the top controls that
         reveals the already-existing #cosmos-flat list (identity + all 21 research
         works + books + products + more) as a scrim overlay ABOVE the running sky.
         Esc, the ✕ button, or a click on the backdrop closes it. On the flat tier
         (mobile / reduced-motion / no-WebGL) this file does nothing — there the flat
         list already IS the page and space.js owns it.

     (2) FIRST-LOAD FORK (P0-2) — on a first desktop visit with no saved motion choice,
         one small panel offers "Enter the sky ✦" vs "Skip to index / 直接看目录". The
         choice is remembered (localStorage), so it is shown exactly once.

   The cosmos scene is untouched: everything here is DOM chrome at a high z-index. */
(function () {
  "use strict";
  if (window.__menuBooted) return; window.__menuBooted = true;

  var body = document.body;
  if (!body || !body.classList.contains("cosmos")) return;   // homepage only

  var MOTION_KEY = "cv-motion";      // full | calm | flat  (shared with space.js)
  var SEEN_KEY   = "cv-seen-fork";   // "1" once the first-load fork has been answered

  /* ---- tier mirror: the same decision space.js makes, so we can tell whether the
          3-D world will actually render (and therefore whether this chrome applies) ---- */
  function stored()  { try { return localStorage.getItem(MOTION_KEY); } catch (e) { return null; } }
  function reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function isMobile(){ try { return innerWidth < 700 || matchMedia("(pointer:coarse)").matches; } catch (e) { return innerWidth < 700; } }
  function lowPower(){ var dm = navigator.deviceMemory || 8, hc = navigator.hardwareConcurrency || 8; return dm <= 4 || hc <= 4; }
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
  function willFlat() {
    var s = stored();
    if (s === "flat") return true;
    if (reduced() || !webglOK()) return true;
    if (isMobile()) return !(s === "calm" || s === "full");
    if (lowPower()) return true;
    return false;   // desktop with real GL → the sky renders → this chrome is live
  }

  if (willFlat()) return;   // flat tier: space.js reveals #cosmos-flat as the page; nothing to layer

  var flat = document.getElementById("cosmos-flat");
  var indexBtn = document.getElementById("indexbtn");

  /* ---------------- (1) INDEX overlay (a real modal) ---------------- */
  var lastFocus = null;
  // the floating orrery chrome behind the scrim — made inert (unfocusable + hidden from
  // assistive tech) while the modal index is up, so keyboard/SR users can't drive the
  // invisible controls behind it
  var BG_CHROME = ".cosmos-id,.cosmos-ui,.cosmos-nav,.cosmos-dock,.cosmos-rail,#cosmos-hint,#exit3d,#earth-cta,#sun-cta,#star-cta";
  function indexOpen() { return body.classList.contains("index-open"); }
  function setBgInert(on) {
    var els = document.querySelectorAll(BG_CHROME);
    for (var i = 0; i < els.length; i++) {
      if (on) { try { els[i].inert = true; } catch (e) {} els[i].setAttribute("aria-hidden", "true"); }
      else { try { els[i].inert = false; } catch (e) {} els[i].removeAttribute("aria-hidden"); }
    }
  }

  function openIndex(groupKey) {
    if (!flat || indexOpen()) { if (groupKey) scrollToGroup(groupKey); return; }
    lastFocus = document.activeElement;
    flat.hidden = false;                       // clears .cosmos-flat[hidden]{display:none}
    // dialog semantics applied only in overlay mode (the same element is the flat-tier page)
    flat.setAttribute("role", "dialog");
    flat.setAttribute("aria-modal", "true");
    flat.setAttribute("aria-label", "Site index · 全站目录");
    body.classList.add("index-open");
    setBgInert(true);
    if (indexBtn) indexBtn.setAttribute("aria-expanded", "true");
    flat.scrollTop = 0;
    // reflect the open index in the URL and add ONE history entry, so the browser Back
    // button (and Esc) return to the sky instead of leaving the page. Purely address-bar
    // + DOM history — no scene state is encoded and the camera is never driven from a hash.
    if (location.hash.indexOf("#index") !== 0) { try { history.pushState({ cvIndex: 1 }, "", "#index"); } catch (e) {} }
    if (groupKey) scrollToGroup(groupKey);
    // focus the close button so keyboard/SR users land inside the dialog
    var cx = flat.querySelector(".flat-close");
    setTimeout(function () { if (cx) cx.focus(); }, 20);
  }
  function closeIndex(fromPop) {
    if (!flat || !indexOpen()) return;
    body.classList.remove("index-open");
    flat.hidden = true;                        // restore the hidden fallback state
    flat.removeAttribute("role"); flat.removeAttribute("aria-modal"); flat.removeAttribute("aria-label");
    setBgInert(false);                         // un-hide the chrome BEFORE returning focus into it
    if (indexBtn) { indexBtn.setAttribute("aria-expanded", "false"); }
    // return focus where it came from — but if that origin was removed (e.g. the fork
    // button), fall back to the Index pill so keyboard focus never lands on nothing
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    else if (indexBtn) indexBtn.focus();
    // clean the #index hash unless this close WAS the popstate that already moved history
    if (!fromPop && location.hash === "#index") { try { history.back(); } catch (e) {} }
  }
  // Back / Forward closes the overlay (the pushed #index entry pops here)
  window.addEventListener("popstate", function () { if (indexOpen()) closeIndex(true); });
  function toggleIndex() { indexOpen() ? closeIndex() : openIndex(); }
  function scrollToGroup(key) {
    if (!flat) return;
    // find the .flat-group label whose text carries the key (research→Sciences, humanities→Humanities…)
    var wanted = ({ research: "Sciences", humanities: "Humanities", books: "Books", products: "Products" })[key];
    if (!wanted) return;
    var groups = flat.querySelectorAll(".flat-group");
    for (var i = 0; i < groups.length; i++) {
      if ((groups[i].textContent || "").indexOf(wanted) >= 0) {
        // scroll the overlay's OWN container deterministically — scrollIntoView can no-op
        // depending on how the ancestor scroll resolves. Reading offsetTop forces a sync
        // layout, so this must run AFTER #cosmos-flat is displayed (openIndex does that first).
        flat.scrollTop = Math.max(0, groups[i].offsetTop - 16);
        return;
      }
    }
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
  // keep Tab within the dialog (portable fallback for browsers without inert support)
  if (flat) flat.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !indexOpen()) return;
    var nodes = flat.querySelectorAll('a[href],button:not([disabled])'), list = [];
    for (var i = 0; i < nodes.length; i++) { if (nodes[i].offsetParent !== null) list.push(nodes[i]); }
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // global Esc closes the index; "/" is owned by search.js
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && indexOpen()) { e.preventDefault(); closeIndex(); }
  });

  // nav "See all / 全部" leaves and the skip-link open the index at a group
  document.querySelectorAll("[data-open-index]").forEach(function (el) {
    el.addEventListener("click", function (e) { e.preventDefault(); openIndex(el.getAttribute("data-open-index") || ""); });
  });

  window.__openIndex = openIndex;
  window.__closeIndex = closeIndex;
  window.__toggleIndex = toggleIndex;

  // a shared link opens the overlay on load: /#index (top) or /#index-research
  // (scrolled to a group — used by content-page breadcrumbs)
  var loadHash = location.hash;
  if (loadHash.indexOf("#index") === 0) {
    var grp = loadHash.slice("#index".length).replace(/^-/, "");   // '' | 'research' | 'humanities' | 'books'
    // drop the deep hash first so openIndex pushes a clean #index entry — then browser Back
    // closes the overlay consistently (instead of leaving the site) even on a shared deep link
    try { history.replaceState({}, "", location.pathname + location.search); } catch (e) {}
    openIndex(grp || undefined);
    // on the first paint the flat list may not be laid out yet (offsetTop reads 0), so
    // re-apply the group scroll once layout has settled (rAF for real browsers, a timeout
    // fallback for headless/throttled tabs where rAF is paused)
    if (grp) {
      try { requestAnimationFrame(function () { scrollToGroup(grp); }); } catch (e) {}
      setTimeout(function () { if (indexOpen()) scrollToGroup(grp); }, 160);
    }
  }

  /* ---- onboarding hint: show it once, then remember (P2-4) ----
     The ambient "drag to orbit · scroll to zoom" line already fades on first drag
     (space.js). We simply pre-fade it for anyone who has driven the scene before, and
     record that they have — DOM only, the scene's own fade logic is left intact. */
  (function () {
    var hint = document.getElementById("cosmos-hint");
    var HINT_KEY = "cv-hint-seen";
    try { if (localStorage.getItem(HINT_KEY) === "1" && hint) hint.classList.add("is-faded"); } catch (e) {}
    addEventListener("pointerdown", function () { try { localStorage.setItem(HINT_KEY, "1"); } catch (e) {} }, { once: true });
  })();

  /* ---------------- (2) first-load fork ---------------- */
  function seen() { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {} }

  // show the fork only on a genuine first landing — not when the visitor deep-linked
  // straight to the index (they have already declared their intent)
  if (!stored() && !seen() && loadHash.indexOf("#index") !== 0) {
    var fork = document.createElement("div");
    fork.className = "cosmos-fork no-print";
    fork.setAttribute("role", "dialog");
    fork.setAttribute("aria-modal", "true");
    fork.setAttribute("aria-label", "Choose how to begin");
    fork.innerHTML =
      '<div class="fork-card">' +
        '<p class="fork-lead"><span class="i18n-en">Jiaxuan Chen 陈嘉轩 — physicist &amp; independent researcher. A living star chart of his research, books, and products.</span>' +
          '<span class="i18n-zh">陈嘉轩 — 物理学者与独立研究者。一张承载其研究、著作与产品的活星图。</span></p>' +
        '<div class="fork-btns">' +
          '<button type="button" class="fork-go" id="fork-sky">' +
            '<span class="i18n-en">Enter the sky ↗</span><span class="i18n-zh">进入星空 ↗</span></button>' +
          '<button type="button" class="fork-alt" id="fork-index">' +
            '<span class="i18n-en">Skip to index →</span><span class="i18n-zh">直接看目录 →</span></button>' +
        '</div>' +
        '<p class="fork-note"><span class="i18n-en">drag to orbit · scroll to zoom · you can open the index any time</span>' +
          '<span class="i18n-zh">拖动旋转 · 滚轮缩放 · 目录随时可开</span></p>' +
      '</div>';
    body.appendChild(fork);

    function forkEsc(e) { if (e.key === "Escape") dismissFork(); }
    function dismissFork() {
      markSeen();
      window.removeEventListener("keydown", forkEsc);
      if (fork.parentNode) fork.parentNode.removeChild(fork);
    }
    var skyBtn = fork.querySelector("#fork-sky"), idxBtn = fork.querySelector("#fork-index");
    skyBtn.addEventListener("click", dismissFork);
    idxBtn.addEventListener("click", function () { dismissFork(); openIndex(); });
    fork.addEventListener("click", function (e) { if (e.target === fork) dismissFork(); });   // backdrop dismiss
    window.addEventListener("keydown", forkEsc);                                              // Esc from anywhere
    setTimeout(function () { skyBtn.focus(); }, 60);
  }
})();
