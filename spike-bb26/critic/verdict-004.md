# Verdict 004 — after fix cycle 3 (characters + render fix passes only)

Judged from: `shots/board-pitching-033.png`, `shots/board-batting-042.png`,
full-res `shots/pitching-iter033.png` / `shots/batting-iter042.png`, zoomed
crops of the pitching-view batter and catcher, the batting-view batter and
mound pitcher, and previous-lap basis `pitching-iter030.png` /
`batting-iter038.png` for deltas (measured: 4.22% of pitching pixels changed,
73.10% of batting pixels changed — the batting camera moved, the pitching view
got character detail only). `reference/steam/steam-04.jpg` (character
close-up), steam-02 board panel (pitching anchor), frame-080 panel (batting
anchor; facecam overlay ignored). Reference = shipped game = 10. No curve.
Deltas are vs verdict-003. v2 baseline unchanged; its scores carry over. Fix
commits this lap: `abfe735` (characters: face.ts/kid.ts/parts.ts) and
`a15638f` (render: cameras.ts) — **no field pass ran, again**.

## Scores

| Dimension | Spike | Δ | v2 baseline | Evidence |
|---|---|---|---|---|
| Character silhouette | 6 | +1 | 2 | spike: the foreground kids finally have construction — the batter in `pitching-iter033.png` has a real neck cylinder, sleeve cuffs, a shirt hem over the shorts, and the batting-view batter's top hand (`batting-iter042.png`) shows four split knuckles gripping the bat instead of a mitten; the catcher grew a neck and a fingered hand too. Fielders at second-base distance are still capsules with hats, which is what keeps this at 6 — steam-02 kids read elbows and knees out there. |
| Face | 7 | +1 | 2 | spike: the teeth strip is back — the batting-view mound pitcher (`batting-iter042.png`, now ~45px head after the camera pullback) reads eye whites, pupils, brows, nose AND a white teeth strip inside the open mouth, proving the face.ts ratios survive a 60px→45px shrink; the deep fielders and even fence spectators read eyes and mouths. Docked because the camera change shrank the one hero face and both batters face away — the pitching-view batter's eye white is down to a sliver under the cap brim (`pitching-iter033.png`). |
| Motion (pose from stills) | 7 | +1 | 3 | spike: the mound pitcher is captured mid-windup with a genuine leg lift — red shoe raised to knee height, planted foot on the rubber (`batting-iter042.png`) — and the batter finally coils: knees flexed, feet staggered wide, weight back, bat at ~60° (`batting-iter042.png` foreground vs iter038's straight-legged stand). Short of frame-080 because the pitcher's arms bow stiffly forward like he's hugging a barrel instead of glove-at-chest, hand trailing. |
| Venue density | 5 | 0 | 2 | spike: untouched for the THIRD consecutive lap — `pitching-iter033.png` has the identical three toy houses, clone broccoli trees on a visible repeat, and empty lawn corners as iter020, iter026 and iter030. Verdict-001 fix 3 = verdict-002 fix 3 = verdict-003 fix 2, and this cycle again shipped zero field pixels. steam-02 still packs two depth layers, a shed, hedges, clutter. |
| HUD sticker language | 6 | 0 | 1 | spike: unchanged for the fourth lap — cards float free of the hockey-stick pole, stack machine-aligned, scoreboard chip dark green felt instead of cream paper, CHANGE PITCH floating mid-frame (`board-pitching-033.png` left vs center). Nothing regressed; nothing moved. |
| Overall vibe | 7 | +1 | 2 | spike: the batting view now composes exactly like the frame-080 anchor — batter rear-3/4 in the left third at ~40% frame height, pitcher on the mound at center distance (`board-batting-042.png` left vs center) — and the worst object in the build, the red catcher blob, is simply gone. Both views now read as the same backyard baseball game at a squint. Held back by flat plastic materials, the diorama venue, and bare doll-jointed arms. |

**Regression watch — none this lap.** Verdict-003's calcified catcher blob is
RESOLVED by deletion: the batting camera (`a15638f`) no longer includes him,
which fix 1 explicitly sanctioned ("accept losing him entirely over keeping
the blob"). Two new artifacts to catch before they calcify: (1) the
pitching-view catcher's raised arm is a chain of bare skin-colored capsule
segments with visible joint seams — a wooden-doll read at the largest
character scale in the frame (`pitching-iter033.png` foreground); (2) the
hero face lost ~25% of its screen size to the camera pullback — legible
today, but the next face regression will hide behind it.

**Bottom line:** first cycle that cashed BOTH its character-facing fixes —
catcher framing (fix 1) and neck/fingers/teeth (fix 3) each produced visible
pixels, and motion improved unassigned. The venue fix is now 0-for-3 across
cycles, the only dimension where the spike has never moved, and the HUD has
been parked at 6 since verdict-001. The spike leads the v2 baseline on all
six dimensions, by +4 or more on four of them.

## TOP-3 CONCRETE FIXES (priority order)

1. **`src/field/` — second depth layer behind the fence (carry-over, FOURTH
   assignment — no other pass may run before this one ships pixels).** Add a
   back row of 4-5 varied houses at differing heights/colors, a shed, hedge
   runs between houses, 2-3 clutter props (junk truck, laundry line), break
   the tree clone repeat with at least three distinct canopy shapes/scales,
   and fill the empty lawn corners left and right (`pitching-iter033.png`).
   The spec has been word-identical in four verdicts; it is a one-pass,
   one-file job.

2. **`src/characters/` (parts.ts) — clothe the doll joints and mitt the
   mitt.** The pitching-view catcher's raised arm (`pitching-iter033.png`,
   largest character on screen) is bare skin-colored capsule segments with
   visible seams at elbow and wrist: extend the jersey sleeve over the upper
   arm, fuse or shade-match the forearm segments, and color the catching
   hand as a brown leather mitt, not skin. Same pass: the batting-view
   pitcher's arms bow forward symmetrically mid-windup (`batting-iter042.png`)
   — pose glove at chest, throwing hand trailing behind the hip.

3. **`src/ui/` — cash the four-lap-old HUD notes.** Parked at 6 since
   verdict-001, all with written specs: hang the pitch-card stack off the
   hockey-stick pole (steam-02 center panel), add ±2-3° per-card rotation
   jitter so the stack stops reading machine-aligned, recolor the scoreboard
   chip cream notebook paper instead of dark green felt, and dock CHANGE
   PITCH beneath the card stack instead of floating mid-frame
   (`board-pitching-033.png`).

## HARVEST NOTES (techniques now beating the v2 baseline — Phase-B port feed)

All verdict-001/002/003 harvest items stand (canvas HUD portraits,
sticker-card kit, mow bands + wobbly chalk, catenary wires + bunting, fence
spectators, low anchor camera, parts-based kid assembly, authored
stance/crouch clips, distance-first face spec, fringe/brim exclusion zone,
head-turn toward camera, marker-frame waggle variance). New this lap:

- **Anchor-matched batting camera preset (`src/render/cameras.ts`).**
  Mechanism: batter rear-3/4 in the left third at ~40% frame height, plate
  dirt filling the bottom edge, pitcher centered at the horizon third —
  the numbers that make `batting-iter042.png` compose like frame-080. Port
  the preset values into v2's `cameraCues` batting preset; v2's baseline
  camera still floats high and center.
- **Delete the unframeable.** The catcher blob was not fixed, it was
  excluded from the frustum — and the frame improved more than any asset
  work could have. Rule worth carrying: the camera pass owns which
  characters appear; a character that cannot be framed legibly is removed,
  not shrunk.
- **Neck cylinder + knuckle cluster (`parts.ts`).** A short skin cylinder
  between collar and skull plus a 4-ball knuckle cluster on the grip hand
  reads as "neck" and "fingers" at foreground distance with zero new
  topology — straight port to v2's rig as material-split segments, same
  trick as the sleeve/sock boundaries.
- **Sample the marker frame at the pose extreme (`beat.ts` + capture).**
  The windup still reads as motion because the capture lands at leg-lift
  apex, not mid-transition. v2's `AnimationDirector` warps the marker onto
  the simulated instant — bias its idle/windup marker frames toward clip
  extremes so stills and thumbnails inherit the same energy.
- **Face ratios are scale-invariant down to ~45px.** The face.ts spec
  (sclera 0.42-0.48 of a 1.68-wide head, pupil ~0.105, teeth strip in the
  open mouth) stayed legible through a 60px→45px head shrink with no
  per-size tuning — evidence the ratio spec, not a fixed pixel size, is the
  portable asset for v2's face decals.
