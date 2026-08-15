"""Rebuild Sprout as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/sprout-pilot.blend \
    --python scripts/v2/blender/sculpt-sprout-source.py

★ SPROUT IS THE FIRST LAYERED-GARMENT CHARACTER: denim bib overalls worn over
a yellow tee. Junebug proved the base kit, Tank the chunky extreme, Grizz the
hair mass; Sprout proves that two garments can share one torso surface — the
bib, straps and back panel are painted by the loft's own `color_fn`, the
mechanism Junebug's V-neck already used, so there is no second shell to
intersect. He also brings ears back (his stick out and are drawn in every
view) and the roster's smallest body.

★ HIS SHEET IS THE CLEANEST TRACE SO FAR. Four well-separated clusters —
denim #3a4d5b, skin #dc7b2c, hair #1c0c02, tee #f3a41c — so the torso was
traced by garment colour (`analyse:turnaround` profiles.torso), the first
character since Junebug where that worked.

⚠️ HIS DRAWN SMILE IS FAINTER THAN HIS NOSTRILS. The spec's mouth landmark
lands on the nose (darkest-wins has nothing darker at the lip line than the
nostril specks), so the lip is the bounded trace: the smile arc runs rows
351-359 of the sheet, corners high at 82.4%, centre row ~358-359 — 85.6% of
head height, z 2.68. The recipe header records the same warning.

The conversion: front figure 622px over 4.0ft → 1px = 0.006431ft; profile
607px → 0.006590. The profile faces +x (nose at the right edge), the same
orientation Grizz's header documents.
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
OUTPUT = REPO / "assets/v2/source/sprout-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/sprout-face-atlas.png"
REVISION = "sprout-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters (figure-mask modal colours): denim #3A4D5B, skin #DC7B2C,
# hair #1C0C02, tee #F3A41C, tee shadow #D48304, cuff/sole creams. Authored
# with the ramp factor Grizz's board calibrated (delivered ≈ authored / 1.2):
# each swatch is ~1.2x the sheet's own channel values so the render lands back
# on the drawing.
# Round 7: 1.2x was Grizz's DEEP-skin factor; on Sprout's mid tan it rendered
# the bare forearms so warm the review read them as continued sleeves. 1.08x
# keeps him above the detector floor and visibly bare-armed.
SKIN = rgba("ED8B32")
SKIN_SHADOW = rgba("BE6318")
HAIR = rgba("2E1A0C")        # deep chocolate; the modal #1C0C02 would render a hole
SHIRT = rgba("FFBA2E")       # the yellow tee
SHIRT_DARK = rgba("D8860C")  # the hem/cuff bands need real contrast against the sleeve
PANTS = rgba("46617A")       # the denim, lifted and kept blue
PANTS_DARK = rgba("2E3E4E")
# The rolled cuffs are washed light denim — they ride in the leg table's sock
# lane, which is the construction (a light band above the shoe) even though
# no sock is worn.
SOCK = rgba("B4C6D6")
# ★ ROUND 2: THE CANVAS IS A WARM BROWN, NOT A PALE GREY. The first board
# delivered the whole shoe band as one cream (100/0 against the concept's
# 65.6/33.2, saturation 7.2 against 30.4): three authored creams within the
# classifier's own membership of each other. The concept's own two tones are
# #f9ecdb and #7a5c3c — a saturated warm taupe-brown canvas against a cream
# sole (sampled lit: upper #9f8465, sole #d9bfa0).
# ★ ROUND 4: BRIGHTNESS IS NOT SPREAD. #C1A278 was 1.2x the sampled values but
# its channel SPREAD (r-b 73) compressed under the ramp to 48 and the rendered
# canvas sat chromatically closer to the cream centroid than to the concept's
# #7a5c3c — 88.8% of the band classified cream with the canvas right there in
# frame. Junebug's lesson in full: a colour that must survive the ramp is
# authored with ~1.3x the concept's channel spread, not 1.2x its values.
SHOE = rgba("B58455")        # canvas at the concept's own chromaticity, spread 96
WHITE = rgba("FFF0D8")       # the thick cream cupsole
SOLE = rgba("F0D8B0")        # toe bumper and collar trim, deeper than the sole
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Head band: hair crown row 154 (z 3.99) to neck pinch row 393 (z 2.46) — a
# 1.53ft head, 38.4% of the figure. Features, bounded traces on the front
# figure: brow band rows 247-259 (41.4% of head, z 3.35), eye band rows
# 282-316 centred y 299 (61%, z 3.06 — his eyes are enormous), nostrils rows
# 338-340 (z 2.80), smile centre rows 358-359 (85.6%, z 2.68). The profile's
# face plane sits ~0.48ft forward of the body axis with a 0.11ft button nose
# breaking it at z 2.90.
HEAD_CENTER = (0.0, -0.030, 3.080)
HEAD_RADII = (0.550, 0.600, 0.620)

# A smooth egg of a face: soft cheek swell, small chin.
FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.00, 1.03),
    (-0.30, 1.05),
    (-0.60, 1.02),
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
    """A gentle recess — his huge round eyes are atlas work, not deep sockets.
    Eye centre z 3.06 is latitude nz -0.032 on this skull."""
    dz = nz + 0.032
    dx = abs(nx) - 0.300
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.022
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small upturned button. Profile: the face plane holds x 922-924 and
    the nose reaches 941 across z 2.95-2.87 — 0.11ft proud, tip at z 2.90
    (nz -0.29). Peak authored above the drawn shadow band, Tank's lesson."""
    if abs(nx) > 0.20:
        return 0.0
    dz = nz + 0.255
    if dz < -0.14 or dz > 0.15:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.20) ** 2)
    bridge = 0.018 * across * max(0.0, 1.0 - abs(dz - 0.09) / 0.11)
    reach = 0.120 if dz >= 0.0 else 0.130
    t = dz / reach
    tip = 0.135 * across ** 1.05 * max(0.0, 1.0 - t * t) ** 1.30
    return bridge + tip


