"""Rebuild Mars as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/mars-pilot.blend \
    --python scripts/v2/blender/sculpt-mars-source.py

★ MARS TOOK THE `calls_shot` SLOT IN THE WORLD 1 RE-CAST (November 2026). The
id is the slot — model filename, registry key, pick-tally key — so everything
here still answers to `calls_shot`; the character is Marisol "Mars" Delacruz,
the slugger who calls her shot.

Her read: a long wavy black mane falling BEHIND broad square shoulders, a
huge grin under thick brows, a tomato-red tee, cuffed denim shorts, and cream
high-tops over red-striped socks. Both ears stand clear of the hair.

★ THIS IS HER SECOND SHEET. The first drew her with older-kid proportions —
shoulder line at z 2.88 on a rig whose shoulder joint is at 2.471 — and was
sent back before any table was authored. This one holds the roster's
proportions: the tee starts at z 2.51 and the head is 36% of the figure.

The conversion: her front figure runs 654px over the rig's 4.0ft (rows
213-867), so 1px = 0.006107ft about a centre column of x 170. The profile
figure is 650px (rows 216-866), 1px = 0.006144ft.

⚠️ THE PROFILE FIGURE FACES +X ON THE SHEET (the nose is the right edge, x 785
at z 3.10). The rig's forward is -y. The depth axis is taken at image x 686 —
the torso's midpoint at z 1.90 (x 624-758) and within 8px of the legs.

The spec (`scripts/v2/turnaround-specs/mars.spec.json`) refuses her brow and
eye bands (the mane's dark sides merge with them); the feature rows below are
bounded traces off an enlarged crop.
"""

from __future__ import annotations

from math import cos, pi, sin, sqrt
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
from sculptlib.rig import ARM_ELBOW_X, LEG_ANKLE_Z, hem_follows_thighs, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/mars-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/mars-face-atlas.png"
REVISION = "mars-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette, sampled off mars-turnaround.png as window means --------------
#
#   cheek (x118-132, y372-384)   #BB491D     forehead (y268-282)   #DA6A3C
#   forearm (y560-590)           #C35829     leg (y700-720)        #9E4F29
#   hair lit (y232-244)          #684D40     hair mid (y300-330)   #28180D
#   tee (y480-500)               #F63931     tee shade             #D52520
#   shorts (y598-612)            #3B526E     cuff (y627-633)       #999EA4
#   shoe (y815-832)              #F2CEB3     sole (y856-860)       #EBBD96
#
# ★ DEEP SKIN IS AUTHORED BRIGHTER THAN IT IS SAMPLED (Grizz's first board):
# the ramp delivers ~0.63-0.79 of an authored channel, and at the sheet's own
# value a deep cheek falls under the skin test's luminance floor and the face
# metric reads zero. ⚠️ But not by much: build 1 authored #D8642E, between her
# cheek and her lit forehead, and the runtime's lit look delivered a bright
# orange where the sheet is a deep red-brown. This is her cheek's own hue a
# little above its value — the luminance floor clears with 10 to spare.
SKIN = rgba("BE5A30")
SKIN_SHADOW = rgba("8E401C")
# Warm black, between the mane's modal #28180D and its lit strand tops
# #684D40 — at the modal value the ramp renders a hole (Grizz's afro).
HAIR = rgba("3C2A20")
HAIR_DARK = rgba("22160E")   # the wave troughs and the underside
# The tee is held at its sampled value, not ·1.2: a mid-value warm garment
# beside skin has to keep its own value (Greta's tee, Grizz's before it).
SHIRT = rgba("E22E26")
SHIRT_DARK = rgba("B01E18")  # the collar rib and the sleeve hem
PANTS = rgba("47637F")       # denim, ·1.2 of the sampled #3B526E
PANTS_DARK = rgba("2E4258")
CUFF = rgba("B6BCC6")        # the rolled cuff: the denim's pale reverse
SOCK = rgba("FFF0DC")
STRIPE = rgba("D83A30")      # the sock's lower stripe: her tee's red
# The shoe band reads cream #FDE3CC (64%) and tan #CC946C (27%) at a mean
# saturation of 35 on the sheet — the tan is the rubber cupsole with its red
# foxing line. A two-tone sole, as on Greta and Dazzle.
SHOE = rgba("FFD8AE")        # cream canvas high-top
WHITE = rgba("D68848")       # the rubber cupsole — the band's second tone
SOLE = rgba("F6DCBE")        # toe bumper, collar and laces
# The drafting team's colour lands on the sock's TOP stripe — one thin proud
# ring pair per leg (the bare-leg lane's convention: Grizz, Bendy, Flash,
# Turbo, Rocket). The lower stripe stays her own red.
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Bounded traces on an enlarged crop of the front view (x 25-315, y 200-490):
#
#   hair crown           row 213  z 3.995     hairline at the part  row 257  z 3.727
#   brows, centre        row 299  z 3.471     eyes, centre          row 343  z 3.202
#   nose, centre         row 368  z 3.046     the grin, centre      row 400  z 2.851
#   chin                 row 442  z 2.594     collar top (centre)   row 455  z 2.515
#   face at the eye row  0.437 half           cheeks, widest        0.452 half at z 3.00
#   jaw at z 2.75        0.319 half           ear outer span        1.249ft (0.624 half)
#
# The skull is fitted to that face: centre z 3.22 puts the eye row at the
# equator and rz 0.626 puts the chin at 2.594; the cranium tops out at 3.85
# under 0.15ft of hair. Depth from the profile: the face plane at x 759
# (y -0.45) and the cranium's back near y +0.49 inside the mane.
HEAD_CENTER = (0.0, -0.040, 3.220)
HEAD_RADII = (0.437, 0.520, 0.626)

