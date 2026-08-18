import type {GameMode,LobbySnapshot,ReactionKind,StageIntroId} from "./types";

const ENDPOINT="/api/game";

export type AccountUser={id:string;firstName:string;lastName:string;nickname:string;avatarUrl:string;rating:number;xp:number;level:number;introId:string};

export const authApi={
  session:async()=>{const response=await fetch("/api/auth",{cache:"no-store",credentials:"include"});const data=await response.json();if(!response.ok)throw new Error(data.error||"No active session");return data as {state:"AUTHENTICATED";user:AccountUser}},
  create:async(form:FormData)=>{const response=await fetch("/api/auth",{method:"POST",body:form,credentials:"include"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Account creation failed");return data as {state:"AUTHENTICATED";user:AccountUser}},
  logout:()=>fetch("/api/auth",{method:"DELETE",credentials:"include"}),
};

async function request<T>(body:Record<string,unknown>):Promise<T>{
  const response=await fetch(ENDPOINT,{method:"POST",headers:{"content-type":"application/json"},credentials:"include",body:JSON.stringify(body)});
  const data=await response.json() as T&{error?:string};
  if(!response.ok) throw new Error(data.error||"The club server did not answer.");
  return data;
}

export const gameApi={
  quickPlay:(mode:Exclude<GameMode,"private">,id:string,username:string)=>request<LobbySnapshot>({action:"quickPlay",mode,userId:id,username}),
  create:(id:string,username:string,settings:{maxPlayers:number;performanceSeconds:number;topicEnabled:boolean})=>request<LobbySnapshot>({action:"create",userId:id,username,...settings}),
  join:(code:string,id:string,username:string)=>request<LobbySnapshot>({action:"join",code:code.trim().toUpperCase(),userId:id,username}),
  snapshot:async(code:string)=>{
    const response=await fetch(`${ENDPOINT}?code=${encodeURIComponent(code)}`,{cache:"no-store",credentials:"include"});
    const data=await response.json() as LobbySnapshot&{error?:string};
    if(!response.ok) throw new Error(data.error||"Connection to the club was lost.");
    return data;
  },
  ready:(code:string,id:string,ready:boolean)=>request<LobbySnapshot>({action:"ready",code,userId:id,ready}),
  start:(code:string,id:string)=>request<LobbySnapshot>({action:"start",code,userId:id}),
  reaction:(code:string,id:string,kind:ReactionKind)=>request<{ok:true}>({action:"reaction",code,userId:id,kind}),
  vote:(code:string,id:string,performerId:string,stars:number)=>request<{ok:true}>({action:"vote",code,userId:id,performerId,stars}),
  leave:(code:string,id:string)=>request<{ok:true}>({action:"leave",code,userId:id}),
  rematch:(code:string,id:string)=>request<LobbySnapshot>({action:"rematch",code,userId:id}),
  skip:(code:string,id:string)=>request<LobbySnapshot>({action:"skip",code,userId:id}),
  signal:(code:string,id:string,toUserId:string,type:string,payload:unknown,sessionKey:string)=>request<{ok:true}>({action:"signal",code,userId:id,toUserId,type,payload,sessionKey}),
  signals:(code:string,id:string,after:number,sessionKey:string)=>request<{signals:{id:number;fromUserId:string;type:string;payload:unknown}[]}>({action:"signals",code,userId:id,after,sessionKey}),
  setIntro:(id:string,username:string,introId:StageIntroId)=>request<{ok:true;introId:StageIntroId}>({action:"setIntro",userId:id,username,introId}),
  profile:(id:string)=>request<{user:{id:string;username:string;avatar:string;rating:number;xp:number;level:number;introId:StageIntroId};stats:{matches:number;wins:number;podiums:number;averageStars:number;highestRating:number;stageSeconds:number};history:{place:number;score:number;ratingChange:number;finishedAt:string;ranked:boolean}[]}>({action:"profile",userId:id}),
  leaderboard:()=>request<{players:{id:string;username:string;avatar:string;rating:number;level:number;wins:number}[]}>({action:"leaderboard"}),
};
