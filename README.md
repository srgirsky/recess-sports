# Recess Sports ⚾

A free web baseball game for little kids. You draft 9 of 30 neighborhood
characters, then play a short pitch-and-swing game. **The characters are the
product** — every player draft pick is tallied (the "voting machine"), so pick
rates tell us which kids to turn into toys and shows.

Built with **Phaser 3 + TypeScript + Vite**. It's a static site — no server, no
database, free to host. All state (including pick tallies) lives in the browser
for now; a real cross-player backend comes later.

**🎮 Play it:** https://srgirsky.github.io/recess-sports/

> New here? `AGENTS.md` is the quick architecture on-ramp (shared by every AI coding tool; `CLAUDE.md` symlinks to it),
> and `docs/OVERVIEW.md` has the full product + design context. This README is the
> hands-on run/build/deploy guide.

---

## Running it

```bash
npm install       # once
npm run dev       # dev server with hot reload -> http://localhost:5173
```

Open the URL in a browser. Edit a file and it reloads instantly (like Django's
runserver, but faster).

### Two games, one dev server

The repo builds **two entry points**, and the same `npm run dev` serves both:

| URL | what |
|---|---|
| `http://localhost:5173/` | **v1** — the shipped Phaser game. Live, stable. |
| `http://localhost:5173/v2/` | **v2** — the three.js rebuild, in progress. |

v2 currently boots the **Look Spike** (the 3D park + proxy characters, for
judging the art direction). Useful query flags:

| flag | effect |
|---|---|
| `?anims=1` | the **Animation Spike** — review every clip (see below) |
| `?kids=18` | force the worst-case character count for a perf read |
| `?perf=low\|mid\|high` | override the auto-detected device tier |
| `?proxy=1` | force primitive proxy characters everywhere |

Keys on the spike page: `1`–`5` switch camera preset, `V` cycles venue.

### Reviewing animation — `/v2/?anims=1`

The acceptance surface for `docs/v2/animation-brief.md`. Three of that brief's
four acceptance criteria are things you have to *watch*, so they need somewhere
to be watched: it plays any of the 35 clips on a proxy character, at 0.6×, 1.0×
or 1.4×, flashes the frame a clip's marker lands on, renders the same character
in a real **40 px** viewport (that is criterion 4, literally), and prints a
computed **loop-seam** error — a seam that is merely nearly closed pops once per
stride and gets blamed on the playback rate instead.

Keys: `←`/`→` or space step through clips, `1`–`3` set the rate, `R` replays.
Clips marked `▫` are procedural stand-ins; `▪` means a delivered clip.

Until the commissioned library arrives every clip is a crude stand-in generated
in `src/v2/render/proceduralClips.ts` — correct about timing and contract,
deliberately not about look. A real delivery replaces them **clip by clip**, so
the animator's pilot batch is reviewable the day it lands.

The on-screen readout shows fps, p95 frame time, draw calls and triangles
against the budget (≤90 draws, ≤180k tris). **Read it with the tab focused** —
a backgrounded tab throttles the animation loop and the numbers go meaningless.

**Test on a phone/tablet** (your real audience — swing timing feels different
with a finger than a mouse):

```bash
npm run dev -- --host   # prints a LAN URL you can open on a device on the same wifi
```

> ⚠️ Note: web games pause when their browser tab is in the **background**
> (the browser stops the animation loop). Keep the game tab in the foreground
> while playing — this is normal browser behavior, not a bug.

## Testing the logic

The tricky game rules (draft, at-bat, innings) live in pure functions with no
Phaser, so they're unit-tested headlessly:

```bash
npm test
```

## Checking a 3D asset delivery (v2)

Character models and the animation library are commissioned against a strict
contract (`docs/v2/asset-contract.md`, `docs/v2/animation-brief.md`). The
validator is the first line of acceptance — rejections are automatic and free,
and a file that passes is accepted:

```bash
npm run export:skeleton    # emit assets/v2/skeleton_recess_v1.glb from skeleton.ts
npm run validate:models    # check every .glb in assets/v2/
npm run validate:models path/to/anims_recess_v1.glb   # or one file
VERBOSE=1 npm run validate:models                     # also print measurements
```

### Seeing what the v2 ball does

```bash
npm run sim:trajectory     # carry tables, printed next to the fences to clear
```

Headless, no art, no graphics — just the integrator. It prints the MLB-scale
validation first (a well-struck 100 mph / 30° ball must carry about 400 ft; if
that is wrong, every kid-scale number below it is wrong in the same direction),
then carry by exit velocity × launch angle, then how much exit velocity each
venue's fence actually demands, then fly hang as a ratio to the measured
home→1B anchor. Needs Node ≥ 22.6, like the other v2 scripts.

It checks bone names/order/bind pose, the height band, root motion, the 30 fps
grid, loop seams, body travel and marker frames, plus LOD budgets, material
slots and file size on characters. Every failure names the rule *and* why the
rule exists.

> The CLI needs **Node ≥ 22.6** — it imports the contract straight from
> TypeScript so the rules have exactly one home. CI runs the identical rules
> through vitest (`scripts/v2/validate-models.test.js`), so `npm test` covers it
> on any Node.

The rig is **generated, never hand-edited**: re-run `export:skeleton` after any
change to `src/v2/render/skeleton.ts`, or a test fails telling you to.

### Where the files go

| directory | job |
|---|---|
| `assets/v2/` | the artist's copy and the **validation inbox** — the rig they work from, and where a delivery is dropped to be checked |
| `public/v2/models/` | what actually **ships**: only files that have passed the gate get moved here |