# Full round cheeks: 0.452 half at z 3.00 (nz -0.35, ellipsoid 0.409) and
# still 0.319 at z 2.75 (nz -0.75, ellipsoid 0.289).
FACE_SCALE = (
    (1.00, 1.00),
    (0.20, 1.00),
    (0.00, 1.02),
    # Build 1 shipped this table 5-10 points lower through the cheeks and the
    # first independent review measured the jaw row at 16.9% of figure height
    # against the sheet's 19.8 — "an egg rather than a round, full-cheeked
    # face". The traced halves were right; the ellipsoid sheds more than the
    # table gave back.
    (-0.20, 1.09),
    (-0.35, 1.16),
    (-0.60, 1.20),
    (-0.75, 1.22),
    (-0.90, 1.14),
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
    """Big bright eyes — a shallow dish at the eye row (z 3.202, nz -0.03);
    the atlas carries the rest."""
    dz = nz + 0.029
    dx = abs(nx) - 0.520
    radial = (dx * dx) / 0.075 + (dz * dz) / 0.036
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A soft round button at row 368 (z 3.046, nz -0.278); on the profile
    the tip stands 26px (0.16ft) proud of the cheek plane. A dome, not a cone
    (Greta's first review): a flat-topped falloff."""
    if abs(nx) > 0.22:
        return 0.0
    dz = nz + 0.278
    if dz < -0.12 or dz > 0.13:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.22) ** 2)
    bridge = 0.010 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.105 if dz >= 0.0 else 0.110
    t = dz / reach
    # 0.150, was 0.095: the second review measured the tip 1.4% of figure
    # height proud of the brow plane against the sheet's 3.5.
    tip = 0.150 * across ** 0.80 * max(0.0, 1.0 - t * t) ** 0.75
    return bridge + tip


# Both ears stand clear of the mane — the hair is tucked behind them. Front
# view: ears rows 349-404 (z 3.16-2.83, centre 2.995), outer span 204px =
# 1.249ft against the 0.874ft face at the eye row. Profile: the ear is centred
# x 674, 0.07ft behind the depth axis. The spec's own earLine (69.4%) is the
# mane's widest row; this is the bounded trace.
EAR_SPEC = EarSpec(center=(0.070, 2.995), radii=(0.145, 0.175))

# ★ THE FACE-ATLAS WINDOW, SOLVED AGAINST HER OWN ROWS. Latitude is asin(nz):
# eye z 3.202 → -0.029, mouth z 2.851 → -0.630, brow z 3.471 → +0.413. A cell
# row r samples latitude low + span·(1 - r/128); pinning the eye to row 50
# and the mouth to row 85 gives span 2.198 and low -1.368, and the brow lands
# at row 24.3 (the face spec draws it at 24).
FACE_ISLAND = (0.92, -1.368, 2.198)

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


