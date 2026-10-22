import { expect, test } from './fixtures.mjs';
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
async function fakeRealtime(page, enabled=true) {
  await setup(page);
  await page.addInitScript(enabled=>{
    if(enabled)localStorage.setItem('jarvis-fast-voice','true');
    window.voiceSockets=[];
    window.AudioContext=class {
      state='running';audioWorklet={addModule:async()=>{}};
      resume(){return Promise.resolve();}close(){return Promise.resolve();}
    };
    window.AudioWorkletNode=class {
      constructor(){this.port={onmessage:null,postMessage:()=>setTimeout(()=>this.port.onmessage?.({data:{type:'idle'}}),1)}}
      connect(){}disconnect(){}
    };
    const NativeWebSocket=window.WebSocket;
    window.WebSocket=class {
      readyState=0;
      constructor(url,protocols){if(!String(url).startsWith('wss://api.x.ai/'))return new NativeWebSocket(url,protocols);this.sent=[];this.url=url;this.protocols=protocols;window.voiceSockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}
      send(raw){
        const event=JSON.parse(raw);this.sent.push(event);
        if(event.type==='response.create')setTimeout(()=>{
          const text=event.response?.force_message||'Hello Joseph. The quick voice is here.';
          for(const event of [{type:'response.output_audio.delta',delta:'AAAAAA=='},{type:'response.output_audio_transcript.delta',delta:text},{type:'response.output_audio_transcript.done',transcript:text},{type:'response.done',response:{output:[]}}]) this.onmessage?.({data:JSON.stringify(event)});
        },5);
      }
      close(){this.readyState=3;this.onclose?.()}
    };
  },enabled);
  await page.route('**/api/voice/speak',r=>r.fulfill({json:{live:false,reason:'unconfigured',detail:''}}));
}
const voiceConfig={token:'ephemeral-test',expiresAt:123,model:'grok-voice-3.0',voice:'altair',instructions:'Jarvis',tools:[{type:'function',name:'ask_brain'},{type:'function',name:'get_dashboard'}],reasoning:{effort:'none'}};
test('flag and toggle enabled: typed input shows realtime transcript with no console errors',async({page})=>{
  await fakeRealtime(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.route('**/api/voice/session',r=>r.fulfill({json:voiceConfig}));
  await page.route('**/api/chat',()=>{throw new Error('Quick realtime turn reached chat');});
  await page.goto('/');await page.waitForTimeout(1800);
  expect(await page.evaluate(()=>window.voiceSockets.length)).toBe(0);
  await ask(page,'Hello there');
  await expect(page.locator('.chat-reply').last()).toHaveText('Hello Joseph. The quick voice is here.');
  await expect(page.locator('.chat-timing').last()).toContainText('fast');
  expect(errors).toEqual([]);
  const events=await page.evaluate(()=>window.voiceSockets[0].sent);
  expect(events.some(e=>e.item?.content?.[0]?.type==='input_text')).toBe(true);
});
test('failed session falls back for the page and puts the notice in the Log tab',async({page})=>{
  await fakeRealtime(page);let sessions=0;
  await page.route('**/api/voice/session',r=>{sessions++;return r.fulfill({status:503,json:{error:'unavailable'}})});
  await page.route('**/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'sentence',text:'Standard voice still works.'})+'\n'+JSON.stringify({type:'done',response:{reply:'Standard voice still works.',mode:'demo',receipts:[]}})+'\n'}));
  await page.goto('/');await page.waitForTimeout(1800);await ask(page,'Hello');
  await expect(page.locator('.chat-reply').last()).toHaveText('Standard voice still works.');
  await page.getByRole('tab',{name:'log',exact:true}).click();await expect(page.locator('#panel-log')).toContainText('Fast voice off — using standard voice');
  await ask(page,'Hello again');expect(sessions).toBe(1);expect(await page.evaluate(()=>window.voiceSockets.length)).toBe(0);
});
test('default toggle off makes no socket or session request',async({page})=>{
  await fakeRealtime(page,false);let sessions=0;
  await page.route('**/api/voice/session',()=>{sessions++;throw new Error('Default settings requested a session')});
  await page.route('**/api/chat',r=>r.fulfill({json:{reply:'Hello.',mode:'demo',receipts:[]}}));
  await page.goto('/');await page.waitForTimeout(1800);await ask(page,'Hello');
  expect(sessions).toBe(0);expect(await page.evaluate(()=>window.voiceSockets.length)).toBe(0);
});
for(const [width,height] of [[1024,576],[1440,900]])test(`settings fast voice off and local minute counter ${width}`,async({page})=>{
  await page.setViewportSize({width,height});await fakeRealtime(page,false);await page.goto('/');await page.waitForTimeout(1800);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByLabel('Fast voice (beta)',{exact:true})).not.toBeChecked();
  await expect(page.locator('#face-settings')).toContainText('Session: 0.0 min');
  await capture(page,'artifacts/face/overnight',`talks-${width}-settings`);
});
