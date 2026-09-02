"""Rebuild Bubbles as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/bubbles-pilot.blend \
    --python scripts/v2/blender/sculpt-bubbles-source.py

★ BUBBLES IS THE FIRST DRESS. The torso loft IS the garment: a fitted pink
bodice meeting a gathered A-line skirt at a constructed waist seam (z 1.90),
the skirt falling to a deliberately ASYMMETRIC hem — low on her right, high on
her left, a z(θ) hem edge — with the legs bare beneath it; no character before
her has had a garment whose silhouette leaves the body. She is also the second big hair mass
(Grizz's ring-loft-with-tuck construction, third proving) plus the roster's
first topknot bun, and her scrunchie is the team-accent accessory.

★ HER SHEET'S REFUSALS ARE HONEST AND EXPECTED. The spec refuses her mouth
(`ambiguous-parts` — her open laugh merges with the hair framing her face into
one dark run), so the lip line is the bounded trace: the laugh's dark interior
spans rows 375-389 of the sheet, centred ~86% of head height, z 2.63. Her
⚠️ ears: this read "never drawn (the curl curtains cover them in all five
views): no EarSpec, like Grizz", and it is FALSE about the drawing — corrected
2026-08-16. Her profile view (x 638-846) draws a LARGE, fully constructed ear
— outer helix rim, deep concha shadow, lobe — with the curls deliberately
tucked BEHIND it, and her face clear of the hair besides. It is one of the
most prominent ears on the roster, not an absent feature. The "like Grizz"
was inherited from an unmeasured claim in his script, corrected there too;
rubric 3.10 is failing here and the ear is a bounded trace off this profile.

The conversion: front figure 740px over 4.0ft → 1px = 0.005405ft; profile
0.005428. The profile faces +x, per Grizz's and Sprout's sheets.
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
from sculptlib.hair import curl_field, curl_seeds
from sculptlib.head import HeadSpec, head_surface
from sculptlib.leg import LegSpec, build_leg, leg_x
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, ARM_SHOULDER_X, LEG_ANKLE_Z, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/bubbles-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/bubbles-face-atlas.png"
REVISION = "bubbles-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: skin #F3944B, dress pink #F47473 (shadow #B4433B), creams
# #FAEDDD, hair golds #EBC494 / #DCA35B / #B45A1B. Authored with the ramp
# factor the earlier boards calibrated (delivered ≈ authored / 1.2, chroma
# compressed — spread over-authored where a colour must survive it).
SKIN = rgba("FFAA56")
SKIN_SHADOW = rgba("C77B36")
HAIR = rgba("F2C070")        # bright ringlet gold — the mid tones live in shading
HAIR_DARK = rgba("C48A34")   # the trough between ringlets — the sheet's shadow gold
SHIRT = rgba("FF8686")       # the dress pink
SHIRT_DARK = rgba("FFF4E2")  # the cream trim lane: collar, sleeve hems, skirt hem
PANTS = rgba("D95F62")       # dress shadow tone (no trousers on this kid)
PANTS_DARK = rgba("B34A4E")
SOCK = rgba("FFF6E8")
# ★ ROUND 4: THE SECOND TONE IS BEIGE, AND IT WAS NEVER PINK. The classifier
# reads the concept's own pair as #f9ecdd cream against #bc9365 — the warm
# beige quarter panels and laces the sheet actually draws — and two rounds
# were spent authoring pinks at a panel that is tan. Authored so the ramp
# delivers the concept's own centroid (verified against toneDistance before
# building, not after).
SHOE = rgba("F6C48C")        # the beige quarter panel
WHITE = rgba("FFF6E4")       # the cream cupsole
# ★ ROUND 2: THE TRIM LANE IS THE PINK SOLE LINE. The concept's shoe band
# splits 67.3 cream / 31.0 PINK at saturation 26 — the pink edge line running
# round the sole is a third of the band — and round 1 shipped 100/0 all-cream.
# The trim colour becomes the pink and the band stack puts it at the sole's
# base; the cream toe cap is disabled rather than painted pink.
# ★ THE TRIM LANE MUST DIFFER FROM THE PANEL, or the laces are built and
# invisible: at #F6C48C (= SHOE) three declared straps and the toe cap shipped
# painted the quarter colour through two critic rounds. The round-2 note
# above already said the trim IS the pink sole line; the value now agrees.
# ★ THE TRIM IS PINK, BY MEASUREMENT. The lane paints laces, tongue, collar
# and the band stack's sole line as ONE colour. A critic read the sheet's
# laces as cream; measure:fidelity settled it the other way — cream trim
# put the band at 82-86% cream against the sheet's 67.3 (OFF, tol 8) with
# or without the toe cap, while pink held the split (73.3/26.7 ok). Pink is
# also where the sheet's sole line is. The toe cap is OFF (below) so the
# pink does not wash the toe.
SOLE = rgba("F29A9A")        # the pink sole line, laces and tongue
TEAM_MASK = rgba("D8D2C6")   # the scrunchie — her team-accent surface

# The sock stripes are the dress's own pink, authored directly (the accent
# lane is spent on the scrunchie, which is the more distinctive trim).
STRIPE = rgba("FF8686")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Head band: hair crown row 127 (z 4.00) to neck pinch row 422 (z 2.40) — a
# 1.60ft head, 39.9% of the figure, the roster's biggest (it is mostly curls).
# Features, bounded traces: thin brows rows 261-270 (~46% of head, z 3.27),
# the big amber eyes rows 281-305 centred z 3.09 (56%), laugh line ~86%
# (z 2.63), chin ~2.50. Her face is small inside the hair: the skin opening
# runs ~0.75ft across at the cheeks against a 1.37ft hair width.
HEAD_CENTER = (0.0, -0.020, 3.000)
HEAD_RADII = (0.380, 0.450, 0.520)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.10, 1.04),
    (-0.20, 1.08),
    (-0.50, 1.06),
    (-1.00, 0.97),
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
    """Gentle — her enormous eyes are atlas marks on soft cheeks."""
    dz = nz - 0.173
    dx = abs(nx) - 0.300
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.022
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A tiny upturned button between the eyes and the laugh."""
    if abs(nx) > 0.18:
        return 0.0
    dz = nz + 0.180
    if dz < -0.13 or dz > 0.14:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.20) ** 2)
    bridge = 0.012 * across * max(0.0, 1.0 - abs(dz - 0.08) / 0.10)
    reach = 0.110 if dz >= 0.0 else 0.120
    t = dz / reach
    # Round 7: 0.100 at power 1.05 read as "a sharp oversized wedge"; a lower
    # dome with a rounder falloff is the concept's soft button.
    tip = 0.096 * across ** 1.30 * max(0.0, 1.0 - t * t) ** 1.45
    return bridge + tip


