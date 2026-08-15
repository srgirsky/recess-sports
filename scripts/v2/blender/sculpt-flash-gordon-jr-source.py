"""Rebuild Flash Gordon Jr. as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/flash-gordon-jr-pilot.blend \
    --python scripts/v2/blender/sculpt-flash-gordon-jr-source.py

★ FLASH IS THE FIRST MOHAWK — a shaved-fade scalp cap hugging the skull, a
crest ridge running the midline from forehead to nape, and seven spikes whose
apex is the head span's own crown (z 3.99). Also the second striped tee: the
red bands reuse Bendy Bao's loft `color_fn` construction with Flash's own
traced chart.

The conversion: front figure 685px over 4.0ft → 1px = 0.005839ft. The profile
faces +x. Head band: crest apex row 153 (z 3.99) to neck pinch row 391
(z 2.60) — 34.7% of the figure.
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
OUTPUT = REPO / "assets/v2/source/flash-gordon-jr-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/flash-gordon-jr-face-atlas.png"
REVISION = "flash-gordon-jr-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: skin #D47432 (deep warm — authored at ~1.2x so it clears the
# classifier's skin floor), crest hair #1C0D03, fade/stubble in the #3B2D22 /
# #1C140B family, tee red #CB2C13 on a backdrop-cream ground, charcoal shorts
# #3B2D22. Ramp-authored per the calibrated boards.
SKIN = rgba("F98B44")
SKIN_SHADOW = rgba("C25E20")
HAIR = rgba("2E1A08")        # the crest — near-black brown
STUBBLE = rgba("3E2A1A")     # the shaved fade over the sides and back
SHIRT = rgba("FFF2DC")       # the tee's cream ground
SHIRT_RED = rgba("F53818")   # the red stripes, collar and cuffs — chroma up so
                             # the board ramp lands back on the sheet's #cb2c13
PANTS = rgba("4A382A")       # charcoal shorts
PANTS_DARK = rgba("332619")
SOCK = rgba("FFF6E6")
SHOE = rgba("D8A768")        # tan quarter panel
WHITE = rgba("FFF6E2")       # cream cupsole
SOLE = rgba("F6E8CE")        # cream toe bumper, collar and straps
# The team accent is the sock's cream roll-top ABOVE the red stripes — the
# stripes are his identity and stay authored red; masking them would strip the
# sheet's own colour from every untinted board.
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_RED,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: bold brows rows 277-291 (55% of the 3.99→2.60
# head, z 3.22), big eyes rows 302-330 centred row 315 (68.1%, z 3.05),
# nostrils rows 344-349, the smirk rows 355-362 (87.4%, z 2.78). Ear line at
# the spec's traced 74.8% (z 2.95), ears 18.3% of head proud.
HEAD_CENTER = (0.0, -0.020, 3.045)
HEAD_RADII = (0.400, 0.450, 0.465)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.05, 1.02),
    (-0.30, 1.05),
    (-0.60, 1.02),
    (-1.00, 0.94),
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
    """Confident wide-open eyes — a modest dish so the atlas carries them."""
    dz = nz - 0.010
    dx = abs(nx) - 0.300
    radial = (dx * dx) / 0.058 + (dz * dz) / 0.024
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """`nose: 'dot'` — a small button above the smirk (centre nz -0.34)."""
    if abs(nx) > 0.18:
        return 0.0
    dz = nz + 0.340
    if dz < -0.12 or dz > 0.13:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.18) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.07) / 0.09)
    reach = 0.100 if dz >= 0.0 else 0.110
    t = dz / reach
    tip = 0.088 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# The biggest ears on the roster so far: 18.3% of head height proud per the
# spec's own trace, on the head's widest row (z 2.95).
EAR_SPEC = EarSpec(center=(0.020, 2.955), radii=(0.1750, 0.2050))

# Island solved for his span: brow anchor 25 lands z 3.222 (55.2% of the
# 3.99→2.60 head against the traced 55.0), eye anchor 50 lands z 3.045 (68.0
# vs 68.1), mouth anchor 85 lands z 2.773 (87.5 vs 87.4). The spec REFUSES
# brow and eye (the fade merges them into one region) and its "mouth" row 345
# is the NOSTRILS; the smirk is the bounded trace at rows 355-362.
FACE_ISLAND = (0.92, -1.250, 2.000)

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


# --- The mohawk: fade cap, crest ridge, spikes ---------------------------------
#
# The sides and back are a shaved fade — a tight stubble shell over the skull,
# open across the face. Ring half-widths are the skull's own surface + 0.02.
# measured: front z=3.26 halfWidth=0.4467
# measured: front z=2.94 halfWidth=0.5460 tol=0.12
SCALP_LEVELS = [
    (3.500, 0.105, 0.115, 0.000),
    (3.440, 0.235, 0.260, 0.000),
    (3.360, 0.320, 0.355, 0.010),
    (3.260, 0.395, 0.432, 0.010),
    (3.020, 0.438, 0.478, 0.030),
    (2.900, 0.420, 0.450, 0.060),
    (2.820, 0.390, 0.415, 0.100),
]

# The hairline: an open face — the fade starts high on the forehead and drops
# past the temples toward the ears.
SCALP_FRINGE = [
    (0.00, 3.500),
    (0.16, 3.460),
    (0.24, 3.280),
    (0.30, 3.000),
    (0.44, 2.920),
]

SCALP_OPEN_BOTTOM = 2.850


def fringe_z_at(x_abs: float) -> float:
    """The fade's lower edge over the face at lateral offset |x|."""
    table = SCALP_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def ring_loft_scalp(builder: MeshBuilder, levels, detail: int) -> None:
    """The ring-loft-with-tuck, tight to the skull, no curl."""
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the offline board renders double-sided and hides it
    # while the runtime lights the mass as a slate-grey void (Bendy's bun).
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_scalp levels must be strictly descending in z"
    segments = 20 if detail >= 2 else (10 if detail == 1 else 8)
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
                if SCALP_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.300)
            ring.append(builder.vertex((x, y, z), STUBBLE, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), STUBBLE, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.02), STUBBLE, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


