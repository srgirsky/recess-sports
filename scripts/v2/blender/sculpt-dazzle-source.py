"""Rebuild Dazzle as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/dazzle-pilot.blend \
    --python scripts/v2/blender/sculpt-dazzle-source.py

★ DAZZLE IS THE FIRST LONG MANE — one wavy ring-loft from crown to mid-torso
whose curtains frame the face and rest on the shoulders — and the second
dress (Bubbles' torso-loft-is-the-garment construction) with the roster's
first SCULPTED pleated skirt: `skirt_shape` carves the pleat grooves and
scallops the hem band into the loft itself (the hem pass retired the
colour-only wedges, which read as paint). The cream headband rides the mane
like Zippy's.

The conversion: front figure 630px over 4.0ft → 1px = 0.006349ft. The profile
faces +x. Head band: mane top row 191 (z 3.99) to neck pinch row 398
(z 2.68) — 32.9% of the figure.
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
OUTPUT = REPO / "assets/v2/source/dazzle-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/dazzle-face-atlas.png"
REVISION = "dazzle-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: auburn hair #642302 (with #8C3B0B lights), dress purple
# #5D3A63, lit skin #FB9C53 over shadow #CB6D2B, cream #F8EDE3 for headband,
# trim, socks and soles. Ramp-authored per the calibrated boards.
SKIN = rgba("FCA054")
SKIN_SHADOW = rgba("C4732E")
HAIR = rgba("8F3A10")        # rich auburn — the lit wave tops
HAIR_DARK = rgba("5A2408")   # the trough tone between waves (two-tone mane paint)
SHIRT = rgba("6F4A7C")       # the dress purple ("SHIRT" is the garment lane)
SHIRT_DARK = rgba("FFF4E2")  # the cream trim lane: collar, cuffs, waistband
PANTS = rgba("4E3159")       # the pleat-shadow purple, two steps deeper
PANTS_DARK = rgba("472E52")
SOCK = rgba("FFF6E6")
SHOE = rgba("66456F")        # purple high-top canvas
WHITE = rgba("FFF6DC")       # cream cupsole
SOLE = rgba("FFD092")        # warm-tan toe bumper, laces, collar roll —
                             # the classifier pair on this sheet is cream +
                             # warm tan (#f6ece1/#f2cda3); purple never makes
                             # the band pair on high-tops
# The team accent is the HEADBAND, Zippy's convention — cream on the sheet so
# the untinted board reads true, tinted at runtime.
TEAM_MASK = rgba("D8D2C6")
STAR = rgba("F2C24E")        # the gold waist star — identity, stays authored

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: soft thick brows rows 264-271 (37% of the
# 3.99→2.68 head, z 3.51), the big eyes rows 289-318 centred row 303 (54.1%,
# z 3.28), nostrils rows 333-335, the closed smile rows 344-349 (76.1%,
# z 2.99). The mane owns the width metrics; both ears are DRAWN VISIBLE in
# front and profile (poking out at the jaw beside the curtains).
HEAD_CENTER = (0.0, -0.020, 3.250)
HEAD_RADII = (0.400, 0.440, 0.440)

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
    """Big sweet eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.010
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small button above the smile (centre nz -0.32)."""
    if abs(nx) > 0.17:
        return 0.0
    dz = nz + 0.320
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.17) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.085 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Both ears are drawn fully visible (front AND profile — the sheet pokes
# them out at the jaw beside the curtains; an earlier comment claiming they
# hide was the propagating-false-claim class and is scrubbed).
# measured: dazzle.spec.json landmarks.earLine 78.3% of head (3.99→2.68) is
# the ear's LOWER THIRD — the drawn ear spans 54.8-83.9% of head with its
# CENTRE at 69.4% → z 3.081. Centering ON the earLine (2.964) left the
# visible tip at the jaw; the critic re-traced the span.
EAR_SPEC = EarSpec(center=(0.020, 3.081), radii=(0.1250, 0.1500))

# Island solved for her span: brow anchor 20 lands z 3.502 (37.25% of the
# 3.99→2.68 head against the traced 37.0), eye anchor 50 lands z 3.281 (54.1
# vs 54.1), mouth anchor 84 lands z 2.991 (76.3 vs 76.1). The spec REFUSES
# all three landmarks — the mane merges every band; the rows above are the
# bounded traces.
FACE_ISLAND = (0.92, -1.367, 2.300)

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
# One wavy mass from the crown to mid-torso: curtains frame the face, the
# widest rows rest across the shoulders, and the tips taper at z ~2.25.
# measured: front z=2.94 halfWidth=0.7651
# measured: front z=3.42 halfWidth=0.5905
# measured: front z=2.38 halfWidth=0.7651 tol=0.06
# Strands are VERTICAL grooves, so rows trade for columns (the Grizz rule):
# 24 columns blew the LOD0 budget by 132, and rows 3.240, 2.760 and 2.460
# are linear interpolations of their neighbours to within 0.022 half-width
# (checked numerically before deleting) — the barrel keeps its shape, the
# crown rounding rows and the widest row stay, and the export gets smaller.
MANE_LEVELS = [
    (3.900, 0.105, 0.115, 0.000),
    (3.820, 0.240, 0.260, 0.000),
    (3.700, 0.350, 0.380, 0.010),
    (3.560, 0.420, 0.455, 0.020),
    (3.400, 0.460, 0.500, 0.030),
    (3.080, 0.500, 0.540, 0.070),
    (2.920, 0.520, 0.560, 0.090),
    (2.600, 0.545, 0.500, 0.130),
    (2.340, 0.480, 0.360, 0.170),
    (2.250, 0.330, 0.240, 0.190),
]

# The hairline: an open face with a centre part — high across the forehead,
# the curtains closing past the temples and hanging beside the jaw.
# The curtain boundary moved OUT and UP (0.27/0.33/0.40 → 0.30/0.37/0.44):
# the tighter table walled the profile face to 46.4% visible skin against
# the sheet's 91.5% — the sheet hangs the curtains behind the jaw with the
# whole face clear. (The mass must not eat the face — the Mimi/Theo rule.)
# The sheet's profile hairline is NEAR-VERTICAL at the temple: headband down
# past the eye to the ear, the WHOLE face clear, mane behind the ear. The
# earlier slopes (0.27→3.38→3.00→2.76, then 0.30/0.37/0.44 at 3.44/3.16/2.90)
# each left proud above-the-fringe wall columns over the cheek — the profile
# face was a sliver at 46.4% visible skin against the sheet's 91.5%.
MANE_FRINGE = [
    (0.00, 3.560),
    (0.20, 3.540),
    (0.30, 3.460),
    (0.40, 3.400),
    (0.48, 3.300),
]

MANE_OPEN_BOTTOM = 2.280

# ★ THE WAVE FIELD — sculptlib/hair.py holds the mechanism. The old clump was
# `1 + 0.05·sin(8θ + 1.7·row)`: a row-varying PHASE, the exact pattern the
# Penny lesson forbids (sin is odd — the term breaks the mirror outright),
# and at 18 columns its 8 lobes had 2.25 samples each. measured:
# `npm run measure:strands -- diva` reads the CONCEPT at 5.86 strand
# minima/row — three mirror pairs put 6 lobes across a row and 24 columns
# give them the four-column floor. Widths at the Mimi rule: θw ≈ half the
# 1.05 seed half-spacing; zw ≈ half the 0.17 band gap.
MANE_SEEDS = curl_seeds(
    pairs_per_row=3,
    bands=10,
    z_top=3.850,
    z_bottom=2.320,
    amplitude=0.080,
)
MANE_THETA_WIDTH = 0.24
MANE_Z_WIDTH = 0.085
# Two-tone: lit auburn wave tops over the deep-auburn troughs.
MANE_TROUGH = 0.022

# ★ NO RADIAL EAR DENT — tried at depth 0.16 and 0.19 and REMOVED. Pulling
# the shell laterally inside the ear tips exposed both ears from the FRONT
# as skin blobs beside the chin, where the sheet's front view keeps them
# fully under the mane. What actually clears the ear (and the whole
# profile face) is the face-band DEPTH floor in ring_loft_mane: the sheet
# hangs the mane BEHIND the ear in y, not thinner in x. The ear's rear
# half staying under the wall matches the drawing.


def fringe_z_at(x_abs: float) -> float:
    """The mane's open-face edge at lateral offset |x|."""
    table = MANE_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def ring_loft_mane(builder: MeshBuilder, levels, detail: int) -> None:
    """The ring-loft-with-tuck, wavy, with a chest window below the chin."""
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the runtime lights the mass as a slate-grey void.
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_mane levels must be strictly descending in z"
    segments = 24 if detail >= 2 else (10 if detail == 1 else 8)
    use = levels if detail >= 2 else thin_for_lod([(z, hx, hy, yc) for z, hx, hy, yc in levels], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            f = (curl_field(
                theta, z, MANE_SEEDS,
                theta_width=MANE_THETA_WIDTH,
                z_width=MANE_Z_WIDTH,
            ) if detail >= 2 else 0.0)
            clump = 1.0 + f
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                in_face_band = 2.800 < z < 3.440
                if MANE_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    if sf > -9.0:
                        # +0.110, not +0.050: at +0.050 the window hair is a
                        # film one twentieth of a foot behind the face plane,
                        # and the PROFILE's visible skin is only that sliver —
                        # the "face erased to 46.4%" mechanism. The skull
                        # fills the space behind, so no see-through pocket.
                        y = max(y, sf + 0.110)
                    elif abs(x) < 0.24:
                        # Below the chin the centre stays open to the chest —
                        # the dress front (~-0.24) hides what little remains,
                        # and the neck front (-0.13) stays clear of hair.
                        y = max(y, -0.085)
                    else:
                        # Face band: the wall starts behind the cheek's WIDEST
                        # sweep, which sits near mid-depth (y≈0) — recessions
                        # to -0.12 and -0.15 both still walled the cheek, and
                        # the front view loses nothing (its width comes from
                        # the back-half columns). Elsewhere the chest floor.
                        y = max(y, -0.020 if in_face_band else -0.300)
                else:
                    # ★ THE PROFILE FACE IS EATEN LATERALLY, NOT IN DEPTH. A
                    # side-wall column at x 0.44-0.50 exceeds the cheek's own
                    # half-width (~0.42), so from the profile it hides the
                    # face at EVERY depth its span covers — receding it in y
                    # is the only carve that shows the cheek, and the y-clamp
                    # here is what decides. In the face band the front half
                    # of the wall starts BEHIND the cheek's sweep (-0.150);
                    # everywhere else the old -0.320 keeps the mane full.
                    floor = -0.020 if in_face_band else -0.320
                    y = max(y, (sf - 0.060) if sf > -9.0 else floor)
            tone = HAIR if f > MANE_TROUGH else HAIR_DARK
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


# The headband: seated on the MANE's own surface +0.012 (an arc floated at
# skull depth is invisible inside the hair — Zippy's lesson). THE team-accent
# surface (material 3).
# not-traceable: the band's own width hides under hair in every view; the
# arc it rides is the mane surface.
# The arc stays HIGH on the crown — the first cut bulged forward at the
# apex and the band read as a V dipping onto the forehead.
HEADBAND_ARC = [
    (-0.440, -0.140, 3.440),
    (-0.375, -0.200, 3.585),
    (-0.300, -0.230, 3.700),
    (-0.170, -0.258, 3.800),
    (0.000, -0.243, 3.840),
    (0.170, -0.258, 3.800),
    (0.300, -0.230, 3.700),
    (0.375, -0.200, 3.585),
    (0.440, -0.140, 3.440),
]


def build_hair(builder: MeshBuilder, detail: int) -> None:
    ring_loft_mane(builder, MANE_LEVELS, detail)
    if detail >= 1:
        arc = HEADBAND_ARC if detail >= 2 else HEADBAND_ARC[::4]
        builder.tube(arc, [0.046] * len(arc), 3, TEAM_MASK, "Head", 4)


# --- The dress: one loft, collar to pleated hem --------------------------------
#
# Bubbles' construction: the torso loft IS the garment. Cream ringer collar,
# purple bodice, cream waistband with the gold star, and the skirt flaring to
# the hem with an inner lip for thickness.
#
# ★ THE PLEATS ARE GEOMETRY NOW (the hem-pass finding: "a smooth cone with a
# flat hem — no pleats" against a concept whose signature garment is a pleated
# A-line; colour wedges alone "read only softly"). `skirt_shape` carves 6
# grooves into the skirt loft — 12 fold lines against the sheet's ~13-14
# (front z=1.30 fold creases at x 95/103/128/171/213/251, a ~25.5° spacing;
# 6 is the Nyquist cap at 24 columns, the 4-columns-per-lobe floor) — and the
# same comb lifts the hem-band rows into the drawn scallop (front hem contour
# swings 9px = 0.057ft over the central 70% of its run, mean hem z 1.118).
# The comb is even under theta -> pi - theta (Penny's faceAsymmetry lesson:
# cos(k*(theta - pi/2)), amplitude varies by row, never the phase), grooves
# land on the front/back meridians where the sheet draws its centre crease,
# and the silhouette tangents (theta 0/pi) sit on uncarved ridges so the
# cited hem half-width still ships. Pleat geometry is LOD0-only; colour
# wedges carry the read at distance, as before.
# measured: front z=1.18 halfWidth=0.5873
# not-traceable: the bodice's own edges hide between the mane's curtains and
# the hanging arms at every row; halves there are bounded off the purple
# cluster runs (chest 132-234 at z 2.20, half 0.324 including sleeve caps).
TORSO_LEVELS = [
    (1.130, 0.500, 0.345, "Hips"),    # hem inner lip — the skirt has thickness
    (1.145, 0.560, 0.390, "Hips"),    # hem underside
    (1.180, 0.585, 0.408, "Hips"),
    # The sewn hem band: a ring pair straddling the band top (crisp edge) with
    # the band standing 0.010 proud of the cone's own trend (interp 1.180->
    # 1.300 gives 0.568/0.399 at z 1.212) — Penny's waistband lip, worn at the
    # hem. Band height 1.180-1.212 = 0.032ft inside the roster's 0.02-0.04.
    # not-traceable: the sheet draws the hem roll as a soft brightening over
    # the last ~10px (71->79 at x=150) with no crisp band edge to trace.
    (1.212, 0.578, 0.409, "Hips"),    # hem band lip, proud
    (1.224, 0.561, 0.396, "Hips"),    # the skirt cone resumes; crisp edge
    (1.300, 0.520, 0.372, "Hips"),
    (1.420, 0.455, 0.335, "Hips"),
    (1.520, 0.380, 0.295, "Hips"),
    (1.600, 0.290, 0.245, "Hips"),    # skirt gathers at the waistband
    (1.608, 0.292, 0.247, "Spine"),   # crisp lower edge
    (1.616, 0.296, 0.250, "Spine"),   # cream waistband, proud
    (1.644, 0.294, 0.248, "Spine"),
    (1.652, 0.290, 0.246, "Spine"),   # crisp upper edge
    (1.800, 0.278, 0.240, "Spine"),
    # (2.000) row retired to pay for the hem-band pair: the bodice is near-
    # cylindrical here and 1.800->2.200 interpolates to 0.273 against the
    # retired 0.270 — invisible; the LOD0 budget was 232 triangles.
    (2.200, 0.268, 0.232, "Spine1"),
    (2.360, 0.262, 0.222, "Spine2"),
    (2.440, 0.240, 0.205, "Spine2"),
    (2.510, 0.196, 0.172, "Spine2"),
    (2.560, 0.155, 0.142, "Spine2"),
    (2.585, 0.150, 0.138, "Spine2"),  # cream ringer collar, proud
    (2.615, 0.138, 0.128, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

WAISTBAND = (1.610, 1.650)
SKIRT_TOP = 1.610

# The pleat comb. 6 grooves = 12 fold lines (the sheet draws ~13-14; capped by
# Nyquist at 24 columns). Grooves at theta = 90° + n*60° — the front/back
# meridians carry the drawn centre-front crease; ridges at 0°/180° keep the
# silhouette at the table's own width.
PLEAT_COUNT = 6
# not-traceable: fold depth has no silhouette signature on the sheet (the
# drawn skirt outline is smooth — the hair-mass lesson); authored 0.075
# relative (~0.044ft at the hem) so the toon ramp shades each groove.
PLEAT_DEPTH = 0.075
PLEAT_FULL_Z = 1.300      # full depth from here down; 0 at SKIRT_TOP (gathers)
# measured: the front hem contour swings 9px = 0.057ft over its central 70%;
# authored 0.035 as the z component (the radial carve carries the rest).
SCALLOP_LIFT = 0.035
SCALLOP_TOP_Z = 1.240     # the hem-band rows (1.130-1.224) ride the scallop


def pleat_comb(theta: float) -> float:
    """0 on the ridges, 1 in the grooves; even under theta -> pi - theta."""
    return 0.5 + 0.5 * cos(PLEAT_COUNT * (theta - pi / 2))


def pleat_amp(z: float) -> float:
    if z >= SKIRT_TOP:
        return 0.0
    return PLEAT_DEPTH * min(1.0, (SKIRT_TOP - z) / (SKIRT_TOP - PLEAT_FULL_Z))


def skirt_shape(theta: float, z: float) -> tuple[float, float]:
    """(radial scale, z lift) for one skirt vertex — the pleats and the scallop."""
    comb = pleat_comb(theta)
    scale = 1.0 - pleat_amp(z) * comb
    lift = SCALLOP_LIFT * comb if z <= SCALLOP_TOP_Z else 0.0
    return scale, lift


def dress_color(theta: float, z: float):
    if z > 2.570:
        return SHIRT_DARK  # the cream ringer collar
    if WAISTBAND[0] <= z <= WAISTBAND[1]:
        return SHIRT_DARK  # the cream waistband
    if z < SKIRT_TOP:
        # The fold shadow, phase-locked to the carved grooves (the old
        # sin(6*theta) wedges were odd under the mirror; pleat_comb is even).
        # PANTS_DARK, not PANTS: the line is one column wide and interpolates
        # 15° each side, and the toon ramp washed the two-step purple to
        # near-invisible on the first board — the crease needs the deep step.
        return PANTS_DARK if pleat_comb(theta) > 0.55 else SHIRT
    return SHIRT


def pleated_loft(builder: MeshBuilder, levels, material: int, color, segments: int,
                 color_fn=None, shape_fn=None) -> None:
    """`MeshBuilder.loft` with a `shape_fn(theta, z) -> (scale, dz)` hook.

    Copied winding-for-winding from `loft` (the Grizz inside-out lesson: copy
    the exact quad order and cap fans) — the only addition is the per-vertex
    radial scale and z lift the pleats and the hem scallop need. `sculptlib`
    stays untouched: the hook reads this kid's tables, so it lives here.
    """
    rows = []
    for z, rx, ry, bone in levels:
        row = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            scale, dz = shape_fn(theta, z) if shape_fn else (1.0, 0.0)
            at = (rx * scale * cos(theta), ry * scale * sin(theta), z + dz)
            vertex_color = color_fn(theta, z) if color_fn else color
            row.append(builder.vertex(at, vertex_color, bone))
        rows.append(row)
    bottom = builder.vertex((0.0, 0.0, levels[0][0]), color, levels[0][3])
    top = builder.vertex((0.0, 0.0, levels[-1][0]), color, levels[-1][3])
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), material)
        builder.face((rows[-1][column], rows[-1][nxt], top), material)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), material)

