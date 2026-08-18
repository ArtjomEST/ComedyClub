import {isStageIntroId,stageIntroDurationMs,TOPICS,type GamePhase,type LobbySnapshot,type MatchResult,type Player,type ReactionKind,type StageIntroId} from "../../../lib/game/types";

type Row=Record<string,unknown>;
const nowIso=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const code=()=>`${["LOL","LMAO","HAHA","MIC"][Math.floor(Math.random()*4)]}-${Math.floor(100+Math.random()*900)}`;
const allowedReactions=new Set<ReactionKind>(["laugh","applause","fire","dead","awkward","tomato"]);
const introPreparationMs=(introId:unknown)=>Math.max(4000,stageIntroDurationMs(introId)+2500);

type ClubDatabase=typeof import("cloudflare:workers")["env"]["DB"];
let database:ClubDatabase|null=null;
let schemaReady=false;
async function initDb(){
  if(!database){const worker=await import("cloudflare:workers");database=worker.env.DB||null}
  if(database&&!schemaReady){
    const statements=[
      `CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY NOT NULL,email text UNIQUE,username text NOT NULL,avatar text,rating integer DEFAULT 1000 NOT NULL,xp integer DEFAULT 0 NOT NULL,level integer DEFAULT 1 NOT NULL,intro_id text DEFAULT 'dramatic-look' NOT NULL,created_at text NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS lobbies(id text PRIMARY KEY NOT NULL,code text UNIQUE NOT NULL,host_id text NOT NULL,visibility text DEFAULT 'public' NOT NULL,password_hash text,ranked integer DEFAULT 0 NOT NULL,max_players integer DEFAULT 6 NOT NULL,performance_seconds integer DEFAULT 60 NOT NULL,topic_enabled integer DEFAULT 1 NOT NULL,phase text DEFAULT 'LOBBY' NOT NULL,current_performer_id text,phase_ends_at integer,version integer DEFAULT 0 NOT NULL,created_at text NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS lobby_players(lobby_id text NOT NULL,user_id text NOT NULL,ready integer DEFAULT 0 NOT NULL,seat integer NOT NULL,connected_at text NOT NULL,last_seen_at text NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS lobby_user_unique ON lobby_players(lobby_id,user_id)`,
      `CREATE INDEX IF NOT EXISTS lobby_seat_idx ON lobby_players(lobby_id,seat)`,
      `CREATE TABLE IF NOT EXISTS matches(id text PRIMARY KEY NOT NULL,lobby_id text,ranked integer NOT NULL,topic text,started_at text NOT NULL,finished_at text)`,
      `CREATE TABLE IF NOT EXISTS performances(id text PRIMARY KEY NOT NULL,match_id text NOT NULL,user_id text NOT NULL,position integer NOT NULL,started_at text,ended_at text,average_score real)`,
      `CREATE TABLE IF NOT EXISTS votes(match_id text NOT NULL,voter_id text NOT NULL,performer_id text NOT NULL,stars integer NOT NULL,created_at text NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_vote_per_performer ON votes(match_id,voter_id,performer_id)`,
      `CREATE TABLE IF NOT EXISTS reactions(id text PRIMARY KEY NOT NULL,match_id text NOT NULL,sender_id text NOT NULL,performer_id text NOT NULL,kind text NOT NULL,created_at integer NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS reaction_feed_idx ON reactions(match_id,created_at)`,
      `CREATE TABLE IF NOT EXISTS match_results(match_id text NOT NULL,user_id text NOT NULL,place integer NOT NULL,score real NOT NULL,rating_before integer NOT NULL,rating_after integer NOT NULL,xp_awarded integer NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_result_per_player ON match_results(match_id,user_id)`,
      `CREATE TABLE IF NOT EXISTS voice_signals(id integer PRIMARY KEY AUTOINCREMENT NOT NULL,lobby_id text NOT NULL,from_user_id text NOT NULL,to_user_id text NOT NULL,type text NOT NULL,payload text NOT NULL,created_at integer NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS voice_signal_target_idx ON voice_signals(lobby_id,to_user_id,id)`,
    ];
    await database.batch(statements.map(sql=>database!.prepare(sql)));
    const userColumns=((await database.prepare("PRAGMA table_info(users)").all()).results||[]) as Row[];
    if(!userColumns.some(column=>column.name==="intro_id"))await database.prepare("ALTER TABLE users ADD COLUMN intro_id text DEFAULT 'dramatic-look' NOT NULL").run();
    schemaReady=true;
  }
}
function db(){if(!database)throw new Error("The club database is warming up. Try again in a moment.");return database}
async function one(sql:string,...args:unknown[]){return (await db().prepare(sql).bind(...args).first()) as Row|null}
async function all(sql:string,...args:unknown[]){return ((await db().prepare(sql).bind(...args).all()).results||[]) as Row[]}
async function run(sql:string,...args:unknown[]){return db().prepare(sql).bind(...args).run()}

