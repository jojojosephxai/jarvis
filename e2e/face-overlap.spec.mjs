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
  else missing.push("dev badge missing");
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

async function openFace(page, path) {
  await page.goto(path);
  await page.waitForFunction(() => document.querySelector(".face")?.getAttribute("data-intro") === "out");
  await page.waitForSelector("[data-scene='ready']");
  await page.waitForSelector("[data-region='ask']");
  await page.waitForSelector(".face-totals");
  await page.waitForFunction(() => {
    const portal = document.querySelector("nextjs-portal");
    const button = portal?.shadowRoot?.querySelector("[data-nextjs-dev-tools-button]");
    const node = button || document.querySelector("[data-nextjs-dev-tools-button]");
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  });
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
    await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
  });
}

test("working card stays off the other panels", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openFace(page, "/?face=working");
  await page.waitForSelector(".face-task");
  await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
});

test("screenshots of the face", async ({ page }) => {
  const dir = "/opt/cursor/artifacts/face";
  await mkdir(dir, { recursive: true });
  const shots = [
    ["1280-idle", { width: 1280, height: 800 }, "/"],
    ["1280-working", { width: 1280, height: 800 }, "/?face=working"],
    ["1280-hub", { width: 1280, height: 800 }, "/?hub=School"],
    ["1920-idle", { width: 1920, height: 1080 }, "/"],
    ["1920-working", { width: 1920, height: 1080 }, "/?face=working"],
    ["1920-hub", { width: 1920, height: 1080 }, "/?hub=School"],
  ];
  for (const [name, size, path] of shots) {
    await page.setViewportSize(size);
    await openFace(page, path);
    if (String(path).includes("hub")) await page.waitForSelector(".graph-inspector");
    if (String(path).includes("working")) await page.waitForSelector(".face-task");
    await expect.poll(async () => page.evaluate(panelOverlaps), { timeout: 15000 }).toEqual([]);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
  }
});
