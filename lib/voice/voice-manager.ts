import {audioManager} from "../audio/audio-manager";

export type MicState="idle"|"requesting"|"ready"|"denied"|"unsupported";
class VoiceManager{
  stream:MediaStream|null=null;
  private constraints={noiseSuppression:true,autoGainControl:true};
  configure(patch:Partial<typeof this.constraints>){this.constraints={...this.constraints,...patch}}
  async request():Promise<MediaStream>{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("Microphone is not supported in this browser.");
    if(this.stream)return this.stream;
    this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,...this.constraints},video:false});
    return this.stream;
  }
  setBroadcasting(active:boolean){this.stream?.getAudioTracks().forEach(track=>{track.enabled=active})}
  stop(){this.stream?.getTracks().forEach(track=>track.stop());this.stream=null}
  devices(){return navigator.mediaDevices?.enumerateDevices()??Promise.resolve([])}
  createMeter(stream:MediaStream,onLevel:(level:number)=>void){
    const ctx=new AudioContext(),source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();analyser.fftSize=256;source.connect(analyser);const data=new Uint8Array(analyser.frequencyBinCount);let frame=0;
    const tick=()=>{analyser.getByteFrequencyData(data);onLevel(data.reduce((a,b)=>a+b,0)/data.length/255);frame=requestAnimationFrame(tick)};tick();
    return()=>{cancelAnimationFrame(frame);void ctx.close()};
  }
}
export const voiceManager=new VoiceManager();

type SignalApi={
  signal:(code:string,id:string,to:string,type:string,payload:unknown,sessionKey:string)=>Promise<unknown>;
  signals:(code:string,id:string,after:number,sessionKey:string)=>Promise<{signals:{id:number;fromUserId:string;type:string;payload:unknown}[]}>;
};

export class StageVoiceRoom{
  private peers=new Map<string,RTCPeerConnection>();
  private pollTimer:number|null=null;
  private cursor=0;
  private stopped=false;
  private audio=new Map<string,()=>void>();
  private pendingCandidates=new Map<string,RTCIceCandidateInit[]>();
  private offerTimer:number|null=null;
  private performerStream:MediaStream|null=null;
  private audienceIds:string[]=[];
  constructor(private code:string,private userId:string,private sessionKey:string,private api:SignalApi,private onStatus:(status:string)=>void){}
  private peer(peerId:string,stream?:MediaStream){
    const existing=this.peers.get(peerId);if(existing)return existing;
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.cloudflare.com:3478"},{urls:"stun:stun.l.google.com:19302"}]});
    stream?.getTracks().forEach(track=>pc.addTrack(track,stream));
    pc.onicecandidate=e=>{if(e.candidate)void this.api.signal(this.code,this.userId,peerId,"candidate",e.candidate.toJSON(),this.sessionKey).catch(()=>this.onStatus("reconnecting"))};
    pc.onconnectionstatechange=()=>this.onStatus(pc.connectionState);
    pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==="failed")void pc.restartIce()};
    pc.ontrack=e=>{const stream=e.streams[0]||new MediaStream([e.track]);this.audio.get(peerId)?.();this.audio.set(peerId,audioManager.attachVoiceStream(stream,()=>this.onStatus("live"),()=>this.onStatus("playback-blocked")))};
    this.peers.set(peerId,pc);return pc;
  }
  async startPerformer(stream:MediaStream,audienceIds:string[]){
    this.performerStream=stream;this.audienceIds=audienceIds;this.startPolling();await this.offerAudience();
    this.offerTimer=window.setInterval(()=>void this.offerAudience(true),5000);
  }
  startAudience(){this.startPolling()}
  private startPolling(){
    this.onStatus("connecting");
    const poll=async()=>{if(this.stopped)return;try{const data=await this.api.signals(this.code,this.userId,this.cursor,this.sessionKey);for(const signal of data.signals){this.cursor=Math.max(this.cursor,signal.id);const pc=this.peer(signal.fromUserId);if(signal.type==="offer"){this.onStatus("offer-received");await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);await this.flushCandidates(signal.fromUserId,pc);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await this.api.signal(this.code,this.userId,signal.fromUserId,"answer",answer,this.sessionKey);this.onStatus("answer-sent")}else if(signal.type==="answer"){this.onStatus("answer-received");await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);await this.flushCandidates(signal.fromUserId,pc)}else if(signal.type==="candidate"){const candidate=signal.payload as RTCIceCandidateInit;if(pc.remoteDescription)await pc.addIceCandidate(candidate);else this.pendingCandidates.set(signal.fromUserId,[...(this.pendingCandidates.get(signal.fromUserId)||[]),candidate])}}}catch{this.onStatus("reconnecting")}this.pollTimer=window.setTimeout(poll,700)};void poll();
  }
  private async offerAudience(retry=false){
    if(this.stopped||!this.performerStream)return;
    for(const peerId of this.audienceIds){
      try{
        const pc=this.peer(peerId,this.performerStream);if(pc.connectionState==="connected"||pc.signalingState!=="stable")continue;
        const offer=await pc.createOffer({iceRestart:retry&&(pc.connectionState==="failed"||pc.connectionState==="disconnected")});await pc.setLocalDescription(offer);await this.api.signal(this.code,this.userId,peerId,"offer",offer,this.sessionKey);this.onStatus(retry?"reconnecting":"offer-sent");
      }catch{this.onStatus("reconnecting")}
    }
  }
  private async flushCandidates(peerId:string,pc:RTCPeerConnection){const pending=this.pendingCandidates.get(peerId)||[];this.pendingCandidates.delete(peerId);for(const candidate of pending)await pc.addIceCandidate(candidate)}
  stop(){this.stopped=true;if(this.pollTimer)clearTimeout(this.pollTimer);if(this.offerTimer)clearInterval(this.offerTimer);this.peers.forEach(pc=>pc.close());this.audio.forEach(disconnect=>disconnect());this.peers.clear();this.audio.clear();this.pendingCandidates.clear();this.performerStream=null;this.audienceIds=[]}
}