async function ensureUser(userId:string,username:string){
  const safe=(username||"New Comic").trim().slice(0,20)||"New Comic";
  await run(`INSERT INTO users(id,username,avatar,rating,xp,level,created_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username`,userId,safe,safe[0].toUpperCase(),1000,0,1,nowIso());
}

async function findLobby(lobbyCode:string){return one("SELECT * FROM lobbies WHERE code=?",lobbyCode.toUpperCase())}
async function latestMatch(lobbyId:string){return one("SELECT * FROM matches WHERE lobby_id=? ORDER BY started_at DESC LIMIT 1",lobbyId)}

async function calculateResults(lobby:Row,match:Row){
  const exists=await one("SELECT COUNT(*) count FROM match_results WHERE match_id=?",match.id);
  if(Number(exists?.count||0)>0)return;
  if(lobby.phase==="VOTING"){
    const claim=await run("UPDATE lobbies SET phase='CALCULATING',phase_ends_at=?,version=version+1 WHERE id=? AND phase='VOTING'",Date.now()+5000,lobby.id);
    if(Number(claim.meta.changes||0)===0)return;
  }
  const players=await all(`SELECT u.id,u.username,u.avatar,u.rating,
    COALESCE(AVG(v.stars),3) score FROM lobby_players lp JOIN users u ON u.id=lp.user_id
    LEFT JOIN votes v ON v.performer_id=u.id AND v.match_id=? WHERE lp.lobby_id=?
    GROUP BY u.id,u.username,u.avatar,u.rating`,match.id,lobby.id);
  const ranked=[...players].sort((a,b)=>Number(b.score)-Number(a.score));
  const statements=[];let deltaSum=0;const rated=Boolean(lobby.ranked);
  const deltas=ranked.map((p,index)=>{
    if(!rated)return 0;
    const actual=ranked.length===1?0.5:(ranked.length-1-index)/(ranked.length-1);
    const opponents=ranked.filter(o=>o.id!==p.id);
    const expected=opponents.length?opponents.reduce((sum,o)=>sum+1/(1+10**((Number(o.rating)-Number(p.rating))/400)),0)/opponents.length:.5;
    const delta=Math.max(-32,Math.min(32,Math.round(38*(actual-expected))));deltaSum+=delta;return delta;
  });
  if(deltas.length>1)deltas[0]-=deltaSum;
  ranked.forEach((p,index)=>{
    const before=Number(p.rating),after=before+deltas[index],xp=80+Math.max(0,(ranked.length-index)*20);
    statements.push(db().prepare(`INSERT OR IGNORE INTO match_results(match_id,user_id,place,score,rating_before,rating_after,xp_awarded)
      VALUES(?,?,?,?,?,?,?)`).bind(match.id,p.id,index+1,Number(p.score),before,after,xp));
    statements.push(db().prepare("UPDATE users SET rating=?,xp=xp+?,level=1+CAST((xp+?)/500 AS INTEGER) WHERE id=?").bind(after,xp,xp,p.id));
  });
  statements.push(db().prepare("UPDATE matches SET finished_at=? WHERE id=?").bind(nowIso(),match.id));
  statements.push(db().prepare("UPDATE lobbies SET phase='RESULTS',phase_ends_at=NULL,version=version+1 WHERE id=?").bind(lobby.id));
  await db().batch(statements);
}

