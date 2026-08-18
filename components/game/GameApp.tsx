"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {audioManager,DEFAULT_AUDIO} from "../../lib/audio/audio-manager";
import {gameApi,getIdentity} from "../../lib/game/client";
import {STAGE_INTROS,type AudioSettings,type GameMode,type LobbySnapshot,type Player,type ReactionKind,type StageIntroId} from "../../lib/game/types";
import {StageVoiceRoom,voiceManager,type MicState} from "../../lib/voice/voice-manager";

type Screen="menu"|"profile"|"leaderboard"|"settings";
type Overlay=null|"modes"|"join"|"create"|"how";
type ProfileData=Awaited<ReturnType<typeof gameApi.profile>>;
type LeaderData=Awaited<ReturnType<typeof gameApi.leaderboard>>["players"];
type GamePreferences={noiseSuppression:boolean;autoGain:boolean;ambientEffects:boolean;reducedMotion:boolean;performanceMode:boolean};
const DEFAULT_PREFERENCES:GamePreferences={noiseSuppression:true,autoGain:true,ambientEffects:true,reducedMotion:false,performanceMode:false};
const reactionMeta:{kind:ReactionKind;emoji:string;label:string}[]=[
  {kind:"laugh",emoji:"😂",label:"Laugh"},{kind:"applause",emoji:"👏",label:"Applause"},{kind:"fire",emoji:"🔥",label:"Fire"},
  {kind:"dead",emoji:"💀",label:"Dead"},{kind:"awkward",emoji:"😐",label:"Awkward"},{kind:"tomato",emoji:"🍅",label:"Tomato"},
];

