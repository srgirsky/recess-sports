"""Rebuild Big Lou as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/big-lou-pilot.blend \
    --python scripts/v2/blender/sculpt-big-lou-source.py

★ LOU IS THE GENTLE GIANT — the roster's roundest silhouette and warmest
grin. Smokey's buzz shell on a big skull, Flash's crisp-ring stripes on the
gold-and-cream tee over the round belly, navy shorts, chunky bare legs into
proud white socks and navy sneakers. His deep brown skin is the roster's
darkest and is chroma-authored (the Grizz lesson).

The conversion: front figure 712px over 4.0ft → 1px = 0.005618ft. Head
band: crown row 106 (z 3.99) to the HAND-SET neck row 305 (z 2.88) — the
analyser refused his pinch (chin merges into neck, Boomer's chunky class).
Expect the headBox family to carry that class at measure time.
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
OUTPUT = REPO / "assets/v2/source/big-lou-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/big-lou-face-atlas.png"
REVISION = "big-lou-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: gold stripe #F2B64F over cream #EFE0C0, deep brown skin
# #944B25 (lit cheek), near-black buzz #030202, navy shorts. Deep skin is
# chroma-authored at ~1.3x the sheet's spread so the ramp keeps the
# highlight band above the isSkin floor (the Grizz lesson).
SKIN = rgba("9C5428")
SKIN_SHADOW = rgba("6E3A18")
HAIR = rgba("221812")        # the buzz shell
HAIR_DARK = rgba("120C08")
GOLD = rgba("F0B850")        # tee stripe gold
CREAM = rgba("FBEECC")       # tee stripe cream
SHORTS = rgba("2A3044")
SHORTS_DARK = rgba("1C2232")
SOCK = rgba("FFF6E4")
SHOE = rgba("38405C")        # navy canvas upper
WHITE = rgba("F8E8C4")       # warm cupsole and toe - chroma clears the band saturation floor
SOLE = rgba("ECD6AA")        # warm trim and laces
# The team accent is the SOCK ROLL-TOP (Smokey's bare-leg-lane convention).
TEAM_MASK = rgba("E8DCC2")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=GOLD, shirt_dark=CREAM,
    pants=SHORTS, pants_dark=SHORTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded crop traces: thick arched brows centred ~row 170 (32.2%
# of the 106→305 head band, z 3.63), big eyes centred ~201 (47.7%, z 3.46),
# the huge grin centred ~253 (73.9%, z 3.17). The analyser refused all of
# brow/eye/mouth (merged regions, grin-merge) and the pinch itself.
HEAD_CENTER = (0.0, -0.020, 3.420)
HEAD_RADII = (0.500, 0.500, 0.520)

# Round cheeks widest low on the face.
FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.01),
    (0.05, 1.04),
    (-0.30, 1.08),
    (-0.60, 1.06),
    (-1.00, 0.96),
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
    """Big warm eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.078
    dx = abs(nx) - 0.280
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A broad soft button nose (centre nz -0.26)."""
    if abs(nx) > 0.19:
        return 0.0
    dz = nz + 0.260
    if dz < -0.10 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.19) ** 2)
    bridge = 0.007 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.092 if dz >= 0.0 else 0.102
    t = dz / reach
    tip = 0.080 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# His big ears at the traced line: earLine 51.8% of head → z 3.42, proud
# past the buzz shell.
EAR_SPEC = EarSpec(center=(0.020, 3.420), radii=(0.1600, 0.1700))

# Island solved for his span (crown 3.99, neck 2.88): brow anchor 32 samples
# cell 30 → z 3.637 (31.9 against the traced 32.2), eye anchor 50 samples
# cell 48 → z 3.461 (47.7 vs 47.7), mouth anchor 75 samples cell 78 →
# z 3.168 (73.9 vs 73.9).
FACE_ISLAND = (0.92, -1.4836, 2.500)

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
    with the no-skull sentinel."""
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


