"""Rebuild Guri Sandhu (the `big_lou` slot) as a reference-authored character.

Run from the repository root:
  blender --background assets/v2/source/guri-pilot.blend \
    --python scripts/v2/blender/sculpt-guri-source.py

★ GURI IS THE FIRST PATKA. The cloth is one close shell on the hair slot,
covering all of his hair from the hairline round to the nape and leaving both
ears clear, with the topknot gathered high on the crown as its own small
rounded mass. It replaces the previous kid's buzz shell.

His body is the slot's previous one (Big Lou's), and the sheet draws the same
outfit — gold and cream striped tee over a round belly, navy shorts, white
socks, navy sneakers — so those tables carry over and are re-cited against
his own sheet. The skull is his: smaller than Lou's, because the sheet's head
ends at the dome's top and the knot stands above it.

The conversion: front figure 787px over 4.0ft → 1px = 0.005083ft (knot top
row 123, soles row 910). The profile faces +x. Head band: knot top row 123
(z 4.00) to the neck pinch (z 2.86).
"""

from __future__ import annotations

from math import atan2, cos, degrees, pi, sin, sqrt
from pathlib import Path
import sys

import bpy

# ⚠️ Blender runs a --python script by PATH and does not put its directory on
# sys.path, so the package beside this file is unimportable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sculptlib.reference_hands import migrate as migrate_reference_hands
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
OUTPUT = REPO / "assets/v2/source/guri-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/guri-face-atlas.png"
REVISION = "guri-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet samples (5x5 means): patka #324072, knot #2B376E; lit cheek #CF7244,
# shaded arm #AD5A2A; tee gold #F5A410 over cream #FBE3C8; near-black navy
# shorts; sock #EDDFD6.
SKIN = rgba("C46A3A")
SKIN_SHADOW = rgba("8E4822")
HAIR = rgba("2F3F7C")        # the patka's navy — on the hair slot, his own colour
HAIR_DARK = rgba("1F2B5A")   # the cloth's folds and the knot's underside
GOLD = rgba("F29A00")        # tee stripe gold
CREAM = rgba("FBE8CE")       # tee stripe cream
SHORTS = rgba("343C5E")
SHORTS_DARK = rgba("232A44")
SOCK = rgba("FFF6E4")
SHOE = rgba("38405C")        # navy upper
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
# Features, bounded luminance traces on the front view: brow bands rows
# 222-228 (centre 225, z 3.48), eyes rows 249-273 (centre 262, z 3.29), the
# closed smile at row 309 (z 3.05); chin about row 347 (z 2.86).
# The skull is sized to the SHEET'S HEAD, not solved through the island: the
# dome's top is z 3.83 with the cloth on (so the skull's is 3.80) and the chin
# is 2.85 (the head-height metric read 26.2% against the sheet's 29.1 with a
# 2.92 chin), which fixes centre 3.315 and vertical radius 0.485. His features sit
# lower on that head than the slot's previous kid's did, so the face marks
# moved instead (`face-specs.mjs`: brow cell 35, eye 58, mouth 91).
# measured: front z=3.45 halfWidth=0.407 tol=0.04
HEAD_CENTER = (0.0, -0.020, 3.315)
HEAD_RADII = (0.385, 0.450, 0.485)

