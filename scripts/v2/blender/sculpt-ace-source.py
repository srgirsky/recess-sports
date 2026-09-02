"""Rebuild Ace as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/ace-pilot.blend \
    --python scripts/v2/blender/sculpt-ace-source.py

★ ACE IS THE CAPTAIN'S KIT — Moose's cap over shaggy hair that pokes below
it, The Professor's open-jacket shell in the same sky blue as the cap (one
cluster on the sheet), a cream tee strip, and jean rolls. Every construction
here is second-use vocabulary; the numbers are his own.

The conversion: front figure 662px over 4.0ft → 1px = 0.006042ft. The profile
faces +x. Head band: cap top row 187 (z 3.99) to neck pinch row 405 (z 2.68).
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
OUTPUT = REPO / "assets/v2/source/ace-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/ace-face-atlas.png"
REVISION = "ace-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: ONE sky blue #739DBB spans cap and jacket (47% of the
# sheet), cream tee in the backdrop's cluster, skin #E3924D, near-black hair
# #130C03, navy-grey ribbing #323C3D. Ramp-authored.
SKIN = rgba("FFB765")
SKIN_SHADOW = rgba("D28A38")
HAIR = rgba("241408")        # the shaggy near-black hair under the cap
SHIRT = rgba("FFF2DC")       # the cream tee under the jacket
SHIRT_DARK = rgba("E8D8BC")  # the tee's shaded lane
PANTS = rgba("3E5C7A")       # denim jeans
PANTS_DARK = rgba("2C4258")
SOCK = rgba("FFF6E6")        # unused — the rolls meet the shoes
SHOE = rgba("7FA2C8")        # sky-blue quarter panels
WHITE = rgba("FFF2D8")       # cream cupsole
SOLE = rgba("C9A87A")        # warm tan toe bumper, laces, sole shading
# The team accent is the CAP'S FRONT PANEL badge (the Chip/Moose cap
# convention) — the crown, brim and jacket stay authored blue.
TEAM_MASK = rgba("D8D2C6")
JACKET = rgba("85AEDC")      # the sky-blue bomber — chroma up over #739dbb
JACKET_DARK = rgba("3A4550") # navy ribbed hem/cuffs and collar
CAP = JACKET                 # the cap shares the jacket blue
ROLL = rgba("B8C8DC")        # the light-denim jean rolls
ZIP = rgba("E3D2B8")         # the cream zipper tape — traced d8c6ab/ccb89b on
                             # the lit tapes (front row 580), ~0.89x of the tee
CAP_SEAM = rgba("6D90B8")    # the cap's panel-seam lines, ~0.82x of the dome blue

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: thick brows rows 283-293 (46.3% of the 3.99→2.68
# head, z 3.38), steady eyes rows 310-339 centred row 324 (62.8%, z 3.17),
# nose rows 356-358, the calm smile rows 367-374 (84.9%, z 2.88 — the spec's
# ambiguous-parts pair is the nostril row 357 vs this lip row). Real ears on
# the traced widest row (68.3%, z 3.09).
HEAD_CENTER = (0.0, -0.020, 3.120)
HEAD_RADII = (0.400, 0.420, 0.430)

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
    """The glasses carry the eye read — a gentle dish."""
    dz = nz - 0.110
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.056 + (dz * dz) / 0.023
    if radial >= 1.0:
        return 0.0
    return 0.010 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small button between the lenses and the smile (centre nz -0.36)."""
    if abs(nx) > 0.16:
        return 0.0
    dz = nz + 0.325
    if dz < -0.10 or dz > 0.11:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.16) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.090 if dz >= 0.0 else 0.100
    t = dz / reach
    tip = 0.082 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Real ears on the traced widest row.
EAR_SPEC = EarSpec(center=(0.020, 3.090), radii=(0.1500, 0.1700))

