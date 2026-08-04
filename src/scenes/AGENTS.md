# src/scenes/ — AI brief

v1's view layer. Loaded when you touch anything here. Pure logic is in
`src/systems/AGENTS.md`; character art is in `src/art/AGENTS.md`.

**Scenes are thin.** They read input, call `systems/` reducers, and animate the
result. A scene never *decides* a game outcome — it plays back what a reducer
returned. Baserunning animation on walks is driven by `ApplyResult.movements`
from `inning.ts` for exactly this reason: it cannot desync from real base state.

Flow: Boot → Schoolyard (title beat + recess cutscene + wall draft) → Game
(+ Pause overlay) → Result. Title PLAY → GameSetup → (GAME) Schoolyard draft.

## GameScene owns the loop, not the drawing

GameScene steps the sim, drains events for stats/juice/booth calls, and owns
`fieldAssignment`, the live play, all input state and the replay recorder. The
sim-owned sprite layer is `scenes/ui/LivePlayView.ts` — a **sim-blind view** that never
steps the sim.

- ⚠️ **Call `view.reactTo(ev)` FIRST per event**, to preserve rng draw order.
- ⚠️ **Never tween anything the sim owns** — the live ball, fielders, runner
  tokens mid-play. Tweens are for chrome only: rings, meters, banners, exit
  fades.
- **Stop `runCycle` timers before destroying their sprite.** The cycle swaps
  textures on a repeating scene timer, and destroying the image while the timer
  lives crashes the whole game loop. It self-guards on `img.active`, but still
  `cycle.stop()` in teardown paths — and never restart a cycle for a
  runner whose `done` is set, because their exit fade owns the sprite.
  `LivePlayView`'s `buildDefense`/`settlePlay` are the canonical examples.

## The two-SEAT model

`seats[0]` = away, `seats[1]` = home; each carries team/score/lineupIdx/pitcher/
plan/fatigue/juice/identity/stats plus `humanBats`/`humanPitches`/`recordsStats`.
`battingSeat()`/`fieldingSeat()` resolve by half, and BOTH flow families are
fully seat-parameterized, so either seat can hold the bat or the mound.

- Credit runs to `battingSeat().score`; juice via `gainJuiceSeat(seat, …)` (the
  on-screen meter belongs to seat 0); stat events gated on `seat.recordsStats`.
- **Walk-off compares `seats[1]` vs `seats[0]`** — home and away are seat
  POSITIONS, not roles.
- **`enterHalf()` centralizes stale-timer and one-shot-input cancellation at
  every half boundary.** Add new cross-half timers there. Layout-only
  `half === 'top'` checks stay half-keyed.

## The two views, and the hard cut

Every pitch shows the behind-home-plate rig (`scenes/ui/BattingView.ts`): an opaque
venue backdrop at `PLATE_VIEW.DEPTH`, the batter big in the foreground, the
pitcher small on a distant mound, the defending catcher cropped at the frame
bottom, and the other seven defenders at their positions so the close view shows
the same defence as the wide field. On contact, runners moving, or a steal race,
`setView('wide')` hides the rig with a white-flash cut.

- **The camera never pans.** `setView` is pure rig show/hide; the field `ZOOM` is
  a fixed dolly baked into `project`, not a runtime camera move.
- **`setView('close')` must refresh the rig's actors on EVERY call** — batters
  change while the view stays close.
- ⚠️ **Everything drawn during a pitch must sit ABOVE `PLATE_VIEW.DEPTH`.** The
  backdrop is opaque, so a zone, ring, cursor or ball left at a legacy depth
  silently vanishes under it.
- ⚠️ **Rig-era pointer input uses RAW screen coords** (`lastScreenPointer`).
  Running it through `toLogical`/`unproject` puts the cursor in the wrong place.

## Phaser traps that bite

