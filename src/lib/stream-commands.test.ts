import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { streamTurn, startChatTiming, recordVoiceFirstByte } from "./brain";
import { parseIntent } from "./intent";
import { createSentenceQueue } from "./voice/sentence-queue";

async function root() {
  const directory = await mkdtemp(path.join(os.tmpdir(),"commands-"));
  await mkdir(path.join(directory,"vault"));
  await writeFile(path.join(directory,"vault","About.md"),"# About\nJoseph likes nature.");
  return directory;
}
test("streaming note, changes, brief and layout dispatch before quick answers without a model", async () => {
  const directory=await root();
  const options={root:directory,useModel:true,complete:async()=>{throw new Error("A deterministic command called the model");}};
  const replies=[];
  for(const content of ["note that birds sing","what changed","move to the side","Morning brief"]){
    for await(const event of streamTurn([{role:"user",content}],options)) if(event.type==="done") replies.push(event.response);
  }
  assert.equal(replies[0].plan?.tool,"notes.keep");
  assert.match(replies[1].reply,/birds|saved|wrote|changed/i);
  assert.deepEqual(replies[2].graph,{action:"layout",value:"side"});
  assert.ok(replies[3].brief);
  assert.match(await readFile(path.join(directory,"data","vault-ledger.json"),"utf8"),/birds/);
});
test("layout intents and a bare yes preserve the on-screen confirmation boundary",()=>{
  for(const [text,value] of [["move to the side","side"],["move to the center","center"],["show the graph","graph"],["hide the graph","home"],["go home","home"]]) {
    assert.deepEqual(parseIntent(text),{kind:"graph",command:{action:"layout",value}});
  }
  assert.deepEqual(parseIntent("yes"),{kind:"chat"});
});
test("streamed conversation observes edits before it completes",async()=>{
  const directory=await root();
  for await(const event of streamTurn([{role:"user",content:"hello"}],{root:directory,useModel:false})) assert.ok(event);
  await writeFile(path.join(directory,"vault","About.md"),"# About\nJoseph likes birds.");
  for await(const event of streamTurn([{role:"user",content:"hello"}],{root:directory,useModel:false})) assert.ok(event);
  const ledger=await readFile(path.join(directory,"data","vault-ledger.json"),"utf8");
  assert.match(ledger,/About/);
});
test("audio n+1 prepares while n is playing, with strict playback order",async()=>{
  const events:string[]=[];
  let release!:()=>void;
  const wait=new Promise<void>(r=>{release=r;});
  const queue=createSentenceQueue(async(text,prepared)=>{
    await prepared; events.push(`play:${text}`);
    if(text==="One.") await wait;
    events.push(`end:${text}`);
  },new AbortController().signal,async text=>{events.push(`fetch:${text}`);return text;});
  queue.enqueue("One. Two. Three.");
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(events,["fetch:One.","fetch:Two.","play:One."]);
  release(); await queue.drain();
  assert.ok(events.indexOf("fetch:Three.")<events.indexOf("play:Two."));
  assert.ok(events.indexOf("end:One.")<events.indexOf("play:Two."));
});
test("timing logs durations only for every kind and updates the first audio measurement",t=>{
  const lines:string[]=[];t.mock.method(console,"info",(line:string)=>lines.push(line));
  let now=0;
  const timing=startChatTiming("show the graph","timing-test",()=>now);
  now=12;timing.first();now=20;timing.done();recordVoiceFirstByte("timing-test",31);
  assert.deepEqual(lines,["[timing] kind=command firstSentenceMs=12 doneMs=20 ttsFirstByteMs=-1","[timing] kind=command firstSentenceMs=12 doneMs=20 ttsFirstByteMs=31"]);
  assert.ok(lines.every(line=>!line.includes("show the graph")));
  startChatTiming("hi",null).done();startChatTiming("Tell me about school this week",null).done();
  assert.match(lines[2],/kind=quick/);assert.match(lines[3],/kind=grounded/);
});