export function GameApp(){
  const identity=useMemo(()=>getIdentity(),[]);
  const [screen,setScreen]=useState<Screen>("menu");
  const [overlay,setOverlay]=useState<Overlay>(null);
  const [snap,setSnap]=useState<LobbySnapshot|null>(null);
  const [searching,setSearching]=useState<GameMode|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const [clock,setClock]=useState(()=>Date.now());
  const [serverOffset,setServerOffset]=useState(0);
  const [audio,setAudio]=useState<AudioSettings>(audioManager.settings||DEFAULT_AUDIO);
  const [stageIntro,setStageIntro]=useState<StageIntroId>(()=>audioManager.stageIntroId());
  const [micState,setMicState]=useState<MicState>("idle");
  const [micLevel,setMicLevel]=useState(0);
  const [profile,setProfile]=useState<ProfileData|null>(null);
  const [leaders,setLeaders]=useState<LeaderData>([]);
  const [preferences,setPreferences]=useState<GamePreferences>(DEFAULT_PREFERENCES);
  const previous=useRef<LobbySnapshot|null>(null);

  const message=useCallback((text:string)=>{setToast(text);window.setTimeout(()=>setToast(null),2600)},[]);
  const lobbyCode=snap?.code;
  const inClub=Boolean(snap);
  const pull=useCallback(async()=>{
    if(!lobbyCode)return;
    try{const next=await gameApi.snapshot(lobbyCode,identity.id);setServerOffset(next.serverNow-Date.now());setSnap(next);setError(null)}catch(e){setError(e instanceof Error?e.message:"SERVER CONNECTION LOST")}
  },[lobbyCode,identity.id]);

  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),100);return()=>clearInterval(timer)},[]);
  useEffect(()=>{const active=sessionStorage.getItem("ccb-active-lobby"),invited=new URLSearchParams(location.search).get("join"),code=active||invited;if(!code)return;const restore=active?gameApi.snapshot(code,identity.id):gameApi.join(code,identity.id,identity.username);void restore.then(next=>{setServerOffset(next.serverNow-Date.now());setSnap(next);if(invited)history.replaceState({},"",location.pathname)}).catch(e=>{sessionStorage.removeItem("ccb-active-lobby");setError(e instanceof Error?e.message:"LOBBY NOT FOUND")})},[identity.id,identity.username]);
  useEffect(()=>{if(snap?.code)sessionStorage.setItem("ccb-active-lobby",snap.code)},[snap?.code]);
  useEffect(()=>{queueMicrotask(()=>{try{setPreferences({...DEFAULT_PREFERENCES,...JSON.parse(localStorage.getItem("ccb-preferences-v1")||"{}")})}catch{}})},[]);
  useEffect(()=>{const root=document.documentElement;root.dataset.ambient=String(preferences.ambientEffects&&!preferences.performanceMode);root.dataset.reducedMotion=String(preferences.reducedMotion||preferences.performanceMode);voiceManager.configure({noiseSuppression:preferences.noiseSuppression,autoGainControl:preferences.autoGain})},[preferences]);
  useEffect(()=>{audioManager.stopStageIntro();audioManager.setMenuActive(!inClub)},[inClub]);
  useEffect(()=>{void gameApi.setIntro(identity.id,identity.username,stageIntro).catch(()=>{})},[identity.id,identity.username,stageIntro]);
  useEffect(()=>{if(!lobbyCode)return;const timer=setInterval(()=>void pull(),900);return()=>clearInterval(timer)},[lobbyCode,pull]);
  useEffect(()=>{
    if(!snap)return;const old=previous.current;
    if(old&&snap.players.length>old.players.length){const joined=snap.players.find(p=>!old.players.some(o=>o.id===p.id));if(joined){audioManager.cue("join");message(`${joined.username} entered the club.`)}}
    if(old&&snap.players.length<old.players.length){const left=old.players.find(p=>!snap.players.some(o=>o.id===p.id));if(left)message(`${left.username} left before paying the tab.`)}
    if(old?.phase!==snap.phase){
      if(snap.phase==="COUNTDOWN"){audioManager.stopStageIntro();audioManager.cue("countdown")}
      if(snap.phase==="PREPARATION"){audioManager.setPerformance(false);const performer=snap.players.find(player=>player.id===snap.currentPerformerId);audioManager.playStageIntro(performer?.introId||"dramatic-look")}
      if(snap.phase==="PERFORMING"){audioManager.stopStageIntro();audioManager.setPerformance(true);audioManager.cue("micOn")}
      if(snap.phase==="TURN_END"){audioManager.stopStageIntro();audioManager.cue("bell");audioManager.setPerformance(false)}
      if(snap.phase==="VOTING")audioManager.stopStageIntro();
      if(snap.phase==="RESULTS"){audioManager.stopStageIntro();audioManager.cue("reveal");audioManager.cue("rating")}
    }
    previous.current=snap;
  },[snap,message]);

  const remaining=snap?.phaseEndsAt?Math.max(0,snap.phaseEndsAt-(clock+serverOffset)):0;
  const me=snap?.players.find(p=>p.id===identity.id);
  const transitionKey=snap?(["PREPARATION","PERFORMING","TURN_END"].includes(snap.phase)?`stage-${snap.currentPerformerId}`:snap.phase):screen;
  const goScreen=async(next:Screen)=>{audioManager.cue("click");setOverlay(null);setSnap(null);setScreen(next);if(next==="profile"){try{setProfile(await gameApi.profile(identity.id))}catch{setProfile(null)}}if(next==="leaderboard"){try{setLeaders((await gameApi.leaderboard()).players)}catch{setLeaders([])}}};
  const quick=async(mode:Exclude<GameMode,"private">)=>{setOverlay(null);setSearching(mode);setError(null);audioManager.cue("click");try{await new Promise(r=>setTimeout(r,850));const data=await gameApi.quickPlay(mode,identity.id,identity.username);setServerOffset(data.serverNow-Date.now());setSnap(data);setSearching(null)}catch(e){setSearching(null);setError(e instanceof Error?e.message:"MATCHMAKING FAILED")}};
  const leave=async()=>{if(snap)void gameApi.leave(snap.code,identity.id);sessionStorage.removeItem("ccb-active-lobby");voiceManager.setBroadcasting(false);setSnap(null);setScreen("menu");audioManager.cue("back")};
  const testMic=async()=>{setMicState("requesting");try{const stream=await voiceManager.request();setMicState("ready");audioManager.cue("micOn");return voiceManager.createMeter(stream,setMicLevel)}catch{setMicState("denied");audioManager.cue("micOff")}};
  const updateAudio=(key:keyof AudioSettings,value:number|boolean)=>{const next={...audio,[key]:value};setAudio(next);audioManager.update({[key]:value})};
  const updateStageIntro=(introId:StageIntroId)=>{audioManager.setStageIntro(introId);setStageIntro(introId)};
  const updatePreference=(key:keyof GamePreferences,value:boolean)=>{const next={...preferences,[key]:value};setPreferences(next);localStorage.setItem("ccb-preferences-v1",JSON.stringify(next))};

  return <main className="game" onPointerDownCapture={()=>audioManager.unlock()}>
    <ClubWorld phase={snap?.phase}/>
    {!snap&&<GameHeader screen={screen} onScreen={goScreen} onSettings={()=>{setOverlay(null);setScreen("settings")}} identity={identity} muted={audio.muted} toggleSound={()=>updateAudio("muted",!audio.muted)}/>} 
    <div className="screen-transition" key={transitionKey}>
      {searching?<Matchmaking mode={searching} cancel={()=>setSearching(null)}/>:
       snap?<MatchRouter snap={snap} me={me} remaining={remaining} identity={identity} setSnap={setSnap} leave={leave} message={message} micState={micState} micLevel={micLevel} testMic={testMic}/>:
       screen==="menu"?<MainMenu open={setOverlay} quick={()=>setOverlay("modes")} go={goScreen}/>:
       screen==="profile"?<Profile profile={profile} back={()=>goScreen("menu")}/>:
       screen==="leaderboard"?<Leaderboard leaders={leaders} myId={identity.id} back={()=>goScreen("menu")}/>:
       <Settings audio={audio} update={updateAudio} stageIntro={stageIntro} updateStageIntro={updateStageIntro} preferences={preferences} updatePreference={updatePreference} identity={identity} micState={micState} micLevel={micLevel} testMic={testMic} back={()=>goScreen("menu")}/>}
    </div>
    {overlay==="modes"&&<ModeSelect close={()=>setOverlay(null)} choose={quick} privateRoom={()=>setOverlay("create")}/>}
    {overlay==="join"&&<JoinOverlay close={()=>setOverlay(null)} join={async code=>{try{const data=await gameApi.join(code,identity.id,identity.username);setServerOffset(data.serverNow-Date.now());setSnap(data);setOverlay(null)}catch(e){setError(e instanceof Error?e.message:"LOBBY NOT FOUND")}}}/>}
    {overlay==="create"&&<CreateOverlay close={()=>setOverlay(null)} create={async settings=>{try{const data=await gameApi.create(identity.id,identity.username,settings);setServerOffset(data.serverNow-Date.now());setSnap(data);setOverlay(null)}catch(e){setError(e instanceof Error?e.message:"COULD NOT OPEN THE CLUB")}}}/>}
    {overlay==="how"&&<HowTo close={()=>setOverlay(null)}/>}
    {error&&<ErrorToast text={error} close={()=>setError(null)} retry={snap?pull:undefined}/>}
    {toast&&<div className="club-toast" role="status"><span>♬</span>{toast}</div>}
  </main>
}

function ClubWorld({phase}:{phase?:string}){
  return <div className={`club-world phase-${phase?.toLowerCase()||"menu"}`} aria-hidden="true">
    <div className="club-grain"/><div className="ceiling"/><div className="light-beam beam-left"/><div className="light-beam beam-right"/>
    <div className="back-wall"><div className="poster p1">OPEN<br/><b>MIC</b><small>EVERY NIGHT</small></div><div className="neon-sign"><i>LIVE</i><b>COMEDY</b><span>UNDERGROUND</span></div><div className="poster p2">NO<br/>HECKLING<small>UNLESS FUNNY</small></div></div>
    <div className="world-stage"><div className="velvet left"/><div className="velvet right"/><div className="stage-glow"/><div className="world-mic"><b/><i/></div></div>
    <div className="audience-layer"><span/><span/><span/><span/><span/><span/></div><div className="table-lamps"><i/><i/><i/></div><div className="smoke s1"/><div className="smoke s2"/>
  </div>
}

