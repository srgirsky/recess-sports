# Batting correction review packet — 2026-09-18

Implementation proposed for ART-004 and ART-005; **not independent visual
approval or maintainer sign-off**. Environment changes in the separate park
proposal are not included in this packet.

The old plate yaw pointed heads toward the catcher. Merely reversing that yaw
left hands beside the handle and the barrel far from the ball. The correction
uses a side-on box position and a shared handle frame for both arms after the
animation mixer. It curls the delivered finger bones, preserves the contact
speed marker, reaches the pitch crossing (or the human's chosen aim height),
and restores authored transforms before other clips. Standing legs plant;
Zoom reaches with his trunk while his seat and leg tracks remain intact.
Replay records the visual target, and the batter joins the basepath from the
box instead of teleporting to the plate centre. Sim physics/outcomes are unchanged.

## What was actually checked

- `probe.json`: 5,040 samples, all 30 delivered models, every authored frame of
  stance, load, contact, follow-through, whiff and bunt. Production factory,
  director and mirrored gameplay scene; fixed 2.4ft contact target. No backward
  heads, palm gaps above 0.02 reference feet, marker gaps above 0.1 world feet,
  or shaft-centreline/body intersections. Source digest and time are embedded.
- `board-0.png` through `board-5.png`: author-inspected ready/contact/follow
  stills for all 30 delivered models in the production desktop camera. These
  are diagnostic substitutions, **not 30 simulated plate appearances**. The
  original Junebug HUD remains visible; row labels identify the substituted kid.
  `roster-stills-probe.json` records the sampled action and time.
- Regression tests cover reflected/unreflected parents, multiple scales and
  aim heights, continuous grip and standing foot plants, seated reach without
  changing seat/leg tracks, repeatable seeking, restoration on locomotion,
  repeated play requests and the box-to-basepath join.
- Complete benchmark captures use the real game, fixed paint clock and HUD,
  at desktop/phone sizes in day/night lighting. The local source-stamped
  receipt is `.art-review/evidence/benchmark-park/receipt.json`.
  Four committed MP4s contain 597 frames each (19.9 seconds), with encoded
  file hashes and capture metadata in `capture-summary.json`. The author
  inspected the four `*-sequence.png` boards and contact frame 83 at full
  size (`contact.jpg`); the exact bat-ball overlap lasts less than a 30fps
  interval, so frame 84 alone misleadingly looks separated. Continuous
  independent playback review is still pending.

## Iterations caught by the stricter review

A world-quaternion solve failed under the scene's negative X scale; the solver
now works relative to the rig. Three support palms detached in follow-through;
both reaches now constrain the body. Straight recovery interpolation sent the
bat through several heads/bodies; recovery now goes around the front. A numeric
hip-height guess incorrectly classified Zoom; seated treatment is explicit.
A standing stance drifted because the leg could not reach its plant; the body
solve now includes both foot reaches as well as both hands. These were fixed,
then the entire delivered-roster sweep was repeated rather than waiving cases.

## Remaining acceptance work

The 5,040 numeric samples are not 5,040 visually approved frames. A centreline
ray cannot certify barrel-radius clearance, skin/cloth deformation, fingers,
acting quality or every possible pitch. The roster boards use one camera and
one target height; they do not close the phone/action matrix. Independent
normal-speed and frame-by-frame review, side/front grip inspection, both teams,
varied pitches, replay and other action families remain required by
[the action review procedure](../../art-acceptance.md#action-review-procedure).
ART-004/005 stay open until the fresh evidence passes that review and the
maintainer decides. ART-006 continues to track missing coverage.

## Verification

`npm test`: 2,273 passed, 12 skipped; the additional replay-target regression
also passes in the targeted delivery run. `npm run build` passed.
`npm run audit:batting -- --check` passed with the source digest above.
CI now runs the delivered-roster batting audit after the browser layout gates
and uploads its probe, so this check is repeated on future pull requests.
The v1 source tree and simulation code are unchanged.
