/* Scroll engine: step activation for sticky graphics, reveal-on-scroll,
   counters, the top bar (progress, current chapter, theme), hero parallax,
   hover tooltips and presenter keys (→ / ← jump between [data-stop] points). */
(function () {
  "use strict";
  var FX = window.LynxFX, G = window.Graphics;
  var reduced = FX.reduced;

  /* ---------- counters start from zero ---------- */
  if (!reduced) document.querySelectorAll("[data-count]").forEach(function (el) {
    el.textContent = (el.getAttribute("data-prefix") || "") + "0" + (el.getAttribute("data-suffix") || "");
  });

  /* ---------- reveals (with optional stagger) ---------- */
  document.querySelectorAll("[data-reveal-stagger]").forEach(function (box) {
    box.querySelectorAll("[data-reveal]").forEach(function (el, i) { el.style.setProperty("--d", i * 140 + "ms"); });
  });
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add("is-in");
      revealIO.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -12% 0px" });
  document.querySelectorAll("[data-reveal]").forEach(function (el) { revealIO.observe(el); });

  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      FX.count(en.target);
      countIO.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -20% 0px" });
  document.querySelectorAll("[data-count]").forEach(function (el) { if (!el.closest(".pane")) countIO.observe(el); });

  /* ---------- sticky scrollytelling blocks ---------- */
  document.querySelectorAll(".scrolly[data-graphic]").forEach(function (block) {
    var ctrl = G[block.getAttribute("data-graphic")];
    if (!ctrl) { console.warn("No graphic controller for", block.getAttribute("data-graphic")); return; }
    ctrl.init(block);
    var steps = Array.prototype.slice.call(block.querySelectorAll(".step"));
    var current = -1;
    function activate(i) {
      if (i === current) return;
      var dir = i > current ? 1 : -1;
      current = i;
      steps.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
      ctrl.step(i, dir);
    }
    activate(0);
    var stepIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) activate(steps.indexOf(en.target)); });
    }, { rootMargin: "-48% 0px -48% 0px" });
    steps.forEach(function (s) { stepIO.observe(s); });
    // "On screen" starts once the block's top passes 70% of the viewport height.
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        FX.blockVisible(block, en.isIntersecting);
        if (ctrl.visible) ctrl.visible(en.isIntersecting);
      });
    }, { rootMargin: "0px 0px -30% 0px" }).observe(block);
  });

  /* ---------- closing slide: line drawing replays on each visit ---------- */
  document.querySelectorAll("[data-draw]").forEach(function (el) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { el.classList.toggle("is-drawn", en.isIntersecting); });
    }, { threshold: .35 }).observe(el);
  });

  /* ---------- top bar, progress, parallax ---------- */
  var bar = document.getElementById("topbar"), progress = document.getElementById("progress");
  var hero = document.querySelector(".hero");
  var navLinks = {};
  document.querySelectorAll("[data-nav]").forEach(function (a) { navLinks[a.getAttribute("data-nav")] = a; });
  var chapters = Array.prototype.slice.call(document.querySelectorAll("[data-chapter]"));
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    var max = document.documentElement.scrollHeight - vh;
    progress.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : 0);
    var hh = hero.offsetHeight;
    if (!reduced && y < hh) hero.style.setProperty("--hero-p", (y / hh).toFixed(3));
    bar.classList.toggle("is-solid", y > hh * .6);
    var under = document.elementFromPoint(12, bar.offsetHeight + 4);
    var themed = under && under.closest(".theme-dark, .theme-light");
    bar.classList.toggle("on-dark", !!themed && themed.classList.contains("theme-dark"));
    var active = null;
    chapters.forEach(function (c) { if (c.getBoundingClientRect().top < vh * .45) active = c.getAttribute("data-chapter"); });
    for (var k in navLinks) navLinks[k].classList.toggle("is-current", k === active);
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  /* ---------- tooltips for chart marks ---------- */
  var tip = document.getElementById("tip");
  document.addEventListener("mousemove", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute("data-tip");
    tip.hidden = false;
    var x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px";
    tip.style.top = (ev.clientY + 16) + "px";
  });

  /* ---------- presenter keys ---------- */
  var stops = Array.prototype.slice.call(document.querySelectorAll("[data-stop]"));
  function anchor(el) {
    var r = el.getBoundingClientRect(), top = r.top + window.scrollY;
    if (el.classList.contains("step")) {
      var card = el.querySelector(".step__card") || el;
      var cr = card.getBoundingClientRect();
      // Phones pin the graphic at the top, so park the card near the bottom edge.
      if (window.innerWidth <= 900) return cr.bottom + window.scrollY - window.innerHeight + 16;
      return cr.top + window.scrollY + cr.height / 2 - window.innerHeight / 2;
    }
    return el.classList.contains("hero") ? 0 : top - bar.offsetHeight;
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    var fwd = ev.key === "ArrowRight" || ev.key === "PageDown";
    var back = ev.key === "ArrowLeft" || ev.key === "PageUp";
    if (!fwd && !back) return;
    ev.preventDefault();
    var y = window.scrollY, targets = stops.map(anchor), goal = null;
    if (fwd) { for (var i = 0; i < targets.length; i++) if (targets[i] > y + 8) { goal = targets[i]; break; } }
    else { for (var j = targets.length - 1; j >= 0; j--) if (targets[j] < y - 8) { goal = targets[j]; break; } }
    if (goal !== null) window.scrollTo({ top: Math.max(0, goal), behavior: reduced ? "auto" : "smooth" });
  });
})();
