# Verdict 005 — after fix cycle 4 (field + ui fix passes only)

Judged from: `shots/board-pitching-038.png`, `shots/board-batting-047.png`,
full-res `shots/pitching-iter038.png` / `shots/batting-iter047.png`, zoomed
crops of the pitching-view catcher/batter pair and the batting-view mound
pitcher, and previous-lap basis `pitching-iter033.png` / `batting-iter042.png`
for deltas (measured: 26.43% of pitching pixels changed, 14.91% of batting —
all of it backdrop and HUD; zero character pixels moved).
`reference/steam/steam-04.jpg` (character close-up), steam-02 board panel
(pitching anchor), frame-080 panel (batting anchor; facecam overlay ignored).
Reference = shipped game = 10. No curve. Deltas are vs verdict-004. v2
baseline unchanged; its scores carry over. Fix commits this lap: `1c4fdc6`
(field: flora.ts/yard.ts) and `bec2271` (ui: art.ts/index.ts/widgets.ts) —
**no characters pass ran**, so verdict-004's fix 2 was skipped.

## Scores

| Dimension | Spike | Δ | v2 baseline | Evidence |
|---|---|---|---|---|
| Character silhouette | 6 | 0 | 2 | spike: byte-identical characters to last lap — the pitching-view catcher's raised arm (`pitching-iter038.png` foreground crop) still shows a bare skin forearm with visible seams at elbow and wrist below a too-short orange sleeve, and fielders at second-base distance are still capsules with hats. steam-02 kids read elbows and knees out there. The assigned clothe-the-joints pass produced zero pixels. |
| Face | 7 | 0 | 2 | spike: holding — the batting-view mound pitcher (`batting-iter047.png`, ~45px head) still reads eye whites, pupils, brows, blush dots AND the white teeth strip in the open mouth, and fence spectators still read faces. Still docked for the same two reasons as verdict-004: both hero batters face away, and the pitching-view batter's eye is a sliver under the cap brim (`pitching-iter038.png`). |
| Motion (pose from stills) | 7 | 0 | 3 | spike: the captures preserved every earned pose — mound leg-lift at apex with red shoe at knee height and planted foot on the rubber (`batting-iter047.png`), batter coiled with staggered feet and bat at ~60° (`pitching-iter038.png`). Still short of frame-080 for the same unfixed reason: the pitcher's arms bow forward symmetrically like he's hugging a barrel — glove-at-chest was part of the skipped characters pass. |
| Venue density | 8 | +3 | 2 | spike: the 0-for-3 dimension finally cashed, and cashed the whole spec — `pitching-iter038.png` now has a varied back row (blue two-story, red barn, teal cottage, tan house, green quonset shed), hedge and tree fill so no fence run reads bare, three-plus distinct canopy shapes with pines breaking the broccoli clone repeat, telephone poles with sagging catenary wires, and clutter (scrap cart right field, laundry line, doghouse per `yard.ts`). Two points short of steam-02 on material richness, not density: uniform fence planks, no signage, one grass tone. |
| HUD sticker language | 8 | +2 | 1 | spike: the four-lap-parked notes all cashed at once — the pitch-card stack now hangs off the ribbed JUICE-straw pole rising from the carton (`board-pitching-038.png` left vs center), each card carries ±2.2-2.8° rotation with horizontal stagger so the stack reads hand-hung, CHANGE PITCH is docked beneath the stack, and the scoreboard is a cream notebook-paper chassis with dark-green boards inset. Short of 10 because the SPECIAL card floats unrotated off-stack and the fence-post minimap is flatter than steam-02's felt one. |
| Overall vibe | 8 | +1 | 2 | spike: `board-pitching-038.png` left and center panels finally read as the same game at a squint — backdrop parade, right-rail card stack on its straw, cream paper chips in the same corners. Held back by what the skipped pass left behind: flat plastic materials, doll-jointed bare arms on the largest character in frame, and heroes whose faces the camera never sees. |

**Regression watch — none this lap.** 0.00% pixel drift between the fix-pass
captures and this verdict's captures; the 26%/15% deltas vs verdict-004's
bases are entirely backdrop and HUD. But verdict-004's two flagged artifacts
both CARRIED untouched: (1) the catcher's segmented bare arm — flagged, then
assigned as fix 2, then skipped, the exact calcification path the catcher
blob took in verdicts 002-003; (2) the hero face remains ~45px with both
batters facing away. Also note: the process pattern is now "exactly one
assigned fix skipped per lap" four laps running — last lap the field pass,
this lap the characters pass.

