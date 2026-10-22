import { expect, test } from "@playwright/test";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";

const sizes = [
  { width: 1024, height: 576 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const shotDir = "artifacts/face/1021r3";

async function prepare(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("jarvis-boot", "1");
    Object.defineProperty(window, "speechSynthesis", { value: undefined });
  });
  await page.route("**/api/voice", (route) => route.fulfill({ json: { provider: "none", live: false, voice: null, detail: "Voice is off in layout checks." } }));
  await page.route("**/api/voice/speak", (route) => route.fulfill({ json: { live: false, reason: "unconfigured", detail: "Voice is off in layout checks." } }));
}

async function openFace(page, path = "/") {
  await page.goto(path);
  await expect(page.locator(".face")).toHaveAttribute("data-intro", "out");
  await expect(page.locator(".hub-list button").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1700);
}

async function noZoomBar(page) {
  await expect(page.getByRole("group", { name: "Zoom", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(FIT|\+|−|-|Zoom in|Zoom out)$/i })).toHaveCount(0);
}

function homeGeometry() {
  const box = (selector) => document.querySelector(selector).getBoundingClientRect();
  const left = box(".face-column"), inspector = box(".graph-inspector"), chat = box(".face-chat");
  const center = (left.right + inspector.left) / 2;
  const hits = [];
  for (const selector of [".orb-dial-ring", ".orb-status", ".face-ask", ".tool-row"]) {
    const r = box(selector);
    if (Math.abs((r.left + r.right) / 2 - center) > 2) hits.push(`${selector} off center`);
    if (r.left < left.right + 8 || r.right > inspector.left - 8 || r.top < 32 || r.bottom > innerHeight - 8) hits.push(`${selector} clipped`);
  }
  if (chat.top < inspector.bottom + 7) hits.push("Chat intersects Inspector");
  const orb = box(".orb-dial-ring"), status = box(".orb-status"), ask = box(".face-ask");
  if (status.top < orb.bottom - 1 || ask.top < status.bottom + 4) hits.push("center elements overlap");
  if (orb.width < Math.min(320, Math.min(innerWidth, innerHeight) * .30) - 1) hits.push("orb too small");
  if (innerHeight === 576 && box(".tool-row").bottom - orb.top < innerHeight * .48) hits.push("empty band in center column");
  const input = document.querySelector("#graph-search");
  const ctx = document.createElement("canvas").getContext("2d");
  const style = getComputedStyle(input); ctx.font = `${style.fontSize} ${style.fontFamily}`;
  if (input.clientWidth && ctx.measureText(input.placeholder).width + input.placeholder.length * parseFloat(style.letterSpacing) > input.clientWidth) hits.push("placeholder truncated");
  if (left.bottom > innerHeight - 8) hits.push("rail outside viewport");
  const empty = document.querySelector(".inspector-empty");
  if (empty && getComputedStyle(empty, "::after").content !== "none") hits.push("empty Inspector has a placeholder bar");
  const askInput = document.querySelector(".face-ask input"), askStyle = getComputedStyle(askInput);
  const placeholder = getComputedStyle(askInput, "::placeholder");
  if (askStyle.fontFamily !== getComputedStyle(document.querySelector(".face")).fontFamily || askStyle.fontSize !== "13px" || placeholder.color !== "rgb(73, 212, 255)" || Number(placeholder.opacity) >= 1) hits.push("Ask placeholder does not match HUD");
  for (const selector of [".face-column", ".graph-inspector", ".face-chat"]) {
    const r = box(selector);
    if (r.left < 16 || r.right > innerWidth - 16 || r.bottom > innerHeight - 16) hits.push(`${selector} misses 16px window margin`);
  }
  return hits;
}

