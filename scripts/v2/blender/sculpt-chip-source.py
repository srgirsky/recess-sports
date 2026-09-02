"""Rebuild Chip as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/chip-pilot.blend \
    --python scripts/v2/blender/sculpt-chip-source.py

★ CHIP IS THE FIRST CAP, and the cap crown is the TEAM-ACCENT surface — a
baseball game's most natural tintable trim. He is also the first hoodie: a
hood bulge on the upper back, a kangaroo pocket, long sleeves with cuffs. His
mouth is the first the fixed `mouthIn` detector traced correctly on a
compressed face (89.5% of head height, verified by hand against rows 362-371
of his sheet).

The conversion: front figure 683px over 4.0ft → 1px = 0.005857ft. The profile
faces +x. Head band: cap top row 175 (z 3.995) to neck pinch row 394
(z 2.712) — 32.1% of the figure, the smallest head of the authored set.
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
OUTPUT = REPO / "assets/v2/source/chip-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/chip-face-atlas.png"
REVISION = "chip-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: hoodie green #626B34, creams #FAEEDE, skin #DC823D, navy
# #2A2E33, hair #1B0C01. Ramp factor per the calibrated boards (~1.2x, spread
# over-authored for colours that must survive it).
SKIN = rgba("FF9C49")
SKIN_SHADOW = rgba("C97430")
HAIR = rgba("3E2408")        # deep warm brown tufts, hue-warmed for the lit
                             # curl tops (Sprout's lesson: near-black two-tone
                             # separates by HUE under the ramp, never value)
HAIR_DARK = rgba("1F1004")   # the trough tone
SHIRT = rgba("778240")       # the hoodie green
SHIRT_DARK = rgba("4A5226")  # ribbed hem, cuffs and the hood roll — dark enough to read
PANTS = rgba("363B44")       # navy shorts
PANTS_DARK = rgba("23262D")
SOCK = rgba("FFF6E6")
# The sock's green stripe is the hoodie's own green, authored directly; the
# team lane is spent on the cap.
STRIPE = rgba("778240")
SHOE = rgba("3A404C")        # navy canvas upper
WHITE = rgba("FFEACB")       # warm cream cupsole (the greys failed the chroma gate)
SOLE = rgba("E8C288")        # warm tan trim — the concept band's own second tone (#bb9c73)
# ★ THE CAP'S FRONT PANEL IS THE TEAM SURFACE — the logo patch position. The
# first cut made the whole CROWN the team mask and the board delivered a
# white beanie: the neutral mask erased the navy that is half his identity.
# The crown and brim are his own navy; the drafting team tints the panel.
TEAM_MASK = rgba("D8D2C6")
CAP_NAVY = rgba("434B58")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front figure: brows rows 300-311 (60% of
# head, z 3.22), the big eyes rows 312-336 centred z 3.13 (67.6%), nostrils
# z 2.955, smile rows 362-371 (89.5%, z 2.85 — the spec's own mouth landmark,
# correct on this sheet), chin/neck z 2.72. Ear line z ~3.11, the head's
# widest row, ears standing ~0.11ft proud per side.
# ★ ROUND 3: THE CHIN WAS 0.13 TOO LOW. With rz 0.50 the skull reached
# z 2.57 while the drawing's jaw ends at ~2.70 — the silhouette kept narrowing
# past the true pinch and the head measured 34.5% against the drawing's 32.2.
HEAD_CENTER = (0.0, -0.020, 3.100)
HEAD_RADII = (0.440, 0.460, 0.400)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.05, 1.04),
    (-0.30, 1.06),
    (-0.60, 1.03),
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
    """Gentle — the big eyes are atlas marks. Eye centre z 3.13 is nz 0.12."""
    dz = nz - 0.075
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.022
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A soft round button above the smile (nostrils z 2.955, nz -0.23)."""
    if abs(nx) > 0.20:
        return 0.0
    dz = nz + 0.280
    if dz < -0.13 or dz > 0.14:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.20) ** 2)
    bridge = 0.017 * across * max(0.0, 1.0 - abs(dz - 0.08) / 0.10)
    reach = 0.110 if dz >= 0.0 else 0.120
    t = dz / reach
    tip = 0.110 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# ★ HIS EARS ARE HUGE AND FULLY DRAWN — the head's widest row (z 3.11) with
