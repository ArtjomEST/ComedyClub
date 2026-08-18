export type GamePhase =
  | "IDLE" | "MATCHMAKING" | "LOBBY" | "COUNTDOWN" | "LINEUP"
  | "PREPARATION" | "PERFORMING" | "TURN_END" | "VOTING"
  | "CALCULATING" | "RESULTS" | "POST_MATCH" | "FINISHED";

export type PlayerState = "JOINED" | "READY" | "HOST" | "AFK" | "DISCONNECTED";

export interface Player {
  id: string;
  username: string;
  avatar: string;
  rating: number;
  level: number;
  ready: boolean;
  isHost: boolean;
  mic: "unknown" | "ready" | "muted" | "denied";
  state: PlayerState;
  seat: number;
  introId: StageIntroId;
}

export interface MatchResult {
  userId: string;
  username: string;
  avatar: string;
  place: number;
  score: number;
  ratingBefore: number;
  ratingAfter: number;
  xpAwarded: number;
}

export interface LobbySnapshot {
  serverNow: number;
  matchId: string | null;
  code: string;
  phase: GamePhase;
  phaseEndsAt: number | null;
  hostId: string;
  ranked: boolean;
  visibility: "public" | "private";
  maxPlayers: number;
  performanceSeconds: number;
  topicEnabled: boolean;
  topic: string | null;
  currentPerformerId: string | null;
  turnIndex: number;
  players: Player[];
  lineup: string[];
  reactions: { id: string; senderId: string; kind: ReactionKind; createdAt: number }[];
  results: MatchResult[];
  version: number;
}

export type ReactionKind = "laugh" | "applause" | "fire" | "dead" | "awkward" | "tomato";
export type GameMode = "casual" | "ranked" | "private";

export const STAGE_INTROS = [
  {id:"dramatic-look",label:"DRAMATIC LOOK",description:"A tense cinematic entrance.",src:"/audio/intros/dramatic-look.mp3",durationMs:14652},
  {id:"none",label:"NO INTRO",description:"Walk on stage in silence.",src:null,durationMs:0},
] as const;
export type StageIntroId=(typeof STAGE_INTROS)[number]["id"];
export const isStageIntroId=(value:unknown):value is StageIntroId=>STAGE_INTROS.some(intro=>intro.id===value);
export const stageIntroDurationMs=(value:unknown)=>STAGE_INTROS.find(intro=>intro.id===value)?.durationMs??STAGE_INTROS[0].durationMs;

export interface AudioSettings {
  master: number;
  music: number;
  ambience: number;
  ui: number;
  audience: number;
  voice: number;
  muted: boolean;
}

export const TOPICS = [
  "Public transport", "Dating apps", "School", "Bad jobs", "Parents",
  "Airports", "The gym", "Gaming", "Cars", "Neighbours", "Artificial intelligence",
  "Social media", "Food delivery", "First dates", "Group projects",
] as const;
