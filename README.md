# Comedy Club Battle

A browser multiplayer stand-up battle built as a cinematic 2.5D comedy club.

## Playable loop

Create or join a lobby, ready up across real browser sessions, reveal the randomized lineup, perform over WebRTC voice, react from the audience, vote anonymously, reveal the winner, apply server-controlled rating changes, and rematch without returning to the title screen.

## Stack

- Next.js / React / TypeScript
- Xata PostgreSQL for authoritative shared match state and persistence
- Netlify Functions for the server-authoritative game API
- WebRTC for stage voice
- Web Audio for procedural music, ambience and UI cues
- Drizzle schema and migrations

## Local development

```bash
npm run dev
npm run lint
npm run build
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL` for local development.
In Netlify, add `DATABASE_URL` in **Project configuration → Environment variables**
with Functions scope before the first production deploy. The value must never use
the `NEXT_PUBLIC_` prefix.

The first API request initializes an empty preview database. Browser identity and accessibility/audio preferences are stored on the current device; ChatGPT sign-in is not required.

See `ARCHITECTURE.md` for the state machine, security rules and production scaling path.
