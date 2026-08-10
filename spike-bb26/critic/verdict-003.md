# Verdict 003 — after fix cycle 2 (characters + animation fix passes only)

Judged from: `shots/board-pitching-030.png`, `shots/board-batting-038.png`,
full-res `shots/pitching-iter030.png` / `shots/batting-iter038.png`, zoomed
crops of the mound pitcher, batter head and catcher regions, and previous-lap
basis `pitching-iter026.png` / `batting-iter034.png` for deltas.
`reference/steam/steam-04.jpg` (character close-up), steam-02 board panel
(pitching anchor), frame-080 panel (batting anchor; facecam overlay ignored).
Reference = shipped game = 10. No curve. Deltas are vs verdict-002. v2
baseline unchanged; its scores carry over. Fix commits this lap: `7614ab7`
(characters: face.ts/hair.ts) and `257bc2c` (animation: beat.ts) — **no
render pass and no field pass ran**, and the shots confirm it: ~5% of pixels
changed, all of it faces and stance.

## Scores

| Dimension | Spike | Δ | v2 baseline | Evidence |
|---|---|---|---|---|
| Character silhouette | 5 | 0 | 2 | spike: outlines are byte-identical concerns to last lap — the batter in `pitching-iter030.png` still has no neck, mitten hands, and fielders at second-base distance are still capsules with hats; the hair variety added by `hair.ts` (afro on the right fielder in the infield crop) colors the blob but does not change its edge. steam-02 kids read elbows, knees, sneakers at that distance. |
| Face | 6 | +3 | 2 | spike: the lap's one real win — the batting-view mound pitcher (`batting-iter038.png`, ~60px head) now has white-sclera eyes with pupils and glints, brow dashes, a nose, and an open red mouth, all legible at gameplay distance, and even the second-base fielder reads eyes and mouth; the pitching-view batter's head is turned just enough to show one eye white under the cap brim (`pitching-iter030.png`). Short of `steam-04.jpg` because the mouth has lost its teeth strip at distance, the batter's face is 90% cap, and spectator faces are still smudges. |
| Motion (pose from stills) | 6 | +1 | 3 | spike: the two views finally show different arm positions — hands high behind the head in `pitching-iter030.png`, hands at the shoulder with the bat at ~45° in `batting-iter038.png` — so waggle variance now survives to the marker frame, and the batting stance narrowed with an open front foot vs iter034's square-planted symmetry. Still no visible knee flex or weight shift, and the mound leg-lift is unchanged from last lap. frame-080's coiled front leg remains unmatched. |
| Venue density | 5 | 0 | 2 | spike: untouched for the second consecutive lap — `pitching-iter030.png` has the same three toy houses in one thin row, the same clone broccoli trees on a visible repeat, the same empty lawn corners as iter020 and iter026. Verdict-001 fix 3 = verdict-002 fix 3, still not attempted. steam-02 still packs two depth layers, a shed, hedges, clutter. |
| HUD sticker language | 6 | 0 | 1 | spike: unchanged — cards still float free of the hockey-stick pole, stack still machine-aligned, scoreboard chip still dark green felt instead of cream paper, CHANGE PITCH still floats mid-field (`board-pitching-030.png` left vs center). Nothing regressed; nothing moved. |
| Overall vibe | 6 | +1 | 2 | spike: a smiling pitcher looking at the camera from the mound (`batting-iter038.png`) is the first frame from this spike with actual charm in it — the world now has inhabitants, not figurines. Materials are still flat plastic, the venue still a diorama, and the bottom-left of the batting view is still owned by an illegible red blob. |

**Regression watch — verdict-002's flagged regression CALCIFIED.** The
batting-view catcher (`batting-iter038.png`, bottom-left) is pixel-for-pixel
the same giant red mushroom head clipped into the corner as iter034: no mitt,
no limbs, no face, ~15% of the frame. It was flagged, assigned as fix 2, and
skipped. It is now the single worst object in either view.

**Bottom line:** the fix cycle cashed verdict-002's fix 1 (faces — genuinely
well, with a written spec in `face.ts` citing the 60px target) and grazed the
motion complaint, but skipped fixes 2 and 3 entirely. That makes the venue
fix 0-for-2 across cycles and the catcher 0-for-1. The spike leads the v2
baseline on all six dimensions, but two of the three assigned fixes producing
zero pixels is a process failure the next cycle must not repeat.

## TOP-3 CONCRETE FIXES (priority order)

1. **`src/render/` — frame the batting-view catcher (carry-over, second
   assignment).** `batting-iter038.png` bottom-left is still an illegible red
   cap-dome clipping the frame corner. Either pull the batting camera right
   and up until the catcher's whole crouched silhouette (cap brim, head,
   mitt held up) fits inside frame, or scale/reposition the catcher to match
   frame-080, where he sits small, whole and legible at frame edge. Accept
   losing him entirely over keeping the blob.

2. **`src/field/` — second depth layer behind the fence (carry-over, THIRD
   assignment — do this before any new polish).** Add a back row of 4-5
   varied houses at differing heights/colors, a shed, hedge runs between
   houses, 2-3 clutter props (junk truck, laundry line), break the tree
   clone repeat with at least three distinct canopy shapes/scales, and fill
   the empty lawn corners left and right (`pitching-iter030.png`). The spec
   has been identical in three verdicts; it is a one-pass, one-file job.

3. **`src/characters/` — necks, thumb-split hands, and a distance teeth
   strip.** The silhouette score has been parked at 5 for two laps because
   the body construction stopped where verdict-001 left it: add a short neck
   cylinder between collar and head (every steam-02 kid has one), split the
   mitten into mitt+thumb so hands read at batter distance, and restore the
   mouth's white teeth strip at the 60px size (the enlarged dark interior in
   `face.ts` swallowed it — `steam-04.jpg` mouths read teeth even small).

## HARVEST NOTES (techniques now beating the v2 baseline — Phase-B port feed)

All verdict-001/002 harvest items stand (canvas HUD portraits, sticker-card
kit, mow bands + wobbly chalk, catenary wires + bunting, fence spectators,
low anchor camera, parts-based kid assembly, authored stance/crouch clips).
New this lap:

- **Distance-first face spec (`src/characters/face.ts`).** Mechanism:
  features are sized against a named on-screen target — a ~60px head, the
  batting-view pitcher — not against close-up realism: sclera 0.42-0.48 on a
  1.68-wide head (a shade OVER steam-04's 1/4 head width), pupil ~0.105,
  brow dashes proud of the skull, mouth biased to 'open' because the dark
  interior is the last feature to survive minification. Port the ratios
  straight into v2's face decals; the sizing-by-screen-target discipline
  matches `skeleton.test.ts`'s invisible-face gate.
- **Fringe/brim exclusion zone.** The verdict-002 "smudge" was hair geometry
  dipping through the eye line; the fix pins fringe and cap brim above
  y≈0.44 while the eye line sits at 0.10, so no dark mass can cross the
  whites at any head angle. A one-line layering rule worth carrying into
  v2's rig, where hair/cap/face are separate attachments with no such fence.
- **Head-turn toward camera in the anchor view.** The pitching-view batter's
  head yaws a few degrees toward camera so one eye white shows in rear-3/4 —
  a free way to keep a living face in the main gameplay frame; a candidate
  micro-cue for v2's `AnimationDirector` idle poses.
- **Marker-frame waggle variance (`src/animation/beat.ts`).** Stance pose is
  now sampled with a per-view phase offset so no two captures show identical
  arms — kills the "same still twice" tell that made verdict-002's motion
  read as mannequin. Cheap to restate in v2's clip sampling.
