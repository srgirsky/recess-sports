"""Rebuild Cricket as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/cricket-pilot.blend \
    --python scripts/v2/blender/sculpt-cricket-source.py

★ CRICKET IS THE PROVEN MOP-AND-OVERALLS BUILD ON THE FAIREST SKIN — the
spiky clump-modulated mop and denim overalls construction, without the
glasses, over a green tee, with freckles carried by the atlas. The bib
pocket is the team accent per the overalls-lane convention.

The conversion: front figure 714px over 4.0ft → 1px = 0.005602ft. Head band:
spike-top crown row 154 (z 3.99) to neck pinch row 397 (z 2.63) — 34.0% of
the figure. His ear line is refused: the mop owns the widest rows.
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
from sculptlib.head import HeadSpec, head_surface
from sculptlib.leg import LegSpec, build_leg, leg_x
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, ARM_SHOULDER_X, LEG_ANKLE_Z, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/cricket-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/cricket-face-atlas.png"
REVISION = "cricket-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: denim #3B4D5C (28%), the roster's fairest skin #FBC38B
# with shade #DC9353, hair #5C2C03/#945314, green tee #9B9C4C, cream
# backdrop (which the rolled cuffs share). Authored ≈ delivered·1.2 with
# the highlight band clear of the isSkin saturation floor.
SKIN = rgba("FFC276")
SKIN_SHADOW = rgba("DC9448")
HAIR = rgba("8E4E12")        # the spiky brown mop, deep enough to hold
                             # contrast against the fair skin at 40px
HAIR_DARK = rgba("60300A")   # the shaded side masses (fails isSkin, like the sheet)
SHIRT = rgba("B4B65C")       # the green tee
PANTS = rgba("475D70")       # overalls denim
PANTS_DARK = rgba("35485A")
CUFF = rgba("D5CDBE")        # pale rolled cuff — identity
SOCK = rgba("FFF6E6")
SHOE = rgba("A28D68")        # warm taupe canvas (the Professor lesson: a
                             # neutral grey collapses into the cream tone)
WHITE = rgba("F5E6C4")       # cream cupsole
SOLE = rgba("E2BA6A")        # toe bumper and laces, warm
# The team accent is the BIB POCKET badge (the overalls lane's convention —
# a whole-cuff accent renders in team colour and lies).
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view: brows rows 272-291 centred
# ~280 (51.9% of the 3.99→2.63 head, z 3.29 — under the spiky fringe), the
# big eager eyes rows 303-321 centred ~313 (65.4%, z 3.10), the chirpy
# smile bounded at 75% (z 2.97).
HEAD_CENTER = (0.0, -0.020, 3.220)
HEAD_RADII = (0.430, 0.440, 0.460)

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
    """Bright eager eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.260
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small upturned button (centre nz -0.44)."""
    if abs(nx) > 0.18:
        return 0.0
    dz = nz + 0.440
    if dz < -0.11 or dz > 0.12:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.18) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.06) / 0.09)
    reach = 0.095 if dz >= 0.0 else 0.105
    t = dz / reach
    tip = 0.086 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# His ears hide under the mop in every metric.
# not-traceable: placement is by eye against the profile view (~z 3.12).
EAR_SPEC = EarSpec(center=(0.020, 3.120), radii=(0.1200, 0.1500))

# Island solved for his span (crown 3.99, neck 2.63, H 1.361): brow anchor 29
# samples cell 27 → z 3.291 (51.7 against the traced 51.9), eye anchor 50
# samples cell 48 → z 3.104 (65.4 vs 65.4), mouth anchor 61 samples cell 64 →
# z 2.973 (75.0 vs 75.0).
FACE_ISLAND = (0.92, -1.8175, 2.500)

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


# --- The hair: wide spiky mop --------------------------------------------------
#
# A wide brown mop standing well proud of the skull (widest row z 3.42 at
# 0.631 half — 0.22 beyond the skull), a spiky fringe ending above the
# brows, a nape that hangs to the collar, and mirror-symmetric spike tufts
# over the crown.
# measured: front z=3.39 halfWidth=0.5966 tol=0.06
# measured: front z=3.98 halfWidth=0.0243 tol=0.08
CAP_LEVELS = [
    (3.780, 0.220, 0.235, 0.000),
    (3.700, 0.380, 0.395, 0.000),
    (3.620, 0.490, 0.505, 0.005),
    (3.500, 0.560, 0.575, 0.010),
    (3.390, 0.590, 0.605, 0.015),
    (3.280, 0.575, 0.590, 0.030),
    (3.140, 0.520, 0.540, 0.060),
    (3.000, 0.430, 0.455, 0.105),
    (2.900, 0.330, 0.365, 0.150),
]

# The spiky fringe's lower edge: above the brows at centre (brow band tops
# out near z 3.38), dropping past the temples toward the glasses arms.
CAP_FRINGE = [
    (0.00, 3.420),
    (0.20, 3.400),
    (0.25, 3.300),
    (0.33, 3.100),
    (0.44, 3.000),
]

CAP_OPEN_BOTTOM = 2.940


def fringe_z_at(x_abs: float) -> float:
    """The fringe's lower edge over the face at lateral offset |x|."""
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
    # 18, not 17: an odd ring has no mirror-symmetric columns (Dex's parity
    # lesson) — the first build measured faceAsymmetry 4.71 from the clump
    # columns quantizing differently per side.
    segments = 18 if detail >= 2 else (10 if detail == 1 else 8)
    use = levels if detail >= 2 else thin_for_lod([(z, hx, hy, yc) for z, hx, hy, yc in levels], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        # Mirror-symmetric clump bumps (cos(6θ) is even under θ→π−θ, so the
        # leans sum to zero) — without them the mop's back is a featureless
        # helmet against the sheet's leaf-like strand clumps.
        for column in range(segments):
            theta = 2 * pi * column / segments
            clump = 1.0 + 0.055 * cos(6 * theta) * min(1.0, half_x / 0.5)
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                if CAP_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.300)
            # The sheet lights the crown and SHADES the side masses in tones
            # that fail isSkin — auburn passes the classifier like blonde
            # does (Clover's lesson), so the lit tone on the sides would
            # count the whole mop as face. Sides take the dark tone.
            col = HAIR if abs(cos(theta)) < 0.55 else HAIR_DARK
            ring.append(builder.vertex((x, y, z), col, "Head"))
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


