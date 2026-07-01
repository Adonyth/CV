/* ============================================================
   Jiaxuan Chen — CV interaction layer
   Ported from omyteaai.com main.js (particle field + GSAP) and
   merged with the CV's bilingual locale switch, day/night theme,
   background toggle, and Save-as-PDF.
   ============================================================ */
(function () {
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LOC_KEY = "cv-locale";
  var THEME_KEY = "cv-theme";
  var FIELD_KEY = "cv-field-off";

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ======================================================= LOCALE (EN / 中文) */
  function applyLocale(loc) {
    var isZh = loc === "zh";
    root.classList.remove("locale-en", "locale-zh");
    root.classList.add(isZh ? "locale-zh" : "locale-en");
    root.setAttribute("lang", isZh ? "zh-Hans" : "en");

    document.title = isZh ? "陈嘉轩 — 学术简历" : "Jiaxuan Chen — Academic CV";
    var desc = isZh
      ? "学术简历 — 陈嘉轩（Jiaxuan Chen），物理学"
      : "Academic CV — Jiaxuan Chen (陈嘉轩), Physics";
    setMeta("meta-desc", desc);
    setMeta("meta-og-desc", desc);
    setMeta("meta-og-title", isZh ? "陈嘉轩 — 学术简历" : "Jiaxuan Chen — Academic CV");

    var skip = document.getElementById("skip-link");
    if (skip) skip.textContent = isZh ? "跳到正文" : "Skip to content";

    var en = document.getElementById("btn-en");
    var zh = document.getElementById("btn-zh");
    if (en && zh) {
      en.setAttribute("aria-pressed", isZh ? "false" : "true");
      zh.setAttribute("aria-pressed", isZh ? "true" : "false");
    }
    store(LOC_KEY, loc);
  }
  function setMeta(id, v) {
    var m = document.getElementById(id);
    if (m) m.setAttribute("content", v);
  }
  function initLocale() {
    var s = read(LOC_KEY);
    if (s === "zh" || s === "en") { applyLocale(s); return; }
    applyLocale((navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en");
  }

  /* ======================================================= THEME (day / night) */
  function applyTheme(dark) {
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    store(THEME_KEY, dark ? "dark" : "light");
    if (reduce) { try { window.__cvRepaintField && window.__cvRepaintField(); } catch (e) {} }
  }

  /* ======================================================= FIELD TOGGLE */
  function applyFieldOff(off) {
    document.body.classList.toggle("field-off", !!off);
    var b = document.getElementById("fieldbtn");
    if (b) b.setAttribute("aria-pressed", off ? "true" : "false");
    store(FIELD_KEY, off ? "1" : "0");
    try { off ? window.__cvPauseField && window.__cvPauseField() : window.__cvResumeField && window.__cvResumeField(); } catch (e) {}
  }

  /* ======================================================= WIRE UP CONTROLS */
  document.addEventListener("DOMContentLoaded", function () {
    initLocale();
    if (read(FIELD_KEY) === "1") applyFieldOff(true);

    var langSwitch = document.getElementById("lang-switch");
    if (langSwitch) langSwitch.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-locale]");
      if (btn) applyLocale(btn.getAttribute("data-locale"));
    });

    var tb = document.getElementById("themebtn");
    if (tb) tb.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") !== "dark");
    });

    var fb = document.getElementById("fieldbtn");
    if (fb) fb.addEventListener("click", function () {
      applyFieldOff(!document.body.classList.contains("field-off"));
    });

    var pdf = document.getElementById("btn-pdf");
    if (pdf) pdf.addEventListener("click", function () {
      requestAnimationFrame(function () { requestAnimationFrame(function () { window.print(); }); });
    });

    // 生辰八字 — lazy-load the heavy (786KB) Nye Clock iframe only on demand
    var baziFrame = document.getElementById("baziFrame");
    var baziPoster = document.getElementById("baziPoster");
    var baziIframe = document.getElementById("baziIframe");
    function loadBazi() {
      if (!baziIframe || baziIframe.getAttribute("src")) return;
      baziIframe.addEventListener("load", function () {
        baziIframe.classList.add("in");
        if (baziFrame) baziFrame.classList.add("loaded");
      });
      baziIframe.setAttribute("src", baziIframe.getAttribute("data-src"));
    }
    if (baziPoster) {
      baziPoster.addEventListener("click", loadBazi);
      baziPoster.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); loadBazi(); }
      });
    }
  });

  /* ======================================================= GSAP MOTION (isolated) */
  try { (function () {
    var g = window.gsap;
    if (!g || reduce) { document.querySelectorAll(".reveal").forEach(function (e) { e.classList.add("in"); }); return; }
    g.registerPlugin(window.ScrollTrigger);
    // hero: gentle intro
    g.from(".hero .eyebrow, .hero h1, .hero .lead, .hero__contact", {
      opacity: 0, y: 22, duration: 0.9, ease: "power3.out", stagger: 0.09
    });
    // sections: reveal on scroll
    g.utils.toArray(".reveal").forEach(function (el) {
      g.set(el, { opacity: 0, y: 20 });
      window.ScrollTrigger.create({
        trigger: el, start: "top 88%", once: true,
        onEnter: function () { g.to(el, { opacity: 1, y: 0, duration: 0.85, ease: "power3.out" }); }
      });
    });
  })(); } catch (e) {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* =========================================================================
     FIXED FULL-PAGE PARTICLE FIELD (ported from omyteaai.com)
     Warm solid cores + glow halo. Day = warm orbs on stone; night = additive
     glow → radiant. Cursor sprays a jet; click bursts a ring. Fixed behind all.
     ========================================================================= */
  var cv = document.getElementById("field"); if (!cv) return;
  var ctx = cv.getContext("2d");
  var W, H, DPR, t = 0, t0 = -1, amb = [], jets = [], rings = [], NJ = 0, jh = 0;
  var running = false, started = false;
  var GLOW = document.createElement("canvas"); GLOW.width = GLOW.height = 64;
  (function () {
    var b = GLOW.getContext("2d"), g = b.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,158,98,0.7)"); g.addColorStop(0.3, "rgba(226,110,60,0.3)");
    g.addColorStop(0.65, "rgba(194,93,60,0.08)"); g.addColorStop(1, "rgba(194,93,60,0)");
    b.fillStyle = g; b.fillRect(0, 0, 64, 64);
  })();
  function R(a, b) { return a + Math.random() * (b - a); }
  function isDark() { return root.getAttribute("data-theme") === "dark"; }

  function spawnAmb(p) {
    p.x = Math.random() * W; p.y = Math.random() * H; p.spd = R(0.4, 1.25);
    p.hue = Math.random();
    p.ember = Math.random() < 0.22; p.spark = Math.random() < 0.06;
    p.size = p.ember ? R(1.9, 3.2) : R(1.0, 2.1);
    p.baseA = p.ember ? R(0.62, 0.92) : R(0.40, 0.72);
  }
  function build() {
    var n = Math.floor(W * H / 240); n = Math.min(5200, n);
    NJ = Math.floor(W * H / 700); NJ = Math.min(1800, NJ);
    if (W < 700) { n = Math.floor(n * 0.5); NJ = Math.floor(NJ * 0.5); }
    amb = []; for (var i = 0; i < n; i++) { var p = {}; spawnAmb(p); amb.push(p); }
    jets = []; for (var j = 0; j < NJ; j++) jets.push({ life: 0 });
  }
  function size() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); build();
    if (reduce) staticDraw();
  }
  function staticDraw() {
    var dark = isDark();
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (var i = 0; i < amb.length; i++) {
      var p = amb[i], col = coreCol(p, dark);
      if (p.ember || p.spark) {
        var gr = p.size * (dark ? 4.2 : 3.4); ctx.globalAlpha = Math.min(0.7, p.baseA * (dark ? 0.85 : 0.55));
        ctx.drawImage(GLOW, p.x - gr, p.y - gr, gr * 2, gr * 2); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(" + col + "," + p.baseA + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  function flow(x, y) { return (Math.sin(x * 0.0017 + t * 0.18) + Math.cos(y * 0.0021 - t * 0.14) + Math.sin((x + y) * 0.0012 + t * 0.10)) * 1.7; }
  function coreCol(p, dark) {
    if (p.spark) return dark ? "255,228,190" : "255,200,158";
    var h = p.hue;
    if (dark) return "255," + ((150 + 45 * h) | 0) + "," + ((96 + 34 * h) | 0);
    return ((228 + 8 * h) | 0) + "," + ((108 + 57 * h) | 0) + "," + ((60 + 32 * h) | 0);
  }

  var mx = -9999, my = -9999, pmx = -9999, pmy = -9999, mAct = false, mSpeed = 0, mDir = 0;
  function emitJet() {
    var p = jets[jh++]; if (jh >= jets.length) jh = 0;
    p.x = mx + R(-4, 4); p.y = my + R(-4, 4);
    var a = mDir + R(-0.5, 0.5), s = R(1.8, 4.8) + Math.min(8, mSpeed) * 0.55;
    p.vx = Math.cos(a) * s + R(-0.4, 0.4); p.vy = Math.sin(a) * s + R(-0.4, 0.4);
    p.life = p.max = R(0.5, 1.05); p.size = R(1.4, 3.0); p.hue = Math.random(); p.spark = Math.random() < 0.18; p.ember = true;
  }
  function emitBurst(x, y) {
    var N = 48;
    for (var i = 0; i < N; i++) {
      var p = jets[jh++]; if (jh >= jets.length) jh = 0;
      var a = (i / N) * 6.283 + R(-0.05, 0.05), s = R(2.4, 7.8);
      p.x = x + R(-3, 3); p.y = y + R(-3, 3);
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = R(0.55, 1.3); p.size = R(1.5, 3.5); p.hue = Math.random();
      p.spark = Math.random() < 0.32; p.ember = true;
    }
    rings.push({ x: x, y: y, r: 5, life: 1 });
  }

  function frame(ts) {
    if (!running) return;
    t = ts / 1000;
    if (t0 < 0) t0 = ts;
    var el = ts - t0, BURST = 700, PEAK = 0, STREAM = 520, EDGE = 240, introOn = el < 730;
    var cx = W / 2, cy = H / 2, maxR = Math.sqrt(W * W + H * H) / 2;
    if (mAct) { var dx = mx - pmx, dy = my - pmy; mSpeed = Math.hypot(dx, dy); if (mSpeed > 0.02) mDir = Math.atan2(dy, dx); pmx = mx; pmy = my; } else mSpeed *= 0.9;
    var dark = isDark();

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";

    if (mAct && mSpeed > 1.0) { var burst = Math.min(22, Math.floor(mSpeed * 0.7) + 1); for (var k = 0; k < burst; k++) emitJet(); }

    for (var i = 0; i < amb.length; i++) {
      var p = amb[i];
      var fa = flow(p.x, p.y);
      var surge = !introOn ? 0 : (el < PEAK ? el / PEAK : Math.max(0, 1 - (el - PEAK) / STREAM));
      var sp = p.spd * (1 + 7.0 * surge * surge);
      p.x += Math.cos(fa) * sp + 0.18; p.y += Math.sin(fa) * sp;
      if (p.x > W + 6) p.x = -6; if (p.x < -6) p.x = W + 6; if (p.y > H + 6) p.y = -6; if (p.y < -6) p.y = H + 6;
      if (mAct) { var ex = p.x - mx, ey = p.y - my, ed = ex * ex + ey * ey; if (ed < 24000 && ed > 1) { var f = 1 - ed / 24000, dd = Math.sqrt(ed); p.x += ex / dd * f * 1.7; p.y += ey / dd * f * 1.7; } }
      var px = p.x, py = p.y, front = 1;
      if (introOn) { var odx = p.x - cx, ody = p.y - cy, od = Math.sqrt(odx * odx + ody * ody), wr = (el / BURST) * maxR;
        if (od > wr) { var s = wr / od; px = cx + odx * s; py = cy + ody * s; front = Math.max(0, 1 - (od - wr) / EDGE); } }
      var col = coreCol(p, dark), a = p.baseA * front * (introOn ? Math.min(1, 0.2 + el / 220) : 1);
      if (p.ember || p.spark) { var gr = p.size * (dark ? 4.2 : 3.4); ctx.globalAlpha = Math.min(0.7, a * (dark ? 0.85 : 0.55));
        ctx.drawImage(GLOW, px - gr, py - gr, gr * 2, gr * 2); ctx.globalAlpha = 1; }
      ctx.fillStyle = "rgba(" + col + "," + a + ")";
      ctx.beginPath(); ctx.arc(px, py, p.size, 0, 6.283); ctx.fill();
    }

    for (var j = 0; j < jets.length; j++) {
      var q = jets[j]; if (q.life <= 0) continue;
      q.vy += 0.008; q.vx *= 0.99; q.vy *= 0.99; q.x += q.vx; q.y += q.vy; q.life -= 0.016;
      var lf = q.life / q.max, al = Math.min(0.95, lf), col2 = coreCol(q, dark);
      var gr2 = q.size * 4 * (0.6 + lf * 0.6); ctx.globalAlpha = al * (dark ? 0.7 : 0.5); ctx.drawImage(GLOW, q.x - gr2, q.y - gr2, gr2 * 2, gr2 * 2); ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(" + col2 + "," + Math.min(1, al + 0.08) + ")";
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.7 + lf * 0.5), 0, 6.283); ctx.fill();
    }

    for (var ri = rings.length - 1; ri >= 0; ri--) {
      var rg = rings[ri]; rg.r += 6.5; rg.life -= 0.028;
      if (rg.life <= 0) { rings.splice(ri, 1); continue; }
      ctx.globalAlpha = rg.life * (dark ? 0.55 : 0.42);
      ctx.strokeStyle = "rgba(" + (dark ? "255,180,120" : "194,93,60") + ",1)";
      ctx.lineWidth = dark ? 2 : 1.4;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(frame);
  }

  addEventListener("mousemove", function (e) { if (!mAct) { pmx = e.clientX; pmy = e.clientY; } mx = e.clientX; my = e.clientY; mAct = true; });
  addEventListener("mouseout", function (e) { if (!e.relatedTarget) { mAct = false; } });
  addEventListener("touchmove", function (e) { if (e.touches[0]) { if (!mAct) { pmx = e.touches[0].clientX; pmy = e.touches[0].clientY; } mx = e.touches[0].clientX; my = e.touches[0].clientY; mAct = true; } }, { passive: true });
  addEventListener("pointerdown", function (e) { if (reduce || document.body.classList.contains("field-off")) return; emitBurst(e.clientX, e.clientY); }, { passive: true });
  addEventListener("resize", function () { clearTimeout(window.__rt); window.__rt = setTimeout(size, 160); });

  // control hooks used by theme + field toggles
  window.__cvRepaintField = function () { try { size(); } catch (e) {} };
  window.__cvPauseField = function () { running = false; };
  window.__cvResumeField = function () { if (reduce) { staticDraw(); return; } if (!running) { running = true; t0 = -1; requestAnimationFrame(frame); } };

  // boot (unless the field is toggled off)
  size();
  if (!document.body.classList.contains("field-off")) {
    if (reduce) { staticDraw(); } else { running = true; requestAnimationFrame(frame); }
  }
})();
