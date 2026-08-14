"""The canonical skeleton, in one place, for every builder that hangs off it.

★ WHY THIS IS A MODULE AND NOT A SPEC. These are not measurements of anybody.
`src/v2/render/skeleton.ts` declares one skeleton and every character is bound to
it, so a bone position is a fact about the rig the way `pi` is a fact about
circles. Putting them in a `*Spec` would invite thirty copies of one rig and let
a character quietly disagree with the bones that drive it — and the disagreement
is invisible in the bind pose, which is the only pose a fidelity board renders.

The z values are the skeleton's own offsets accumulated: `LeftLeg` sits -0.776
below `LeftUpLeg` (1.600 - 0.776 = 0.824) and `LeftFoot` -0.729 below that
(0.824 - 0.729 = 0.095). If `skeleton.ts` ever moves a joint, these move with
it; they are not free to be tuned for a silhouette.

★ THE THREE CONVENTIONS THAT DECIDE WHETHER A SCULPT IS BOUND AT ALL are in the
package doc, and `limb_bone` is where the second one bites: LEFT IS NEGATIVE X,
so a `side` of +1 is the RIGHT side. Four rounds named the +x arm "Left", which
is invisible in any symmetric pose and drives the wrong limb the moment a clip
is asymmetric.
"""

from __future__ import annotations

# The arm chain, T-pose: straight out sideways at one height.
ARM_SHOULDER_X = 0.400
ARM_ELBOW_X = 0.918
ARM_WRIST_X = 1.365
ARM_Z = 2.471

# The leg chain, hip to ankle.
LEG_HIP_X = 0.200
LEG_HIP_Z = 1.600
LEG_KNEE_X = 0.292
LEG_KNEE_Z = 0.824
LEG_ANKLE_X = 0.378
LEG_ANKLE_Z = 0.095


def limb_bone(name: str, side: int) -> str:
    """Left bones are at NEGATIVE x, so side -1 is the left side."""
    return f"Left{name}" if side < 0 else f"Right{name}"
