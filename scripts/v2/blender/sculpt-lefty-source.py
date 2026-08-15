"""Rebuild Lefty Lu as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/lefty-pilot.blend \
    --python scripts/v2/blender/sculpt-lefty-source.py

★ LEFTY IS THE BACKWARDS-CAP KID — the cap construction with the brim
REVERSED to the nape and the badge on the dome's face side, blonde fringe
wisps under the front edge, and the roster's first deliberately asymmetric
hair mass: one side ponytail swinging out the cap's back gap, kept thin so
the measured face rows stay in tolerance. Her track jacket is one loft with
the cream tee showing through a narrow open-front colour window.

The conversion: front figure 662px over 4.0ft → 1px = 0.006042ft. Head band:
cap-top crown row 177 (z 3.99) to neck pinch row 374 (z 2.80) — 29.8% of
the figure. She keeps a real ear line under the cap edge.
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
OUTPUT = REPO / "assets/v2/source/lefty-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/lefty-face-atlas.png"
REVISION = "lefty-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: cream backdrop/tee #FCF1E1 (the tee lives in the paper's
# cluster), skin #E49453, orange jacket #E3631D, navy joggers #2C2D33,
# blonde #9B6324 with dark #531C02, grey-tan cap #AC9373. Authored ≈
# delivered·1.2 with the highlight band clear of the isSkin floor.
SKIN = rgba("FFAC5E")
SKIN_SHADOW = rgba("CE7C30")
HAIR = rgba("DC9840")        # the blonde ponytail — bright enough to stay
                             # golden under the toon ramp
HAIR_DARK = rgba("6E4210")   # shaded underside (fails isSkin, like the sheet)
CAP = rgba("C8B08A")         # the grey-tan cap
SHIRT = rgba("FF7526")       # the orange track jacket
SHIRT_DARK = rgba("E05E14")  # ribbing and zip shadow
TEE = rgba("FFF4DE")         # the cream tee in the jacket's front gap
PANTS = rgba("363740")       # navy joggers
PANTS_DARK = rgba("26272E")
CUFF = rgba("2E2F36")        # jogger ankle cuffs
SOCK = rgba("FFF6E6")
SHOE = rgba("AC9578")        # warm taupe canvas, eased toward cream
WHITE = rgba("FFF2D2")       # cream cupsole
SOLE = rgba("F6E0B8")        # toe bumper and laces
# The team accent is the CAP FRONT PANEL badge (the cap lane's convention).
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: brows rows 283-287 centred
# ~285 (54.3% of the 3.99→2.80 head, z 3.35), the sharp eyes rows 289-303
# centred ~295 (59.9%, z 3.28), the smirk bounded at 79% (z 3.05 —
# skin-adjacent below the nostril rows at 74.6).
HEAD_CENTER = (0.0, -0.020, 3.300)
HEAD_RADII = (0.420, 0.440, 0.420)

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
    """Sharp confident eyes — a soft dish; the atlas carries the glint."""
    dz = nz - 0.045
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A neat button nose (centre nz -0.46)."""
    if abs(nx) > 0.18:
        return 0.0
    dz = nz + 0.460
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.18) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.088 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Real drawn ears below the cap edge.
# measured: front earLine=67.0 earWidth=1.118
EAR_SPEC = EarSpec(center=(0.020, 3.197), radii=(0.1480, 0.1650))

# Island solved for her span (crown 3.99, neck 2.80, H 1.190): brow anchor 42
# samples cell 40 → z 3.347 (54.4 against the traced 54.3), eye anchor 50
# samples cell 48 → z 3.281 (59.9 vs 59.9), mouth anchor 75 samples cell 78 →
# z 3.052 (79.1 vs 79.0).
FACE_ISLAND = (0.92, -1.6077, 2.500)

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


# --- The cap -------------------------------------------------------------------
#
# Moose's construction: a charcoal dome, a forward brim with edge walls, and
# the badge-sized team panel on the front.
# measured: front z=3.90 halfWidth=0.2921
# measured: front z=3.58 halfWidth=0.4743
CAP_LEVELS = [
    (3.960, 0.110, 0.120, 0.000),
    (3.900, 0.280, 0.295, 0.000),
    (3.820, 0.380, 0.395, 0.005),
    (3.720, 0.435, 0.450, 0.015),
    (3.620, 0.465, 0.478, 0.025),
    (3.540, 0.478, 0.490, 0.035),
    (3.460, 0.495, 0.508, 0.045),
    (3.400, 0.470, 0.488, 0.062),
]

BRIM_Z_TOP = 3.575
BRIM_Z_BOT = 3.540
BRIM_REACH = 0.560    # ★ BACKWARDS: the brim reaches REARWARD from the nape.
                      # 0.56, not the sheet's fuller sweep: a longer brim
                      # seals an enclosed window against the pony's crown
                      # in profile (rubric 3.7).


