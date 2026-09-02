"""Rebuild Dex as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/dex-pilot.blend \
    --python scripts/v2/blender/sculpt-dex-source.py

★ DEX IS THE CAP-OVER-CURLS KID — Moose's cap-and-brim construction with the
team-badge front panel, over a CURL band built like Moose's buzz but twice
the volume and clump-modulated, above Chip's zip-hoodie torso (kangaroo
pocket, draped hood, ribbed cuffs) with the first ZIPPER LINE: a thin cream
proud strip down the centre front. His lit skin never gets its own cluster
on the sheet (the recipe records the refusal) — the swatch is a direct
cheek sample.

The conversion: front figure 694px over 4.0ft → 1px = 0.005764ft. Head band:
cap-top crown row 146 (z 3.99) to neck pinch row 379 (z 2.65) — 33.6% of
the figure. His ear line is refused: the widest head rows are curls and
ears merged in one run.
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
OUTPUT = REPO / "assets/v2/source/dex-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/dex-face-atlas.png"
REVISION = "dex-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: slate hoodie #4C5563 (45%), navy jeans #1C2632, charcoal
# cap and black curls in the near-black clusters, cream #F9EDDE backdrop.
# His medium-brown skin folds into the shadow tone (#5B2C0B, 2.9%) under the
# 8-tone quantizer, so the skin here is authored from a direct cheek sample
# (~#B0703D lit) — chroma-authored ·1.2 clear of the r-clip ceiling.
SKIN = rgba("D4874A")
SKIN_SHADOW = rgba("9A5A28")
HAIR = rgba("241A12")        # the black curls
CAP = rgba("3F444B")         # charcoal cap
SHIRT = rgba("5C6577")       # slate zip hoodie
# Deepened 47505F → 3E4757 for the hem-sweep: the ribbed hem and cuffs are
# SHIRT_DARK bands and at ΔLum ~21 the board ramp (≈ authored/1.2, chroma
# compressed) folded them into the body slate — "the SHIRT_DARK sleeve cuffs
# do not read at any scale". ΔLum ~34 authored ≈ ~28 delivered, and the hue
# stays the hoodie's own so the ribbing reads as knit, not trim.
SHIRT_DARK = rgba("3E4757")  # ribbing, pouch shadow, hood lining
ZIP = rgba("E8E2D4")         # the cream zipper line
PANTS = rgba("26303E")       # dark denim
PANTS_DARK = rgba("1B232E")
STITCH = rgba("C08A48")      # the jeans' gold topstitch — sampled warm ochre
                             # off the waistband/pocket stitch rows
CUFF = rgba("96A4BA")        # pale rolled jean cuff — identity
SOCK = rgba("FFF6E6")
SHOE = rgba("2A2723")        # black-brown canvas upper
WHITE = rgba("F5DFA8")       # warm cream cupsole
SOLE = rgba("F0CC8C")        # toe bumper and laces, warm tan
# The team accent is the CAP FRONT PANEL badge (the cap lane's convention —
# Chip/Moose/Ace: never the whole cap; the tint erases identity).
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: thick brow band rows 253-272
# centred ~262 (49.0% of the 3.99→2.65 head, z 3.34), the big brown eyes
# rows 289-318 centred ~303 (67.6%, z 3.09), the half-smile arc rows 335+
# centred ~338 (82.3%, z 2.89). The cap brim shadows rows 228-234.
HEAD_CENTER = (0.0, -0.020, 3.140)
HEAD_RADII = (0.420, 0.440, 0.440)

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
    """Big thoughtful eyes — a soft dish; the atlas carries the warm iris."""
    dz = nz + 0.115
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A rounded button nose (centre nz -0.40)."""
    if abs(nx) > 0.18:
        return 0.0
    dz = nz + 0.400
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.18) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.088 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Real drawn ears at the eye line, standing clear of the curls.
# not-traceable: the ear's own outline merges with the curls in every width
# metric; placement is by eye against the profile view (~z 3.15).
EAR_SPEC = EarSpec(center=(0.020, 3.150), radii=(0.1300, 0.1600))

# Island solved for his span (crown 3.99, neck 2.65, H 1.343): brow anchor 20
# samples cell 18 → z 3.336 (49.0 against the traced 49.0), eye anchor 50
# samples cell 48 → z 3.086 (67.6 vs 67.6), mouth anchor 70 samples cell 73 →
# z 2.888 (82.4 vs 82.3).
FACE_ISLAND = (0.92, -1.6855, 2.500)

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
# measured: front z=3.90 halfWidth=0.3055
# measured: front z=3.58 halfWidth=0.5130
CAP_LEVELS = [
    (3.960, 0.110, 0.120, 0.000),
    (3.900, 0.290, 0.305, 0.000),
    (3.820, 0.395, 0.410, 0.005),
    (3.720, 0.450, 0.465, 0.015),
    (3.620, 0.485, 0.495, 0.025),
    (3.540, 0.500, 0.510, 0.035),
]