# ~0.11ft proud per side, bigger even than Sprout's.
EAR_SPEC = EarSpec(center=(0.020, 3.115), radii=(0.1700, 0.2000))

# Island solved for his span: brow at generator row 32 lands z 3.22 (60.3% of
# the 3.995→2.712 head), eyes at row 42 land z 3.13 (67.4%), mouth at row 76
# lands z 2.85 (89.2%) — each within half a point of the traces above.
FACE_ISLAND = (0.92, -1.188, 1.837)

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
    """The RENDERED face's forward extent at (x, z), for the hair tuck.

    ★ THE FACE IS FLATTENED AND THE RAW ELLIPSOID IS NOT WHERE IT RENDERS.
    `head_surface` scales the front's depth by (0.88 - 0.11·frontness²), so
    the real face sits up to 0.11ft SHALLOWER than the bare ellipsoid — and a
    tuck that buries hair 0.05 behind the raw ellipsoid leaves it 0.05 in
    FRONT of the rendered face. Seven rounds of fringe-arc surgery could not
    move Chip's eye-covering band because the band was this: skin-hugging
    "buried" hair floating just proud of the flattened face, painting it
    brown. The centre-column walk that found it reads hair luminance from
    z 3.29 to 3.05 with the arc at 3.44. Sentinel where no skull exists
    (Bubbles' lesson)."""
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
# The dome sits over the skull from z ~3.42 to the button at 3.995; the brim
# reaches ~0.68ft forward of the axis across z 3.45-3.30. Front silhouette of
# the dome is the figure's own outline at cap rows.
#
# measured: front z=3.90 halfWidth=0.2870
# measured: front z=3.74 halfWidth=0.4656
# measured: front z=3.58 halfWidth=0.5359
# measured: front z=3.42 halfWidth=0.5622
# measured: view2 z=3.58 halfWidth=0.5900 tol=0.06
CAP_LEVELS = [
    (3.980, 0.100, 0.100, -0.020),
    (3.930, 0.240, 0.250, -0.030),
    (3.860, 0.360, 0.400, -0.040),
    (3.780, 0.440, 0.480, -0.045),
    (3.700, 0.490, 0.530, -0.050),
    (3.600, 0.530, 0.560, -0.050),
    (3.500, 0.552, 0.570, -0.045),
    (3.430, 0.560, 0.565, -0.040),
    (3.380, 0.540, 0.540, -0.030),
]

BRIM_Z_ROOT = 3.460
BRIM_Z_TIP = 3.340
# ★ THIS WAS 0.600, AND AT 0.600 THE BILL POINTED BACKWARDS.
#
# `BRIM_REACH` is the tip's ABSOLUTE forward y, and the plate's root is the
# dome's own front ring — `CAP_LEVELS[-2]` at y_centre -0.040, half_y 0.565,
# so dome_front = -0.605. A tip at -0.600 is 0.005ft LESS far forward than its
# own root: the brim sloped back into the dome and projected no bill at all,
# which is why the board reads as a bike helmet rather than a ball cap.
#
# It is batch 6's Theo lesson exactly — "the bill/brim reach is the TIP's
# absolute forward y; a reach less than the dome's own front projects NO bill"
# — and it survived because the round-6 note beside it described a lighting
# intent ("raised and flattened the plate so the key light reaches the
# forehead") that reads like a decision rather than a regression. Chasing the
# forehead's key light shortened the bill past its own root.
#
# 0.680 is this file's own measured citation, at the top of this section: "the
# brim reaches ~0.68ft forward of the axis across z 3.45-3.30". The number was
# in the header the whole time; only the constant drifted.
BRIM_REACH = 1.050
BRIM_HALF_W = 0.640
BRIM_THICK = 0.030


