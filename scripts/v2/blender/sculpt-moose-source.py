"""Rebuild Moose as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/moose-pilot.blend \
    --python scripts/v2/blender/sculpt-moose-source.py

★ MOOSE IS THE BIG ONE — the widest torso on the roster (a mustard kangaroo
hoodie half a foot deep), the smallest head span (24.8% of the figure, neck
at z 3.00), and the deepest skin yet, authored bright per Grizz's lesson so
the classifier's floors hold. His cap reuses Chip's construction with the
FRONT PANEL as the team accent (never the whole cap — the tint erases
identity navy).

The conversion: front figure 664px over 4.0ft → 1px = 0.006024ft. The profile
faces +x. Head band: cap top row 180 (z 3.99) to neck pinch row 345 (z 3.00).
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
OUTPUT = REPO / "assets/v2/source/moose-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/moose-face-atlas.png"
REVISION = "moose-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: deep skin #AB5B24 (authored ~1.27x — Grizz's floor lesson),
# mustard hoodie #ED921C with shade #9C5404, one navy #1D222B for cap and
# joggers, cream soles. Ramp-authored.
SKIN = rgba("DA7E36")
SKIN_SHADOW = rgba("A85818")
HAIR = rgba("33200F")        # the buzz under the cap — warm dark brown
SHIRT = rgba("FFAB2E")       # the mustard hoodie — chroma up over #ed921c
SHIRT_DARK = rgba("D07E10")  # hem/cuff ribbing and pocket shading
PANTS = rgba("2A3040")       # navy joggers
PANTS_DARK = rgba("1C2230")
SOCK = rgba("FFF6E6")        # unused — joggers cuff into the shoes
SHOE = rgba("323A50")        # navy upper panels
WHITE = rgba("FFE9BC")       # warm cream cupsole
SOLE = rgba("FFDCA4")        # warm cream toe bumper, laces
# The team accent is the cap's FRONT PANEL, Chip's convention — the crown and
# brim stay authored navy so the tint never erases the cap's identity.
TEAM_MASK = rgba("D8D2C6")
CAP = rgba("2A3244")         # cap crown and brim navy

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: the cap brim's shadow rows 244-262, soft bold
# brows rows 263-270 (52% of the 3.99→3.00 head, z 3.48), warm eyes rows
# 277-303 centred row 290 (66.7%, z 3.33), nose rows 317-324, the gentle
# smile rows 323-324 (87%, z 3.13). Real ears on the traced widest row
# (74.5%, z 3.25).
HEAD_CENTER = (0.0, -0.020, 3.350)
HEAD_RADII = (0.420, 0.420, 0.360)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.05, 1.04),
    (-0.30, 1.07),
    (-0.60, 1.05),
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
    """Warm friendly eyes — a soft dish."""
    dz = nz - (-0.056)
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.010 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A broad soft nose above the smile (centre nz -0.55)."""
    if abs(nx) > 0.18:
        return 0.0
    dz = nz + 0.550
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.18) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.082 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Real ears on the head's widest traced row.
EAR_SPEC = EarSpec(center=(0.020, 3.260), radii=(0.1700, 0.1650))

# Island solved for his span: brow anchor 24 lands z 3.474 (52.2% of the
# 3.99→3.00 head against the traced 52.0), eye anchor 50 lands z 3.330 (66.7
# vs 66.7), mouth anchor 84 lands z 3.128 (87.1 vs 87.0). The spec REFUSES
# brow and eye — the brim shadow merges them; the rows above are bounded
# traces.
FACE_ISLAND = (0.92, -1.3056, 2.000)

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


def cap_dome_y(x: float, z: float, half_x: float, half_y: float) -> float:
    """The cap dome's front surface at (x, z) for panel seating."""
    if half_x <= 0.0:
        return 0.0
    t = 1.0 - (x / half_x) ** 2
    return -half_y * sqrt(t) if t > 0.0 else 0.0


