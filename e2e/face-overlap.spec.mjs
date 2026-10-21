import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

function panelOverlaps() {
  const portal = document.querySelector("nextjs-portal");
  const badgeNode =
    portal?.shadowRoot?.querySelector("[data-nextjs-dev-tools-button]") ||
    document.querySelector("[data-nextjs-dev-tools-button]");
  const regions = [
    ["header", "[data-region='header']"],
    ["left", "[data-region='left']"],
    ["notes", ".face-totals"],
    ["filter", "[data-region='filter']"],
    ["inspector", ".graph-inspector"],
    ["orb", ".orb-dial-ring"],
    ["status", ".orb-status"],
    ["chat", "[data-region='chat']"],
    ["ask", "[data-region='ask']"],
    ["task", ".face-task"],
  ];
  const boxes = [];
  for (const [name, selector] of regions) {
    const node = document.querySelector(selector);
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    boxes.push({ name, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
  }
  const missing = [];
  let badge = null;
  if (badgeNode) {
    const rect = badgeNode.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2) {
      badge = { name: "badge", x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    }
  }
  if (badge) boxes.push(badge);
  const mark = portal?.shadowRoot?.querySelector("[data-next-badge]");
  if (mark?.getAttribute("data-error") === "true" || /issue/i.test(mark?.textContent || "")) {
    missing.push("dev badge reports issues");
  }
  if (!boxes.some((box) => box.name === "notes")) missing.push("notes count missing");
  const hits = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX <= 2 || overlapY <= 2) continue;
      const notesAndBadge =
        (a.name === "badge" && b.name === "notes") || (b.name === "badge" && a.name === "notes");
      const aHoldsB = b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
      const bHoldsA = a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
      if (!notesAndBadge && (aHoldsB || bHoldsA)) continue;
      hits.push(`${a.name} overlaps ${b.name}`);
    }
  }
  return missing.concat(hits);
}

function nodeOverlaps() {
  const raw = document.querySelector(".force-scene")?.getAttribute("data-nodes") || "";
  if (!raw) return ["graph nodes were not measured"];
  let nodes = [];
  try {
    nodes = JSON.parse(raw);
  } catch {
    return ["graph nodes were not readable"];
  }
  if (!Array.isArray(nodes) || nodes.length === 0) return ["graph nodes were empty"];
  const zones = [
    ["header", "[data-region='header']"],
    ["left", "[data-region='left']"],
    ["filter", "[data-region='filter']"],
    ["inspector", ".graph-inspector"],
    ["orb", ".orb-dial"],
    ["chat", "[data-region='chat']"],
    ["ask", "[data-region='ask']"],
    ["task", ".face-task"],
  ];
  const hits = [];
  for (const node of nodes) {
    if (!node || node.w < 1 || node.h < 1) continue;
    for (const [name, selector] of zones) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const overlapX = Math.min(node.x + node.w, rect.right) - Math.max(node.x, rect.left);
      const overlapY = Math.min(node.y + node.h, rect.bottom) - Math.max(node.y, rect.top);
      if (overlapX > 1 && overlapY > 1) hits.push(`${node.id} overlaps ${name}`);
    }
  }
  return hits.slice(0, 12);
}

function focusNodeRadii() {
  const raw = document.querySelector(".force-scene")?.getAttribute("data-nodes") || "";
  if (!raw) return ["graph nodes were not measured"];
  let nodes = [];
  try {
    nodes = JSON.parse(raw);
  } catch {
    return ["graph nodes were not readable"];
  }
  if (!Array.isArray(nodes) || nodes.length === 0) return ["graph nodes were empty"];
  const hits = [];
  for (const node of nodes) {
    const published = Number(node.r);
    const radius = Number.isFinite(published) && published > 0 ? published : Math.max(node.w || 0, node.h || 0) / 2;
    if (radius > 40) hits.push(`${node.id} radius ${Math.round(radius)}`);
  }
  return hits.slice(0, 8);
}

