/**
 * Expanding wireframe orb — icosahedron + latitude rings (reel / Stark HUD vibe).
 */
const PHI = (1 + Math.sqrt(5)) / 2;

function icosahedron() {
  const raw = [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ];
  const verts = raw.map(([x, y, z]) => {
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len];
  });
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const edgeSet = new Set();
  for (const [a, b, c] of faces) {
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      edgeSet.add(key);
    }
  }
  const edges = [...edgeSet].map((k) => k.split("-").map(Number));
  return { verts, edges };
}

function latRing(lat, segs = 28) {
  const y = Math.sin(lat);
  const r = Math.cos(lat);
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([r * Math.cos(a), y, r * Math.sin(a)]);
  }
  return pts;
}

function rotate(p, ax, ay, az) {
  let [x, y, z] = p;
  let c = Math.cos(ax);
  let s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay);
  s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az);
  s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

const MODE_SCALE = {
  idle: 1,
  listen: 1.18,
  think: 1.08,
  speak: 1.26,
};

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ setMode: (mode: string) => void, destroy: () => void }}
 */
export function startWireOrb(canvas) {
  const ctx = canvas.getContext("2d");
  const mesh = icosahedron();
  const rings = [-0.65, -0.25, 0.25, 0.65].map((lat) => latRing(lat));

  let mode = "idle";
  let scale = 1;
  let targetScale = 1;
  let t0 = performance.now();
  let raf = 0;
  let running = true;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const parent = canvas.parentElement;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(rect.width, canvas.clientWidth, parent?.clientWidth || 0);
    const cssH = Math.max(rect.height, canvas.clientHeight, parent?.clientHeight || 0);
    if (cssW < 2 || cssH < 2) return false;
    const px = dpr();
    const nextW = Math.max(1, Math.floor(cssW * px));
    const nextH = Math.max(1, Math.floor(cssH * px));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    ctx.setTransform(px, 0, 0, px, 0, 0);
    return true;
  }

  function color() {
    const styles = getComputedStyle(document.documentElement);
    return {
      line: styles.getPropertyValue("--hud-line").trim() || "rgba(190, 220, 255, 0.55)",
      bright: styles.getPropertyValue("--hud-bright").trim() || "rgba(230, 244, 255, 0.9)",
      core: styles.getPropertyValue("--hud-core").trim() || "rgba(120, 180, 255, 0.35)",
      amber: styles.getPropertyValue("--amber").trim() || "#ffb347",
    };
  }

  function project(p, w, h, s) {
    const fov = 2.6;
    const z = p[2] + fov;
    const f = (Math.min(w, h) * 0.48 * s) / z;
    return [w / 2 + p[0] * f, h / 2 + p[1] * f, p[2]];
  }

  function drawExpandingShells(w, h, now, cols) {
    const pulse = mode === "speak" || mode === "listen" ? 1 : 0.55;
    for (let i = 0; i < 4; i++) {
      const phase = ((now / 1000) * (0.42 + i * 0.09) + i * 0.25) % 1;
      const r = (Math.min(w, h) / 2) * (0.48 + phase * 0.62) * scale;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle =
        mode === "listen"
          ? `rgba(255, 179, 71, ${((1 - phase) * 0.35 * pulse).toFixed(3)})`
          : `rgba(200, 225, 255, ${((1 - phase) * 0.28 * pulse).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function frame(now) {
    if (!running) return;
    resize();
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 0;
    if (!w || !h || canvas.width < 4) {
      raf = requestAnimationFrame(frame);
      return;
    }

    targetScale = MODE_SCALE[mode] || 1;
    scale += (targetScale - scale) * 0.08;

    const elapsed = (now - t0) / 1000;
    const ax = elapsed * 0.35;
    const ay = elapsed * 0.55;
    const az = elapsed * 0.18;
    const cols = color();

    ctx.clearRect(0, 0, w, h);
    drawExpandingShells(w, h, now, cols);

    // soft core
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.22 * scale);
    if (mode === "listen") {
      g.addColorStop(0, "rgba(255, 220, 160, 0.55)");
      g.addColorStop(0.45, "rgba(255, 160, 60, 0.18)");
      g.addColorStop(1, "transparent");
    } else {
      g.addColorStop(0, "rgba(230, 245, 255, 0.55)");
      g.addColorStop(0.4, cols.core);
      g.addColorStop(1, "transparent");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.22 * scale, 0, Math.PI * 2);
    ctx.fill();

    const rotated = mesh.verts.map((v) => rotate(v, ax, ay, az));
    const proj = rotated.map((v) => project(v, w, h, scale));

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // mesh edges (depth-ish by avg z)
    for (const [i, j] of mesh.edges) {
      const a = proj[i];
      const b = proj[j];
      const depth = (a[2] + b[2]) / 2;
      const alpha = 0.22 + (depth + 1) * 0.28;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle =
        mode === "listen"
          ? `rgba(255, 190, 100, ${alpha.toFixed(3)})`
          : `rgba(210, 230, 255, ${alpha.toFixed(3)})`;
      ctx.lineWidth = depth > 0 ? 1.35 : 0.85;
      ctx.stroke();
    }

    // latitude rings
    for (const ring of rings) {
      const pts = ring.map((p) => project(rotate(p, ax * 0.7, ay * 1.1, az), w, h, scale * 0.98));
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.closePath();
      ctx.strokeStyle = mode === "listen" ? "rgba(255, 179, 71, 0.28)" : "rgba(180, 210, 255, 0.28)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // vertices
    for (const p of proj) {
      const r = p[2] > 0 ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = mode === "listen" ? cols.amber : cols.bright;
      ctx.fill();
    }

    // outer dashed equator
    ctx.beginPath();
    ctx.setLineDash([4, 6]);
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.4 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = mode === "listen" ? "rgba(255, 179, 71, 0.4)" : "rgba(200, 225, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    raf = requestAnimationFrame(frame);
  }

  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  if (canvas.parentElement) ro?.observe(canvas.parentElement);
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(frame);

  return {
    setMode(next) {
      mode = next || "idle";
      resize();
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ro?.disconnect();
    },
  };
}
