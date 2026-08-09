# src/v2/render/ — AI brief

Characters, rig, clips, assets and camera for v2. `src/v2/AGENTS.md` has the sim
rules and the membrane between the two; the root `AGENTS.md` has the v1/v2 split.

**This layer reads sim state and never writes it.** `bridge.ts` is the single
named coupling point and owns no policy — the camera is `cameraCues.ts`, the
clips are `AnimationDirector`. It also draws the defence BETWEEN pitches;
skipping that leaves the park empty until contact and every kid in a bind pose,
which no test sees and one screenshot does.

**Camera policy is PURE** (`render/cameraCues.ts`, no `three` import) — the heir to v1's
rule that projection stays render-side and testable.

## Scale and the camera

- **Render-only exaggeration must never leak into the sim.** `CHARACTER_SCALE`
  draws a kid larger than he is; catch radii, reach, stride and collision stay
  real feet. `render.characterPresence` records why the field scale and the
  character scale are jointly unsatisfiable at real units, and why the answer is
  camera distance rather than giant kids.
- **A camera preset that has never seen a scene is a guess.** Look through it
  before trusting its comment.
- **⚠️ A projection test cannot see OCCLUSION.** Projecting the bases through a
  preset and asserting they land in frame passes for a view where a catcher fills
  the middle of the frame, because a point behind him projects to the same pixel
  as one in front. Raycast against the live scene instead. Height cannot fix an
  occluded plate and clearing a catcher over the top needs an absurd bird's-eye,
  so the eye is OFFSET — the smallest offset that clears every sample point. The
  framing that buys is honestly poor and is recorded as `render.pitchFraming`
  for a camera pass: **do not retune the eye until a screenshot looks better**,
  because the binding constraint is occlusion and only a raycast can see it.

## The rig

- **The rig must sum to the height it claims.** `crownHeightFt(SKELETON)` must
  equal `REFERENCE_HEIGHT_FT` EXACTLY, and a built proxy's drawn bounding box
  must top out at `heightFt × CHARACTER_SCALE`. Both are pinned in
  `skeleton.test.ts` because nothing computed the sum while every consumer read
  the constant and believed it — and stride, foot plants and dive travel are all
  authored in absolute feet. `render.rigHeight`. Corollary: the proxy DERIVES its
  head radius from the crown; never hardcode it back.
- **Summing to the right height does not make the drawing right, and a
  bounding-box test cannot tell.** It measures one point of one fixture, so it
  stays green over a bobblehead, a torso wider than it is tall, open air where
  the neck goes, and dozens of hair × accessory combinations measured by nothing.
  Four rules, all in `skeleton.test.ts` § "the proxy draws a kid, not a
  bobblehead", all verified to fail against the code they replaced:
  - the drawn head span must equal the BONE span, with the radius derived against
    the same height so no kid's crown floats off its own bone;
  - hair gets a headroom BUDGET with a FLOOR as well as a ceiling — a ceiling
    alone cannot see a spike buried inside the skull;
  - the body must be vertically continuous under a solid-span ray cast;
  - **hair and accessories anchor to the head SPHERE, never the `Head` bone.**
    Off the bone they line up for exactly one value of `HEAD_RISE`.
- **`ball(at, r, scale)`'s third argument is a dimensionless SCALE.** Anything
  sized in feet uses `blob()`, which takes half-extents.

## The face you cannot see

**A feature swallowed by what is in front of it changes no extreme and no ray
span, so the silhouette tests are blind to it.** Rules, with numbers in
`render.proxyFace`:

- **Every face feature goes through `onSkull()`** — latitude on the ellipsoid,
  sunk a fixed fraction of the radius, so the margin is constant for every kid.
  At a fixed absolute depth, a wide-headed kid's face bulges past the constant
  and a brow is swallowed outright.
- **A wide hair style needs two parts, not one.** Pulling a convex ball back far
  enough to clear the eyes clears the forehead too, so the ball carries the
  silhouette and a skull-hugging cap carries the hairline.
- **The brow is the kid's own hair colour, SHADED** — raw hair colour vanishes on
  pale-haired kids and ink vanishes into the near-black ones.
- **Identity can never come from COLOUR.** The nose is skin-coloured on a
  skin-coloured head, so a colour-keyed test passes with the nose deleted. Key on
  tagged index ranges, threshold as RATIOS against the same feature on a bald
  kid, and vary head width explicitly — a fixture at nominal width cannot see a
  defect that only exists above it.
- The proxy carries a FACING CUE and never a face; expression is the `face_atlas`
  texture on delivered models, and there is deliberately no mouth. A featureless
  head is rotationally ambiguous at thumbnail size, so the review page could not
  otherwise catch a clip authored backwards.