# ★ A PEAR, NOT A BALL. Row-scanned against the sheet at matched figure
# height: the drawn cranium runs straight-sided at 0.21 of the figure from
# the crown to the ear tops, the ears jut out below it and the jowls are the
# widest flesh — measured 0.207 of the figure at 22%, which the old table
# already exceeded (0.232), so the jowls are NOT widened. The old table (1.00-1.04 above the cheeks) made the temples
# 0.26 of the figure, 20% wide, and head aspect read 1.17 against 1.06 once
# the buzz stopped inflating the height. The buzz's own citation said so:
# 0.4213 at z 3.65, where the unscaled skull alone is 0.45.
FACE_SCALE = (
    (1.00, 1.00),
    (0.60, 1.00),
    (0.30, 1.02),
    (0.05, 1.03),
    (-0.30, 1.05),    # full cheeks: the sheet's skin runs 0.40-0.43 half at z 3.1-3.2
    (-0.60, 1.04),
    (-1.00, 1.00),
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
    # Broad and soft: the sheet's nose is as wide as the gap between the
    # eyes. The old 0.19-wide, 0.080-deep dome read as a small point.
    if abs(nx) > 0.24:
        return 0.0
    dz = nz + 0.260
    if dz < -0.12 or dz > 0.14:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.24) ** 2)
    bridge = 0.006 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.150 if dz >= 0.0 else 0.120
    t = dz / reach
    tip = 0.110 * across ** 0.9 * max(0.0, 1.0 - t * t) ** 1.0
    return bridge + tip


# His ears stand clear below the cloth's edge: the front view's widest rows
# are 276-296 (centre row 286, z 3.17), wider than the patka above them.
# measured: front z=3.17 halfWidth=0.463 tol=0.04
EAR_SPEC = EarSpec(center=(0.020, 3.170), radii=(0.1000, 0.1250))

# The island is the slot's own; the face marks were re-anchored to it above.
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


# --- The patka -----------------------------------------------------------------
#
# The cloth as a close shell 0.03 over the skull: a dome from the front view's
# own half-widths, its front edge one clean arch just above the brows that
# runs over the ear tops and drops behind them to the nape. The opening is cut
# by SNAPPING every vertex inside it onto the rim (Fatou's hijab pattern), so
# the edge is a line the table draws and not a per-vertex stair.
# (z, half-width, half-depth, y-centre) — strictly descending in z.
# measured: front z=3.45 halfWidth=0.407
# measured: front z=3.68 halfWidth=0.320
PATKA_LEVELS = [
    (3.825, 0.107, 0.118, 0.012),   # a rounding row under the apex (no cone point)
    (3.790, 0.192, 0.211, 0.012),
    (3.740, 0.263, 0.289, 0.012),
    (3.680, 0.320, 0.351, 0.012),
    (3.620, 0.359, 0.394, 0.012),
    (3.560, 0.387, 0.424, 0.014),
    (3.500, 0.404, 0.443, 0.016),
    (3.450, 0.407, 0.452, 0.018),
    (3.400, 0.414, 0.458, 0.018),
    (3.340, 0.424, 0.458, 0.018),
    (3.290, 0.422, 0.452, 0.016),
    (3.240, 0.416, 0.440, 0.014),
    (3.180, 0.402, 0.420, 0.012),
    (3.110, 0.378, 0.390, 0.010),
    (3.040, 0.340, 0.345, 0.008),
    (2.970, 0.285, 0.285, 0.006),
]

# The opening's rim: its height by the angle off straight-ahead, in degrees.
# Above the brows across the forehead, over the ear top at the side, then down
# behind the ear to the nape, where the cloth runs to the bottom row.
# not-traceable: an edge inside the silhouette — no view's outline carries it.
# Read off the front view (cloth edge at sheet row 214 on the centreline,
# z 3.54; row 240 at the temple, z 3.41) and the profile (over the ear top at
# z 3.31, behind the ear to the nape by z 3.00).
# ★ THE EDGE SWEEPS DOWN THE TEMPLE to a point in front of each ear and only
# then rises over it. A shallow arc that stopped above the ears left both
# temples bare (two critics; visible face 25% of head width a side against
# the sheet's 16%).
PATKA_RIM = [
    (0.0, 3.585),
    (22.0, 3.575),
    (40.0, 3.500),
    (54.0, 3.345),
    (66.0, 3.215),     # the point in front of the ear
    (78.0, 3.250),
    (90.0, 3.320),     # up and over the ear's top
    (104.0, 3.300),
    (118.0, 3.160),
    (132.0, 2.990),
    (140.0, 2.900),
    (180.0, 2.900),
]

