# BB2001 local capture — segment map and play index

Source: `~/Desktop/bb01-capture-session1.mkv`, captured 2026-07-23.
3024×1964, FFV1 lossless, 60fps container, 925.033s.
Companion screenshots: `~/Desktop/scummvm-baseball2001-{00000..00011}.png`.

Everything here is reproducible from `scripts/measure/` — nothing was read off by
eye that a function could derive. The numbers are mirrored into
`scripts/measures.json`, which is the machine-readable record and the thing
`scripts/measure/conformance.test.js` enforces.

## The capture is a recording of a screen, not of a game

The emulator window occupies **1920×1440 at (552, 266)** — **46.55%** of the
frame. That fraction is not trivia; it broke the play index (see below). Located
with `detectGameRect`, which takes the bounding box of the largest inter-frame
change at a known hard cut. Deliberately *not* "find the non-black region": the
surround here is desktop wallpaper, not letterbox.

Every read of this file goes through `crop=1920:1440:552:266`, so nothing
outside the emulator window is ever decoded.

## Segment map — derived from pixel structure, not content

| | Range | Duration | Blit score |
|---|---|---|---|
| **game** | 0:00 → 7:32 | 452s | 0.989–1.000 |
| other | 7:32 → 10:40 | 188s | 0.054–0.195 |
| **game** | 10:40 → 15:25 | 285s | 0.989–1.000 |

463 samples at 2s spacing, no ambiguous ones, and no overlap between the two
classes. **737s of game material.**

`gameSegments` decides this from structure alone. ScummVM blits 640×480 at an
integer factor, so inside its window every group of 3 consecutive rows is
pixel-identical; native desktop content is not. It never needs to know what a
frame depicts. Two details that make it trustworthy rather than merely clever:

- **Rows, not columns.** The capture is `yuv422p`, which subsamples chroma
  *horizontally*. The 2-pixel chroma window doesn't align with a 3-pixel block,
  so column triples break at boundaries. Vertical resolution is untouched by
  4:2:2, so row triples survive the round trip exactly.
- **Only varying samples count.** A flat region passes the row-triple test
  trivially, so a solid-colour desktop window would score a perfect 1.0. Samples
  with no vertical variation contribute no evidence in either direction, and a
  frame with too few of them is reported `unknown` rather than guessed.

Measurement is confined to the two game runs.

## Play index

**34 cuts → 15 wide segments → 14 live plays.**

BB2001 cuts *instantly* from the behind-plate view to the wide field view when a
ball is put in play, so a scene-cut list is a play index. Each cut-delimited
segment is then labelled plate/wide by median colour in two bottom-of-frame
regions — the behind-plate HUD strip paints `#004100` there, and every wide-field
venue paints something else (calibrated against screenshots 00007/00008 for
plate, 00001/00003/00009 for wide).

| # | Start (s) | Wide-segment duration |
|---|---|---|
| 0 | 24.100 | 1.97 |
| 1 | 33.867 | 6.95 |
| 2 | 79.133 | 5.20 |
| 3 | 93.300 | 18.68 |
| 4 | 120.067 | 10.00 |
| 5 | 161.400 | 10.85 |
| 6 | 194.200 | 6.30 |
| 7 | 220.250 | 3.33 |
| 8 | 742.800 | 9.40 |
| 9 | 759.867 | 13.35 |
| 10 | 781.383 | 9.40 |
| 11 | 799.450 | 15.90 |
| 12 | 828.417 | 20.12 |
| 13 | 855.700 | 16.32 |

Every play in this capture is on the **backyard-grass venue** (pool, shed, red
roof) — the same venue as screenshots 00009–00011, which is why those
screenshots' base coordinates transfer directly into video measurements.

Non-play material: one long plate-view stretch at 223.6→451.3 (a 228s pause),
and short dimmed segments at 40.8, 130.1 and 658.5 that read as menu/reset.

### ⚠️ The index was broken, and it failed silently

An uncropped run at the default 0.3 threshold found **5 cuts in 450 seconds**.

ffmpeg's `scene` metric is **frame-global**. With the game covering 46.55% of the
frame, a full hard cut scores ~0.45 instead of ~1.0, so a 0.3 threshold demands
more than twice a real cut. Only the two strongest cuts in the entire capture
cleared it. Cropping to the game rect first recovered **6.8× more cuts**.

Measured, once cropped: real cuts score **0.72–0.81**, ordinary play **~0.03**.
The 0.25 threshold now used sits in a wide empty valley rather than being
guessed.

This is worth remembering because a broken index looks exactly like a capture
with no plays in it.

## Precision floor: 50ms, not 16.7ms

