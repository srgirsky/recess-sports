# BB2001 local capture — segment map and play index

Two sessions now exist. **[Session 2](#session-2--the-targeted-re-capture) is the
one the pace numbers come from**; session 1 below is the natural playthrough that
failed to isolate them, and is kept because *why* it failed is what shaped the
re-capture.

---

## Session 1 — the natural playthrough

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

---

## Session 2 — the targeted re-capture

Source: `~/Desktop/bb01-capture-session2.mkv`, captured 2026-07-24.
3024×1964, FFV1 lossless, 60fps container, **655.617s**. One continuous game
segment — no non-game material, so `gameSegments` wasn't needed.

Game window: **1920×1440 at (556, 263)**. Verified rather than assumed —
`blitScore` reads 0.9991–1.0000 at six timestamps spanning the file, i.e. an
exact 3× nearest-neighbour blit throughout. So `readFrames({crop, scale: 3})`
recovers native 640×480 game pixels and every coordinate below is in that space.

**Venue: park** (blue plank fence, trees, benches, crowd) — *not* session 1's
backyard-grass. That turned out to matter in both directions, and neither was
predictable from the shot list. See "what each venue is good at" below.

### Play index — 42 cuts → 20 live plays

Same call as session 1, unchanged: `findCuts(crop=gameRect, scale=4,
threshold=0.25)`. The threshold transferred to a new venue with no retuning,
which is a small independent vote for it sitting in a real valley rather than
having been fitted.

Starts (s): 28.967 · 54.983 · 96.533 · 125.167 · 163.283 · 202.817 · 219.867 ·
253.867 · 271.617 · 300.717 · 329.367 · 350.25 · 390.633 · 415.683 · 457.367 ·
485.3 · 535.45 · 578.1 · 602.85 · 629.5. Wide segments run 6.3–17.3s.

Classified off coarse whole-play sheets (30 tiles × 200 ms):

| Kind | Plays |
|---|---|
| clean home→1B | 00, 03, 04 |
| fly caught in play | 05 (shallow-med), 08 (shallow), 11 (medium), 14 (infield pop), 19 (med-deep) |
| home run | 07, 09, 10, 18 |
| steal / defensive | 02, 13 |
| infield grounder | 12, 15, 17 (double play) |
| unclear | 01, 06, 16 |

The shot list was clearly played — there are deliberate pop-ups *and* left-side
balls, both of which session 1 lacked. It also produced **four home runs**, which
are worthless for fly hang because the ball never comes down in play. That is why
20 plays yield only 5 hang candidates.

### Geometry — a third independent sample

Bases in native 640×480: home **(318.2, 440.6)** · 1B **(473.7, 311.2)** ·
2B **(317.4, 220.2)** · 3B **(163.8, 311.2)**. Basepath **202.3px**.

Derived by clustering white blobs *across 26 frames* and keeping only those that
persist at the same centroid — a base can't move, a fielder can. Two simpler
variants were tried and rejected first: "biggest blob" locks onto base-plus-white-sock
merges (216px vs home plate's 87px), and "modal centroid" locks onto chalk-line
fragments. Both were caught by the internal symmetry checks failing, then settled
by rendering the candidates as boxes over a real frame and looking.

Internal checks all pass: 1B and 3B land on the same y unconstrained; home x,
2B x and the 1B/3B midpoint agree within 1.4px; foul-line asymmetry 0.71%.

**This overturned a published finding.** `geometry.foulSlope` had recorded BB at
1.24 with a 0.0029 spread from two sources, and concluded our 1.2 was a real
3.2% drift because the gap was 14× that spread. The park venue measures
**1.1974**. So the quantity is *per-venue* (1.197–1.241), the tight two-source
agreement was two similar fields rather than a global constant, and our 1.2 sits
inside the band — the record is now `conformed`. The lesson is in `measures.json`:
n=2 agreeing tightly is not the same evidence as n=2 sampling the space.

Perspective is independently re-confirmed: diagonal-midpoint gap 19.22px,
leg spread 12.46%.

### Precision floor: ~50ms, and the 33ms trap

The pass began on a working assumption of 27–32 distinct fps (~33ms). Measured
across 13 windows, session 2 runs **19.5–35 fps, median ~22 → a ~50ms floor**.
Feeding `summarize({framePeriodMs: 33})` would have claimed ~1.4× the precision
that exists — a right reading with a wrong error bar, which is the same class of
failure as the 234px basepath. **50ms is what every session 2 summary uses.**

Unlike session 1's steady 20fps, session 2's rate *varies*. That variability is
load-bearing evidence — see next.

### The check that had to happen first

The runs measured ~4.2s home→1B against a superseded ~3.0s prior reading.
3.0/4.2 = 0.71; session 2 renders ~22 of a plausible 30fps intended rate, and
22/30 = 0.73. **"The emulator is running the game 1.4× slow" was a fully
sufficient explanation of the entire finding**, and shipping the number without
testing it would have been the 234px mistake with extra steps.

Frame-locking predicts the frame *count* of a run is invariant while wall-clock
varies inversely with render rate. Real time predicts the opposite. Five tracked
runs spanning 19.9–26.9 fps:

| Play | leg (ms) | distinct fps | leg (frames) |
|---|---|---|---|
| 00 | 4178 | 20.88 | 87.2 |
| 03 | 4439 | 26.94 | 119.6 |
| 04 | 3250 | 23.20 | 75.4 |
| 09 | 3986 | 19.92 | 79.4 |
| 17 | 4287 | 23.91 | 102.5 |

Frame counts spread 45% while wall-clock spreads 30%, and decisively the
**highest-rate run has the longest wall-clock**, which frame-locking forbids.
Verdict: real time. Corroborated independently — a pitch bracketed by ROI change
scan gives a ~300ms flight against the ~250ms the YouTube notes measured for a
max-arm HEAT; under a 1.4× stretch it would have read ~350–420ms.

### Where the pace pass stands after session 2

**The anchor is measured.** `pace.homeToFirst` = **4200ms**, n=3, spread 261ms,
confidence `med`. Ours is 2113ms — we run the basepath in **half** BB's time
(−49.7%). That is the number every other pace ratio hangs off, so it was the
right thing to spend the pass on.

`flyHang` and `betweenPitch` are **still `awaiting-measurement`** after two
passes. The capture *contains* both shots and the tooling is most of the way
there; what remains for each is named in its record's `pass2Attempt` block —
principally blob-to-track linking, then the eye reads.

Two constants that had *claimed* to be Backyard-measured in `src/config.ts` with
no record behind them — `PITCH_SPEED` and `FLOW.UMP_CALL_DELAY_MS` — now have
records (both honestly `awaiting-measurement`), and a conformance test refuses
to let any future comment claim a measurement no record informs.

- **fly hang** — contact is free and exact (it's the cut). What's missing is
  ball-down. Colour-based ball detection *fails* in this venue: the white plank
  fence, crowd and chalk return 25–30 false candidates per frame.
- **between-pitch** — the deliberation problem is *solved*. A three-ROI per-frame
  change scan (mound / mid corridor / zone) isolates each pitch cleanly no matter
  how long the human dithered over the cards. What's missing is the resting
  ball's disappearance.

### Pass 2 — background subtraction, and a shadow that nearly cost a finding

The pass-1 blocker was "colour can't find the ball in this venue". Pass 2 built
the tool that answers it and discovered the blocker was one layer deeper.

**The tool** (`temporalMedian` + `foregroundBlobs` in `scripts/measure/video.js`,
both validated against synthetic ground truth): stop asking *what is white* and
ask *what moved*. A per-pixel **median** background — not a mean, which smears
every transient sprite into a ghost that then reads as foreground wherever an
actor has ever been — makes the fence, crowd, chalk and stands stop existing as
candidates.

**It works, and it is not sufficient.** In the wide view eleven actors are
moving, and their extremities throw off small fragments that pass any size
filter. "The smallest moving blob" is not the ball. What remains is linking
blobs frame-to-frame into *tracks* and selecting on motion — fast, smooth,
roughly parabolic — which no fielder's arm produces.

**The shadow trap.** On the plate view the tracker produced a beautiful, clean,
monotone descent: y=134 → y=286 over ~930 ms. It was not the ball. It was a
shadow. Taken at face value it would have made the pitch flight ~4× too long
and — far worse — it would have contradicted `instrument.clockValidity`'s
corroboration and reopened the emulator-stretch question **on false evidence**.

A frame-by-frame corridor sheet settled it: the ball is still in the pitcher's
hand at 53.683, clearly airborne at 53.783, and inside the strike-zone bracket
at 53.917 — a **~220 ms flight**, against the ~250 ms the YouTube notes measured
for a max-arm pitch. The recorded corroboration was *confirmed*, not corrected.

The lesson generalises the pass-1 one rather than replacing it. A clean monotone
track is evidence that *something* is moving smoothly and nothing more. In pass 1
that was a valid check because no canned fielder animation produces one; in a
scene containing shadows it is not. The standing rule is what caught it: **a
tracker brackets and rejects; the picture decides.**

### Fly hang, measured — from the disc, not the ball

The ball is ~5px and BB frequently draws it into a **picture-in-picture inset**
at the top of the frame instead of onto the field, so for much of a high fly
there is no ball on the field to track at all. That is why two passes of
ball-tracking went nowhere.

What BB *does* paint is a big saturated-green ellipse on the grass at the
predicted landing spot, for exactly as long as the ball is airborne. Measured:
disc RGB (44–58, 207–223, 26–40) against grass that tops out near g=165, so
`g≥190 && r≤90 && b≤70` separates them with no overlap. It appears on the frame
of contact and vanishes on the frame the ball reaches a glove or the ground —
**verified by eye on all four samples**, including one (play-19) where the ball
*lands* rather than being caught, so the disc marks end-of-flight either way.

| Play | hang | end | bracket |
|---|---|---|---|
| play-05 | 3625 ms | caught | disc present 3.60, gone 3.65 |
| play-06 | 3100 ms | caught | present 3.067, gone 3.133 |
| play-11 | 5075 ms | caught (deep) | present 5.05, gone 5.10 |
| play-19 | 2875 ms | landed | present 2.85, gone 2.90 |

Home runs excluded (play-09 5383 ms, play-18 5417 ms — both real, both longer
than every in-play sample, but a ball that leaves the park isn't what
`FLY_HANG_MS` models). play-08 and play-14 draw no disc; play-14 is an infield
pop that BB banners as INFIELD FLY, so the disc looks like an outfield
affordance.

**Three ways the automation produced clean, plausible, wrong numbers**, each
caught only by looking:

- *Two green things.* The landing disc belongs to the ball; the fielder's glow is
  smaller and moves with him. Blending them ran play-19 past the catch (3.02 s
  against a verified 2.85 s).
- *The disc moves.* It tracks the updating prediction, so pinning it to its first
  bounding box truncated play-06 to 2334 ms when it was plainly still on screen
  at 2680 ms (true: 3100 ms).
- *The disc is occluded.* A fielder standing on it hides most of it for several
  frames, breaking a naive continuous-run detector — play-11 read 3084 ms
  against a verified 5075 ms.

**The result reversed the assumption it was meant to confirm.** Our flies hang
long relative to the run by 14–38%, not the 42–106% the superseded n=1 reading
implied — and *in absolute terms BB's flies hang longer than ours* (2.9–5.1 s vs
2.0–2.9 s). The defect was never that our flies are slow; it is that our run is
fast. Consequently **fixing `RUNNER_SPEED` alone overshoots**: at BB's 4200 ms
anchor our current flies land at ratios 0.476–0.690 against BB's 0.685–1.208,
i.e. too *short*. BB's range is also wider than ours (1.76× span vs 1.45×).

### Between-pitch, measured — and the odd-width trap that nearly buried it

The forced beat is **ball arrives → pitcher has it back** (what follows is the
human deliberating over swing cards, which is not a game constant). Measured at
**2550 ms** (n=3: 2550 / 2500 / 2750), against our 1250 ms — **51% fast, the
same factor as the anchor**.

The useful part: *its ratio to the anchor is already right.* BB sits at 0.607 of
a home→1B, we sit at 0.591 — a 2.7% difference. So unlike fly hang, this
constant is wrong only in absolute tempo and scales correctly alongside
`RUNNER_SPEED` with no separate decision.

**Finding the pitches** took four attempts. Only the HUD **count pips** work — a
resolved pitch lights one and nothing else does. Mound motion fails because the
pitcher tosses the ball to himself on a loop while the human deliberates,
producing identical bursts; zone colour fails because the strike-zone fill is
dirt-brown.

⚠️ **The odd-width trap, which cost the most of anything in this pass.** The
capture is `yuv422p`, which subsamples chroma *horizontally*, and ffmpeg emits
**zero frames for an odd-width crop** — no error, no warning, an empty buffer. A
435px-wide pip crop silently returned nothing, and that read exactly like *"this
capture contains almost no taken pitches"* — a conclusion I had already started
recording. Widening the crop to 436 showed **17 of 20 plate stretches contain
count changes**. Always use even crop width *and* height on this source.

Two more corrections worth carrying:

- Do not run the scene metric over the pip strip across the whole file: during
  live plays BB collapses the HUD to a mini scoreboard with **no count at all**,
  so every view cut registers as a pip change.
- **Pitch-to-pitch cadence is not this constant.** Measured gaps are 10.7–11.6 s.
  I had assumed session 1's deliberation confound wouldn't apply to a
  human-*batting* capture — it does, because the batter picks a swing card
  before every pitch exactly as the pitcher picks a pitch card.

`pace.umpCallDelay` came out of the same sheets at 150–250 ms, consistent with
our 200 ms, but is **not** recorded as measured: the sheets step at 250 ms and
the quantity is ~200 ms, so the sampling interval is the same order as the thing
being measured. One 33 ms sheet per pitch would settle it, and the pitch times
are now known.

### Two plan assumptions that broke

- **"PT" on the ON THE MOUND panel is not a pitching rating.** It is a
  pitches-thrown counter — the video notes had already seen it tick 0→1 on a
  single ball. So arm ratings cannot be read off the footage, and calibrating
  `PITCH_SPEED.ARM_MULT` per-pitcher from the HUD is not possible. The corridor
  has to be measured as a *range* across many arms instead.
- **The three-ROI change scan finds pitch-shaped events, not pitches.** On the
  first plate stretch it returned 7 events for 1 actual pitch — a batter walking
  into the box and a swing both look like one. The discriminator has to be the
  ball itself.

### What each venue is good at

Worth knowing before anyone plans a session 3: **neither venue is good at
everything.** Backyard-grass hides the home→1B lane under the ball-and-fielder
action but has a clean field for ball tracking. The park frees the lane but fills
the frame with white the ball can't be told apart from. A capture that nails both
metrics needs either two venues or a ball-tracking method that doesn't rely on
colour.

### Tracking a runner — what actually works

Most of this pass's time went into rediscovering this, so it's recorded in full
as `pace.trackerLessons`. The short version:

- Reduce each moving blob to the **bottom-centre of its bounding box**, not its
  centroid. In BB's 3/4 iso a change-mass centroid sits at the chest, which is
  ~19px *further up the line* than the feet.
- Select by **sprite shape**, not by largest change. "28–44px tall, feet within
  12px of the axis" rejects both persistent contaminants at once: the floating
  name bubble (13px, ~19px off-axis, and it *lags* the runner) and the first
  baseman camped on the bag.
- A clean monotone ramp is the **validity check** — no canned fielder animation
  produces one. A fit residual above ~25px means the tracker changed sprites;
  that culled 2 of 5 otherwise plausible fits here.
- **Annotate the sheet, don't estimate off it.** Drawing a fixed box on 1B in
  every tile turns "how far along is he?" into "is he at the box yet?", and is
  what made 400ms-step eye reads usable.

None of this promotes a tracker to being *the number*. Every sample that entered
the record was confirmed by marked frames or an annotated sheet.
