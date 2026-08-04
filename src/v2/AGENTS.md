# src/v2/ — AI brief

The three.js rebuild. Real feet, real seconds, real gravity. Loaded whenever you
touch a file under `src/v2/`; the root `AGENTS.md` has the v1/v2 split and the
rules that bind before you open anything. Character, rig, clip and asset rules
live one level down in `src/v2/render/AGENTS.md`.

**v1 is shipped and live.** Nothing here may import from it except through the
sharing rules below, and nothing in v1 may import from here at all.

## The fence: what the sim may import

`src/v2/sim/**` is PURE and Node-runnable. It may import only from
`src/v2/sim/**`, `src/data/**`, `src/config.ts`, and **exactly five** pure
systems: `inning` · `gameflow` · `stats` · `lineup` · `draft`. No `three`, no
DOM, no `Math.random`, no `Date.now`. That is what turns v1's browser-paste
goldlog into an ordinary vitest that CI runs and cosmetics cannot pollute.

- **The five are a fence, not a wish list.** Everything else in `src/systems/**`
  is v1's pixel domain — screen coordinates, px/s, `localStorage`, Web Audio —
  and stays available to v2's render and UI layers but not to the sim.
  `scripts/v2/purity.lint.test.js` also checks that each whitelisted module keeps
  its own promises, because naming a module "pure" is a claim.
- **A whole-statement `import type` is a separate, wider lane.** It erases at
  build and cannot carry a constant, so the sim may type-import from anywhere in
  `systems/`. A MIXED statement (`import { type A, B }`) has a value binding and
  counts as a value import.
- **Shared, never copied:** `src/data/**`, `src/config.ts`, `src/net/**`,
  `src/art/fieldTexture.ts`, and `src/ui/layoutMath.ts`'s overlap predicates.

## Randomness

- **The `Rng` is INJECTED and FORKED, never module-scope** (`sim/rng.ts`). A
  module-scope `makeRng` is a hidden global that ignores the seed the harness
  passed in, and a lint fails one.
- **`fork(label)` keys on `(root seed, label)`, never on stream position**, so
  adding, removing or reordering a draw in one substream cannot move another.
  A single global stream makes call order part of the contract; `fork` deletes
  that whole class of bug. Labels may not contain the NUL path separator —
  rejected, not discouraged, or `fork('a\0b')` and `fork('a').fork('b')` collide.
- **`normal()`/`gauss()` are deliberately absent.** Every textbook normal sampler
  needs `Math.log`, and ECMAScript specifies `log`/`exp`/`pow`/trig as
  implementation-approximated — only `+ - * /` and `Math.sqrt` are required to be
  correctly rounded, so a fingerprint built on them goes red on a V8 bump and
  reads as somebody's bug.
- **`Rng.bell()` is BOUNDED** — Irwin–Hall over three uniforms, support ±3σ.
  Size any `bell`-driven band AGAINST the window it is judged by and assert the
  relationship, not the values: a band needing 2.5σ produces the event never.

## The physical model

- **No `Math.exp`/`log`/`pow`/`**` anywhere in `src/v2/sim/**`, and no trig on
  the per-step path** (`flight.ts`, `ball.ts`, `fielders.ts`, `runners.ts` are
  the HOT list). The ban is affordable because the aero model needed no tables:
  `C_D = 0.297 + 0.0292·(ω/1000rpm)` and `C_L = 1.120·S/(0.583 + 2.333·S)` with
  `S = Rω/v` are pure `+ − × ÷` plus `Math.sqrt`, so the entire per-step force
  path is bit-stable with no interpolation machinery at all.
  Trig survives at conversion boundaries only — `launch.ts`, and
  `field.ts`'s `sprayOf`/`pointAt` — a residual risk that is confined and
  recorded, not eliminated. See `sim.aeroModel`, `sim.aeroModelLowSpeed`.
- **`FLIGHT_HZ` = 240 is not an accuracy choice.** Accuracy saturates around
  60 Hz; 240 is for PHASE (the render remainder stays exact) and for COLLISION
  SAMPLING. `sim.integratorStep`.
