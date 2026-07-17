# CLAUDE.md — AI context for Recess Sports

Read this first. It's the fast on-ramp; deeper context is in `docs/OVERVIEW.md`, and human run/build/deploy steps are in `README.md`. **Keep all three current — see "Keeping docs current" at the bottom.**

## What this is (the one thing to understand)

A **free web baseball game for little kids (ages 4–8)**. You draft 9 of 30 neighborhood characters, then play a short pitch-and-swing game. The real product is **the 30 characters**: the game is a "voting machine" — every player draft pick is tallied, and pick rates reveal which kids should become toys/shows. So two jobs: (1) be genuinely fun, (2) log pick data. Design pillars: minimal reading, icon/voice-forward, short games.

## Stack

Phaser 3 · TypeScript · Vite · vitest. Static site, no backend, deployed free on **GitHub Pages** (auto-deploys on push to `main`; live at https://srgirsky.github.io/recess-sports/). All state (incl. pick tallies) is in `localStorage` for now.

## Architecture rules (follow these)

- **Pure game logic lives in `src/systems/` with NO Phaser imports.** Draft, at-bat resolution, innings, and pick logging are plain functions: state in → result out. They're unit-tested in `src/systems/logic.test.ts`. This is the most important rule — it keeps the tricky logic testable and lets the render loop stay dumb.
- **Scenes are the thin view layer.** They read input, call `systems/` reducers, and animate the result. A scene should never *decide* game outcomes — it plays back what a reducer returned. (E.g. baserunning animation is driven by `ApplyResult.movements` from `inning.ts`, so it can't desync from the real base state.)
- **Character art is generated once in `BootScene`** as modern flat-mascot SVG (no image files). `art/CharacterArt.ts` builds an SVG string from `VisualParams` (skin/hair/hairColor/uniform/accessory + `expression`/`bodyType`/`freckles`); `art/textureFactory.ts` turns it into a Phaser texture (3× viewBox) keyed by character id. Dev art gallery: press **G** on the Title.
- **All "feel" tunables live in `src/config.ts`** (timing windows, pitch speed, innings, shake, runner speed, audio volume). Change feel there, not inside scenes.
- **Reusable juice** (shake/burst/floating text/confetti) is in `src/ui/effects.ts`; **sound** (free, code-synthesized) is in `src/systems/audio.ts`.

## Key files

| Path | What it owns |
|---|---|
| `src/main.ts` | Phaser game config + scene list. Exposes `window.__game` in dev. |
| `src/config.ts` | ★ All tunables. |
| `src/data/characters.ts` | ★ The 30 kids (content). Stats 1–10; 3 signature kids use `ability`. |
| `src/data/types.ts` | Character / Stats / VisualParams / TeamState types. |
| `src/systems/draft.ts` | Alternating pick + greedy AI value function. |
| `src/systems/atbat.ts` | Timing→band→outcome + stat bias + ability hooks. |
| `src/systems/inning.ts` | Count/outs/bases state machine + auto-baserunning (+ `movements`). |
| `src/systems/picklog.ts` | The "voting machine" — localStorage pick tally. |
| `src/systems/audio.ts` | Web Audio SFX + SpeechSynthesis voice + mute. |
| `src/scenes/*` | Boot → Title → Draft → Game → Result. |
| `src/ui/*` | Button, CharacterCard, MuteButton, effects. |
| `src/dev/PickRateOverlay.ts` | Dev-only pick-rate view (press **D** on Title). |

## Commands

`npm run dev` (play locally) · `npm test` (logic tests) · `npm run build` (→ `dist/`). Full details + deploy in `README.md`.

## Gotchas (things that will bite you)

- **Background tabs pause the game.** Browsers stop `requestAnimationFrame` when the tab isn't foreground, which freezes Phaser's clock — timers (AI pick, pitch) don't fire and input drops. Not a bug; playtest with the tab focused. For automated/headless visual checks, drive `window.__game`: `scene.start('Game', {...})` then pump `game.step(t, 16)` in a loop, and force swings via `gameScene.resolvePlayerSwing(band, false)`.
- **SVG textures need base64 data URIs.** Phaser's `load.svg` calls `atob` on data URIs — they must be base64 (`textureFactory.ts` does this), not URL-encoded, or it throws `InvalidCharacterError`.
- **`textures.getTextureKeys()` is polluted** by Phaser Text objects (GUID keys). Don't treat texture keys as character ids — use `ROSTER` from `data/characters.ts`.
- **Audio needs a user gesture** to start (browser autoplay policy). It's unlocked on the Title PLAY click (`audio.unlock()`); all audio calls no-op before that or when muted, so they're always safe to call.

## Keeping docs current (do this as part of each change)

Treat doc updates as part of the work, not an afterthought. After a change, update the doc that owns that fact:
- **New/changed commands or deploy steps** → `README.md`.
- **New scene/system/module, changed architecture, or a new gotcha** → this file's key-files map + gotchas, and `docs/OVERVIEW.md`.
- **Product direction / roadmap shifts** → `docs/OVERVIEW.md`.

One source of truth per fact + pointers between docs — don't duplicate, or they'll drift.