# --- The buzz shell ------------------------------------------------------------
#
# Smokey's construction on the big skull: a tight shell hugging the skull,
# sides ending above the ears, nape tongues closing the back (no bald read).
# measured: front z=3.80 halfWidth=0.3708 tol=0.03
# measured: front z=3.65 halfWidth=0.4213 tol=0.03
BUZZ_LEVELS = [
    (3.990, 0.150, 0.155, 0.000),
    (3.930, 0.300, 0.310, 0.000),
    (3.840, 0.400, 0.415, 0.005),
    (3.720, 0.470, 0.485, 0.010),
    (3.600, 0.510, 0.525, 0.020),
    (3.480, 0.525, 0.540, 0.040),
    (3.360, 0.515, 0.535, 0.070),
    (3.240, 0.460, 0.482, 0.095),
    (3.130, 0.385, 0.410, 0.128),
    (3.050, 0.280, 0.312, 0.158),
]

BUZZ_OPEN_BOTTOM = 3.030
BUZZ_FRINGE_Z = 3.700      # the buzz hairline sits high on the round face


def buzz_window_z(x_signed: float) -> float:
    x_abs = abs(x_signed)
    if x_abs < 0.30:
        return BUZZ_FRINGE_Z
    if x_abs < 0.44:
        return BUZZ_FRINGE_Z - (x_abs - 0.30) * 1.6
    return 3.360


def build_buzz(builder: MeshBuilder, detail: int) -> None:
    assert all(a[0] > b[0] for a, b in zip(BUZZ_LEVELS, BUZZ_LEVELS[1:])), \
        "BUZZ_LEVELS must be strictly descending in z"
    segments = 14 if detail >= 2 else 8
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
                if BUZZ_OPEN_BOTTOM < z < buzz_window_z(x):
                    y = max(y, (sf + 0.040) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.045) if sf > -9.0 else -0.280)
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


# --- The striped tee over the round belly --------------------------------------
#
# not-traceable: his chunky arms merge with the torso at every row (front
# z=1.85 measures 0.9242 arm-to-arm); the belly halves are bounded off that
# minus the drawn arm girth (~0.17 a side), and the profile's own 0.60
# depth at z 1.70.
TORSO_LEVELS = [
    (1.420, 0.540, 0.460, "Hips"),    # hem riding the belly
    (1.460, 0.555, 0.470, "Hips"),
    (1.650, 0.580, 0.495, "Spine"),   # the belly's equator
    (1.850, 0.572, 0.489, "Spine"),
    (2.050, 0.540, 0.463, "Spine1"),
    (2.250, 0.486, 0.417, "Spine1"),
    (2.420, 0.414, 0.354, "Spine2"),  # shoulder rows widened past the arm
    (2.560, 0.344, 0.294, "Spine2"),  # root (Turbo's wedge fix)
    (2.680, 0.252, 0.214, "Spine2"),
    (2.790, 0.192, 0.166, "Spine2"),
    (2.860, 0.172, 0.150, "Spine2"),  # collar — OUTSIDE the neck loft
]

# Ascending (lo, hi) gold bands; everything else is cream. Bands traced off
# the front view's stripe rows (~0.15ft pitch on his tall tee).
# not-traceable: the stripe rows are colour, not silhouette; the pitch is
# read off the drawn bands and the seams land on loft rings via color_fn.
STRIPE_BANDS = [
    (1.420, 1.560),
    (1.700, 1.845),
    (1.990, 2.135),
    (2.280, 2.425),
    (2.570, 2.715),
]


def tee_color(theta: float, z: float):
    if z > 2.830:
        return GOLD                      # collar ring
    for lo, hi in STRIPE_BANDS:
        if lo <= z <= hi:
            return GOLD
    return CREAM


# The belly's FORWARD push (negative y) per z - the round-2 blocker: the
# concept's money read protrudes past the chest plane with an under-belly
# tuck, and a centred loft is slim in depth however wide it gets.
# not-traceable: read off the profile view's 0.60 half-depth at z 1.70
# against the chest's own 0.45 plane.
BELLY_PUSH = [
    (1.420, -0.075),
    (1.650, -0.100),
    (1.850, -0.085),
    (2.050, -0.050),
    (2.250, -0.018),
    (2.420, 0.000),
]