**Bottom line:** biggest single-lap gain of the spike — venue +3 after three
skipped assignments, HUD +2 after four parked laps, and nothing regressed.
The spike now leads the v2 baseline by +4 or more on FIVE of six dimensions.
The three character-dimension scores did not move because the characters pass
did not run; every remaining point is now concentrated in one subsystem.

## TOP-3 CONCRETE FIXES (priority order)

1. **`src/characters/` (parts.ts) — clothe the doll joints and mitt the mitt
   (carry-over, SECOND assignment — no other pass may run before this ships
   pixels).** The pitching-view catcher (`pitching-iter038.png`, largest
   character on screen): extend the orange jersey sleeve past the elbow,
   fuse or shade-match the skin forearm segments so the elbow/wrist seams
   disappear, and make the catching hand one contiguous brown leather mitt
   shape, not knuckle balls on a skin wrist. Same pass: pose the batting-view
   pitcher's arms asymmetrically mid-windup — glove at chest, throwing hand
   trailing behind the hip (`batting-iter047.png`).

2. **`src/render/` (materials/lights) — kill the flat-plastic read.** The
   note that has capped vibe since verdict-002, never yet assigned: add a
   two-tone toon ramp to jersey/cap/skin materials (darker underside, one
   step, no gradient) and a soft blob contact shadow under every character
   including the deep fielders (`batting-iter047.png` mound pitcher floats
   on flat green). steam-04's charm is 80% shading under the same geometry.

3. **`src/characters/` + `src/render/` — articulate the second-base-distance
   fielders.** They have been "capsules with hats" in every verdict:
   give the mid-distance LOD elbow and knee bends in its idle (steam-02
   fielders read joints at that range) and add the same ±phase waggle the
   foreground uses so no two fielders strike the identical pose
   (`pitching-iter038.png` infield).

## HARVEST NOTES (techniques now beating the v2 baseline — Phase-B port feed)

All verdict-001 through -004 harvest items stand (canvas HUD portraits,
sticker-card kit, mow bands + wobbly chalk, catenary wires + bunting, fence
spectators, low anchor camera, parts-based kid assembly, authored
stance/crouch clips, distance-first face spec, fringe/brim exclusion zone,
head-turn toward camera, marker-frame waggle variance, anchor-matched batting
preset, delete-the-unframeable, neck cylinder + knuckle cluster, marker at
pose extreme, scale-invariant face ratios). New this lap:

- **Two-depth backdrop parade (`src/field/yard.ts` + `flora.ts`).**
  Mechanism: fence row (spectators + bunting) in front of a house row at
  varied heights and candy colors, with hedge/tree fill placed so no fence
  run longer than ~15% of frame width shows bare planks, canopies at 3+
  distinct shapes/scales with pines interleaved to break the clone repeat,
  and telephone poles carrying quadratic-Bezier sagging wires across the
  sky. This one pass moved venue +3; port as a render-side backdrop kit for
  v2 (v2's `venue.ts` fence gate is untouched — this is all behind the
  fence).
- **Named clutter props with yard logic (`yard.ts`).** laundryLine() hangs
  cloth planes on a catenary rope high enough to clear the 6.5ft fence;
  doghouse and scrap-truck props sit in the foul-ground corners the spec
  called empty. The technique: each prop is a parameterized function
  (position, rotY, rng) so corners get filled by placement calls, not
  bespoke meshes — directly portable to v2's scene assembly.
- **One anchor object organizes the whole HUD rail (`src/ui/art.ts`
  strawPole + `widgets.ts`).** The JUICE carton at bottom-right grows a
  ribbed straw pole; the pitch-card stack right-edges ~17px left of it,
  and CHANGE PITCH docks beneath the stack — every right-rail element now
  explains its position by its neighbor. Port to v2's DOM HUD as one
  absolutely-positioned rail div with the pole as background canvas and
  cards as children.
- **Hand-hung card jitter numbers.** Per-card constant rotations of
  +2.2/-2.4/+2.6/-2.8 degrees with a few px horizontal stagger read
  "hand-hung" while keeping tap targets rectangular — the values matter
  (under ±2° read machine-aligned in verdicts 001-004). Direct CSS
  transform port.
- **Cream-paper-with-boards-inset scoreboard (`widgets.ts`).** The chassis
  is a cream gradient (steam-02 reads white/cream at a squint, never green
  edge to edge) with dark-green chalkboard strips INSET for the data rows —
  paper outside, chalk inside. One-liner rule worth carrying into v2's HUD
  theme kit.
