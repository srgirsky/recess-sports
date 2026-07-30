# Commission brief — shared animation library

**Deliverable:** one file, `anims_recess_v1.glb`. ~33 clips on a supplied
skeleton, no mesh.

Send this document, plus `docs/v2/asset-contract.md` and
`skeleton_recess_v1.glb`, to the animator. Everything here is machine-checked by
`npm run validate:models`.

---

## The project in one paragraph

A free browser baseball game for children aged 4–8. You draft nine kids from a
neighbourhood of thirty and play a short game. The look is modern toy-brand 3D —
chibi proportions, cel shading, heavy navy contour lines. Think *Paw Patrol* or
the 2026 *Backyard Baseball* remake, not a simulation. The characters are the
product: the whole game exists to find out which kids people love.

## Why this is one library and not thirty

All thirty characters are modelled separately, but every one binds to the **same
skeleton** and plays **these same clips**. Your file animates the entire cast,
now and for every character added later. That is why the skeleton spec is rigid
and why the marker frames below are non-negotiable.

---

## Hard technical requirements

| | |
|---|---|
| Rig | `skeleton_recess_v1.glb`, supplied. Do not add, remove, rename or reorder bones. |
| Scale | 1 unit = **1 foot**. The reference kid is **4.0 ft** tall. |
| Facing | +Z. Up is +Y. |
| Frame rate | **30 fps** |
| Output | one `.glb`, **animations only, no mesh, no skin** |
| **Root motion** | **NONE.** The `Root` bone must stay at the origin on every keyframe of every clip. |

### Root motion — the one that gets rejected most

The game engine owns every character's position and facing. Run cycles run **in
place**; dives and slides displace the *body* relative to a stationary `Root`.
A clip that translates `Root` will be rejected automatically by the validator.

### Marker frames

Three clips must hit a physical event on an exact frame. The engine time-warps
each clip so the marker lands on the simulated instant of contact or release —
which is what stops animation from ever drifting out of sync with the physics.

| clip | event | frame |
|---|---|---|
| `swing_contact` | bat meets ball | **7** |
| `pitch_release` | ball leaves hand | **4** |
| `throw_overhand` | ball leaves hand | **11** |

### Prop anchors

Bats, gloves and balls are attached by the engine to `Prop_BatGrip`,
`Prop_GloveAnchor` and `Prop_BallAnchor`. **Do not animate props** — animate the
hands, and keep the grip plausible.

---

## Performance direction

These are **six-to-eight-year-olds at recess**, not professional athletes.

- **Heavy heads, light bodies.** The head is ~30% of total height. Momentum
  should read: the head leads a turn and settles last, and every stop has a
  little overshoot.
- **Big anticipation, big follow-through.** Small kids wind up too much and
  overcommit. That is the charm — lean into it.
- **Everything is slightly too much effort.** A throw is a whole-body event. A
  swing nearly spins them around.
- **Readable at 40 px tall.** The wide camera draws a character about 5% of
  screen height. Silhouette and limb extension carry everything; wrist and
  finger detail is invisible and not worth your time. **Check every clip
  thumbnail-sized before delivering.**
- **No mocap feel.** Hand-keyed, snappy, posed. Cartoon spacing: fast in, hold,
  fast out.
- **Loops must be seamless** and hold up at 0.6×–1.4× playback, because a kid
  with speed 2 and a kid with speed 10 play the same `run` clip at different
  rates.

---

## Clip list

Frame counts are targets; ±20% is fine if the motion needs it.

### Idle & locomotion
| clip | frames | loop | notes |
|---|---|---|---|
| `idle` | 60 | ✔ | Breathing, small weight shift. Alive, not fidgety. |
| `idle_fidget` | 90 | — | One-shot personality beat: scratch, kick dirt, adjust cap. Plays occasionally over `idle`. |
| `run` | 24 | ✔ | In place. 2.5 strides/sec at 1× speed. The most-used clip in the game. |
| `run_fast` | 20 | ✔ | All-out sprint. More forward lean, bigger arm drive. |
| `jog_back` | 24 | ✔ | Backpedalling — an outfielder drifting back on a fly. |
| `shuffle_left` | 20 | ✔ | Lateral, staying square to the plate. |
| `shuffle_right` | 20 | ✔ | Mirror. |