# --- The mane ------------------------------------------------------------------
#
# One closed ring loft: a full crown, widest at the cheeks, then a long fall
# BEHIND the shoulders to the middle of her back. Each level is (z, half_x,
# half_y, y_centre). half_x is the front silhouette, which at head rows IS the
# hair and below the chin is the hair showing either side of the neck; half_y
# and y_centre come from the profile about the x 686 axis.
# ⚠️ Depth reach (y_centre + half_y) is held to 0.615. The sheet's mane reaches
# y +0.63 at z 3.30. Build 1 clamped it to 0.55 for the camera's sake (the
# review render frames the bounding box — batch 4's ponytail) and the first
# independent review measured the head a quarter too shallow in profile:
# 26.4% of figure height against 34.6. Her head metrics cannot be taken on
# either side (the mane hides the neck), so nothing the camera rescales is
# being measured; the depth goes back to the drawing's.
# measured: front z=3.95 halfWidth=0.1893 tol=0.05
# measured: front z=3.85 halfWidth=0.3664 tol=0.05
# measured: front z=3.75 halfWidth=0.4947 tol=0.05
# measured: front z=3.65 halfWidth=0.5649 tol=0.05
# measured: front z=3.55 halfWidth=0.6229 tol=0.05
# measured: front z=3.45 halfWidth=0.6718 tol=0.05
# measured: front z=3.25 halfWidth=0.6962 tol=0.05
# measured: front z=3.05 halfWidth=0.7084 tol=0.05
# measured: front z=2.85 halfWidth=0.6321 tol=0.05
# measured: front z=2.65 halfWidth=0.6443 tol=0.05
# measured: front z=2.55 halfWidth=0.6595 tol=0.05
CAP_LEVELS = [
    (3.970, 0.130, 0.140, -0.050),
    (3.930, 0.240, 0.290, -0.050),
    (3.850, 0.366, 0.430, -0.040),
    (3.750, 0.495, 0.520, -0.010),
    (3.650, 0.565, 0.560, 0.010),
    (3.550, 0.623, 0.575, 0.020),
    (3.450, 0.672, 0.585, 0.020),
    (3.250, 0.696, 0.585, 0.030),
    (3.050, 0.708, 0.560, 0.055),
    (2.850, 0.632, 0.440, 0.165),
    (2.700, 0.620, 0.330, 0.270),
    (2.550, 0.660, 0.225, 0.370),
    (2.400, 0.610, 0.170, 0.420),
    (2.250, 0.500, 0.140, 0.440),
    (2.130, 0.360, 0.110, 0.450),
    (2.060, 0.200, 0.078, 0.455),
]

# The hairline over the face, |x| → the hair's lower edge: a centre part at
# z 3.727, falling past the temples to the top of each ear and then running
# along it, so the ears stay whole. Mirrored on purpose (the faceAsymmetry
# lesson); the sheet's part sits a little to her left.
# not-traceable: the spec refuses the brow and eye bands because the mane
# merges with them, so the hairline is a by-eye geometry trace off the crop.
FRINGE_TABLE = [
    (0.00, 3.727),
    (0.16, 3.700),
    (0.28, 3.610),
    (0.38, 3.450),
    (0.45, 3.300),
    (0.52, 3.200),
    (0.75, 3.170),
]

MANE_BOTTOM = 2.060
# The ring whose forward half is bent onto the hairline — a CAP_LEVELS row.
HAIRLINE_RING_Z = 3.650
# Below the hairline the mane lives BEHIND the ears (ear back edge y +0.21)…
BEHIND_EAR_Y = 0.225
# …and that wall is ONE PLANE all the way down. Build 1 eased it back to
# clear the shoulders and left a 380px window of backdrop behind the nape;
# build 2 eased it forward into the neck and the ramp folded quads beside the
# ear and neck that rendered slate at runtime (first independent review) —
# Greta's navy diamond again. A wall that never moves cannot fold: the NECK
# is deepened to meet it instead (see NECK_LEVELS), and below the collar the
# wall is simply buried inside the tee's yoke.
BEHIND_BACK_Y = BEHIND_EAR_Y
WALL_EASE = (2.800, 2.650)


