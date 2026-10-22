import { parseIntent } from "../intent";
import { butlerSpeech } from "./policy";
import type { ChatMessageInput, ChatResponse } from "../types";

export const VOICE_MODEL = "grok-voice-3.0";
export const VOICE_URL = `wss://api.x.ai/v1/realtime?model=${VOICE_MODEL}`;
export const FAST_VOICE_OFF = "Fast voice off — using standard voice";
export interface SocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}
export interface PcmPlayback {
  unlock(): void;
  push(base64: string): Promise<void>;
  idle(): Promise<void>;
  stop(): void;
  close(): void;
}
/** One context and one worklet queue own all PCM playback. Unlock is called by the Ask click. */
export class WorkletPlayback implements PcmPlayback {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private ready: Promise<void> = Promise.resolve();
  private queued = false;
  private generation = 0;
  private waiters: Array<() => void> = [];
  constructor(private onSpeaking: (active: boolean, level?: number) => void = () => {}) {}
  unlock() {
    if (!this.context) {
      this.context = new AudioContext({sampleRate:24000});
      const context=this.context;
      this.ready=context.audioWorklet.addModule("/voice-pcm-worklet.js").then(()=>{
        this.node=new AudioWorkletNode(context,"jarvis-pcm");
        this.node.connect(context.destination);
        this.node.port.onmessage=event=>{
          if(event.data.type==="idle") {this.queued=false;this.onSpeaking(false,0);this.flush();}
          if(event.data.type==="level") this.onSpeaking(true,event.data.level);
        };
      });
      // The error is handled by push/idle and switches to standard speech.
      void this.ready.catch(()=>{});
    }
    void this.context.resume().catch(()=>{});
  }
  async push(base64: string) {
    const generation=this.generation;
    await this.ready;
    if(generation!==this.generation) return;
    if(!this.node) throw new Error("Audio is unavailable");
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const data=new DataView(bytes.buffer), samples=new Float32Array(Math.floor(bytes.length/2));
    for(let i=0;i<samples.length;i++) samples[i]=data.getInt16(i*2,true)/32768;
    this.queued=true;this.onSpeaking(true);
    this.node.port.postMessage({type:"audio",samples},[samples.buffer]);
  }
  async idle() {await this.ready;if(this.queued) await new Promise<void>(resolve=>this.waiters.push(resolve));}
  private flush() {for(const done of this.waiters.splice(0)) done();}
  stop() {this.generation++;this.node?.port.postMessage({type:"clear"});this.queued=false;this.flush();this.onSpeaking(false,0);}
  close() {this.stop();this.node?.disconnect();void this.context?.close();this.node=null;this.context=null;}
  async microphone(onPcm: (data: string) => void): Promise<() => void> {
    if((await navigator.permissions.query({name:"microphone" as PermissionName})).state!=="granted") throw new Error("Microphone is not already allowed");
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    await this.ready;
    if(!this.context) {stream.getTracks().forEach(t=>t.stop());throw new Error("Audio is unavailable");}
    const source=this.context.createMediaStreamSource(stream);
    const capture=new AudioWorkletNode(this.context,"jarvis-input");
    capture.port.onmessage=event=>{
      const bytes=new Uint8Array(event.data);
      let text="";for(const byte of bytes) text+=String.fromCharCode(byte);
      onPcm(btoa(text));
    };
    source.connect(capture);capture.connect(this.context.destination);
    return ()=>{source.disconnect();capture.disconnect();stream.getTracks().forEach(t=>t.stop());};
  }
}

export type RealtimeConfig = {token:string;expiresAt:number;model:string;voice:string;instructions:string;tools:unknown[];[key:string]:unknown};
export type RealtimeOptions = {
  fetchImpl?: typeof fetch;
  socketFactory?: (url: string, protocols: string[]) => SocketLike;
  playback: PcmPlayback;
  chat: (messages: ChatMessageInput[], signal: AbortSignal) => Promise<ChatResponse>;
  onTranscript?: (text: string) => void;
  onBrain?: (response: ChatResponse) => void;
  onThinking?: (thinking: boolean) => void;
  onFallback?: (line: string) => void;
  onMinutes?: (minutes: number) => void;
  onMicText?: (text: string) => void;
  onMicResponse?: (response: ChatResponse) => void;
  onIdle?: () => void;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};
