const SVG_NS = "http://www.w3.org/2000/svg";
const STYLES = ["dot", "segment", "hybrid", "wire", "stencil"];
const STYLE_LABELS = {
  dot: "Dot Matrix",
  segment: "Segment",
  hybrid: "Hybrid",
  wire: "Wire",
  stencil: "Stencil"
};

const reduceMotion = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };

const app = document.getElementById("app");
const stage = document.getElementById("stage");
const clock = document.getElementById("clock");
const controls = document.getElementById("controls");
const themeToggle = document.getElementById("themeToggle");
const toast = document.getElementById("toast");
const styleButtons = Array.from(document.querySelectorAll("[data-style-choice]"));

const DOT_PATTERNS = {
  "0": ["01110","11011","11011","11011","11011","11011","01110"],
  "1": ["00110","01110","00110","00110","00110","00110","01110"],
  "2": ["01110","11011","00011","00110","01100","11000","11111"],
  "3": ["11110","00011","00011","01110","00011","00011","11110"],
  "4": ["10011","10011","10011","11111","00011","00011","00011"],
  "5": ["11111","11000","11000","11110","00011","00011","11110"],
  "6": ["01110","11000","11000","11110","11011","11011","01110"],
  "7": ["11111","00011","00110","00110","01100","01100","01100"],
  "8": ["01110","11011","11011","01110","11011","11011","01110"],
  "9": ["01110","11011","11011","01111","00011","00011","01110"]
};

const SEGMENTS = {
  "0": ["a","b","c","d","e","f"],
  "1": ["b","c"],
  "2": ["a","b","g","e","d"],
  "3": ["a","b","g","c","d"],
  "4": ["f","g","b","c"],
  "5": ["a","f","g","c","d"],
  "6": ["a","f","g","e","c","d"],
  "7": ["a","b","c"],
  "8": ["a","b","c","d","e","f","g"],
  "9": ["a","b","c","d","f","g"]
};

const SEGMENT_GEOMETRY = {
  a: [22, 0, 78, 14],
  b: [94, 14, 14, 76],
  c: [94, 104, 14, 76],
  d: [22, 180, 78, 14],
  e: [8, 104, 14, 76],
  f: [8, 14, 14, 76],
  g: [22, 90, 78, 14]
};

const WIRE_PATHS = {
  "0": "M30 18 H82 Q102 18 102 40 V142 Q102 162 82 162 H30 Q10 162 10 142 V40 Q10 18 30 18 Z",
  "1": "M28 48 L58 20 V162 M32 162 H88",
  "2": "M18 44 Q18 18 44 18 H76 Q102 18 102 44 Q102 60 88 72 L24 126 Q10 138 10 162 H104",
  "3": "M18 34 Q32 18 52 18 H76 Q100 18 100 42 Q100 62 80 72 Q104 80 104 104 V136 Q104 162 78 162 H46 Q24 162 10 146",
  "4": "M86 18 V162 M86 100 H12 L66 18",
  "5": "M102 18 H24 V78 H72 Q100 78 100 106 V136 Q100 162 74 162 H42 Q20 162 10 146",
  "6": "M94 26 Q82 18 66 18 H40 Q14 18 14 44 V136 Q14 162 40 162 H72 Q98 162 98 136 V108 Q98 84 74 84 H14",
  "7": "M12 20 H104 L54 162",
  "8": "M38 18 H74 Q98 18 98 42 V56 Q98 74 80 82 Q102 90 102 112 V138 Q102 162 78 162 H34 Q10 162 10 138 V112 Q10 90 32 82 Q14 74 14 56 V42 Q14 18 38 18 Z",
  "9": "M98 96 H38 Q14 96 14 72 V42 Q14 18 38 18 H72 Q98 18 98 44 V136 Q98 162 74 162 H46"
};

const DIGIT_X = [0, 170, 400, 570];
const COLON_X = 342;
const VIEWBOX = "0 0 710 250";

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

let storedStyle = safeGet("glyph-style");
let storedTheme = safeGet("clock-theme");
let glyphStyle = STYLES.indexOf(storedStyle) >= 0 ? storedStyle : "dot";
let theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";

let displayedDigits = [];
let controlsTimer = null;
let toastTimer = null;
let wakeLock = null;
let currentLayer = null;
let transitioningStyle = false;
let touchStartX = 0;
let touchStartY = 0;

