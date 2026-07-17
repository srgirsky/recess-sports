# Recess Sports ⚾

A free web baseball game for little kids. You draft 9 of 30 neighborhood
characters, then play a short pitch-and-swing game. **The characters are the
product** — every player draft pick is tallied (the "voting machine"), so pick
rates tell us which kids to turn into toys and shows.

Built with **Phaser 3 + TypeScript + Vite**. It's a static site — no server, no
database, free to host. All state (including pick tallies) lives in the browser
for now; a real cross-player backend comes later.

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

**Deploy to Cloudflare Pages or Netlify (free):**

1. `git init`, commit, and push to a GitHub repo.
2. In Cloudflare Pages (or Netlify): "Create project" → connect the repo.
3. Set **Build command:** `npm run build` and **Output directory:** `dist`.
4. Every `git push` auto-builds and deploys to a free `*.pages.dev` URL.

Because it's pure static files, there's nothing to provision and no running cost.

---

## How it's organized

```
src/
  main.ts            Phaser game setup + scene list (the "urls.py")
  config.ts          ★ ALL the tuning knobs: swing windows, innings, colors
  scenes/            The "pages": Boot → Title → Draft → Game → Result
  data/
    types.ts         Character/Stats/... type definitions
    characters.ts    ★ The 30 kids (content — edit freely)
  art/               Draws each kid as flat-vector SVG (no image files)
  systems/           ★ Pure game logic (no Phaser) — draft, at-bat, innings, picklog
    logic.test.ts    Headless tests for the above
  ui/                Reusable Button + CharacterCard
  dev/               Dev-only pick-rate overlay
```

★ = the files you'll most likely want to edit.

## Handy things to know

- **Tune the feel** in `src/config.ts` — `TIMING` controls how forgiving the
  swing is (widen for younger kids), `PITCH_TRAVEL_MS` the pitch speed,
  `INNINGS` the game length.
- **Add/rebalance kids** in `src/data/characters.ts`. Stats are 1–10. The three
  signature kids use `ability` hooks (`never_strikes_out`, `calls_shot`,
  `unhittable_pitch`); everyone else is `none`.
- **See the "voting machine"**: on the title screen (dev mode only) press **D**
  to see which kids you've drafted most; **R** resets the tally.

## What's next (not in this first slice)

- Sound + kid-friendly voice callouts
- A real backend to aggregate pick rates across all players
- More characters, richer art, and — eventually — the dinosaurs 🦖