async function advance(lobby:Row){
  const phase=String(lobby.phase) as GamePhase;const deadline=Number(lobby.phase_ends_at||0);
  const match=await latestMatch(String(lobby.id));if(!match)return;
  if(phase==="VOTING"){
    const playerCount=await one("SELECT COUNT(*) count FROM lobby_players WHERE lobby_id=?",lobby.id);
    const voteCount=await one("SELECT COUNT(*) count FROM votes WHERE match_id=?",match.id);
    const total=Number(playerCount?.count||0);if(total>1&&Number(voteCount?.count||0)>=total*(total-1)){await calculateResults(lobby,match);return}
  }
  if(!deadline||Date.now()<deadline)return;
  if(phase==="COUNTDOWN"){
    await run("UPDATE lobbies SET phase='LINEUP',phase_ends_at=?,version=version+1 WHERE id=? AND phase='COUNTDOWN' AND phase_ends_at=?",Date.now()+6500,lobby.id,deadline);
  }else if(phase==="LINEUP"){
    const first=await one("SELECT p.user_id,u.intro_id FROM performances p JOIN users u ON u.id=p.user_id WHERE p.match_id=? ORDER BY p.position LIMIT 1",match.id);
    await run("UPDATE lobbies SET phase='PREPARATION',current_performer_id=?,phase_ends_at=?,version=version+1 WHERE id=? AND phase='LINEUP' AND phase_ends_at=?",first?.user_id,Date.now()+introPreparationMs(first?.intro_id),lobby.id,deadline);
  }else if(phase==="PREPARATION"){
    const claim=await run("UPDATE lobbies SET phase='PERFORMING',phase_ends_at=?,version=version+1 WHERE id=? AND phase='PREPARATION' AND phase_ends_at=?",Date.now()+Number(lobby.performance_seconds)*1000,lobby.id,deadline);
    if(Number(claim.meta.changes||0)>0)await run("UPDATE performances SET started_at=? WHERE match_id=? AND user_id=?",nowIso(),match.id,lobby.current_performer_id);
  }else if(phase==="PERFORMING"){
    const claim=await run("UPDATE lobbies SET phase='TURN_END',phase_ends_at=?,version=version+1 WHERE id=? AND phase='PERFORMING' AND phase_ends_at=?",Date.now()+3500,lobby.id,deadline);
    if(Number(claim.meta.changes||0)>0)await run("UPDATE performances SET ended_at=? WHERE match_id=? AND user_id=?",nowIso(),match.id,lobby.current_performer_id);
  }else if(phase==="TURN_END"){
    const current=await one("SELECT position FROM performances WHERE match_id=? AND user_id=?",match.id,lobby.current_performer_id);
    const next=await one("SELECT p.user_id,u.intro_id FROM performances p JOIN users u ON u.id=p.user_id WHERE p.match_id=? AND p.position>? ORDER BY p.position LIMIT 1",match.id,Number(current?.position||0));
    if(next)await run("UPDATE lobbies SET phase='PREPARATION',current_performer_id=?,phase_ends_at=?,version=version+1 WHERE id=? AND phase='TURN_END' AND phase_ends_at=?",next.user_id,Date.now()+introPreparationMs(next.intro_id),lobby.id,deadline);
    else await run("UPDATE lobbies SET phase='VOTING',current_performer_id=NULL,phase_ends_at=?,version=version+1 WHERE id=? AND phase='TURN_END' AND phase_ends_at=?",Date.now()+30000,lobby.id,deadline);
  }else if(phase==="VOTING"||phase==="CALCULATING"){
    await calculateResults(lobby,match);
  }
}

