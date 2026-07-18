# Recess Sports — Overview

The deep-context doc: what we're making, why, and how it's put together. For the quick AI on-ramp see `../CLAUDE.md`; for run/build/deploy see `../README.md`.

---

## The product

**A free web baseball game for little kids** (ages 4–8, centered on 6). You draft a team of 9 from 30 neighborhood characters, then play a short pitch-and-swing game against a CPU team.

### The real thesis: the characters are the product

The game is free because **its job isn't to make money — it's to tell us which of the 30 kids people love.** Every time a player drafts a character, that pick is tallied. Pick rates are a voting machine: whoever wins gets the toy, the shorts, the show, the sequel. The classic kids' baseball games found their breakout character by accident; we're building the instrument that finds them on purpose.

Two consequences for every design decision:
1. The **draft** is the most important screen — it's where the vote happens. Characters must be distinct and lovable at a glance.
2. Pick logging is a **first-class feature**, not an analytics afterthought. (Today it's `localStorage`; a cross-player backend is the obvious next step.)

### Design pillars (ages 4–8)

- **Minimal reading.** Icons, color, and voice over text. A 6-year-old who can't read should be able to play.
- **Icon/voice-forward.** Stats shown as bars/pips; callouts spoken; feedback is visual (pops, shakes, runners).
- **Short games.** Two innings (plus at most one bonus inning on a tie). Fast to start, fast to finish, easy to replay.
- **Forgiving but skillful.** Timing is the skill (see below); stats add character flavor; the timing windows are wide enough for little kids and tunable in `config.ts`.

### Roadmap

- **Phase 1 (now):** 30 kids on a diamond. Draft → play → result. Collect pick data. *This is what exists.*
- **Phase 2:** Turn the pick-rate winners into toys/shows; a real backend to aggregate votes across all players; more characters, richer art, sound.
- **Phase 3:** The wild stuff — e.g. drafting a T-rex. Deliberately held back so Phase 1 lands as "a real baseball game," not a novelty.

---

## The 30 characters

Defined in `src/data/characters.ts` (pure content — edit freely). Each has stats (contact/power/speed/pitching, 1–10), a look (`VisualParams`), and an optional `ability`. Three signature kids are implemented via **ability hooks** so they're data-driven, not special-cased in scene code:

- **Junebug** — `never_strikes_out`: a miss becomes weak contact; she literally never whiffs.
- **Big Talk Theo** — `calls_shot`: a confident "HOME RUN, CALLED IT!" bubble every at-bat (always wrong; pure flavor, no mechanical effect).
- **Zoom Ramirez** — `unhittable_pitch`: as a pitcher, drags the batter's timing band down a notch; nearly unhittable (in a wheelchair, drawn as a special-case in the art).

The other 27 span archetypes (sluggers, speedsters, all-rounders, pitchers, weak-but-cute) so the draft has real trade-offs — passing on a stud lets the AI grab it.

---

## Architecture

### Scene flow

`Boot → Schoolyard → Game → Result → (replay) Schoolyard`. Phaser scenes are like pages; state is handed forward as plain objects (`{playerTeam, aiTeam}` into Game; `{scores, playerTeam}` into Result). Global pick data goes to `localStorage`, not scene data.

- **Boot** — generates all 30 kids × 4 poses (120 SVG textures) once, shows a loading bar, hands off to the Schoolyard.
- **Schoolyard** — title screen and draft in ONE continuous world. Title beat: the brick school wears the RECESS SPORTS banner; the blacktop below has chalk four-square/hopscotch and two team pennants; a pulsing PLAY 🔔 button (unlocks audio). Press it and **recess begins**: the school bell rings, the double doors burst open, and all 30 kids stream out (real two-frame run cycles + ground shadows) through the gate and line up against the playground wall in two rows. The draft happens right there, sandlot style: tap a kid → they step forward, their name is spoken, and a stat card pops (portrait, tagline, icon-labeled stat bars, big PICK ✓); PICK → the kid *runs across the yard* to your pennant. The CPU visibly wanders a "?" spotlight across the wall before its pick walks to the other side. Waiting kids bob and occasionally hop ("pick me!"). Every player pick is logged to the voting machine. When both teams have 9, everyone cheers (arms-up pose) in a wave with confetti, then it's off to the game. Cutscene is tap-to-skip. Dev overlays: D pick rates, G art gallery (P poses, A animate). Replays from the Result screen skip the title beat (`straightToDraft`).
- **Game** — BOTH halves are interactive with the same one-button timing input: you bat the top of each inning (swing when the ring closes) and **pitch the bottom** (throw when the mound ring closes; a good throw drags the CPU batter's swing band down, a wild one is usually a ball). **Every ball in play becomes a LIVE PLAY** — a real-time race stepped by the `liveplay.ts` sim: the defending team's nine kids stand at real positions; on defense the nearest fielder glows gold and chases your pointer (catch a fly = out; grab a grounder, then press near a base and hold to charge a throw — or run the ball to the bag yourself); on offense your runners advance one base per tap ("everybody GO!") while the CPU fields, and stretching into a throw gets you thrown out. Force-outs and fly-outs only (playground rules: ball beats you to the bag = out; caught fly = batter out, runners walk back free). Home runs are detected at launch and keep the classic celebration. Walks, walk-offs, skipped pointless bottom halves, and one bonus inning on a tie. An **EASY/HARD toggle** on the Schoolyard title (persisted per-browser) scales CPU speed/reaction/accuracy and the player's grab radius. All the juice (below) on a full ballpark backdrop (gradient sky, sun/clouds, a crowd in the stands, an outfield wall with bunting, mowing-striped grass, a manicured dirt infield, mound, and home plate) drawn procedurally in `GameScene.drawField()`.
- **Result** — win/lose, team MVP, confetti + voice, rematch.

### The golden rule: pure logic vs. view

Everything tricky lives in `src/systems/` as **pure functions with no Phaser imports** — the same discipline as separating service functions from views in a web app:

- `draft.ts` — draft state, strict alternation, and a greedy AI value function (grabs the highest-value kid left, so leaving a stud on the board costs you).
- `atbat.ts` — **Timing is the skill, stats shape the launch.** Swing error → a band (Perfect/Good/Weak/Miss); `resolveContact` turns a contact band into a **trajectory** (grounder/liner/fly, landing spot, hang time) instead of a pre-rolled hit/out — power/contact push the ball deeper, and only over-the-fence homers are decided here. Whether anything else is a hit or an out now *emerges* from the live play. Ability hooks apply to the band.
- `liveplay.ts` — **the live-play sim.** A tick-based reducer (`startLivePlay`/`stepLivePlay`/`finishLivePlay`) the scene steps every frame with the player's inputs (pointer steer, charge-and-release throws, "everybody GO!" taps). Ball flight/roll, one chased fielder, base-covering receivers, runner legs, force races, CPU policies for whichever side the human isn't playing, plus no-soft-lock guards (auto-throw, a hard play-length cap). Emits per-tick events the scene turns into juice.
- `geometry.ts` — the field's screen-space coordinates (bases, mound, the 9 fielding spots, fence line) shared by the sim and the renderer so they can never disagree.
- `difficulty.ts` — the persisted EASY/HARD setting and `resolveLiveParams`, which merges `config.LIVE` with the `config.DIFFICULTY` multipliers into the flat params object the sim consumes.
- `pitch.ts` — the mirror of `atbat.ts` for the defense half. Throw error → a pitch band (Perfect/Good/Weak/**Wild**); a strong arm forgives sloppy timing; pitch quality shifts the CPU batter's swing band (perfect = harder to hit, wild = usually taken for a ball). Also rolls the AI's occasional wild pitch at the player — the red "don't swing!" telegraph.
- `inning.ts` — count/outs/bases state machine, including **balls and walks** (forced runners only; a bases-loaded walk scores). `applyAtBat` returns the new state **and** a `movements` list (each runner's from→to base) for walks/homers; `applyLivePlay` folds a finished live play's outs/runs/bases back in (live plays animate themselves in real time, so `movements` is empty).
- `gameflow.ts` — game-level sequencing between halves: skip a pointless bottom (home CPU already leads after the top of the final inning), end instantly on a walk-off, grant one bonus inning on a tie.
- `picklog.ts` — the voting machine: `localStorage` tally + rate readout.

Scenes call these reducers and animate the result. This is why the logic is unit-tested (`logic.test.ts`) while the scenes aren't — the bugs live in the rules, and the rules are isolated.

### Character art pipeline

No image files. `art/CharacterArt.ts` hand-draws each kid as a **modern flat-mascot SVG string** — bold consistent outline, soft cell-shading (a derived darker shade, no gradients), rounded proportions, and real expressions — from `VisualParams`: `skin` / `hair` / `hairColor` / `uniform` / `accessory` plus personality knobs `expression` (happy/grin/cool/determined/goofy/surprised), `bodyType` (normal/chunky/small), and `freckles`. Hair styles include short/curly/ponytail/buzz/mohawk/bald/afro/pigtails/spiky/bun/long. **Each kid renders in four poses**: `stand` (front, with real baseball pants/socks/sneakers, forearms, torso shading), `run1`/`run2` (a side-view two-frame run cycle drawn facing right — sprites flipX for leftward travel; limbs are double-stroked "capsule" paths so knees/elbows come free; the wheelchair ace gets an athletic side push pose), and `cheer` (arms up). Side poses use the classic small-sprite **¾ cheat** — the front-view head rides the side-view body, tilted toward travel — so all 11 hairstyles and 6 expressions are reused verbatim. Every pose bottoms out on the same ground line so texture swaps never make feet pop. `art/textureFactory.ts` base64-encodes each SVG into a data URI and loads it as a Phaser texture (3× viewBox) keyed by `poseKey(id, pose)` (`id`, `id:run1`, …) — 120 textures, ~0.5s at boot. `art.test.ts` asserts every kid × pose yields valid, undefined-free SVG. Dev tool: press **G** on the Schoolyard for the gallery; **P** cycles poses, **A** live-animates the run cycle.

### Feel & juice

- **Tunables** in `config.ts`: `TIMING` + `PITCH_TIMING` windows, `PITCH_TRAVEL_MS` + the pitch-meter timings, `INNINGS` + `MAX_EXTRA_INNINGS`, `WILD_PITCH_CHANCE`, `SHAKE`, `RUNNER_TWEEN_MS`, `SHOW_TIMING_RING`, `AUDIO`, plus the live-play block: `LIVE` (launch distribution, fielder/runner/throw speeds, grab radii, throw-meter and play-length caps) and `DIFFICULTY` (the EASY/HARD multiplier table).
- **`ui/theme.ts`** — the shared UI kit that makes every screen match: the brand font (self-hosted Fredoka), the mascot outline color, and `panel()`/`ribbon()`/`pill()`/`heading()` helpers for rounded, outlined, drop-shadowed chrome. Buttons and draft cards are built on it; the font is awaited in Boot before the Title shows.
- **`ui/effects.ts`** — screen shake, particle burst, floating text, confetti.
- **`ui/anim.ts`** — character animation helpers: pose-texture animation (`runCycle` flips run1/run2 frames), `groundShadow`, plus procedural tweens (idle "breathing" bob, celebratory squash-hop, pop-in, `enterFrom` staggered reveals, `pulse` attention loops). In-game: a swinging **bat** prop, a pitcher **wind-up**, CPU batters **jog to the plate**, and baserunners are the **actual kids** sprinting the bases with real leg cycles, ground shadows, and direction-aware flips. Scene transitions use quick camera fades. Timing lives in `config.ANIM`.
- **`systems/audio.ts`** — free, code-synthesized sound: Web Audio SFX (bat crack, whiff, pop, cheer, pitch woosh) + browser SpeechSynthesis voice callouts + a persisted mute. No files, no cost.
- In-game juice: a contracting **timing ring** teaches when to swing; band feedback (PERFECT!/GOOD!/…); contact pop + shake scaled to hit size; the hit ball arcs to the outfield; runners actually run the bases and cross home with a burst.

---

## Key design decisions (and why)

- **Phaser + web, not a native engine** — free, instantly playable via a link, no app store, fast iteration. Matches "free game for kids."
- **SVG art generated in code** — zero asset cost, infinitely editable, crisp at any size; a stand-in until/if real art is commissioned.
- **Pure-function game logic** — testable, reasoning-friendly, and it lets a first-time-gamedev developer separate "my rules are wrong" from "my animation is wrong."
- **Free static hosting (GitHub Pages)** — no server, no running cost; the one place that eventually needs a backend (aggregating pick votes across players) is deliberately deferred.

## What's explicitly not built yet

Real recorded audio, a cross-player pick-rate backend, more characters/richer art, and the Phase 3 dinosaurs.