function canAnimate(node) {
  return !reduceMotion.matches && node && typeof node.animate === "function";
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  const values = attrs || {};
  Object.keys(values).forEach(function (key) {
    el.setAttribute(key, values[key]);
  });
  return el;
}

function nowDigits() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return [hours[0], hours[1], minutes[0], minutes[1]];
}

function timeLabel(digits) {
  return digits[0] + digits[1] + ":" + digits[2] + digits[3];
}

function patternSet(char) {
  const set = new Set();
  DOT_PATTERNS[char].forEach(function (row, r) {
    Array.from(row).forEach(function (cell, c) {
      if (cell === "1") set.add(r * 5 + c);
    });
  });
  return set;
}

function createDotDigit(char, x, hybrid) {
  const group = svgEl("g", {
    class: hybrid ? "digit digit-hybrid" : "digit digit-dot",
    transform: "translate(" + x + " 27)",
    "data-char": char
  });

  const active = patternSet(char);

  for (let i = 0; i < 35; i += 1) {
    const r = Math.floor(i / 5);
    const c = i % 5;
    const cx = c * 27 + 14;
    const cy = r * 27 + 14;
    let node;

    if (!hybrid) {
      node = svgEl("circle", {
        cx: cx,
        cy: cy,
        r: 8.2,
        class: "glyph-pixel"
      });
    } else {
      const horizontalBand = r === 0 || r === 3 || r === 6;
      const capsule = (r + c) % 3 !== 1 || c === 0 || c === 4;

      if (capsule) {
        node = svgEl("rect", {
          x: cx - (horizontalBand ? 10.5 : 6),
          y: cy - (horizontalBand ? 5 : 10),
          width: horizontalBand ? 21 : 12,
          height: horizontalBand ? 10 : 20,
          rx: 6,
          class: "glyph-pixel hybrid-piece"
        });
      } else {
        node = svgEl("circle", {
          cx: cx,
          cy: cy,
          r: 6.2,
          class: "glyph-pixel hybrid-piece"
        });
      }
    }

    node.dataset.cell = String(i);
    node.dataset.on = active.has(i) ? "1" : "0";
    node.style.opacity = active.has(i) ? "1" : "var(--glyph-ghost)";
    group.appendChild(node);
  }

  return group;
}

function createSegmentDigit(char, x) {
  const group = svgEl("g", {
    class: "digit digit-segment",
    transform: "translate(" + (x + 6) + " 27)",
    "data-char": char
  });

  const active = new Set(SEGMENTS[char]);

  Object.keys(SEGMENT_GEOMETRY).forEach(function (name) {
    const geometry = SEGMENT_GEOMETRY[name];
    const rx = geometry[0];
    const ry = geometry[1];
    const width = geometry[2];
    const height = geometry[3];
    const node = svgEl("rect", {
      x: rx,
      y: ry,
      width: width,
      height: height,
      rx: Math.min(width, height) / 2,
      class: "segment-piece",
      "data-segment": name,
      "data-axis": width > height ? "x" : "y"
    });

    node.dataset.on = active.has(name) ? "1" : "0";
    node.style.opacity = active.has(name) ? "1" : "var(--segment-ghost)";
    group.appendChild(node);
  });

  return group;
}

function stencilSegmentPath(x, y, width, height) {
  const cut = Math.min(width, height) * 0.32;
  return [
    "M", x + cut, y,
    "H", x + width - cut,
    "L", x + width, y + cut,
    "V", y + height - cut,
    "L", x + width - cut, y + height,
    "H", x + cut,
    "L", x, y + height - cut,
    "V", y + cut,
    "Z"
  ].join(" ");
}

function createStencilDigit(char, x) {
  const group = svgEl("g", {
    class: "digit digit-stencil",
    transform: "translate(" + (x + 6) + " 27)",
    "data-char": char
  });

  const active = new Set(SEGMENTS[char]);

  Object.keys(SEGMENT_GEOMETRY).forEach(function (name) {
    const geometry = SEGMENT_GEOMETRY[name];
    const rx = geometry[0];
    const ry = geometry[1];
    const width = geometry[2];
    const height = geometry[3];
    const node = svgEl("path", {
      d: stencilSegmentPath(rx, ry, width, height),
      class: "stencil-piece",
      "data-segment": name,
      "data-axis": width > height ? "x" : "y"
    });

    node.dataset.on = active.has(name) ? "1" : "0";
    node.style.opacity = active.has(name) ? "1" : "var(--segment-ghost)";
    group.appendChild(node);
  });

  return group;
}