function GameHeader({screen,onScreen,onSettings,identity,muted,toggleSound}:{screen:Screen;onScreen:(s:Screen)=>void;onSettings:()=>void;identity:{id:string;username:string};muted:boolean;toggleSound:()=>void}){
  return <header className="game-header"><button className="wordmark focusable" onClick={()=>onScreen("menu")} aria-label="Comedy Club Battle home"><span className="mic-mark">●<i/></span><b>COMEDY<small>CLUB BATTLE</small></b></button>
    <nav aria-label="Game navigation"><button className={screen==="menu"?"active":""} onClick={()=>onScreen("menu")}>Club</button><button className={screen==="leaderboard"?"active":""} onClick={()=>onScreen("leaderboard")}>Ranks</button><button className={screen==="profile"?"active":""} onClick={()=>onScreen("profile")}>Career</button></nav>
    <div className="header-tools"><button className="sound-pill" onClick={toggleSound} aria-label={muted?"Enable sound":"Mute sound"}>{muted?"×":"♪"}</button><button className="player-pill" onClick={()=>onScreen("profile")}><i/><span><b>{identity.username}</b><small>GUEST COMEDIAN</small></span><em>{identity.username[0]}</em></button><button className="icon-button" onClick={onSettings} aria-label="Open settings">⚙</button></div>
  </header>
}

function MainMenu({open,quick,go}:{open:(o:Overlay)=>void;quick:()=>void;go:(s:Screen)=>void}){
  return <section className="main-menu game-screen">
    <div className="title-block"><p className="kicker"><i/> THE MIC IS HOT</p><div className="game-logo"><span>COMEDY</span><b>CLUB</b><em>BATTLE</em></div><p>Live jokes. Real voices. One spotlight.<br/>Win the room or become the punchline.</p></div>
    <div className="menu-stack">
      <GameButton primary className="play-button" onClick={quick}><span className="play-icon">▶</span><b>PLAY</b><small>CASUAL · RANKED · PRIVATE</small></GameButton>
      <div className="menu-secondary"><GameButton onClick={()=>open("join")}><span>#</span>JOIN WITH CODE</GameButton><GameButton onClick={()=>open("create")}><span>＋</span>CREATE CLUB</GameButton></div>
      <div className="menu-icons"><button onClick={()=>go("profile")}><span>♙</span><small>CAREER</small></button><button onClick={()=>go("leaderboard")}><span>♛</span><small>RANKS</small></button><button onClick={()=>open("how")}><span>?</span><small>HOW TO PLAY</small></button></div>
    </div>
    <aside className="night-card"><div className="night-live"><i/> FEATURED FORMAT</div><span>TONIGHT AT</span><h3>THE BASEMENT</h3><p>Ranked · Random topic · 60 sec</p><div className="mini-crowd"><b>R</b><b>★</b><b>60</b><b>＋</b><small>4–8</small></div><div className="night-line"/><small>PUBLIC CLUBS ARE OPEN</small></aside>
    <div className="world-status"><span><i/> CLUB NETWORK ONLINE</span><b>PRESEASON · RANKS ACTIVE</b><em>BUILD 1.0.0</em></div>
  </section>
}

function GameButton({children,onClick,primary=false,className="",disabled=false}:{children:React.ReactNode;onClick:()=>void;primary?:boolean;className?:string;disabled?:boolean}){
  return <button disabled={disabled} className={`game-button focusable ${primary?"primary":""} ${className}`} onMouseEnter={()=>{if(!disabled)audioManager.cue("hover")}} onClick={()=>{audioManager.cue("click");onClick()}}>{children}<i className="button-sweep"/></button>
}

function Matchmaking({mode,cancel}:{mode:GameMode;cancel:()=>void}){
  return <section className="matchmaking game-screen center-stage"><div className="search-light"><span/><i/></div><p className="kicker">SCANNING THE CLUB DISTRICT</p><h1>FINDING TONIGHT’S<br/><em>COMEDIANS...</em></h1><div className="search-slots">{[0,1,2,3,4,5].map(x=><i key={x}>?</i>)}</div><p>{mode.toUpperCase()} · <b>LOOKING FOR AN OPEN TABLE</b></p><div className="search-wave"><i/><i/><i/><i/><i/></div><button className="quiet-button" onClick={cancel}>CANCEL SEARCH</button></section>
}

function MatchRouter(props:{snap:LobbySnapshot;me?:Player;remaining:number;identity:{id:string;username:string};setSnap:(s:LobbySnapshot)=>void;leave:()=>void;message:(s:string)=>void;micState:MicState;micLevel:number;testMic:()=>Promise<(()=>void)|undefined>}){
  const {snap}=props;
  if(snap.phase==="LOBBY")return <Lobby {...props}/>;
  if(snap.phase==="COUNTDOWN"||snap.phase==="LINEUP")return <MatchIntro snap={snap} remaining={props.remaining}/>;
  if(["PREPARATION","PERFORMING","TURN_END"].includes(snap.phase))return <Stage {...props}/>;
  if(snap.phase==="VOTING")return <Voting {...props}/>;
  if(snap.phase==="CALCULATING")return <LoadingState title="COUNTING THE VOTES..." detail="The comedy accountants are arguing."/>;
  return <Results {...props}/>;
}