### Batting
| clip | frames | loop | notes |
|---|---|---|---|
| `bat_stance` | 60 | ✔ | Waiting for the pitch. Small bat waggle, weight back. |
| `bat_load` | 12 | — | Stance → coiled. Blends into any swing. |
| `swing_contact` | 18 | — | **Contact on frame 7.** Hips open, back heel up, barrel through the zone. |
| `swing_follow` | 24 | — | Follow-through and recover to standing. |
| `swing_whiff` | 30 | — | A miss. Over-rotates, nearly falls over. Should be funny. |
| `bunt` | 24 | — | Squares around, bat level, small and defensive. |

### Pitching
| clip | frames | loop | notes |
|---|---|---|---|
| `pitch_windup` | 30 | — | Leg lift. Big, slow, theatrical. |
| `pitch_stride` | 12 | — | Stride down and plant. |
| `pitch_release` | 12 | — | **Release on frame 4.** Arm whips through, follow-through. |

### Fielding
| clip | frames | loop | notes |
|---|---|---|---|
| `field_ready` | 40 | ✔ | Athletic crouch, glove out, slight bounce. |
| `field_scoop` | 20 | — | Scoop a grounder. |
| `catch_high` | 20 | — | Glove above the head. |
| `catch_chest` | 20 | — | Routine, chest height. |
| `catch_low` | 20 | — | Shoestring, knees bent. |
| `dive_left` | 45 | — | Full layout left, lands prone. **`Root` stays put** — the body travels. |
| `dive_right` | 45 | — | Mirror. |
| `getup` | 40 | — | Prone → standing. Follows a dive or a slide. Sell the effort. |
| `throw_overhand` | 24 | — | **Release on frame 11.** Crow-hop, whole-body throw. |
| `throw_quick` | 14 | — | Snap throw, no wind-up. |

### Baserunning
| clip | frames | loop | notes |
|---|---|---|---|
| `slide` | 40 | — | Feet-first slide, ends lying down. `Root` stationary. |

### Reactions — the personality set
These sell the characters, which *is* the product. Worth extra attention.

| clip | frames | loop | notes |
|---|---|---|---|
| `cheer` | 45 | — | Arms up, jump. Pure joy. |
| `upset` | 60 | — | Struck out. Slumps, turns to camera, deflates. |
| `nervous` | 60 | ✔ | Bases loaded. Fidgets, glances around, shifts weight. |
| `dodge` | 24 | — | Flinch away from an inside pitch. Hip-pivot lean, fast in, slow recover. |

### Front-end
| clip | frames | loop | notes |
|---|---|---|---|
| `walk_on` | 30 | ✔ | Confident walk-up. Used when a drafted kid runs onto the field. |
| `pose_card` | 1 | — | **A single held pose.** The character's hero shot on their draft card — the most-seen frame in the entire game. Chest out, glove up or bat on shoulder. Make it charming. |

---

## Acceptance

1. `npm run validate:models` passes (bone set, no root motion, no morph targets,
   frame rate, marker frames present).
2. Every clip plays on the supplied **proxy character** — a primitive stand-in on
   the same skeleton — without popping between clips.
3. Loops are seamless at 0.6×, 1.0× and 1.4×.
4. Thumbnail review: every clip readable at 40 px tall.

## Suggested order of delivery

`idle` → `run` → `bat_stance` → `swing_contact` → `swing_follow` first, as a
**pilot batch**, for feel sign-off before the rest. Those five are ~70% of what a
player actually watches, and agreeing the movement language on them costs far
less than re-timing thirty-three clips.
