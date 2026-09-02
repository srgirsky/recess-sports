"""Rebuild Turbo as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/turbo-pilot.blend \
    --python scripts/v2/blender/sculpt-turbo-source.py

★ TURBO IS THE FULL-HEAD SPIKE MOP — Flash's spike construction scaled from a
crest to the whole crown: a thick hair cap with a LOW fringe (to just above
the brows) and eleven spikes radiating in 3D, their x-leans summing to zero
(Flash's asymmetry lesson). His features sit low under the mop: the roster's
biggest irises, a button nose, a dimple smile.

The conversion: front figure 658px over 4.0ft → 1px = 0.006079ft. The profile
faces +x. Head band: spike apex row 101 (z 3.99) to neck pinch row 362
(z 2.41) — 39.7% of the figure, the tallest hair-inclusive head yet.
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
OUTPUT = REPO / "assets/v2/source/turbo-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/turbo-face-atlas.png"
REVISION = "turbo-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: warm skin #EB9B5C (shadow #8C4B1B), near-black hair #14110D,
# sky-blue tee #6CA4CB, dark navy-grey shorts #33353A, cream socks and shoe
# panels in the backdrop's own cluster. Ramp-authored.
SKIN = rgba("FFAA5E")
SKIN_SHADOW = rgba("C87838")
HAIR = rgba("221E18")        # the spike mop, near-black
SHIRT = rgba("7FB9E6")       # the sky-blue tee — chroma up over #6ca4cb
SHIRT_DARK = rgba("2E4260")  # the navy ringer collar and cuffs
PANTS = rgba("42444C")       # long dark shorts
PANTS_DARK = rgba("2E3038")
SOCK = rgba("FFF6E6")
SHOE = rgba("3A4560")        # navy canvas upper
WHITE = rgba("FFEECC")       # warm cream cupsole
SOLE = rgba("FADFAC")        # warm cream toe bumper, laces
# The team accent is the sock's cream roll-top (the roster's default lane).
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features sit LOW under the mop, confirmed against a zoomed crop (the first
# dark-run read mistook the fringe shadow for brows): bold brows rows 245-260
# (58.0% of the 3.99→2.41 head, z 3.07), the huge irises rows 279-302 centred
# row 290 (72.4%, z 2.845), nostrils rows 318-319, the smile arc rows 328-335
# (88.5%, z 2.59). His big ears sit at the irises' level and are placed by
# eye — the spikes own every width metric.
HEAD_CENTER = (0.0, -0.020, 2.935)
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
    """The huge irises carry the read — a soft, wide dish."""
    dz = nz - (-0.214)
    dx = abs(nx) - 0.295
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.010 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """The tiny button nose (centre nz -0.60)."""
    if abs(nx) > 0.14:
        return 0.0
    dz = nz + 0.600
    if dz < -0.09 or dz > 0.10:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.14) ** 2)
    bridge = 0.006 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.07)
    reach = 0.085 if dz >= 0.0 else 0.095
    t = dz / reach
    tip = 0.075 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Big wing ears at the irises' level.
EAR_SPEC = EarSpec(center=(0.020, 2.850), radii=(0.1700, 0.2000))

# Island solved for his span: brow anchor 19 lands z 3.075 (57.8% of the
# 3.99→2.41 head against the traced 58.0), eye anchor 50 lands z 2.844 (72.4
# vs 72.4), mouth anchor 87 lands z 2.588 (88.6 vs 88.5). The spec REFUSES
# brow and eye — the fringe merges them; the rows above are crop-confirmed
# bounded traces.
FACE_ISLAND = (0.92, -1.656, 2.300)

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


# --- The spike mop -------------------------------------------------------------
#
# A thick cap over the whole skull with a LOW fringe (to just above the
# brows), plus eleven radiating spikes.
# measured: front z=3.26 halfWidth=0.6809
# measured: front z=3.50 halfWidth=0.6231 tol=0.10
CAP_LEVELS = [
    (3.420, 0.150, 0.160, 0.000),
    (3.360, 0.280, 0.300, 0.000),
    (3.280, 0.370, 0.400, 0.010),
    # ★ A RING PAIR STRADDLING THE FRINGE ARC (3.180). The critic's mechanism
    # for the staircase hairline: the tuck makes the diving quads' crossing
    # with the face the visible edge, and with 18 columns and rows 0.12
    # apart that crossing tilted 0.07 ft across the forehead. A pair either
    # side of the arc (the hem sweep's pattern) pins the crossing to a curve.
    (3.195, 0.413, 0.443, 0.017),
    (3.165, 0.428, 0.458, 0.020),
    (3.020, 0.450, 0.480, 0.030),
    (2.880, 0.435, 0.455, 0.060),
    (2.780, 0.395, 0.410, 0.100),
    (2.700, 0.330, 0.340, 0.140),
]

# The fringe hangs LOW — the hairline sits just above the brows and the
# sides drop past the temples to the big ears.
# Ladder (hairline-scan.mjs, front board; the sheet's hairline reads 46.7%
# of head height):
#   arc 3.100 / 3.080 / 3.000     63.0%   (shipped — "brows land on the eyes")
#   arc 3.230 / 3.210 / 3.130     53.5%
#   arc 3.320 / 3.300 / 3.220     49.0%   — the critic measured this rung 0.14 ft
#     too HIGH: the scan's head height ran to the skin blob's bottom, which on
#     the sheet is the collar and on the board the chin. Scan re-bounded at the
#     chin; the critic's like-for-like read puts the sheet's hairline at z 3.16.
#   arc 3.180 / 3.160 / 3.080     (this rung — the critic's own suggestion)
CAP_FRINGE = [
    (0.00, 3.180),
    (0.18, 3.160),
    (0.28, 3.080),
    (0.36, 2.900),
    (0.44, 2.820),
]

CAP_OPEN_BOTTOM = 2.640


def fringe_z_at(x_abs: float) -> float:
    """The mop's open-face edge at lateral offset |x|."""
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
    segments = 18 if detail >= 2 else (10 if detail == 1 else 8)
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


