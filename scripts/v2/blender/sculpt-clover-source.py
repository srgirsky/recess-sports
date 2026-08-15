"""Rebuild Clover as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/clover-pilot.blend \
    --python scripts/v2/blender/sculpt-clover-source.py

★ CLOVER IS LOW WAVY PIGTAILS AND THE PETAL DRESS — Zippy's lobed-tube
pigtail construction dropped to ear height and curved outward, over
Bubbles/Dazzle's one-loft dress with the widest hem flare on the roster and
a petal read carried by the theta hook (scallop shading plus a cream stitch
ring). Bare arms and legs, striped socks, green hi-tops.

The conversion: front figure 616px over 4.0ft → 1px = 0.006494ft. Head band:
fringe-top crown row 201 (z 3.99) to neck pinch row 424 (z 2.55) — 36.2% of
the figure, the biggest head fraction in batch 4. Her ear line is refused:
the pigtails own every width metric from z 3.4 to 2.9.
"""

from __future__ import annotations

from math import cos, pi, sin, sqrt
from pathlib import Path
import sys

import bpy

# ⚠️ Blender runs a --python script by PATH and does not put its directory on
# sys.path, so the package beside this file is unimportable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sculptlib.arm import ArmSpec, HandSpec, build_arm
from sculptlib.atlas import install_face_atlas
from sculptlib.color import ensure_material_slots, rebuild_palette_material, rgba, srgb_to_linear
from sculptlib.ear import EarSpec, build_ear
from sculptlib.head import HeadSpec, head_surface
from sculptlib.leg import LegSpec, build_leg, leg_x
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, ARM_SHOULDER_X, LEG_ANKLE_Z, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/clover-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/clover-face-atlas.png"
REVISION = "clover-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: warm lit skin #F3AA74 (34.8%), dress green #849A3C, blonde
# hair #BC833B with the pale highlight #ECCB9B, dark green #63641D (shoe
# canvas, sock stripe), cream #FBF0E2 backdrop. Authored ≈ delivered·1.2
# with chroma clear of the r-clip ceiling.
SKIN = rgba("FFBC74")
SKIN_SHADOW = rgba("D08840")
HAIR = rgba("C89238")        # deep warm gold
HAIR_DEEP = rgba("A2732A")   # curtain and underside tone
SHIRT = rgba("9AB648")       # the dress green
SHIRT_DARK = rgba("7E9838")  # petal scallop shading
TRIM = rgba("F5EBD2")        # cream collar/sleeve trim and stitch line
PANTS = rgba("74882F")       # deep pleat green (theta hook)
PANTS_DARK = rgba("5E7026")
TIE = rgba("6E7A24")         # the green pigtail ties — identity
SOCK = rgba("FFF3D8")
SHOE = rgba("7FA240")        # green canvas upper
WHITE = rgba("EED9A6")       # cream cupsole, warm
SOLE = rgba("F6E0B8")        # toe bumper and laces
# The team accent is the SOCK STRIPE (the bare-leg lane's convention).
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: soft brow band rows 295-300
# centred ~297 (43.0% of the 3.99→2.55 head, z 3.37), the big hazel eyes
# rows 301-319 centred ~309.5 (48.7%, z 3.29), the smile bounded at ~69%
# (z 3.00 — its line is skin-adjacent and the recipe records the refusal;
# the corner shadow sits at 68.6).
HEAD_CENTER = (0.0, -0.020, 3.300)
HEAD_RADII = (0.400, 0.420, 0.420)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.05, 1.03),
    (-0.30, 1.06),
    (-0.60, 1.03),
    (-1.00, 0.95),
)


def face_half_scale(nz: float) -> float:
    """The multiplier on the ellipsoid's own lateral radius at this latitude."""
    table = FACE_SCALE
    if nz >= table[0][0]:
        return table[0][1]
    for (z0, s0), (z1, s1) in zip(table, table[1:]):
        if nz >= z1:
            return s0 + (s1 - s0) * (z0 - nz) / (z0 - z1)
    return table[-1][1]