- **Events are BISECTED, never stepped onto.** Each bisection trial re-integrates
  from the START of the step, so a crossing is a real RK4 solution rather than a
  lerp between samples. Fixing this with step size needs >1000 Hz and is still
  approximate.
- **The bat-ball collision is an IDENTITY, not a fit.** `contact.test.ts` asserts
  Nathan's Eq. 3 symbolically. `e_A` is derived from the recoil factor, which is
  what makes a kid not a small adult — a light bat recoils more. No fudge factor
  appears anywhere. `sim.batBallCollision`, `sim.obliqueContact`.
- **The bounce model's FORM is derived; its coefficients are cited or pending.**
  An impact either GRIPS or SLIPS. Topspin ACCELERATES the ball off the bounce —
  the invariant is total ENERGY, not speed, so a speed cap is wrong. Backspin
  does not reverse a real batted ball at real spin. `sim.bounceModel`.
- **The measured pitch quantity is a TIME, not a speed.** Using the average pace
  as a RELEASE speed puts the pitch far underground at the plate, so
  `releasePitch` SOLVES speed and elevation from the flight time. Two traps: the
  crossing height is **not monotone in elevation** (a naive bisection returns a
  near-vertical lob), and the solve HIDES a wrong spin axis — a test asserts the
  break DIRECTION for that reason. `pace.pitchCorridor`.
- **The fence profile must stay CONVEX** (`sim/field.ts` `fenceIsConvex`,
  asserted per venue). Convexity is what keeps `moveToward` containment valid and
  stops a caromed ball reflecting out. Smoothstep interpolation between control
  points breaks it, and so does any profile whose deepest point is a foul pole —
  both are recorded as counterexamples in the tests.

### Two `flight.ts` contracts a bounce caller must honour

`state` and `event.state` are the SAME object — clone before mutating. And a
guard already negative at step start never fires, so a bounce must leave the ball
at `y ≥ 0` and a carom must leave it strictly INSIDE the fence, or it tunnels and
sticks. Rolling containment lives inside `rollStep`, not in the caller:
`stepFlight`'s guards only run while the ball is AIRBORNE.

## The athletes

- **There is exactly ONE kid speed, and a lint says so.** `sim/athletes.ts` has
  one function per physical quantity and every consumer calls it, so a fielder
  and a runner cannot drift apart because there is no second constant.
  `purity.lint.test.js` enforces it **textually** (only `athletes.ts` may read a
  raw band) and **functionally** (`makeFielder` and `makeRunner` must agree over
  all 30 kids AND stats 1–10 — the drift is in the SLOPE as much as the level).
  It also pins `makeFielder.accelFtS2 === makeRunner`'s, so a quicker ramp for
  one of them is exactly the drift the lint exists to catch.
  `defense.fielderSpeed` is what the alternative cost.
- **The sprint model is SOLVED from the anchor, not picked.** A leg time
  constrains a *(top speed, acceleration) pair*, so the second constraint is
  published child peak velocity and then nothing is free. Every kid takes the
  same time to get going; a faster kid ends up faster. Solving each stat against
  the same leg time would delete the stat.
- **A fielder's reach is a CAPSULE, not a sphere** — cylindrical below chest
  height, spherical above. A sphere centred on the chest gives a ball ON THE
  GROUND almost no horizontal reach, and the symptom is every routine grounder
  becoming a chase to the wall while the election insists the shortstop cut it
  off. He did; he could not bend over. The ceiling replaces a timing constant
  standing in for a geometry fact. Two constraints pin the radius from both
  sides and it holds with nothing to spare: it must be at least
  `FIELD_MARGIN − BOUNCE.BALL_SETTLE_MARGIN_FT` (which `bounce.test.ts` has
  asserted since before the catch existed) and below a kid's own height.
- **An arm has a RANGE, so the relay is a consequence rather than a mechanic.**
  `throwFlightSec` solves the flat projectile root in closed form —
  `t = (2v/g)·√((1 − √(1 − k²))/2)`, `k = Rg/v²`, no trig — and
  returns **null** when the arm cannot reach. It is a VACUUM solve while the ball
  is integrated with drag, so it is an upper bound and the relay is if anything
  under-triggered. `sim.throwSpeed` — one unmeasured number now setting four
  different rates, ruled fixed so it cannot be tuned to an outcome.