def wall_y_at(z: float) -> float:
    """The forward wall of the buried/hanging hair at height z."""
    hi, lo = WALL_EASE
    if z >= hi:
        return BEHIND_EAR_Y
    if z <= lo:
        return BEHIND_BACK_Y
    t = (hi - z) / (hi - lo)
    t = t * t * (3 - 2 * t)
    return BEHIND_EAR_Y + t * (BEHIND_BACK_Y - BEHIND_EAR_Y)


def fringe_z_at(x_abs: float) -> float:
    """The hairline's lower edge over the face at lateral offset |x|."""
    table = FRINGE_TABLE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def build_mane(builder: MeshBuilder, detail: int) -> None:
    """The ring loft, with the face and both ears folded out of it.

    The hairline is ONE ring bent onto the line (Greta's lesson: per-vertex
    tests draw stair-steps, per-column snapping draws a sawtooth). On the
    forward half the HAIRLINE_RING's z is bent to FRINGE_TABLE, the rings above
    it are re-spaced between the line and the crown, and the rings below are
    re-spaced beneath it and pulled back to the wall behind the ears and,
    lower down, behind the shoulders.
    """
    levels = CAP_LEVELS
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the runtime lights the mass as a slate-grey void.
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "CAP_LEVELS must be strictly descending in z"
    # 28 columns for 7 wave groups — four samples per lobe (the Nyquist
    # lesson). EVEN, so every column has a mirror partner (Dex).
    segments = 28 if detail >= 2 else (12 if detail == 1 else 6)
    use = levels if detail >= 2 else thin_for_lod([(z, hx, hy, yc) for z, hx, hy, yc in levels], detail)
    ascending = list(reversed(use))
    crown_z = ascending[-1][0]
    floor_z = ascending[0][0]
    rows = []
    for row_index, (z, half_x, half_y, y_centre) in enumerate(ascending):
        # ★ WAVES, NOT FLUTES: the groove's AMPLITUDE alternates row to row
        # (never its phase — a phase shift breaks the mirror: Penny), so a
        # crest on one row sits over a trough on the next and the mass
        # ripples as it falls. Faded out toward the crown.
        swell = 0.052 * min(1.0, max(0.0, (3.86 - z) / 0.25)) if detail >= 2 else 0.0
        wave = swell * (1.0 if row_index % 2 == 0 else -0.6)
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            groove = cos(7.0 * (theta + pi / 2))
            clump = 1.0 + wave * groove
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            vz = z
            colour = HAIR_DARK if (swell > 0.01 and wave * groove < -0.55 * swell) or z < MANE_BOTTOM + 0.02 else HAIR
            wall = wall_y_at(z)
            if y < wall:
                line = fringe_z_at(abs(x))
                if z >= HAIRLINE_RING_Z - 1e-6:
                    # at or above the hairline ring: re-spaced line → crown
                    t = (z - HAIRLINE_RING_Z) / (crown_z - HAIRLINE_RING_Z)
                    vz = line + t * (crown_z - line)
                    sf = skull_front_y(x, vz)
                    if sf > -9.0:
                        # A thin shell on the forehead — thinnest AT the
                        # hairline, thicker above it: the skull is convex
                        # between rings, and at a flat 0.024 its crown poked
                        # through the part as an orange fleck at runtime.
                        y = max(y, sf - (0.030 + 0.055 * t))
                    else:
                        # outboard of the skull there is no forehead to lie
                        # on: hold the column back to the skull's flank
                        y = max(y, HEAD_CENTER[1] - 0.160)
                    if z <= HAIRLINE_RING_Z + 1e-6:
                        colour = HAIR_DARK       # the edge reads as the fringe's shadow
                else:
                    # below it: re-spaced under the line and pulled to the wall
                    t = (HAIRLINE_RING_Z - z) / (HAIRLINE_RING_Z - floor_z)
                    vz = (line - 0.030) - t * (line - 0.030 - floor_z)
                    y = wall_y_at(vz)
                    if abs(x) < skull_surface_x(y, vz):
                        x *= 0.90   # buried: keep it well under the skin
            ring.append(builder.vertex((x, y, vz), colour, "Head" if vz > 2.62 else "Spine2"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.03), HAIR_DARK, "Spine2")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.012), HAIR, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