def build_cap(builder: MeshBuilder, detail: int) -> None:
    """The crown (team surface, cream front panel) and the double-sided brim."""
    # 18 keeps mirror columns and the LOD0 budget (polish-round bevel cost).
    segments = 18 if detail >= 2 else (10 if detail == 1 else 8)
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
            # The team panel spans the forward ~70 degrees above the brim;
            # everything else is his own navy crown.
            colour = TEAM_MASK if (frontness > 0.62 and z < 3.90) else CAP_NAVY
            ring.append(builder.vertex((x, y, z), colour, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), CAP_NAVY, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.025), CAP_NAVY, "Head")
    # ★ ONLY THE PANEL LIVES ON M_ACCESSORY. The whole cap shipped on slot 3
    # in rounds 1-9 and the runtime tinted the navy crown olive — slot 3 IS
    # the team-tinted material, so it may carry only the geometry that is
    # meant to change colour (the front panel), exactly as build_leg's band
    # rule and Bubbles' scrunchie already encode.
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
    # The brim: a curved plate, top and underside, both team-tinted.
    steps = 4 if detail >= 2 else 2
    cols = 7 if detail >= 2 else 5
    dome_front = CAP_LEVELS[-2][3] - CAP_LEVELS[-2][2]  # ~ -0.605 at the root ring
    # ★ A BILL THAT DOES NOT CLEAR ITS OWN ROOT IS NOT A BILL. Refuse the table
    # rather than build a backwards plate: the tip is at -BRIM_REACH and the
    # root at dome_front, so the tip must be the more forward (more negative) of
    # the two by a margin that actually reads. 0.05ft is the smallest overhang
    # visible at the board's cap scale. This shipped at -0.600 against a root of
    # -0.605 and no gate saw it, because every gate measures the SILHOUETTE and a
    # bill buried in the dome changes none of it.
    assert -BRIM_REACH < dome_front - 0.05, (
        f"brim tip y={-BRIM_REACH:.3f} does not clear the dome front "
        f"{dome_front:.3f} by 0.05ft — raise BRIM_REACH; a shorter reach "
        "projects no bill (Theo's batting helmet, batch 6)"
    )
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
                # The brim curls up at its sides.
                zz = z + 0.045 * (u * u) * (1 - 0.3 * t)
                row.append(builder.vertex((x, y, zz), CAP_NAVY, "Head"))
            rows_b.append(row)
        builder.grid(rows_b, 2, cyclic=False, flip=underside)


# --- The hair: tufts under the cap ---------------------------------------------
#
# Wavy brown tufts peek below the cap line: a fringe curl on the forehead
# (rows 252-269 of the sheet), side sweeps over the ear tops, and a nape tuft.
# A shallow ring-loft hugging the skull between cap edge and ears.
#
# ★ THE CURL FIELD — sculptlib/hair.py holds the mechanism; the old
# `sin(6θ + 2.1·row)` was an odd function with a row phase (double mirror
# violation) and delivered 5% of the concept's strand count. measured:
# the concept reads ~5.8 minima/row on his visible band — three mirror
# pairs at 24 columns hold the four-per-lobe floor. 20 → 24 columns
# re-quantizes the fringe (the very trim lesson recorded below), so
# faceSkin was re-measured after the change, per that lesson's own rule.
CURL_SEEDS = curl_seeds(
    pairs_per_row=3,
    bands=5,
    z_top=3.420,
    z_bottom=2.920,
    amplitude=0.075,
)
CURL_THETA_WIDTH = 0.24
CURL_Z_WIDTH = 0.075
CURL_TROUGH = 0.020

# measured: front z=3.26 halfWidth=0.6237
# measured: front z=3.02 halfWidth=0.6296
HAIR_LEVELS = [
    (3.440, 0.545, 0.545, -0.020),
    (3.360, 0.570, 0.560, 0.000),
    (3.260, 0.600, 0.560, 0.020),
    (3.160, 0.590, 0.540, 0.040),
    (3.060, 0.540, 0.500, 0.070),
    (2.880, 0.300, 0.270, 0.145),
]