# --- The cap -------------------------------------------------------------------
#
# Chip's construction: a navy dome over the skull, a forward brim, and the
# FRONT PANEL as the team accent on M_Accessory.
# measured: front z=3.90 halfWidth=0.2771
# measured: front z=3.58 halfWidth=0.4518
CAP_LEVELS = [
    (3.960, 0.110, 0.120, 0.000),
    (3.900, 0.240, 0.255, 0.000),
    (3.820, 0.320, 0.340, 0.000),
    (3.720, 0.375, 0.395, 0.010),
    (3.620, 0.440, 0.450, 0.020),
    (3.550, 0.452, 0.460, 0.030),
]

BRIM_REACH = -0.735   # the brim tip's y — forward of the dome front (~-0.43)

# The bill, rebuilt by the bulk pass. The first build's rows (halves 0.310/
# 0.295/0.235, all at z ~3.56-3.59) sat entirely INSIDE the dome's 0.4518
# half-width, so the bill added 0px to the front silhouette and the cap read
# bowl/beanie — Theo and Chip's lesson arriving on the x axis instead of y.
# The drawing's brim descends over the brow and wraps the temples: its
# front-view shadow spans rows 244-262 (z 3.606-3.498), and at brim height
# the head OUTLINE is the brim itself (halfWidth 0.464-0.467 at z 3.48-3.52
# against the dome's 0.4518). Rows are (half_x, y_centre, z, sweep), front
# edge last, strictly descending in z; a None y_centre seats that row on the
# dome's front arc, and `sweep` pulls a row's outer columns back toward the
# dome so the planform rounds instead of ending in square corners; `droop`
# curls the outer columns DOWN (z - droop*(2t)^2) so the sides descend over
# the temples the way the drawn brim does. The droops are calibrated to the
# faceSkin sample row (62% of the head, z 3.375): the tip's outer columns
# bottom out at that row near |x| 0.22, leaving ~23% of head width visible
# per side against the sheet's 18.9/27.6 (the sheet lights its two temples
# unevenly — Penny's asymmetric-shading class — so the evenly-lit build aims
# between them), while the columns inside |x| 0.20 stay above z 3.39 so the
# eyes at z 3.33 are never covered.
# measured: front z=3.52 halfWidth=0.4669 tol=0.04
# measured: front z=3.48 halfWidth=0.4639 tol=0.04
BRIM_LEVELS = [
    (0.475, None, 3.600, 0.00, 0.22),         # base — wraps past the 0.4518 dome
    (0.415, -0.585, 3.520, 0.24, 0.16),
    (0.315, BRIM_REACH, 3.455, 0.16, 0.048),  # tip — below the traced brow z 3.474
]

# ★ Moose's own bill asserts (Chip's `-BRIM_REACH < dome_front - 0.05`
# pattern, applied on BOTH axes of the failure that shipped here).
_DOME_HALF = max(hx for _, hx, _, _ in CAP_LEVELS)          # 0.4520
_DOME_FRONT = min(yc - hy for _, _, hy, yc in CAP_LEVELS)   # -0.4300
assert max(row[0] for row in BRIM_LEVELS) > _DOME_HALF + 0.02, (
    f"brim base half {max(row[0] for row in BRIM_LEVELS):.3f} does not clear "
    f"the dome half-width {_DOME_HALF:.3f} by 0.02ft — a bill narrower than "
    "its own dome adds 0px to the front silhouette and the cap reads beanie")
assert BRIM_REACH < _DOME_FRONT - 0.05, (
    f"brim tip y={BRIM_REACH:.3f} does not clear the dome front "
    f"{_DOME_FRONT:.3f} by 0.05ft — a shorter reach projects NO bill")