The 60fps container carries only **~20 distinct fps** (`dupFactor` 2.7–3.3,
`medianRunLength` 2–3), corroborated by the inter-frame delta cadence during a
live play, which steps in a clean +50ms grid.

So every timestamp carries **±50ms**. A ~3000ms run is ±1.7% (fine); a ~250ms
pitch flight is ±20% and needs n≥5 to average down. This is *worse* than the
YouTube source's ~33ms — and recording at 60fps is the only reason we know. Had
the capture been made at the assumed rate, the duplication would have been
invisible and every derived constant would have inherited a 3× overstatement of
precision.

## What the screenshots turned out to be

`bb2001-capture-setup.md` predicted ScummVM's screenshot key would write the raw
640×480 framebuffer. It writes the scaled **window** (2984×1712, game area
1920×1440 at (532,136)).

The conclusion survives: the blit is an **exact 3× nearest-neighbour upscale**,
so decimating the 3×3 blocks recovers the framebuffer bit-for-bit and **colour is
exact**. Measured across all 12 screenshots: 99.59–99.96% of blocks perfectly
uniform, the remainder being ScummVM's OSD toast and the mouse cursor, both drawn
at native resolution *over* the scaled game — so both must be masked out of any
sample region. `readScreenshot` verifies the blit on every read and **throws** if
it isn't exact, because a filtered source returns plausible blended colours and
looks no different.

Useful frames: **00001** blacktop wide · **00003** dirt-infield backyard wide ·
**00007/00008** behind-plate rig (swing cards, SQUARED toggle, full HUD strip) ·
**00009–00011** backyard-grass wide (the video's venue) · **00000** the Player
Finder roster screen.

## Where the pace pass stands

Not done. What now exists that didn't before: a reproducible index of 14 live
plays with exact start frames, the venue's base positions in the same coordinate
space, and a measured precision floor.

What blocks it is recorded as `pace.measurementTrap` in `measures.json` and is
worth repeating here: **detecting "the runner reached 1B" from a change-fraction
spike in a box on the bag does not work.** BB2001 plays canned fielder animations
at the bag, and they are deterministic — six different plays produced change
series agreeing to the millisecond (`1.187:0.07  1.287:0.07  1.337:0.08
1.387:0.12 …`). A naive threshold reads six identical "arrivals" and would have
yielded a home→1B time with a suspiciously tight spread and therefore a *high*
derived confidence. The tell was the impossible precision: six unrelated plays
cannot agree to 1ms.

Runner arrival has to be separated from scripted animation by magnitude *and* by
the runner's track along the baseline, or read frame-by-frame off a zoomed
corridor sheet at the true 50ms period (`contactSheet` with `crop` + `stepFrames`
does this). Either way it is per-play work, not a threshold sweep.

### The measurement attempt, and why session1 can't finish the pace pass

Attempted all three pace metrics on the 14 plays (2026-07-23). Every one hit a
real footage confound — recorded in full as `pace.captureConfounds` in
`measures.json`, summarised here:

- **home→1B — lane overlap.** In the backyard-grass venue (the *only* venue any
  local play is on), the 1B foul line points into right-center, and every ball
  this session went to right/center. So the runner's home→1B lane is drawn on top
  of the ball-and-fielder action; a baseline frontier-tracker locks onto the
  right fielder near 1B, not the runner. Clean anchor samples need the ball to
  *left* field or an infield single.
- **between-pitch — deliberation, not turnaround.** The plate segments are long,
  but the gaps between actual pitches are 5–12s of player deliberation over the
  pitch cards. `FLOW.BETWEEN_PITCH_MS` models the forced ~1.3s catch→ready sliver,
  which is invisible in the pitch cadence and readable only per-pitch.
- **fly hang — few clean flies.** The short right porch turns most contact into
  grounders rolling to the fence (play-01 is the type case), not arcing pop-ups.

**Play classification (from the sheets):** grounder to RF, runner safe — play-02
(79.1), play-04 (120.1); grounder to the fence — play-01 (33.9); quick out (~2s,
too short for a full run) — play-00 (24.1); defensive throw / steal — play-06
(194.2, steal pad + throw arrow); long plays not yet classified — play-03 (93.3),
play-11 (799.5), play-12 (828.4), play-13 (855.7).

**The clean path** is a short targeted re-capture — exactly what
`bb2001-capture-setup.md` step 7 already prescribes: a handful of home→1B
run-outs with the ball poked to *left* field or an infield single, and deliberate
pop-ups shallow→deep, each shot name said aloud. Per-play frame reading of
session1's cluttered plays can scrape a few low-confidence samples but can't reach
the shot list's n=6.
