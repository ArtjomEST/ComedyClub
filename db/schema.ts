import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestampString = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  username: text("username").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatar: text("avatar"),
  rating: integer("rating").notNull().default(1000),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  introId: text("intro_id").notNull().default("dramatic-look"),
  createdAt: timestampString("created_at").notNull(),
  updatedAt: timestampString("updated_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestampString("expires_at").notNull(),
    createdAt: timestampString("created_at").notNull(),
    lastSeenAt: timestampString("last_seen_at").notNull(),
  },
  (table) => [uniqueIndex("session_token_idx").on(table.tokenHash), index("session_user_idx").on(table.userId)],
);

export const lobbies = pgTable("lobbies", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  hostId: text("host_id").notNull().references(() => users.id),
  visibility: text("visibility").notNull().default("public"),
  passwordHash: text("password_hash"),
  ranked: boolean("ranked").notNull().default(false),
  maxPlayers: integer("max_players").notNull().default(6),
  performanceSeconds: integer("performance_seconds").notNull().default(60),
  topicEnabled: boolean("topic_enabled").notNull().default(true),
  phase: text("phase").notNull().default("LOBBY"),
  currentPerformerId: text("current_performer_id"),
  phaseEndsAt: bigint("phase_ends_at", { mode: "number" }),
  version: integer("version").notNull().default(0),
  createdAt: timestampString("created_at").notNull(),
});

export const lobbyPlayers = pgTable(
  "lobby_players",
  {
    lobbyId: text("lobby_id").notNull().references(() => lobbies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ready: boolean("ready").notNull().default(false),
    seat: integer("seat").notNull(),
    connectedAt: timestampString("connected_at").notNull(),
    lastSeenAt: timestampString("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("lobby_user_unique").on(table.lobbyId, table.userId),
    index("lobby_seat_idx").on(table.lobbyId, table.seat),
  ],
);

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  lobbyId: text("lobby_id").references(() => lobbies.id, { onDelete: "set null" }),
  ranked: boolean("ranked").notNull(),
  topic: text("topic"),
  startedAt: timestampString("started_at").notNull(),
  finishedAt: timestampString("finished_at"),
});

export const performances = pgTable("performances", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  position: integer("position").notNull(),
  startedAt: timestampString("started_at"),
  endedAt: timestampString("ended_at"),
  averageScore: doublePrecision("average_score"),
});

export const votes = pgTable(
  "votes",
  {
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    voterId: text("voter_id").notNull().references(() => users.id),
    performerId: text("performer_id").notNull().references(() => users.id),
    stars: integer("stars").notNull(),
    createdAt: timestampString("created_at").notNull(),
  },
  (table) => [uniqueIndex("one_vote_per_performer").on(table.matchId, table.voterId, table.performerId)],
);

export const reactions = pgTable(
  "reactions",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    senderId: text("sender_id").notNull().references(() => users.id),
    performerId: text("performer_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("reaction_feed_idx").on(table.matchId, table.createdAt)],
);

export const matchResults = pgTable(
  "match_results",
  {
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    place: integer("place").notNull(),
    score: doublePrecision("score").notNull(),
    ratingBefore: integer("rating_before").notNull(),
    ratingAfter: integer("rating_after").notNull(),
    xpAwarded: integer("xp_awarded").notNull(),
  },
  (table) => [uniqueIndex("one_result_per_player").on(table.matchId, table.userId)],
);

export const voiceSignals = pgTable(
  "voice_signals",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    lobbyId: text("lobby_id").notNull().references(() => lobbies.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("voice_signal_target_idx").on(table.lobbyId, table.toUserId, table.id)],
);