# The crest ridge: the strip the spikes stand on, midline front-to-nape.
# not-traceable: the ridge's own width hides under the spikes in every view;
# the arc it rides is the skull top plus the fade shell.
CREST_SPINE = [
    (0.0, -0.300, 3.420),
    (0.0, -0.150, 3.490),
    (0.0, 0.150, 3.490),
    (0.0, 0.300, 3.420),
    (0.0, 0.440, 3.280),
    (0.0, 0.540, 3.100),
    (0.0, 0.620, 2.920),
]
CREST_RADII = [0.092, 0.108, 0.108, 0.102, 0.096, 0.084, 0.064]

# The spikes. Apex tip z 3.99 is the head span's own crown; front tips lean
# forward and back tips sweep rearward, off the profile's crest outline.
# measured: front z=3.98 halfWidth=0.0234
# (base x, base y, base z) → (tip x, tip y, tip z). The x lean ALTERNATES so
# the front view reads the concept's multi-point tuft instead of one cone —
# width for free, where flanking spike rows would blow the LOD0 budget.
# ⚠️ The leans MUST sum to zero: a net-leaning crest shifts skin shading
# asymmetrically and the first cut of this table (net -0.047) blew the
# faceAsymmetry tolerance at 10.7 against 4.0.
SPIKE_TABLE = [
    ((-0.020, -0.300, 3.400), (-0.075, -0.400, 3.740)),
    ((0.020, -0.160, 3.480), (0.075, -0.220, 3.880)),
    ((0.000, -0.010, 3.520), (0.000, 0.000, 3.985)),
    ((0.020, 0.140, 3.490), (0.075, 0.200, 3.915)),
    ((-0.020, 0.290, 3.420), (-0.075, 0.420, 3.790)),
    ((0.018, 0.430, 3.280), (0.070, 0.600, 3.575)),
    ((-0.018, 0.530, 3.100), (-0.070, 0.720, 3.295)),
]


def build_mohawk(builder: MeshBuilder, detail: int) -> None:
    ring_loft_scalp(builder, SCALP_LEVELS, detail)
    sides = 5 if detail >= 2 else 4
    spine = CREST_SPINE if detail >= 1 else CREST_SPINE[::2]
    radii = CREST_RADII if detail >= 1 else CREST_RADII[::2]
    builder.tube(spine, radii, 2, HAIR, "Head", sides)
    if detail < 1:
        return
    spikes = SPIKE_TABLE if detail >= 2 else SPIKE_TABLE[::2]
    spike_sides = 4
    for (bx, by, bz), (tx, ty, tz) in spikes:
        builder.tube([(bx, by, bz), (tx, ty, tz)],
                     [0.105, 0.016], 2, HAIR, "Head", spike_sides)