def belly_push_at(z: float) -> float:
    table = BELLY_PUSH
    if z <= table[0][0]:
        return table[0][1]
    for (za, pa), (zb, pb) in zip(table, table[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return pa + t * (pb - pa)
    return 0.0


def build_belly_torso(builder: MeshBuilder, levels, segments: int) -> None:
    """The torso loft with each ring's centre pushed forward by BELLY_PUSH -
    same winding as MeshBuilder.loft, same cap fans, tee_color per vertex."""
    rows = []
    for z, rx, ry, bone in levels:
        push = belly_push_at(z)
        row = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            at = (rx * cos(theta), push + ry * sin(theta), z)
            row.append(builder.vertex(at, tee_color(theta, z), bone))
        rows.append(row)
    bottom = builder.vertex((0.0, belly_push_at(levels[0][0]), levels[0][0]), CREAM, levels[0][3])
    top = builder.vertex((0.0, 0.0, levels[-1][0]), CREAM, levels[-1][3])
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 1)
        builder.face((rows[-1][column], rows[-1][nxt], top), 1)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 1)


# Crisp stripe edges need loft rings AT the band boundaries (Flash's washed-
# stripes lesson): a ring 0.006 inside each edge, both sides, LOD0 only.
# not-traceable: derived - the silhouette rows interpolate TORSO_LEVELS and
# the boundary z values are STRIPE_BANDS' own.
def _torso_ring_interp(z):
    for (za, wa, da, ba), (zb, wb, db, bb) in zip(TORSO_LEVELS, TORSO_LEVELS[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return (z, wa + t * (wb - wa), da + t * (db - da), ba)
    return None


# ⚠️ An insert within ~0.008 of an existing row makes a degenerate sliver
# band whose unstable normals render as dark backface slits at runtime
# (the round-1 'navy crescents' - row 2.420 vs insert 2.419).
TORSO_LEVELS_CRISP = sorted(
    TORSO_LEVELS + [ring for lo, hi in STRIPE_BANDS for edge in (lo - 0.006, lo + 0.006, hi - 0.006, hi + 0.006)
                    if all(abs(edge - level[0]) > 0.008 for level in TORSO_LEVELS)
                    and (ring := _torso_ring_interp(edge)) is not None],
    key=lambda level: level[0])


# His chin merges into the neck (the refused pinch) — the loft is WIDE and
# short, running up into the big skull.
# not-traceable: the sheet draws no separate neck; halves bounded off the
# chin-to-collar sliver (~0.17).
NECK_LEVELS = [
    (2.850, 0.168, 0.158, "Spine2"),
    (2.940, 0.180, 0.168, "Neck"),
    (3.030, 0.192, 0.180, "Neck"),
    (3.110, 0.204, 0.192, "Neck"),
]


# --- Arms: striped short sleeves, chunky bare arms -----------------------------
SLEEVE_HEM_X = 0.640

# ⚠️ EVERY station inboard of the deltoid needs an entry (blend = the
# Spine2 share) — the shoulder-fin lesson.
SHOULDER_BLEND = {
    0.215: 0.82,
    0.246: 0.66,
    0.300: 0.52,
    0.335: 0.38,
    0.370: 0.24,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; chunky girth bounded off the below-shoulder silhouette (~0.17).
ARM_STATIONS = [
    (0.215, 0.168, GOLD, "Arm"),
    (0.246, 0.166, GOLD, "Arm"),
    (0.300, 0.170, CREAM, "Arm"),     # sleeve stripe carries onto the arm
    (0.335, 0.168, CREAM, "Arm"),
    (0.370, 0.165, GOLD, "Arm"),
    (ARM_SHOULDER_X, 0.162, GOLD, "Arm"),
    (0.520, 0.155, GOLD, "Arm"),
    (SLEEVE_HEM_X - 0.020, 0.152, GOLD, "Arm"),
    (SLEEVE_HEM_X, 0.148, GOLD, "Arm"),
    (SLEEVE_HEM_X + 0.030, 0.138, SKIN, "Arm"),   # the chunky bare arm
    (0.780, 0.134, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.130, SKIN, "ForeArm"),
    (1.150, 0.122, SKIN, "ForeArm"),
    (1.300, 0.110, SKIN, "Hand"),
    (1.400, 0.088, SKIN, "Hand"),
    (1.460, 0.094, SKIN, "Hand"),   # knuckle line
    (1.512, 0.076, SKIN, "Hand"),
]

LOU_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
    elbow=0.06,  # the crease and knob a bent arm shows: see ArmSpec.elbow
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.552,
        finger_root=1.502,
        finger_offsets=((-0.048, 0.0, 0.048), (-0.032, 0.032)),
        finger_lengths=((0.098, 0.112, 0.100), (0.104, 0.109)),
        finger_widths=(0.030, 0.029, 0.024, 0.019),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.390, -0.036, -0.017),
            (1.438, -0.058, -0.029),
            (1.474, -0.070, -0.037),
            (1.494, -0.076, -0.041),
        ),
        thumb_widths=(0.030, 0.028, 0.022, 0.016),
    ),
    garment=GOLD,
    skin=SKIN,
)