# Eleven spikes radiating in 3D off the cap. Front tips lean over the fringe,
# side tips flare wide, back tips sweep rearward.
# ⚠️ The x-leans SUM TO ZERO — a net lean shifts shading asymmetrically and
# blows faceAsymmetry (Flash's mohawk, measured at 10.7 against 4.0).
# measured: front z=3.98 halfWidth=0.0243
SPIKE_TABLE = [
    ((0.000, -0.150, 3.380), (0.000, -0.420, 3.740)),
    ((0.180, -0.050, 3.360), (0.480, -0.280, 3.700)),
    ((-0.180, -0.050, 3.360), (-0.480, -0.280, 3.700)),
    ((0.030, 0.050, 3.400), (0.000, 0.020, 3.985)),
    ((-0.120, 0.080, 3.380), (-0.300, 0.150, 3.880)),
    ((0.150, 0.120, 3.360), (0.300, 0.350, 3.820)),
    ((-0.280, 0.100, 3.280), (-0.620, 0.220, 3.550)),
    ((0.280, 0.100, 3.280), (0.620, 0.220, 3.550)),
    ((0.000, 0.250, 3.300), (0.000, 0.600, 3.580)),
    ((-0.200, 0.280, 3.200), (-0.450, 0.600, 3.380)),
    ((0.200, 0.280, 3.200), (0.480, 0.600, 3.380)),
]


def build_hair(builder: MeshBuilder, detail: int) -> None:
    ring_loft_cap(builder, CAP_LEVELS, detail)
    if detail < 1:
        return
    spikes = SPIKE_TABLE if detail >= 2 else SPIKE_TABLE[::2]
    for (bx, by, bz), (tx, ty, tz) in spikes:
        builder.tube([(bx, by, bz), (tx, ty, tz)],
                     [0.105, 0.016], 2, HAIR, "Head", 4)