# Island solved for his span: brow anchor 19 lands z 3.386 (46.1% of the
# 3.99→2.68 head against the traced 46.3), eye anchor 50 lands z 3.167 (62.8
# vs 62.8), mouth anchor 84 lands z 2.881 (84.7 vs 84.9). The spec REFUSES
# his eye band and flags the mouth ambiguous (nostrils vs lip); the rows
# above are bounded traces.
FACE_ISLAND = (0.92, -1.3273, 2.300)

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


# --- The cap and the shaggy hair -----------------------------------------------
#
# Moose's cap construction in Ace's blue, over a shaggy near-black band that
# pokes below the cap edge with a wavy lower edge.
# measured: front z=3.90 halfWidth=0.2991
# measured: front z=3.58 halfWidth=0.5408
CAP_LEVELS = [
    (3.960, 0.115, 0.125, 0.000),
    (3.900, 0.265, 0.280, 0.000),
    (3.820, 0.375, 0.395, 0.000),
    (3.720, 0.450, 0.465, 0.010),
    (3.620, 0.510, 0.515, 0.020),
    (3.540, 0.540, 0.530, 0.030),
]

BRIM_Z_TOP = 3.560
BRIM_REACH = -0.760

# See the seam comment in build_cap; mirror-symmetric under θ→π−θ.
CAP_SEAM_COLUMNS = frozenset({0, 3, 5, 8, 11, 13})


def cap_dome_y(x, z, half_x, half_y):
    if half_x <= 0.0:
        return 0.0
    t = 1.0 - (x / half_x) ** 2
    return -half_y * sqrt(t) if t > 0.0 else 0.0


def build_cap(builder, detail):
    segments = 16 if detail >= 2 else (10 if detail == 1 else 8)
    use = CAP_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in CAP_LEVELS], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            # The six-panel crown reads through its SEAMS: thin darker bands
            # down the dome's own columns, converging on the top button (hem
            # sweep finding 5 — colour on existing geometry, zero triangles).
            # not-traceable: the drawn arcs sit at ~±30/±90/±150° of
            # centre-front, where a 16-column ring has no vertex; the nearest
            # MIRROR-SYMMETRIC column set {0,3,5,8,11,13} carries them (the
            # set must be even under θ→π−θ — Dex's parity lesson — and the
            # front panel stays centred on the front column, 12).
            seam = detail >= 2 and column in CAP_SEAM_COLUMNS and z < 3.95
            ring.append(builder.vertex((half_x * cos(theta), y_centre + half_y * sin(theta), z),
                                       CAP_SEAM if seam else CAP, "Head"))
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
    if detail >= 2:
        # The covered top button the sheet draws at the apex (cap crop, rows
        # 185-196). Kept under the 4.0ft reference height: top = 3.994.
        builder.ellipsoid((0.0, 0.0, 3.972), (0.036, 0.038, 0.022), 2, CAP, "Head", 6, 3)

    if detail < 1:
        return
    # The brim wedge with edge walls (Moose's paper-plane lesson).
    cols = 5 if detail >= 2 else 3
    top_rows, bot_rows = [], []
    for j, (y_frac, half) in enumerate(((0.0, 0.360), (0.5, 0.345), (1.0, 0.270))):
        y = -0.470 + y_frac * (BRIM_REACH + 0.470)
        row_t, row_b = [], []
        for i in range(cols):
            t = i / (cols - 1) - 0.5
            x = 2 * t * half
            # ★ THE BILL WAS AUTHORED ALMOST FLAT AND READ AS A BEANIE.
            # The drop was 0.012 over a 0.290 run — atan(0.012/0.290) = 2.4
            # degrees — where his sheet draws a bill that clearly sweeps down.
            # Bounded trace on ace-turnaround.png's profile view (x 673-863):
            # the bill's top edge leaves the crown near (804, 240) and reaches
            # its tip near (862, 251), an 11px drop over a 58px run = ~11
            # degrees. 0.056 delivers that over this run.
            # ⚠️ The critic that found it reported "~50 degrees", which the crop
            # does not support; 11 is what the drawing measures. Corrected
            # toward the measurement, not toward the report — and recorded here
            # so the next round re-traces rather than splitting the difference.
            # This is Theo's batting-helmet class one cap along: a brim whose
            # angle is authored by feel reads as headgear of a different kind.
            zt = BRIM_Z_TOP - 0.015 * abs(2 * t) - 0.056 * y_frac
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

    # The team-accent front panel, badge-sized (the Chip/Moose convention).
    prows = []
    for z in (3.610, 3.680, 3.740):
        hx = 0.475 if z < 3.65 else (0.445 if z < 3.72 else 0.415)
        hy = 0.490 if z < 3.65 else (0.465 if z < 3.72 else 0.435)
        row = []
        for i in range(3):
            t = i / 2 - 0.5
            x = 2 * t * 0.105
            y = cap_dome_y(x, z, hx, hy) - 0.013
            row.append(builder.vertex((x, y, z), TEAM_MASK, "Head"))
        prows.append(row)
    builder.grid(prows, 3, cyclic=False)


