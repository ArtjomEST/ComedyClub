# Comedy Club Battle — playable vertical slice

## Runtime structure

| Area | Implementation |
|---|---|
| Game client | `components/game/GameApp.tsx` renders the connected game world and every match phase |
| Authoritative API | `app/api/game/route.ts` validates lobby, match, reaction, vote, result and rating commands |
| Game contract | `lib/game/types.ts` contains the phase, snapshot, player, result and audio types |
| Network client | `lib/game/client.ts` is the only browser-facing game API adapter |
| Voice | `lib/voice/voice-manager.ts` manages microphone capture, performer-only WebRTC publishing and PostgreSQL-backed SDP/ICE signaling |
| Audio | `lib/audio/audio-manager.ts` owns procedural ambience, music ducking, cues and persistent category volumes |
| Persistence | Xata PostgreSQL stores users, lobbies, presence, matches, ballots, reactions, results and signaling messages |
| Hosting | Netlify builds the standard Next.js app and runs the authoritative API as server functions |

The current vertical slice uses short snapshot polling instead of trusting local state. Xata is shared across browser sessions, so lobby membership, readiness, timers, reactions, votes, results, reconnects and rematches are genuine cross-client interactions.

## Authoritative match model

`LOBBY → COUNTDOWN → LINEUP → PREPARATION → PERFORMING → TURN_END → VOTING → CALCULATING → RESULTS`

The server owns the phase, lineup, active performer, deadlines, ballots and rating transaction. A snapshot includes `serverNow` and `phaseEndsAt`; clients calculate smooth display time locally but never advance the show.

Important rules enforced by the API:

- lobby membership and host-only start/rematch/skip commands
- random server-side lineup and topic selection
- performer-only stage microphone publishing
- no self-voting, one ballot per voter/performer pair
- no performer self-reactions and a 1.2-second reaction cooldown
- anonymous aggregate scores and server-side multiplayer Elo-style MMR
- casual matches award XP but do not modify MMR
- stale performer skip, page-refresh restoration and stale-host migration
- short-lived WebRTC signals with periodic cleanup

## Data model

`db/schema.ts` defines `users`, `lobbies`, `lobby_players`, `matches`, `performances`, `votes`, `reactions`, `match_results` and `voice_signals`. The generated PostgreSQL migration lives in `drizzle-pg/`. Shared idempotent statements in `db/schema-statements.json` keep local and newly provisioned Xata branches bootable; `npm run db:migrate` applies the same schema explicitly.

## Production scaling path

The vertical slice is fully playable. For a large public launch, replace snapshot polling and database-backed signaling with a dedicated WebSocket/SFU gateway, add a TURN service for restrictive networks, connect durable account authentication, and route moderation reports to a review system. The client boundaries already isolate those services from presentation code.