# --- The tomato-red tee --------------------------------------------------------
#
# A fitted tee from a crew collar (top z 2.515 at the centre) over broad
# square shoulders to a hem at z 1.78 that flares a little over the shorts.
#
# Front view, the tee's own cluster runs: z 2.45 x 95-246 (0.461 half, sleeve
# to sleeve — the shoulder line), z 1.85 x 111-233 (0.373), z 1.95 x 115-227
# (0.342), z 2.05 x 118-225 (0.327, her forearms cover the edges from here
# up to the sleeve hems at z 2.15). Depth is the profile about x 686: front
# +0.44 at the belly (z 1.90-2.10), +0.29 at the collar.
# measured: front z=2.45 halfWidth=0.6290 tol=0.03
# measured: front z=1.85 halfWidth=0.7053 tol=0.03
# not-traceable: the silhouette at these rows runs hair to hair and forearm to
# forearm; the tee's own half-widths are the cluster runs in the header.
TORSO_LEVELS = [
    (1.755, 0.374, 0.384, "Hips"),    # hem underside, tucks back to the shorts
    (1.780, 0.392, 0.402, "Hips"),    # hem lip — proud, overhangs the shorts
    (1.850, 0.376, 0.398, "Hips"),
    (1.950, 0.348, 0.392, "Spine"),
    (2.050, 0.338, 0.380, "Spine"),
    (2.200, 0.356, 0.360, "Spine1"),
    (2.320, 0.396, 0.340, "Spine1"),
    (2.400, 0.444, 0.318, "Spine2"),  # yoke: carries the shoulder out square
    (2.470, 0.454, 0.300, "Spine2"),  # the shoulder's top edge
    # ★ THE SHOULDER LINE CLIMBS TO THE COLLAR, because the sleeve roots do.
    # The rig's shoulder joint is at z 2.471, so a sleeve 0.16 in radius tops
    # out at 2.63 — above a collar authored at the sheet's 2.57. That left a
    # V notch on each side of the neck between sleeve root and collar, and
    # the raised camera looked into it: the "slate wedges at the neck in
    # every runtime still" two reviews filed. The yoke now rises to a collar
    # at z 2.59, level with the chin, and the notch is closed.
    (2.540, 0.404, 0.278, "Spine2"),
    (2.566, 0.300, 0.264, "Spine2"),  # the last tee ring under the rib
    (2.574, 0.246, 0.254, "Spine2"),  # rib lower edge — COLLAR_Z sits inside this pair
    (2.586, 0.212, 0.246, "Spine2"),  # rib crown: a thin band lying in the tee
    (2.594, 0.190, 0.242, "Spine2"),  # neck hole: hugs the neck (0.012 clear)
]

COLLAR_Z = 2.570


def torso_color(theta: float, z: float):
    """SHIRT_DARK rib above COLLAR_Z; the tee everywhere else."""
    return SHIRT_DARK if z >= COLLAR_Z else SHIRT


# The neck: short, under a low chin (z 2.594). Front view, the visible neck
# is x 143-198 at row 449: 0.168 half. It stays INSIDE the collar all the way
# up (Tank), fills it (Greta's "peg"), and its narrowest ring is authored at
# the sheet's own pinch row just under the chin.
# not-traceable: the silhouette at the neck rows is the mane, not the neck
# (0.66 half at z 2.55); the neck's half is the skin run read off the crop.
# ★ And DEEP: 0.230 front to back, so its nape reaches the mane's wall at
# y 0.225 and no backdrop shows between neck and hair in profile.
NECK_LEVELS = [
    (2.520, 0.178, 0.230, "Spine2"),
    (2.575, 0.178, 0.230, "Neck"),
    (2.605, 0.166, 0.230, "Neck"),
    (2.640, 0.168, 0.230, "Neck"),
    # …and TALL at the back: the skull's underside rises toward the nape, and
    # a neck that stopped at 2.640 left a 19px triangle of backdrop between
    # jaw, neck and mane in profile. The top ring is buried inside the head.
    (2.780, 0.160, 0.225, "Neck"),
]