# The shaggy band below the cap: flush to the skull, wavy lower edge, open
# face — Moose's buzz-band form with clump modulation.
# not-traceable: the band hugs the authored skull; its z range is the cap
# edge (3.52) down to the shaggy tips the side views draw (~2.92).
# measured: front z=3.26 halfWidth=0.5921
SHAG_LEVELS = [
    (3.520, 0.430, 0.420, 0.005),
    (3.420, 0.520, 0.480, 0.010),
    (3.300, 0.575, 0.520, 0.020),
    (3.180, 0.550, 0.490, 0.040),
    (3.060, 0.440, 0.400, 0.080),
    (2.960, 0.300, 0.280, 0.120),
]

# The window opens wide at the temples: the curtain the sample row sees is
# the QUAD from the ring above, so the fringe must climb past that ring's
# column (0.37 at z 3.30) or the wall keeps rendering — three identical
# measurements taught the quantization.
SHAG_FRINGE = [
    (0.00, 3.435),
    (0.20, 3.405),
    (0.30, 3.360),
    (0.40, 3.340),
    (0.46, 2.960),
]

SHAG_OPEN_BOTTOM = 2.900


def fringe_z_at(x_abs):
    table = SHAG_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def build_shag(builder, detail):
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the runtime lights the mass as a slate-grey void.
    assert all(a[0] > b[0] for a, b in zip(SHAG_LEVELS, SHAG_LEVELS[1:])), \
        "SHAG_LEVELS must be strictly descending in z"
    segments = 18 if detail >= 2 else (10 if detail == 1 else 8)
    use = SHAG_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in SHAG_LEVELS], detail)
    ascending = list(reversed(use))
    rows = []
    for ri, (z, half_x, half_y, y_centre) in enumerate(ascending):
        ring = []
        # Wavy shag on the lower rings — MIRROR-SYMMETRIC, amplitude by row
        # (Penny's phase lesson).
        curl = (0.05 if ri <= 1 else 0.0) if detail >= 2 else 0.0
        for column in range(segments):
            theta = 2 * pi * column / segments
            clump = 1.0 + curl * cos(6 * (theta - pi / 2))
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                if SHAG_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
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


