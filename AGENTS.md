# AGENTS.md — AI context for Recess Sports

The shared brief for EVERY coding agent on this project (Claude Code, Codex, ...). `CLAUDE.md` is a committed symlink to this file — same bytes, never edit them apart. Read this first. It's the fast on-ramp; deeper context is in `docs/OVERVIEW.md`, and human run/build/deploy steps are in `README.md`. **Keep all three current — see "Keeping docs current" at the bottom.**

## What this is (the one thing to understand)

A **free web baseball game for little kids (ages 4–8)**. You draft 9 of 30 neighborhood characters, then play a short game where you bat the top of each inning and pitch the bottom — one timing button for both. Balls in play become **live plays**: you steer a fielder with the pointer and charge throws on defense, and tap to send runners on offense (CLASSIC vs KID feel is set by the difficulty ladder on the GAME SETUP page). The real product is **the 30 characters**: the game is a "voting machine" — every player draft pick is tallied, and pick rates reveal which kids should become toys/shows. So two jobs: (1) be genuinely fun, (2) log pick data. Design pillars: minimal reading, icon/voice-forward, short games.

## Stack

Phaser 3 · TypeScript · Vite · vitest. Static site, no backend, deployed free on **GitHub Pages** (auto-deploys on push to `main`; live at https://srgirsky.github.io/recess-sports/). All state (incl. pick tallies) is in `localStorage` for now.

## ★ WHICH TREE AM I IN? (read before touching anything)

This repo now builds **two games from one Vite config** (`rollupOptions.input`):

| | v1 — `/` | v2 — `/v2/` |
|---|---|---|
| entry | `index.html` → `src/main.ts` | `v2/index.html` → `src/v2/main.ts` |
| renderer | Phaser 3, 2D, affine fake-3D | **three.js**, real 3D, DOM/CSS for all HUD + menus |
| units | arbitrary 960×640 screen px | **real feet** (60ft basepaths, 46ft mound, ~200ft fences) |
| physics | landing spot decided at contact | real gravity + drag + Magnus, RK4 |
| status | **shipped and live — do not disturb** | in progress (see `docs/OVERVIEW.md` § v2) |

**v1 is live and stays live until cutover.** Its files, tests, goldlogs and
layout audit are untouched by v2 work. v2 lives entirely under `src/v2/**` plus
`v2/index.html`, and two AUTOMATIC checks carry that guarantee: **`git diff main
-- src ':!src/v2'` must be empty**, and **v1's module graph must not be able to
reach v2** (`purity.lint.test.js` § "v1 has no path to v2", which runs in CI).

★ **THIS RULE USED TO SAY "a v2 change that alters `dist/assets/main-*.js` is a
bug", AND THAT PROXY EXPIRED IN PR 13.** The play view is the first v2 code to
import `sim/game.ts`, which value-imports the pure `systems/inning` — so for the
first time BOTH entry points needed the same v1 module, Rollup hoisted it into a
shared chunk, and v1's bundle moved (1,889.83kB → 1,886.99kB) without a line of
v1 changing. Three fixes were measured and none preserves the hash: forcing
chunks perturbs v1 further, and **building v1 alone produces a different hash
AND 18kB more** — so `main-3zKSTReH.js` was never a fingerprint of v1's source,
only of the combined two-entry build. The one literal fix is duplicating those
five modules IN SOURCE, which is the drift PR 7 existed to prevent. The bundle
moving is evidence the sharing below is REAL rather than decorative.
`render.v1BundleInvariant` has the arithmetic and the three attempts.

**Shared, never copied:** `src/data/**`, `src/config.ts` (import-free constants),
`src/net/**`, **`src/art/fieldTexture.ts`** (its `TexGraphics` is a structural
interface, so a Canvas2D shim gives three.js v1's speckled dirt and worn chalk
unchanged), and `src/ui/layoutMath.ts`'s overlap predicates.

**★ Which `src/systems/**` the SIM may share is a much shorter list than it
looks, and it is now a fence rather than a wish list.** `src/v2/sim/**` may
value-import exactly five: **`inning` · `gameflow` · `stats` · `lineup` ·
`draft`**. Those are the ones that are genuinely unit-free — `inning.ts`'s only
two imports are `import type`, so it drags in no pixel-domain runtime code at
all, and `LiveOutcome`'s fields carry no units. The list used to hold 29 names,
including **`geometry`** (v1 SCREEN PIXELS: `BASEPATH_PX` 179.6386, `HOME` at
(480,600)), `liveplay`/`atbat`/`fielding`/`pitchkind`/`steal` (px/s throughout),
`mode` (`resolveLiveParams` returns px/s), and `picklog`/`album`/`team`/`season`/
`settings`/`audio` (`localStorage`, Web Audio). It was harmless only because it
was **vacuously satisfied** — nothing in the sim imported any system at all — so
the fence had never been leaned on. `purity.lint.test.js` now also checks that
each whitelisted module *keeps its own promises* (browser-free, no `Math.random`
or `Date.now`, and its own value imports are pure too), because naming a module
"pure" is a claim and nothing was checking it. Everything else in `systems/`
stays **available to v2's render and UI layers** — the restriction is on the sim.

**Type-only imports are a separate lane.** A whole-statement `import type` erases
at build and cannot carry a constant, so the sim may type-import from anywhere in
`systems/`. That is what lets `sim/field.ts` share `PositionId` with `lineup.ts`
without opening the value door to v1's pixel-domain `geometry.ts`. A MIXED
statement (`import { type A, B }`) counts as a value import — it has a value
binding, so it is exactly as capable of carrying pixels as any other.

**v1 may never import v2.** A lint enforces the one-way edge over all of `src/`,
and since PR 13 it is THE guarantee rather than a backstop for a bundle-hash
check: reviewing diffs cannot prove v1 is unaffected by v2 work, but an
unreachable module graph can. If v1 cannot reach v2, no v2 edit can change what
v1 does — whatever the bundler decides to do with the chunks.

Storage keys `recess_pickcounts` / `recess_games_played` / `recess_album` /
`recess_team` are **shared on purpose** — the votes are the product and must stay
continuous across a v1↔v2 switch in the same browser.

### v2 architecture rules

They are in **`src/v2/AGENTS.md`** (the sim, the play, the plate, the human, the
game loop) and **`src/v2/render/AGENTS.md`** (rig, clips, characters, assets,
camera). Both load automatically when you touch a file in their tree. Read the
one you are working in before you write there — and if your context was
compacted, read it again, because only this file reloads by itself.

## Architecture rules — v1 (follow these)

**Pure game logic lives in `src/systems/` with NO Phaser imports** — draft,
at-bat resolution, innings, live plays and pick logging are plain functions,
state in and result out. **Scenes are the thin view layer**: they read input,
call reducers, and animate what came back. A scene never *decides* an outcome.
That split is the most important rule in v1 — it keeps the tricky logic testable
and lets the render loop stay dumb.

The rest is in the brief for the tree you are editing:
`src/systems/AGENTS.md` (the live-play sim, the chaser election, geometry,
modes) · `src/scenes/AGENTS.md` (GameScene, the two-seat model, the plate rig,
net and pass-and-play, the Phaser traps) · `src/art/AGENTS.md` (character art,
poses, the measured batting stance, the 3/4 camera) · `src/ui/AGENTS.md` (the
theme kit and measure-then-place layout).

**Feel tunables live in `src/config.ts`** and its own header says what to read
before touching one. Change feel there, not inside a scene.

## Only one place

These are not a file map — they are uniqueness invariants, and each can be broken
without ever opening the file it names. A second implementation of any of them
compiles, passes review, and fails somewhere else.

| Only this file | May do this |
|---|---|
| `src/net/peer.ts` | import `peerjs` |
| `src/v2/render/modelLoader.ts` | load a `.glb` (a second loader silently gets no Draco and no KTX2 detection) |
| `src/v2/render/AnimationDirector.ts` | play a clip (it is what warps the marker onto the simulated instant) |
| `src/v2/render/CharacterFactory.ts` | decide model-or-proxy |
| `src/v2/render/bridge.ts` | couple the v2 sim to the scene |
| `src/v2/sim/rng.ts` | be a source of randomness in the v2 sim — injected, never module-scope |
| `src/v2/sim/athletes.ts` | turn a 1-10 stat into a physical quantity (a lint enforces this two ways) |
| `src/v2/sim/params.ts` | hold a v2 tunable, in feet and seconds |
| `src/config.ts` | hold a v1 feel number |
| `scripts/measures.json` | hold a measured value with provenance — briefs cite the record id, never the value |
| `src/art/textureFactory.ts` | resolve a texture variant; render sites call `poseKey`, never a plain id |
| `src/art/projection.ts` | project field space to screen — and `systems/` may never import it |
| `src/data/characters.ts` | define the roster; `ROSTER` is the only source of character ids |

Everything else: open the file. Its header says what it owns, and the brief for
its tree says what the rules are.

## Deep briefs (read the one for the tree you are in)

This file is loaded into EVERY session, so it carries only what binds before you
open anything. A brief lower in the tree carries the rules for that tree and is
loaded when you touch a file inside it — read it before you write there.

| Brief | Covers |
|---|---|
| `src/v2/AGENTS.md` | v2's sim, play, plate, human input, game loop and physical model |
| `src/v2/render/AGENTS.md` | v2's rig, clips, characters, assets and camera |
| `src/systems/AGENTS.md` | v1's pure logic: the live-play sim, the chaser election, geometry, modes |
| `src/scenes/AGENTS.md` | v1's view layer: GameScene, the seat model, the plate rig, net, the Phaser traps |
| `src/art/AGENTS.md` | v1's character art, poses, the measured batting stance, the 3/4 camera |
| `src/ui/AGENTS.md` | the theme kit, measure-then-place layout, juice and animation |
| `scripts/AGENTS.md` | the measurement instrument, the lints, and the brief budgets |

More briefs land as the sections above move out; `scripts/brief.lint.test.js`
fails if one exists without being budgeted and listed here. If your context was
compacted, re-read the brief for the tree you are in before your next decision —
only this file reloads automatically.

## Commands

`npm run dev` (play locally) · `npm test` (logic tests) · `npm run build` (→ `dist/`). v2 assets: `npm run export:skeleton` (emit the rig) · `npm run export:proxy-kid` (stand-in characters; `-- all` for the whole roster) · `npm run manifest:models` (rebuild the delivery manifest) · `npm run sync:decoders` (refresh the committed Draco/Basis decoders after a `three` bump) · `npm run sim:harness` (50,000 plate appearances: rates, splits, histograms, ~75s) · `npm run sim:plate-sweep` (search the coupled plate + defence constants against `sim.retuneTargets`) · `npm run validate:models` (gate a delivery; needs Node ≥22.6 — CI runs the same rules through vitest) · `npm run sim:game` (play a whole v2 game headless: line score, box score, play-by-play). Full details + deploy in `README.md`.

## Shipping changes (the standard delivery process)

Every non-trivial change ships as a **pull request against `main` — never a direct push**. GitHub Pages auto-deploys `main`, so merging IS deploying; the PR is the gate between "done" and "live".

1. Start from clean, up-to-date `main`; branch with a typed slug: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
2. Implement; keep `systems/` pure + covered by `npm test`, and run the goldlog gate (`scripts/goldlog.browser.js`) if the change touches anything on the seeded rng path.
3. Update the owning docs (see "Keeping docs current") **in the same branch** — doc drift is a review blocker, not a follow-up.
4. Commit style: a single imperative summary line (see `git log` for the house voice); agent-authored commits carry their `Co-Authored-By` trailer.
5. Push the branch and open the PR with `gh pr create` against `main`. The body summarizes **what changed** and **how it was verified** (tests run, headless/manual playtest), and agent-authored PRs end with the "Generated with Claude Code" footer.
6. Nothing is live until the PR merges — call that out when handing off, so nobody waits on a deploy that hasn't happened.

Tiny exception: pure typo/doc fixes may go straight to `main` at the maintainer's discretion — agents always use the PR path.

## Gotchas that belong to no single tree

The tree-local ones moved to the brief for the tree they bite in. These five
can bite before you have opened anything:

- **Background tabs pause the game.** Browsers stop `requestAnimationFrame`
  when the tab isn't foreground, which freezes Phaser's clock — timers don't
  fire and input drops. Not a bug; playtest with the tab focused. For headless
  checks, drive the clock by hand: `.claude/skills/verify` has the procedure,
  including the trap that **timers follow the loop clock while tweens follow
  wall-clock `Date.now()`** — pump both or animations desync from logic.
- **Audio needs a user gesture** to start. It is unlocked on the title PLAY
  click; every audio call no-ops before that or when muted, so calls are always
  safe to make.
- **Never tween anything a sim owns.** Live plays and the schoolyard stream-out
  are stepped from `update()` and position their own objects. Tweens are for
  chrome only.
- **SVG textures need base64 data URIs.** Phaser calls `atob` on them, so a
  URL-encoded one throws `InvalidCharacterError`.
- **`textures.getTextureKeys()` is polluted** by Phaser Text objects (GUID
  keys). Never treat texture keys as character ids — use `ROSTER`.

## Keeping docs current (do this as part of each change)

Treat doc updates as part of the work, not an afterthought. After a change, update the doc that owns that fact:
- **New/changed commands or deploy steps** → `README.md`.
- **New scene/system/module, changed architecture, or a new gotcha** → this file's key-files map + gotchas, and `docs/OVERVIEW.md`.
- **Product direction / roadmap shifts** → `docs/OVERVIEW.md`.

**One agent brief, many tools.** `AGENTS.md` (this file) is the single source; `CLAUDE.md` is a symlink to it and `.agents/skills/verify` symlinks to `.claude/skills/verify` — edits write through, so updating "your" file updates everyone's. Never replace a symlink with a real file or paste a per-tool copy; that reintroduces drift. Keep the wording tool-neutral (say "the browser tools", not one vendor's tool names).

One source of truth per fact + pointers between docs — don't duplicate, or they'll drift.
