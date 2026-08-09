# Commission brief — shared animation and character takes

**Base deliverable:** one file, `anims_recess_v1.glb`. 43 clips on a supplied
skeleton, no mesh. Character acting passes may add partial
`anims_<id>_v1.glb` files after the base movement language is approved.

Send this document, plus `docs/v2/asset-contract.md` and
`skeleton_recess_v1.glb`, to the animator. Everything here is machine-checked by
`npm run validate:models`.

> The engine-side source of truth is `src/v2/render/clips.ts`. Every table below
> is generated against it and a test fails if the two drift apart, so if this
> document and that file ever disagree, the file wins and this document has a bug.

---

## The project in one paragraph

A free browser baseball game for children aged 4–8. You draft nine kids from a
neighbourhood of thirty and play a short game. The look is modern toy-brand 3D —
chibi proportions, cel shading, heavy navy contour lines. Think *Paw Patrol* or
the 2026 *Backyard Baseball* remake, not a simulation. The characters are the
product: the whole game exists to find out which kids people love.

## Why the mechanics are one library

All thirty characters are modelled separately, but every one binds to the **same
skeleton** and can play **these same clips**. The shared file establishes every
baseball verb for the entire cast. A later character file replaces only named
takes for one kid, which allows individual acting without duplicating the whole
library. That is why the skeleton spec is rigid and why the marker frames below
are non-negotiable.

The character-performance packet in `docs/v2/character-performance-brief.md`
names each kid's priority takes and acting direction. Deliver a character pass
as `anims_<id>_v1.glb`, containing only the clips worth replacing. Included
names override shared clips; missing names keep the shared delivery. The same
technical rules below apply to both files.

---

## Hard technical requirements

| | |
|---|---|
| Rig | `skeleton_recess_v1.glb`, supplied. Do not add, remove, rename or reorder bones. |
| Scale | 1 unit = **1 foot**. The reference kid is **4.0 ft** tall, floor to `HeadTop_End`. |
| Facing | +Z. Up is +Y. |
| Frame rate | **30 fps** |
| Output | `.glb`, **animations only, no mesh, no skin** |
| **Root motion** | **NONE.** The `Root` bone must stay at the origin on every keyframe of every clip. |

The supplied rig contains a two-triangle placeholder mesh bound to `Hips`. It
exists only so the file imports as a real armature rather than as 33 loose
empties. **Delete it**; it is not part of the deliverable.

### Root motion — the one that gets rejected most

The game engine owns every character's position and facing. Run cycles run **in
place**; dives and slides displace the *body* relative to a stationary `Root`.
A clip that translates `Root` will be rejected automatically by the validator.

### Marker frames

Ten clips must hit a physical event on an exact frame. The engine time-warps
each clip so the marker lands on the simulated instant of contact, release or
catch — which is what stops animation from ever drifting out of sync with the
physics. **Frame counts are ±20%; marker frames are exact.**

| clip | marker | frame |
|---|---|---|
| `swing_contact` | `CONTACT` | **7** |
| `pitch_release` | `RELEASE` | **4** |
| `throw_overhand` | `RELEASE` | **11** |
| `catch_high` | `CATCH` | **8** |
| `catch_chest` | `CATCH` | **8** |
| `catch_low` | `CATCH` | **9** |
| `catch_jump` | `CATCH` | **13** |
| `field_scoop` | `CATCH` | **9** |
| `dive_left` | `CATCH` | **18** |
| `dive_right` | `CATCH` | **18** |

**How a marker is verified.** glTF stores keyframe times in seconds and has no
reliable way to carry a named marker, so the validator does not take the frame
on trust: it finds the frame where `Prop_BatGrip` (contact) or the throwing/
catching hand (release, catch) reaches **peak speed**, and warns if that is more
than one frame from the number above. In practice this means: the event must be
the fastest moment of the motion, which is what it physically is anyway.

**Playback range for marker clips is 0.5×–2.5×, not the 0.6×–1.4× loops get.**
The rate is decided by the physics: a batter who swings 120 ms before the ball
arrives needs `swing_contact`'s 7-frame (233 ms) lead compressed about 1.9×.
These ten clips must stay readable across that wider band.

### Prop anchors

Bats, gloves and balls are attached by the engine to `Prop_BatGrip`,
`Prop_GloveAnchor` and `Prop_BallAnchor`. **Do not animate props** — animate the
hands, and keep the grip plausible.

### Ground speed — the number that stops feet skating

Locomotion clips run in place while the engine slides the character along the
ground, and the engine sets playback rate to `actual speed ÷ authored speed`.
So each cycle has a **ground speed it is authored to look correct at**, and the
foot contacts must be planted at that speed:

| clip | authored ground speed |
|---|---|
| `run` | **14.29 ft/s** |
| `run_fast` | 17.9 ft/s |
| `trot` | 7.1 ft/s |
| `jog_back` | 8.6 ft/s |
| `shuffle_left` / `shuffle_right` | 7.2 ft/s |
| `walk_on` | 4.4 ft/s |

