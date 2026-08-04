# src/art/ — AI brief

v1's character art and the 3/4 camera. Loaded when you touch anything here.
Scene rules are in `src/scenes/AGENTS.md`.

Character art is **generated once in `BootScene`** as modern toy-brand SVG — no
image files. `CharacterArt.ts` builds an SVG string from `VisualParams` and a
pose; `textureFactory.ts` turns each into a Phaser texture keyed via
`poseKey(id, pose)`.

## The lighting convention

**One warm key light from the UPPER-LEFT, everywhere.** Shadows are cool (mixed
toward navy), highlights warm. `gradientDefs` builds per-kid gradients from the
palette and filled regions use them via `Ctx.gSkin`/`gJersey`/`gPants`. The field
agrees: the sun draws top-left, the mound is a lit dome, and
`art/fieldTexture.ts`'s shared `shadeInt`/`lightenInt` mirror the same mix. Keep
any new art on this light or kids look pasted on.

⚠️ **Never put a gradient on a STROKE.** `objectBoundingBox` gradients are
undefined on zero-width bboxes (straight limbs), so `capsule()` limbs keep an
offset highlight-stroke instead.

## Hair

**Hair is modelled, not a flat blob.** Every style carries a warm upper-left
`sheen`, `strands` following the hair's flow, and a hairline `shade` — all
**CLIPPED to the style's own silhouette** via `clipped()`. Unclipped, the strokes
run past the hairline and read as scratches on the forehead. Mass and clip share
one named path constant so they cannot drift apart.

- `hair()`/`hairRear()` take **pre-computed fills**: the two gradient refs plus
  FLAT `lite`/`shade` derived from the kid's real hair colour at the call site.
  Deriving a shade from `'url(#...)'` NaNs, and a gradient cannot live on a
  stroke — which is what the strand work is.
- **`GRAD.HAIR_LITE/HAIR_DARK` lead the gradient set.** Hair once carried the
  weakest highlight and strongest shadow of any gradient, which on near-black
  hair left nothing to see.
- The rear dome reaches the **nape**, not the crown; stopping short is what makes
  a rig batter read as a bald ball wearing a hair sticker.
- **Layering rule: side poses draw `h.back` BEHIND the body and pass only
  `h.front` to the head** — and any pose that MOVES the head (slide, dive) must
  carry `hBack` inside the head transform, or afros float loose or cover faces.
  A regression test in `art.test.ts` enforces the order.

## Per-kid geometry

`BodySpec` (height/shoulderW/hipW/belly/neck/headW/headH), `FaceSpec`
(eyeGap/eyeSize/eyeStyle, nose, mouthW as a scaleX wrapper so the tested mouth
paths never change, cheeks) and `HairSpec` (volume/length/part/wisps) are all
range-CLAMPED in their builders, so a content typo cannot clip the viewBox.
`bodyType` is just the preset the spec overrides.

- `hairXform` applies as a scale **about the HEAD CENTRE**, so a bigger afro
  grows outward instead of sliding off the skull.
- **Head geometry only scales through the headGroup-internal wrapper.**
  `headXform(c)` is emitted INSIDE `headGroup`/`headRearGroup` so pose-level head
  transforms compose for free — but back hair layered BEHIND the body must wear
  the same transform via `wrapHeadBack(c, h.back)` at every concat site. Never
  scale hair or face outside that wrapper.
- A content test asserts **no two kids share a hair style + colour + skin
  signature**, and that every haired kid carries a spec. Hair was once the one
  feature axis with no spec, which is why six kids rendered a byte-identical path.

⚠️ **All pose art must bottom out on the same ground line** (`GROUND`). Sprites
use `setOrigin(0.5, 1)` and swap pose textures in place, so a pose whose lowest
ink sits higher or lower makes the kid visibly pop or sink when a run cycle
starts. The per-kid height scale anchors at `(100, GROUND)` for the same reason —
an art test asserts it. Never re-anchor at the viewBox centre or short kids float.

## The batting stance is MEASURED, not eyeballed

`art.battingStance` and `art.batOcclusion` hold the numbers, and
`conformance.test.js` DERIVES the fractions from the exported
`BAT_STANCE_GEOMETRY` — so editing the pose without editing the record goes red.

- Four fractions are conformed: hand height, bat length, and — the tight one —
  **the bat tip never rises above the crown**. Bat ANGLE is per-character; no
  band is claimed for it.
- **Conforming on those four was NOT enough**, because the quantity the rig
  batter was wrong on had never been measured: what is allowed in FRONT of the
  bat. The reference bat is occluded only at the hands and is unbroken from there
  to the tip — **the reference head never crosses its bat.**
- Two constants fix it and both are load-bearing: **`HEAD_SHIFT_REAR`** (shifts
  the head AWAY from the bat) and **`TURN`** (narrows the jersey back so the
  hands sit OUTBOARD of the silhouette and the bat has somewhere to go).
  **FRONT and REAR are deliberately NOT mirrors** for this reason. An art test
  walks every stance variant in both views and requires the bat's axis to run
  outside the kid's real skull.