BRIM_Z_TOP = 3.575
BRIM_Z_BOT = 3.540
BRIM_REACH = -0.720   # the brim tip's y — forward of the dome front (~-0.40)


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
        y = -0.400 + y_frac * (BRIM_REACH + 0.400)
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


# --- The curls -----------------------------------------------------------------
#
# Moose's buzz-band construction at twice the volume: a clump-modulated ring
# band from under the cap edge down past the ears, open across the face,
# buried against the skull at the front.
# measured: front z=3.34 halfWidth=0.6340
# measured: front z=3.18 halfWidth=0.6398
CURL_LEVELS = [
    (3.560, 0.480, 0.490, 0.010),
    (3.470, 0.560, 0.570, 0.015),
    (3.360, 0.605, 0.615, 0.020),
    (3.240, 0.615, 0.625, 0.030),
    (3.120, 0.545, 0.560, 0.050),
    (3.020, 0.420, 0.440, 0.085),
    (2.940, 0.290, 0.320, 0.130),
]

# The curls stop above the brows at centre and drop past the temples.
CURL_FRINGE = [
    (0.00, 3.400),
    (0.17, 3.400),
    (0.26, 3.300),
    (0.36, 3.110),
    (0.46, 2.990),
]

CURL_OPEN_BOTTOM = 2.900


def fringe_z_at(x_abs: float) -> float:
    table = CURL_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def build_curls(builder: MeshBuilder, detail: int) -> None:
    # An ascending table silently inverts the winding — descending, asserted.
    assert all(a[0] > b[0] for a, b in zip(CURL_LEVELS, CURL_LEVELS[1:])), \
        "CURL_LEVELS must be strictly descending in z"
    # 18, not 17: an ODD ring has no mirror-symmetric columns, so the two
    # curtain edges quantize to different |x| and the faceSkin sides move
    # independently (the left sat pinned at 29.2 through two fringe nudges
    # that moved the right by 4.5).
    segments = 18 if detail >= 2 else (10 if detail == 1 else 8)
    use = CURL_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in CURL_LEVELS], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        # Mirror-symmetric clumps: cos(6θ) is even under θ→π−θ so the leans
        # sum to zero, and the band reads as curls instead of a helmet.
        for column in range(segments):
            theta = 2 * pi * column / segments
            clump = 1.0 + 0.06 * cos(6 * theta)
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                if CURL_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
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


# --- The zip hoodie ------------------------------------------------------------
#
# Chip's hoodie torso: ribbed hem, kangaroo pocket, draped hood — plus the
# first ZIPPER LINE, a thin cream proud strip down the centre front.
# not-traceable: his hanging arms merge with the torso at every row; halves
# bounded off the cluster runs (slate 92-311 at z 1.60 arm-to-arm; the
# central jeans run 139-268 at z 1.40 bounds the hip).
TORSO_LEVELS = [
    # ★ The ribbed hem is a BAND, not a line. Traced on the front view: the
    # vertically-ribbed band spans rows 557-582 → z 1.626-1.481 (~25px,
    # 0.145ft; back view rows 558-580 agrees at z 1.647-1.515). The band is
    # SHIRT_DARK via `hoodie_color` with the switch ON the 1.603/1.615 ring
    # pair (Penny's waistband pattern), and the 1.615 body ring stands
    # 0.010ft PROUD so the fleece drapes OVER the ribbing that cinches under
    # it — crisp alone is a colour edge; crisp + proud is a constructed hem.
    (1.470, 0.340, 0.290, "Hips"),    # hem band bottom
    (1.505, 0.355, 0.302, "Hips"),    # the band's bottom roll
    (1.603, 0.346, 0.294, "Spine"),   # band top ring — crisp edge, cinched
    (1.615, 0.356, 0.304, "Spine"),   # body drape ring, PROUD +0.010
    (1.700, 0.345, 0.295, "Spine"),
    (1.900, 0.330, 0.282, "Spine"),
    (2.100, 0.312, 0.265, "Spine1"),
    (2.280, 0.295, 0.250, "Spine1"),
    (2.420, 0.270, 0.228, "Spine2"),
    (2.500, 0.225, 0.192, "Spine2"),
    (2.560, 0.172, 0.150, "Spine2"),
    (2.600, 0.150, 0.134, "Spine2"),  # neck hole — OUTSIDE the neck loft
]