# --- Arms: short red sleeves, long bare arms -----------------------------------
SLEEVE_HEM_X = 0.700

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms. Radii are bounded by the hanging-arm runs in the front view — sleeve
# x 82-126 at z 2.25 (0.135 half), bare upper arm x 74-107 at z 2.05 (0.101),
# forearm x 59-98 at z 1.85 (0.119), and the sleeve hem sits 0.35ft down the
# arm from the shoulder edge (z 2.50 to z 2.15).
ARM_STATIONS = [
    (0.215, 0.158, SHIRT, "Arm"),
    (0.300, 0.160, SHIRT, "Arm"),   # deltoid peak
    (0.335, 0.155, SHIRT, "Arm"),
    (0.400, 0.146, SHIRT, "Arm"),
    (0.560, 0.135, SHIRT, "Arm"),
    (SLEEVE_HEM_X - 0.028, 0.133, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.140, SHIRT_DARK, "Arm"),          # hem band, proud
    (SLEEVE_HEM_X + 0.020, 0.136, SHIRT_DARK, "Arm"),
    (SLEEVE_HEM_X + 0.033, 0.118, SHIRT_DARK, "Arm"),  # the hem's underside
    (SLEEVE_HEM_X + 0.046, 0.104, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.104, SKIN, "ForeArm"),
    (1.100, 0.109, SKIN, "ForeArm"),
    (1.250, 0.096, SKIN, "ForeArm"),
    (1.365, 0.086, SKIN, "Hand"),
    (1.425, 0.091, SKIN, "Hand"),
    (1.490, 0.099, SKIN, "Hand"),   # knuckle line
    (1.540, 0.088, SKIN, "Hand"),
]

MARS_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.090,
    root_ring=0.0,
    elbow=0.0,
    underarm_shade=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.578,
        finger_root=1.534,
        finger_offsets=((-0.052, 0.0, 0.052), (-0.035, 0.035)),
        finger_lengths=((0.112, 0.128, 0.115), (0.119, 0.125)),
        finger_widths=(0.031, 0.030, 0.024, 0.015),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.406, -0.040, -0.020),
            (1.460, -0.066, -0.033),
            (1.500, -0.080, -0.041),
            (1.524, -0.087, -0.045),
        ),
        thumb_widths=(0.031, 0.029, 0.022, 0.013),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Cuffed denim shorts, bare legs, striped socks -----------------------------
#
# The waist rides under the tee's hem (z 1.78); each leg ends in a rolled
# pale cuff from z 1.505 to 1.405 (front rows 613-630 read the cuff as one
# pale run x 90-252). Below it the legs are bare to the sock tops at z 0.68,
# and the socks carry two red stripes above the high-top's collar at z 0.50.
SHORTS_HEM_Z = 1.405

INSEAM_TOP_Z = 1.520
INSEAM_HEM_Z = SHORTS_HEM_Z
INSEAM_HEM_HALF = 0.012


def inseam_half(z: float) -> float:
    """Half the daylight between the shorts legs: none in the seat, then the
    slit the sheet draws between the cuffs (front row 646, x 167-180)."""
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 2.0


# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# Per-leg halves are the front view's own two-run rows; the citations are
# those rows' silhouette reads (halfWidthAt reports the first leg run once the
# hands have cleared, from z 1.15 down).
# ★ A BOX FOR THE SEAT, TWO LEGS BELOW IT (Greta's shorts, three rounds): the
# seat loft stops at z 1.520 where each tube is exactly as wide as it is, and
# the cuffs are the tubes themselves, so there is a leg split and nothing
# crosses.
# measured: front z=1.15 halfWidth=0.1863 tol=0.02
# measured: front z=1.05 halfWidth=0.1832 tol=0.02
# measured: front z=0.95 halfWidth=0.1893 tol=0.02
# measured: front z=0.85 halfWidth=0.1893 tol=0.02
# measured: front z=0.65 halfWidth=0.1527 tol=0.02
# measured: front z=0.55 halfWidth=0.1405 tol=0.02
LEG_STATIONS = [
    (1.600, 0.232, 1.10, PANTS, "UpLeg"),
    (1.560, 0.264, 1.40, PANTS, "UpLeg"),              # emerges just proud of the seat
    (1.505, 0.270, 1.42, CUFF, "UpLeg"),               # the rolled cuff, proud
    (SHORTS_HEM_Z, 0.268, 1.40, CUFF, "UpLeg"),
    (1.398, 0.244, 1.22, PANTS_DARK, "UpLeg"),         # the cuff's inner lip
    (1.388, 0.226, 1.10, SKIN, "UpLeg"),               # bare thigh begins
    (1.250, 0.203, 1.06, SKIN, "UpLeg"),
    (1.100, 0.184, 1.04, SKIN, "UpLeg"),
    (0.950, 0.189, 1.02, SKIN, "UpLeg"),
    (0.850, 0.189, 1.02, SKIN, "Leg"),                 # the calf
    (0.690, 0.158, 0.99, SKIN, "Leg"),
    (0.680, 0.165, 1.00, SOCK, "Leg"),                 # sock top, proud of the shin
    (0.632, 0.164, 1.00, TEAM_MASK, "Leg"),            # top stripe — THE accent
    (0.606, 0.163, 1.00, TEAM_MASK, "Leg"),
    (0.598, 0.160, 1.00, SOCK, "Leg"),
    (0.578, 0.160, 1.00, STRIPE, "Leg"),               # lower stripe: her own red
    (0.554, 0.158, 1.00, STRIPE, "Leg"),
    (0.546, 0.156, 0.99, SOCK, "Leg"),
    (0.480, 0.146, 0.98, SOCK, "Leg"),                 # into the high-top's collar
    (0.280, 0.114, 0.95, SOCK, "Foot"),
    (0.150, 0.108, 0.95, SOCK, "Foot"),
]