function createWireDigit(char, x) {
  const group = svgEl("g", {
    class: "digit digit-wire",
    transform: "translate(" + (x + 5) + " 36)",
    "data-char": char
  });

  const skeleton = svgEl("path", {
    d: WIRE_PATHS[char],
    class: "wire-skeleton"
  });

  const active = svgEl("path", {
    d: WIRE_PATHS[char],
    class: "wire-active"
  });
  active.dataset.on = "1";

  group.appendChild(skeleton);
  group.appendChild(active);
  return group;
}

function createColon(style) {
  const group = svgEl("g", {
    class: "colon colon-" + style,
    transform: "translate(" + COLON_X + " 27)",
    "aria-hidden": "true"
  });

  if (style === "segment") {
    group.appendChild(svgEl("rect", { x: 0, y: 64, width: 14, height: 14, rx: 7 }));
    group.appendChild(svgEl("rect", { x: 0, y: 120, width: 14, height: 14, rx: 7 }));
  } else if (style === "hybrid") {
    group.appendChild(svgEl("circle", { cx: 7, cy: 71, r: 6 }));
    group.appendChild(svgEl("rect", { x: 1, y: 116, width: 12, height: 20, rx: 6 }));
  } else if (style === "wire") {
    group.appendChild(svgEl("circle", { cx: 7, cy: 71, r: 5.5, fill: "none", stroke: "currentColor", "stroke-width": 4 }));
    group.appendChild(svgEl("circle", { cx: 7, cy: 127, r: 5.5, fill: "none", stroke: "currentColor", "stroke-width": 4 }));
  } else if (style === "stencil") {
    group.appendChild(svgEl("path", { d: "M7 62 L16 71 L7 80 L-2 71 Z" }));
    group.appendChild(svgEl("path", { d: "M7 118 L16 127 L7 136 L-2 127 Z" }));
  } else {
    group.appendChild(svgEl("circle", { cx: 7, cy: 71, r: 7.5 }));
    group.appendChild(svgEl("circle", { cx: 7, cy: 127, r: 7.5 }));
  }

  return group;
}

function createDigit(style, char, x) {
  if (style === "segment") return createSegmentDigit(char, x);
  if (style === "hybrid") return createDotDigit(char, x, true);
  if (style === "wire") return createWireDigit(char, x);
  if (style === "stencil") return createStencilDigit(char, x);
  return createDotDigit(char, x, false);
}

function createLayer(style, digits) {
  const layer = svgEl("g", {
    class: "time-layer",
    "data-style": style
  });

  digits.forEach(function (char, index) {
    const digit = createDigit(style, char, DIGIT_X[index]);
    digit.dataset.index = String(index);
    layer.appendChild(digit);
  });

  layer.appendChild(createColon(style));
  return layer;
}

function animateEntrance(layer) {
  if (reduceMotion.matches) return;

  const pieces = Array.from(
    layer.querySelectorAll(".glyph-pixel, .segment-piece, .stencil-piece, .wire-active")
  ).filter(function (piece) {
    return piece.dataset.on === "1";
  });

  pieces.forEach(function (piece, index) {
    if (!canAnimate(piece)) return;
    piece.animate(
      [
        { opacity: 0.16, transform: "scale(.95)" },
        { opacity: 1, transform: "scale(1)" }
      ],
      {
        duration: 250,
        delay: Math.min(index * 4, 80),
        easing: "cubic-bezier(.16,1,.3,1)",
        fill: "both"
      }
    );
  });
}

function mountInitialLayer() {
  displayedDigits = nowDigits();
  currentLayer = createLayer(glyphStyle, displayedDigits);
  clock.replaceChildren(currentLayer);
  clock.setAttribute("viewBox", VIEWBOX);
  clock.setAttribute("aria-label", timeLabel(displayedDigits));
  animateEntrance(currentLayer);
}

