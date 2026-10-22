/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/* PCM stays in a single ordered queue. Resample 24k input if the device ignores the requested rate. */
class JarvisPcm extends AudioWorkletProcessor {
  constructor() {
    super();this.queue=[];this.offset=0;this.phase=0;this.active=false;
    this.port.onmessage=({data})=>{
      if(data.type==='clear'){this.queue=[];this.offset=0;this.phase=0;this.active=false;}
      if(data.type==='audio'){this.queue.push(data.samples);this.active=true;}
    };
  }
  process(_inputs,outputs) {
    const channel=outputs[0][0];if(!channel)return true;
    let energy=0;
    for(let i=0;i<channel.length;i++) {
      const chunk=this.queue[0];
      if(!chunk){channel[i]=0;continue;}
      channel[i]=chunk[this.offset]||0;energy+=channel[i]*channel[i];
      this.phase+=24000/sampleRate;
      while(this.phase>=1){this.phase--;this.offset++;if(this.offset>=this.queue[0]?.length){this.queue.shift();this.offset=0;}}
    }
    if(this.active&&this.queue.length)this.port.postMessage({type:'level',level:Math.min(1,Math.sqrt(energy/channel.length)*3.4)});
    if(this.active&&!this.queue.length){this.active=false;this.port.postMessage({type:'idle'});}
    return true;
  }
}
class JarvisInput extends AudioWorkletProcessor {
  constructor(){super();this.phase=0;this.samples=[];}
  process(inputs) {
    const channel=inputs[0]?.[0];if(!channel)return true;
    for(const sample of channel){
      this.phase+=24000/sampleRate;
      if(this.phase>=1){this.phase--;this.samples.push(Math.round(Math.max(-1,Math.min(1,sample))*32767));}
    }
    if(this.samples.length>=2400){const pcm=new Int16Array(this.samples);this.port.postMessage(pcm.buffer,[pcm.buffer]);this.samples=[];}
    return true;
  }
}
registerProcessor('jarvis-pcm',JarvisPcm);
registerProcessor('jarvis-input',JarvisInput);
