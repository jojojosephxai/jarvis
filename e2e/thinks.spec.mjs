import { expect, test } from './fixtures.mjs';
import { capture } from './capture.mjs';

const sizes = [[1024,576],[1280,800],[1366,768],[1440,900],[1920,1080]];
const reply = 'Your School note says the map worksheet is due Thursday. Bring the printed map.';
const followup = 'The botany report is due Friday. Your School note lists science at 10.';
for (const [width, height] of sizes) test(`sourced reply, meta and follow-up ${width}`, async ({page}) => {
  await page.setViewportSize({width, height});
  await page.addInitScript(() => {
    sessionStorage.setItem('jarvis-boot','1');
    localStorage.setItem('jarvis-spoken-replies','false');
  });
  const requests = [];
  await page.route('**/api/chat', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({json:{reply:requests.length === 1 ? reply : followup,mode:'grok',model:'grok-4.7',sources:['School-schedule'],receipts:[]}});
  });
  await page.goto('/');
  await expect(page.locator('.face')).toHaveAttribute('data-intro','out');
  await expect(page.locator('.face-loader')).toHaveCSS('opacity','0');
  await expect(page.locator('.face-header')).toHaveCSS('opacity','1');
  await page.evaluate(() => document.fonts.ready);
  const ask = page.locator('#talk');
  await ask.fill("what's due Thursday"); await ask.press('Enter');
  await expect(page.locator('.chat-reply').last()).toHaveText(reply);
  await expect(ask).toBeEnabled();
  const bubble = page.locator('.chat-line').last();
  await expect(bubble.locator('.chat-chip')).toHaveText('School-schedule');
  await expect(bubble.locator('.chat-timing')).toHaveText(/grok-4\.7 · \d+\.\ds/);
  await expect(bubble.locator('.chat-timing')).toHaveCSS('color','rgb(129, 146, 158)');
  await expect(bubble.locator('.chat-reply')).not.toContainText(/Notes used:|\(School\)/);
  await page.mouse.move(400,35);
  if ([1024,1440].includes(width)) await capture(page,'artifacts/face/overnight',`thinks-${width}-sourced-reply`);
  await ask.fill('and on Friday?'); await ask.press('Enter');
  await expect(page.locator('.chat-reply').last()).toHaveText(followup);
  expect(requests[1].messages).toEqual([{role:'user',content:"what's due Thursday"},{role:'assistant',content:reply},{role:'user',content:'and on Friday?'}]);
  await expect(ask).toBeEnabled();
  if (width === 1024) await capture(page,'artifacts/face/overnight','thinks-1024-followup');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Show timing meta',{exact:true}).uncheck();
  await expect(bubble.locator('.chat-timing')).toBeHidden();
});
