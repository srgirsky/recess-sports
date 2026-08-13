"""Rebuild Tank as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/tank-pilot.blend \
    --python scripts/v2/blender/sculpt-tank-source.py

★ TANK IS THE BALD CONTROL, and that is why he is first after Junebug.

He has no hair at all. Rubric §3 scores hair mass as one of six categories, so
a failure anywhere else in his board is provably a failure of the BODY library
rather than of a hair system — which is exactly what a second character is for.
He also sits at one extreme of the roster's body range (`bodyType: chunky`,
`hipW: 10`, `belly: 0.8`, the widest hips authored), so the shared construction
is being asked to stretch on its first outing rather than on its tenth.

★ EVERY NUMBER BELOW IS MEASURED, AND THE COMMAND THAT MEASURED IT IS
`npm run measure:turnaround -- tank`.

Junebug's script carries 1,629 lines of hand-traced pixel arithmetic, and that
work is why she is approved — but it is also un-recheckable without redoing the
trace. Her figure was measured by hand; his was measured by a tool that reads
the same landmarks with the same detector `measure:fidelity` uses to grade the
result, so the sculptor and the gate are holding one ruler.

The conversion: his front figure runs 316 x 686px and is scaled to the rig's
4.0ft, so 1px = 0.00583ft and 1ft = 171.5px.

★ AND ONE MEASUREMENT WAS WRONG THE FIRST TIME, IN A WAY WORTH KEEPING. His
sock colour was first sampled down the figure's CENTRE column, which below the
shorts hem is the gap between his legs — cream backdrop read as cream sock, and
the two are within a few counts of each other. Sampling only pixels the figure
mask admits gives #F8EBDA either way here, so the number survived; the method
did not, and on a kid with dark socks it would have shipped the backdrop as a
garment. Sample inside the mask, never down a column.
"""

from __future__ import annotations

from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector

# ⚠️ Blender runs a --python script by PATH and does not put its directory on
# sys.path, so the package beside this file is unimportable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sculptlib.atlas import install_face_atlas
from sculptlib.color import ensure_material_slots, rebuild_palette_material, rgba, srgb_to_linear
from sculptlib.ear import EarSpec, build_ear
from sculptlib.head import HeadSpec, head_surface
from sculptlib.mesh import MeshBuilder
from sculptlib.palette import Palette

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/tank-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/tank-face-atlas.png"
REVISION = "tank-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette, sampled off tank-turnaround.png ------------------------------
#
# Read as the modal colour of a z-band restricted to the figure mask, which is
# what stops a pale garment being confused with a pale backdrop. Percentages are
# that mode's share of the band.
#
#   crown / skull   #CC834C (11%)      face lit   #BB7443
#   jaw shadow      #734422 (10%)
#   tee             #6A4682 (13%)      tee dark   #523464
#   shorts          #24242B (18%)      shorts dk  #121116
#   sock            #F8EBDA (19%)
#   shoe navy       #444C53            shoe cream #F1E4D4
SKIN = rgba("CC834C")
# Moved from SKIN by the same per-channel ratio Junebug's shadow takes from
# hers (x0.80 / x0.70 / x0.55), rather than sampled: the concept's own jaw
# reading (#734422) is a TERMINATOR, not an authored shadow swatch, and taking
# a lit-to-unlit gradient as a palette entry is how a face ends up two-toned.
SKIN_SHADOW = rgba("A35C2A")
# Tank is bald. `hair` is still declared because the brows are drawn and they
# are the one place a hair colour appears on him — the render brief's rule that
# a brow is the kid's own hair colour, shaded, rather than ink.
HAIR = rgba("3A2416")
SHIRT = rgba("6A4682")
SHIRT_DARK = rgba("523464")
PANTS = rgba("24242B")
PANTS_DARK = rgba("121116")
SHOE = rgba("444C53")
SOCK = rgba("F8EBDA")
WHITE = rgba("FFFFFF")
SOLE = rgba("F1E4D4")
# The one surface the drafting team's colour tints. Tank's kit is a plain tee
# with no piping, so the accent goes on the shoe's collar band — the only
# element the concept draws as a separate trim, and it reads at 40px because it
# sits against the navy.
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The head, measured off tank-turnaround.png --------------------------------
#
# Front-view width profile, contiguous run through the figure's centre:
#
#   z     3.918  3.761  3.598  3.440  3.283  3.120  2.962
#   half  0.283  0.432  0.484  0.487  0.615  0.423  0.260   ft
#
# and the profile view's depth over the same band peaks at 1.031ft (half 0.515)
# at z 3.30. So the skull is very slightly deeper than wide, and the 0.615 at
# z 3.283 is NOT skull — it is the ear line, which is the head's widest point on
# this character exactly as it is on Junebug.
#
# Crown lands at 3.99 against a figure top of 4.0; chin at 2.93 against a
# measured pinch at 2.96.
HEAD_CENTER = (0.0, -0.010, 3.460)
HEAD_RADII = (0.487, 0.515, 0.552)