function Lobby({snap,me,identity,setSnap,leave,message,micState,micLevel,testMic}:{snap:LobbySnapshot;me?:Player;identity:{id:string};setSnap:(s:LobbySnapshot)=>void;leave:()=>void;message:(s:string)=>void;micState:MicState;micLevel:number;testMic:()=>Promise<(()=>void)|undefined>}){
  const [busy,setBusy]=useState(false);const [copied,setCopied]=useState(false);
  const ready=async()=>{if(!me)return;setBusy(true);audioManager.cue("ready");try{setSnap(await gameApi.ready(snap.code,identity.id,!me.ready))}finally{setBusy(false)}};
  const canStart=snap.players.length>=2&&snap.players.every(p=>p.isHost||p.ready)&&!busy;
  const start=async()=>{setBusy(true);try{setSnap(await gameApi.start(snap.code,identity.id))}catch(e){audioManager.cue("back");message(e instanceof Error?e.message:"THE STAGE IS NOT READY")}finally{setBusy(false)}};
  const copy=async()=>{await navigator.clipboard?.writeText(`${location.origin}/?join=${snap.code}`);setCopied(true);setTimeout(()=>setCopied(false),1400)};
  return <section className="lobby-screen game-screen">
    <div className="lobby-top"><div><p className="kicker"><i/> PRE-SHOW LOUNGE</p><h1>THE BASEMENT</h1><p>{snap.ranked?"RANKED":"CASUAL"} · {snap.performanceSeconds} SEC · {snap.topicEnabled?"RANDOM TOPIC":"OWN MATERIAL"}</p></div><div className="lobby-code"><span>CLUB CODE</span><b>{snap.code}</b><button onClick={copy}>{copied?"COPIED!":"COPY INVITE"}</button></div></div>
    <div className="lobby-room"><div className="seat-map">{Array.from({length:snap.maxPlayers}).map((_,i)=>{const player=snap.players.find(p=>p.seat===i);return player?<LobbyPlayer key={player.id} player={player} me={player.id===identity.id}/>:<div className="empty-seat" key={i}><span>＋</span><b>OPEN SEAT</b><small>Waiting for a comedian</small></div>})}</div>
      <aside className="preflight"><h3>SHOW PREFLIGHT</h3><div className="format-row"><span>⌛</span><p>STAGE TIME<b>{snap.performanceSeconds} SECONDS</b></p></div><div className="format-row"><span>🎯</span><p>MATERIAL<b>{snap.topicEnabled?"RANDOM TOPIC":"OPEN MIC"}</b></p></div><div className="format-row"><span>◆</span><p>RATING<b>{snap.ranked?"RANKED":"CASUAL"}</b></p></div><hr/><MicTest state={micState} level={micLevel} test={testMic}/></aside></div>
    <div className="lobby-feed"><span>♬</span><p>{snap.players.length<2?"Waiting for comedians...":snap.players.every(p=>p.ready||p.isHost)?"The room is ready. Start the show.":"Ready up when you’re set."}</p></div>
    <div className="lobby-actions"><button className="quiet-button" onClick={leave}>← LEAVE CLUB</button><div className="ready-count">{snap.players.filter(p=>p.ready).length}/{snap.players.length} READY</div><GameButton primary disabled={busy} onClick={ready}>{me?.ready?"✓ READY!":"READY UP"}</GameButton>{me?.isHost&&<GameButton disabled={!canStart} onClick={start}>{busy?"SETTING THE STAGE...":snap.players.length<2?"WAITING FOR COMEDIANS":!canStart?"EVERYONE MUST READY":"START THE SHOW →"}</GameButton>}</div>
  </section>
}

function LobbyPlayer({player,me}:{player:Player;me:boolean}){
  const disconnected=player.state==="DISCONNECTED";return <article className={`lobby-player ${player.ready?"is-ready":""} ${me?"is-me":""} ${disconnected?"is-disconnected":""}`}><div className="seat-light"/><div className="player-flags">{player.isHost&&<span>HOST</span>}{me&&<span>YOU</span>}</div><div className="player-avatar"><span>{player.avatar}</span><i className={!disconnected?"online":""}/></div><h3>{player.username}</h3><p>{rankTitle(player.rating)} · LVL {player.level}</p><b className="player-rating">◆ {player.rating.toLocaleString()}</b><div className="player-state"><span>🎙</span>{disconnected?"RECONNECTING":player.ready?"READY":"NOT READY"}</div></article>
}

function MatchIntro({snap,remaining}:{snap:LobbySnapshot;remaining:number}){
  const count=Math.ceil(remaining/1000);
  if(snap.phase==="COUNTDOWN")return <section className="countdown-screen game-screen center-stage"><p>THE SHOW IS ABOUT TO BEGIN</p><b key={count}>{Math.max(1,count)}</b><span>LIGHTS DOWN. MICS UP.</span></section>;
  return <section className="lineup-screen game-screen center-stage"><p className="kicker">TONIGHT AT COMEDY CLUB BATTLE</p><h1>TONIGHT’S <em>LINEUP</em></h1><div className="lineup-reveal">{snap.lineup.map((id,i)=>{const p=snap.players.find(x=>x.id===id);return <div key={id} style={{"--delay":`${i*.12}s`} as React.CSSProperties}><b>0{i+1}</b><span>{p?.avatar}</span><h3>{p?.username}<small>{rankTitle(p?.rating||1000)}</small></h3>{i===0&&<em>FIRST UP</em>}</div>})}</div><p className="next-state">FIRST UP IN {Math.ceil(remaining/1000)}...</p></section>
}