# Round 2: the arc dropped at |x| 0.32 and the temple shell draped over the
# eye corners (eyes span |x| 0.12-0.25, top z 3.19); the arc now holds above
# the eyes through their whole span and falls only past their corners.
# Round 7: the arc was authored 0.13 low — the sheet's fringe wisps sit at
# rows 252-269 (z 3.54-3.44), peeking UNDER the brim, with the forehead OPEN
# from 3.44 down to the brows at 3.23. The low arc draped hair across the
# eyes in every round-1..6 board.
# Round 8: with the flattened-face tuck actually burying sub-arc hair, the
# arc drops to 3.36 so a real fringe strip (3.36-3.44) hangs below the brim —
# the wavy fringe the first review found missing — while the eyes (top 3.18)
# keep 0.18 of clearance.
# Round 10: the 3.37 strip hid exactly behind the brim plate (tip z 3.34) —
# the fringe must poke BELOW the brim to read from the front.
# The temple descent moved out (0.34/0.42 → 0.37/0.46) when the ring went
# 24 columns: the re-quantized fringe column flipped onto the face and took
# visible-face-right from 23.9 to 15.2 against tolerance 6 — the same
# window-widens-with-the-mass rule Theo's shell paid for. Re-measured back
# in tolerance after the move.
HAIR_FRINGE = [
    (0.00, 3.300),
    (0.14, 3.295),
    (0.24, 3.280),
    (0.37, 3.240),
    (0.46, 3.020),
    (0.60, 2.920),
]

HAIR_OPEN_BOTTOM = 2.70


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
    """Tuft band between cap and face — Grizz's construction, fourth proving."""
    # 24 (was 20; an 18-ring TRIM once flipped a fringe column onto the
    # face and cost 4.7 points — the quantization class works in both
    # directions, so the change was re-measured: see the field note above).
    segments = 24 if detail >= 2 else (8 if detail == 1 else 8)
    levels = HAIR_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in HAIR_LEVELS], detail)
    ascending = list(reversed(levels))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
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
                if HAIR_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    # ★ THE SENTINEL COLUMNS TUCK TOO. Columns laterally
                    # OUTSIDE the skull get the -10 sentinel, and the first
                    # seven rounds left them at the full ellipse — a forward
                    # wall of hair columns just past the face's edge whose
                    # quads draped across both eyes. Isolated by building
                    # once without the hair: the face was perfect beneath.
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.070) if sf > -9.0 else -0.300)
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


# --- The hoodie ----------------------------------------------------------------
#
# Green from the collar (z ~2.55) to a ribbed hem at 1.30; boxy through the
# chest with the belly carrying the mass. Widths traced off the green runs
# (arms clear below the sleeves at the hem rows): z 1.50 torso run 102-237 =
# half 0.395; depth from the profile: z 1.98 span 707-830 = half 0.360,
# belly 1.68 half 0.387.
# measured: front z=2.71 halfWidth=0.2489
# measured: view2 z=1.98 halfWidth=0.3601 tol=0.06
TORSO_LEVELS = [
    (1.240, 0.365, 0.330, "Hips"),    # hem underside
    (1.262, 0.416, 0.370, "Hips"),    # lower rib
    (1.280, 0.428, 0.379, "Hips"),    # upper rib, proudest
    (1.330, 0.392, 0.352, "Hips"),
    (1.500, 0.395, 0.370, "Spine"),   # traced
    (1.700, 0.390, 0.387, "Spine"),   # the belly
    (1.950, 0.378, 0.360, "Spine1"),
    (2.150, 0.360, 0.330, "Spine1"),
    (2.300, 0.340, 0.300, "Spine2"),
    (2.420, 0.300, 0.262, "Spine2"),  # shoulder slope
    (2.500, 0.240, 0.220, "Spine2"),
    (2.560, 0.268, 0.246, "Spine2"),  # hood collar mouth
    (2.590, 0.298, 0.276, "Spine2"),  # the hood's draped roll, proud and round
    # ★ HEM SWEEP: the hole ring shipped at 0.252/0.230 against the neck
    # loft's interpolated 0.2524/0.2268 at the same z — clearance -0.000, the
    # turbo/ace sawtooth-collar class (neckline-clearance-scan.mjs). Two lofts
    # at different column counts (torso 18, neck 14) interpenetrating at the
    # neckline zigzag per column, and the profile board read the zigzag's
    # silhouette corners as rips (chip-profile-apose-review.png x 245-260 and
    # 290-300 / y 285-300). The visible edge must be the ring itself:
    # not-traceable: neck + >=0.008 construction clearance (0.2524+0.0096 x,
    # 0.2268+0.0092 y); the sheet draws the collar closed against the neck.
    (2.620, 0.262, 0.236, "Spine2"),  # neck hole, clear of the neck loft
]

