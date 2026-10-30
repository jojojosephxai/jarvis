import { readFile } from 'node:fs/promises';
import { capture } from './capture.mjs';
import { expect, test } from './fixtures.mjs';

const items = JSON.parse(await readFile(new URL('../tests/fixtures/do-next/items.json', import.meta.url), 'utf8'));
const shots = 'work/do-next-followup-screenshots';

async function settleLayout(page) {
  await expect.poll(() => page.locator('.face-sidebar, .orb-dial, .face-dock, .stage-orb').evaluateAll(elements =>
    elements.flatMap(el => el.getAnimations()).filter(animation => animation.pending || animation.playState === 'running').length,
  )).toBe(0);
}

async function open(page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    sessionStorage.setItem('jarvis-boot', '1');
    localStorage.setItem('jarvis-spoken-replies', 'false');
  });
  await page.route('**/api/voice', route => route.fulfill({ json: { provider: 'none', live: false } }));
  await page.goto('/');
  await expect(page.locator('.face')).toHaveAttribute('data-intro', 'out');
  await expect(page.locator('.hub-list button').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.face-sidebar')).toHaveCSS('opacity', '1');
  await expect(page.locator('.stage-orb')).toHaveCSS('opacity', '1');
  await settleLayout(page);
  await page.mouse.move(0, 0);
}

function geometry() {
  const rect = selector => document.querySelector(selector).getBoundingClientRect();
  const panel = rect('.do-next-panel'), sidebar = rect('.face-sidebar'), tabs = rect('.chat-tabs');
  const rail = rect('.face-column'), orb = rect('.orb-dial-ring'), ask = rect('.face-ask');
  return {
    contained: panel.left >= sidebar.left && panel.right <= sidebar.right && panel.top >= sidebar.top && panel.bottom <= tabs.top,
    clear: panel.left > orb.right && panel.left > ask.right && tabs.bottom < sidebar.bottom,
    centered: Math.abs((orb.left + orb.right) / 2 - (rail.right + sidebar.left) / 2) < 2,
    type: [...document.querySelectorAll('.do-next-panel h2, .do-next-panel button, .do-next-panel p, .do-next-meta > *')].every(el => {
      const style = getComputedStyle(el);
      return ['12px', '13px'].includes(style.fontSize) && parseFloat(style.letterSpacing) < 1;
    }),
  };
}

for (const [width, height] of [[1024, 576], [1024, 768], [1440, 900], [1920, 1080]]) {
  const states = height === 768 || width === 1920 ? ['items'] : ['items', 'empty', 'error'];
  for (const state of states) test(`Do next ${state} at ${width}x${height}`, async ({ page }) => {
    await page.route('**/api/do-next', route => route.fulfill({
      status: state === 'error' ? 503 : 200,
      json: state === 'error' ? { error: "Couldn't load." } : { items: state === 'items' ? items : [] },
    }));
    await open(page, width, height);
    const panel = page.getByRole('region', { name: 'Do next', exact: true });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    if (state === 'items') {
      await expect(panel.locator('.do-next-task')).toHaveText(items.map(item => item.task));
      await expect(panel.locator('.do-next-meta > span')).toHaveText(items.map(item => item.bot));
      await expect(panel.locator('time')).toHaveText(items.map(item => item.due));
      await expect(panel.getByRole('listitem')).toHaveCount(6);
      await expect(panel.getByRole('checkbox')).toHaveCount(0);
      await expect(panel.getByRole('button')).toHaveCount(1);
      const content = panel.locator('.do-next-content');
      if (height === 576) {
        expect(await content.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
        const fixed = page.locator('.orb-dial-ring, .face-ask, .chat-tabs');
        const boxes = () => fixed.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().toJSON()));
        const beforeScroll = await boxes();
        await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
        // The scroll range rounds to whole pixels at fractional vh heights.
        await expect(panel.getByRole('listitem').last()).toBeInViewport({ ratio: .99 });
        expect(await boxes()).toEqual(beforeScroll);
        await content.evaluate(el => { el.scrollTop = 0; });
      } else {
        expect(await content.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
        for (const row of await panel.getByRole('listitem').all()) await expect(row).toBeInViewport({ ratio: 1 });
      }
    } else await expect(panel).toContainText(state === 'empty' ? 'Nothing due.' : "Couldn't load.");
    await expect.poll(() => page.evaluate(geometry)).toEqual({ contained: true, clear: true, centered: true, type: true });
    await capture(page, shots, `do-next-${width}x${height}-${state}`);
  });
}

