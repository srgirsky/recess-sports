"""Rebuild Zippy as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/zippy-pilot.blend \
    --python scripts/v2/blender/sculpt-zippy-source.py

★ ZIPPY IS THE FIRST PIGTAILS AND THE FIRST HEADBAND — each pigtail is one
curved lobed tube that spouts up from its tie and falls to a point, and the
cream headband is the team-accent surface (an arc tube on M_Accessory, the
first accent that is not part of a garment). Her tee is the first stripe whose
BOTH tones are authored colours (dark pink on light pink, no cream ground).

The conversion: front figure 638px over 4.0ft → 1px = 0.006270ft. The profile
faces +x. Head band: pigtail-spout top row 199 (z 3.99) to neck pinch row 383
(z 2.84) — 28.8% of the figure, the smallest head on the roster so far.
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
OUTPUT = REPO / "assets/v2/source/zippy-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/zippy-face-atlas.png"
REVISION = "zippy-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: black hair #1B140C, dark pink #F25C74, light pink #FA939C,
# navy #2A2E39, cream #F9EBDD (headband, socks, trim). Her lit skin resolves
# to the light-pink cluster on the sheet (the spec records the refusal), so
# the skin swatch is the direct cheek/leg sample pair's midpoint.
SKIN = rgba("FDA964")
SKIN_SHADOW = rgba("C97C3A")
HAIR = rgba("241812")        # near-black
SHIRT = rgba("FFB1BA")       # the tee's light-pink ground
SHIRT_DARK = rgba("FF6E8B")  # the dark-pink stripes — chroma up so the board
                             # ramp lands back on the sheet's #f25c74
PANTS = rgba("353A49")       # navy dolphin shorts
PANTS_DARK = rgba("252938")
SOCK = rgba("FFF6E6")
SHOE = rgba("3A4060")        # navy canvas upper
WHITE = rgba("FFF2D2")       # cream cupsole
SOLE = rgba("F6E0B8")        # cream toe bumper, laces, trim piping
# The team accent is the HEADBAND — the first accessory-slot accent that is
# not part of a garment. Cream on the sheet, so the untinted board reads true.
TEAM_MASK = rgba("D8D2C6")
TIE = rgba("FF6A80")         # the pink pigtail ties — identity, stays authored

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: brow bands rows 268-283 (41.3% of the 3.99→2.84
# head, z 3.52), the big eyes rows 294-320 centred row 307 (58.7%, z 3.32),
# nostrils row 339, the open grin rows 347-361 (85%, z 3.02). Her face sits
# HIGHER on the figure than any kid so far — the head is small and the crown
# above it is all hair, headband and pigtail spouts.
HEAD_CENTER = (0.0, -0.020, 3.320)
HEAD_RADII = (0.400, 0.420, 0.420)

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
    """Huge shining eyes — a soft dish; the atlas carries the sparkle."""
    dz = nz - 0.010
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small button above the grin (centre nz -0.30)."""
    if abs(nx) > 0.17:
        return 0.0
    dz = nz + 0.300
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.17) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.082 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Her ears are drawn (clearly in profile) but the paired pigtails own every
# width metric near them, so the placement is off the profile view: ear
# centred ~z 3.17, mostly hidden behind the pigtails from the front.
EAR_SPEC = EarSpec(center=(0.020, 3.170), radii=(0.1300, 0.1600))

# Island solved for her span: brow anchor 24 lands z 3.517 (41.1% of the
# 3.99→2.84 head against the traced 41.3), eye anchor 50 lands z 3.317 (58.5
# vs 58.7), mouth anchor 87 lands z 3.017 (84.6 vs 85.0). The spec REFUSES
# her eye band (the fringe merges with it); the rows above are bounded traces.
FACE_ISLAND = (0.92, -1.531, 2.438)

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