function Stage({snap,remaining,identity,micState,testMic,setSnap,message}:{snap:LobbySnapshot;remaining:number;identity:{id:string};micState:MicState;testMic:()=>Promise<(()=>void)|undefined>;setSnap:(s:LobbySnapshot)=>void;message:(s:string)=>void}){
  const performer=snap.players.find(p=>p.id===snap.currentPerformerId);const isMe=performer?.id===identity.id;const audienceKey=snap.players.filter(p=>p.id!==identity.id).map(p=>p.id).sort().join(","),voiceSession=`${snap.matchId}:${snap.currentPerformerId}:${snap.turnIndex}`;const [cooldown,setCooldown]=useState(false);const [voiceStatus,setVoiceStatus]=useState("connecting");const [skipBusy,setSkipBusy]=useState(false);const performingRef=useRef(snap.phase==="PERFORMING");
  useEffect(()=>{performingRef.current=snap.phase==="PERFORMING";if(isMe)voiceManager.setBroadcasting(performingRef.current);return()=>{if(isMe)voiceManager.setBroadcasting(false)}},[isMe,snap.phase]);
  useEffect(()=>{if(!snap.currentPerformerId)return;let room:StageVoiceRoom|undefined;let cancelled=false;(async()=>{room=new StageVoiceRoom(snap.code,identity.id,voiceSession,gameApi,setVoiceStatus);if(isMe){try{const stream=await voiceManager.request();if(cancelled)return;voiceManager.setBroadcasting(performingRef.current);await room.startPerformer(stream,audienceKey.split(",").filter(Boolean))}catch{setVoiceStatus("mic-denied")}}else room.startAudience()})();return()=>{cancelled=true;room?.stop();if(isMe)voiceManager.setBroadcasting(false)}},[snap.code,snap.currentPerformerId,identity.id,isMe,audienceKey,voiceSession]);
  const send=async(kind:ReactionKind)=>{if(cooldown||snap.phase!=="PERFORMING"||isMe)return;setCooldown(true);audioManager.reaction(kind);try{await gameApi.reaction(snap.code,identity.id,kind)}catch{}setTimeout(()=>setCooldown(false),1200)};
  const skip=async()=>{if(skipBusy||snap.phase==="TURN_END")return;setSkipBusy(true);audioManager.cue("click");try{setSnap(await gameApi.skip(snap.code,identity.id));message(snap.phase==="PREPARATION"?"Intro skipped. The mic is live.":"Set ended by the host.")}catch(error){message(error instanceof Error?error.message:"COULD NOT END THE SET")}finally{setSkipBusy(false)}};
  const seconds=Math.ceil(remaining/1000),danger=seconds<=5?"critical":seconds<=10?"warning":seconds<=15?"notice":"",micFailed=isMe&&(micState==="denied"||voiceStatus==="mic-denied"),voiceConnected=["live","connected","completed"].includes(voiceStatus),voiceBlocked=voiceStatus==="playback-blocked",voiceDetail=micFailed?"Allow microphone access in browser settings":voiceBlocked?"Click anywhere to enable stage audio":voiceConnected?"Stage audio connected":"Connecting stage audio...";
  return <section className={`performance-screen game-screen ${snap.phase.toLowerCase()} ${danger}`}>
    <div className="stage-hud"><div><span>PERFORMER {snap.turnIndex+1} / {snap.lineup.length}</span><b>YOU’RE UP IN {Math.max(0,snap.lineup.indexOf(identity.id)-snap.turnIndex)}</b></div><div className="stage-clock"><b>{snap.phase==="PREPARATION"?Math.ceil(remaining/1000):`00:${String(seconds).padStart(2,"0")}`}</b><span>{snap.phase==="PREPARATION"?"INTRO PLAYING":snap.phase==="TURN_END"?"TIME’S UP":"STAGE TIME"}</span></div>{snap.hostId===identity.id&&snap.phase!=="TURN_END"?<button className="stage-menu" disabled={skipBusy} aria-label={snap.phase==="PREPARATION"?"Skip performer intro":"End current set"} onClick={()=>void skip()}>{skipBusy?"WAIT...":snap.phase==="PREPARATION"?"SKIP INTRO":"END SET"}</button>:<span/>}</div>
    <div className="live-stage"><div className="stage-curtain left"/><div className="stage-curtain right"/><div className="spotlight-cone"/><div className="performer-card"><p>{snap.phase==="PREPARATION"?(isMe?"YOU’RE UP":"NEXT UP"):snap.phase==="TURN_END"?"THAT’S THE SET":"PERFORMING NOW"}</p><h1>{performer?.username||"THE COMEDIAN"}</h1><span>{rankTitle(performer?.rating||1000)} · {performer?.rating||1000} MMR</span>{snap.topic&&<div className="topic-ticket"><small>TONIGHT’S TOPIC</small><b>{snap.topic}</b></div>}</div><div className="performer-silhouette"><span>{performer?.avatar}</span></div><div className="floor-spot"/><Audience snap={snap}/></div>
    <div className="stage-controls"><div className={`mic-status ${isMe&&snap.phase==="PERFORMING"&&!micFailed?"live":""}`}><button onClick={()=>{if(micState!=="ready"||micFailed)void testMic()}}>{micFailed?"!":"🎙"}</button><p><b>{micFailed?"MIC ACCESS REQUIRED":!isMe?voiceConnected?"LISTENING LIVE":"LISTENING":snap.phase==="PERFORMING"?"MIC LIVE":"MIC STANDBY"}</b><span>{voiceDetail}</span></p></div><ReactionBar disabled={cooldown||isMe||snap.phase!=="PERFORMING"} send={send}/><div className="turn-note">{isMe?"OWN THE ROOM.":"REACT — DON'T INTERRUPT."}</div></div>
  </section>
}

function Audience({snap}:{snap:LobbySnapshot}){
  const shown=snap.reactions.slice(-8);return <div className="stage-audience" aria-live="polite">{snap.players.filter(p=>p.id!==snap.currentPerformerId).map((p,i)=><span className="audience-head" style={{"--seat":i} as React.CSSProperties} key={p.id}>{p.avatar}</span>)}{shown.map((r,i)=><i className={`reaction-fx fx-${r.kind}`} style={{"--x":`${18+(i*13)%70}%`} as React.CSSProperties} key={r.id}>{reactionMeta.find(x=>x.kind===r.kind)?.emoji}</i>)}</div>
}

