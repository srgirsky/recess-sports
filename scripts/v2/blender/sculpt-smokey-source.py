"""Rebuild Smokey as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/smokey-pilot.blend \
    --python scripts/v2/blender/sculpt-smokey-source.py

★ SMOKEY IS THE SIMPLEST SHEET IN THE ROSTER — a tight buzz hugging the
skull (Moose's band extended to a full scalp cap), a plain red tee whose
lit and shaded halves split into two clusters, charcoal shorts, and the
second-widest real ears after Boomer's low pair. Everything here is proven
vocabulary; the build is deliberately boring.

The conversion: front figure 590px over 4.0ft → 1px = 0.006780ft. Head band:
buzz-top crown row 228 (z 3.99) to neck pinch row 410 (z 2.76) — 30.8% of
the figure.
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
OUTPUT = REPO / "assets/v2/source/smokey-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/smokey-face-atlas.png"
REVISION = "smokey-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: lit skin #D37434 with shadow #843C0B, red tee split into
# lit #E42A1C and shaded #CC1A0E (one garment, two clusters), charcoal
# #2A241D, near-black buzz #1B140C, cream backdrop. Authored ≈ delivered·1.2
# with the highlight band clear of the isSkin saturation floor.
SKIN = rgba("F58B3E")
SKIN_SHADOW = rgba("B65A16")
HAIR = rgba("241A10")        # the buzz
SHIRT = rgba("FF3B26")       # the red tee, chroma up
SHIRT_DARK = rgba("D42718")  # the tee's shaded tone
PANTS = rgba("332C24")       # charcoal shorts
PANTS_DARK = rgba("241F19")
SOCK = rgba("FFF3D8")
SHOE = rgba("2A241D")        # the black toe wrap, collar and heel
WHITE = rgba("F0D188")       # warm cream quarter panels and cupsole
SOLE = rgba("E8C57E")        # laces and midsole trim
# The team accent is the SOCK ROLL-TOP (the bare-leg lane's convention).
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: heavy straight brows rows
# 311-318 centred ~314.5 (47.5% of the 3.99→2.76 head, z 3.41), the intense
# eyes rows 319-350 centred ~333 (57.7%, z 3.28), the small smile arcs rows
# 367-372 centred ~369.5 (77.7%, z 3.04).
HEAD_CENTER = (0.0, -0.020, 3.400)
HEAD_RADII = (0.525, 0.510, 0.540)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.05, 1.03),
    (-0.30, 1.05),
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
    """Intense deep-set eyes — a soft dish; the atlas carries the glare."""
    dz = nz + 0.220
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A broad flat button (centre nz -0.48)."""
    if abs(nx) > 0.20:
        return 0.0
    dz = nz + 0.480
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.20) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.090 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Real HUGE sticking-out ears — the widest head row is the ears.
# measured: front earLine=63.7 earWidth=1.234
EAR_SPEC = EarSpec(center=(0.020, 3.208), radii=(0.1550, 0.1500))

# Island solved for his span (crown 3.99, neck 2.76, H 1.234): brow anchor 38
# samples cell 36 → z 3.408 (47.5 against the traced 47.5), eye anchor 50
# samples cell 48 → z 3.282 (57.7 vs 57.7), mouth anchor 72 samples cell 75 →
# z 3.033 (77.9 vs 77.7).
FACE_ISLAND = (0.92, -1.7828, 2.500)

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


# --- The buzz ------------------------------------------------------------------
#
# Moose's band extended to a full scalp cap: a dark shell hugging the skull,
# open across the face, warm-dark so the fade reads as hair rather than
# paint (the Moose too-black lesson).
# measured: front z=3.90 halfWidth=0.3220
# measured: front z=3.50 halfWidth=0.5017
BUZZ_LEVELS = [
    (3.950, 0.170, 0.180, 0.000),
    (3.900, 0.225, 0.235, 0.000),
    (3.820, 0.350, 0.360, 0.000),
    (3.700, 0.460, 0.470, 0.005),
    (3.560, 0.520, 0.530, 0.010),
    (3.420, 0.540, 0.550, 0.020),
    (3.300, 0.530, 0.545, 0.035),
    (3.220, 0.500, 0.520, 0.055),
    (3.100, 0.300, 0.440, 0.100),
    (2.980, 0.240, 0.400, 0.145),
]