# ★ HIS HEAD IS 26% OF HIS FIGURE AND JUNEBUG'S IS 34%, AND NEITHER IS WRONG.
# Her crown carries a bun; his is bare bone. Measured crown-to-chin they are
# 1.04ft and 1.19ft, so the difference is mostly hair and the underlying skulls
# are within 0.1ft of each other. This is the number `measure:fidelity` checks
# as `headHeightPct`, and reading it as "Tank's head is too small" would be
# reading a hairstyle as a proportion.
FACE_HALF_WIDTH = (
    # (normalised z on the skull, measured half-width in feet). A toddler holds
    # cheek width far lower than an older child: his jaw is still 0.42 wide at
    # z 3.12, a third of the way down from the eyes.
    (1.00, 0.010),
    (0.80, 0.240),
    (0.60, 0.372),
    (0.40, 0.452),
    (0.20, 0.484),
    (0.00, 0.487),
    (-0.20, 0.478),
    (-0.40, 0.441),
    (-0.60, 0.372),
    (-0.80, 0.268),
    (-1.00, 0.020),
)


def face_half_width(nz: float) -> float:
    """The concept's own jaw curve, tabulated."""
    table = FACE_HALF_WIDTH
    if nz >= table[0][0]:
        return table[0][1]
    for (z0, w0), (z1, w1) in zip(table, table[1:]):
        if nz >= z1:
            return w0 + (w1 - w0) * (z0 - nz) / (z0 - z1)
    return table[-1][1]


def face_half_scale(nz: float) -> float:
    """`width` for the ellipsoid sampler: the factor that turns rx*sin(phi)
    into the measured half-width."""
    ring = (max(0.0, 1.0 - nz * nz)) ** 0.5
    if ring < 1e-4:
        return 1.0
    return face_half_width(nz) / (HEAD_RADII[0] * ring)


def socket_push(nx: float, nz: float) -> float:
    """The eye socket's recess.

    Without it the profile is a flat wall from brow to cheek — the defect three
    of Junebug's rounds went looking for before it was named. Tank's is
    SHALLOWER than hers by design: his eyes are drawn half-lidded and sit under
    a heavy brow, so the shadow that reads as a socket on his board is mostly
    the brow's own overhang rather than the recess beneath it.
    """
    dz = nz + 0.16
    dx = abs(nx) - 0.34
    radial = (dx * dx) / 0.075 + (dz * dz) / 0.020
    if radial >= 1.0:
        return 0.0
    return 0.016 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """The nose, as three forms rather than one bump.

    A single quadratic cap reads as a smudge head-on at hero scale, which is
    what Junebug's rounds 3-5 kept scoring. Tank's is a short rounded button —
    `nose: 'dot'` in the roster — so the bridge is nearly absent and almost all
    of the relief is in the tip.
    """
    if abs(nx) > 0.26:
        return 0.0
    dz = nz + 0.30
    if dz < -0.16 or dz > 0.18:
        return 0.0
    across = 1.0 - (nx / 0.26) ** 2
    # bridge: a low ridge running up from the tip, barely there on a button nose
    bridge = 0.012 * across * max(0.0, 1.0 - abs(dz - 0.10) / 0.12)
    # tip: the rounded ball that carries the form
    tip = 0.040 * across ** 0.7 * max(0.0, 1.0 - (dz / 0.11) ** 2) ** 0.8
    # nostril shelf: the underside, which is what breaks the profile silhouette
    shelf = 0.014 * across * max(0.0, 1.0 - abs(dz + 0.13) / 0.06)
    return bridge + tip + shelf