# --- The tee (the torso loft) and the open jacket shell ------------------------
#
# The torso loft is the CREAM TEE; the jacket is a proud partial ring shell
# swept from one front edge around the back to the other (Penny's
# over-garment-is-geometry lesson), with fold-back front edges so the rim
# reads as cloth, not paper.
# not-traceable: the tee shows only as the centre strip between the jacket
# fronts (cream run 213-253 at z 1.6-2.35); the torso halves are bounded off
# the jacket silhouette minus its shell.
#
# ★ THE TEE LOFT OWNS THE NECKLINE (hem sweep, rubric 3.4). The jacket shell's
# 2×0.55rad front gap can never wrap the front of the neck, so its navy top
# row delivered exactly two wedges at the shoulder tops. The bomber's collar
# rib therefore lives on the tee's top rows and wraps the full opening,
# merging with the shell's collar at the back (Grizz's collar is the sweep's
# exemplar: ring pair + proud crown + the colour switch inside a short band).
# measured: front col 140 rows 425-437 — navy rib 374f60..44616f, z 2.556→2.483;
#   col 222 rows 419-427 — cream roll-over stripe e1d3bf..decfb1, z 2.592→2.544
# measured: profile col 780 — cream stripe e8d2b4 z 2.665→2.652 over navy
#   545e68 to ~2.615 at the nape (the collar slopes down toward the front)
# Recorded deviation: authored 2.545→2.615 — the band's height and stacking
# are the trace's; it sits at the loft's top so the hole ring clears the neck
# loft (0.134/0.126 at 2.595) by ≥0.016 at every shared z. The board's 1-2px
# neckline sawtooth was the two lofts INTERPENETRATING (Turbo's class — the
# old 2.605 ring was 0.132 against the neck's 0.134), not ring count.
TORSO_LEVELS = [
    (1.400, 0.328, 0.280, "Hips"),    # tee hem lip, 0.008 proud — the lit hem
                                      # roll (fcf0d6, front row 614, z 1.414)
    (1.416, 0.319, 0.271, "Hips"),    # measured: front tee bottom row 614 z=1.414
    (1.462, 0.318, 0.270, "Spine"),   # hem-lane top — TEE_BAND_Z inside this pair
    (1.474, 0.317, 0.269, "Spine"),   # measured: shaded lane ebd8be..f1dfc7,
                                      # centre col 183 rows 599-611 (z 1.51→1.43)
    (1.560, 0.315, 0.270, "Spine"),
    (1.760, 0.305, 0.262, "Spine"),
    (1.960, 0.295, 0.255, "Spine1"),
    (2.160, 0.288, 0.246, "Spine1"),
    (2.320, 0.280, 0.235, "Spine2"),
    (2.420, 0.258, 0.215, "Spine2"),
    (2.490, 0.215, 0.185, "Spine2"),
    (2.545, 0.164, 0.146, "Spine2"),  # yoke: last tee ring under the collar
    (2.553, 0.170, 0.152, "Spine2"),  # rib lower edge — COLLAR_Z inside this pair
    (2.582, 0.174, 0.156, "Spine2"),  # rib crown, 0.010 proud of the yoke —
                                      # the collar OVERHANGS the tee (Penny)
    (2.590, 0.173, 0.155, "Spine2"),  # stripe lower ring — COLLAR_STRIPE_Z
                                      # inside this pair
    (2.615, 0.150, 0.138, "Spine2"),  # hole ring: the cream roll turns in,
                                      # clear of the neck loft at every shared z
]

# Each colour switch sits inside its own ~0.01ft ring pair (the Zippy
# stretched-band lesson: a switch between distant rings ramps across 32px).
COLLAR_Z = 2.549          # inside the 2.545/2.553 pair — navy rib above
COLLAR_STRIPE_Z = 2.586   # inside the 2.582/2.590 pair — cream roll-over above
TEE_BAND_Z = 1.468        # inside the 1.462/1.474 pair — shaded hem lane below
TEE_HEM_LIP_Z = 1.408     # inside the 1.400/1.416 pair — lit hem roll below


def tee_color(theta: float, z: float):
    """The bomber collar rib on the tee's top rows; the tee's drawn hem below."""
    if z >= COLLAR_STRIPE_Z:
        return WHITE
    if z >= COLLAR_Z:
        return JACKET_DARK
    if z <= TEE_HEM_LIP_Z:
        return SHIRT
    if z <= TEE_BAND_Z:
        return SHIRT_DARK
    return SHIRT

