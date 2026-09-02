"""Rebuild Sniffles as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/sniffles-pilot.blend \
    --python scripts/v2/blender/sculpt-sniffles-source.py

★ SNIFFLES IS THE MOP-AND-HOODIE KID — Gizmo's clump-modulated mop without
the spikes, over Chip's hoodie construction with the HANKIE peeking from
the kangaroo pocket as the identity detail, rolled blue jeans with the cuff
roll as the team accent.

The conversion: front figure 699px over 4.0ft → 1px = 0.005722ft. Head band:
mop-top crown row 116 (z 3.99) to neck pinch row 356 (z 2.62) — 34.3% of
the figure. His ear line is refused: the widest head rows are the mop.
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
from sculptlib.hair import curl_field, curl_seeds
from sculptlib.head import HeadSpec, head_surface
from sculptlib.leg import LegSpec, build_leg, leg_x
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, ARM_SHOULDER_X, LEG_ANKLE_Z, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/sniffles-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/sniffles-face-atlas.png"
REVISION = "sniffles-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: light-blue hoodie #8CACC3 (45%), lit skin #EC934C, auburn
# hair #632403/#7B340B with the light #B45C23, jeans #354C63, cream
# backdrop. Authored ≈ delivered·1.2 with the highlight band clear of the
# isSkin saturation floor.
SKIN = rgba("FFAC58")
SKIN_SHADOW = rgba("CE7C2C")
HAIR = rgba("8A4210")        # the auburn mop
HAIR_DARK = rgba("5E2A06")   # the underside tone
SHIRT = rgba("A5C8E0")       # the light-blue hoodie
SHIRT_DARK = rgba("8AAEC8")  # ribbing, pouch shadow, hood lining
HANKIE = rgba("D8E8F2")      # the pocket hankie — identity
PANTS = rgba("3F5A77")       # blue jeans
PANTS_DARK = rgba("2E4258")
# (A CUFF colour used to be declared here, byte-identical to TEAM_MASK and
# painted by nothing — palette-identity.lint.test.js retired it: the whole
# roll is TEAM_MASK on purpose, two stations, and the name was a loaded trap.)
SOCK = rgba("FFF6E6")
SHOE = rgba("3A4A66")        # navy canvas upper
WHITE = rgba("F2D794")       # warm cream cupsole
SOLE = rgba("F6E0B8")        # toe bumper and laces
# The team accent is the CUFF ROLL (the jeans lane's convention).
TEAM_MASK = rgba("96A4BA")   # the pale cuff roll IS the team accent

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: thick auburn brows rows
# 229-241 centred ~235 (49.6% of the 3.99→2.62 head, z 3.31), the big
# watery eyes rows 259-291 centred ~275 (66.3%, z 3.08), the small pout
# bounded at 78% (z 2.92 — skin-adjacent line below the traced rows).
HEAD_CENTER = (0.0, -0.020, 3.200)
HEAD_RADII = (0.440, 0.450, 0.460)

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
    """Big watery eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.255
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A pink-tipped button nose (centre nz -0.48)."""
    if abs(nx) > 0.18:
        return 0.0
    dz = nz + 0.480
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.18) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.088 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# His ears hide under the mop in every metric.
# not-traceable: placement is by eye against the profile view (~z 3.10).
EAR_SPEC = EarSpec(center=(0.020, 3.100), radii=(0.1250, 0.1550))

# Island solved for his span (crown 3.99, neck 2.62, H 1.373): brow anchor 24
# samples cell 22 → z 3.315 (49.4 against the traced 49.6), eye anchor 50
# samples cell 48 → z 3.084 (66.3 vs 66.3), mouth anchor 65 samples cell 68 →
# z 2.923 (78.0 vs 78.0).
FACE_ISLAND = (0.92, -1.8175, 2.500)

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


# --- The tousled mop -----------------------------------------------------------
#
# One clump-modulated cap standing well proud of the skull — Gizmo's mop
# construction without the spikes, with a swept fringe.
#
# ★ THE CURL FIELD — sculptlib/hair.py holds the mechanism; the θ-only
# cos(6θ) at 18 columns delivered 14% of the concept's strand count at
# 200% prominence. Three mirror pairs at 24 columns hold the
# four-per-lobe floor; the sweep stays in the FRINGE table where the
# batch-5 lesson keeps asymmetry (silhouette, never per-side counts).
CURL_SEEDS = curl_seeds(
    pairs_per_row=3,
    bands=7,
    z_top=3.900,
    z_bottom=2.960,
    amplitude=0.070,
)
CURL_THETA_WIDTH = 0.24
CURL_Z_WIDTH = 0.075
CURL_TROUGH = 0.018

# measured: front z=3.42 halfWidth=0.6753
# measured: front z=3.58 halfWidth=0.6409
CURL_LEVELS = [
    (3.940, 0.200, 0.215, 0.000),
    (3.860, 0.360, 0.375, 0.000),
    (3.760, 0.470, 0.490, 0.005),
    (3.660, 0.560, 0.580, 0.010),
    (3.560, 0.630, 0.650, 0.015),
    (3.440, 0.665, 0.685, 0.020),
    (3.320, 0.640, 0.660, 0.035),
    (3.180, 0.585, 0.610, 0.060),
    (3.040, 0.480, 0.510, 0.105),
    (2.940, 0.360, 0.400, 0.150),
]

# The SWEPT fringe: the sheet's fringe crosses the brow hard toward his
# right, and a first critic asked the SHAPE to carry that sweep. The
# asymmetry lives strictly ABOVE the faceSkin sample row (z ≈ 3.14): both
# signed branches stay above 3.20, so the measured row remains symmetric
# while the brow band reads swept (the Flash/Penny asymmetry gates sample
# the row, not the brow).
CURL_FRINGE = [
    (0.00, 3.380),
    (0.18, 3.360),
    (0.28, 3.280),
    (0.38, 3.220),
    (0.48, 3.210),
]

CURL_SWEEP = 0.085   # + lowers the -x side, raises the +x side

CURL_OPEN_BOTTOM = 2.900


def fringe_z_at(x_signed: float) -> float:
    x_abs = abs(x_signed)
    table = CURL_FRINGE
    if x_abs <= table[0][0]:
        base = table[0][1]
    else:
        base = table[-1][1]
        for (x0, z0), (x1, z1) in zip(table, table[1:]):
            if x_abs <= x1:
                base = z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
                break
    # The sweep may COVER more (lower the window) but barely ever EXPOSE
    # more: an uncapped raise cut a ~40x40px skin WEDGE into the mass on the
    # raised side at the 3/4 gameplay angle — a bald-notch read the critic
    # verified by raw pixel values, and which no gate caught (see
    # skinnotch-scan.mjs, written for exactly this find — a scan, not a lint; its header records why). The sheet's
    # sweep asymmetry lives in the LOW side's extra coverage.
    sweep = -CURL_SWEEP * (x_signed / 0.5)
    return max(3.205, base + min(sweep, 0.015))


def build_curls(builder: MeshBuilder, detail: int) -> None:
    # An ascending table silently inverts the winding — descending, asserted.
    assert all(a[0] > b[0] for a, b in zip(CURL_LEVELS, CURL_LEVELS[1:])), \
        "CURL_LEVELS must be strictly descending in z"
    segments = 24 if detail >= 2 else (10 if detail == 1 else 8)
    use = CURL_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in CURL_LEVELS], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            # The 2D curl field (constants above CURL_LEVELS) — θ-only
            # cosines flute; the two-tone below carries the read.
            f = (curl_field(
                theta, z, CURL_SEEDS,
                theta_width=CURL_THETA_WIDTH,
                z_width=CURL_Z_WIDTH,
            ) if detail >= 2 else 0.0)
            clump = 1.0 + f
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                if CURL_OPEN_BOTTOM < z < fringe_z_at(x):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.300)
            tone = HAIR if f > CURL_TROUGH else HAIR_DARK
            ring.append(builder.vertex((x, y, z), tone, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), HAIR_DARK, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.02), HAIR, "Head")
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
    # Tousled crown tufts: a centre tuft plus mirrored pairs (leans sum to
    # zero), all gesturing FORWARD like the sheet's profile sweep.
    for tx, ty, tz, hx, hy, hz, rr in (
        (0.000, -0.180, 3.900, 0.000, -0.360, 4.020, 0.100),
        (0.240, -0.080, 3.860, 0.360, -0.240, 3.990, 0.090),
        (-0.240, -0.080, 3.860, -0.360, -0.240, 3.990, 0.090),
        (0.300, 0.220, 3.760, 0.430, 0.160, 3.920, 0.085),
        (-0.300, 0.220, 3.760, -0.430, 0.160, 3.920, 0.085),
    ):
        builder.tube([(tx, ty, tz), (hx, hy, hz)], [rr, 0.015], 2, HAIR, "Head", 4)


# --- The zip hoodie ------------------------------------------------------------
#
# Chip's hoodie torso: ribbed hem, kangaroo pocket, draped hood — plus the
# first ZIPPER LINE, a thin cream proud strip down the centre front.
# not-traceable: his hanging arms merge with the torso at every row; halves
# bounded off the cluster runs (slate 92-311 at z 1.60 arm-to-arm; the
# central jeans run 139-268 at z 1.40 bounds the hip).
TORSO_LEVELS = [
    (1.470, 0.340, 0.290, "Hips"),    # ribbed hem
    (1.505, 0.355, 0.302, "Hips"),
    (1.700, 0.345, 0.295, "Spine"),
    (1.900, 0.330, 0.282, "Spine"),
    (2.100, 0.312, 0.265, "Spine1"),
    (2.280, 0.295, 0.250, "Spine1"),
    (2.420, 0.270, 0.228, "Spine2"),
    (2.460, 0.225, 0.192, "Spine2"),
    (2.520, 0.172, 0.150, "Spine2"),
    (2.560, 0.150, 0.134, "Spine2"),  # neck hole — OUTSIDE the neck loft
]


def torso_ring_at(z: float) -> tuple[float, float]:
    """(half-width, half-depth) of the hoodie at height z, off TORSO_LEVELS."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return wa + t * (wb - wa), da + t * (db - da)
    return levels[-1][1], levels[-1][2]


