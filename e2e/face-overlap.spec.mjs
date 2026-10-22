import { expect, test } from "@playwright/test";
import { capture } from "./capture.mjs";

const sizes = [
  { width: 1024, height: 576 },
  { width: 1280, height: 650 },
  { width: 1366, height: 620 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const shotDir = "artifacts/face/1021r3";

async function prepare(page, muted = false) {
  await page.addInitScript((muted) => {
    if (muted) localStorage.setItem("jarvis-spoken-replies", "false");
    sessionStorage.setItem("jarvis-boot", "1");
    Object.defineProperty(window, "speechSynthesis", { value: undefined });
  }, muted);
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
  const left = box(".face-column"), sidebar = box(".face-sidebar");
  const center = (left.right + sidebar.left) / 2;
  const hits = [];
  for (const selector of [".orb-dial-ring", ".orb-status", ".face-ask", ".tool-row"]) {
    const r = box(selector);
    if (Math.abs((r.left + r.right) / 2 - center) > 2) hits.push(`${selector} off center`);
    if (r.left < left.right + 8 || r.right > sidebar.left - 8 || r.top < 32 || r.bottom > innerHeight - 8) hits.push(`${selector} clipped`);
  }
  const orb = box(".orb-dial-ring"), status = box(".orb-status"), ask = box(".face-ask");
  if (status.top < orb.bottom - 1 || ask.top < status.bottom + 4) hits.push("center elements overlap");
  for (const selector of [".face-column", ".face-sidebar"]) {
    const r = box(selector);
    if (r.width <= 0 || r.height <= 0) hits.push(`${selector} vanished`);
    if (r.left < 16 || r.right > innerWidth - 16 || r.bottom > innerHeight - 16) hits.push(`${selector} misses window margin`);
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
  const segments = JSON.parse(scene.dataset.segments || "[]");
  for (const label of labels) {
    const r = label.getBoundingClientRect();
    const box = {left:r.left-area.left, right:r.right-area.left, top:r.top-area.top, bottom:r.bottom-area.top};
    for (const edge of segments) {
      // Sample the rendered segments at subpixel intervals, independently of the clipping algorithm.
      const steps = Math.ceil(Math.hypot(edge.x2-edge.x1,edge.y2-edge.y1)*2);
      for (let i=0;i<=steps;i++) {
        const t=steps?i/steps:0, x=edge.x1+(edge.x2-edge.x1)*t, y=edge.y1+(edge.y2-edge.y1)*t;
        if(x>box.left && x<box.right && y>box.top && y<box.bottom) {hits.push('edge crosses label');break;}
      }
    }
  }
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
    for (const n of nodes.filter(n => n.opacity > .2)) {
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
  for (const selector of [".face-column", ".face-sidebar"]) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) hits.push(`${selector} vanished`);
    if (r.left < 16 || r.right > innerWidth - 16 || r.bottom > innerHeight - 16) hits.push(`${selector} misses 16px window margin`);
  }
  return hits.slice(0, 10);
}

async function graphReady(page) {
  await expect(page.locator(".force-scene")).toHaveAttribute("data-scene", "ready");
  await expect.poll(() => page.evaluate(graphGeometry)).toEqual([]);
}

async function screenshot(page, name) {
  await capture(page, shotDir, name);
}

for (const size of sizes) {
  test(`home and graph at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await prepare(page, true);
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
    await prepare(page, true);
    await openFace(page);
    const before = await page.locator(".orb-dial-ring").boundingBox();
    await page.getByRole("button", { name: "Collapse hubs", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand hubs", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#graph-search")).toBeHidden();
    await expect.poll(() => page.evaluate(homeGeometry)).toEqual([]);
    if (width === 1024) await screenshot(page, "1024x576-rail-collapsed");
    await expect.poll(async () => {
      const after = await page.locator(".orb-dial-ring").boundingBox();
      return after.x + after.width / 2;
    }).toBeLessThan(before.x + before.width / 2 - 50);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand hubs", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expand hubs", exact: true }).click();
    await expect(page.locator("#graph-search")).toBeVisible();
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await graphReady(page);
    const graphBefore = await page.locator(".graph-canvas").boundingBox();
    await page.getByRole("button", { name: "Collapse hubs", exact: true }).click();
    await expect.poll(async () => (await page.locator(".graph-canvas").boundingBox()).width).toBeGreaterThan(graphBefore.width + 100);
    await page.getByRole("button", { name: "Expand hubs", exact: true }).click();
    await page.getByRole("button", { name: "Collapse filter", exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Collapse filter", exact: true }).click();
    await expect(page.locator(".filter-list")).toHaveCount(0);
    await page.getByRole("button", { name: "Collapse hubs", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand hubs", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Graph", exact: true }).click();
    await page.getByRole("button", { name: "Expand hubs", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand filter", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expand filter", exact: true }).click();
    await expect(page.locator(".filter-list")).toBeVisible();
    await expect(page.locator("#graph-search")).toBeVisible();
    await graphReady(page);
  });
}

test("wheel scrolls the rail to its last item and still zooms the graph at 1024x576", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await prepare(page, true);
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
  await expect(page.locator(".chat-timing")).toHaveText(/grok-4\.7 · \d+\.\ds/);
  expect(await page.locator(".chat-timing").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(129, 146, 158)");
});

}
const blockedNotice = "Microphone blocked. Click the lock icon in the address bar, set Microphone to Allow, then reload.";

test("blocked microphone notice wraps quietly, does not move the layout, and stays dismissed", async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await context.grantPermissions([]);
  await prepare(page);
  await openFace(page);
  expect(await page.evaluate(async () => (await navigator.permissions.query({ name: "microphone" })).state)).toBe("denied");
  const positions = () => page.locator(".orb-dial-ring, .orb-status, .face-ask").evaluateAll((elements) => elements.map((el) => {
    const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
  }));
  const before = await positions();
  await page.getByRole("button", { name: "Microphone", exact: true }).click();
  const notice = page.locator(".mic-notice");
  await expect(notice).toBeVisible();
  await expect(notice.locator("p")).toHaveText(blockedNotice);
  expect(await notice.evaluate((el) => {
    const text = el.querySelector("p"), style = getComputedStyle(text);
    const r = el.getBoundingClientRect(), status = document.querySelector(".orb-status").getBoundingClientRect();
    const ask = document.querySelector(".face-ask").getBoundingClientRect();
    return parseFloat(getComputedStyle(el).fontSize) < 14 && parseFloat(style.fontSize) < 14 && text.scrollWidth <= text.clientWidth && text.scrollHeight <= text.clientHeight &&
      r.width <= ask.width + 1 && r.left >= ask.left - 1 && r.right <= ask.right + 1 &&
      !(r.left < status.right && r.right > status.left && r.top < status.bottom && r.bottom > status.top);
  })).toBe(true);
  await page.waitForTimeout(750);
  expect(await positions()).toEqual(before);
  await page.mouse.move(500, 35);
  await screenshot(page, "1024x576-mic-notice");
  await page.getByRole("button", { name: "Dismiss microphone notice" }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".face")).toHaveAttribute("data-intro", "out");
  await page.getByRole("button", { name: "Microphone", exact: true }).click();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("jarvis-mic-blocked-dismissed"))).toBe("true");
  const mic = page.getByRole("button", {name:"Microphone",exact:true});
  await mic.hover();
  await expect(mic.getByRole("tooltip")).toHaveText("Microphone blocked (see Settings)");
  await expect(mic.getByRole("tooltip")).toHaveCSS("opacity", "1");
  expect(Number(await mic.evaluate(el=>getComputedStyle(el).opacity))).toBeLessThan(.6);
});

test("granting microphone permission clears the blocked notice and updates Settings", async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await context.grantPermissions([]);
  await prepare(page);
  await openFace(page);
  await page.getByRole("button", { name: "Microphone", exact: true }).click();
  await expect(page.locator(".mic-notice")).toBeVisible();
  await context.grantPermissions(["microphone"]);
  await expect(page.locator(".mic-notice")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".mic-permission")).toHaveText("Microphone: allowed");
});

test("all tool icons have real actions or a clear disabled state; Settings persist and work", async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await context.grantPermissions([]);
  await prepare(page);
  await openFace(page);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await expect(page.getByRole("tab", { name: "tasks", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".face-chat")).toContainText("No tasks");
  const calendar = page.getByRole("button", { name: "Calendar", exact: true });
  await expect(calendar).toBeEnabled();
  await page.route("**/api/chat", (route) => route.fulfill({ json: { reply: "No events today.", mode: "grok", receipts: [] } }));
  await calendar.click();
  await expect(page.locator(".chat-reply")).toHaveText("No events today.");
  await page.getByRole("button", { name: "School", exact: true }).click();
  await expect(page.locator(".inspector-title")).toHaveText("School");
  await expect(page.locator(".graph-canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Vault", exact: true }).click();
  await graphReady(page);
  await noZoomBar(page);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Microphone", exact: true }).click();
  await expect(page.locator(".mic-notice")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss microphone notice" }).click();
  const gear = page.getByRole("button", { name: "Settings", exact: true });
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await gear.click();
  await expect(settings).toBeVisible();
  expect(await settings.evaluate(el=>{
    const a=el.getBoundingClientRect(), b=document.querySelector('.orb-status').getBoundingClientRect();
    return a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
  })).toBe(false);
  await expect(gear).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".mic-permission")).toHaveText("Microphone: blocked");
  const spoken = settings.getByRole("checkbox", { name: "Spoken replies (Altair)" });
  const timing = settings.getByRole("checkbox", { name: "Show timing meta" });
  await expect(spoken).toBeChecked();
  await expect(timing).toBeChecked();
  await page.mouse.move(500, 35);
  await screenshot(page, "1024x576-settings");
  await spoken.uncheck();
  await timing.uncheck();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await expect(gear).toBeFocused();
  await gear.click();
  await page.getByLabel("Search notes", { exact: true }).click();
  await expect(settings).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".face")).toHaveAttribute("data-intro", "out");
  await gear.click();
  await expect(spoken).not.toBeChecked();
  await expect(timing).not.toBeChecked();
  await page.keyboard.press("Escape");
  const requests = [];
  page.on("request", (request) => { if (request.url().endsWith("/api/voice/speak")) requests.push(request.postDataJSON().text); });
  await page.route("**/api/chat", (route) => route.fulfill({ json: { reply: "The real answer. Brain 1871 ms to first token", mode: "grok", receipts: [] } }));
  await page.getByLabel("Ask Jarvis", { exact: true }).fill("Tell me an answer?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Ask Jarvis", { exact: true })).toBeEnabled();
  await expect(page.locator(".chat-reply").last()).toHaveText("The real answer.");
  await expect(page.locator(".chat-timing")).toHaveCount(1);
  await expect(page.locator(".chat-timing").last()).toBeHidden();
  expect(requests).toEqual([]);
  await gear.click();
  await spoken.check();
  await timing.check();
  await page.keyboard.press("Escape");
  await expect(page.locator(".chat-timing").last()).toBeVisible();
  await page.getByLabel("Ask Jarvis", { exact: true }).fill("Tell me another answer?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".chat-reply")).toHaveCount(2);
  await expect(page.getByLabel("Ask Jarvis", { exact: true })).toBeEnabled();
  expect(requests).toEqual(["The real answer."]);
  await expect(page.locator(".chat-log")).not.toContainText("ms to first");
});

test("rail and sidebar stay mounted while graph data loads or fails", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 620 });
  await prepare(page);
  let graphRequest;
  await page.route("**/api/graph", (route) => { graphRequest = route; });
  await page.goto("/");
  await expect(page.locator(".face")).toHaveAttribute("data-intro", "out");
  for (const selector of [".face-column", ".face-sidebar"]) await expect(page.locator(selector)).toBeVisible();
  await page.getByRole("tab", {name:"inspector", exact:true}).click();
  await expect(page.locator(".graph-inspector")).toContainText("Reading notes…");
  await expect(page.locator(".graph-canvas, .force-scene")).toHaveCount(0);
  await graphRequest.fulfill({ status: 503, json: { error: "Unavailable" } });
  await expect(page.locator(".graph-inspector")).toContainText("The note graph could not be loaded. Try reloading.");
  for (const selector of [".face-column", ".face-sidebar"]) await expect(page.locator(selector)).toBeVisible();
  await noZoomBar(page);
  await page.getByRole("button", { name: "Collapse hubs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand hubs", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.locator(".face-sidebar")).toBeVisible();
  await expect(page.locator(".force-scene")).toHaveCount(0);
  await noZoomBar(page);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".graph-canvas")).toHaveCount(0);
});

test("a School tool click while notes load still opens its Inspector when ready", async ({ page }) => {
  await prepare(page);
  const payload = await (await page.request.get("/api/graph")).json();
  let graphRequest;
  await page.route("**/api/graph", (route) => { graphRequest = route; });
  await page.goto("/");
  await expect(page.locator(".face")).toHaveAttribute("data-intro", "out");
  await page.getByRole("button", { name: "School", exact: true }).click();
  await page.getByRole("tab", {name:"inspector", exact:true}).click();
  await expect(page.locator(".graph-inspector")).toContainText("Reading notes…");
  await graphRequest.fulfill({ json: payload });
  await expect(page.locator(".inspector-title")).toHaveText("School");
  await expect(page.locator(".graph-canvas")).toHaveCount(0);
});
