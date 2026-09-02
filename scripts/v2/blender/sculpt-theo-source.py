"""Rebuild Big Talk Theo as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/theo-pilot.blend \
    --python scripts/v2/blender/sculpt-theo-source.py

★ THEO IS THE OVERSIZED-CAP SHOWMAN — Chip's cap construction scaled up (a
big teal crown with the cream front panel as the team surface and a long
dipping bill), The Professor's open jacket in varsity colours (teal body,
cream sleeves, striped rib hem and cuffs) over a cream tee, navy shorts,
bare legs into tall striped socks, cream-and-charcoal sneakers, and the
roster's biggest open grin.

The conversion: front figure 743px over 4.0ft → 1px = 0.005384ft. Head band:
cap crown row 129 (z 3.99) to neck pinch row 388 (z 2.60) — 34.9% of the
figure. Ear line traced at 54.8% of head (z 3.23), ears proud 6.6%.
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
OUTPUT = REPO / "assets/v2/source/theo-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/theo-face-atlas.png"
REVISION = "theo-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: teal cap/jacket #2B5260 (one cluster, one tone step apart),
# cream panel/tee/sleeves/socks #F2DBBC (one cluster), near-black hair
# #1D0F06, charcoal-navy shorts #383A40, lit skin #ED9F68. Authored ≈
# delivered·1.2 with the skin's highlight band clear of the isSkin floor.
SKIN = rgba("F2A468")
SKIN_SHADOW = rgba("BE7434")
HAIR = rgba("342013")        # deep brown - near-black crushed to a void under the ramp
HAIR_DARK = rgba("140A04")
TEAL = rgba("2F6274")        # cap crown, bill, jacket body, stripes
TEAL_DARK = rgba("214A5A")   # jacket shadow rows, collar line
CREAM = rgba("FFF0D2")       # tee, sleeves, rib base, cap panel, socks
CREAM_DIM = rgba("EFD9B4")   # rib shadow tone
SHORTS = rgba("3E4048")      # charcoal-navy shorts
SHORTS_DARK = rgba("2C2E34")
SOCK = rgba("FFF2D8")
SHOE = rgba("F4E8D4")        # cream canvas upper
SHOE_DARK = rgba("57534C")   # the charcoal saddle/trim
WHITE = rgba("E9CDA6")       # warm tan cupsole - the concept band pair is cream #ecddcc + tan #d9b68b (the charcoal saddle never reaches the bottom-9% window)
SOLE = rgba("57534C")        # trim = the charcoal panels and laces
# ★ The team accent is the CAP'S CREAM FRONT PANEL (Chip's convention — only
# the geometry meant to change colour lives on slot 3).
TEAM_MASK = rgba("F6E7C8")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=CREAM, shirt_dark=CREAM_DIM,
    pants=SHORTS, pants_dark=SHORTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: thick dark brows rows ~250-265
# centred ~258 (49.8% of the 3.99→2.60 head, z 3.30), big round eyes centred
# ~294 (63.7%, z 3.11), the open grin at the analyser's own 84.9% (row 349,
# z 2.81). The analyser's brow pick at 96.6% was the collar shadow.
HEAD_CENTER = (0.0, -0.020, 3.060)
HEAD_RADII = (0.400, 0.410, 0.420)

# The broad tapered face: widest through the cheeks, narrowing to the chin.
FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.02),
    (0.05, 1.06),
    (-0.30, 1.08),
    (-0.60, 1.02),
    (-1.00, 0.90),
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
    """Big round showman eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.120
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small upturned button nose above the big grin (centre nz -0.28)."""
    if abs(nx) > 0.17:
        return 0.0
    dz = nz + 0.280
    if dz < -0.10 or dz > 0.11:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.17) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.088 if dz >= 0.0 else 0.098
    t = dz / reach
    tip = 0.084 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# His big ears at the traced line: earLine 54.8% of head → z 3.23, proud 6.6%.
EAR_SPEC = EarSpec(center=(0.020, 3.230), radii=(0.1550, 0.1650))

# Island solved for his span (crown 3.99, neck 2.60): brow anchor 24 samples
# cell 22 → z 3.304 (49.7 against the traced 49.8), eye anchor 50 samples
# cell 48 → z 3.107 (63.7 vs 63.7), mouth anchor 83 samples cell 86 →
# z 2.810 (84.9 vs 84.9).
FACE_ISLAND = (0.92, -1.4503, 2.500)

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


# --- The oversized cap ---------------------------------------------------------
#
# Chip's construction, scaled up: the dome IS the figure's outline at cap
# rows, and only the cream front panel lives on M_Accessory.
# measured: front z=3.35 halfWidth=0.6945 tol=0.03
# measured: front z=3.55 halfWidth=0.6514 tol=0.03
CAP_LEVELS = [
    (3.990, 0.120, 0.120, -0.020),
    (3.930, 0.300, 0.310, -0.030),
    (3.850, 0.430, 0.450, -0.040),
    (3.700, 0.558, 0.578, -0.050),
    (3.550, 0.645, 0.640, -0.050),
    # 3.450 was within 0.010 of its neighbours' lerp (redundant-rows-scan,
    # 2026-09-02): 24 LOD0 tris toward the knee rings.
    (3.360, 0.688, 0.640, -0.040),
    (3.290, 0.650, 0.595, -0.030),
]

BRIM_Z_ROOT = 3.400
BRIM_Z_TIP = 3.230          # the oversized bill dips
# ⚠️ REACH is the bill TIP's absolute forward y - the dome front already
# sits at ~0.68, so a reach under that projects NO bill at all (round-1
# blocker: the cap read as a batting helmet).
BRIM_REACH = 1.100
BRIM_HALF_W = 0.390
BRIM_THICK = 0.032


def build_cap(builder: MeshBuilder, detail: int) -> None:
    """The crown (cream team panel forward) and the double-sided teal bill."""
    # 16 keeps mirror columns and the LOD0 budget (20 blew it).
    segments = 12 if detail >= 2 else (8 if detail == 1 else 8)
    levels = CAP_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in CAP_LEVELS], detail)
    ascending = list(reversed(levels))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            x = half_x * cos(theta)
            y = y_centre + half_y * sin(theta)
            frontness = -sin(theta)
            colour = TEAM_MASK if (frontness > 0.62 and z < 3.92) else TEAL
            ring.append(builder.vertex((x, y, z), colour, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), TEAL, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.025), TEAL, "Head")
    # ★ ONLY THE PANEL LIVES ON M_ACCESSORY (Chip's slot rule).
    def cap_material(column):
        theta = 2 * pi * (column + 0.5) / segments
        return 3 if -sin(theta) > 0.62 else 2
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), cap_material(column))

    if detail < 1:
        return
    # The bill: a curved plate, top and underside, teal like the crown.
    steps = 3 if detail >= 2 else 2
    cols = 5 if detail >= 2 else 5
    dome_front = CAP_LEVELS[-2][3] - CAP_LEVELS[-2][2]
    for underside in (False, True):
        rows_b = []
        for j in range(steps + 1):
            t = j / steps
            y = dome_front * (1 - t) + (-BRIM_REACH) * t
            z = BRIM_Z_ROOT * (1 - t) + BRIM_Z_TIP * t
            if underside:
                z -= BRIM_THICK
            row = []
            for i in range(cols):
                u = 2 * i / (cols - 1) - 1
                x = BRIM_HALF_W * u * (1.0 - 0.35 * t * t)
                zz = z + 0.045 * (u * u) * (1 - 0.3 * t)
                row.append(builder.vertex((x, y, zz), TEAL, "Head"))
            rows_b.append(row)
        builder.grid(rows_b, 2, cyclic=False, flip=underside)


# --- The hair: dark flips under the cap ----------------------------------------
#
# A hair MASS from the cap edge down over the nape (no enclosed pockets —
# the Rocket/Lefty rule), with mirrored flip tubes at the nape and over the
# ear tops, and fringe wisps riding the forehead.
# not-traceable: every hair row on the sheet is bounded by cap above and
# jaw below, so no row's half-width survives regionRunsAt. The VOLUME is
# authored, not traced: the previous +0.035 liner added 5% over the skull
# and scored hairMass 1 ("front, A-pose and swing all read bare-skulled"),
# while the sheet draws a thick wavy mass filling the cap-to-jaw band and
# flipping out at the ends. +0.055-0.065 standoff with the lower rows kept
# full; the cap rim above (half_x 0.65 at z 3.29) still covers the top.
HAIR_LEVELS = [
    (3.400, 0.470, 0.480, -0.010),
    # ★ 3.240 and 2.940 are within 0.02 of their neighbours' lerp, but they
    # are NOT spare: hair_window_z was tuned against this row grid, and
    # dropping them moved the shell so the window let the mass eat the right
    # side of the face (visible face right of centre 27.1 → 15.1, a critic's
    # measurement, 2026-09-02). Interpolation-redundant is not window-neutral.
    (3.240, 0.492, 0.505, 0.010),
    (3.050, 0.478, 0.500, 0.060),
    (2.940, 0.448, 0.470, 0.110),
    (2.860, 0.395, 0.425, 0.150),
]

# ★ THE CURL FIELD — sculptlib/hair.py holds the mechanism and the identity
# that closed the θ-only family; the ladder discipline is in the skill.
# measured: `npm run measure:strands -- calls_shot` reads the CONCEPT at
# 4.91 strand minima/row on the hair band — three mirror pairs put 6 lobes
# across a row, the nearest even count, and 24 columns give them the
# four-columns-per-lobe floor. Bands cover only the VISIBLE strip (the cap
# owns everything above ~3.35). Widths at the Mimi rule: σ ≈ half the
# seed half-spacing (π/6 ≈ 0.52 → θw 0.24) and half the band gap
# (0.16 → zw 0.08) so neighbouring curls part without merging.
CURL_SEEDS = curl_seeds(
    pairs_per_row=3,
    bands=4,
    z_top=3.350,
    z_bottom=2.870,
    amplitude=0.100,
)
CURL_THETA_WIDTH = 0.24
CURL_Z_WIDTH = 0.08
# Two-tone: HAIR is the lifted brown (the lit strand tops), HAIR_DARK the
# near-void base — same trough mapping as Mimi, and on near-black hair it is
# the LIT side that carries the read under the ramp.
CURL_TROUGH = 0.018

HAIR_OPEN_BOTTOM = 2.840
HAIR_FRINGE_Z = 3.330      # the shell stays behind the face above this


def hair_window_z(x_signed: float) -> float:
    # The face window: open from centre out to the temples, closing at the
    # sideburn line. The boundaries moved out with the shell's standoff
    # (0.30/0.42 → 0.34/0.46): leaving them put while the shell widened
    # painted hair over the cheek edges and took visible-face-right from
    # 27.1 to 17.7 against a tolerance of 6 — the window must widen WITH
    # the mass or the mass eats the face (Mimi's fringe lesson, laterally).
    x_abs = abs(x_signed)
    if x_abs < 0.34:
        return HAIR_FRINGE_Z
    if x_abs < 0.46:
        return HAIR_FRINGE_Z - (x_abs - 0.34) * 2.2
    return 2.980


def build_hair(builder: MeshBuilder, detail: int) -> None:
    assert all(a[0] > b[0] for a, b in zip(HAIR_LEVELS, HAIR_LEVELS[1:])), \
        "HAIR_LEVELS must be strictly descending in z"
    # 24 columns: the 10-column ring made cos(6θ) unrepresentable (1.67
    # samples per lobe) and sampled hair_window_z's step into a sawtooth
    # hairline that read as stubble. 24 gives the field's 6 lobes their
    # four-column floor and the window a real curve.
    segments = 24 if detail >= 2 else (8 if detail == 1 else 8)
    use = HAIR_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in HAIR_LEVELS], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            # The 2D curl field (see the constants above): θ-only waves flute,
            # and the paint below is what reads under the ramp.
            f = curl_field(
                theta, z, CURL_SEEDS,
                theta_width=CURL_THETA_WIDTH,
                z_width=CURL_Z_WIDTH,
            )
            clump = 1.0 + f
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                # The ear band: the widened shell (0.478-0.492) buried his
                # ears (outer ~0.46) in profile — the critic's regression on
                # this branch. Diva's lesson applies laterally-eaten features
                # generally: the sheet hangs hair BEHIND the ear in depth,
                # so the front-half wall starts behind it (y ≥ -0.02) across
                # the ear's own z span; the flip tubes still arc over the
                # ear tops, which is what the sheet draws.
                in_ear_band = 3.050 < z < 3.400
                if HAIR_OPEN_BOTTOM < z < hair_window_z(x):
                    y = max(y, (sf + 0.045) if sf > -9.0 else (-0.020 if in_ear_band else -0.150))
                else:
                    y = max(y, (sf - 0.050) if sf > -9.0 else (-0.020 if in_ear_band else -0.260))
            tone = HAIR if f > CURL_TROUGH else HAIR_DARK
            ring.append(builder.vertex((x, y, z), tone, "Head"))
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
    if detail < 1:
        return
    # The flips: mirrored outward curls at the nape and over the ear tops
    # (leans sum to zero), plus a centre fringe wisp riding the forehead —
    # 3-point tubes with fat bases so they read as flipped locks, not tabs.
    for spine, radii in (
        (((0.300, 0.240, 2.980), (0.400, 0.280, 2.930), (0.470, 0.300, 2.900)), (0.075, 0.055, 0.030)),
        (((-0.300, 0.240, 2.980), (-0.400, 0.280, 2.930), (-0.470, 0.300, 2.900)), (0.075, 0.055, 0.030)),
        (((0.000, 0.330, 2.960), (0.000, 0.410, 2.900), (0.000, 0.450, 2.860)), (0.085, 0.060, 0.032)),
        (((0.380, 0.040, 3.360), (0.460, 0.055, 3.330), (0.520, 0.070, 3.300)), (0.085, 0.060, 0.032)),
        (((-0.380, 0.040, 3.360), (-0.460, 0.055, 3.330), (-0.520, 0.070, 3.300)), (0.085, 0.060, 0.032)),
    ):
        builder.tube(list(spine), list(radii), 2, HAIR, "Head", 5)
    # Fringe wisps on the forehead, riding the face surface (Lefty's rule).
    for wx in (-0.17, 0.0, 0.17):
        sf = skull_front_y(wx, 3.330)
        sf2 = skull_front_y(wx * 1.4, 3.240)
        if sf > -9.0 and sf2 > -9.0:
            builder.tube([(wx, sf - 0.020, 3.360), (wx * 1.4, sf2 - 0.028, 3.250)],
                         [0.078, 0.030], 2, HAIR, "Head", 4)


# --- The cream tee (the torso loft) --------------------------------------------
#
# not-traceable: the tee shows only as the centre strip between the jacket's
# open front edges; halves bounded off the jacket silhouette minus its shell.
TORSO_LEVELS = [
    (1.575, 0.332, 0.281, "Hips"),   # hem tucked above the jacket rib - an
    (1.600, 0.334, 0.283, "Hips"),   # exposed tee tab read as a loose tongue
    (1.800, 0.323, 0.274, "Spine"),
    (2.100, 0.305, 0.258, "Spine1"),
    (2.280, 0.288, 0.243, "Spine1"),
    (2.420, 0.262, 0.220, "Spine2"),
    (2.480, 0.215, 0.180, "Spine2"),
    (2.540, 0.170, 0.145, "Spine2"),
    (2.590, 0.150, 0.130, "Spine2"),
]

# --- The open varsity jacket ---------------------------------------------------
#
# The Professor's partial ring shell in varsity colours: teal body, striped
# rib hem, collar flaps. (z, half-x, half-y, colour).
# not-traceable: his hanging arms merge with the torso at every row (front
# z=1.75 measures 0.6999 arm-to-arm); the shell halves are the tee's plus
# the drawn drape.
JACKET_LEVELS = [
    (1.560, 0.372, 0.318, CREAM_DIM),   # rib hem: crisp paired-ring stripes
    (1.582, 0.375, 0.320, CREAM_DIM),
    (1.586, 0.375, 0.320, TEAL),
    (1.608, 0.377, 0.322, TEAL),
    (1.623, 0.376, 0.321, CREAM_DIM),
    (1.638, 0.375, 0.320, TEAL),
    (1.660, 0.372, 0.317, TEAL),
    (1.680, 0.368, 0.314, TEAL_DARK),   # rib-to-body shadow line
    (1.850, 0.356, 0.304, TEAL),
    (2.090, 0.340, 0.290, TEAL),
    (2.320, 0.317, 0.267, TEAL),
    (2.440, 0.296, 0.248, TEAL),
    (2.510, 0.258, 0.218, TEAL),
    (2.570, 0.205, 0.178, TEAL),
    (2.620, 0.178, 0.156, TEAL_DARK),   # the collar line
]

JACKET_GAP = 0.70   # radians of front opening either side of centre-front - wide enough that the cream tee reads as a clear centre panel


def build_jacket(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    cols = 10 if detail >= 2 else 7
    # The opening is centred at 1.5π (the -y front). A 0.5π probe was tried
    # against the round-1 'teal bib' note and covered the chest completely -
    # the real defect was the opening's WIDTH, not its side.
    start = 1.5 * pi + JACKET_GAP
    sweep = 2 * pi - 2 * JACKET_GAP
    # LOD1 keeps every other ring - the crisp stripe pairs are a LOD0 luxury.
    levels = JACKET_LEVELS if detail >= 2 else JACKET_LEVELS[::2]
    rows = []
    for (z, hx, hy, colour) in levels:
        bone = "Hips" if z < 1.7 else ("Spine" if z < 2.1 else "Spine2")
        row = []
        # Fold-back inner vertex at the leading front edge.
        t0 = start
        row.append(builder.vertex((hx * cos(t0) * 0.93, hy * sin(t0) * 0.93, z), colour, bone))
        for i in range(cols):
            t = start + sweep * i / (cols - 1)
            row.append(builder.vertex((hx * cos(t), hy * sin(t), z), colour, bone))
        t1 = start + sweep
        row.append(builder.vertex((hx * cos(t1) * 0.93, hy * sin(t1) * 0.93, z), colour, bone))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False)
    # Collar flaps: two small grids folding outward at the top front edges.
    for side in (1, -1):
        frows = []
        for j, (dy, dz) in enumerate(((0.0, 0.0), (-0.055, 0.045))):
            row = []
            for i in range(2):
                x = side * (0.135 + 0.075 * i)
                base_y = -JACKET_LEVELS[-1][2] * 0.92
                row.append(builder.vertex((x, base_y + dy, 2.605 + dz - 0.02 * i), TEAL_DARK, "Spine2"))
            frows.append(row)
        builder.grid(frows, 1, cyclic=False, flip=side < 0)


# His neck pinch is row 388 → z 2.60; the bottom ring is a genuine 2px
# narrower than the ring above (the topmost-of-equals lesson), and the loft
# runs up INTO the skull (Clover's daylight lesson).
# not-traceable: the pinch is framed by the collar; half bounded ~0.13.
NECK_LEVELS = [
    (2.590, 0.120, 0.113, "Spine2"),
    (2.680, 0.130, 0.122, "Neck"),
    (2.770, 0.142, 0.133, "Neck"),
    (2.850, 0.154, 0.144, "Neck"),
]


# --- Arms: cream varsity sleeves to striped rib cuffs, bare hands --------------
SLEEVE_HEM_X = 1.300

# ⚠️ EVERY station inboard of the deltoid needs an entry (blend = the
# Spine2 share) — a station with no entry weights 100% to the arm bone and
# shears a shoulder fin when the arm drops.
SHOULDER_BLEND = {
    0.215: 0.86,
    0.246: 0.68,
    0.300: 0.52,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare-hand width is bounded off the wrist runs (~0.072 half).
ARM_STATIONS = [
    (0.215, 0.146, CREAM, "Arm"),
    (0.246, 0.144, CREAM, "Arm"),
    (0.300, 0.148, CREAM, "Arm"),
    (0.335, 0.143, CREAM, "Arm"),
    (ARM_SHOULDER_X, 0.134, CREAM, "Arm"),
    (0.560, 0.124, CREAM, "Arm"),
    (0.720, 0.118, CREAM, "Arm"),
    (ARM_ELBOW_X, 0.113, CREAM, "ForeArm"),
    (1.100, 0.108, CREAM, "ForeArm"),
    (1.240, 0.103, CREAM, "ForeArm"),
    (SLEEVE_HEM_X, 0.112, CREAM_DIM, "Hand"),   # rib cuff, proud
    (SLEEVE_HEM_X + 0.020, 0.108, TEAL, "Hand"),  # cuff stripe
    (SLEEVE_HEM_X + 0.042, 0.100, CREAM_DIM, "Hand"),
    (SLEEVE_HEM_X + 0.062, 0.078, CREAM_DIM, "Hand"),
    (SLEEVE_HEM_X + 0.082, 0.058, SKIN, "Hand"),
    (1.420, 0.062, SKIN, "Hand"),
    (1.470, 0.070, SKIN, "Hand"),   # knuckle line
    (1.515, 0.060, SKIN, "Hand"),
]

THEO_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
    # 0.03, not 0.06: the sleeve runs to SLEEVE_HEM_X 1.300, past the elbow,
    # so the knob sits UNDER the sleeve and at 0.06 its critic read a hard
    # 1px step at rest, "a second cuff". Half the amount keeps the bend's
    # read in motion without a cuff the sheet does not draw.
    elbow=0.03,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.550,
        finger_root=1.502,
        finger_offsets=((-0.042, 0.0, 0.042), (-0.028, 0.028)),
        finger_lengths=((0.096, 0.110, 0.098), (0.102, 0.107)),
        finger_widths=(0.026, 0.025, 0.020, 0.015),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.390, -0.031, -0.015),
            (1.438, -0.053, -0.026),
            (1.474, -0.065, -0.034),
            (1.494, -0.071, -0.038),
        ),
        thumb_widths=(0.026, 0.024, 0.018, 0.013),
    ),
    garment=CREAM,
    skin=SKIN,
)


# --- Navy shorts, bare legs, tall striped socks --------------------------------
INSEAM_TOP_Z = 1.480
INSEAM_HEM_Z = 1.150
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=0.85 halfWidth=0.1157 tol=0.03
# measured: front z=0.55 halfWidth=0.1104 tol=0.03
LEG_STATIONS = [
    (1.560, 0.205, 1.08, SHORTS, "UpLeg"),
    (1.450, 0.198, 1.05, SHORTS, "UpLeg"),
    (1.340, 0.192, 1.03, SHORTS, "UpLeg"),
    (1.290, 0.196, 1.02, SHORTS_DARK, "UpLeg"),   # hem lip
    (1.250, 0.120, 1.00, SKIN, "UpLeg"),          # the bare leg
    (1.100, 0.114, 1.00, SKIN, "Leg"),
    (0.950, 0.108, 1.00, SKIN, "Leg"),
    # ★ A calf the board can see (the Peaches lesson, #214): 0.103 under a
    # 0.108 knee row read as a straight pipe. 0.110 is a swell the sheet's
    # lanky leg does draw, small, above the proud sock roll.
    (0.740, 0.110, 1.00, SKIN, "Leg"),            # the calf
    (0.640, 0.116, 1.00, SOCK, "Leg"),            # sock top roll, proud
    (0.612, 0.108, 1.00, SOCK, "Leg"),
    (0.585, 0.107, 1.00, TEAL, "Leg"),            # stripes: one ring each, close
    (0.558, 0.106, 1.00, SOCK, "Leg"),            # spacing keeps the edges tight
    (0.531, 0.105, 1.00, TEAL, "Leg"),
    (0.504, 0.104, 1.00, SOCK, "Leg"),
    (0.440, 0.102, 1.00, SOCK, "Foot"),
    (0.300, 0.096, 0.98, SOCK, "Foot"),
    (0.150, 0.090, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations.
CROTCH_LEVELS = [
    (1.470, 0.160, 0.190, "Hips"),
    (1.570, 0.180, 0.220, "Hips"),
    (1.680, 0.200, 0.250, "Hips"),
]

THEO_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=SHORTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
    calf=(0.740, 0.15),  # a lanky calf, small, behind the shin: LegSpec.calf
    knee=0.14,  # the kneecap and the hollow under it (0.12-0.15 of the local
                 # half-width is what survives the board — LegSpec.knee)
)


# --- The shoe ------------------------------------------------------------------
#
# Cream canvas low-top with the charcoal saddle and laces — the family last.
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
SHOE_WIDTH_SCALE = 0.97
SHOE_HEIGHT_SCALE = 1.18

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole and cream canvas — the charcoal arrives as trim (toe cap,
# heel counter, lace straps), matching the sheet's saddle read.
SHOE_BANDS = [
    (0.000, "midsole"),
    # Band probes 0.34/0.56/0.82 all measured ~88/12 - the split is set by
    # the visible sole geometry, not this boundary (the non-monotonic snap).
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


THEO_SHOE = ShoeSpec(
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
    build_hair(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, SHORTS, 8 if detail >= 2 else 6)
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, CREAM, 14 if detail >= 2 else segments)
    build_jacket(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=THEO_ARM)
        build_leg(builder, side, detail, spec=THEO_LEG)
        build_shoe(builder, side, detail, spec=THEO_SHOE,
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
    obj["recessReference"] = "theo-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # ⚠️ The pre-convention build may have left extra meshes in this blend
    # (Mimi's carried *_CurlHalo shells and an Icosphere that blew the 400KB
    # budget) — remove EVERY mesh, not just the LOD roots.
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    settings = {
        "kid_calls_shot_LOD0": (20, 12, 2),
        "kid_calls_shot_LOD1": (8, 4, 1),
        "kid_calls_shot_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "calls_shot")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Big Talk Theo reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against theo-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cap's cream front panel.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- calls_shot\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_calls_shot_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
