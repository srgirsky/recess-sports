# Recess Sports — 3D character asset contract (v1 of the spec)

**This is the artist-facing document.** Everything in it is machine-checked by
`npm run validate:models` (`scripts/v2/validate-models.mjs`) **except the
welded-normals rule in §4**, which Draco compression puts out of the validator's
reach and which is called out where it appears. Run the validator before sending
anything: rejections are automatic and free, and a model that passes it — plus
an eye on that one rule — is accepted.

The engine-side source of truth is `src/v2/render/skeleton.ts` (the rig) and
`src/v2/render/clips.ts` (the clip library). If this document and those files
ever disagree, the files win — and that is a bug in this document. Tests parse
this file and fail on drift, so it cannot stay wrong for long.

---

## Why the rules are strict

All 30 characters are modelled individually, but they are all bound to **one
skeleton** and animated by **one shared clip library**. Optional per-kid takes
can replace selected clips without forking the mechanics. That keeps character
#31 cheap while allowing the cast to stop moving like one performer. Every hard
rule below exists to protect that.

---

## 1. Global conventions

| | |
|---|---|
| **Scale** | 1 unit = **1 foot** |
| **Up axis** | +Y |
| **Facing** | +Z |
| **Origin** | on the floor, between the feet |
| **Pose** | T-pose: arms along ±X, palms down, feet parallel |
| **Height** | floor to `HeadTop_End`, **3.6–4.4 ft** (see the per-kid manifest); the reference rig is exactly **4.0 ft** |
| **Format** | glTF 2.0 binary (`.glb`), single scene, single skin |

Head is **32% of total height** — the `Head` joint sits at 2.706 ft on the 4.0 ft
reference rig, so the head is the segment from there to `HeadTop_End`. Toy-chibi,
but deliberately less extreme than the 2D art it replaces (~45%). At real 3D
depth an oversized head stops reading as stylised and starts reading as a
bobblehead. (This said "~30%" while the engine's own proxy drew 37%; both now
say what the bone table says. See `render.proxySilhouette` in
`scripts/measures.json`.)

**Height is measured on the BONE, never on the mesh.** Hair may rise above
`HeadTop_End` — up to 4% of body height, so an afro is still an afro — but body
geometry may not, and neither may a hat.

---

## 2. The skeleton — `skeleton_recess_v1.glb`

**33 mandatory bones. Identical names, identical order, identical bind-pose
transforms in every model.** The validator hashes the bind pose; a 2mm nudge to
a shoulder is a build failure, because it would show up later as unexplained
animation drift across a subset of the roster.

```
Root · Hips · Spine · Spine1 · Spine2 · Neck · Head · HeadTop_End
{Left,Right}Shoulder · {L,R}Arm · {L,R}ForeArm · {L,R}Hand
{L,R}HandThumb1 · {L,R}HandIndex1
{L,R}UpLeg · {L,R}Leg · {L,R}Foot · {L,R}ToeBase
Prop_BatGrip (child of RightHand)     Prop_GloveAnchor (child of LeftHand)
Prop_BallAnchor (child of RightHand)  Prop_CapAnchor (child of Head)
Prop_HairAnchor (child of Head)
```

Up to **6 optional secondary bones** may be added per character
(`Hair_01..03`, `Accessory_01..03`). **Hard cap: 42 bones total.**

Bone names are Mixamo-style so off-the-shelf retargeting tools work.

The rig file carries a two-triangle placeholder mesh bound to `Hips`, without
which glTF importers build 33 loose empties instead of an armature. It is not
part of any deliverable — delete it.

Generate it with `npm run export:skeleton`; it is emitted from `SKELETON`, never
hand-edited, so the file and the code cannot disagree.

---

## 3. The animation library — `anims_recess_v1.glb`

Authored **once**, on the canonical skeleton, **with no mesh**. 30 fps.

**No root motion in any clip.** The game owns position; a clip that translates
`Root` will be rejected. Run cycles run in place.

43 clips: `idle` · `idle_fidget` · `run` · `run_fast` · `trot` · `jog_back` ·
`shuffle_left` · `shuffle_right` · `bat_stance` · `bat_load` · `swing_contact` ·
`swing_follow` · `swing_whiff` · `bunt` · `pitch_windup` · `pitch_stride` ·
`pitch_release` · `field_ready` · `field_scoop` · `catch_high` · `catch_chest` ·
`catch_low` · `catch_jump` · `dive_left` · `dive_right` · `getup` ·
`throw_overhand` · `throw_quick` · `slide` · `cheer` · `cheer_cool` ·
`cheer_fierce` · `cheer_goofy` · `cheer_tender` · `upset` · `upset_cool` ·
`upset_fierce` · `upset_goofy` · `upset_tender` · `nervous` · `dodge` ·
`walk_on` · `pose_card`

