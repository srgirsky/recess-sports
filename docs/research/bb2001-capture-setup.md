# BB2001 capture — the walkthrough

Getting frame-accurate, pixel-exact reference data out of Backyard Baseball 2001 on macOS. **You do steps 1–7 (~30 min, once). I do everything after.**

## Why we're doing it this way

Every "Backyard feel" number in `src/config.ts` was tuned against remembered impressions, and the one reference written down was wrong — the notes claimed a 234px basepath when it's actually 179.6px, which left home→1B ~40% faster than the game we were copying.

We tried measuring off YouTube instead. It half-works: it gave us the geometry result (BB uses true perspective — see `backyard-2001-video-notes.md`), but it fell down for pace because **the notes' timestamps no longer map to the stream**, so finding plays means blind-scrubbing 47 minutes. And video colour is unusable regardless (4:2:0 chroma subsampling).

Local capture fixes both. The decisive advantage isn't quality — it's that **situations become repeatable**. The shot list needs 6 fly balls spanning shallow→deep. From video you scrub and hope. Here, you just hit six.

---

## Step 1 — Get the game

**Backyard Baseball '01 on Steam, app `3104970` (~$10).**

Worth knowing it's a valid reference and not a remaster: the July 2025 re-release (Mega Cat Studios / Playground Productions) ships the original game with the source untouched, so its timing and art are the genuine 2001 artifact.

## Step 2 — Get the files onto the Mac

The Steam build is Windows-only — the original 32-bit code can't run natively on modern macOS even wrapped. Pull the depot with `steamcmd`, forcing the platform:

```bash
brew install --cask steamcmd

steamcmd \
  +@sSteamCmdForcePlatformType windows \
  +force_install_dir ~/bb01 \
  +login YOUR_STEAM_USERNAME \
  +app_update 3104970 validate \
  +quit
```

⚠️ `force_install_dir` must come **before** `+login`, or it's silently ignored.

**Sanity check** — confirm you got the original Humongous data files:

```bash
find ~/bb01 -iname "*.he0" -o -iname "*.he1" | head
```

You want `.he0` / `.he1`. If instead it's Unity bundles or `.pak`, stop and tell me — that would be a reimplementation whose timings aren't authoritative.

## Step 3 — Install ScummVM

```bash
brew install --cask scummvm
```

ScummVM 2.9.0+ runs the Steam data files natively on macOS. Launch it → **Add Game** → point at `~/bb01` (wherever the `.he0` lives).

Known quirk with Steam files: if the game won't start, open the debug console with `Ctrl+Alt+D`, type `room 37`, Enter.

## Step 4 — Configure ScummVM for measurement

This matters more than it looks. **Game Options → Graphics**:

| Setting | Value | Why |
|---|---|---|
| Graphics mode | **1x** (no scaler) | Any scaler resamples pixels and destroys colour measurement |
| Filtering / linear | **OFF** | Smoothing blends adjacent colours — fatal for palette sampling |
| Aspect ratio correction | **OFF** | 640×480 is already 4:3; correction would stretch the geometry |
| Fullscreen | ON is fine | Only the video cares, and scaling doesn't affect timing |

## Step 5 — Verify the settings actually took

Before recording anything long: take one in-game screenshot (**Alt+S** by default — check Keymaps), then zoom hard into a big patch of grass and confirm adjacent pixels are **identical**, not subtly graded.

Gradation means a filter is still on somewhere and every colour we take would be wrong. Two minutes here saves redoing the session. Send it to me if you'd rather I check.

## Step 6 — Two capture paths (don't mix them up)

This split is the one thing to get right. Measured empirically: pushing a known flat `#5abe5a` through a *lossless* video clip reads back as `(88,189,89)` — off by 2, purely from YUV↔RGB conversion. **Video cannot carry exact colour, even losslessly encoded.**

**6a. Colour, geometry, sprite proportions → ScummVM's screenshot key.**

> ⚠️ **Corrected after the first real session (2026-07-23).** This guide used to
> claim ScummVM writes the raw 640×480 framebuffer, bypassing display scaling.
> **It doesn't** — it writes the scaled *window* (2984×1712 in that session, game
> area 1920×1440 at offset (532,136)).
>
> The conclusion survives, for a different reason: the blit is an **exact 3×
> nearest-neighbour upscale**, so every source pixel became an identical 3×3
> block and decimating them recovers the framebuffer bit-for-bit. Colour is still
> pixel-exact. Measured across 12 screenshots: 99.59–99.96% of blocks perfectly
> uniform, the rest being ScummVM's OSD toast and the mouse cursor — both drawn
> at *native* resolution over the scaled game, so both must be masked out of any
> sample region.
>
> `scripts/measure/screenshot.js` `readScreenshot()` does all of this and
> **throws** if the blit isn't exact. That refusal is the point: a filtered
> source returns plausible blended colours and looks no different from a good
> one, so it has to fail loudly or it will quietly poison the palette records.

