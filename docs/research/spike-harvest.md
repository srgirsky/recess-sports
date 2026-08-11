# Spike harvest — what spike-bb26 proved, and what ports

**What this is.** In August 2026 we ran spike-bb26: a deliberately throwaway
build on branch `spike/bb26-one-shot` in this repo (working directory
`spike-bb26/`, its own three.js scene, never wired into v1 or v2) whose only
job was to find out how far *procedural-only* art could close the BB2026
production-value gap named by the 2026-08-08 re-audit. Three orchestrated
runs drove it: a builder implemented, a critic scored every lap against the
BB2026 reference material on six dimensions (reference = shipped game = 10,
no curve), and the verdict fed the next lap. Six verdicts were issued
(`spike-bb26/critic/verdict-001.md` … `verdict-final.md`).

**The trajectory.** Verdict-001 opened with the spike beating the v2 baseline
on HUD and venue but embarrassing itself on the product — characters at
3/2/3 (silhouette/face/motion). Five laps later the exit scorecard read:

| Dimension | Spike | v2 baseline | Reference | v001 → final |
|---|---|---|---|---|
| Character silhouette | 7 | 2 | 10 | 3 → 7 |
| Face | 7 | 2 | 10 | 2 → 7 |
| Motion (from stills) | 8 | 3 | 10 | 3 → 8 |
| Venue density | 8 | 2 | 10 | 5 → 8 |
| HUD sticker language | 9 | 1 | 10 | 6 → 9 |
| Overall vibe | 8 | 2 | 10 | 4 → 8 |

**Exit call: harvest all six dimensions** — the spike beats the v2 baseline
everywhere, by +5 or more on five of six. Recommended port order follows the
product: face spec and parts assembly first (the characters are the product),
then camera presets, then the HUD rail, then the backdrop kit. One process
lesson worth keeping: scores only moved when a pass shipped pixels, and the
two biggest single-lap jumps (venue +3, HUD +2) came from specs that had been
word-identical across three verdicts — the specs were right, the scheduling
was the bottleneck.

**Evidence paths.** Verdicts cite capture images by spike-repo path
(`spike-bb26/shots/board-pitching-049.png`, `spike-bb26/shots/batting-iter059.png`,
reference crops under `spike-bb26/reference/`). These are **gitignored
artifacts of the `spike/bb26-one-shot` branch** — they exist only in a
checkout of that branch that has re-run its capture pipeline (which the final
verdict confirmed deterministic: 0.00% capture drift), not in this document's
tree. The verdict markdown files on that branch are the durable record.

---

# Technique inventory for the Phase B port

Source: spike-bb26 (`spike/bb26-one-shot`), exit scorecard
`spike-bb26/critic/verdict-final.md`. Entries are ordered by expected impact
on the character-quality gap: characters and motion first, then camera/vibe,
then HUD, then venue and texture recipes. Each entry names the spike
mechanism (file, function, numbers) so the port is a restatement, not a
rediscovery. Spike file paths (`src/characters/…`, `src/render/…`, etc.) are
paths *inside* `spike-bb26/` on the spike branch.

A global adaptation note up front: the spike wires subsystems through a ctx
event bus (`src/core/ctx.ts`) and pulls palette colors via a ctx `materials`
service. None of that ports. v2 already has the equivalent seams — palette
constants live where v2's render layer keeps colors, randomness in anything
sim-adjacent must be injected per `src/v2/sim/rng.ts`'s one-source rule, and
anything replacing a hand-authored value must respect the gates
(`skeleton.test.ts`, `groundContact.test.ts`, `cameraCues.test.ts`,
`clips.test.ts`, `audit:v2-layout`). Every entry below is a mechanism plus
numbers; the ctx plumbing stays behind.

## 1. Distance-first face ratio spec

- **WHAT:** Faces sized as ratios of head width against a named on-screen
  target (~60px head), not close-up realism — proven legible down to ~45px.