Full frame counts, loop flags, authored ground speeds and blend targets are in
`docs/v2/animation-brief.md`, which is the artist-facing copy of the same table.

### Character takes — `anims_<id>_v1.glb`

A character animator may deliver a **partial**, animations-only file for any
roster id, for example `anims_nostrike_v1.glb`. Every included clip uses the
same skeleton, naming, marker and motion rules as the shared library. It need
not repeat all 43 clips: at runtime its included names override the shared
version for that kid, while omitted names retain shared motion. A partial file
with no recognised contract clip is rejected.

Put the validated file in `public/v2/models/`, run `npm run manifest:models`,
then review it at `/v2/?anims=1&kid=<id>`. The review page marks character takes
with `★`, shared clips with `▪` and procedural failure fallbacks with `▫`.

### Marker frames (load-bearing)

Ten clips carry a named marker the engine syncs to the physics instant, so
animation can never desync from the simulation. **Frame counts are ±20%; these
frames are exact.**

| clip | marker | frame |
|---|---|---|
| `swing_contact` | `CONTACT` | 7 |
| `pitch_release` | `RELEASE` | 4 |
| `throw_overhand` | `RELEASE` | 11 |
| `catch_high` | `CATCH` | 8 |
| `catch_chest` | `CATCH` | 8 |
| `catch_low` | `CATCH` | 9 |
| `catch_jump` | `CATCH` | 13 |
| `field_scoop` | `CATCH` | 9 |
| `dive_left` | `CATCH` | 18 |
| `dive_right` | `CATCH` | 18 |

A marker cannot be carried in glTF as data, so the validator derives it: the
event frame must be where the relevant hand (or `Prop_BatGrip`) reaches peak
speed, within ±1 frame.

### Body travel

`Root` never moves, but the body may. `dive_left`/`dive_right` travel **3.0 ft**
(±0.35) laterally at the `Hips`, `slide` and `getup` **≤ 0.4 ft**, and every
other clip ≈ 0. This is a gameplay number: the diving reach the engine grants is
in real feet, and a clip that reaches further catches balls the sim scored as
missed. The validator measures it from the delivered file.

---

## 4. Per character — `kid_<id>.glb`

`<id>` matches the character id exactly (see `src/data/characters.ts`).

### Meshes
- Bound to `skeleton_recess_v1` with an **identical bind pose**.
- One skin, **at most 3 skinned meshes per LOD level** (body / hair /
  accessory), so at most 9 in the file.
- Three explicit LOD nodes in the same file. The triangle budget is for the
  whole level, summed over its meshes:

  | node | triangle budget |
  |---|---|
  | `kid_<id>_LOD0` | ≤ 7,000 |
  | `kid_<id>_LOD1` | ≤ 3,000 |
  | `kid_<id>_LOD2` | ≤ 1,200 |

- **Nothing but hair may be drawn above `HeadTop_End`**, and hair only by up to
  **4% of body height** (`HAIR_HEADROOM_FRAC` in `src/v2/render/skeleton.ts`).
  Height is measured on the bone; a hat that stands proud of the crown is a hat
  drawn wrong, not a taller kid. The validator checks the level's total extent,
  which is the part it can check on a Draco-compressed file. Which triangles are
  *hair* is a review question, not a machine-checked one.

### Normals — read this one twice
**Welded and smooth-shaded. No hard-edge splits on any surface that forms the
silhouette.** The outline is an inverted hull that offsets vertices along their
normals; a split normal tears a visible gap in the contour. This is the single
most common way a delivered model fails review.

⚠️ **This rule is reviewed by eye, not by the validator** — and it is the only
rule in this document that is. Draco compression puts the vertex data in a blob
the validator deliberately never decodes (a forgiving reader is a rejection it
would fail to make), so split normals are not visible to it. Check them
yourself before sending; nothing else will.

Optional: a **vertex-colour alpha** channel modulating outline width, so a
contour can taper into a fingertip.

### Material slots — exactly these names

| slot | contents |
|---|---|
| `M_Body` | skin + face. Face UVs must occupy their own island covering UV `[0..0.5, 0.5..1]`. |
| `M_Uniform` | jersey + pants. Procedural/default deliveries are white/greyscale; a finished identity-palette delivery carries literal `COLOR_0` plus material extra `recessIdentityPalette: true`. |
| `M_Hair` | |
| `M_Accessory` | cap / glasses / headband / glove. May be absent. |