function ReactionBar({disabled,send}:{disabled:boolean;send:(k:ReactionKind)=>void}){
  return <div className="reaction-bar" aria-label="Audience reactions">{reactionMeta.map(r=><button disabled={disabled} onClick={()=>send(r.kind)} key={r.kind}><b>{r.emoji}</b><small>{r.label}</small><i/></button>)}</div>
}

function Voting({snap,remaining,identity}:{snap:LobbySnapshot;remaining:number;identity:{id:string}}){
  const targets=snap.players.filter(p=>p.id!==identity.id);const [index,setIndex]=useState(0);const [selected,setSelected]=useState<number|null>(null);const [submitted,setSubmitted]=useState(new Set<string>());const target=targets[index];
  const vote=async(stars:number)=>{if(!target)return;setSelected(stars);audioManager.cue("vote");try{await gameApi.vote(snap.code,identity.id,target.id,stars);setSubmitted(s=>new Set(s).add(target.id));setTimeout(()=>{setIndex(i=>Math.min(targets.length,i+1));setSelected(null)},450)}catch{setSelected(null);audioManager.cue("back")}};
  if(index>=targets.length)return <LoadingState title="VOTES LOCKED IN" detail="Waiting for the rest of the room..."/>;
  return <section className="voting-screen game-screen center-stage"><div className="vote-top"><p className="kicker"><i/> THE MIC IS DOWN</p><span>VOTES SUBMITTED <b>{submitted.size+1} / {targets.length+1}</b></span><em>00:{String(Math.ceil(remaining/1000)).padStart(2,"0")}</em></div><p>HOW FUNNY WAS</p><div className="vote-avatar">{target?.avatar}</div><h1>{target?.username}?</h1><span className="vote-title">{rankTitle(target?.rating||1000)}</span><div className="rating-scale">{[1,2,3,4,5].map(n=><button className={selected===n?"selected":""} disabled={selected!==null} onMouseEnter={()=>audioManager.cue("hover")} onClick={()=>void vote(n)} key={n}><b>{"★".repeat(n)}</b><span>{["ROUGH NIGHT","NEEDS WORK","SOLID","KILLED IT","COMEDY GOLD"][n-1]}</span></button>)}</div><p className="vote-rule">Votes are anonymous · You cannot rate yourself</p></section>
}

function Results({snap,identity,setSnap,leave}:{snap:LobbySnapshot;identity:{id:string};setSnap:(s:LobbySnapshot)=>void;leave:()=>void}){
  const [revealed,setRevealed]=useState(0);const ordered=[...snap.results].sort((a,b)=>b.place-a.place);useEffect(()=>{if(revealed>=ordered.length)return;const timer=setTimeout(()=>{audioManager.cue(revealed===ordered.length-1?"rating":"reveal");setRevealed(x=>x+1)},revealed===ordered.length-1?1200:700);return()=>clearTimeout(timer)},[revealed,ordered.length]);const mine=snap.results.find(r=>r.userId===identity.id),done=revealed>=ordered.length;
  const isHost=snap.hostId===identity.id;const rematch=async()=>setSnap(await gameApi.rematch(snap.code,identity.id));
  return <section className={`results-screen game-screen center-stage ${done?"winner-live":""}`}><p className="kicker">THAT’S A WRAP</p><h1>TONIGHT’S RESULTS</h1><div className="result-reveal">{ordered.slice(0,revealed).map(r=>r.place===1?<div className="winner" key={r.userId}><span className="winner-rays"/><i>♛</i><small>AND TONIGHT’S WINNER IS...</small><h2>{r.username}</h2><p>{r.score.toFixed(1)} ★ · {rankTitle(r.ratingAfter)}</p></div>:<div className="result-row" key={r.userId}><b>{ordinal(r.place)}</b><span>{r.avatar}</span><h3>{r.username}<small>{r.score.toFixed(1)} ★</small></h3><em>{signed(r.ratingAfter-r.ratingBefore)} MMR</em></div>)}</div>{done&&mine&&<><div className="post-rating"><div><small>YOUR PLACEMENT</small><b>{ordinal(mine.place)} / {snap.results.length}</b></div><div><small>AVERAGE COMEDY SCORE</small><b>{mine.score.toFixed(1)} ★</b></div><div className={mine.ratingAfter>=mine.ratingBefore?"gain":"loss"}><small>COMEDY RATING</small><b>{mine.ratingBefore} <i>→</i> {mine.ratingAfter}</b><strong>{signed(mine.ratingAfter-mine.ratingBefore)}</strong></div></div><div className="post-actions"><GameButton primary disabled={!isHost} onClick={rematch}>{isHost?"↻ REMATCH":"WAITING FOR HOST"}</GameButton><GameButton onClick={leave}>RETURN TO CLUB</GameButton></div></>}</section>
}

