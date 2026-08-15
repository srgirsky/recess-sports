"""Rebuild Boomer as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/boomer-pilot.blend \
    --python scripts/v2/blender/sculpt-boomer-source.py

★ BOOMER IS THE BIG KID WITH THE MOHAWK — Flash's shaved-fade-and-crest
construction scaled onto the roster's widest skull, over the chunkiest
torso in batch 4 wearing Flash's stripe construction in gold-on-cream. His
low real ears break the jaw line at 75% of the head — the deepest ear line
on the roster — and his grin is the widest mouth mark the atlas generator
has drawn.

The conversion: front figure 659px over 4.0ft → 1px = 0.006070ft. Head band:
mohawk-top crown row 118 (z 3.99) to neck pinch row 363 (z 2.51) — 37.2% of
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
OUTPUT = REPO / "assets/v2/source/boomer-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/boomer-face-atlas.png"
REVISION = "boomer-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: gold tee bands #EDA432 (27.8%), lit skin #AB5D24 with the
# highlight #D48244, navy #23252B, near-black hair #14120E, cream #FAEDDE —
# the backdrop, which the tee's pale stripes also resolve to (the recipe
# records it). Authored ≈ delivered·1.2, chroma clear of the r-clip ceiling
# and of the isSkin saturation floor under the toon highlight (Clover's
# lesson).
SKIN = rgba("D97A2E")
SKIN_SHADOW = rgba("A65618")
HAIR = rgba("1E1812")        # the mohawk crest
STUBBLE = rgba("3A2C1E")     # the shaved fade
SHIRT = rgba("FFF0D2")       # the pale stripe ground
SHIRT_DARK = rgba("FFB93E")  # the gold bands — chroma up so the board ramp
                             # lands back on the sheet's #eda432
PANTS = rgba("2C303E")       # navy shorts
PANTS_DARK = rgba("1E222E")
SOCK = rgba("FFF3D8")
SHOE = rgba("343A50")        # navy canvas upper
WHITE = rgba("F5E0AC")       # warm cream cupsole
SOLE = rgba("EECE92")        # toe bumper and laces, warm
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
# The roster's widest head. Features, bounded traces on the front view:
# thick arched brows rows 224-232 centred ~227 (44.5% of the 3.99→2.51
# head, z 3.33 — the widow's peak between them scans as a third brow), the
# eyes rows 246-260 centred ~252 (54.7%, z 3.18), the grin outline rows
# 272-290 centred ~280 (66.0%, z 3.01).
HEAD_CENTER = (0.0, -0.020, 3.150)
HEAD_RADII = (0.550, 0.550, 0.500)

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
    """Bright happy eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.060
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A broad friendly button (centre nz -0.15)."""
    if abs(nx) > 0.20:
        return 0.0
    dz = nz + 0.150
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.20) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.090 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Real LOW ears breaking the jaw line — the deepest ear line on the roster.
# measured: front earLine=75.1 earWidth=1.153
EAR_SPEC = EarSpec(center=(0.020, 2.880), radii=(0.1400, 0.1700))

# Island solved for his span (crown 3.99, neck 2.51, H 1.487): brow anchor 34
# samples cell 32 → z 3.333 (44.5 against the traced 44.5), eye anchor 50
# samples cell 48 → z 3.181 (54.7 vs 54.7), mouth anchor 62 samples cell 65 →
# z 3.016 (65.8 vs 66.0).
FACE_ISLAND = (0.92, -1.5005, 2.500)

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


# --- The mohawk ----------------------------------------------------------------
#
# Flash's construction on the wide skull: a shaved-fade shell hugging the
# scalp, the crest ridge, and alternating-lean spikes whose apex is the
# figure's own crown row.
# measured: front z=3.50 halfWidth=0.3703
# measured: front z=3.98 halfWidth=0.0243
SCALP_LEVELS = [
    (3.640, 0.180, 0.190, 0.000),
    (3.560, 0.330, 0.345, 0.005),
    (3.460, 0.420, 0.440, 0.010),
    (3.340, 0.480, 0.500, 0.020),
    (3.200, 0.520, 0.545, 0.030),
    (3.060, 0.530, 0.555, 0.040),
    (2.940, 0.480, 0.510, 0.070),
    (2.860, 0.400, 0.440, 0.105),
]

# The fade stops above the brows and drops past the temples to the ears.
SCALP_FRINGE = [
    (0.00, 3.400),
    (0.26, 3.400),
    (0.36, 3.320),
    (0.46, 3.160),
    (0.56, 3.000),
]

SCALP_OPEN_BOTTOM = 2.840


def fringe_z_at(x_abs: float) -> float:
    table = SCALP_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def ring_loft_scalp(builder: MeshBuilder, levels, detail: int) -> None:
    """The ring-loft-with-tuck, tight to the skull, no curl."""
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_scalp levels must be strictly descending in z"
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
                if SCALP_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.300)
            ring.append(builder.vertex((x, y, z), STUBBLE, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), STUBBLE, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.02), STUBBLE, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


# The crest ridge the spikes stand on, midline front-to-nape.
# not-traceable: the ridge's own width hides under the spikes in every view;
# the arc it rides is the skull top plus the fade shell.
CREST_SPINE = [
    (0.0, -0.360, 3.480),
    (0.0, -0.180, 3.580),
    (0.0, 0.120, 3.600),
    (0.0, 0.320, 3.540),
    (0.0, 0.480, 3.400),
    (0.0, 0.590, 3.220),
    (0.0, 0.660, 3.040),
]
CREST_RADII = [0.115, 0.135, 0.138, 0.128, 0.118, 0.104, 0.078]

# The spikes. Apex tip z 3.99 is the head span's own crown; leans alternate
# in x so the front reads the concept's tuft.
# ⚠️ The leans MUST sum to zero (Flash's faceAsymmetry lesson).
# measured: front z=3.98 halfWidth=0.0243
# The centre column carries the profile; the MIRRORED FLANK PAIRS carry the
# front — his sheet's front crest is 0.25 half at z 3.82 and a single
# column read as a nub (a first critic dropped three categories on it).
# Pairs mirror exactly, so the leans sum to zero by construction.
SPIKE_TABLE = [
    ((-0.022, -0.340, 3.470), (-0.080, -0.460, 3.800)),
    ((0.022, -0.180, 3.570), (0.080, -0.250, 3.930)),
    ((0.000, -0.010, 3.610), (0.000, 0.000, 3.990)),
    ((0.022, 0.160, 3.580), (0.080, 0.230, 3.950)),
    ((-0.022, 0.320, 3.540), (-0.080, 0.460, 3.860)),
    ((0.020, 0.470, 3.400), (0.076, 0.650, 3.680)),
    ((-0.020, 0.580, 3.220), (-0.076, 0.780, 3.430)),
    ((0.110, -0.240, 3.540), (0.190, -0.310, 3.820)),
    ((-0.110, -0.240, 3.540), (-0.190, -0.310, 3.820)),
    ((0.120, 0.020, 3.580), (0.215, 0.040, 3.870)),
    ((-0.120, 0.020, 3.580), (-0.215, 0.040, 3.870)),
    ((0.110, 0.280, 3.520), (0.195, 0.380, 3.760)),
    ((-0.110, 0.280, 3.520), (-0.195, 0.380, 3.760)),
]


def build_mohawk(builder: MeshBuilder, detail: int) -> None:
    ring_loft_scalp(builder, SCALP_LEVELS, detail)
    sides = 5 if detail >= 2 else 4
    spine = CREST_SPINE if detail >= 1 else CREST_SPINE[::2]
    radii = CREST_RADII if detail >= 1 else CREST_RADII[::2]
    builder.tube(spine, radii, 2, HAIR, "Head", sides)
    if detail < 1:
        return
    spikes = SPIKE_TABLE if detail >= 2 else SPIKE_TABLE[:7:2] + SPIKE_TABLE[9:11]
    for (bx, by, bz), (tx, ty, tz) in spikes:
        builder.tube([(bx, by, bz), (tx, ty, tz)],
                     [0.130, 0.020], 2, HAIR, "Head", 4)


# --- The gold-striped tee ------------------------------------------------------
#
# Gold bands on the backdrop's own cream (only the gold traces as colour).
# Bands traced down the centreline: gold at 1.56-1.70, 1.82-1.96, 2.08-2.22
# and the chest band 2.32-2.42; the collar ring is gold.
# not-traceable: his hanging arms merge with the belly at every row; halves
# bounded off the pair-outer silhouette minus the arm runs.
# measured: front z=1.90 halfWidth=0.8285 tol=0.06
TORSO_LEVELS = [
    (1.500, 0.460, 0.385, "Hips"),    # hem underside
    (1.535, 0.485, 0.405, "Hips"),    # hem band, proud
    (1.650, 0.495, 0.415, "Hips"),
    (1.800, 0.500, 0.420, "Spine"),   # the belly's widest ring
    (1.950, 0.490, 0.412, "Spine"),
    (2.100, 0.465, 0.392, "Spine1"),
    (2.240, 0.425, 0.360, "Spine1"),
    (2.340, 0.365, 0.310, "Spine2"),
    (2.420, 0.290, 0.248, "Spine2"),
    (2.450, 0.215, 0.185, "Spine2"),
    (2.485, 0.175, 0.155, "Spine2"),  # gold collar ring, proud
    (2.520, 0.155, 0.140, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

# ⚠️ (lo, hi) ASCENDING — the membership test is `lo <= z <= hi`.
STRIPES = ((1.560, 1.700), (1.820, 1.960), (2.080, 2.220), (2.320, 2.420),
           (2.475, 2.520))

# ★ LOD0 ring pairs 0.006 inside each band edge (the washed-stripe lesson).
# not-traceable: the paired rows re-express STRIPES as loft rings; the
# shape numbers interpolate the bounded table above.
TORSO_LEVELS_CRISP = [
    (1.500, 0.460, 0.385, "Hips"),
    (1.535, 0.485, 0.405, "Hips"),
    (1.554, 0.487, 0.406, "Hips"),
    (1.566, 0.488, 0.407, "Hips"),
    (1.650, 0.495, 0.415, "Hips"),
    (1.694, 0.497, 0.417, "Hips"),
    (1.706, 0.498, 0.418, "Hips"),
    (1.800, 0.500, 0.420, "Spine"),
    (1.814, 0.499, 0.419, "Spine"),
    (1.826, 0.499, 0.419, "Spine"),
    (1.950, 0.490, 0.412, "Spine"),
    (1.954, 0.489, 0.411, "Spine"),
    (1.966, 0.489, 0.411, "Spine"),
    (2.074, 0.470, 0.396, "Spine1"),
    (2.086, 0.468, 0.394, "Spine1"),
    (2.214, 0.430, 0.364, "Spine1"),
    (2.226, 0.428, 0.362, "Spine1"),
    (2.314, 0.372, 0.316, "Spine2"),
    (2.326, 0.368, 0.312, "Spine2"),
    (2.414, 0.293, 0.250, "Spine2"),
    (2.426, 0.287, 0.245, "Spine2"),
    (2.470, 0.215, 0.185, "Spine2"),
    (2.469, 0.190, 0.166, "Spine2"),
    (2.481, 0.178, 0.157, "Spine2"),
    (2.520, 0.155, 0.140, "Spine2"),
]


def stripe_color(theta: float, z: float):
    for lo, hi in STRIPES:
        if lo <= z <= hi:
            return SHIRT_DARK
    return SHIRT

# His neck pinch is row 363 → z 2.51, short and wide. Bottom ring 2px
# narrower than the ring above (the topmost-of-equals lesson).
# not-traceable: the visible pinch half is bounded off the sliver between
# jaw and collar (~0.14); the T-pose arm band hides the sheet's own row.
NECK_LEVELS = [
    (2.490, 0.136, 0.128, "Spine2"),
    (2.600, 0.154, 0.145, "Neck"),
    (2.700, 0.172, 0.162, "Neck"),
]


# --- Arms: striped short sleeves, chunky bare forearms -------------------------
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
    (0.215, 0.165, SHIRT_DARK, "Arm"),
    (0.300, 0.170, SHIRT_DARK, "Arm"),
    (0.335, 0.163, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.152, SHIRT, "Arm"),
    (0.520, 0.140, SHIRT_DARK, "Arm"),
    (0.600, 0.132, SHIRT_DARK, "Arm"),
    (0.630, 0.126, SHIRT, "Arm"),
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

BOOMER_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
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


# --- Navy shorts, chunky bare legs, roll-top socks -----------------------------
SHORTS_HEM_Z = 1.020
INSEAM_TOP_Z = 1.480
INSEAM_HEM_Z = 1.000
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=1.10 halfWidth=0.6677 tol=0.05
# measured: front z=0.70 halfWidth=0.4977 tol=0.05
LEG_STATIONS = [
    (1.580, 0.250, 1.10, PANTS, "UpLeg"),
    (1.470, 0.246, 1.08, PANTS, "UpLeg"),
    (1.320, 0.240, 1.07, PANTS, "UpLeg"),
    (1.160, 0.236, 1.04, PANTS, "UpLeg"),
    (1.060, 0.238, 1.02, PANTS, "UpLeg"),
    (SHORTS_HEM_Z, 0.232, 1.01, PANTS_DARK, "UpLeg"),  # hem inner lip
    (0.990, 0.160, 1.00, SKIN, "UpLeg"),               # chunky bare leg
    (0.880, 0.152, 1.00, SKIN, "Leg"),
    (0.760, 0.148, 1.01, SKIN, "Leg"),                 # the calf
    (0.640, 0.138, 1.00, SKIN, "Leg"),
    (0.570, 0.132, 1.00, SKIN, "Leg"),
    (0.530, 0.144, 1.00, TEAM_MASK, "Leg"),            # roll-top, proud — THE accent
    (0.490, 0.140, 1.00, TEAM_MASK, "Leg"),
    (0.460, 0.130, 1.00, SOCK, "Leg"),
    (0.400, 0.120, 0.99, SOCK, "Foot"),
    (0.280, 0.105, 0.97, SOCK, "Foot"),
    (0.150, 0.095, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show.
CROTCH_LEVELS = [
    (1.040, 0.190, 0.230, "Hips"),
    (1.250, 0.230, 0.285, "Hips"),
    (1.530, 0.265, 0.330, "Hips"),
]

BOOMER_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
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


SHOE_LENGTH_SCALE = 1.08
SHOE_WIDTH_SCALE = 1.06
SHOE_HEIGHT_SCALE = 1.24

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, navy canvas above.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.330, "quarter"),
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


BOOMER_SHOE = ShoeSpec(
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

    build_mohawk(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, PANTS, 8 if detail >= 2 else 6)
    if detail >= 2:
        builder.loft(TORSO_LEVELS_CRISP, 1, SHIRT, 17, color_fn=stripe_color)
    else:
        builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                     color_fn=stripe_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=BOOMER_ARM)
        build_leg(builder, side, detail, spec=BOOMER_LEG)
        build_shoe(builder, side, detail, spec=BOOMER_SHOE,
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
    obj["recessReference"] = "boomer-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_boomer_LOD0", "kid_boomer_LOD1", "kid_boomer_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_boomer_LOD0": (20, 12, 2),
        "kid_boomer_LOD1": (8, 4, 1),
        "kid_boomer_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "boomer")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Boomer reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against boomer-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock roll-top accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- boomer\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_boomer_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