# The shorts' waist and seat. It tops out INSIDE the tee (0.37 half under the
# hem lip's 0.392) and stops where the leg tubes take over.
# Front view, denim runs: z 1.65 x 98-245 (0.449 half), z 1.55 x 95-249
# (0.470). Depth from the profile's z 1.70 row (x 635-757).
# measured: front z=1.55 halfWidth=0.7389 tol=0.03
# not-traceable: the shorts' own half-width is read off the denim cluster runs
# in the header, not the silhouette (which runs hand to hand at these rows);
# the top ring is hidden under the tee and no view can give it.
PELVIS_LEVELS = [
    (1.540, 0.452, 0.388, "Hips"),
    (1.600, 0.466, 0.404, "Hips"),
    (1.700, 0.440, 0.402, "Hips"),
    (1.830, 0.370, 0.386, "Hips"),
]

# The seat is carried partly by the thighs so a squat folds it (the
# catcher-squat lesson).
SEAT_THIGH_SHARE = 0.85

MARS_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
    calf=(0.0, 0.0),
    knee=0.0,
)


# --- The shoe: a cream canvas high-top -----------------------------------------
#
# Front view: one shoe is x 60-138 at z 0.15 (0.238 half) and x 59-145 at
# z 0.05 (0.263); the collar meets the sock at z 0.50. Profile: 143px toe to
# heel at z 0.10, 0.879ft.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 14.0 * pi / 180.0

# not-traceable: the last's fore-aft profile has no sheet view; it is the
# family last at her traced width (0.238 half) and a high-top's collar (0.50).
SHOE_STATIONS = [
    (-0.439, 0.080, 0.250, SOLE),
    (-0.388, 0.144, 0.292, SOLE),
    (-0.314, 0.188, 0.330, SOLE),
    (-0.228, 0.216, 0.366, SOLE),
    (-0.131, 0.231, 0.398, SOLE),
    (-0.034, 0.238, 0.414, SOLE),
    (0.057, 0.237, 0.418, SOLE),
    (0.137, 0.223, 0.414, SOLE),
    (0.188, 0.193, 0.404, SOLE),
    (0.239, 0.144, 0.372, SOLE),
]