## The play

`sim/play.ts` steps ball → (re-elect) → fielders → grab → (re-elect) → throw →
runners → carrier-touches-bags → CPU running → termination. **That order is v1's
and is load-bearing** — re-run the election BEFORE anyone moves, so the handover
costs no ground. Do not restructure it.

- **The ball is ONE function.** `traceLooseBall` is a loop over
  `stepLooseBallFull` and the reducer calls it once a tick, so "where is it
  going" and "where did it go" are the same code rather than two that agree. It
  **consumes the remainder** an event leaves; advancing a full `dt` past a
  crossing makes the resting place tick-rate dependent.
- **A GROUNDER is a ball that never rises above a glove**, not one whose phase
  says `flight` — a ball skipping through the infield is airborne between hops.
  Three fixes and only their conjunction is safe: split the regimes on
  `trace.apexFt`, emit `land` on the FIRST touch only, and re-read on a TIMER as
  well as on events (a grounder raises exactly one event).
- **The chaser election must include the READ** — add each kid's remaining
  `readyAtSec` to their travel time — and must rank on the fielder's OWN speed
  via `sprintTimeForFt`, not re-derived from the stat. **And it must know a
  running kid is running** (`fromFts`), or every re-read charges a fresh standing
  start and the shortstop will not charge. `defense.chaserElection`,
  `sim.chaserElectionGate`.
- **Candidacy and range are different questions.** `electChaser` admits a fielder
  by settle-key OR by intercept-near-post — a strictly additional door, so
  nothing that qualified stops qualifying. Keep the settle key; it is what stops
  the pitcher poaching everything. `sim.chaserLeash`, `sim.firstStep`.
- **A dive must be a LAST RESORT, or every catch is one.** A descending fly
  passes through the diving envelope on its way into the standing one, so the
  gate is that the gap must be OPENING. Diving whenever the ball is outside
  standing reach costs no outs, which is exactly why it would have survived.
- **`isFair` is asked at first touchdown AND at the fence** — a ball hooked over
  the pole is a foul, not a home run. The rule is deliberately the SHORT version.
  `sim.foulBalls`.
- **The relay is a consequence and the look-back rule is NOT ported.** Three
  invariants do carry over: `ThrowTarget` stays a discriminated union, the
  `kind: 'fielder'` branch **returns before the runner loop**, and the leg count
  is capped. `sim.cutoffRelay`.
- **`PlayOutcome` IS v1's `LiveOutcome`, structurally**, so a v2 play folds into
  a v1 half-inning with no adapter. `play.ts` must NOT value-import `inning` —
  the fold-back is the game layer's job.
- **A caught fly retires the batter however long it hung**, and that cannot be
  said positionally: a batter-runner who has touched first is no longer at base
  0. `PlayState.batterId` is the identity. `sim.tagUp`.
- **The reducer must not re-read the ball by RE-TRACING it** — the trajectory
  does not change between ticks, only the fielders move.
- **A play clock that fires is a soft-lock.** `play.test.ts` sweeps plays and
  requires ZERO reach the cap. Three guards in `play.ts` are honestly labelled
  belt-and-braces because deleting them breaks no test.

### Baserunning

- **The runner asks a RACE, not a distance.** `worthTaking` compares the runner's
  leg against `ballSecTo`, which counts the relay — a distance cannot see that
  the kid holding the ball has an arm that will not reach. That, plus
  `maybeRoundBag` (the only leg starting without the dwell, because the decision
  is made at full speed several strides out), is what makes a gap ball a DOUBLE.
- **`startLeg` has no occupancy check and must not.** It is handed one runner and
  cannot see the traffic, so the guard lives in `play.ts`'s `send`. Without it
  two runners settle on one base, which does not read as a baserunning bug — it
  reads as a runner VANISHING, because `finishPlay` writes one `baseIds` entry.