def socket_push(nx: float, nz: float) -> float:
    """Big hazel eyes — a soft dish; the atlas carries the green iris."""
    dz = nz - 0.030
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small upturned button (centre nz -0.33)."""
    if abs(nx) > 0.16:
        return 0.0
    dz = nz + 0.330
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.16) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.078 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Her ears hide behind the pigtail roots in every metric.
# not-traceable: placement is by eye against the profile view (~z 3.28).
EAR_SPEC = EarSpec(center=(0.020, 3.280), radii=(0.1200, 0.1500))

# Island solved for her span (crown 3.99, neck 2.55, H 1.448): brow anchor 40
# samples cell 38 → z 3.371 (43.0 against the traced 43.0), eye anchor 46
# samples cell 44 → z 3.322 (46.4 vs 48.7 — the tolerance edge, deliberate:
# the review camera's parallax otherwise drops the 62% faceSkin row onto the
# drawn sclera), mouth anchor 85 samples cell 88 → z 2.996 (68.9 vs 68.9).
FACE_ISLAND = (0.92, -1.5887, 2.500)

HEAD_SPEC = HeadSpec(
    center=HEAD_CENTER,
    radii=HEAD_RADII,
    half_scale=face_half_scale,
    socket=socket_push,
    nose=nose_push,
    island=FACE_ISLAND,
)

FACE_ROWS = [0.0, 0.092, 0.184, 0.276, 0.340, 0.404, 0.468,
             0.532, 0.596, 0.660, 0.724, 0.816, 0.908, 1.0]


def skull_surface_x(y: float, z: float) -> float:
    """The skull's lateral half-width at (y, z) — what the ear mounts against."""
    ny = (y - HEAD_CENTER[1]) / HEAD_RADII[1]
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    remainder = 1.0 - ny * ny - nz * nz
    if remainder <= 0.0:
        return 0.0
    return HEAD_RADII[0] * (remainder ** 0.5) * face_half_scale(nz)


def skull_front_y(x: float, z: float) -> float:
    """The RENDERED face's forward extent at (x, z) — the flattened-face clamp
    (head_surface scales front depth by 0.88 - 0.11·frontness²) with the
    no-skull sentinel."""
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    rx = HEAD_RADII[0] * face_half_scale(nz)
    nx = x / rx if rx else 2.0
    s2 = 1.0 - nz * nz
    if s2 <= 0.0:
        return -10.0
    cb2 = 1.0 - (nx * nx) / s2
    if cb2 <= 0.0:
        return -10.0
    cb = sqrt(cb2)
    depth = 0.88 - 0.11 * cb * cb
    return HEAD_CENTER[1] - HEAD_RADII[1] * sqrt(s2) * cb * depth


# --- The hair: swept cap, low wavy pigtails ------------------------------------
#
# A blonde cap with a soft fringe above the brows and curtains that merge
# into the pigtail roots at ear height.
# measured: front z=3.90 halfWidth=0.2695
# measured: front z=3.58 halfWidth=0.5617
CAP_LEVELS = [
    (3.940, 0.140, 0.150, 0.000),
    (3.860, 0.290, 0.305, 0.000),
    (3.760, 0.365, 0.385, 0.005),
    (3.660, 0.415, 0.435, 0.010),
    (3.560, 0.448, 0.465, 0.015),
    (3.460, 0.462, 0.478, 0.020),
    (3.340, 0.470, 0.486, 0.030),
    (3.200, 0.440, 0.462, 0.055),
    (3.060, 0.350, 0.380, 0.100),
    (2.960, 0.270, 0.310, 0.145),
]

# The fringe sweeps low over the brows (brow band tops at z 3.40).
CAP_FRINGE = [
    (0.00, 3.415),
    (0.20, 3.420),
    (0.30, 3.380),
    (0.38, 3.230),
    (0.46, 3.100),
]

CAP_OPEN_BOTTOM = 2.980