# --- The ringer tee ------------------------------------------------------------
#
# Plain sky blue with a navy ringer collar and navy sleeve cuffs.
# not-traceable: his hanging arms merge with the tee at every torso row; the
# halves here are bounded off the blue cluster runs (169-301 at z 2.20 spans
# the sleeves too — the torso proper is ~0.30).
#
# ★ THE HEM WAS AN APRON AND ITS CAP WAS THE CROTCH. The tee used to stop at
# 1.300 half 0.330 with nothing under it: the loft's bottom fan WAS the crotch
# line, and the shorts tubes (outer edge 0.409 at their old 1.340 top) stuck
# out past the tee's sides in a hard diagonal corner at each hip. Re-traced
# low: the tee FLARES — the hem's blue run is 171-299 about centre column 236
# at z 1.40 (half 0.389, against ~0.30 at the chest), the blue ends at z 1.35
# on the centreline and ~1.37 at the flanks, and the shorts' dark flanks the
# blue from z 1.36 down. So the hem is built as Penny's waistband: a band top,
# a lip 0.010 proud of it that OVERHANGS the shorts tubes (outer 0.374 at
# 1.31) and the crotch yoke, and a turned-under ring beneath. Cloth ends here;
# the kid does not (Zippy's severance lesson) — CROTCH_LEVELS and the raised
# tube tops carry the body on below.
# measured: front z=1.40 halfWidth=0.6231 tol=0.03
# measured: front z=2.40 halfWidth=0.1429 tol=0.03
TORSO_LEVELS = [
    # The hem's PROFILE is drape, not a lampshade: the first band+lip build was
    # a straight cone 1.560→1.398 ending in a near-horizontal brim, and the
    # critic read it exactly as built. Three short bands round the lip edge
    # (crown ring between lip and band top), the fore-aft halves pull in
    # 0.008-0.012 so the flare is shallower in depth than in width, and an
    # ease ring at 1.475 sits 0.008 inside the straight cone so the fall is
    # concave like cloth. The traced front width holds: lip 0.390 / band top
    # 0.380 against the sheet's half 0.389 at z 1.40.
    # not-traceable: the fore-aft halves — the profile view's hem depth is
    # bounded only through the hanging arm that merges with the tee there.
    (1.310, 0.380, 0.288, "Hips"),    # hem underside — turned-under lip
    (1.342, 0.390, 0.298, "Hips"),    # hem lip, proud — overhangs the shorts
    (1.372, 0.388, 0.298, "Hips"),    # lip crown — the edge rounds off, no shelf corner
    (1.398, 0.380, 0.294, "Hips"),    # hem band top
    (1.475, 0.350, 0.284, "Hips"),    # drape ease — concave fall, not a cone
    (1.560, 0.325, 0.278, "Spine"),
    (1.780, 0.308, 0.265, "Spine"),
    (2.000, 0.298, 0.255, "Spine1"),
    (2.160, 0.290, 0.243, "Spine1"),
    (2.260, 0.288, 0.240, "Spine2"),
    (2.320, 0.264, 0.224, "Spine2"),
    (2.370, 0.238, 0.202, "Spine2"),
    (2.410, 0.200, 0.172, "Spine2"),
    (2.436, 0.170, 0.152, "Spine2"),  # navy ringer collar, proud
    # The neck hole rises to 2.505 so the annulus between rib and hole stands
    # near-vertical BEHIND the rib — left sloped, that ring reads as two dark
    # "shoulder panels" flanking the collar from the front (the wedge defect
    # at its worst; the critic read them as authored backpack straps).
    #
    # ★ AND THE HOLE MUST SIT OUTSIDE THE NECK LOFT (Penny's collar). At
    # 0.134/0.126 this ring was INSIDE the neck (0.140/0.132 at 2.448), so the
    # collar's visible top edge was not this ring at all but the interpenetration
    # circle of two lofts tessellated 20-against-14 — a per-column SAWTOOTH of
    # skin against navy, plain at 6x in both T- and A-pose fronts. Not a colour
    # smear: `collar_color` switches inside the short 2.410/2.436 band. With the
    # hole 0.008 clear of the neck all the way up, the top edge is this ring's
    # own crisp circle and the collar stands as a roll the neck emerges from.
    (2.505, 0.146, 0.138, "Spine2"),  # neck hole — OUTSIDE the neck loft
]


def collar_color(theta: float, z: float):
    if z > 2.420:
        return SHIRT_DARK  # the navy ringer collar
    return SHIRT