test('Do next refreshes only on open and Refresh, retaining state through graph, tabs, collapse and focus', async ({ page }) => {
  let calls = 0;
  const responses = [{ items }, { items: [] }, { error: "Couldn't load." }, { items: [items[1]] }];
  await page.route('**/api/do-next', route => {
    const json = responses[calls++];
    return route.fulfill({ status: json?.error ? 503 : 200, json: json ?? { items: [] } });
  });
  await open(page, 1024, 576);
  const panel = page.getByRole('region', { name: 'Do next', exact: true });
  const refresh = panel.getByRole('button', { name: 'Refresh do next' });
  await expect(panel.getByRole('listitem')).toHaveCount(6);
  expect(calls).toBe(1);
  const before = await page.locator('.orb-dial-ring').boundingBox();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.force-scene')).toHaveAttribute('data-scene', 'ready');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(panel).toBeVisible();
  await page.getByRole('tab', { name: 'tasks', exact: true }).click();
  await page.getByRole('tab', { name: 'chat', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
  await expect(page.locator('.face')).toHaveAttribute('data-sidebar-collapsed', 'false');
  await settleLayout(page);
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.install();
  await page.clock.fastForward(120_000);
  expect(calls).toBe(1);
  await refresh.click();
  await expect(panel).toContainText('Nothing due.');
  expect(calls).toBe(2);
  await refresh.click();
  await expect(panel).toContainText("Couldn't load.");
  expect(calls).toBe(3);
  await refresh.click();
  await expect(panel.getByRole('listitem')).toHaveCount(1);
  await expect(panel).toContainText('Pack swim bag');
  expect(calls).toBe(4);
  await settleLayout(page);
  const after = await page.locator('.orb-dial-ring').boundingBox();
  for (const key of ['x', 'y', 'width', 'height']) expect(after[key]).toBeCloseTo(before[key], 0);
  await expect(page.getByRole('group', { name: 'Zoom', exact: true })).toHaveCount(0);
});

test('Do next handles malformed API data and displays task text without HTML', async ({ page }) => {
  let malformed = true;
  await page.route('**/api/do-next', route => route.fulfill({ json: malformed ? { items: [null] } : {
    items: [{ task: '<img src=x onerror=alert(1)>', due: '', bot: 'Synthetic bot' }],
  } }));
  await open(page);
  const panel = page.getByRole('region', { name: 'Do next', exact: true });
  await expect(panel).toContainText("Couldn't load.");
  malformed = false;
  await panel.getByRole('button', { name: 'Refresh do next' }).click();
  await expect(panel).toContainText('<img src=x onerror=alert(1)>');
  await expect(panel).toContainText('Date unavailable');
  await expect(panel.locator('img')).toHaveCount(0);
});

test('Do next bounds long content inside the sidebar at 1024x576', async ({ page }) => {
  const longItems = items.map(item => ({ ...item, task: 'Syntheticlongtask'.repeat(20), bot: 'Syntheticlongbot'.repeat(12) }));
  await page.route('**/api/do-next', route => route.fulfill({ json: { items: longItems } }));
  await open(page, 1024, 576);
  await expect(page.locator('.do-next-items li')).toHaveCount(6);
  expect(await page.evaluate(geometry)).toEqual({ contained: true, clear: true, centered: true, type: true });
  expect(await page.locator('.do-next-content').evaluate(el => el.scrollHeight > el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('.do-next-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('.do-next-items li').last()).toBeInViewport();
  await expect(page.getByRole('tab', { name: 'chat', exact: true })).toBeInViewport();
});

test('GET /api/do-next serves only the configured synthetic file, uncached and read-only', async ({ request }) => {
  const response = await request.get('/api/do-next?path=/unconfigured-file&url=https://example.invalid');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({ items: [] });
  expect((await request.post('/api/do-next', { data: { items } })).status()).toBe(405);
});