The procedural/default path multiplies all of `M_Uniform` by team colour. A
finished character may preserve the signature wardrobe from their approved
turnaround by opting into `recessIdentityPalette`; in that case the literal
vertex colour survives and one small `M_Accessory` surface declares
`recessTeamAccent: true` to receive the drafting team's trim. This keeps team
readability without repainting the product's character identity.

### Textures

| map | size | notes |
|---|---|---|
| `albedo` | 1024² | |
| `face_atlas` | 512² | 4×4 grid, cells in this order: neutral · grin · determined · worried · upset · surprised · blink · wink · sleepy · angry · tongue · cheer · +4 spare. Ships in `M_Body`'s **`emissiveTexture`** slot — glTF has no second-albedo channel, and emissive is the one map the toon shader otherwise ignores. Cells read left-to-right, top-to-bottom, and a transparent pixel leaves the skin below it showing. |
| `mask` | 512² | optional. R = team-colour mask, G = outline-width, B = spare |

**No normal maps. No metalness/roughness.** The toon shader ignores them and
they would double the download for nothing.

**Expressions are texture-atlas swaps. Zero morph targets** — the validator
rejects any model that has them.

### Export settings
- glTF 2.0 binary, Y-up, +Z forward
- Single scene, single skin, **no cameras, no lights**, no unlit extension
- **Compression:** direct external deliveries use Draco position 14, normal 10,
  uv 12. The repository's authored Blender path instead keeps geometry in core
  accessors so it can remap joint indices, promotes Blender's transport-only
  `_RECESS_COLOR` into `COLOR_0`, removes unused buffers, then byte-normalizes
  colours and weights; both paths must stay under the same file cap.
- **KTX2 / Basis** textures: ETC1S q200 for `albedo` and `mask`, UASTC for `face_atlas`
- **≤ 400 KB per `.glb`**

---

## 5. Delivery sequence

The stage gates, visual evidence and pull-request handoff for this sequence live
in `docs/v2/character-production-playbook.md`; this section owns only the asset
delivery order.

1. Spec + validator written; the engine team builds a primitive **proxy**
   against the skeleton. The proxy is the acceptance test for the spec — if a
   clip reads correctly on it, the skeleton can express it.
2. **Animation library** commissioned first, from a specialist animator. It
   determines the feel of all 30 characters.
3. **One pilot character** at full rate → validator → look review → sign-off.
4. The remaining 29, in **batches of 5–6**, with validator sign-off per batch.

Nothing downstream is ever blocked waiting on art: the proxies play every clip,
carry each character's own body proportions and palette, and serve as LOD3 and
as the fallback when a model fails to load. `?proxy=1` forces them everywhere.

`npm run export:proxy-kid` goes one step further and writes a proxy out as a
contract-legal `kid_<id>.glb`, so the rules in §4 and the engine that consumes
them are exercised against a real file before any model exists. **Your delivery
replaces one of these**, kid by kid, with no code change. Stand-ins live in
`public/v2/models/` and are marked `STAND-IN` in the glTF `generator` string;
they are not deliveries and are never sent to anyone.

### Procedural roster baseline

The repository has a deterministic procedural path for unproduced roster kids:

```bash
npm run export:roster-kid              # every unproduced roster kid
npm run export:roster-kid -- turbo zippy
npm run validate:models
```

Unlike the fallback exporter, these files carry a UV-mapped `M_Body`, an
individual 4×4 `face_atlas` derived from the character's authored face data,
roster-fidelity silhouette details, and no `STAND-IN` marker. They are held to
the same rig, LOD, material, height and 400KB rules as an external delivery.
`manifest.test.js` requires a validated production file for every roster id,
but this path is not sculpt approval and must not overwrite an authored source
delivery.

### Blender-authored finished production

Finished character meshes are exported from `assets/v2/source/*.blend` with:

```bash
npm run export:authored-character -- nostrike
npm run review:character-fidelity -- nostrike
npm run validate:models
```

The wrapper supplies the canonical joint order from `skeleton.ts`, lets Blender
evaluate the authored geometry, remaps `JOINTS_0` and inverse-bind matrices
together, compacts palette/weight accessors and stamps the source and turnaround
hashes into the GLB. `character-production.json` binds those hashes to the
runtime file. `character-fidelity.json` and the generated review board record
front/profile silhouette, proportions, hair, clothing, face, hero/40-pixel read,
and authored-model run/contact deformation. Approval also requires a named
human approver and current evidence hash. A finished character cannot be
approved from validator output or a builder-entered score alone.
