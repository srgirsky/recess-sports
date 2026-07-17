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
- **Short games.** Two innings. Fast to start, fast to finish, easy to replay.
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

`Boot → Title → Draft → Game → Result → (replay) Title`. Phaser scenes are like pages; state is handed forward as plain objects (`{playerTeam, aiTeam}` into Game; `{scores, playerTeam}` into Result). Global pick data goes to `localStorage`, not scene data.

- **Boot** — generates all 30 SVG character textures once, shows a loading bar, hands off to Title.
- **Title** — logo, bobbing lineup, PLAY (unlocks audio), mute toggle, dev pick-rate overlay (press D).
- **Draft** — 30 cards; player and AI alternate picks to 9 each; every player pick is logged.
- **Game** — the interactive pitch-and-swing loop plus all the juice (below).
- **Result** — win/lose, team MVP, confetti + voice, rematch.

### The golden rule: pure logic vs. view

Everything tricky lives in `src/systems/` as **pure functions with no Phaser imports** — the same discipline as separating service functions from views in a web app:

- `draft.ts` — draft state, strict alternation, and a greedy AI value function (grabs the highest-value kid left, so leaving a stud on the board costs you).
- `atbat.ts` — the heart. **Timing is the skill, stats are the flavor.** Swing error → a band (Perfect/Good/Weak/Miss); within a band, the batter's stats set the odds (contact forgives sloppy timing; power buys extra bases; speed steals hits). Ability hooks apply here.
- `inning.ts` — count/outs/bases state machine + auto-baserunning. `applyAtBat` returns the new state **and** a `movements` list (each runner's from→to base) so the scene can animate baserunning driven by the real rules — the animation can never disagree with the base state.
- `picklog.ts` — the voting machine: `localStorage` tally + rate readout.

Scenes call these reducers and animate the result. This is why the logic is unit-tested (`logic.test.ts`) while the scenes aren't — the bugs live in the rules, and the rules are isolated.

### Character art pipeline

No image files. `art/CharacterArt.ts` hand-draws each kid as a **modern flat-mascot SVG string** — bold consistent outline, soft cell-shading (a derived darker shade, no gradients), rounded proportions, and real expressions — from `VisualParams`: `skin` / `hair` / `hairColor` / `uniform` / `accessory` plus personality knobs `expression` (happy/grin/cool/determined/goofy/surprised), `bodyType` (normal/chunky/small), and `freckles`. Hair styles include short/curly/ponytail/buzz/mohawk/bald/afro/pigtails/spiky/bun/long. `art/textureFactory.ts` base64-encodes the SVG into a data URI and loads it as a Phaser texture (rendered at 3× the viewBox for crispness) keyed by the character id. 30 distinct kids come from curated combinations plus bespoke touches (the wheelchair). Generated once in Boot, reused everywhere. `art.test.ts` asserts every roster kid yields valid, undefined-free SVG. Dev tool: press **G** on the Title for an all-30 art gallery.

### Feel & juice

- **Tunables** in `config.ts`: `TIMING` windows, `PITCH_TRAVEL_MS`, `INNINGS`, `SHAKE`, `RUNNER_TWEEN_MS`, `SHOW_TIMING_RING`, `AUDIO`.
- **`ui/effects.ts`** — screen shake, particle burst, floating text, confetti.
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
