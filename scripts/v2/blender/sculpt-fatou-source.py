"""Rebuild Fatou Diallo (the `zippy` slot) as a reference-authored character.

Run from the repository root:
  blender --background assets/v2/source/fatou-pilot.blend \
    --python scripts/v2/blender/sculpt-fatou-source.py

★ FATOU IS THE FIRST HEAD COVERING. Her sport hijab is one close wrap on the
hair slot: a ring loft over the whole head whose front columns are SNAPPED
onto the face opening's edge instead of cut out of it, so the rim is a clean
oval at any column count, with a paler underscarf strip across the forehead
and a neck wrap that tucks into the tee's collar. It replaces the previous
kid's cap, headband, pigtails and ears: nothing of her hair or ears is drawn
on the sheet, so none is built.

Her body is the slot's previous one (Zippy Kwan's), and the sheet draws the
same outfit — two-tone pink striped tee, navy dolphin shorts — so the torso,
arm, leg and shoe tables below carry over and are RE-CITED against her own
sheet (`sculpt-sharing.lint`: a table copied to the byte is the wrong child).

The conversion: front figure 717px over 4.0ft → 1px = 0.005579ft (crown row
176, soles row 893). The profile faces +x. Head band: hijab crown row 176
(z 4.00) to neck pinch row 384 (z 2.84) — 29.0% of the figure.
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
from sculptlib.head import HeadSpec, head_surface
from sculptlib.leg import LegSpec, build_leg, leg_x
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, ARM_SHOULDER_X, LEG_ANKLE_Z, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/fatou-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/fatou-face-atlas.png"
REVISION = "fatou-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet samples (5x5 means): lit cheek #793B22, forehead #804125, shaded arm
# #5F2B13; hijab #17737F at the lit crown, #0E5E68 at the back, #074A4F in the
# folds; underscarf band #8ACBC8; dark pink #D63556, light pink #FDB2B3; navy
# #1B1D28; sock #F3E6DD.
# Deep skin is authored ABOVE the sheet's value on purpose: the board ramp
# delivers about authored/1.2 with chroma compressed (Grizz's lesson), and at
# the sheet's own #793B22 the lit face lands under `isSkin`'s luminance floor.
SKIN = rgba("8A4424")
SKIN_SHADOW = rgba("5E2A14")
HAIR = rgba("0F5964")        # the hijab's teal — on the hair slot, her own colour
HIJAB_DARK = rgba("0A4A52")  # the wrap's underside and neck folds
BAND = rgba("8ACBC8")        # the underscarf strip across the forehead
SHIRT = rgba("FFB7BC")       # the tee's light-pink ground
SHIRT_DARK = rgba("F0456A")  # the dark-pink stripes
PANTS = rgba("2C3040")       # navy dolphin shorts
PANTS_DARK = rgba("1F2230")
SOCK = rgba("FFF6E6")
SHOE = rgba("333A58")        # navy upper
WHITE = rgba("FFF2D2")       # cream cupsole
SOLE = rgba("F6E0B8")        # cream toe bumper, laces, trim piping
# The team accent is the SOCK ROLL — one thin ring, the roster's convention
# (Grizz). Not the hijab: it is hers, and does not turn green when she is
# drafted by the green team.
TEAM_MASK = rgba("D8D2C6")

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
# Solved from her own feature rows. Bounded luminance traces down the eye and
# centre columns of the front view (the analyser refuses all three on deep
# skin): brow bands rows 237-243 (centre 240, z 3.643), eyes rows 264-294
# (centre 279, z 3.425), the open grin rows 327-357 (centre 340, z 3.085).
# Through the island below, whose anchors sit at +0.47, -0.007 and -0.72 of
# the vertical radius, centre 3.425 and radius 0.485 land them at 3.653, 3.422
# and 3.076. The skull's top (3.91) is under the wrap's forehead edge.
# measured: front z=3.42 halfWidth=0.407 tol=0.04
# Width and depth are the sheet's too: visible face half-width 0.407 at z 3.42
# (the wrap's edge sits at the skull's flank, so the face IS the skull's width),
# and in profile the face runs 0.45ft ahead of the neck axis with the cloth's
# edge only 0.12 ahead — a deep face, most of it in front of the wrap.
HEAD_CENTER = (0.0, -0.060, 3.425)
HEAD_RADII = (0.405, 0.470, 0.485)

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


# No ears are built: the sheet's wrap covers both in all five views (crop the
# profile — cloth from temple to jaw, cheek in front of it, no ear anywhere).

# The island is the slot's own (the face marks carried over); the skull above
# was solved THROUGH it, so its anchors land on her traced feature rows.
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


# --- The sport hijab ------------------------------------------------------------
#
# One wrap on the hair slot. Outline rows are the front silhouette's own
# half-widths and the profile's depths; the wrap stands about 0.08ft off the
# skull at the temples and bulges behind the head, where the sheet gathers it.
# (z, half-width, half-depth, y-centre) — strictly descending in z.
# measured: front z=3.42 halfWidth=0.505
# measured: front z=3.82 halfWidth=0.368
# measured: front z=3.06 halfWidth=0.393
# measured: front z=2.84 halfWidth=0.195
# Depths are the profile's own: the wrap's back edge behind the neck axis
# (0.56 at z 3.42, 0.34 at z 3.02, 0.19 at the pinch), so it bulges behind
# the crown and tapers in to the nape instead of hanging like a bob. The last
# row runs INSIDE the tee's collar: with the wrap ending above it a strip of
# bare neck showed, narrower than the pinch, and the head box took that row.
HIJAB_LEVELS = [
    (3.988, 0.095, 0.108, 0.000),   # a rounding row: without it the apex is a cone point
    (3.955, 0.198, 0.225, 0.000),
    (3.910, 0.273, 0.300, -0.008),
    (3.866, 0.326, 0.345, 0.000),
    (3.821, 0.368, 0.388, 0.008),
    (3.777, 0.402, 0.425, 0.012),
    (3.688, 0.446, 0.470, 0.025),
    (3.598, 0.477, 0.498, 0.030),
    (3.509, 0.494, 0.520, 0.030),
    (3.420, 0.505, 0.528, 0.030),
    (3.331, 0.502, 0.522, 0.030),
    (3.241, 0.488, 0.495, 0.030),
    (3.152, 0.452, 0.445, 0.030),
    (3.063, 0.393, 0.370, 0.030),
    (2.974, 0.312, 0.285, 0.024),
    (2.929, 0.257, 0.238, 0.014),
    (2.884, 0.226, 0.212, 0.012),
    (2.862, 0.200, 0.196, 0.014),   # a gather: in
    (2.840, 0.188, 0.190, 0.014),   # the pinch: a clear 2px under both neighbours
    (2.812, 0.214, 0.206, 0.016),   # the cloth swells over the first gather
    (2.770, 0.224, 0.212, 0.016),
    (2.742, 0.206, 0.200, 0.014),   # a second, lower gather: in
    (2.712, 0.228, 0.214, 0.010),
    (2.660, 0.222, 0.208, 0.004),   # and the hem turns IN, under the tee's collar
    (2.610, 0.200, 0.190, 0.000),
]

# The face opening: the skin's own half-width by height on the front view, a
# rounded oval from the forehead (under the band) to the point of the chin.
# (z, half-width of visible face) — strictly descending in z.
# measured: front z=3.42 halfWidth=0.407 tol=0.03
HIJAB_OPENING = [
    (3.865, 0.000),
    (3.850, 0.150),
    (3.800, 0.260),
    (3.750, 0.310),
    (3.688, 0.340),
    (3.598, 0.365),
    (3.509, 0.390),
    (3.420, 0.407),
    (3.331, 0.407),
    (3.241, 0.410),
    (3.152, 0.396),
    (3.063, 0.360),
    (2.974, 0.279),
    (2.929, 0.215),
    (2.884, 0.137),
    (2.845, 0.000),
]

# Where the underscarf ends and skin begins: the skin's own upper edge on the
# front view, by lateral offset. Between this and the opening's rim is band.
# (|x|, z of the skin's top edge)
# measured: front z=3.69 halfWidth=0.290 tol=0.03
BAND_LOWER = [
    (0.000, 3.782),
    (0.150, 3.777),
    (0.237, 3.732),
    (0.290, 3.688),
    (0.330, 3.643),
    (0.358, 3.585),   # and back along the temple, as the profile draws it
    (0.386, 3.515),   # tapering to nothing ON the rim: stopped short, it left
                      # a wedge of bare skin at the temple, where hair would be
]

# The rows that are the neck's GATHERS: the wrap is cloth, and a critic read the
# first build as a hood partly because nothing on it folded. Each `in` row
# above is 0.01-0.02 narrower than its neighbours and painted the fold tone.
# Two, unevenly spaced: four even ones read as a ribbed turtleneck.
HIJAB_FOLD_ROWS = (2.862, 2.742)
# How far the crown may stand proud of the skull under it, ft. Left to the
# outline ellipse the crown's front ran 0.10 ahead of the forehead and then
# stepped back to the rim: a brim, on every still.
HIJAB_CROWN_PROUD = 0.055

# How far the rim stands proud of the face it frames, ft.
HIJAB_RIM_PROUD = 0.032


def opening_half_at(z: float) -> float:
    """The face opening's half-width at height z; 0 outside it.

    ★ NEVER WIDER THAN THE FACE IT FRAMES. The sheet's opening is traced on a
    drawn jaw; the built jaw narrows a little sooner, and where the opening
    was wider than the skull the rim stood off it in mid-air — two see-through
    slots beside the chin (three silhouette runs at z 2.93-3.14 on the first
    board). The rim rides the skull's own flank wherever the trace overshoots.
    """
    table = HIJAB_OPENING
    if z >= table[0][0] or z <= table[-1][0]:
        return 0.0
    half = 0.0
    for (z0, h0), (z1, h1) in zip(table, table[1:]):
        if z >= z1:
            half = h0 + (h1 - h0) * (z0 - z) / (z0 - z1)
            break
    flank = skull_surface_x(HEAD_CENTER[1], z)
    return max(0.0, min(half, flank * 0.985))


def face_y(x: float, z: float, proud: float) -> float:
    """A point `proud` in front of the rendered face at (x, z)."""
    sf = skull_front_y(x, z)
    return (sf - proud) if sf > -9.0 else (HEAD_CENTER[1] - HEAD_RADII[1] * 0.2 - proud)


def build_hijab(builder: MeshBuilder, detail: int) -> None:
    """The wrap: a ring loft whose face-side columns snap onto the opening.

    ★ SNAPPED, NOT CUT. Deciding per vertex whether a column is inside the
    opening draws stair-steps at any column count (Greta's bob). Here every
    vertex that would fall inside the opening is MOVED to the opening's edge
    at its own height, so each row contributes exactly two rim points and the
    rim is the authored oval. Quads whose four corners are all on the rim are
    not emitted — that is the hole.
    """
    levels = HIJAB_LEVELS
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "HIJAB_LEVELS must be strictly descending in z"
    # Even counts only: the face columns must mirror (Dex's parity lesson).
    segments = 24 if detail >= 2 else (12 if detail == 1 else 8)
    use = levels if detail >= 2 else thin_for_lod(list(levels), detail)
    ascending = list(reversed(use))
    rows = []      # vertex indices
    sides = []     # 0 = on the wrap, -1 / +1 = snapped to that side's rim
    for z, half_x, half_y, y_centre in ascending:
        half_open = opening_half_at(z)
        ring, ring_side, rim = [], [], {}
        for column in range(segments):
            # Column 0 sits at +x; the front (-y) is theta = 3*pi/2.
            theta = 2 * pi * (column + 0.5) / segments
            x = half_x * cos(theta)
            y = y_centre + half_y * sin(theta)
            side = 0
            if y < y_centre and abs(x) < half_open:
                side = 1 if x >= 0 else -1
                if side not in rim:
                    rx = side * half_open
                    rim[side] = builder.vertex((rx, face_y(rx, z, HIJAB_RIM_PROUD), z), HAIR, "Head")
                ring.append(rim[side])
            else:
                if y < y_centre:
                    # Never let the wrap sink into the face it frames...
                    y = min(y, face_y(x, z, HIJAB_RIM_PROUD))
                    # ...nor wrap FORWARD of its own rim: the sheet's profile
                    # shows the cloth's edge about 0.12ft ahead of the neck
                    # axis with the whole cheek in front of it. Left to the
                    # outline ellipse the sides came 0.25 forward and hid the
                    # face in profile like a hood.
                    if half_open > 0.0:
                        y = max(y, face_y(half_open, z, HIJAB_RIM_PROUD) + 0.022)
                    elif z > HIJAB_OPENING[0][0]:
                        # Above the opening the crown lies ON the forehead where
                        # there is one, and above the skull it arcs back to the
                        # apex on a quarter-ellipse that starts at the rim's own
                        # top — one curve from apex to band, no overhang.
                        if skull_front_y(x, z) > -9.0:
                            y = max(y, face_y(x, z, HIJAB_CROWN_PROUD))
                        top_z = HIJAB_OPENING[0][0]
                        apex_z = levels[0][0] + 0.012
                        t = min(1.0, max(0.0, (z - top_z) / (apex_z - top_z)))
                        rim_top_y = face_y(0.0, top_z, HIJAB_CROWN_PROUD)
                        y = max(y, rim_top_y * sqrt(max(0.0, 1.0 - t * t)))
                colour = HIJAB_DARK if any(abs(z - fold) < 0.004 for fold in HIJAB_FOLD_ROWS) else HAIR
                ring.append(builder.vertex((x, y, z), colour, "Head" if z > 2.80 else {"Head": 0.5, "Neck": 0.5}))
            ring_side.append(side)
        rows.append(ring)
        sides.append(ring_side)
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.012), HAIR, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for (lower, upper), (ls, us) in zip(zip(rows, rows[1:]), zip(sides, sides[1:])):
        for column in range(segments):
            nxt = (column + 1) % segments
            quad = (lower[column], lower[nxt], upper[nxt], upper[column])
            snapped = (ls[column], ls[nxt], us[nxt], us[column])
            # Only a quad with ALL FOUR corners on the rim is inside the opening.
            # One that joins the two rims to wrap vertices above or below is the
            # opening's own top or bottom edge: skipping those too left a slot
            # clean through the figure under the chin (the head-box detector
            # found it as a 14px 'neck' at z 2.93).
            if all(snapped):
                continue
            distinct = []
            for index in quad:
                if index not in distinct:
                    distinct.append(index)
            if len(distinct) >= 3:
                builder.face(tuple(distinct), 2)

    # The underscarf: a paler strip on the forehead, from just under the rim
    # down to the skin's own top edge. Tucked 0.012 inside the rim's own
    # stand-off so the wrap's edge overhangs it, as cloth over cloth does.
    if detail >= 1:
        columns = 11 if detail >= 2 else 5
        span = BAND_LOWER[-1][0]
        upper_row, lower_row = [], []
        for column in range(columns):
            x = -span + 2 * span * column / (columns - 1)
            ax = abs(x)
            # The rim's height above this x: the opening's UPPER branch.
            upper_z = HIJAB_OPENING[0][0]
            for (z0, h0), (z1, h1) in zip(HIJAB_OPENING, HIJAB_OPENING[1:]):
                if h1 >= h0 and h0 <= ax <= h1:
                    upper_z = z0 + (z1 - z0) * (ax - h0) / (h1 - h0) if h1 > h0 else z0
                    break
            lower_z = BAND_LOWER[-1][1]
            for (x0, z0), (x1, z1) in zip(BAND_LOWER, BAND_LOWER[1:]):
                if x0 <= ax <= x1:
                    lower_z = z0 + (z1 - z0) * (ax - x0) / (x1 - x0)
                    break
            lower_z = min(lower_z, upper_z - 0.01)
            upper_row.append(builder.vertex((x, face_y(x, upper_z, HIJAB_RIM_PROUD - 0.012), upper_z), BAND, "Head"))
            lower_row.append(builder.vertex((x, face_y(x, lower_z, 0.016), lower_z), BAND, "Head"))
        for column in range(columns - 1):
            builder.face((lower_row[column], lower_row[column + 1], upper_row[column + 1], upper_row[column]), 2)


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

# not-traceable: her neck is inside the wrap in all five views (the sheet's
# narrowest row, 0.195 half at z 2.84, is CLOTH); this skin column only has to
# stay inside the wrap's own pinch and reach the collar.
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

FATOU_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.100,
    root_ring=0.0,
    elbow=0.0,
    underarm_shade=0.0,
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
    (0.545, 0.118, 1.00, TEAM_MASK, "Leg"),           # the sock's roll: THE team accent
    (0.520, 0.116, 1.00, TEAM_MASK, "Leg"),
    (0.505, 0.109, 1.00, SOCK, "Leg"),                # plain white crew sock
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

FATOU_LEG = LegSpec(
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


FATOU_SHOE = ShoeSpec(
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

    build_hijab(builder, detail)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, PANTS, 8 if detail >= 2 else 6)
    if detail >= 2:
        builder.loft(TORSO_LEVELS_CRISP, 1, SHIRT, 17, color_fn=stripe_color)
    else:
        builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                     color_fn=stripe_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=FATOU_ARM)
        build_leg(builder, side, detail, spec=FATOU_LEG)
        build_shoe(builder, side, detail, spec=FATOU_SHOE,
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
    obj["recessReference"] = "fatou-turnaround.png"
    return obj


# not-traceable: authored canonical grip reach, retaining this character's
# finger-pad girth; separate knuckles put the digits in the palm plane.
REFERENCE_HAND_SHAPE = dict(
    finger_offsets=(-0.024, 0.026, 0.076),
    finger_lengths=(0.16, 0.17, 0.15),
    finger_widths=(0.027, 0.026, 0.024, 0.016),
    thumb_widths=(0.032, 0.035, 0.028, 0.016),
)


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # Purge EVERY mesh: a re-cast slot's bootstrapped .blend opens holding the
    # previous kid under these same LOD names (and whatever else rode along).
    for old in [obj for obj in bpy.data.objects if obj.type == "MESH"]:
        bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_zippy_LOD0": (20, 12, 2),
        "kid_zippy_LOD1": (8, 4, 1),
        "kid_zippy_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "zippy")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Fatou Diallo reference-authored production source (slot: zippy)\n\n"
        "The three LOD meshes were rebuilt against fatou-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock-roll accent.\n"
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
