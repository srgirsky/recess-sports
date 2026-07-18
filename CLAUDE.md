# CLAUDE.md — AI context for Recess Sports

Read this first. It's the fast on-ramp; deeper context is in `docs/OVERVIEW.md`, and human run/build/deploy steps are in `README.md`. **Keep all three current — see "Keeping docs current" at the bottom.**

## What this is (the one thing to understand)

A **free web baseball game for little kids (ages 4–8)**. You draft 9 of 30 neighborhood characters, then play a short game where you bat the top of each inning and pitch the bottom — one timing button for both. The real product is **the 30 characters**: the game is a "voting machine" — every player draft pick is tallied, and pick rates reveal which kids should become toys/shows. So two jobs: (1) be genuinely fun, (2) log pick data. Design pillars: minimal reading, icon/voice-forward, short games.

## Stack

Phaser 3 · TypeScript · Vite · vitest. Static site, no backend, deployed free on **GitHub Pages** (auto-deploys on push to `main`; live at https://srgirsky.github.io/recess-sports/). All state (incl. pick tallies) is in `localStorage` for now.

## Architecture rules (follow these)

- **Pure game logic lives in `src/systems/` with NO Phaser imports.** Draft, at-bat resolution, innings, and pick logging are plain functions: state in → result out. They're unit-tested in `src/systems/logic.test.ts`. This is the most important rule — it keeps the tricky logic testable and lets the render loop stay dumb.
- **Scenes are the thin view layer.** They read input, call `systems/` reducers, and animate the result. A scene should never *decide* game outcomes — it plays back what a reducer returned. (E.g. baserunning animation is driven by `ApplyResult.movements` from `inning.ts`, so it can't desync from the real base state.)
- **Character art is generated once in `BootScene`** as modern flat-mascot SVG (no image files). `art/CharacterArt.ts` builds an SVG string from `VisualParams` (skin/hair/hairColor/uniform/accessory + `expression`/`bodyType`/`freckles`); `art/textureFactory.ts` turns it into a Phaser texture (3× viewBox) keyed by character id. Dev art gallery: press **G** on the Title.
- **All "feel" tunables live in `src/config.ts`** (timing windows, pitch speed, innings, shake, runner speed, audio volume). Change feel there, not inside scenes.
- **Reusable juice** (shake/burst/floating text/confetti) is in `src/ui/effects.ts`; **character animation** helpers (idle bob, squash-hop with `onDone`, pop-in, `enterFrom` staggered reveals, `pulse` attention loops, `runIn` off-screen dashes) are in `src/ui/anim.ts`; **sound** (free, code-synthesized) is in `src/systems/audio.ts`. Animation is procedural tweens on the single-texture sprites (no frame art) — e.g. GameScene draws a swinging **bat** prop, a pitcher **wind-up**, and renders baserunners as the **actual kid sprites** (containers) that run the bases (not discs). The Title has a choreographed entrance (logo slam, kids run in, ambient clouds/hops) and the Draft plays as an event (cards deal in, picks fly to the bench, the CPU visibly "scans" before picking). Feel knobs live in `config.ANIM`.
- **Shared UI kit** is `src/ui/theme.ts`: the brand `FONT`, `OUTLINE`, and rounded-outlined-with-shadow helpers `panel()`, `ribbon()`, `pill()`, `heading()`. Use these (not raw `add.rectangle`) for any UI chrome — Phaser rectangles can't round corners. Buttons/cards (`ui/Button.ts`, `ui/CharacterCard.ts`) are built on it. The font is self-hosted Fredoka (`public/fonts/fredoka.woff2`, `@font-face` in `index.html`), awaited in `BootScene` before Title.

## Key files

| Path | What it owns |
|---|---|
| `src/main.ts` | Phaser game config + scene list. Exposes `window.__game` in dev. |
| `src/config.ts` | ★ All tunables. |
| `src/data/characters.ts` | ★ The 30 kids (content). Stats 1–10; 3 signature kids use `ability`. |
| `src/data/types.ts` | Character / Stats / VisualParams / TeamState types. |
| `src/systems/draft.ts` | Alternating pick + greedy AI value function. |
| `src/systems/atbat.ts` | Timing→band→outcome + stat bias + ability hooks. |
| `src/systems/pitch.ts` | Defense half: throw timing→pitch band + the CPU batter's take/swing plan; AI wild-pitch roll. |
| `src/systems/inning.ts` | Count/outs/bases state machine + auto-baserunning + balls/walks (+ `movements`). |
| `src/systems/gameflow.ts` | Between-halves decisions: skip pointless bottoms, walk-offs, one bonus inning on a tie. |
| `src/systems/picklog.ts` | The "voting machine" — localStorage pick tally. |
| `src/systems/audio.ts` | Web Audio SFX + SpeechSynthesis voice + mute. |
| `src/scenes/*` | Boot → Title → Draft → Game → Result. |
| `src/ui/*` | Button, CharacterCard, MuteButton, effects. |
| `src/dev/PickRateOverlay.ts` | Dev-only pick-rate view (press **D** on Title). |

## Commands

`npm run dev` (play locally) · `npm test` (logic tests) · `npm run build` (→ `dist/`). Full details + deploy in `README.md`.

## Gotchas (things that will bite you)

- **Background tabs pause the game.** Browsers stop `requestAnimationFrame` when the tab isn't foreground, which freezes Phaser's clock — timers (AI pick, pitch) don't fire and input drops. Not a bug; playtest with the tab focused. For automated/headless visual checks, drive `window.__game` and force swings via `gameScene.resolvePlayerSwing(band, false)` (top half) or pitches via `gameScene.resolvePlayerPitch(band)` (bottom half — wait for `phase === 'aiming'`). **Pumping the clock correctly matters**: call `game.loop.step(t)` with monotonically increasing `t` (always > `game.loop.time` — screenshots can advance the real clock behind your back), NOT `game.step(t, delta)` (leaves `loop.delta` stale). And Phaser's tweens run on **wall-clock `Date.now()`**, not the game clock — to fast-forward tweens headlessly you must also rewind each active scene's `scene.tweens.startTime` by your step size per pump. Timers (`delayedCall`) follow the loop clock; tweens follow `Date.now()` — pump both or animations desync from logic.
- **Phaser polygon points must be 0-based (no negative coords).** `add.polygon` computes its display origin from the AABB but does NOT normalize negative point coords, so negatives get shifted twice and the shape renders far from where you put it (this misplaced the infield dirt over the stands once). Author polygon point lists starting at 0,0. **`add.triangle` fills are similarly unreliable — draw filled/stroked shapes with Graphics** (`fillTriangle`/`strokeTriangle`), like `ui/theme.ts` does for rounded chrome. Also: shape color arrays need integer indexes — `bunt[(x / 56) % len]` silently yields `undefined` (invisible fill) when `x/56` is fractional; use `Math.floor`.
- **SVG textures need base64 data URIs.** Phaser's `load.svg` calls `atob` on data URIs — they must be base64 (`textureFactory.ts` does this), not URL-encoded, or it throws `InvalidCharacterError`.
- **`textures.getTextureKeys()` is polluted** by Phaser Text objects (GUID keys). Don't treat texture keys as character ids — use `ROSTER` from `data/characters.ts`.
- **Audio needs a user gesture** to start (browser autoplay policy). It's unlocked on the Title PLAY click (`audio.unlock()`); all audio calls no-op before that or when muted, so they're always safe to call.

## Keeping docs current (do this as part of each change)

Treat doc updates as part of the work, not an afterthought. After a change, update the doc that owns that fact:
- **New/changed commands or deploy steps** → `README.md`.
- **New scene/system/module, changed architecture, or a new gotcha** → this file's key-files map + gotchas, and `docs/OVERVIEW.md`.
- **Product direction / roadmap shifts** → `docs/OVERVIEW.md`.

One source of truth per fact + pointers between docs — don't duplicate, or they'll drift.
