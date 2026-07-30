# Recess Sports — 3D character asset contract (v1 of the spec)

**This is the artist-facing document.** Everything in it is machine-checked by
`npm run validate:models` (`scripts/v2/validate-models.mjs`). Run the validator
before sending anything: rejections are automatic and free, and a model that
passes it is accepted.

The engine-side source of truth is `src/v2/render/skeleton.ts`. If this document
and that file ever disagree, the file wins — and that is a bug in this document.

---

## Why the rules are strict

All 30 characters are modelled individually, but they are all bound to **one
skeleton** and animated by **one shared clip library**. That is what makes
animation a single fixed cost instead of a per-character cost, and what makes
character #31 cheap. Every hard rule below exists to protect that.

---

## 1. Global conventions

| | |
|---|---|
| **Scale** | 1 unit = **1 foot** |
| **Up axis** | +Y |
| **Facing** | +Z |
| **Origin** | on the floor, between the feet |
| **Pose** | T-pose: arms along ±X, palms down, feet parallel |
| **Height** | floor to `HeadTop_End`, **3.6–4.4 ft** (see the per-kid manifest) |
| **Format** | glTF 2.0 binary (`.glb`), single scene, single skin |

Head is roughly **30% of total height** — toy-chibi, but deliberately less
extreme than the 2D art it replaces (~45%). At real 3D depth an oversized head
stops reading as stylised and starts reading as a bobblehead.

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

---

## 3. The animation library — `anims_recess_v1.glb`

Authored **once**, on the canonical skeleton, **with no mesh**. 30 fps.

**No root motion in any clip.** The game owns position; a clip that translates
`Root` will be rejected. Run cycles run in place.

~33 clips: `idle` · `idle_fidget` · `run` · `run_fast` · `jog_back` ·
`shuffle_left` · `shuffle_right` · `slide` · `dive_left` · `dive_right` ·
`getup` · `bat_stance` · `bat_load` · `swing_contact` · `swing_follow` ·
`swing_whiff` · `bunt` · `pitch_windup` · `pitch_stride` · `pitch_release` ·
`field_ready` · `field_scoop` · `catch_high` · `catch_chest` · `catch_low` ·
`throw_overhand` · `throw_quick` · `cheer` · `upset` · `nervous` · `dodge` ·
`walk_on` · `pose_card`

### Marker frames (load-bearing)

Three clips carry a named marker the engine syncs to the physics instant, so
animation can never desync from the simulation:

| clip | marker | frame |
|---|---|---|
| `swing_contact` | `CONTACT` | 7 |
| `pitch_release` | `RELEASE` | 4 |
| `throw_overhand` | `RELEASE` | 11 |

---

## 4. Per character — `kid_<id>.glb`

`<id>` matches the character id exactly (see `src/data/characters.ts`).

### Meshes
- Bound to `skeleton_recess_v1` with an **identical bind pose**.
- One skin, **at most 3 skinned meshes** (body / hair / accessory).
- Three explicit LOD nodes in the same file:

  | node | triangle budget |
  |---|---|
  | `kid_<id>_LOD0` | ≤ 7,000 |
  | `kid_<id>_LOD1` | ≤ 3,000 |
  | `kid_<id>_LOD2` | ≤ 1,200 |

### Normals — read this one twice
**Welded and smooth-shaded. No hard-edge splits on any surface that forms the
silhouette.** The outline is an inverted hull that offsets vertices along their
normals; a split normal tears a visible gap in the contour. This is the single
most common way a delivered model fails review.

Optional: a **vertex-colour alpha** channel modulating outline width, so a
contour can taper into a fingertip.

### Material slots — exactly these names

| slot | contents |
|---|---|
| `M_Body` | skin + face. Face UVs must occupy their own island covering UV `[0..0.5, 0.5..1]`. |
| `M_Uniform` | jersey + pants, **authored white/greyscale with the logo area masked**. |
| `M_Hair` | |
| `M_Accessory` | cap / glasses / headband / glove. May be absent. |

`M_Uniform` being greyscale is not a style note — team colour is applied at
runtime as a multiply, and that is the entire team-identity system. A model
that bakes in a jersey colour cannot wear the team that drafts it.

### Textures

| map | size | notes |
|---|---|---|
| `albedo` | 1024² | |
| `face_atlas` | 512² | 4×4 grid, cells in this order: neutral · grin · determined · worried · upset · surprised · blink · wink · sleepy · angry · tongue · cheer · +4 spare |
| `mask` | 512² | optional. R = team-colour mask, G = outline-width, B = spare |

**No normal maps. No metalness/roughness.** The toon shader ignores them and
they would double the download for nothing.

**Expressions are texture-atlas swaps. Zero morph targets** — the validator
rejects any model that has them.

### Export settings
- glTF 2.0 binary, Y-up, +Z forward
- Single scene, single skin, **no cameras, no lights**, no unlit extension
- **Draco** compression: position 14, normal 10, uv 12
- **KTX2 / Basis** textures: ETC1S q200 for `albedo` and `mask`, UASTC for `face_atlas`
- **≤ 400 KB per `.glb`**

---

## 5. Delivery sequence

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
