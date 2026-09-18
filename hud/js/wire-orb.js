import { prefersReducedMotion } from "./motion.js";

/**
 * Arc-reactor orb: a geodesic wireframe inside two gimbal rings, wrapped around
 * a coil core. Colour and speed are lerped toward the target mode rather than
 * snapped, so a state change reads as machinery spinning up, not a light switch.
 */

const PHI = (1 + Math.sqrt(5)) / 2;

function normalize([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function baseIcosahedron() {
  const verts = [
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
  ].map(normalize);

  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  return { verts, faces };
}

function edgesOf(faces) {
  const seen = new Set();
  for (const [a, b, c] of faces) {
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      seen.add(i < j ? `${i}-${j}` : `${j}-${i}`);
    }
  }
  return [...seen].map((key) => key.split("-").map(Number));
}

/** One subdivision gives 42 vertices / 120 edges — dense enough to read as a
 *  hologram mesh, sparse enough to still see through. */
function geodesic(subdivisions = 1) {
  const base = baseIcosahedron();
  const verts = base.verts;
  let faces = base.faces;

  for (let step = 0; step < subdivisions; step += 1) {
    const cache = new Map();
    const next = [];

    const midpoint = (a, b) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const [ax, ay, az] = verts[a];
      const [bx, by, bz] = verts[b];
      const index = verts.push(normalize([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2])) - 1;
      cache.set(key, index);
      return index;
    };

    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  return { verts, edges: edgesOf(faces) };
}

/** A great circle tilted by `tilt` around X, used for the gimbal rings. */
function gimbal(tilt, segments = 72) {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a);
    const y = Math.sin(a) * cos;
    const z = Math.sin(a) * sin;
    points.push([x, y, z]);
  }
  return points;
}