# --- The hair: fringe cap, headband, pigtails ----------------------------------
#
# A black cap over the whole skull with a straight bang fringe ACROSS the
# forehead (her hairline covers it — the opposite of the open-forehead kids),
# the cream headband arcing over the crown behind the fringe, and one lobed
# tube per pigtail spouting up from its tie and falling to a point.
# measured: front z=3.42 halfWidth=0.5141
# measured: front z=3.90 halfWidth=0.2947 tol=0.10
CAP_LEVELS = [
    (3.870, 0.170, 0.180, 0.000),
    (3.780, 0.350, 0.360, 0.000),
    (3.680, 0.395, 0.420, 0.010),
    (3.560, 0.395, 0.430, 0.010),
    (3.420, 0.435, 0.465, 0.020),
    (3.280, 0.445, 0.470, 0.030),
    (3.020, 0.385, 0.405, 0.100),
    (2.950, 0.330, 0.350, 0.140),
]

# The bang line: hair covers the forehead down to just above the brows, then
# drops past the temples toward the jaw as short curtains.
# Ladder (hairline-scan.mjs, front board; the sheet's hairline reads 25.7%
# of head height):
#   arc 3.545 / 3.530 / 3.460     42.5%   (shipped)
#   arc 3.685 / 3.670 / 3.590     26.9%   (the sheet reads 25.7%)
CAP_FRINGE = [
    (0.00, 3.685),
    (0.22, 3.670),
    (0.30, 3.590),
    (0.36, 3.240),
    (0.44, 3.060),
]

CAP_OPEN_BOTTOM = 2.960


def fringe_z_at(x_abs: float) -> float:
    """The fringe's lower edge over the face at lateral offset |x|."""
    table = CAP_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def ring_loft_cap(builder: MeshBuilder, levels, detail: int) -> None:
    """The ring-loft-with-tuck over the skull."""
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the runtime lights the mass as a slate-grey void.
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_cap levels must be strictly descending in z"
    segments = 17 if detail >= 2 else (10 if detail == 1 else 8)
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
                if CAP_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
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


# The headband: an arc over the crown behind the fringe, riding proud of the
# cap. THE team-accent surface (material 3) — cream on the sheet, so the
# untinted board reads true while teams tint it at runtime.
# not-traceable: the band's own width hides under fringe and pigtails in
# every view; the arc it rides is the cap surface + 0.02.
# The y values ride the CAP's own front surface — the first build put the
# arc at y -0.02..-0.095, which is INSIDE the cap volume, and the band was
# invisible from every angle.
# ★ HEM SWEEP: riding the surface with the CENTERLINE at +0.02 put the OUTER
# edge (+ the 0.048 tube radius) 0.068-0.080 past the crown-front silhouette
# where the crown curves away — the "bent twig" hook of
# zippy-profile-review.png x 215-250 / y 95-140 (apex outer -0.340 against
# the cap's own -0.260 at z 3.83). And the old ends (±0.440, -0.050, 3.440)
# sat laterally OUTSIDE the cap (half_x 0.428 at that z), so each blunt
# 4-sided end cap faced the profile camera as an open tube mouth. Every knot
# below is re-derived so the tube's OUTER edge = the rendered cap surface
# (ellipse with ring_loft_cap's -0.300 tuck clamp) + 0.020 — visible as a
# ribbon pressed into the hair, projecting no more than 0.02 anywhere — and
# the ends now terminate INSIDE the pigtail ties (tie spine 0.400→0.462,
# radius 0.085), so no mouth shows. Moved points only: zero triangles, she
# has sixteen.
HEADBAND_ARC = [
    (-0.410, 0.010, 3.560),
    (-0.375, -0.096, 3.600),
    (-0.300, -0.228, 3.690),
    (-0.170, -0.272, 3.770),
    (0.000, -0.232, 3.830),
    (0.170, -0.272, 3.770),
    (0.300, -0.228, 3.690),
    (0.375, -0.096, 3.600),
    (0.410, 0.010, 3.560),
]

