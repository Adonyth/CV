/* ============================================================
   clock-view.js — the 生辰八字 portal becomes a doorway.
   Clicking it fades the page away and hands you the REAL Nye Clock
   (the transparent iframe backdrop) with its own premium orbit
   controls unlocked: drag to orbit, scroll to zoom, Esc / ✕ to come
   back. Nothing is re-rendered — the clock was behind the page all
   along; the page simply steps aside.
   ============================================================ */
(function () {
  var portal = document.querySelector('a[href="#bazi"]');
  var iframe = document.getElementById("bazi-bg");
  if (!portal || !iframe) return;

  var exitBtn = null, hint = null, open = false;

  function build() {
    exitBtn = document.createElement("button");
    exitBtn.type = "button";
    exitBtn.className = "clock-exit no-print";
    exitBtn.setAttribute("aria-label", "Exit clock view");
    exitBtn.innerHTML = '<span class="i18n-en">✕ Return</span><span class="i18n-zh">✕ 返回</span>';
    exitBtn.addEventListener("click", leave);
    document.body.appendChild(exitBtn);

    hint = document.createElement("div");
    hint.className = "clock-hint no-print";
    hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = '<span class="i18n-en">drag to orbit · scroll to zoom · Esc to return</span><span class="i18n-zh">拖动旋转 · 滚轮缩放 · Esc 返回</span>';
    document.body.appendChild(hint);
  }

  function enter(e) {
    if (e) e.preventDefault();
    if (open) return;
    open = true;
    if (!exitBtn) build();
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (err) { window.scrollTo(0, 0); }
    document.body.classList.add("clock-view");
    iframe.style.pointerEvents = "auto";      // unlock the clock's own orbit controls
    exitBtn.style.display = "block";
    hint.style.display = "block";
    exitBtn.focus();
  }

  function leave() {
    if (!open) return;
    open = false;
    document.body.classList.remove("clock-view");
    iframe.style.pointerEvents = "none";      // page gets its clicks back
    if (exitBtn) { exitBtn.style.display = "none"; hint.style.display = "none"; }
    portal.focus();
  }

  portal.addEventListener("click", enter);
  addEventListener("keydown", function (e) { if (e.key === "Escape") leave(); });
  window.__clockView = { enter: enter, leave: leave, isOpen: function () { return open; } };
})();