# ★ THE EAR, BUILT (sculptlib.ear, 2026-09-02). The line here read "NO EARS —
# the curl curtains cover them in every view, like Grizz's afro", and the
# header above records why that was false: her profile draws one of the
# roster's largest ears with the curls tucked BEHIND it. Off that profile
# (x 638-846): top just under the brow, lobe level with the laugh — z 3.24 →
# 2.80 on a 1.60ft head — and the whole ear clear of the hair.
EAR_SPEC = EarSpec(center=(0.030, 3.020), radii=(0.140, 0.190))

# The curls sit BEHIND the ear line at face height (the same profile shows
# brow, eye, cheek, laugh and chin all in front of the hair). Diva's
# face-band floor: no ring vertex comes further forward than the ear's back
# edge in these rows, whatever the loft's half-depth says.
FACE_BAND = (2.620, 3.300)
FACE_BAND_FLOOR_Y = 0.060


def skull_surface_x(y: float, z: float) -> float:
    """The skull's lateral half-width at (y, z) — what the ear mounts against."""
    ny = (y - HEAD_CENTER[1]) / HEAD_RADII[1]
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    remainder = 1.0 - ny * ny - nz * nz
    if remainder <= 0.0:
        return 0.0
    return HEAD_RADII[0] * (remainder ** 0.5) * face_half_scale(nz)

# Island solved for her span (skull crown under the curls at ~3.52): brow at
# generator row 28 lands z 3.27 (45.7% of the 4.00→2.40 head), eyes at row 46
# land z 3.10 (56.5%), mouth at row 95 lands z 2.63 (85.7%) — each within a
# point of the bounded traces above.
FACE_ISLAND = (0.92, -1.450, 2.550)

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


def skull_front_y(x: float, z: float) -> float:
    """The skull surface's forward (-y) extent at (x, z), for the hair tuck.

    ★ RETURNS A SENTINEL WHERE THE SKULL DOES NOT EXIST. Returning the head
    CENTRE there (the first cut) made the shell clamp pull the hair BEHIND
    the forehead above the skull's own crown — round 6's board showed two
    skin patches poking through the curls where the upper forehead protruded
    past hair that had been yanked to the axis. No skull, no clamp."""
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    rx = HEAD_RADII[0] * face_half_scale(nz)
    nx = x / rx if rx else 2.0
    remainder = 1.0 - nx * nx - nz * nz
    if remainder <= 0.0:
        return -10.0
    # ★ THE RENDERED FACE IS FLATTER THAN THE ELLIPSOID (Sprout's lesson,
    # hairline-scan.mjs): head_surface scales the front depth by
    # 0.88 - 0.11·frontness², so the full-ellipsoid answer sat in FRONT of
    # the skin and the window's "behind the skull" tuck put hair over the
    # forehead however high its arc was authored.
    s2 = 1.0 - nz * nz
    cb2 = 1.0 - (nx * nx) / s2 if s2 > 0.0 else 0.0
    cb = sqrt(cb2) if cb2 > 0.0 else 0.0
    depth = 0.88 - 0.11 * cb * cb
    return HEAD_CENTER[1] - HEAD_RADII[1] * sqrt(remainder) * depth


