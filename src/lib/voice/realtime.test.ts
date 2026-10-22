import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RealtimeClient, VOICE_MODEL, VOICE_URL, type SocketLike, type PcmPlayback } from "./realtime";
import { ChatSession, DEFAULT_VOICE_LAYER, readFastVoicePreference } from "./session";
import { buildRealtimeConfig, todaySchedule, voiceSessionResponse } from "./realtime-config";
import type { ChatMessageInput } from "../types";

class FakeSocket implements SocketLike {
  readyState=0;onopen:(()=>void)|null=null;onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;onmessage:((event:{data:unknown})=>void)|null=null;
  sent: Array<Record<string,unknown>>=[];
  open(){this.readyState=1;this.onopen?.();}
  emit(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
  send(data:string){this.sent.push(JSON.parse(data));}
  close(){this.readyState=3;this.onclose?.();}
}
class FakeClock {
  time=0;next=1;tasks=new Map<number,{at:number;fn:()=>void}>();
  set=(fn:()=>void,ms:number)=>{const id=this.next++;this.tasks.set(id,{at:this.time+ms,fn});return id as unknown as ReturnType<typeof setTimeout>;};
  clear=(id:ReturnType<typeof setTimeout>)=>{this.tasks.delete(id as unknown as number);};
  advance(ms:number){const end=this.time+ms;while(true){const next=[...this.tasks].sort((a,b)=>a[1].at-b[1].at).find(([,t])=>t.at<=end);if(!next)break;this.tasks.delete(next[0]);this.time=next[1].at;next[1].fn();}this.time=end;}
}
const config={model:VOICE_MODEL,voice:"altair",token:"ephemeral-test",expiresAt:123,instructions:"Jarvis",tools:[{type:"function",name:"ask_brain"},{type:"function",name:"get_dashboard"}]};
const history:ChatMessageInput[]=[{role:"user",content:"What about school?"},{role:"assistant",content:"Friday."},{role:"user",content:"What about that?"}];
async function flush(){for(let i=0;i<6;i++)await new Promise<void>(resolve=>setImmediate(resolve));}
function harness(overrides: Partial<ConstructorParameters<typeof RealtimeClient>[0]> = {}, autoOpen=true) {
  const clock=new FakeClock(), sockets:FakeSocket[]=[], played:string[]=[], notices:string[]=[], calls:Array<{url:string;body:unknown}>=[];
  const playback:PcmPlayback={unlock(){},async push(data){played.push(data);},async idle(){},stop(){},close(){}};
  const fake:typeof fetch=async(url,init)=>{
    calls.push({url:String(url),body:init?.body?JSON.parse(String(init.body)):null});
    if(String(url)==="/api/voice/session")return Response.json(config);
    if(String(url).startsWith("/api/board"))return new Response(null,{status:404});
    throw new Error("Unexpected network call");
  };
  const client=new RealtimeClient({fetchImpl:fake,playback,now:()=>clock.time,setTimer:clock.set,clearTimer:clock.clear,onFallback:line=>notices.push(line),
    socketFactory:(url,protocols)=>{assert.equal(url,VOICE_URL);assert.deepEqual(protocols,["xai-client-secret.ephemeral-test"]);const socket=new FakeSocket();sockets.push(socket);if(autoOpen)queueMicrotask(()=>socket.open());return socket;},
    chat:async(messages)=>{calls.push({url:"/api/chat",body:{messages,stream:true}});return {reply:"Brain answer.",mode:"grok",receipts:[],sources:["School"]};},...overrides});
  return {client,clock,sockets,played,notices,calls};
}
function finish(socket:FakeSocket,text="Hello Joseph.") {
  socket.emit({type:"response.output_audio.delta",delta:"AAAAAA=="});
  socket.emit({type:"response.output_audio_transcript.delta",delta:text});
  socket.emit({type:"response.done",response:{output:[]}});
}
test("session uses pinned voice model, Altair and function tools only",async()=>{
  const h=harness();await h.client.connect(history);
  assert.equal(VOICE_MODEL,"grok-voice-3.0");
  const sent=h.sockets[0].sent[0] as {type:string;session:typeof config};
  assert.equal(sent.type,"session.update");assert.equal(sent.session.voice,"altair");assert.ok(sent.session.tools.every(t=>t.type==="function"));
  assert.equal("token" in sent.session,false);h.client.close();
});
test("ask_brain gets history and sends function output before one continuation after playback",async()=>{
  let release!:()=>void;const filler=new Promise<void>(resolve=>{release=resolve;});
  const h=harness({playback:{unlock(){},async push(){},idle:()=>filler,stop(){},close(){}}});
  const answer=h.client.ask("What about that?",history,new AbortController().signal);await flush();const socket=h.sockets[0];
  socket.emit({type:"response.output_audio.delta",delta:"AAAAAA=="});
  socket.emit({type:"response.function_call_arguments.done",name:"ask_brain",call_id:"brain1",arguments:JSON.stringify({question:"What about school on Friday?",reason:"notes"})});
  socket.emit({type:"response.done",response:{output:[]}});await flush();
  const chat=h.calls.find(c=>c.url==="/api/chat")!.body as {messages:ChatMessageInput[]};
  assert.deepEqual(chat.messages.slice(0,-1),history);assert.equal(chat.messages.at(-1)?.content,"What about school on Friday?");
  assert.equal(socket.sent.filter(e=>e.type==="response.create").length,1);
  release();await flush();
  const output=socket.sent.findIndex(e=>(e.item as {type?:string})?.type==="function_call_output");
  const continuation=socket.sent.findIndex((e,i)=>i>output&&e.type==="response.create");assert.ok(output>=0&&continuation>output);
  finish(socket,"Friday's answer.");assert.equal((await answer).sources?.[0],"School");h.client.close();
});
test("parallel function calls submit every output before exactly one response.create",async()=>{
  const h=harness();const answer=h.client.ask("How is everything?",history,new AbortController().signal);await flush();const socket=h.sockets[0];
  for(const id of ["a","b"])socket.emit({type:"response.function_call_arguments.done",name:"get_dashboard",call_id:id,arguments:"{}"});
  socket.emit({type:"response.done",response:{output:[]}});socket.emit({type:"response.done",response:{output:[]}});await flush();
  const outputs=socket.sent.map((e,i)=>(e.item as {type?:string})?.type==="function_call_output"?i:-1).filter(i=>i>=0);
  assert.equal(outputs.length,2);assert.equal(socket.sent.filter(e=>e.type==="response.create").length,2);
  assert.ok(outputs.every(i=>i<socket.sent.length-1));
  finish(socket);await answer;h.client.close();
});
for(const text of ["show the graph","note that birds sing"])test(`typed pre-router sends ${text} to chat then force_message`,async()=>{
  const h=harness();const answer=h.client.ask(text,[{role:"user",content:text}],new AbortController().signal);await flush();const socket=h.sockets[0];
  assert.ok(h.calls.some(c=>c.url==="/api/chat"));
  assert.equal(socket.sent.some(e=>(e.item as {type?:string})?.type==="message"),false);
  assert.ok(socket.sent.some(e=>(e.response as {force_message?:string})?.force_message==="Brain answer."));
  finish(socket,"Brain answer.");await answer;h.client.close();
});
test("open timeout and an error permanently fall back",async()=>{
  const h=harness({},false);const opening=h.client.connect().catch(()=>{});await flush();h.clock.advance(3000);await opening;
  assert.equal(h.client.disabled,true);assert.equal(h.notices.length,1);h.client.close();
  const e=harness();await e.client.connect();e.sockets[0].emit({type:"error"});assert.equal(e.client.disabled,true);e.client.close();
});
test("session route failure, no audio watchdog and two disconnects fall back",async()=>{
  const failed=harness({fetchImpl:async()=>new Response(null,{status:503})});await assert.rejects(failed.client.connect());assert.equal(failed.client.disabled,true);failed.client.close();
  const silent=harness();const pending=silent.client.ask("hi",history,new AbortController().signal).catch(()=>{});await flush();silent.clock.advance(5000);await pending;assert.equal(silent.client.disabled,true);silent.client.close();
  const h=harness();await h.client.connect();h.sockets[0].close();assert.equal(h.client.disabled,false);await h.client.connect();h.sockets[1].close();assert.equal(h.client.disabled,true);h.client.close();
});
test("idle socket closes after sixty seconds and reconnect rebuilds the session",async()=>{
  const h=harness();await h.client.connect(history);h.clock.advance(60000);assert.equal(h.sockets[0].readyState,3);assert.equal(h.client.disabled,false);
  await h.client.connect(history);assert.equal(h.sockets.length,2);assert.equal(h.calls.filter(c=>c.url==="/api/voice/session").length,2);h.client.close();
});
test("barge-in aborts a pending brain request and stops playback",async()=>{
  let signal:AbortSignal|undefined,stops=0;
  const h=harness({chat:async(_messages,s)=>{signal=s;return new Promise((_,reject)=>s.addEventListener("abort",()=>reject(new DOMException("Stopped","AbortError"))));},playback:{unlock(){},async push(){},async idle(){},stop(){stops++;},close(){}}});
  const answer=h.client.ask("note that birds sing",history,new AbortController().signal).catch(()=>{});await flush();h.sockets[0].emit({type:"input_audio_buffer.speech_started"});await answer;
  assert.equal(signal?.aborted,true);assert.ok(stops>=2);h.client.close();
});
test("default env and toggle are TTS; default session makes no realtime calls",async()=>{
  assert.equal(DEFAULT_VOICE_LAYER,"tts");assert.equal(readFastVoicePreference({getItem:()=>null}),false);
  assert.equal(readFastVoicePreference({getItem:()=>"true"}),true);
  const urls:string[]=[];
  const session=new ChatSession({realtimeAllowed:true,fetchImpl:async url=>{urls.push(String(url));return Response.json({reply:"Hi.",mode:"demo",receipts:[]});}});
  assert.equal(session.mode,"tts");
  await session.run([{role:"user",content:"hi"}],new AbortController().signal,{sentence(){},transcript(){}});
  assert.deepEqual(urls,["/api/chat"]);session.close();
});
async function configRoot() {
  const root=await mkdtemp(path.join(os.tmpdir(),"voice-config-"));await mkdir(path.join(root,"vault"));
  await writeFile(path.join(root,"vault","Voice-and-tone.md"),"Quiet and warm.");
  await writeFile(path.join(root,"vault","School-schedule.md"),"# Monday\nMath\n# Thursday\nScience at 9am\n# Friday\nArt");return root;
}
test("server instructions include bounded local context in order, speed and routing rules",async()=>{
  const config=await buildRealtimeConfig({root:await configRoot(),now:new Date("2026-10-22T16:00:00Z"),history:Array.from({length:9},()=>({role:"user",content:"x".repeat(300)})),speed:"9",digestProvider:async()=>"Waiting on a review."});
  assert.equal(config.voice,"altair");assert.equal(config.model,"grok-voice-3.0");assert.equal(config.reasoning.effort,"none");assert.equal(config.audio.output.speed,1.5);
  assert.equal(config.replace.UMLY,"U M L Y");assert.ok(config.tools.every(t=>t.type==="function"));
  const text=config.instructions;assert.match(text,/Joseph is 14/);assert.match(text,/Quiet and warm/);assert.match(text,/Science at 9am/);assert.doesNotMatch(text,/\nArt/);
  const labels=["You are Jarvis","Now:","Today:","Dashboard digest:","Recent chat","Stay fast"];
  assert.deepEqual(labels.map(s=>text.indexOf(s)),labels.map(s=>text.indexOf(s)).sort((a,b)=>a-b));
  assert.equal(text.match(/user: x{200}/g)?.length,6);
  assert.match(todaySchedule("# Friday\nArt",new Date("2026-10-23T16:00:00Z")),/Art/);
});
test("session rejects remote Host/source/origin before upstream access and defaults to off",async()=>{
  let calls=0;const fetchImpl:typeof fetch=async()=>{calls++;throw new Error("Forbidden");};
  const cases: Array<Record<string,string>> = [{host:"evil.test"},{host:"127.0.0.1",origin:"https://evil.test"},{host:"127.0.0.1","x-forwarded-for":"192.0.2.4"}];
  for(const headers of cases){
    const request=new Request("http://127.0.0.1/api/voice/session",{method:"POST",headers,body:'{"messages":[]}'});
    assert.equal((await voiceSessionResponse(request,{fetchImpl,env:{JARVIS_VOICE_LAYER:"realtime"}})).status,403);
  }
  const request=new Request("http://127.0.0.1/api/voice/session",{method:"POST",headers:{host:"127.0.0.1"},body:'{"messages":[]}'});
  assert.equal((await voiceSessionResponse(request,{fetchImpl,env:{}})).status,409);assert.equal(calls,0);
});
test("minting sends only expires_after and returns the ephemeral token, never the server key",async()=>{
  const root=await configRoot();let requests=0;
  const request=new Request("http://127.0.0.1/api/voice/session",{method:"POST",headers:{host:"127.0.0.1"},body:JSON.stringify({messages:history})});
  const response=await voiceSessionResponse(request,{root,env:{JARVIS_VOICE_LAYER:"realtime",XAI_API_KEY:"server-test-key"},fetchImpl:async(url,init)=>{
    requests++;assert.equal(String(url),"https://api.x.ai/v1/realtime/client_secrets");assert.deepEqual(JSON.parse(String(init?.body)),{expires_after:{seconds:300}});
    assert.equal(new Headers(init?.headers).get("authorization"),"Bearer server-test-key");return Response.json({value:"ephemeral-test",expires_at:123});
  }});
  assert.equal(response.status,200);const body=await response.text();assert.match(body,/ephemeral-test/);assert.doesNotMatch(body,/server-test-key/);assert.equal(requests,1);
});
test("socket error event falls back and a four-second filler never completes the pending turn",async()=>{
  const broken=harness();await broken.client.connect();broken.sockets[0].onerror?.();assert.equal(broken.client.disabled,true);broken.client.close();
  let release!:(response:{reply:string;mode:"grok";receipts:[]})=>void;
  const brain=new Promise<{reply:string;mode:"grok";receipts:[]}>(resolve=>{release=resolve;});
  const h=harness({chat:()=>brain});let settled=false;
  const answer=h.client.ask("note that birds sing",history,new AbortController().signal).then(value=>{settled=true;return value;});await flush();
  h.clock.advance(4000);const socket=h.sockets[0];finish(socket,"Still working on it.");await flush();assert.equal(settled,false);
  h.clock.advance(4000);
  assert.equal(socket.sent.filter(e=>(e.response as {force_message?:string})?.force_message==="Still working on it.").length,1);
  release({reply:"Saved it.",mode:"grok",receipts:[]});await flush();finish(socket,"Saved it.");await answer;h.client.close();
});
test("mic transcripts and PCM output work without a typed turn; a cancelled response cannot finish a newer turn",async()=>{
  const texts:string[]=[], replies:string[]=[];
  const h=harness({onMicText:text=>texts.push(text),onMicResponse:response=>replies.push(response.reply)});
  await h.client.connect(history);h.client.setMicrophone(true);const socket=h.sockets[0];
  socket.emit({type:"input_audio_buffer.speech_started"});
  socket.emit({type:"conversation.item.input_audio_transcription.completed",transcript:"Hello there"});
  socket.emit({type:"response.created",response:{id:"mic1"}});finish(socket,"Hello Joseph.");await flush();
  assert.deepEqual(texts,["Hello there"]);assert.deepEqual(replies,["Hello Joseph."]);
  h.client.cancel();
  socket.emit({type:"response.output_audio_transcript.delta",response_id:"mic1",delta:"Old response"});
  socket.emit({type:"response.done",response:{id:"mic1",output:[]}});await flush();assert.equal(replies.length,1);h.client.close();
});
test("a rejected brain call submits an honest tool failure and still finishes the voice turn",async()=>{
  const h=harness({chat:async()=>{throw new Error("Fake failure");}});
  const answer=h.client.ask("Tell me more",history,new AbortController().signal);await flush();const socket=h.sockets[0];
  socket.emit({type:"response.function_call_arguments.done",name:"ask_brain",call_id:"failed",arguments:JSON.stringify({question:"School?",reason:"notes"})});
  socket.emit({type:"response.done",response:{output:[]}});await flush();
  const output=socket.sent.find(e=>(e.item as {type?:string})?.type==="function_call_output")?.item as {output:string};
  assert.match(output.output,/did not answer/);finish(socket,"The brain did not answer.");await answer;h.client.close();
});
test("response.done recovers a transcript when transcript deltas were absent",async()=>{
  const h=harness();const answer=h.client.ask("Hello",history,new AbortController().signal);await flush();const socket=h.sockets[0];
  socket.emit({type:"response.output_audio.delta",delta:"AAAAAA=="});
  socket.emit({type:"response.done",response:{output:[{type:"message",content:[{transcript:"Hello Joseph."}]}]}});
  assert.equal((await answer).reply,"Hello Joseph.");h.client.close();
});
test("an unavailable audio context falls back once and keeps the page on standard voice",async()=>{
  const urls:string[]=[], notices:string[]=[];
  const session=new ChatSession({realtimeAllowed:true,
    playback:{unlock(){throw new Error("Audio unavailable");},async push(){},async idle(){},stop(){},close(){}},
    fetchImpl:async url=>{urls.push(String(url));return Response.json({reply:"Standard reply.",mode:"demo",receipts:[]});},
    onFallback:line=>notices.push(line),
  });
  session.setEnabled(true);
  const hooks={sentence(){},transcript(){}};
  for(let i=0;i<2;i++)assert.equal((await session.run([{role:"user",content:"Hello"}],new AbortController().signal,hooks)).path,"tts");
  assert.equal(notices.length,1);assert.deepEqual(urls,["/api/chat","/api/chat"]);session.close();
});
