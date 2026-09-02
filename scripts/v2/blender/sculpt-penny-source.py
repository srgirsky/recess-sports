"""Rebuild Penny as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/penny-pilot.blend \
    --python scripts/v2/blender/sculpt-penny-source.py

★ PENNY IS THE FIRST OVERALLS — the denim bib is a colour WEDGE on the torso
loft (front and back panels by theta, the pink tee showing at the shoulders
and sides), with real strap strips over the shoulders and gold buttons. Her
curl bob is Bubbles' hard-lobed ringlet loft at bob scale. Her ears are BUILT
(sculptlib.ear, 2026-09-02): the sheet's profile draws the whole ear clear of
the hair, with the curls behind the ear line — see the face-band floor in
`ring_loft_bob`.

The conversion: front figure 677px over 4.0ft → 1px = 0.005908ft. The profile
faces +x. Head band: curl top row 119 (z 3.99) to neck pinch row 355 (z 2.60).
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
OUTPUT = REPO / "assets/v2/source/penny-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/penny-face-atlas.png"
REVISION = "penny-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: fair skin #FBB47B, curl browns #7B4C23/#43240B/#2B1403
# (declared at the modal mid value), denim #334C64 with grey #4B545B shading,
# pink tee #FC939C, cream. Ramp-authored.
SKIN = rgba("FFC38A")
SKIN_SHADOW = rgba("D08E52")
HAIR = rgba("8A5224")        # the curl bob's chestnut
HAIR_DARK = rgba("6A3C18")   # the trough between curls — a step under HAIR, not the
                             # sheet's deepest shadow: at #4E2B10 the trough alone
                             # drove measure:strands' prominence to 230% of the sheet
SHIRT = rgba("FFA6B0")       # the pink ringer tee
SHIRT_DARK = rgba("FF7A8C")  # the tee's deeper trim pink
PANTS = rgba("3E5C7A")       # overalls denim
PANTS_DARK = rgba("2C4258")
SOCK = rgba("FFF6E6")        # unused — the rolls meet the shoes
SHOE = rgba("E8B074")        # tan canvas upper
WHITE = rgba("FFF2D8")       # cream cupsole
SOLE = rgba("FAE4C0")        # cream toe bumper, laces
# The team accent is the ROLLED DENIM CUFF (Noodle's jean-roll convention —
# she has no socks) — light denim on the sheet, mask-friendly.
TEAM_MASK = rgba("D8D2C6")
BUTTON = rgba("F2C24E")      # the gold strap buttons — identity, authored
STITCH = rgba("D9B36A")      # the denim topstitch — the button gold
                             # desaturated a step (sat 0.51 vs 0.68): dex's
                             # #C08A48 stitch was scored "runs hotter than
                             # the sheet", so this one starts a step cooler

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: soft brows rows 212-219 (40.9% of the 3.99→2.60
# head, z 3.42), the big lashed eyes rows 236-267 centred row 252 (56.4%,
# z 3.21), nose rows 278-279, the smile arc rows 288-295 (73.5%, z 2.97 — the
# rows below it are the left curl curtain's inner edge, not a feature). Her
# ⚠️ ears: the note here read "never show under the bob; none are built
# (Grizz's precedent)", and that is FALSE about the drawing — corrected
# 2026-08-16. Her turnaround's profile view (x 732-950) draws a fully
# constructed ear (helix rim, concha shadow, lobe) entirely clear of the hair,
# in an open temple hairline that also leaves brow, eye, nose, lips, chin and
# jaw clear. Grizz's precedent was itself an unmeasured claim and is corrected
# in his script too. Rubric 3.10 is failing here; building the ear, and pulling
# the bob back off the face, are findings 2 and 3 in her record.
HEAD_CENTER = (0.0, -0.020, 3.150)
HEAD_RADII = (0.400, 0.420, 0.440)

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
    """Big bright eyes — a soft dish; the atlas carries the lashes."""
    dz = nz - 0.127
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small button above the smile (centre nz -0.24)."""
    if abs(nx) > 0.16:
        return 0.0
    dz = nz + 0.240
    if dz < -0.10 or dz > 0.11:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.16) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.090 if dz >= 0.0 else 0.100
    t = dz / reach
    tip = 0.080 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Island solved for her span: brow anchor 20 lands z 3.422 (40.9% of the
# 3.99→2.60 head against the traced 40.9), eye anchor 50 lands z 3.206 (56.4
# vs 56.4), mouth anchor 76 lands z 2.967 (73.6 vs 73.5). The spec REFUSES
# all three landmarks — the curls merge every band.
FACE_ISLAND = (0.92, -1.3098, 2.300)

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


# ★ THE EAR, off the sheet's profile (x 732-950): top at the brow line, lobe
# at the smile — z 3.30 → 2.97 — and the whole ear clear of the hair. Rubric
# 3.10 failed outright with none built (the header's "like Grizz she builds
# none" was an unmeasured claim, corrected 2026-08-16 and acted on here).
EAR_SPEC = EarSpec(center=(0.030, 3.135), radii=(0.135, 0.165))

# The hair sits BEHIND the ear line at face height: the sheet's profile shows
# forehead, brow, eye, cheek, mouth, chin and the ear in front of the curls.
# Diva's face-band floor: at these rows no ring vertex comes further forward
# than the ear's back edge, whatever the loft's half-depth says.
FACE_BAND = (2.780, 3.440)
FACE_BAND_FLOOR_Y = 0.060


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


# --- The curl bob --------------------------------------------------------------
#
# Bubbles' hard-lobed ringlet loft at bob scale: widest across the ears' zone,
# curtains framing the face, tips at the jaw.
# measured: front z=3.18 halfWidth=0.8331
# measured: front z=3.50 halfWidth=0.7533
# measured: front z=3.74 halfWidth=0.5849 tol=0.06
BOB_LEVELS = [
    (3.940, 0.160, 0.170, 0.000),
    (3.860, 0.320, 0.340, 0.000),
    (3.760, 0.460, 0.480, 0.010),
    (3.620, 0.600, 0.610, 0.020),
    (3.460, 0.705, 0.700, 0.030),
    (3.300, 0.750, 0.730, 0.050),
    (3.150, 0.775, 0.750, 0.070),
    (3.000, 0.745, 0.700, 0.090),
    (2.880, 0.680, 0.600, 0.110),
    (2.780, 0.500, 0.420, 0.130),
    (2.700, 0.300, 0.260, 0.150),
]

# The hairline: a centre-parted open forehead, curtains closing past the
# temples and hanging beside the jaw.
BOB_FRINGE = [
    (0.00, 3.500),
    (0.19, 3.450),
    (0.27, 3.240),
    (0.34, 2.950),
    (0.42, 2.800),
]

BOB_OPEN_BOTTOM = 2.720

# ★ THE CURL FIELD (sculptlib.hair). The bob shipped as cos(7θ) on 18
# columns — 2.6 samples per lobe, and a θ-only cosine is a FLUTE: its extrema
# are pinned in θ, so every row grooves in the same place and measure:strands
# read 0.42 minima/row against the sheet's 15.46 at 324% prominence. The
# field is mirror-paired Gaussian blobs, compact in θ AND z, staggered band
# to band by the golden-ratio conjugate; the trough between blobs is painted
# HAIR_DARK so the read is a honeycomb of curls, not stripes. Three pairs a
# row (six lobes — the sheet's bob shows five to seven across the front),
# seven bands from the crown to the jaw-length hem.
# Ladder (measure:strands, 5-45% band, concept 15.46 minima/row at 30.2):
#   18 cols cos(7θ)          0.42/row   3%  at 324% prominence  (shipped)
#   24 cols 3 pairs x 7      2.88/row  19%  at 171%
#   36 cols 5 pairs x 8 @0.080   5.15/row  33%  at 243%  (reads as curls; too proud)
#   36 cols 5 pairs x 8 @0.055   5.29/row  34%  at 230% — amplitude is not the lever
#   32 cols (paid to the shoulder root ring; re-measured below on fresh boards)
#   same, HAIR_DARK 4E2B10→6A3C18, trough 0.014   (this rung: the contrast is)
CURL_SEEDS = curl_seeds(
    pairs_per_row=5,
    bands=8,
    z_top=3.900,
    z_bottom=2.800,
    amplitude=0.055,
)
CURL_THETA_WIDTH = 0.17
CURL_Z_WIDTH = 0.070
CURL_TROUGH = 0.014


def fringe_z_at(x_abs: float) -> float:
    """The bob's open-face edge at lateral offset |x|."""
    table = BOB_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def ring_loft_bob(builder: MeshBuilder, levels, detail: int) -> None:
    """The ring-loft-with-tuck, hard-lobed — she is ringlets, not a smooth mass."""
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the runtime lights the mass as a slate-grey void.
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_bob levels must be strictly descending in z"
    # 36 even columns: mirror columns survive, and ten lobes a row get 3.6
    # samples each — the 18-column bob sampled its seven at 2.6. Eleven rows
    # at 36 columns is ~800 triangles, inside the 756 of headroom plus the
    # cosine bob's own 400.
    # 32, from 36: the eleven-row bob at 36 columns left no room for the
    # shoulder's root ring (#208, +56 triangles), and the one loft row within
    # interpolation tolerance turned out to be the brow line the face clamps
    # sample (#210 — two visible-face metrics went red). Four columns are the
    # honest price: ten lobes a row still get 3.2 samples each.
    segments = 32 if detail >= 2 else (10 if detail == 1 else 8)
    use = levels if detail >= 2 else thin_for_lod([(z, hx, hy, yc) for z, hx, hy, yc in levels], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            # The curl field is even in θ by construction (every seed is
            # emitted at ±θ₀), so the silhouette's faceAsymmetry holds
            # without a mirror rule at this call site.
            f = curl_field(
                theta, z, CURL_SEEDS,
                theta_width=CURL_THETA_WIDTH,
                z_width=CURL_Z_WIDTH,
            ) if detail >= 2 else 0.0
            clump = 1.0 + f
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                if BOB_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.300)
                if FACE_BAND[0] < z < FACE_BAND[1]:
                    y = max(y, FACE_BAND_FLOOR_Y)
            tone = HAIR if f > CURL_TROUGH else HAIR_DARK
            ring.append(builder.vertex((x, y, z), tone, "Head"))
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


# --- The overalls torso --------------------------------------------------------
#
# One loft: the pink tee everywhere above the bib line, the denim bib a FRONT
# wedge (and a back panel) between the waist and the bib top, full denim from
# the waist down to the hem, real strap strips over the shoulders.
# not-traceable: her hanging arms merge with the torso at every row and the
# bib's edges are colour boundaries inside the silhouette; halves bounded off
# the cluster runs (bib 173-215 at z 2.20; hem 0.62 total at z 1.26).
TORSO_LEVELS = [
    (1.180, 0.330, 0.280, "Hips"),    # overalls hem
    (1.215, 0.348, 0.295, "Hips"),
    (1.350, 0.340, 0.290, "Hips"),
    (1.550, 0.330, 0.296, "Spine"),
    (1.750, 0.318, 0.288, "Spine"),
    (1.950, 0.305, 0.268, "Spine1"),
    # ★ THE WAIST IS A GARMENT EDGE, AND IT WAS ONLY A COLOUR CHANGE.
    #
    # `overalls_color` switches denim to pink at z 1.999 and the nearest rings
    # were 1.950 and 2.150, so the loft interpolated that switch across a 0.20ft
    # band — a fifth of a foot of gradient standing in for a sewn hem. The
    # round-6 critic read it exactly as built: "a hard hem where the pink tee
    # meets the denim at the flanks/back — the soft vertex gradient reads
    # PAINTED from side angles". Flash's stripes paid for the same lesson (crisp
    # edges need loft rings AT the band boundary) and this table already applies
    # it twelve rows up, at the bib top.
    #
    # The pair does two jobs. 1.987/1.999 straddle the colour switch so the edge
    # is crisp instead of smeared; and the lower ring stands 0.010ft PROUD, so
    # the denim waistband overhangs the tee that tucks under it. That is batch
    # 7's finding — a rim row proud of its panel reads as stitching — applied to
    # a waistband rather than a pocket, which is what turns rubric 3.4's
    # "primitive volume" into a "constructed garment".
    (1.987, 0.313, 0.275, "Spine1"),  # denim waistband lip, proud — the seam
    (1.999, 0.303, 0.265, "Spine1"),  # the tee tucks under it; crisp colour edge
    (2.150, 0.295, 0.255, "Spine1"),
    (2.320, 0.285, 0.240, "Spine2"),
    (2.394, 0.276, 0.231, "Spine2"),  # crisp bib-top edge — the wedge
    (2.406, 0.275, 0.230, "Spine2"),  # boundary smears without ring pairs
    (2.420, 0.262, 0.220, "Spine2"),
    (2.480, 0.220, 0.190, "Spine2"),
    (2.530, 0.165, 0.150, "Spine2"),
    (2.556, 0.152, 0.142, "Spine2"),  # pink ringer collar, proud
    (2.590, 0.132, 0.124, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

BIB_TOP = 2.400
WAIST = 2.020


def overalls_color(theta: float, z: float):
    if z > 2.540:
        return SHIRT_DARK  # the ringer collar
    if z < 1.999:
        return PANTS       # full denim below the waist
    return SHIRT           # the bib is proud GEOMETRY, not a colour wedge —
                           # the wedge smeared across segments and tore into
                           # a hard pink block under the swing's deformation

# Her neck pinch is z 2.60, framed by the curl curtains.
# not-traceable: the front silhouette at neck rows is curtain-to-curtain;
# the pinch half is bounded off the skin run between the curls (~0.13).
NECK_LEVELS = [
    (2.580, 0.134, 0.126, "Spine2"),
    (2.660, 0.132, 0.124, "Neck"),
    (2.760, 0.144, 0.136, "Neck"),
]


def torso_surface_y(z: float, frac_x: float, back: bool = False) -> float:
    """The torso's front (or back) surface y at height z, at frac_x of its
    half-width — for seating proud panels."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            w = wa + t * (wb - wa)
            d = da + t * (db - da)
            break
    else:
        w, d = levels[-1][1], levels[-1][2]
    yy = d * sqrt(max(0.04, 1.0 - frac_x ** 2))
    return yy if back else -yy


def torso_patch(builder: MeshBuilder, x0: float, x1: float, z0: float,
                z1: float, base: float, proud: float, colour, top_colour,
                bone: str, back: bool = False, flip: bool = False,
                span: float = 0.30) -> None:
    """A bevelled proud patch riding the torso surface — batch 7's sewn-pouch
    pattern (rim vertices at ~35% of the proud height read as stitching),
    dex's leg_patch ported to the torso loft. `base` is the surface the patch
    sits on (0 for the loft itself, the bib panel's own offset for a pocket
    ON the bib); the TOP row takes `top_colour` — the pocket-mouth topstitch.
    Rows run bottom-up like build_bib's panels; `flip` mirrors the winding
    for the -x copy (the flip= parameter, never reversed row lists — Penny's
    own button lesson)."""
    steps = 3
    rows = []
    for j in range(steps + 1):
        z = z0 + (z1 - z0) * j / steps
        row = []
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            rim = j in (0, steps) or i in (0, steps)
            d = base + (0.35 * proud if rim else proud)
            y = torso_surface_y(z, x / span, back) + (d if back else -d)
            shade = top_colour if j == steps else colour
            row.append(builder.vertex((x, y, z), shade, bone))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False, flip=flip != back)


def build_bib(builder: MeshBuilder, detail: int) -> None:
    """The denim bib and back panel as proud panels, with the chest pocket."""
    if detail < 1:
        return
    for back in (False, True):
        rows = []
        # The bib-edge topstitch: a thin STITCH band ON adjacent rows (dex's
        # belt-line ring-pair pattern) so the line is crisp, with guard rows
        # at 2.364/2.396 keeping each colour ramp inside a short band.
        # measured: front bib top edge row 392 (z 2.381 drawn), its stitch
        # line row 397 — 0.030ft below the edge; authored 2.372-2.386 under
        # the 2.410 bib top, the same offset. LOD1/2 keep the sparse rows.
        zs = ((2.020, 2.150, 2.300, 2.364, 2.372, 2.386, 2.396, 2.410)
              if detail >= 2 else (2.020, 2.150, 2.300, 2.410))
        for z in zs:
            half = 0.195 if z < 2.35 else 0.165
            colour = STITCH if 2.370 < z < 2.390 else PANTS
            row = []
            cols = 4 if detail >= 2 else 3
            for i in range(cols):
                t = 2 * (i / (cols - 1)) - 1.0
                x = t * half
                y = torso_surface_y(z, x / 0.30, back) + (0.014 if back else -0.014)
                row.append(builder.vertex((x, y, z), colour, "Spine1" if z < 2.2 else "Spine2"))
            rows.append(row)
        builder.grid(rows, 1, cyclic=False, flip=back)
    # The chest pocket — she is Penny POCKETS: a bevelled sewn pouch on the
    # bib (interior at the old 0.026 proud, rims at the bib's own 0.014 +
    # 35% bevel) with the mouth's topstitch as its STITCH top row.
    # measured: front pocket rows 420-427 put the drawn mouth stitch at
    # z 2.21-2.17; authored mouth 2.260 rides the authored bib's proportions.
    torso_patch(builder, -0.105, 0.105, 2.100, 2.260, 0.014, 0.012,
                PANTS, STITCH, "Spine1")
    # Hip pockets, one per side — the drawn slant-mouth front pockets,
    # authored as bevelled proud patch pockets with the mouth stitch on top.
    # measured: front pocket mouth rows 505-535 → z 1.713-1.536 drawn;
    # authored 1.700-1.530 under the exemplar waistband at its traced height.
    for side in (1, -1):
        torso_patch(builder, side * 0.140, side * 0.275, 1.530, 1.700,
                    0.0, 0.020, PANTS, STITCH, "Hips",
                    flip=side < 0, span=0.34)
    # Back seat pockets — the back view's five-sided patches, same pouch.
    # measured: back pockets rows 506-565 → z 1.698-1.341 drawn (ftPerPx
    # 0.006042); authored 1.660-1.400 clear of the hem flare at 1.215.
    for side in (1, -1):
        torso_patch(builder, side * 0.100, side * 0.280, 1.400, 1.660,
                    0.0, 0.020, PANTS, STITCH, "Hips",
                    back=True, flip=side < 0, span=0.34)


def build_straps(builder: MeshBuilder, detail: int) -> None:
    """The denim shoulder straps and their gold buttons."""
    if detail < 1:
        return
    for side in (1, -1):
        rows = []
        # not-traceable: the strap rides the shoulder from bib top to back
        # panel; the path is the torso surface + 0.015.
        path = [
            (0.145, -0.242, 2.410),
            (0.150, -0.190, 2.520),
            (0.155, -0.060, 2.590),
            (0.155, 0.090, 2.560),
            (0.150, 0.210, 2.460),
            (0.145, 0.252, 2.390),
        ]
        for (px, py, pz) in path:
            rows.append([builder.vertex((side * (px - 0.040), py, pz), PANTS, "Spine2"),
                         builder.vertex((side * (px + 0.040), py, pz), PANTS, "Spine2")])
        builder.grid(rows, 1, cyclic=False, flip=side < 0)
        # The gold button where the strap meets the bib.
        bx, by, bz = side * 0.145, -0.252, 2.415
        centre = builder.vertex((bx, by - 0.012, bz), BUTTON, "Spine2")
        ring = []
        for i in range(6):
            a = 2 * pi * i / 6
            ring.append(builder.vertex((bx + 0.030 * cos(a), by, bz + 0.030 * sin(a)), BUTTON, "Spine2"))
        for i in range(6):
            nxt = (i + 1) % 6
            # The button rings are TRANSLATED copies (same cos/sin order on
            # both sides), not mirrors — one winding serves both.
            builder.face((centre, ring[i], ring[nxt]), 1)


# --- Arms: pink short sleeves, fair bare arms ----------------------------------
SLEEVE_HEM_X = 0.630

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare forearm traces ~0.055 half. The deltoid stays LOW under a
# long torso slope (Turbo's wedge lesson).
ARM_STATIONS = [
    (0.215, 0.138, SHIRT, "Arm"),
    (0.300, 0.143, SHIRT, "Arm"),
    (0.335, 0.136, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.125, SHIRT, "Arm"),
    (0.520, 0.114, SHIRT, "Arm"),
    (0.585, 0.108, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.113, SHIRT_DARK, "Arm"),      # pink ringer cuff, proud
    (0.654, 0.106, SHIRT_DARK, "Arm"),
    (0.672, 0.086, SHIRT_DARK, "Arm"),
    (0.692, 0.068, SKIN, "Arm"),
    (0.800, 0.066, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.064, SKIN, "ForeArm"),
    (ARM_ELBOW_X + 0.048, 0.063, SKIN, "ForeArm"),
    (1.240, 0.060, SKIN, "ForeArm"),
    (1.365, 0.057, SKIN, "Hand"),
    (1.412, 0.062, SKIN, "Hand"),
    (1.465, 0.070, SKIN, "Hand"),   # knuckle line
    (1.512, 0.060, SKIN, "Hand"),
]

PENNY_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.92,  # the A-pose coverage gap: see ArmSpec.root_ring (#208)
    elbow=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.550,
        finger_root=1.502,
        finger_offsets=((-0.045, 0.0, 0.045), (-0.031, 0.031)),
        finger_lengths=((0.102, 0.116, 0.104), (0.108, 0.113)),
        finger_widths=(0.028, 0.027, 0.022, 0.017),
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


# --- Overall pants with team-accent rolled cuffs -------------------------------
INSEAM_TOP_Z = 1.120
INSEAM_HEM_Z = 0.700
INSEAM_HEM_HALF = 0.045


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=1.10 halfWidth=0.5170 tol=0.06
LEG_STATIONS = [
    (1.300, 0.165, 1.10, PANTS, "UpLeg"),
    (1.100, 0.162, 1.10, PANTS, "UpLeg"),
    (0.900, 0.158, 1.08, PANTS, "Leg"),
    (0.740, 0.155, 1.06, PANTS, "Leg"),
    (0.620, 0.152, 1.04, PANTS, "Leg"),
    (0.585, 0.172, 1.05, TEAM_MASK, "Leg"),           # the rolled cuff — the
    (0.500, 0.174, 1.05, TEAM_MASK, "Leg"),           # team-accent band
    (0.435, 0.168, 1.03, TEAM_MASK, "Leg"),
    (0.410, 0.130, 1.00, PANTS_DARK, "Foot"),         # under the roll
    (0.330, 0.100, 0.97, SKIN, "Foot"),               # ankle into the shoe
    (0.150, 0.090, 0.95, SKIN, "Foot"),
]

PENNY_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Tan canvas with cream cupsole, toe bumper and laces.
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
SHOE_HEIGHT_SCALE = 1.24

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

SHOE_BANDS = [
    (0.000, "midsole"),
    (0.260, "quarter"),
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


PENNY_SHOE = ShoeSpec(
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

    # Ears at the two near LODs: at LOD2 an ear is two pixels.
    if detail >= 1:
        for side in (1, -1):
            build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)
    ring_loft_bob(builder, BOB_LEVELS, detail)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    torso_segments = 24 if detail >= 2 else segments
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
                 color_fn=overalls_color)
    build_bib(builder, detail)
    build_straps(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=PENNY_ARM)
        build_leg(builder, side, detail, spec=PENNY_LEG)
        build_shoe(builder, side, detail, spec=PENNY_SHOE,
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
    obj["recessReference"] = "penny-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_penny_LOD0", "kid_penny_LOD1", "kid_penny_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_penny_LOD0": (20, 12, 2),
        "kid_penny_LOD1": (8, 4, 1),
        "kid_penny_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "penny")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Penny reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against penny-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the denim-roll accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- penny\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_penny_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