async function snapshot(lobbyCode:string,userId:string):Promise<LobbySnapshot>{
  let lobby=await findLobby(lobbyCode);if(!lobby)throw new Error("LOBBY NOT FOUND");
  const membership=await one("SELECT 1 ok FROM lobby_players WHERE lobby_id=? AND user_id=?",lobby.id,userId);if(!membership)throw new Error("YOU ARE NOT IN THIS CLUB");
  await run("UPDATE lobby_players SET last_seen_at=? WHERE lobby_id=? AND user_id=?",nowIso(),lobby.id,userId);
  const staleHost=await one("SELECT user_id FROM lobby_players WHERE lobby_id=? AND user_id=? AND last_seen_at<?",lobby.id,lobby.host_id,new Date(Date.now()-15000).toISOString());
  if(staleHost){const successor=await one("SELECT user_id FROM lobby_players WHERE lobby_id=? AND user_id<>? ORDER BY last_seen_at DESC LIMIT 1",lobby.id,lobby.host_id);if(successor)await run("UPDATE lobbies SET host_id=?,version=version+1 WHERE id=?",successor.user_id,lobby.id)}
  if(["PREPARATION","PERFORMING"].includes(String(lobby.phase))&&lobby.current_performer_id){const stalePerformer=await one("SELECT user_id FROM lobby_players WHERE lobby_id=? AND user_id=? AND last_seen_at<?",lobby.id,lobby.current_performer_id,new Date(Date.now()-12000).toISOString());if(stalePerformer)await run("UPDATE lobbies SET phase='TURN_END',phase_ends_at=?,version=version+1 WHERE id=?",Date.now()+1500,lobby.id)}
  lobby=await findLobby(lobbyCode);if(!lobby)throw new Error("LOBBY NOT FOUND");
  await advance(lobby);lobby=await findLobby(lobbyCode);if(!lobby)throw new Error("LOBBY NOT FOUND");
  const rows=await all(`SELECT u.id,u.username,u.avatar,u.rating,u.level,u.intro_id,lp.ready,lp.seat,lp.last_seen_at
    FROM lobby_players lp JOIN users u ON u.id=lp.user_id WHERE lp.lobby_id=? ORDER BY lp.seat`,lobby.id);
  const match=await latestMatch(String(lobby.id));
  const lineup=match?await all("SELECT user_id FROM performances WHERE match_id=? ORDER BY position",match.id):[];
  const reactionRows=match?await all("SELECT id,sender_id,kind,created_at FROM reactions WHERE match_id=? AND created_at>? ORDER BY created_at",match.id,Date.now()-5000):[];
  const resultRows=match?await all(`SELECT r.*,u.username,u.avatar FROM match_results r JOIN users u ON u.id=r.user_id
    WHERE r.match_id=? ORDER BY r.place`,match.id):[];
  const players:Player[]=rows.map((p,i)=>{const disconnected=Date.now()-Date.parse(String(p.last_seen_at))>5000,introId=isStageIntroId(p.intro_id)?p.intro_id:"dramatic-look";return {id:String(p.id),username:String(p.username),avatar:String(p.avatar||String(p.username)[0]),rating:Number(p.rating),level:Number(p.level),ready:Boolean(p.ready),isHost:p.id===lobby!.host_id,mic:"unknown",state:disconnected?"DISCONNECTED":p.id===lobby!.host_id?"HOST":Boolean(p.ready)?"READY":"JOINED",seat:Number(p.seat??i),introId}});
  const results:MatchResult[]=resultRows.map(r=>({userId:String(r.user_id),username:String(r.username),avatar:String(r.avatar||"?"),place:Number(r.place),score:Number(r.score),ratingBefore:Number(r.rating_before),ratingAfter:Number(r.rating_after),xpAwarded:Number(r.xp_awarded)}));
  return {serverNow:Date.now(),matchId:match?.id?String(match.id):null,code:String(lobby.code),phase:String(lobby.phase) as GamePhase,phaseEndsAt:lobby.phase_ends_at?Number(lobby.phase_ends_at):null,hostId:String(lobby.host_id),ranked:Boolean(lobby.ranked),visibility:String(lobby.visibility) as "public"|"private",maxPlayers:Number(lobby.max_players),performanceSeconds:Number(lobby.performance_seconds),topicEnabled:Boolean(lobby.topic_enabled),topic:match?.topic?String(match.topic):null,currentPerformerId:lobby.current_performer_id?String(lobby.current_performer_id):null,turnIndex:Math.max(0,lineup.findIndex(x=>x.user_id===lobby!.current_performer_id)),players,lineup:lineup.map(x=>String(x.user_id)),reactions:reactionRows.map(r=>({id:String(r.id),senderId:String(r.sender_id),kind:String(r.kind) as ReactionKind,createdAt:Number(r.created_at)})),results,version:Number(lobby.version)};
}