- **Camera zoom ignores `setScrollFactor`**, so the HUD cannot be pinned that
  way. Every screen-anchored element must go through `pinUI()` (it also routes
  container children — the hit-tester checks them individually) or it zooms with
  the field. Read world pointer coords via `cameras.main.getWorldPoint(...)`,
  **NOT `pointer.worldX/worldY`** — Phaser computes those against the topmost
  camera, which is the unzoomed UI cam.
- **GameScene has a scene-level `pointerdown` that swings or throws on ANY tap.**
  Corner HUD buttons must `stopPropagation()` in their own handlers, or tapping
  pause mid-pitch also swings the bat.
- **Camera effects need EXACT EaseMap keys** like `'Sine.easeInOut'`. Tweens
  fuzzy-match the `'Sine.inOut'` shorthand but camera effects do not — they leave
  `this.ease` undefined and crash the game loop on the next update.
- **Pausing is `scene.launch('Pause')` + `scene.pause()`.** The overlay owns
  resume input while Game is frozen; never add a second manual-freeze path.
- **The pitch-flight counters are LINEAR on purpose.** All three flight renderers
  run `tweens.addCounter` with NO ease and apply the ease manually to
  `flightProgress(kind, t)` — that is what makes the freezeball's hold span real
  flight TIME while every other kind renders pixel-identically. Re-adding `ease:`
  silently squeezes the freeze to a blink.
- **Phaser polygon points must be 0-based.** `add.polygon` computes its display
  origin from the AABB but does NOT normalise negative coords, so negatives get
  shifted twice and the shape renders far from where you put it. `add.triangle`
  fills are similarly unreliable — draw filled shapes with Graphics. And shape
  colour arrays need INTEGER indexes: `bunt[(x / 56) % len]` silently yields
  `undefined` and an invisible fill.

## The Schoolyard stream-out is sim-owned

`SchoolyardScene.update()` steps `stepCrowd` only while `phase === 'cutscene'` —
the scene lives through the whole draft, and a stray step would fight the idle
bob and inspect tweens on the same containers. **Never tween a kid's `root`
mid-stream.** The render-side run bob writes `kid.img.y` (the child inside the
container): zero it at the settle boundary before `idleBob` captures its
baseline, or kids idle-bob around an offset. Draw order is `yardDepth(y)`, not
fixed constants.

⚠️ **Never `clearTeamVariant()` on the Schoolyard without re-arming `:sc`** — the
draft's street clothes ARE an armed texture variant, and clearing it mid-draft
flips every kid back to jerseys. Conversely, any NEW scene reachable from the
title that renders kids through `poseKey` inherits the street arm; clear it there
if it is a jersey-era surface.

## Two-device play

`matchType: 'net'`, WebRTC over the free PeerJS cloud broker — still a
zero-backend static deploy. The room creator is **host = seats[0]** and runs the
one true sim; **the guest never simulates** (`update()` early-returns into
`netGuestUpdate`, and `handleNetMsg` mirrors host beats through existing
methods). **Every timing window resolves on the acting device.**

- **Every scene that subscribes to `NetSession.onMessage/onStatus` MUST
  unsubscribe on its `shutdown` event**, or the dead scene's handlers fire on the
  next game's traffic.
- The guest streams `liveInput` and renders
  `applyFrame(lerpFrames(prev, next, α))` through the same `LivePlayView`, so
  there is one view implementation, not two.
- **Guests never step the sim or schedule flow.** If a guest ever runs a
  `delayedCall` that resolves game state, the devices diverge.
- Heartbeat and staleness ride the PHASER clock; RECONNECT runs on wall-clock
  timers so it works under a frozen (paused) Phaser.
- **Draft picks are the one ack'd and retransmitted message.** The acks live in
  the `onMessage` CALLBACK, never the idle-gated drain (which stops running after
  the final pick), and any scene reachable right after the net draft must re-ack
  stray `draftPick`s or a lost final ack strands the sender.
- **Bump `NET.PROTOCOL_VERSION` on ANY wire change** — old deployed builds must
  be rejected at hello, not desync mid-game.
- ⚠️ Two tabs on ONE origin share `localStorage`; real devices do not.