`run`'s figure is not a preference: it is measured. Backyard Baseball 2001 runs
home to first in 4200 ms, which over a real 60 ft basepath is 14.29 ft/s, and
that is the speed the game moves at.

Note what it implies. A 24-frame cycle at 30 fps is 2.5 footfalls per second, so
14.29 ft/s needs a **5.72 ft step** — 1.43× the reference kid's own height, a
longer step relative to height than an adult sprinter takes. That is on purpose:
it is the reaching, over-committed cartoon stride this brief asks for elsewhere.
But if it reads as skating on the proxy, the fix is a **shorter cycle** (18
frames gives a 4.29 ft step), never a slower run — the speed is the measured
quantity and the cadence is the free one.

### Body travel — dives and slides

`Root` stays at the origin, but the *body* may travel, and how far is a gameplay
number rather than a stylistic one. The engine grants a diving fielder extra
catch reach in real feet; if your dive reaches further than the engine does, the
glove closes on a ball the game already scored as missed.

| clip | `Hips` horizontal travel from frame 0 |
|---|---|
| `dive_left` / `dive_right` | **3.0 ft** (±0.35) laterally |
| `slide` | **≤ 0.4 ft** — see below |
| `getup` | ≤ 0.4 ft |
| every other clip | ≈ 0 |

A slide is the opposite case: the runner's travel down the basepath is already
being driven by the engine, so a slide that also travels forward makes the
runner arrive at a base they are not standing on yet. The body goes **down** and
the legs go **out**; the ground track is not yours. The validator measures this
from the delivered file.

---

## Performance direction

These are **six-to-eight-year-olds at recess**, not professional athletes.

- **Heavy heads, light bodies.** The head is 32% of total height. Momentum
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
  rates. (The ten marker clips get a wider band — see above.)

### Blending — how "no popping" is actually checked

Every one-shot names the clip it settles into, and the engine crossfades to it
over the stated time. So a one-shot's **last pose must be close to the first
pose of the clip in its `settles into` column** — that is the whole rule, and it
is what acceptance criterion 2 means in practice. Loops settle into themselves.

---

## Clip list

Frame counts are targets; ±20% is fine if the motion needs it. Marker frames are
exact.

### Idle & locomotion
| clip | frames | loop | settles into | notes |
|---|---|---|---|---|
| `idle` | 60 | ✔ | — | Breathing, small weight shift. Alive, not fidgety. |
| `idle_fidget` | 90 | — | `idle` | One-shot personality beat: scratch, kick dirt, adjust cap. Plays occasionally over `idle`. |
| `run` | 24 | ✔ | — | In place, 14.29 ft/s. 2.5 footfalls/sec at 1× speed. The most-used clip in the game. |
| `run_fast` | 20 | ✔ | — | All-out sprint, 17.9 ft/s. More forward lean, bigger arm drive. |
| `trot` | 30 | ✔ | — | The home-run trot, 7.1 ft/s. Loose, pleased with themselves. Not `run` played slowly. |
| `jog_back` | 24 | ✔ | — | Backpedalling at 8.6 ft/s — an outfielder drifting back on a fly. |
| `shuffle_left` | 20 | ✔ | — | Lateral at 7.2 ft/s, staying square to the plate. |
| `shuffle_right` | 20 | ✔ | — | Mirror. |

### Batting
| clip | frames | loop | settles into | notes |
|---|---|---|---|---|
| `bat_stance` | 60 | ✔ | — | Waiting for the pitch. Small bat waggle, weight back. |
| `bat_load` | 12 | — | `bat_stance` | Stance → coiled. Blends into any swing. |
| `swing_contact` | 18 | — | `swing_follow` | **Contact on frame 7.** Hips open, back heel up, barrel through the zone. |
| `swing_follow` | 24 | — | `bat_stance` | Follow-through and recover to standing. |
| `swing_whiff` | 30 | — | `bat_stance` | A miss. Over-rotates, nearly falls over. Should be funny. |
| `bunt` | 24 | — | `bat_stance` | Squares around, bat level, small and defensive. |

### Pitching
| clip | frames | loop | settles into | notes |
|---|---|---|---|---|
| `pitch_windup` | 30 | — | `pitch_stride` | Leg lift. Big, slow, theatrical. |
| `pitch_stride` | 12 | — | `pitch_release` | Stride down and plant. |
| `pitch_release` | 12 | — | `field_ready` | **Release on frame 4.** Arm whips through, follow-through. |

### Fielding
| clip | frames | loop | settles into | notes |
|---|---|---|---|---|
| `field_ready` | 40 | ✔ | — | Athletic crouch, glove out, slight bounce. |
| `field_scoop` | 20 | — | `field_ready` | Scoop a grounder. **Ball met on frame 9.** |
| `catch_high` | 20 | — | `field_ready` | Glove above the head. **Frame 8.** |
| `catch_chest` | 20 | — | `field_ready` | Routine, chest height. **Frame 8.** |
| `catch_low` | 20 | — | `field_ready` | Shoestring, knees bent. **Frame 9.** |
| `catch_jump` | 30 | — | `field_ready` | Leaping catch at the wall — robbing a home run. Two-foot take-off, reach above the fence line, land on the feet. **Frame 13.** |
| `dive_left` | 45 | — | `getup` | Full layout left, lands prone. **`Root` stays put** — the body travels 3.0 ft. **Frame 18.** |
| `dive_right` | 45 | — | `getup` | Mirror. |
| `getup` | 40 | — | `field_ready` | Prone → standing. Follows a dive or a slide. Sell the effort. |
| `throw_overhand` | 24 | — | `field_ready` | **Release on frame 11.** Crow-hop, whole-body throw. |
| `throw_quick` | 14 | — | `field_ready` | Snap throw, no wind-up. |