# A tight high-fade crop: the SIDES END ABOVE THE EARS (the ring at 3.22 is
# the last full-width one; the two below shrink to nape-hugging tongues so
# the back keeps hair while the ears stand clear) — two critics read the
# fuller shell as a bowl cut. The shell hugs the skull +0.02.
# The fade wraps FORWARD over the temples — the sheet's own skin band at
# the ear row is narrow, and a curtain edge that fails to flip a quad
# COLUMN moves the faceSkin metric by nothing (Ace's quantization lesson).
BUZZ_FRINGE = [
    (0.00, 3.500),
    (0.28, 3.470),
    (0.36, 3.300),
    (0.42, 3.140),
    (0.50, 3.020),
]

BUZZ_OPEN_BOTTOM = 2.940


def fringe_z_at(x_abs: float) -> float:
    table = BUZZ_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def build_buzz(builder: MeshBuilder, detail: int) -> None:
    # An ascending table silently inverts the winding — descending, asserted.
    assert all(a[0] > b[0] for a, b in zip(BUZZ_LEVELS, BUZZ_LEVELS[1:])), \
        "BUZZ_LEVELS must be strictly descending in z"
    segments = 18 if detail >= 2 else (10 if detail == 1 else 8)
    use = BUZZ_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in BUZZ_LEVELS], detail)
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
                if BUZZ_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.300)
            ring.append(builder.vertex((x, y, z), HAIR, "Head"))
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


# --- The red tee ---------------------------------------------------------------
#
# A plain red tee, collar to hem at z 1.45 — the sheet's lit and shaded reds
# are one garment.
# not-traceable: his hanging arms merge with the torso at every row; halves
# bounded off the red cluster runs (130-218 at z 2.35, 137-212 at z 2.20).
TORSO_LEVELS = [
    (1.450, 0.395, 0.330, "Hips"),    # hem underside
    (1.485, 0.415, 0.348, "Hips"),    # hem band, proud
    (1.650, 0.420, 0.352, "Spine"),
    (1.850, 0.415, 0.348, "Spine"),
    (2.050, 0.395, 0.330, "Spine1"),
    (2.220, 0.365, 0.305, "Spine1"),
    (2.340, 0.320, 0.270, "Spine2"),
    (2.440, 0.255, 0.218, "Spine2"),
    (2.500, 0.200, 0.172, "Spine2"),
    (2.545, 0.168, 0.148, "Spine2"),  # collar roll, proud
    (2.580, 0.150, 0.135, "Spine2"),  # neck hole — OUTSIDE the neck loft
]


def stripe_color(theta: float, z: float):
    return SHIRT

# His neck pinch is row 410 → z 2.76. Bottom ring 2px narrower than the
# ring above (the topmost-of-equals lesson).
# not-traceable: the visible pinch half is bounded off the sliver between
# jaw and collar (~0.14).
# The loft runs UP INTO the skull (2.95) so the chin's ellipsoid taper is
# always covered — rows above a short neck's top ring read the bare taper
# and steal the pinch (Smokey measured 28.2% against the sheet's 31.0 with
# the pinch on his chin point). The 0.136 waist at 2.75 is the concept's
# own pinch row.
NECK_LEVELS = [
    (2.560, 0.150, 0.141, "Spine2"),
    (2.660, 0.155, 0.146, "Neck"),
    (2.750, 0.136, 0.128, "Neck"),
    (2.850, 0.165, 0.155, "Neck"),
    (2.950, 0.185, 0.174, "Neck"),
]


# --- Arms: plain red short sleeves, chunky bare forearms -------------------------
SLEEVE_HEM_X = 0.660

SHOULDER_BLEND = {
    0.215: 0.88,
    0.300: 0.62,
    0.345: 0.36,
    0.420: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms into the belly outline; the chunky forearm is bounded ~0.085 half.
ARM_STATIONS = [
    (0.215, 0.160, SHIRT, "Arm"),
    (0.300, 0.165, SHIRT, "Arm"),
    (0.335, 0.158, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.148, SHIRT, "Arm"),
    (0.520, 0.136, SHIRT, "Arm"),
    (0.600, 0.128, SHIRT, "Arm"),
    (0.630, 0.122, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.132, SHIRT, "Arm"),           # hem roll, proud
    (0.688, 0.124, SHIRT, "Arm"),
    (0.706, 0.102, SHIRT, "Arm"),
    (0.724, 0.088, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.086, SKIN, "ForeArm"),
    (1.240, 0.082, SKIN, "ForeArm"),
    (1.365, 0.072, SKIN, "Hand"),
    (1.412, 0.078, SKIN, "Hand"),
    (1.465, 0.084, SKIN, "Hand"),   # knuckle line
    (1.512, 0.070, SKIN, "Hand"),
]

SMOKEY_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
    elbow=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.546,
        finger_root=1.498,
        finger_offsets=((-0.043, 0.0, 0.043), (-0.029, 0.029)),
        finger_lengths=((0.098, 0.112, 0.100), (0.104, 0.109)),
        finger_widths=(0.029, 0.028, 0.023, 0.018),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.386, -0.034, -0.017),
            (1.434, -0.056, -0.028),
            (1.470, -0.068, -0.036),
            (1.490, -0.074, -0.040),
        ),
        thumb_widths=(0.029, 0.027, 0.021, 0.016),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Charcoal shorts, chunky bare legs, roll-top socks -------------------------