# not-traceable: the shell hugs the tee +0.026; its silhouette IS the traced
# figure at torso rows (front z=1.66 halfWidth=0.7064 includes the arms).
#
# ★ THE HEM RIB IS THE GARMENT'S STRONGEST HORIZONTAL on the sheet, and the
# old table never drew it: the colour rule was `z < 1.52` against a bottom
# row at exactly 1.520, so no vertex ever went navy and the "rib" was one
# slightly-proud blue ring — the hairline the hem sweep flagged. Rebuilt as
# the traced tall band: navy rib with the cream stripe through it, crown
# proud of the body ring above (crisp + proud is a constructed garment).
# measured: front hem band rows 595-616, z 1.53→1.40 (rib 61859c/6b98b1
#   against body 7aa1bd; deep fold 2b3d49); stripe warm cream e4ccae/a59074
#   rows 601-613, centre ~z 1.455
# measured: profile rear col 730 — solid navy band rows 587-609, z 1.63→1.48
#   (the drawn hem sits higher at the back; the front trace is authored)
JACKET_LEVELS = [
    (1.408, 0.358, 0.306),    # hem rib bottom edge — front row 616, z 1.40
    (1.436, 0.361, 0.309),    # stripe lower pair —
    (1.444, 0.362, 0.310),    #   JACKET_STRIPE[0] between them
    (1.466, 0.362, 0.310),    # stripe upper pair —
    (1.474, 0.361, 0.309),    #   JACKET_STRIPE[1] between them
    (1.505, 0.356, 0.304),    # rib crown rows, 0.006 proud of the body ring
    (1.517, 0.350, 0.299),    # body lower ring — JACKET_HEM_TOP_Z inside this pair
    (1.660, 0.345, 0.298),
    (1.860, 0.334, 0.290),
    (2.060, 0.324, 0.280),
    (2.240, 0.315, 0.268),
    (2.380, 0.300, 0.252),
    (2.470, 0.262, 0.222),
    (2.545, 0.205, 0.180),
    (2.600, 0.175, 0.158),    # the collar line
]

JACKET_GAP = 0.55   # radians of front opening either side of centre-front

JACKET_HEM_TOP_Z = 1.511            # inside the 1.505/1.517 pair
JACKET_STRIPE = (1.440, 1.470)      # each edge inside its own ring pair


def jacket_color(z: float):
    """Navy ribbed hem (cream stripe through it) and collar; body blue between."""
    if JACKET_STRIPE[0] <= z <= JACKET_STRIPE[1]:
        return WHITE
    if z <= JACKET_HEM_TOP_Z or z > 2.58:
        return JACKET_DARK
    return JACKET


