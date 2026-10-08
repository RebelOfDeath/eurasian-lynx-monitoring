/* Citations: turns <a class="cite" data-cite="Key1,Key2"></a> into numbered
   links to the source, adds a hover/focus preview card, renders the source
   chips for [data-source-group] and builds the reference list.
   All data comes from window.SOURCES (generated from paper/main.bib). */
(function () {
  "use strict";
  var DATA = window.SOURCES || { groups: [], entries: {} };
  var E = DATA.entries;
  var order = [];            // keys in order of first citation
  var number = {};           // key -> citation number
  var firstCite = {};        // key -> id of first in-text citation
  var pop = document.getElementById("cite-pop");
  var hoverOnly = window.matchMedia("(hover: hover)").matches;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }
  function link(e, cls, text, extra) {
    if (!e.url) return '<span class="' + cls + '">' + text + "</span>";
    return '<a class="' + cls + '" href="' + esc(e.url) + '" target="_blank" rel="noopener"' + (extra || "") + ">" + text + "</a>";
  }

  /* ---- in-text citations ---- */
  var cites = document.querySelectorAll(".cite[data-cite]");
  cites.forEach(function (el, i) {
    var keys = el.getAttribute("data-cite").split(",").map(function (k) { return k.trim(); });
    var parts = [];
    keys.forEach(function (k) {
      var e = E[k];
      if (!e) { console.warn("Unknown citation key:", k); return; }
      if (!(k in number)) { order.push(k); number[k] = order.length; }
      var inTable = !!el.closest(".figure-data");
      if (!firstCite[k] && !inTable) firstCite[k] = "cite-" + i;
      parts.push(link(e, "", number[k], ' data-key="' + esc(k) + '" aria-label="Source ' + number[k] + ": " + esc(e.title) + '"'));
    });
    var span = document.createElement("span");
    span.className = "cite";
    span.id = "cite-" + i;
    span.innerHTML = "[" + parts.join(", ") + "]";
    el.replaceWith(span);
  });

  /* ---- source chips for upcoming chapters ---- */
  var groups = {};
  DATA.groups.forEach(function (g) { groups[g.id] = g; });
  document.querySelectorAll("[data-source-group]").forEach(function (box) {
    var g = groups[box.getAttribute("data-source-group")];
    if (!g) return;
    box.innerHTML = g.keys.map(function (k) {
      var e = E[k];
      return link(e, "chip", esc(e.label), ' data-key="' + esc(k) + '"');
    }).join("");
  });

  /* ---- preview card ---- */
  var hideTimer = null, current = null;
  function show(a) {
    var e = E[a.getAttribute("data-key")];
    if (!e) return;
    clearTimeout(hideTimer);
    current = a;
    pop.innerHTML =
      '<p class="cite-pop__meta">' + esc(e.authors || e.label) + (e.year ? ", " + esc(e.year) : "") + "</p>" +
      '<p class="cite-pop__title">' + esc(e.title) + "</p>" +
      (e.venue ? '<p class="cite-pop__venue">' + esc(e.venue) + "</p>" : "") +
      (e.url ? '<a class="cite-pop__open" href="' + esc(e.url) + '" target="_blank" rel="noopener">Open source on ' + esc(host(e.url)) + " ↗</a>" : "");
    pop.hidden = false;
    var r = a.getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    var top = r.bottom + 10;
    if (top + h > window.innerHeight - 12) top = r.top - h - 10;
    pop.style.left = left + "px";
    pop.style.top = Math.max(12, top) + "px";
    requestAnimationFrame(function () { pop.classList.add("is-open"); });
  }
  function hide(delay) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      pop.classList.remove("is-open");
      current = null;
      setTimeout(function () { if (!current) pop.hidden = true; }, 230);
    }, delay || 0);
  }
  function target(ev) { return ev.target.closest && ev.target.closest("a[data-key]"); }

  document.addEventListener("mouseover", function (ev) { var a = target(ev); if (a && hoverOnly) show(a); });
  document.addEventListener("mouseout", function (ev) { if (target(ev) && hoverOnly) hide(180); });
  document.addEventListener("focusin", function (ev) { var a = target(ev); if (a) show(a); });
  document.addEventListener("focusout", function (ev) { if (target(ev)) hide(180); });
  pop.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
  pop.addEventListener("mouseleave", function () { hide(120); });
  // On touch screens the first tap previews the source; the card's link opens it.
  document.addEventListener("click", function (ev) {
    var a = target(ev);
    if (a && !hoverOnly && current !== a) { ev.preventDefault(); show(a); return; }
    if (!a && !pop.contains(ev.target) && current) hide(0);
  });
  window.addEventListener("scroll", function () { if (current) hide(0); }, { passive: true });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hide(0); });

  /* ---- reference list ---- */
  function refItem(k, n) {
    var e = E[k];
    var meta = [e.authors, e.venue, e.year].filter(Boolean).map(esc).join(", ");
    var links = [];
    if (e.url) links.push('<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(host(e.url)) + " ↗</a>");
    (e.links || []).forEach(function (l) { links.push('<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + " ↗</a>"); });
    if (firstCite[k]) links.push('<a href="#' + firstCite[k] + '">Back to text ↑</a>');
    var li = document.createElement("li");
    li.id = "ref-" + k;
    li.dataset.search = [e.authors, e.title, e.venue, e.year, e.label].join(" ").toLowerCase();
    li.innerHTML =
      '<span class="ref__n">' + (n ? n : "") + "</span><div>" +
      link(e, "ref__title", esc(e.title)) +
      '<span class="ref__meta">' + meta + "</span>" +
      (e.note ? '<span class="ref__meta">' + esc(e.note) + "</span>" : "") +
      '<span class="ref__links">' + links.join("") + "</span></div>";
    return li;
  }
  var cited = document.getElementById("refs-cited");
  if (cited) order.forEach(function (k) { cited.appendChild(refItem(k, number[k])); });

  var more = document.getElementById("refs-more");
  if (more) {
    DATA.groups.forEach(function (g) {
      var rest = g.keys.filter(function (k) { return !(k in number); });
      if (!rest.length) return;
      var h = document.createElement("h4");
      h.className = "ref__group";
      h.textContent = (g.part ? "Part " + g.part + ": " : "") + g.label;
      var ol = document.createElement("ol");
      ol.className = "refs";
      rest.forEach(function (k) { ol.appendChild(refItem(k, null)); });
      more.appendChild(h);
      more.appendChild(ol);
    });
  }

  var filter = document.getElementById("source-filter");
  if (filter) filter.addEventListener("input", function () {
    var q = filter.value.trim().toLowerCase();
    document.querySelectorAll(".refs li").forEach(function (li) {
      li.hidden = q && li.dataset.search.indexOf(q) === -1;
    });
    document.querySelectorAll(".ref__group").forEach(function (h) {
      var list = h.nextElementSibling;
      h.hidden = !list.querySelector("li:not([hidden])");
    });
  });
})();
