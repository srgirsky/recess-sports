"""Rebuild Rocket Rosa as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/rocket-rosa-pilot.blend \
    --python scripts/v2/blender/sculpt-rocket-rosa-source.py

★ ROCKET ROSA'S TEE IS THE BACKDROP'S CREAM — the white raglan lives in the
paper's own colour cluster, so the front silhouette probe sees only her ink
outline and skin through the torso band (halfWidth 0.17-0.25 where a torso
plainly is). Every tee half-width here is bounded by hand, and the recipe
records the refusal. Her ponytail is ONE lobed tube (Zippy's pigtail
construction, singular): it spouts from the crown-back gather, crests at the
figure's own crown row, and falls behind her back to mid-torso.

The conversion: front figure 669px over 4.0ft → 1px = 0.005979ft. Head band:
pony crest row 179 (z 3.99) to neck pinch row 391 (z 2.73) — 31.7% of the
figure. Her pony flows BEHIND the head, so for once a long-haired kid keeps a
real front ear line: earLine 67.5%, ear outer span 1.016ft.
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
OUTPUT = REPO / "assets/v2/source/rocket-rosa-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/rocket-rosa-face-atlas.png"
REVISION = "rocket-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: skin #E48A3C (33.6%), navy #2D323C, dark hair #332315 with
# the lighter sweep #3B2D22, burnt orange #AC5A1D (the piping, tie and skin
# shadow share one cluster), cream #FBECDA — which is the BACKDROP, so the
# tee has no cluster of its own. Authored ≈ delivered·1.2 with chroma kept
# clear of the r-clip ceiling (Noodle's lesson).
SKIN = rgba("FFA24A")
SKIN_SHADOW = rgba("CE7A2E")
HAIR = rgba("3D2A19")        # deep brown, ·1.2 of the sheet's #332315
HAIR_SWEEP = rgba("4A3826")  # the lighter swept lock tone
SHIRT = rgba("FFF4DE")       # the white raglan body
ORANGE = rgba("E8681F")      # collar/hem piping and the pony tie — identity
PANTS = rgba("363C48")       # navy sprint shorts, ·1.2 of #2D323C
PANTS_DARK = rgba("262B36")
SOCK = rgba("FFF6E6")
SHOE = rgba("3A4054")        # navy upper
WHITE = rgba("FFF2D2")       # cream cupsole
SOLE = rgba("F6E0B8")        # toe bumper, laces, trim
# The team accent is the SOCK ROLL-TOP (the bare-leg lane's convention —
# Grizz/Bendy/Flash/Turbo). Cream-adjacent so the untinted board reads true.
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=ORANGE,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: brow bands rows 276-284
# (centroid ~279, 47.2% of the 3.99→2.73 head, z 3.40), eyes rows 298-321
# centred row 309 (61.3%, z 3.22), nose rows 341-342, the steady racer smile
# rows 352-356 centred 354.5 (82.8%, z 2.94). The recipe records the mouth
# refusal — a nose-shadow band at row 342 competes with the lip line; the
# rows here are the LOWER band, traced bounded.
HEAD_CENTER = (0.0, -0.020, 3.170)
HEAD_RADII = (0.390, 0.420, 0.420)

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
    """Bright determined eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.010
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small button at rows 341-342 (centre nz -0.31)."""
    if abs(nx) > 0.17:
        return 0.0
    dz = nz + 0.310
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.17) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.082 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Real front ears — the pony flows behind the head, so the widest head row IS
# the ear row: earLine 67.5% (z 3.14), outer span 170px = 1.016ft against a
# temple span of 143px = 0.855ft, so each ear stands ~0.08 proud.
# measured: front earLine=67.5 earWidth=1.016
EAR_SPEC = EarSpec(center=(0.020, 3.140), radii=(0.1350, 0.1650))

# Island solved for her span (crown 3.99, neck 2.73, H 1.268): brow anchor 25
# samples cell 23 → z 3.394 (47.3% against the traced 47.2), eye anchor 50
# samples cell 48 → z 3.218 (61.2 vs 61.3), mouth anchor 83 samples cell 86 →
# z 2.944 (82.8 vs 82.8).
FACE_ISLAND = (0.92, -1.3240, 2.300)

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


# --- The hair: swept cap, high ponytail, orange tie ----------------------------
#
# A deep-brown cap over the skull with an open forehead (brows and eyes fully
# visible) and short side curtains that end above the jaw, then ONE lobed
# ponytail spouting from the crown-back gather. The sheet's fringe is
# side-swept (dark curtain px 116-142, swept lock px 194-214, skin windows
# between at the brow row); the cap here keeps the curtains mirror-symmetric
# — an authored asymmetric lock is the exact lean that blew faceAsymmetry on
# Flash and Penny, and the sheet asymmetry is recorded OFF-with-cause in the
# fidelity record instead.
# measured: front z=3.50 halfWidth=0.4723
# measured: front z=3.58 halfWidth=0.4425
# measured: front z=3.90 halfWidth=0.2451 tol=0.10
CAP_LEVELS = [
    (3.880, 0.150, 0.160, 0.000),
    (3.820, 0.290, 0.300, 0.000),
    (3.740, 0.350, 0.365, 0.000),
    (3.660, 0.400, 0.415, 0.005),
    (3.580, 0.440, 0.455, 0.010),
    (3.500, 0.468, 0.485, 0.015),
    (3.380, 0.462, 0.475, 0.020),
    (3.200, 0.435, 0.450, 0.045),
    (3.020, 0.400, 0.420, 0.095),
    (2.900, 0.340, 0.360, 0.135),
]

# The hairline: open forehead down to just above the brow band (z 3.40), the
# curtains dropping past the temples to the ear tops.
CAP_FRINGE = [
    (0.00, 3.480),
    (0.20, 3.470),
    (0.30, 3.430),
    (0.37, 3.280),
    (0.44, 3.150),
]

CAP_OPEN_BOTTOM = 2.960


def fringe_z_at(x_abs: float) -> float:
    """The hairline's lower edge over the face at lateral offset |x|."""
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