# ★ ROUND 2: HIS HEAD ASPECT IS MEASURED ACROSS THE EARS, which is why round 1
# came back at 0.97 against the concept's 1.12 with a skull that measures right.
# The concept's widest head row is z 3.283 at half-width 0.615, and that row is
# the ear line on every character — the skull itself only reaches 0.487. Round
# 1 shipped Junebug's ear, at her centre and her size, because the first lift of
# `sculptlib.ear` shared the construction and kept her placement.
#
# His ears are bigger and sit lower and further back than hers: measured off the
# profile crop, 0.325ft tall against her 0.297, centred at z 3.268 where the
# front view puts the widest row.
EAR_SPEC = EarSpec(center=(0.030, 3.268), radii=(0.1150, 0.1625))

HEAD_SPEC = HeadSpec(
    center=HEAD_CENTER,
    radii=HEAD_RADII,
    half_scale=face_half_scale,
    socket=socket_push,
    nose=nose_push,
)

# The row spacing for the atlas island. Denser through the nose's own band for
# the reason Junebug's script records: uniform rows spend 1.7 of them on the
# form that carries the face, and a quadratic cap sampled 1.7 times is a smear.
FACE_ROWS = [0.0, 0.092, 0.184, 0.276, 0.319, 0.362, 0.405,
             0.448, 0.540, 0.632, 0.724, 0.816, 0.908, 1.0]


def skull_surface_x(y: float, z: float) -> float:
    """The skull's lateral half-width at (y, z) — what the ear mounts against."""
    ny = (y - HEAD_CENTER[1]) / HEAD_RADII[1]
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    remainder = 1.0 - ny * ny - nz * nz
    if remainder <= 0.0:
        return 0.0
    return HEAD_RADII[0] * (remainder ** 0.5) * face_half_scale(nz)


# --- The torso, measured -------------------------------------------------------
#
# ★ THE TEE'S SILHOUETTE IS NOT THE TORSO'S, and separating them took a hue
# classifier rather than a silhouette one. Scanning the front figure row by row
# and counting only PURPLE pixels against counting all figure pixels:
#
#   z     2.75  2.55  2.35  2.15  1.95  1.85  1.75  1.55  1.35  1.15
#   tee   0.950 1.283 1.499 1.703 1.837 1.644 1.120 1.172 1.137 1.242  ft
#   full  0.974 1.300 1.522 1.726 1.843 1.831 1.720 1.726 1.749 1.580
#
# Down to z 1.85 the two agree, because the SLEEVES cover the arms completely.
# Below it they part by 0.6ft: that is bare forearm outside a tee that has
# narrowed to its own body width. So the 1.837ft "widest point" at z 1.95 is the
# sleeve hem, not the shoulders, and building the torso to that width would give
# him a barrel chest and no arms.
#
# The torso proper is therefore ~1.15ft across (half 0.575) from hem to chest,
# and the sleeves are separate volumes. Depth comes from the profile view, which
# runs 0.64ft at the shoulder to 1.20ft at the hem — his tee is baggiest at the
# bottom, which is what "oversized" means on a toddler.
TORSO_LEVELS = [
    (1.100, 0.621, 0.600, "Hips"),
    (1.400, 0.598, 0.580, "Hips"),
    (1.700, 0.578, 0.540, "Spine"),
    (2.000, 0.575, 0.492, "Spine"),
    (2.300, 0.558, 0.452, "Spine1"),
    (2.520, 0.505, 0.392, "Spine2"),
    (2.680, 0.430, 0.320, "Spine2"),
    (2.780, 0.352, 0.268, "Spine2"),
]