function chatMissesInspector() {
  const chat = document.querySelector("[data-region='chat']")?.getBoundingClientRect();
  const inspector = document.querySelector(".graph-inspector")?.getBoundingClientRect();
  if (!chat || !inspector || chat.width < 2 || inspector.width < 2) return [];
  const overlapX = Math.min(chat.right, inspector.right) - Math.max(chat.left, inspector.left);
  const overlapY = Math.min(chat.bottom, inspector.bottom) - Math.max(chat.top, inspector.top);
  if (overlapX > 0 && overlapY > 0) return [`chat overlaps inspector ${Math.round(overlapX)}x${Math.round(overlapY)}`];
  return [];
}

function clippedMarks() {
  const hits = [];
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const zones = [
    ["header", "[data-region='header']"],
    ["left", "[data-region='left']"],
    ["filter", "[data-region='filter']"],
    ["inspector", ".graph-inspector"],
    ["chat", "[data-region='chat']"],
    ["ask", "[data-region='ask']"],
  ];
  const panels = [];
  for (const [name, selector] of zones) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    panels.push({ name, rect });
  }
  const raw = document.querySelector(".force-scene")?.getAttribute("data-nodes") || "";
  let nodes = [];
  try {
    nodes = JSON.parse(raw || "[]");
  } catch {
    return ["graph nodes were not readable"];
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (!node || node.w < 1) continue;
    if (node.x < -1 || node.y < -1 || node.x + node.w > viewW + 1 || node.y + node.h > viewH + 1) {
      hits.push(`${node.id} clipped by viewport`);
    }
    for (const panel of panels) {
      const overlapX = Math.min(node.x + node.w, panel.rect.right) - Math.max(node.x, panel.rect.left);
      const overlapY = Math.min(node.y + node.h, panel.rect.bottom) - Math.max(node.y, panel.rect.top);
      if (overlapX > 1 && overlapY > 1) hits.push(`${node.id} clipped by ${panel.name}`);
    }
  }
  for (const label of document.querySelectorAll(".graph-float-label")) {
    const style = getComputedStyle(label);
    const rect = label.getBoundingClientRect();
    const opacity = Number(style.opacity);
    if (style.visibility === "hidden" || opacity < 0.05 || rect.width < 2 || rect.height < 2) continue;
    const text = (label.textContent || "").trim() || "label";
    if (rect.left < -1 || rect.top < -1 || rect.right > viewW + 1 || rect.bottom > viewH + 1) {
      hits.push(`${text} clipped by viewport`);
    }
    if (label.scrollWidth > label.clientWidth + 2) hits.push(`${text} truncated`);
    const size = Number.parseFloat(style.fontSize);
    if (size < 12 || size > 13.5) hits.push(`${text} is ${size}px`);
    for (const panel of panels) {
      const overlapX = Math.min(rect.right, panel.rect.right) - Math.max(rect.left, panel.rect.left);
      const overlapY = Math.min(rect.bottom, panel.rect.bottom) - Math.max(rect.top, panel.rect.top);
      if (overlapX > 1 && overlapY > 1) hits.push(`${text} clipped by ${panel.name}`);
    }
    const node = byId.get(label.getAttribute("data-node-id") || "");
    if (!node) {
      hits.push(`${text} has no node`);
      continue;
    }
    const gapX = Math.max(0, Math.max(rect.left - (node.x + node.w), node.x - rect.right));
    const gapY = Math.max(0, Math.max(rect.top - (node.y + node.h), node.y - rect.bottom));
    const dist = Math.hypot(gapX, gapY);
    if (dist > 24) hits.push(`${text} is ${Math.round(dist)}px from its node`);
  }
  return hits.slice(0, 12);
}

