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


def hem_follows_thighs(at: tuple[float, float, float], bone: str, hem_z: float, share: float):
    """A long top's skin weights below the hip: part pelvis, part thigh.

    ★ A HEM WEIGHTED ONLY TO THE PELVIS HANGS LIKE A SKIRT. Tank's tee runs
    0.53ft below the hip joint, every ring of it on `Hips`, so in the catcher's
    squat the thighs swung forward inside it while the hem dropped straight to
    the dirt with the pelvis: through PITCH a purple sack with shoes. Real cloth
    is carried by the thighs. Below `LEG_HIP_Z` a `Hips` vertex passes up to
    `share` of its weight to the thigh on its own side, ramping smoothly from
    nothing at the joint to all of `share` at `hem_z`; across the middle it
    splits between both thighs, so a stride does not tear the front seam.
    Weights only: the bind pose, and so every fidelity board, is unchanged.

    ⚠️ ONE SHARE ALL ROUND, AND THE COST IS KNOWN. On a short hem (Chip,
    Bend-It, ~0.35ft below the hip) the front following the forward thigh puts
    a small notch in the hem mid-stride. Carrying the back only removed it, and
    the front then hung straight down between the folded thighs: a pale flap
    between the feet through PITCH (critic: 3 -> 2.5). A front share of 0.35
    kept the notch. The squat is the close-up read every pitch; the run is
    seen small, so the full share stands (2026-10-02).
    Returns `bone` untouched for anything else, so a loft can call it on every
    vertex.
    """
    x, _, z = at
    if bone != "Hips" or z >= LEG_HIP_Z:
        return bone
    smooth = lambda t: (lambda c: c * c * (3 - 2 * c))(max(0.0, min(1.0, t)))
    leg = share * smooth((LEG_HIP_Z - z) / (LEG_HIP_Z - hem_z))
    if leg <= 0:
        return bone
    left = smooth((x - LEG_HIP_X) / (-2 * LEG_HIP_X))  # 1 at the left thigh (-x)
    return {"Hips": 1 - leg, limb_bone("UpLeg", -1): leg * left, limb_bone("UpLeg", 1): leg * (1 - left)}