- **Two v1 bugs are pinned deterministically** (`defense.fielderSpeed.exposed`).
  `reverseLeg` refuses `from <= 0`, or a batter turned toward home is re-sent the
  instant he touches first. And a straggler settles on **`min(from, to)`**,
  because `reverseLeg` SWAPS the pair — the 1–3 clamp masks this at the plate, so
  the test uses mid-diamond.

## The plate

- **The strike zone is the rulebook's, in feet.** Derived: plate width plus a
  ball each side, knees-to-letters as FRACTIONS of the batter's height, so a
  taller kid has a taller zone. And `isStrike` asks the **trajectory** — the real
  crossing — so a curve that breaks out of the zone is a ball *because it broke*.
- **The batter has ONE faculty, not two.** `plateJudgementFt` and
  `swingTimingSigmaFrac` are the same misjudgement in space and time. He swings
  when he BELIEVES it is a strike, so chases, takes and whiffs are all
  consequences. **There is no chase rate and no whiff rate anywhere.** The
  temporal half is a FRACTION of the flight, never ms (`pace.swingWindows`).
- **A CLAMP is not a miss.** Clamping the undercut into the bat-ball centre
  separation records every swing past it as hit perfectly straight up or down.
  Every TOTAL stayed plausible and only a DISTRIBUTION could see it. Past that
  separation the swing is a MISS. `sim.contactGeometry`.
- **The swing has a PLANE.** The undercut is exactly zero-mean by construction,
  so without `BAT.ATTACK_ANGLE_DEG` every kid swings dead level and no total or
  median can see it — report a MEAN, the one statistic that reads 0 when there is
  no plane. It is NOT the pitch's descent angle, and it is measured PERPENDICULAR
  TO THE BAT'S PATH, so it ADDS to the line-of-centres angle. `sim.swingPlane`.
- **The strikeout rate is load-bearing.** The plate targets ALONE are
  under-determined — they admit solutions that wreck the product — so strikeouts,
  fouls and pitches/PA are balanced against out conversion, not against the plate
  alone. A target written after a sweep is a description; `sim.retuneTargets` is
  dated before the run for that reason.
- **A steal is a RACE, not a roll** — runner's leg against pitch flight plus
  catcher read plus release plus `throwFlightSec`. From a standing start ON the
  bag it is degenerate, so `RUN.LEAD_FT` is load-bearing and unmeasured. v1's
  bonus for slow stuff is EMERGENT (the catcher cannot start until the ball
  reaches him), which is why `PitchResult.travelSec` is on EVERY branch. **A
  threshold cannot decline a free steal** — against half the roster's catchers
  the margin is infinite — so the limit is situational, not a confidence gate.
  `sim.stealRace`.

## The human

`PlayInputs` and `HumanSwing` are wired, not decorative. Gates assert BEHAVIOUR
(a different fielder path, a different outcome), because "wired but inert" is the
failure mode, and a lint fails an underscored input parameter.

- **There is no throw meter and no pitch meter, because there is no power.**
  Flight comes from `throwFlightSec(from, to, carrier.arm)` and the arm is a
  measured quantity, so a meter would be overriding a fact. The
  human verb is **choosing the bag**, and out of range still means out of range.
  Pitching is likewise **choosing** — a `PitchPlan` replaces `choosePitch` and
  NOTHING else, so execution error stays downstream and a player cannot out-throw
  his own kid's arm. `sim.humanPitch`, `sim.throwSpeed`.
- **Aim is a HEIGHT, not a point.** `contact.ts` derives spray from
  `timingErrorSec` — pulling it is what being EARLY MEANS — so a lateral aim term
  would be a second, independent source for the same quantity. A lint asserts
  `HumanSwing` carries no lateral field. The aim tolerance is NOT tunable: it is
  the distance at which a bat and a ball stop overlapping. Timing, by contrast,
  is generous and is a fraction by construction. `sim.humanSwing`.