function Profile({profile,back}:{profile:ProfileData|null;back:()=>void}){
  if(!profile)return <LoadingState title="YOUR STAGE IS STILL CLEAN" detail="Play a show to start your comedy career." back={back}/>;
  const u=profile.user,s=profile.stats;return <section className="career-screen game-screen"><button className="back-button" onClick={back}>← CLUB</button><div className="career-hero"><div className="career-avatar">{u.avatar}</div><div><p className="kicker">COMEDIAN PROFILE</p><h1>{u.username}</h1><span>{rankTitle(u.rating)} · LEVEL {u.level}</span><div className="xp-track"><i style={{width:`${u.xp%500/5}%`}}/><small>{u.xp%500} / 500 XP TO LEVEL {u.level+1}</small></div></div><div className="rank-crest"><i>◆</i><b>{u.rating}</b><span>{rankTitle(u.rating)}</span></div></div><div className="career-stats">{[[s.matches,"SHOWS"],[s.wins,"WINS"],[s.podiums,"PODIUMS"],[s.averageStars.toFixed(1),"AVG STARS"],[s.highestRating,"BEST MMR"],[u.level,"LEVEL"]].map(x=><div key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div><div className="history-panel"><div className="panel-title"><h2>MATCH HISTORY</h2><span>{profile.history.length} RECENT SHOWS</span></div>{profile.history.length?profile.history.map((h,i)=><div className="history-row" key={i}><b>{medal(h.place)} {ordinal(h.place)}</b><span>{h.ranked?"RANKED":"CASUAL"}</span><em>{h.score.toFixed(1)} ★</em><strong className={h.ratingChange>=0?"positive":"negative"}>{signed(h.ratingChange)} MMR</strong><small>{h.finishedAt?new Date(h.finishedAt).toLocaleDateString():"JUST NOW"}</small></div>):<div className="empty-message">Your stage is still clean. Go ruin it.</div>}</div></section>
}

function Leaderboard({leaders,myId,back}:{leaders:LeaderData;myId:string;back:()=>void}){
  return <section className="leaderboard-screen game-screen"><button className="back-button" onClick={back}>← CLUB</button><div className="board-heading"><div><p className="kicker">PRESEASON</p><h1>COMEDY ROYALTY</h1><p>The room remembers every killer set.</p></div><div className="season-clock"><span>RANKED LADDER</span><b>LIVE</b></div></div><div className="board-tabs"><button className="active">GLOBAL</button>{["WEEKLY","FRIENDS","ALL-TIME"].map(x=><button disabled title="Coming soon" key={x}>{x} · SOON</button>)}</div>{leaders.length?<div className="leader-list">{leaders.map((p,i)=><div className={p.id===myId?"current":""} key={p.id}><b>#{i+1}</b><span>{p.avatar}</span><h3>{p.username}<small>{rankTitle(p.rating)} · LEVEL {p.level}</small></h3><em>{p.wins} WINS</em><strong>◆ {p.rating}</strong></div>)}</div>:<div className="empty-message">The scoreboard fell off the wall. Try again later.</div>}</section>
}

function Settings({audio,update,stageIntro,updateStageIntro,preferences,updatePreference,identity,micState,micLevel,testMic,back}:{audio:AudioSettings;update:(k:keyof AudioSettings,v:number|boolean)=>void;stageIntro:StageIntroId;updateStageIntro:(id:StageIntroId)=>void;preferences:GamePreferences;updatePreference:(k:keyof GamePreferences,v:boolean)=>void;identity:{username:string};micState:MicState;micLevel:number;testMic:()=>Promise<(()=>void)|undefined>;back:()=>void}){
  const [tab,setTab]=useState("AUDIO");return <section className="settings-screen game-screen"><button className="back-button" onClick={back}>← CLUB</button><div className="settings-window"><div className="settings-head"><p className="kicker">CLUB CONTROL ROOM</p><h1>SETTINGS</h1></div><aside>{["AUDIO","VOICE","GRAPHICS","ACCOUNT"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</aside><div className="settings-content">
  {tab==="AUDIO"&&<><h2>AUDIO MIX</h2><p>Keep live voice clear while the room stays alive.</p>{(["master","music","ambience","ui","audience","voice"] as const).map(k=><Volume key={k} label={k==="ui"?"UI SOUNDS":k.toUpperCase()} value={audio[k]} set={v=>update(k,v)}/>) }<IntroPicker value={stageIntro} set={updateStageIntro}/></>}
  {tab==="VOICE"&&<><h2>MICROPHONE</h2><p>Test your mic before the spotlight finds you.</p><MicTest state={micState} level={micLevel} test={testMic}/><SettingToggle label="NOISE SUPPRESSION" detail="Reduce keyboard and room noise" checked={preferences.noiseSuppression} set={v=>updatePreference("noiseSuppression",v)}/><SettingToggle label="AUTOMATIC GAIN" detail="Keep stage volume consistent" checked={preferences.autoGain} set={v=>updatePreference("autoGain",v)}/></>}
  {tab==="GRAPHICS"&&<><h2>GRAPHICS</h2><p>Atmospheric effects use lightweight CSS animation.</p><SettingToggle label="AMBIENT EFFECTS" detail="Smoke, neon flicker and moving lights" checked={preferences.ambientEffects} set={v=>updatePreference("ambientEffects",v)}/><SettingToggle label="REDUCED MOTION" detail="Calmer transitions and reveals" checked={preferences.reducedMotion} set={v=>updatePreference("reducedMotion",v)}/><SettingToggle label="PERFORMANCE MODE" detail="Disable continuous background animation" checked={preferences.performanceMode} set={v=>updatePreference("performanceMode",v)}/></>}
  {tab==="ACCOUNT"&&<><h2>GAME ACCOUNT</h2><p>No ChatGPT login required. Your current guest identity is stored on this device.</p><div className="account-card"><span>{identity.username[0]}</span><p><b>{identity.username}</b><small>GUEST COMEDIAN</small></p><button disabled>ACCOUNT LINKING — SOON</button></div></>}
  </div></div></section>
}

function Volume({label,value,set}:{label:string;value:number;set:(v:number)=>void}){return <label className="volume-row"><span>{label}<b>{Math.round(value*100)}%</b></span><div><i style={{width:`${value*100}%`}}/><input aria-label={label} type="range" min="0" max="1" step=".01" value={value} onChange={e=>set(Number(e.target.value))}/></div></label>}
function IntroPicker({value,set}:{value:StageIntroId;set:(id:StageIntroId)=>void}){const selected=STAGE_INTROS.find(intro=>intro.id===value)||STAGE_INTROS[0];return <div className="intro-setting"><div><b>STAGE INTRO</b><small>{selected.description} Plays before your set, never over the live mic.</small></div><select aria-label="Stage intro" value={value} onChange={event=>set(event.target.value as StageIntroId)}>{STAGE_INTROS.map(intro=><option value={intro.id} key={intro.id}>{intro.label}</option>)}</select><button onClick={()=>audioManager.playStageIntro(value)} disabled={value==="none"}>PREVIEW</button></div>}
function SettingToggle({label,detail,checked,set}:{label:string;detail:string;checked:boolean;set:(value:boolean)=>void}){return <label className="setting-toggle"><span>{label}<small>{detail}</small></span><input type="checkbox" checked={checked} onChange={e=>set(e.target.checked)}/></label>}
function MicTest({state,level,test}:{state:MicState;level:number;test:()=>Promise<(()=>void)|undefined>}){return <div className={`mic-test ${state}`}><div className="mic-test-icon">🎙</div><div><b>{state==="ready"?"MIC READY":state==="denied"?"MICROPHONE BLOCKED":state==="requesting"?"ASKING BROWSER...":"CHECK YOUR MIC"}</b><span>{state==="denied"?"Allow microphone access in browser settings.":"Say something. The meter should move."}</span><div className="mic-meter"><i style={{width:`${Math.max(4,level*100)}%`}}/></div></div><button onClick={()=>void test()}>{state==="ready"?"RETEST":"TEST MIC"}</button></div>}

function ModeSelect({close,choose,privateRoom}:{close:()=>void;choose:(m:"casual"|"ranked")=>void;privateRoom:()=>void}){return <GameModal close={close} eyebrow="CHOOSE YOUR NIGHT" title="HOW DO YOU WANT TO PLAY?"><div className="mode-grid"><button onClick={()=>choose("casual")}><span>♬</span><h3>CASUAL</h3><p>Low pressure. Full chaos.</p><b>FIND A ROOM →</b></button><button className="ranked" onClick={()=>choose("ranked")}><span>◆</span><h3>RANKED</h3><p>Every laugh affects your MMR.</p><b>CLIMB THE RANKS →</b></button><button onClick={privateRoom}><span>♟</span><h3>PRIVATE</h3><p>Bring your own comedians.</p><b>OPEN A CLUB →</b></button></div></GameModal>}
function JoinOverlay({close,join}:{close:()=>void;join:(code:string)=>void}){const [code,setCode]=useState("");return <GameModal close={close} eyebrow="FIND YOUR TABLE" title="JOIN A CLUB"><p className="modal-copy">Enter the code your host sent you.</p><input className="code-input" autoFocus maxLength={8} placeholder="LMAO-482" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><GameButton primary onClick={()=>join(code)}>ENTER THE CLUB →</GameButton></GameModal>}
function CreateOverlay({close,create}:{close:()=>void;create:(s:{maxPlayers:number;performanceSeconds:number;topicEnabled:boolean})=>void}){const [players,setPlayers]=useState(6),[seconds,setSeconds]=useState(60),[topics,setTopics]=useState(true);return <GameModal close={close} eyebrow="YOUR ROOM, YOUR RULES" title="OPEN A PRIVATE CLUB"><div className="create-options"><label><span>MAX COMEDIANS</span><select value={players} onChange={e=>setPlayers(Number(e.target.value))}>{[4,5,6,7,8].map(n=><option key={n}>{n}</option>)}</select></label><label><span>STAGE TIME</span><select value={seconds} onChange={e=>setSeconds(Number(e.target.value))}>{[30,60,90,120].map(n=><option value={n} key={n}>{n} SEC</option>)}</select></label><label className="topic-switch"><span>RANDOM TOPIC<small>20-second preparation prompt</small></span><input type="checkbox" checked={topics} onChange={e=>setTopics(e.target.checked)}/></label></div><GameButton primary onClick={()=>create({maxPlayers:players,performanceSeconds:seconds,topicEnabled:topics})}>CREATE CLUB →</GameButton></GameModal>}
function HowTo({close}:{close:()=>void}){return <GameModal close={close} eyebrow="30-SECOND TOUR" title="OWN THE ROOM"><div className="how-list">{[["01","JOIN","Find a club and ready up."],["02","PERFORM","You get one mic and 60 seconds."],["03","REACT","Keep the room alive between turns."],["04","VOTE","Rate everyone except yourself."],["05","WIN","Climb the ranks and run it back."]].map(x=><div key={x[0]}><b>{x[0]}</b><span><strong>{x[1]}</strong>{x[2]}</span></div>)}</div></GameModal>}
function GameModal({close,eyebrow,title,children}:{close:()=>void;eyebrow:string;title:string;children:React.ReactNode}){useEffect(()=>{audioManager.cue("click")},[]);return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="game-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={close} aria-label="Close">×</button><p className="kicker">{eyebrow}</p><h2>{title}</h2>{children}</section></div>}
function LoadingState({title,detail,back}:{title:string;detail:string;back?:()=>void}){return <section className="loading-screen game-screen center-stage"><div className="loading-mic"><i/><b/></div><h1>{title}</h1><p>{detail}</p><div className="loading-dots"><i/><i/><i/></div>{back&&<button className="quiet-button" onClick={back}>RETURN TO CLUB</button>}</section>}
function ErrorToast({text,close,retry}:{text:string;close:()=>void;retry?:()=>void}){return <div className="error-toast" role="alert"><span>!</span><p><b>{text}</b><small>{text.includes("MIC")?"Check browser permissions and try again.":"The bouncer is checking what happened."}</small></p>{retry&&<button onClick={retry}>RETRY</button>}<button onClick={close} aria-label="Dismiss">×</button></div>}
function rankTitle(r:number){return r>=1800?"COMEDY LEGEND":r>=1600?"DIAMOND I":r>=1400?"PLATINUM II":r>=1200?"GOLD II":r>=1000?"SILVER I":"BRONZE III"}
function ordinal(n:number){return `${n}${n%10===1&&n%100!==11?"ST":n%10===2&&n%100!==12?"ND":n%10===3&&n%100!==13?"RD":"TH"}`}
function medal(n:number){return n===1?"🥇":n===2?"🥈":n===3?"🥉":""}
function signed(n:number){return n>=0?`+${n}`:String(n)}