# --- The striped tee -----------------------------------------------------------
#
# Red bands on a cream ground, painted by the loft's own colour hook — the
# construction Bendy Bao proved. Bands traced down the torso at cx+30 (the
# centreline crosses the chest shadow): red at 2.51-2.39, 2.29-2.17,
# 2.06-1.95, 1.86-1.79, and 1.69 down to the hem. Collar and cuffs are red.
# measured: front z=1.90 halfWidth=0.3212
# measured: front z=1.58 halfWidth=0.3737
TORSO_LEVELS = [
    (1.520, 0.360, 0.300, "Hips"),    # hem underside — z 1.5 is shorts on the sheet
    (1.552, 0.385, 0.320, "Hips"),    # hem band, proud
    (1.600, 0.376, 0.315, "Hips"),
    (1.740, 0.352, 0.310, "Spine"),
    (1.900, 0.328, 0.300, "Spine"),
    (2.100, 0.310, 0.280, "Spine1"),
    (2.250, 0.300, 0.255, "Spine1"),
    (2.340, 0.285, 0.235, "Spine2"),
    (2.420, 0.245, 0.205, "Spine2"),
    (2.480, 0.190, 0.170, "Spine2"),
    (2.508, 0.150, 0.140, "Spine2"),
    (2.542, 0.154, 0.144, "Spine2"),  # collar rib, proud — red ringer
    (2.565, 0.134, 0.126, "Spine2"),  # neck hole — OUTSIDE the neck loft, so
]                                     # no diving backfaces (Bendy's wedges)

# His neck is the slimmest measured yet — the pinch is a real 0.123ft half.
# measured: front z=2.54 halfWidth=0.1226 tol=0.03
NECK_LEVELS = [
    (2.555, 0.126, 0.118, "Spine2"),
    (2.625, 0.128, 0.120, "Neck"),
    (2.700, 0.138, 0.130, "Neck"),
]

# ⚠️ (lo, hi) ASCENDING — the membership test is `lo <= z <= hi`, and the
# first build wrote these top-down, which painted no stripe at all.
STRIPES = ((2.390, 2.505), (2.165, 2.290), (1.945, 2.060),
           (1.785, 1.855), (1.518, 1.690))

# ★ LOD0 gets a ring 0.006ft INSIDE each stripe edge on both sides. The loft
# paints per-vertex and interpolates across each quad row, so a colour edge
# between two distant rings smears across the whole gap — the washed-stripe
# read both striped kids' first boards had. LOD1/2 keep the sparse table.
# not-traceable: the paired rows are the STRIPES chart re-expressed as loft
# rings; the shape numbers between them interpolate the traced table above.
TORSO_LEVELS_CRISP = [
    (1.518, 0.361, 0.301, "Hips"),
    (1.552, 0.385, 0.320, "Hips"),
    (1.690, 0.361, 0.312, "Hips"),
    (1.779, 0.346, 0.309, "Spine"),
    (1.791, 0.344, 0.309, "Spine"),
    (1.849, 0.335, 0.306, "Spine"),
    (1.861, 0.333, 0.305, "Spine"),
    (1.939, 0.323, 0.301, "Spine"),
    (1.951, 0.321, 0.300, "Spine"),
    (2.054, 0.313, 0.288, "Spine1"),
    (2.066, 0.312, 0.287, "Spine1"),
    (2.159, 0.306, 0.278, "Spine1"),
    (2.171, 0.305, 0.277, "Spine1"),
    (2.284, 0.300, 0.252, "Spine1"),
    (2.296, 0.299, 0.251, "Spine2"),
    (2.384, 0.276, 0.230, "Spine2"),
    (2.396, 0.274, 0.228, "Spine2"),
    (2.420, 0.245, 0.205, "Spine2"),
    (2.480, 0.190, 0.170, "Spine2"),
    (2.508, 0.150, 0.140, "Spine2"),
    (2.542, 0.154, 0.144, "Spine2"),
    (2.565, 0.134, 0.126, "Spine2"),
]


def stripe_color(theta: float, z: float):
    if z > 2.522:
        return SHIRT_RED   # the red ringer collar
    for lo, hi in STRIPES:
        if lo <= z <= hi:
            return SHIRT_RED
    return SHIRT


# --- Arms: red-cuffed short sleeves, slender bare forearms ---------------------
SLEEVE_HEM_X = 0.660

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare forearm traces ~0.05 half and his build is the roster's
# slenderest so far.
ARM_STATIONS = [
    (0.215, 0.130, SHIRT, "Arm"),
    (0.300, 0.135, SHIRT, "Arm"),
    (0.335, 0.128, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.118, SHIRT, "Arm"),
    (0.560, 0.104, SHIRT, "Arm"),
    (0.634, 0.096, SHIRT, "Arm"),
    (0.660, 0.102, SHIRT_RED, "Arm"),          # red cuff band, proud
    (0.682, 0.096, SHIRT_RED, "Arm"),
    (0.696, 0.078, SHIRT_RED, "Arm"),
    (0.712, 0.056, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.053, SKIN, "ForeArm"),
    (1.240, 0.050, SKIN, "ForeArm"),
    (1.365, 0.049, SKIN, "Hand"),
    (1.412, 0.057, SKIN, "Hand"),
    (1.465, 0.066, SKIN, "Hand"),   # knuckle line
    (1.512, 0.056, SKIN, "Hand"),
]