function animateDotCell(piece, fromOn, toOn, index) {
  const ghost = parseFloat(getComputedStyle(app).getPropertyValue("--glyph-ghost")) || 0.07;
  const fromOpacity = fromOn ? 1 : ghost;
  const toOpacity = toOn ? 1 : ghost;

  if (fromOn === toOn || !canAnimate(piece)) {
    piece.style.opacity = String(toOpacity);
    piece.dataset.on = toOn ? "1" : "0";
    return;
  }

  const animation = piece.animate(
    [
      { opacity: fromOpacity, transform: fromOn ? "scale(1)" : "scale(.92)" },
      { opacity: toOpacity, transform: toOn ? "scale(1)" : "scale(.94)" }
    ],
    {
      duration: 280,
      delay: (index % 5) * 6 + Math.floor(index / 5) * 3,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "both"
    }
  );

  animation.finished.catch(function () {}).then(function () {
    piece.style.opacity = String(toOpacity);
    piece.style.transform = "";
    piece.dataset.on = toOn ? "1" : "0";
  });
}

function animateSegmentPiece(piece, fromOn, toOn, index) {
  const ghost = parseFloat(getComputedStyle(app).getPropertyValue("--segment-ghost")) || 0.065;
  const fromOpacity = fromOn ? 1 : ghost;
  const toOpacity = toOn ? 1 : ghost;

  if (fromOn === toOn || !canAnimate(piece)) {
    piece.style.opacity = String(toOpacity);
    piece.dataset.on = toOn ? "1" : "0";
    return;
  }

  const axis = piece.dataset.axis;
  const quietScale = axis === "x" ? "scaleX(.92)" : "scaleY(.92)";
  const animation = piece.animate(
    [
      { opacity: fromOpacity, transform: fromOn ? "scale(1)" : quietScale },
      { opacity: toOpacity, transform: toOn ? "scale(1)" : quietScale }
    ],
    {
      duration: 260,
      delay: index * 8,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "both"
    }
  );

  animation.finished.catch(function () {}).then(function () {
    piece.style.opacity = String(toOpacity);
    piece.style.transform = "";
    piece.dataset.on = toOn ? "1" : "0";
  });
}