assert BRIM_LEVELS[-1][2] < 3.474, (
    f"brim tip z={BRIM_LEVELS[-1][2]:.3f} sits above the traced brow line "
    "z 3.474 — the drawn brim descends over the brow (shadow rows 244-262)")


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
    # The brim: descending planform rows reaching forward and down from the
    # dome, wide enough to wrap the temples (see BRIM_LEVELS' header).
    cols = 5 if detail >= 2 else 3
    top_rows, bot_rows = [], []
    for half, y_row, z_row, sweep, droop in BRIM_LEVELS:
        row_t, row_b = [], []
        for i in range(cols):
            t = i / (cols - 1) - 0.5
            x = 2 * t * half
            if y_row is None:
                # Seat the base row on the dome's front arc, 0.015 proud;
                # past the dome's half-width the arc ends and the corner
                # must sit clear IN FRONT of the ear (ear front y -0.150,
                # top z 3.425 — a corner on the centre plane pierces it).
                if abs(x) <= 0.452:
                    y = 0.030 + cap_dome_y(x, z_row, 0.452, 0.460) - 0.015
                else:
                    y = -0.200
            else:
                y = y_row + sweep * (2 * t) ** 2
            zt = z_row - droop * (2 * t) ** 2
            row_t.append(builder.vertex((x, y, zt), CAP, "Head"))
            row_b.append(builder.vertex((x, y, zt - 0.035), CAP, "Head"))
        top_rows.append(row_t)
        bot_rows.append(row_b)
    builder.grid(top_rows, 2, cyclic=False)
    builder.grid(list(reversed(bot_rows)), 2, cyclic=False)
    # Edge walls so the brim has THICKNESS — without them the orthographic
    # profile renders the two sheets as parallel zero-width lines.
    edge = []
    for j in range(len(top_rows)):
        edge.append((top_rows[j][0], bot_rows[j][0]))
    for i in range(1, len(top_rows[-1])):
        edge.append((top_rows[-1][i], bot_rows[-1][i]))
    for j in range(len(top_rows) - 1, -1, -1):
        edge.append((top_rows[j][-1], bot_rows[j][-1]))
    for (t0, b0), (t1, b1) in zip(edge, edge[1:]):
        builder.face((t0, t1, b1, b0), 2)

    # The FRONT PANEL — the team-accent surface (material 3), a proud patch
    # on the dome's front face. Chip's convention: never the whole cap.
    # Small, logo-patch sized: Moose's sheet draws a PLAIN navy cap, so the
    # accent surface must read as a badge, not a trucker panel — the first
    # build's 0.40ft panel read as a white patch the sheet does not have.
    prows = []
    for z in (3.640, 3.700, 3.750):
        hx = 0.405 if z < 3.65 else (0.375 if z < 3.75 else 0.340)
        hy = 0.425 if z < 3.65 else (0.395 if z < 3.75 else 0.360)
        row = []
        for i in range(3):
            t = i / 2 - 0.5
            x = 2 * t * 0.105
            y = cap_dome_y(x, z, hx, hy) - 0.013
            row.append(builder.vertex((x, y, z), TEAM_MASK, "Head"))
        prows.append(row)
    builder.grid(prows, 3, cyclic=False)


