import {expect,test} from './fixtures.mjs';
import {capture} from './capture.mjs';

const sizes=[[1024,576],[1280,800],[1366,768],[1440,900],[1920,1080]];
const shots='artifacts/face/overnight';
async function open(page,width,height){
  await page.setViewportSize({width,height});
  await page.addInitScript(()=>{sessionStorage.setItem('jarvis-boot','1');localStorage.setItem('jarvis-spoken-replies','false')});
  await page.route('**/api/voice',r=>r.fulfill({json:{provider:'none',live:false}}));
  await page.goto('/');
  await expect(page.locator('.face')).toHaveAttribute('data-intro','out');
  await expect(page.locator('.hub-list button').first()).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(800);
  await page.mouse.move(0,0);
}
function labelCollisions(){
  const nodes=JSON.parse(document.querySelector('.force-scene').dataset.nodes||'[]');
  const labels=[...document.querySelectorAll('.graph-float-label')];
  const hits=[];
  for(const label of labels){
    const r=label.getBoundingClientRect();
    for(const node of nodes){
      const x=node.x+node.w/2,y=node.y+node.h/2;
      const distance=Math.hypot(x-Math.max(r.left,Math.min(r.right,x)),y-Math.max(r.top,Math.min(r.bottom,y)));
      if(distance<node.r+1)hits.push(`${label.textContent} overlaps ${node.id}`);
    }
    for(const other of labels){
      if(label===other)continue;const o=other.getBoundingClientRect();
      if(r.left<o.right&&r.right>o.left&&r.top<o.bottom&&r.bottom>o.top)hits.push('label overlap');
    }
  }
  return hits;
}
for(const [width,height] of sizes)test(`Round P2 galaxy, labels, focus, Inspector, chips and history ${width}`,async({page})=>{
  await page.route('**/api/chat',route=>{
    const task=route.request().postDataJSON().messages.at(-1).content.includes('queue');
    return route.fulfill({json:task?{
      reply:'The draft is queued for review.',mode:'grok',model:'grok-4.7',receipts:[{id:'mock-receipt',tool:'notes.keep',title:'Draft review',input:{text:'Synthetic draft'},outcome:'Draft prepared for review.',status:'done',at:'2026-10-23T16:00:00Z'}],
    }:{reply:'The map is ready (School-schedule). Brain 99 ms to first token',mode:'grok',model:'grok-4.7',sources:['School-schedule','Desktop-and-on-behalf','Goals'],receipts:[]}});
  });
  await open(page,width,height);
  if([1024,1440].includes(width))await capture(page,shots,`rp2-${width}-home`);
  await page.getByRole('button',{name:'Graph',exact:true}).click();
  const scene=page.locator('.force-scene'),rotate=page.getByRole('checkbox',{name:'Auto-rotate',exact:true});
  await expect(scene).toHaveAttribute('data-scene','ready');
  await expect(scene).toHaveAttribute('data-dust-count','140');
  await expect(rotate).toBeChecked();
  await page.mouse.move(0,0);
  const initial=await scene.getAttribute('data-camera');
  await expect.poll(()=>scene.getAttribute('data-camera')).not.toBe(initial);
  await rotate.uncheck();await page.mouse.move(0,0);await page.waitForTimeout(100);
  const stopped=await scene.getAttribute('data-camera');await page.waitForTimeout(250);
  expect(await scene.getAttribute('data-camera')).toBe(stopped);
  await rotate.check();
  await page.locator('.face-column').evaluate(el=>el.scrollTop=0);
  await expect.poll(()=>page.evaluate(labelCollisions)).toEqual([]);
  for(const name of ['Projects','Journal'])await expect(page.locator('.graph-float-label').filter({hasText:new RegExp(`^${name}$`)})).toBeVisible();
  const area=JSON.parse(await scene.getAttribute('data-area'));
  const pointer={x:area.left+20,y:area.bottom-20};
  await page.mouse.click(pointer.x,pointer.y);
  await expect(scene).toHaveCSS('outline-style','none');
  if([1024,1440].includes(width))await capture(page,shots,`rp2-${width}-graph`);
  await page.keyboard.press('Tab');await scene.focus();
  expect(await scene.evaluate(el=>el.matches(':focus-visible'))).toBe(true);
  await expect(scene).toHaveCSS('outline-style','solid');
  const beforeOrbit=JSON.parse(await scene.getAttribute('data-camera'));
  await page.mouse.move(pointer.x,pointer.y);await page.mouse.down();
  await page.mouse.move(pointer.x+80,pointer.y-30,{steps:8});await page.mouse.up();
  await expect.poll(async()=>JSON.parse(await scene.getAttribute('data-camera')).pitch).toBeLessThan(beforeOrbit.pitch-.1);
  await expect(scene).toHaveCSS('outline-style','none');
  await expect.poll(()=>page.evaluate(labelCollisions)).toEqual([]);
  if([1024,1440].includes(width))await capture(page,shots,`rp2-${width}-graph-orbit`);
  await page.locator('.hub-list button').filter({hasText:'School'}).click();
  await expect.poll(async()=>Number(await scene.getAttribute('data-flow-count'))).toBeGreaterThan(0);
  const particles=await scene.getAttribute('data-flow-positions');
  await expect.poll(()=>scene.getAttribute('data-flow-positions')).not.toBe(particles);
  await expect.poll(()=>page.evaluate(labelCollisions)).toEqual([]);
  await page.getByRole('checkbox',{name:'Edges',exact:true}).uncheck();
  await expect(scene).toHaveAttribute('data-flow-count','0');
  await page.getByRole('checkbox',{name:'Edges',exact:true}).check();
  await expect.poll(async()=>Number(await scene.getAttribute('data-flow-count'))).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('tab',{name:'chat',exact:true}).click();
  await page.locator('#talk').fill('What is due for school?');await page.locator('#talk').press('Enter');
  await expect(page.locator('#talk')).toBeEnabled();
  await expect(page.locator('.chat-reply').last()).toHaveText('The map is ready.');
  const chips=page.locator('.chat-chips').last().locator('.chat-chip');
  await expect(chips).toHaveText(['School schedule','Desktop permissions','Goals']);
  const boxes=await chips.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return{y:r.top,x:r.left,right:r.right}}));
  expect(Math.abs(boxes[0].y-boxes[1].y)).toBeLessThan(1);expect(boxes[1].x).toBeGreaterThan(boxes[0].right);expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
  await page.getByRole('button',{name:'School schedule',exact:true}).click();
  await expect(page.locator('.inspector-body')).toContainText('Map worksheet');
  await page.locator('.sidebar-inspector').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished))});
  await expect(page.locator('.graph-inspector')).toHaveCSS('opacity','1');
  await expect(page.locator('.sidebar-inspector')).toHaveCSS('opacity','1');
  expect(await page.locator('.graph-inspector').evaluate(el=>[...el.querySelectorAll('p,li,h3,h4,button,code,pre')].every(text=>{const s=getComputedStyle(text);return s.color==='rgb(73, 212, 255)'&&['12px','13px'].includes(s.fontSize)&&s.opacity==='1'}))).toBe(true);
  await page.mouse.move(0,0);
  if([1024,1440].includes(width))await capture(page,shots,`rp2-${width}-sidebar-inspector`);
  await page.getByRole('button',{name:'Back to chat'}).click();
  await page.locator('#talk').fill('Please queue the draft for review');await page.locator('#talk').press('Enter');
  await expect(page.locator('#talk')).toBeEnabled();
  await page.getByRole('tab',{name:'log',exact:true}).click();
  const log=page.locator('#panel-log');
  for(const text of ['What is due for school?','The map is ready.','Please queue the draft for review','The draft is queued for review.','Draft prepared for review.'])await expect(log).toContainText(text);
  await expect(log.locator('.turn-metrics')).toHaveCount(2);
  if(width===1440){await expect(log).toHaveCSS('opacity','1');await capture(page,shots,'rp2-1440-log')}
});