def build_jacket(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    cols = 14 if detail >= 2 else 9
    start = 1.5 * pi + JACKET_GAP
    sweep = 2 * pi - 2 * JACKET_GAP
    rows = []
    for (z, hx, hy) in JACKET_LEVELS:
        colour = jacket_color(z)
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
                row.append(builder.vertex((x, base_y + dy, 2.585 + dz - 0.02 * i), JACKET_DARK, "Spine2"))
            frows.append(row)
        builder.grid(frows, 1, cyclic=False, flip=side < 0)


def jacket_ring_at(z: float) -> tuple[float, float]:
    """(half-width, half-depth) of the jacket shell at height z."""
    levels = JACKET_LEVELS
    for (za, wa, da), (zb, wb, db) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return wa + t * (wb - wa), da + t * (db - da)
    return (levels[0][1], levels[0][2]) if z < levels[0][0] else (levels[-1][1], levels[-1][2])


def jacket_bone(z: float) -> str:
    return "Hips" if z < 1.7 else ("Spine" if z < 2.1 else "Spine2")


def jacket_surface_point(a: float, z: float, proud: float) -> tuple[float, float, float]:
    """A point `proud` outside the shell at bearing `a` off centre-front (+x
    positive), pushed along the ellipse's outward normal."""
    hx, hy = jacket_ring_at(z)
    theta = 1.5 * pi + a
    x, y = hx * cos(theta), hy * sin(theta)
    nx, ny = cos(theta) / hx, sin(theta) / hy
    norm = sqrt(nx * nx + ny * ny)
    return (x + proud * nx / norm, y + proud * ny / norm, z)


# The zipper runs hem to collar on both front edges; the pull tab and welt
# pockets are proud bevelled patches (batch 7: bevelled rim rows turn a decal
# into sewn construction; Dex's pull tab is the sweep's exemplar).
# measured: front — cream tapes flank the tee at cols 157-163 / 200-206
#   (d8c6ab / ccb89b, row 580), running the full opening to the hem
# measured: front — chest zip pocket cols 216-231, rows 470-518 (z 2.28→1.99),
#   navy strip with the metal slider at its top
# measured: front — welt slits rows 532-548, outer ends high (z ~1.88) inner
#   low (z ~1.80); drawn at |x| 0.32-0.42 on the flared OPEN panels, authored
#   at the same panel fraction of the closed shell (bearings 0.75-1.15 rad,
#   |x| 0.22-0.30) — recorded deviation, the open-jacket drape has no shell z
ZIP_TAPE_Z = (1.412, 1.550, 1.720, 1.900, 2.080, 2.260, 2.420, 2.545)


def build_jacket_details(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    # The zipper tape: a proud bevelled strip riding each front edge.
    for side in (1, -1):
        rows = []
        for z in ZIP_TAPE_Z:
            row = []
            for da, pr in ((0.005, 0.006), (0.055, 0.020), (0.105, 0.006)):
                a = side * (JACKET_GAP + da)
                row.append(builder.vertex(jacket_surface_point(a, z, pr), ZIP, jacket_bone(z)))
            rows.append(row)
        builder.grid(rows, 1, cyclic=False, flip=side < 0)
    if detail < 2:
        return
    # The chest zip pocket on the +x panel (screen-right on the front board,
    # like the sheet): a navy vertical strip, slider tab stacked at its top.
    rows = []
    for z in (2.000, 2.140, 2.280):
        row = []
        for a, pr in ((0.720, 0.005), (0.860, 0.016), (1.000, 0.005)):
            row.append(builder.vertex(jacket_surface_point(a, z, pr), JACKET_DARK, "Spine2"))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False)
    for z0, z1, a0, a1, pr, top_colour in (
        (2.220, 2.300, 0.740, 0.980, 0.026, ZIP),          # slider base step
        (2.240, 2.292, 0.790, 0.930, 0.038, JACKET_DARK),  # tab face, hinge-shadow top
    ):
        rows = []
        for j, z in enumerate((z0, z1)):
            colour = top_colour if j == 1 else ZIP
            rows.append([builder.vertex(jacket_surface_point(a, z, pr), colour, "Spine2")
                         for a in (a0, (a0 + a1) / 2, a1)])
        builder.grid(rows, 1, cyclic=False)
    # The hip welts: slanted proud bars, slit shadow on the top row.
    for side in (1, -1):
        rows = []
        for dz, pr, colour in ((-0.024, 0.006, JACKET), (0.0, 0.018, JACKET), (0.024, 0.006, JACKET_DARK)):
            row = []
            for i in range(4):
                t = i / 3
                a = side * (0.750 + 0.400 * t)
                z = 1.800 + 0.080 * t + dz
                row.append(builder.vertex(jacket_surface_point(a, z, pr), colour, jacket_bone(z)))
            rows.append(row)
        builder.grid(rows, 1, cyclic=False, flip=side < 0)


# Neck.
# not-traceable: the pinch is framed by the collar; half bounded ~0.13.
NECK_LEVELS = [
    (2.595, 0.134, 0.126, "Spine2"),
    (2.700, 0.132, 0.124, "Neck"),
    (2.810, 0.144, 0.136, "Neck"),
]


# --- Arms: brown jacket sleeves to ribbed cuffs, bare hands --------------------
SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; sleeve girth bounded off the below-shoulder silhouette. Deltoid kept
# LOW (Turbo's wedge lesson).
ARM_STATIONS = [
    (0.215, 0.142, JACKET, "Arm"),
    (0.300, 0.147, JACKET, "Arm"),
    (0.335, 0.141, JACKET, "Arm"),
    (ARM_SHOULDER_X, 0.132, JACKET, "Arm"),
    (0.560, 0.122, JACKET, "Arm"),
    (0.720, 0.116, JACKET, "Arm"),
    (ARM_ELBOW_X, 0.112, JACKET, "ForeArm"),
    (1.100, 0.108, JACKET, "ForeArm"),
    (1.240, 0.103, JACKET, "ForeArm"),
    (1.300, 0.109, JACKET_DARK, "Hand"),   # ribbed cuff, proud
    (1.340, 0.101, JACKET_DARK, "Hand"),
    (1.362, 0.082, JACKET_DARK, "Hand"),
    (1.382, 0.060, SKIN, "Hand"),
    (1.420, 0.064, SKIN, "Hand"),
    (1.470, 0.072, SKIN, "Hand"),   # knuckle line
    (1.515, 0.061, SKIN, "Hand"),
]

PROF_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
    elbow=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.554,
        finger_root=1.506,
        finger_offsets=((-0.046, 0.0, 0.046), (-0.032, 0.032)),
        finger_lengths=((0.104, 0.118, 0.106), (0.110, 0.115)),
        finger_widths=(0.027, 0.026, 0.021, 0.016),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.392, -0.036, -0.018),
            (1.440, -0.058, -0.030),
            (1.476, -0.071, -0.038),
            (1.496, -0.077, -0.042),
        ),
        thumb_widths=(0.027, 0.025, 0.019, 0.014),
    ),
    garment=JACKET,
    skin=SKIN,
)