- **A human supplies the model's own two error terms** and two CPU rules
  deliberately do not apply to him: the undercut-from-judge conversion (his
  pointer IS the placement, so scaling it would model a person as guessing at his
  own intention) and two-strike protection (not tapping IS the take).
  `swing.test.ts` shows each constant moves the CPU's outcomes and not the
  human's — the second half is what stops the first being vacuous.
- **A send overrides judgement, never traffic**, and the verb only bites on a
  ball in the AIR. `sendRunner` skips `worthTaking`; `send` keeps `baseIsOpen`. A
  forced runner cannot be held. On a grounder the CPU already sends everyone, so
  a human send is a no-op there — test the verb on a catchable fly. A transient
  shared bag is LEGAL; the invariant is that no two runners are SETTLED on one
  base, home excluded. `sim.runnerSends`.
- **The human needs a SIDE, or the tap verbs collide** — the same tap on a base
  means THROW THERE when fielding and SEND HIM THERE when batting.
- **No fielding assist**, and that is measured rather than assumed: a
  perpendicular mis-steer catches nothing and finishes far adrift, while perfect
  aim fields exactly as well as the CPU. ⚠️ The number to worry about is the
  TOLERANCE, which falls off a cliff because three feet IS the reach. If an
  assist is ever added it is sized from that table, never from v1's.
  `sim.fieldingInput`, `defense.fieldingAssist`.

## The game loop

`simulateGame` is four nested synchronous loops, and `simulateGameLive` yields
while `simulateGame` drains it — **one implementation, so the headless run and
the live view cannot drift.** The gate is OUTPUT IDENTITY: the same seed must
produce a byte-identical `GameResult`, because every record rests on it.

- **The game loop does not restate v1's rules.** `inning.applyAtBat` owns the
  count and the walk, `gameflow.decideAfterHalf` owns extras, `stats.foldStats`
  owns what an at-bat is. Three seams bite and each has a test: `applyLivePlay`
  **drops `baseIds`** (take run identities off the events BEFORE folding);
  `decideAfterHalf` takes **away then home** while `shouldSkipBottom`/`isWalkOff`
  take **home then away**; and `shouldSkipBottom` must be asked **after** the top
  half, or the game skips the visitors' final at-bats.
- **The pitch is YIELDED before it is RESOLVED**, or the view animates a ball
  whose fate is already settled and nobody can bat. `throwPitch`/`resolvePitch`
  split at the seam the model already had. Splitting it cannot move a draw —
  `fork` keys on the label, not position — and the golden fingerprints prove that
  rather than assert it.
- **⚠️ The SAME `LiveFrame` is yielded every tick, mutated in place — read it and
  drop it, NEVER retain it.** Collect frames in an array and you hold N
  references to one object carrying the last tick's state: no error, no red test,
  every field a plausible value. A sweep of 5,000 frames asking for the peak ball
  count answers 0. Fold as you iterate, or copy the fields you want.
- **`LiveFrame` has a `windup` phase** because a choice must be collected before
  the thing it decides; without it a player chooses pitch N during pitch N−1's
  flight. It cannot hang — the view throws for you.
- **The view must hold the pitch PAST the crossing** (`SWING_TAIL_SEC`), or the
  latest expressible swing is exactly on time and the whole late half of the
  window is unreachable by construction. Any test of swing timing must sweep BOTH
  signs; a one-sided sweep passes for the broken build.

## Measuring

`src/v2/sim/harness.ts` is the PURE aggregator — it plays nothing, it is FED by
an optional `onEvent` observer. Counters and histograms only.

- **A harness that only pins is a ratchet, not a gate.** Published youth data
  starts well above this age, and borrowing MLB's numbers is THE failure the
  `reference` field exists to prevent — so most records MEASURE, PIN, and say
  what would close them. What is asserted outright needs no band: internal
  consistency, **ordering**, and shape.
- **An ordering test must control for the roster.** Selecting a lineup BY a stat
  varies every other stat with it. Inject the stat through `GameSpec.lookup` —
  same kids, same seeds, one variable.
- **The gate sweep must break a tuning constant and confirm the pins fire**, or
  the whole thing is a report generator. `sim.harnessMethod` lists what it cannot
  see. Two traps in `scripts/v2/harness.mjs`, both recorded: every game gets its
  own root seed, and the roster ROTATES.
