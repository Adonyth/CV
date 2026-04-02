(function () {
  var STORAGE_KEY = "academic-cv-locale";
  var BG_STORAGE_KEY = "academic-cv-bg-hidden";
  var html = document.documentElement;

  function getStoredLocale() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredLocale(locale) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) {
      /* ignore */
    }
  }

  function applyLocale(locale) {
    var isZh = locale === "zh";
    html.classList.remove("locale-en", "locale-zh");
    html.classList.add(isZh ? "locale-zh" : "locale-en");
    html.setAttribute("lang", isZh ? "zh-Hans" : "en");

    document.title = isZh ? "陈嘉轩 — 学术简历" : "Jiaxuan Chen — Academic CV";

    var desc =
      isZh
        ? "学术简历 — 陈嘉轩（Jiaxuan Chen），物理学"
        : "Academic CV — Jiaxuan Chen (陈嘉轩), Physics";
    var meta = document.getElementById("meta-desc");
    if (meta) meta.setAttribute("content", desc);
    var ogDesc = document.getElementById("meta-og-desc");
    if (ogDesc) ogDesc.setAttribute("content", desc);
    var ogTitle = document.getElementById("meta-og-title");
    if (ogTitle) {
      ogTitle.setAttribute(
        "content",
        isZh ? "陈嘉轩 — 学术简历" : "Jiaxuan Chen — Academic CV"
      );
    }

    var skip = document.getElementById("skip-link");
    if (skip) {
      skip.textContent = isZh ? "跳到正文" : "Skip to content";
    }

    var btnEn = document.getElementById("btn-en");
    var btnZh = document.getElementById("btn-zh");
    if (btnEn && btnZh) {
      btnEn.classList.toggle("lang-switch__btn--active", !isZh);
      btnEn.setAttribute("aria-pressed", !isZh ? "true" : "false");
      btnZh.classList.toggle("lang-switch__btn--active", isZh);
      btnZh.setAttribute("aria-pressed", isZh ? "true" : "false");
    }

    setStoredLocale(locale);
    refreshBgToggleAria();
  }

  function getStoredBgHidden() {
    try {
      return localStorage.getItem(BG_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredBgHidden(hidden) {
    try {
      localStorage.setItem(BG_STORAGE_KEY, hidden ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function refreshBgToggleAria() {
    var btn = document.getElementById("btn-bg-toggle");
    if (!btn) return;
    var hidden = document.body.classList.contains("cv-bg-hidden");
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    var isZh = html.classList.contains("locale-zh");
    btn.setAttribute(
      "aria-label",
      hidden
        ? isZh
          ? "显示背景动画与装饰"
          : "Show background and animation"
        : isZh
          ? "隐藏背景，仅保留纯色底"
          : "Hide backgrounds (solid color only)"
    );
  }

  function applyBgHidden(hidden) {
    document.body.classList.toggle("cv-bg-hidden", !!hidden);
    setStoredBgHidden(!!hidden);
    refreshBgToggleAria();
  }

  function initBgToggle() {
    var stored = getStoredBgHidden();
    if (stored === "1") {
      applyBgHidden(true);
    } else if (stored === "0") {
      applyBgHidden(false);
    } else {
      refreshBgToggleAria();
    }

    var btnBg = document.getElementById("btn-bg-toggle");
    if (btnBg) {
      btnBg.addEventListener("click", function () {
        applyBgHidden(!document.body.classList.contains("cv-bg-hidden"));
      });
    }
  }

  function ensurePrintPrep() {
    html.classList.add("print-prep");
  }

  function clearPrintPrep() {
    html.classList.remove("print-prep");
  }

  /** Fixes blank PDF: hide fixed WebGL iframe before compositing; reset after dialog closes. */
  function initPrintFix() {
    window.addEventListener("beforeprint", ensurePrintPrep);
    window.addEventListener("afterprint", clearPrintPrep);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        clearPrintPrep();
      }
    });
  }

  function initLocale() {
    var stored = getStoredLocale();
    if (stored === "zh" || stored === "en") {
      applyLocale(stored);
      return;
    }
    var nav = navigator.language || "";
    if (nav.toLowerCase().startsWith("zh")) {
      applyLocale("zh");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initLocale();
    initBgToggle();
    initPrintFix();

    var langSwitch = document.getElementById("lang-switch");
    if (langSwitch) {
      langSwitch.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-locale]");
        if (!btn) return;
        var loc = btn.getAttribute("data-locale");
        if (loc === "en" || loc === "zh") applyLocale(loc);
      });
    }

    var btnPdf = document.getElementById("btn-pdf");
    if (btnPdf) {
      btnPdf.addEventListener("click", function () {
        ensurePrintPrep();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            window.print();
          });
        });
      });
    }
  });
})();