# --- The hoodie ----------------------------------------------------------------
#
# The torso loft IS the garment (Bubbles' construction) at Moose scale, with
# a hood bump behind the neck, a kangaroo pocket, drawstrings and ribbed hem.
# not-traceable: his hanging long sleeves merge with the body at every torso
# row (the front silhouette runs 0.82-0.95 half), so half_x above the hem is
# scaled with the profile depths instead of traced. The half_y column IS
# traced: the bulk pass authored each row to half the profile body span with
# the hand/ink and drawstring fragments excluded — spans z 1.70 → 0.966,
# 1.90 → 0.929, 2.10 → 0.892, 2.30 → 0.780, 2.48 → 0.740; above 2.58 the
# hood carries the back of the silhouette, so those rows take the front
# reach only. The ribbed hem band IS bounded, at the front centre column
# (col 188): bottom edge row 606 (z 1.428), ribbing top seam row 587
# (z 1.542), 0.006024 ft/px; the hem's own profile span (0.825 at z 1.42-
# 1.47) was already met, so the five hem rows are untouched by the bulk pass.
# measured: view2 z=1.90 halfWidth=0.5169 tol=0.06
# measured: view2 z=2.10 halfWidth=0.4800 tol=0.06
# measured: view2 z=1.70 halfWidth=0.5077 tol=0.06
TORSO_LEVELS = [
    # The hem is Penny's 1.987/1.999 lesson applied at a hem instead of a
    # waistband: a ring PAIR at the traced top seam so the colour switch is
    # crisp, the band ring 0.010 PROUD so the ribbing overhangs the body it
    # hangs from, and an under-roll ring so the bottom edge turns IN before
    # the loft's flat bottom fan — the 9x hip crop read the old single-ring
    # terminus as a hard 90-degree slab corner.
    (1.424, 0.446, 0.386, "Hips"),    # hem underside — traced bottom edge z 1.428
    (1.438, 0.474, 0.410, "Hips"),    # under-roll — the band turns in, no corner
    (1.470, 0.480, 0.415, "Hips"),    # ribbed hem band, widest
    (1.534, 0.478, 0.413, "Hips"),    # band top lip, 0.010 proud — traced seam z 1.542
    (1.546, 0.468, 0.405, "Hips"),    # the body tucks behind it; crisp colour edge
    (1.700, 0.550, 0.483, "Spine"),   # belly, the drawn maximum — span 0.966
    (1.900, 0.526, 0.465, "Spine"),
    (2.100, 0.503, 0.446, "Spine1"),
    (2.300, 0.437, 0.390, "Spine1"),
    (2.480, 0.413, 0.370, "Spine2"),  # reaches past the arm root x 0.400
    (2.620, 0.374, 0.340, "Spine2"),
    (2.740, 0.302, 0.285, "Spine2"),
    (2.830, 0.200, 0.192, "Spine2"),  # eases toward the collar roll, which
                                      # must stay proud of this row
    # The collar roll, raised to the chin line: the sheet seats the chin/jowls
    # IN the collar with no bare neck (front view: skin runs to row ~394 at
    # the centre while the collar tops the shoulders at rows 362-378) — the
    # old roll at z 2.900 left a skin stalk between it and the head's bottom
    # (ellipsoid floor z 2.99). The rim rides ~0.02 proud of the neck loft
    # (0.148/0.140 at z 3.01) so it frames the neck from the front.
    # measured: front chin-on-collar overlap rows 362-394; the model maps the
    # rim to its own head floor z 2.99 (the sheet's jowl hangs below the
    # model's ellipsoid chin, so the sheet row cannot be used as a raw z).
    (2.910, 0.180, 0.176, "Spine2"),  # roll base — thickens instead of necking in
    (2.995, 0.170, 0.166, "Spine2"),  # collar rim at the chin line, proud of the neck
    (3.020, 0.142, 0.136, "Spine2"),  # neck hole — turns in, hidden inside the neck loft
]


def hoodie_color(theta: float, z: float):
    # The switch sits ON the 1.534/1.546 ring pair (a switch inside a
    # stretched band ramps colour across the gap — the Zippy hem lesson).
    if 1.424 <= z <= 1.540:
        return SHIRT_DARK  # the ribbed hem band, traced rows 587-606
    return SHIRT

# His neck is short and thick, mostly inside the hood collar.
# measured: front z=3.02 halfWidth=0.4036 tol=0.30
NECK_LEVELS = [
    (2.950, 0.150, 0.142, "Spine2"),
    (3.010, 0.148, 0.140, "Neck"),
    (3.080, 0.156, 0.148, "Neck"),
]

# The hood: a soft mass draped behind the neck and shoulders.
# not-traceable: the drape reads only in profile (back reach to x 840 at
# z 2.66-2.9); the rings hug the collar and swell rearward.
HOOD_LEVELS = [
    (2.940, 0.190, 0.130, 0.140),
    (2.860, 0.260, 0.180, 0.200),
    (2.760, 0.310, 0.220, 0.250),
    (2.660, 0.300, 0.210, 0.270),
    (2.580, 0.240, 0.160, 0.260),
]