# One curved lobed tube per pigtail: spouting up-out from the tie, arcing over
# and falling to a point. The spouts' tops are the head span's own crown.
# measured: front z=3.74 halfWidth=0.8746
# measured: front z=3.90 runs=3
# The spouts LEAN INTO the crown: at z ~3.74 the sheet's silhouette is ONE
# run from -0.87 to +0.87, so the masses must fill against the cap with no
# daylight — the first build floated them 0.1ft out and the head box read
# aspect 1.18 against the concept's 1.53.
PIGTAIL_SPINE = [
    (0.420, 0.000, 3.550),
    (0.470, 0.020, 3.845),
    (0.600, 0.040, 3.905),
    (0.720, 0.070, 3.610),
    (0.840, 0.100, 3.300),
    (0.800, 0.130, 2.980),
]
PIGTAIL_RADII = [0.075, 0.130, 0.140, 0.150, 0.100, 0.025]

TIE_SPINE = [(0.400, 0.000, 3.550), (0.462, 0.008, 3.595)]
TIE_RADII = [0.085, 0.075]


def build_hair(builder: MeshBuilder, detail: int) -> None:
    ring_loft_cap(builder, CAP_LEVELS, detail)
    if detail >= 1:
        arc = HEADBAND_ARC if detail >= 2 else HEADBAND_ARC[::4]
        builder.tube(arc, [0.048] * len(arc), 3, TEAM_MASK, "Head", 4)
    tail_sides = 6 if detail >= 2 else (5 if detail == 1 else 3)
    spine = PIGTAIL_SPINE if detail >= 1 else PIGTAIL_SPINE[::2]
    radii = PIGTAIL_RADII if detail >= 1 else PIGTAIL_RADII[::2]
    for side in (1, -1):
        pts = [(side * x, y, z) for x, y, z in spine]
        # ⚠️ groove subtracts ABSOLUTELY from each ring radius — 0.22
        # exceeded the tip radii (0.025) on the first build, drove them
        # negative and turned the tubes inside-out: the runtime showed
        # slate backface blades while the double-sided board looked fine.
        builder.tube(pts, radii, 2, HAIR, "Head", tail_sides,
                     lobes=3, groove=0.020, flip=side < 0)
        if detail >= 1:
            tie = [(side * x, y, z) for x, y, z in TIE_SPINE]
            builder.tube(tie, TIE_RADII, 2, TIE, "Head", 5, flip=side < 0)