function replaceDigitGroup(oldGroup, nextGroup) {
  oldGroup.after(nextGroup);

  if (!canAnimate(oldGroup) || !canAnimate(nextGroup)) {
    oldGroup.remove();
    return;
  }

  const outAnimation = oldGroup.animate(
    [
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(-4px) scale(.985)" }
    ],
    {
      duration: 210,
      easing: "cubic-bezier(.4,0,.2,1)",
      fill: "forwards"
    }
  );

  const inAnimation = nextGroup.animate(
    [
      { opacity: 0, transform: "translateY(4px) scale(.985)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ],
    {
      duration: 260,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "both"
    }
  );

  Promise.allSettled([outAnimation.finished, inAnimation.finished]).then(function () {
    oldGroup.remove();
  });
}

function updateDigit(group, oldChar, newChar, style) {
  if (oldChar === newChar) return;

  if (style === "wire") {
    const index = Number(group.dataset.index);
    const nextGroup = createWireDigit(newChar, DIGIT_X[index]);
    nextGroup.dataset.index = String(index);
    replaceDigitGroup(group, nextGroup);
    return;
  }

  group.dataset.char = newChar;

  if (style === "segment" || style === "stencil") {
    const oldActive = new Set(SEGMENTS[oldChar]);
    const newActive = new Set(SEGMENTS[newChar]);
    const selector = style === "stencil" ? ".stencil-piece" : ".segment-piece";

    Array.from(group.querySelectorAll(selector)).forEach(function (piece, index) {
      const name = piece.dataset.segment;
      animateSegmentPiece(piece, oldActive.has(name), newActive.has(name), index);
    });
    return;
  }

  const oldActive = patternSet(oldChar);
  const newActive = patternSet(newChar);

  Array.from(group.querySelectorAll(".glyph-pixel")).forEach(function (piece, index) {
    animateDotCell(piece, oldActive.has(index), newActive.has(index), index);
  });
}

function updateTime() {
  const nextDigits = nowDigits();

  if (!currentLayer) {
    mountInitialLayer();
    return;
  }

  if (nextDigits.join("") === displayedDigits.join("")) return;

  const groups = Array.from(currentLayer.querySelectorAll(".digit"));
  nextDigits.forEach(function (char, index) {
    updateDigit(groups[index], displayedDigits[index], char, glyphStyle);
  });

  displayedDigits = nextDigits;
  clock.setAttribute("aria-label", timeLabel(displayedDigits));
}

async function switchGlyphStyle(nextStyle, swipeDirection) {
  if (STYLES.indexOf(nextStyle) < 0 || nextStyle === glyphStyle || transitioningStyle) return;

  transitioningStyle = true;
  const previousLayer = currentLayer;
  const oldIndex = STYLES.indexOf(glyphStyle);
  const newIndex = STYLES.indexOf(nextStyle);
  const direction = typeof swipeDirection === "number"
    ? swipeDirection
    : (newIndex > oldIndex ? 1 : -1);

  glyphStyle = nextStyle;
  safeSet("glyph-style", glyphStyle);
  updateStyleButtons();

  const nextLayer = createLayer(glyphStyle, displayedDigits);
  clock.appendChild(nextLayer);
  currentLayer = nextLayer;

  if (!canAnimate(previousLayer) || !canAnimate(nextLayer)) {
    if (previousLayer) previousLayer.remove();
    transitioningStyle = false;
    return;
  }

  const outAnimation = previousLayer.animate(
    [
      { opacity: 1, transform: "translateX(0) scale(1)" },
      { opacity: 0, transform: "translateX(" + (direction * -18) + "px) scale(.99)" }
    ],
    {
      duration: 240,
      easing: "cubic-bezier(.4,0,.2,1)",
      fill: "forwards"
    }
  );

  const inAnimation = nextLayer.animate(
    [
      { opacity: 0, transform: "translateX(" + (direction * 20) + "px) scale(.99)" },
      { opacity: 1, transform: "translateX(0) scale(1)" }
    ],
    {
      duration: 300,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "both"
    }
  );

  Promise.allSettled([outAnimation.finished, inAnimation.finished]).then(function () {
    if (previousLayer) previousLayer.remove();
    transitioningStyle = false;
  });
}

function updateStyleButtons() {
  app.dataset.style = glyphStyle;
  styleButtons.forEach(function (button) {
    const active = button.dataset.styleChoice === glyphStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyTheme(animate) {
  app.classList.toggle("theme-dark", theme === "dark");
  app.classList.toggle("theme-light", theme === "light");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#050505" : "#f3f3ef");
  }

  if (animate && canAnimate(clock)) {
    clock.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(.99)" },
        { transform: "scale(1)" }
      ],
      { duration: 280, easing: "cubic-bezier(.16,1,.3,1)" }
    );
  }
}

function showControls(autoHide) {
  app.classList.add("controls-visible");
  clearTimeout(controlsTimer);

  if (autoHide !== false) {
    controlsTimer = setTimeout(function () {
      app.classList.remove("controls-visible");
    }, 4200);
  }
}

function hideControls() {
  app.classList.remove("controls-visible");
  clearTimeout(controlsTimer);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 1000);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (_) {}
}

stage.addEventListener("click", function () {
  if (app.classList.contains("controls-visible")) {
    hideControls();
  } else {
    showControls(true);
  }
  requestWakeLock();
});

controls.addEventListener("click", function (event) {
  event.stopPropagation();
});

styleButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    switchGlyphStyle(button.dataset.styleChoice);
    showControls(true);
  });
});

themeToggle.addEventListener("click", function () {
  theme = theme === "dark" ? "light" : "dark";
  safeSet("clock-theme", theme);
  applyTheme(true);
  showControls(true);
});

stage.addEventListener("touchstart", function (event) {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

stage.addEventListener("touchend", function (event) {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

  const index = STYLES.indexOf(glyphStyle);
  const direction = dx < 0 ? 1 : -1;
  const nextStyle = STYLES[(index + direction + STYLES.length) % STYLES.length];

  switchGlyphStyle(nextStyle, direction);
  showToast(STYLE_LABELS[nextStyle]);
  requestWakeLock();
}, { passive: true });

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") {
    requestWakeLock();
    updateTime();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./service-worker.js").catch(function () {});
  });
}

clock.setAttribute("viewBox", VIEWBOX);
updateStyleButtons();
applyTheme(false);
mountInitialLayer();
setInterval(updateTime, 500);