# Her neck pinch is z 2.68 at ~0.13 half, mostly framed by the curtains.
# not-traceable: the front silhouette at neck rows is curtain-to-curtain
# (0.71 half); the pinch half here is bounded off the skin run between the
# curtains at z 2.72 (run 166-199, half 0.105) plus the jaw taper.
NECK_LEVELS = [
    (2.605, 0.132, 0.124, "Spine2"),
    (2.700, 0.130, 0.122, "Neck"),
    (2.810, 0.142, 0.134, "Neck"),
]


# --- Arms: cream-cuffed short sleeves, bare arms -------------------------------
SLEEVE_HEM_X = 0.620

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms beside the skirt; the bare forearm traces ~0.055 half.
ARM_STATIONS = [
    (0.215, 0.156, SHIRT, "Arm"),
    (0.300, 0.160, SHIRT, "Arm"),
    (0.335, 0.152, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.140, SHIRT, "Arm"),
    (0.520, 0.128, SHIRT, "Arm"),
    (0.585, 0.121, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.126, SHIRT_DARK, "Arm"),      # cream ringer cuff, proud
    (0.644, 0.118, SHIRT_DARK, "Arm"),
    (0.662, 0.098, SHIRT_DARK, "Arm"),
    (0.682, 0.076, SKIN, "Arm"),
    (0.790, 0.074, SKIN, "Arm"),
    (ARM_ELBOW_X - 0.048, 0.072, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.071, SKIN, "ForeArm"),
    (ARM_ELBOW_X + 0.048, 0.070, SKIN, "ForeArm"),
    (1.240, 0.067, SKIN, "ForeArm"),
    (1.365, 0.063, SKIN, "Hand"),
    (1.412, 0.070, SKIN, "Hand"),
    (1.465, 0.077, SKIN, "Hand"),   # knuckle line
    (1.512, 0.066, SKIN, "Hand"),
]