# ★ HIS EARS ARE A READ, NOT A DETAIL — "wing-nut ears" is a defining trait.
# The front silhouette bumps from 0.672 at z 3.10 to 0.746 across z 2.94-2.86:
# that bump is the ears, centred z 2.90 and standing ~0.05ft proud per side.
# Bigger than Tank's in every dimension.
EAR_SPEC = EarSpec(center=(0.020, 2.900), radii=(0.1650, 0.2050))

# Island solved for his own feature span: top just above the hairline
# (lat +0.75), bottom short of the chin (lat -1.45), span 2.20. Through it the
# generator's drawn rows land: brow ≈ cell 18 (z 3.344, 42.2% of head), eye ≈
# cell 45 (z 3.066, 60.4%), mouth ≈ cell 84 (z 2.683, 85.4%) — each within a
# point of the bounded traces above.
FACE_ISLAND = (0.92, -1.450, 2.200)

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
    """The skull surface's forward (-y) extent at (x, z), for the hair tuck."""
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    rx = HEAD_RADII[0] * face_half_scale(nz)
    nx = x / rx if rx else 2.0
    remainder = 1.0 - nx * nx - nz * nz
    if remainder <= 0.0:
        return HEAD_CENTER[1]
    return HEAD_CENTER[1] - HEAD_RADII[1] * sqrt(remainder)