# The crown spikes: a centre tuft plus mirrored pairs, so the leans sum to
# zero (the Flash lesson — a net lean blows faceAsymmetry). The silhouette
# above the cap shows paired runs to z 3.90 and a lone tip at 3.98.
# measured: front z=3.82 runs=2
SPIKES = [
    # (root x, root y, root z, tip x, tip y, tip z, root radius) — the wild
    # halo: a first critic measured the five-cone crown at a quarter of the
    # sheet's mass. Mirrored pairs + centreline spikes: leans sum to zero.
    # Lateral tips stay within the sheet's own ±0.60 halo — a first cut at
    # ±0.78 blew the headBox aspect to 1.16 against the concept's 0.87.
    (0.000, 0.020, 3.720, 0.000, 0.030, 4.100, 0.115),
    (0.200, -0.020, 3.680, 0.360, -0.060, 3.960, 0.105),
    (-0.200, -0.020, 3.680, -0.360, -0.060, 3.960, 0.105),
    (0.400, 0.020, 3.520, 0.520, 0.030, 3.800, 0.100),
    (-0.400, 0.020, 3.520, -0.520, 0.030, 3.800, 0.100),
    (0.500, 0.060, 3.320, 0.600, 0.080, 3.430, 0.090),
    (-0.500, 0.060, 3.320, -0.600, 0.080, 3.430, 0.090),
    (0.150, -0.250, 3.640, 0.280, -0.440, 3.880, 0.095),
    (-0.150, -0.250, 3.640, -0.280, -0.440, 3.880, 0.095),
    (0.130, 0.280, 3.620, 0.240, 0.500, 3.860, 0.100),
    (-0.130, 0.280, 3.620, -0.240, 0.500, 3.860, 0.100),
    (0.000, 0.420, 3.400, 0.000, 0.680, 3.560, 0.095),
    (0.280, 0.360, 3.180, 0.400, 0.560, 3.300, 0.085),
    (-0.280, 0.360, 3.180, -0.400, 0.560, 3.300, 0.085),
]


def build_hair(builder: MeshBuilder, detail: int) -> None:
    ring_loft_cap(builder, CAP_LEVELS, detail)
    if detail < 1:
        return
    sides = 5 if detail >= 2 else 4
    use_spikes = SPIKES if detail >= 2 else SPIKES[:9]
    for rx, ry, rz, tx, ty, tz, rr in use_spikes:
        spine = [(rx, ry, rz),
                 ((rx + tx) / 2, (ry + ty) / 2, (rz + tz) / 2),
                 (tx, ty, tz)]
        builder.tube(spine, [rr, rr * 0.55, 0.012], 2, HAIR, "Head", sides,
                     flip=rx < 0)


