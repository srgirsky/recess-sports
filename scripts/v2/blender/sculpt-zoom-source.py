"""Rebuild Zoom Ramirez as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/zoom-pilot.blend \
    --python scripts/v2/blender/sculpt-zoom-source.py

★ ZOOM IS THE SEATED SPORT-CHAIR ATHLETE — the roster's only wheelchair
user. The kid (head, spiky swept crown, tee torso, arms) is standard
canonical-rig construction; the chair, the bent legs and the tucked shoes
are ROOT-weighted geometry, the proxy's proven approach: the sport seat
sits at the rig's own hip height, so the shared skeleton fits a seated
kid without a second rig. The blue push rims are the team accent.

His sheet is seated in every view, so the analyser's 4ft scaling makes its
z frame chair-relative — only percent-of-head landmarks carry over, and
every form table here is authored in the rig's real feet.
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
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, ARM_SHOULDER_X

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/zoom-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/zoom-face-atlas.png"
REVISION = "zoom-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: navy tee/shorts #142C4C (one cluster), near-black hair,
# lit skin #E8934E, with the teal trim and blue push rims as the two
# saturated accents. Authored ≈ delivered·1.2.
SKIN = rgba("F0A05E")
SKIN_SHADOW = rgba("B87232")
HAIR = rgba("2A211C")        # near-black warm crown
HAIR_DARK = rgba("17110C")
TEE = rgba("24406E")         # navy athletic tee
TEE_DARK = rgba("182E52")
TRIM = rgba("2F8098")        # teal collar and side panels
SHORTS = rgba("1E3458")
SHORTS_DARK = rgba("142440")
SHOE = rgba("2C4F8E")        # blue sneakers
WHITE = rgba("F4EADA")       # soles
TIRE = rgba("262B33")
FRAME = rgba("59616C")       # charcoal frame tube
METAL = rgba("A8B2BE")       # hubs, footplate
SEAT = rgba("20242C")        # seat and backrest upholstery
# ★ The team accent is the PUSH RIM PAIR — the one part of a sport chair
# that is genuinely team-coloured, and the only geometry on M_Accessory.
TEAM_MASK = rgba("2E82E6")   # bright enough to cluster apart from the tire ink

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=TEE, shirt_dark=TEE_DARK,
    pants=SHORTS, pants_dark=SHORTS_DARK,
    shoe=SHOE, sock=WHITE, white=WHITE, sole=WHITE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded crop traces (the analyser refused brow and eye - the
# swept crown merges the regions): thick straight brows centred ~row 180
# (56.2% of the 71→265 head band), big eyes centred ~row 210 (71.6%), the
# easy smile at the analyser's own 83.5%.
HEAD_CENTER = (0.0, -0.020, 2.930)
HEAD_RADII = (0.420, 0.430, 0.436)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.01),
    (0.05, 1.04),
    (-0.30, 1.06),
    (-0.60, 1.02),
    (-1.00, 0.92),
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
    """Big warm eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.122
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small rounded button nose (centre nz -0.20)."""
    if abs(nx) > 0.17:
        return 0.0
    dz = nz + 0.200
    if dz < -0.10 or dz > 0.11:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.17) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.088 if dz >= 0.0 else 0.098
    t = dz / reach
    tip = 0.082 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# ★ No earLine gate (Zippy's precedent — the spike crown owns the widest
# rows on the sheet AND any delivery). Placed off the face crop: ears at
# ~64% of head, big and proud.
EAR_SPEC = EarSpec(center=(0.020, 3.000), radii=(0.1450, 0.1550))

# Island solved for his span (crown 3.95, neck 2.60): brow anchor 24 samples
# cell 22 → z 3.187 (56.4 against the traced 56.2), eye anchor 50 samples
# cell 48 → z 2.983 (71.6 vs 71.6), mouth anchor 64 samples cell 67 →
# z 2.823 (83.5 vs 83.5).
# ⚠️ The first solve put the skull centre AT the eye line and drove the
# island's low to -1.578 rad - PAST the south pole - which collapsed the
# chin rows into micro-rings whose split normals tripped the mirror gate.
# The centre sits below the eye line now and low stays inside ±π/2.
FACE_ISLAND = (0.92, -1.4407, 2.500)

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
    with the no-skull sentinel."""
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