Capture:
- **Wide field** — full diamond, all four bases, rubber and plate visible, ideally with fielders *not* standing on the bags. From **2 different venues**.
- **Behind-plate** — batter, pitcher, catcher, HUD strip.
- **A kid standing still**, full body, for sprite proportions.

**6b. Timing → lossless screen recording.**

```bash
# find your screen's device index first
ffmpeg -f avfoundation -list_devices true -i ""

# then record (substitute the index)
ffmpeg -f avfoundation -capture_cursor 0 -framerate 60 \
       -i "SCREEN_INDEX:none" \
       -c:v ffv1 -level 3 -g 1 ~/bb01-capture.mkv
```

**Use `ffv1`, never H.264** — interframe compression invents intermediate frames and smears exactly the fast motion we're timing.

`-framerate 60` oversamples on purpose: the game likely renders slower, and the duplicate frames let the pipeline *detect* the true render rate instead of assuming it. macOS will ask for Screen Recording permission for your terminal the first time.

## Step 7 — Play the shot list

The payoff: **produce these deliberately** instead of hoping they occur. Aim for **6 of each** of the top three — n=1 is what caused the original mistake.

Play naturally and work through the list. No need to be precious about it: I can find the plays automatically (`findCuts` detects the hard cut from pitching view to wide view, which marks every ball put in play). Saying the shot name out loud while recording makes indexing even easier.

**Priority — these unblock the actual fix:**
1. **Home → 1B ×6.** Ordinary grounder, run it out. Note each kid's speed rating if visible. *This is the anchor every other number is a ratio against.*
2. **Fly balls ×6, deliberately shallow → deep.** Infield pop-up, bloop, medium, deep, warning track, off the fence. *Fixes our worst known defect — our flies hang 42–106% too long relative to the run.*
3. **Line drives ×3.**

**Secondary:**
4. Outfielder sprinting to a ball, clean start and stop ×4.
5. **Catcher throwing to 2B on a steal ×5** — the best throw measurement available, since both endpoints are bases (needs no geometry).
6. Balls the CPU fields and throws ×4 — reaction and throw-delay timing.
7. Grounders that roll and settle ×3.
8. **Pitches ×8** spanning weakest → strongest pitcher. Note each pitcher's PT rating.
9. A few ordinary pitch→pitch cycles with no action, for the between-pitch beat.
10. A kid running in a straight line for several seconds, so the run-cycle frame count is countable.

## Step 8 — Hand it over

Tell me where the `.mkv` and screenshots are. From there it's mine.

```bash
node --input-type=module -e "
import {probe, distinctFrameRate, detectGameRect, gameSegments, findCuts} from './scripts/measure/video.js';
const f = process.env.HOME + '/bb01-capture.mkv';
console.log('source:', probe(f));

// 1. Where is the emulator window? A screen capture is mostly NOT the game.
const rect = detectGameRect(f, {atSec: /* a timestamp with a view cut */ 40});
console.log('game rect:', rect);

// 2. Which stretches are the game at all? Structure only, no content read.
console.log('segments:', gameSegments(f, {rect}).segments);

// 3. The real precision floor, and the play index — both cropped to the rect.
console.log('true rate:', distinctFrameRate(f, {startSec: 60}));
console.log('plays:', findCuts(f, {crop: rect, scale: 4, threshold: 0.25}).cuts);
"
```

Then I measure each event, convert via the ratio math, and land the numbers in
`scripts/measures.json` behind `scripts/measure/conformance.test.js` so they
can't silently drift again.

### Two things the first real session taught, the hard way

**Crop to the game rect before anything.** ffmpeg's `scene` metric is
frame-global. The emulator window covered 46.55% of that capture, so every hard
cut scored ~0.45 instead of ~1.0 and the default 0.3 threshold found **5 cuts in
450 seconds** of footage full of plays. Cropping first recovered 6.8× more. A
broken index looks exactly like a capture with no plays in it — there is no error
to notice.

**Don't believe the container frame rate.** That 60fps file carried ~20 *distinct*
fps, so the real quantisation is ±50ms, not ±16.7ms. Oversampling is what made
this detectable at all; `distinctFrameRate` is what makes it visible. Timing
against the container rate would have claimed 3× the precision that exists and
every derived constant would have inherited it.

---

**Sources:** [Backyard Baseball '01 on Steam](https://store.steampowered.com/app/3104970/Backyard_Baseball_01/) · [Variety — re-release announcement](https://variety.com/2025/gaming/news/backyard-baseball-01-remake-release-july-1236440503/) · [ScummVM downloads](https://www.scummvm.org/en/downloads/) · [ScummVM BB2001 compatibility](https://www.scummvm.org/compatibility/1.4.0/scumm:baseball2001/)