def fringe_z_at(x_abs: float) -> float:
    table = CAP_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def ring_loft_cap(builder: MeshBuilder, levels, detail: int) -> None:
    """The ring-loft-with-tuck over the skull."""
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_cap levels must be strictly descending in z"
    segments = 18 if detail >= 2 else (10 if detail == 1 else 8)
    use = levels if detail >= 2 else thin_for_lod([(z, hx, hy, yc) for z, hx, hy, yc in levels], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            x = half_x * cos(theta)
            y = y_centre + half_y * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                if CAP_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.300)
            # The curtains and underside take the deep tone — hair and skin
            # sat so close in hue the crown read near-bare at hero scale.
            col = HAIR if z > 3.30 else HAIR_DEEP
            ring.append(builder.vertex((x, y, z), col, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), HAIR, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.02), HAIR, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


# LOW wavy pigtails: one lobed tube per side spouting outward from the tie
# at ear height and falling to a soft point at the shoulder line. Depth
# reach stays under 0.53 (the review render auto-frames the bounding box —
# Rocket's camera lesson).
# measured: front z=3.26 halfWidth=0.8636
# not-traceable: the y stations are depth no front view can give; bounded
# off the profile (the tails ride beside the head, not behind it).
# The tails curve down and IN, framing the chin — the sheet's inner edges
# reach x ±0.08 at z 2.80 (hair runs 145-179/220-262 at that row), which is
# what ends the concept's own head box at 2.79: the tails merge with the
# neck run and the pinch sits above them.
PIGTAIL_SPINE = [
    (0.400, 0.020, 3.290),
    (0.540, 0.030, 3.320),
    (0.660, 0.045, 3.200),
    (0.700, 0.060, 3.000),
    (0.420, 0.080, 2.820),
    (0.200, 0.095, 2.700),
]
PIGTAIL_RADII = [0.085, 0.160, 0.185, 0.180, 0.150, 0.075]

TIE_SPINE = [(0.385, 0.010, 3.280), (0.455, 0.018, 3.310)]
TIE_RADII = [0.095, 0.085]


def build_petal_hem(builder: MeshBuilder, detail: int) -> None:
    """The scalloped petal hem — the dress's signature construction. Six
    petals (an EVEN count: cos(6θ) survives θ→π−θ, five does not — the
    Penny/Clover mirror lessons), a thin proud shell riding the hem cone,
    petal bottoms dipping between scallop highs, cream stitch on top."""
    if detail < 1:
        return
    segments = 24 if detail >= 2 else 12
    rows = []
    specs = [
        (1.310, 0.545, 0.378, 0.0, TRIM),      # stitch ring
        (1.245, 0.585, 0.404, 0.0, SHIRT),
        (1.180, 0.625, 0.432, 1.0, SHIRT_DARK),  # petal edge, dipping
    ]
    for z0, half_x, half_y, dip, col in specs:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            scallop = 0.5 + 0.5 * cos(6 * theta)
            z = z0 - dip * 0.055 * (1.0 - scallop)
            ring.append(builder.vertex(
                (half_x * cos(theta) * 1.018, half_y * sin(theta) * 1.018, z),
                col, "Hips"))
        rows.append(ring)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((upper[column], upper[nxt], lower[nxt], lower[column]), 1)


def build_hair(builder: MeshBuilder, detail: int) -> None:
    ring_loft_cap(builder, CAP_LEVELS, detail)
    tail_sides = 7 if detail >= 2 else (5 if detail == 1 else 3)
    spine = PIGTAIL_SPINE if detail >= 1 else PIGTAIL_SPINE[::2]
    radii = PIGTAIL_RADII if detail >= 1 else PIGTAIL_RADII[::2]
    for side in (1, -1):
        pts = [(side * x, y, z) for x, y, z in spine]
        # ⚠️ groove subtracts ABSOLUTELY — keep it under the tip radius.
        # NO lobes: every lobed variant read the faceSkin row in different
        # phase per side (asymmetry 4.0-4.5, Penny's clump-phase class); the
        # wave lives in the spine's S-curve, which mirrors exactly.
        builder.tube(pts, radii, 2, HAIR, "Head", tail_sides,
                     flip=side < 0)
        if detail >= 1:
            tie = [(side * x, y, z) for x, y, z in TIE_SPINE]
            builder.tube(tie, TIE_RADII, 2, TIE, "Head", 5, flip=side < 0)