# --- The hair ------------------------------------------------------------------
#
# A tousled short cap with a forward swoosh: it hugs the skull, hangs a soft
# fringe to z ~3.42 at the centre, clears the ears entirely (hairline arcs up
# over them), and falls to a nape at z ~2.85. Grizz's ring-loft-with-tuck
# construction, his second proving; the fringe arc and radii are this kid's.
#
# measured: front z=3.90 halfWidth=0.3505
# measured: front z=3.74 halfWidth=0.5723
# measured: front z=3.42 halfWidth=0.7524
# measured: front z=3.26 halfWidth=0.7267
# measured: view2 z=3.42 halfWidth=0.7216
# measured: view2 z=3.26 halfWidth=0.6787
HAIR_LEVELS = [
    (3.985, 0.070, 0.065, 0.015),
    (3.945, 0.210, 0.195, 0.028),
    (3.905, 0.350, 0.345, 0.048),
    (3.820, 0.444, 0.480, 0.030),
    (3.740, 0.572, 0.600, 0.028),
    (3.660, 0.698, 0.655, 0.060),
    (3.580, 0.715, 0.700, 0.100),
    (3.500, 0.738, 0.710, 0.110),
    (3.420, 0.752, 0.720, 0.122),
    (3.340, 0.752, 0.700, 0.142),
    (3.260, 0.727, 0.680, 0.163),
    (3.100, 0.640, 0.640, 0.160),
    (2.980, 0.580, 0.560, 0.190),
    (2.900, 0.480, 0.430, 0.250),
    (2.840, 0.310, 0.250, 0.300),
]

# The hairline arc: first skin row per column of the front figure. His fringe
# dips to z ~3.42 at the centre, the temples clear by z 3.20, and the sides
# arc fully above the ears (ear top ~3.09).
# Round 7: the first review found the ear tops swallowed — the hairline now
# arcs fully ABOVE the ears (ear top z 3.10) at the ear columns.
HAIR_FRINGE = [
    (0.00, 3.460),
    (0.15, 3.445),
    (0.30, 3.240),
    (0.40, 3.150),
    (0.55, 3.110),
    (0.75, 3.060),
]

HAIR_OPEN_BOTTOM = 2.42


def fringe_z_at(x_abs: float) -> float:
    """The hair's lower edge over the face at lateral offset |x|."""
    table = HAIR_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def build_hair(builder: MeshBuilder, detail: int) -> None:
    """One closed lofted cap with the face tucked out of it — Grizz's
    construction, stitched bottom-up in `loft`'s own winding."""
    segments = 24 if detail >= 2 else (12 if detail == 1 else 8)
    levels = HAIR_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in HAIR_LEVELS], detail)
    ascending = list(reversed(levels))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        # Round 7: doubled — 0.030 rendered as a smooth balloon and the first
        # review named it; the crop is TEXTURED in the drawing.
        curl = 0.055 if detail >= 2 else 0.0
        for column in range(segments):
            theta = 2 * pi * column / segments
            clump = 1.0 + curl * sin(5.0 * theta + 2.6 * len(rows)) + (curl * 0.5) * sin(9.0 * theta + 1.3 * len(rows))
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                if HAIR_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    # over the face: buried behind the skull
                    y = max(y, skull_front_y(x, z) + 0.050)
                else:
                    # ★ ROUND 8: ABOVE THE FRINGE THE CROP HUGS THE FOREHEAD.
                    # The full ellipse rendered as a puffy balloon two reviews
                    # called off-model: the drawing's mass is wide and BACK-
                    # heavy, with the front a thin shell over the skull (the
                    # 1.44ft profile depth is mostly swoosh and rear mass).
                    y = max(y, skull_front_y(x, z) - 0.075)
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