Those are two deliberate acts. `validate:models` scans both.

### Shipping a delivery

```bash
cp kid_junebug.glb assets/v2/        # 1. into the inbox
npm run validate:models              # 2. gate it (and eyeball the normals — see the contract)
mv assets/v2/kid_junebug.glb public/v2/models/   # 3. ship it
npm run manifest:models              # 4. tell the runtime it exists
```

Step 4 is not optional: the manifest is what the page fetches to know which
characters have models. A `.glb` in the directory without a manifest entry never
loads and renders as a proxy forever, silently. A test fails if they drift.

### Playing before the art exists

Nothing waits on the modeller. Stand-in characters are generated from the
primitive proxies, in the real delivery format:

```bash
npm run export:proxy-kid           # a representative five
npm run export:proxy-kid -- all    # the whole roster (~8MB, not committed)
npm run export:proxy-kid -- moose sprout
```

Five are committed so a fresh clone has something to load. Compare models
against proxies at `/v2/` with the 🎨 MODELS button, or `?proxy=1` to force
proxies everywhere.

### After bumping `three`

The Draco and KTX2 decoders are committed under `public/v2/decoders/` because
they are fetched by URL at runtime, where no bundler can follow them:

```bash
npm run sync:decoders
```

`npm test` fails if they drift from the installed `three`.

## Checking the layout

Every menu screen is a fixed 960×640 absolute layout, and pills size themselves
to their *rendered* text — so a label change or a platform's wider emoji can push
two controls into each other. This boots every screen headlessly and fails if any
two pieces of chrome overlap, leave the frame, collide in tap-area, or end up too
small to tap:

```bash
npx playwright install chromium   # once
npm run audit:layout
```

It sweeps the content that actually causes trouble (all three venues, every
difficulty, the longest of the 56 team names, all five Result variants) in both
the Fredoka and font-blocked states. Deliberate exceptions live in
`scripts/layout-audit.json` with a written reason. It also runs in CI
(`.github/workflows/ci.yml`) on every pull request.

While playing locally, **press `L` on any menu screen** for the same check as an
overlay: chrome boxes in green, tap targets in blue, collisions flashing red.

## Building & deploying (free)

```bash
npm run build     # type-checks, then outputs a static site to dist/
npm run preview   # serve the built site locally to double-check
```

**Deployment is automatic via GitHub Pages.** A GitHub Actions workflow
(`.github/workflows/deploy.yml`) builds and publishes on every push to `main`:

```bash
git add -A && git commit -m "your message"
git push          # → Actions builds + deploys to https://srgirsky.github.io/recess-sports/
```

First-load caching: Pages/CDN can take a minute to reflect a push, and browsers
cache hard — hard-refresh (Cmd/Ctrl+Shift+R) if you don't see a change. Because
it's pure static files, there's nothing to provision and no running cost.

Two-device play (🔗 FRIEND on the title) also needs **no backend and no keys**:
it connects browsers directly over WebRTC using the free public PeerJS cloud
broker, so the deploy stays exactly this simple.

---

## How it's organized

```
src/
  main.ts            Phaser game setup + scene list (the "urls.py")
  config.ts          ★ ALL the tuning knobs: swing windows, innings, shake, audio
  scenes/            The "pages": Boot → Title → Draft → Game → Result
  data/
    types.ts         Character/Stats/... type definitions
    characters.ts    ★ The 30 kids (content — edit freely)
  art/               Draws each kid as flat-vector SVG (no image files)
  systems/           ★ Pure game logic (no Phaser) — draft, at-bat, innings, picklog
    audio.ts         Free code-synthesized SFX + voice (uses Web Audio / SpeechSynthesis)
    logic.test.ts    Headless tests for the pure logic
  ui/                Button, CharacterCard, MuteButton, effects (juice helpers)
  net/               Two-device play: pure wire protocol + the PeerJS session
  dev/               Dev-only pick-rate overlay
  v2/                ★ The three.js rebuild (separate game, /v2/)
    sim/             Pure, Node-runnable physics + field, in real feet
    render/          three.js layer — skeleton, proxy characters, clips, camera
    spike/           Review pages: LookSpike (art), AnimSpike (animation)
assets/v2/           Generated + delivered 3D assets (the rig, later the models)
scripts/v2/          The asset gates: glb read/write, exporter, validator, lints
```

★ = the files you'll most likely want to edit. (Architecture rationale: `docs/OVERVIEW.md`.)

## Handy things to know

- **Tune the feel** in `src/config.ts` — `TIMING` controls how forgiving the
  swing is (widen for younger kids), `PITCH_TRAVEL_MS` the pitch speed,
  `INNINGS` the game length, `SHAKE`/`RUNNER_TWEEN_MS`/`AUDIO` the juice.
- **Add/rebalance kids** in `src/data/characters.ts`. Stats are 1–10. The three
  signature kids use `ability` hooks (`never_strikes_out`, `calls_shot`,
  `unhittable_pitch`); everyone else is `none`.
- **Sound is free & code-generated** (no audio files) — SFX via Web Audio, voice
  via the browser. A 🔊/🔇 toggle (persisted) sits on Title/Game/Result.
- **See the "voting machine"**: on the title screen (dev mode only) press **D**
  to see which kids you've drafted most; **R** resets the tally.

## What's next

- A real backend to aggregate pick rates across all players
- More characters, richer art, recorded audio
- Online-play polish: remote steal-reaction taps, guest relief, rematch
- Eventually… the dinosaurs 🦖