# The neck. Measured depth at z 2.85 is 0.477ft, and the front-view pinch at
# z 2.962 is 0.519ft across — so it is barely a neck at all, which is the
# `neck: -4` the roster authors for him and the reason his head reads as sitting
# straight on his shoulders.
#
# ⚠️ IT STILL HAS TO BE NARROWER THAN THE JAW or the chin has nowhere to be.
# That rule is Junebug's and it is anatomy, not identity.
NECK_LEVELS = [
    (2.760, 0.250, 0.230, "Spine2"),
    (2.880, 0.222, 0.212, "Neck"),
    (2.980, 0.214, 0.206, "Neck"),
]

# --- Arms ----------------------------------------------------------------------
#
# The sleeve hem sits at z 1.85 (see the torso block). Above it the arm is tee;
# below it, bare skin to the hand. The shoulder is at z 2.52, x 0.44 — inboard
# of the sleeve's outer edge because the sleeve flares away from the joint.
ARM_SHOULDER = (0.402, 2.520)
ARM_ELBOW = (0.560, 1.870)
ARM_WRIST = (0.606, 1.420)
ARM_HAND = (0.612, 1.290)
SLEEVE_HEM_Z = 1.850


def build_arm(builder: MeshBuilder, side: int, detail: int) -> None:
    """One stitched arm: sleeve, bare forearm and a mitten hand.

    ★ ONE SURFACE, NOT THREE. The sleeve does not end and the arm begin — the
    same tube changes vertex colour at the hem. `sculptlib.mesh`'s `grid`
    docstring records why: a garment built as its own shell butted against the
    limb z-fights into the torn-paper edges Junebug's round-1 board showed, and
    the cure is one surface rather than better painting.
    """
    sides = 10 if detail >= 2 else 6
    stations = [
        (ARM_SHOULDER[0], ARM_SHOULDER[1], 0.150, SHIRT, "LeftArm"),
        (0.470, 2.240, 0.156, SHIRT, "LeftArm"),
        (0.530, 2.020, 0.150, SHIRT, "LeftArm"),
        (0.552, SLEEVE_HEM_Z, 0.146, SHIRT_DARK, "LeftForeArm"),
        (0.566, 1.800, 0.116, SKIN, "LeftForeArm"),
        (ARM_ELBOW[0], 1.700, 0.108, SKIN, "LeftForeArm"),
        (0.590, 1.560, 0.100, SKIN, "LeftForeArm"),
        (ARM_WRIST[0], ARM_WRIST[1], 0.092, SKIN, "LeftHand"),
    ]
    rows: list[list[int]] = []
    for x, z, radius, colour, bone in stations:
        bone_name = bone if side > 0 else bone.replace("Left", "Right")
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            row.append(
                builder.vertex(
                    (x * side + radius * cos(theta) * 0.92, radius * sin(theta), z),
                    colour,
                    bone_name,
                    (0.75, 0.25),
                )
            )
        rows.append(row)
    builder.grid(rows, 1 if True else 0, flip=side < 0)

    # The hand is a mitten: a fat palm with a thumb notch, never fingers. At the
    # 40px field read a five-fingered hand is one blob, and the notch is the
    # only part of it that survives — the spike harvest records the same finding.
    hand_bone = "LeftHand" if side > 0 else "RightHand"
    builder.ellipsoid(
        (ARM_HAND[0] * side, 0.012, ARM_HAND[1]),
        (0.098, 0.078, 0.118),
        0,
        SKIN,
        hand_bone,
        10 if detail >= 2 else 6,
        6 if detail >= 2 else 4,
    )
    if detail >= 1:
        thumb_bone = "LeftHandThumb1" if side > 0 else "RightHandThumb1"
        builder.ellipsoid(
            ((ARM_HAND[0] - 0.052) * side, 0.062, ARM_HAND[1] + 0.030),
            (0.040, 0.048, 0.040),
            0,
            SKIN,
            thumb_bone,
            6,
            4,
        )
        index_bone = "LeftHandIndex1" if side > 0 else "RightHandIndex1"
        builder.ellipsoid(
            ((ARM_HAND[0] + 0.018) * side, -0.010, ARM_HAND[1] - 0.086),
            (0.062, 0.058, 0.052),
            0,
            SKIN,
            index_bone,
            6,
            4,
        )