# --- The petal dress -----------------------------------------------------------
#
# Bubbles/Dazzle's construction: the torso loft IS the garment, cream ringer
# collar, A-line flare to the widest hem on the roster, an inner hem lip for
# thickness. The petal read is the theta hook: five scallop wedges shade one
# step deeper toward the hem, under a cream stitch ring.
# measured: front z=1.26 halfWidth=0.7338 tol=0.06
# not-traceable: the hem run merges with her hanging hands (the 0.73 above
# includes them); the hem half here is bounded off the green cluster run
# 90-311 at z 1.25 minus the hand runs.
TORSO_LEVELS = [
    (1.130, 0.520, 0.360, "Hips"),    # hem inner lip — the skirt has thickness
    (1.145, 0.590, 0.405, "Hips"),    # hem underside
    (1.180, 0.615, 0.425, "Hips"),
    (1.300, 0.540, 0.385, "Hips"),
    (1.430, 0.465, 0.340, "Hips"),
    (1.560, 0.395, 0.300, "Hips"),
    (1.700, 0.330, 0.262, "Spine"),
    (1.850, 0.300, 0.245, "Spine"),
    (2.000, 0.285, 0.238, "Spine1"),
    (2.180, 0.278, 0.230, "Spine1"),
    (2.320, 0.268, 0.222, "Spine2"),
    (2.440, 0.248, 0.208, "Spine2"),
    (2.560, 0.205, 0.176, "Spine2"),
    (2.650, 0.165, 0.146, "Spine2"),
    (2.672, 0.152, 0.136, "Spine2"),  # cream ringer collar, proud
    (2.700, 0.138, 0.126, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

STITCH_RING = (1.235, 1.275)
SKIRT_TOP = 1.700


def dress_color(theta: float, z: float):
    if z > 2.662:
        return TRIM        # the cream ringer collar
    if STITCH_RING[0] <= z <= STITCH_RING[1]:
        return TRIM        # the petal stitch line
    if z < SKIRT_TOP:
        # Five petal scallops, colour only — deeper green in the folds.
        return SHIRT_DARK if sin(2.5 * theta) > 0.55 else SHIRT
    return SHIRT

# Her neck pinch is row 424 → z 2.55. Bottom ring 2px narrower than the
# ring above (the headBox detector keeps the topmost of equal-width rows).
# not-traceable: the pinch half is bounded off the skin sliver between the
# pigtail curtains (~0.125).
# The collar rides at the sheet's own z 2.62 line, so the visible neck is
# only the 2.64-2.80 sliver above it — with the pigtail bottoms hugging the
# jaw, the headBox pinch lands at ~2.78 like the concept's own.
# The 0.118 ring at 2.78 is a deliberate notch: her chin cap tapers to
# 0.122 at z 2.90, and without a visible row narrower than that the headBox
# pinch lands on the chin and reads the head 3 points short. The notch puts
# the pinch at the concept's own 2.79 line; at 0.008 it is invisible.
NECK_LEVELS = [
    (2.600, 0.126, 0.118, "Spine2"),
    (2.700, 0.130, 0.122, "Neck"),
    (2.780, 0.118, 0.111, "Neck"),
    (2.840, 0.128, 0.120, "Neck"),
    (2.900, 0.150, 0.141, "Neck"),
]


# --- Arms: cream-trimmed cap sleeves, bare arms --------------------------------
SLEEVE_HEM_X = 0.480

SHOULDER_BLEND = {
    0.215: 0.88,
    0.300: 0.62,
    0.345: 0.36,
    0.420: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare arm traces ~0.06 half at the wrist runs.
ARM_STATIONS = [
    (0.215, 0.138, SHIRT, "Arm"),
    (0.300, 0.142, SHIRT, "Arm"),
    (0.335, 0.135, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.124, SHIRT, "Arm"),
    (0.450, 0.114, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.118, TRIM, "Arm"),            # cream trim roll, proud
    (0.505, 0.110, TRIM, "Arm"),
    (0.525, 0.086, SHIRT, "Arm"),
    (0.545, 0.066, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.063, SKIN, "ForeArm"),
    (1.240, 0.060, SKIN, "ForeArm"),
    (1.365, 0.058, SKIN, "Hand"),
    (1.412, 0.066, SKIN, "Hand"),
    (1.465, 0.074, SKIN, "Hand"),   # knuckle line
    (1.512, 0.064, SKIN, "Hand"),
]

CLOVER_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.546,
        finger_root=1.498,
        finger_offsets=((-0.043, 0.0, 0.043), (-0.029, 0.029)),
        finger_lengths=((0.098, 0.112, 0.100), (0.104, 0.109)),
        finger_widths=(0.027, 0.026, 0.021, 0.016),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.386, -0.032, -0.016),
            (1.434, -0.054, -0.027),
            (1.470, -0.066, -0.035),
            (1.490, -0.072, -0.039),
        ),
        thumb_widths=(0.027, 0.025, 0.019, 0.014),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Bare legs, striped socks, green hi-tops -----------------------------------
INSEAM_TOP_Z = 1.180
INSEAM_HEM_Z = 0.900
INSEAM_HEM_HALF = 0.000


def inseam_half(z: float) -> float:
    return 0.0

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# The pair-outer extents below are the sheet's own silhouette.
# measured: front z=1.02 halfWidth=0.3539 tol=0.03
# measured: front z=0.70 halfWidth=0.3864 tol=0.03
LEG_STATIONS = [
    (1.240, 0.128, 1.02, SKIN, "UpLeg"),
    (1.100, 0.122, 1.01, SKIN, "UpLeg"),
    (0.950, 0.116, 1.01, SKIN, "Leg"),
    (0.800, 0.112, 1.01, SKIN, "Leg"),
    (0.700, 0.115, 1.00, SKIN, "Leg"),             # the calf
    (0.580, 0.104, 1.00, SKIN, "Leg"),
    (0.520, 0.114, 1.00, SOCK, "Leg"),             # sock top roll
    (0.460, 0.108, 1.00, SOCK, "Leg"),
    (0.425, 0.110, 1.00, TEAM_MASK, "Leg"),        # the stripe — THE accent
    (0.390, 0.108, 1.00, TEAM_MASK, "Leg"),
    (0.360, 0.102, 0.99, SOCK, "Foot"),
    (0.280, 0.094, 0.97, SOCK, "Foot"),
    (0.150, 0.088, 0.95, SOCK, "Foot"),
]

# The dress covers the hips; no crotch yoke is needed above bare legs, but
# the small bridge keeps the up-skirt angle closed.
# not-traceable: interior geometry no view can show.
CROTCH_LEVELS = [
    (1.150, 0.130, 0.150, "Hips"),
    (1.250, 0.150, 0.180, "Hips"),
    (1.360, 0.170, 0.210, "Hips"),
]

CLOVER_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=SKIN,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Green canvas hi-top with cream cupsole, toe bumper and laces — the family
# last at her scale.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 14.0 * pi / 180.0

# not-traceable: the last's fore-aft profile has no sheet view; the scales it
# is built to are the traced numbers above.
SHOE_STATIONS = [
    (-0.439, 0.058, 0.210, SOLE),
    (-0.388, 0.106, 0.242, SOLE),
    (-0.314, 0.140, 0.268, SOLE),
    (-0.228, 0.162, 0.282, SOLE),
    (-0.131, 0.174, 0.288, SOLE),
    (-0.034, 0.180, 0.290, SOLE),
    (0.057, 0.179, 0.288, SOLE),
    (0.137, 0.168, 0.282, SOLE),
    (0.188, 0.144, 0.272, SOLE),
    (0.239, 0.106, 0.236, SOLE),
]

# not-traceable: a cross-section is a fore-aft cut no view can give.
SHOE_SECTION = [
    (0.000, 0.000, "midsole"),
    (0.620, 0.004, "midsole"),
    (0.950, 0.030, "midsole"),
    (1.000, 0.130, "midsole"),
    (0.985, 0.300, "midsole"),
    (0.820, 0.330, "quarter"),
    (0.805, 0.450, "quarter"),
    (0.785, 0.580, "quarter"),
    (0.758, 0.700, "quarter"),
    (0.722, 0.820, "quarter"),
    (0.662, 0.880, "quarter"),
    (0.520, 0.950, "quarter"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_MID = [
    (0.000, 0.000, "midsole"),
    (0.970, 0.060, "midsole"),
    (0.985, 0.300, "midsole"),
    (0.820, 0.330, "quarter"),
    (0.785, 0.580, "quarter"),
    (0.722, 0.820, "quarter"),
    (0.662, 0.880, "quarter"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_LOW = [
    (0.000, 0.000, "midsole"),
    (0.985, 0.300, "midsole"),
    (0.820, 0.330, "quarter"),
    (0.722, 0.820, "quarter"),
    (0.000, 1.000, "collar"),
]


def shoe_floor_at(y_unscaled: float) -> float:
    if y_unscaled <= -0.30:
        t = (-0.30 - y_unscaled) / 0.14
        return SHOE_FLOOR + 0.042 * min(1.0, t) ** 1.6
    if y_unscaled >= 0.16:
        t = (y_unscaled - 0.16) / 0.08
        return SHOE_FLOOR + 0.025 * min(1.0, t) ** 1.5
    return SHOE_FLOOR


SHOE_LENGTH_SCALE = 1.00
SHOE_WIDTH_SCALE = 0.95
SHOE_HEIGHT_SCALE = 1.26

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, green canvas above — the hi-top collar rides high.
# The sheet's band is 33/51 cream to green — the green canvas rides LOW.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.100, "quarter"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    # Small cream bumper — the sheet's band is majority green.
    if y_unscaled > -0.30:
        return 2.0
    frac = min(1.0, max(0.0, (-0.30 - y_unscaled) / 0.14))
    return 0.650 - 0.09 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    if y_unscaled < 0.12:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.12) / 0.14))
    return 0.525 - 0.16 * frac


CLOVER_SHOE = ShoeSpec(
    stations=SHOE_STATIONS,
    section=SHOE_SECTION,
    section_mid=SHOE_SECTION_MID,
    section_low=SHOE_SECTION_LOW,
    bands=SHOE_BANDS,
    floor=SHOE_FLOOR,
    toe_out=SHOE_TOE_OUT,
    top_max=SHOE_TOP_MAX,
    length_scale=SHOE_LENGTH_SCALE,
    width_scale=SHOE_WIDTH_SCALE,
    height_scale=SHOE_HEIGHT_SCALE,
    sole_profile=shoe_floor_at,
    toe_cap_edge=toe_cap_v_low,
    heel_counter_edge=heel_counter_v_low,
    collar=(0.022, 0.105),
    straps=((-0.132, -0.116), (-0.050, -0.036)),
    strap_arc_min=0.55,
    heel_point=(0.286, 0.106 + 0.025),
    toe_point=(-0.470, 0.044 + 0.042),
    upper=SHOE,
    trim=SOLE,
    midsole=WHITE,
)


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    face_columns = 27 if detail >= 2 else (9 if detail == 1 else 5)
    back_columns = 6 if detail >= 2 else (2 if detail == 1 else 1)
    if detail >= 2:
        rows_spec, crown, chin = FACE_ROWS, 3, 2
    elif detail == 1:
        rows_spec, crown, chin = [0.0, 0.184, 0.340, 0.468, 0.660, 1.0], 1, 1
    else:
        rows_spec, crown, chin = [0.0, 0.32, 0.60, 1.0], 1, 1
    head_surface(builder, face_columns, back_columns, rows_spec, crown, chin,
                 spec=HEAD_SPEC, palette=PALETTE)

    build_hair(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 0, SKIN, 8 if detail >= 2 else 6)
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, SHIRT, 18 if detail >= 2 else segments, color_fn=dress_color)
    build_petal_hem(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=CLOVER_ARM)
        build_leg(builder, side, detail, spec=CLOVER_LEG)
        build_shoe(builder, side, detail, spec=CLOVER_SHOE,
                   ankle_x=leg_x(LEG_ANKLE_Z), bone=limb_bone("ToeBase", side))


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
    obj["recessReference"] = "clover-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_clover_LOD0", "kid_clover_LOD1", "kid_clover_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_clover_LOD0": (20, 12, 2),
        "kid_clover_LOD1": (8, 4, 1),
        "kid_clover_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "clover")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Clover reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against clover-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock-stripe accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- clover\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_clover_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