# --- The swept spike crown -----------------------------------------------------
#
# A skull-hugging shell (no bald reads from behind — the nape-shell rule)
# with swept spike tubes gesturing UP AND BACK, mirrored in x so the leans
# sum to zero laterally while the fore-aft sweep carries the direction.
# not-traceable: every candidate row on the sheet crosses spikes and face
# in one run; the shell hugs the authored skull at +0.035.
HAIR_LEVELS = [
    (3.390, 0.360, 0.380, 0.010),
    (3.330, 0.435, 0.450, 0.010),
    (3.220, 0.448, 0.462, 0.015),
    (3.080, 0.438, 0.452, 0.030),
    (2.930, 0.400, 0.420, 0.070),
    (2.820, 0.320, 0.350, 0.120),
    (2.740, 0.220, 0.260, 0.155),
]

HAIR_OPEN_BOTTOM = 2.720
HAIR_FRINGE_Z = 3.240      # the crown sits high — his forehead is open


def hair_window_z(x_signed: float) -> float:
    x_abs = abs(x_signed)
    # 0.28/0.40 (was 0.30/0.42): the 16-column shell re-quantized the window
    # and opened visible-face to 39.9 against the concept's 31.5 (tol 6) —
    # the window moves WITH the ring, in whichever direction the measure
    # says (Theo's rule ran the other way).
    if x_abs < 0.28:
        return HAIR_FRINGE_Z
    if x_abs < 0.40:
        return HAIR_FRINGE_Z - (x_abs - 0.28) * 2.0
    return 2.960


def build_hair(builder: MeshBuilder, detail: int) -> None:
    assert all(a[0] > b[0] for a, b in zip(HAIR_LEVELS, HAIR_LEVELS[1:])), \
        "HAIR_LEVELS must be strictly descending in z"
    # 16 even columns (was 12): six lobes on twelve columns was TWO samples
    # per lobe — below the readable floor, pure ring noise — and the big flat
    # facets took the game light as steel-blue glints on a near-black crown
    # (the critic's grey-blue finding). The wave is DROPPED rather than
    # ported to the curl field: his texture is the SPIKES; the shell is the
    # scalp under them and the sheet draws it smooth.
    segments = 16 if detail >= 2 else 8
    use = HAIR_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in HAIR_LEVELS], detail)
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
                if HAIR_OPEN_BOTTOM < z < hair_window_z(x):
                    y = max(y, (sf + 0.045) if sf > -9.0 else -0.150)
                else:
                    y = max(y, (sf - 0.050) if sf > -9.0 else -0.260)
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
    if detail < 1:
        return
    # The swept locks: 3-point tubes rising from the forehead line and
    # raking BACK over the crown, x-mirrored (leans sum to zero).
    #
    # ★ THE SWEEP LIVES IN Y, NOT X. The first table walked every tip
    # outward (0.18→0.38, 0.34→0.64, 0.24→0.44) as it raked back, and the
    # FRONT board projected that as a radial hedgehog splay — the critic's
    # finding — while the sheet rakes every lock up-and-rearward with the
    # tips staying nearly over their roots laterally — but the SILHOUETTE
    # stays wide: the sheet's own head aspect is 1.06 WITH its crown, and
    # the first fully-tucked rung measured 0.95 against tol 0.08 (the old
    # splay had been load-bearing for the head box). The SIDE locks carry
    # the width (tips ±0.61/±0.44, laddered against the aspect metric); the front/centre locks stay over their
    # roots, which is what kills the radial-hedgehog front read. Ten locks
    # (was eight) at shallower radii close the too-few/too-deep pair.
    for spine, radii in (
        (((0.000, -0.300, 3.280), (0.000, -0.060, 3.560), (0.000, 0.300, 3.720)), (0.115, 0.082, 0.030)),
        (((0.180, -0.260, 3.260), (0.220, 0.020, 3.540), (0.250, 0.360, 3.660)), (0.100, 0.072, 0.026)),
        (((-0.180, -0.260, 3.260), (-0.220, 0.020, 3.540), (-0.250, 0.360, 3.660)), (0.100, 0.072, 0.026)),
        (((0.340, -0.140, 3.160), (0.440, 0.120, 3.400), (0.610, 0.380, 3.470)), (0.092, 0.066, 0.024)),
        (((-0.340, -0.140, 3.160), (-0.440, 0.120, 3.400), (-0.610, 0.380, 3.470)), (0.092, 0.066, 0.024)),
        (((0.000, 0.140, 3.300), (0.000, 0.380, 3.500), (0.000, 0.600, 3.580)), (0.105, 0.076, 0.028)),
        (((0.240, 0.200, 3.220), (0.310, 0.420, 3.380), (0.440, 0.600, 3.420)), (0.088, 0.062, 0.024)),
        (((-0.240, 0.200, 3.220), (-0.310, 0.420, 3.380), (-0.440, 0.600, 3.420)), (0.088, 0.062, 0.024)),
        (((0.100, -0.060, 3.330), (0.130, 0.200, 3.560), (0.150, 0.470, 3.640)), (0.085, 0.060, 0.024)),
        (((-0.100, -0.060, 3.330), (-0.130, 0.200, 3.560), (-0.150, 0.470, 3.640)), (0.085, 0.060, 0.024)),
    ):
        # ⚠️ The -x members of each mirrored spike pair need flipped winding
        # (Penny's button lesson) - their spines are x-reflections. Seven
        # sides (was five): the pentagonal facets were the steel-blue
        # glint's other half.
        builder.tube(list(spine), list(radii), 2, HAIR, "Head", 7, flip=spine[0][0] < 0)