# --- Jeans with team-accent rolls, no socks ------------------------------------
INSEAM_TOP_Z = 1.320
INSEAM_HEM_Z = 0.700
INSEAM_HEM_HALF = 0.042


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=0.94 halfWidth=0.4502 tol=0.06
LEG_STATIONS = [
    (1.420, 0.170, 1.10, PANTS, "UpLeg"),
    (1.200, 0.167, 1.10, PANTS, "UpLeg"),
    (1.000, 0.163, 1.08, PANTS, "Leg"),
    (0.800, 0.159, 1.06, PANTS, "Leg"),
    (0.640, 0.155, 1.04, PANTS, "Leg"),
    (0.560, 0.152, 1.03, PANTS, "Leg"),
    (0.520, 0.170, 1.04, ROLL, "Leg"),                # the rolled cuff —
    (0.440, 0.172, 1.04, ROLL, "Leg"),                # authored light denim
    (0.385, 0.166, 1.02, ROLL, "Leg"),                # (the accent is the cap)
    (0.360, 0.128, 0.99, PANTS_DARK, "Foot"),         # under the roll
    (0.290, 0.098, 0.97, SKIN, "Foot"),               # ankle into the shoe
    (0.150, 0.090, 0.95, SKIN, "Foot"),
]

PROF_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
    calf=(0.0, 0.0),
    knee=0.0,
)


# --- The shoe ------------------------------------------------------------------
#
# Grey canvas low-top with cream cupsole, toe bumper and laces.
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

# The classifier's band window is the BOTTOM 9%% of the figure — sole and
# vamp only; the drawn blue quarter sits above it. The pair there is cream +
# tan #947c5b (the sole shading), so the sole is two-tone (Dazzle's split).
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.110, "collar"),
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


PROF_SHOE = ShoeSpec(
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
    build_shag(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    torso_segments = 18 if detail >= 2 else segments
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
                 color_fn=tee_color)
    build_jacket(builder, detail)
    build_jacket_details(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=PROF_ARM)
        build_leg(builder, side, detail, spec=PROF_LEG)
        build_shoe(builder, side, detail, spec=PROF_SHOE,
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
    obj["recessReference"] = "ace-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_ace_kid_LOD0", "kid_ace_kid_LOD1", "kid_ace_kid_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_ace_kid_LOD0": (20, 12, 2),
        "kid_ace_kid_LOD1": (8, 4, 1),
        "kid_ace_kid_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "ace_kid")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Ace reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against ace-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cap panel accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- ace_kid\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_ace_kid_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
