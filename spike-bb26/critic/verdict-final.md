# Verdict FINAL — exit scorecard for spike-bb26

Judged from: `shots/board-pitching-049.png`, `shots/board-batting-059.png`,
full-res `shots/pitching-iter049.png` / `shots/batting-iter059.png`, zoomed
crops of the pitching-view catcher/batter pair, the batting-view mound
pitcher, and the mid-distance fielders. References: `steam-04.jpg` (character
close-up), steam-02 board panel (pitching anchor), `frames/frame-080.jpg`
(batting anchor), `frames/frame-025.jpg` (bench kids; facecam overlay ignored
in both). Reference = shipped game = 10. No curve. Capture drift vs the
polish-pass captures: 0.00% both views — this scores exactly what the last
four commits shipped (`9bab742` characters, `fc4ceac` toon ramp + contact
shadows, `593ad65` fielder idle pump, `133dcf1` SPECIAL tuck). Deltas in the
table are vs **verdict-001**, per the exit brief. v2 baseline unchanged all
spike; its scores carry over.

## Exit scores

| Dimension | SPIKE | V2-BASELINE | Δ vs v001 | Evidence |
|---|---|---|---|---|
| Character silhouette | 7 | 2 | +4 | The doll-joint arm is gone — the pitching-view catcher's raised arm (`pitching-iter049.png` crop) is one orange jersey sleeve ending in a contiguous brown leather mitt with a thumb notch, and mid-distance fielders now hold glove-forward idles with visible bent arms and shorts/sock splits instead of reading as capsules with hats; still short of steam-02's kids, whose sneaker mass and knee bends read at any distance. |
| Face | 7 | 2 | +5 | The batting-view mound pitcher (`batting-iter059.png`, ~45px head) reads eye whites, pupils, brows and an open mouth at gameplay distance and fence spectators read faces — but both hero batters still face away, and the pitching-view batter's face is still a sliver under the cap brim, versus `steam-04.jpg`, where the largest face on screen is mid-expression with teeth and tongue. |
| Motion (from stills) | 8 | 3 | +5 | The barrel-hug is fixed — the mound pitcher gathers glove-at-chest at leg-lift apex, red shoe at knee height on the rubber (`batting-iter059.png` crop); the batter coils with bat at ~60°, and the fielder idle pump plus per-view phase offsets mean no two characters strike the identical pose; short of frame-080 only on weight-shift drama (hip turn, ponytail-swing secondary motion). |
| Venue density | 8 | 2 | +3 | Unchanged since verdict-005 and holding: two-depth backdrop parade (varied house row, three-plus canopy shapes with pines breaking the clone repeat, poles with sagging wires, laundry line, scrap cart, doghouse) with no bare fence run (`pitching-iter049.png`); two short of steam-02 on material richness — uniform fence planks, no signage, one grass tone. |
| HUD sticker language | 9 | 1 | +3 | Every parked note has cashed: card stack hangs off the JUICE-straw pole with ±2.2–2.8° hand-hung jitter, CHANGE PITCH docks beneath it, scoreboard is cream paper with green boards inset, and the SPECIAL card is now tucked rotated into the stack head beside HEAT (`board-pitching-049.png` left vs center); the last point is the fence-post minimap, still flatter than steam-02's felt wedge. |
| Overall vibe | 8 | 2 | +4 | Toon-ramped caps/jerseys and soft contact shadows under every character (mound pitcher no longer floats, `batting-iter059.png`) ground the frame, and both views now compose panel-for-panel like their anchors at a squint (`board-batting-059.png` left vs center); capped by what flat vector color cannot do — no texture grain, no grass tufts or weeds, no painterly warmth. |

## THE HARVEST CALL