SHORTS_HEM_Z = 0.880
INSEAM_TOP_Z = 1.430
INSEAM_HEM_Z = 0.860
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# The pair-outer extents below are the sheet's own silhouette.
#
# The leg opening is a TURNED-UP CUFF on the sheet, not a raw taper: the tube
# bulges to its widest just above an ink seam crease (front-view ink dips at
# z 0.997-0.970 across the leg, deepest at the inseam), the cuff band below
# the crease sits slightly INSET from that bulge, and the bottom edge lands
# at z 0.90 ± 0.01 with the under-hem shadow painted straight onto the thigh.
# Built as Penny's waistband lesson applied to a cuff: the crease is a
# PANTS_DARK ring between two short gaps so the shadow line stays a line, the
# cuff's bottom lip stands 0.010 proud of the cuff face so the rolled edge
# overhangs, and the turned-under PANTS_DARK lip keeps the under-hem shadow.
# measured: front z=1.10 halfWidth=0.5966 tol=0.06
# measured: front z=1.00 halfWidth=0.5729 tol=0.06
# measured: front z=0.945 halfWidth=0.5356 tol=0.06
# measured: front z=0.65 halfWidth=0.5288 tol=0.06
LEG_STATIONS = [
    (1.440, 0.235, 1.08, PANTS, "UpLeg"),
    (1.280, 0.230, 1.06, PANTS, "UpLeg"),
    (1.120, 0.226, 1.04, PANTS, "UpLeg"),
    (0.985, 0.228, 1.02, PANTS, "UpLeg"),           # tube bulge above the seam
    (0.970, 0.220, 1.02, PANTS_DARK, "UpLeg"),      # cuff seam crease — the ink line
    (0.945, 0.224, 1.01, PANTS, "UpLeg"),           # cuff face, inset from the bulge
    (0.895, 0.234, 1.01, PANTS, "Leg"),             # cuff bottom lip, proud
    (SHORTS_HEM_Z, 0.190, 1.00, PANTS_DARK, "Leg"), # hem inner lip, turned under
    (0.850, 0.152, 1.00, SKIN, "Leg"),              # chunky bare leg
    (0.740, 0.146, 1.01, SKIN, "Leg"),              # the calf
    (0.640, 0.138, 1.00, SKIN, "Leg"),
    (0.590, 0.132, 1.00, SKIN, "Leg"),
    (0.550, 0.142, 1.00, TEAM_MASK, "Leg"),         # roll-top, proud — THE accent
    (0.510, 0.138, 1.00, TEAM_MASK, "Leg"),
    (0.480, 0.128, 1.00, SOCK, "Foot"),
    (0.400, 0.118, 0.99, SOCK, "Foot"),
    (0.280, 0.104, 0.97, SOCK, "Foot"),
    (0.150, 0.094, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show.
CROTCH_LEVELS = [
    (0.900, 0.180, 0.220, "Hips"),
    (1.150, 0.215, 0.265, "Hips"),
    (1.470, 0.250, 0.310, "Hips"),
]

SMOKEY_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
    knee=0.0,
)


# --- The shoe ------------------------------------------------------------------
#
# Navy low-top with cream cupsole, toe bumper and laces — the family last,
# widest fit on the roster.
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


SHOE_LENGTH_SCALE = 1.06
SHOE_WIDTH_SCALE = 1.04
SHOE_HEIGHT_SCALE = 1.26

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole and quarter panels below, black wrap above — the sheet's
# two-tone Jordan read comes from the black toe cap and collar over cream.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.310, "quarter"),
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


SMOKEY_SHOE = ShoeSpec(
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

    build_buzz(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, PANTS, 8 if detail >= 2 else 6)
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, SHIRT, 17 if detail >= 2 else segments)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=SMOKEY_ARM)
        build_leg(builder, side, detail, spec=SMOKEY_LEG)
        build_shoe(builder, side, detail, spec=SMOKEY_SHOE,
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
    obj["recessReference"] = "smokey-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_smokey_LOD0", "kid_smokey_LOD1", "kid_smokey_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_smokey_LOD0": (20, 12, 2),
        "kid_smokey_LOD1": (8, 4, 1),
        "kid_smokey_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "smokey")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Smokey reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against smokey-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock roll-top accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- smokey\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_smokey_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
