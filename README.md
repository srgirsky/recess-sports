# Recess Sports ⚾

A free web baseball game for little kids. You draft 9 of 30 neighborhood
characters, then play a short pitch-and-swing game. **The characters are the
product** — every player draft pick is tallied (the "voting machine"), so pick
rates tell us which kids to turn into toys and shows.

Built with **Phaser 3 + TypeScript + Vite**. It's a static site — no server, no
database, free to host. All state (including pick tallies) lives in the browser
for now; a real cross-player backend comes later.

**🎮 Play it:** https://srgirsky.github.io/recess-sports/

> New here? `CLAUDE.md` is the quick architecture on-ramp (great for AI tools too),
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