# The ponytail, in two pieces reading as one: a curved CREST tube spouting
# up from the gather, and a flowing RIBBON loft falling behind her back —
# the sheet's tail fans WIDE at ear height (hair runs at ±0.44 flank the
# head at z 3.10) then narrows to a sliver by the neck rows: the front view
# shows NO tail at z 2.46-2.54 while the profile shows a 0.34ft-deep mass,
# so the falling tail is deep in y and thin in x. Centred on x=0, so it
# adds nothing to faceAsymmetry.
# measured: front z=3.98 runs=2
# not-traceable: the y stations are depth no front view can give; bounded
# off the profile segs (crest 626-694 merges the crown, the tail 725-784
# rides against the nape and back).
PONY_SPINE = [
    (0.000, 0.030, 3.600),
    (0.000, 0.070, 3.830),
    (0.000, 0.190, 3.935),
    (0.000, 0.330, 3.770),
    (0.000, 0.420, 3.600),
]
PONY_RADII = [0.095, 0.150, 0.175, 0.150, 0.110]

# (z, half_x, y_centre, half_y) — strictly descending in z. The tail ends
# MID-BACK with AIR between hair and body (the sheet's bouncy fall), and the
# open slit below the tip keeps the silhouette gate happy: a pocket only
# encloses when the tail re-touches the body at the bottom. Through the
# neck-pinch band (z 2.35-2.75) the ribbon stays NARROWER than the neck's
# own 0.126 half, so the headBox run never widens — the sheet agrees: the
# front view shows no tail at all at those rows.
# ⚠️ THE TAIL'S DEPTH REACH IS CAMERA-COUPLED: the review render auto-frames
# the model's bounding box, so pushing the ribbon's back edge past y ~0.55
# backs the camera up, shrinks the measured head fraction and slides the
# faceSkin sample row onto the drawn eyes. Every y_c below keeps
# y_c + half_y ≤ 0.55 — the bounce is carried in z, not depth.
# not-traceable: the ribbon's y stations are depth no front view can give;
# bounded off the profile segs (the fall rides px 725-784 against the nape).
TAIL_LEVELS = [
    (3.520, 0.200, 0.300, 0.100),
    (3.300, 0.360, 0.380, 0.130),
    (3.100, 0.480, 0.390, 0.140),
    (2.950, 0.360, 0.375, 0.150),
    (2.870, 0.240, 0.390, 0.135),
    (2.800, 0.140, 0.420, 0.105),  # the gather waist the band squeezes
    (2.730, 0.160, 0.405, 0.120),
    (2.650, 0.115, 0.380, 0.145),
    (2.500, 0.095, 0.405, 0.120),
    (2.350, 0.070, 0.420, 0.080),
]