- **MECHANISM:** `src/characters/face.ts` — `rollFace()` + `buildFace()`.
  On a 1.68-wide skull (radii 0.84/0.78/0.76 ft): sclera 0.42–0.48 head-widths
  across (eyeSize 0.21–0.24 blob radius, scaled [0.95, 1.25, 0.5]), pupil
  ~0.105, brow dashes proud of the skull at y 0.44, eye line at y 0.10.
  Mouth biased to 'open' (3-in-5 roll) because the dark interior is the last
  feature to survive minification; the open mouth is dark-interior blob +
  teeth strip 0.18 ft tall (~7px at 60px head) pushed ~0.06 ft proud of the
  interior + tongue. All features are blobs pushed proud of the skull — no
  texture required. Sclera and teeth use `MatCache.glow()` (partly emissive,
  strength 0.68/0.75) so whites stay white on the shadow side of the head.
- **EVIDENCE:** verdict-003 "distance-first face spec"; verdict-004 "face
  ratios are scale-invariant down to ~45px" (60px→45px shrink, no per-size
  tuning); verdict-final face 7 v 2.
- **PORT TARGET:** `scripts/v2/blender/build-*.py` helpers — bake the ratio
  spec into the authored face pass (and the Junebug rubric's face-aspect /
  mouth-legibility items already point the same way). Optionally
  `src/v2/render/ProxyCharacter.ts` as decal ratios (fallback only). The
  emissive-whites trick restates as material emissive on face features in
  v2's render layer; matches `skeleton.test.ts`'s invisible-face gate.
- **ADAPTATION:** v2 faces are authored geometry/decals, not runtime blobs —
  port the *ratios and the open-mouth/teeth-strip/emissive rules*, not the
  blob assembly.

## 2. Parts-based kid assembly (color boundaries, not topology)

- **WHAT:** The silhouette jump came from garment/anatomy color boundaries on
  one body — cap + fringe + collar + sleeve cuff + shorts hem + sock band +
  sneaker — material splits, not new mesh topology.
- **MECHANISM:** `src/characters/kid.ts` `buildKid()` + `src/characters/parts.ts`.
  Named pivot skeleton (hips/legL/kneeL/footL/armL/elbowL/handL/head…), all
  rounded forms (`lathe` torso with hem flare, `limbSegment` capsules, `blob`
  everything — never boxes). The load-bearing details, each one a verdict fix:
  - Construction lines: ribbed collar torus + shirt hem band + shorts hem +
    sleeve cuff + sock band, all in computed darker shades of the garment
    color (`MatCache.get(key, shade)` — shades of palette colors, never new
    literals).
  - Short sleeve runs the WHOLE upper arm to the elbow with a fat contrast
    cuff (verdict-005: bare upper arm read as a doll joint); elbow joint
    filler is sleeve-colored so no seam opens in any pose.
  - Neck: skull raised so a ~0.27 ft skin column (~6% of kid height, the
    steam-02 proportion) shows between collar and chin; neck cylinder slimmer
    (0.17r) than the collar ring so the silhouette PINCHES — the pinch, not
    the skin color, reads as "has a neck" at second-base distance.
  - `mittenHand()`: fat palm + THREE fingers with real gaps (~0.04 ft) +
    thumb rotated 0.85 rad clear so the notch breaks the outline.
  - `sneaker()`: oversized on purpose — shoe mass is a silhouette anchor
    (fat white sole, toe cap, heel collar).
  - Per-kid variety: `rollRecipe()` rolls skin/hair/outfit/heightScale
    (0.93–1.07) / bulk (0.95–1.12) from a seeded rng with per-kid sub-seeds.
- **EVIDENCE:** verdict-002 "parts-based kid assembly" (+2 silhouette);
  verdict-004 "neck cylinder + knuckle cluster"; verdict-final silhouette 7 v 2.
- **PORT TARGET:** `scripts/v2/blender/build-*.py` helpers — the boundary
  list (collar/cuff/hem/sock/sole) becomes authored material splits on v2's
  rig; `src/v2/render/ProxyCharacter.ts` gets the same splits as the fallback.
  No new topology needed, so v2's skeleton/height gates are untouched.

## 3. Contiguous mitt that replaces the hand

- **WHAT:** The glove is ONE contiguous leather mass worn in place of the
  hand — contiguity beats anatomy at every camera distance.
- **MECHANISM:** `src/characters/parts.ts` `glove()`: cuff cone (forearm girth
  up top → pad girth below) that swallows the wrist so no skin shows between
  mitt and sleeve; one fat pad blob; finger ridge bumps buried to HALF depth
  in the pad edge (they read as creases, not balls); thumb hugging the pad;
  dark pocket-shadow blob on the palm face. Crucially `kid.ts` hides every
  child of the skin hand (`child.visible = false`) before parenting the mitt —
  the old version let skin knuckles poke out around the leather.
