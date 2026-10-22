import { expect, test } from '@playwright/test';
import { capture } from './capture.mjs';

const sentences = ['First sentence is here.', 'Second sentence follows.', 'Third sentence keeps going.', 'Fourth sentence is included.', 'Fifth sentence finishes the reply.'];
const reply = sentences.join(' ');
const sizes = [[1024,576],[1280,800],[1366,768],[1440,900],[1920,1080]];
async function setup(page) {
  await page.route('**/api.x.ai/**', route => { throw new Error(`Forbidden xAI call: ${route.request().url()}`); });
  await page.addInitScript(() => {
    sessionStorage.setItem('jarvis-boot','1');
    Object.defineProperty(window, 'speechSynthesis', {value:undefined});
    window.Audio = class {
      constructor(src){this.src=src;}
      play(){setTimeout(()=>this.onended?.(),10);return Promise.resolve();}
      pause(){}
    };
    document.addEventListener('animationstart', event => {
      if(event.target.classList.contains('stage-orb')) window.orbStarts=(window.orbStarts||0)+1;
    });
  });
  await page.route('**/api/voice',r=>r.fulfill({json:{provider:'none', live:false, voice:null, detail:''}}));
}
async function ask(page, text) {
  await page.locator('#talk').fill(text);
  await page.locator('#talk').press('Enter');
  await expect(page.locator('#talk')).toBeEnabled();
}
for(const [width,height] of sizes) test(`all sentences and remembered turns ${width}`,async({page})=>{
  await page.setViewportSize({width,height});
  await setup(page);
  const spoken = [], requests = [];
  await page.route('**/api/voice/speak',r=>{
    spoken.push(r.request().postDataJSON().text);
    return r.fulfill({contentType:'audio/mpeg',body:Buffer.from([1,2,3])});
  });
  await page.route('**/api/chat',r=>{
    requests.push(r.request().postDataJSON());
    return r.fulfill({contentType:'application/x-ndjson',body:[
      ...sentences.map(text=>({type:'sentence',text})),
      {type:'done',response:{reply,mode:'grok',receipts:[]}},
    ].map(v=>JSON.stringify(v)).join('\n')+'\n'});
  });
  await page.goto('/');
  await expect(page.locator('.face')).toHaveAttribute('data-intro','out');
  await page.waitForTimeout(1800);
  spoken.length=0;
  await ask(page,'Tell me five sentences.');
  await expect(page.locator('.chat-reply').last()).toHaveText(reply);
  expect(spoken).toEqual(sentences);
  await expect(page.locator('.chat-timing').last()).toBeVisible();
  if([1024,1440].includes(width)) await capture(page,'artifacts/face/overnight',`talks-${width}-5sentence`);
  await ask(page,'What did I just ask?');
  expect(requests[1].messages.slice(0,2)).toEqual([{role:'user',content:'Tell me five sentences.'},{role:'assistant',content:reply}]);
  await ask(page,'One more question.');
  expect(await page.evaluate(()=>window.orbStarts)).toBe(1);
});
test('done speaks a missing tail and does not repeat the streamed prefix',async({page})=>{
  await setup(page);
  const spoken=[];
  await page.route('**/api/voice/speak',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{live:false,reason:'unconfigured',detail:''}})});
  await page.route('**/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:[
    ...sentences.slice(0,2).map(text=>({type:'sentence',text})),{type:'done',response:{reply,mode:'grok',receipts:[]}},
  ].map(v=>JSON.stringify(v)).join('\n')+'\n'}));
  await page.goto('/');await page.waitForTimeout(1800);spoken.length=0;
  await ask(page,'Complete the response.');
  expect(spoken).toEqual(sentences);
});
test('typed graph commands change the Face view and go home restores it',async({page})=>{
  await setup(page);
  await page.addInitScript(()=>localStorage.setItem('jarvis-spoken-replies','false'));
  await page.route('**/api/chat',r=>{
    const text=r.request().postDataJSON().messages.at(-1).content;
    return r.fulfill({json:{reply:'Done.',mode:'demo',receipts:[],graph:{action:'layout',value:text==='show the graph'?'graph':'home'}}});
  });
  await page.goto('/');
  await ask(page,'show the graph');await expect(page.locator('.face')).toHaveAttribute('data-view','graph');
  await ask(page,'go home');await expect(page.locator('.face')).toHaveAttribute('data-view','home');
});