# The colour threshold sits at the midpoint of the 1.603/1.615 ring pair, so
# the interpolated ramp spans 0.012ft (~2px) instead of a whole band (the
# Zippy hem lesson: a switch inside a stretched band ramps colour across 32px).
HEM_BAND_TOP = 1.609


def hoodie_color(theta: float, z: float):
    """SHIRT_DARK ribbed hem band below the ring pair; slate body above."""
    return SHIRT_DARK if z <= HEM_BAND_TOP else SHIRT


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
    # The zipper: a thin cream proud strip down the centre front, collar to
    # hem, with a small darker pull at the top.
    surface_patch(builder, -0.014, 0.014, 1.505, 2.540, 0.022, ZIP, ZIP, "Spine")
    # The pull TAB at the collar end — the old SHIRT_DARK nub vanished into
    # the slate ("no pull tab"). Two stacked ZIP patches make a bevelled tab
    # (batch 7: bevelled rim rows turn a decal into sewn construction): a base
    # step proud of the 0.022 strip, and a raised face whose top row goes
    # SHIRT_DARK for the hinge shadow that separates tab from collar.
    surface_patch(builder, -0.028, 0.028, 2.445, 2.545, 0.032, ZIP, ZIP, "Spine2")
    surface_patch(builder, -0.018, 0.018, 2.462, 2.532, 0.048, ZIP, SHIRT_DARK, "Spine2")
    # The kangaroo pocket, split by the zipper: one proud pouch each side.
    surface_patch(builder, -0.250, -0.040, 1.550, 1.860, 0.040, SHIRT, SHIRT_DARK, "Spine")
    surface_patch(builder, 0.040, 0.250, 1.550, 1.860, 0.040, SHIRT, SHIRT_DARK, "Spine")
    # The hood: a draped volume on the upper back with a knit roll at its
    # mouth (Chip's round-9 lesson — half-buried reads as a faint ridge).
    builder.ellipsoid((0.0, 0.350, 2.470), (0.280, 0.170, 0.230), 1, SHIRT, "Spine2", 8, 5)
    builder.ellipsoid((0.0, 0.255, 2.590), (0.235, 0.100, 0.090), 1, SHIRT_DARK, "Spine2", 6, 3)


# His neck pinch is row 379 → z 2.65. The bottom ring is a genuine 2px
# narrower than the ring above — the headBox detector keeps the TOPMOST of
# equal-width rows (Rocket's lesson).
# not-traceable: the neck hides behind the hood's drape in every view; the
# pinch half is bounded off the sliver between hood and jaw (~0.125).
NECK_LEVELS = [
    (2.620, 0.120, 0.114, "Spine2"),
    (2.700, 0.134, 0.126, "Neck"),
    (2.800, 0.148, 0.139, "Neck"),
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
    # ★ The ribbed cuff is a BAND, same construction as the hem: traced on the
    # front view the wrist ribbing spans rows ~557-580 (≈0.133ft along the
    # hanging forearm), so the cuff runs 1.198 → the 1.328 hand edge, not the
    # old 0.038ft sliver at the hem lip. The 1.186/1.198 ring pair makes the
    # edge crisp, and the 1.186 sleeve ring stands 0.012 PROUD so the fleece
    # drapes over the ribbing that cinches beneath it.
    (1.186, 0.116, SHIRT, "ForeArm"),                  # sleeve drape, PROUD lip
    (1.198, 0.104, SHIRT_DARK, "ForeArm"),             # cuff top — crisp edge
    (SLEEVE_HEM_X - 0.030, 0.106, SHIRT_DARK, "ForeArm"),  # ribbed cuff body
    (SLEEVE_HEM_X, 0.120, SHIRT_DARK, "ForeArm"),      # cuff-end roll, proud
    (SLEEVE_HEM_X + 0.024, 0.112, SHIRT_DARK, "Hand"),
    (SLEEVE_HEM_X + 0.038, 0.086, SHIRT_DARK, "Hand"),
    (SLEEVE_HEM_X + 0.054, 0.064, SKIN, "Hand"),
    (1.400, 0.066, SKIN, "Hand"),
    (1.460, 0.074, SKIN, "Hand"),   # knuckle line
    (1.510, 0.064, SKIN, "Hand"),
]