# --- The overalls torso --------------------------------------------------------
#
# One boxy loft: the green tee above the waist, full denim below, the
# denim bib and straps as PROUD GEOMETRY (Penny's lesson — a colour wedge
# smears and tears under the swing).
# not-traceable: his hanging arms merge with the torso at every row and the
# denim body's edges are colour boundaries inside the silhouette; halves
# bounded off the cluster runs (denim body 137-286 at z 1.40 → 0.43 half;
# bib runs 177-237 at z 2.20).
TORSO_LEVELS = [
    (1.180, 0.400, 0.330, "Hips"),    # overalls hem, baggy
    (1.215, 0.415, 0.345, "Hips"),
    (1.400, 0.418, 0.348, "Hips"),
    (1.600, 0.400, 0.335, "Spine"),
    (1.800, 0.375, 0.315, "Spine"),
    (1.994, 0.346, 0.291, "Spine1"),
    (2.006, 0.344, 0.289, "Spine1"),  # crisp waist edge — vertex colours
    (2.100, 0.332, 0.278, "Spine1"),  # smear between distant rings
    (2.180, 0.320, 0.268, "Spine1"),
    (2.274, 0.300, 0.248, "Spine2"),  # crisp bib-top edge — ring pair
    (2.286, 0.298, 0.246, "Spine2"),
    (2.360, 0.278, 0.230, "Spine2"),
    (2.440, 0.230, 0.196, "Spine2"),
    (2.500, 0.172, 0.152, "Spine2"),
    (2.526, 0.158, 0.142, "Spine2"),  # blue ringer collar, proud
    (2.560, 0.136, 0.126, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

WAIST = 2.000
BIB_TOP = 2.280


def overalls_color(theta: float, z: float):
    if z < WAIST:
        return PANTS       # full denim below the waist
    if z < BIB_TOP and sin(theta) > -0.30:
        return PANTS       # the overalls wrap the sides and back high
    return SHIRT           # the bib is proud geometry, not a colour wedge


# His neck pinch is z 2.59; the mop's nape hangs behind it.
# not-traceable: the front silhouette at neck rows merges skin with the
# hanging nape; the pinch half is bounded off the skin run under the chin.
NECK_LEVELS = [
    (2.530, 0.132, 0.124, "Spine2"),
    (2.610, 0.135, 0.127, "Neck"),
    (2.720, 0.148, 0.139, "Neck"),
]


def torso_surface_y(z: float, frac_x: float, back: bool = False) -> float:
    """The torso's front (or back) surface y at height z, at frac_x of its
    half-width — for seating proud panels."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            d = da + t * (db - da)
            break
    else:
        d = levels[-1][2]
    yy = d * sqrt(max(0.04, 1.0 - frac_x ** 2))
    return yy if back else -yy


def build_bib(builder: MeshBuilder, detail: int) -> None:
    """The denim bib and back panel as proud panels, with the tool pocket."""
    if detail < 1:
        return
    for back in (False, True):
        rows = []
        for z in (2.000, 2.120, 2.220, 2.290):
            half = 0.225 if z < 2.25 else 0.190
            row = []
            cols = 4 if detail >= 2 else 3
            for i in range(cols):
                t = 2 * (i / (cols - 1)) - 1.0
                x = t * half
                y = torso_surface_y(z, x / 0.34, back) + (0.014 if back else -0.014)
                row.append(builder.vertex((x, y, z), PANTS, "Spine1" if z < 2.15 else "Spine2"))
            rows.append(row)
        builder.grid(rows, 1, cyclic=False, flip=back)
    # The chest tool pocket — Gizmo built his own bat; the pocket rim is the
    # darker denim.
    prows = []
    for j, z in enumerate((2.040, 2.120, 2.200)):
        row = []
        for i in range(3):
            t = i - 1
            x = t * 0.120
            y = torso_surface_y(z, x / 0.34) - 0.026
            row.append(builder.vertex((x, y, z), TEAM_MASK, "Spine1"))
        prows.append(row)
    builder.grid(prows, 3, cyclic=False)


def build_straps(builder: MeshBuilder, detail: int) -> None:
    """The denim shoulder straps over the tee."""
    if detail < 1:
        return
    for side in (1, -1):
        rows = []
        # not-traceable: the strap rides the shoulder from bib top to back
        # panel; the path is the torso surface + 0.015.
        path = [
            (0.160, -0.250, 2.290),
            (0.165, -0.195, 2.420),
            (0.170, -0.060, 2.500),
            (0.170, 0.090, 2.470),
            (0.165, 0.215, 2.380),
            (0.160, 0.262, 2.290),
        ]
        for (px, py, pz) in path:
            rows.append([builder.vertex((side * (px - 0.042), py, pz), PANTS, "Spine2"),
                         builder.vertex((side * (px + 0.042), py, pz), PANTS, "Spine2")])
        builder.grid(rows, 1, cyclic=False, flip=side < 0)


# --- Arms: light-blue tee sleeves, bare forearms -------------------------------
SLEEVE_HEM_X = 0.560

SHOULDER_BLEND = {
    0.215: 0.88,
    0.300: 0.62,
    0.345: 0.36,
    0.420: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms inside the torso outline; the bare forearm is bounded ~0.065 half
# from the wrist runs (skin 97-117 at z 1.40).
ARM_STATIONS = [
    (0.215, 0.146, SHIRT, "Arm"),
    (0.300, 0.150, SHIRT, "Arm"),
    (0.335, 0.142, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.130, SHIRT, "Arm"),
    (0.480, 0.130, SHIRT, "Arm"),
    (0.535, 0.124, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.130, SHIRT, "Arm"),           # hem roll, proud
    (0.585, 0.122, SHIRT, "Arm"),
    (0.605, 0.098, SHIRT, "Arm"),
    (0.625, 0.082, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.079, SKIN, "ForeArm"),
    (1.240, 0.075, SKIN, "ForeArm"),
    (1.365, 0.061, SKIN, "Hand"),
    (1.412, 0.069, SKIN, "Hand"),
    (1.465, 0.077, SKIN, "Hand"),   # knuckle line
    (1.512, 0.067, SKIN, "Hand"),
]

CRICKET_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
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


# --- Baggy denim legs, rolled cuffs, cream hi-tops -----------------------------
#
# Wide overall legs straight down from the hem, the pale rolled cuff as the
# team-accent surface, and the cream shoes from z 0.55.
INSEAM_TOP_Z = 1.180
INSEAM_HEM_Z = 0.700
INSEAM_HEM_HALF = 0.035


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# The pair-outer extents below are the sheet's own silhouette; the per-leg
# halves come from the cluster runs (denim 134-204 at z 1.10 → 0.203 half
# per leg; 128-163 at z 0.80 → 0.10+roll).
# measured: front z=1.10 halfWidth=0.3810 tol=0.03
# measured: front z=0.80 halfWidth=0.3894 tol=0.03
# measured: front z=0.46 halfWidth=0.4230 tol=0.04
LEG_STATIONS = [
    (1.280, 0.210, 1.10, PANTS, "UpLeg"),
    (1.150, 0.205, 1.08, PANTS, "UpLeg"),
    (1.100, 0.203, 1.06, PANTS, "UpLeg"),
    (0.980, 0.196, 1.04, PANTS, "Leg"),
    (0.860, 0.192, 1.03, PANTS, "Leg"),
    (0.760, 0.190, 1.02, PANTS, "Leg"),
    (0.740, 0.202, 1.01, CUFF, "Leg"),             # rolled cuff at the ankle, proud
    (0.640, 0.198, 1.00, CUFF, "Leg"),
    (0.600, 0.182, 1.00, PANTS_DARK, "Leg"),       # cuff underside lip
    (0.560, 0.114, 1.00, SOCK, "Leg"),             # sock sliver above the hi-top
    (0.520, 0.106, 1.00, SOCK, "Foot"),
    (0.400, 0.098, 0.99, SOCK, "Foot"),
    (0.280, 0.090, 0.97, SOCK, "Foot"),
    (0.150, 0.085, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations.
CROTCH_LEVELS = [
    (1.220, 0.170, 0.200, "Hips"),
    (1.330, 0.190, 0.230, "Hips"),
    (1.450, 0.210, 0.260, "Hips"),
]

CRICKET_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Cream canvas hi-top with light-blue toe cap and lace accents — the family
# last, chunky.
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


SHOE_LENGTH_SCALE = 1.06
SHOE_WIDTH_SCALE = 1.00
SHOE_HEIGHT_SCALE = 1.30

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole and cream canvas — the tonal split the sheet actually draws
# is sole-shadow against upper, plus the blue accents.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.330, "quarter"),
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


CRICKET_SHOE = ShoeSpec(
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
    trim=SHIRT,
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
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, SHIRT, 17 if detail >= 2 else segments, color_fn=overalls_color)
    build_bib(builder, detail)
    build_straps(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=CRICKET_ARM)
        build_leg(builder, side, detail, spec=CRICKET_LEG)
        build_shoe(builder, side, detail, spec=CRICKET_SHOE,
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
    obj["recessReference"] = "cricket-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_cricket_LOD0", "kid_cricket_LOD1", "kid_cricket_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_cricket_LOD0": (20, 12, 2),
        "kid_cricket_LOD1": (8, 4, 1),
        "kid_cricket_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "cricket")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Cricket reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against cricket-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the rolled-cuff accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- cricket\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_cricket_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