# --- The hair: curls, curtains and the topknot ---------------------------------
#
# Grizz's ring-loft-with-tuck, third proving. The bun rides on top (its own
# small loft) with the scrunchie torus at its base; the main mass falls BESIDE
# the face to below the chin — the curtains are what the front silhouette
# holds at z 2.6-2.9.
#
# measured: front z=3.90 halfWidth=0.2000
# measured: front z=3.58 halfWidth=0.4568
# measured: front z=3.34 halfWidth=0.5703
# measured: front z=2.94 halfWidth=0.6865
# measured: front z=2.62 halfWidth=0.6351
# measured: view2 z=3.18 halfWidth=0.5183
# ★ FOUR ROWS PAID FOR THE EARS (2026-09-02): 3.560, 3.300, 2.820 and 2.460
# were within 0.025 of the linear interpolation of their neighbours, and
# build_ear at hero costs ~300 triangles the LOD0 budget did not have.
HAIR_LEVELS = [
    (3.690, 0.345, 0.325, 0.062),
    (3.400, 0.545, 0.400, 0.150),
    # ★ ROUND 7: THE CURTAINS KEEP THEIR BACKS AND GIVE UP THEIR FRONTS. The
    # first review found the hair "engulfing the face": these rings' front
    # extents (yc - hy) reached -0.42, at the face plane, where the concept's
    # profile shows the whole face exposed with the hair behind it (front
    # extent ~ -0.10 at the cheek rows). The back column (yc + hy) stays on
    # the measured profile spans.
    (3.180, 0.625, 0.385, 0.280),
    (3.060, 0.660, 0.385, 0.290),
    (2.940, 0.687, 0.380, 0.300),
    (2.640, 0.640, 0.310, 0.338),
    (2.320, 0.220, 0.140, 0.380),
]

# The bun: a small mass above the crown, scrunchie at its base.
# measured: front z=3.82 halfWidth=0.2622
# ⚠️ STRICTLY DESCENDING like every ring-loft table: this table shipped
# ASCENDING, so ring_loft's reversed() re-inverted it, every quad's winding
# flipped, and the bun rendered as a dark backface void at runtime for
# eight rounds (Bendy's exact bun lesson - the double-sided board hid it).
BUN_LEVELS = [
    (3.995, 0.050, 0.048, 0.000),
    (3.950, 0.150, 0.140, 0.010),
    (3.880, 0.230, 0.210, 0.020),
    (3.800, 0.240, 0.220, 0.030),
    (3.740, 0.150, 0.140, 0.030),
]

SCRUNCHIE_Z = 3.745
SCRUNCHIE_RADIUS = 0.170
SCRUNCHIE_TUBE = 0.052

# The fringe arc — her hairline is HIGH (a big open forehead under the curls):
# the skin opening starts ~z 3.42 at the centre; the curtains close beside the
# cheeks at |x| beyond ~0.36.
# Round 6: the shell overhang ate the forehead down to the eyes; the drawing
# holds an OPEN forehead with the hairline at ~3.43 — the arc rises so the
# rendered edge (which hangs half a ring below the arc) lands where the
# drawing's hairline does.
HAIR_FRINGE = [
    (0.00, 3.500),
    (0.15, 3.480),
    (0.26, 3.360),
    (0.34, 3.120),
    (0.40, 2.760),
    (0.55, 2.500),
]

HAIR_OPEN_BOTTOM = 2.34

