"""Rebuild The Professor as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/the-professor-pilot.blend \
    --python scripts/v2/blender/sculpt-the-professor-source.py

★ THE PROFESSOR IS THE FIRST OPEN JACKET — a partial ring shell proud of the
tee, swept from one front edge around the back to the other, with fold-back
front edges (Penny's over-garment-is-geometry lesson; a colour wedge would
smear and tear). His glasses are Bendy's construction at the second-biggest
radius on the roster, and his swept fringe is mildly asymmetric like the
sheet draws it.

The conversion: front figure 671px over 4.0ft → 1px = 0.005961ft. The profile
faces +x. Head band: hair top row 100 (z 3.99) to neck pinch row 316 (z 2.71).
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
OUTPUT = REPO / "assets/v2/source/the-professor-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/the-professor-face-atlas.png"
REVISION = "the-professor-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: brown jacket #6C4323 (42% of the sheet) over a cream tee in
# the backdrop's own cluster, near-black hair #1B0D03, denim #344A64, grey
# shoe #848C9B. Ramp-authored.
SKIN = rgba("FFB472")
SKIN_SHADOW = rgba("D08540")
HAIR = rgba("2A1808")        # near-black swept hair
SHIRT = rgba("FFF2DC")       # the cream tee under the jacket
SHIRT_DARK = rgba("E8D8BC")  # the tee's shaded lane
PANTS = rgba("3E5C7A")       # denim jeans
PANTS_DARK = rgba("2C4258")
SOCK = rgba("FFF6E6")        # unused — the rolls meet the shoes
SHOE = rgba("9A7C5C")        # warm taupe canvas upper — the classifier
                             # pair is cream + #7c634b; a cool grey never
                             # matches either tone
WHITE = rgba("FFF2D8")       # cream cupsole
SOLE = rgba("F8E6C4")        # cream toe bumper, laces
# The team accent is the ROLLED DENIM CUFF (the Noodle/Penny convention — no
# socks anywhere on the sheet).
TEAM_MASK = rgba("D8D2C6")
JACKET = rgba("8A5A2E")      # the brown jacket — chroma up over #6c4323
JACKET_DARK = rgba("66401B") # ribbed hem/cuffs and collar — deepened from
                             # 6E4620 (ΔLum 21 → 28 against JACKET; Dex's
                             # cuffs measured ΔLum 21 as invisible under the
                             # board ramp, ~28 delivered-legible)
ZIP = rgba("C0B9AE")         # the metal zipper tape — the sheet draws silver
                             # teeth down both front edges; grey so it reads
                             # against both the brown shell and the cream tee
GLASSES = rgba("241A12")     # the wire frames

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: thick brows rows 190-201 (44.4% of the 3.99→2.71
# head, z 3.42 — the left one merges with the swept fringe), the big lens
# rings rows 210-252 centred row 231 (60.6%, z 3.21 — the eye line, Bendy's
# precedent), nose rows 253-267, the open eager smile rows 283-290 (87.2%,
# z 2.87). The swept hair owns the widest row; the big ears are placed by
# eye at z 3.10.
HEAD_CENTER = (0.0, -0.020, 3.160)
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
    """The glasses carry the eye read — a gentle dish."""
    dz = nz - 0.114
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.056 + (dz * dz) / 0.023
    if radial >= 1.0:
        return 0.0
    return 0.010 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small button between the lenses and the smile (centre nz -0.36)."""
    if abs(nx) > 0.16:
        return 0.0
    dz = nz + 0.360
    if dz < -0.10 or dz > 0.11:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.16) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.090 if dz >= 0.0 else 0.100
    t = dz / reach
    tip = 0.082 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Big ears just below the lens line.
EAR_SPEC = EarSpec(center=(0.020, 3.100), radii=(0.1700, 0.1850))

# Island solved for his span: brow anchor 21 lands z 3.425 (44.2% of the
# 3.99→2.71 head against the traced 44.4), eye anchor 50 lands z 3.214 (60.6
# vs 60.6), mouth anchor 91 lands z 2.876 (87.1 vs 87.2). The spec REFUSES
# brow and eye — the fringe and frames merge them; the rows above are
# bounded traces.
FACE_ISLAND = (0.92, -1.3138, 2.300)

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