# --- The torso: one surface, two garments --------------------------------------
#
# The width column is TRACED BY GARMENT COLOUR — the denim's own runs on the
# front figure, hands excluded (`profiles.torso` in his spec; the stitch
# highlights fragment the centre run, so the outer denim extents were read
# with `regionRunsAt`): z 2.10 half 0.270 · 2.00 0.293 · 1.90 0.312 · 1.80
# 0.338 · 1.70 0.363 · 1.60 0.402 · 1.50 0.431 · 1.40 0.473 (the hip flare,
# his widest) · crotch ~1.26 0.445. Depth from the profile figure (hands
# overlap it, authored slightly inside): z 2.0 span 0.330 half, 1.5 0.369.
# measured: view2 z=1.50 halfWidth=0.3690
# measured: view2 z=1.98 halfWidth=0.3460
TORSO_LEVELS = [
    (1.260, 0.445, 0.310, "Hips"),
    (1.400, 0.473, 0.328, "Hips"),    # traced: the hip flare
    (1.550, 0.446, 0.338, "Hips"),
    (1.700, 0.363, 0.345, "Spine"),   # traced
    (1.850, 0.325, 0.330, "Spine"),
    (2.000, 0.293, 0.300, "Spine1"),  # traced
    (2.100, 0.270, 0.268, "Spine1"),  # traced — bib width
    # Two rings bracket the bib's top edge so the denim/tee boundary lands ON
    # vertices: painted between sparse rings it smeared diagonally (vertex
    # colours interpolate across the quad), which is what round 5's board
    # showed as yellow bleeding into the bib.
    (2.145, 0.268, 0.258, "Spine1"),
    (2.155, 0.270, 0.252, "Spine2"),
    (2.220, 0.276, 0.235, "Spine2"),
    (2.320, 0.258, 0.212, "Spine2"),
    (2.400, 0.195, 0.175, "Spine2"),  # shoulder slope
    (2.425, 0.150, 0.142, "Spine2"),
    (2.442, 0.157, 0.148, "Spine2"),  # tee collar rib, proud
    (2.460, 0.130, 0.126, "Spine2"),  # neck hole
]

# The pinch is at the BOTTOM of the neck (Grizz's lesson — the table that put
# it at the top cost three metrics at once); it widens upward into the jaw.
# measured: front z=2.46 halfWidth=0.1640
NECK_LEVELS = [
    (2.450, 0.128, 0.120, "Spine2"),
    (2.540, 0.134, 0.126, "Neck"),
    (2.630, 0.140, 0.132, "Neck"),
]

# Where the denim ends and the tee shows, by bearing around the torso. The
# bib's top edge crosses z 2.15 on the chest, the side openings drop to the
# waistband at z 1.92, and the back panel rises to z 2.10. The straps cross
# the shoulders between bib and back panel.
BIB_TOP_FRONT = 2.15
BIB_TOP_BACK = 2.22
WAISTBAND_SIDE = 1.92
STRAP_TOP = 2.46
STRAP_ARC = (0.42, 0.74)   # |cos(bearing)| band the straps occupy


def overalls_color(theta: float, z: float):
    """The loft colour: denim below the bib line, straps over the shoulders,
    yellow tee everywhere else — one surface, no second shell (the V-neck
    mechanism from Junebug's jersey)."""
    frontness = -sin(theta)
    if frontness > 0.35:
        bib_top = BIB_TOP_FRONT
    elif frontness < -0.35:
        bib_top = BIB_TOP_BACK
    else:
        bib_top = WAISTBAND_SIDE
    if z < bib_top:
        return PANTS
    if bib_top <= z <= STRAP_TOP and STRAP_ARC[0] <= abs(cos(theta)) <= STRAP_ARC[1]:
        return PANTS
    return SHIRT_DARK if z > 2.435 else SHIRT


# The bib pocket: the concept draws a patch pocket centred on the bib. The
# same three-part construction as every hem — a raised panel with a darker
# top edge. (Second use of Grizz's patch construction; a third character
# wanting it is the sculptlib lift.)
POCKET_X = (-0.13, 0.13)
POCKET_Z = (1.93, 2.10)
POCKET_PROUD = 0.026