for(const metadata of [true,false])test(`Round P2 no citation or timing flash with ${metadata?'early':'legacy'} sources`,async({page})=>{
  await page.addInitScript(()=>{
    const real=window.fetch;
    window.fetch=(input,init)=>input!=='/api/chat'?real(input,init):Promise.resolve(new Response(new ReadableStream({start(c){window.rp2Emit=event=>c.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n'));window.rp2Close=()=>c.close()}}),{headers:{'Content-Type':'application/x-ndjson'}}));
  });
  await open(page,1440,900);
  await page.evaluate(()=>{window.rp2Texts=[];new MutationObserver(()=>{for(const el of document.querySelectorAll('.chat-reply'))window.rp2Texts.push(el.textContent)}).observe(document.body,{childList:true,characterData:true,subtree:true})});
  await page.locator('#talk').fill('What is due for school?');await page.locator('#talk').press('Enter');
  await expect.poll(()=>page.evaluate(()=>typeof window.rp2Emit)).toBe('function');
  if(metadata)await page.evaluate(()=>window.rp2Emit({type:'sources',sources:['School-schedule','Desktop-and-on-behalf']}));
  const chunks=['The map ','(','School-','schedule)',' is ready ','[[Desktop-','and-on-behalf]]','.',' Br','ain 1871 ','ms to first token · 210 ms to voice','\nNo','tes used: School-schedule.'];
  for(const text of chunks){await page.evaluate(text=>window.rp2Emit({type:'token',text}),text);await page.waitForTimeout(35)}
  const raw=chunks.join('');
  await page.evaluate(reply=>{window.rp2Emit({type:'done',response:{reply,mode:'grok',model:'grok-4.7',sources:['School-schedule','Desktop-and-on-behalf'],receipts:[]}});window.rp2Close()},raw);
  await expect(page.locator('#talk')).toBeEnabled();
  await expect(page.locator('.chat-reply').last()).toHaveText('The map is ready.');
  const seen=await page.evaluate(()=>window.rp2Texts);
  expect(seen.length).toBeGreaterThan(2);
  for(const text of seen){
    expect(text).not.toMatch(/[()\[\]]|School|Desktop|Brain|1871|210|Notes used/);
    expect('The map is ready.'.startsWith(text)).toBe(true);
  }
});