function rotate([x, y, z], ax, ay, az) {
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

const MODES = {
  idle: { line: [198, 224, 255], hot: [238, 249, 255], core: [150, 195, 255], scale: 1, spin: 1 },
  listen: { line: [255, 194, 118], hot: [255, 234, 194], core: [255, 176, 72], scale: 1.16, spin: 1.3 },
  think: { line: [186, 218, 255], hot: [242, 250, 255], core: [138, 188, 255], scale: 1.07, spin: 1.95 },
  speak: { line: [176, 250, 202], hot: [240, 255, 246], core: [140, 238, 180], scale: 1.22, spin: 1.2 },
};

const rgba = ([r, g, b], a) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a.toFixed(3)})`;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(from, to, t) {
  return [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ setMode: (mode: string) => void, destroy: () => void }}
 */
export function startWireOrb(canvas) {
  const ctx = canvas.getContext("2d");
  const mesh = geodesic(1);
  const rings = [gimbal(0.34), gimbal(-0.78)];

  let mode = "idle";
  const look = {
    line: [...MODES.idle.line],
    hot: [...MODES.idle.hot],
    core: [...MODES.idle.core],
    scale: 1,
    spin: 1,
  };

  let spun = 0; // accumulated rotation, so speed changes never snap the mesh
  let last = performance.now();
  let raf = 0;
  let running = true;

  const still = prefersReducedMotion();

  function resize() {
    const parent = canvas.parentElement;
    // Layout size, not getBoundingClientRect — the stage is scaled during the
    // plate assemble and a transformed rect would resize the canvas to nothing.
    const cssW = Math.max(canvas.clientWidth, parent?.clientWidth || 0);
    const cssH = Math.max(canvas.clientHeight, parent?.clientHeight || 0);
    if (cssW < 2 || cssH < 2) return false;
    const px = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(cssW * px));
    const h = Math.max(1, Math.floor(cssH * px));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(px, 0, 0, px, 0, 0);
    return true;
  }

  function project([x, y, z], w, h, scale) {
    const depth = z + 2.6;
    const f = (Math.min(w, h) * 0.62 * scale) / depth;
    return [w / 2 + x * f, h / 2 + y * f, z];
  }

  /** Expanding shells — the orb's "breathing out". */
  function shells(w, h, t) {
    const reach = Math.min(w, h) / 2;
    for (let i = 0; i < 4; i += 1) {
      const phase = (((t * (0.4 + i * 0.08) + i * 0.25) % 1) + 1) % 1;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, reach * (0.3 + phase * 0.72) * look.scale, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(look.line, (1 - phase) * 0.22);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** Arc-reactor coil: a segmented ring around a bright triangular core. */
  function reactor(w, h, t) {
    const r = Math.min(w, h) * 0.108 * look.scale;
    const breathe = 0.86 + Math.sin(t * 2.4) * 0.14;

    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r * 3.4);
    glow.addColorStop(0, rgba(look.hot, 0.82 * breathe));
    glow.addColorStop(0.28, rgba(look.core, 0.34 * breathe));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r * 3.4, 0, Math.PI * 2);
    ctx.fill();

    const segments = 10;
    const gap = 0.18;
    for (let i = 0; i < segments; i += 1) {
      const from = (i / segments) * Math.PI * 2 + t * 0.35;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, from, from + (Math.PI * 2) / segments - gap);
      ctx.strokeStyle = rgba(look.hot, 0.6);
      ctx.lineWidth = Math.max(1.2, r * 0.075);
      ctx.stroke();
    }

    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2 - t * 0.22;
      const p = [w / 2 + Math.cos(a) * r * 0.52, h / 2 + Math.sin(a) * r * 0.52];
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(look.hot, 0.9);
    ctx.lineWidth = 1.4;
    ctx.stroke();
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

    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const target = MODES[mode] || MODES.idle;
    // ~8%/frame at 60fps, framerate-independent: heavy but never sluggish.
    const ease = 1 - Math.exp(-dt * 5.2);
    look.line = lerpColor(look.line, target.line, ease);
    look.hot = lerpColor(look.hot, target.hot, ease);
    look.core = lerpColor(look.core, target.core, ease);
    look.scale = lerp(look.scale, target.scale, ease);
    look.spin = lerp(look.spin, target.spin, ease);

    spun += dt * look.spin;
    const t = spun;
    const ax = t * 0.34;
    const ay = t * 0.52;
    const az = t * 0.17;

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    shells(w, h, t);

    const projected = mesh.verts.map((v) => project(rotate(v, ax, ay, az), w, h, look.scale));

    // Back edges first so the front of the mesh visibly sits in front.
    const ordered = mesh.edges
      .map(([i, j]) => ({ i, j, depth: (projected[i][2] + projected[j][2]) / 2 }))
      .sort((a, b) => a.depth - b.depth);

    for (const { i, j, depth } of ordered) {
      const a = projected[i];
      const b = projected[j];
      const front = (depth + 1) / 2; // 0 back → 1 front
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = rgba(look.line, 0.1 + front * 0.5);
      ctx.lineWidth = 0.5 + front * 1.2;
      ctx.stroke();
    }

    for (const ring of rings) {
      const pts = ring.map((p) => project(rotate(p, ax * 0.6, ay * 1.25, az), w, h, look.scale * 1.12));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = rgba(look.line, 0.3);
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    for (const p of projected) {
      const front = (p[2] + 1) / 2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 0.7 + front * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(look.hot, 0.25 + front * 0.65);
      ctx.fill();
    }

    reactor(w, h, t);

    ctx.beginPath();
    ctx.setLineDash([4, 7]);
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.4 * look.scale, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(look.line, 0.32);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // A single scanning arc sweeping the rim.
    const sweep = (t * 0.5) % (Math.PI * 2);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.4 * look.scale, sweep, sweep + 0.5);
    ctx.strokeStyle = rgba(look.hot, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();

    if (still) return; // one settled frame is enough when motion is reduced
    raf = requestAnimationFrame(frame);
  }

  function render() {
    last = performance.now();
    frame(last);
  }

  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(render) : null;
  observer?.observe(canvas);
  if (canvas.parentElement) observer?.observe(canvas.parentElement);
  window.addEventListener("resize", render);
  render();

  return {
    setMode(next) {
      mode = MODES[next] ? next : "idle";
      if (still) {
        // No loop to pick the change up, so settle the palette and repaint once.
        const target = MODES[mode];
        look.line = [...target.line];
        look.hot = [...target.hot];
        look.core = [...target.core];
        look.scale = target.scale;
        render();
      }
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", render);
      observer?.disconnect();
    },
  };
}
