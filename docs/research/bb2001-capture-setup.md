# BB2001 capture setup — the measurement rig

How to get frame-accurate, pixel-exact reference data out of Backyard Baseball 2001 on macOS, so we can measure it instead of guessing.

**Why bother:** every "Backyard feel" number in `src/config.ts` was tuned against remembered impressions, and the one reference we wrote down was wrong (see `backyard-2001-video-notes.md` — the basepath was never measured, so home→1B was ~40% too fast for years). Video gets us pace; only a local copy gets us exact color, exact geometry, and — the real prize — **repeatable situations**.

## What you need

| | |
|---|---|
| **Game** | Backyard Baseball '01 — Steam app `3104970` (~$10) |
| **Runner** | ScummVM 2.9.0+ |
| **Capture** | `ffmpeg` (already installed) |

**Why the Steam version is a valid reference:** the July 2025 re-release (Mega Cat Studios / Playground Productions) ships the original game — reporting is explicit that the source code was untouched. It is not a remaster with retuned pacing, so its timing and art are the genuine 2001 artifact.

**Why ScummVM is required:** the Steam build is Windows-only and the original 32-bit code cannot run natively on modern macOS even wrapped. ScummVM 2.9.0+ runs the Steam data files directly, and it's Mac-native.

## Step 1 — Get the game files onto the Mac

Steam won't show a Windows-only title's files on macOS, so pull the depot with `steamcmd`, forcing the platform:

```bash
brew install --cask steamcmd

steamcmd \
  +@sSteamCmdForcePlatformType windows \
  +force_install_dir ~/bb01 \
  +login YOUR_STEAM_USERNAME \
  +app_update 3104970 validate \
  +quit
```

`force_install_dir` must come **before** `+login` or it's ignored.

### Verify it's the real thing before building on it

```bash
find ~/bb01 -iname "*.he0" -o -iname "*.he1" -o -iname "*.HE*" | head
```

**Expect `.he0` / `.he1` files** — the original Humongous SCUMM data. If you see those, we have the genuine 2001 assets and everything downstream is exact. If instead it's all modern engine assets (Unity bundles, `.pak`, etc.), stop and tell me: the re-release would be a reimplementation, its timings wouldn't be authoritative, and we'd fall back to the YouTube path for pace.

## Step 2 — ScummVM, configured for measurement

```bash
brew install --cask scummvm
```

Add the game (point it at `~/bb01`), then in **Game Options → Graphics** set:

| Setting | Value | Why |
|---|---|---|
| Graphics mode | **1x** (no scaler) | Any scaler resamples pixels and destroys color measurement |
| Filtering / linear | **OFF** | Smoothing blends adjacent colors — fatal for palette sampling |
| Aspect ratio correction | **OFF** | 640×480 is already 4:3; correction would stretch geometry |
| Fullscreen | **OFF** | A windowed, known-size target is easier to capture and crop |
| Render mode | Default | |

Known quirk with Steam files: you may need the debug console to reach the game — `Ctrl+Alt+D`, then type `room 37`, Enter.

## Step 3 — Two capture paths (this split matters)

Use the right instrument per data type. Mixing them up is how you get plausible-but-wrong colors.

### 3a. Color, geometry, sprite proportions → **ScummVM's screenshot key**

ScummVM writes the **raw 640×480 framebuffer** straight to PNG, bypassing all display scaling. That's pixel-exact by construction — no Retina upscaling, no compositor smoothing, no codec. This is the only trustworthy source for palette values.

Default hotkey is `Alt+S` (check/rebind under Keymaps). Screenshots land in your ScummVM screenshot path.

Capture, unoccluded and paused where possible:
- **Wide field** — the full diamond, all four bases, rubber and plate visible, no sprites covering a bag. From **≥2 different venues**.
- **Behind-plate** — batter, pitcher, catcher and the HUD strip all visible.
- **Sprite reference** — a kid standing still, full-body, ideally against flat background.

### 3b. Timing → **lossless screen capture**

Display scaling doesn't matter here; we only need *frames*. Find your screen device index, then record:

```bash
ffmpeg -f avfoundation -list_devices true -i ""      # note the "Capture screen" index

ffmpeg -f avfoundation -capture_cursor 0 -framerate 60 \
       -i "SCREEN_INDEX:none" \
       -c:v ffv1 -level 3 -g 1 ~/bb01-capture.mkv
```

**Use `ffv1` (lossless), never H.264.** Inter-frame compression invents intermediate frames and smears exactly the fast motion we're timing.

`-framerate 60` oversamples deliberately: the game likely renders below that, and the duplicate frames let the pipeline *detect* the true render rate rather than assume it. A 60fps capture of a 15fps-rendering game is mostly duplicates, and that gap has to be visible, not silently halving our precision.

## Step 4 — The situation checklist

The whole point of a local copy: **produce these on demand** instead of scrubbing 47 minutes hoping they occur. Aim for **6 instances of each** of the top items — n=1 is what got us into this mess.

Say the shot name out loud while recording, or pause between takes; either gives me a marker to find in the capture.

**Priority — these unblock the fixes:**
1. **Home → 1B ×6.** Ordinary ground ball, batter runs it out. Note each kid's speed rating. *This is the anchor every other measurement is a ratio against.*
2. **Fly balls ×6, deliberately spanning shallow → deep.** Pop-up to the infield, bloop to shallow outfield, medium, deep, warning track, off the fence. *Fixes our worst known defect — flies currently hang 42–106% too long relative to the run.*
3. **Line drives ×3.**

**Secondary:**
4. Outfielder sprinting to a ball, clean start and stop ×4.
5. **Catcher throwing to 2B on a steal ×5** — best throw measurement available, because both endpoints are bases (no geometry needed).
6. Balls where the CPU fields and throws ×4 — for reaction and throw-delay timing.
7. Ground balls that roll and settle ×3.
8. **Pitches ×8 spanning the arm range** — weakest pitcher to strongest. Note each pitcher's PT rating.
9. A few normal pitch→pitch cycles with no action, for the between-pitch beat.

**Art:**
10. A kid running in a straight line, several seconds, so the run-cycle frame count is countable.

## Step 5 — Hand it over

Tell me where the `.mkv` and the screenshot folder are. Everything after that is mine: `scripts/measure/` ingests them, detects events by frame-differencing, converts to our units, and lands the numbers in a conformance test so they can't silently drift again.

## Sanity check before a long session

Record ~10 seconds, then:

```bash
ffprobe -v error -select_streams v:0 \
        -show_entries stream=width,height,r_frame_rate,pix_fmt \
        -of default=nw=1 ~/bb01-capture.mkv
```

And confirm a ScummVM screenshot has **flat, un-dithered color** in a large grass area — open it, zoom in, and check adjacent pixels are byte-identical rather than subtly graded. Gradation means filtering is still on somewhere, and every color number we take would be wrong.

---

**Sources:** [Backyard Baseball '01 on Steam](https://store.steampowered.com/app/3104970/Backyard_Baseball_01/) · [Variety — re-release announcement](https://variety.com/2025/gaming/news/backyard-baseball-01-remake-release-july-1236440503/) · [ScummVM downloads](https://www.scummvm.org/en/downloads/) · [ScummVM BB2001 compatibility](https://www.scummvm.org/compatibility/1.4.0/scumm:baseball2001/)