# --- Legs and shorts -----------------------------------------------------------
#
# The shorts hem is at z 0.694 and the sock top at z 0.680, so there is almost
# no bare leg on the front view — his shorts are long and his socks are high,
# which between them is why the concept's ankle daylight reads 0.636ft at
# z 0.006 and essentially nothing above it.
LEG_HIP_X = 0.206
LEG_HIP_Z = 1.180
LEG_ANKLE_Z = 0.180
LEG_SPLAY = 0.1184   # feet outboard per foot of drop — the rig's own stance
# ★ ROUND 2: HIS LEGS STAND TOO FAR APART. The concept measures ZERO ankle
# daylight at the metric's own sample height and round 1 delivered 31.5%. The
# splay is NOT the thing to change — it is the canonical rig's stance
# (`render.leg-stance`), shared by every character and re-derived from the
# concept art across the roster. What is his is the hip SEPARATION, and 0.268
# was carried over from a guess rather than measured: his thighs are drawn
# touching from crotch to knee, which on a kid this wide means the legs start
# close and the width comes from their radius.
SHORTS_HEM_Z = 0.694
SOCK_TOP_Z = 0.640


def leg_x(z: float) -> float:
    """Lateral centre of a leg at height `z`, following the rig's splay."""
    return LEG_HIP_X + (LEG_HIP_Z - z) * LEG_SPLAY


def build_leg(builder: MeshBuilder, side: int, detail: int) -> None:
    """Shorts, bare shin and sock as one stitched surface."""
    sides = 10 if detail >= 2 else 6
    stations = [
        (1.180, 0.232, PANTS, "LeftUpLeg"),
        (1.000, 0.238, PANTS, "LeftUpLeg"),
        (0.860, 0.236, PANTS, "LeftUpLeg"),
        (SHORTS_HEM_Z, 0.228, PANTS_DARK, "LeftLeg"),
        (0.688, 0.196, SKIN, "LeftLeg"),
        (SOCK_TOP_Z, 0.186, SKIN, "LeftLeg"),
        (0.632, 0.190, SOCK, "LeftLeg"),
        (0.480, 0.176, SOCK, "LeftLeg"),
        (0.330, 0.162, SOCK, "LeftLeg"),
        (LEG_ANKLE_Z, 0.150, SOCK, "LeftFoot"),
    ]
    rows: list[list[int]] = []
    for z, radius, colour, bone in stations:
        bone_name = bone if side > 0 else bone.replace("Left", "Right")
        cx = leg_x(z) * side
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            row.append(
                builder.vertex(
                    (cx + radius * cos(theta), radius * sin(theta) * 0.92, z),
                    colour,
                    bone_name,
                    (0.75, 0.25),
                )
            )
        rows.append(row)
    builder.grid(rows, 1, flip=side < 0)
    top = builder.vertex(
        (leg_x(1.180) * side, 0.0, 1.180), PANTS, "LeftUpLeg" if side > 0 else "RightUpLeg"
    )
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (top, rows[0][index], rows[0][nxt]) if side > 0 else (top, rows[0][nxt], rows[0][index])
        builder.face(face, 1)