# The pinch is at the bottom of the neck and widens into the jaw.
# measured: front z=2.70 halfWidth=0.2489 tol=0.04
# Round 2: the neck was 0.155 against a drawn 0.249-half pinch, and the
# figure's narrowest row landed at the collar (head read 34.9% against 32.2).
# The neck reaches DOWN INTO the collar: rounds 2-4 left a 0.03 gap between
# neck bottom and hood mouth, and the pinch detector found the grazing sliver
# in it (a 0.179ft "neck") instead of the drawn 2.712 waist.
NECK_LEVELS = [
    (2.600, 0.256, 0.230, "Spine2"),
    (2.712, 0.236, 0.212, "Neck"),
    (2.780, 0.248, 0.224, "Neck"),
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
                  proud: float, colour, top_colour, bone: str, bevel: bool = False) -> None:
    """A raised rectangular panel on the hoodie front."""
    steps = 4 if bevel else 3
    rows = []
    for j in range(steps + 1):
        z = z1 - (z1 - z0) * j / steps
        half_w, half_d = torso_ring_at(z)
        row = []
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            inner = max(0.10, 1.0 - (x / half_w) ** 2)
            # With `bevel` the rim rows sink toward the body so the plate
            # reads as a sewn pouch, not a stuck-on slab (polish finding).
            rim = bevel and (j in (0, steps) or i in (0, steps))
            y = -half_d * sqrt(inner) - (proud * 0.30 if rim else proud)
            row.append(builder.vertex((x, y, z), top_colour if j == 0 else colour, bone))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False, flip=True)


def build_hoodie_details(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    # The kangaroo pocket: a wide proud pouch with a darker top edge.
    surface_patch(builder, -0.235, 0.235, 1.38, 1.68, 0.052, SHIRT, SHIRT_DARK, "Spine", bevel=True)
    # The hood: a real draped volume on the upper back — round 9 grew it after
    # two reviews read the first bump as "a faint ridge" (it was half-buried
    # in the torso), and a knit roll rings its mouth.
    builder.ellipsoid((0.0, 0.345, 2.460), (0.270, 0.160, 0.215), 1, SHIRT, "Spine2", 8, 5)
    # Collar bunching so the drape reads from the FRONT too (polish finding).
    # ★ HEM SWEEP: the front bunches shipped GRAZING the collar loft — front
    # reach -0.210 against the loft surface -0.213 at their own (x, z) — so
    # the intersection was a tangential sliver whose pointed tip read as a rip
    # (chip-profile-apose-review.png x 245-260 / y 285-300, the same class as
    # the neck-hole sawtooth one table up). Proud by 0.027 they overlap the
    # loft as round bunches; 8x4 segments so the crest is a curve, not a
    # corner (ace's collar-rib fin is the counterexample).
    builder.ellipsoid((0.145, -0.180, 2.565), (0.095, 0.060, 0.052), 1, SHIRT_DARK, "Spine2", 8, 4)
    builder.ellipsoid((-0.145, -0.180, 2.565), (0.095, 0.060, 0.052), 1, SHIRT_DARK, "Spine2", 8, 4)
    # The nape bunch crested past the collar top into open silhouette (top
    # z 2.645 vs the hole ring 2.620) and its 6-segment facets cut the hard
    # angular notch at x 290-300 / y 285-300 of the same board. Tucked (top
    # 2.620) and rounded, it stays a bunch inside the collar's own outline.
    builder.ellipsoid((0.0, 0.250, 2.550), (0.230, 0.080, 0.070), 1, SHIRT_DARK, "Spine2", 8, 4)
    # The kangaroo pouch's side openings: two dark slits where the hands go in.
    surface_patch(builder, -0.245, -0.215, 1.40, 1.62, 0.046, SHIRT_DARK, SHIRT_DARK, "Spine")
    surface_patch(builder, 0.215, 0.245, 1.40, 1.62, 0.046, SHIRT_DARK, SHIRT_DARK, "Spine")


# --- Arms: long hoodie sleeves, cuffs at the wrist -----------------------------
#
# The sleeves run the whole arm to ribbed cuffs just above the hands.
SLEEVE_HEM_X = 1.290

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the arms;
# the bare-hand width is the traced number (knuckles ~0.075 half).
ARM_STATIONS = [
    (0.215, 0.158, SHIRT, "Arm"),
    (0.300, 0.163, SHIRT, "Arm"),
    (0.335, 0.156, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.143, SHIRT, "Arm"),
    (0.620, 0.128, SHIRT, "Arm"),
    (ARM_ELBOW_X, 0.120, SHIRT, "ForeArm"),
    (SLEEVE_HEM_X - 0.030, 0.110, SHIRT, "ForeArm"),
    (SLEEVE_HEM_X, 0.120, SHIRT_DARK, "ForeArm"),      # ribbed cuff, proud
    (SLEEVE_HEM_X + 0.024, 0.112, SHIRT_DARK, "Hand"),
    (SLEEVE_HEM_X + 0.038, 0.086, SHIRT_DARK, "Hand"),
    (SLEEVE_HEM_X + 0.054, 0.062, SKIN, "Hand"),
    (1.400, 0.064, SKIN, "Hand"),
    (1.460, 0.072, SKIN, "Hand"),   # knuckle line
    (1.510, 0.062, SKIN, "Hand"),
]

CHIP_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.100,   # the fuller cap that closes the thin-neck puncture (Sprout's lesson)
    root_ring=0.0,
    elbow=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.550,
        finger_root=1.502,
        finger_offsets=((-0.048, 0.0, 0.048), (-0.033, 0.033)),
        finger_lengths=((0.106, 0.120, 0.108), (0.112, 0.117)),
        finger_widths=(0.027, 0.026, 0.021, 0.014),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.390, -0.036, -0.019),
            (1.438, -0.059, -0.031),
            (1.474, -0.072, -0.039),
            (1.495, -0.078, -0.043),
        ),
        thumb_widths=(0.026, 0.024, 0.019, 0.013),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Shorts, bare knees, striped socks -----------------------------------------