`VisualParams.stance` reshapes the stance per kid via the `BAT_STANCE` table with
NO extra textures; **swing frames deliberately converge to ONE geometry**, so
stance shapes only the load.

## Bats and hands

- **`batProp` is ONE tapered silhouette** — barrel ≈2.6× the handle with a flared
  knob — never a uniform rod, always placed through `batAt`, which scales it
  along its OWN AXIS about the grip: **length only, never width.** Scaling
  uniformly makes a long stance bat proportionally fatter and it reads as a plank.
- **Hands are drawn, never circles.** `fist()` builds a palm block, thumb and
  knuckle hints; `gripPoints()` puts two of them ON the bat-handle axis, and
  every bat grip goes through `gripFistFar`/`gripFistNear` with the top fist
  `flip`-mirrored so the thumbs OPPOSE. ⚠️ `flip` mirrors AFTER the rotation, so
  the far helper takes a pre-mirrored angle. `openHand()` covers spread fingers;
  gloves always go through `mitt()`.

## Poses

`stand` · `run1`–`run4` (drawn facing right, flipX for left) · `cheer` · `bat` ·
`windup`/`windup2` · `ready` · `slide` · the rear pair `batRear`/`catchRear` for
the rig · the REACTION set `upset`/`nervous`/`dodge` (front stands whose baked
face OVERRIDES the kid's resting expression) · the ACTION set
`throw`/`catch`/`dive` · and the SWING frames `swingLoad`/`swingMid`/`swingFollow`
plus rear twins.

- **The rear batting stance is a TURNED three-quarter, not a flat rear
  elevation.** `turnedTorsoRear` narrows the jersey back, `turnedShoulders` rides
  that narrowed torso so the hands sit outboard, `turnedLegsRear` staggers the
  feet, and the far arm's upper segment is drawn BEFORE the torso so the turn
  hides the crossing run. All four rear batting frames share those three helpers,
  so the batter cannot pop between stance and swing.
- **Rear poses call NO `face()`** — the rear-no-face invariant. The batter's
  stance turns a quarter toward the pitcher via `headRearGroup`'s `profile` flag
  (cheek/nose bump and one profile eye), which adds no face colours.
- `swingMid` FORESHORTENS the bat (scaled about the grip) so a level barrel stays
  inside the viewBox; `swingFollow` layers torso → bat → near arm in both views,
  so the finish never vanishes behind the body.

## Textures come in two sizes

The base tier renders at 1.2× the viewBox (near display size — SVG-rasterizer
downsampling beats GPU minification) and the rig-only hero tier (`:hi`, 2.4×)
serves the behind-plate close-ups. `heroKey()` composes AFTER the team suffix and
`BattingView` is its ONLY consumer.

⚠️ **Do not "fix blur" by cranking the tiers up** — oversized textures get
GPU-minified into mush, which WAS the old blur. If a new render site displays
kids large, give it `heroKey` instead. The remaining softness is the framebuffer
being CSS-upscaled on retina: renderer-level, not a texture problem.

## The team-variant resolver

`poseKey(id, pose)` silently appends a per-id suffix when
`setTeamVariant(ids, teamSuffix(color, logo))` is armed, so the whole render
layer wears team colours with **zero per-call-site changes**. Street clothes are
the same mechanism with `STREET_SUFFIX`.

⚠️ **NEVER call `img.setTexture(plainId)` in a game scene** — always
`poseKey(id, 'stand')`, or the sprite silently drops its jersey.
⚠️ **Logo emoji in the badge must be XML numeric entities** — raw astral-plane
characters mangle through the base64 data-URI path.

## The camera

`projection.ts` is the 3/4 camera (`project`/`unproject`/`depthScale`) and stays
render-side and testable. **Never import it from `systems/`.**

- **`unproject` inverts y BEFORE reading depth.** Depth is a question about the
  flat field, and reading it off a screen row skews every pointer.
- **`depthScale` takes a LOGICAL point and is NOT multiplied by `ZOOM`** — the
  field grows, the kids do not.
- Anything drawn in field space must go through `project`; the sky and skyline
  FOLLOW the fence arc rather than a hardcoded horizon.
- A non-uniform zoom is deliberately rejected: stretching x would drag the drawn
  foul slope outside the band `geometry.foulSlope` is conformed to. The current
  zoom is `known-drift` at a measured value — see `geometry.fieldScale`, which
  also records why the remaining gap is STRUCTURAL (four constraints pin it).

`fieldTexture.ts` is the deterministic field-dressing kit shared by `drawField`
and the rig backdrop. **RNG-free by contract** — index-hash math ONLY, never
`Math.random`, so create-time draws cannot shift the goldlog stream.

⚠️ **SVG textures need base64 data URIs.** Phaser's `load.svg` calls `atob` on
them, so URL-encoding throws `InvalidCharacterError`.