# --- The two-tone striped tee --------------------------------------------------
#
# Dark-pink bands on a light-pink ground — both tones authored, no cream.
# Bands traced down the centreline at cx+25: dark at 2.615-2.705 (the collar
# zone), 2.450-2.555, 2.255-2.355, 2.055-2.155, 1.875-1.975 and 1.755-1.862
# (the hem band). Hem z 1.755 — navy below is shorts.
# not-traceable: her hanging arms merge with the tee at every torso row (the
# front silhouette's central run spans arm-to-arm, 0.51-0.55), so the halves
# here are bounded by hand off the cluster runs: torso 139-227 at z 2.35
# (half 0.276) and 138-236 at z 2.00 (half 0.307).
TORSO_LEVELS = [
    # ★ SHE SHIPPED SEVERED AT THE WAIST, AND NO GATE COULD SEE IT.
    # This ring was at z 1.755 — the tee's hem — while LEG_STATIONS begins at
    # 1.560, so 0.195ft of her had NO geometry: the board showed a 21px band of
    # pure BACKGROUND straight through her body, front and profile both.
    # `silhouette.lint` measures the largest ENCLOSED background blob, and a
    # through-gap open at both sides is reached by the flood fill from the frame
    # edge — a character cut in half reads to it as ordinary backdrop.
    # `continuity.lint.test.js` exists because of this.
    #
    # Moved DOWN rather than adding rings, because she is the roster's tightest
    # kid: 6984 of 7000 LOD0 triangles, 16 spare. Three pelvis rows measured
    # 7086 and refused the export on both LOD0 and LOD2. Moving a ring costs
    # nothing.
    # ⚠️ The cost is the hem EDGE: the tee/shorts colour boundary now
    # interpolates across this one band instead of sitting on a ring pair, so
    # it reads soft from the side (rubric 3.4, Penny's hem lesson). Recorded as
    # a polish finding — a severed body outranks a soft hem, and closing it
    # properly wants the triangles a rows-for-columns trade would free.
    (1.545, 0.300, 0.254, "Hips"),
    (1.788, 0.335, 0.285, "Hips"),
    (1.980, 0.310, 0.262, "Spine"),
    (2.160, 0.295, 0.252, "Spine1"),
    (2.360, 0.282, 0.238, "Spine1"),
    (2.500, 0.272, 0.225, "Spine2"),
    (2.580, 0.245, 0.205, "Spine2"),
    (2.640, 0.205, 0.180, "Spine2"),
    (2.700, 0.170, 0.155, "Spine2"),
    (2.735, 0.150, 0.140, "Spine2"),
    (2.755, 0.140, 0.130, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

# ⚠️ (lo, hi) ASCENDING — the membership test is `lo <= z <= hi`.
STRIPES = ((1.755, 1.862), (1.875, 1.975), (2.055, 2.155),
           (2.255, 2.355), (2.450, 2.555), (2.615, 2.705))

# ★ LOD0 gets a ring 0.006ft inside each stripe edge on both sides — vertex
# colours interpolate across quad rows, so band edges between distant rings
# smear (the washed-stripe lesson). LOD1/2 keep the sparse table.
# not-traceable: the paired rows are the STRIPES chart re-expressed as loft
# rings; the shape numbers between them interpolate the traced table above.
TORSO_LEVELS_CRISP = [
    # ★ SHE SHIPPED SEVERED AT THE WAIST, AND NO GATE COULD SEE IT.
    # This ring was at z 1.755 — the tee's hem — while LEG_STATIONS begins at
    # 1.560, so 0.195ft of her had NO geometry: the board showed a 21px band of
    # pure BACKGROUND straight through her body, front and profile both.
    # `silhouette.lint` measures the largest ENCLOSED background blob, and a
    # through-gap open at both sides is reached by the flood fill from the frame
    # edge — a character cut in half reads to it as ordinary backdrop.
    # `continuity.lint.test.js` exists because of this.
    #
    # Moved DOWN rather than adding rings, because she is the roster's tightest
    # kid: 6984 of 7000 LOD0 triangles, 16 spare. Three pelvis rows measured
    # 7086 and refused the export on both LOD0 and LOD2. Moving a ring costs
    # nothing.
    # ⚠️ The cost is the hem EDGE: the tee/shorts colour boundary now
    # interpolates across this one band instead of sitting on a ring pair, so
    # it reads soft from the side (rubric 3.4, Penny's hem lesson). Recorded as
    # a polish finding — a severed body outranks a soft hem, and closing it
    # properly wants the triangles a rows-for-columns trade would free.
    (1.545, 0.300, 0.254, "Hips"),
    (1.788, 0.335, 0.285, "Hips"),
    (1.856, 0.327, 0.278, "Hips"),
    (1.869, 0.325, 0.277, "Hips"),
    (1.969, 0.311, 0.263, "Spine"),
    (1.981, 0.310, 0.262, "Spine"),
    (2.049, 0.304, 0.257, "Spine"),
    (2.061, 0.303, 0.256, "Spine1"),
    (2.149, 0.296, 0.251, "Spine1"),
    (2.161, 0.295, 0.250, "Spine1"),
    (2.249, 0.288, 0.243, "Spine1"),
    (2.261, 0.287, 0.242, "Spine1"),
    (2.349, 0.283, 0.239, "Spine1"),
    (2.361, 0.282, 0.238, "Spine1"),
    (2.444, 0.276, 0.230, "Spine2"),
    (2.456, 0.275, 0.229, "Spine2"),
    (2.549, 0.262, 0.218, "Spine2"),
    (2.561, 0.259, 0.215, "Spine2"),
    (2.609, 0.238, 0.199, "Spine2"),
    (2.621, 0.232, 0.195, "Spine2"),
    (2.700, 0.170, 0.155, "Spine2"),
    (2.735, 0.150, 0.140, "Spine2"),
    (2.755, 0.140, 0.130, "Spine2"),
]


def stripe_color(theta: float, z: float):
    # Below the tee's hem band the torso loft IS the shorts (see the pelvis
    # note in TORSO_LEVELS): navy, not shirt pink.
    #
    # ★ THE THRESHOLD SITS ON A RING, NOT BETWEEN TWO. Vertex colours
    # interpolate across a quad band, so a switch that falls INSIDE the tall
    # 1.545->1.788 pelvis band ramps navy to pink across its whole height — a
    # critic measured 32px of pink-to-near-black gradient from the front,
    # hiding half her shorts. Putting the switch above 1.788 makes that entire
    # band navy and moves the ramp to the short 1.788->1.856 band (~9px). The
    # cost is her hem reading ~0.035ft high; the alternative is a ring pair she
    # has no triangles for (6984 of 7000).
    if z < 1.800:
        return PANTS
    for lo, hi in STRIPES:
        if lo <= z <= hi:
            return SHIRT_DARK
    return SHIRT

# Her neck pinch is z 2.84 at 0.128 half.
# measured: front z=2.78 halfWidth=0.1285 tol=0.03
NECK_LEVELS = [
    (2.745, 0.135, 0.126, "Spine2"),
    (2.820, 0.132, 0.124, "Neck"),
    (2.905, 0.145, 0.136, "Neck"),
]


# --- Arms: striped short sleeves, slender bare forearms ------------------------
SLEEVE_HEM_X = 0.640

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the sleeve's station colours alternate to carry the tee's bands onto
# the arm, and the bare forearm traces ~0.05 half.
ARM_STATIONS = [
    (0.215, 0.142, SHIRT_DARK, "Arm"),
    (0.300, 0.146, SHIRT_DARK, "Arm"),
    (0.335, 0.139, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.128, SHIRT, "Arm"),
    (0.500, 0.117, SHIRT_DARK, "Arm"),
    (0.575, 0.110, SHIRT_DARK, "Arm"),
    (0.616, 0.105, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.111, SHIRT, "Arm"),           # hem roll, proud
    (0.664, 0.103, SHIRT, "Arm"),
    (0.682, 0.083, SHIRT, "Arm"),
    (0.700, 0.068, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.066, SKIN, "ForeArm"),
    (1.240, 0.063, SKIN, "ForeArm"),
    (1.365, 0.060, SKIN, "Hand"),
    (1.412, 0.068, SKIN, "Hand"),
    (1.465, 0.076, SKIN, "Hand"),   # knuckle line
    (1.512, 0.066, SKIN, "Hand"),
]

ZIPPY_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.100,
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


# --- Navy dolphin shorts, bare legs, striped socks -----------------------------
#
# Short navy shorts from under the tee to z ~1.35 with cream piping at the
# hem; bare legs to the sock tops at ~0.545; cream socks with the double pink
# stripe (0.515-0.490 and 0.465-0.442).
SHORTS_HEM_Z = 1.350
INSEAM_TOP_Z = 1.380
INSEAM_HEM_Z = 0.900
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=1.26 halfWidth=0.3824
LEG_STATIONS = [
    (1.560, 0.180, 1.14, PANTS, "UpLeg"),
    (1.460, 0.186, 1.14, PANTS, "UpLeg"),
    (1.395, 0.190, 1.10, PANTS, "UpLeg"),
    (1.362, 0.194, 1.06, SOLE, "UpLeg"),              # cream hem piping, proud
    (SHORTS_HEM_Z, 0.186, 1.03, SOLE, "UpLeg"),       # piping underside
    (1.332, 0.132, 1.01, PANTS_DARK, "UpLeg"),        # inner lip
    (1.315, 0.126, 1.00, SKIN, "UpLeg"),              # bare leg begins
    (0.850, 0.116, 1.01, SKIN, "Leg"),
    (0.720, 0.121, 1.01, SKIN, "Leg"),                # the calf
    (0.600, 0.108, 1.00, SKIN, "Leg"),
    (0.545, 0.118, 1.00, SOCK, "Leg"),                # sock top
    (0.515, 0.109, 1.00, SHIRT_DARK, "Leg"),          # stripe one
    (0.490, 0.108, 1.00, SHIRT_DARK, "Leg"),
    (0.478, 0.107, 1.00, SOCK, "Leg"),
    (0.465, 0.107, 1.00, SHIRT_DARK, "Leg"),          # stripe two
    (0.442, 0.106, 1.00, SHIRT_DARK, "Leg"),
    (0.425, 0.103, 1.00, SOCK, "Leg"),
    (0.400, 0.097, 0.98, SOCK, "Foot"),
    (0.280, 0.089, 0.97, SOCK, "Foot"),
    (0.150, 0.084, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch: a small centre loft between the two leg
# tubes so the shorts read as ONE garment — two rounds of shrinking the
# inseam carve never closed the see-through gap, because the gap is the
# space between the tubes, not the carve.
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations.
CROTCH_LEVELS = [
    (1.365, 0.150, 0.170, "Hips"),
    (1.470, 0.170, 0.195, "Hips"),
    (1.585, 0.185, 0.215, "Hips"),
]

ZIPPY_LEG = LegSpec(
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
# Navy low-top with cream cupsole, toe bumper and laces — the family last at
# Zippy's scale.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 14.0 * pi / 180.0

# not-traceable: the last's fore-aft profile has no sheet view; the scales it
# is built to are the traced numbers above.
# ★ HEM SWEEP: the toe bumper's rear boundary (toe_cap_v_low activates at
# y < -0.26) had no station near it — the nearest rows sat at -0.314 and
# -0.228, so the cream cap paint interpolated across that whole 0.086ft gap
# and the bumper read as a soft unbounded lozenge (zippy-front-review.png
# y 585-615). The two rows are MOVED to straddle the boundary (-0.270 in,
# -0.256 out — a 0.014ft band, Penny's ring-pair rule), widths interpolated
# off the original table at the new y so the last's plan shape holds
# (-0.270 → 0.151/0.275, -0.256 → 0.155/0.277). Station count unchanged and
# the cap overlay still owns three rows: zero triangles.
SHOE_STATIONS = [
    (-0.439, 0.058, 0.210, SOLE),
    (-0.388, 0.106, 0.242, SOLE),
    (-0.270, 0.151, 0.275, SOLE),
    (-0.256, 0.155, 0.277, SOLE),
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


SHOE_LENGTH_SCALE = 0.98
SHOE_WIDTH_SCALE = 0.92
SHOE_HEIGHT_SCALE = 1.20

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, navy canvas above, cream collar roll at the topline.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.360, "quarter"),
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


ZIPPY_SHOE = ShoeSpec(
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

    build_hair(builder, detail)

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
        build_arm(builder, side, detail, spec=ZIPPY_ARM)
        build_leg(builder, side, detail, spec=ZIPPY_LEG)
        build_shoe(builder, side, detail, spec=ZIPPY_SHOE,
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
    obj["recessReference"] = "zippy-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_zippy_LOD0", "kid_zippy_LOD1", "kid_zippy_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_zippy_LOD0": (20, 12, 2),
        "kid_zippy_LOD1": (8, 4, 1),
        "kid_zippy_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "zippy")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Zippy reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against zippy-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the headband accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- zippy\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_zippy_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
