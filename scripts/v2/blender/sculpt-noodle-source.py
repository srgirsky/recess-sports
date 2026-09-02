"""Rebuild Noodle as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/noodle-pilot.blend \
    --python scripts/v2/blender/sculpt-noodle-source.py

★ NOODLE IS THE BALD ONE — the first head whose crown is its own skin, no
hair build at all, so the egg dome and the ears carry the whole silhouette.
His glasses are Bendy Bao's construction at the roster's biggest radius, his
striped tee is the first LONG sleeve (the bands continue down the arms as
station colours), and his jeans roll into light-denim cuffs that are the
team-accent surface (he has no socks for the roll-top convention).

The conversion: front figure 678px over 4.0ft → 1px = 0.005900ft. The profile
faces +x. Head band: bald crown row 123 (z 3.99) to neck pinch row 332
(z 2.76) — 30.8% of the figure, and the pinch is a real 0.10ft noodle neck.
"""

from __future__ import annotations

from math import cos, pi, sin, sqrt
from pathlib import Path
import sys

import bpy
from mathutils import Vector

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
OUTPUT = REPO / "assets/v2/source/noodle-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/noodle-face-atlas.png"
REVISION = "noodle-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: pale skin #FBC48B over #D38C55 shading, denim #334B64,
# blue-grey stripe #9AADBB (which also covers the jean rolls — one cluster,
# two garments), and a cream that IS the backdrop's cluster. Ramp-authored.
# ⚠️ Authored at ~1.3x the sheet's chromatic spread: the board ramp
# compresses chroma, and the first build's #FFC98E delivered a dome at
# warmth 37 against the concept's 112 — the whole bald head failed the
# classifier's isSkin warmth band and visible-face read half its target.
SKIN = rgba("FFC578")
SKIN_SHADOW = rgba("DA9654")
HAIR = rgba("3A2A1C")        # unused surface lane — he is bald; brows are atlas ink
SHIRT = rgba("FFF4DE")       # the tee's cream ground
SHIRT_DARK = rgba("A8C4DA")  # the blue stripe — chroma up over the sheet's #9aadbb
PANTS = rgba("3A557A")       # denim
PANTS_DARK = rgba("2A3E5C")
SOCK = rgba("FFF6E6")        # unused — jeans roll straight into the shoes
SHOE = rgba("B08652")        # tan-brown canvas panels (classifier pair
                             # #f9ecdd/#937553 — the tan must separate)
WHITE = rgba("FFF2D8")       # cream cupsole
SOLE = rgba("FAE2B4")        # warm cream toe bumper, laces
# The team accent is the JEANS' ROLLED CUFF — he has no sock for the roll-top
# convention, and the light-denim roll is mask-friendly (the untinted board's
# grey-cream sits beside the drawn light denim).
TEAM_MASK = rgba("D8D2C6")
GLASSES = rgba("241A12")     # the bold round frames

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# The egg: crown z 3.99 IS the skull. Features crowd the lower half beneath
# the dome — thin arched brows rows 196-202 (36.4% of the 3.99→2.76 head,
# z 3.55), the big lens rings rows 203-260 centred row 231.5 (51.9%, z 3.35),
# nose rows 256-263, the small smile rows 262-270 (69.4%, z 3.14). Ears on
# the head's widest row (57.9%, z 3.28) — real ears, the widest thing on a
# bald head.
HEAD_CENTER = (0.0, -0.020, 3.400)
HEAD_RADII = (0.500, 0.540, 0.590)