DAZZLE_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.100,
    root_ring=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.550,
        finger_root=1.502,
        finger_offsets=((-0.045, 0.0, 0.045), (-0.031, 0.031)),
        finger_lengths=((0.102, 0.116, 0.104), (0.108, 0.113)),
        finger_widths=(0.026, 0.025, 0.020, 0.015),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.388, -0.034, -0.017),
            (1.436, -0.056, -0.029),
            (1.472, -0.069, -0.037),
            (1.492, -0.075, -0.041),
        ),
        thumb_widths=(0.026, 0.024, 0.018, 0.014),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Bare legs under the skirt, striped socks, high-tops -----------------------
#
# The skirt hem is z 1.14; her legs are bare to the sock tops at ~0.62, the
# socks carry one purple stripe (0.545-0.505), and the purple high-tops rise
# to a taller topline than the roster's low-top last.
INSEAM_TOP_Z = 1.300
INSEAM_HEM_Z = 0.900
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=1.02 halfWidth=0.3746
LEG_STATIONS = [
    (1.360, 0.140, 1.02, SKIN, "UpLeg"),              # under the skirt
    (1.150, 0.133, 1.01, SKIN, "UpLeg"),
    (0.900, 0.122, 1.01, SKIN, "Leg"),
    (0.760, 0.126, 1.01, SKIN, "Leg"),                # the calf
    (0.650, 0.113, 1.00, SKIN, "Leg"),
    (0.620, 0.123, 1.00, SOCK, "Leg"),                # sock top
    (0.545, 0.113, 1.00, SHIRT, "Leg"),               # the purple stripe
    (0.505, 0.111, 1.00, SHIRT, "Leg"),
    (0.470, 0.109, 1.00, SOCK, "Leg"),
    (0.430, 0.106, 1.00, SOCK, "Leg"),
    (0.400, 0.100, 0.98, SOCK, "Foot"),
    (0.280, 0.092, 0.97, SOCK, "Foot"),
    (0.150, 0.086, 0.95, SOCK, "Foot"),
]