# ★ THE CURL FIELD (sculptlib.hair). The mass shipped as cos(7θ)+0.45·cos(10θ)
# on 20 columns — and cos(7θ)+cos(10θ) = 2·cos(8.5θ)·cos(1.5θ): any θ-only
# cosine family has its extrema pinned in θ, so every row grooved in the
# same columns and the ringlets read as flutes (~10% of the sheet's strand
# count). Mirror-paired Gaussian blobs, compact in θ AND z and staggered
# band to band by the golden-ratio conjugate, put a curl in every groove;
# the trough is painted HAIR_DARK so the read is a honeycomb of ringlets.
# Ladder (measure:strands, concept 13.50 minima/row at 34.4):
#   20 cols cos(7θ)+cos(10θ)    1.35/row  10%  (shipped)
#   20 cols 3 pairs x 8 @0.070  2.56/row  19%  at 140% — Nyquist-capped
#   24 cols 4 pairs x 8 @0.070  (this rung) — the six ringlet tubes go: the
#     field is the ringlets now, and their ~140 triangles pay for the four
#     columns (LOD0 had forty to spare). The bun keeps two bands of its own.
# Six bands over seven rows with z_width 0.12: with four rows paid to the
# ears, eight bands at 0.085 fell between the survivors and the relief
# dropped to 14% — a band has to reach its neighbouring rows to emit a lobe.
CURL_SEEDS = curl_seeds(
    pairs_per_row=4,
    bands=6,
    z_top=3.660,
    z_bottom=2.380,
    amplitude=0.070,
)
BUN_SEEDS = curl_seeds(
    pairs_per_row=3,
    bands=2,
    z_top=3.950,
    z_bottom=3.800,
    amplitude=0.055,
)
CURL_THETA_WIDTH = 0.21
CURL_Z_WIDTH = 0.120
CURL_TROUGH = 0.018


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
    """The curl mass, the bun and the scrunchie."""
    # 24 even columns keep mirror columns and give eight lobes three samples.
    segments = 24 if detail >= 2 else (10 if detail == 1 else 8)

    def ring_loft(levels, seeds, columns=None):
        segs = columns or segments
        assert all(x[0] > y[0] for x, y in zip(levels, levels[1:])), \
            "ring_loft tables must be strictly descending in z"
        ascending = list(reversed(levels))
        rows = []
        for z, half_x, half_y, y_centre in ascending:
            ring = []
            for column in range(segs):
                theta = 2 * pi * column / segs  # over THIS loft's columns — the bun at 12
                # once divided by the mass's 24 and swept two thirds of a turn
                # The field is even in θ by construction (every seed is
                # emitted at ±θ₀), so faceAsymmetry holds with no mirror
                # rule at this call site — Penny's lesson, now structural.
                f = curl_field(
                    theta, z, seeds,
                    theta_width=CURL_THETA_WIDTH,
                    z_width=CURL_Z_WIDTH,
                ) if detail >= 2 else 0.0
                clump = 1.0 + f
                x = half_x * clump * cos(theta)
                y = y_centre + half_y * clump * sin(theta)
                if y < y_centre:
                    if HAIR_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                        y = max(y, skull_front_y(x, z) + 0.050)
                    else:
                        y = max(y, skull_front_y(x, z) - 0.085)
                    if seeds is CURL_SEEDS and FACE_BAND[0] < z < FACE_BAND[1]:
                        y = max(y, FACE_BAND_FLOOR_Y)
                tone = HAIR if f > CURL_TROUGH else HAIR_DARK
                ring.append(builder.vertex((x, y, z), tone, "Head"))
            rows.append(ring)
        bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), HAIR, "Head")
        top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.02), HAIR, "Head")
        for column in range(segs):
            nxt = (column + 1) % segs
            builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
            builder.face((rows[-1][column], rows[-1][nxt], top), 2)
        for lower, upper in zip(rows, rows[1:]):
            for column in range(segs):
                nxt = (column + 1) % segs
                builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)

    # ★ THE CURLS ARE LOBED HARD — she is ringlets, not a smooth mass. Seven
    # primary lobes at ±6.5% of radius; the drawing's read is texture first.
    # Ears at the two near LODs: at LOD2 an ear is two pixels and 58 triangles.
    if detail >= 1:
        for side in (1, -1):
            build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)
    ring_loft(HAIR_LEVELS, CURL_SEEDS)
    # The six sculpted ringlet tubes that rode the lower mass are gone: they
    # were the earlier answer to "the cloud needs real curl-clump geometry",
    # and the curl field IS that geometry now, in every band rather than
    # three. Their triangles bought the 20→24 columns above.
    # At the far LOD the bun is two pixels; it merges into the mass and its
    # triangles pay for the ringlet lobes that do survive 40px.
    if detail >= 1:
        # 12 columns: the bun is a fist-sized mass; its columns paid for the ears.
        ring_loft(BUN_LEVELS, BUN_SEEDS, columns=12 if detail >= 2 else None)

    # The scrunchie: a pink torus at the bun's base — the team-accent surface,
    # on M_Accessory (slot 3).
    if detail >= 1:
        ring = []
        spine = []
        sides = 12 if detail >= 2 else 8
        for i in range(sides):
            a = 2 * pi * i / sides
            spine.append((SCRUNCHIE_RADIUS * cos(a), 0.03 + SCRUNCHIE_RADIUS * sin(a) * 0.85, SCRUNCHIE_Z))
        builder.tube(spine, [SCRUNCHIE_TUBE] * sides, 3, TEAM_MASK, "Head", 6,
                     cyclic=True, axis=Vector((0.0, 0.0, 1.0)))
        del ring