- **EVIDENCE:** verdict-final silhouette row: "one orange jersey sleeve ending
  in a contiguous brown leather mitt with a thumb notch" (was "knuckle balls
  on a skin wrist" in verdict-005).
- **PORT TARGET:** `scripts/v2/blender/build-*.py` — author the mitt as one
  mass replacing the hand, cuff overlapping the sleeve; same replace-don't-
  overlay rule in `ProxyCharacter.ts`.

## 4. Fringe/brim exclusion zone + cap construction

- **WHAT:** A one-line layering fence — hair fringe and cap brim pinned above
  the eye line — plus a cap that reads as cap, not a head-swallowing dome.
- **MECHANISM:** `src/characters/hair.ts`. `fringe()` lower edge stays above
  y ≈ 0.45 (skull-center space) while the eye line sits at y 0.10, so no dark
  mass can cross the whites at any head angle (the verdict-002 "smudge" was
  fringe dipping to y 0.22). `buildCap()`: crown shell riding HIGH (theta
  1.78, y +0.05) and WIDER than every hair shell (0.97 > 0.92) so hair never
  pokes through as a second cap color; brim is a fat squashed blob at y 0.46
  with shallow 0.2 rad tilt — the old brim sat ON the eye line and shadowed
  the whites from every camera below head height. Hair styles are
  silhouette-first (afro lump cloud, frame-080 ponytail as descending lumps +
  band, bob, twin puffs kept low-and-wide, curls, crew), all from a tilted
  hemispherical shell whose tilt lifts the front edge off the face.
- **EVIDENCE:** verdict-003 "fringe/brim exclusion zone"; verdict-final face
  row (eye whites read at 45px under caps).
- **PORT TARGET:** `scripts/v2/blender/build-*.py` — carry the exclusion rule
  into the authored hair/cap passes and note it in the character quality
  rubric; v2's rig has hair/cap/face as separate attachments with no such
  fence today.

## 5. Marker-frame-at-pose-extreme + capture-window holds

- **WHAT:** Stills read as motion because captures land on HELD anticipation
  extremes, never mid-blend — the single most portable motion insight.
- **MECHANISM:** `src/animation/beat.ts`. The two best anticipation
  silhouettes are held across the whole capture window rather than hit at an
  instant: the pitcher's windup peak spans 2600–3600 ms blending
  `windup → windupPeak` the whole time (knee CREEPS higher, so it never
  reads frozen) with a ×0.04 balance tremble riding on top; the batter's
  coil spans 2600–4100 ms with `easeOut` FRONT-LOADING the blend (~90%
  arrived by the window) so the photograph shows a full flexed-knee load,
  not a half-blend. Drive/release/follow-through then blend from the hold's
  end state (`windupPeak`) so there is no pop.
