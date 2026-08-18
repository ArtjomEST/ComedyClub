import {isStageIntroId,STAGE_INTROS,type AudioSettings,type ReactionKind,type StageIntroId} from "../game/types";

const KEY="ccb-audio-v2";
const INTRO_KEY="ccb-stage-intro-v1";
export const DEFAULT_AUDIO:AudioSettings={master:.72,music:.34,ambience:.38,ui:.7,audience:.55,voice:1,muted:false};
type CueName="hover"|"click"|"back"|"ready"|"join"|"countdown"|"micOn"|"micOff"|"reaction"|"vote"|"warning"|"bell"|"reveal"|"rating";

class AudioManager{
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private ambience:GainNode|null=null;
  private underscore:GainNode|null=null;
  private ambienceSource:AudioBufferSourceNode|null=null;
  private underscoreTimer:number|null=null;
  private menuTrack:HTMLAudioElement|null=null;
  private introTrack:HTMLAudioElement|null=null;
  private selectedIntro:StageIntroId="dramatic-look";
  private menuActive=true;
  private performance=false;
  private unlocked=false;
  private listeners=new Set<()=>void>();
  settings:AudioSettings=DEFAULT_AUDIO;

  constructor(){
    if(typeof window!=="undefined"){
      try{this.settings={...DEFAULT_AUDIO,...JSON.parse(localStorage.getItem(KEY)||"{}")} }
      catch{this.settings=DEFAULT_AUDIO}
      const savedIntro=localStorage.getItem(INTRO_KEY);if(isStageIntroId(savedIntro))this.selectedIntro=savedIntro;
    }
  }
  private ensure(){
    if(typeof window==="undefined")return null;
    if(!this.context){
      this.context=new AudioContext();
      this.master=this.context.createGain();this.master.connect(this.context.destination);
      this.ambience=this.context.createGain();this.ambience.connect(this.master);
      this.underscore=this.context.createGain();this.underscore.connect(this.master);
      this.makeAmbience();this.makeUnderscore();
    }
    this.apply();
    if(this.context.state==="suspended")void this.context.resume();
    return this.context;
  }
  private ensureMenuTrack(){
    if(typeof window==="undefined"||this.menuTrack)return;
    const track=new Audio("/audio/menu-theme.mp3");track.loop=true;track.preload="auto";track.setAttribute("aria-hidden","true");this.menuTrack=track;
  }
  unlock(){this.unlocked=true;this.ensure();this.syncMenuTrack()}
  update(patch:Partial<AudioSettings>){this.settings={...this.settings,...patch};localStorage.setItem(KEY,JSON.stringify(this.settings));this.ensure();this.apply();this.syncMenuTrack();this.syncIntroTrack();this.listeners.forEach(listener=>listener())}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
  voiceVolume(){return this.settings.muted?0:Math.min(1,this.settings.master*this.settings.voice)}
  attachVoiceStream(stream:MediaStream,onPlaying?:()=>void,onBlocked?:()=>void){
    if(typeof document==="undefined")return()=>{};
    const audio=document.createElement("audio");audio.autoplay=true;audio.setAttribute("playsinline","");audio.setAttribute("aria-hidden","true");audio.style.display="none";audio.srcObject=stream;document.body.appendChild(audio);
    const sync=()=>{audio.volume=this.voiceVolume();audio.muted=this.voiceVolume()===0};
    const play=()=>{sync();void audio.play().then(()=>onPlaying?.()).catch(()=>onBlocked?.())};
    const unlock=()=>play();const unsubscribe=this.subscribe(sync);audio.addEventListener("playing",()=>onPlaying?.());window.addEventListener("pointerdown",unlock,{passive:true});play();
    return()=>{unsubscribe();window.removeEventListener("pointerdown",unlock);audio.pause();audio.srcObject=null;audio.remove()};
  }
  setMenuActive(active:boolean){this.menuActive=active;this.apply();this.syncMenuTrack()}
  private syncMenuTrack(){
    this.ensureMenuTrack();if(!this.menuTrack)return;this.menuTrack.volume=this.settings.muted?0:Math.min(.5,this.settings.master*this.settings.music*.5);
    if(this.menuActive&&this.unlocked&&!this.settings.muted&&!this.introTrack)void this.menuTrack.play().catch(()=>{});else if(!this.menuActive||this.introTrack)this.menuTrack.pause();
  }
  stageIntroId(){return this.selectedIntro}
  setStageIntro(id:StageIntroId){if(!isStageIntroId(id))return;this.selectedIntro=id;localStorage.setItem(INTRO_KEY,id);this.listeners.forEach(listener=>listener())}
  playStageIntro(id:StageIntroId=this.selectedIntro){
    this.stopStageIntro(false);if(id==="none"||!this.unlocked||this.settings.muted){this.syncMenuTrack();return}
    const intro=STAGE_INTROS.find(item=>item.id===id);if(!intro?.src)return;
    this.menuTrack?.pause();const track=new Audio(intro.src);track.preload="auto";track.setAttribute("aria-hidden","true");this.introTrack=track;this.syncIntroTrack();
    track.onended=()=>{if(this.introTrack===track){this.introTrack=null;this.syncMenuTrack()}};
    void track.play().catch(()=>{if(this.introTrack===track){this.introTrack=null;this.syncMenuTrack()}});
  }
  stopStageIntro(resumeMenu=true){const track=this.introTrack;if(track){track.pause();track.currentTime=0;track.onended=null;this.introTrack=null}if(resumeMenu)this.syncMenuTrack()}
  private syncIntroTrack(){if(this.introTrack)this.introTrack.volume=this.settings.muted?0:Math.min(.8,this.settings.master*this.settings.music*.72)}
  private apply(){
    if(!this.master)return;this.master.gain.value=this.settings.muted?0:this.settings.master;
    if(this.ambience)this.ambience.gain.value=this.settings.ambience*.14;
    if(this.underscore)this.underscore.gain.value=this.menuActive?0:this.settings.music*(this.performance?.025:.1);
  }
  private makeAmbience(){
    const ctx=this.context!;const length=ctx.sampleRate*3;const buffer=ctx.createBuffer(1,length,ctx.sampleRate);const data=buffer.getChannelData(0);
    let last=0;for(let i=0;i<length;i++){last=last*.985+(Math.random()*2-1)*.015;data[i]=last}
    const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=520;src.connect(filter);filter.connect(this.ambience!);src.start();this.ambienceSource=src;
  }
  private makeUnderscore(){
    const play=()=>{if(!this.context||!this.underscore)return;const ctx=this.context;const root=[110,130.81,146.83,98][Math.floor(ctx.currentTime/4)%4];[1,1.25,1.5,2].forEach((ratio,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=i===0?"sine":"triangle";o.frequency.value=root*ratio;g.gain.setValueAtTime(0,ctx.currentTime);g.gain.linearRampToValueAtTime(.1/(i+1),ctx.currentTime+.6);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+3.7);o.connect(g);g.connect(this.underscore!);o.start();o.stop(ctx.currentTime+4)})};
    play();this.underscoreTimer=window.setInterval(play,4000);
  }
  private tone(from:number,duration:number,volume:number,delay=0,to=from,type:OscillatorType="sine",category=this.settings.ui){
    const ctx=this.ensure();if(!ctx||!this.master||this.settings.muted)return;const o=ctx.createOscillator(),g=ctx.createGain(),start=ctx.currentTime+delay;o.type=type;o.frequency.setValueAtTime(from,start);if(to!==from)o.frequency.exponentialRampToValueAtTime(to,start+duration);g.gain.setValueAtTime(Math.max(.001,volume*category),start);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g);g.connect(this.master);o.start(start);o.stop(start+duration+.02);
  }
  private noise(duration:number,volume:number,delay=0,frequency=900,category=this.settings.ui){
    const ctx=this.ensure();if(!ctx||!this.master||this.settings.muted)return;const length=Math.max(1,Math.floor(ctx.sampleRate*duration)),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),start=ctx.currentTime+delay;source.buffer=buffer;filter.type="lowpass";filter.frequency.value=frequency;gain.gain.value=volume*category;source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(start);
  }
  cue(name:CueName){
    if(name==="hover")this.tone(760,.035,.025,0,820);
    else if(name==="click"){this.noise(.028,.045,0,650);this.tone(230,.055,.045,0,180,"triangle")}
    else if(name==="back"){this.tone(330,.08,.065,0,240,"triangle");this.tone(220,.09,.05,.055,160,"triangle")}
    else if(name==="ready"){[440,660,880].forEach((f,i)=>this.tone(f,.13,.065,i*.045,f*1.06,"triangle"))}
    else if(name==="join"){this.tone(392,.18,.07,0,523);this.tone(659,.22,.06,.08,784)}
    else if(name==="countdown"){this.tone(115,.14,.11,0,90,"sine");this.noise(.04,.035,.01,320)}
    else if(name==="micOn")this.tone(240,.24,.08,0,760,"sawtooth");
    else if(name==="micOff")this.tone(620,.18,.075,0,170,"triangle");
    else if(name==="vote"){this.tone(880,.13,.075);this.tone(1320,.19,.06,.055)}
    else if(name==="warning"){this.tone(250,.09,.085);this.tone(250,.09,.14)}
    else if(name==="bell"){this.tone(1180,.42,.12,0,910);this.tone(980,.38,.1,.14,760)}
    else if(name==="reveal"){for(let i=0;i<6;i++)this.noise(.07,.035,i*.065,260)}
    else if(name==="rating"){[520,660,880,1040].forEach((f,i)=>this.tone(f,.2,.055,i*.07,f*1.04,"triangle"))}
    else this.tone(560,.07,.05,0,700,"triangle");
  }
  reaction(kind:ReactionKind){
    const audience=this.settings.audience;
    if(kind==="laugh"){this.tone(620,.12,.045,0,790,"triangle",audience);this.tone(700,.12,.04,.09,880,"triangle",audience)}
    else if(kind==="applause")for(let i=0;i<4;i++)this.noise(.055,.045,i*.045,1100,audience);
    else if(kind==="fire"){this.noise(.18,.055,0,720,audience);this.tone(240,.2,.035,0,520,"sawtooth",audience)}
    else if(kind==="dead")this.tone(240,.3,.07,0,80,"triangle",audience);
    else if(kind==="awkward"){this.tone(205,.14,.05,0,190,"square",audience);this.tone(190,.18,.04,.18,175,"square",audience)}
    else this.tone(145,.1,.075,0,90,"triangle",audience);
  }
  setPerformance(active:boolean){this.performance=active;this.apply()}
}
export const audioManager=new AudioManager();