# --- The dress: one loft, bodice to hem ----------------------------------------
#
# Traced off the front figure by the dress's own pink runs (her arms hang
# clear below the short sleeves, so the bodice edges are readable): bodice
# half 0.19 at z 2.25. Depth from the profile: bodice 0.28.
#
# ★ THE HEM-SWEEP ROUND CONSTRUCTED THE WAIST AND THE DRAWN ASYMMETRIC HEM.
# The delivered garment was one uninterrupted cone from armpit to hem; the
# sheet draws a fitted bodice with a clear waist seam and a gathered skirt.
# Waist seam traced per view as the row where the gathers spring from the
# fitted bodice: front row 515, profile row 514, back row 516 -> z 1.90
# (1.897 / 1.905 / 1.883). Penny's proven pattern (her TORSO_LEVELS
# 1.987/1.999): a ring PAIR straddling the seam so the edge is crisp, with
# the skirt-side ring standing PROUD so the gathered skirt overhangs the
# bodice that tucks in above it — the profile then shows two forms, not one.
# The gather pop is drawn ~5-8px (~0.03-0.04ft) beyond the bodice line in
# the profile view; authored 0.028.
#
# The hem itself: per-column pink-bottom trace across all three standing
# views agrees on a pure LATERAL tilt — the band-top edge sits at z 0.91-0.98
# on her right (-x, front view viewer-left dx -0.58..-0.41 and back view
# dx +0.38..+0.50), 1.12-1.22 on her left (+x), ~1.00-1.04 at centre front
# and back, so z(theta) = 1.055 + 0.125*cos(theta) at the band top; the
# profile's per-column read (min of both sides) holds ~0.96 as it must. The
# cream binding is drawn ~0.05ft tall and follows the tilt. The tilt is
# applied by `hem_drop` below as a z-shear of the loft, full at the hem and
# fading to zero at the waist seam; the levels here carry the MEAN z.
# measured: front z=2.38 halfWidth=0.4486
# measured: view2 z=2.18 halfWidth=0.2768
# measured: front z=1.15 halfWidth=0.5568
# measured: front z=1.48 halfWidth=0.6649
# measured: view2 z=1.06 halfWidth=0.4342
TORSO_LEVELS = [
    (0.960, 0.560, 0.385, "Hips"),    # the hem's inner lip — the skirt has thickness
    (0.975, 0.615, 0.425, "Hips"),    # hem underside — the binding wraps under
    (1.010, 0.635, 0.438, "Hips"),    # cream band's bottom edge, proud lip
    (1.062, 0.622, 0.430, "Hips"),    # band top — the pink/cream switch ring
    (1.074, 0.618, 0.428, "Hips"),    # lowest pink ring: crisp pair with 1.062
    # Deviation, recorded: the bell traces 0.6649 at z 1.48 but is authored
    # 0.632 — the sheet hangs the arms IN FRONT of the skirt while the
    # calibrated A-pose hangs them BESIDE it, and at the traced width the
    # raised left flank seals against the arm and encloses a 2230px backdrop
    # pocket (silhouette.lint, rubric 3.7, binary). Residual -0.033.
    (1.480, 0.632, 0.452, "Hips"),    # the bell's widest (traced 0.6649 at 1.48)
    (1.820, 0.400, 0.312, "Spine"),
    (1.890, 0.360, 0.290, "Spine"),   # gathered skirt top, PROUD — overhangs the seam
    (1.902, 0.332, 0.268, "Spine"),   # waist seam — the bodice tucks IN above it
    (2.150, 0.240, 0.228, "Spine1"),
    (2.250, 0.200, 0.215, "Spine2"),  # traced: bodice
    (2.340, 0.190, 0.200, "Spine2"),
    (2.400, 0.165, 0.170, "Spine2"),  # shoulder slope
    (2.430, 0.135, 0.140, "Spine2"),
    (2.448, 0.140, 0.146, "Spine2"),  # cream collar rib, proud
    (2.466, 0.118, 0.120, "Spine2"),  # neck hole
]

WAIST_SEAM_Z = 1.902   # the seam ring — hem shear fades to zero here
HEM_TILT_X = 0.125     # z(theta) amplitude: +x (her left) high, -x (her right) low
HEM_TILT_TOP = 1.074   # full tilt at and below the lowest pink ring


def hem_drop(cos_t: float, z: float) -> float:
    """The asymmetric hem's z-shear at a point whose ring direction has
    cos(theta) = cos_t (equivalently x / half-width), for a ring authored at
    the MEAN z. Positive raises (+x, her left); negative lowers (her right).
    Fades linearly to zero at the waist seam so the bodice stays mirror-true —
    the asymmetry is the skirt's cut, not the body's."""
    if z >= WAIST_SEAM_Z:
        return 0.0
    w = min(1.0, (WAIST_SEAM_Z - z) / (WAIST_SEAM_Z - HEM_TILT_TOP))
    # The 1.6 power keeps the full drawn amplitude at the hem while the
    # mid-skirt carries less lift: at the linear fade the raised left flank
    # (z ~1.5-1.6) grazed the calibrated A-pose arm and enclosed a backdrop
    # pocket the silhouette gate counts.
    return HEM_TILT_X * max(-1.0, min(1.0, cos_t)) * w ** 1.6


def dress_loft(builder: MeshBuilder, levels, material: int, color, segments: int,
               color_fn=None) -> None:
    """`MeshBuilder.loft` with the hem's z(theta) shear — winding, caps and
    colour handling copied EXACTLY from the shared loft (the Grizz afro
    lesson: a by-eye copy ships inside-out). The colour function receives the
    ring's AUTHORED z, never the sheared one, so the cream binding follows
    the tilt on its own rings and the switch stays inside its crisp pair."""
    assert all(a[0] < b[0] for a, b in zip(levels, levels[1:])), \
        "dress_loft levels must be strictly ascending in z (loft convention)"
    rows = []
    for z, rx, ry, bone in levels:
        row = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            at = (rx * cos(theta), ry * sin(theta), z + hem_drop(cos(theta), z))
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

# The pinch is at the bottom of the neck and widens into the jaw (the Grizz
# lesson, third application).
# measured: front z=2.40 halfWidth=0.4486 tol=0.06
NECK_LEVELS = [
    (2.455, 0.115, 0.108, "Spine2"),
    (2.540, 0.120, 0.113, "Neck"),
    (2.620, 0.126, 0.119, "Neck"),
]


def dress_color(theta: float, z: float):
    """Cream trim at the collar and the hem binding; pink everywhere else.
    Called with the ring's AUTHORED z (pre-shear), so the binding's cream
    lands exactly on its own rings — 0.975 (underside wrap), 1.010 (band
    bottom) and 1.062 (band top) — and the pink returns on the crisp partner
    ring at 1.074. A switch belongs ON a ring, never between two distant
    ones (the Zippy hem lesson)."""
    if z > 2.44:
        return SHIRT_DARK
    if 0.970 < z <= 1.068:
        return SHIRT_DARK
    return SHIRT