async function graphGeometry(focusId = null) {
  const scene = document.querySelector(".force-scene");
  const area = scene.getBoundingClientRect();
  const nodes = JSON.parse(scene.dataset.nodes || "[]");
  const edges = JSON.parse(scene.dataset.edges || "[]");
  const hits = [];
  if (!nodes.length) hits.push("no nodes");
  for (const n of nodes) {
    if (n.x < area.left + 16 || n.y < area.top + 16 || n.x + n.w > area.right - 16 || n.y + n.h > area.bottom - 16) hits.push(`${n.id} outside graph margin`);
  }
  const limit = Math.min(area.width, area.height) * .35;
  const visibleEdges = edges.filter((edge) => edge.opacity > .1);
  if (focusId && !visibleEdges.some((edge) => edge.from === focusId || edge.to === focusId)) hits.push("no focused hub edges");
  if (focusId) for (const edge of visibleEdges) if (edge.length > limit) hits.push(`long edge ${edge.length} > ${limit}`);
  if (!focusId && nodes.length) {
    const height = Math.max(...nodes.map((n) => n.y + n.h)) - Math.min(...nodes.map((n) => n.y));
    if (height < (area.height - 32) * .8) hits.push("idle graph does not fill the height");
  }
  const payload = await (await fetch("/api/graph")).json();
  let neighbors = null;
  if (focusId) {
    neighbors = new Set([focusId, ...payload.nodes.filter((node) => node.hubs.includes(focusId)).map((node) => node.id)]);
    for (const edge of payload.edges) {
      if (edge.from === focusId) neighbors.add(edge.to);
      if (edge.to === focusId) neighbors.add(edge.from);
    }
  }
  const labels = [...document.querySelectorAll(".graph-float-label")];
  if (!labels.length) hits.push("no labels");
  if (!focusId) for (const hub of payload.nodes.filter((node) => node.kind === "folder")) {
    if (!labels.some((label) => label.dataset.nodeId === hub.id)) hits.push(`missing hub label: ${hub.title}`);
  }
  for (const label of labels) {
    const r = label.getBoundingClientRect();
    const text = label.textContent;
    if (neighbors && !neighbors.has(label.dataset.nodeId)) hits.push("non-neighbor label is visible in focus");
    for (const other of labels) {
      if (other === label) continue;
      const o = other.getBoundingClientRect();
      if (r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top) hits.push("graph labels overlap");
    }
    for (const n of nodes) {
      if (n.id === label.dataset.nodeId) continue;
      const x = n.x + n.w / 2, y = n.y + n.h / 2;
      const closestX = Math.max(r.left, Math.min(r.right, x)), closestY = Math.max(r.top, Math.min(r.bottom, y));
      if (Math.hypot(x - closestX, y - closestY) < n.r) hits.push("label overlaps another node");
    }
    if (/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(text)) hits.push("UUID label");
    if (r.left < area.left + 16 || r.right > area.right - 16 || r.top < area.top + 16 || r.bottom > area.bottom - 16) hits.push("label outside graph margin");
    const font = getComputedStyle(label);
    if (parseFloat(font.fontSize) < 12 || parseFloat(font.fontSize) > 13 || font.color !== "rgb(73, 212, 255)") hits.push("label styling");
    const node = nodes.find((n) => n.id === label.dataset.nodeId);
    if (!node) hits.push("label without node");
    else {
      const dx = Math.max(r.left - (node.x + node.w / 2), node.x + node.w / 2 - r.right, 0);
      const dy = Math.max(r.top - (node.y + node.h / 2), node.y + node.h / 2 - r.bottom, 0);
      if (Math.hypot(dx, dy) > node.r + 30) hits.push("label detached from node");
    }
  }
  for (const selector of [".face-column", ".graph-inspector", ".face-chat", ".face-filter"]) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.left < 16 || r.right > innerWidth - 16 || r.bottom > innerHeight - 16) hits.push(`${selector} misses 16px window margin`);
  }
  return hits.slice(0, 10);
}

async function graphReady(page) {
  await expect(page.locator(".force-scene")).toHaveAttribute("data-scene", "ready");
  await expect.poll(() => page.evaluate(graphGeometry)).toEqual([]);
}