def cap_dome_y(x: float, z: float, half_x: float, half_y: float) -> float:
    """The cap dome's front surface at (x, z) for panel seating."""
    if half_x <= 0.0:
        return 0.0
    t = 1.0 - (x / half_x) ** 2
    return -half_y * sqrt(t) if t > 0.0 else 0.0


def build_cap(builder: MeshBuilder, detail: int) -> None:
    # The dome.
    segments = 16 if detail >= 2 else (10 if detail == 1 else 8)
    use = CAP_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in CAP_LEVELS], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            x = half_x * cos(theta)
            y = y_centre + half_y * sin(theta)
            ring.append(builder.vertex((x, y, z), CAP, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), CAP, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.02), CAP, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)

    if detail < 1:
        return
    # The brim: a two-surface wedge with edge walls (zero-width in profile
    # without them).
    cols = 5 if detail >= 2 else 3
    top_rows, bot_rows = [], []
    for j, (y_frac, half) in enumerate(((0.0, 0.340), (0.5, 0.320), (1.0, 0.255))):
        y = 0.400 + y_frac * (BRIM_REACH - 0.400)
        row_t, row_b = [], []
        for i in range(cols):
            t = i / (cols - 1) - 0.5
            x = 2 * t * half
            zt = BRIM_Z_TOP - 0.015 * abs(2 * t) - 0.01 * y_frac
            row_t.append(builder.vertex((x, y, zt), CAP, "Head"))
            row_b.append(builder.vertex((x, y, zt - 0.035), CAP, "Head"))
        top_rows.append(row_t)
        bot_rows.append(row_b)
    builder.grid(top_rows, 2, cyclic=False)
    builder.grid(list(reversed(bot_rows)), 2, cyclic=False)
    edge = []
    for j in range(len(top_rows)):
        edge.append((top_rows[j][0], bot_rows[j][0]))
    for i in range(1, len(top_rows[-1])):
        edge.append((top_rows[-1][i], bot_rows[-1][i]))
    for j in range(len(top_rows) - 1, -1, -1):
        edge.append((top_rows[j][-1], bot_rows[j][-1]))
    for (t0, b0), (t1, b1) in zip(edge, edge[1:]):
        builder.face((t0, t1, b1, b0), 2)

    # The badge-sized team panel on the dome front (material 3).
    prows = []
    for z in (3.660, 3.720, 3.770):
        hx = 0.470 if z < 3.67 else (0.440 if z < 3.77 else 0.400)
        hy = 0.485 if z < 3.67 else (0.455 if z < 3.77 else 0.415)
        row = []
        for i in range(3):
            t = i / 2 - 0.5
            x = 2 * t * 0.105
            y = cap_dome_y(x, z, hx, hy) - 0.013
            row.append(builder.vertex((x, y, z), TEAM_MASK, "Head"))
        prows.append(row)
    builder.grid(prows, 3, cyclic=False)


# --- The hair: fringe wisps and the side ponytail ------------------------------
#
# Blonde wisps escape under the cap's front edge, and one lobed tube pony
# swings out the cap's back gap and falls beside her shoulder — the
# roster's first deliberately asymmetric hair mass, kept thin so the
# measured face rows stay inside tolerance.
# not-traceable: the pony's y stations are depth no front view can give;
# bounded off the profile segs.
# TWO tubes resolve the classifier compromise a critic rejected as a "dark
# strap": the GATHER (thin, deep tone) crosses the faceSkin sample row band
# (z ~3.15-3.30), and the full VOLUME hangs lit blonde entirely below it —
# the row never sees the lit mass, so the tail can finally be blonde and
# big at once.
# The gather HUGS the cap's back-side surface — a first spine arced clear
# of it and enclosed a 1080px see-through window between cap, gather and
# tail volume.
PONY_GATHER = [
    (0.100, 0.330, 3.520),
    (0.220, 0.400, 3.320),
    (0.320, 0.440, 3.120),
]
PONY_GATHER_RADII = [0.118, 0.126, 0.134]

# The volume HUGS the jaw-neck line: swung free, its inner edge and the
# narrowing neck enclosed a see-through window sealed by skull above and
# shoulder below.
# Depth hugs the nape and jacket back (Rocket's daylight lesson): a freer
# swing left a 660px slit between tail and nape in profile.
PONY_SPINE = [
    (0.320, 0.380, 3.120),
    (0.270, 0.290, 2.920),
    (0.250, 0.230, 2.700),
    (0.300, 0.250, 2.480),
    (0.340, 0.260, 2.300),
]
PONY_RADII = [0.110, 0.150, 0.160, 0.120, 0.045]