# The waist bow and the skirt pocket — the dress's constructed details, both
# the patch construction Grizz's pocket proved (third use; the lift into
# sculptlib is now earned and can happen when the next kid needs it).
def torso_ring_at(z: float) -> tuple[float, float]:
    """(half-width, half-depth) of the dress at height z, off TORSO_LEVELS."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return wa + t * (wb - wa), da + t * (db - da)
    return levels[-1][1], levels[-1][2]


def dress_surface_y(x: float, z: float) -> float:
    """The dress front surface's y at (x, z), off TORSO_LEVELS."""
    half_w, half_d = torso_ring_at(z)
    inner = max(0.10, 1.0 - (x / half_w) ** 2)
    return -half_d * sqrt(inner)


def surface_patch(builder: MeshBuilder, x0: float, x1: float, z0: float, z1: float,
                  proud: float, colour, top_colour, bone: str) -> None:
    """A raised rectangular panel on the dress front. Rides the hem shear:
    each vertex takes the same z-drop as the loft surface beneath it, so a
    patch on the tilted skirt moves with the fabric instead of floating."""
    steps = 3
    rows = []
    for j in range(steps + 1):
        z = z1 - (z1 - z0) * j / steps
        half_w, half_d = torso_ring_at(z)
        row = []
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            inner = max(0.10, 1.0 - (x / half_w) ** 2)
            y = -half_d * sqrt(inner) - proud
            zz = z + hem_drop(x / half_w, z)
            row.append(builder.vertex((x, y, zz), top_colour if j == 0 else colour, bone))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False, flip=True)


def button_disc(builder: MeshBuilder, bx: float, bz: float, radius: float,
                colour, bone: str) -> None:
    """A round sewn button: a 6-triangle fan proud of the dress front.
    ★ TRANSLATED copies sharing ONE vertex order, never mirrors — Penny's
    gold buttons proved the winding (flipping one side made 13 inverted
    pairs; triangle normals read out of the GLB settled it)."""
    half_w, _ = torso_ring_at(bz)
    bz = bz + hem_drop(bx / half_w, bz)   # ride the tilted skirt like the patches
    by = dress_surface_y(bx, bz) - 0.012
    centre = builder.vertex((bx, by - 0.012, bz), colour, bone)
    ring = []
    for i in range(6):
        a = 2 * pi * i / 6
        ring.append(builder.vertex((bx + radius * cos(a), by, bz + radius * sin(a)), colour, bone))
    for i in range(6):
        nxt = (i + 1) % 6
        builder.face((centre, ring[i], ring[nxt]), 1)


