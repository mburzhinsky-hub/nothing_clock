const SVG_NS = "http://www.w3.org/2000/svg";

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

let glyphStyle = localStorage.getItem("glyph-style") || "dot";
let theme = localStorage.getItem("clock-theme") || "dark";
let controlsTimer = null;
let wakeLock = null;
let lastRenderedMinute = "";
let toastTimer = null;

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function dotDigit(char, x, y, scale = 1, hybrid = false) {
  const group = svgEl("g", { transform: `translate(${x} ${y}) scale(${scale})`, "data-glyph": char });
  const pattern = DOT_PATTERNS[char];
  const stepX = 28;
  const stepY = 28;

  pattern.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell !== "1") return;

      if (!hybrid) {
        group.appendChild(svgEl("circle", {
          cx: c * stepX + 14,
          cy: r * stepY + 14,
          r: 8.2,
          fill: "currentColor"
        }));
        return;
      }

      const isEdge = r === 0 || r === 6 || c === 0 || c === 4;
      const useCapsule = (r + c) % 3 !== 1 || isEdge;
      if (useCapsule) {
        const horizontal = (r === 0 || r === 3 || r === 6) && c > 0;
        group.appendChild(svgEl("rect", {
          x: c * stepX + (horizontal ? 5 : 8),
          y: r * stepY + (horizontal ? 9 : 5),
          width: horizontal ? 21 : 12,
          height: horizontal ? 10 : 20,
          rx: 6,
          fill: "currentColor"
        }));
      } else {
        group.appendChild(svgEl("circle", {
          cx: c * stepX + 14,
          cy: r * stepY + 14,
          r: 6,
          fill: "currentColor",
          opacity: .92
        }));
      }
    });
  });

  return group;
}

function segmentDigit(char, x, y, scale = 1) {
  const group = svgEl("g", { transform: `translate(${x} ${y}) scale(${scale})`, "data-glyph": char });
  const on = new Set(SEGMENTS[char]);
  const geometry = {
    a: [22, 0, 78, 14],
    b: [94, 14, 14, 76],
    c: [94, 104, 14, 76],
    d: [22, 180, 78, 14],
    e: [8, 104, 14, 76],
    f: [8, 14, 14, 76],
    g: [22, 90, 78, 14]
  };

  Object.entries(geometry).forEach(([name, [rx, ry, w, h]]) => {
    const lit = on.has(name);
    group.appendChild(svgEl("rect", {
      x: rx,
      y: ry,
      width: w,
      height: h,
      rx: Math.min(w, h) / 2,
      fill: "currentColor",
      opacity: lit ? 1 : .055
    }));
  });

  return group;
}

function colon(x, y, style) {
  const group = svgEl("g", { transform: `translate(${x} ${y})` });
  if (style === "segment") {
    group.appendChild(svgEl("rect", { x: 0, y: 62, width: 15, height: 15, rx: 7.5, fill: "currentColor" }));
    group.appendChild(svgEl("rect", { x: 0, y: 120, width: 15, height: 15, rx: 7.5, fill: "currentColor" }));
  } else if (style === "hybrid") {
    group.appendChild(svgEl("circle", { cx: 8, cy: 70, r: 6, fill: "currentColor" }));
    group.appendChild(svgEl("rect", { x: 2, y: 116, width: 12, height: 20, rx: 6, fill: "currentColor" }));
  } else {
    group.appendChild(svgEl("circle", { cx: 8, cy: 70, r: 8, fill: "currentColor" }));
    group.appendChild(svgEl("circle", { cx: 8, cy: 128, r: 8, fill: "currentColor" }));
  }
  return group;
}

function renderTime(force = false) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const key = `${hh}:${mm}:${glyphStyle}:${theme}`;
  if (!force && key === lastRenderedMinute) return;
  lastRenderedMinute = key;

  clock.replaceChildren();

  const digitGap = glyphStyle === "segment" ? 140 : 170;
  const baseWidth = glyphStyle === "segment" ? 108 : 140;
  const chars = [hh[0], hh[1], ":", mm[0], mm[1]];
  let x = 0;

  chars.forEach((char) => {
    if (char === ":") {
      clock.appendChild(colon(x + 18, 24, glyphStyle));
      x += 82;
      return;
    }

    if (glyphStyle === "segment") {
      clock.appendChild(segmentDigit(char, x, 35, 1));
    } else {
      clock.appendChild(dotDigit(char, x, 34, 1, glyphStyle === "hybrid"));
    }
    x += digitGap;
  });

  const totalWidth = x - digitGap + baseWidth;
  clock.setAttribute("viewBox", `0 0 ${totalWidth} 270`);
  clock.setAttribute("aria-label", `${hh}:${mm}`);
}

function applyPreferences() {
  app.classList.toggle("theme-dark", theme === "dark");
  app.classList.toggle("theme-light", theme === "light");
  app.dataset.style = glyphStyle;

  styleButtons.forEach((button) => {
    const active = button.dataset.styleChoice === glyphStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelector('meta[name="theme-color"]').setAttribute(
    "content",
    theme === "dark" ? "#050505" : "#f3f3ef"
  );

  renderTime(true);
}

function showControls(autoHide = true) {
  app.classList.add("controls-visible");
  clearTimeout(controlsTimer);
  if (autoHide) {
    controlsTimer = setTimeout(() => app.classList.remove("controls-visible"), 4200);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1300);
}

stage.addEventListener("click", () => {
  if (app.classList.contains("controls-visible")) {
    app.classList.remove("controls-visible");
  } else {
    showControls();
  }
  requestWakeLock();
});

controls.addEventListener("click", (event) => event.stopPropagation());

styleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    glyphStyle = button.dataset.styleChoice;
    localStorage.setItem("glyph-style", glyphStyle);
    applyPreferences();
    showControls();
  });
});

themeToggle.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem("clock-theme", theme);
  applyPreferences();
  showControls();
});

let touchStartX = 0;
stage.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].clientX;
}, { passive: true });

stage.addEventListener("touchend", (e) => {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) < 64) return;

  const styles = ["dot", "segment", "hybrid"];
  let idx = styles.indexOf(glyphStyle);
  idx = delta < 0
    ? (idx + 1) % styles.length
    : (idx - 1 + styles.length) % styles.length;

  glyphStyle = styles[idx];
  localStorage.setItem("glyph-style", glyphStyle);
  applyPreferences();
  showToast(glyphStyle === "dot" ? "Dot Matrix" : glyphStyle === "segment" ? "Segment" : "Hybrid");
}, { passive: true });

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (_) {}
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestWakeLock();
    renderTime(true);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

applyPreferences();
renderTime(true);
setInterval(renderTime, 1000);
requestWakeLock();