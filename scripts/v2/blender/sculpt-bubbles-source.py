"""Rebuild Bubbles as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/bubbles-pilot.blend \
    --python scripts/v2/blender/sculpt-bubbles-source.py

★ BUBBLES IS THE FIRST DRESS. The torso loft IS the garment: a fitted pink
bodice gathering at the waist into an A-line skirt that flares to a 1.3ft hem,
with the legs bare beneath it — no character before her has had a garment
whose silhouette leaves the body. She is also the second big hair mass
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
SOLE = rgba("F6C48C")        # beige: the laces and the sole base line, like the quarter
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


# ★ NO EARS — the curl curtains cover them in every view, like Grizz's afro.

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
    return HEAD_CENTER[1] - HEAD_RADII[1] * sqrt(remainder)


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
HAIR_LEVELS = [
    (3.690, 0.345, 0.325, 0.062),
    (3.560, 0.470, 0.360, 0.110),
    (3.400, 0.545, 0.400, 0.150),
    (3.300, 0.575, 0.400, 0.190),
    # ★ ROUND 7: THE CURTAINS KEEP THEIR BACKS AND GIVE UP THEIR FRONTS. The
    # first review found the hair "engulfing the face": these rings' front
    # extents (yc - hy) reached -0.42, at the face plane, where the concept's
    # profile shows the whole face exposed with the hair behind it (front
    # extent ~ -0.10 at the cheek rows). The back column (yc + hy) stays on
    # the measured profile spans.
    (3.180, 0.625, 0.385, 0.280),
    (3.060, 0.660, 0.385, 0.290),
    (2.940, 0.687, 0.380, 0.300),
    (2.820, 0.670, 0.360, 0.310),
    (2.640, 0.640, 0.310, 0.338),
    (2.460, 0.460, 0.235, 0.365),
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
    # 20 keeps mirror columns; the ringlet tubes pay from the shell.
    segments = 20 if detail >= 2 else (10 if detail == 1 else 8)

    def ring_loft(levels, curl_amp, lobe_count):
        assert all(x[0] > y[0] for x, y in zip(levels, levels[1:])), \
            "ring_loft tables must be strictly descending in z"
        ascending = list(reversed(levels))
        rows = []
        for z, half_x, half_y, y_centre in ascending:
            ring = []
            curl = curl_amp if detail >= 2 else 0.0
            for column in range(segments):
                theta = 2 * pi * column / segments
                # Row variation goes in the AMPLITUDE, never the phase
                # (Penny's mirror lesson): the old per-row phase rotation
                # smeared the lobes into noise; fixed vertical ringlet
                # columns with breathing amplitude read as grouped curls.
                breathe = 1.0 + 0.35 * cos(2.1 * len(rows))
                clump = 1.0 + curl * breathe * cos(lobe_count * (theta - pi / 2)) \
                    + (curl * 0.45) * cos((lobe_count + 3) * (theta - pi / 2))
                x = half_x * clump * cos(theta)
                y = y_centre + half_y * clump * sin(theta)
                if y < y_centre:
                    if HAIR_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                        y = max(y, skull_front_y(x, z) + 0.050)
                    else:
                        y = max(y, skull_front_y(x, z) - 0.085)
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

    # ★ THE CURLS ARE LOBED HARD — she is ringlets, not a smooth mass. Seven
    # primary lobes at ±6.5% of radius; the drawing's read is texture first.
    ring_loft(HAIR_LEVELS, 0.065, 7)
    # Sculpted ringlet tubes riding the lower mass (the polish blocker:
    # the cloud needs real curl-clump geometry) — the ponytail tube's
    # lobes/groove machinery, mirrored pairs with flipped winding. LOD0
    # only: they are texture, invisible at LOD1 distance.
    if detail >= 2:
        for sx, y0, z0, y1, z1, r0 in (
            (0.58, 0.16, 3.05, 0.20, 2.72, 0.085),
            (0.44, 0.34, 3.00, 0.40, 2.70, 0.080),
            (0.22, 0.44, 2.98, 0.50, 2.70, 0.078),
        ):
            for side in (1, -1):
                builder.tube(
                    [(side * sx, y0, z0), (side * (sx + 0.03), (y0 + y1) / 2, (z0 + z1) / 2), (side * (sx - 0.02), y1, z1)],
                    [r0, r0 * 0.92, r0 * 0.55], 2, HAIR, "Head", 4,
                    lobes=3, groove=0.018, flip=side < 0)
    # At the far LOD the bun is two pixels; it merges into the mass and its
    # triangles pay for the ringlet lobes that do survive 40px.
    if detail >= 1:
        ring_loft(BUN_LEVELS, 0.075, 6)

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
# half 0.19 at z 2.25, waist gather ~2.05, then the A-line flares to a 0.655
# hem at z 1.345 with the cream band. Depth from the profile: bodice 0.28,
# hem 0.45.
# measured: front z=2.38 halfWidth=0.4486
# measured: view2 z=2.18 halfWidth=0.2768
# measured: view2 z=1.38 halfWidth=0.4342
TORSO_LEVELS = [
    (1.295, 0.560, 0.385, "Hips"),    # the hem's inner lip — the skirt has thickness
    (1.310, 0.630, 0.430, "Hips"),    # hem underside
    (1.345, 0.658, 0.452, "Hips"),    # the cream hem band, proud
    (1.400, 0.615, 0.428, "Hips"),
    (1.500, 0.560, 0.400, "Hips"),
    (1.660, 0.470, 0.352, "Hips"),
    (1.820, 0.400, 0.312, "Spine"),
    (2.000, 0.310, 0.262, "Spine"),
    (2.060, 0.278, 0.245, "Spine1"),  # the waist gather (the bow rides here)
    (2.150, 0.240, 0.228, "Spine1"),
    (2.250, 0.200, 0.215, "Spine2"),  # traced: bodice
    (2.340, 0.190, 0.200, "Spine2"),
    (2.400, 0.165, 0.170, "Spine2"),  # shoulder slope
    (2.430, 0.135, 0.140, "Spine2"),
    (2.448, 0.140, 0.146, "Spine2"),  # cream collar rib, proud
    (2.466, 0.118, 0.120, "Spine2"),  # neck hole
]

# The pinch is at the bottom of the neck and widens into the jaw (the Grizz
# lesson, third application).
# measured: front z=2.40 halfWidth=0.4486 tol=0.06
NECK_LEVELS = [
    (2.455, 0.115, 0.108, "Spine2"),
    (2.540, 0.120, 0.113, "Neck"),
    (2.620, 0.126, 0.119, "Neck"),
]


def dress_color(theta: float, z: float):
    """Cream trim at the collar; pink everywhere else (hem band rings carry
    their own cream in the level colours below via the loft's base colour)."""
    if z > 2.44:
        return SHIRT_DARK
    if 1.315 < z <= 1.36:
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


def surface_patch(builder: MeshBuilder, x0: float, x1: float, z0: float, z1: float,
                  proud: float, colour, top_colour, bone: str) -> None:
    """A raised rectangular panel on the dress front."""
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
            row.append(builder.vertex((x, y, z), top_colour if j == 0 else colour, bone))
        rows.append(row)
    builder.grid(rows, 1, cyclic=False, flip=True)


def build_dress_details(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    # ★ ROUND 8: A BOW IS LOBES, NOT RECTANGLES. The second review scored the
    # patch-built bow "a cluster of blocky white rectangles"; two ellipsoid
    # lobes and a knot read as ribbon from every angle, and the tails stay
    # patches (they ARE flat ribbon).
    _, bow_depth = torso_ring_at(2.04)
    bow_y = -bow_depth - 0.020
    # Lobes only at the near LOD: the bow is a 2px sparkle at LOD1 distance.
    if detail >= 2:
        # Tied-ribbon loops: teardrop tubes angling up-and-out from the
        # knot (the polish round's 'reads as tied' item), not level pods.
        for side in (1, -1):
            builder.tube(
                [(side * 0.022, bow_y + 0.004, 2.040), (side * 0.078, bow_y - 0.006, 2.078), (side * 0.118, bow_y + 0.006, 2.052)],
                [0.028, 0.050, 0.020], 1, SHIRT_DARK, "Spine1", 5, flip=side < 0)
        builder.ellipsoid((0.0, bow_y - 0.014, 2.045), (0.032, 0.028, 0.032), 1, SHIRT_DARK, "Spine1", 6, 4)
    surface_patch(builder, -0.068, -0.022, 1.80, 1.97, 0.026, SHIRT_DARK, SHIRT_DARK, "Hips")
    surface_patch(builder, 0.022, 0.068, 1.80, 1.97, 0.026, SHIRT_DARK, SHIRT_DARK, "Hips")
    # The skirt's patch pocket: pouch plus a prouder cream flap, viewer-left.
    surface_patch(builder, -0.30, -0.14, 1.52, 1.63, 0.022, SHIRT, SHIRT, "Hips")
    surface_patch(builder, -0.31, -0.13, 1.62, 1.675, 0.034, SHIRT_DARK, SHIRT_DARK, "Hips")
    # The flap's button (polish item).
    surface_patch(builder, -0.235, -0.205, 1.630, 1.662, 0.044, SHIRT, SHIRT, "Hips")
    # The two chest buttons.
    # The two chest buttons became one (the drawing's second button is 0.03ft
    # below the first — at any camera the pair reads as one mark; the triangle
    # budget spends better on the bow).
    surface_patch(builder, -0.022, 0.022, 2.250, 2.290, 0.016, SHIRT_DARK, SHIRT_DARK, "Spine2")


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
# Below the skirt hem (z 1.31) her legs are bare to the sock tops at ~0.62;
# the crew socks carry two pink stripes near the top and fold at ~0.35 into
# the shoes. Traced per-run: the bare thigh-calf runs 0.205ft wide (radius
# 0.103) and the socks 0.216 (0.108). Her legs are the slimmest yet.
SHORTS_HEM_Z = 1.310   # the skirt hem — the garment boundary this table obeys
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
    toe_cap_edge=toe_cap_v_low,
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
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
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