# --- The navy tee (torso) with teal trim ---------------------------------------
#
# not-traceable: his seated arms reach down to the rims and merge with the
# torso in every view; halves bounded off the shoulder run above the chair
# (front z≈2.15 measures 0.67 arm-to-arm) minus the drawn sleeve girth.
TORSO_LEVELS = [
    (1.500, 0.330, 0.280, "Hips"),
    (1.560, 0.335, 0.284, "Hips"),
    (1.750, 0.328, 0.278, "Spine"),
    (1.950, 0.318, 0.270, "Spine"),
    (2.150, 0.305, 0.258, "Spine1"),
    (2.300, 0.288, 0.243, "Spine1"),
    (2.430, 0.262, 0.220, "Spine2"),
    (2.490, 0.215, 0.180, "Spine2"),
    (2.545, 0.170, 0.145, "Spine2"),
    (2.595, 0.150, 0.130, "Spine2"),
]


def tee_color(theta: float, z: float):
    """Teal raglan side panels and collar over the navy tee."""
    if z > 2.540:
        return TRIM                      # the collar ring
    if z > 1.95 and abs(cos(theta)) > 0.80:
        return TRIM                      # the side panels
    return TEE


# His neck pinch: bottom ring a genuine 2px narrower than the ring above,
# loft running up INTO the skull.
# not-traceable: the pinch is framed by the collar; half bounded ~0.125.
NECK_LEVELS = [
    (2.595, 0.118, 0.111, "Spine2"),
    (2.680, 0.128, 0.120, "Neck"),
    (2.770, 0.140, 0.131, "Neck"),
    (2.850, 0.152, 0.142, "Neck"),
]


# --- Arms: navy short sleeves with teal cuff, strong bare arms -----------------
SLEEVE_HEM_X = 0.560

