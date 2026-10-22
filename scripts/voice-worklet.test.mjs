import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/voice-pcm-worklet.js',import.meta.url),'utf8');
function processor(rate){
  const classes=new Map();
  vm.runInNewContext(source,{sampleRate:rate,AudioWorkletProcessor:class{constructor(){this.port={onmessage:null,postMessage(){}}}},registerProcessor:(name,value)=>classes.set(name,value)});
  return new (classes.get('jarvis-pcm'))();
}
test('PCM worklet plays successive chunks in strict order and clear silences the queue',()=>{
  const node=processor(24000);
  for(const samples of [[.5,-.5],[1]])node.port.onmessage({data:{type:'audio',samples:Float32Array.from(samples)}});
  const output=new Float32Array(4);node.process([],[[output]]);assert.deepEqual([...output],[.5,-.5,1,0]);
  node.port.onmessage({data:{type:'audio',samples:Float32Array.from([1,1])}});node.port.onmessage({data:{type:'clear'}});
  node.process([],[[output]]);assert.deepEqual([...output],[0,0,0,0]);
});
test('24k PCM stretches correctly for a device running at 48k',()=>{
  const node=processor(48000);node.port.onmessage({data:{type:'audio',samples:Float32Array.from([.5,-.5])}});
  const output=new Float32Array(4);node.process([],[[output]]);assert.deepEqual([...output],[.5,.5,-.5,-.5]);
});