### Baserunning
| clip | frames | loop | settles into | notes |
|---|---|---|---|---|
| `slide` | 40 | — | `getup` | Feet-first slide, ends lying down. `Root` stationary, and the body must not travel forward — see "Body travel". |

### Reactions — the personality set
These sell the characters, which *is* the product. Worth extra attention.

| clip | frames | loop | settles into | notes |
|---|---|---|---|---|
| `cheer` | 45 | — | `idle` | Arms up, jump. Pure joy. |
| `cheer_cool` | 36 | — | `idle` | Contained fist pump and nod. The kid owns the win without asking the room to watch. |
| `cheer_fierce` | 32 | — | `idle` | Explosive crouch, jump, hard landing and two quick pumps. |
| `cheer_goofy` | 54 | — | `idle` | Off-balance victory dance: windmill, hop, catch, grin. |
| `cheer_tender` | 45 | — | `idle` | Hands to heart, then an open wave that shares the win with the team. |
| `upset` | 60 | — | `idle` | Struck out. Slumps, turns to camera, deflates. |
| `upset_cool` | 40 | — | `idle` | One small shrug, eyes away, done. |
| `upset_fierce` | 45 | — | `idle` | Recoil, stomp the frustration into the dirt, breathe it back down. |
| `upset_goofy` | 50 | — | `idle` | Freeze, inspect both hands, then offer a tiny apologetic bow. |
| `upset_tender` | 65 | — | `idle` | Cover the face, peek out, and recover slowly. Let the miss hurt. |
| `nervous` | 60 | ✔ | — | Bases loaded. Fidgets, glances around, shifts weight. |
| `dodge` | 24 | — | `bat_stance` | Flinch away from an inside pitch. Hip-pivot lean, fast in, slow recover. |

### Front-end
| clip | frames | loop | settles into | notes |
|---|---|---|---|---|
| `walk_on` | 30 | ✔ | — | Confident walk-up at 4.4 ft/s. Used when a drafted kid runs onto the field. |
| `pose_card` | 2 | — | — | **A single held pose, delivered as two identical keyframes** (a one-key animation has zero duration and breaks playback). The character's hero shot on their draft card — the most-seen frame in the entire game. Chest out, glove up or bat on shoulder. Make it charming. |

---

## Acceptance

1. `npm run validate:models` passes (bone set, no root motion, no morph targets,
   frame rate, marker frames, body travel, loop seams).
2. Every clip plays on the supplied **proxy character** — a primitive stand-in on
   the same skeleton — without popping between clips or into the clip it settles
   into.
3. Loops are seamless at 0.6×, 1.0× and 1.4×; marker clips hold up at 0.5×–2.5×.
4. Thumbnail review: every clip readable at 40 px tall.

The engine exports its crude **procedural motion** into the shipped shared GLB,
so every one of these checks and the real runtime loader already run today
against placeholder motion. Your delivery replaces that file clip by clip; the
same procedural clips remain available only as load-failure fallbacks. A partial
delivery is therefore testable the day it lands, and the pilot batch below can
be signed off on its own.

The first-party Junebug character pass proves that partial path in production:
`anims_nostrike_v1.glb` contains `idle`, `idle_fidget`, `run`, `bat_stance`,
`swing_contact`, `swing_follow`, `cheer_fierce` and `upset_fierce`; every other
name still resolves to the shared library. Regenerate it with
`npm run export:pilot-performance` and review the eight `★` rows at
`/v2/?anims=1&kid=nostrike`.

Big Talk Theo is the second complete pass. `anims_calls_shot_v1.glb` contains
the same five high-frequency baseball clips plus `idle_fidget`, `pose_card`,
`cheer_goofy` and `upset_goofy`. Regenerate it with
`npm run export:signature-performance -- calls_shot` and review its nine `★`
rows at `/v2/?anims=1&kid=calls_shot`.

## Suggested order of delivery

`idle` → `run` → `bat_stance` → `swing_contact` → `swing_follow` first, as a
**pilot batch**, for feel sign-off before the rest. Those five are ~70% of what a
player actually watches, and agreeing the movement language on them costs far
less than re-timing forty-three clips.

Junebug and Theo's priority sets are now complete. Next deliver Zoom's priority
takes from the character-performance packet as a separate partial file. Review with
`/v2/?anims=1&kid=<id>`: `★` is the character take, `▪` is shared and `▫` is
procedural fallback. Sign off their model, motion and draft read together before
expanding to the remaining roster batches.