#
# Navy shorts from under the hoodie hem to z ~1.13; bare legs to the sock tops
# at ~0.58; cream socks with the green stripe at ~0.52 fold into navy shoes at
# ~0.45. Shin traced 0.264ft wide (radius 0.132).
SHORTS_HEM_Z = 1.130
INSEAM_TOP_Z = 1.230
INSEAM_HEM_Z = 0.580
INSEAM_HEM_HALF = 0.105


def inseam_half(z: float) -> float:
    """The legs part just below the shorts."""
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=2.71 runs=1
LEG_STATIONS = [
    (1.500, 0.190, 1.14, PANTS, "UpLeg"),
    (1.320, 0.205, 1.16, PANTS, "UpLeg"),
    (1.200, 0.212, 1.14, PANTS, "UpLeg"),
    (1.160, 0.218, 1.10, PANTS_DARK, "UpLeg"),        # hem band, proud
    (SHORTS_HEM_Z, 0.210, 1.06, PANTS_DARK, "UpLeg"), # hem underside
    (1.108, 0.155, 1.02, PANTS_DARK, "UpLeg"),        # inner lip
    (1.090, 0.148, 1.00, SKIN, "UpLeg"),              # bare leg begins
    (0.950, 0.140, 1.01, SKIN, "Leg"),
    (0.820, 0.146, 1.01, SKIN, "Leg"),                # the calf
    (0.680, 0.134, 1.00, SKIN, "Leg"),
    (0.600, 0.130, 1.00, SKIN, "Leg"),
    (0.580, 0.134, 1.00, SOCK, "Leg"),                # sock top
    (0.545, 0.132, 1.00, STRIPE, "Leg"),              # the green stripe
    (0.520, 0.130, 1.00, STRIPE, "Leg"),
    (0.495, 0.128, 1.00, SOCK, "Leg"),
    (0.470, 0.120, 0.99, SOCK, "Leg"),
    (0.430, 0.104, 0.98, SOCK, "Foot"),               # into the shoe (top ~0.45)
    (0.300, 0.092, 0.97, SOCK, "Foot"),
    (0.150, 0.088, 0.95, SOCK, "Foot"),
]

CHIP_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Navy canvas high-ish sneakers with cream cupsole and toe bumper — Tank's
# family, at Chip's scale: per-shoe front extent ~0.49ft, topline ~0.45.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 15.0 * pi / 180.0