# --- Navy shorts, chunky bare legs, proud socks, navy sneakers -----------------
INSEAM_TOP_Z = 1.420
INSEAM_HEM_Z = 1.000
INSEAM_HEM_HALF = 0.032


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=0.80 halfWidth=0.5140 tol=0.04
# measured: front z=0.50 halfWidth=0.4860 tol=0.04
LEG_STATIONS = [
    (1.440, 0.262, 1.08, SHORTS, "UpLeg"),
    (1.300, 0.256, 1.05, SHORTS, "UpLeg"),
    (1.160, 0.250, 1.03, SHORTS, "UpLeg"),
    (1.080, 0.254, 1.02, SHORTS_DARK, "UpLeg"),   # hem lip
    (1.030, 0.212, 1.00, SKIN, "UpLeg"),          # the chunky bare leg
    (0.900, 0.204, 1.00, SKIN, "Leg"),
    (0.760, 0.198, 1.00, SKIN, "Leg"),
    (0.620, 0.192, 1.00, SKIN, "Leg"),
    (0.530, 0.190, 1.00, SKIN, "Leg"),
    # ⚠️ The leg builder emits a slot-3 face only when BOTH rows of a pair
    # carry the team_mask colour — a single accent ring emits nothing and
    # the accent gate fires (the M_Accessory-dropped class).
    (0.500, 0.200, 1.00, TEAM_MASK, "Leg"),       # sock roll-top — THE accent
    (0.486, 0.198, 1.00, TEAM_MASK, "Leg"),
    (0.470, 0.196, 1.00, SOCK, "Leg"),
    (0.400, 0.184, 1.00, SOCK, "Foot"),
    (0.300, 0.172, 0.98, SOCK, "Foot"),
    (0.180, 0.158, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations.
CROTCH_LEVELS = [
    (1.400, 0.200, 0.240, "Hips"),
    (1.500, 0.230, 0.280, "Hips"),
    (1.610, 0.260, 0.320, "Hips"),
]

LOU_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=SHORTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
    calf=(0.0, 0.0),
    knee=0.0,
)


# --- The shoe ------------------------------------------------------------------
#
# Navy canvas low-top with cream cupsole, toe bumper and laces — the family
# last, wide for the big kid.
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
SHOE_HEIGHT_SCALE = 1.20

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, navy canvas above.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.340, "quarter"),
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


LOU_SHOE = ShoeSpec(
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
        builder.loft(CROTCH_LEVELS, 1, SHORTS, 8 if detail >= 2 else 6)
    build_belly_torso(builder,
                      TORSO_LEVELS_CRISP if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                      16 if detail >= 2 else segments)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=LOU_ARM)
        build_leg(builder, side, detail, spec=LOU_LEG)
        build_shoe(builder, side, detail, spec=LOU_SHOE,
                   ankle_x=leg_x(LEG_ANKLE_Z), bone=limb_bone("ToeBase", side))


def build_lod(name: str, armature: bpy.types.Object, segments: int, rings: int, detail: int) -> bpy.types.Object:
    builder = MeshBuilder()
    add_character(builder, segments, rings, detail)
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(builder.vertices, [], builder.faces)
    print(builder.part_report(name))  # the LOD0 budget by part: sculptlib.mesh
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
    obj["recessReference"] = "big-lou-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # ⚠️ Pre-convention blends carry stray meshes (Mimi's Icosphere lesson) —
    # remove EVERY mesh, not just the LOD roots.
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    settings = {
        "kid_big_lou_LOD0": (20, 12, 2),
        "kid_big_lou_LOD1": (8, 4, 1),
        "kid_big_lou_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "big_lou")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Big Lou reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against big-lou-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock roll-top accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- big_lou\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_big_lou_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
