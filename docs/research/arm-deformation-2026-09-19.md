# Arm deformation correction — September 19, 2026

The user identified unnatural arms during drafting. Inspection of the delivered
GLBs found no elbow or wrist blending on 29 of the 30 roster models. Junebug's
separately authored mesh already had both and is unchanged.

## Cause and correction

The shared arm builder used the garment table's bone labels as rigid skinning
assignments. Some skin above the elbow followed the forearm bone; rotating the
elbow pulled it backwards into a hook. The builder now uses smooth weights
centred on the canonical elbow and wrist positions, preserving the authored
shoulder-to-torso falloff. Lefty's sleeve piping uses the same weights.

Three pilot sources (Sprout, Tank, Lefty) were rebuilt and exported. Sprout's
rebuild also picked up the existing elbow-crease outline mask (24 vertex alpha
values, 255 to 128); its positions, normals, colours' RGB channels and topology
are unchanged. The other pilots changed only weights/joints. Rebuilding Theo
from all current sculpt-library code picked up unrelated geometry and failed
its triangle budget. The source was restored and the remaining 26 characters
were migrated in Blender with `repair-arm-skinning.py`, which edits vertex
groups only. Semantic accessor comparisons confirm unchanged geometry; no
asset budget was raised.

The production batting solver had another deformation defect: independent
shortest-arc rotations put the hands in the correct place while giving the two
arm segments different roll angles. A blended elbow then corkscrewed. The
segments now share one hinge plane, and the elbow direction stays outboard and
forward relative to the turning chest. Hand targets, contact position, feet and
simulation rules retain their existing contracts. The driving elbow gets a
smooth, temporary forward clearance adjustment immediately after contact;
this removes a new Theo sleeve/bat intersection detected at contact frame 10
without moving the support arm or changing the ready/contact/recovery joins.

## Matched runtime comparisons

Each sheet shows idle at 0s, run at .2s and .6s, ready at .3s, contact at 7/30s
and throw at 11/30s. Both versions use the delivered models, matching viewport,
camera and animation time. Images are cropped consistently from full-page
captures. The three pilots were independently reviewed before roster rollout.

| Character | Before | Corrected |
| --- | --- | --- |
| Sprout, thin bare arms | [Before](../v2/art/arm-fix/sprout-before.png) | [After](../v2/art/arm-fix/sprout-after.png) |
| Lefty, long sleeves and piping | [Before](../v2/art/arm-fix/lefty-before.png) | [After](../v2/art/arm-fix/lefty-after.png) |
| Tank, wide body and sleeves | [Before](../v2/art/arm-fix/tank-before.png) | [After](../v2/art/arm-fix/tank-after.png) |

The independent critic found smoother elbow contours in running and throwing,
resolved Lefty's newly exposed deep-bend pinch with the hinge correction, and
preferred the chest-relative elbow direction. Grip placement remained stable
in the sampled poses. Wrist blending is verified in the delivered files; its
visual improvement is subtler than the elbow change.

## Limits

This is a deformation correction, not full art approval. Tank's severe
ready-pose sleeve/hand penetration into his tee predates the change and remains
open as ART-011. Existing thin/angular hands, sculpt proportions and clothing
issues remain in the character-fidelity ledger. No candidate is promoted to
approved, and no Backyard Baseball parity claim follows from passing tests.

The delivered-model regression checks meaningful blended rings around both
elbows and wrists for all 30 characters. The batting regression checks that
elbows bend in one plane throughout ready, load, contact, follow-through,
misses and bunts, in addition to the existing grip/contact/foot-plant tests.

Independent reviews were refreshed for all 29 changed models. Ace’s clothing
score was reduced from 4 to 2 because the new evidence contradicts an earlier
clearance; matched baseline images confirm the jacket intrusion already existed.
Theo and Penny’s additional clothing observations are recorded as ART-012,
without claiming that the sampled comparisons establish their age. Grizz’s
stale-board finding was cleared after the evidence refresh.

## Verification

- 118 test files: 2,346 passing tests, 12 existing skips.
- Production build passes; the Classic bundle hash remains unchanged.
- All 62 source/delivered model files validate.
- 30-model, 5,040-frame batting sweep: no mechanical failures or bat-shaft
  intersections after the follow-through correction. This is a centreline
  check, not proof of full barrel or clothing clearance.
- Complete-game presentation smoke passes.
- [Theo’s corrected follow-through, frames 8–13](../v2/art/arm-fix/theo-follow-through.png)
  supplements the six-pose pilot comparisons.
