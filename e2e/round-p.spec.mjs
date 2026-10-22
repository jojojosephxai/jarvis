import { expect, test } from './fixtures.mjs';
import { capture } from './capture.mjs';

const sizes = [[1024,576],[1280,800],[1366,768],[1440,900],[1920,1080]];
const shots = 'artifacts/face/overnight';
async function open(page, width, height, muted = true) {
  await page.setViewportSize({width,height});
  await page.addInitScript(muted => {
    sessionStorage.setItem('jarvis-boot','1');
    localStorage.setItem('jarvis-spoken-replies',String(!muted));
  }, muted);
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
  await page.mouse.move(rect.x+25,rect.y+25);
  await page.mouse.down();
  await page.mouse.move(rect.x+75,rect.y+45,{steps:5});
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

for (const [width,height] of sizes) test(`Round P token text and first-clause audio ${width}`, async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('jarvis-spoken-replies','true');
    Object.defineProperty(window,'speechSynthesis',{value:undefined});
    window.Audio=class {play(){setTimeout(()=>this.onended?.(),5);return Promise.resolve()} pause(){}};
    const real=window.fetch;
    window.fetch=(input,init)=>{
      if(input!=='/api/chat')return real(input,init);
      const encoder=new TextEncoder();
      window.mockDone=false;
      return Promise.resolve(new Response(new ReadableStream({start(c){
        const send=event=>c.enqueue(encoder.encode(JSON.stringify(event)+'\n'));
        setTimeout(()=>send({type:'token',text:'Joseph'}),80);
        setTimeout(()=>{send({type:'token',text:', '});send({type:'sentence',text:'Joseph,'})},200);
        setTimeout(()=>{
          const tail='the newest plan is ready. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
          send({type:'token',text:tail});send({type:'sentence',text:tail});
          send({type:'done',response:{reply:'Joseph, '+tail,mode:'grok',model:'grok-4.7',receipts:[]}});
          window.mockDone=true;c.close();
        },1200);
      }}),{headers:{'Content-Type':'application/x-ndjson'}}));
    };
  });
  const spoken=[];
  await page.route('**/api/voice/speak',route=>{
    spoken.push(route.request().postDataJSON().text);
    return route.fulfill({contentType:'audio/mpeg',body:Buffer.from([1,2,3])});
  });
  await open(page,width,height,false);
  await page.locator('#talk').fill('What should I do next for school?');
  await page.locator('#talk').press('Enter');
  await expect(page.locator('.chat-reply').last()).toHaveText('Joseph');
  expect(await page.evaluate(()=>window.mockDone)).toBe(false);
  await expect.poll(()=>spoken[0]).toBe('Joseph,');
  expect(await page.evaluate(()=>window.mockDone)).toBe(false);
  await expect(page.locator('#talk')).toBeEnabled();
  expect(spoken.join(' ')).toBe('Joseph, the newest plan is ready. Second sentence. Third sentence. Fourth sentence. Fifth sentence.');
  await page.getByRole('tab',{name:'log',exact:true}).click();
  const metric=page.locator('.turn-metrics').last();
  await expect(metric).toHaveAttribute('data-ttft',/\d+/);
  await expect(metric).toHaveAttribute('data-ttfa',/\d+/);
  const ttft=Number(await metric.getAttribute('data-ttft')),ttfa=Number(await metric.getAttribute('data-ttfa'));
  expect(ttft).toBeLessThan(1500);expect(ttfa).toBeLessThan(2500);expect(ttfa).toBeGreaterThanOrEqual(ttft);
  await expect(page.locator('#panel-log')).not.toContainText('newest plan');
  console.log(`MOCKED ${width} TTFT=${ttft} TTFA=${ttfa}`);
});
