/* ============================================================
   magnet.js — magnetic hover for every functional entrance.
   Elements marked [data-magnet] (or matching the default set) lean
   toward the cursor while it is near, and spring back on leave.
   Pure transform — no layout, no per-frame cost while idle.
   ============================================================ */
(function () {
  var SEL = "[data-magnet], .cosmos-ui .iconbtn, .lang button, .cosmos-links a, .earth-cta, .clock-exit, .map-back";
  var STRENGTH = 0.34, MAX = 8;

  // honor the OS motion preference — magnet.js was the one motion layer that ignored it
  var rm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if (rm && rm.matches) return;
  if (rm && rm.addEventListener) rm.addEventListener("change", function (e) {
    if (e.matches) document.querySelectorAll(SEL).forEach(function (el) {
      el.style.transition = "none"; el.style.transform = "";
    });
  });

  function attach(el) {
    if (el.__magnet) return; el.__magnet = true;
    var raf = 0, tx = 0, ty = 0;
    el.style.willChange = "transform";
    function onMove(e) {
      var r = el.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      tx = Math.max(-MAX, Math.min(MAX, dx * STRENGTH));
      ty = Math.max(-MAX, Math.min(MAX, dy * STRENGTH));
      if (!raf) raf = requestAnimationFrame(apply);
    }
    function apply() {
      raf = 0;
      el.style.transition = "transform .08s ease-out";
      el.style.transform = "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px)";
    }
    function onLeave() {
      el.style.transition = "transform .38s cubic-bezier(0.34,1.12,0.42,1)";  // springy return (= --ease-spring: the site's ONE overshoot voice)
      el.style.transform = "translate(0,0)";
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
  }

  function init() { document.querySelectorAll(SEL).forEach(attach); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // late-created elements (e.g. clock-exit) get picked up on first hover intent
  document.addEventListener("pointerover", function (e) {
    var el = e.target && e.target.closest && e.target.closest(SEL);
    if (el) attach(el);
  });
})();