# His neck pinch is z 2.41 at 0.14 half.
# measured: front z=2.38 halfWidth=0.1398 tol=0.03
NECK_LEVELS = [
    (2.448, 0.140, 0.132, "Spine2"),
    (2.500, 0.138, 0.130, "Neck"),
    (2.580, 0.148, 0.140, "Neck"),
]


# --- Arms: navy-cuffed short sleeves, sturdy bare arms -------------------------
SLEEVE_HEM_X = 0.640

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare forearm traces ~0.058 half.
# The root rings are SMALLER than the roster's habit: the deltoid hump that
# rises above the torso's narrowing shoulder is where the toon terminator
# paints the cross-character "shoulder wedge", and a lower hump under a
# longer torso slope keeps the dark band in the armpit.
ARM_STATIONS = [
    (0.215, 0.130, SHIRT, "Arm"),
    (0.300, 0.136, SHIRT, "Arm"),
    (0.335, 0.131, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.124, SHIRT, "Arm"),
    (0.520, 0.121, SHIRT, "Arm"),
    (0.585, 0.115, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.120, SHIRT_DARK, "Arm"),      # navy ringer cuff, proud
    (0.664, 0.113, SHIRT_DARK, "Arm"),
    (0.682, 0.092, SHIRT_DARK, "Arm"),
    (0.702, 0.068, SKIN, "Arm"),
    (0.800, 0.066, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.064, SKIN, "ForeArm"),
    (ARM_ELBOW_X + 0.048, 0.063, SKIN, "ForeArm"),
    (1.240, 0.060, SKIN, "ForeArm"),
    (1.365, 0.057, SKIN, "Hand"),
    (1.412, 0.065, SKIN, "Hand"),
    (1.465, 0.073, SKIN, "Hand"),   # knuckle line
    (1.512, 0.062, SKIN, "Hand"),
]

TURBO_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    # 0.060, not 0.100: the A-pose rotation opened an enclosed backdrop
    # pocket between collar, shoulder and arm cap — the cap must sit deep
    # enough in the torso to stay covered when the arm swings down.
    cap_x=0.060,
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