async function screenshot(page, name) {
  await mkdir(shotDir, { recursive: true });
  const png = await page.screenshot({ fullPage: true });
  if (png.length < 250000) {
    await writeFile(`${shotDir}/${name}.png`, png);
    await rm(`${shotDir}/${name}.jpg`, { force: true });
  } else {
    await page.screenshot({ path: `${shotDir}/${name}.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    expect((await stat(`${shotDir}/${name}.jpg`)).size).toBeLessThan(250000);
    await rm(`${shotDir}/${name}.png`, { force: true });
  }
}

for (const size of sizes) {
  test(`home and graph at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await prepare(page);
    await openFace(page);
    await expect(page.locator(".graph-canvas, .force-scene, .graph-float-label")).toHaveCount(0);
    await noZoomBar(page);
    await expect.poll(() => page.evaluate(homeGeometry)).toEqual([]);
    await screenshot(page, `${size.width}x${size.height}-home`);
    await page.locator(".hub-list button", { hasText: "School" }).click();
    await expect(page.locator(".inspector-title")).toHaveText("School");
    await expect(page.locator(".graph-canvas")).toHaveCount(0);
    await expect.poll(() => page.evaluate(homeGeometry)).toEqual([]);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await graphReady(page);
    await noZoomBar(page);
    await expect(page.locator(".orb-dial")).toBeHidden();
    await screenshot(page, `${size.width}x${size.height}-graph-idle`);
    await page.locator(".hub-list button", { hasText: "School" }).click();
    await expect(page.locator(".inspector-title")).toHaveText("School");
    const id = await page.locator(".graph-float-label", { hasText: /^School$/ }).getAttribute("data-node-id");
    await expect.poll(() => page.evaluate(graphGeometry, id)).toEqual([]);
    const panelGap = await page.evaluate(() => document.querySelector(".face-chat").getBoundingClientRect().top - document.querySelector(".graph-inspector").getBoundingClientRect().bottom);
    expect(panelGap).toBeGreaterThanOrEqual(8);
    await screenshot(page, `${size.width}x${size.height}-graph-hub-selected`);
    await page.getByLabel("Search notes", { exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".face")).toHaveAttribute("data-view", "graph");
    await expect(page.locator(".inspector-title")).toHaveText("School");
    await page.locator(".graph-crumb").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".face")).toHaveAttribute("data-view", "graph");
    await expect(page.locator(".inspector-title")).toHaveCount(0);
    await graphReady(page);
    await page.locator(".hub-list button", { hasText: "School" }).click();
    const node = page.locator(".graph-float-label[data-hub='0']").first();
    await expect(node).toBeVisible();
    const title = await node.textContent();
    await node.click();
    await expect(page.locator(".inspector-title")).toHaveText(title);
    await page.keyboard.press("Escape");
    await expect(page.locator(".face")).toHaveAttribute("data-view", "graph");
    await expect(page.locator(".inspector-title")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".face")).toHaveAttribute("data-view", "home");
    await page.getByLabel("Ask Jarvis", { exact: true }).fill("Still typing");
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Ask Jarvis", { exact: true })).toHaveValue("Still typing");
    await expect(page.locator(".face")).toHaveAttribute("data-view", "home");
    await expect(page.locator(".graph-canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await graphReady(page);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.locator(".graph-canvas")).toHaveCount(0);
  });
}

