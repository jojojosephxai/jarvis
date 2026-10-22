import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loopbackBase,measureTurn,ndjson} from './latency.mjs';
test('latency refuses remote and misleading bases',()=>{
  for(const url of ['https://example.com','http://127.0.0.1.evil.test','http://user@localhost','file:///tmp']) assert.throws(()=>loopbackBase(url));
  assert.equal(loopbackBase('http://[::1]:3000/'),'http://[::1]:3000');
});
test('parser handles split lines and final line without a newline',async()=>{
  const body=new ReadableStream({start(c){for(const part of ['{"type":"sent','ence","text":"Hi."}\n{"type":"done"}'])c.enqueue(new TextEncoder().encode(part));c.close()}});
  const result=[];for await(const event of ndjson(body))result.push(event);
  assert.deepEqual(result,[{type:'sentence',text:'Hi.'},{type:'done'}]);
});
test('fake fetch measures first sentence, done and first audio byte',async()=>{
  let clock=0;
  const fake=async(url,init)=>{
    assert.equal(init.redirect,'error');
    if(url.endsWith('/api/chat')) {
      assert.equal(JSON.parse(init.body).stream,true);
      return new Response(new ReadableStream({async start(c){clock=20;c.enqueue(new TextEncoder().encode('{"type":"token","text":"Hi"}\n'));await new Promise(r=>setTimeout(r,5));clock=40;c.enqueue(new TextEncoder().encode('{"type":"sentence","text":"Hi."}\n'));await new Promise(r=>setTimeout(r,5));clock=100;c.enqueue(new TextEncoder().encode('{"type":"done"}\n'));c.close()}}));
    }
    assert.equal(JSON.parse(init.body).text,'Hi.');
    clock=65;return new Response(new Uint8Array([1,2]),{headers:{'content-type':'audio/mpeg'}});
  };
  assert.deepEqual(await measureTurn('http://127.0.0.1:3000','hi',fake,()=>clock),{firstTokenMs:20,firstSentenceMs:40,doneMs:100,ttsFirstByteMs:25,timeToFirstAudioMs:65});
});