# The egg tapers below the ears: full through the dome, narrowing to the jaw.
FACE_SCALE = (
    (1.00, 0.97),
    (0.40, 1.00),
    (0.05, 1.00),
    (-0.30, 0.97),
    (-0.60, 0.90),
    (-1.00, 0.80),
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
    """Calm wide eyes — the glasses carry the read; the dish stays gentle."""
    dz = nz - (-0.123)
    dx = abs(nx) - 0.300
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.022
    if radial >= 1.0:
        return 0.0
    return 0.006 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small button between the lenses and the smile (centre nz -0.42)."""
    if abs(nx) > 0.16:
        return 0.0
    dz = nz + 0.420
    if dz < -0.10 or dz > 0.11:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.16) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.090 if dz >= 0.0 else 0.100
    t = dz / reach
    tip = 0.080 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Big ears on the widest row of the head.
EAR_SPEC = EarSpec(center=(0.020, 3.280), radii=(0.1600, 0.1900))

# Island solved for his span (head centre 3.40, rz 0.59): brow anchor 28
# lands z 3.531 (37.3% of the 3.99→2.76 head against the traced 36.4), eye
# anchor 50 lands z 3.330 (53.7 vs 51.9), mouth anchor 67 lands z 3.136
# (69.4 vs 69.4).
FACE_ISLAND = (0.92, -1.3696, 2.000)

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


# --- The glasses ---------------------------------------------------------------
#
# Bendy Bao's construction at the roster's biggest radius: bold round frames,
# lens centres ±0.176 at z 3.35, radius 0.166, 0.030 proud of the cheek (any
# prouder and the profile encloses a see-through pocket — the silhouette gate
# counts it). Temple arms bow OUTBOARD along the dome to the ear roots.
GLASSES_Z = 3.350
GLASSES_LENS_X = 0.176
GLASSES_RADIUS = 0.166
# The drawn frame is ~4px = 0.024ft DIAMETER; a 0.026 radius doubled it
# and the fat wires ate ~20% of the faceSkin sample row.
GLASSES_WIRE = 0.013


def build_glasses(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    face_y = skull_front_y(GLASSES_LENS_X, GLASSES_Z)
    plane_y = (face_y if face_y > -9.0 else -0.40) - 0.022
    sides = 12 if detail >= 2 else 8
    for side in (1, -1):
        spine = []
        for i in range(sides):
            a = 2 * pi * i / sides
            spine.append((side * GLASSES_LENS_X + GLASSES_RADIUS * cos(a),
                          plane_y,
                          GLASSES_Z + GLASSES_RADIUS * sin(a)))
        # ⚠️ Material 2 (the hair slot), NEVER 3: M_Accessory is team-tinted.
        builder.tube(spine, [GLASSES_WIRE] * sides, 2, GLASSES, "Head", 5,
                     cyclic=True, axis=Vector((0.0, 1.0, 0.0)), flip=side < 0)
        outer_x = side * (GLASSES_LENS_X + GLASSES_RADIUS)
        builder.tube(
            [(outer_x, plane_y + 0.028, GLASSES_Z + 0.02),
             (side * 0.470, plane_y + 0.20, GLASSES_Z - 0.020),
             (side * 0.520, plane_y + 0.40, GLASSES_Z - 0.070)],
            [GLASSES_WIRE, GLASSES_WIRE * 0.9, GLASSES_WIRE * 0.7],
            2, GLASSES, "Head", 4, flip=side < 0)
    builder.tube(
        [(-GLASSES_LENS_X + GLASSES_RADIUS - 0.01, plane_y, GLASSES_Z + 0.02),
         (0.0, plane_y - 0.006, GLASSES_Z + 0.034),
         (GLASSES_LENS_X - GLASSES_RADIUS + 0.01, plane_y, GLASSES_Z + 0.02)],
        [GLASSES_WIRE, GLASSES_WIRE, GLASSES_WIRE],
        2, GLASSES, "Head", 4)


# --- The striped long-sleeve tee -----------------------------------------------
#
# Blue bands on a cream ground, traced down the centreline at cx+20: blue at
# 2.485-2.545 (the collar band), 2.265-2.410, 1.965-2.135, and 1.645-1.815.
# Hem z 1.575 — denim below. The sleeves carry the bands as station colours.
# not-traceable: his hanging long sleeves merge with the tee at every torso
# row; the halves here are bounded off the cream cluster run between the
# sleeve edges (170-260 at z 2.20, half 0.266).
TORSO_LEVELS = [
    (1.575, 0.290, 0.250, "Hips"),    # hem underside
    (1.608, 0.310, 0.268, "Hips"),    # hem band, proud
    (1.660, 0.300, 0.260, "Hips"),
    (1.800, 0.285, 0.250, "Spine"),
    (2.000, 0.270, 0.240, "Spine1"),
    (2.200, 0.265, 0.230, "Spine1"),
    (2.340, 0.258, 0.220, "Spine2"),
    (2.420, 0.238, 0.204, "Spine2"),
    (2.480, 0.198, 0.175, "Spine2"),
    (2.560, 0.150, 0.136, "Spine2"),
    (2.598, 0.130, 0.120, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

# ⚠️ (lo, hi) ASCENDING — the membership test is `lo <= z <= hi`.
STRIPES = ((1.645, 1.815), (1.965, 2.135), (2.265, 2.410), (2.485, 2.545))

# ★ LOD0 gets a ring 0.006ft inside each stripe edge on both sides — vertex
# colours interpolate across quad rows, so band edges between distant rings
# smear. LOD1/2 keep the sparse table.
# not-traceable: the paired rows are the STRIPES chart re-expressed as loft
# rings; the shape numbers between them interpolate the traced table above.
TORSO_LEVELS_CRISP = [
    (1.575, 0.290, 0.250, "Hips"),
    (1.608, 0.310, 0.268, "Hips"),
    (1.639, 0.303, 0.262, "Hips"),
    (1.651, 0.302, 0.261, "Hips"),
    (1.809, 0.284, 0.249, "Spine"),
    (1.821, 0.283, 0.249, "Spine"),
    (1.959, 0.272, 0.242, "Spine"),
    (1.971, 0.271, 0.241, "Spine1"),
    (2.129, 0.266, 0.233, "Spine1"),
    (2.141, 0.266, 0.232, "Spine1"),
    (2.259, 0.262, 0.226, "Spine1"),
    (2.271, 0.261, 0.225, "Spine1"),
    (2.404, 0.242, 0.208, "Spine2"),
    (2.416, 0.240, 0.206, "Spine2"),
    (2.479, 0.199, 0.176, "Spine2"),
    (2.491, 0.196, 0.173, "Spine2"),
    (2.560, 0.150, 0.136, "Spine2"),
    (2.598, 0.130, 0.120, "Spine2"),
]


def stripe_color(theta: float, z: float):
    for lo, hi in STRIPES:
        if lo <= z <= hi:
            return SHIRT_DARK
    return SHIRT

# The noodle neck: a real 0.10ft half — the skinniest pinch on the roster.
# measured: front z=2.70 halfWidth=0.1003 tol=0.03
NECK_LEVELS = [
    (2.588, 0.114, 0.108, "Spine2"),
    (2.690, 0.104, 0.099, "Neck"),
    (2.830, 0.114, 0.108, "Neck"),
]


# --- Arms: striped LONG sleeves to ribbed cuffs at the wrist -------------------
SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the band spacing carries the tee's stripe rhythm down the sleeve and
# only the hands are bare (~0.055 half at the wrist).
ARM_STATIONS = [
    (0.215, 0.132, SHIRT_DARK, "Arm"),
    (0.300, 0.136, SHIRT_DARK, "Arm"),
    (0.335, 0.129, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.118, SHIRT, "Arm"),
    (0.520, 0.108, SHIRT_DARK, "Arm"),
    (0.600, 0.103, SHIRT_DARK, "Arm"),
    (0.680, 0.099, SHIRT, "Arm"),
    (0.780, 0.095, SHIRT, "Arm"),
    (0.860, 0.092, SHIRT_DARK, "Arm"),
    (ARM_ELBOW_X, 0.090, SHIRT_DARK, "ForeArm"),
    (1.000, 0.088, SHIRT, "ForeArm"),
    (1.100, 0.086, SHIRT_DARK, "ForeArm"),
    (1.195, 0.084, SHIRT_DARK, "ForeArm"),
    (1.262, 0.082, SHIRT, "ForeArm"),
    (1.300, 0.088, SHIRT_DARK, "Hand"),   # ribbed cuff, proud
    (1.336, 0.082, SHIRT_DARK, "Hand"),
    (1.356, 0.068, SHIRT_DARK, "Hand"),
    (1.376, 0.052, SKIN, "Hand"),
    (1.412, 0.058, SKIN, "Hand"),
    (1.465, 0.066, SKIN, "Hand"),   # knuckle line
    (1.512, 0.056, SKIN, "Hand"),
]

NOODLE_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,  # buried, as the shoulder-wedge doctrine asks (was 0.100)
    root_ring=0.92,  # the A-pose coverage gap: see ArmSpec.root_ring (#208)
    elbow=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.548,
        finger_root=1.500,
        finger_offsets=((-0.044, 0.0, 0.044), (-0.030, 0.030)),
        finger_lengths=((0.100, 0.114, 0.102), (0.106, 0.111)),
        finger_widths=(0.024, 0.023, 0.019, 0.014),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.388, -0.033, -0.017),
            (1.436, -0.055, -0.028),
            (1.472, -0.068, -0.036),
            (1.492, -0.074, -0.040),
        ),
        thumb_widths=(0.024, 0.022, 0.017, 0.013),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Straight-leg jeans with team-accent rolls, no socks -----------------------
#
# Denim from under the tee to the rolled cuffs at 0.50-0.38, then straight
# into the shoes — no sock anywhere on the sheet.
INSEAM_TOP_Z = 1.480
INSEAM_HEM_Z = 0.700
INSEAM_HEM_HALF = 0.040


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=0.95 halfWidth=0.4159 tol=0.05
LEG_STATIONS = [
    (1.560, 0.175, 1.10, PANTS, "UpLeg"),
    (1.400, 0.172, 1.10, PANTS, "UpLeg"),
    (1.200, 0.170, 1.08, PANTS, "UpLeg"),
    (1.000, 0.168, 1.06, PANTS, "Leg"),
    (0.800, 0.166, 1.05, PANTS, "Leg"),
    (0.640, 0.163, 1.04, PANTS, "Leg"),
    (0.540, 0.160, 1.03, PANTS_DARK, "Leg"),
    (0.500, 0.174, 1.04, TEAM_MASK, "Leg"),           # the rolled cuff — the
    (0.440, 0.176, 1.04, TEAM_MASK, "Leg"),           # team-accent band
    (0.385, 0.170, 1.02, TEAM_MASK, "Leg"),
    (0.360, 0.130, 0.99, PANTS_DARK, "Foot"),         # under the roll
    (0.280, 0.100, 0.97, SKIN, "Foot"),               # ankle into the shoe
    (0.150, 0.090, 0.95, SKIN, "Foot"),
]

NOODLE_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Tan canvas low-top with cream cupsole, toe bumper and laces.
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
SHOE_WIDTH_SCALE = 0.96
SHOE_HEIGHT_SCALE = 1.26

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, tan canvas above.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.300, "quarter"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    if y_unscaled > -0.26:
        return 2.0
    frac = min(1.0, max(0.0, (-0.26 - y_unscaled) / 0.18))
    return 0.86 - 0.09 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.62 - 0.20 * frac


NOODLE_SHOE = ShoeSpec(
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
    straps=((-0.170, -0.122), (-0.060, -0.012)),
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

    build_glasses(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 2:
        builder.loft(TORSO_LEVELS_CRISP, 1, SHIRT, 19, color_fn=stripe_color)
    else:
        builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                     color_fn=stripe_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=NOODLE_ARM)
        build_leg(builder, side, detail, spec=NOODLE_LEG)
        build_shoe(builder, side, detail, spec=NOODLE_SHOE,
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
    obj["recessReference"] = "noodle-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_noodle_LOD0", "kid_noodle_LOD1", "kid_noodle_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_noodle_LOD0": (20, 12, 2),
        "kid_noodle_LOD1": (8, 4, 1),
        "kid_noodle_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "noodle")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Noodle reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against noodle-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the jean-roll accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- noodle\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_noodle_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
