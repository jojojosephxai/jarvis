import { expect, test } from './fixtures.mjs';
import { capture } from './capture.mjs';

const sizes = [[1024,576],[1280,800],[1366,768],[1440,900],[1920,1080]];
const shots = 'artifacts/face/overnight';
async function open(page, width, height) {
  await page.setViewportSize({width,height});
  await page.addInitScript(() => {
    sessionStorage.setItem('jarvis-boot','1');
    localStorage.setItem('jarvis-spoken-replies','false');
  });
  await page.route('**/api/voice', route => route.fulfill({json:{provider:'none',live:false}}));
  await page.goto('/');
  await expect(page.locator('.face')).toHaveAttribute('data-intro','out');
  await expect(page.locator('.hub-list button').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0,0);
  await page.waitForTimeout(800);
}
for (const [width,height] of sizes) test(`Round P 3D graph ${width}`, async ({page}) => {
  await open(page,width,height);
  if ([1024,1440].includes(width)) await capture(page,shots,`rp-${width}-home`);
  await page.getByRole('button',{name:'Graph',exact:true}).click();
  const scene=page.locator('.force-scene');
  await expect(scene).toHaveAttribute('data-scene','ready');
  await expect.poll(async()=>Number(await scene.getAttribute('data-z-spread'))).toBeGreaterThan(100);
  await page.waitForTimeout(300);
  if ([1024,1440].includes(width)) await capture(page,shots,`rp-${width}-graph`);
  const initial=JSON.parse(await scene.getAttribute('data-nodes'));
  const camera=await scene.getAttribute('data-camera');
  await scene.focus();
  for(let i=0;i<5;i++) await page.keyboard.press('ArrowRight');
  await expect.poll(()=>scene.getAttribute('data-camera')).not.toBe(camera);
  const turned=JSON.parse(await scene.getAttribute('data-nodes'));
  expect(turned.some((node,i)=>Math.abs(node.x-initial[i].x)>1)).toBe(true);
  if(width===1024) await capture(page,shots,'rp-1024-graph-orbit');
  const rect=await scene.boundingBox();
  const beforeDrag=await scene.getAttribute('data-camera');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2+50,rect.y+rect.height/2+20,{steps:5});
  await page.mouse.up();
  await expect.poll(()=>scene.getAttribute('data-camera')).not.toBe(beforeDrag);
  const rotate=page.getByRole('checkbox',{name:'Auto-rotate',exact:true});
  await rotate.check();
  await page.mouse.move(0,0);
  await expect.poll(()=>scene.getAttribute('data-camera'),{timeout:7000}).not.toBe(await scene.getAttribute('data-camera'));
  await rotate.uncheck();
  await page.waitForTimeout(100);
  const stopped=await scene.getAttribute('data-camera');
  await page.waitForTimeout(350);
  expect(await scene.getAttribute('data-camera')).toBe(stopped);
});
