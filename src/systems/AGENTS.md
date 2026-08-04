# src/systems/ — AI brief

v1's pure game logic. Loaded when you touch anything here. The root `AGENTS.md`
has the v1/v2 split; the view layer's rules are in `src/scenes/AGENTS.md`.

**This is the most important rule in v1: pure logic lives here with NO Phaser
imports.** Draft, at-bat resolution, innings, live plays and pick logging are
plain functions — state in, result out — unit-tested in `src/systems/logic.test.ts` and
`src/systems/liveplay.test.ts`. It is what keeps the tricky logic testable and lets the
render loop stay dumb. A scene may never *decide* a game outcome; it plays back
what a reducer returned.

⚠️ **Parts of this directory are v2's dependency.** `src/v2/sim/**` may
value-import exactly five modules from here — `inning` · `gameflow` · `stats` ·
`lineup` · `draft` — and they must stay browser-free, `Math.random`-free and
`Date.now`-free, with pure value imports of their own. `purity.lint.test.js`
checks that, so a convenience import of `geometry` or `audio` into one of those
five breaks v2. Everything else here is v1's pixel domain and is off-limits to
the sim.

## The live-play sim

`liveplay.ts` is a tick reducer: catches, force races, CPU fielder and runner
policies, no-soft-lock guards. `GameScene.update()` steps it every frame and
positions everything the sim owns **directly — never with tweens**.
`finishLivePlay` → `applyLivePlay` folds the result back into the half-inning.

- **Every settle site funnels through `settleBallAt`**, the one contract for "a
  loose ball that has stopped". It CLAMPS the resting spot into the field,
  because fielder moves are clamped too — an unclamped ball comes to rest where
  nobody can legally stand.
- **The cutoff relay is OBSERVED, not inferred** (`LIVE.RELAY`, CPU defence and
  CLASSIC only). A fielder who secures the ball beyond `DEPTH_LEGS` cannot throw
  at a bag; a ball that reached the outfield becomes a HIT. Throw DISTANCE
  provably cannot do this job — a coin flip on a routine grounder needs a throw
  far longer than the longest that exists. Three invariants, each of which was a
  bug first: `arriveThrow`'s `kind === 'fielder'` branch **returns before the
  runner loop** (an out on a relay is structurally impossible); the LAST leg
  targets the PITCHER, not the cutoff again (a self-throw arrives instantly and
  spends none of the time the relay exists for); and `relay.committed` — the
  look-back rule — is keyed on **(runner, DESTINATION)**, so the concession
  covers the one leg being run and expires on touching that bag. Keyed on the id
  alone the defence stops playing; without the rule at all the pitcher guns the
  batter down at second and the relay buys nothing. The carrier must also not
  tag-chase a conceded runner.
- **Baserunning obeys direction rules.** `reverseLeg` refuses to turn a
  batter-runner back toward the plate (mirroring `startRetreatLeg`), the CPU
  rundown rule skips FORCED runners, and `RUN2.BASE_DWELL_MS` /
  `REVERSE_COOLDOWN_MS` give each direction a real commitment so rundowns do not
  stutter. A runner at base 0 when the play ends is otherwise dropped from the
  inning by `applyLivePlay` with no out recorded.
- Fielders carry per-kid speed/glove/arm; drops, bobbles and wild throws roll off
  those stats scaled by the mode's `errorMult`s. **Kid mode is 0, and mult 0
  skips the rng roll**, so kid sims stay byte-identical.
- Landed flies and liners BOUNCE (deterministic, no rng) and hopping or rolling
  balls CAROM off the fence arc, so fence doubles are real. A hopping ball is
  grabbable only below `PICKUP_MAX_H`, never for an out.
- **Per-runner send/hold is `LiveInputs.sendRunner/holdRunner`** (tap a base
  ahead to send, behind to turn back). CPU policies for the non-human side live
  inside the sim.
- **The dive verb** (CLASSIC): a quick tap while chasing sets `LiveInputs.dive` —
  a reach burst for `diveWindowMs`. An empty dive is a fumble freeze with the
  ball live. No rng; kid mode ignores the input entirely.

## Which fielder chases — `fielding.ts`

PURE (no Phaser, no rng). A ball in the AIR goes to whoever is nearest its
landing spot; a ball on the GROUND goes to whoever can CUT IT OFF soonest, gated
twice.

- **`LIVE.CHASE.LEASH` limits candidacy to fielders whose POST is near where the
  ball SETTLES.** Without it, ranking on "who reaches it first" hands every
  grounder to the pitcher, since a grounder starts at home and P is nearest its
  early path at every spray angle.
- Then the ball belongs to whoever's zone it settles in unless another kid gets
  there `CUT_AHEAD_MS` sooner, which stops a third baseman charging across in
  front of the shortstop.
- Re-elected ONLY when the ball turns up somewhere new (via
  `LivePlayState.reelect`), behind a keep-radius, cooldown and margin, so the kid
  the player is steering never flickers.

⚠️ **`CUT_AHEAD_MS` is a fixed-ms gate over quantities that scale as
1/fielderSpeed, so it can never be speed-neutral.** `electChaser` compares
against BALL-PATH times: slow the fielders and every interception moves later
along the path, so the gaps between candidates inflate while the gate does not —
it gets relatively cheaper to clear and the zone owner gets poached more often.
Left where it is deliberately; restoring the old override rate needs a value
above `defense.chaserElection`'s own `upperBound`, and that bound was derived at
the old fielder speed so it must be re-derived before the constant moves. The
record's old "stable across both fielder speeds" claim is corrected: it held over
a 1.6× spread and is not general.

