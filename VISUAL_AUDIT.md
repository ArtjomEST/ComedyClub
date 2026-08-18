# Visual QA and Repair Plan

Audit target: Comedy Club Battle preview, desktop-first at 1366×768, 1363×936 and wide desktop, with intentional tablet/mobile rules.

## Global findings

| Problem | Severity | Repair | Status |
| --- | --- | --- | --- |
| Functional text rendered at 5–9px | Critical | Introduce a 10px minimum utility scale and raise body/control copy to 11–14px | Fixed |
| Buttons used tiny labels and inconsistent heights | Critical | Standardize 40px icon, 48px normal and 56px primary controls | Fixed |
| Random spacing and one-off colors | High | Introduce a 4px spacing grid, semantic color tokens and shared surface states | Fixed |
| Main title words overlapped | High | Convert the logo to a real vertical flex composition; remove absolute Battle positioning | Fixed |
| Low-contrast secondary copy | High | Raise muted/dim contrast and reserve low contrast for decorative scenery only | Fixed |
| Important controls relied on arbitrary absolute offsets | High | Move controls onto repeatable layout grids; keep absolute positioning for the stage world/effects | Fixed |
| Narrow layouts inherited desktop density | High | Add deliberate 1100, 850 and 620px layout rules without reducing functional text | Fixed |

## Screen-by-screen plan

### Main menu

- Separate COMEDY / CLUB / BATTLE so the title never collides.
- Increase PLAY subtitle, private/join labels, menu icons, status copy and featured-mode text.
- Keep PLAY visually dominant and all secondary actions in a consistent control system.
- Verify menu music begins after the first allowed browser interaction and loops at the saved music volume.

Status: implemented and visually checked. Only decorative poster/neon microtype remains below 10px.

### Mode selection, join and create dialogs

- Raise descriptions and footer actions from 6–9px to 10–12px.
- Standardize close target, select height, field height, padding and modal radius.
- Keep long descriptions readable without increasing modal overflow.

Status: implemented.

### Lobby

- Increase club metadata, lobby code, seat status, rank, rating, mic test and ready count.
- Widen preflight panel and prevent action-row collision.
- Truncate long usernames; never shrink them.
- Preserve 4-seat desktop layout, 2-seat narrow layout and readable disabled states.

Status: implemented and checked in a real two-client lobby. No functional overlap detected.

### Countdown and lineup

- Increase lineup name/rank/first-up labels.
- Keep reveal timing but avoid using animation to hide required information.
- Keep the next-performer state readable at laptop height.

Status: implemented and checked in two synchronized clients.

### Performance stage

- Remove the decorative microphone stand beside the performer avatar.
- Replace the obstructive full-width bottom strip with a floating command dock.
- Increase timer label, performer metadata, mic state and reaction captions.
- Keep reactions horizontally scrollable on narrow screens without shrinking captions.
- Give mic failure and voice-connection states explicit text, not color only.
- Play the selected performer intro in full during server-sized preparation and stop it before the live timer/microphone begins.
- Keep stage voice mounted across preparation and performance; use an explicit media playback element with a click-to-unlock recovery state.
- Use `SKIP INTRO` and `END SET` as separate host actions with visible busy feedback and immediate server-confirmed transitions.

Status: implemented and visually checked. Stage remains the dominant layer.

### Voting

- Raise voting progress, timer, rank, rating labels and anonymity note.
- Increase score-option hit areas and preserve clear selected/disabled states.
- Keep score totals hidden until everyone finishes.

Status: implemented and checked in two clients.

### Results

- Raise contestant name, score, MMR and post-match metric labels.
- Preserve last-to-first reveal and winner emphasis.
- Keep REMATCH as the dominant continuation action.

Status: implemented and checked after a complete two-client match.

### Profile and leaderboard

- Raise stat labels, XP text, match-history data, tabs, rank metadata and win counts.
- Truncate long names and keep numeric columns stable.
- Clearly mark upcoming tabs disabled instead of making them look interactive.

Status: implemented.

### Settings and error states

- Raise all tab, slider, percentage, description, toggle and account labels.
- Increase sliders/toggles and keyboard focus targets.
- Raise error/toast text and retain a useful recovery action.

Status: implemented and visually checked.

## Acceptance checks

- Functional desktop text is 10px or larger.
- Primary/secondary button labels remain legible at 1366×768.
- Important controls do not overlap siblings.
- Long names truncate rather than collide.
- Stage timer, performer, mic state and reactions remain readable simultaneously.
- Keyboard focus remains visible.
- Reduced-motion settings are honored.
- Audio categories remain independently controllable.
- Decorative scenery may use smaller nonessential microtype; controls and gameplay status may not.

## Follow-up QA after publication

- Verify the uploaded menu track on the deployed origin after the first click/tap.
- Run a real-device two-browser voice test with microphone permission granted on both devices.
- Check 1440×900 and 1920×1080 desktop layouts again on the deployed build.
- Check the reaction dock and settings tabs on a 390px-wide physical mobile browser.
