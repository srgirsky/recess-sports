# Verdict 001 — first full lap

Judged from: `shots/board-pitching-020.png`, `shots/board-batting-028.png`,
full-res `shots/pitching-iter020.png` / `shots/batting-iter028.png`,
`reference/steam/steam-04.jpg` (character close-up), `reference/frames/frame-025.jpg`
(bench kids close-up; facecam overlay ignored). Reference = shipped game = 10.
No curve.

## Scores

| Dimension | Spike | v2 baseline | Evidence |
|---|---|---|---|
| Character silhouette | 3 | 2 | spike: every kid in `pitching-iter020.png` is the same neckless capsule — no hands, no sleeves, no shoe mass; the batter reads only because of the cap+bat. v2 (`board-pitching-020.png`, right panel): batter is a lumpy giant-head with a shapeless black cap blob and mitten arms; fielders are cones with spheres. Reference silhouettes (steam-02 panel) have necks, elbows, knees, sneakers, cap brims — readable at 300 ft. |
| Face | 2 | 2 | spike: at gameplay distance the 3D kids' faces are unreadable dark smudges — the hula-hoop kid in `batting-iter028.png` right edge is the largest face on screen and it has no legible eyes or mouth; the only living faces are the 2D HUD portraits. v2: dot-eyes on tan spheres, no mouths (`board-batting-028.png` right panel). Reference (`steam-04.jpg`): eyes are ~1/4 head width with whites+pupils, sculpted brows, open mouth with teeth and tongue. |
| Motion (pose plausibility from stills) | 3 | 3 | spike `batting-iter028.png`: batter is a symmetric mannequin — bat dead-vertical behind the head, both elbows level, feet square, zero knee bend or weight shift; the catcher STANDS bolt upright beside the plate instead of crouching behind it; the pitcher in `pitching-iter020.png` is a static T-ish idle, not mid-windup. v2: batter has a bent-leg load but the near arm clips through the torso (`board-pitching-020.png`). Reference frame-080 batter has open hips, high back elbow, bat angled 45°, flexed front knee. |
| Venue density | 5 | 2 | spike: fence + bunting + sagging wires + mow bands + houses + greenhouse + spectator kids are all present (`pitching-iter020.png`), but the band behind the fence is one thin row — three toy houses, clone broccoli trees on a visible repeat, no junk truck, no shrub clutter, huge empty lawn corners left and right. Reference steam-02 packs two full depth layers of varied houses, a shed, hedges, laundry, clutter. v2: bare green wall, three primitive houses, empty outfield (`board-pitching-020.png` right). |
| HUD sticker language | 6 | 1 | spike: genuinely in the language — VS plate with painted portraits, pitch-card stack with per-card illustrations, JUICE carton with burst, rotated mini-diamond, zero flat rectangles (`board-pitching-020.png`). Docked points: cards float free instead of hanging off the hockey-stick pole, rotation jitter is near-zero so the stack reads machine-aligned, scoreboard chip is dark green felt where the reference chip is cream notebook paper, and CHANGE PITCH floats mid-field instead of anchoring near the card stack. v2: flat cream rectangles with plain text — exactly what the brief bans (`board-batting-028.png` right panel). |
| Overall vibe | 4 | 2 | spike: reads as a cheerful toy diorama, but uniform flat shading, plastic materials, clone vegetation, and mannequin kids make it a mobile-ad screenshot, not BB2026's lived-in storybook backyard (`board-pitching-020.png` left vs center). v2: unmistakably a programmer prototype. |

**Bottom line:** the spike already beats the v2 baseline on 5 of 6 dimensions,
mostly on HUD and venue. It loses the assignment where the assignment says the
whole point is: the characters. A 3/2/3 character block next to a shipped 10 is
an embarrassment the brief explicitly warned about.

## TOP-3 CONCRETE FIXES (priority order)

1. **`src/characters/` — give the kids faces and constructed clothing.**
   Visible defect: in `batting-iter028.png` no 3D character on screen has a
   legible eye, mouth, or eyebrow; bodies are single-color capsules with no
   sleeve/short/sock/shoe boundaries. Build faces to the `steam-04.jpg` spec:
   white sclera ellipses ~1/4 head width with dark pupils, geometry or decal
   brows, a mouth that can open (dark interior + teeth strip), a nose bump.
   Clothing needs construction lines at gameplay distance: contrasting sleeve
   cuffs, shorts hems, sock bands above the shoes, cap brim as separate mass,
   and mitt-with-thumb hands. Judge by silhouette+face at the distance of the
   batter in the pitching view, not in a close-up.

2. **`src/render/` — pitching-view camera does not match the steam-02 anchor.**
   Visible defect: in `pitching-iter020.png` the batter is ~15% of frame height
   and shoved into the bottom-right corner, half-merged with the catcher blob;
   the anchor puts the batter rear-3/4, ~40% of frame height, bottom
   center-right, with home plate visible in front of him and the pitcher on the
   mound over his shoulder. Lower and tighten the camera; the plate group
   (batter, catcher, plate) must dominate the foreground the way the center
   panel of `board-pitching-020.png` shows.

3. **`src/animation/` — kill the mannequin.** Visible defect: in
   `batting-iter028.png` the batting stance is perfectly symmetric (vertical
   bat, level elbows, square feet, straight knees) and the catcher stands
   upright beside home plate. Author an asymmetric stance clip: back elbow
   high, bat angled ~45° over the rear shoulder, front foot open, knees flexed,
   weight on the back leg, continuous waggle so no two captures show identical
   arm positions; and a catcher crouch (hips below knees, mitt up, behind the
   plate on the catcher's box). Pitcher idle should hold the glove at chest,
   not hang arms at the sides.

## HARVEST NOTES (techniques already beating the v2 baseline)

- **Canvas-painted 2D portraits as HUD textures.** The Junebug/Lefty Lu VS
  plate portraits (`pitching-iter020.png` top-right) have more facial charm
  than any 3D head in either build. Mechanism: draw the face flat on a canvas
  (skin ellipse, sclera+pupil, smile stroke, cap), use as sprite/DOM image.
  Port this to v2's matchup HUD as-is, and steal its shape grammar for the 3D
  face decals in fix 1.
- **Sticker-card kit.** Rounded-rect canvas cards with thick colored border +
  offset drop shadow + hand-drawn glyph (bat, curve arrows, z-z-z ball) — a
  single parameterized generator producing the whole pitch stack. Directly
  transplantable to v2's DOM HUD, which is still flat rectangles.
- **Mow bands + wobbly chalk.** Alternating light/dark grass stripes and
  hand-wobbled base lines (`pitching-iter020.png`) sell "someone mows this
  lawn" for the cost of a texture multiply; v2's field is one flat green.
- **Catenary wires + pennant bunting.** Sagging polyline wires between poles
  and triangle-flag strings along the fence add lived-in density at trivial
  vertex cost; v2 has neither.
- **Fence-line spectators.** Low-poly kids standing/hula-hooping along the
  fence (`batting-iter028.png` right edge) make the world inhabited even
  though each is <100 tris.