# The topknot (joora): a small rounded mass gathered high on the crown, a touch
# behind the head's axis as the profile draws it. A lathe up a vertical spine.
# measured: front z=3.89 halfWidth=0.163 tol=0.03
KNOT_SPINE = [
    (0.000, 0.080, 3.790),
    (0.000, 0.080, 3.840),
    (0.000, 0.080, 3.890),
    (0.000, 0.080, 3.940),
    (0.000, 0.080, 3.980),
    (0.000, 0.080, 4.000),
]
KNOT_RADII = [0.095, 0.148, 0.165, 0.150, 0.095, 0.020]


def patka_rim_z(off_front_deg: float) -> float:
    table = PATKA_RIM
    for (a0, z0), (a1, z1) in zip(table, table[1:]):
        if off_front_deg <= a1:
            return z0 + (z1 - z0) * (off_front_deg - a0) / (a1 - a0)
    return table[-1][1]


def patka_half_at(z: float):
    table = PATKA_LEVELS
    if z >= table[0][0]:
        return table[0][1:]
    for (za, *a), (zb, *b) in zip(table, table[1:]):
        if zb <= z <= za:
            t = (za - z) / (za - zb)
            return tuple(u + t * (v - u) for u, v in zip(a, b))
    return table[-1][1:]


def build_patka(builder: MeshBuilder, detail: int) -> None:
    assert all(a[0] > b[0] for a, b in zip(PATKA_LEVELS, PATKA_LEVELS[1:])), \
        "PATKA_LEVELS must be strictly descending in z"
    # Even counts: the forehead columns must mirror.
    segments = 16 if detail >= 2 else (10 if detail == 1 else 6)
    use = PATKA_LEVELS if detail >= 2 else thin_for_lod(list(PATKA_LEVELS), detail)
    ascending = list(reversed(use))
    rows, snaps = [], []
    for z, half_x, half_y, y_centre in ascending:
        ring, snapped = [], []
        for column in range(segments):
            theta = 2 * pi * (column + 0.5) / segments
            # Degrees off straight-ahead (-y is forward).
            off_front = abs(degrees(atan2(cos(theta), -sin(theta))))
            rim = patka_rim_z(off_front)
            inside = z < rim
            zz = rim if inside else z
            hx, hy, yc = patka_half_at(zz) if inside else (half_x, half_y, y_centre)
            x = hx * cos(theta)
            y = yc + hy * sin(theta)
            if y < yc:
                sf = skull_front_y(x, zz)
                if sf > -9.0:
                    y = min(y, sf - 0.014)   # the cloth lies ON the forehead, proud
            ring.append(builder.vertex((x, y, zz), HAIR_DARK if inside else HAIR, "Head"))
            snapped.append(inside)
        rows.append(ring)
        snaps.append(snapped)
    bottom = builder.vertex((0.0, ascending[0][3] + 0.10, ascending[0][0] - 0.02), HAIR_DARK, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.012), HAIR, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        if not (snaps[0][column] and snaps[0][nxt]):
            builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for (lower, ls), (upper, us) in zip(zip(rows, snaps), zip(rows[1:], snaps[1:])):
        for column in range(segments):
            nxt = (column + 1) % segments
            if ls[column] and ls[nxt] and us[nxt] and us[column]:
                continue   # wholly inside the opening: collapsed onto the rim
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)

    knot_sides = 8 if detail >= 2 else (6 if detail == 1 else 4)
    spine = KNOT_SPINE if detail >= 1 else KNOT_SPINE[::2] + [KNOT_SPINE[-1]]
    radii = KNOT_RADII if detail >= 1 else KNOT_RADII[::2] + [KNOT_RADII[-1]]
    builder.tube(spine, radii, 2, HAIR, "Head", knot_sides)