for (const width of [1024, 1440]) {
  test(`collapse, expand and persist both filters at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1024 ? 576 : 900 });
    await prepare(page);
    await openFace(page);
    const before = await page.locator(".orb-dial-ring").boundingBox();
    await page.getByRole("button", { name: "Collapse hubs", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand hubs", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#graph-search")).toBeHidden();
    await expect.poll(() => page.evaluate(homeGeometry)).toEqual([]);
    if (width === 1024) await screenshot(page, "1024x576-rail-collapsed");
    const after = await page.locator(".orb-dial-ring").boundingBox();
    expect(after.x + after.width / 2).toBeLessThan(before.x + before.width / 2 - 50);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand hubs", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expand hubs", exact: true }).click();
    await expect(page.locator("#graph-search")).toBeVisible();
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await graphReady(page);
    const graphBefore = await page.locator(".graph-canvas").boundingBox();
    await page.getByRole("button", { name: "Collapse hubs", exact: true }).click();
    await expect.poll(async () => (await page.locator(".graph-canvas").boundingBox()).width).toBeGreaterThan(graphBefore.width + 100);
    await page.getByRole("button", { name: "Collapse filter", exact: true }).click();
    await expect(page.locator(".filter-list")).toHaveCount(0);
    await expect.poll(async () => (await page.locator(".graph-canvas").boundingBox()).width).toBeGreaterThan(graphBefore.width + 200);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand hubs", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand filter", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expand filter", exact: true }).click();
    await expect(page.locator(".filter-list")).toBeVisible();
    await page.getByRole("button", { name: "Expand hubs", exact: true }).click();
    await expect(page.locator("#graph-search")).toBeVisible();
    await graphReady(page);
  });
}

test("wheel scrolls the rail to its last item and still zooms the graph at 1024x576", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await prepare(page);
  await openFace(page);
  const rail = page.locator(".face-column");
  const r = await rail.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + 50);
  await page.mouse.wheel(0, 260);
  await expect.poll(() => rail.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => rail.evaluate((el) => {
    const r = el.getBoundingClientRect(), last = el.lastElementChild.getBoundingClientRect();
    return last.top >= r.top && last.bottom <= r.bottom;
  })).toBe(true);
  await screenshot(page, "1024x576-rail-scrolled-bottom");
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await graphReady(page);
  const scene = page.locator(".force-scene");
  const before = Number(await scene.getAttribute("data-dist"));
  const area = await scene.boundingBox();
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(0, -280);
  await expect.poll(async () => Number(await scene.getAttribute("data-dist"))).toBeLessThan(before);
  const dist = Number(await scene.getAttribute("data-dist"));
  await page.mouse.move(r.x + r.width / 2, r.y + 50);
  await page.mouse.wheel(0, -260);
  await expect.poll(() => rail.evaluate((el) => el.scrollTop)).toBeLessThan(400);
  expect(Number(await scene.getAttribute("data-dist"))).toBe(dist);
});

for (const failSecond of [false, true]) {
 test(`streamed speech ${failSecond ? "survives a failed chunk and finishes the job" : "plays every chunk and starts the orb growth only once"}`, async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await prepare(page);
  const chunks = ["These first words", "finish sentence one.", "Sentence two.", "Sentence three!", "Sentence four?", "The final sentence."];
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (url, options) => {
      if (url !== "/api/chat") return fetch(url, options);
      const body = new ReadableStream({ start(controller) { window.chatStream = controller; } });
      return Promise.resolve(new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }));
    };
  });
  await page.unroute("**/api/voice/speak");
  await page.route("**/api/voice/speak", (route) => route.fulfill({ contentType: "audio/mpeg", body: "fake audio for controlled playback" }));
  await page.addInitScript(({ failSecond }) => {
    window.failSecond = failSecond;
    window.played = [];
    window.finished = [];
    window.Audio = class {
      constructor() { this.index = -1; }
      play() {
        this.index = window.played.length;
        window.played.push(this.index);
        window.currentAudio = this;
        if (window.replyStarted && window.failSecond && this.index === 1) return Promise.reject(new Error("Controlled second chunk failure"));
        return Promise.resolve();
      }
      pause() {}
      finish() { window.finished.push(this.index); this.onended?.(); }
    };
    window.AudioContext = undefined;
  }, { failSecond });
  await openFace(page);
  await expect.poll(() => page.evaluate(() => window.played.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.currentAudio.finish());
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.growthStarts = 0;
    window.orbCanvas = document.querySelector(".orb-canvas");
    document.querySelector(".orb-dial").addEventListener("transitionrun", (e) => {
      if (e.propertyName === "width" && document.querySelector(".face").dataset.mode === "speaking") window.growthStarts++;
    });
    window.played = []; window.finished = []; window.replyStarted = true;
  });
  const requested = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/voice/speak")) requested.push(request.postDataJSON().text);
  });
  await page.getByLabel("Ask Jarvis", { exact: true }).fill("Tell me the whole answer?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.chatStream))).toBe(true);
  for (let i = 0; i < chunks.length; i++) {
    await page.evaluate((text) => window.chatStream.enqueue(new TextEncoder().encode(JSON.stringify({ type: "sentence", text }) + "\n")), chunks[i]);
    await expect.poll(() => page.evaluate(() => window.played.length)).toBe(i + 1);
    await expect(page.locator(".face")).toHaveAttribute("data-mode", "speaking");
    await page.waitForTimeout(i === 0 ? 800 : 80);
    expect(await page.evaluate(() => window.growthStarts)).toBe(1);
    expect(await page.evaluate(() => document.querySelector(".orb-canvas") === window.orbCanvas)).toBe(true);
    if (!failSecond || i !== 1) await page.evaluate(() => window.currentAudio.finish());
    await page.waitForTimeout(80);
    if (i < chunks.length - 1) {
      await expect(page.locator(".face")).toHaveAttribute("data-mode", "speaking");
      expect(await page.evaluate(() => window.growthStarts)).toBe(1);
    }
  }
  await page.evaluate((reply) => {
    window.chatStream.enqueue(new TextEncoder().encode(JSON.stringify({ type: "done", response: { reply, mode: "grok", receipts: [] } }) + "\n"));
    window.chatStream.close();
  }, chunks.join(" ") + " Brain 1871 ms to first token · 210 ms to voice");
  await expect(page.getByLabel("Ask Jarvis", { exact: true })).toBeEnabled();
  expect(requested).toEqual(chunks);
  expect(await page.evaluate(() => window.finished)).toEqual(failSecond ? [0, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5]);
  await expect(page.locator(".face")).toHaveAttribute("data-mode", "standby");
  await expect(page.locator(".face-task")).toHaveCount(0);
  await expect(page.locator(".chat-reply")).toHaveText(chunks.join(" "));
  await expect(page.locator(".chat-log")).not.toContainText("ms to first");
  await expect(page.locator(".chat-timing")).toHaveText(/\d+\.\ds to first word/);
  expect(await page.locator(".chat-timing").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(129, 146, 158)");
});

}