# The buzz: a dark hair band hugging the skull below the cap's back and
# side edges — the turnaround's back and profile views show it at the nape,
# and without it every rear gameplay angle reads bare skull.
# not-traceable: the band hugs the authored skull +0.02; its z range is the
# cap edge (3.32) down to the nape line the back view draws (~3.08).
# Flush to the skull (+0.015 — the first band protruded 0.055 past the head
# curve and read as a square-cornered slab) and its top tucks UNDER the cap
# edge at 3.52 so no skin strip shows between cap and hair from behind.
BUZZ_LEVELS = [
    (3.520, 0.385, 0.385, 0.005),
    (3.420, 0.427, 0.427, 0.010),
    (3.300, 0.431, 0.431, 0.015),
    (3.180, 0.385, 0.385, 0.030),
    (3.080, 0.295, 0.300, 0.060),
    (3.020, 0.240, 0.245, 0.085),
]


def build_buzz(builder: MeshBuilder, detail: int) -> None:
    segments = 16 if detail >= 2 else 8
    ascending = list(reversed(BUZZ_LEVELS))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            x = half_x * cos(theta)
            y = y_centre + half_y * sin(theta)
            if y < y_centre:
                # The whole front is face — bury it against the skull.
                sx = skull_surface_x(y, z)
                y = max(y, -0.10 if sx <= 0.0 else -0.16)
            ring.append(builder.vertex((x, y, z), HAIR, "Head"))
        rows.append(ring)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


def build_hood(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    segments = 12 if detail >= 2 else 8
    ascending = list(reversed(HOOD_LEVELS))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            x = half_x * cos(theta)
            y = y_centre + half_y * sin(theta)
            ring.append(builder.vertex((x, y, z), SHIRT, "Spine2"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), SHIRT, "Spine2")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.02), SHIRT, "Spine2")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 1)
        builder.face((rows[-1][column], rows[-1][nxt], top), 1)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 1)


def build_hoodie_details(builder: MeshBuilder, detail: int) -> None:
    """The kangaroo pocket and the drawstrings."""
    if detail < 1:
        return
    # Pocket: a proud patch on the belly, darker rim rows. The per-row base
    # depths follow the bulk-pass torso (hy 0.414/0.443/0.478 at these z) so
    # the patch stays 0.012-0.02 proud of the deepened surface — the old flat
    # 0.395 base sat up to 0.08 INSIDE the new belly.
    prows = []
    for j, (z, half, base) in enumerate(
            ((1.500, 0.240, 0.418), (1.620, 0.265, 0.436), (1.760, 0.250, 0.486))):
        row = []
        for i in range(4):
            t = i / 3 - 0.5
            x = 2 * t * half
            depth = base + (0.02 if j == 1 else 0.012)
            y = -depth * sqrt(max(0.05, 1.0 - (x / 0.53) ** 2))
            colour = SHIRT_DARK if j != 1 else SHIRT
            row.append(builder.vertex((x, y, z), colour, "Spine"))
        prows.append(row)
    builder.grid(prows, 1, cyclic=False)
    # Drawstrings: two cords that EMERGE from the hood collar roll and lie
    # against the chest — the first build started them 0.066 proud of a bare
    # chest at z 2.815, hanging from nothing, and the 4x crop read them as
    # scratch marks; the second tracked ~0.015 proud with an r 0.028 bulb,
    # and edge-on (x +-0.14) the crimp+bulb read as a dark barnacle sitting
    # on the chest at z 2.3-2.5. Now every spine centre sits ~0.002-0.012
    # PROUD-OF-ZERO on the torso surface (half the tube buried), so the side
    # read is a seam, and the bulb is shrunk to a modest aglet.
    # Traced, front view: cord centres cols ~163/209 vs centre 188 (x +-0.14),
    # cord ~6px wide (r 0.018), tip ending row ~469 (z 2.25). The drawn aglet
    # is ~10px LONG but lies flat on the cloth; r 0.019 keeps it a tick wider
    # than the crimp without the traced length becoming authored proudness.
    # The sheet hangs the cords from the drawn hood edge (row 399, z 2.675);
    # the model's hood front edge IS the collar rim (z 2.995), so they start
    # buried there and keep the traced tip height.
    # (Bulk pass: every y below re-derived against the deepened torso rows so
    # the cords keep riding ~0.002-0.012 proud of the surface, not inside it.)
    for side in (1, -1):
        builder.tube(
            [(side * 0.100, -0.125, 2.950),   # buried in the collar roll
             (side * 0.120, -0.210, 2.790),   # over the roll's base
             (side * 0.132, -0.316, 2.640),   # lying on the chest
             (side * 0.140, -0.371, 2.345),   # the crimp above the tip
             (side * 0.141, -0.376, 2.295)],  # the aglet bulb, on the surface
            [0.016, 0.018, 0.018, 0.014, 0.019], 1, SHIRT_DARK,
            ["Spine2", "Spine2", "Spine2", "Spine1", "Spine1"], 5, flip=side < 0)