function labelOverlaps() {
  const labels = [...document.querySelectorAll(".graph-float-label")].filter((el) => {
    const style = getComputedStyle(el);
    const opacity = Number(style.opacity);
    const rect = el.getBoundingClientRect();
    return style.visibility !== "hidden" && opacity >= 0.05 && rect.width > 2 && rect.height > 2;
  });
  const hits = [];
  for (let i = 0; i < labels.length; i += 1) {
    const a = labels[i].getBoundingClientRect();
    for (let j = i + 1; j < labels.length; j += 1) {
      const b = labels[j].getBoundingClientRect();
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 1 && overlapY > 1) {
        hits.push(`${(labels[i].textContent || "").trim()} overlaps ${(labels[j].textContent || "").trim()}`);
      }
    }
  }
  return hits.slice(0, 8);
}

// Independently measure the HUD; do not trust the renderer's keep-out instrumentation.
function roundTwoGeometry() {
  const scene = document.querySelector(".force-scene");
  const nodes = JSON.parse(scene?.getAttribute("data-nodes") || "[]");
  if (!nodes.length) return ["no graph nodes measured"];
  const box = (selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect && rect.width > 2 && rect.height > 2 ? rect : null;
  };
  const center = [".orb-dial", ".orb-status", "[data-region='ask']", ".tool-row"].map(box).filter(Boolean);
  if (center.length < 3) return ["center HUD missing"];
  const keepOut = {
    left: Math.min(...center.map((rect) => rect.left)), top: Math.min(...center.map((rect) => rect.top)),
    right: Math.max(...center.map((rect) => rect.right)), bottom: Math.max(...center.map((rect) => rect.bottom)),
  };
  const panels = ["[data-region='header']", "[data-region='left']", "[data-region='filter']", ".graph-inspector", "[data-region='chat']"].map(box).filter(Boolean);
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const circleHits = (rect, x, y, r) => Math.hypot(x - Math.max(rect.left, Math.min(rect.right, x)), y - Math.max(rect.top, Math.min(rect.bottom, y))) < r - 0.1;
  const hits = [];
  for (const node of nodes) {
    const x = node.x + node.w / 2;
    const y = node.y + node.h / 2;
    const r = node.r;
    if (x > keepOut.left && x < keepOut.right && y > keepOut.top && y < keepOut.bottom) hits.push(`${node.id} center inside HUD`);
    if (circleHits(keepOut, x, y, r + 16)) hits.push(`${node.id} has less than 16px HUD margin`);
    if (node.x < 15.9 || node.y < 15.9 || node.x + node.w > innerWidth - 15.9 || node.y + node.h > innerHeight - 15.9) hits.push(`${node.id} has less than 16px viewport margin`);
    for (const panel of panels) if (circleHits(panel, x, y, r + 16)) hits.push(`${node.id} has less than 16px panel margin`);
  }
  const uuidOrHash = /^(?:[0-9a-f]{8}(?:[-\s][0-9a-f]{4}){3}[-\s][0-9a-f]{12}|[0-9a-f]{16,})$/i;
  for (const label of document.querySelectorAll(".graph-float-label")) {
    const style = getComputedStyle(label);
    if (style.visibility === "hidden" || Number(style.opacity) < 0.05) continue;
    const text = label.textContent.trim();
    if (uuidOrHash.test(text.replace(/^\d+\.\s*/, ""))) hits.push(`opaque label: ${text}`);
    const rect = label.getBoundingClientRect();
    if (intersects(rect, keepOut)) hits.push(`${text} label intersects HUD`);
    for (const node of nodes) {
      if (node.id === label.dataset.nodeId) continue;
      if (circleHits(rect, node.x + node.w / 2, node.y + node.h / 2, node.r)) hits.push(`${text} label intersects ${node.id}`);
    }
  }
  if (!document.querySelector(".graph-float-label")) hits.push("all graph labels were hidden");
  return hits.slice(0, 20);
}