# --- Long dark shorts, bare shins, rolled socks --------------------------------
#
# The shorts run from under the tee to z ~0.78 — the longest shorts on the
# roster; bare shins to the sock tops at ~0.46, cream socks with the
# team-accent roll-top, navy low-tops from ~0.30.
SHORTS_HEM_Z = 0.780
INSEAM_TOP_Z = 1.250
INSEAM_HEM_Z = 0.700
INSEAM_HEM_HALF = 0.070


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
#
# ★ THE TUBES MEET THE YOKE, NOT THE TEE'S SILHOUETTE. The old 1.340 top
# (radius 0.178, outer edge 0.409) stood proud of the tee hem (0.352) and the
# handoff read as a hard diagonal corner notch at each hip. The tops now taper
# and rise INSIDE the tee (outer 0.350 at 1.445 against the tee's ~0.365
# there), where they meet CROTCH_LEVELS; the first ring the hem lip actually
# overhangs is 1.310 at outer 0.374, inside the lip's 0.390. Below the hem the
# tube swells back to the drawn baggy thigh (the sheet's outer dark edge holds
# ~0.377-0.389 from z 1.32 to 1.10 about centre column 236).
# measured: front z=1.30 halfWidth=0.6353 tol=0.03
# measured: front z=1.10 halfWidth=0.6322 tol=0.08
LEG_STATIONS = [
    (1.445, 0.132, 1.02, PANTS, "UpLeg"),   # tucked top — meets the yoke in the tee
    (1.310, 0.140, 1.08, PANTS, "UpLeg"),   # first ring under the hem lip
    (1.150, 0.180, 1.14, PANTS, "UpLeg"),
    (0.980, 0.176, 1.10, PANTS, "Leg"),
    (0.860, 0.172, 1.06, PANTS_DARK, "Leg"),          # hem band
    (SHORTS_HEM_Z, 0.166, 1.03, PANTS_DARK, "Leg"),   # hem underside
    (0.758, 0.124, 1.01, PANTS_DARK, "Leg"),          # inner lip
    (0.740, 0.104, 1.00, SKIN, "Leg"),                # bare shin begins
    (0.640, 0.108, 1.01, SKIN, "Leg"),                # the calf
    (0.540, 0.098, 1.00, SKIN, "Leg"),
    (0.460, 0.108, 1.00, TEAM_MASK, "Leg"),           # cream roll-top — the
    (0.424, 0.106, 1.00, TEAM_MASK, "Leg"),           # team-accent band
    (0.400, 0.098, 0.98, SOCK, "Foot"),
    (0.280, 0.090, 0.97, SOCK, "Foot"),
    (0.150, 0.084, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson, Smokey's construction).
# The sheet draws the shorts as ONE joined dark hip mass from the tee hem down
# to the crotch — a single run 175-300 at every row from z 1.32 to 1.20 — and
# the inseam daylight only opens at z 1.18 (5px of backdrop by 1.10). Without
# this loft that whole span was the tee's bottom cap and then backdrop: the
# hem line WAS the crotch line. Bottom ring at the traced crotch z 1.19 (its
# fan is the crotch underside), top ring tucked inside the tee at 1.43 where
# the raised tube tops meet it. Depth bounded off the profile's shorts runs
# (841-921 at z 1.30 → 0.25 half); ASCENDING like Smokey's — `loft` stitches
# in table order.
# measured: front z=1.24 halfWidth=0.6444 tol=0.03
CROTCH_LEVELS = [
    (1.190, 0.150, 0.190, "Hips"),
    (1.320, 0.220, 0.235, "Hips"),
    (1.430, 0.245, 0.265, "Hips"),
]

TURBO_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Navy low-top with cream cupsole, toe bumper and laces.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 14.0 * pi / 180.0

# not-traceable: the last's fore-aft profile has no sheet view; the scales it
# is built to are the traced numbers above.
#
# ★ THE END STATIONS TAPER TO NEAR-POINTS, because the strip's end holes were
# never really capped: build_shoe fans `heel_point` against the table's FIRST
# ring and `toe_point` against its LAST, and this table (like the roster's)
# runs toe-first — so each "cap" is a cone crossing the whole shoe interior,
# and each apex poked out of the far wall as a backfacing needle. On the
# board that rendered as the symmetric dark tick where the cream toe bumper
# meets the cupsole (ray-cast against the exported GLB: the frontmost surface
# at the tick pixels was the toe-fan cone, back-facing; a see-through slit at
# runtime — the Lou backface class in warm cream). With 0.010-half tip rings
# the WALL itself closes both ends and the cross-fans shrink to buried
# needles no aperture can expose.
SHOE_STATIONS = [
    (-0.462, 0.010, 0.150, SOLE),   # toe tip ring — closes the front hole
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
    (0.262, 0.010, 0.160, SOLE),    # heel tip ring — closes the back hole
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
SHOE_WIDTH_SCALE = 0.96
SHOE_HEIGHT_SCALE = 1.26

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Mostly cream: the classifier pair is 77.4/19.4 cream/navy — the navy is
# only the upper quarter band.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.400, "quarter"),
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


TURBO_SHOE = ShoeSpec(
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
    # The end-fan apexes sit INSIDE the shoe volume, behind their own tip
    # rings — see the SHOE_STATIONS header: each fan crosses to the FAR tip
    # ring, so apex and cone must both stay buried.
    # not-traceable: interior sentinel points — the sheet cannot draw a
    # vertex that exists to be invisible.
    heel_point=(0.245, 0.106 + 0.025),
    toe_point=(-0.450, 0.044 + 0.042),
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
    torso_segments = 20 if detail >= 2 else segments
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
                 color_fn=collar_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=TURBO_ARM)
        build_leg(builder, side, detail, spec=TURBO_LEG)
        build_shoe(builder, side, detail, spec=TURBO_SHOE,
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
    obj["recessReference"] = "turbo-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_turbo_LOD0", "kid_turbo_LOD1", "kid_turbo_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_turbo_LOD0": (20, 12, 2),
        "kid_turbo_LOD1": (8, 4, 1),
        "kid_turbo_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "turbo")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Turbo reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against turbo-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock roll-top accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- turbo\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_turbo_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