# --- Arms: long mustard sleeves on a big build ---------------------------------
SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; sleeve girth bounded off the below-shoulder silhouette (arm runs
# ~0.13 half at z 1.58) and the deltoid kept LOW under a long torso slope
# (Turbo's wedge lesson).
ARM_STATIONS = [
    (0.215, 0.150, SHIRT, "Arm"),
    (0.300, 0.156, SHIRT, "Arm"),
    (0.335, 0.150, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.142, SHIRT, "Arm"),
    (0.560, 0.132, SHIRT, "Arm"),
    (0.720, 0.126, SHIRT, "Arm"),
    (ARM_ELBOW_X, 0.122, SHIRT, "ForeArm"),
    (1.100, 0.118, SHIRT, "ForeArm"),
    (1.240, 0.112, SHIRT, "ForeArm"),
    (1.300, 0.118, SHIRT_DARK, "Hand"),   # ribbed cuff, proud
    (1.340, 0.110, SHIRT_DARK, "Hand"),
    (1.362, 0.090, SHIRT_DARK, "Hand"),
    (1.382, 0.066, SKIN, "Hand"),
    (1.420, 0.070, SKIN, "Hand"),
    (1.470, 0.078, SKIN, "Hand"),   # knuckle line
    (1.515, 0.066, SKIN, "Hand"),
]

MOOSE_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.556,
        finger_root=1.508,
        finger_offsets=((-0.048, 0.0, 0.048), (-0.033, 0.033)),
        finger_lengths=((0.106, 0.120, 0.108), (0.112, 0.117)),
        finger_widths=(0.028, 0.027, 0.022, 0.017),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.394, -0.037, -0.019),
            (1.442, -0.060, -0.031),
            (1.478, -0.073, -0.039),
            (1.498, -0.079, -0.043),
        ),
        thumb_widths=(0.028, 0.026, 0.020, 0.015),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Navy joggers cuffed into the shoes ----------------------------------------