def build_dress_details(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    # ★ ROUND 8: A BOW IS LOBES, NOT RECTANGLES. The second review scored the
    # patch-built bow "a cluster of blocky white rectangles"; two ellipsoid
    # lobes and a knot read as ribbon from every angle, and the tails stay
    # patches (they ARE flat ribbon).
    #
    # ★ HEM-SWEEP ROUND: THE BOW LIVES AT HER LEFT WAIST, ON THE SEAM — NOT ON
    # THE CENTRE LINE. Traced off the front view: knot at dx +0.26, z 1.90
    # (exactly the waist seam row), loops spanning dx +0.146..+0.335, tails
    # hanging to ~z 1.64; the profile view shows the same bow's ribbon peeking
    # proud of the front-left waist. The old centred tails at z 1.80-1.97 were
    # two of the "white rectangular slabs stacked on the centre line" the
    # hem-sweep critic read as a zipper pull.
    bow_x = 0.255
    bow_y = dress_surface_y(bow_x, 1.900) - 0.020
    # Lobes only at the near LOD: the bow is a 2px sparkle at LOD1 distance.
    if detail >= 2:
        # Tied-ribbon loops: teardrop tubes angling up-and-out from the knot.
        # Both loops are TRANSLATED constructions on one side of the body —
        # one winding serves both (Penny's button lesson); no flip.
        builder.tube(
            [(bow_x - 0.020, bow_y + 0.004, 1.900), (bow_x - 0.072, bow_y - 0.006, 1.938), (bow_x - 0.108, bow_y + 0.006, 1.910)],
            [0.028, 0.050, 0.020], 1, SHIRT_DARK, "Spine", 5)
        builder.tube(
            [(bow_x + 0.020, bow_y + 0.004, 1.900), (bow_x + 0.068, bow_y - 0.006, 1.938), (bow_x + 0.100, bow_y + 0.006, 1.906)],
            [0.028, 0.050, 0.020], 1, SHIRT_DARK, "Spine", 5)
        builder.ellipsoid((bow_x, bow_y - 0.014, 1.902), (0.032, 0.028, 0.032), 1, SHIRT_DARK, "Spine", 6, 4)
    # The tails hang from the knot down the skirt front, drawn to ~1.64.
    surface_patch(builder, bow_x - 0.050, bow_x - 0.010, 1.680, 1.885, 0.026, SHIRT_DARK, SHIRT_DARK, "Spine")
    surface_patch(builder, bow_x + 0.008, bow_x + 0.048, 1.680, 1.885, 0.026, SHIRT_DARK, SHIRT_DARK, "Spine")
    # The skirt's patch pocket: pouch plus a prouder cream flap, viewer-left.
    surface_patch(builder, -0.30, -0.14, 1.52, 1.63, 0.022, SHIRT, SHIRT, "Hips")
    surface_patch(builder, -0.31, -0.13, 1.62, 1.675, 0.034, SHIRT_DARK, SHIRT_DARK, "Hips")
    # The flap's round pink button (a rectangle here read as a slab — same
    # class as the chest pair; the disc is 12 triangles cheaper too).
    button_disc(builder, -0.220, 1.646, 0.020, SHIRT, "Hips")
    # ★ THE TWO CHEST BUTTONS, ROUND AND OFF-CENTRE — the sheet draws them.
    # measured off the front view as cream-disc clusters on the pink bodice:
    # (dx +0.181, z 2.358) and (dx +0.198, z 2.217), ~0.04-0.05ft across, on
    # the placket diagonal at her LEFT chest (viewer-right; her right chest
    # holds nothing — the critic's "her right" was mirror-handed, the trace
    # is the authority). Deviation, recorded: the drawn dx sits under the
    # delivered T-pose arm root (ARM_Z 2.471, first station radius 0.130
    # reaches down to z~2.34 outboard of x 0.10, where the sheet hangs the
    # arms clear), so the pair keeps the drawn 0.141ft spacing and the drawn
    # ~0.5 fraction of the local bodice half-width, tucked inboard of the
    # arm cap: (+0.095, 2.330) and (+0.110, 2.190).
    button_disc(builder, 0.095, 2.330, 0.024, SHIRT_DARK, "Spine2")
    button_disc(builder, 0.110, 2.190, 0.024, SHIRT_DARK, "Spine2")


# --- Arms: short trimmed sleeves, long bare arms -------------------------------
#
# The sleeves are tiny — cream-trimmed hems high on the upper arm (hem x 0.62
# on the T-pose limb) with the whole arm bare below. Her arms are slim:
# traced bare-arm width ~0.11ft.
SLEEVE_HEM_X = 0.620

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose, indexed by x along the limb,
# while the concept hangs the arms at the sides; the bare-arm and hand widths
# are the traced numbers in the header above.
ARM_STATIONS = [
    (0.215, 0.130, SHIRT, "Arm"),
    (0.300, 0.134, SHIRT, "Arm"),
    (0.335, 0.128, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.118, SHIRT, "Arm"),
    (0.520, 0.106, SHIRT, "Arm"),
    (SLEEVE_HEM_X - 0.026, 0.098, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.104, SHIRT_DARK, "Arm"),          # cream hem band, proud
    (SLEEVE_HEM_X + 0.022, 0.099, SHIRT_DARK, "Arm"),
    (SLEEVE_HEM_X + 0.036, 0.082, SHIRT_DARK, "Arm"),  # the hem's underside
    (SLEEVE_HEM_X + 0.052, 0.060, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.056, SKIN, "ForeArm"),
    (1.240, 0.053, SKIN, "ForeArm"),
    (1.365, 0.052, SKIN, "Hand"),
    (1.412, 0.060, SKIN, "Hand"),
    (1.465, 0.069, SKIN, "Hand"),   # knuckle line
    (1.512, 0.058, SKIN, "Hand"),
]

BUBBLES_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    # The fuller cap Sprout's puncture taught: her neck and arms are as thin
    # as his, so the cone from cap to first ring closes the same triangle.
    cap_x=0.100,
    root_ring=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.552,
        finger_root=1.504,
        finger_offsets=((-0.046, 0.0, 0.046), (-0.032, 0.032)),
        finger_lengths=((0.104, 0.118, 0.106), (0.110, 0.115)),
        finger_widths=(0.026, 0.025, 0.020, 0.014),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.392, -0.035, -0.018),
            (1.440, -0.058, -0.030),
            (1.476, -0.071, -0.038),
            (1.497, -0.077, -0.042),
        ),
        thumb_widths=(0.025, 0.023, 0.018, 0.013),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Bare legs, striped socks --------------------------------------------------
#
# Below the skirt hem (mean z 1.01, tilted by hem_drop) her legs are bare to
# the sock tops at ~0.62;
# the crew socks carry two pink stripes near the top and fold at ~0.35 into
# the shoes. Traced per-run: the bare thigh-calf runs 0.205ft wide (radius
# 0.103) and the socks 0.216 (0.108). Her legs are the slimmest yet.
SHORTS_HEM_Z = 1.010   # the skirt hem's MEAN z (tilted ±0.125 by hem_drop) —
                       # the garment boundary this table obeys; legs part
                       # below INSEAM_TOP_Z hidden under the skirt
INSEAM_TOP_Z = 1.300
INSEAM_HEM_Z = 0.620
INSEAM_HEM_HALF = 0.120


