import { pathToFileURL } from 'node:url';

export const turns = [
  {question:'hi', baseline:2000},
  {question:"what's due this week for school?", baseline:5900},
  {question:'show the graph', baseline:2800},
];
export function loopbackBase(input) {
  const url = new URL(input);
  if (!['http:','https:'].includes(url.protocol) || !['127.0.0.1','[::1]','localhost'].includes(url.hostname) || url.username || url.password) throw new Error('Base URL must be loopback.');
  return url.origin;
}
export async function* ndjson(body) {
  const reader=body.getReader(), decoder=new TextDecoder(); let pending='';
  try {
    while(true) {
      const {done,value}=await reader.read();
      pending+=done?decoder.decode():decoder.decode(value,{stream:true});
      const lines=pending.split('\n'); pending=lines.pop()??'';
      for(const line of lines) if(line.trim()) yield JSON.parse(line);
      if(done) break;
    }
    if(pending.trim()) yield JSON.parse(pending);
  } finally {reader.releaseLock();}
}
export async function measureTurn(base, question, fetchImpl=fetch, now=()=>performance.now()) {
  base=loopbackBase(base);
  const started=now(); let firstTokenMs=null, firstSentenceMs=null, doneMs=null, ttsFirstByteMs=null, timeToFirstAudioMs=null, speech;
  const response=await fetchImpl(`${base}/api/chat`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:question}],stream:true})});
  if(!response.ok||!response.body) throw new Error(`Chat returned ${response.status}`);
  for await(const event of ndjson(response.body)) {
    if(event.type==='token' && firstTokenMs===null) firstTokenMs=now()-started;
    if(event.type==='sentence' && firstSentenceMs===null) {
      firstSentenceMs=now()-started;
      speech=(async()=>{
        const start=now();
        const audio=await fetchImpl(`${base}/api/voice/speak`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:event.text})});
        if(!audio.ok||!audio.body) return;
        const reader=audio.body.getReader();
        const first=await reader.read();
        if(!first.done && first.value?.length) { ttsFirstByteMs=now()-start; timeToFirstAudioMs=now()-started; }
        await reader.cancel();
      })();
    }
    if(event.type==='done') doneMs=now()-started;
  }
  await speech;
  if(doneMs===null) throw new Error('Chat ended without done.');
  return {firstTokenMs,firstSentenceMs,doneMs,ttsFirstByteMs,timeToFirstAudioMs};
}
export async function run(base) {
  base=loopbackBase(base);
  const results=[];
  for(const {question,baseline} of turns) {
    const measured=await measureTurn(base,question);
    const seconds=n=>n===null?'unavailable':`${(n/1000).toFixed(2)}s`;
    results.push({turn:question,baseline:seconds(baseline),ttft:seconds(measured.firstTokenMs),ttfa:seconds(measured.timeToFirstAudioMs),firstSentence:seconds(measured.firstSentenceMs),done:seconds(measured.doneMs),ttsFirstByte:seconds(measured.ttsFirstByteMs),delta:measured.firstSentenceMs===null?'unavailable':seconds(measured.firstSentenceMs-baseline)});
  }
  console.table(results);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const flag=process.argv.indexOf('--base');
  run(flag<0?'http://127.0.0.1:3000':process.argv[flag+1]).catch(error=>{console.error(error.message);process.exitCode=1;});
}
