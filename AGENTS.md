# AGENTS.md — AI context for Recess Sports

The shared brief for EVERY coding agent on this project (Claude Code, Codex, ...).
`CLAUDE.md` is a committed symlink to this file — same bytes, never edit them
apart. This file is loaded into every session, so it carries only what binds
before you open anything: the split, the gates, the uniqueness invariants, and
where the rest lives. Deeper narrative is in `docs/OVERVIEW.md`; human
run/build/deploy steps are in `README.md`.

## What this is (the one thing to understand)

A **free web baseball game for little kids (ages 4–8)**. You draft 9 of 30
neighborhood characters, then play a short game where you bat the top of each
inning and pitch the bottom — one timing button for both. Balls in play become
**live plays**: you steer a fielder with the pointer and charge throws on
defence, and tap to send runners on offence. The real product is **the 30
characters**: the game is a "voting machine" — every draft pick is tallied, and
pick rates reveal which kids should become toys and shows. So two jobs: (1) be
genuinely fun, (2) log pick data. Design pillars: minimal reading, icon- and
voice-forward, short games.

## Stack

Phaser 3 · TypeScript · Vite · vitest. Static site, no backend, deployed free on
**GitHub Pages** (auto-deploys on push to `main`; live at
https://srgirsky.github.io/recess-sports/). All state, including pick tallies, is
in `localStorage` for now.

## ★ Which tree am I in? (settle this before touching anything)

This repo builds **two games from one Vite config** (`rollupOptions.input`):

| | v1 — `/` | v2 — `/v2/` |
|---|---|---|
| entry | `index.html` → `src/main.ts` | `v2/index.html` → `src/v2/main.ts` |
| renderer | Phaser 3, 2D, affine fake-3D | **three.js**, real 3D, DOM/CSS for all HUD + menus |
| units | arbitrary 960×640 screen px | **real feet** (60ft basepaths, 46ft mound, ~200ft fences) |
| physics | landing spot decided at contact | real gravity + drag + Magnus, RK4 |
| status | **shipped and live — do not disturb** | in progress (`docs/OVERVIEW.md` § v2) |

**v1 is live and stays live until cutover.** v2 lives entirely under `src/v2/**`
plus `v2/index.html`.

**v1 may never import v2**, and that one-way edge is THE guarantee. Reviewing a
diff cannot prove v1 is unaffected by v2 work; an unreachable module graph can.
If v1 cannot reach v2, no v2 edit can change what v1 does, whatever the bundler
decides to do with the chunks. `purity.lint.test.js` § "v1 has no path to v2".

⚠️ **A second check is often quoted alongside it — that `git diff main -- src
':!src/v2'` stays empty — and it is a MANUAL convention, not a gate.** Nothing
runs it. Treat it as a review prompt: if a change touches v1 source, say so and
show what it did.

**Shared, never copied:** `src/data/**`, `src/config.ts` (import-free constants),
`src/net/**`, `src/art/fieldTexture.ts` (its `TexGraphics` is a structural
interface, so a Canvas2D shim gives three.js v1's speckled dirt and worn chalk
unchanged), and `src/ui/layoutMath.ts`'s overlap predicates.

**The v2 sim may value-import exactly five `src/systems/**` modules** —
`inning` · `gameflow` · `stats` · `lineup` · `draft` — because those are
genuinely unit-free. Everything else there is v1's pixel domain and stays
available to v2's render and UI layers but not to the sim. A whole-statement
`import type` is a separate, wider lane; a MIXED statement is a value import.
Rules and rationale: `src/v2/AGENTS.md` and `purity.lint.test.js`'s header.

Storage keys `recess_pickcounts` / `recess_games_played` / `recess_album` /
`recess_team` are **shared on purpose** — the votes are the product and must stay
continuous across a v1↔v2 switch in the same browser.

## The gates

Reasoning lives in each gate's own header, where the person reading a red test is
standing. That is why this file cites them instead of restating them. **Do not
weaken one to make a change pass.**

| Gate | Stops |
|---|---|
| `scripts/v2/purity.lint.test.js` | an impure v2 sim, the five-module fence, a module-scope rng, a second kid speed, v1 reaching v2 |
| `scripts/measure/conformance.test.js` | a feel constant drifting from the record that informs it |
| `scripts/brief.lint.test.js` | a brief over budget, an unreachable brief, a lost rule |
| `scripts/hitrect.lint.test.js` | a new hand-written tap target |
| `scripts/simclock.lint.test.js` | sim-milliseconds ceasing to be real milliseconds |
| `scripts/pitchbase.lint.test.js` | the pitch corridor being read from the wrong base |
| `scripts/v2/bundle.lint.test.js` | v1 bundle bloat |
| `scripts/v2/manifest.test.js` | a delivered model that renders as a proxy forever |
| `scripts/v2/validate-models.test.js` | a `.glb` that breaks the asset contract |
| `src/v2/render/skeleton.test.ts` | a rig that misses its own height, a bobblehead, an invisible face |
| `src/v2/render/clips.test.ts` | the clip table drifting from the two v2 docs |
| `src/v2/render/cameraCues.test.ts` | a camera preset that cannot see what it exists to show |
| `src/v2/sim/play.test.ts` | a play clock that fires — a soft-lock |
| `src/v2/sim/game.test.ts` | the live pump and the headless run producing different games |
| `src/systems/liveplay.test.ts` | a base off the foul line, a fielding spot outside the fair cone |
| `src/systems/venue.test.ts` | a concave fence, which breaks containment silently |
| `src/art/art.test.ts` | a bat through a kid's skull, hair layered wrong, a pose off the ground line |
| `npm run audit:layout` | overlaps, off-frame chrome, undersized taps, an unresolved font |
| `scripts/goldlog.browser.js` | a v1 refactor that changes the seeded game (manual, not CI) |

## Only one place

Not a file map — uniqueness invariants, each breakable without ever opening the
file it names. A second implementation of any of them compiles, passes review,
and fails somewhere else.

| Only this file | May do this |
|---|---|
| `src/net/peer.ts` | import `peerjs` |
| `src/v2/render/modelLoader.ts` | load a `.glb` (a second loader silently gets no Draco and no KTX2 detection) |
| `src/v2/render/AnimationDirector.ts` | play a clip (it warps the marker onto the simulated instant) |
| `src/v2/render/CharacterFactory.ts` | decide model-or-proxy |
| `src/v2/render/bridge.ts` | couple the v2 sim to the scene |
| `src/v2/sim/rng.ts` | be a source of randomness in the v2 sim — injected, never module-scope |
| `src/v2/sim/athletes.ts` | turn a 1-10 stat into a physical quantity |
| `src/v2/sim/params.ts` | hold a v2 tunable, in feet and seconds |
| `src/config.ts` | hold a v1 feel number |
| `scripts/measures.json` | hold a measured value with provenance — cite the record id, never the value |
| `src/art/textureFactory.ts` | resolve a texture variant; render sites call `poseKey`, never a plain id |
| `src/art/projection.ts` | project field space to screen — and `systems/` may never import it |
| `src/data/characters.ts` | define the roster; `ROSTER` is the only source of character ids |

Everything else: open the file. Its header says what it owns, and the brief for
its tree says what the rules are.

## Deep briefs (read the one for the tree you are in)

A brief lower in the tree carries that tree's rules and loads when you touch a
file inside it. **Read it before you write there.**

| Brief | Covers |
|---|---|
| `src/v2/AGENTS.md` | v2's sim, play, plate, human input, game loop and physical model |
| `src/v2/render/AGENTS.md` | v2's rig, clips, characters, assets and camera |
| `src/systems/AGENTS.md` | v1's pure logic: the live-play sim, the chaser election, geometry, modes |
| `src/scenes/AGENTS.md` | v1's view layer: GameScene, the seat model, the plate rig, net, the Phaser traps |
| `src/art/AGENTS.md` | v1's character art, poses, the measured batting stance, the 3/4 camera |
| `src/ui/AGENTS.md` | the theme kit, measure-then-place layout, juice and animation |
| `scripts/AGENTS.md` | the measurement instrument, the lints, and the brief budgets |

⚠️ **If your context was compacted, re-read the brief for the tree you are in
before your next decision.** Only this file reloads automatically; a nested one
is dropped until a file in its subtree is read again.

## Commands

`npm run dev` (play locally) · `npm test` (logic tests) · `npm run build` (→
`dist/`) · `npm run audit:layout` (the menu-screen gate). v2 assets and sims:
`npm run export:skeleton` · `npm run export:proxy-kid` · `npm run manifest:models`
· `npm run sync:decoders` · `npm run validate:models` · `npm run sim:game` ·
`npm run sim:harness` · `npm run sim:plate-sweep`. Full details and deploy steps
in `README.md`; what each script owns is in `scripts/AGENTS.md`.

## Shipping changes (the standard delivery process)

Every non-trivial change ships as a **pull request against `main` — never a
direct push**. GitHub Pages auto-deploys `main`, so merging IS deploying; the PR
is the gate between "done" and "live".

1. Start from clean, up-to-date `main`; branch with a typed slug: `feat/<slug>`,
   `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
2. Implement; keep `systems/` pure and covered by `npm test`, and run the goldlog
   gate (`scripts/goldlog.browser.js`) if the change touches anything on the
   seeded rng path.
3. Update the owning docs **in the same branch** — doc drift is a review blocker,
   not a follow-up. "Keeping docs current" below says which doc owns what.
4. Commit style: a single imperative summary line (see `git log` for the house
   voice); agent-authored commits carry their `Co-Authored-By` trailer.
5. Push and open the PR with `gh pr create` against `main`. The body says **what
   changed** and **how it was verified** (tests run, headless or manual
   playtest), and agent-authored PRs end with the "Generated with Claude Code"
   footer.
6. Nothing is live until the PR merges — say so when handing off, so nobody waits
   on a deploy that has not happened.

Tiny exception: pure typo and doc fixes may go straight to `main` at the
maintainer's discretion — agents always use the PR path.

## Gotchas that belong to no single tree

The tree-local ones are in the brief for the tree they bite in. These five can
bite before you have opened anything:

- **Background tabs pause the game.** Browsers stop `requestAnimationFrame` when
  the tab is not foreground, which freezes Phaser's clock — timers do not fire
  and input drops. Not a bug; playtest with the tab focused. For headless checks
  drive the clock by hand: `.claude/skills/verify` has the procedure, including
  the trap that **timers follow the loop clock while tweens follow wall-clock
  `Date.now()`** — pump both or animations desync from logic.
- **Audio needs a user gesture** to start. It is unlocked on the title PLAY
  click; every audio call no-ops before that or when muted, so calls are always
  safe to make.
- **Never tween anything a sim owns.** Live plays and the schoolyard stream-out
  are stepped from `update()` and position their own objects. Tweens are for
  chrome only.
- **SVG textures need base64 data URIs.** Phaser calls `atob` on them, so a
  URL-encoded one throws `InvalidCharacterError`.
- **`textures.getTextureKeys()` is polluted** by Phaser Text objects (GUID keys).
  Never treat texture keys as character ids — use `ROSTER`.

## Keeping docs current (do this as part of each change)

**Every fact still gets written down. This section answers WHERE.** Apply three
gates to each sentence, in order.

**Gate A — does it bind before a read?** Could an agent violate this in its first
tool call, before opening any file in the tree the rule governs? Then it belongs
in this file. If violating it requires opening `src/v2/sim/play.ts`, then
`src/v2/AGENTS.md` is already loaded by the time it matters, and it belongs
there.

**Gate B — does anything already stop it?** If a lint or test goes red on
violation, this file carries **one row in § The gates** and nothing more. The
reasoning belongs in that test's header, where the person reading the failure is
standing. The exception is a rule whose natural repair is to *weaken the gate* —
that gets one line here saying not to.

**Gate C — is it a rule, a number, or a story?**

| It is | It goes |
|---|---|
| a **rule** — imperative, violable | the brief for the tree it governs |
| a **number with provenance** | `scripts/measures.json`; briefs cite the record id, never the value |
| a **story** — what we believed, what the symptom looked like, which change | `docs/OVERVIEW.md` if project-level, the source file's own header if module-level |

Never both. The corollary that decides most cases: **an agent that must not
violate a rule needs the rule; an agent that must not un-fix a bug does not need
the bug's biography.**

Also: **new or changed commands and deploy steps** → `README.md`. **Product
direction and roadmap** → `docs/OVERVIEW.md`.

`scripts/brief.lint.test.js` enforces the shape of this — every brief has a byte
and line ceiling, a floor under its slack so a saving cannot be lent straight
back, and a census (`scripts/brief-inventory.json`) that proves no rule was lost
when it moved. Adding material is fine; adding it *here* is what these gates
govern.

**One agent brief, many tools.** `AGENTS.md` is the single source and `CLAUDE.md`
is a symlink to it, at the root and in every tree that has a brief;
`.agents/skills/verify` symlinks to `.claude/skills/verify` the same way. Edits
write through, so updating "your" file updates everyone's. Never replace a
symlink with a real file or paste a per-tool copy; that reintroduces the drift
the symlinks exist to prevent. Keep the wording tool-neutral.

One source of truth per fact, and pointers between docs — don't duplicate, or
they'll drift.