FLASH_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.100,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.548,
        finger_root=1.500,
        finger_offsets=((-0.044, 0.0, 0.044), (-0.030, 0.030)),
        finger_lengths=((0.100, 0.114, 0.102), (0.106, 0.111)),
        finger_widths=(0.024, 0.023, 0.019, 0.013),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.388, -0.033, -0.017),
            (1.436, -0.055, -0.028),
            (1.472, -0.068, -0.036),
            (1.492, -0.074, -0.040),
        ),
        thumb_widths=(0.024, 0.022, 0.017, 0.012),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Charcoal shorts, skinny bare legs, striped socks --------------------------
#
# Shorts from under the tee to z ~1.03; bare legs to the sock tops at ~0.55;
# cream socks with the double red stripe (0.505-0.478 and 0.452-0.428) and the
# cream roll-top above them carrying the team accent.
SHORTS_HEM_Z = 1.030
INSEAM_TOP_Z = 1.180
INSEAM_HEM_Z = 0.720
INSEAM_HEM_HALF = 0.095


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=0.65 runs=1
LEG_STATIONS = [
    (1.400, 0.160, 1.14, PANTS, "UpLeg"),
    (1.250, 0.164, 1.16, PANTS, "UpLeg"),
    (1.120, 0.166, 1.12, PANTS, "UpLeg"),
    (1.060, 0.172, 1.08, PANTS_DARK, "UpLeg"),        # hem band, proud
    (SHORTS_HEM_Z, 0.164, 1.04, PANTS_DARK, "UpLeg"), # hem underside
    (1.008, 0.126, 1.01, PANTS_DARK, "UpLeg"),        # inner lip
    (0.990, 0.100, 1.00, SKIN, "UpLeg"),              # bare leg begins
    (0.850, 0.096, 1.01, SKIN, "Leg"),
    (0.720, 0.100, 1.01, SKIN, "Leg"),                # the calf
    (0.600, 0.090, 1.00, SKIN, "Leg"),
    (0.550, 0.102, 1.00, TEAM_MASK, "Leg"),           # cream roll-top — the
    (0.516, 0.100, 1.00, TEAM_MASK, "Leg"),           # team-accent band
    (0.505, 0.099, 1.00, SHIRT_RED, "Leg"),           # stripe one
    (0.478, 0.098, 1.00, SHIRT_RED, "Leg"),
    (0.466, 0.097, 1.00, SOCK, "Leg"),
    (0.452, 0.097, 1.00, SHIRT_RED, "Leg"),           # stripe two
    (0.428, 0.096, 1.00, SHIRT_RED, "Leg"),
    (0.410, 0.094, 1.00, SOCK, "Leg"),
    (0.400, 0.090, 0.98, SOCK, "Foot"),
    (0.280, 0.084, 0.97, SOCK, "Foot"),
    (0.150, 0.081, 0.95, SOCK, "Foot"),
]

FLASH_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Cream low-top with a tan quarter panel and cream toe bumper — the sheet's
# family. Bendy Bao's last at Flash's scale.
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
SHOE_HEIGHT_SCALE = 1.24

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, tan quarter above it, cream collar at the topline —
# the toe bumper and straps carry cream over the tan.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.300, "quarter"),
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


FLASH_SHOE = ShoeSpec(
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

    build_mohawk(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, segments)
    if detail >= 2:
        builder.loft(TORSO_LEVELS_CRISP, 1, SHIRT, 19, color_fn=stripe_color)
    else:
        builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                     color_fn=stripe_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=FLASH_ARM)
        build_leg(builder, side, detail, spec=FLASH_LEG)
        build_shoe(builder, side, detail, spec=FLASH_SHOE,
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
    obj["recessReference"] = "flash-gordon-jr-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_flash_LOD0", "kid_flash_LOD1", "kid_flash_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_flash_LOD0": (20, 12, 2),
        "kid_flash_LOD1": (8, 4, 1),
        "kid_flash_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "flash")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Flash Gordon Jr. reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against flash-gordon-jr-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock roll-top accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- flash\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_flash_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
