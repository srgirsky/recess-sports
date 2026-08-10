# Verdict 002 — after fix cycle 1 (characters / render / animation fix passes)

Judged from: `shots/board-pitching-026.png`, `shots/board-batting-034.png`,
full-res `shots/pitching-iter026.png` / `shots/batting-iter034.png`,
`reference/steam/steam-04.jpg` (character close-up), steam-02 panel in the
boards (pitching anchor), frame-080 panel (batting anchor; facecam overlay
ignored). Reference = shipped game = 10. No curve. Deltas are vs verdict-001
(iter020/iter028 basis). v2 baseline is unchanged between laps; its scores
carry over.

## Scores

| Dimension | Spike | Δ | v2 baseline | Evidence |
|---|---|---|---|---|
| Character silhouette | 5 | +2 | 2 | spike: the batter in `pitching-iter026.png` finally has parts — separate bent arms, hands gripping the bat, orange hair fringe under a green cap, white shirt / blue shorts / yellow shoe boundaries, and fielders got orange jerseys with distinct legs. Still neckless, still mitten-handed, and at second-base distance the kids are still capsules with hats; steam-02's kids read elbows and knees at the same distance. |
| Face | 3 | +1 | 2 | spike: not one legible 3D face in either shot — both foreground kids face away, and the batting-view pitcher (`batting-iter034.png`, center) is the one character looking at camera and his face is a featureless dark smudge. `steam-04.jpg` puts whites+pupils, brows and an open mouth on a head at half that screen size. The +1 is for hair/cap/skin variety now differentiating heads; the face itself is still absent at gameplay distance. |
| Motion (pose from stills) | 5 | +2 | 3 | spike: the mannequin is dead — batter in `batting-iter034.png` holds the bat angled ~45° over the rear shoulder with bent elbows, and the catcher now crouches low by the plate in `pitching-iter026.png` instead of standing. Still stiff: feet near-square, knees barely flexed, no visible weight shift, and the two captures show identical arm positions (no waggle variance survives to the marker frame). frame-080's batter has open hips and a coiled front leg. |
| Venue density | 5 | 0 | 2 | spike: unchanged from verdict-001 — same one thin row of three toy houses, same clone broccoli trees on a visible repeat, same empty lawn corners (`pitching-iter026.png`). Fence, bunting, wires, mow bands, spectators all still present and still good. steam-02 still packs two depth layers, a shed, hedges and clutter behind the fence. Fix 3 from verdict-001 was not attempted. |
| HUD sticker language | 6 | 0 | 1 | spike: unchanged — pitch cards still float free of any pole, the stack still reads machine-aligned, scoreboard chip is still dark green felt instead of cream paper, CHANGE PITCH still floats mid-field (`board-pitching-026.png` left vs center). Nothing regressed; nothing moved. |
| Overall vibe | 5 | +1 | 2 | spike: the new low camera makes the plate group dominate the foreground exactly like the steam-02 anchor, and the frame finally composes like a baseball game (`board-pitching-026.png`). Materials are still flat plastic and the world still feels like a diorama, but it now reads BB-adjacent at a squint. |

**Regression watch:** one new problem, not a score-mover yet — in
`batting-iter034.png` the foreground catcher is a giant red mushroom blob
clipped into the bottom-left corner with no readable mitt, head or limbs. The
camera fix created it; frame-080 keeps the catcher small and legible. Flagged
in fix 2 before it calcifies.

**Bottom line:** the fix cycle cashed two of the three verdict-001 fixes
(camera, mannequin) and half-cashed the first (bodies yes, faces no). The
spike now beats the v2 baseline on all six dimensions. The face — the single
most important pixel in a game whose product is the characters — is still not
on screen.

## TOP-3 CONCRETE FIXES (priority order)

1. **`src/characters/` (face.ts) — make the face survive gameplay distance.**
   The face geometry exists in code but is invisible in both shots. Spec to
   `steam-04.jpg`: sclera ellipses ~1/4 head width with dark pupils, dark brow
   strokes, mouth with dark interior — then verify at the screen size of the
   batting-view pitcher (`batting-iter034.png`, center, ~60px head), not in a
   close-up. If features wash out at that size, scale them up until they do
   not; BB's faces are drawn oversized precisely so they read far away. Also
   turn the pitching-view batter's head slightly toward camera (rear-3/4, as
   in steam-02) so one foreground face is on screen in the main view.

2. **`src/render/` — frame the batting-view catcher.** In
   `batting-iter034.png` the catcher is an illegible red mass clipping the
   bottom-left frame corner. Either shift the batting camera right/up so his
   full crouched silhouette (cap brim + mitt held up) fits, or shrink/reposition
   the catcher to match frame-080, where he sits small, whole, and legible at
   frame edge. A blob owning 15% of the frame is worse than no catcher.

3. **`src/field/` — second depth layer behind the fence.** Verdict-001 fix,
   still open, now the widest remaining gap after characters: add a back row
   of 4-5 varied houses at differing heights/colors, a shed, hedge runs
   between houses, and 2-3 clutter props (junk truck, laundry line, soccer
   goal already exists — move it off the repeat), and break the tree clone
   repeat with at least three distinct canopy shapes/scales. Fill the empty
   lawn corners left and right of the fence line (`pitching-iter026.png`).

## HARVEST NOTES (techniques now beating the v2 baseline — Phase-B port feed)

All verdict-001 harvest items stand (canvas-painted HUD portraits, sticker-card
kit, mow bands + wobbly chalk, catenary wires + bunting, fence-line
spectators). New this lap:

- **Low anchor camera with foreground plate group.** Mechanism: camera ~4ft
  off the ground behind/beside the plate, batter rear-3/4 at ~40% frame
  height, pitcher on the mound over his shoulder — composition alone closed
  more of the BB gap than any asset change this lap. v2's pitching camera
  (`board-pitching-026.png` right) still floats high and center; port the
  camera preset numbers into `src/v2/render/cameraCues` when Phase B lands.
- **Parts-based kid assembly.** `src/characters/parts.ts` composes cap + hair
  fringe + shirt/shorts/socks/shoes as separate color-bounded masses on one
  body — that boundary structure is what made the silhouette jump +2, and it
  maps directly onto v2's rig without new topology (material splits, not
  mesh splits).
- **Authored asymmetric stance + crouch clips.** The 45° bat-over-shoulder
  load and the catcher crouch are small hand-authored poses, not mocap — cheap
  to restate as v2 clip table entries (`src/v2/render/clips`) once the rig
  parity exists.
