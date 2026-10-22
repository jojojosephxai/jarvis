import { expect, test } from './fixtures.mjs';

for (const status of ['empty','missing','not-wired']) {
  test(`${status} vault has an explicit Inspector empty state`,async({page})=>{
    await page.addInitScript(()=>{sessionStorage.setItem('jarvis-boot','1');localStorage.setItem('jarvis-spoken-replies','false')});
    await page.route('**/api/graph',r=>r.fulfill({json:{status,detail:'',nodes:[],edges:[],noteCount:0,connectionCount:0,hiddenCount:0,capped:false,legend:[]}}));
    await page.goto('/');
    await page.getByRole('tab',{name:'inspector',exact:true}).click();
    await expect(page.locator('.graph-inspector')).toContainText('No notes available. Connect a vault or add notes to begin.');
    await expect(page.locator('.graph-inspector')).toContainText('0 notes · 0 connections');
    await expect(page.locator('.face-column')).toBeVisible();
    await expect(page.locator('.face-sidebar')).toBeVisible();
  });
}

test('transient microphone notices expire and the next successful listen clears them',async({page,context})=>{
  await context.grantPermissions(['microphone']);
  await page.addInitScript(()=>{
    sessionStorage.setItem('jarvis-boot','1');localStorage.setItem('jarvis-spoken-replies','false');
    window.SpeechRecognition=class {start(){window.recognition=this}abort(){this.onend?.()}};
    navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[]});
    window.AudioContext=class{createMediaStreamSource(){return{connect(){},disconnect(){}}}createAnalyser(){return{getByteTimeDomainData(samples){samples.fill(128)}}}close(){}};
  });
  await page.goto('/');
  const mic=page.getByRole('button',{name:'Microphone',exact:true});
  await mic.click();
  await page.evaluate(()=>{window.recognition.onerror({error:'no-speech'});window.recognition.onend()});
  await expect(page.locator('.mic-notice')).toContainText('No speech was heard. Try the mic again.');
  await expect(page.locator('.mic-notice')).toHaveCount(0,{timeout:8500});
  await mic.click();
  await page.evaluate(()=>{window.recognition.onerror({error:'no-speech'});window.recognition.onend()});
  await expect(page.locator('.mic-notice')).toBeVisible();
  await mic.click();
  await expect(page.locator('.mic-notice')).toHaveCount(0);
});

test('hard refresh loader fades and Inspector retains dim graph context in path mode',async({page})=>{
  await page.addInitScript(()=>{sessionStorage.setItem('jarvis-boot','1');localStorage.setItem('jarvis-spoken-replies','false')});
  await page.goto('/');
  await expect(page.locator('.face')).toHaveAttribute('data-intro','out');
  await expect(page.locator('.face-loader')).toHaveCSS('opacity','0');
  await page.getByRole('button',{name:'Graph',exact:true}).click();
  const scene=page.locator('.force-scene');
  await expect(scene).toHaveAttribute('data-scene','ready');
  const count=await scene.evaluate(el=>JSON.parse(el.dataset.nodes).length);
  await page.locator('.hub-list button',{hasText:'School'}).click();
  await expect(page.getByRole('tab',{name:'inspector',exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>scene.evaluate(el=>JSON.parse(el.dataset.nodes).length)).toBe(count);
  const node=page.locator('.graph-float-label[data-hub="0"]').first();
  await expect(node).toBeVisible();
  await node.click({modifiers:['Shift']});
  await expect(page.locator('.inspector-foot')).toContainText(/path|shift/i);
  await expect.poll(()=>scene.evaluate(el=>JSON.parse(el.dataset.nodes).length)).toBe(count);
  await expect.poll(()=>scene.evaluate(el=>JSON.parse(el.dataset.nodes).filter(n=>n.opacity<.15).length)).toBeGreaterThan(0);
});