# The wisps RIDE the forehead surface — hung clear of the face they
# enclosed a 1080px window between wisp, cap edge and cheek.
FRINGE_WISPS = [
    ((0.140, -0.325, 3.550), (0.235, -0.345, 3.410), 0.055),
    ((-0.140, -0.325, 3.550), (-0.235, -0.345, 3.410), 0.055),
    ((0.000, -0.355, 3.560), (0.000, -0.395, 3.440), 0.055),
    # Face-framing side locks riding the temples — the concept frames the
    # face in blonde on both sides.
    ((0.395, -0.120, 3.420), (0.430, -0.150, 3.150), 0.070),
    ((-0.395, -0.120, 3.420), (-0.430, -0.150, 3.150), 0.070),
]


# The nape shell: blonde coverage under the cap's back edge — without it
# the rear gameplay angle reads bare skull either side of the tail band.
# not-traceable: hugs the authored skull +0.02, front half buried.
NAPE_LEVELS = [
    (3.440, 0.450, 0.462, 0.020),
    (3.320, 0.430, 0.445, 0.035),
    (3.180, 0.390, 0.410, 0.060),
    (3.040, 0.320, 0.350, 0.105),
    (2.940, 0.240, 0.285, 0.150),
]


def build_nape(builder: MeshBuilder, detail: int) -> None:
    assert all(a[0] > b[0] for a, b in zip(NAPE_LEVELS, NAPE_LEVELS[1:])), \
        "NAPE_LEVELS must be strictly descending in z"
    segments = 14 if detail >= 2 else 8
    ascending = list(reversed(NAPE_LEVELS if detail >= 1 else NAPE_LEVELS[::2]))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            x = half_x * cos(theta)
            y = y_centre + half_y * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                y = max(y, (sf + 0.055) if sf > -9.0 else -0.150)
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


def build_side_hair(builder: MeshBuilder, detail: int) -> None:
    sides = 6 if detail >= 2 else 4
    builder.tube(PONY_GATHER, PONY_GATHER_RADII, 2, HAIR_DARK, "Head", sides)
    builder.tube(PONY_SPINE if detail >= 1 else PONY_SPINE[::2],
                 PONY_RADII if detail >= 1 else PONY_RADII[::2],
                 2, HAIR, "Head", sides, lobes=3, groove=0.016)
    if detail < 1:
        return
    for (a, b, r) in FRINGE_WISPS:
        builder.tube([a, b], [r, 0.02], 2, HAIR, "Head", 4)


def build_hood(builder: MeshBuilder, detail: int) -> None:
    """The navy hood draped at the upper back — the sheet's signature
    garment read (Chip's construction)."""
    if detail < 1:
        return
    builder.ellipsoid((0.0, 0.330, 2.500), (0.260, 0.160, 0.215), 1, PANTS, "Spine2", 8, 5)
    builder.ellipsoid((0.0, 0.240, 2.620), (0.220, 0.095, 0.085), 1, PANTS_DARK, "Spine2", 6, 3)


# --- The open track jacket -----------------------------------------------------
#
# One loft carries jacket and tee: the orange shell everywhere except a
# narrow front window where the cream tee shows through the open zip —
# colour, with the ribbed collar and hem as bands.
# not-traceable: her hanging arms merge with the torso at every row; halves
# bounded off the orange cluster runs.
TORSO_LEVELS = [
    (1.470, 0.350, 0.295, "Hips"),    # ribbed hem
    (1.505, 0.365, 0.308, "Hips"),
    (1.700, 0.352, 0.300, "Spine"),
    (1.900, 0.338, 0.288, "Spine"),
    (2.100, 0.320, 0.272, "Spine1"),
    (2.280, 0.300, 0.255, "Spine1"),
    (2.420, 0.272, 0.230, "Spine2"),
    (2.520, 0.225, 0.192, "Spine2"),
    (2.660, 0.172, 0.150, "Spine2"),
    (2.720, 0.152, 0.135, "Spine2"),  # ribbed collar, proud — the track
    (2.760, 0.138, 0.124, "Spine2"),  # jacket rides high under the chin
]


def jacket_color(theta: float, z: float):
    # The open front: tee cream in a narrow window about the centre-front.
    if z < 2.60 and sin(theta) < -0.86 and abs(cos(theta)) < 0.30:
        return TEE
    if z > 2.710 or z < 1.505:
        return SHIRT_DARK   # ribbed collar and hem
    return SHIRT


