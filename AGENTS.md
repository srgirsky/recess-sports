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

## Key files

| Path | What it owns |
|---|---|
| `src/main.ts` | Phaser game config + scene list. Exposes `window.__game` in dev. |
| `src/config.ts` | ★ All tunables. |
| `src/data/characters.ts` | ★ The 30 kids (content). Stats 1–10 (contact/power/speed/pitching/fielding); 3 signature kids use `ability`; every kid has a required `voiceGender` (`boy`/`girl` — drives voice selection only, not art) and a first-person `draftLine` (spoken in their derived voice when picked), personality kids add `chatterLines`. |
| `src/data/types.ts` | Character / Stats / VisualParams (+ the three clamped per-kid spec objects `BodySpec` / `FaceSpec` / `HairSpec`) / TeamState types. |
| `src/systems/draft.ts` | Alternating pick + greedy value function; `chooseBestPick` picks for either side (CPU turns + the ⚡ AUTO fast-forward, which skips `recordPick`). |
| `src/systems/crowd.ts` | The recess stream-out crowd sim: door-metered launches, seek + pairwise separation, stair/wall-gap constraints, no-soft-lock guard. Pure + deterministic (rng injected at create only); stepped from `SchoolyardScene.update()`. |
| `src/systems/atbat.ts` | Timing→band + ability hooks; `resolveContact` (kid: RNG spray) and `resolveContactAimed` (main: cursor-vs-ball overlap gates the band, cursor position drives pull/oppo spray + fly/grounder bias) both feed the shared `buildLaunch` → trajectory (homers decided here, everything else goes live). **Swing types** (CLASSIC, `features.swingChoice`): `SwingType` 🛡safe/🏏normal/💪big/🤏bunt + the signature 🤪crazyBunt (ability `'crazy_bunt'` — Sprout; a capped grounder that SNAPS its spray to whichever line the timing leans toward, no extra rng draw) — `timingForSwing` reshapes the band windows (safe wider, big narrower), big turns weak contact into a whiff + crushes solid contact, bunt forces a short dead grounder (`distCap`); knobs in `config.SWING_TYPES`; icon chips on the rig's left edge, reset per batter, with signature cards appended per-batter in `showSwingChips` (the juice-pitch gating pattern). |
| `src/systems/liveplay.ts` | ★ The live-play sim: tick reducer, catches/force races, CPU fielder+runner policies, no-soft-lock guards. **THE CUTOFF RELAY** (`LIVE.RELAY`, CPU defense + CLASSIC only): a fielder who secures the ball beyond `DEPTH_LEGS` (1.39 basepath legs) cannot throw at a bag — the ball goes outfielder → cutoff man → pitcher, and a ball that reached the outfield becomes a HIT. OBSERVED in BB2001, not inferred: an infield grounder is thrown to first for the out (~4.5s play) but a ball landing on the grass is relayed while the batter takes THIRD (17.3s play, OUTS never changes — BB never *attempts* first from the outfield). Throw DISTANCE provably cannot do this job: a coin-flip on a routine grounder needs an 806px throw and the longest that exists is 418px. Three invariants, each of which was a bug first: `arriveThrow`'s `kind === 'fielder'` branch **returns before the runner loop** (an out on a relay is structurally impossible); the LAST leg targets the PITCHER, not the cutoff again (a self-throw arrives instantly and spends none of the time the relay exists for); and `relay.committed` — the **look-back rule** — is keyed on (runner, DESTINATION), so the concession covers the one leg already being run and expires on touching that bag. Keyed on the id alone the defense stops playing and a gap ball becomes an inside-the-park run; without the rule at all the pitcher guns the batter down at second (MOUND→SECOND is 118px) and the relay buys nothing. The carrier also must not tag-chase a conceded runner. **Which fielder chases is elected by `systems/fielding.ts`** (not fixed at contact — see its row). Every settle site funnels through `settleBallAt`, the one contract for "a loose ball that has stopped": it CLAMPS the resting spot into the field, because fielder moves are clamped too and an unclamped ball (the old wild-throw overshoot) came to rest where nobody could legally stand. Baserunning obeys direction rules: `reverseLeg` refuses to turn a batter-runner back toward the plate (mirroring `startRetreatLeg`), the CPU rundown rule skips FORCED runners, and `RUN2.BASE_DWELL_MS` / `REVERSE_COOLDOWN_MS` give each direction a real commitment so rundowns don't stutter — a runner at base 0 when the play ends would otherwise be dropped from the inning by `applyLivePlay` with no out recorded. Fielders carry per-kid speed/glove/arm; drops, bobbles & wild throws roll off glove/arm scaled by the mode's `errorMult`s (kid mode = 0, and mult 0 skips the rng roll so kid sims stay byte-identical). Landed flies/liners BOUNCE (`LIVE.BOUNCE` diminishing hops → decel rollout, deterministic/no-rng) and hopping/rolling balls CAROM off the fence arc (`fenceNormalAt` reflection — fence doubles are real); a hopping ball is only grabbable below `PICKUP_MAX_H`, never for an out. Mode-tied fielding assist (`params.assist`): kid `'auto'` — an idle pointer (`LiveInputs.pointerActive` false) lets the chaser field itself via the CPU's chase target; main `'magnet'` — steering is blended `assistBlend` toward the ball while it's loose. **The dive verb (CLASSIC)**: a quick tap (< `LIVE.DIVE.TAP_MAX_MS`) while chasing sets `LiveInputs.dive` — a `diveWindowMs` reach burst (+`REACH_BONUS` px); an empty dive = `diveMiss` + face-down fumble freeze with the ball live. No rng; kid mode ignores the input entirely. |
| `src/systems/fielding.ts` | ★ PURE chaser election (no Phaser, no rng). A ball in the AIR goes to whoever is nearest its landing spot; a ball on the GROUND goes to whoever can CUT IT OFF soonest, gated twice. `LIVE.CHASE.LEASH` limits candidacy to fielders whose POST is near where the ball SETTLES — without it, ranking on "who reaches it first" hands every grounder to the pitcher, since a grounder starts at home and P is nearest its early path at every spray angle. Then the ball belongs to whoever's zone it settles in unless another kid gets there `CUT_AHEAD_MS` sooner, which stops a third baseman charging across in front of the shortstop. Re-elected ONLY when the ball turns up somewhere new (land/carom/bonk/fumble/wild settle — via `LivePlayState.reelect`), behind a keep-radius, cooldown and margin, so the kid the player is steering never flickers. |
| `src/systems/geometry.ts` | Field screen coords (bases, mound, 9 fielding spots, fence) shared by sim + scene; the bases sit exactly on the foul lines (`FOUL_SLOPE`) and the foul-pole x's derive from each venue's fence y via `foulPoleXAt`; `FieldGeometry` + `fencePointAt`/`fenceYAtX` make the fence/ground/obstacles venue-shaped (bases never move) — the fence is a rounded ARC (`fenceBulge` px deeper at mid-fence than the pole chord, parabola in t) with `fenceNormalAt` giving the inward normal for caroms; `clampToField` is the containment clamp the live sim applies to fielder moves (fence + foul cone + bottom floor — a fielder can never be steered past the wall). |
| `src/data/venues.ts` | ★ The 3 venues (content): park / sandlot (short right porch + the oak) / blacktop (fast asphalt), each with fence line + `fenceBulge` arc depth, rollMult, `bounceMult` (hop/carom liveliness), obstacles, and a drawField palette + SCENERY DESCRIPTORS (`fenceStyle` wall/planks/chainlink, `skyline` stands/rooftops/brick, `treeline`, `crowdRows`, `warningTrack`, `mowPattern` stripes/checker/tufts/court) — drawField and BattingView's horizon band are data-driven off these; new venues pick a combination instead of growing `venue.id` branches. |
| `src/systems/venue.ts` | Venue persistence (localStorage `recess_venue`) + `getFieldGeometry`. |
| `src/systems/mode.ts` | CLASSIC/KID mode persistence (+ legacy `recess_difficulty` migration) + `resolveLiveParams` (LIVE × MODES × the tier's `fielding` block; `assistBlend`/`assistIdleMs`/`assistIdleSpeedMult` are the tier-scaled fields) + `getFeatures`. The player-facing **difficulty ladder** rides on top: `getDifficulty`/`setDifficulty` (stored in `recess_settings`; `setDifficulty` also syncs `recess_mode` — the authoritative internal switch the goldlog/net read directly), `DIFFICULTY_TIERS` (teeball/easy→kid, medium/hard→main; hard seeds `baseRamp`; teeball sets `isTee`; every tier carries `fielding`). `resolveLiveParams`'s third arg is the difficulty, defaulting to the tier `getDifficulty()` itself falls back to for that mode — so a bare `resolveLiveParams('main')` means MEDIUM, not a phantom tier. It is deliberately NOT a `FeatureOverrides` field: that interface can only DISABLE a mechanic, and a tier scales a value. Scenes should read the tier via `getDifficulty()`, never `getSettings().difficulty` — only the former reconciles the stored label against the authoritative `recess_mode`. `getFeatures`/`resolveLiveParams` take an optional `FeatureOverrides` (errors/swingSpot/pitchLocator) that can only DISABLE a mode's features — the all-true default is a no-op, so the seeded stream is unaffected; errors-off forces the mult-0 rng-skip. `getPitchBaseMs(mode, half, tee)` returns `TEE_PITCH_MS` for the tee-ball soft lob. |
| `src/systems/pitch.ts` | Defense half: throw timing→pitch band + the CPU batter's take/swing plan (band-based for kid mode, location-aware `resolveCpuPitchLocated` for main); AI wild-pitch roll (kid mode). |
| `src/systems/pitchkind.ts` | Main-mode pitch types + strike-zone aiming: `PitchPlan` (kind/target/actual/inZone/travelMs), scatter from meter error × pitching stat, the Backyard pitch corridor — `travelMs = base ÷ speedMult × armTravelMult(stat)` (`config.PITCH_SPEED`, CLASSIC only via `mode.ts getPitchBaseMs`; better arms throw genuinely faster, fatigue's sag makes tired arms lob) plus `lobHeightPx` (render-only rainbow arc on slow pitches, shared by all three flight renderers + the net guest) — `chooseCpuPitch` (CPU pitches at you, wastes when ahead — samples ONLY `availablePitches(false)`'s frozen base-4; new kinds go in `specialPitches`), `ballCurveAt` flight bend, `flightProgress` (the 🧊 freezeball's pure time-remap: the ball holds frozen for `PITCH_FX.FREEZE`'s span and still arrives exactly at travelMs, so swing-timing math never changes). Juice specials ⚡crazy/🔥fireball/🧊freezeball ride `spendKindForPitch` (juice.ts) + `cpuPickSpecialPitch`; per-kind flight dressing in `scenes/ui/PitchFx.ts`. Plate-coord space: (0,0) = zone center at (HOME.x, HOME.y + PLATE_ZONE.CY). |
| `src/systems/inning.ts` | Count/outs/bases state machine + walk advancement (+ `movements`); `applyLivePlay` folds live plays in; `applySteal` folds steal races in (count preserved). |
| `src/systems/juice.ts` | Main-mode juice meter: gain table (perfect swings, Ks, catches, steals, DPs...), the `SpendKind` shop — 💥 power swing / the special pitches ⚡ crazy, 🔥 fireball, 🧊 freezeball (`spendKindForPitch` maps kinds→spends; the CPU picks among affordable ones via `cpuPickSpecialPitch`) plus 💨 turboLegs (next offensive play: faster runners), 🧤 goldenGlove (next defensive play: error-proof + strong magnet + reach), 🧢 rallyCap (rest of the batting half: wider swing windows) — ability hooks, CPU spend policy. Costs/effects in `config.JUICE`; chips render via GameScene `showSpendChips` (turbo/glove arm `activeLiveParams`, the per-play params override). |
| `src/systems/lineup.ts` | PURE lineup planning: `autoAssign` (best arm pitches, up-the-middle defense priority, classic 1-2 table-setters / 3-4-5 bats order), `validateLineup`, `swapOrder`, `swapPositions` (pitcherId follows the mound pad). Shared by the LineupScene, the CPU, and relief swaps. |
| `src/scenes/LineupScene.ts` | CLASSIC-only screen between draft and game: tap-tap swap chips for batting order (1-9 column) + position pads on a chalk diamond (mound pad = starting pitcher), AUTO + PLAY BALL. Emits `GameInitData` (`{playerTeam, aiTeam, playerPlan?, aiPlan?}`) — the ONE extended payload type GameScene consumes (`buildDefense` uses the position map; kid mode never routes here). |
| `src/systems/fatigue.ts` | PURE pitcher stamina: `drainPitch` per pitch (all juice specials — crazy/fireball/freezeball — cost triple), `effectivePitching` sags the stat below `TIRED_AT` (feeds pitchkind's scatter term at both mound call sites), `isTired` (💦 sweat tell in `pitcherWindup`), `cpuWantsRelief`. Relief UI: the 🥵 chip → portrait picker in GameScene (`showReliefButton`/`doRelief`, swaps via lineup's `swapPositions`); the CPU relieves itself between batters. `config.FATIGUE`; `features.fatigue` kid-OFF. |
| `src/systems/difficulty.ts` | PURE CPU ramp from games played (picklog tally): `rampLevel` (capped), `rampedArm` (tighter CPU pitches), `rampedCpuBatter` (+contact). CLASSIC only; read in `create()` BEFORE the game is tallied. `config.DIFFICULTY`. |
| `src/systems/team.ts` | Team identity (`recess_team`, versioned): uniform-color index + logo index; `teamName` speaks "THE RED ROCKETS" (color word + logo word — zero reading); `RIVAL_PRESETS`/`pickRival` give the CPU its own identity. Picker lives in LineupScene's MY TEAM column. |
| `src/systems/settings.ts` | Player settings (`recess_settings`, versioned): independent `sfx`/`voice` volumes (audio.ts `setSfxVolume` rides the master GainNode live; `setVoiceVolume` rides per-utterance volume) + `innings` (`INNING_CHOICES` = 1/2/3/6/9 — GameScene's `this.regulation`, threaded through the gameflow fns' existing `regulation` param) + the GAME SETUP choices (`difficulty` + errors/swingSpot/pitchLocator toggles). Applied at Boot; volumes/innings edited in `scenes/SettingsScene.ts` (⚙️), the game-setup fields on the GAME SETUP page. |
| `src/scenes/GameSetupScene.ts` | ★ The BB2001-style **GAME SETUP** page (reached from the title PLAY): CHOOSE A GAME (⚾ GAME / 🥎 PRACTICE / 👀 WATCH), HOW HARD? (the difficulty ladder), INNINGS, OOPSIES (errors on/off), HELPERS (🎯 swing spot / 🥊 pitch locator — dimmed in kid difficulties), RESET ALL, and CHOOSE A FIELD with a live venue-palette preview (`◀▶`). All apply immediately + spoken. PLAY BALL routes by type: GAME → `Schoolyard {straightToDraft}` → the draft; PRACTICE/WATCH → a random 9-v-9 Game. The title's old mode + venue chips moved here. |
| `src/systems/season.ts` | ★ Recess Week (`recess_season`, versioned): 5 games vs preset rivals (never the player's color; benches drawn from the non-drafted roster), results, `wins`/`isWeekOver`/`wonPennant`, per-kid stats folded per game via `recordSeasonGame`. Flow: title 🏆 WEEK → (resume `Season`, or `registry.seasonDraft` → draft → `newSeason` → `Season`) → `Lineup {seasonGame}` → Game (collects `StatEvent`s player-side) → gameOver folds → Result "BACK TO THE WEEK" → `Season`/`Awards`. |
| `src/systems/stats.ts` | PURE per-kid stat lines (`KidStats` ab/h/hr/r/k) folded from `StatEvent`s the scene emits at its three settle seams (at-bat settle, live-play settle, 'score' drain events, kThrown). `statLine` renders "2-for-4 · 1 HR". Playground scoring: reaching on contact = hit (errors count); walk-forced runs aren't attributed. |
| `src/systems/awards.ts` | PURE end-of-week awards from ACCUMULATED season stats (Week MVP / Homer King / K Machine; deterministic ties by roster order) — the exhibition Result MVP stays stat-sum. `scenes/AwardsScene.ts` is the podium (cheer poses in team jerseys, spoken, trophies → album). |
| `src/systems/album.ts` | The sticker album (`recess_album`): drafted / won-with (foil) / trophies per kid, updated by every Result + the awards. `scenes/AlbumScene.ts`: 30-slot grid — silhouette → sticker → foil ring, 🏆 counts, tap speaks the name. 📔 on the title. |
| `src/scenes/SeasonScene.ts` | The chalkboard standings hub: Mon–Fri rival logos, chalk W/L/T marks, record, PLAY <day> / AWARDS / QUIT. View-only over season.ts. |
| `src/systems/replay.ts` | 📼 instant replay (PURE): per-tick position SNAPSHOTS of the live play (`snapshotLive`/`applyFrame` — never input re-simulation; the sim rng is unseeded) + the `PlayHighlights` classifier (`isReplayWorthy`: dive-catch, 2+ outs, fence carom). GameScene records frames in `update()`, and a worthy finished play rolls slow-motion playback through the SAME `LivePlayView.render` before settling (letterbox + tap-to-skip; the LAST frame restores the true end state so `finishLivePlay` folds correctly). Out/scored runner sprites now FADE (not destroy) during plays so the tape can bring them back; the settle sweep disposes of them. `features.replay` kid-OFF; knobs `config.FX.REPLAY`. |
| `src/systems/steal.ts` | Main-mode steal race roll: runner speed vs catcher arm, better jump off slow stuff, throw-down reaction bonus; `cpuWantsSteal`. |
| `src/systems/gameflow.ts` | Between-halves decisions: skip pointless bottoms, walk-offs, one bonus inning on a tie. |
| `src/systems/picklog.ts` | The "voting machine" — localStorage pick tally. |
| `src/systems/audio.ts` | Web Audio SFX + SpeechSynthesis + mute. `say(text, profile?, mode?)` takes a `VoiceProfile` and a mode: `flush` (big moments cancel everything), `queue` (small sequential queue), `chatter` (droppable — only if idle). Utterances use the curated voice list (`rankVoices`) + small per-utterance pitch/rate jitter so repeats don't sound identical. |
| `src/systems/voices.ts` | Voice profiles (pure): the two booth commentators' fixed profiles + `kidVoice` — each character's stable pitch/rate derived from hash(id) + expression, pitch inside the kid's `voiceGender` band (`config.VOICE.KID.GENDER_PITCH`) — + `rankVoices`/`curateVoices`, the childlike-suitability ranking of the browser voice inventory (tiers/avoid-list in `config.VOICE.PICK`) partitioned into mixed/boy/girl top-N sublists by name regex (`VOICE.PICK.GENDER` — SpeechSynthesis has no gender API); `pickVoice` resolves a profile to a voice from its gender sublist, falling back to mixed (where the pitch bands still differentiate) when a browser has no gender-marked voices. |
| `src/systems/announcer.ts` | The booth: TWO kid commentators (Pip 'A' hyped / Rocco 'B' deadpan) who alternate calls; `line()` returns `AnnounceLine[]` (sometimes a 2-line exchange on priority-2 moments). Same pools/no-repeat/2.5s rate limit; GameScene's `callIt` speaks each line in that commentator's voice. |
| `src/systems/chatter.ts` | Backyard-style field chatter (pure, Announcer-shaped): `pick(moment, now, kid)` maybe returns a line ('batterUp' self-hype / 'fielding' heckles) merging the kid's `chatterLines` with generic pools, in their derived voice; own cooldown, spoken droppably. |
| `src/art/projection.ts` | The 3/4 camera: trapezoid pinch toward the fence + depth-scaled kids + the `ZOOM` field dolly, render-side only. |
| `src/art/fieldTexture.ts` | Deterministic field-texture kit shared by drawField + the rig backdrop: `shadeInt`/`lightenInt` tones, `hash01`, dirt speckle (ellipse/quad/strip), worn `chalkLine`/`chalkRect`, `grassFlecks`. RNG-free by contract (determinism test records the draw ops). |
| `src/net/protocol.ts` | PURE two-device wire format: `NetMsg` union, `HudSnap`, validating `encode`/`decode`, `Sequencer` (dup/stale), the `Transport` seam, emoji↔`recess-`+hex room ids. No Phaser, no peerjs; FakeTransport-pair tests in `protocol.test.ts`. |
| `src/net/peer.ts` | The ONLY peerjs import: module-singleton `NetSession` (host/join/active/drop), envelope+sequencing, heartbeat/staleness on the PHASER clock (`tick(now)` from scene update — pumpable), reconnect on WALL-CLOCK timers (works while Phaser is frozen under Pause). |
| `src/scenes/LobbyScene.ts` | 🔗 host/join screens: MAKE shows 4 giant emoji, JOIN is the 16-emoji tap grid; hello (host's mode/innings/venue win) + identity (index pairs) handshake → the networked draft. Dev/E2E hooks: `codeHex`, `joinWithCode(hex)`. |
| `src/scenes/*` | Boot → Schoolyard (title beat + recess cutscene + wall draft) → Game (+ Pause overlay) → Result. Title PLAY → GameSetup → (GAME) Schoolyard draft. **Spectator (WATCH)**: `GameInitData.spectator` runs both teams CPU-driven in the kid feature set — GameScene forces `fielderAssist:'auto'` (the defense self-fields), `scheduleSpectatorSwing` auto-swings the batting team mid-flight, and `update()` keeps `pendingRun` set so runners advance; the kid-mode idle auto-throw drives the mound. The scene `pointerdown` early-returns on `spectator`; a 👀 STOP button exits. Pausing = `scene.launch('Pause')` + `scene.pause()` — the overlay owns resume input while Game is frozen; never add a second manual-freeze pause path (`time.paused` etc.). PauseScene takes `{net: 'waiting' | 'peer'}` variants (🔍 looking-for-your-friend / friend-paused — no PLAY button; the wire resumes them). |
| `src/ui/*` | Button, statbars (equalizer bars + dot ratings), PlayerCard (draft hover tag + baseball card), MuteButton, effects, anim, theme. |
| `src/ui/layoutMath.ts` | ★ PURE layout solver (no Phaser, vitest-tested, render-side like `plateView.ts`): `solveRow` (spends the gap to `minGap` BEFORE scaling, clamps at `minScale` and reports `overflow` rather than squashing past legibility), `solveColumn` (+ `space-between` slack), and the `overlaps`/`contains`/`insideFrame`/`intersection` predicates the audit and the dev overlay both use. |
| `src/ui/layout.ts` | ★ The Phaser side: `tagUi`/`uiMeta`/`remeasureText`, `worldBox`/`localBox`, `row()`, `column()`, `columnGroups()` (heading hugs its pills; slack goes between groups), `hitFromBox()`, `MIN_TOUCH`. **Measure-then-place, never build-and-place** — see the gotcha. |
| `scripts/layout.browser.js` | ★ The in-page layout audit (dependency-free, `goldlog.browser.js` shape; pasteable into a dev tab as `layoutAuditScene(key)`). Walks the display list, converts tagged chrome to world AABBs, reports `OVERLAP` / `OUT_OF_FRAME` / `HIT_OVERLAP` / `TOUCH_TOO_SMALL` / `HIT_UNDERSIZED` / `FONT_FLOOR`. Containment and display-tree descendants are legal (a label inside its panel is not a collision). |
| `scripts/layout-audit.mjs` + `layout-audit.json` | ★ `npm run audit:layout` — the gate. Playwright boots every menu screen over the scene × CONTENT matrix (3 venues, 4 difficulties, the longest of the 56 team names, all 5 Result variants) in two passes: Fredoka loaded (full ruleset, **fails loudly if the font didn't resolve** — every measured width would be the fallback's) and Fredoka blocked (BootScene's 2500ms timeout path, loose ruleset). The JSON is the record file, `measures.json`-style: tolerances, the matrix, and waivers that each carry a `why`. Runs in CI on every PR. |
| `src/dev/LayoutOverlay.ts` | Dev-only layout debugger (press **L** on any menu scene): chrome boxes green, tap targets blue, collisions flashing red. Reuses the SAME `worldBox`/`overlaps` as the CI gate, so what you see is what CI asserts. Menu scenes only — its render path calls `add.text`. |
| `src/scenes/ui/PitchSelectUI.ts` | Main-mode mound UI: the right-edge pitch card stack (base 4 + juice specials, locked when broke — GameScene supplies affordability) + tappable 3×3 zone grid + the shared strike-zone overlay, drawn on the frontal zone. |
| `src/scenes/ui/EdgeCards.ts` | The Backyard-style right-edge card-stack factory (`makeCardStack`, geometry `HUD.CARDS`): icon + word label, gold selection, 🔒+cost locked look. Shared by PitchSelectUI and GameScene's swing-type stack. Every card stopPropagations (the scene-tap gotcha). |
| `src/scenes/ui/PitchFx.ts` | Per-kind pitch-flight dressing (`createPitchFx` → `onUpdate(ball, t, u)`/`destroy`): speed lines/loop/crescent/spiral/bolts for the base kinds, the 🔥 flame trail + glow, and the 🧊 ice-cube freeze (hides the ball under a cube for the hold, shatters out). STRICTLY RNG-FREE (jitter = sin(n·137.5)) — goldlog/net safe. GameScene destroys it in `clearPitchVisuals`. |
| `src/scenes/ui/BattingView.ts` | ★ The behind-home-plate pitch view (the rig): opaque venue backdrop (textured via `art/fieldTexture.ts` — speckled dirt, chalk lines, per-style fence builds, 5-layer mound + rubber) + rear batter / distant pitcher / cropped catcher / the seven remaining defenders at `ready` (`PLATE_VIEW.FIELDERS` spots), every actor over a `groundShadow`; shown/hidden ONLY by GameScene's `setView`. |
| `src/scenes/ui/LivePlayView.ts` | ★ The live-play sprite layer (sim-blind view): fielder/runner `LiveSprite`s, ball+shadow, the Backyard steering read (`FX.LIVE_MARKER`: glowing capsule from the active fielder toward the ball's landing/position while it's loose, pulsing landing-preview ring during the hit's flight, chaser spotlight + bobbing gold chevron), base rings, throw-charge meter, GO banner. Verbs: `buildDefense(assignment)`, `beginPlay`, `render(state)` (live loop AND replay — the markers draw purely from state, so replays get them free), `reactTo(ev, state)` (per-event SFX/pops/poses), `begin/release/cancelCharge`, `settlePlay` → next runner map. Draws scene input state via accessor deps (`pitcherSprite`, `charge`); never steps the sim. |
| `src/art/plateView.ts` | The frontal plate↔screen mapping (`plateToScreen`/`screenToPlate`/cursor clamp), pure + render-side like projection.ts. |
| `src/scenes/ui/Scoreboard.ts` | The Backyard-style bottom scoreboard strip (`HUD.STRIP`): team rows (logo/name/score + batting ▶), AT BAT block (`setBatter` name + game stat line), labeled B-S-OUT pips (pulse on change), inning, mini-diamond base dots, + the HUD-anchored umpire calls. View-only. |
| `src/scenes/ui/Spectacle.ts` | Big-moment effects director (view-only, depths 60-66 — clears the rig): `homerSpectacle` (star-trail ball + fireworks + flashbulbs + confetti, driven by `flyHitBall`), `powerSwingFx`, `crazyPitchFx`. Knobs in `config.FX`. |
| `src/dev/PickRateOverlay.ts` | Dev-only pick-rate view (press **D** on Title). |
| `scripts/measure/*` | ★ The BB2001 measurement instrument (no Phaser, no `src/` imports except in the conformance test). `lib.js` = PURE math (robust stats, `summarize` with a spread FLOORED at one frame period, DERIVED `confidence`, the affinity test, ratio→constant conversion); `video.js` = the ffmpeg I/O (probe, `readFrames`, `distinctFrameRate`, `diffSeries`, `findCuts` play indexer, `contactSheet`, plus `detectGameRect`/`blitScore`/`gameSegments` for screen captures); `screenshot.js` = the EXACT-COLOUR path (`readScreenshot` recovers the native framebuffer from ScummVM's integer nearest-neighbour window blit and **throws** if the blit isn't exact). All four have synthetic ground-truth tests under `npm test`. |
| `src/v2/render/clips.ts` | ★ v2. The ANIMATION CONTRACT, in code and PURE (no three, like `cameraCues.ts`): 35 clips × frames / loop / marker frame / blend / `authoredSpeedFts` / `bodyTravelFt` / `returnsTo`, plus the rate maths (`warpRateFor`, `locomotionRateFor`, `pickLocomotion`) so timing is testable with no mixer. The two `docs/v2/*` files are mirrors of this table and `clips.test.ts` parses them to prove it. |
| `src/v2/render/AnimationDirector.ts` | ★ v2. The only place clips are played. `AnimationMixer` + the contract: `playToMarker` warps playback so a marker frame lands on the simulated instant (physics decides WHEN, the clip stretches to agree), `setLocomotionSpeed` picks the clip whose authored speed keeps the rate legible, one-shots settle down the `returnsTo` graph, and a delivered clip beats its stand-in name by name — so a pilot batch of five is playable next to thirty placeholders. |
| `src/v2/render/proceduralClips.ts` | ★ v2. Crude stand-ins for all 35 clips, so no engineering is blocked on the animator — `ProxyCharacter`'s argument extended to motion. Deliberately correct about TIMING and CONTRACT (exact loop seams, markers on their frame, no root motion, declared body travel) and deliberately not about look. |
| `src/v2/spike/AnimSpike.ts` | ★ v2 at `/v2/?anims=1`. The acceptance surface for `docs/v2/animation-brief.md`: clip list, 0.6/1.0/1.4× rates, marker flash, a real 40px thumbnail viewport (criterion 4, rendered not imagined) and a COMPUTED loop-seam number (criterion 3 — "nearly closed" pops once per stride and gets blamed on the rate). Real `dt`, unlike LookSpike's fixed 1/60. |
| `scripts/v2/glb.mjs` | ★ v2. Dependency-free glTF 2.0 read AND write. Hand-rolled because a playback loader is built to be FORGIVING — it normalises, defaults and ignores — and every one of those kindnesses is a rejection the validator would fail to make. The writer is what generates the rig from `skeleton.ts`. |
| `scripts/v2/export-skeleton.mjs` | ★ v2. `npm run export:skeleton` → `assets/v2/skeleton_recess_v1.glb`, emitted from `SKELETON` and never hand-edited, and it REFUSES to write if the bone table and `REFERENCE_HEIGHT_FT` disagree. Ships a two-triangle placeholder mesh bound to `Hips` on purpose: without a skin, glTF importers build 33 loose empties instead of an armature. |
| `src/v2/render/CharacterFactory.ts` | ★ v2. The ONE seam that decides model-or-proxy (`?proxy=1` / undelivered / load failure), returning the shared `KidView`. Warns once per character, never per instance, and never rejects. |
| `src/v2/render/CharacterModel.ts` | ★ v2. A delivered `kid_<id>.glb` made playable: three LOD nodes + the proxy as LOD3, material slots rebound onto `MaterialRegistry`, the team-colour multiply on `M_Uniform`, `face_atlas` expressions, an outline hull per primitive per level, and the bones parented outside the LOD. Same public surface as `ProxyCharacter`. |
| `src/v2/render/modelLoader.ts` | ★ v2. The only `GLTFLoader`, with Draco + KTX2 wired to `public/v2/decoders/`. Configured with the live renderer (KTX2 needs GPU support detection); caches one parsed GLTF per id and dedupes in-flight loads. |
| `src/v2/render/assets.ts` | ★ v2. Runtime asset URLs resolved against `document.baseURI`, plus the fetched delivery manifest. |
| `src/v2/render/faceAtlas.ts` | ★ v2. PURE (no three). The 4×4 expression grid from the asset contract §4 and `faceCellUv`; `faceAtlas.test.ts` parses the doc and fails on drift. |
| `scripts/v2/export-proxy-kid.mjs` | ★ v2. `npm run export:proxy-kid` → contract-legal `kid_<id>.glb` stand-ins in `public/v2/models/`, emitted from `ProxyCharacter`'s own geometry and slot spans. Refuses to write a level over its triangle budget. |
| `scripts/v2/models-manifest.mjs` | ★ v2. `npm run manifest:models` — writes `public/v2/models/manifest.json` from the directory, with a `--check` mode a test runs. |
| `scripts/v2/sync-decoders.mjs` | ★ v2. `npm run sync:decoders` — copies the Draco/Basis decoders out of `three` into `public/v2/decoders/`, with a `--check` mode so a `three` bump cannot desync the committed copies. |
| `scripts/v2/ts-resolve.mjs` | ★ v2. A Node resolution hook so a build script can `import './skeleton'` and find `skeleton.ts`. Only fires after normal resolution fails, and only for the two scripts that opt in. |
| `scripts/v2/modelRules.mjs` + `validate-models.mjs` | ★ v2. `npm run validate:models` — the gate both v2 docs promise. Pure rule engine (contract passed in, no TS import) behind two front ends: the CLI (Node ≥22.6, type stripping) and `validate-models.test.js` (vitest, so CI's Node 20 runs the same rules). Bone set/order/bind-pose hash, height band, morph targets, root motion, 30fps grid, loop seams, measured body travel, derived marker frames, LOD budgets, material slots, size. Failures name the rule AND why it exists. |
| `src/v2/sim/rng.ts` | ★ v2. The sim's only randomness: sfc32 + xmur3, **injected never module-scope**, and `fork(label)` substreams keyed on `(seed, label)` rather than stream position — so a draw added in one place cannot move another. No `normal()` yet: every textbook sampler needs `Math.log` (see the architecture rules). |
| `src/v2/sim/params.ts` | ★ v2. The sim's tunables in FEET and SECONDS — `BALL`·`AIR`·`AERO`·`INTEGRATOR`. Deliberately not `src/config.ts`, which is a 960×640 pixel world; a number here can be checked against a tape measure or a paper. `SCREAMING_SNAKE` so `conformance.test.js`'s token extractor can bind records to it. |
| `src/v2/sim/ball.ts` | ★ v2. The published ball, and the two aero coefficients. Everything folds into `BALL_K_PER_FT` = ½ρA/m, which is the *validation*: deriving it from the four published constants and comparing against Nathan's independently published 5.509e-3 exercises ρ, A and m at once. |
| `src/v2/sim/flight.ts` | ★ v2. RK4 over gravity + quadratic drag + Magnus, with events resolved by **bisection**. It integrates and REPORTS ("crossed the ground plane 0.00317s into this step") — never decides what an event means. RK4 stages run on scalar locals: zero allocation, and reentrant for free. `sampleAt` is the render seam, exposed before any renderer exists. |
| `src/v2/sim/launch.ts` | ★ v2. Describes-a-batted-ball → `BallState`. Its own file because it is the ONE place an authored ANGLE becomes a vector, so it is the one place needing trig — and the per-step path (`flight.ts`, `ball.ts`) is lint-checked to have none. PR 4's `contact.ts` hands off here. |
| `src/v2/sim/bounce.ts` | ★ v2. What a crossing MEANS: grip/slip ground impact, roll, wall carom, obstacle, plus **`stepLooseBall`/`stepLooseBallFull`/`traceLooseBall`** — one tick, one whole tick (remainder consumed), and the whole life. The trace is a LOOP over the tick and the reducer calls the same tick, so "where is it going" and "where did it go" are one implementation. v1 keeps a second, sketch implementation for the election and hedges that "a divergence changes who gets sent"; there is no divergence to bound here. The tangential result is DERIVED (`v' = (5v − 2ωR)/7` — the minus is what memory gets wrong) and checked by conserved quantities. Carom is gated on `fenceHeight`; rolling containment lives in `rollStep` so "a rolling ball stays in the field" is true by construction. No `Rng`. |
| `src/v2/sim/athletes.ts` | ★ v2. Where a 1-10 STAT becomes a physical quantity, and the ONE place each does: `batSpeedFts` · `sprintTopSpeedFts` · `sprintAccelFtS2` · `sprintTimeSec`/`sprintTimeForFt` · `reachFt` · `throwSpeedFts` · `reactionSec`. The sprint acceleration is DERIVED from `pace.homeToFirst` rather than stated. `purity.lint.test.js` enforces the single-source claim textually and functionally. |
| `src/v2/sim/fielders.ts` | ★ v2. Nine kids with gloves: acceleration-limited pursuit, a 3ft capsule reach with a real ceiling, drops off the `fielding` stat through an injected `Rng`, closed-form throw flight that returns **null** out of range, and v1's two-regime chaser election with the read folded in and the cut-ahead gate expressed as a ratio. No trig anywhere — it is on the HOT list. |
| `src/v2/sim/runners.ts` | ★ v2. Baserunning off the same two speed functions: legs measured in feet with a standing start, momentum kept through a bag and lost standing on one, a reversal that costs the speed, and v1's two `defense.fielderSpeed.exposed` bugs pinned deterministically (`reverseLeg`'s `from <= 0` guard, and `settleBase`'s `min(from, to)`). |
| `src/v2/sim/contact.ts` | ★ v2. Bat meets ball: Nathan's Eq. 3 identity for exit velocity, `e_A` derived from the recoil factor, the undercut geometry for launch angle, and the same grip result `bounce.ts` uses for backspin. Replaces v1's categorical grounder/liner/fly roll. |
| `src/v2/sim/pitch.ts` | ★ v2. The pitch as a real trajectory — break is EMERGENT Magnus, not a drawn bow. Release speed and elevation are SOLVED from the measured flight time, because aiming straight at the plate arrives 26ft underground. |
| `src/v2/sim/play.ts` | ★ v2. The play reducer: a batted ball, nine fielders and up to four runners stepped to a `PlayOutcome` shaped exactly like v1's `LiveOutcome`. Owns possession (`secureBall`, the single choke point), throws and the emergent relay, base covering that self-heals when the conventional coverer is chasing, force-outs, tags at `reachFt()`, the CPU running policy, and the play clock. CPU-only; `PlayInputs` is a typed seam. |
| `src/v2/sim/atbat.ts` | ★ v2. One pitch, in TWO acts so a person can bat: `throwPitch` (choose a kind and a SPOT, execution error nudges the release, `flyToPlate` says where it crossed) and `resolvePitch` (the umpire reads the crossing; the batter's single judgement error decides swing-or-take AND how well he timed it). `pitchAndSwing` is the thin wrapper that keeps every CPU caller unchanged. A human may also pass a `PitchPlan` to `throwPitch`, which replaces `choosePitch` and nothing else. A human passes a `HumanSwing` and supplies those same two error terms himself — no chase rate, no whiff rate, and no human hit rate either. |
| `src/v2/sim/game.ts` | ★ v2. Plate appearance → half → inning → game, headless. The first real value-use of `inning`/`gameflow`/`stats`; keeps base OCCUPANTS itself because `applyLivePlay` drops `baseIds`. Returns a line score, per-kid lines, a play-by-play and the counting stats PR 8 aggregates. |
| `src/v2/sim/lineup.ts` | ★ v2. `planDefence` — the arm-aware planner `sim.gapBallOutcome.theArmAtShort` asked for. Each position's arm weight is DERIVED from `FIELD_POSITIONS` (distance from post to the bag it throws to), so nobody has to remember that left field needs an arm. v1's `autoAssign` is untouched. |
| `src/v2/sim/steal.ts` | ★ v2. The stolen base as a RACE — runner's leg vs pitch flight + catcher read + release + `throwFlightSec` — replacing v1's probability formula. The JUMP is the only randomness (one error in TIME, the `plateJudgementFt` pattern) and there is **no attempt rate and no success rate**; the limit on frequency is situational, because a threshold cannot decline a steal whose margin is infinite. `sim.stealRace`. |
| `src/v2/sim/harness.ts` | ★ v2. The statistical harness's PURE aggregator — it plays nothing, it is FED, by an optional `onEvent` observer on `GameSpec`. Counters and histograms only (50k plate appearances of retained objects is a memory bill for nothing). ONE implementation, TWO front ends — the CI slice and `npm run sim:harness` — the way `layout.browser.js` serves both the dev overlay and the CI audit. **`LAUNCH_CUTS` are BORROWED bin edges, not physics**, and `sim.battedBallSplit` says so; there is deliberately **no `hardHitPct`**, because MLB's 95mph threshold reads zero for every kid forever and a statistic that cannot vary is not a measurement. |
| `scripts/v2/harness.mjs` | ★ v2. `npm run sim:harness` — 874 games / 50,045 PA / 8 seeds / 3 venues in 73.5s, the cheque `rng.ts` wrote when it chose sfc32. Two traps it has to avoid and both are recorded: **every game gets its own root seed** (the per-PA fork key is `${inning}${half}${lineupIdx}`, which is NOT unique across games — one root per RUN measures one game 874 times), and **the roster ROTATES** (`sim:game` plays kids 0-8 vs 9-17, so twelve of thirty never bat and every rate is an average over 60% of a 1-10 stat span). `RUN_BUDGET_MS` is a hard ceiling, not a per-game timeout — the case a per-game timeout misses is every game getting four times slower. |
| `scripts/v2/plate-sweep.mjs` | ★ v2. `npm run sim:plate-sweep` — searches the four COUPLED plate constants (`ATTACK_ANGLE_DEG` · `UNDERCUT_FROM_JUDGE` · `PULL_DEG_PER_FT` · `TWO_STRIKE_PROTECT_FT`) against `sim.retuneTargets`, which was written BEFORE it ran. It RANKS and never writes `params.ts` — overrides go through `PlateOverrides`, because PR 7's sweep patched files and left two injected values in the tree across two interrupted runs. It checks ORDERING per candidate, not once on the winner. |
| `src/v2/render/bridge.ts` | ★ v2. The SINGLE coupling point between sim and scene — the file this document claimed existed for twelve PRs before PR 13 wrote it. Takes a `LiveFrame` and positions the ball, nine fielders and the runners; **reads sim state and never writes it**, enforced by a lint rather than by review. Owns no policy: the camera is `cameraCues`, the clips are `AnimationDirector`. It also draws the defence BETWEEN pitches — skipping that left the park empty until contact and every kid in its bind pose, which no test saw and one screenshot did. |
| `src/v2/spike/PlayView.ts` | ★ v2 at `/v2/?play=1`. The first page on which v2 plays baseball. Pumps `simulateGameLive` — the sim's OWN generator — against a real clock with a **fixed-step accumulator, never the render delta** (`scripts/simclock.lint.test.js` exists because a tempo scalar once put home→1B at 6995ms against a record asserting 4197). Scene built by the SAME functions the Look Spike uses; HUD under `#hud`'s `pointer-events: none` so it cannot eat PR 14's input. Owns the two membranes where pixels become feet: the GROUND plane (fielding) and the PLATE's vertical plane (batting). |
| `scripts/v2/purity.lint.test.js` | ★ v2. **★ There is exactly ONE kid speed in the sim** (textual: only `athletes.ts` may read a raw band; functional: `makeFielder` and `makeRunner` agree over 30 kids and stats 1-10). Plus: `src/v2/sim/**` imports only sim/data/config/**five** pure systems (`inning`·`gameflow`·`stats`·`lineup`·`draft`); no three, no DOM, no `Math.random`, no `Date.now`, **no module-scope `Rng`**; every sim file must import in plain Node; whole-statement `import type` gets a separate wider lane; **the whitelist itself is checked** (each named system must be browser-free, random-free, and value-import only pure modules); and **nothing outside `src/v2/**` may import v2**, which is what actually guarantees a v2 edit cannot reach v1's bundle. Two files claimed this gate existed before it did, and it then spent its first life vacuously satisfied. |
| `scripts/measures.json` | ★ The measurement records + `conformance.test.js`'s gate. Every record names the `src/config.ts` constant it informs, so the audit trail runs source → record → constant, and carries a `status`: `conformed` (ours inside the band), `known-drift` (outside, and the test pins the drift's SIZE so it can't grow or be half-fixed unnoticed), `awaiting-measurement` (BB not measured yet — pins only OUR value, claims nothing about BB), `note` (a finding about the measurement itself). Read this before tuning any "Backyard feel" constant. |

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