#
# The inseam daylight is TRACED off the front view's between-leg backdrop runs
# (half-gaps): z 1.25 merged (no gap), 1.05 → 0.039, 0.95 → 0.048, 0.85 →
# 0.072, 0.65 → 0.102, 0.50 → 0.120, 0.44 → 0.193. The curve below hits the
# 0.95/0.85 traces exactly (0.049/0.072) and stays a touch shy of the drawn
# flare at the cuffs, which is the safe side of the silhouette gate.
INSEAM_TOP_Z = 1.100
INSEAM_HEM_Z = 0.440
INSEAM_HEM_HALF = 0.150


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 0.75

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# The bulk pass: each radius is the traced outer-leg half-extent minus the
# rig's leg_x(z) (front view, navy runs only — the between-leg gap and the
# hem are separate regions, so these stations are clean of the sleeve merge);
# each depth factor is the traced profile leg span divided by 2*radius
# (profile spans: z 1.25 → 0.745, 1.05 → 0.708, 0.95 → 0.677, 0.824 → 0.683,
# 0.65 → 0.628, 0.50 → 0.535). The old table shipped 0.68x the drawn per-leg
# width and 0.59-0.61x the drawn depth.
# measured: front z=0.95 halfWidth=0.6295 tol=0.08
# measured: front z=1.05 halfWidth=0.6295 tol=0.08
# measured: front z=0.65 halfWidth=0.6536 tol=0.08
# measured: view2 z=1.05 halfWidth=0.3631 tol=0.06
# measured: view2 z=0.65 halfWidth=0.3200 tol=0.06
LEG_STATIONS = [
    (1.480, 0.375, 1.00, PANTS, "UpLeg"),   # thigh — tapered from the 1.25 trace so
    (1.250, 0.373, 1.00, PANTS, "UpLeg"),   # the top ring stays put in motion; the
                                            # drawn thigh bulges OUTBOARD of the hem
    (1.050, 0.364, 0.97, PANTS, "Leg"),
    (0.950, 0.354, 0.96, PANTS, "Leg"),     # the cited row: 0.277 + 0.354 = 0.631
    (0.850, 0.351, 0.97, PANTS, "Leg"),
    (0.650, 0.335, 0.94, PANTS, "Leg"),
    (0.500, 0.296, 0.90, PANTS, "Leg"),
    (0.455, 0.290, 0.92, PANTS, "Leg"),
    (0.442, 0.296, 0.93, PANTS_DARK, "Leg"),          # crisp colour edge onto the cuff
    (0.428, 0.300, 0.93, PANTS_DARK, "Leg"),          # bunched elastic cuff — traced
                                            # per-leg width 0.4337 at z 0.44
    (0.398, 0.288, 0.92, PANTS_DARK, "Foot"),         # proud of the leg
    # The sheet cuffs the joggers INTO the shoes — front col 120: navy jogger
    # to row 776 (z 0.404) meeting the shoe's cream collar directly, no skin.
    # The authored shoe's topline is SHOE_FLOOR + (0.290 - SHOE_FLOOR) * 1.28
    # = z 0.3695, so the cuff rolls proud just above it and tucks in under it;
    # the old table went SKIN at 0.300/0.150 and shipped a bare ankle ring.
    (0.376, 0.180, 0.98, PANTS_DARK, "Foot"),         # roll over the shoe topline
    (0.354, 0.120, 1.00, PANTS_DARK, "Foot"),         # tucks inside the collar
    (0.150, 0.092, 0.95, PANTS_DARK, "Foot"),         # fabric on into the shoe
]

MOOSE_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Navy-panelled low-top with cream cupsole, toe bumper and laces, at Moose
# width.
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


SHOE_LENGTH_SCALE = 1.04
SHOE_WIDTH_SCALE = 1.04
SHOE_HEIGHT_SCALE = 1.28

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Mostly cream: the classifier pair is 83.1/13.7 cream/navy.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.550, "quarter"),
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


MOOSE_SHOE = ShoeSpec(
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
    build_buzz(builder, detail)
    build_hood(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    torso_segments = 22 if detail >= 2 else segments
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
                 color_fn=hoodie_color)
    build_hoodie_details(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=MOOSE_ARM)
        build_leg(builder, side, detail, spec=MOOSE_LEG)
        build_shoe(builder, side, detail, spec=MOOSE_SHOE,
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
    obj["recessReference"] = "moose-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_moose_LOD0", "kid_moose_LOD1", "kid_moose_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_moose_LOD0": (20, 12, 2),
        "kid_moose_LOD1": (8, 4, 1),
        "kid_moose_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "moose")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Moose reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against moose-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cap's front panel.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- moose\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_moose_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