# --- The striped tee: a straight, stocky trunk ---------------------------------
#
# Guri is solid, not round: the sheet's tee runs nearly straight from the
# armpit to a hem at z 1.67, 1.02ft wide at the hem against 0.83 across the
# chest between the sleeves. (z, half-width, half-depth, bone) ascending.
# not-traceable: the hanging arms cover the trunk's flanks in every view
# (the hem run at z 1.70 reads sleeve|tee|sleeve as one 1.02ft run), so the
# halves are bounded by that run above and the chest gap between the sleeves.
TORSO_LEVELS = [
    (1.660, 0.468, 0.398, "Hips"),    # hem, a touch tucked
    (1.690, 0.502, 0.428, "Hips"),
    (1.800, 0.512, 0.440, "Spine"),
    (2.000, 0.508, 0.436, "Spine"),
    (2.200, 0.490, 0.416, "Spine1"),
    (2.400, 0.462, 0.386, "Spine2"),  # shoulder rows widened past the arm
    (2.560, 0.425, 0.350, "Spine2"),  # root (Turbo's wedge fix)
    (2.660, 0.380, 0.318, "Spine2"),
    (2.730, 0.325, 0.284, "Spine2"),
    (2.775, 0.285, 0.258, "Spine2"),
    (2.800, 0.262, 0.240, "Spine2"),  # cream neckband, proud
    (2.825, 0.246, 0.226, "Spine2"),  # collar — OUTSIDE the neck loft
]

# Ascending (lo, hi) gold bands; everything else is cream.
# not-traceable: the stripe rows are colour, not silhouette — the gate cannot
# re-derive a colour edge. Traced by hand down the front view's centre column:
# three gold bands at sheet rows 396-434, 462-501 and 531-566 on a cream
# ground, a cream neckband above and a cream hem below (2026-11-14).
STRIPE_BANDS = [
    (1.750, 1.925),
    (2.080, 2.275),
    (2.420, 2.614),
]


def tee_color(theta: float, z: float):
    for lo, hi in STRIPE_BANDS:
        if lo <= z <= hi:
            return GOLD
    return CREAM


