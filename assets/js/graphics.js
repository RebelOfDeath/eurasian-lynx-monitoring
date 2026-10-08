/* Graphic controllers for the sticky scrollytelling blocks.
   Each block <div class="scrolly" data-graphic="NAME"> is driven by
   window.Graphics[NAME]: init(root) once, step(index, direction) whenever a
   step becomes active, visible(bool) when the block enters or leaves the view.
   To add a new block, register another controller here with the same shape. */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SVG = "http://www.w3.org/2000/svg";

  /* ---------- shared helpers (also used by scrolly.js) ---------- */
  var FX = window.LynxFX = {
    reduced: reduced,
    fmt: function (n) { return Math.round(n).toLocaleString("en-US"); },
    count: function (el) {
      var to = parseFloat(el.getAttribute("data-count"));
      var pre = el.getAttribute("data-prefix") || "", suf = el.getAttribute("data-suffix") || "";
      if (reduced) { el.textContent = pre + FX.fmt(to) + suf; return; }
      var t0 = null, dur = 1800;
      function tick(t) {
        if (!t0) t0 = t;
        var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
        el.textContent = pre + FX.fmt(to * e) + suf;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    },
    el: function (name, attrs, parent) {
      var n = document.createElementNS(SVG, name);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(n);
      return n;
    },
    rng: function (seed) { // small deterministic PRNG so schematics look the same on every load
      return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    }
  };

  /* Show one .pane inside root. A pane's entrance (counters plus its enter hook)
     only plays while the block is on screen, and replays each time the block
     comes back into view; leaving resets it. hooks = { enter: {}, leave: {} }. */
  function paneEl(root, name) { return root.querySelector('.pane[data-pane="' + name + '"]'); }
  function resetCounters(pane) {
    if (reduced) return;
    pane.querySelectorAll("[data-count]").forEach(function (el) {
      el.textContent = (el.getAttribute("data-prefix") || "") + "0" + (el.getAttribute("data-suffix") || "");
    });
  }
  function enterPane(root) {
    var name = root.dataset.pane, pane = name && paneEl(root, name), hooks = root.__hooks;
    if (!pane || root.__entered === name) return;
    root.__entered = name;
    setTimeout(function () { pane.querySelectorAll("[data-count]").forEach(FX.count); }, reduced ? 0 : 350);
    if (hooks && hooks.enter && hooks.enter[name]) hooks.enter[name](pane);
  }
  function leavePane(root) {
    var name = root.__entered, pane = name && paneEl(root, name), hooks = root.__hooks;
    root.__entered = null;
    if (!pane) return;
    resetCounters(pane);
    if (hooks && hooks.leave && hooks.leave[name]) hooks.leave[name](pane);
  }
  function setPane(root, name, hooks) {
    root.__hooks = hooks || root.__hooks;
    if (root.dataset.pane === name) return;
    leavePane(root);
    root.dataset.pane = name;
    root.querySelectorAll(".pane").forEach(function (p) { p.classList.toggle("is-active", p.getAttribute("data-pane") === name); });
    if (root.__onscreen) enterPane(root);
  }
  /* Called by scrolly.js when a block enters or leaves the viewport. */
  FX.blockVisible = function (root, on) {
    root.__onscreen = on;
    if (on) enterPane(root); else leavePane(root);
  };
  function paneFor(root, i) {
    var s = root.querySelectorAll(".step")[i];
    return s && s.getAttribute("data-pane");
  }

  var G = window.Graphics = {};

  /* ---------- The case: portrait, then the three pulls ---------- */
  G.tension = {
    init: function (root) {
      this.root = root;
      this.svg = root.querySelector(".pane--triangle svg");
      root.querySelectorAll(".tri__pull").forEach(function (g) { g.style.setProperty("--i", g.getAttribute("data-i")); });
      this.shown = false;
    },
    step: function (i) {
      setPane(this.root, i === 0 ? "portrait" : "triangle");
      this.svg.classList.toggle("is-pulling", i >= 1);
      this.svg.classList.toggle("is-deciding", i >= 2);
    }
  };

  /* ---------- Training data ---------- */
  var POSE = {
    pts: {
      earL: [340, 125], earR: [565, 140], eyeL: [385, 325], eyeR: [480, 328], nose: [425, 400],
      neck: [450, 480], withers: [600, 250], hip: [900, 285],
      flE: [360, 600], flW: [310, 700], flP: [320, 790],
      frE: [560, 590], frW: [545, 720], frP: [530, 825],
      hlK: [740, 560], hlH: [765, 720], hlP: [795, 825],
      hrK: [930, 470], hrH: [995, 650], hrP: [1015, 820]
    },
    bones: [["earL", "eyeL"], ["earR", "eyeR"], ["eyeL", "nose"], ["eyeR", "nose"], ["nose", "neck"],
      ["neck", "withers"], ["withers", "hip"], ["neck", "flE"], ["flE", "flW"], ["flW", "flP"],
      ["withers", "frE"], ["frE", "frW"], ["frW", "frP"], ["hip", "hlK"], ["hlK", "hlH"], ["hlH", "hlP"],
      ["hip", "hrK"], ["hrK", "hrH"], ["hrH", "hrP"]]
  };

  G.data = {
    init: function (root) {
      this.root = root;
      this.canvas = root.querySelector(".dots__canvas");
      this.drawn = 0;
      this.buildPose(root.querySelector(".pose__svg"));
      this.buildWaffle(root.querySelector(".waffle"));
      root.querySelectorAll(".split__svg").forEach(this.buildSplit);
      var self = this;
      window.addEventListener("resize", function () { if (self.drawn) self.drawDots(true); });
      this.hooks = {
        enter: {
          dots: function () { self.drawDots(false); },
          pose: function (p) { p.__t = setTimeout(function () { p.querySelector(".pose__svg").classList.add("is-drawn"); p.querySelector("img").style.filter = "none"; }, 300); },
          broaden: function (p) { p.__t = setTimeout(function () { p.querySelector(".waffle").classList.add("is-drawn"); }, 300); },
          split: function (p) { p.__t = setTimeout(function () { p.querySelectorAll(".split__svg").forEach(function (s) { s.classList.add("is-drawn"); }); }, 300); }
        },
        leave: {
          dots: function () { self.clearDots(); },
          pose: function (p) { clearTimeout(p.__t); p.querySelector(".pose__svg").classList.remove("is-drawn"); p.querySelector("img").style.filter = ""; },
          broaden: function (p) { clearTimeout(p.__t); p.querySelector(".waffle").classList.remove("is-drawn"); },
          split: function (p) { clearTimeout(p.__t); p.querySelectorAll(".split__svg").forEach(function (s) { s.classList.remove("is-drawn"); }); }
        }
      };
    },
    clearDots: function () {
      this.run = (this.run || 0) + 1; // cancels a reveal still in progress
      this.drawn = 0;
      var c = this.canvas;
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
    },
    step: function (i) {
      setPane(this.root, paneFor(this.root, i), this.hooks);
    },
    /* 39,760 dots on a canvas, one per CzechLynx image, revealed in random order */
    drawDots: function (instant) {
      if (!instant) this.clearDots();
      // Integer device-pixel grid so 39,760 tiny dots render crisp, without moiré.
      var N = 39760, cols = 221, rows = Math.ceil(N / cols);
      var c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cell = Math.max(2, Math.floor(c.clientWidth * dpr / cols));
      var size = cell > 3 ? cell - 1 : 1;
      c.width = cols * cell; c.height = rows * cell;
      c.style.width = (cols * cell / dpr) + "px";
      c.style.height = (rows * cell / dpr) + "px";
      var ctx = c.getContext("2d");
      ctx.fillStyle = getComputedStyle(this.root).getPropertyValue("--amber").trim() || "#d27a2c";
      if (!this.order) {
        var o = new Uint32Array(N), shade = new Float32Array(N), r = FX.rng(7);
        for (var i = 0; i < N; i++) { o[i] = i; shade[i] = .6 + r() * .4; }
        for (i = N - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = o[i]; o[i] = o[j]; o[j] = t; }
        this.order = o; this.shade = shade;
      }
      var order = this.order, shade = this.shade;
      function dot(k) {
        var n = order[k];
        ctx.globalAlpha = shade[n];
        ctx.fillRect((n % cols) * cell, Math.floor(n / cols) * cell, size, size);
      }
      if (instant || reduced || this.drawn >= N) { for (var k = 0; k < N; k++) dot(k); this.drawn = N; return; }
      var self = this, t0 = null, dur = 2800, run = this.run;
      function frame(t) {
        if (run !== self.run) return;
        if (!t0) t0 = t;
        var p = Math.min(1, (t - t0) / dur), target = Math.floor(N * (1 - Math.pow(1 - p, 2)));
        for (var k = self.drawn; k < target; k++) dot(k);
        self.drawn = target;
        if (p < 1) requestAnimationFrame(frame); else self.drawn = N;
      }
      requestAnimationFrame(frame);
    },
    buildPose: function (svg) {
      var P = POSE.pts, names = Object.keys(P), idx = {};
      names.forEach(function (n, i) { idx[n] = i; });
      POSE.bones.forEach(function (b) {
        var a = P[b[0]], z = P[b[1]], len = Math.hypot(z[0] - a[0], z[1] - a[1]);
        var l = FX.el("line", { x1: a[0], y1: a[1], x2: z[0], y2: z[1] }, svg);
        l.style.setProperty("--len", len);
        l.style.setProperty("--d", (Math.max(idx[b[0]], idx[b[1]]) * 90 + 200) + "ms");
      });
      names.forEach(function (n, i) {
        var c = FX.el("circle", { cx: P[n][0], cy: P[n][1], r: 11 }, svg);
        c.style.setProperty("--d", (i * 90) + "ms");
      });
    },
    buildWaffle: function (box) {
      // 76 of 100 frames empty (Snapshot Serengeti). Fill in reading order, animals last.
      for (var i = 0; i < 100; i++) {
        var cell = document.createElement("i");
        if (i >= 76) cell.className = "is-animal";
        cell.style.setProperty("--d", (i * 14) + "ms");
        box.appendChild(cell);
      }
    },
    buildSplit: function (svg) {
      var geo = svg.getAttribute("data-mode") === "geo";
      var held = { 2: 1, 7: 1, 9: 1 }, r = FX.rng(11), k = 0;
      for (var s = 0; s < 12; s++) {
        var cx = 45 + (s % 4) * 70, cy = 45 + Math.floor(s / 4) * 65;
        FX.el("circle", { cx: cx, cy: cy, r: 27, class: "site" }, svg);
        for (var d = 0; d < 7; d++) {
          var a = d * Math.PI / 3, rad = d === 6 ? 0 : 13;
          var val = geo ? !!held[s] : r() < .22;
          var dot = FX.el("circle", { cx: cx + Math.cos(a) * rad, cy: cy + Math.sin(a) * rad, r: 5, class: val ? "is-val" : "" }, svg);
          dot.style.setProperty("--d", (k++ * 9) + "ms");
        }
      }
    }
  };

  /* ---------- Training strategy: one bar chart that morphs per step ---------- */
  var BAR_MODES = [
    { title: "Parameters, in millions", max: 30, axis: "0 to 30 million parameters",
      caption: "Image-classification backbones. Sources: Tan & Le 2019; Howard et al. 2019.",
      rows: [
        { id: "r50", label: "ResNet-50", v: 26, text: "26M" },
        { id: "b0", label: "EfficientNet-B0", v: 5.3, text: "5.3M", hi: true },
        { id: "mnl", label: "MobileNetV3-Large", v: 5.4, text: "5.4M" },
        { id: "mns", label: "MobileNetV3-Small", v: 2.5, text: "2.5M" }] },
    { title: "Operations per image, in billions", max: 4.5, axis: "0 to 4.5 billion multiply-adds",
      caption: "Multiply-adds as each paper reports them. Sources: Tan & Le 2019; Howard et al. 2019.",
      rows: [
        { id: "r50", label: "ResNet-50", v: 4.1, text: "4.1B", sub: "76.0% top-1" },
        { id: "b0", label: "EfficientNet-B0", v: .39, text: "0.39B", sub: "77.1% top-1", hi: true },
        { id: "mnl", label: "MobileNetV3-Large", v: .219, text: "0.22B", sub: "75.2% top-1" },
        { id: "mns", label: "MobileNetV3-Small", v: .056, text: "0.056B", sub: "≈67.5% top-1" }] },
    { title: "Wildlife detector parameters, in millions", max: 130, axis: "0 to 130 million parameters",
      caption: "Recall as reported for Pytorch-Wildlife. Sources: Hernandez et al. 2024; Beery et al. 2019.",
      rows: [
        { id: "md5", label: "MegaDetector v5", small: "full model", v: 121, text: "121M", sub: "recall 0.73" },
        { id: "md6", label: "MegaDetector v6", small: "compact variant", v: 22, text: "22M", sub: "recall 0.85", hi: true }] },
    { title: "Cloud GPU price per hour, on demand (USD)", max: 24, axis: "$0 to $24 per hour, AWS us-east-1, September 2026",
      caption: "Spot ranges apply the 60 to 70% reduction. Source: AWS EC2 pricing.",
      rows: [
        { id: "t4", label: "g4dn.xlarge", small: "1× T4", v: .526, text: "$0.53", sub: "spot ≈ $0.16 to $0.21", hi: true },
        { id: "l4", label: "g6.xlarge", small: "1× L4", v: .805, text: "$0.81" },
        { id: "a10", label: "g5.xlarge", small: "1× A10G", v: 1.006, text: "$1.01" },
        { id: "a100", label: "p4d.24xlarge", small: "8× A100", v: 21.96, text: "$21.96", sub: "spot ≈ $6.59 to $8.78" }] }
  ];

  G.training = {
    init: function (root) {
      this.root = root;
      this.box = root.querySelector(".bars");
      this.title = root.querySelector(".bars__title");
      this.axis = root.querySelector(".bars__axis");
      this.caption = root.querySelector(".bars__caption");
      this.mode = -1;
    },
    step: function (i) {
      if (i === this.mode) return;
      var m = BAR_MODES[i], self = this;
      var delay = this.box.children.length ? 380 : 0;
      var sameRows = this.mode >= 0 && BAR_MODES[this.mode].rows.map(function (r) { return r.id; }).join() === m.rows.map(function (r) { return r.id; }).join();
      this.mode = i;
      this.box.setAttribute("aria-label", m.title + ": " + m.rows.map(function (r) { return r.label + " " + r.text; }).join(", "));
      function apply() {
        self.title.textContent = m.title;
        self.axis.textContent = m.axis;
        self.caption.textContent = m.caption;
        m.rows.forEach(function (r) {
          var row = self.box.querySelector('[data-id="' + r.id + '"]');
          row.classList.toggle("is-dim", !r.hi);
          row.setAttribute("data-tip", r.label + (r.small ? " (" + r.small + ")" : "") + ": " + r.text + (r.sub ? ", " + r.sub : ""));
          row.querySelector(".bar-row__value").innerHTML = r.text + (r.sub ? " <small>" + r.sub + "</small>" : "");
          row.querySelector(".bar-row__label").innerHTML = r.label + (r.small ? "<small>" + r.small + "</small>" : "");
          var bar = row.querySelector(".bar-row__bar");
          requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.setProperty("--f", r.v / m.max); }); });
        });
      }
      if (sameRows) { apply(); return; }
      this.box.style.opacity = 0;
      setTimeout(function () {
        self.box.innerHTML = m.rows.map(function (r) {
          return '<div class="bar-row" data-id="' + r.id + '"><span class="bar-row__label"></span>' +
            '<span class="bar-row__track"><span class="bar-row__bar"></span><span class="bar-row__value"></span></span></div>';
        }).join("");
        apply();
        self.box.style.opacity = 1;
      }, delay);
    }
  };

  /* ---------- Deployment: cloud versus edge pipeline ---------- */
  var MESSAGE = '{"c":"B07","sp":"lynx","p":0.94,"t":"03:12"}';

  G.deploy = {
    init: function (root) {
      this.root = root;
      this.pane = root.querySelector(".pane--pipeline");
      this.layer = root.querySelector(".pipe__packets");
      this.paths = { cloud: root.querySelector("#path-cloud"), edge: root.querySelector("#path-edge") };
      this.caption = root.querySelector(".pipe__caption");
      var bytes = new TextEncoder().encode(MESSAGE).length;
      root.querySelector(".pipe__code").textContent = MESSAGE;
      root.querySelector(".pipe__bytes").textContent = "Example detection message: " + bytes + " bytes" + (bytes <= 44 ? ", fits one 44-byte uplink" : "");
      this.packets = [];
      this.running = false;
      this.mode = "cloud";
      this.onScreen = false;
      this.pane.classList.add("mode-cloud");
    },
    step: function (i) {
      var name = paneFor(this.root, i);
      setPane(this.root, name);
      if (name === "pipeline") {
        this.mode = i === 0 ? "cloud" : "edge";
        this.pane.classList.toggle("mode-cloud", this.mode === "cloud");
        this.pane.classList.toggle("mode-edge", this.mode === "edge");
        this.caption.textContent = this.mode === "cloud"
          ? "Cloud inference: every trigger uploads a full image."
          : "Edge inference: only a short detection message leaves the forest.";
      }
      this.pipelineOn = name === "pipeline";
      this.sync();
    },
    visible: function (on) { this.onScreen = on; this.sync(); },
    sync: function () {
      var want = this.onScreen && this.pipelineOn && !reduced;
      if (want && !this.running) { this.running = true; this.last = 0; this.spawnAt = 0; requestAnimationFrame(this.tick.bind(this)); }
      if (!want) this.running = false;
    },
    tick: function (t) {
      if (!this.running) { this.packets.forEach(function (p) { p.node.remove(); }); this.packets = []; return; }
      var cloud = this.mode === "cloud";
      if (t >= this.spawnAt) {
        var node = cloud
          ? FX.el("rect", { width: 26, height: 20, rx: 3, x: -13, y: -10 }, this.layer)
          : FX.el("circle", { r: 6 }, this.layer);
        this.packets.push({ node: node, path: this.paths[this.mode], t0: t, dur: cloud ? 2600 : 2000 });
        this.spawnAt = t + (cloud ? 650 : 1500);
      }
      this.packets = this.packets.filter(function (p) {
        var k = (t - p.t0) / p.dur;
        if (k >= 1) { p.node.remove(); return false; }
        var e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        var pt = p.path.getPointAtLength(e * p.path.getTotalLength());
        p.node.setAttribute("transform", "translate(" + pt.x + " " + pt.y + ")");
        p.node.style.opacity = Math.min(1, k * 8, (1 - k) * 8);
        return true;
      });
      requestAnimationFrame(this.tick.bind(this));
    }
  };
})();
