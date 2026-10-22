import { expect, test } from "@playwright/test";

const sizes = [[1024,576],[1280,650],[1280,800],[1366,620],[1366,768],[1440,900],[1920,1080]];
function geometry() {
  const rect = (s) => document.querySelector(s).getBoundingClientRect();
  const rail = rect('.face-column'), side = rect('.face-sidebar');
  const center = (rail.right + side.left) / 2;
  const hits = [];
  const graph = document.querySelector('.face').dataset.view === 'graph';
  for (const s of graph ? ['.graph-canvas'] : ['.orb-dial-ring','.orb-status','.face-ask','.tool-row']) {
    const r = rect(s);
    if (Math.abs((r.left+r.right)/2-center)>2) hits.push(`${s} off center`);
    if (r.left<rail.right+8 || r.right>side.left-8 || r.top<32 || r.bottom>innerHeight-8) hits.push(`${s} clipped`);
  }
  if (!graph) {
    const orb=rect('.orb-dial-ring'), status=rect('.orb-status'), ask=rect('.face-ask'), tools=rect('.tool-row');
    if(status.top<orb.bottom-1 || ask.top<status.bottom+4 || tools.top<ask.bottom+4) hits.push('center controls intersect');
  }
  if (side.top!==48 || side.bottom>innerHeight-16 || side.right>innerWidth-16) hits.push('sidebar outside window');
  return hits;
}
for (const [width,height] of sizes) {
  test(`sidebar layout matrix ${width}x${height}`, async ({page}) => {
    test.setTimeout(180000);
    await page.setViewportSize({width,height});
    await page.addInitScript(()=>{sessionStorage.setItem('jarvis-boot','1');localStorage.setItem('jarvis-spoken-replies','false');});
    await page.goto('/');
    await expect(page.locator('.face')).toHaveAttribute('data-intro','out');
    await expect(page.locator('.hub-list button').first()).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    for (const railCollapsed of [false,true]) {
      if (railCollapsed) await page.getByRole('button',{name:'Collapse hubs',exact:true}).click();
      for (const mode of ['minimum','default','maximum','collapsed']) {
        const grip=page.getByRole('separator',{name:'Resize sidebar'});
        if (mode==='collapsed') await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
        else {
          await grip.focus();
          await page.keyboard.press(mode==='maximum'?'End':'Home');
          if(mode==='default') {await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');}
          await expect.poll(async()=>Math.round((await page.locator('.face-sidebar').boundingBox()).width)).toBe(mode==='maximum'?width/2:mode==='default'?340:300);
        }
        await expect.poll(()=>page.evaluate(geometry)).toEqual([]);
        await page.getByRole('button',{name:'Graph',exact:true}).click();
        await expect(page.locator('.force-scene')).toHaveAttribute('data-scene','ready');
        await expect.poll(()=>page.evaluate(geometry)).toEqual([]);
        await page.getByRole('button',{name:'Home',exact:true}).click();
        if(mode==='collapsed') await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
      }
    }
    const grip=page.getByRole('separator',{name:'Resize sidebar'});
    await grip.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');
    await page.reload();
    await expect.poll(async()=>Math.round((await page.locator('.face-sidebar').boundingBox()).width)).toBe(320);
    await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
    await page.reload();
    await expect(page.locator('.face')).toHaveAttribute('data-sidebar-collapsed','true');
    // A hub opens a collapsed sidebar, selects Inspector, and preserves the note when returning to Chat.
    await page.getByRole('button',{name:'Expand hubs',exact:true}).click();
    await page.locator('.hub-list button',{hasText:'School'}).click();
    await expect(page.getByRole('tab',{name:'inspector',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('.inspector-title')).toHaveText('School');
    await page.getByRole('button',{name:'Back to chat'}).click();
    await expect(page.getByRole('tab',{name:'chat',exact:true})).toHaveAttribute('aria-selected','true');
    await page.getByRole('tab',{name:'inspector',exact:true}).click();
    await expect(page.locator('.inspector-title')).toHaveText('School');
    await page.getByRole('button',{name:'Graph',exact:true}).click();
    await expect(page.locator('.graph-float-label[data-hub="0"]').first()).toBeVisible();
    await page.getByRole('button',{name:'Back to chat'}).click();
    await page.locator('.graph-float-label[data-hub="0"]').first().click();
    await expect(page.getByRole('tab',{name:'inspector',exact:true})).toHaveAttribute('aria-selected','true');
  });
}

test('pointer drag clamps width at minimum and half the window', async ({page})=>{
  await page.addInitScript(()=>{sessionStorage.setItem('jarvis-boot','1');localStorage.setItem('jarvis-spoken-replies','false');});
  await page.goto('/');
  const grip=page.getByRole('separator',{name:'Resize sidebar'});
  await expect(grip).toBeVisible();
  let r=await grip.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+100);await page.mouse.down();await page.mouse.move(20,r.y+100);await page.mouse.up();
  await expect.poll(async()=>Math.round((await page.locator('.face-sidebar').boundingBox()).width)).toBe(720);
  r=await grip.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+100);await page.mouse.down();await page.mouse.move(1435,r.y+100);await page.mouse.up();
  await expect.poll(async()=>Math.round((await page.locator('.face-sidebar').boundingBox()).width)).toBe(300);
});