async function createLobby(userId:string,username:string,ranked:boolean,maxPlayers=6,performanceSeconds=60,topicEnabled=true){
  await ensureUser(userId,username);let lobbyCode=code();while(await findLobby(lobbyCode))lobbyCode=code();const lobbyId=id(),stamp=nowIso();
  await db().batch([
    db().prepare(`INSERT INTO lobbies(id,code,host_id,visibility,ranked,max_players,performance_seconds,topic_enabled,phase,version,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(lobbyId,lobbyCode,userId,ranked?"public":"private",ranked,maxPlayers,performanceSeconds,topicEnabled,"LOBBY",0,stamp),
    db().prepare("INSERT INTO lobby_players(lobby_id,user_id,ready,seat,connected_at,last_seen_at) VALUES(?,?,?,?,?,?)").bind(lobbyId,userId,false,0,stamp,stamp),
  ]);return snapshot(lobbyCode,userId);
}

function problem(error:unknown,status=400){return Response.json({error:error instanceof Error?error.message:"The club hit a technical snag."},{status})}

export async function GET(request:Request){
  try{await initDb();const url=new URL(request.url),lobbyCode=url.searchParams.get("code")||"",userId=url.searchParams.get("userId")||"";if(!lobbyCode||!userId)return problem(new Error("Missing lobby code."));return Response.json(await snapshot(lobbyCode,userId),{headers:{"cache-control":"no-store"}})}catch(error){return problem(error,404)}
}

export async function POST(request:Request){
  try{
    await initDb();
    const b=await request.json() as Record<string,unknown>;const action=String(b.action||""),userId=String(b.userId||""),username=String(b.username||"New Comic"),lobbyCode=String(b.code||"").toUpperCase();
    if(action==="leaderboard"){const rows=await all(`SELECT u.id,u.username,u.avatar,u.rating,u.level,COUNT(CASE WHEN r.place=1 THEN 1 END) wins FROM users u LEFT JOIN match_results r ON r.user_id=u.id GROUP BY u.id ORDER BY u.rating DESC LIMIT 50`);return Response.json({players:rows.map(x=>({id:String(x.id),username:String(x.username),avatar:String(x.avatar||"?"),rating:Number(x.rating),level:Number(x.level),wins:Number(x.wins)}))})}
    if(action==="profile"){
      const user=await one("SELECT id,username,avatar,rating,xp,level,intro_id FROM users WHERE id=?",userId);if(!user)throw new Error("PROFILE NOT FOUND");
      const stats=await one(`SELECT COUNT(*) matches,COUNT(CASE WHEN place=1 THEN 1 END) wins,COUNT(CASE WHEN place<=3 THEN 1 END) podiums,COALESCE(AVG(score),0) averageStars,COALESCE(MAX(rating_after),1000) highestRating FROM match_results WHERE user_id=?`,userId);
      const stage=await one(`SELECT COALESCE(SUM((julianday(ended_at)-julianday(started_at))*86400),0) seconds FROM performances WHERE user_id=? AND started_at IS NOT NULL AND ended_at IS NOT NULL`,userId);
      const history=await all(`SELECT r.place,r.score,r.rating_before,r.rating_after,m.finished_at,m.ranked FROM match_results r JOIN matches m ON m.id=r.match_id WHERE r.user_id=? ORDER BY m.finished_at DESC LIMIT 12`,userId);
      return Response.json({user:{...user,introId:isStageIntroId(user.intro_id)?user.intro_id:"dramatic-look",rating:Number(user.rating),xp:Number(user.xp),level:Number(user.level)},stats:{matches:Number(stats?.matches||0),wins:Number(stats?.wins||0),podiums:Number(stats?.podiums||0),averageStars:Number(stats?.averageStars||0),highestRating:Number(stats?.highestRating||1000),stageSeconds:Math.round(Number(stage?.seconds||0))},history:history.map(h=>({place:Number(h.place),score:Number(h.score),ratingChange:Number(h.rating_after)-Number(h.rating_before),finishedAt:String(h.finished_at||""),ranked:Boolean(h.ranked)}))});
    }
    if(action==="setIntro"){
      const introId=String(b.introId||"") as StageIntroId;if(!isStageIntroId(introId))throw new Error("UNKNOWN STAGE INTRO");
      await ensureUser(userId,username);await run("UPDATE users SET intro_id=? WHERE id=?",introId,userId);return Response.json({ok:true,introId});
    }
    if(action==="create")return Response.json(await createLobby(userId,username,false,Math.max(4,Math.min(8,Number(b.maxPlayers)||6)),[30,60,90,120].includes(Number(b.performanceSeconds))?Number(b.performanceSeconds):60,Boolean(b.topicEnabled)));
    if(action==="quickPlay"){
      await ensureUser(userId,username);const ranked=b.mode==="ranked";const open=await one("SELECT code FROM lobbies WHERE visibility='public' AND ranked=? AND phase='LOBBY' ORDER BY created_at LIMIT 1",ranked);
      if(!open)return Response.json(await createLobby(userId,username,ranked,6,60,true));
      const existing=await findLobby(String(open.code));if(existing){const count=await one("SELECT COUNT(*) count FROM lobby_players WHERE lobby_id=?",existing.id);if(Number(count?.count)<Number(existing.max_players)){const seat=Number(count?.count||0);await run("INSERT OR IGNORE INTO lobby_players(lobby_id,user_id,ready,seat,connected_at,last_seen_at) VALUES(?,?,?,?,?,?)",existing.id,userId,false,seat,nowIso(),nowIso());return Response.json(await snapshot(String(open.code),userId))}}
      return Response.json(await createLobby(userId,username,ranked,6,60,true));
    }
    if(action==="join"){
      await ensureUser(userId,username);const lobby=await findLobby(lobbyCode);if(!lobby)throw new Error("LOBBY NOT FOUND");if(lobby.phase!=="LOBBY")throw new Error("THIS SHOW HAS ALREADY STARTED");
      const count=await one("SELECT COUNT(*) count FROM lobby_players WHERE lobby_id=?",lobby.id);if(Number(count?.count)>=Number(lobby.max_players))throw new Error("THE ROOM IS FULL");
      await run("INSERT OR IGNORE INTO lobby_players(lobby_id,user_id,ready,seat,connected_at,last_seen_at) VALUES(?,?,?,?,?,?)",lobby.id,userId,false,Number(count?.count||0),nowIso(),nowIso());return Response.json(await snapshot(lobbyCode,userId));
    }
    const lobby=await findLobby(lobbyCode);if(!lobby)throw new Error("LOBBY NOT FOUND");
    const member=await one("SELECT * FROM lobby_players WHERE lobby_id=? AND user_id=?",lobby.id,userId);if(!member)throw new Error("YOU ARE NOT IN THIS CLUB");
    if(action==="ready"){if(lobby.phase!=="LOBBY")throw new Error("THE SHOW IS ALREADY STARTING");await run("UPDATE lobby_players SET ready=?,last_seen_at=? WHERE lobby_id=? AND user_id=?",Boolean(b.ready),nowIso(),lobby.id,userId);return Response.json(await snapshot(lobbyCode,userId))}
    if(action==="start"){
      if(lobby.host_id!==userId)throw new Error("ONLY THE HOST CAN START THE SHOW");const members=await all("SELECT user_id,ready FROM lobby_players WHERE lobby_id=? ORDER BY seat",lobby.id);if(members.length<2)throw new Error("WAITING FOR AT LEAST 2 COMEDIANS");if(members.some(m=>!Boolean(m.ready)&&m.user_id!==userId))throw new Error("EVERY COMEDIAN MUST BE READY");
      const matchId=id(),topic=Boolean(lobby.topic_enabled)?TOPICS[Math.floor(Math.random()*TOPICS.length)]:null;const order=[...members].sort(()=>Math.random()-.5);
      const statements=[db().prepare("INSERT INTO matches(id,lobby_id,ranked,topic,started_at) VALUES(?,?,?,?,?)").bind(matchId,lobby.id,Boolean(lobby.ranked),topic,nowIso()),...order.map((m,i)=>db().prepare("INSERT INTO performances(id,match_id,user_id,position) VALUES(?,?,?,?)").bind(id(),matchId,m.user_id,i))];
      statements.push(db().prepare("UPDATE lobbies SET phase='COUNTDOWN',current_performer_id=NULL,phase_ends_at=?,version=version+1 WHERE id=?").bind(Date.now()+4000,lobby.id));await db().batch(statements);return Response.json(await snapshot(lobbyCode,userId));
    }
    if(action==="reaction"){
      if(lobby.phase!=="PERFORMING")throw new Error("REACTIONS ARE ONLY LIVE DURING A SET");if(lobby.current_performer_id===userId)throw new Error("THE PERFORMER CANNOT REACT TO THEIR OWN SET");const kind=String(b.kind) as ReactionKind;if(!allowedReactions.has(kind))throw new Error("UNKNOWN REACTION");const match=await latestMatch(String(lobby.id));const recent=await one("SELECT created_at FROM reactions WHERE match_id=? AND sender_id=? ORDER BY created_at DESC LIMIT 1",match?.id,userId);if(recent&&Date.now()-Number(recent.created_at)<1200)throw new Error("REACTION COOLDOWN");await run("INSERT INTO reactions(id,match_id,sender_id,performer_id,kind,created_at) VALUES(?,?,?,?,?,?)",id(),match?.id,userId,lobby.current_performer_id,kind,Date.now());return Response.json({ok:true});
    }
    if(action==="skip"){
      if(lobby.host_id!==userId)throw new Error("ONLY THE HOST CAN END A TURN");if(!["PREPARATION","PERFORMING"].includes(String(lobby.phase)))throw new Error("NO ACTIVE PERFORMANCE");
      const match=await latestMatch(String(lobby.id));
      if(lobby.phase==="PREPARATION"){
        await db().batch([db().prepare("UPDATE lobbies SET phase='PERFORMING',phase_ends_at=?,version=version+1 WHERE id=? AND phase='PREPARATION'").bind(Date.now()+Number(lobby.performance_seconds)*1000,lobby.id),db().prepare("UPDATE performances SET started_at=COALESCE(started_at,?) WHERE match_id=? AND user_id=?").bind(nowIso(),match?.id,lobby.current_performer_id)]);
      }else{
        await db().batch([db().prepare("UPDATE lobbies SET phase='TURN_END',phase_ends_at=?,version=version+1 WHERE id=? AND phase='PERFORMING'").bind(Date.now()+1200,lobby.id),db().prepare("UPDATE performances SET ended_at=COALESCE(ended_at,?) WHERE match_id=? AND user_id=?").bind(nowIso(),match?.id,lobby.current_performer_id)]);
      }
      return Response.json(await snapshot(lobbyCode,userId));
    }
    if(action==="signal"){
      const toUserId=String(b.toUserId||""),type=String(b.type||""),sessionKey=String(b.sessionKey||"");if(!["offer","answer","candidate"].includes(type)||!/^[a-zA-Z0-9:_-]{1,160}$/.test(sessionKey))throw new Error("INVALID VOICE SIGNAL");
      if(!["PREPARATION","PERFORMING"].includes(String(lobby.phase)))throw new Error("STAGE VOICE IS NOT ACTIVE");
      if(type==="offer"&&lobby.current_performer_id!==userId)throw new Error("ONLY THE PERFORMER CAN OPEN STAGE VOICE");
      if(type==="answer"&&lobby.current_performer_id===userId)throw new Error("INVALID STAGE VOICE ANSWER");
      const target=await one("SELECT 1 ok FROM lobby_players WHERE lobby_id=? AND user_id=?",lobby.id,toUserId);if(!target)throw new Error("VOICE TARGET LEFT THE CLUB");
      await db().batch([db().prepare("DELETE FROM voice_signals WHERE created_at<?").bind(Date.now()-600000),db().prepare("INSERT INTO voice_signals(lobby_id,from_user_id,to_user_id,type,payload,created_at) VALUES(?,?,?,?,?,?)").bind(lobby.id,userId,toUserId,`${sessionKey}|${type}`,JSON.stringify(b.payload),Date.now())]);return Response.json({ok:true});
    }
    if(action==="signals"){
      const sessionKey=String(b.sessionKey||"");if(!/^[a-zA-Z0-9:_-]{1,160}$/.test(sessionKey))throw new Error("INVALID VOICE SESSION");
      const prefix=`${sessionKey}|`;const rows=await all("SELECT id,from_user_id,type,payload FROM voice_signals WHERE lobby_id=? AND to_user_id=? AND id>? AND type LIKE ? ORDER BY id LIMIT 100",lobby.id,userId,Number(b.after)||0,`${prefix}%`);
      return Response.json({signals:rows.map(s=>({id:Number(s.id),fromUserId:String(s.from_user_id),type:String(s.type).slice(prefix.length),payload:JSON.parse(String(s.payload))}))});
    }
    if(action==="vote"){
      if(lobby.phase!=="VOTING")throw new Error("VOTING IS CLOSED");const performerId=String(b.performerId),stars=Number(b.stars);if(performerId===userId)throw new Error("YOU CANNOT VOTE FOR YOURSELF");if(stars<1||stars>5||!Number.isInteger(stars))throw new Error("INVALID SCORE");const target=await one("SELECT 1 ok FROM lobby_players WHERE lobby_id=? AND user_id=?",lobby.id,performerId);if(!target)throw new Error("PERFORMER NOT FOUND");const match=await latestMatch(String(lobby.id));await run("INSERT INTO votes(match_id,voter_id,performer_id,stars,created_at) VALUES(?,?,?,?,?) ON CONFLICT(match_id,voter_id,performer_id) DO UPDATE SET stars=excluded.stars,created_at=excluded.created_at",match?.id,userId,performerId,stars,nowIso());return Response.json({ok:true});
    }
    if(action==="leave"){
      await run("DELETE FROM lobby_players WHERE lobby_id=? AND user_id=?",lobby.id,userId);if(lobby.host_id===userId){const next=await one("SELECT user_id FROM lobby_players WHERE lobby_id=? ORDER BY seat LIMIT 1",lobby.id);if(next)await run("UPDATE lobbies SET host_id=?,version=version+1 WHERE id=?",next.user_id,lobby.id)}return Response.json({ok:true});
    }
    if(action==="rematch"){
      if(lobby.host_id!==userId)throw new Error("ONLY THE HOST CAN CALL A REMATCH");if(lobby.phase!=="RESULTS")throw new Error("THE SHOW IS NOT FINISHED");await db().batch([db().prepare("UPDATE lobbies SET phase='LOBBY',current_performer_id=NULL,phase_ends_at=NULL,version=version+1 WHERE id=?").bind(lobby.id),db().prepare("UPDATE lobby_players SET ready=0 WHERE lobby_id=?").bind(lobby.id)]);return Response.json(await snapshot(lobbyCode,userId));
    }
    throw new Error("UNKNOWN CLUB COMMAND");
  }catch(error){return problem(error)}
}