DEX_ARM = ArmSpec(
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
# measured: front z=1.25 halfWidth=0.6167 tol=0.04
# measured: front z=0.80 halfWidth=0.4467 tol=0.04
LEG_STATIONS = [
    # ★ The belt line. Traced on the front view: the jeans' waistband shows as
    # a sliver under the hoodie hem with its gold topstitch line at row ~600
    # → z 1.378 (the fly button sits at row ~595 → z 1.407). Authored as a
    # PANTS_DARK band standing 0.008 PROUD of the leg below (the overhang
    # lip), a STITCH gold line on the 1.402/1.392 ring pair, and the colour
    # switches ON adjacent rings so each ramp spans ~0.008ft, not a band.
    (1.520, 0.206, 1.10, PANTS_DARK, "UpLeg"),   # waistband, PROUD
    (1.410, 0.206, 1.09, PANTS_DARK, "UpLeg"),   # band bottom — overhang ring
    (1.402, 0.198, 1.08, STITCH, "UpLeg"),       # gold topstitch line
    (1.392, 0.198, 1.08, STITCH, "UpLeg"),
    (1.384, 0.197, 1.08, PANTS, "UpLeg"),        # leg denim resumes
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

DEX_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


def leg_ring_at(z: float) -> tuple[float, float]:
    """(half-width, depth factor) of the jeans leg at height z, off LEG_STATIONS."""
    for (za, ra, da, _, _), (zb, rb, db, _, _) in zip(LEG_STATIONS, LEG_STATIONS[1:]):
        if zb <= z <= za:
            t = (za - z) / (za - zb)
            return ra + t * (rb - ra), da + t * (db - da)
    return LEG_STATIONS[0][1], LEG_STATIONS[0][2]


def leg_patch(builder: MeshBuilder, side: int, x0: float, x1: float,
              z0: float, z1: float, proud: float, colour, top_colour,
              front: bool) -> None:
    """A bevelled proud patch riding one leg tube's front or back surface.

    The jeans' sewn details (yoke pockets, the fly's J-stitch) — batch 7's
    'bevelled rim rows turn a decal into a sewn pouch': every rim vertex sits
    at ~35% of the panel's proud height, the interior at full proud, so the
    edge reads as stitching. x0/x1 are authored for the +x leg and the whole
    patch is mirrored by `side` (the whole ring is reflected, build_leg's own
    rule). Winding: the front patch at side>0 matches surface_patch's
    flip=True; each of mirror and front→back reverses it once.
    """
    steps = 3
    sign = -1.0 if front else 1.0
    rows = []
    for j in range(steps + 1):
        z = z1 - (z1 - z0) * j / steps
        radius, depth = leg_ring_at(z)
        cx = leg_x(z)
        row = []
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            dx = x - cx
            inner = max(0.0004, radius * radius - dx * dx)
            rim = j in (0, steps) or i in (0, steps)
            y = sign * (sqrt(inner) * depth + (0.35 * proud if rim else proud))
            shade = top_colour if j == 0 else colour
            row.append(builder.vertex((x * side, y, z), shade,
                                      limb_bone("UpLeg", side)))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False, flip=front == (side > 0))


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


DEX_SHOE = ShoeSpec(
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
    build_curls(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, PANTS, 8 if detail >= 2 else 6)
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, SHIRT, 17 if detail >= 2 else segments,
                 color_fn=hoodie_color)
    build_hoodie_details(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=DEX_ARM)
        build_leg(builder, side, detail, spec=DEX_LEG)
        if detail >= 1:
            # Back yoke pockets: traced on the back view rows 583-613 →
            # z 1.497-1.317, |x| 0.159-0.374 of centre; authored to the
            # window visible below the hoodie hem, gold stitch top row.
            leg_patch(builder, side, 0.160, 0.330, 1.300, 1.440,
                      0.020, PANTS, STITCH, front=False)
        build_shoe(builder, side, detail, spec=DEX_SHOE,
                   ankle_x=leg_x(LEG_ANKLE_Z), bone=limb_bone("ToeBase", side))
    if detail >= 1:
        # The fly's gold J-stitch: one narrow proud strip just off centre on
        # one leg (front view rows ~600-635 → z 1.378-1.176; authored to the
        # span the leg tube's front face can carry).
        leg_patch(builder, 1, 0.045, 0.065, 1.240, 1.384,
                  0.010, STITCH, STITCH, front=True)


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
    obj["recessReference"] = "dex-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_dex_LOD0", "kid_dex_LOD1", "kid_dex_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_dex_LOD0": (20, 12, 2),
        "kid_dex_LOD1": (8, 4, 1),
        "kid_dex_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "dex")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Dex reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against dex-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cap-badge accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- dex\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_dex_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