SHOULDER_BLEND = {
    0.215: 0.86,
    0.246: 0.68,
    0.300: 0.52,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept reaches the
# rims; the bare-arm half is bounded off the wrist runs (~0.075).
ARM_STATIONS = [
    (0.215, 0.148, TEE, "Arm"),
    (0.246, 0.146, TEE, "Arm"),
    (0.300, 0.150, TEE, "Arm"),
    (0.335, 0.146, TEE, "Arm"),
    (ARM_SHOULDER_X, 0.138, TEE, "Arm"),
    (0.500, 0.128, TEE, "Arm"),
    (SLEEVE_HEM_X - 0.020, 0.126, TRIM, "Arm"),   # teal sleeve cuff
    (SLEEVE_HEM_X, 0.122, TRIM, "Arm"),
    (SLEEVE_HEM_X + 0.028, 0.098, SKIN, "Arm"),   # the strong bare arm
    (0.760, 0.096, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.094, SKIN, "ForeArm"),
    (1.150, 0.090, SKIN, "ForeArm"),
    (1.300, 0.084, SKIN, "Hand"),
    (1.400, 0.070, SKIN, "Hand"),
    (1.460, 0.078, SKIN, "Hand"),   # knuckle line
    (1.510, 0.066, SKIN, "Hand"),
]

ZOOM_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
    elbow=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.548,
        finger_root=1.500,
        finger_offsets=((-0.044, 0.0, 0.044), (-0.030, 0.030)),
        finger_lengths=((0.098, 0.112, 0.100), (0.104, 0.109)),
        finger_widths=(0.028, 0.027, 0.022, 0.017),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.388, -0.033, -0.016),
            (1.436, -0.055, -0.028),
            (1.472, -0.067, -0.036),
            (1.492, -0.073, -0.040),
        ),
        thumb_widths=(0.028, 0.026, 0.020, 0.015),
    ),
    garment=TEE,
    skin=SKIN,
)


# --- The seated lower body (ROOT-weighted, like the chair) ---------------------
#
# The legs are furniture on the chair, not rig limbs: the run/swing clips
# animate a standing kid's leg bones, and a seated kid's tucked legs must
# hold the chair pose through every clip (the proxy's proven approach).
# not-traceable: every leg row on the sheet is wheel-merged; lengths are
# kid-proportioned (thigh ≈ 0.62, shin ≈ 0.88 at 4ft) and the pose is the
# profile view's tuck.
def build_seated_legs(builder: MeshBuilder, detail: int) -> None:
    sides = 8 if detail >= 2 else 6
    for side in (1, -1):
        x = side * 0.175
        # Thigh: hip forward and slightly up to the raised knee (sport tuck).
        builder.tube(
            [(x, -0.020, 1.500), (x + side * 0.010, -0.330, 1.520), (x + side * 0.015, -0.580, 1.500)],
            [0.135, 0.125, 0.108], 1, SHORTS, "Root", sides)
        if detail >= 1:
            # Shorts hem lip at the knee.
            builder.tube(
                [(x + side * 0.015, -0.600, 1.505), (x + side * 0.015, -0.650, 1.480)],
                [0.112, 0.100], 1, SHORTS_DARK, "Root", sides)
        # Bare shin dropping to the tucked ankle.
        builder.tube(
            [(x + side * 0.015, -0.660, 1.450), (x + side * 0.018, -0.740, 1.000), (x + side * 0.018, -0.760, 0.640)],
            [0.085, 0.078, 0.072], 0, SKIN, "Root", sides)
        # The sneaker: heel-to-toe lozenge on the footplate, sole below.
        builder.tube(
            [(x + side * 0.018, -0.620, 0.520), (x + side * 0.018, -0.860, 0.500), (x + side * 0.018, -1.000, 0.480)],
            [0.088, 0.098, 0.062], 1, SHOE, "Root", sides)
        if detail >= 1:
            builder.tube(
                [(x + side * 0.018, -0.620, 0.435), (x + side * 0.018, -1.000, 0.415)],
                [0.092, 0.070], 1, WHITE, "Root", sides)


# --- The sport chair (ROOT-weighted) -------------------------------------------
#
# Proxy-proven geometry, authored: cambered wheels with blue push rims (the
# team accent), hubs, front casters, three frame rails a side, upholstered
# seat and backrest, a footplate closing the chassis.
WHEEL_CENTER_Z = 0.570
WHEEL_R = 0.550
WHEEL_X = 0.580
WHEEL_CAMBER = 0.115         # top of the wheel leans inboard
RIM_R = 0.465


def wheel_ring(side: int, radius: float, x_out: float, points: int):
    ring = []
    for index in range(points):
        theta = 2 * pi * index / points
        y = 0.060 + radius * sin(theta)
        z = WHEEL_CENTER_Z + radius * cos(theta)
        x = side * (x_out + WHEEL_CAMBER * (WHEEL_CENTER_Z - z))
        ring.append((x, y, z))
    return ring


