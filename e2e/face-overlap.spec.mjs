import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

function panelOverlaps() {
  const regions = [
    ["header", "[data-region='header']"],
    ["left", "[data-region='left']"],
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
  const hits = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX <= 2 || overlapY <= 2) continue;
      const aHoldsB = b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
      const bHoldsA = a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
      if (aHoldsB || bHoldsA) continue;
      hits.push(`${a.name} overlaps ${b.name}`);
    }
  }
  return hits;
}

async function openFace(page, path) {
  await page.goto(path);
  await page.waitForFunction(() => document.querySelector(".face")?.getAttribute("data-intro") === "out");
  await page.waitForSelector("[data-scene='ready']");
  await page.waitForSelector("[data-region='ask']");
}

const sizes = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

for (const size of sizes) {
  test(`panels stay apart at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openFace(page, "/?hub=School");
    await page.waitForSelector(".graph-inspector");
    const hits = await page.evaluate(panelOverlaps);
    expect(hits, hits.join("; ")).toEqual([]);
  });
}

test("working card stays off the other panels", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openFace(page, "/?face=working");
  await page.waitForSelector(".face-task");
  const hits = await page.evaluate(panelOverlaps);
  expect(hits, hits.join("; ")).toEqual([]);
});

test("screenshots of the face", async ({ page }) => {
  const dir = "/opt/cursor/artifacts/face";
  await mkdir(dir, { recursive: true });
  const shots = [
    ["1280-idle", { width: 1280, height: 800 }, "/"],
    ["1280-hub", { width: 1280, height: 800 }, "/?hub=School"],
    ["1280-listening", { width: 1280, height: 800 }, "/?face=listening"],
    ["1280-working", { width: 1280, height: 800 }, "/?face=working"],
    ["1920-idle", { width: 1920, height: 1080 }, "/"],
    ["1920-hub", { width: 1920, height: 1080 }, "/?hub=School"],
    ["1920-speaking", { width: 1920, height: 1080 }, "/?face=speaking"],
    ["1920-working", { width: 1920, height: 1080 }, "/?face=working"],
    ["1440-idle", { width: 1440, height: 900 }, "/"],
  ];
  for (const [name, size, path] of shots) {
    await page.setViewportSize(size);
    await openFace(page, path);
    if (String(path).includes("hub")) await page.waitForSelector(".graph-inspector");
    if (String(path).includes("working")) await page.waitForSelector(".face-task");
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
  }
});