# --- The shoe ------------------------------------------------------------------
#
# ★ ONE LASTED UPPER, NOT A UNION OF BALLS. This is Junebug's round-5 finding
# and it is construction rather than identity, so it is restated here rather
# than re-learned: an ankle ball plus a toe ball meet along an intersection
# CURVE, and a curve between two differently painted balls is a crease however
# carefully each ball is painted. Cross-sections stationed along the foot and
# stitched into one skin have no intersection to show.
#
# Measured off the profile view: the foot spans 1.20ft front to back at z 0.15,
# and the toe reaches 0.62ft ahead of the ankle.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 18.0 * pi / 180.0
# ★ ROUND 2: THE SHOE WAS BUILT INSIDE OUT, and it is the same mistake round 3
# made on Junebug from the other direction. Her verdict asserted a shoe "white
# with a red toe cap" that nobody had measured, and the sculptor inverted a shoe
# that had been closer to the art. Round 1 here did the reverse from an
# unmeasured impression: navy body with a cream toe, measured 30.2% cream to
# 50.4% navy against the concept's 61.8% to 26.2%.
#
# Measured, his shoe is a CREAM shoe with navy overlays — the sole, the toe cap
# and most of the upper are cream, and the navy is the eyestay panel and the
# heel counter. The band metric is not a style opinion; it is the ratio, and it
# was inverted.
SHOE_STATIONS = [
    # (y along the foot, half-width, top z, colour)
    (-0.300, 0.104, 0.246, SHOE),
    (-0.230, 0.132, 0.286, SOLE),
    (-0.120, 0.150, 0.300, SOLE),
    (0.000, 0.156, 0.296, SOLE),
    (0.140, 0.154, 0.268, SOLE),
    (0.280, 0.142, 0.222, SOLE),
    (0.400, 0.122, 0.176, SOLE),
    (0.500, 0.092, 0.128, SOLE),
    (0.560, 0.054, 0.086, SOLE),
]


def shoe_place(side: int, y: float, x_off: float, z: float) -> tuple[float, float, float]:
    """Place a shoe vertex, with the foot turned out.

    ★ THE FEET ARE TURNED OUT, and missing that cost Junebug two rebuilds. A
    foot built straight down the y axis reads as a doll's peg from the gameplay
    camera; the concept draws both feet splayed, and the rotation has to be
    applied to the SECTION rather than to the finished mesh or the sole stops
    being flat on the ground.
    """
    angle = SHOE_TOE_OUT * side
    cx = leg_x(LEG_ANKLE_Z) * side
    rx = x_off * cos(angle) - y * sin(angle)
    ry = x_off * sin(angle) + y * cos(angle)
    return (cx + rx, ry, z)


