"""Rebuild Dev Raghunathan (the `wheelchair_ace` slot) as a reference-authored character.

Dev took this slot in the World 1 re-cast. The seated body, the chair and the
rig contract are the slot's own, carried from the kid before him; the colours,
the orange push rims, the socks and the face anchors are read off his own
sheet, docs/v2/concepts/dev-turnaround.png.

Run from the repository root:
  blender --background assets/v2/source/dev-pilot.blend \
    --python scripts/v2/blender/sculpt-dev-source.py

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

from sculptlib.reference_hands import migrate as migrate_reference_hands
from sculptlib.arm import ArmSpec, HandSpec, build_arm
from sculptlib.atlas import install_face_atlas
from sculptlib.color import ensure_material_slots, rebuild_palette_material, rgba, srgb_to_linear
from sculptlib.ear import EarSpec, build_ear
from sculptlib.head import HeadSpec, head_surface
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, ARM_SHOULDER_X

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/dev-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/dev-face-atlas.png"
REVISION = "dev-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet samples (5x5 means on the front view): teal tee #186F71, lit cheek
# #C46E45, shaded arm #80421E, near-black hair #31271E, black shorts, white
# socks with a teal band, orange sneakers and orange push rims #F97103.
SKIN = rgba("C87444")
SKIN_SHADOW = rgba("8A4A22")
HAIR = rgba("2A211C")        # near-black warm crown
HAIR_DARK = rgba("17110C")
TEE = rgba("12807F")         # teal tee
TEE_DARK = rgba("0C5F60")
TRIM = rgba("0F6E6E")        # the collar rib, one step under the tee
SHORTS = rgba("26282E")
SHORTS_DARK = rgba("16171C")
SHOE = rgba("F06A10")        # orange sneakers
SOCK_BAND = rgba("149090")   # the sock's teal band
WHITE = rgba("F4EADA")       # soles and socks
TIRE = rgba("262B33")
FRAME = rgba("3A3E46")       # black frame tube
METAL = rgba("A8B2BE")       # spokes, footplate
SEAT = rgba("20242C")        # seat and backrest upholstery
# ★ THE PUSH RIMS ARE HIS OWN ORANGE, so they left the team slot: the runtime
# tints everything on M_Accessory, and a team-blue rim is the previous kid.
RIM = rgba("F56E08")
# The team accent is now the two wheel HUBS — the only geometry on M_Accessory.
TEAM_MASK = rgba("2E82E6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=TEE, shirt_dark=TEE_DARK,
    pants=SHORTS, pants_dark=SHORTS_DARK,
    shoe=SHOE, sock=WHITE, white=WHITE, sole=WHITE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Dev's head, off dev-turnaround.png's front view (0.006623 ft/px, floor row
# 819, SEATED frame): the hair's top is row 216 (z 4.00), the hairline row 300
# (z 3.44), brows row 330 (z 3.24), eyes row 358 (z 3.05), the smile row 392
# (z 2.83), the chin row 425 (z 2.61). The eyes sit at the skull's middle, so
# the skull is centre 3.08 with vertical radius 0.47, and everything above
# z 3.55 is hair.
# not-traceable: the cheeks' flanks are covered by the ears and the hair on
# the front view; the half is bounded by the ear-to-ear run less both ears.
HEAD_CENTER = (0.0, -0.020, 3.080)
HEAD_RADII = (0.440, 0.460, 0.470)
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
EAR_SPEC = EarSpec(center=(0.020, 2.880), radii=(0.1450, 0.1700))

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
# A big tousled mass: a shell standing well off the skull (his hair is nearly
# half a foot deep over the crown) with thick locks raking up and back.
# (z, half-width, half-depth, y-centre) — strictly descending in z.
# measured: front z=3.48 halfWidth=0.656 tol=0.05
HAIR_LEVELS = [
    (3.960, 0.200, 0.220, 0.030),
    (3.900, 0.380, 0.400, 0.030),
    (3.800, 0.520, 0.540, 0.040),
    (3.650, 0.620, 0.620, 0.050),
    (3.480, 0.656, 0.660, 0.060),
    (3.300, 0.640, 0.640, 0.080),
    (3.120, 0.500, 0.580, 0.140),
    (2.960, 0.400, 0.500, 0.180),
    (2.820, 0.300, 0.400, 0.220),
    (2.720, 0.220, 0.280, 0.240),
]
HAIR_OPEN_BOTTOM = 2.700
HAIR_FRINGE_Z = 3.440      # the hairline, sheet row 300


# (spine, radii) — forward is -y; his right is -x.
# not-traceable: interior marks on the front view — the fringe lies inside the
# head's silhouette. Read off dev-turnaround.png: the hair covers the forehead
# to the brow on his right (visible face 8% of head width left of centre
# against 23% right of it) and stops well above it on his left.
FRINGE_LOBES = (
    (((-0.050, -0.500, 3.620), (-0.200, -0.555, 3.430), (-0.330, -0.500, 3.275)), (0.130, 0.120, 0.050)),
    (((-0.250, -0.460, 3.600), (-0.380, -0.480, 3.400), (-0.455, -0.400, 3.230)), (0.120, 0.110, 0.050)),
    (((0.180, -0.500, 3.620), (0.300, -0.520, 3.490), (0.400, -0.440, 3.390)), (0.120, 0.100, 0.040)),
)


def hair_window_z(x_signed: float) -> float:
    x_abs = abs(x_signed)
    # 0.28/0.40 (was 0.30/0.42): the 16-column shell re-quantized the window
    # and opened visible-face to 39.9 against the concept's 31.5 (tol 6) —
    # the window moves WITH the ring, in whichever direction the measure
    # says (Theo's rule ran the other way).
    if x_abs < 0.30:
        return HAIR_FRINGE_Z
    if x_abs < 0.44:
        return HAIR_FRINGE_Z - (x_abs - 0.30) * 1.6
    return 3.100


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
                    y = max(y, (sf - 0.050) if sf > -9.0 else -0.580)
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
        # Dev's crown is bigger and thicker than the table's first owner's:
        # every lock is carried out to the new shell and fattened.
        # They are also SHORTER and BLUNTER: his sheet draws chunky tousled
        # lumps, where the table's long tapers read as blades raked off the
        # back of a helmet. The tip is pulled 45% of the way back to the
        # middle point and left fat.
        p0, p1, p2 = ((x * 1.06, y * 1.26, z + 0.350) for x, y, z in spine)
        p2 = tuple(m + 0.55 * (t - m) for m, t in zip(p1, p2))
        spine = (p0, p1, p2)
        radii = (radii[0] * 1.70, radii[1] * 1.95, radii[2] * 3.20)
        builder.tube(list(spine), list(radii), 2, HAIR, "Head", 5, flip=spine[0][0] < 0)

    # The fringe: three fat lobes tumbling off the hairline onto the forehead,
    # two swept to his right and one short on his left — the sheet's quiff is
    # lopsided, and that lopsidedness is most of what makes the mop his.
    # (`FRINGE_LOBES` is module-level so the provenance gate can see it.)
    for spine, radii in FRINGE_LOBES:
        builder.tube(list(spine), list(radii), 2, HAIR, "Head", 5, flip=spine[0][0] < 0)


# --- The navy tee (torso) with teal trim ---------------------------------------
#
# not-traceable: his seated arms reach down to the rims and merge with the
# torso in every view; halves bounded off the shoulder run above the chair
# (front z≈2.15 measures 0.67 arm-to-arm) minus the drawn sleeve girth.
TORSO_LEVELS = [
    (1.590, 0.361, 0.276, "Hips"),
    (1.640, 0.366, 0.279, "Hips"),
    (1.750, 0.357, 0.274, "Spine"),
    (1.950, 0.346, 0.266, "Spine"),
    (2.150, 0.333, 0.254, "Spine1"),
    (2.300, 0.330, 0.240, "Spine1"),
    (2.430, 0.305, 0.217, "Spine2"),
    (2.490, 0.226, 0.177, "Spine2"),
    (2.545, 0.178, 0.143, "Spine2"),
    (2.595, 0.158, 0.128, "Spine2"),
]


def tee_color(theta: float, z: float):
    """A plain teal tee with a collar rib one step darker."""
    if z > 2.540:
        return TRIM
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
    (0.215, 0.195, TEE, "Arm"),
    (0.246, 0.193, TEE, "Arm"),
    (0.300, 0.198, TEE, "Arm"),
    (0.335, 0.193, TEE, "Arm"),
    (ARM_SHOULDER_X, 0.182, TEE, "Arm"),
    (0.500, 0.169, TEE, "Arm"),
    (SLEEVE_HEM_X - 0.020, 0.166, TRIM, "Arm"),   # teal sleeve cuff
    (SLEEVE_HEM_X, 0.161, TRIM, "Arm"),
    (SLEEVE_HEM_X + 0.028, 0.129, SKIN, "Arm"),   # the strong bare arm
    (0.760, 0.127, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.124, SKIN, "ForeArm"),
    (1.150, 0.119, SKIN, "ForeArm"),
    (1.300, 0.111, SKIN, "Hand"),
    (1.400, 0.092, SKIN, "Hand"),
    (1.460, 0.103, SKIN, "Hand"),   # knuckle line
    (1.510, 0.087, SKIN, "Hand"),
]

DEV_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
    elbow=0.0,
    underarm_shade=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.548,
        finger_root=1.500,
        finger_offsets=((-0.044, 0.0, 0.044), (-0.030, 0.030)),
        finger_lengths=((0.098, 0.112, 0.100), (0.104, 0.109)),
        finger_widths=(0.035, 0.034, 0.028, 0.021),
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
        x = side * 0.165
        # Thigh: hip forward and slightly up to the raised knee (sport tuck).
        builder.tube(
            [(x, -0.020, 1.480), (x + side * 0.008, -0.200, 1.495), (x + side * 0.012, -0.360, 1.490)],
            [0.146, 0.138, 0.130], 1, SHORTS, "Root", sides)
        # The sheet's shorts stop mid-thigh: a bare thigh and a round knee
        # carry the lap forward to the shin.
        builder.tube(
            # ⚠️ The lap's TOP is the seated swing's floor: audit:batting's
            # palm ray reads the knees as body, and thighs 0.17 thick put the
            # palms 0.15ft inside them at contact.
            [(x + side * 0.012, -0.380, 1.480), (x + side * 0.015, -0.560, 1.462), (x + side * 0.016, -0.670, 1.410)],
            [0.122, 0.122, 0.108], 0, SKIN, "Root", sides)
        # Bare shin dropping to the tucked ankle.
        builder.tube(
            [(x + side * 0.015, -0.660, 1.450), (x + side * 0.018, -0.740, 1.000), (x + side * 0.018, -0.760, 0.640)],
            [0.122, 0.112, 0.100], 0, SKIN, "Root", sides)
        if detail >= 2:
            # White crew socks with one teal band, proud of the shin.
            builder.tube(
                [(x + side * 0.018, -0.746, 0.900), (x + side * 0.018, -0.760, 0.630)],
                [0.116, 0.106], 1, WHITE, "Root", sides)
        if detail >= 2:
            builder.tube(
                [(x + side * 0.018, -0.749, 0.840), (x + side * 0.018, -0.752, 0.790)],
                [0.120, 0.118], 1, SOCK_BAND, "Root", sides)
        # The sneaker: heel-to-toe lozenge on the footplate, sole below.
        builder.tube(
            # The fourth point rounds the toe shut: a tube that ends at full
            # girth shows its end as a flat disc from the front.
            [(x + side * 0.018, -0.620, 0.520), (x + side * 0.018, -0.860, 0.500), (x + side * 0.018, -1.000, 0.480),
             (x + side * 0.018, -1.050, 0.472)],
            [0.112, 0.126, 0.090, 0.030], 1, SHOE, "Root", sides)
        if detail >= 1:
            builder.tube(
                [(x + side * 0.018, -0.620, 0.435), (x + side * 0.018, -1.000, 0.415)],
                [0.118, 0.092], 1, WHITE, "Root", sides)


# --- The sport chair (ROOT-weighted) -------------------------------------------
#
# Cambered drive wheels with orange push rims, hubs (the team accent), front
# casters, three frame rails a side, an upholstered seat and backrest with
# two back posts, a footplate closing the chassis.
# not-traceable: the wheels are drawn through the kid's hands and legs in every
# view, so no run is tyre alone. Bounded off dev-turnaround.png's front view
# (2026-11-14): the figure's box is 1.86ft wide and its outermost runs at the
# floor are tyre, so the tyres stand 0.93 out; the wheel tops come up beside
# the hips at about 0.62. That is a wheel centred 0.76 out with 0.184 of
# camber per foot of height — far more lean than the slot's first chair
# (0.98 out, 0.115), which is why that chair read from the front as two posts
# standing clear of him. The wheel's size is unchanged (r 0.76 at 0.78).
# ⚠️ `proceduralClips.ts`'s ZOOM_RIM mirrors WHEEL_X + 0.048, WHEEL_CAMBER,
# RIM_R and WHEEL_CENTER_Z (seatedPropulsion.test.ts holds them equal), and
# his baked take must be re-exported after any change here.
WHEEL_CENTER_Z = 0.780
WHEEL_R = 0.760
WHEEL_X = 0.760
WHEEL_CAMBER = 0.184         # the sheet's racing camber: tops at 0.62, tyres on the ground at 0.90
RIM_R = 0.660


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
    # 24 ring points at LOD0: at 16 a 0.76 wheel read as a faceted slab with
    # square-cut ends in the orthographic front view (critic, 2026-09-02).
    points = 24 if detail >= 2 else (10 if detail == 1 else 8)
    sides = 6 if detail >= 2 else 4
    for side in (1, -1):
        # Tire and team-blue push rim (the accent — the ONLY slot-3 geometry).
        builder.tube(wheel_ring(side, WHEEL_R, WHEEL_X, points),
                     [0.060] * points, 1, TIRE, "Root", sides, cyclic=True)
        if detail >= 1:
            builder.tube(wheel_ring(side, RIM_R, WHEEL_X + 0.048, points),
                         [0.050] * points, 1, RIM, "Root", sides, cyclic=True)
        # Hub.
        builder.ellipsoid((side * WHEEL_X, 0.060, WHEEL_CENTER_Z),
                          (0.075, 0.110, 0.110), 3, TEAM_MASK, "Root", 6, 3)
        if detail >= 1:
            # Twelve spoke diameters at LOD0 (four below): the sheet's wheel is
            # densely spoked, and at four the 0.76 wheel's spoke gaps enclosed
            # 2586 background pixels in the profile board against the 1200
            # silhouette.lint had recorded for the old wheel; eight left one
            # sector at 1201. 2026-09-12.
            spokes = 10 if detail >= 2 else 4
            for k in range(spokes):
                theta = pi * k / spokes + pi / (2 * spokes)
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
            # The caster is a SOLID small wheel with a blue hub, not an open
            # torus the field shows through (critic finding 4): a disc fills
            # its centre.
            if detail >= 2:   # LOD1 sits at 3000/3000 without these
                builder.ellipsoid((side * 0.340, -0.660, 0.160), (0.028, 0.125, 0.125), 1, SEAT, "Root", 6, 3)
                builder.ellipsoid((side * 0.340, -0.660, 0.160), (0.036, 0.045, 0.045), 1, METAL, "Root", 5, 3)
            # The chassis closes (critic finding 2): the drive wheel hangs on
            # an AXLE BOSS from the seat frame, the rails meet it instead of
            # ending in mid-air, and the caster sits in a fork off the same
            # frame rail.
            builder.tube([(side * 0.300, 0.060, WHEEL_CENTER_Z), (side * WHEEL_X, 0.060, WHEEL_CENTER_Z)],
                         [0.046, 0.040], 1, METAL, "Root", 5)
            builder.tube([(side * 0.300, -0.080, 1.400), (side * 0.340, -0.640, 0.300)],
                         [0.036, 0.036], 1, FRAME, "Root", 4)
            builder.tube([(side * 0.300, 0.020, 1.380), (side * 0.300, 0.060, WHEEL_CENTER_Z + 0.02)],
                         [0.034, 0.034], 1, FRAME, "Root", 4)
            builder.tube([(side * 0.340, -0.640, 0.300), (side * 0.300, 0.060, WHEEL_CENTER_Z)],
                         [0.030, 0.030], 1, FRAME, "Root", 4)
            if detail >= 2:
                builder.tube([(side * 0.340, -0.640, 0.300), (side * 0.340, -0.660, 0.170)],
                             [0.028, 0.024], 1, FRAME, "Root", 4)
    # Seat sling, backrest and footplate.
    builder.ellipsoid((0.0, 0.020, 1.420), (0.315, 0.320, 0.058), 1, SEAT, "Root", 8, 4)
    builder.ellipsoid((0.0, 0.300, 1.900), (0.425, 0.065, 0.340), 1, SEAT, "Root", 8, 4)
    if detail >= 2:
        # Back posts: the frame's uprights, standing just outside the torso so
        # the chair shows from the front (the sheet's black frame at the hips).
        for side in (1, -1):
            builder.tube([(side * 0.400, 0.270, 1.380), (side * 0.404, 0.300, 2.200)],
                         [0.040, 0.036], 1, FRAME, "Root", 4)
            # The camber strut: seat rail down and out to the axle by the hub.
            # It is the frame member the sheet draws under each hand, and it
            # divides the opening between the seat and the leaning wheel.
            builder.tube([(side * 0.390, 0.200, 1.400), (side * 0.700, 0.060, WHEEL_CENTER_Z + 0.03)],
                         [0.032, 0.030], 1, FRAME, "Root", 4)
    if detail >= 1:
        # The footplate sits UNDER the sole and MEETS it: top z 0.366, 0.02
        # into a sole tube whose bottom is 0.343-0.345 — at 0.300 the soles
        # hovered above it and the plate was a loose piece of ink in the front
        # board (continuity.lint), at 0.312 the overlap was one pixel and
        # still read loose, and at the old 0.385 it was buried inside the
        # sole (critic finding 3).
        builder.ellipsoid((0.0, -0.800, 0.328), (0.300, 0.200, 0.038), 1, METAL, "Root", 6, 3)


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
        build_arm(builder, side, detail, spec=DEV_ARM)

    build_seated_legs(builder, detail)
    build_chair(builder, detail)


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
    obj["recessReference"] = "dev-turnaround.png"
    return obj


# not-traceable: canonical authored grip reach with Zoom's compact finger pads.
REFERENCE_HAND_SHAPE = dict(
    finger_offsets=(-.024, .028, .080),
    finger_lengths=(.16, .17, .15),
    finger_widths=(.028, .027, .024, .017),
    thumb_widths=(.032, .035, .028, .017),
)


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
    migrate_reference_hands(shape=REFERENCE_HAND_SHAPE, underlayer_clearance=False, fresh_meshes=True)

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
        "Dev Raghunathan reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against dev-turnaround.png; they are not proxy deformations.\n"
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