DAZZLE_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=SHIRT,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The high-top shoe ---------------------------------------------------------
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


SHOE_LENGTH_SCALE = 0.98
SHOE_WIDTH_SCALE = 0.94
SHOE_HEIGHT_SCALE = 1.48   # the high-top: topline well above the low-top last

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, purple canvas above.
# The sole is TWO tones on the sheet: cream wall below, warm-tan shading
# above it — the "collar" zone here paints the midsole's upper half in the
# trim tan so the classifier pair balances (52/45 cream/tan).
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.100, "collar"),
    (0.280, "quarter"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    if y_unscaled > -0.16:
        return 2.0
    frac = min(1.0, max(0.0, (-0.16 - y_unscaled) / 0.22))
    return 0.80 - 0.14 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    if y_unscaled < 0.02:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.02) / 0.20))
    return 0.56 - 0.22 * frac


DAZZLE_SHOE = ShoeSpec(
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
    straps=((-0.184, -0.112), (-0.072, 0.004)),
    strap_arc_min=0.55,
    heel_point=(0.286, 0.106 + 0.025),
    toe_point=(-0.470, 0.044 + 0.042),
    upper=SHOE,
    trim=SOLE,
    midsole=WHITE,
)


def build_star(builder: MeshBuilder, detail: int) -> None:
    """The gold five-point star on the waistband — her dazzle."""
    if detail < 1:
        return
    cx, cy, cz = 0.0, -0.262, 1.632
    outer, inner = 0.058, 0.024
    centre = builder.vertex((cx, cy - 0.006, cz), STAR, "Spine")
    ring = []
    for i in range(10):
        a = pi / 2 + i * pi / 5
        r = outer if i % 2 == 0 else inner
        ring.append(builder.vertex((cx + r * cos(a), cy, cz + r * sin(a)), STAR, "Spine"))
    for i in range(10):
        builder.face((centre, ring[i], ring[(i + 1) % 10]), 1)


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

    if detail >= 1:
        for side in (1, -1):
            build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    # 24 columns at LOD0: the Nyquist floor for 6 pleat grooves (4 cols/lobe).
    # The carve is LOD0-only — 8/5 columns cannot express it (the hair lesson);
    # the colour wedges keep carrying the read at LOD1/2, as they always did.
    torso_segments = 24 if detail >= 2 else segments
    pleated_loft(builder, thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
                 color_fn=dress_color,
                 shape_fn=skirt_shape if detail >= 2 else None)
    build_star(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=DAZZLE_ARM)
        build_leg(builder, side, detail, spec=DAZZLE_LEG)
        build_shoe(builder, side, detail, spec=DAZZLE_SHOE,
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
    obj["recessReference"] = "dazzle-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_diva_LOD0", "kid_diva_LOD1", "kid_diva_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_diva_LOD0": (20, 12, 2),
        "kid_diva_LOD1": (8, 4, 1),
        "kid_diva_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "diva")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Dazzle reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against dazzle-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the headband accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- diva\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_diva_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