def torso_ring_at(z: float) -> tuple[float, float]:
    """(half-width, half-depth) of the torso at height z, off TORSO_LEVELS."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return wa + t * (wb - wa), da + t * (db - da)
    return levels[-1][1], levels[-1][2]


def build_pocket(builder: MeshBuilder, detail: int) -> None:
    """The bib's patch pocket, proud of the denim."""
    if detail < 1:
        return
    steps = 3
    rows = []
    for j in range(steps + 1):
        z = POCKET_Z[1] - (POCKET_Z[1] - POCKET_Z[0]) * j / steps
        half_w, half_d = torso_ring_at(z)
        row = []
        for i in range(steps + 1):
            x = POCKET_X[0] + (POCKET_X[1] - POCKET_X[0]) * i / steps
            inner = max(0.12, 1.0 - (x / half_w) ** 2)
            y = -half_d * sqrt(inner) - POCKET_PROUD
            colour = PANTS_DARK if j == 0 else PANTS
            row.append(builder.vertex((x, y, z), colour, "Spine1"))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False, flip=True)


# --- Arms ----------------------------------------------------------------------
#
# The roster's thinnest limbs. Sleeve hem traced by colour (yellow to skin on
# the arm columns) at z ~1.82, which from the shoulder joint is 0.65 down a
# hanging arm: SLEEVE_HEM_X 1.05. Bare forearm runs 18px = 0.116ft wide
# (radius 0.058); the hand knuckles reach 0.075.
# ★ ROUND 9: MID-BICEPS, AND UNMISTAKABLY SO. Three independent reviews in a
# row read the sleeve as a long shirt — at 1.05 and again at 0.90, because a
# tan forearm beside a warm yellow sleeve needs REAL bare length to read as
# skin. The third review pinned the drawing's hem at mid-biceps; on the
# T-pose limb that is x 0.72, leaving more than half the arm bare.
SLEEVE_HEM_X = 0.720

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose, indexed by x along the limb,
# while the concept hangs both arms at the sides. The radii the sheet does
# pin: bare forearm half 0.058 (front z 1.50, skin run 137-155), knuckles
# half ~0.075 (z 1.30, run 133-152).
ARM_STATIONS = [
    (0.215, 0.148, SHIRT, "Arm"),
    (0.300, 0.152, SHIRT, "Arm"),   # deltoid peak
    (0.335, 0.146, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.132, SHIRT, "Arm"),
    (SLEEVE_HEM_X - 0.028, 0.108, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.106, SHIRT_DARK, "Arm"),          # cuff band, proud
    (SLEEVE_HEM_X + 0.024, 0.101, SHIRT_DARK, "Arm"),
    (SLEEVE_HEM_X + 0.038, 0.084, SHIRT_DARK, "Arm"),  # the cuff's underside
    (SLEEVE_HEM_X + 0.054, 0.064, SKIN, "ForeArm"),
    (1.240, 0.058, SKIN, "ForeArm"),
    (1.365, 0.056, SKIN, "Hand"),
    (1.415, 0.066, SKIN, "Hand"),
    (1.470, 0.075, SKIN, "Hand"),   # knuckle line
    (1.520, 0.064, SKIN, "Hand"),
]

SPROUT_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    # ★ 0.100, NOT THE HOUSE 0.170. The silhouette gate found a see-through
    # pocket at the neck/shoulder (52px front, 75px A-pose): his neck is the
    # roster's thinnest and his arm tubes the slimmest, so the cone from cap
    # to first ring left a daylight triangle Tank's and Grizz's fat necks
    # always filled. Burying the cap vertex deeper inside the torso fattens
    # that cone and closes the triangle without touching any visible surface.
    cap_x=0.100,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.560,
        finger_root=1.512,
        finger_offsets=((-0.050, 0.0, 0.050), (-0.034, 0.034)),
        finger_lengths=((0.110, 0.126, 0.112), (0.118, 0.122)),
        finger_widths=(0.028, 0.027, 0.022, 0.016),  # 0.009 tips tessellated into inverted-normal noise
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.398, -0.038, -0.020),
            (1.448, -0.062, -0.032),
            (1.486, -0.076, -0.040),
            (1.508, -0.082, -0.044),
        ),
        thumb_widths=(0.027, 0.025, 0.019, 0.014),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Legs: straight denim trousers with rolled cuffs ---------------------------