type VoiceEvent = {type:string;delta?:string;transcript?:string;name?:string;arguments?:string;call_id?:string;response_id?:string;response?:{id?:string;output?:Array<{type:string;name?:string;call_id?:string;arguments?:string;content?:Array<{transcript?:string;text?:string}>}>}};
const BRAIN_INSTRUCTIONS="Say the brain's answer to Joseph naturally. Keep every fact, number and name. Do not add facts. If a plan needs his confirmation, say so and tell him to click Yes or No on screen.";

export class RealtimeClient {
  private socket: SocketLike | null = null;
  private opening: Promise<void> | null = null;
  private failed = false;
  private history: ChatMessageInput[] = [];
  private transcript = "";
  private input = "";
  private brain: Promise<ChatResponse> | null = null;
  private brainValue: ChatResponse | null = null;
  private abort = new AbortController();
  private tools = new Map<string, Promise<void>>();
  private completedCalls = new Set<string>();
  private continuing = false;
  private pendingBrain = 0;
  private turn: {resolve:(response:ChatResponse)=>void;reject:(error:Error)=>void; cleanup:()=>void} | null = null;
  private openTimer?: ReturnType<typeof setTimeout>;
  private audioTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private fillerTimer?: ReturnType<typeof setTimeout>;
  private minuteTimer?: ReturnType<typeof setTimeout>;
  private disconnects: number[] = [];
  private connectedAt = 0;
  private connected = false;
  private listening = false;
  private responseId: string | null = null;
  private cancelledResponses = new Set<string>();
  private minutes = 0;
  private audioTail: Promise<void> = Promise.resolve();
  private fetchImpl: typeof fetch;
  private now: () => number;
  private timer: NonNullable<RealtimeOptions["setTimer"]>;
  private clear: NonNullable<RealtimeOptions["clearTimer"]>;
  constructor(private options: RealtimeOptions) {
    this.fetchImpl=options.fetchImpl??((input,init)=>fetch(input,init));this.now=options.now??(()=>Date.now());
    this.timer=options.setTimer??((callback,ms)=>setTimeout(callback,ms));this.clear=options.clearTimer??(timer=>clearTimeout(timer));
  }
  get disabled() {return this.failed;}
  get brainResult() {return this.brain;}
  unlock() {this.options.playback.unlock();}
  private send(value: unknown) {
    if(!this.socket||this.socket.readyState!==1) throw new Error("Voice socket is closed");
    this.socket.send(JSON.stringify(value));
  }
  private touch() {if(this.idleTimer)this.clear(this.idleTimer);this.idleTimer=this.timer(()=>{ if(this.turn||this.tools.size) this.touch(); else {this.closeSocket();this.options.onIdle?.();} },60_000);}
  private countMinutes() {
    if(this.minuteTimer)this.clear(this.minuteTimer);
    this.options.onMinutes?.(this.minutes+(this.socket?.readyState===1?(this.now()-this.connectedAt)/60_000:0));
    if(this.socket?.readyState===1)this.minuteTimer=this.timer(()=>this.countMinutes(),1000);
  }
  private closeSocket() {
    if(this.connected)this.minutes+=(this.now()-this.connectedAt)/60_000;
    this.connected=false;
    const socket=this.socket;this.socket=null;
    if(socket){socket.onclose=null;socket.onmessage=null;socket.onerror=null;socket.onopen=null;socket.close();}
    if(this.minuteTimer)this.clear(this.minuteTimer);
    this.options.onMinutes?.(this.minutes);
  }
  private fail() {
    if(this.failed)return;
    this.failed=true;this.options.playback.stop();this.clearTurnTimers();this.closeSocket();
    this.options.onThinking?.(false);this.options.onFallback?.(FAST_VOICE_OFF);
    this.rejectTurn(new Error(FAST_VOICE_OFF));
  }
  private clearTurnTimers() {for(const timer of [this.audioTimer,this.fillerTimer])if(timer)this.clear(timer);this.audioTimer=undefined;this.fillerTimer=undefined;}
  private rejectTurn(error: Error) {const turn=this.turn;this.turn=null;turn?.cleanup();turn?.reject(error);}
  async connect(history: ChatMessageInput[] = []) {
    if(this.failed)throw new Error(FAST_VOICE_OFF);
    if(this.socket?.readyState===1)return;
    if(this.opening)return this.opening;
    this.history=history;
    this.opening=(async()=>{
      const response=await this.fetchImpl("/api/voice/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history.slice(-6).map(m=>({...m,content:m.content.slice(0,200)}))}),signal:AbortSignal.timeout(3000)});
      if(!response.ok)throw new Error("Session unavailable");
      const config=await response.json() as RealtimeConfig;
      if(config.model!==VOICE_MODEL||config.voice!=="altair"||!config.token)throw new Error("Invalid session");
      const factory=this.options.socketFactory??((url,protocols)=>new WebSocket(url,protocols) as unknown as SocketLike);
      const socket=factory(VOICE_URL,["xai-client-secret."+config.token]);this.socket=socket;
      await new Promise<void>((resolve,reject)=>{
        this.openTimer=this.timer(()=>{reject(new Error("Voice open timeout"));},3000);
        socket.onopen=()=>{
          if(this.openTimer)this.clear(this.openTimer);
          const {token: discardedToken,expiresAt: discardedExpiry,model: discardedModel,...session}=config;
          void discardedToken;void discardedExpiry;void discardedModel;
          try {this.send({type:"session.update",session});} catch {reject(new Error("Session failed"));return;}
          this.connectedAt=this.now();this.connected=true;this.touch();this.countMinutes();resolve();
        };
        socket.onmessage=event=>{
          try {
            const value=JSON.parse(String(event.data));
            if(value&&typeof value.type==="string")void this.event(value).catch(()=>this.fail());
          } catch {this.fail();}
        };
        socket.onerror=()=>{reject(new Error("Voice socket error"));this.fail();};
        socket.onclose=()=>{
          if(this.socket!==socket)return;
          if(this.connected)this.minutes+=(this.now()-this.connectedAt)/60_000;this.connected=false;this.socket=null;
          if(this.openTimer)this.clear(this.openTimer);
          reject(new Error("Voice disconnected"));
          const now=this.now();this.disconnects=this.disconnects.filter(t=>now-t<=60_000);this.disconnects.push(now);
          if(this.disconnects.length>=2||this.tools.size) {this.fail();return;}
          if(this.turn)void this.connect(this.history).then(()=>this.sendInput(this.input)).catch(()=>this.fail());
        };
      });
    })().catch(error=>{this.fail();throw error;}).finally(()=>{if(this.openTimer)this.clear(this.openTimer);this.opening=null;});
    return this.opening;
  }
  async refresh(history: ChatMessageInput[]) {
    this.history=history;
    if(this.socket?.readyState!==1)return;
    try {
      const response=await this.fetchImpl("/api/voice/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history.slice(-6).map(m=>({...m,content:m.content.slice(0,200)})),refresh:true})});
      if(!response.ok) {this.fail();return;}
      const config=await response.json();
      if(this.socket?.readyState===1)this.send({type:"session.update",session:{instructions:config.instructions}});
    } catch {this.fail();}
  }
  private createResponse(instructions?: string) {
    this.send({type:"response.create",...(instructions?{response:{instructions}}:{})});
    if(this.audioTimer)this.clear(this.audioTimer);
    this.audioTimer=this.timer(()=>this.fail(),5000);
  }
  private sendInput(text: string) {
    this.send({type:"conversation.item.create",item:{type:"message",role:"user",content:[{type:"input_text",text}]}});
    this.createResponse();this.touch();
  }
  async ask(text: string, history: ChatMessageInput[], signal: AbortSignal) {
    this.cancel();this.unlock();this.history=history;this.input=text;this.transcript="";this.brain=null;this.brainValue=null;
    await this.connect(history);
    if(signal.aborted)throw new DOMException("Stopped","AbortError");
    return new Promise<ChatResponse>((resolve,reject)=>{
      const aborted=()=>this.cancel();signal.addEventListener("abort",aborted,{once:true});
      this.turn={resolve,reject,cleanup:()=>signal.removeEventListener("abort",aborted)};
      try {
        // Typed commands never rely on a model's routing choice.
        const intent=parseIntent(text);
        if(intent.kind==="tool"||intent.kind==="graph"||intent.kind==="changes"||intent.kind==="refuse-call"||/^(?:morning|daily) brief[.!?]*$/i.test(text)) {
          this.options.onThinking?.(true);this.startFiller();
          const commandSignal = this.abort.signal;
          this.pendingBrain++;
          this.brain=this.options.chat(history,commandSignal).finally(() => { if (this.abort.signal === commandSignal) this.pendingBrain = Math.max(0, this.pendingBrain - 1); });
          void this.brain.then(response=>{
            if(commandSignal.aborted)return;
            this.brainValue=response;this.options.onBrain?.(response);this.options.onThinking?.(false);
            if(this.fillerTimer)this.clear(this.fillerTimer);
            this.forceMessage(butlerSpeech(response.reply),true);
          }).catch(()=>{if(!commandSignal.aborted)this.fail();});
        } else this.sendInput(text);
      } catch {this.fail();}
    });
  }
  private startFiller() {
    if(this.fillerTimer)this.clear(this.fillerTimer);
    this.fillerTimer=this.timer(()=>{
      if(this.socket?.readyState===1)this.send({type:"response.create",response:{force_message:"Still working on it.",interruptible:true}});
    },4000);
  }
  forceMessage(text: string, final = false) {
    if(final)this.transcript="";
    this.send({type:"response.create",response:{force_message:text,interruptible:true}});
    if(this.audioTimer)this.clear(this.audioTimer);
    this.audioTimer=this.timer(()=>this.fail(),5000);
    this.touch();
  }
  private tool(event: VoiceEvent): Promise<void> {
    const callId=event.call_id;
    if(!callId)return Promise.resolve();
    const existing=this.tools.get(callId);if(existing)return existing;
    if(this.completedCalls.has(callId))return Promise.resolve();
    const signal=this.abort.signal;
    const job=(async()=>{
      let output: unknown;
      try {
        const args=JSON.parse(event.arguments??"{}");
        if(event.name==="ask_brain") {
          if(typeof args.question!=="string"||!['notes','plan','command','dashboard','facts','long'].includes(args.reason))throw new Error("Invalid brain request");
          this.options.onThinking?.(true);this.startFiller();
          this.pendingBrain++;
          this.brain=this.options.chat([...this.history.slice(-8),{role:"user",content:args.question.slice(0,2000)}],signal).finally(() => { if (this.abort.signal === signal) this.pendingBrain = Math.max(0, this.pendingBrain - 1); });
          const answer=await this.brain;
          if(signal.aborted)return;
          this.brainValue=answer;this.options.onBrain?.(answer);
          output={answer:butlerSpeech(answer.reply),sources:answer.sources??[],plan:answer.plan,graph:answer.graph};
        } else if(event.name==="get_dashboard") {
          const suffix=typeof args.project==="string"?`?project=${encodeURIComponent(args.project.slice(0,200))}`:"";
          const response=await this.fetchImpl("/api/board"+suffix,{signal});
          const board=response.ok?await response.json():null;
          output=board && !["not-set-up","not-setup","missing"].includes(board.status) ? board : "Life dashboard isn't connected yet.";
        } else output="Unknown function. Only ask_brain and get_dashboard are available.";
      } catch {
        if(signal.aborted)return;
        output="The brain did not answer. No action was confirmed.";
      }
      if(signal.aborted)return;
      this.send({type:"conversation.item.create",item:{type:"function_call_output",call_id:callId,output:JSON.stringify(output)}});
      this.completedCalls.add(callId);
    })();
    this.tools.set(callId,job);void job.catch(()=>this.fail());return job;
  }
  setMicrophone(enabled: boolean) {this.listening=enabled;if(enabled)this.touch();}
  appendAudio(audio: string) {if(this.socket?.readyState===1)this.send({type:"input_audio_buffer.append",audio});}
  disable() {this.fail();}
  private async event(event: VoiceEvent) {
    const responseId = event.response_id ?? event.response?.id;
    if(responseId && this.cancelledResponses.has(responseId))return;
    if(event.type === "response.created" && responseId)this.responseId=responseId;
    if(event.type==="error") {this.fail();return;}
    if(event.type==="input_audio_buffer.speech_started") {this.cancel(false);this.transcript="";this.brain=null;this.brainValue=null;this.options.onThinking?.(true);this.touch();return;}
    if(event.type==="conversation.item.input_audio_transcription.completed" && typeof event.transcript==="string" && this.listening) {this.history=[...this.history.slice(-7),{role:"user",content:event.transcript}];this.options.onMicText?.(event.transcript);return;}
    if(event.type==="response.created" && this.listening && !this.audioTimer) {this.audioTimer=this.timer(()=>this.fail(),5000);}
    if(event.type==="response.output_audio.delta" && typeof event.delta==="string") {
      if(this.audioTimer)this.clear(this.audioTimer);this.audioTimer=undefined;
      this.audioTail=this.audioTail.then(()=>this.options.playback.push(event.delta!));
      void this.audioTail.catch(()=>this.fail());return;
    }
    if(event.type==="response.output_audio_transcript.delta" && typeof event.delta==="string") {
      this.transcript+=event.delta;this.options.onTranscript?.(this.transcript);return;
    }
    if(event.type==="response.output_audio_transcript.done" && typeof event.transcript==="string") {
      this.transcript=event.transcript;this.options.onTranscript?.(this.transcript);return;
    }
    if(event.type==="response.function_call_arguments.done") {void this.tool(event);return;}
    if(event.type!=="response.done")return;
    if(!this.transcript) {
      this.transcript=(event.response?.output??[]).flatMap(item=>item.content??[]).map(content=>content.transcript??content.text??"").join(" ").trim();
      if(this.transcript)this.options.onTranscript?.(this.transcript);
    }
    for(const item of event.response?.output??[])if(item.type==="function_call")void this.tool({...item,type:"response.function_call_arguments.done"});
    if(this.tools.size) {
      if(this.continuing)return;
      this.continuing=true;
      const pending=[...this.tools.values()];
      const signal=this.abort.signal;
      await Promise.all(pending);
      if(signal.aborted||this.failed)return;
      await this.audioTail;await this.options.playback.idle();
      if(signal.aborted||this.failed)return;
      this.tools.clear();if(this.fillerTimer)this.clear(this.fillerTimer);
      this.transcript="";this.options.onThinking?.(false);this.createResponse(BRAIN_INSTRUCTIONS);this.continuing=false;return;
    }
    if(this.pendingBrain>0)return;
    // Keep the no-audio watchdog until an actual delta arrives.
    if(this.audioTimer)return;
    const signal=this.abort.signal;
    await this.audioTail;await this.options.playback.idle();
    if(signal.aborted || signal !== this.abort.signal || this.failed)return;
    const turn=this.turn;
    const response:ChatResponse={...(this.brainValue??{mode:"grok",receipts:[]}),reply:this.transcript||this.brainValue?.reply||"",model:this.brainValue?"grok-4.7":"fast"};
    if(turn){this.turn=null;turn.cleanup();turn.resolve(response);}
    else if(this.listening){this.options.onMicResponse?.(response);this.history=[...this.history.slice(-7),{role:"assistant",content:response.reply}];}
    this.options.onThinking?.(false);
    this.touch();
  }
  cancel(sendCancel = true) {
    if(this.responseId)this.cancelledResponses.add(this.responseId);
    if(this.cancelledResponses.size > 100)this.cancelledResponses.delete(this.cancelledResponses.values().next().value!);
    this.responseId=null;
    this.abort.abort();this.abort=new AbortController();this.options.playback.stop();this.audioTail=Promise.resolve();
    if(sendCancel&&this.socket?.readyState===1) {try{this.send({type:"response.cancel"});}catch{}}
    this.tools.clear();this.completedCalls.clear();this.continuing=false;this.pendingBrain=0;this.clearTurnTimers();this.rejectTurn(new DOMException("Stopped","AbortError"));
  }
  close() {this.listening=false;this.cancel();if(this.idleTimer)this.clear(this.idleTimer);this.closeSocket();this.options.playback.close();}
}