# His neck pinch is row 379 → z 2.65. The bottom ring is a genuine 2px
# narrower than the ring above — the headBox detector keeps the TOPMOST of
# equal-width rows (Rocket's lesson).
# not-traceable: the neck hides behind the hood's drape in every view; the
# pinch half is bounded off the sliver between hood and jaw (~0.125).
NECK_LEVELS = [
    (2.740, 0.120, 0.114, "Spine2"),
    (2.820, 0.126, 0.118, "Neck"),
    (2.900, 0.140, 0.131, "Neck"),
    (2.990, 0.156, 0.146, "Neck"),
]


# --- Arms: track-jacket sleeves to ribbed cuffs -------------------------------
SLEEVE_HEM_X = 1.290

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare-hand width is bounded off the wrist runs (~0.075 half).
ARM_STATIONS = [
    (0.215, 0.150, SHIRT, "Arm"),
    (0.300, 0.155, SHIRT, "Arm"),
    (0.335, 0.148, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.135, SHIRT, "Arm"),
    (0.620, 0.120, SHIRT, "Arm"),
    (ARM_ELBOW_X, 0.112, SHIRT, "ForeArm"),
    (SLEEVE_HEM_X - 0.030, 0.104, SHIRT, "ForeArm"),
    (SLEEVE_HEM_X, 0.120, SHIRT_DARK, "ForeArm"),      # ribbed cuff, proud
    (SLEEVE_HEM_X + 0.024, 0.112, SHIRT_DARK, "Hand"),
    (SLEEVE_HEM_X + 0.038, 0.086, SHIRT_DARK, "Hand"),
    (SLEEVE_HEM_X + 0.054, 0.064, SKIN, "Hand"),
    (1.400, 0.066, SKIN, "Hand"),
    (1.460, 0.074, SKIN, "Hand"),   # knuckle line
    (1.510, 0.064, SKIN, "Hand"),
]

LEFTY_ARM = ArmSpec(
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


# --- Dark denim jeans, rolled pale cuffs, black-and-cream sneakers -------------
INSEAM_TOP_Z = 1.470
INSEAM_HEM_Z = 0.900
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# The pair-outer extents below are the sheet's own silhouette; per-leg
# halves come from the central jeans runs (139-268 at z 1.40 across both).
# measured: front z=1.25 halfWidth=0.4441 tol=0.04
# measured: front z=0.80 halfWidth=0.5136 tol=0.04
LEG_STATIONS = [
    (1.520, 0.200, 1.10, PANTS, "UpLeg"),
    (1.350, 0.196, 1.07, PANTS, "UpLeg"),
    (1.150, 0.190, 1.05, PANTS, "UpLeg"),
    (0.980, 0.184, 1.03, PANTS, "Leg"),
    (0.840, 0.180, 1.02, PANTS, "Leg"),
    (0.700, 0.178, 1.01, PANTS, "Leg"),
    (0.660, 0.192, 1.00, CUFF, "Leg"),             # rolled cuff, proud
    (0.560, 0.188, 1.00, CUFF, "Leg"),
    (0.520, 0.172, 1.00, PANTS_DARK, "Leg"),       # cuff underside lip
    (0.480, 0.108, 1.00, SOCK, "Foot"),            # sock sliver
    (0.400, 0.100, 0.99, SOCK, "Foot"),
    (0.280, 0.092, 0.97, SOCK, "Foot"),
    (0.150, 0.086, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations.
CROTCH_LEVELS = [
    (1.490, 0.160, 0.190, "Hips"),
    (1.590, 0.180, 0.220, "Hips"),
    (1.700, 0.200, 0.250, "Hips"),
]

LEFTY_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Black-brown low-top with cream cupsole, toe bumper and laces — the family
# last.
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


SHOE_LENGTH_SCALE = 1.02
SHOE_WIDTH_SCALE = 0.96
SHOE_HEIGHT_SCALE = 1.22

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, black-brown canvas above.
# The sheet's band splits nearly even (47.7/49.9 black to cream) — the
# black canvas rides LOW on this shoe, so the quarter starts at 0.20.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.200, "quarter"),
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


LEFTY_SHOE = ShoeSpec(
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

    build_cap(builder, detail)
    build_nape(builder, detail)
    build_side_hair(builder, detail)
    build_hood(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, PANTS, 8 if detail >= 2 else 6)
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, SHIRT, 18 if detail >= 2 else segments, color_fn=jacket_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=LEFTY_ARM)
        build_leg(builder, side, detail, spec=LEFTY_LEG)
        build_shoe(builder, side, detail, spec=LEFTY_SHOE,
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
    obj["recessReference"] = "lefty-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_lefty_LOD0", "kid_lefty_LOD1", "kid_lefty_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_lefty_LOD0": (20, 12, 2),
        "kid_lefty_LOD1": (8, 4, 1),
        "kid_lefty_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "lefty")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Lefty Lu reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against lefty-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cap-badge accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- lefty\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_lefty_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