## Clips

**`clips.ts` is the animation contract, in code and PURE** (no `three`): frames,
loop flags, marker frames, blend, `authoredSpeedFts`, `bodyTravelFt`,
`returnsTo`, and the rate maths, so timing is testable with no mixer.
`docs/v2/animation-brief.md` and `docs/v2/asset-contract.md` are MIRRORS of that
table, and `clips.test.ts` parses them and fails on drift — edit the table, then
the docs, in one change.

Three fields carry weight the brief originally left unstated: `authoredSpeedFts`
(playback rate is `simSpeed ÷ authored`; without it feet skate at every speed),
`bodyTravelFt` (a dive's travel IS the reach the sim grants — mismatch and the
glove catches balls the sim scored as missed; a slide's must stay ~0 because the
basepath track is sim-owned), and `returnsTo` (the settle graph that makes "no
popping" checkable).

- **`AnimationDirector` is the only place clips are played**, because
  `playToMarker(clip, secUntilEvent)` warps playback so the marker lands on the
  simulated instant — animation is then structurally unable to desync from
  physics. Marker clips therefore need a WIDER rate band than loops: clamping to
  the loop band puts a late bat through the ball rather than slowing the swing.
- **A marker frame is DERIVED from the motion, not read from the file.** glTF
  cannot carry a named marker, so `validate-models` finds the event: peak hand
  SPEED for contact and release, full glove EXTENSION for a catch. The second is
  not stylistic — on a jumping catch the fastest the glove ever moves is the
  take-off, several frames before the ball. `modelRules.mjs` and
  `AnimationDirector.test.ts` run the same derivation on purpose; if they
  disagree the gate is checking something the engine does not believe.
- **A clip is authored freely and then SET DOWN**, by one solved rigid Y offset —
  bending a knee without dropping the hips lifts a kid's feet rather than lowering
  him. Keep it **per clip, never per key**: a per-key plant glues the lower foot
  down and deletes a run's flight phase. Never hand-tune a `hips` height to fake
  contact.
- **Measure the POSED skeleton, never a geometry's raw `position` attribute.**
  Those are BIND vertices and the CPU never sees the skinned result, so a `Box3`
  reads a crouching kid at his STANDING height — how `render.pitchFraming` came to
  blame a camera for an animation bug. `Raycaster` applies the bone transform;
  `Box3` does not.
- **Quaternion tracks are LINEAR only.** Setting smooth interpolation on a
  quaternion track logs "unsupported interpolation" and silently falls back —
  console noise that invites believing the curve is smoothed when it is slerped.
- **Nothing is blocked on the animator.** `render/proceduralClips.ts` ships stand-ins for
  every clip name, deliberately correct about TIMING and CONTRACT and deliberately
  not about look, so the director, the marker warp, the loop-seam check and the
  review page all run today. A delivery replaces them CLIP BY CLIP — the director
  prefers a delivered clip by name. Watch them at `/v2/?anims=1`, which labels the
  clip under REVIEW and the clip actually PLAYING separately: a one-shot settles
  into its `returnsTo` when it ends, and counting the settle clip's time against
  the reviewed clip's frame count prints a frame past the end.
- **Character acting belongs in `performance.ts`; `AnimationDirector` joins body
  and face.** No call-site clip or expression policy.

## Characters and models

- **`render/CharacterFactory.ts` is the ONE place that decides model-or-proxy**:
  `?proxy=1` or absent manifest entry → proxy silently; load failure → proxy plus
  ONE warning per character. Nothing downstream branches on the result — both
  implement `KidView`.
- **`modelLoader.ts` is the only file that loads a `.glb`**, the same way
  `net/peer.ts` is the only one that imports peerjs. A second loader silently
  gets no Draco decoder and no KTX2 support detection, and fails on the first
  compressed model at runtime on whichever device fielded that kid. The decoders
  are **committed** under `public/v2/decoders/` (they are fetched by URL, so a
  bundler never sees them and `node_modules` 404s in the built site) and
  `scripts/v2/sync-decoders.mjs --check` runs in `npm test`.
- **A model's bones must be parented to the character root, OUTSIDE the LOD.** In
  a `.glb` the joints are siblings of the meshes, so lifting the LOD nodes into a
  new group orphans the skeleton: world matrices never update, every vertex skins
  against a stale bind matrix, and the character draws NOTHING while still
  reporting a mesh, a LOD level and a shadow caster. Inside a level is equally
  wrong — a LOD hides every level but the active one, so the kid vanishes on
  walking away.
- **`lodBias` DROPS the nearest levels, it does not scale distances.** Scaling
  distances would still upload the finest level's triangles to a device that must
  never draw them. The switch distances are DERIVED from apparent PIXEL size
  (`lodDistancesFt`), so they follow the kid being drawn rather than one camera
  and one screen.
- **Generated roster deliveries must keep the 2-draw character cost** — one
  merged colour pass plus one hull. Preserve all four GLB slots and the explicit
  `recessVertexPalette` opt-in; see `render.characterDrawCost`.
- **Outline hulls are SIBLINGS, never children.** A skinned hull parented under
  its skinned mesh inherits the already-posed world matrix and skins a second
  time — every character renders as a solid blob. `attachOutline` throws if the
  mesh is not in the scene graph yet.
- **Expression is `face_atlas`, and ONLY on delivered models.** `faceAtlas.ts` is
  pure (no `three`) and owns the cell order; the asset contract is parsed against
  it. **Cell 0 is TOP-left, so the row index is V-flipped** — getting that
  backwards is not a crash, it is a roster wearing the wrong expression. The
  atlas rides the body material's emissive channel, because glTF has no second
  albedo channel and emissive is the one map the toon shader otherwise ignores.
  `setExpression` is a deliberate no-op on a proxy.

## Assets

- **Two asset directories, two jobs, and conflating them is the mistake.**
  `assets/v2/` is the artist's directory and the validation INBOX; only
  `public/v2/models/` ships. "It validated" and "it ships" are separate,
  deliberate acts, and `npm run validate:models` scans both.
- **Runtime URLs resolve against `document.baseURI`, never `import.meta.url`.**
  Under the relative base those differ in the build and agree in dev — the bug
  that works locally and 404s in production.
- **The delivery manifest is a generated `manifest.json`, NOT `import.meta.glob`.**
  Vite copies `public/` verbatim and then emits every globbed file AGAIN as a
  hashed bundle asset, which is megabytes of duplicate `.glb` at roster scale.
  `npm run manifest:models` writes it and `manifest.test.js` fails if it drifts — a real model dropped
  in without a manifest entry renders as a proxy forever, silently and
  correctly-looking.
- **`ProxyCharacter.ts` builds a kid from primitives on the shared skeleton** — it
  is both the acceptance test for the spec and the reason no engineering is ever
  blocked on art. `npm run export:proxy-kid` writes a contract-legal stand-in
  `.glb` from it, and refuses to write a level over its triangle budget rather
  than renaming a level.
- **`export-roster-kid` is the deterministic first-party delivery path.** It
  emits three LODs plus each kid's face atlas and never marks output `STAND-IN`.
  `manifest.test.js` requires every `ROSTER` id. Review with
  `?spike=1&roster=1` or `?spike=1&kid=<id>`.
- The artist-facing copy is `docs/v2/asset-contract.md`;
  `scripts/v2/validate-models.mjs` is its teeth, and a failure names the rule AND
  why it exists.

## The HUD

**One CSS rule replaces a whole class of gotcha:** `#hud` is
`pointer-events: none` and `.interactive` opts back in. Every tap that is not on
a HUD control falls through to the canvas *by construction*, so v1's "a
scene-level pointerdown fires on ANY tap, so corner buttons must stop
propagation" simply cannot happen here.

## Where things live

| File | What it owns |
|---|---|
| `src/v2/render/clips.ts` | the animation contract, in code and pure |
| `src/v2/render/AnimationDirector.ts` | the only place clips are played |
| `src/v2/render/proceduralClips.ts` | crude stand-ins for every clip name |
| `src/v2/render/CharacterFactory.ts` | the one seam that decides model-or-proxy |
| `src/v2/render/CharacterModel.ts` | a delivered `.glb` made playable: LODs, material slots, face atlas, outlines |
| `src/v2/render/ProxyCharacter.ts` | a kid built from primitives — the acceptance test for the skeleton spec |
| `src/v2/render/modelLoader.ts` | the only `GLTFLoader`, with Draco and KTX2 wired |
| `src/v2/render/assets.ts` | runtime URLs against `document.baseURI`, and the delivery manifest |
| `src/v2/render/faceAtlas.ts` | the 4x4 expression grid, pure |
| `src/v2/render/skeleton.ts` | the rig spec that `docs/v2/asset-contract.md` mirrors |
| `src/v2/render/Scenery.ts` | the merged, deterministic neighborhood beyond the fence |
| `src/v2/render/bridge.ts` | the single sim<->scene coupling point |
| `src/v2/render/cameraCues.ts` | camera POLICY, pure |
| `spike/AnimSpike.ts` | `/v2/?anims=1`, the acceptance surface for the animation brief |
