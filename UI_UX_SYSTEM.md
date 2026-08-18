# Comedy Club Battle UI/UX System

This document is the visual and interaction contract for every game screen. New UI must use these rules instead of one-off sizes or colors.

## 1. Typography

- Display: `Impact / Arial Narrow` for dramatic titles, timers, lineup and results only.
- UI: `Arial / Helvetica` for buttons, navigation and controls.
- Editorial: `Georgia` for club-flavored accents, rank values and short atmospheric text.
- Minimum functional text on desktop: **10px**. Never use 5–9px labels for controls or status.
- Utility label: 10px; compact label: 11px; body: 12–14px; important body: 16px.
- Buttons use 11px, bold, uppercase, with 1.5px tracking.
- Long usernames must truncate with an ellipsis; scores and timers use tabular numerals.

## 2. Controls

- Small icon control: 40×40px.
- Normal button: minimum 48px high.
- Primary/action button: 56px high where space allows.
- Touch and keyboard target: never below 40px; target 44–48px.
- Every interactive control needs default, hover, pressed, focus, disabled and busy feedback.
- Primary actions use the warm red gradient. Secondary actions use dark wood surfaces. Destructive actions use danger red only.

## 3. Spacing and layout

- Base grid: 4px.
- Allowed spacing: 4, 8, 12, 16, 24, 32 and 48px.
- Desktop game content uses a 48px minimum outer inset when space allows.
- Related controls use 8px gaps; component internals use 12–16px; major groups use 24–48px.
- Do not position important labels with arbitrary absolute offsets. Absolute positioning is reserved for the stage world, effects and cinematic overlays.

## 4. Color and contrast

- Primary text: `#fff4df`.
- Secondary text: `#baaca1`.
- Muted text: `#91837a`.
- Main background: `#080606`.
- Surface: `#17100d`; raised surface: `#241612`.
- Primary red: `#d64b32`; hot red: `#ff6246`.
- Accent amber: `#e9a44b`; highlight amber: `#ffd28b`.
- Success: `#58c981`; danger: `#ed5b4b`.
- Borders use translucent white at 14% by default and become warmer/brighter on hover.
- Status is never communicated with color alone; always pair it with text or an icon.

## 5. Shape, depth and motion

- Small radius: 4px; control/modal radius: 10px; cinematic dock radius: 18px.
- Avoid generic rounded cards. Use stage light, border detail and shadow to create depth.
- UI response: 150–200ms. Standard transition: 250–400ms. Dramatic reveal: 600–1200ms.
- Hover: move at most 2–3px and add light. Press: compress to 98%.
- Respect reduced motion and never animate essential readability.

## 6. Responsive behavior

- Desktop is primary. At 1100px, remove nonessential descriptions before shrinking functional text.
- At 850px, collapse lobby utilities and simplify stage metadata while keeping the stage dominant.
- At 620px, use purpose-built layouts: horizontal reaction dock, two-column lobby seats, full-width actions and scrollable settings tabs.
- Never solve narrow layouts by shrinking labels below 10px.

## 7. Screen-specific hierarchy

- Main menu: PLAY is the only dominant action.
- Lobby: players and READY are dominant; settings and invite are secondary.
- Stage: performer, timer and mic state are dominant; reactions live in the floating command dock.
- Voting: current performer and star selection are dominant; no live scores.
- Results: placement reveal first, score second, MMR impact third, rematch action last.
- Settings: labels, values and slider targets remain readable and keyboard accessible.

## 8. Audio behavior

- Menu music and ambience start only after the first user interaction, continue across the main menu, profile, leaderboard, settings, dialogs and matchmaking, then respect saved volume settings.
- A performer intro starts once when `PREPARATION` begins for that performer. The server derives preparation time from the selected catalog item duration plus a network buffer, so the complete intro can finish before `PERFORMING` opens the live microphone.
- Performer intro choices come from the central `STAGE_INTROS` catalog and are stored on the player profile; adding another intro requires one catalog entry, its exact `durationMs`, and one audio asset.
- The host stage action is never an ambiguous `SKIP`: during preparation it reads `SKIP INTRO`, during a live performance it reads `END SET`, and it immediately reflects the authoritative server response.
- `PREPARATION`, `PERFORMING`, and `TURN_END` share one mounted stage for a performer so voice transport is not torn down between phases.
- Music ducks outside the menu and during live performance.
- UI, audience, ambience, music and voice have independent gain categories.
- Hover, click, ready, join, vote, timer, bell, reveal and rating sounds use distinct cues.
- Live voice always has priority over reactions, ambience and music.