# --- The swept hair ------------------------------------------------------------
#
# A short side-swept mass: the fringe rides lower on one side, as the sheet
# draws it — MILDLY, because faceAsymmetry tolerates 4 points.
# measured: front z=3.50 halfWidth=0.6498
# measured: front z=3.90 halfWidth=0.3308 tol=0.08
SWEEP_LEVELS = [
    (3.900, 0.190, 0.200, 0.000),
    (3.820, 0.330, 0.350, 0.000),
    (3.720, 0.470, 0.470, 0.010),
    (3.600, 0.590, 0.545, 0.020),
    (3.480, 0.635, 0.560, 0.030),
    (3.360, 0.610, 0.530, 0.040),
    (3.240, 0.560, 0.480, 0.060),
    (3.120, 0.470, 0.420, 0.090),
    (3.000, 0.370, 0.350, 0.120),
    (2.900, 0.280, 0.270, 0.160),
]

SWEEP_FRINGE = [
    (0.00, 3.470),
    (0.20, 3.440),
    (0.28, 3.300),
    (0.35, 3.050),
    (0.43, 2.920),
]

SWEEP_OPEN_BOTTOM = 2.850
SWEEP_BIAS = 0.085   # the sweep side rides this much lower on +x


def fringe_z_at(x_signed: float) -> float:
    """The sweep's open-face edge — biased: lower on the +x side."""
    x_abs = abs(x_signed)
    table = SWEEP_FRINGE
    base = table[-1][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            base = z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
            break
    else:
        if x_abs <= table[0][0]:
            base = table[0][1]
    if x_abs <= table[0][0]:
        base = table[0][1]
    return base - (SWEEP_BIAS if x_signed > 0 else 0.0)


def ring_loft_sweep(builder: MeshBuilder, levels, detail: int) -> None:
    """The ring-loft-with-tuck, swept."""
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the runtime lights the mass as a slate-grey void.
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_sweep levels must be strictly descending in z"
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
                if SWEEP_OPEN_BOTTOM < z < fringe_z_at(x):
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


# --- The glasses ---------------------------------------------------------------
GLASSES_Z = 3.210
GLASSES_LENS_X = 0.175
GLASSES_RADIUS = 0.125
GLASSES_WIRE = 0.015


def build_glasses(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    face_y = skull_front_y(GLASSES_LENS_X, GLASSES_Z)
    plane_y = (face_y if face_y > -9.0 else -0.40) - 0.024
    sides = 12 if detail >= 2 else 8
    for side in (1, -1):
        spine = []
        for i in range(sides):
            a = 2 * pi * i / sides
            spine.append((side * GLASSES_LENS_X + GLASSES_RADIUS * cos(a),
                          plane_y,
                          GLASSES_Z + GLASSES_RADIUS * sin(a)))
        # ⚠️ Material 2 (the hair slot), NEVER 3: M_Accessory is team-tinted.
        builder.tube(spine, [GLASSES_WIRE] * sides, 2, GLASSES, "Head", 5,
                     cyclic=True, axis=Vector((0.0, 1.0, 0.0)), flip=side < 0)
        outer_x = side * (GLASSES_LENS_X + GLASSES_RADIUS)
        builder.tube(
            [(outer_x, plane_y + 0.026, GLASSES_Z + 0.02),
             (side * 0.410, plane_y + 0.19, GLASSES_Z - 0.020),
             (side * 0.452, plane_y + 0.38, GLASSES_Z - 0.075)],
            [GLASSES_WIRE, GLASSES_WIRE * 0.9, GLASSES_WIRE * 0.7],
            2, GLASSES, "Head", 4, flip=side < 0)
    builder.tube(
        [(-GLASSES_LENS_X + GLASSES_RADIUS - 0.01, plane_y, GLASSES_Z + 0.02),
         (0.0, plane_y - 0.006, GLASSES_Z + 0.030),
         (GLASSES_LENS_X - GLASSES_RADIUS + 0.01, plane_y, GLASSES_Z + 0.02)],
        [GLASSES_WIRE, GLASSES_WIRE, GLASSES_WIRE],
        2, GLASSES, "Head", 4)


# --- The tee (the torso loft) and the open jacket shell ------------------------
#
# The torso loft is the CREAM TEE; the jacket is a proud partial ring shell
# swept from one front edge around the back to the other (Penny's
# over-garment-is-geometry lesson), with fold-back front edges so the rim
# reads as cloth, not paper.
# not-traceable: the tee shows only as the centre strip between the jacket
# fronts (cream run 213-253 at z 1.6-2.35); the torso halves are bounded off
# the jacket silhouette minus its shell.
TORSO_LEVELS = [
    (1.400, 0.320, 0.272, "Hips"),    # jeans waist under the jacket
    (1.498, 0.317, 0.271, "Hips"),    # jeans-waist ring pair — TEE_HEM_Z
    (1.512, 0.316, 0.270, "Hips"),    #   between them, crisp (Zippy's hem)
    (1.560, 0.315, 0.270, "Spine"),
    (1.760, 0.305, 0.262, "Spine"),
    (1.960, 0.295, 0.255, "Spine1"),
    (2.160, 0.288, 0.246, "Spine1"),
    (2.320, 0.280, 0.235, "Spine2"),
    (2.420, 0.258, 0.215, "Spine2"),
    (2.490, 0.215, 0.185, "Spine2"),
    (2.545, 0.165, 0.148, "Spine2"),
    (2.575, 0.148, 0.136, "Spine2"),  # collar rib
    (2.605, 0.132, 0.122, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

# The tee loft's colour: cream tee above the jeans waist, denim below — the
# old all-cream loft showed a cream sliver under the cropped jacket where the
# sheet draws the jeans rising to its hem (the switch sits ABOVE the shell's
# 1.482 bottom edge so no cream survives below the band, and at the drawn
# jeans waist in the open-front gap, z ~1.51).
TEE_HEM_Z = 1.505   # inside the 1.498/1.512 pair


def tee_color(theta: float, z: float):
    return PANTS if z < TEE_HEM_Z else SHIRT


# ★ THE HEM-SWEEP REBUILD: the old table's widest rows were its bottom two
# (0.352/0.358 at 1.440/1.500), so the shell FLARED downward into the
# "labcoat cone" the critic named, and its "ribbed hem" was one slightly-
# proud colour row. The sheet draws a cropped bomber: a ribbed waistband
# that CINCHES under a fuller body, plus a back yoke seam. Traced on the
# front view: the shell's brown ends at z 1.48 (jeans below), the band-top
# terminator seam sits at z 1.60-1.62 (dark rows 46230d/542f16 at cols ±55),
# band height 0.13ft; the profile depth cinches 0.407 → 0.310 through the
# band. The back yoke seam is a dark row at z 2.33 on BOTH back columns
# (51280f at dx +45, 522e19 at dx -45) — a colour-on-ring pair, back arc
# only. Ring pairs at both band edges; the body drape ring stands PROUD of
# the cinched band top (crisp + proud is a constructed garment — Penny/Dex).
# not-traceable: the shell hugs the tee +0.026; its silhouette IS the traced
# figure at torso rows (front z=1.66 halfWidth=0.7064 includes the arms).
JACKET_LEVELS = [
    (1.482, 0.334, 0.286),    # rib band bottom edge — brown ends z 1.48
    (1.512, 0.342, 0.292),    # band bottom roll, proud lip
    (1.600, 0.330, 0.282),    # band top ring — the CINCH
    (1.612, 0.344, 0.296),    # body drape ring, PROUD +0.014 — the blouson
    (1.700, 0.347, 0.299),    # body fullness the band gathers under
    (1.860, 0.336, 0.291),
    (2.060, 0.324, 0.280),
    (2.240, 0.315, 0.268),
    (2.325, 0.309, 0.261),    # yoke seam pair — the dark row lands between
    (2.340, 0.307, 0.259),    #   them, back arc only (traced z 2.33)
    (2.380, 0.300, 0.252),
    (2.470, 0.262, 0.222),
    (2.545, 0.205, 0.180),
    (2.600, 0.175, 0.158),    # the collar line
]

JACKET_GAP = 0.55   # radians of front opening either side of centre-front

JACKET_BAND_TOP = 1.606          # inside the 1.600/1.612 pair
JACKET_YOKE = (2.322, 2.343)     # the seam row rides the 2.325/2.340 pair


def jacket_shell_color(theta: float, z: float):
    """Ribbed band and collar dark; the yoke seam dark on the BACK arc only
    (the front panels carry no seam on the sheet)."""
    if z < JACKET_BAND_TOP or z > 2.58:
        return JACKET_DARK
    if JACKET_YOKE[0] <= z <= JACKET_YOKE[1] and sin(theta) > 0.35:
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
        bone = "Hips" if z < 1.7 else ("Spine" if z < 2.1 else "Spine2")
        row = []
        # Fold-back inner vertex at the leading front edge.
        t0 = start
        row.append(builder.vertex((hx * cos(t0) * 0.93, hy * sin(t0) * 0.93, z),
                                  jacket_shell_color(t0, z), bone))
        for i in range(cols):
            t = start + sweep * i / (cols - 1)
            row.append(builder.vertex((hx * cos(t), hy * sin(t), z),
                                      jacket_shell_color(t, z), bone))
        t1 = start + sweep
        row.append(builder.vertex((hx * cos(t1) * 0.93, hy * sin(t1) * 0.93, z),
                                  jacket_shell_color(t1, z), bone))
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
    """(half-width, half-depth) of the jacket shell at height z (Ace)."""
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
    positive), pushed along the ellipse's outward normal (Ace)."""
    hx, hy = jacket_ring_at(z)
    theta = 1.5 * pi + a
    x, y = hx * cos(theta), hy * sin(theta)
    nx, ny = cos(theta) / hx, sin(theta) / hy
    norm = sqrt(nx * nx + ny * ny)
    return (x + proud * nx / norm, y + proud * ny / norm, z)


# --- Jacket construction: zipper tapes, slider, buttoned flap pockets ----------
#
# The sheet's jacket zips: silver teeth tapes run BOTH front edges collar to
# hem, the slider hangs at the bottom of the +x tape, and each panel carries
# a large patch pocket under a buttoned flap. Bevelled proud patches are
# batch 7's construction (a rim row proud of its panel reads as sewn); Dex's
# pull tab is the sweep's slider exemplar, and the buttons are TRANSLATED
# copies, never mirrors (Penny's 13 inverted button pairs).
# measured: front — flap top z 1.967, pocket bottom z 1.627, button z 1.90;
#   drawn at |x| 0.20-0.44 on the flared OPEN panels, authored at the same
#   panel fraction of the closed shell (bearings 0.78-1.12 rad) — recorded
#   deviation, the open-jacket drape has no shell x (Ace's welt precedent)
ZIP_TAPE_Z = (1.500, 1.630, 1.780, 1.950, 2.120, 2.290, 2.450, 2.560)


def build_jacket_details(builder: MeshBuilder, detail: int) -> None:
    if detail < 2:
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
    # The slider at the base of the +x tape: Dex's two stacked patches — a
    # base step, and a raised face with a dark hinge-shadow top row.
    for a0, a1, z0, z1, pr, top_colour in (
        (0.470, 0.640, 1.502, 1.578, 0.030, ZIP),
        (0.500, 0.610, 1.512, 1.564, 0.044, JACKET_DARK),
    ):
        rows = []
        for j, z in enumerate((z0, z1)):
            colour = top_colour if j == 1 else ZIP
            rows.append([builder.vertex(jacket_surface_point(a, z, pr), colour, "Hips")
                         for a in (a0, (a0 + a1) / 2, a1)])
        builder.grid(rows, 1, cyclic=False)
    # The flap pockets: a bevelled patch pocket on each panel, its top row
    # dark (the slit shadow), under a prouder flap; a silver button rides
    # each flap. Grids flip on the -x side; the button ellipsoids are
    # translated copies sharing one winding.
    for side in (1, -1):
        body_rows = []
        for z, pr in ((1.640, 0.005), (1.660, 0.016), (1.870, 0.016), (1.888, 0.006)):
            colour = JACKET_DARK if z > 1.88 else JACKET
            row = []
            for i in range(3):
                a = side * (0.780 + 0.170 * i)
                row.append(builder.vertex(jacket_surface_point(a, z, pr), colour, jacket_bone(z)))
            body_rows.append(row)
        builder.grid(body_rows, 1, cyclic=False, flip=side < 0)
        flap_rows = []
        for z, pr in ((1.895, 0.030), (1.975, 0.010)):
            row = []
            for i in range(3):
                a = side * (0.765 + 0.185 * i)
                row.append(builder.vertex(jacket_surface_point(a, z, pr), JACKET, jacket_bone(z)))
            flap_rows.append(row)
        builder.grid(flap_rows, 1, cyclic=False, flip=side < 0)
        bx, by, bz = jacket_surface_point(side * 0.950, 1.905, 0.040)
        builder.ellipsoid((bx, by, bz), (0.020, 0.014, 0.020), 1, ZIP, "Spine", 5, 3)


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
# ★ The wrist is a RIBBED CUFF, and the old table drew a bare diameter step:
# one slightly-proud dark ring (1.300 at 0.109 over 1.240's 0.103) tapering
# straight into the hand. The sheet draws Dex's construction — the sleeve
# bellows, then a ribbed band CINCHES over the wrist under a terminator: a
# proud sleeve drape roll, a crisp step IN onto the rib band (~0.10ft long,
# the drawn cuff's own length), and the roll-under to the hand. Colour
# switch ON the 1.246/1.260 pair.
ARM_STATIONS = [
    (0.215, 0.142, JACKET, "Arm"),
    (0.300, 0.147, JACKET, "Arm"),
    (0.335, 0.141, JACKET, "Arm"),
    (ARM_SHOULDER_X, 0.132, JACKET, "Arm"),
    (0.560, 0.122, JACKET, "Arm"),
    (0.720, 0.116, JACKET, "Arm"),
    (ARM_ELBOW_X, 0.112, JACKET, "ForeArm"),
    (1.100, 0.108, JACKET, "ForeArm"),
    (1.230, 0.104, JACKET, "ForeArm"),
    (1.246, 0.113, JACKET, "ForeArm"),     # sleeve drape roll, PROUD lip —
    (1.260, 0.093, JACKET_DARK, "Hand"),   #   overhangs the rib cinch
    (1.336, 0.090, JACKET_DARK, "Hand"),   # rib band bottom
    (1.362, 0.078, JACKET_DARK, "Hand"),   # roll under
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
# measured: front z=1.02 halfWidth=0.4680 tol=0.06
LEG_STATIONS = [
    (1.420, 0.170, 1.10, PANTS, "UpLeg"),
    (1.200, 0.167, 1.10, PANTS, "UpLeg"),
    (1.000, 0.163, 1.08, PANTS, "Leg"),
    (0.800, 0.159, 1.06, PANTS, "Leg"),
    (0.640, 0.155, 1.04, PANTS, "Leg"),
    (0.560, 0.152, 1.03, PANTS, "Leg"),
    (0.520, 0.170, 1.04, TEAM_MASK, "Leg"),           # the rolled cuff — the
    (0.440, 0.172, 1.04, TEAM_MASK, "Leg"),           # team-accent band
    (0.385, 0.166, 1.02, TEAM_MASK, "Leg"),
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

SHOE_BANDS = [
    (0.000, "midsole"),
    (0.300, "quarter"),
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

    ring_loft_sweep(builder, SWEEP_LEVELS, detail)
    build_glasses(builder, detail)

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
    obj["recessReference"] = "the-professor-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_the_prof_LOD0", "kid_the_prof_LOD1", "kid_the_prof_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_the_prof_LOD0": (20, 12, 2),
        "kid_the_prof_LOD1": (8, 4, 1),
        "kid_the_prof_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "the_prof")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "The Professor reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against the-professor-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the jean-roll accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- the_prof\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_the_prof_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
