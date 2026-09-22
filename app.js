const SVG_NS = "http://www.w3.org/2000/svg";
const STYLES = ["dot", "segment", "hybrid"];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const app = document.getElementById("app");
const stage = document.getElementById("stage");
const clock = document.getElementById("clock");
const controls = document.getElementById("controls");
const themeToggle = document.getElementById("themeToggle");
const toast = document.getElementById("toast");
const styleButtons = [...document.querySelectorAll("[data-style-choice]")];

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

const DIGIT_X = [0, 170, 400, 570];
const COLON_X = 342;
const VIEWBOX = "0 0 710 250";

let glyphStyle = STYLES.includes(localStorage.getItem("glyph-style"))
  ? localStorage.getItem("glyph-style")
  : "dot";
let theme = ["dark", "light"].includes(localStorage.getItem("clock-theme"))
  ? localStorage.getItem("clock-theme")
  : "dark";

let displayedDigits = [];
let controlsTimer = null;
let toastTimer = null;
let wakeLock = null;
let currentLayer = null;
let transitioningStyle = false;
let touchStartX = 0;
let touchStartY = 0;

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function nowDigits() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return [hours[0], hours[1], minutes[0], minutes[1]];
}

function timeLabel(digits) {
  return \`\${digits[0]}\${digits[1]}:\${digits[2]}\${digits[3]}\`;
}

function patternSet(char) {
  const set = new Set();
  DOT_PATTERNS[char].forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell === "1") set.add(r * 5 + c);
    });
  });
  return set;
}

function createDotDigit(char, x, hybrid = false) {
  const group = svgEl("g", {
    class: hybrid ? "digit digit-hybrid" : "digit digit-dot",
    transform: \`translate(\${x} 27)\`,
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
        cx,
        cy,
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
          cx,
          cy,
          r: 6.2,
          class: "glyph-pixel hybrid-piece"
        });
      }
    }

    node.dataset.cell = String(i);
    node.dataset.on = active.has(i) ? "1" : "0";
    node.style.opacity = active.has(i) ? "1" : "0";
    group.appendChild(node);
  }

  return group;
}

function createSegmentDigit(char, x) {
  const group = svgEl("g", {
    class: "digit digit-segment",
    transform: \`translate(\${x + 6} 27)\`,
    "data-char": char
  });

  const active = new Set(SEGMENTS[char]);

  Object.entries(SEGMENT_GEOMETRY).forEach(([name, [rx, ry, width, height]]) => {
    const node = svgEl("rect", {
      x: rx,
      y: ry,
      width,
      height,
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

function createColon(style) {
  const group = svgEl("g", {
    class: \`colon colon-\${style}\`,
    transform: \`translate(\${COLON_X} 27)\`,
    "aria-hidden": "true"
  });

  if (style === "segment") {
    group.appendChild(svgEl("rect", { x: 0, y: 64, width: 14, height: 14, rx: 7 }));
    group.appendChild(svgEl("rect", { x: 0, y: 120, width: 14, height: 14, rx: 7 }));
  } else if (style === "hybrid") {
    group.appendChild(svgEl("circle", { cx: 7, cy: 71, r: 6 }));
    group.appendChild(svgEl("rect", { x: 1, y: 116, width: 12, height: 20, rx: 6 }));
  } else {
    group.appendChild(svgEl("circle", { cx: 7, cy: 71, r: 7.5 }));
    group.appendChild(svgEl("circle", { cx: 7, cy: 127, r: 7.5 }));
  }

  return group;
}

function createLayer(style, digits) {
  const layer = svgEl("g", {
    class: "time-layer",
    "data-style": style
  });

  digits.forEach((char, index) => {
    const digit = style === "segment"
      ? createSegmentDigit(char, DIGIT_X[index])
      : createDotDigit(char, DIGIT_X[index], style === "hybrid");
    digit.dataset.index = String(index);
    layer.appendChild(digit);
  });

  layer.appendChild(createColon(style));
  return layer;
}

function animateEntrance(layer) {
  if (reduceMotion.matches) return;

  const pieces = [...layer.querySelectorAll(".glyph-pixel, .segment-piece")].filter(
    (piece) => piece.dataset.on === "1"
  );

  pieces.forEach((piece, index) => {
    piece.animate(
      [
        { opacity: 0, transform: "translateY(7px) scale(.35)", filter: "blur(3px)" },
        { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" }
      ],
      {
        duration: 340,
        delay: Math.min(index * 7, 140),
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

function animateDotCell(piece, fromOn, toOn, index, hybrid = false) {
  const delay = ((index % 5) * 12) + (Math.floor(index / 5) * 5);
  const currentOpacity = fromOn ? 1 : 0;
  const nextOpacity = toOn ? 1 : 0;

  if (reduceMotion.matches) {
    piece.style.opacity = String(nextOpacity);
    piece.dataset.on = toOn ? "1" : "0";
    return;
  }

  let frames;
  if (!fromOn && toOn) {
    frames = [
      { opacity: 0, transform: hybrid ? "translateY(8px) scale(.2) rotate(4deg)" : "translateY(8px) scale(.2)", filter: "blur(3px)" },
      { opacity: 1, transform: "translateY(0) scale(1) rotate(0deg)", filter: "blur(0)" }
    ];
  } else if (fromOn && !toOn) {
    frames = [
      { opacity: currentOpacity, transform: "translateY(0) scale(1)", filter: "blur(0)" },
      { opacity: 0, transform: hybrid ? "translateY(-7px) scale(.3) rotate(-4deg)" : "translateY(-7px) scale(.3)", filter: "blur(3px)" }
    ];
  } else if (fromOn && toOn) {
    frames = [
      { opacity: 1, transform: "scale(1)" },
      { opacity: .68, transform: "scale(.82)", offset: .42 },
      { opacity: 1, transform: "scale(1)" }
    ];
  } else {
    piece.style.opacity = "0";
    piece.dataset.on = "0";
    return;
  }

  const animation = piece.animate(frames, {
    duration: fromOn && toOn ? 240 : 320,
    delay,
    easing: "cubic-bezier(.16,1,.3,1)",
    fill: "both"
  });

  animation.finished.catch(() => {}).then(() => {
    piece.style.opacity = String(nextOpacity);
    piece.style.transform = "";
    piece.style.filter = "";
    piece.dataset.on = toOn ? "1" : "0";
  });
}

function animateSegmentPiece(piece, fromOn, toOn, index) {
  const ghost = Number.parseFloat(
    getComputedStyle(app).getPropertyValue("--segment-ghost")
  ) || .055;

  const fromOpacity = fromOn ? 1 : ghost;
  const toOpacity = toOn ? 1 : ghost;

  if (reduceMotion.matches) {
    piece.style.opacity = String(toOpacity);
    piece.dataset.on = toOn ? "1" : "0";
    return;
  }

  if (fromOn === toOn) {
    if (toOn) {
      piece.animate(
        [
          { opacity: 1, filter: "blur(0)" },
          { opacity: .78, filter: "blur(.8px)", offset: .45 },
          { opacity: 1, filter: "blur(0)" }
        ],
        { duration: 230, delay: index * 9, easing: "ease-out" }
      );
    }
    return;
  }

  const axis = piece.dataset.axis;
  const compressed = axis === "x" ? "scaleX(.48)" : "scaleY(.48)";
  const frames = toOn
    ? [
        { opacity: fromOpacity, transform: compressed, filter: "blur(4px)" },
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" }
      ]
    : [
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
        { opacity: toOpacity, transform: compressed, filter: "blur(3px)" }
      ];

  const animation = piece.animate(frames, {
    duration: 300,
    delay: index * 18,
    easing: "cubic-bezier(.16,1,.3,1)",
    fill: "both"
  });

  animation.finished.catch(() => {}).then(() => {
    piece.style.opacity = String(toOpacity);
    piece.style.transform = "";
    piece.style.filter = "";
    piece.dataset.on = toOn ? "1" : "0";
  });
}

function updateDigit(group, oldChar, newChar, style) {
  if (oldChar === newChar) return;
  group.dataset.char = newChar;

  if (style === "segment") {
    const oldActive = new Set(SEGMENTS[oldChar]);
    const newActive = new Set(SEGMENTS[newChar]);
    [...group.querySelectorAll(".segment-piece")].forEach((piece, index) => {
      const name = piece.dataset.segment;
      animateSegmentPiece(piece, oldActive.has(name), newActive.has(name), index);
    });
    return;
  }

  const oldActive = patternSet(oldChar);
  const newActive = patternSet(newChar);
  [...group.querySelectorAll(".glyph-pixel")].forEach((piece, index) => {
    animateDotCell(
      piece,
      oldActive.has(index),
      newActive.has(index),
      index,
      style === "hybrid"
    );
  });
}

function updateTime() {
  const nextDigits = nowDigits();

  if (!currentLayer) {
    mountInitialLayer();
    return;
  }

  if (nextDigits.join("") === displayedDigits.join("")) return;

  const groups = [...currentLayer.querySelectorAll(".digit")];
  nextDigits.forEach((char, index) => {
    updateDigit(groups[index], displayedDigits[index], char, glyphStyle);
  });

  displayedDigits = nextDigits;
  clock.setAttribute("aria-label", timeLabel(displayedDigits));

  if (!reduceMotion.matches) {
    clock.animate(
      [
        { filter: "drop-shadow(0 0 0 currentColor)" },
        { filter: "drop-shadow(0 0 5px color-mix(in srgb, currentColor 22%, transparent))", offset: .45 },
        { filter: "drop-shadow(0 0 0 currentColor)" }
      ],
      { duration: 420, easing: "ease-out" }
    );
  }
}

async function switchGlyphStyle(nextStyle, swipeDirection = null) {
  if (!STYLES.includes(nextStyle) || nextStyle === glyphStyle || transitioningStyle) return;

  transitioningStyle = true;
  const previousStyle = glyphStyle;
  const previousLayer = currentLayer;
  const oldIndex = STYLES.indexOf(previousStyle);
  const newIndex = STYLES.indexOf(nextStyle);
  const direction = swipeDirection ?? (newIndex > oldIndex ? 1 : -1);

  glyphStyle = nextStyle;
  localStorage.setItem("glyph-style", glyphStyle);
  updateStyleButtons();

  const nextLayer = createLayer(glyphStyle, displayedDigits);
  clock.appendChild(nextLayer);
  currentLayer = nextLayer;

  if (reduceMotion.matches) {
    previousLayer?.remove();
    transitioningStyle = false;
    return;
  }

  const outAnimation = previousLayer.animate(
    [
      { opacity: 1, transform: "translateX(0) scale(1)", filter: "blur(0)" },
      { opacity: 0, transform: \`translateX(\${direction * -28}px) scale(.975)\`, filter: "blur(8px)" }
    ],
    {
      duration: 360,
      easing: "cubic-bezier(.4,0,.2,1)",
      fill: "forwards"
    }
  );

  const inAnimation = nextLayer.animate(
    [
      { opacity: 0, transform: \`translateX(\${direction * 34}px) scale(.975)\`, filter: "blur(10px)" },
      { opacity: 1, transform: "translateX(0) scale(1)", filter: "blur(0)" }
    ],
    {
      duration: 460,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "both"
    }
  );

  animateEntrance(nextLayer);

  await Promise.allSettled([outAnimation.finished, inAnimation.finished]);
  previousLayer?.remove();
  transitioningStyle = false;
}

function updateStyleButtons() {
  app.dataset.style = glyphStyle;
  styleButtons.forEach((button) => {
    const active = button.dataset.styleChoice === glyphStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyTheme(animate = true) {
  app.classList.toggle("theme-dark", theme === "dark");
  app.classList.toggle("theme-light", theme === "light");

  document.querySelector('meta[name="theme-color"]').setAttribute(
    "content",
    theme === "dark" ? "#050505" : "#f3f3ef"
  );

  if (animate && !reduceMotion.matches) {
    clock.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(.986)", offset: .42 },
        { transform: "scale(1)" }
      ],
      { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }
    );
  }
}

function showControls(autoHide = true) {
  app.classList.add("controls-visible");
  clearTimeout(controlsTimer);
  if (autoHide) {
    controlsTimer = setTimeout(() => {
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
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1100);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (_) {}
}

stage.addEventListener("click", () => {
  if (app.classList.contains("controls-visible")) {
    hideControls();
  } else {
    showControls();
  }
  requestWakeLock();
});

controls.addEventListener("click", (event) => event.stopPropagation());

styleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchGlyphStyle(button.dataset.styleChoice);
    showControls();
  });
});

themeToggle.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem("clock-theme", theme);
  applyTheme(true);
  showControls();
});

stage.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

stage.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

  const index = STYLES.indexOf(glyphStyle);
  const direction = dx < 0 ? 1 : -1;
  const nextStyle = STYLES[(index + direction + STYLES.length) % STYLES.length];

  switchGlyphStyle(nextStyle, direction);
  showToast(nextStyle === "dot" ? "Dot Matrix" : nextStyle === "segment" ? "Segment" : "Hybrid");
  requestWakeLock();
}, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestWakeLock();
    updateTime();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

clock.setAttribute("viewBox", VIEWBOX);
updateStyleButtons();
applyTheme(false);
mountInitialLayer();
setInterval(updateTime, 500);
