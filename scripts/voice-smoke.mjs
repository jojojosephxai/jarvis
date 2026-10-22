// LIVE ONLY: node --env-file=.env.local scripts/voice-smoke.mjs on Joseph's PC.
// Do not run in the sandbox. No tokens, keys or event payloads are printed.
import {pathToFileURL} from 'node:url';
export async function smoke(fetchImpl=fetch, socketFactory=(url,protocols)=>new WebSocket(url,protocols)) {
  const key=process.env.XAI_API_KEY?.trim();if(!key)throw new Error('Set XAI_API_KEY on Joseph\'s PC.');
  const secret=await fetchImpl('https://api.x.ai/v1/realtime/client_secrets',{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({expires_after:{seconds:300}}),signal:AbortSignal.timeout(8000),
  });
  if(!secret.ok)throw new Error(`Session returned ${secret.status}`);
  const payload=await secret.json(), token=payload.value??payload.client_secret?.value;
  if(typeof token!=='string')throw new Error('No client secret returned.');
  const socket=socketFactory('wss://api.x.ai/v1/realtime?model=grok-voice-3.0',['xai-client-secret.'+token]);
  await new Promise((resolve,reject)=>{
    let started=0;
    const timer=setTimeout(()=>{socket.close();reject(new Error('No audio within 15 seconds.'));},15000);
    socket.onopen=()=>{
      socket.send(JSON.stringify({type:'session.update',session:{voice:'altair',reasoning:{effort:'none'},instructions:'Speak naturally and briefly.',audio:{output:{format:{type:'audio/pcm',rate:24000}}},tools:[]}}));
      socket.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'Say hello in five words.'}]}}));
      started=performance.now();socket.send(JSON.stringify({type:'response.create'}));
    };
    socket.onmessage=event=>{
      const message=JSON.parse(String(event.data));console.log(message.type);
      if(message.type==='response.output_audio.delta'){console.log(`First audio: ${Math.round(performance.now()-started)}ms`);clearTimeout(timer);socket.close();resolve();}
      if(message.type==='error'){clearTimeout(timer);socket.close();reject(new Error('Voice returned an error.'));}
    };
    socket.onerror=()=>{clearTimeout(timer);socket.close();reject(new Error('Voice connection failed.'));};
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)smoke().catch(()=>{console.error('Voice smoke test failed. Check the key and local setup.');process.exitCode=1;});