async function openFace(page, path) {
  await page.goto(path);
  await page.waitForFunction(() => document.querySelector(".face")?.getAttribute("data-intro") === "out");
  await page.waitForSelector("[data-scene='ready']");
  if (!String(path).includes("face=working")) await page.waitForSelector("[data-region='ask']");
  await page.waitForSelector(".face-totals");
  await page.waitForTimeout(200);
}

async function zoomIn(page, steps = 8) {
  const scene = page.locator(".force-scene");
  const box = await scene.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.46);
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, -280);
    await page.waitForTimeout(40);
  }
}

async function hoverNode(page) {
  const scene = page.locator(".force-scene");
  const box = await scene.boundingBox();
  if (!box) return false;
  for (let y = 0.32; y <= 0.72; y += 0.04) {
    for (let x = 0.28; x <= 0.72; x += 0.04) {
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
      if ((await scene.getAttribute("data-dim")) === "1") return true;
    }
  }
  return (await scene.getAttribute("data-dim")) === "1";
}

const sizes = [
  { width: 1024, height: 576 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

for (const size of sizes) {
  test(`graph labels stay apart at ${size.width} idle`, async ({ page }) => {
    await page.setViewportSize(size);
    await openFace(page, "/");
    await page.waitForTimeout(400);
    await expect.poll(async () => page.evaluate(labelOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(clippedMarks), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(chatMissesInspector), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(roundTwoGeometry), { timeout: 15000 }).toEqual([]);
    await expect(page.locator(".graph-float-label[data-node-id='area:school']")).toBeVisible();
    const graph = await (await page.request.get("/api/graph")).json();
    await expect.poll(async () => page.evaluate(() => JSON.parse(document.querySelector(".force-scene").dataset.nodes).length)).toBe(graph.nodes.length);
    const shotDir = "artifacts/face/1021r2";
    await mkdir(shotDir, { recursive: true });
    await page.screenshot({ path: `${shotDir}/${size.width}x${size.height}-idle.png`, fullPage: false });
  });

  test(`graph labels stay apart at ${size.width} focus`, async ({ page }) => {
    await page.setViewportSize(size);
    await openFace(page, "/?hub=School");
    await page.waitForSelector(".graph-inspector");
    await page.waitForTimeout(400);
    await expect.poll(async () => page.evaluate(labelOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(clippedMarks), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(chatMissesInspector), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(roundTwoGeometry), { timeout: 15000 }).toEqual([]);
    await expect(page.locator(".graph-float-label[data-node-id='area:school']")).toBeVisible();
    const graph = await (await page.request.get("/api/graph")).json();
    await expect.poll(async () => page.evaluate(() => JSON.parse(document.querySelector(".force-scene").dataset.nodes).length)).toBe(graph.nodes.length);
    const shotDir = "artifacts/face/1021r2";
    await mkdir(shotDir, { recursive: true });
    await page.screenshot({ path: `${shotDir}/${size.width}x${size.height}-hub-selected.png`, fullPage: false });
  });
}

for (const size of sizes) {
  test(`graph nodes stay in the free area at ${size.width} idle`, async ({ page }) => {
    await page.setViewportSize(size);
    await openFace(page, "/");
    await page.waitForTimeout(1200);
    await expect.poll(async () => page.evaluate(nodeOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(clippedMarks), { timeout: 15000 }).toEqual([]);
  });

  test(`graph nodes stay in the free area at ${size.width} focus`, async ({ page }) => {
    await page.setViewportSize(size);
    await openFace(page, "/?hub=School");
    await page.waitForSelector(".graph-inspector");
    await page.waitForTimeout(800);
    await expect.poll(async () => page.evaluate(nodeOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(clippedMarks), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(focusNodeRadii), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(chatMissesInspector), { timeout: 15000 }).toEqual([]);
  });
}

for (const size of sizes) {
  test(`panels stay apart at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openFace(page, "/?hub=School");
    await page.waitForSelector(".graph-inspector");
    await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(chatMissesInspector), { timeout: 15000 }).toEqual([]);
  });
}

test("speaking orb stays off the ask bar", async ({ page }) => {
  for (const size of sizes) {
    await page.setViewportSize(size);
    await openFace(page, "/?face=speaking");
    await page.waitForSelector(".orb-dial[data-place='center']");
    await page.waitForSelector(".speech-caption[data-on='true']");
    await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
    const gap = await page.evaluate(() => {
      const caption = document.querySelector(".speech-caption");
      const ask = document.querySelector("[data-region='ask']");
      if (!caption || !ask) return -1;
      const spoken = caption.getBoundingClientRect();
      const bar = ask.getBoundingClientRect();
      return bar.top - spoken.bottom;
    });
    expect(gap).toBeGreaterThan(12);
  }
});

test("working card stays off the other panels", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openFace(page, "/?face=working");
  await page.waitForSelector(".face-task");
  await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
});

test("clicking a graph node opens the Inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFace(page, "/");
  await zoomIn(page);
  const label = page.locator(".graph-float-label[data-hub='0']").first();
  await expect(label).toBeVisible();
  const id = await label.getAttribute("data-node-id");
  expect(id).toBeTruthy();
  await label.click();
  await expect(page.locator(".graph-inspector")).toHaveCount(0);
  await page.locator(`.graph-float-label[data-node-id="${id}"]`).click();
  await expect(page.locator(".graph-inspector")).toBeVisible();
  await expect(page.locator(".inspector-title")).toBeVisible();
  await expect(page.locator(".inspector-kind")).toBeVisible();
  await expect.poll(async () => page.evaluate(roundTwoGeometry), { timeout: 15000 }).toEqual([]);
  await expect(page.locator(`.graph-float-label[data-node-id="${id}"]`)).toBeVisible();
});

test("hover dims non-neighbors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFace(page, "/");
  expect(await hoverNode(page)).toBe(true);
  await expect(page.locator(".force-scene")).toHaveAttribute("data-dim", "1");
});

test("wheel zoom changes the camera distance", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFace(page, "/");
  const scene = page.locator(".force-scene");
  const before = Number(await scene.getAttribute("data-dist"));
  expect(before).toBeGreaterThan(80);
  await zoomIn(page, 3);
  await expect.poll(async () => Number(await scene.getAttribute("data-dist"))).toBeLessThan(before - 5);
});

test("labels stay inside the graph area after a resize", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFace(page, "/");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(400);
  const spills = await page.evaluate(() => {
    const zones = ["[data-region='left']", "[data-region='filter']", ".orb-dial", "[data-region='chat']", "[data-region='ask']"]
      .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      .filter((rect) => rect && rect.width > 2);
    const graph = document.querySelector(".graph-canvas")?.getBoundingClientRect();
    const hits = [];
    for (const label of document.querySelectorAll(".graph-float-label")) {
      const rect = label.getBoundingClientRect();
      if (rect.width < 2 || Number(getComputedStyle(label).opacity) < 0.05) continue;
      if (graph && (rect.left < graph.left - 1 || rect.top < graph.top - 1 || rect.right > graph.right + 1 || rect.bottom > graph.bottom + 1)) {
        hits.push("outside");
      }
      for (const zone of zones) {
        const overlapX = Math.min(rect.right, zone.right) - Math.max(rect.left, zone.left);
        const overlapY = Math.min(rect.bottom, zone.bottom) - Math.max(rect.top, zone.top);
        if (overlapX > 1 && overlapY > 1) hits.push("hud");
      }
    }
    return hits;
  });
  expect(spills).toEqual([]);
});

test("screenshots of the face", async ({ page }) => {
  test.setTimeout(300000);
  const dir = "work/artifacts/face";
  await mkdir(dir, { recursive: true });
  const shots = [
    ["1280-idle", { width: 1280, height: 800 }, "/"],
    ["1280-speaking", { width: 1280, height: 800 }, "/?face=speaking"],
    ["1280-orb-chat", { width: 1280, height: 800 }, "/?face=speaking"],
    ["1280-inspector", { width: 1280, height: 800 }, "/?hub=School"],
    ["1280-working", { width: 1280, height: 800 }, "/?face=working"],
    ["1280-hub", { width: 1280, height: 800 }, "/?hub=School"],
    ["1280-depth", { width: 1280, height: 800 }, "/?shot=depth"],
    ["1440-idle", { width: 1440, height: 900 }, "/"],
    ["1440-inspector", { width: 1440, height: 900 }, "/?hub=School"],
    ["1440-hub", { width: 1440, height: 900 }, "/?hub=School"],
    ["1920-idle", { width: 1920, height: 1080 }, "/"],
    ["1920-speaking", { width: 1920, height: 1080 }, "/?face=speaking"],
    ["1920-orb-chat", { width: 1920, height: 1080 }, "/?face=speaking"],
    ["1920-inspector", { width: 1920, height: 1080 }, "/?hub=School"],
    ["1920-working", { width: 1920, height: 1080 }, "/?face=working"],
    ["1920-hub", { width: 1920, height: 1080 }, "/?hub=School"],
    ["1920-depth", { width: 1920, height: 1080 }, "/?shot=depth"],
  ];
  for (const [name, size, path] of shots) {
    await page.setViewportSize(size);
    await openFace(page, path);
    if (String(path).includes("hub")) await page.waitForSelector(".graph-inspector");
    if (String(path).includes("speaking")) await page.waitForSelector(".orb-dial[data-place='center']");
    if (String(path).includes("working")) await page.waitForSelector(".face-task");
    if (String(path).includes("shot=depth")) await page.waitForTimeout(1700);
    await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
    const pathText = String(path);
    if (!pathText.includes("speaking") && !pathText.includes("working") && !pathText.includes("shot=depth")) {
      await expect.poll(async () => page.evaluate(nodeOverlaps), { timeout: 15000 }).toEqual([]);
    }
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
  }
  const views = [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  for (const size of views) {
    await page.setViewportSize(size);
    await openFace(page, "/");
    await page.locator(".hub-list button", { hasText: "School" }).click();
    await page.waitForSelector(".graph-inspector");
    await expect(page.locator(".graph-float-label[data-hub='0']").first()).toBeVisible();
    await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(nodeOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(focusNodeRadii), { timeout: 15000 }).toEqual([]);
    await page.screenshot({ path: `${dir}/${size.width}-zoomed.png`, fullPage: false });
    await page.screenshot({ path: `${dir}/${size.width}-clicked.png`, fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForSelector(".face-filter");
    expect(await hoverNode(page)).toBe(true);
    await expect.poll(async () => page.evaluate(nodeOverlaps), { timeout: 15000 }).toEqual([]);
    await page.screenshot({ path: `${dir}/${size.width}-hover.png`, fullPage: false });
  }
  const shotDir = "work/artifacts/face/1021";
  await mkdir(shotDir, { recursive: true });
  for (const size of sizes) {
    await page.setViewportSize(size);
    await openFace(page, "/");
    await page.waitForTimeout(500);
    await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(clippedMarks), { timeout: 15000 }).toEqual([]);
    await page.screenshot({ path: `${shotDir}/${size.width}x${size.height}-idle.png`, fullPage: false });
    await openFace(page, "/?hub=School");
    await page.waitForSelector(".graph-inspector");
    await page.waitForSelector("[data-region='chat']");
    await page.waitForTimeout(400);
    await expect.poll(async () => page.evaluate(chatMissesInspector), { timeout: 15000 }).toEqual([]);
    await expect.poll(async () => page.evaluate(clippedMarks), { timeout: 15000 }).toEqual([]);
    await page.screenshot({ path: `${shotDir}/${size.width}x${size.height}-hub.png`, fullPage: false });
  }
});