# A mild forward push (negative y) per z: a soft tummy, no more.
# not-traceable: read off the profile view, whose tee front runs ~0.05 proud
# of the chest plane at z 1.8-2.0 and returns to it at the armpit.
BELLY_PUSH = [
    (1.660, -0.030),
    (1.800, -0.050),
    (2.000, -0.045),
    (2.200, -0.020),
    (2.400, 0.000),
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
    # The collar's top fan rises into the jaw so the neckline is a shallow
    # cone under the chin, not a flat shelf.
    top = builder.vertex((0.0, 0.0, levels[-1][0] + 0.045), CREAM, levels[-1][3])
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


# A short visible neck between the collar and the jaw.
# not-traceable: the jaw's shadow covers the neck's flanks on the front view;
# halves bounded by the visible sliver under the chin (~0.30 across).
NECK_LEVELS = [
    (2.740, 0.150, 0.140, "Spine2"),
    (2.810, 0.150, 0.140, "Neck"),
    (2.890, 0.160, 0.150, "Neck"),
    (2.970, 0.176, 0.166, "Neck"),
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
    (0.215, 0.186, CREAM, "Arm"),
    (0.246, 0.186, CREAM, "Arm"),
    (0.300, 0.188, CREAM, "Arm"),
    (0.335, 0.188, GOLD, "Arm"),      # the sleeve's gold band
    (0.370, 0.186, GOLD, "Arm"),
    (ARM_SHOULDER_X, 0.184, GOLD, "Arm"),
    (0.520, 0.182, CREAM, "Arm"),
    (SLEEVE_HEM_X - 0.020, 0.182, GOLD, "Arm"),
    (SLEEVE_HEM_X, 0.180, GOLD, "Arm"),
    (SLEEVE_HEM_X + 0.030, 0.166, SKIN, "Arm"),   # the chunky bare arm
    (0.780, 0.162, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.154, SKIN, "ForeArm"),
    (1.150, 0.144, SKIN, "ForeArm"),
    (1.300, 0.136, SKIN, "Hand"),
    (1.400, 0.120, SKIN, "Hand"),
    (1.460, 0.128, SKIN, "Hand"),   # knuckle line
    (1.512, 0.102, SKIN, "Hand"),
]

GURI_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
    elbow=0.06,  # the crease and knob a bent arm shows: see ArmSpec.elbow
    underarm_shade=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.552,
        finger_root=1.502,
        finger_offsets=((-0.048, 0.0, 0.048), (-0.032, 0.032)),
        finger_lengths=((0.098, 0.112, 0.100), (0.104, 0.109)),
        finger_widths=(0.042, 0.041, 0.034, 0.026),
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
INSEAM_TOP_Z = 1.340
INSEAM_HEM_Z = 1.180
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
    (1.700, 0.262, 1.08, SHORTS, "UpLeg"),
    (1.560, 0.266, 1.07, SHORTS, "UpLeg"),
    (1.420, 0.290, 1.05, SHORTS, "UpLeg"),
    (1.300, 0.304, 1.03, SHORTS, "UpLeg"),
    (1.215, 0.312, 1.02, SHORTS_DARK, "UpLeg"),   # hem lip
    (1.175, 0.282, 1.00, SKIN, "UpLeg"),          # the sturdy bare leg: the
    (1.030, 0.274, 1.00, SKIN, "UpLeg"),          # sheet's thighs touch
    (0.900, 0.262, 1.00, SKIN, "Leg"),
    (0.760, 0.250, 1.00, SKIN, "Leg"),
    (0.625, 0.238, 1.00, SKIN, "Leg"),
    # ⚠️ The leg builder emits a slot-3 face only when BOTH rows of a pair
    # carry the team_mask colour — a single accent ring emits nothing and
    # the accent gate fires (the M_Accessory-dropped class).
    (0.600, 0.246, 1.00, TEAM_MASK, "Leg"),       # sock roll-top — THE accent
    (0.584, 0.244, 1.00, TEAM_MASK, "Leg"),
    (0.568, 0.240, 1.00, SOCK, "Leg"),
    (0.480, 0.228, 1.00, SOCK, "Leg"),
    (0.400, 0.212, 1.00, SOCK, "Foot"),
    (0.300, 0.172, 0.98, SOCK, "Foot"),
    (0.180, 0.158, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations.
CROTCH_LEVELS = [
    (1.320, 0.200, 0.240, "Hips"),
    (1.480, 0.240, 0.290, "Hips"),
    (1.680, 0.270, 0.330, "Hips"),
]

GURI_LEG = LegSpec(
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


GURI_SHOE = ShoeSpec(
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
    toe_point=(-0.452, 0.150),   # a blunt nose at mid-height: low and far out, the end fan made a beak
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

    build_patka(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, SHORTS, 8 if detail >= 2 else 6)
    build_belly_torso(builder,
                      TORSO_LEVELS_CRISP if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                      16 if detail >= 2 else segments)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=GURI_ARM)
        build_leg(builder, side, detail, spec=GURI_LEG)
        build_shoe(builder, side, detail, spec=GURI_SHOE,
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
    obj["recessReference"] = "guri-turnaround.png"
    return obj


# not-traceable: authored grip proportions on the canonical knuckles; retain
# Lou's wider finger pads while giving the distal joint room to curl.
REFERENCE_HAND_SHAPE = dict(
    finger_offsets=(-.024, .032, .088),
    finger_lengths=(.16, .17, .15),
    finger_widths=(.030, .029, .026, .019),
    thumb_widths=(.035, .037, .030, .019),
)


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
    migrate_reference_hands(shape=REFERENCE_HAND_SHAPE, underlayer_clearance=False, fresh_meshes=True)

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
        "Guri Sandhu reference-authored production source (slot: big_lou)\n\n"
        "The three LOD meshes were rebuilt against guri-turnaround.png; they are not proxy deformations.\n"
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