# ★ THE FOXING STEP IS A SLOPE, NOT A LEDGE. The family section steps in from
# the cupsole to the upper almost horizontally (u 0.99 → 0.83 over 0.03 of v).
# The toe's end cap fans every ring edge to one point, and the fan triangle on
# that ledge is edge-on to the apex: it shades black. On the family's navy
# shoes nobody sees it; on a cream shoe it was "a dark sliver at each toe"
# (first independent review). The step here climbs 0.10 of v as it comes in.
# not-traceable: a cross-section is a fore-aft cut no view can give.
SHOE_SECTION = [
    (0.000, 0.000, "midsole"),
    (0.620, 0.004, "midsole"),
    (0.950, 0.030, "midsole"),
    (1.000, 0.140, "midsole"),
    (0.990, 0.270, "midsole"),   # a thick cupsole
    (0.880, 0.370, "quarter"),
    (0.812, 0.440, "quarter"),
    (0.790, 0.570, "quarter"),
    (0.762, 0.700, "quarter"),
    (0.725, 0.820, "quarter"),
    (0.664, 0.885, "collar"),
    (0.520, 0.950, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_MID = [
    (0.000, 0.000, "midsole"),
    (0.970, 0.060, "midsole"),
    (0.990, 0.270, "midsole"),
    (0.880, 0.370, "quarter"),
    (0.790, 0.570, "quarter"),
    (0.725, 0.820, "quarter"),
    (0.664, 0.885, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_LOW = [
    (0.000, 0.000, "midsole"),
    (0.990, 0.270, "midsole"),
    (0.880, 0.370, "quarter"),
    (0.725, 0.820, "quarter"),
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


SHOE_LENGTH_SCALE = 1.15
SHOE_WIDTH_SCALE = 1.00
SHOE_HEIGHT_SCALE = 1.20

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

SHOE_BANDS = [
    (0.000, "midsole"),
    (0.245, "quarter"),
    (0.840, "collar"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    """No separate toe bumper: 2.0 at every station builds no cap (the family
    cap folds over its own lower edge on a light shoe — Greta's review)."""
    return 2.0


def heel_counter_v_low(y_unscaled: float) -> float:
    """The heel counter's lower edge."""
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.62 - 0.20 * frac


MARS_SHOE = ShoeSpec(
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
    collar=(0.022, 0.120),
    straps=((-0.190, -0.135), (-0.075, -0.020)),
    strap_arc_min=0.52,
    heel_point=(0.286, 0.180),
    toe_point=(-0.447, 0.170),
    upper=SHOE,
    trim=SOLE,
    midsole=WHITE,
)


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    face_columns = 27 if detail >= 2 else (9 if detail == 1 else 5)
    back_columns = 4 if detail >= 2 else (2 if detail == 1 else 1)
    if detail >= 2:
        rows_spec, crown, chin = FACE_ROWS, 3, 2
    elif detail == 1:
        rows_spec, crown, chin = [0.0, 0.184, 0.340, 0.468, 0.660, 1.0], 1, 1
    else:
        rows_spec, crown, chin = [0.0, 0.32, 0.60, 1.0], 1, 1
    head_surface(builder, face_columns, back_columns, rows_spec, crown, chin,
                 spec=HEAD_SPEC, palette=PALETTE)

    build_mane(builder, detail)

    # No ears at LOD2: the pair is what the far LOD's 1200 budget has least
    # use for.
    if detail >= 1:
        for side in (1, -1):
            build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    seat = lambda at, bone: hem_follows_thighs(at, bone, PELVIS_LEVELS[0][0], SEAT_THIGH_SHARE)
    builder.loft(thin_for_lod(PELVIS_LEVELS, detail), 1, PANTS, segments, weight_fn=seat)
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                 color_fn=torso_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=MARS_ARM)
        build_leg(builder, side, detail, spec=MARS_LEG)
        build_shoe(builder, side, detail, spec=MARS_SHOE,
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
    obj["recessReference"] = "mars-turnaround.png"
    return obj


# not-traceable: authored canonical grip reach, retaining this character's
# finger-pad girth; separate knuckles put the digits in the palm plane.
REFERENCE_HAND_SHAPE = dict(
    finger_offsets=(-0.024, 0.027, 0.078),
    finger_lengths=(0.16, 0.17, 0.152),
    finger_widths=(0.030, 0.029, 0.026, 0.016),
    thumb_widths=(0.034, 0.036, 0.029, 0.016),
)


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # ★ PURGE EVERY MESH, not just the LOD roots. This source was bootstrapped
    # from the slot's previous sculpt (Theo), so the scene opens holding HIS
    # three LODs under these same names plus whatever strays rode along; any
    # mesh left behind exports beside hers and eats the size budget unseen
    # (batch 6's stray-mesh lesson).
    for old in [obj for obj in bpy.data.objects if obj.type == "MESH"]:
        bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_calls_shot_LOD0": (20, 12, 2),
        "kid_calls_shot_LOD1": (8, 4, 1),
        "kid_calls_shot_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "calls_shot")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Mars reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against mars-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock's top stripe.\n"
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