# The orange scrunchie wraps the ribbon at the fan's waist (z ~2.85), where
# the tail is visibly clear of the cap. Two builds earlier placements died
# unseen: at the gather's spine depth it sat inside the cap dome, and even
# proud of the spine it stayed inside the cap's own lateral wall from the
# profile ray — the deep cap occludes everything above z ~3.1. The Zippy
# headband lesson, radially: an accent must ride OUTSIDE the surface that
# will be rendered over it.
# The band is FATTER than the ribbon's squeezed waist in every axis but
# stays inside the tail's own bounding box — a bigger reach moves the
# review camera's auto-framing and shifts every measured ratio (two builds
# chased faceSkin regressions that were really the camera backing up).
TIE_SPINE = [(0.000, 0.385, 2.795), (0.000, 0.395, 2.880)]
TIE_RADII = [0.145, 0.132]


def build_tail(builder: MeshBuilder, levels, detail: int) -> None:
    """The falling ribbon: elliptical rings behind the nape."""
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "TAIL_LEVELS must be strictly descending in z"
    segments = 12 if detail >= 2 else (7 if detail == 1 else 5)
    use = levels if detail >= 1 else levels[::3]
    ascending = list(reversed(use))
    rows = []
    for z, half_x, y_c, half_y in ascending:
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            # A gentle 3-lobe groove so the ribbon reads as gathered strands.
            r = 1.0 - 0.10 * max(0.0, cos(3 * theta))
            ring.append(builder.vertex(
                (half_x * cos(theta) * r, y_c + half_y * sin(theta) * r, z),
                HAIR_SWEEP, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][2], ascending[0][0] - 0.03), HAIR_SWEEP, "Head")
    top = builder.vertex((0.0, ascending[-1][2], ascending[-1][0] + 0.02), HAIR_SWEEP, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


def build_hair(builder: MeshBuilder, detail: int) -> None:
    ring_loft_cap(builder, CAP_LEVELS, detail)
    tail_sides = 9 if detail >= 2 else (5 if detail == 1 else 3)
    spine = PONY_SPINE if detail >= 1 else PONY_SPINE[::2]
    radii = PONY_RADII if detail >= 1 else PONY_RADII[::2]
    # ⚠️ groove subtracts ABSOLUTELY from each ring radius — keep it under
    # the smallest radius or the tube turns inside-out at runtime only.
    builder.tube(spine, radii, 2, HAIR_SWEEP, "Head", tail_sides,
                 lobes=3, groove=0.020)
    build_tail(builder, TAIL_LEVELS, detail)
    if detail >= 1:
        builder.tube(TIE_SPINE, TIE_RADII, 2, ORANGE, "Head", 6)


# --- The white raglan tee ------------------------------------------------------
#
# Cream-white body from the collar (z ~2.66) down over the shorts, with the
# orange piping ring at the collar. The piping's second appearance is the
# sleeve hems (see ARM_STATIONS).
# not-traceable: the tee IS the backdrop cream — the front silhouette
# through the torso band reads only ink outline and hands (halfWidth
# 0.17-0.25), so the halves here are bounded by hand from her hip span
# (navy shorts trace 0.34 half at z 1.60) tapering to the neck.
#
# ★ THE HEM IS WHERE CLOTH ENDS, NOT WHERE THE KID ENDS (Zippy's pelvis).
# The old bottom ring sat at z 1.620 while LEG_STATIONS top out at 1.600:
# a 0.020ft band of her had no geometry, and the delivered front board
# showed backdrop straight through the hips at y=421 (continuity.lint's
# rocket debt). The bottom ring pair now reaches 1.560 — 0.040ft BELOW the
# shorts' top — so tee and shorts overlap, and it is built as a hem, not a
# disc: the bottom ring stands 0.010ft proud of the ring above (Penny's
# waistband lesson — crisp alone is a colour edge; crisp + proud is a
# constructed garment). Both rings are SHIRT so no colour ramps across the
# band.
# measured: the sheet's visible hem line (navy full-width from row 573,
# front view) is z 1.638; the ring z below it is construction, not trace.
# not-traceable: hem ring z 1.560 — forced below the rig's leg-station cap
# (LEG_HIP_Z 1.600) plus ~0.03ft of board perspective shift, so the two
# forms overlap in every rendered view; the sheet cannot give a z for
# cloth that is hidden behind cloth.
TORSO_LEVELS = [
    (1.560, 0.354, 0.302, "Hips"),  # hem lip — proud, overhangs the shorts
    (1.585, 0.344, 0.292, "Hips"),  # the tee body tucks back above the lip
    (1.850, 0.315, 0.266, "Spine"),
    (2.050, 0.298, 0.252, "Spine1"),
    (2.360, 0.285, 0.240, "Spine1"),
    (2.360, 0.276, 0.230, "Spine2"),
    (2.440, 0.250, 0.208, "Spine2"),
    (2.500, 0.200, 0.172, "Spine2"),
    (2.545, 0.163, 0.146, "Spine2"),
    (2.585, 0.145, 0.132, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

# The collar piping band: orange between these z bounds (ascending, the
# membership test is lo <= z <= hi). The collar sits LOW — the concept's
# cream tee is the backdrop's own colour, and the neck-pinch row its
# silhouette actually shows is z 2.54 (halfWidth 0.042): the visible skin
# sliver above a wide low collar, not a high crew neck.
COLLAR_PIPE = (2.505, 2.558)

# ★ LOD0 gets a ring 0.006ft inside each piping edge on both sides — vertex
# colours interpolate across quad rows, so a band between distant rings
# smears (the washed-stripe lesson).
# not-traceable: the paired rows re-express COLLAR_PIPE as loft rings; the
# shape numbers interpolate the bounded table above.
TORSO_LEVELS_CRISP = [
    (1.560, 0.354, 0.302, "Hips"),  # hem lip — proud (see TORSO_LEVELS)
    (1.585, 0.344, 0.292, "Hips"),
    (1.850, 0.315, 0.266, "Spine"),
    (2.050, 0.298, 0.252, "Spine1"),
    (2.360, 0.285, 0.240, "Spine1"),
    (2.360, 0.276, 0.230, "Spine2"),
    (2.440, 0.250, 0.208, "Spine2"),
    (2.499, 0.201, 0.173, "Spine2"),
    (2.511, 0.190, 0.164, "Spine2"),
    (2.552, 0.158, 0.142, "Spine2"),
    (2.564, 0.153, 0.138, "Spine2"),
    (2.585, 0.145, 0.132, "Spine2"),
]


def piping_color(theta: float, z: float):
    if COLLAR_PIPE[0] <= z <= COLLAR_PIPE[1]:
        return ORANGE
    return SHIRT


# The visible neck runs from the low collar (z 2.55) up under the chin —
# the concept's own narrowest silhouette row is z 2.54 at 0.042 half (the
# ink sliver where the backdrop-cream collar vanishes), so the pinch the
# headBox instrument finds must sit here, not at the hair-curtain row 391.
# not-traceable: the collar itself is cream-on-cream and invisible on the
# sheet — only the ink pinch row (z 2.54, 0.042 half) bounds it from above.
# The bottom ring is a full 2px narrower than the ring above at render
# scale — the headBox detector keeps the TOPMOST of equal-width rows, and
# when the whole neck quantized to one 36px width the pinch drifted up to
# the chin and dragged the faceSkin sample row onto the drawn eyes.
NECK_LEVELS = [
    (2.555, 0.118, 0.112, "Spine2"),
    (2.640, 0.132, 0.124, "Neck"),
    (2.790, 0.145, 0.136, "Neck"),
]


# --- Arms: white short sleeves with orange piping hems, bare forearms ----------
SLEEVE_HEM_X = 0.560

# The Turbo lesson: bury the arm root cap and slope the shoulder long, or the
# toon terminator pockets the silhouette at the deltoid.
SHOULDER_BLEND = {
    0.215: 0.88,
    0.300: 0.62,
    0.345: 0.36,
    0.420: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms (they merge with the torso outline at every row); the piping hem ring
# carries the raglan's orange onto the sleeve edge, the bare forearm is
# bounded ~0.06 half from the wrist runs.
ARM_STATIONS = [
    (0.215, 0.132, SHIRT, "Arm"),
    (0.300, 0.148, SHIRT, "Arm"),
    (0.335, 0.146, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.140, SHIRT, "Arm"),
    (0.480, 0.132, SHIRT, "Arm"),
    (0.535, 0.126, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.132, ORANGE, "Arm"),          # piping hem roll, proud
    (0.585, 0.124, ORANGE, "Arm"),
    (0.605, 0.100, SHIRT, "Arm"),
    (0.625, 0.082, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.079, SKIN, "ForeArm"),
    (1.240, 0.075, SKIN, "ForeArm"),
    (1.365, 0.068, SKIN, "Hand"),
    (1.412, 0.067, SKIN, "Hand"),
    (1.465, 0.075, SKIN, "Hand"),   # knuckle line
    (1.512, 0.065, SKIN, "Hand"),
]

ROCKET_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
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


# --- Navy sprint shorts, bare legs, roll-top socks -----------------------------
#
# Knee-length navy shorts from under the tee to z 1.18, bare legs to the
# sock tops, cream socks with the ROLL-TOP as the team-accent surface, navy
# shoes below z 0.30.
SHORTS_HEM_Z = 1.180
INSEAM_TOP_Z = 1.600
INSEAM_HEM_Z = 1.160
INSEAM_HEM_HALF = 0.025


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# The pair-outer extents below are the sheet's own silhouette; the per-leg
# halves in the table come from the cluster runs (navy 125-180 at z 1.40 →
# 0.164 half per leg; skin 125-163 at z 1.10 → 0.114).
# measured: front z=1.40 halfWidth=0.4694 tol=0.03
# measured: front z=1.25 halfWidth=0.4036 tol=0.03
# measured: front z=1.10 halfWidth=0.3647 tol=0.03
# measured: front z=0.80 halfWidth=0.3946 tol=0.03
# ★ The top station is the shorts' RIM, and the rim lives under the tee.
# At 0.180 half the rim's outer corners stood wider than the tee hem above
# them and notched the hem line with two V-shaped cream wedges (the first
# overlap build showed them at the hem's flanks). 0.142 tucks the rim
# inside the tee (outer 0.342 < the 1.560 hem lip's 0.354) and the tubes
# flare back to their traced widths by 1.480; the visible navy at the hem
# line then measures 0.354 half against the sheet's 0.353.
# measured: front z=1.638 navy halfWidth=0.353 (rows 573+, full-width runs)
LEG_STATIONS = [
    (1.600, 0.142, 1.12, PANTS, "UpLeg"),
    (1.480, 0.172, 1.10, PANTS, "UpLeg"),
    (1.400, 0.164, 1.06, PANTS, "UpLeg"),
    (1.250, 0.170, 1.03, PANTS, "UpLeg"),
    (SHORTS_HEM_Z, 0.166, 1.01, PANTS_DARK, "UpLeg"),  # hem inner lip
    (1.160, 0.118, 1.00, SKIN, "UpLeg"),               # bare leg begins
    (1.100, 0.114, 1.00, SKIN, "UpLeg"),
    (0.950, 0.111, 1.01, SKIN, "Leg"),
    (0.800, 0.102, 1.01, SKIN, "Leg"),
    (0.650, 0.105, 1.00, SKIN, "Leg"),                 # the calf
    (0.520, 0.098, 1.00, SKIN, "Leg"),
    (0.460, 0.108, 1.00, TEAM_MASK, "Leg"),            # roll-top, proud — THE accent
    (0.425, 0.106, 1.00, TEAM_MASK, "Leg"),
    (0.400, 0.097, 0.99, SOCK, "Foot"),
    (0.280, 0.089, 0.97, SOCK, "Foot"),
    (0.150, 0.084, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch: a small centre loft between the two leg
# tubes so the shorts read as ONE garment (Zippy's lesson — the gap is the
# space between the tubes, not the inseam carve).
#
# ★ THE YOKE MUST REACH THE TOP OF THE GAP IT CLOSES. Topped at 1.500 it
# left a see-through notch above it — the delivered front board showed
# backdrop through the crotch at x267-272, y422-435 (z ≈ 1.48-1.57),
# because the tube inner walls only near each other and the tee's old
# bottom sat at 1.620. The top ring is MOVED (not added — zero triangles)
# to 1.620, inside the lowered tee, so tube walls, yoke and tee overlap;
# the middle ring is re-spaced to match.
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations and to overlap the tee's
# 1.560 hem ring from inside.
CROTCH_LEVELS = [
    (1.200, 0.140, 0.160, "Hips"),
    (1.410, 0.168, 0.192, "Hips"),
    (1.620, 0.195, 0.215, "Hips"),
]

ROCKET_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Navy low-top with cream cupsole, toe bumper and laces — the family last at
# Rocket's scale.
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
SHOE_WIDTH_SCALE = 0.94
SHOE_HEIGHT_SCALE = 1.18

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, navy canvas above.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.290, "quarter"),
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


ROCKET_SHOE = ShoeSpec(
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
        builder.loft(TORSO_LEVELS_CRISP, 1, SHIRT, 17, color_fn=piping_color)
    else:
        builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                     color_fn=piping_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=ROCKET_ARM)
        build_leg(builder, side, detail, spec=ROCKET_LEG)
        build_shoe(builder, side, detail, spec=ROCKET_SHOE,
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
    obj["recessReference"] = "rocket-rosa-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_rocket_LOD0", "kid_rocket_LOD1", "kid_rocket_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_rocket_LOD0": (20, 12, 2),
        "kid_rocket_LOD1": (8, 4, 1),
        "kid_rocket_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "rocket")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Rocket Rosa reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against rocket-rosa-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock roll-top accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- rocket\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_rocket_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