- **A field nobody reads is a field nobody can trust**, and a cut-boundary test
  can be tautological — the record must carry the numbers.

## Where the numbers live

`src/v2/sim/params.ts` holds the tunables in FEET and SECONDS, deliberately not
`src/config.ts`, which is a pixel world — a number here can be checked against a
tape measure or a paper. Provenance goes in `scripts/measures.json`, whose rules
are in `scripts/AGENTS.md`; cite the record id rather than the value.

## The screens

`/v2/` is the game — title, draft, play, result — and `App.ts` owns that order.
`?play=1`, `?spike=1` and `?anims=1` stay reachable as review surfaces.

- **Never tear the world down to show a screen.** The canvas is always the game
  and a screen is DOM over it, so the title shows the real park and PLAY AGAIN
  costs one generator, not a model reload. There is no Boot.
- **`#hud` and `#screens` have OPPOSITE pointer rules** — the HUD is
  `pointer-events: none` so taps reach the field; a screen is modal. Two
  elements, never one with a mode flag.
- **A game runs behind the title**, so anything reacting to the sim must ask
  whether a screen is up — an end-of-game that fires behind one is ignored, or a
  Result appears for a game nobody played.
- **A control is `.interactive`**: one class opts it into pointer events AND
  applies the `--tap-min` floor, so tappable and big-enough cannot diverge.
- **★ Only a PERSON'S draft pick votes** (`ui/draftSession.ts`; `picklog.ts` is
  shared with v1 so the tally is continuous). A counted CPU pick looks like
  nothing and poisons the one dataset the game exists to gather.
- **A portrait is an `<img>`, never inline SVG** (`ui/portrait.ts`):
  `CharacterArt` names its gradients by id, so thirty inlined kids silently all
  wear the first kid's shirt.

## The render membrane

`src/v2/render/**` reads sim state and never writes it, through the single
coupling point `render/bridge.ts`. Rules for that side are in
`src/v2/render/AGENTS.md`. One thing the sim side must get right:
`chooseCamera` has to actually be told the contact phase, or the hard cut is
unreachable while looking wired.

⚠️ **rAF is throttled when the window is backgrounded**, so `/v2/?play=1` appears
frozen mid-pitch with NO console error. Drive it by hand with `__spike.tick(t)`
and a monotonically increasing `t` — the same rule `.claude/skills/verify` gives
for v1's Phaser clock.

`src/v2/game/GameView.ts` pumps the sim's own generator against a real clock
with a **fixed-step accumulator, never the render delta**
(`scripts/simclock.lint.test.js` exists because a tempo scalar once broke a
measured pace record while every test stayed green).

## Where things live

| File | What it owns |
|---|---|
| `src/v2/sim/params.ts` | the tunables, in feet and seconds |
| `src/v2/sim/ball.ts` | the published ball and the two aero coefficients |
| `src/v2/sim/flight.ts` | RK4 + bisected events — it integrates and REPORTS, it never decides what an event means |
| `src/v2/sim/launch.ts` | the one place an authored ANGLE becomes a vector, which is why trig lives here |
| `src/v2/sim/bounce.ts` | what a crossing MEANS, plus the one loose-ball tick |
| `src/v2/sim/athletes.ts` | where a 1-10 stat becomes a physical quantity |
| `src/v2/sim/field.ts` | venue geometry, the convex fence, `isFair` |
| `src/v2/sim/play.ts` | the play reducer |
| `src/v2/sim/atbat.ts` | one pitch in two acts: `throwPitch` and `resolvePitch` |
| `src/v2/sim/game.ts` | plate appearance -> half -> inning -> game, headless |
| `src/v2/sim/lineup.ts` | `planDefence`, with each position's arm weight DERIVED from the throw it must make |
| `src/v2/sim/harness.ts` | the pure aggregator — it plays nothing, it is fed |
| `src/v2/game/GameView.ts` | the game: the field, the verbs, the pump. `/v2/?play=1` |