## Geometry

`geometry.ts` holds the field screen coords shared by sim and scene.
**The diamond is glued to the foul lines**: bases lie ON the `FOUL_SLOPE` line
from home, and each venue's foul-pole x derives from its fence y via
`foulPoleXAt`, so the drawn lines pass exactly through 1B and 3B in every venue.
Never reintroduce fixed pole x constants or move a base off the slope, and keep
every `FIELD_POSITIONS` spot inside the fair cone for ALL venues — a
geometry-sanity test in `liveplay.test.ts` enforces both.

**The fence arc must bulge AWAY from home (`fenceBulge ≥ 0`).** `fenceYAtX` being
convex in x is what keeps `clampToField`'s convex-region argument valid —
`moveToward` between two in-bounds points can never exit, and a caromed ball
always reflects back into the field. A concave fence breaks containment
silently; a convexity property test in `venue.test.ts` enforces it.

⚠️ **Size-coupled tunables** (`RUNNER_SPEED`, `FIELDER_SPEED`,
`CPU_RUNNER_GREED_DIST`, `RUN2.CPU_PANIC_DIST`, `RUNNER_TWEEN_MS`) are scaled to
the basepath length. Rescale them if the diamond changes size.

## Speed, and the constant that had no record

**`LIVE.FIELDER_RUN_RATIO` is 1.0 — fielders and runners are the same kids.**
`FIELDER_SPEED` once ran at 2.48× `RUNNER_SPEED`, so the slowest fielder outran
the fastest baserunner; it survived five consecutive runner slowdowns and a
retune that scaled *both* and preserved the ratio exactly. **Nothing caught it
because it was the one pace constant with no `measures.json` record and no
conformance pin.** `defense.fielderSpeed` now pins all of it.

**An invariant a test enforces: `cpuFielderSpeedMult` must equal
`playerRunSpeedMult` in every mode.** That is what holds the ratio on the side
the human bats, and a stray value in one mode silently cancelling a bad base is
exactly what it exists to catch.

⚠️ This did NOT make base hits possible on its own — see
`defense.fielderSpeed.notSufficient`, and note the CLASSIC/KID throw-speed gap in
`defense.throwSpeed`.

## Modes, difficulty and features

`mode.ts` merges `config.LIVE` × `MODES[mode].live` × the tier's `fielding` block
into `LiveParams` via `resolveLiveParams(mode, overrides, difficulty)`.

- **Read the assist off `LiveParams` in the sim, never straight from
  `LIVE.ASSIST`**, or the difficulty tier silently stops applying.
- Two invariants: the magnet must stay a lerp of two ≤`step` candidates (pure
  redirection, never a speed boost — a test pins the cap), and
  `assistIdleSpeedMult` must stay < 1 at every tier, because the amble is only
  fair while it stays worse than steering.
- **Difficulty is deliberately NOT a `FeatureOverrides` field**: that interface
  can only DISABLE a mechanic, and a tier scales a value. Scenes read the tier
  via `getDifficulty()`, never `getSettings().difficulty` — only the former
  reconciles the stored label against the authoritative `recess_mode`.
- `getFeatures`/`resolveLiveParams` take an optional `FeatureOverrides` that can
  only DISABLE a mode's features, so the all-true default is a no-op and the
  seeded stream is unaffected.

## The rest of the pure layer

`atbat` (timing→band, `resolveContact` / `resolveContactAimed` → `buildLaunch`)
· `pitch` and `pitchkind` (bands, the pitch corridor, `flightProgress`'s pure
time remap) · `inning` (count/outs/bases + `applyLivePlay` + `applySteal`) ·
`juice` · `fatigue` · `difficulty` · `lineup` (`autoAssign`, shared by scene, CPU
and relief swaps) · `stats` · `awards` · `album` · `season` · `team` ·
`settings` · `venue` · `picklog` (the voting machine) · `steal` · `gameflow` ·
`replay` (pure position SNAPSHOTS, never input re-simulation) · `crowd` (the
recess stream-out, rng injected at create only) · `audio` · `voices` ·
`announcer` · `chatter`.

`geometry.ts` is shared by sim and renderer, but **never import `art/projection`
from here** — the sim and all tests stay in flat logical space; only the
render/input membrane projects.

## ⚠️ SpeechSynthesis is quirky

`audio.ts` wraps it and scenes must go through `audio.say`/`audio.cancelSpeech`
or the queue state desyncs. **Never call `speechSynthesis` directly.**

- `getVoices()` populates ASYNC — `audio.ts` re-caches on `voiceschanged`, and
  the curated `rankVoices` ranking is cached with it and recomputed then;
  `unlock()` warms the cache on the first gesture.
- Chrome drops an utterance spoken synchronously right after `cancel()`, so the
  `flush` path defers one tick. Chrome also sometimes never fires `onend`, so the
  queue has a duration watchdog and cannot wedge.
- **Speaker distinctness has two different mechanisms on two different
  browsers**, and neither works alone: some voices ignore the `pitch` param
  entirely, so distinctness there comes from landing on different curated voices
  via the gendered sublists; other browsers ship no gender-marked voices at all,
  so distinctness comes from the `GENDER_PITCH` bands on the mixed list.
  SpeechSynthesis has no gender API — `voices.ts` partitions by name regex.
- **Speech volume is NOT governed by `AUDIO.masterVolume`** — use `VOICE.VOLUME`.