- **EVIDENCE:** verdict-004 "sample the marker frame at the pose extreme";
  verdict-final motion 8 v 3 ("gathers glove-at-chest at leg-lift apex,
  red shoe at knee height").
- **PORT TARGET:** `src/v2/render/proceduralClips.ts` — restate windup-hold /
  coil-hold as clip-table entries, and bias `AnimationDirector`'s idle/windup
  marker frames toward clip extremes (the Director already warps the marker
  onto the simulated instant — the change is WHICH frame the marker prefers).
  Clip table changes go through `clips.test.ts` and the two v2 docs.
- **ADAPTATION:** The 6-second fixed beat loop is spike scaffolding — v2's
  sim owns timing. Port the pose extremes and hold-with-drift shapes, not
  the state machine.

## 6. Authored pose set + FK grid-search arm solver

- **WHAT:** Five hand-authored poses (asymmetric bat stance, windup, catcher
  crouch, loud fielder ready, idles) whose hands are PLACED by a tiny FK
  solver, which is what keeps both mitts on the bat in every variant.
- **MECHANISM:** `src/characters/poses.ts`. `solveArm()` grid-searches the 3
  dominant arm DOF (~9k evals, deterministic, pose-time only) so the hand
  lands on a hips-space target; `aimBat()` orients the bat by quaternion
  AFTER the arms land (counter-rotating the chain quaternion) so grip
  survives whatever the solver chose. Key numbers: `stanceBat` — back knee
  0.46 flexed with hips tipped over it, bat cocked ~45°
  (dir [-0.62, 0.66, -0.48]), back elbow HIGH (target [-0.62, 1.5, -0.22]),
  head yawed 0.95 rad toward camera with chin lifted -0.14 so the near eye
  clears the brim; `windup` — ASYMMETRIC arms (glove at chest
  [0.3, 1.02, 0.52], ball hand trailing behind the hip [-0.52, 0.24, -0.58]
  — the hands-together version read as "hugging a barrel"); `ready` —
  hands driven down-and-OUT (±0.62 x) so the elbow gap notches the
  silhouette either side of the torso (the notch is what survives 45px);
  `crouchCatch` — tiptoe squat (foot -0.45; a level foot shows its sole disc).
- **EVIDENCE:** verdict-002 "authored asymmetric stance + crouch clips";
  verdict-003 "head-turn toward camera"; verdict-final motion row.
- **PORT TARGET:** `src/v2/render/proceduralClips.ts` (pose extremes as clip
  keys, per-character partials for the head-turn micro-cue). The FK solver is
  a build-time authoring aid — it belongs in the Blender pipeline
  (`scripts/v2/blender/`) as a pose-authoring helper, not in the runtime.

## 7. Idle life + per-character phase offsets (no two kids in sync)

- **WHAT:** Nobody stands still and no two characters ever photograph in the
  same pose — additive life layers with all randomness drawn once at init.
- **MECHANISM:** `src/animation/idle.ts` `IdleLife`: three additive layers —
  breathing (torso swell 0.014–0.022, 0.26–0.38 Hz), weight shift (hips lean
  the legs don't follow, 0.09–0.16 Hz, head counter-tilts level), piecewise
  head glances (turn-hold-return, 4.6–9.2 s period, alternating sides) —
  plus the fielder ready-crouch pump (verdict-005 fix: knees pulse 0.07–0.13
  at 0.13–0.21 Hz, hips dip, elbows flex against the pulse). EVERY parameter
  (amp, rate, phase) is drawn from the seeded rng ONCE at construction, so
  the runtime path is a pure function of time and the same seed reproduces
  the same crowd. `beat.ts`'s `waggle()` applies the same principle to the
  batter: amplitudes deliberately LOUD (bat tip circles ~6 in at 0.55 Hz,
  weight rock at 0.32 Hz) because a ~5° residue measured invisible at the
  marker frame; the two frequencies put the capture window's ±300 ms jitter
  65–115° apart in phase, so no two captures share a pose.
- **EVIDENCE:** verdict-003 "marker-frame waggle variance"; verdict-005
  fielder idle pump; verdict-final motion row ("no two characters strike the
  identical pose").
- **PORT TARGET:** `src/v2/render/proceduralClips.ts` — additive idle-life
  layer with per-character phase offsets on top of base clips.
- **ADAPTATION:** draw-once-at-init randomness must come through an injected
  rng on the render side (never module-scope, and never the sim's rng
  stream — the purity gate watches both).

## 8. Two-tone toon ramp + emissive face whites

- **WHAT:** One hard-step toon ramp on every character material — "steam-04's
  charm is 80% this ramp under the same geometry."
- **MECHANISM:** `src/characters/parts.ts` `MatCache`: a 2×1 DataTexture
  gradientMap `[168, 255]` (shadow step 168/255 ≈ 0.66 — dark but never
  muddy; BB2026 has no true darks anywhere), NearestFilter, shared by every
  `MeshToonMaterial`. Shades are computed (`color.multiplyScalar(shade)`)
  from palette keys — hex lives in one palette file only. `glow()` variant
  splits a color into diffuse + emissive parts for face whites/teeth.
- **EVIDENCE:** verdict-final vibe row ("toon-ramped caps/jerseys… ground the
  frame"), fc4ceac commit cited in the exit header.
- **PORT TARGET:** src/v2 render layer — apply the ramp values to v2's
  character materials (authored and proxy alike). Two numbers and a filter
  mode; trivially portable.

## 9. Blob contact shadows (with the three traps pre-solved)

- **WHAT:** A hard dark radial-gradient disc under every character — what
  actually grounds a distant kid when the shadow map spreads too thin.
- **MECHANISM:** `src/characters/index.ts` (init): one shared 128px canvas
  radial gradient in ink tint — alpha 0.8 center / 0.62 at 60% / 0 at edge
  ("BB's own blob shadows are hard dark ellipses"; a subtle 0.4 smudge
  disappears at grazing angles) — on a 4.2×3.2 ft plane per kid. Three
  measured traps: `generateMipmaps = false` (the mip chain averages a
  mostly-transparent texture toward zero and the shadow VANISHES at grazing
  angles); polygonOffset -1.5/-2 (just enough to beat lawn and dirt; -4 drew
  over the mound rubber); disc ~1.7 in off the ground (wins the depth test
  at 100 ft grazing distances). The sun's 2048px ortho shadow map over
  ±260 ft cannot ground a distant kid on its own.
- **EVIDENCE:** verdict-005/final vibe rows ("mound pitcher no longer
  floats").
- **PORT TARGET:** src/v2 render layer — attach in `CharacterFactory` (both
  model and proxy paths get one). Must not fight `groundContact.test.ts`;
  it's a render decoration, not a clip offset.

## 10. Anchor-matched low camera presets + delete-the-unframeable

- **WHAT:** Composition alone closed more of the BB gap than any asset change
  — kid-eye-height cameras solved against the anchor frames by projection
  check, plus the rule that a character that cannot be framed legibly is
  removed from the frustum, not shrunk.
- **MECHANISM:** `src/render/cameras.ts` `PRESETS` (feet; plate at origin, +z
  toward the mound):
  - `pitching: pos [2.6, 5.0, -11.2], look [-3.5, 2.0, 46], fov 46` —
    batter sx≈0.71 at 44% frame height, catcher separated at sx≈0.58 with
    the plate visible between them, pitcher sx≈0.46 over the shoulder,
    horizon sy≈0.44. Eye at 5 ft = a kid's head height.
  - `batting: pos [-12.2, 6.4, -11.8], look [3.6, 1.8, 46], fov 44` —
    batter sx≈0.22 at ~43% height, pitcher sx≈0.54, horizon sy≈0.43; the
    catcher is deliberately projected OFF-frame (worst case sx≈-0.12) —
    "accept losing him entirely over keeping the blob." Solver allowance
    worth keeping: projected extents under-read the built mesh by ~0.1 sx.
  - `high: pos [-42, 88, -34], look [6, 0, 52], fov 55, sway 0` (locked-off
    tactical).
  - Hard cuts only between presets (BB2026 cuts, never dollies) + a
    deterministic breathing sway (±0.09/0.06/0.05 ft, look target drifting
    at ×0.4 so it reads as handheld weight), driven by tick time.
  - Screen-side gotcha that cost a debug loop: the camera faces +z, so
    world +x lands frame-LEFT.
- **EVIDENCE:** verdict-002 "low anchor camera" ("closed more of the BB gap
  than any asset change this lap"); verdict-004 "anchor-matched batting
  preset" and "delete the unframeable"; verdict-final vibe 8 v 2.
- **PORT TARGET:** src/v2 render layer — the preset numbers go straight into
  `src/v2/render/cameraCues` (v2 is already in real feet, so they transfer
  unit-for-unit). Each preset must pass `cameraCues.test.ts` (a preset must
  see what it exists to show — which is exactly what the projection-check
  method above automates). The delete-the-unframeable rule lands in the
  render brief as camera-pass policy.

## 11. Lighting rig: warm key / cool fill / no true darks

- **WHAT:** One lighting recipe that keeps everything saturated and
  storybook — warm afternoon sun, cool shadowless fill, grass-bounce
  hemisphere, fog that cites the sky horizon color.
- **MECHANISM:** `src/render/lighting.ts`: hemisphere (sky blue / grass
  bounce green, 1.1) + warm key DirectionalLight 2.6 from the southwest at
  [-95, 140, -65] (kids at the plate lit on the camera-facing side, shadows
  falling toward first/outfield), 2048 shadow map over a ±260 ft box, bias
  -0.0004 / normalBias 0.6 + cool fill 0.5 from the opposite quarter ("no
  true darks anywhere") + `THREE.Fog` from 380 ft (beyond the fences, so
  the playfield stays saturated and only backdrop melts) in the sky's
  horizon color, so far scenery dissolves into the dome instead of
  silhouetting.
- **EVIDENCE:** verdict-final vibe row; palette provenance comments in
  `src/materials/palette.ts` (SKY_HORIZON "every fog cites this").
- **PORT TARGET:** src/v2 render layer — replace v2's baseline lighting
  values; numbers transfer directly (same units, same engine).

## 12. HUD sticker language: one anchor object organizes the rail

- **WHAT:** The 9-v-1 HUD win: canvas-painted sticker kit where every
  element explains its position by its physical neighbor — carton grows a
  straw pole, cards hang off the pole, the button docks under the cards.
- **MECHANISM:** `src/ui/art.ts` + `src/ui/widgets.ts`, all Canvas2D drawn
  at runtime from the palette (no image assets):
  - Anchor chain: `juiceCarton()` bottom-right → `strawPole()` rises from
    it (appended FIRST so everything draws over its base) →
    `buildPitchStack()` right-edges ~17 px left of the pole →
    `buildChangePitchChip()` docks beneath the stack.
  - Hand-hung jitter: per-card constant rotations +2.2/-2.4/+2.6/-2.8° with
    a few px horizontal stagger; the VALUES matter — under ±2° read
    machine-aligned across four verdicts. Tap targets stay rectangular.
  - SPECIAL card tucks INTO the stack head: overlapping margin (-10 px),
    hung lower, loud -4.6° tilt — a gap + mild tilt read as "floats
    unrotated off-stack."
  - Sticker grammar (`pitchCard`, `sticker()`): rounded rect + thick
    colored border + offset drop shadow + hand-drawn glyph; selected state
    = yellow ring + color shift, not scale.
  - `buildScoreboard()`: cream notebook-paper chassis (gradient) with
    dark-green chalkboard strips INSET for the data rows — "paper outside,
    chalk inside"; steam-02 reads white/cream at a squint, never green
    edge to edge. Rot -1°, chip stickers at -1.5°/+1.2°.
  - Canvas portraits (`portrait()`): flat-drawn face (skin ellipse,
    sclera+pupil, smile stroke, cap) — more facial charm than any 3D head
    in either build; also the shape grammar the 3D face spec was stolen
    from.
- **EVIDENCE:** verdict-001 (portraits, sticker kit), verdict-005 (anchor
  object, jitter numbers, scoreboard), verdict-final HUD 9 v 1.
- **PORT TARGET:** v2's DOM/CSS HUD under `audit:v2-layout` — one
  absolutely-positioned rail div with the pole as canvas background and
  cards as children; jitter as CSS transforms. Canvas generators port
  as-is (they're plain Canvas2D + palette).
- **ADAPTATION:** the spike lays out at fixed 1600×900-ish px; v2's HUD
  pins sizes with `clamp()` and the audit runs at those sizes — restate
  the rail's positions in v2's layout system, keep the rotation/overlap
  numbers. Hit targets must stay rectangular and meet the audit's minimum
  sizes.

## 13. Two-depth backdrop parade + parameterized clutter with yard logic

- **WHAT:** The venue +3 in one pass: fence row → house row → hedge/tree
  fill, with the rule that no fence run longer than ~15% of frame width
  shows bare planks, and every prop a parameterized placement function.
- **MECHANISM:** `src/field/yard.ts` `buildYard()` + `src/field/flora.ts`
  `buildFlora()`:
  - Depth 1 near houses (4, candy colors, pitched roofs, real window
    units, doors, chimneys) at z 258–335; depth 2 back row (5, TALLER
    24–26 ft walls, varied silhouettes) at z 322–392 whose upper stories
    peek over the near roofs — "street behind a street." Hedge runs
    bridge the gaps between back-row houses so the layer reads continuous.
  - Canopy variety: three tree species (broccoli crown / conifer /
    poplar column) at deliberately uneven scales, pines interleaved to
    break the clone repeat; distant treeline of flattened blobs the fog
    melts together.
  - `house()` / `shed()` / `truck()` / `laundryLine()` / `doghouse()` /
    `pole()` + `wires()` (quadratic-Bézier catenary sag crossing the
    upper frame, a second higher run drifting to the distance) /
    `badmintonNet()` / `swingSet()` — each a parameterized function
    (position, rotY, rng), so corners get filled by PLACEMENT CALLS, not
    bespoke meshes. Yard logic: the laundry line hangs high enough to
    clear the 6.5 ft fence; cloth reads against the cream siding.
  - In-yard corner kit (picnic table, cooler, sandbox, wheelbarrow)
    placed by solving against BOTH plate frustums (pitching yaw -43°..+31°,
    batting -21°..+51°) so each camera's deep corners are filled.
  - Frame geography convention documented at the top of the file
    (+x = frame-left) so placement reasoning survives the port.
- **EVIDENCE:** verdict-005 "two-depth backdrop parade" and "named clutter
  props with yard logic" (venue 5→8 in one lap); verdict-final venue 8 v 2.
- **PORT TARGET:** `src/v2/render/Scenery.ts`, inside its draw-call and
  triangle budgets — everything is behind the fence, so v2's
  `venue.ts` concave-fence gate is untouched. Port the layering rules and
  the prop-as-parameterized-function pattern; re-solve corner placements
  against v2's actual camera cues.
- **ADAPTATION:** budget check first — the spike never counted triangles.
  If the full parade blows Scenery's budget, the priority order inside the
  entry is: second depth row + hedge gap-fill > wires/poles > clutter props.

## 14. Canvas texture recipes: mow bands, wobbly chalk, worn surfaces

- **WHAT:** Procedural Canvas2D textures that sell "someone mows this lawn /
  hand-limed these lines" — the material layer under everything above.
- **MECHANISM:** `src/materials/textures.ts` (all seeded via
  `subRng(baseSeed, name)` so every surface is reproducible):
  - `buildGrass()` 1024², tiles 48 ft: 6 mow bands as parity of a wobbled
    band coordinate (sine wobble + value-noise, soft ~1 ft transition)
    mixing GRASS_LIGHT/DARK; fbm blotches drifting warm at highs / cool at
    lows ("sun-dried lawn"); ~3600 quadratic-curve tuft strokes in light
    and dark passes; 9 worn straw patches; 34 dandelions + 22 clover dots.
  - `buildChalkLine()` 1024×128, tiles 24×2 ft: line center wobbled by
    three INTEGER x-frequency sines (so the strip tiles end to end) ± 8/4.5/
    2.5 px; width varying 19±6 px + noise; crumb alpha noise; worn-through
    stretches (gap noise < 0.22 → alpha ×0.35); 240 over-spray dust specks.
  - `buildDirt` / `buildWood` (plank hue jitter, grain, knots) /
    `buildSiding` / `buildRoof` (optional moss flecks) / `buildBunting` /
    `buildFoliage` / `buildMetal` — same grammar per material.
  - `src/materials/palette.ts` is the single hex source (~90 named
    constants with provenance comments); every texture and material
    resolves palette keys.
- **EVIDENCE:** verdict-001 "mow bands + wobbly chalk"; verdict-final vibe
  row names "no texture grain" as the REMAINING gap — these recipes are the
  floor the authored-texture work builds on.
- **PORT TARGET:** src/v2 render layer. Note the shared-file rule:
  `src/art/fieldTexture.ts` is the one place that already gives v2 v1's
  speckled dirt and worn chalk through the `TexGraphics` shim — the mow-band
  and tuft recipes should extend THAT file (shared, never copied) rather
  than landing as a second texture implementation; palette additions go to
  v2's color source. New surface recipes (wood/siding/roof/foliage) ride
  with Scenery.

---

## Explicitly not harvested

- **The ctx event bus, beat state machine, and capture scaffolding** — spike
  plumbing; v2 owns its own loop, sim, and event flow.
- **The spike's rng module** (`src/core/rng.ts` / `characters/rng.ts`) —
  v2's injection rules and `subsystem-seed` pattern already exist; only the
  *draw-once-at-init* discipline ports (entry 7).
- **Procedural hero faces/hair as an end state** — verdict-final's ceiling
  section (below) is unambiguous: expression acting, signature hair identity,
  and painterly texture warmth need authored assets. Entries 1–4 feed the
  authored pipeline (Blender sources, `authored-character.test.js`, the
  Junebug rubric pilot); they do not replace it.

---

## The honest ceiling of procedural-only art

Carried verbatim in substance from `spike-bb26/critic/verdict-final.md` — the
five things the spike still cannot do, which bound what any port of the
inventory above can achieve:

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

Ceiling estimate: procedural-only tops out around the spike's 7–9 band. The
points from there to 10 are authored assets — faces that act, hair with
identity, painted texture — which is precisely the Phase B pipeline (Blender
sources, `authored-character.test.js`, the Junebug rubric pilot) that the
spike's specs now feed.