def build_chair(builder: MeshBuilder, detail: int) -> None:
    points = 16 if detail >= 2 else (10 if detail == 1 else 8)
    sides = 6 if detail >= 2 else 4
    for side in (1, -1):
        # Tire and team-blue push rim (the accent — the ONLY slot-3 geometry).
        builder.tube(wheel_ring(side, WHEEL_R, WHEEL_X, points),
                     [0.060] * points, 1, TIRE, "Root", sides, cyclic=True)
        if detail >= 1:
            builder.tube(wheel_ring(side, RIM_R, WHEEL_X + 0.048, points),
                         [0.024] * points, 3, TEAM_MASK, "Root", sides, cyclic=True)
        # Hub.
        builder.ellipsoid((side * WHEEL_X, 0.060, WHEEL_CENTER_Z),
                          (0.075, 0.110, 0.110), 1, METAL, "Root", 6, 3)
        if detail >= 1:
            # Four flat spokes.
            for k in range(4):
                theta = pi * k / 4 + pi / 8
                y1 = 0.060 + (WHEEL_R - 0.07) * sin(theta)
                z1 = WHEEL_CENTER_Z + (WHEEL_R - 0.07) * cos(theta)
                y2 = 0.060 - (WHEEL_R - 0.07) * sin(theta)
                z2 = WHEEL_CENTER_Z - (WHEEL_R - 0.07) * cos(theta)
                x1 = side * (WHEEL_X + WHEEL_CAMBER * (WHEEL_CENTER_Z - z1))
                x2 = side * (WHEEL_X + WHEEL_CAMBER * (WHEEL_CENTER_Z - z2))
                builder.tube([(x1, y1, z1), (x2, y2, z2)], [0.016, 0.016], 1, METAL, "Root", 3)
            # Front caster.
            caster = []
            for index in range(10):
                theta = 2 * pi * index / 10
                caster.append((side * 0.340, -0.660 + 0.130 * sin(theta), 0.160 + 0.130 * cos(theta)))
            builder.tube(caster, [0.040] * 10, 1, TIRE, "Root", 4, cyclic=True)
            # Frame rails: seat-to-caster, seat-to-hub, caster-to-rim brace.
            builder.tube([(side * 0.300, -0.080, 1.400), (side * 0.340, -0.610, 0.300)],
                         [0.036, 0.036], 1, FRAME, "Root", 4)
            builder.tube([(side * 0.300, 0.020, 1.380), (side * 0.470, 0.060, 0.660)],
                         [0.034, 0.034], 1, FRAME, "Root", 4)
            builder.tube([(side * 0.340, -0.560, 0.320), (side * 0.430, -0.080, 0.720)],
                         [0.030, 0.030], 1, FRAME, "Root", 4)
    # Seat sling, backrest and footplate.
    builder.ellipsoid((0.0, 0.020, 1.420), (0.345, 0.320, 0.058), 1, SEAT, "Root", 8, 4)
    builder.ellipsoid((0.0, 0.300, 1.740), (0.335, 0.065, 0.290), 1, SEAT, "Root", 8, 4)
    if detail >= 1:
        builder.ellipsoid((0.0, -0.800, 0.385), (0.300, 0.200, 0.038), 1, METAL, "Root", 6, 3)


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
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, TEE, 16 if detail >= 2 else segments, color_fn=tee_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=ZOOM_ARM)

    build_seated_legs(builder, detail)
    build_chair(builder, detail)


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
    obj["recessReference"] = "zoom-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # ⚠️ Pre-convention blends carry stray meshes (Mimi's Icosphere lesson) —
    # remove EVERY mesh, not just the LOD roots.
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    settings = {
        "kid_wheelchair_ace_LOD0": (20, 12, 2),
        "kid_wheelchair_ace_LOD1": (8, 4, 1),
        "kid_wheelchair_ace_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "wheelchair_ace")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Zoom Ramirez reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against zoom-turnaround.png; they are not proxy deformations.\n"
        "The chair, tucked legs and shoes are ROOT-weighted furniture; the blue push rims are the team accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- wheelchair_ace\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_wheelchair_ace_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