# not-traceable: the last's fore-aft profile has no sheet view; the scales it
# is built to are the traced numbers above.
SHOE_STATIONS = [
    (-0.439, 0.062, 0.230, SOLE),
    (-0.388, 0.112, 0.266, SOLE),
    (-0.314, 0.148, 0.294, SOLE),
    (-0.228, 0.170, 0.308, SOLE),
    (-0.131, 0.182, 0.314, SOLE),
    (-0.034, 0.188, 0.316, SOLE),
    (0.057, 0.187, 0.314, SOLE),
    (0.137, 0.176, 0.306, SOLE),
    (0.188, 0.150, 0.294, SOLE),
    (0.239, 0.112, 0.252, SOLE),
]

# not-traceable: a cross-section is a fore-aft cut no view can give; the band
# heights are the boundaries beside SHOE_BANDS.
SHOE_SECTION = [
    (0.000, 0.000, "midsole"),
    (0.620, 0.004, "midsole"),
    (0.950, 0.030, "midsole"),
    (1.000, 0.120, "midsole"),
    (0.988, 0.270, "midsole"),
    (0.820, 0.300, "quarter"),
    (0.805, 0.430, "quarter"),
    (0.785, 0.560, "quarter"),
    (0.758, 0.690, "quarter"),
    (0.722, 0.810, "quarter"),
    (0.662, 0.880, "collar"),
    (0.520, 0.950, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_MID = [
    (0.000, 0.000, "midsole"),
    (0.970, 0.060, "midsole"),
    (0.988, 0.270, "midsole"),
    (0.820, 0.300, "quarter"),
    (0.785, 0.560, "quarter"),
    (0.722, 0.810, "quarter"),
    (0.662, 0.880, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_LOW = [
    (0.000, 0.000, "midsole"),
    (0.988, 0.270, "midsole"),
    (0.820, 0.300, "quarter"),
    (0.722, 0.810, "quarter"),
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


SHOE_LENGTH_SCALE = 1.04
SHOE_WIDTH_SCALE = 1.02
SHOE_HEIGHT_SCALE = 1.40

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Navy upper over a cream cupsole; cream trim collar under the sock fold.
# ★ ROUND 3: THE CONCEPT'S IN-BAND PAIR IS CREAM AND TAN — its navy sits
# mostly ABOVE the 9%-of-figure measuring band (concentrated at the ankle),
# and the "second tone" #bb9c73 is the warm shaded vamp. The stack follows:
# cream sole, tan vamp zone, navy from mid-height up.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.330, "collar"),
    (0.540, "quarter"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    """The cream toe bumper — small, so it does not bury the navy the tone
    split measures (Sprout's round-2 lesson)."""
    if y_unscaled > -0.27:
        return 2.0
    frac = min(1.0, max(0.0, (-0.27 - y_unscaled) / 0.17))
    return 0.87 - 0.09 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    """The heel patch's lower edge."""
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.62 - 0.20 * frac


CHIP_SHOE = ShoeSpec(
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
    collar=(0.022, 0.110),
    straps=((-0.170, -0.122), (-0.060, -0.012)),
    strap_arc_min=0.55,
    heel_point=(0.286, 0.112 + 0.026),
    toe_point=(-0.470, 0.046 + 0.044),
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
    build_cap(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    def hoodie_colour(theta, z):
        # The ribbed hem band and the hood's neckline roll read as knit.
        if 1.250 < z <= 1.30 or 2.575 < z <= 2.605:
            return SHIRT_DARK
        return SHIRT
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, 18 if detail >= 2 else segments,
                 color_fn=hoodie_colour)
    build_hoodie_details(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=CHIP_ARM)
        build_leg(builder, side, detail, spec=CHIP_LEG)
        build_shoe(builder, side, detail, spec=CHIP_SHOE,
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
    obj["recessReference"] = "chip-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # ⚠️ Pre-convention blends carry stray meshes (an Icosphere here) that
    # export beside the LODs and eat the budget — remove EVERY mesh.
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    settings = {
        "kid_chip_LOD0": (20, 12, 2),
        "kid_chip_LOD1": (8, 4, 1),
        "kid_chip_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "chip")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Chip reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against chip-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cap (team surface).\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- chip\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_chip_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
