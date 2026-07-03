/* craft.js — dependency-free, defer-load. TINY. Two jobs, hard-routed so a
   weak agent (or future page) can't mis-fire it:

     body.cosmos / body.home  -> ONLY arm the chrome luminance-entrance gate
                                 (adds body.cosmos-ready one double-rAF after load,
                                  immediately under reduced-motion). Never grain.
     everything else (cv +     -> add body.craft-flat, which lights the warm vignette
     reading pages)              + still film-grain depth layer (craft.css ::before/::after,
                                  pointer-events:none, z-index:0 behind content).

   Reveals are NOT this file's job: the CV owns its own GSAP ScrollTrigger reveals;
   the short reading pages use their CSS `pageIn` entrance. craft.js only governs the
   depth layer + the cosmos chrome fade, so there is no JS-added-class FOUC anywhere.

   Load on: index.html, cv.html, and every reading page (sibling `craft.js`, or
   `../craft.js` for the depth-1 item/product pages).  Invariant: any canvas page
   MUST carry body.cosmos or body.home so it is never given the flat grain layer. */
(function () {
  var body = document.body;
  var isCanvas = body.classList.contains("cosmos") || body.classList.contains("home");

  if (isCanvas) {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var ready = function () { body.classList.add("cosmos-ready"); };
    if (reduce) { ready(); return; }
    requestAnimationFrame(function () { requestAnimationFrame(ready); });
    setTimeout(ready, 320);        /* fallback: rAF pauses in hidden/headless tabs — chrome must never stick hidden */
    return;                        /* never paint grain/vignette over the 3D stage */
  }

  body.classList.add("craft-flat");
})();
