/* demos/ringdown.js — an interactive Kerr black-hole ringdown.
   Real physics: quasinormal-mode frequencies from the Berti–Cardoso–Will (2006) fits
   (dimensionless Mω, accurate to ~1%). Drag the spin; watch the dominant mode (ℓ=2,m=2,n=0)
   and its first OVERTONE (n=1) ring down — the overtone is what makes the earliest post-merger
   signal informative (the theme of the research this page describes). Self-contained, zero deps.
   Mounts into any <div data-demo="ringdown">. */
(function () {
  "use strict";
  // Berti-Cardoso-Will fit: Mω_R = f1 + f2 (1-a)^f3 ;  Q = q1 + q2 (1-a)^q3 ;  Mω_I = Mω_R/(2Q)
  var MODES = {
    "220": { f: [1.5251, -1.1568, 0.1292], q: [0.7000, 1.4187, -0.4990], label: "ℓ=2, m=2, n=0", col: "#e0876a" },
    "221": { f: [1.3673, -1.0260, 0.1628], q: [0.1000, 0.5436, -0.4731], label: "ℓ=2, m=2, n=1 (overtone)", col: "#5aa0d8" }
  };
  function mode(a, m) {
    var x = Math.max(1e-4, 1 - a);
    var wR = m.f[0] + m.f[1] * Math.pow(x, m.f[2]);
    var Q = m.q[0] + m.q[1] * Math.pow(x, m.q[2]);
    var wI = wR / (2 * Q);           // Mω_I  (inverse damping time in units of 1/M)
    return { wR: wR, Q: Q, wI: wI, tau: 1 / wI };
  }

  function mount(host) {
    if (host.dataset.done) return; host.dataset.done = "1";
    var wrap = document.createElement("div"); wrap.className = "rd";
    wrap.innerHTML =
      '<div class="rd-head"><span class="rd-eyebrow">INTERACTIVE · 交互</span>' +
      '<span class="rd-title">Kerr ringdown — quasinormal modes · 黑洞铃宕</span></div>' +
      '<canvas class="rd-canvas" width="900" height="230"></canvas>' +
      '<div class="rd-ctl"><label class="rd-lab">spin a/M · 自旋 <b class="rd-aval">0.70</b></label>' +
      '<input class="rd-spin" type="range" min="0" max="0.99" step="0.01" value="0.70">' +
      '<label class="rd-otog"><input class="rd-ov" type="checkbox" checked> <span>overtone n=1 · 泛音</span></label></div>' +
      '<div class="rd-read"></div>' +
      '<div class="rd-note">Frequencies from the Berti–Cardoso–Will fit (dimensionless Mω). Higher spin → ' +
      'higher frequency and slower decay. The overtone rings faster and dies sooner — it dominates only the ' +
      'earliest ringdown, which is why its significance must be established against real detector noise.</div>';
    host.appendChild(wrap);

    var cv = wrap.querySelector(".rd-canvas"), ctx = cv.getContext("2d");
    var spin = wrap.querySelector(".rd-spin"), aval = wrap.querySelector(".rd-aval");
    var ovBox = wrap.querySelector(".rd-ov"), read = wrap.querySelector(".rd-read");
    var a = 0.70, useOv = true, t0 = 0;

    function fmt(n, d) { return n.toFixed(d == null ? 3 : d); }
    function refresh() {
      a = parseFloat(spin.value); useOv = ovBox.checked; aval.textContent = fmt(a, 2);
      var m0 = mode(a, MODES["220"]), m1 = mode(a, MODES["221"]);
      read.innerHTML =
        row(MODES["220"], m0) + (useOv ? row(MODES["221"], m1) : "");
    }
    function row(M, r) {
      return '<div class="rd-row"><span class="rd-dot" style="background:' + M.col + '"></span>' +
        '<span class="rd-ml">' + M.label + '</span>' +
        '<span class="rd-mv">Mω<sub>R</sub> = ' + fmt(r.wR) + '</span>' +
        '<span class="rd-mv">Q = ' + fmt(r.Q, 2) + '</span>' +
        '<span class="rd-mv">τ/M = ' + fmt(r.tau, 1) + '</span></div>';
    }

    function draw(ts) {
      if (!t0) t0 = ts; var phase = ((ts - t0) * 0.00028) % 1;   // slow sweep of the time window
      var W = cv.width, H = cv.height, mid = H * 0.52;
      ctx.clearRect(0, 0, W, H);
      // baseline
      ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      var m0 = mode(a, MODES["220"]), m1 = mode(a, MODES["221"]);
      var Tmax = 80;                       // time window in units of M
      function plot(md, m, amp, col) {
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
        for (var px = 0; px <= W; px++) {
          var t = (px / W) * Tmax;
          var h = amp * Math.exp(-m.wI * t) * Math.cos(m.wR * t);
          var y = mid - h * (H * 0.34);
          if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
        }
        ctx.stroke();
      }
      // total strain = 220 + (optional) 221; then the two components faintly
      ctx.strokeStyle = "#f4ecdf"; ctx.lineWidth = 2.4; ctx.beginPath();
      for (var px = 0; px <= W; px++) {
        var t = (px / W) * Tmax;
        var h = Math.exp(-m0.wI * t) * Math.cos(m0.wR * t);
        if (useOv) h += 0.55 * Math.exp(-m1.wI * t) * Math.cos(m1.wR * t + 1.1);
        var y = mid - h * (H * 0.30);
        if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.5; plot(MODES["220"], m0, 1, MODES["220"].col);
      if (useOv) plot(MODES["221"], m1, 0.55, MODES["221"].col); ctx.globalAlpha = 1;
      // a soft "merger" marker at t=0
      ctx.fillStyle = "rgba(224,135,106,.5)"; ctx.fillRect(0, 12, 2, H - 24);
      ctx.fillStyle = "rgba(233,224,210,.5)"; ctx.font = "11px 'JetBrains Mono',monospace";
      ctx.fillText("t = 0  (merger)", 8, 22); ctx.fillText("time →  (units of M)", W - 150, H - 10);
      requestAnimationFrame(draw);
    }
    spin.addEventListener("input", refresh);
    ovBox.addEventListener("change", refresh);
    refresh(); requestAnimationFrame(draw);
  }

  var css = document.createElement("style");
  css.textContent =
    ".rd{margin:var(--s6,28px) 0;border:1px solid var(--hairline,rgba(255,255,255,.12));border-radius:14px;" +
      "padding:18px;background:rgba(255,255,255,.015)}" +
    ".rd-head{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}" +
    ".rd-eyebrow{font-family:var(--mono,monospace);font-size:11px;letter-spacing:.18em;color:var(--accent,#c9975f)}" +
    ".rd-title{font-size:15px;color:var(--ink,#f4ecdf)}" +
    ".rd-canvas{width:100%;height:auto;display:block;border-radius:8px;background:rgba(0,0,0,.22)}" +
    ".rd-ctl{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:14px 0 6px}" +
    ".rd-lab{font-family:var(--mono,monospace);font-size:12px;color:var(--body,#cbb89f)}" +
    ".rd-lab b{color:var(--ink,#f4ecdf)}" +
    ".rd-spin{flex:1;min-width:180px;accent-color:#e0876a}" +
    ".rd-otog{font-family:var(--mono,monospace);font-size:12px;color:var(--body,#cbb89f);display:flex;align-items:center;gap:6px;cursor:pointer}" +
    ".rd-read{display:flex;flex-direction:column;gap:6px;margin-top:8px}" +
    ".rd-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-family:var(--mono,monospace);font-size:12px;color:var(--body,#cbb89f)}" +
    ".rd-dot{width:9px;height:9px;border-radius:50%;flex:none}" +
    ".rd-ml{min-width:180px;color:var(--ink,#f4ecdf)}" +
    ".rd-mv sub{font-size:9px}" +
    ".rd-note{margin-top:12px;font-size:12.5px;line-height:1.55;color:var(--muted,#9a8a6f)}";
  document.head.appendChild(css);

  function boot() { document.querySelectorAll('[data-demo="ringdown"]').forEach(mount); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