def build_shoe(builder: MeshBuilder, side: int, detail: int) -> None:
    sides = 10 if detail >= 2 else 6
    rows: list[list[int]] = []
    bone = "LeftToeBase" if side > 0 else "RightToeBase"
    for y, half, ztop, colour in SHOE_STATIONS:
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            # A section that is flat underneath and domed on top: the sole is a
            # real plane on the ground, not the bottom of a cylinder.
            x_off = half * cos(theta)
            span = ztop - SHOE_FLOOR
            z = SHOE_FLOOR + span * (0.5 + 0.5 * sin(theta))
            row.append(builder.vertex(shoe_place(side, y, x_off, z), colour, bone, (0.75, 0.25)))
        rows.append(row)
    builder.grid(rows, 3, flip=side < 0)

    # Cap both ends so the upper is closed — rubric 3.7 is binary about holes.
    heel = builder.vertex(shoe_place(side, -0.330, 0.0, 0.140), SHOE, bone, (0.75, 0.25))  # navy heel counter
    toe = builder.vertex(shoe_place(side, 0.590, 0.0, 0.050), SOLE, bone, (0.75, 0.25))
    for index in range(sides):
        nxt = (index + 1) % sides
        a = (heel, rows[0][nxt], rows[0][index])
        b = (toe, rows[-1][index], rows[-1][nxt])
        builder.face(a if side > 0 else (a[0], a[2], a[1]), 3)
        builder.face(b if side > 0 else (b[0], b[2], b[1]), 3)

    # The collar band is the declared team-accent surface — see TEAM_MASK.
    if detail >= 1:
        band = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            band.append(
                builder.vertex(
                    shoe_place(side, -0.180, 0.158 * cos(theta), 0.300 + 0.030 * sin(theta)),
                    TEAM_MASK,
                    bone,
                    (0.75, 0.25),
                )
            )
        rim = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            rim.append(
                builder.vertex(
                    shoe_place(side, -0.180, 0.140 * cos(theta), 0.330 + 0.026 * sin(theta)),
                    TEAM_MASK,
                    bone,
                    (0.75, 0.25),
                )
            )
        builder.grid([band, rim], 3, flip=side < 0)


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    face_columns = 21 if detail >= 2 else (9 if detail == 1 else 5)
    back_columns = 4 if detail >= 2 else (2 if detail == 1 else 1)
    if detail >= 2:
        rows_spec, crown, chin = FACE_ROWS, 2, 1
    elif detail == 1:
        rows_spec, crown, chin = [0.0, 0.184, 0.319, 0.448, 0.632, 1.0], 1, 1
    else:
        rows_spec, crown, chin = [0.0, 0.32, 0.60, 1.0], 1, 1
    head_surface(builder, face_columns, back_columns, rows_spec, crown, chin,
                 spec=HEAD_SPEC, palette=PALETTE)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, segments)
    builder.loft(TORSO_LEVELS, 1, SHIRT, segments)

    for side in (1, -1):
        build_arm(builder, side, detail)
        build_leg(builder, side, detail)
        build_shoe(builder, side, detail)


def build_lod(name: str, armature: bpy.types.Object, segments: int, rings: int, detail: int) -> bpy.types.Object:
    builder = MeshBuilder()
    add_character(builder, segments, rings, detail)
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(builder.vertices, [], builder.faces)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for material_name in SLOTS:
        mesh.materials.append(bpy.data.materials[material_name])
    for polygon, material_index in zip(mesh.polygons, builder.face_materials):
        polygon.material_index = material_index
        polygon.use_smooth = True

    uv_layer = mesh.uv_layers.new(name="UVMap")
    color_layer = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
    authored_color = mesh.color_attributes.new(name="_RECESS_COLOR", type="FLOAT_COLOR", domain="POINT")
    for vertex_index, color in enumerate(builder.colors):
        color_layer.data[vertex_index].color_srgb = color
        authored_color.data[vertex_index].color = srgb_to_linear(color)
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = builder.uvs[vertex_index]
    mesh.color_attributes.active_color = color_layer

    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in armature.data.bones}
    for vertex_index, weights in enumerate(builder.weights):
        total = sum(weights.values()) or 1.0
        for bone_name, weight in weights.items():
            groups[bone_name].add([vertex_index], weight / total, "REPLACE")

    modifier = obj.modifiers.new("Canonical rig", "ARMATURE")
    modifier.object = armature
    obj["recessAuthoring"] = REVISION
    obj["recessReference"] = "tank-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    # Tank is bald, so his procedural bootstrap never made an M_Hair.
    ensure_material_slots(SLOTS)

    for name in ("kid_tank_LOD0", "kid_tank_LOD1", "kid_tank_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_tank_LOD0": (14, 8, 2),
        "kid_tank_LOD1": (8, 4, 1),
        "kid_tank_LOD2": (5, 3, 0),
    }
    built = [build_lod(name, armature, *config) for name, config in settings.items()]

    for material_name in SLOTS:
        material = bpy.data.materials[material_name]
        material["recessVertexPalette"] = True
        if material_name != "M_Body":
            rebuild_palette_material(material)
    bpy.data.materials["M_Uniform"]["recessIdentityPalette"] = True
    bpy.data.materials["M_Accessory"]["recessTeamAccent"] = True
    if FACE_ATLAS.exists():
        install_face_atlas(FACE_ATLAS, "tank")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Tank reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against tank-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the shoe collar accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- tank\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_tank_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