def inseam_half(z: float) -> float:
    """Bare legs part immediately below the skirt."""
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.2

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=2.40 runs=2 tol=1
LEG_STATIONS = [
    (1.600, 0.135, 1.05, SKIN, "UpLeg"),
    (1.400, 0.125, 1.04, SKIN, "UpLeg"),
    (1.200, 0.120, 1.03, SKIN, "UpLeg"),
    (1.050, 0.106, 1.02, SKIN, "Leg"),    # the knee's slight waist
    (0.900, 0.116, 1.02, SKIN, "Leg"),    # the calf's swell
    (0.760, 0.106, 1.01, SKIN, "Leg"),
    (0.640, 0.101, 1.00, SKIN, "Leg"),
    (0.620, 0.125, 1.00, SOCK, "Leg"),                # sock top
    (0.575, 0.123, 1.00, STRIPE, "Leg"),              # the two pink stripes
    (0.545, 0.121, 1.00, STRIPE, "Leg"),
    (0.515, 0.119, 1.00, SOCK, "Leg"),
    (0.440, 0.115, 0.99, SOCK, "Leg"),
    (0.380, 0.092, 0.98, SOCK, "Leg"),                # folding into the shoe
    (0.300, 0.088, 0.97, SOCK, "Foot"),
    (0.150, 0.084, 0.95, SOCK, "Foot"),
]

BUBBLES_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=SKIN,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Cream canvas sneakers, near-white sole, low profile. Per-shoe front extent
# ~0.36ft; profile near-shoe ~0.62ft; topline ~0.34 under the sock fold.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 14.0 * pi / 180.0

# not-traceable: the last's fore-aft profile has no sheet view; the scales it
# is built to are the traced numbers above (Tank's proven block-last).
SHOE_STATIONS = [
    (-0.439, 0.058, 0.200, SOLE),
    (-0.388, 0.106, 0.230, SOLE),
    (-0.314, 0.140, 0.256, SOLE),
    (-0.228, 0.162, 0.270, SOLE),
    (-0.131, 0.174, 0.278, SOLE),
    (-0.034, 0.180, 0.280, SOLE),
    (0.057, 0.179, 0.278, SOLE),
    (0.137, 0.168, 0.272, SOLE),
    (0.188, 0.144, 0.262, SOLE),
    (0.239, 0.106, 0.226, SOLE),
]

# not-traceable: a cross-section is a fore-aft cut no view can give; the band
# heights are the boundaries beside SHOE_BANDS.
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
    """The underside's height at a station — toe spring and heel bevel."""
    if y_unscaled <= -0.30:
        t = (-0.30 - y_unscaled) / 0.14
        return SHOE_FLOOR + 0.040 * min(1.0, t) ** 1.6
    if y_unscaled >= 0.16:
        t = (y_unscaled - 0.16) / 0.08
        return SHOE_FLOOR + 0.024 * min(1.0, t) ** 1.5
    return SHOE_FLOOR


SHOE_LENGTH_SCALE = 0.98
SHOE_WIDTH_SCALE = 0.92
SHOE_HEIGHT_SCALE = 1.20

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream on cream: the sole band is brighter, the canvas warmer, the trim
# deeper — value separates them (the roster's cream ramp lesson).
SHOE_BANDS = [
    (0.000, "collar"),      # the rosy line at the sole's base
    (0.110, "midsole"),     # the cream cupsole
    (0.300, "quarter"),     # the beige quarter panel
    (0.930, "quarter"),
]


def no_toe_cap(y_unscaled: float) -> float:
    """The sheet's toe is the beige quarter with cream laces over it; the
    trim lane (toe cap, collar, tongue, straps AND the band stack's sole line)
    is one colour, so a cap in that lane is either pink over a cream-laced
    sheet or cream over a beige one. Off, as round 2 first had it — the
    2.0 sentinel `build_shoe` documents — and the pink sole line is recorded
    as a lane limit until the band stack can carry its own colour."""
    return 2.0


def toe_cap_v_low(y_unscaled: float) -> float:
    """Re-enabled in round 8: the second review read the capless shoe as "a
    bar-of-soap slab". The trim lane is beige now, and a beige bumper is
    nearer the drawing than no bumper."""
    if y_unscaled > -0.24:
        return 2.0
    frac = min(1.0, max(0.0, (-0.24 - y_unscaled) / 0.20))
    return 0.86 - 0.10 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    """The heel patch's lower edge."""
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.62 - 0.20 * frac


BUBBLES_SHOE = ShoeSpec(
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
    toe_cap_edge=no_toe_cap,
    heel_counter_edge=heel_counter_v_low,
    collar=(0.022, 0.105),
    straps=((-0.185, -0.140), (-0.105, -0.060), (-0.025, 0.020)),
    strap_arc_min=0.46,
    heel_point=(0.286, 0.106 + 0.024),
    toe_point=(-0.470, 0.044 + 0.040),
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

    builder.loft(NECK_LEVELS, 0, SKIN, segments)
    torso_segments = 26 if detail >= 2 else segments
    dress_loft(builder, thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
               color_fn=dress_color)
    build_dress_details(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=BUBBLES_ARM)
        build_leg(builder, side, detail, spec=BUBBLES_LEG)
        build_shoe(builder, side, detail, spec=BUBBLES_SHOE,
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
    obj["recessReference"] = "bubbles-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_bubbles_LOD0", "kid_bubbles_LOD1", "kid_bubbles_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_bubbles_LOD0": (20, 12, 2),
        "kid_bubbles_LOD1": (8, 4, 1),
        "kid_bubbles_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "bubbles")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Bubbles reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against bubbles-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the scrunchie accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- bubbles\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_bubbles_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