## Pass-and-play

`matchType: 'passplay'`: both seats get `humanBats`, so BOTH halves run the
seat-parameterized human-batting family against a CPU defence and the
human-pitching family is never entered. `HandoffSplash` gates every half's FLOW
timers behind a tap (`config.PASSPLAY.SPLASH_GUARD_MS`). `deviceSeat()` is the BATTING seat here, so the juice meter
and chips follow the device. Defensive CPU juice spends and the difficulty ramp
are OFF in PvP, and exhibitions only — no season, no `recordGamePlayed`.

## Spectator

`GameInitData.spectator` runs both teams CPU-driven in the kid feature set:
GameScene forces `fielderAssist: 'auto'`, auto-swings the batting team mid-flight
and keeps `pendingRun` set so runners advance. The scene `pointerdown`
early-returns on `spectator`.

## Flow timing

`FLOW` owns every between-moments beat — `delayedCall`s must use it, never
literal ms. **Invariant: a banner's hold ≤ the FLOW beat that follows it**, so
calls finish before the next pitch. `FLOW.PITCH_CLOCK_MS` is the MOUND idle clock
only; nothing on the batting side waits for input, so no mode can hang. Its worst
case must stay under `NET.ACTION_TIMEOUT_MS`, which `launchPitchMain`'s
`netWaitFor` relies on for liveness — a test pins that.

The between-pitch beat is ANIMATED, not waited out, and it is **SUBTRACTED from
the beat it fills, never appended**, so pace is unchanged. A test pins the budget.

## The goldlog

`scripts/goldlog.browser.js` + `goldlogs.json`: a seeded game drive whose
state-transition log must stay byte-identical through behaviour-identical
refactors. ⚠️ **Cosmetics consume rng in one sneaky way: every `add.text(...)`
creates a canvas texture whose key is a UUID from `Math.random`.** Creating,
removing or reordering ANY Text object relative to a sim rng call shifts the
seeded stream and breaks the fingerprint — keep feedback-text calls on the same
side of the resolve they are on today. When REGENERATING, launch `goldLogRun`
fire-and-forget and poll `sessionStorage`; an awaited eval that times out
mid-drive pollutes the fingerprint.

## Where things live

| File | What it owns |
|---|---|
| `src/scenes/LineupScene.ts` | batting order + position pads; emits `GameInitData`, the ONE extended payload GameScene consumes |
| `src/scenes/GameSetupScene.ts` | the setup page: game type, difficulty ladder, innings, oopsies, helpers, venue |
| `src/scenes/SeasonScene.ts` | the chalkboard standings hub, view-only over `season.ts` |
| `src/scenes/SettingsScene.ts` | volumes and innings; the game-setup fields live on the setup page |
| `src/scenes/AwardsScene.ts` | the end-of-week podium |
| `src/scenes/AlbumScene.ts` | the 30-slot sticker grid |
| `src/scenes/PauseScene.ts` | the pause overlay, incl. the two net variants |
| `src/scenes/LobbyScene.ts` | host/join over emoji room codes; dev hooks `codeHex`, `joinWithCode` |
| `src/scenes/ui/LivePlayView.ts` | the sim-owned sprite layer and the Backyard steering read |
| `src/scenes/ui/BattingView.ts` | the behind-home-plate rig |
| `src/scenes/ui/Scoreboard.ts` | the bottom strip: team rows, AT BAT block, B-S-OUT pips, mini-diamond, umpire calls |
| `src/scenes/ui/PitchSelectUI.ts` | the mound UI: pitch card stack + 3x3 zone grid |
| `src/scenes/ui/EdgeCards.ts` | the right-edge card-stack factory shared by pitch and swing pickers |
| `src/scenes/ui/PitchFx.ts` | per-kind pitch-flight dressing — STRICTLY rng-free |
| `src/scenes/ui/Spectacle.ts` | big-moment set pieces at depths above the rig |
| `src/scenes/ui/HandoffSplash.ts` | the pass-and-play tap gate |