#
# The trouser legs touch above z ~1.22 and part below (the space between is an
# enclosed backdrop pocket — the containment artifact Grizz's file documents).
# Per-leg widths traced off the denim runs: z 1.20 outer edge 0.437 against
# leg_x 0.247 (radius 0.190); z 1.00 outer 0.457 against 0.269 (0.188);
# z 0.60 outer 0.495 against leg_x 0.321 (0.174 — the leg hangs slightly
# outside the chain, absorbed by radius). The rolled cuff is light washed
# denim from z ~0.56 to 0.42, riding the table's sock lane; the team accent
# is the cuff's top stripe.
SHORTS_HEM_Z = 0.560   # the roll's top edge (the garment "hem" of this kit)
INSEAM_TOP_Z = 1.220
INSEAM_HEM_Z = 0.420
INSEAM_HEM_HALF = 0.100


def inseam_half(z: float) -> float:
    """Half the daylight the concept draws between the trouser legs at z."""
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.5

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=2.46 runs=1
LEG_STATIONS = [
    (1.600, 0.205, 1.14, PANTS, "UpLeg"),
    (1.400, 0.212, 1.14, PANTS, "UpLeg"),
    (1.200, 0.190, 1.12, PANTS, "UpLeg"),
    (1.000, 0.188, 1.10, PANTS, "Leg"),
    (0.800, 0.180, 1.08, PANTS, "Leg"),
    (0.620, 0.174, 1.06, PANTS, "Leg"),
    (0.575, 0.178, 1.06, PANTS_DARK, "Leg"),          # the roll begins
    (SHORTS_HEM_Z, 0.196, 1.05, TEAM_MASK, "Leg"),    # cuff top stripe, accent
    (0.545, 0.200, 1.05, TEAM_MASK, "Leg"),
    (0.520, 0.204, 1.05, SOCK, "Leg"),                # washed denim roll
    (0.470, 0.200, 1.04, SOCK, "Leg"),
    (0.425, 0.188, 1.03, SOCK, "Leg"),                # cuff bottom, on the shoe
    (0.400, 0.120, 1.00, SOCK, "Leg"),                # dives inside the shoe
    (0.330, 0.095, 0.97, SOCK, "Foot"),
    (0.150, 0.088, 0.95, SOCK, "Foot"),
]

SPROUT_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Taupe canvas sneakers with a thick white cupsole and a white toe bumper.
# Front per-shoe extent ~0.46ft (the pair nearly touch, like Grizz's); the
# profile's near shoe runs ~0.70ft; topline z ~0.42 where the cuff overhangs.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 16.0 * pi / 180.0

# not-traceable: the station table is the last's own fore-aft profile and no
# turnaround view looks down the length of the foot; the scales it is built
# to are the traced numbers above. Tank's proven block-last stations.
SHOE_STATIONS = [
    (-0.439, 0.066, 0.220, SOLE),
    (-0.388, 0.120, 0.252, SOLE),
    (-0.314, 0.158, 0.278, SOLE),
    (-0.228, 0.182, 0.292, SOLE),
    (-0.131, 0.196, 0.300, SOLE),
    (-0.034, 0.202, 0.302, SOLE),
    (0.057, 0.201, 0.300, SOLE),
    (0.137, 0.188, 0.294, SOLE),
    (0.188, 0.162, 0.284, SOLE),
    (0.239, 0.120, 0.246, SOLE),
]