| Dimension | Beats v2 baseline? | Visible mechanism |
|---|---|---|
| Character silhouette | **YES** (7 v 2) | Parts-based assembly: cap + fringe + neck cylinder + sleeve/short/sock/shoe color boundaries + mitt-with-thumb on one body — material splits, not new topology; ports onto v2's rig directly. |
| Face | **YES** (7 v 2) | Distance-first ratio spec (`face.ts`): sclera 0.42–0.48 of a 1.68-wide head, pupil ~0.105, teeth strip in the open mouth, fringe/brim fenced off the eye line — proven scale-invariant 60px→45px; port as v2 face decals. |
| Motion-from-stills | **YES** (8 v 3) | Hand-authored pose extremes sampled at the marker frame (leg-lift apex, 60° bat coil) plus per-character phase offsets — restate as v2 clip-table entries and bias `AnimationDirector` markers toward clip extremes. |
| Venue density | **YES** (8 v 2) | Two-depth backdrop parade behind the fence (house row + hedge/tree fill + wires) and parameterized clutter props with yard logic — a render-side backdrop kit; v2's fence gate untouched. |
| HUD sticker language | **YES** (9 v 1) | Canvas-painted sticker kit organized by one anchor object (JUICE carton → straw pole → hung card stack → docked button) with hand-hung rotation jitter; ports as one DOM rail div with canvas backgrounds. |
| Overall vibe | **YES** (8 v 2) | Composition + grounding: anchor-matched low camera presets, two-tone toon ramp, blob contact shadows, delete-the-unframeable rule — camera preset numbers go straight into v2's `cameraCues`. |

**Exit call: harvest all six.** The spike beats the v2 baseline on every
dimension, by +5 or more on five of six. Phase B's port order should follow
the mechanism column: face spec and parts assembly first (the product is the
characters), then camera presets, then the HUD rail, then the backdrop kit.

## Score trajectory

| Dimension | v001 | v002 | v003 | v004 | v005 | FINAL |
|---|---|---|---|---|---|---|
| Character silhouette | 3 | 5 | 5 | 6 | 6 | 7 |
| Face | 2 | 3 | 6 | 7 | 7 | 7 |
| Motion-from-stills | 3 | 5 | 6 | 7 | 7 | 8 |
| Venue density | 5 | 5 | 5 | 5 | 8 | 8 |
| HUD sticker language | 6 | 6 | 6 | 6 | 8 | 9 |
| Overall vibe | 4 | 5 | 6 | 7 | 8 | 8 |

Every dimension moved; nothing ever regressed on capture (0.00% drift laps
confirm the pipeline is deterministic). The pattern worth keeping for Phase B:
scores only moved when the named pass shipped pixels, and the two biggest
single-lap jumps (venue +3, HUD +2 in v005) came from specs that had been
word-identical across three verdicts — the specs were right, the scheduling
was the bottleneck.

## What the spike still cannot do (the honest ceiling of procedural-only art)

1. **Hero faces that act.** The procedural face plateaus at
   cheerful-generic: one expression, eyes forward, mouth open. `steam-04.jpg`
   and frame-025 show brow acting, squints, grimaces, glasses, freckles —
   per-character, per-moment expression that needs authored blend states, not
   ratio specs. The spike's heroes also still face away in both views; the
   reference spends camera time on faces because its faces are worth it.
2. **Signature hair and identity silhouettes.** frame-080's batter is
   recognizable from her swinging ponytail alone; frame-025's bench reads
   braids, bobs, side-parts. Procedural fringe-under-cap gives variety, not
   identity. Thirty distinct, instantly recognizable kids — the product — need
   authored per-character assets (hair volumes, accessories, body types).
3. **Material warmth.** Flat vector color with a one-step ramp reads "clean
   toy," never "storybook backyard": no grass tufts, dandelions or worn dirt
   patches, no wood knots in the fence, no halftone grain in the card art, no
   painterly sky. This is texture authorship, and it is the whole remaining
   vibe gap.
4. **Motion, not stills.** Every motion point was earned at a captured pose
   extreme. In actual play the spike's rig has no anticipation, follow-through
   or secondary motion (hair, cloth, mitt flop) — the reference's swing reads
   in motion, and stills were always this rubric's most flattering lens.
5. **Clutter that tells stories.** Parameterized props give density; the
   reference's WEASEL WORLD pennants, storefront posters and junk-with-history
   give narrative. Signage and printed ephemera are authored art by nature.

Ceiling estimate: procedural-only tops out around today's 7–9 band. The
points from here to 10 are authored assets — faces that act, hair with
identity, painted texture — which is precisely the Phase B pipeline (Blender
sources, `authored-character.test.js`, the Junebug rubric pilot) that this
spike's specs now feed.