def surface_patch(builder: MeshBuilder, x0: float, x1: float, z0: float, z1: float,
                  proud: float, colour, top_colour, bone: str) -> None:
    """A raised rectangular panel on the hoodie front."""
    steps = 3
    rows = []
    for j in range(steps + 1):
        z = z1 - (z1 - z0) * j / steps
        half_w, half_d = torso_ring_at(z)
        row = []
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            inner = max(0.10, 1.0 - (x / half_w) ** 2)
            y = -half_d * sqrt(inner) - proud
            row.append(builder.vertex((x, y, z), top_colour if j == 0 else colour, bone))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False, flip=True)


def build_hoodie_details(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    # The kangaroo pocket: one wide proud pouch with a darker top edge.
    surface_patch(builder, -0.250, 0.250, 1.550, 1.860, 0.040, SHIRT, SHIRT_DARK, "Spine")
    # The hankie peeking from the pocket — his identity detail, with the
    # sheet's blue plaid carried by two thin check strips (a plain white
    # square read as a fleck, not a tissue, to the first critic).
    surface_patch(builder, 0.060, 0.180, 1.820, 1.940, 0.050, HANKIE, HANKIE, "Spine")
    surface_patch(builder, 0.060, 0.180, 1.868, 1.888, 0.056, SHIRT_DARK, SHIRT_DARK, "Spine")
    surface_patch(builder, 0.105, 0.133, 1.820, 1.940, 0.056, SHIRT_DARK, SHIRT_DARK, "Spine")
    # The hood: a draped volume on the upper back with a knit roll at its
    # mouth (Chip's round-9 lesson — half-buried reads as a faint ridge).
    builder.ellipsoid((0.0, 0.350, 2.470), (0.280, 0.170, 0.230), 1, SHIRT, "Spine2", 8, 5)
    builder.ellipsoid((0.0, 0.255, 2.590), (0.235, 0.100, 0.090), 1, SHIRT_DARK, "Spine2", 6, 3)


# His neck pinch is row 379 → z 2.65. The bottom ring is a genuine 2px
# narrower than the ring above — the headBox detector keeps the TOPMOST of
# equal-width rows (Rocket's lesson).
# not-traceable: the neck hides behind the hood's drape in every view; the
# pinch half is bounded off the sliver between hood and jaw (~0.125).
# Runs from under the lowered collar up into the skull (Clover's daylight
# lesson at the bottom, the chin-taper lesson at the top).
NECK_LEVELS = [
    (2.560, 0.118, 0.112, "Spine2"),
    (2.660, 0.130, 0.122, "Neck"),
    (2.740, 0.140, 0.131, "Neck"),
    (2.830, 0.152, 0.142, "Neck"),
]


# --- Arms: hoodie sleeves to ribbed cuffs, dark-skinned hands ------------------
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

SNIFFLES_ARM = ArmSpec(
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
# measured: front z=1.25 halfWidth=0.5351 tol=0.04
# measured: front z=0.80 halfWidth=0.4467 tol=0.04
LEG_STATIONS = [
    (1.520, 0.200, 1.10, PANTS, "UpLeg"),
    (1.350, 0.196, 1.07, PANTS, "UpLeg"),
    (1.150, 0.190, 1.05, PANTS, "UpLeg"),
    (0.980, 0.184, 1.03, PANTS, "Leg"),
    (0.840, 0.180, 1.02, PANTS, "Leg"),
    (0.700, 0.178, 1.01, PANTS, "Leg"),
    (0.660, 0.192, 1.00, TEAM_MASK, "Leg"),        # rolled cuff, proud — THE accent
    (0.560, 0.188, 1.00, TEAM_MASK, "Leg"),
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

SNIFFLES_LEG = LegSpec(
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
    (0.345, "quarter"),
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


SNIFFLES_SHOE = ShoeSpec(
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

    build_curls(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, PANTS, 8 if detail >= 2 else 6)
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, SHIRT, 17 if detail >= 2 else segments)
    build_hoodie_details(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=SNIFFLES_ARM)
        build_leg(builder, side, detail, spec=SNIFFLES_LEG)
        build_shoe(builder, side, detail, spec=SNIFFLES_SHOE,
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
    obj["recessReference"] = "sniffles-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_sniffles_LOD0", "kid_sniffles_LOD1", "kid_sniffles_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_sniffles_LOD0": (20, 12, 2),
        "kid_sniffles_LOD1": (8, 4, 1),
        "kid_sniffles_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "sniffles")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Sniffles reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against sniffles-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cuff-roll accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- sniffles\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_sniffles_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