# not-traceable: a cross-section is a fore-aft cut no view can give; the band
# heights it carries are the traced boundaries beside SHOE_BANDS below.
SHOE_SECTION = [
    (0.000, 0.000, "midsole"),
    (0.620, 0.004, "midsole"),
    (0.950, 0.030, "midsole"),
    (1.000, 0.140, "midsole"),
    (0.985, 0.300, "midsole"),   # the tall white cupsole's top edge
    (0.815, 0.330, "quarter"),   # the canvas steps in
    (0.800, 0.450, "quarter"),
    (0.780, 0.580, "quarter"),
    (0.755, 0.700, "quarter"),
    (0.720, 0.820, "quarter"),
    (0.660, 0.880, "quarter"),
    (0.520, 0.950, "quarter"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_MID = [
    (0.000, 0.000, "midsole"),
    (0.970, 0.060, "midsole"),
    (0.985, 0.300, "midsole"),
    (0.815, 0.330, "quarter"),
    (0.780, 0.580, "quarter"),
    (0.720, 0.820, "quarter"),
    (0.660, 0.880, "quarter"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_LOW = [
    (0.000, 0.000, "midsole"),
    (0.985, 0.300, "midsole"),
    (0.815, 0.330, "quarter"),
    (0.720, 0.820, "quarter"),
    (0.000, 1.000, "collar"),
]


def shoe_floor_at(y_unscaled: float) -> float:
    """The underside's height at a station — toe spring and heel bevel."""
    if y_unscaled <= -0.30:
        t = (-0.30 - y_unscaled) / 0.14
        return SHOE_FLOOR + 0.044 * min(1.0, t) ** 1.6
    if y_unscaled >= 0.16:
        t = (y_unscaled - 0.16) / 0.08
        return SHOE_FLOOR + 0.026 * min(1.0, t) ** 1.5
    return SHOE_FLOOR


SHOE_LENGTH_SCALE = 1.10
SHOE_WIDTH_SCALE = 1.10
SHOE_HEIGHT_SCALE = 1.38

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Walking the front-left shoe's columns: the white sole holds to ~34% of shoe
# height, canvas to ~86%, trim above where the cuff shadows it.
# Round 2 delivered the band 91.9% cream / 8.1% canvas against the concept's
# 65.6 / 33.2 — the toe bumper, collar trim and lace straps (all creams) were
# covering the canvas the front camera should see. The canvas starts lower,
# runs nearly to the topline, and the bumper shrinks to the toe's own nose.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.300, "quarter"),
    (0.920, "collar"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    """The white toe bumper's lower edge; 2.0 covers nothing behind it.
    Small on purpose — round 2's larger cap buried the canvas the tone split
    measures."""
    if y_unscaled > -0.24:
        return 2.0
    frac = min(1.0, max(0.0, (-0.24 - y_unscaled) / 0.20))
    return 0.86 - 0.10 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    """The heel patch's lower edge, mirroring the toe cap's construction."""
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.62 - 0.20 * frac


SPROUT_SHOE = ShoeSpec(
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
    collar=(0.024, 0.115),
    straps=((-0.170, -0.120), (-0.065, -0.015)),
    strap_arc_min=0.52,
    heel_point=(0.286, 0.120 + 0.026),
    toe_point=(-0.470, 0.048 + 0.044),
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

    build_hair(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, segments)
    # The torso carries two garments in vertex colour, so it gets extra
    # columns at the near LOD — strap edges land within a column's width
    # instead of smearing across an 18-degree quad.
    torso_segments = 28 if detail >= 2 else segments  # 32 blew the 7000-triangle LOD0 budget
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
                 color_fn=overalls_color)
    build_pocket(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=SPROUT_ARM)
        build_leg(builder, side, detail, spec=SPROUT_LEG)
        build_shoe(builder, side, detail, spec=SPROUT_SHOE,
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
    obj["recessReference"] = "sprout-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_sprout_LOD0", "kid_sprout_LOD1", "kid_sprout_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_sprout_LOD0": (20, 12, 2),
        "kid_sprout_LOD1": (8, 4, 1),
        "kid_sprout_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "sprout")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Sprout reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against sprout-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cuff-top accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- sprout\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_sprout_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
