"""Rebuild Mimi Mash as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/mimi-mash-pilot.blend \
    --python scripts/v2/blender/sculpt-mimi-mash-source.py

★ MIMI IS THE CURL-HALO-AND-HOODIE KID — the roster's biggest hair mass (a
dense chocolate halo, Grizz's afro lane at Sniffles' mop density), a rust
hoodie with the kangaroo pocket as constructed geometry, sleeves scrunched
at the elbow over strong bare forearms, rolled pale jean cuffs (the team
accent), rust-and-cream high-tops.

The conversion: front figure 722px over 4.0ft → 1px = 0.00554ft. Head band:
halo crown row 92 (z 3.99) to neck pinch row 343 (z 2.60) — 34.8% of the
figure. Ear line traced at 49.4% of head (z 3.30, the eye line).
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
OUTPUT = REPO / "assets/v2/source/mimi-mash-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/mimi-mash-face-atlas.png"
REVISION = "mimi-mash-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: rust hoodie #E33C1C (23%), deep chocolate hair #331B0B
# (15%), slate jeans #33445C (15%), lit skin #ED8A4C. Authored ≈
# delivered·1.2 with the skin's highlight band clear of the isSkin
# saturation floor (the Clover lesson) and the hair deep enough to fail
# isSkin on every lit face (the blonde lesson, inverted).
SKIN = rgba("F49A4C")
SKIN_SHADOW = rgba("B26020")
HAIR = rgba("5A2E12")        # the chocolate halo, lit — light enough to group strands under the ramp
HAIR_DARK = rgba("2A1206")   # the underside tone
SHIRT = rgba("F04524")       # the rust hoodie
SHIRT_DARK = rgba("C22E12")  # ribbing, pouch shadow, hood lining
TEE = rgba("FFF3DC")         # the cream tee sliver at the collar
PANTS = rgba("46597A")       # blue jeans
PANTS_DARK = rgba("32405A")
CUFF = rgba("AAB2BA")      # pale grey-blue rolled cuff BODY — deliberately a
                           # different hex from TEAM_MASK: byte-identical, the
                           # runtime tinted the ENTIRE ankle roll team-colour
                           # and the recorded thin-top-ring convention was
                           # unenforceable by colour (the critique's find)
SOCK = rgba("FFF6E6")
SHOE = rgba("C05A2E")        # rust canvas high-top upper
WHITE = rgba("FFF0D8")       # cream cupsole
SOLE = rgba("F2DFC4")        # toe bumper and laces
# The team accent is the CUFF ROLL (the jeans lane's convention).
TEAM_MASK = rgba("BFC4C6")   # the pale cuff roll IS the team accent

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces on the front view (the analyser refused all
# three — the curl fringe merges the regions): thick brows rows 180-190
# centred ~185 (37.0% of the 3.99→2.60 head, z 3.48), the big eyes rows
# 205-230 centred ~217.5 (50.0%, z 3.30), the proud smile rows 253-259
# centred ~256 (65.3%, z 3.09).
HEAD_CENTER = (0.0, -0.020, 3.200)
HEAD_RADII = (0.460, 0.460, 0.470)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.05, 1.03),
    (-0.30, 1.07),
    (-0.60, 1.04),
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
    """Big warm eyes — a soft dish; the atlas carries the shine."""
    dz = nz - 0.215
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.026
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A small proud button nose (centre nz -0.30, above her big smile)."""
    if abs(nx) > 0.17:
        return 0.0
    dz = nz + 0.300
    if dz < -0.10 or dz > 0.11:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.17) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.05) / 0.08)
    reach = 0.090 if dz >= 0.0 else 0.100
    t = dz / reach
    tip = 0.086 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# Her ears sit at the eye line, mostly framed by the halo. earLine traced
# 49.4% of head → z 3.30, proud 9.8% of head width.
EAR_SPEC = EarSpec(center=(0.020, 3.300), radii=(0.1450, 0.1550))

# Island solved for her span (crown 3.99, neck 2.60): brow anchor 28 samples
# cell 26 → z 3.481 (36.9 against the traced 37.0), eye anchor 50 samples
# cell 48 → z 3.299 (50.0 vs 50.0), mouth anchor 69 samples cell 72 →
# z 3.081 (65.7 vs 65.3).
FACE_ISLAND = (0.92, -1.3503, 2.500)

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


# --- The curl halo -------------------------------------------------------------
#
# The roster's biggest hair mass: one clump-modulated shell standing far
# proud of the skull all round, hugging the nape at the bottom (the
# Rocket/Lefty daylight lessons — no enclosed pockets behind the head).
# measured: front z=3.25 halfWidth=0.8061 tol=0.03
# measured: front z=3.55 halfWidth=0.6898 tol=0.03
CURL_LEVELS = [
    # The crown rounds through an intermediate ring: without 3.995 the lid
    # jumped 0.250 → 0.430 in one quad row and the profile read a FLAT
    # CROWN PLANE meeting the back wall at a hard corner (the critique's
    # frontProfileSilhouette-3 finding, with this exact fix named).
    (4.030, 0.200, 0.215, 0.010),
    (3.995, 0.330, 0.345, 0.010),
    (3.950, 0.415, 0.430, 0.010),
    (3.840, 0.545, 0.560, 0.010),
    (3.690, 0.630, 0.640, 0.015),
    (3.540, 0.635, 0.670, 0.020),
    (3.380, 0.700, 0.690, 0.030),
    (3.190, 0.718, 0.695, 0.050),
    (2.990, 0.680, 0.640, 0.085),
    (2.870, 0.585, 0.550, 0.120),
    (2.780, 0.445, 0.415, 0.155),
]

# ★ THE CURL FIELD — see sculptlib/hair.py for why this shape and not a cosine.
# measured: `npm run measure:strands -- mimi_mash` reports the CONCEPT sheet
# carrying 12.67 strand minima per row on the 5-45% band. Six mirror pairs put
# 12 lobes across a row, which is that count (48 columns / 12 lobes = the
# four-columns-per-lobe floor); the bands span the shell's own CURL_LEVELS
# extent (4.030 crown to 2.780 hem) so curls reach the whole mass.
#
# ⚠️ THE WIDTHS WERE LADDERED, NOT DERIVED, and the first rung is the trap:
# theta_width 0.24 ("a little under half the 0.52 pair spacing") MERGES
# neighbouring curls — the midpoint sits 1.1σ out, each contributes 0.3 of its
# peak there, and staggered bands fill the rest: the field flattens to a near-
# uniform inflation and the board is a smooth dome (measured 8% of the
# concept's strand count, DOWN from the flutes' 23%). Parting needs the
# midpoint ~2σ out: theta_width 0.13 against the 0.26 half-spacing. Same for
# z: 0.07 against the 0.156 band gap. 12 bands at z_width 0.06 was also tried
# and reads as regular QUILTING — the golden stagger goes quasi-periodic at
# that density; 9 bands stays organic.
CURL_SEEDS = curl_seeds(
    pairs_per_row=6,
    bands=9,
    z_top=4.030,
    z_bottom=2.780,
    amplitude=0.100,
)
CURL_THETA_WIDTH = 0.13
CURL_Z_WIDTH = 0.07
# The trough threshold for the two-tone paint: below this field value a vertex
# takes HAIR_DARK (the 2D web — see the paint note in build_curls). Laddered:
# 0.026 left the dark web dominating the mass; 0.016 thins it to curl
# separations. measured: the ladder's strand counts were 8% (0.24/0.11, no
# paint) → 44% (paint at 0.026) → 45% (this rung), prominence 180%.
CURL_TROUGH = 0.016

# The fringe crosses just above the brows and frames the face down the
# temples, symmetric (her sheet has no sweep). The side descent stops at
# 3.15 — the faceSkin sample row sits at z ≈ 3.13 (62% of the hair-
# inclusive head) and the curtain edges stay above it.
CURL_FRINGE = [
    (0.00, 3.560),
    (0.20, 3.540),
    (0.32, 3.470),
    (0.42, 3.300),
    (0.48, 3.100),
    (0.56, 2.950),
]

CURL_OPEN_BOTTOM = 2.860


def fringe_z_at(x_signed: float) -> float:
    x_abs = abs(x_signed)
    table = CURL_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def build_curls(builder: MeshBuilder, detail: int) -> None:
    # An ascending table silently inverts the winding — descending, asserted.
    assert all(a[0] > b[0] for a, b in zip(CURL_LEVELS, CURL_LEVELS[1:])), \
        "CURL_LEVELS must be strictly descending in z"
    # 16 keeps mirror columns (even) and the LOD0 budget; 18 blew it.
    # ★ THIS WAS 16, AND THE CLUMP BELOW ASKS FOR TWELVE LOBES.
    #
    # `clump` is `1 + 0.095·cos(6θ) + 0.055·cos(12θ)`. Twelve lobes across
    # sixteen columns is 1.33 samples per lobe — below Nyquist, so the fine
    # term was not merely faint, it was UNREPRESENTABLE; and the six-lobe term
    # at 2.67 samples was barely above it. The ring could not carry the curls
    # the table already described, and the board read as a swim cap.
    #
    # Measured with `npm run measure:strands -- mimi_mash`, which counts the
    # creases between strand groups on the board against the concept's:
    #
    #     16 columns   3% of the concept's strand count   6186 tris  326KB
    #     32 columns  13%                                 6506      334KB
    #     48 columns  24%                                 6826      343KB
    #
    # 48 gives the fine term four samples per lobe and the coarse term eight.
    # It is the ceiling her budget allows — 64 would need 7146 triangles
    # against the 7000 cap — and it is why this is a column count rather than a
    # deeper groove: her prominence was already at 214% of the concept's. There
    # were not too few creases because they were shallow. There were too few
    # because the ring had nowhere to put them.
    #
    # ⚠️ Do not read 24% as a shortfall against 100%. A concept sheet's hair is
    # DRAWN texture — hundreds of individual curls — which no toon mesh should
    # reproduce; `measure-strands.mjs`'s header explains why the ratio is a
    # relative instrument. What matters here is that the mass now reads as
    # grouped clumps with a scalloped silhouette instead of a smooth dome.
    segments = 48 if detail >= 2 else (10 if detail == 1 else 8)
    use = CURL_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in CURL_LEVELS], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        # Mirror-symmetric curl blobs (the 2D field below), so the shell
        # reads as curls, not a swim cap — and not a fluted column either.
        for column in range(segments):
            theta = 2 * pi * column / segments
            # The clump is a 2D curl field — mirror-paired Gaussian blobs in
            # (θ, z), never a cosine of θ. Every θ-only family (harmonic,
            # non-harmonic, row-varying amplitudes) has its extrema pinned in
            # θ and flutes; the identity and the four measured failures are in
            # sculptlib/hair.py's docstring. Mirror symmetry (faceAsymmetry's
            # concern) holds by construction: every seed emits at ±θ₀.
            f = curl_field(
                theta, z, CURL_SEEDS,
                theta_width=CURL_THETA_WIDTH,
                z_width=CURL_Z_WIDTH,
            )
            clump = 1.0 + f
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                # The proud rim stays: burying the temple columns was tried
                # and LOWERED both faceSkin sides (18.1/18.1 vs 21.7/19.9) -
                # the buried edge shades the cheek it exposes.
                if CURL_OPEN_BOTTOM < z < fringe_z_at(x):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.170)
                else:
                    y = max(y, (sf - 0.060) if sf > -9.0 else -0.310)
            # ★ THE READ IS THE PAINT, NOT THE RELIEF. The toon ramp quantises
            # whatever the blobs displace, and the θ-only trough paint that was
            # tried before drew full-height STRIPES because its trough test was
            # a function of θ alone. The 2D field changes what a trough IS: the
            # low-field region between staggered blobs is a connected web
            # wandering in θ from band to band, so the dark tone draws curl
            # SEPARATIONS around each lit blob top — a honeycomb, not stripes.
            # Mirror-safe because f is even in θ by construction.
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
    # (Ringlet tufts were tried here and read as floating rectangular tabs
    # in every runtime still — the clump modulation carries the coil read.)


# --- The rust hoodie -----------------------------------------------------------
#
# Sniffles' hoodie torso in Mimi's stockier build: ribbed hem, kangaroo
# pocket as proud geometry, draped hood — and the cream tee sliver at the
# collar the sheet draws.
# not-traceable: her hanging arms merge with the torso at every standing
# row (front z=2.00 measures 0.6648 arm-to-arm); halves bounded off the
# central jeans run at z 1.40 (~0.36) plus the hem's rib overhang.
TORSO_LEVELS = [
    (1.500, 0.365, 0.310, "Hips"),    # ribbed hem
    (1.535, 0.380, 0.322, "Hips"),
    (1.720, 0.372, 0.316, "Spine"),
    (1.920, 0.358, 0.305, "Spine"),
    (2.120, 0.340, 0.290, "Spine1"),
    (2.300, 0.318, 0.270, "Spine1"),
    (2.430, 0.290, 0.244, "Spine2"),
    (2.470, 0.240, 0.204, "Spine2"),
    (2.530, 0.185, 0.160, "Spine2"),
    (2.575, 0.158, 0.140, "Spine2"),  # collar — OUTSIDE the neck loft
]


def torso_ring_at(z: float) -> tuple[float, float]:
    """(half-width, half-depth) of the hoodie at height z, off TORSO_LEVELS."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return wa + t * (wb - wa), da + t * (db - da)
    return levels[-1][1], levels[-1][2]


def surface_patch(builder: MeshBuilder, x0: float, x1: float, z0: float, z1: float,
                  proud: float, colour, top_colour, bone: str) -> None:
    """A raised rectangular panel on the hoodie front."""
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


def build_hoodie_details(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    # The kangaroo pocket: one wide proud pouch with a darker top edge and
    # the sheet's slanted hand openings suggested by darker side strips.
    surface_patch(builder, -0.270, 0.270, 1.580, 1.910, 0.062, SHIRT, SHIRT_DARK, "Spine")
    surface_patch(builder, -0.270, -0.216, 1.640, 1.900, 0.048, SHIRT_DARK, SHIRT_DARK, "Spine")
    surface_patch(builder, 0.216, 0.270, 1.640, 1.900, 0.048, SHIRT_DARK, SHIRT_DARK, "Spine")
    # The cream tee sliver at the collar.
    surface_patch(builder, -0.120, 0.120, 2.545, 2.600, 0.030, TEE, TEE, "Spine2")
    # The hood: a draped volume on the upper back with a lining roll at its
    # mouth (Chip's round-9 lesson — half-buried reads as a faint ridge).
    builder.ellipsoid((0.0, 0.360, 2.480), (0.300, 0.180, 0.250), 1, SHIRT, "Spine2", 8, 5)
    builder.ellipsoid((0.0, 0.262, 2.610), (0.250, 0.105, 0.095), 1, SHIRT_DARK, "Spine2", 6, 3)


# Her neck pinch is row 343 → z 2.60. The bottom ring is a genuine 2px
# narrower than the ring above (the topmost-of-equals lesson), and the loft
# runs from under the collar up INTO the skull (Clover's daylight lesson).
# not-traceable: the chin's own shadow owns the pinch rows on the sheet;
# the half is bounded off the jaw-to-collar sliver (~0.13).
NECK_LEVELS = [
    (2.575, 0.122, 0.116, "Spine2"),
    (2.670, 0.134, 0.126, "Neck"),
    (2.770, 0.146, 0.137, "Neck"),
    (2.860, 0.158, 0.148, "Neck"),
]


# --- Arms: scrunched sleeves at the elbow, strong bare forearms ----------------
#
# The sheet pushes both sleeves up: rust to just past the elbow with a
# ruched double roll, then SKIN to the wrist — her "strong childlike
# forearms" trait carried by a fuller forearm than the roster default.
SLEEVE_HEM_X = 0.980

# ⚠️ EVERY station inboard of the deltoid needs an entry (blend = the
# Spine2 share): a station with no entry weights 100% to the arm bone and
# shears the skin web into a shoulder fin when the arm drops.
SHOULDER_BLEND = {
    0.215: 0.86,
    0.246: 0.68,
    0.300: 0.50,
    0.335: 0.32,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare-forearm half is bounded off the wrist runs (~0.082).
ARM_STATIONS = [
    (0.215, 0.158, SHIRT, "Arm"),
    (0.246, 0.155, SHIRT, "Arm"),
    (0.300, 0.152, SHIRT, "Arm"),
    (0.335, 0.148, SHIRT, "Arm"),
    (ARM_SHOULDER_X, 0.140, SHIRT, "Arm"),
    (0.620, 0.128, SHIRT, "Arm"),
    (0.860, 0.122, SHIRT, "ForeArm"),
    (ARM_ELBOW_X, 0.126, SHIRT, "ForeArm"),
    (SLEEVE_HEM_X - 0.028, 0.138, SHIRT_DARK, "ForeArm"),  # ruched roll, proud
    (SLEEVE_HEM_X, 0.130, SHIRT_DARK, "ForeArm"),
    (SLEEVE_HEM_X + 0.030, 0.098, SKIN, "ForeArm"),        # the bare forearm
    (1.150, 0.094, SKIN, "ForeArm"),
    (1.280, 0.086, SKIN, "Hand"),
    (1.400, 0.070, SKIN, "Hand"),
    (1.460, 0.078, SKIN, "Hand"),   # knuckle line
    (1.510, 0.066, SKIN, "Hand"),
]

MIMI_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.060,
    root_ring=0.0,
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
    garment=SHIRT,
    skin=SKIN,
)


# --- Blue jeans, rolled pale cuffs, rust high-tops -----------------------------
INSEAM_TOP_Z = 1.500
INSEAM_HEM_Z = 0.900
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# The pair-outer extents below are the sheet's own silhouette; per-leg
# halves come from the central jeans runs.
# measured: front z=1.25 halfWidth=0.4792 tol=0.04
# measured: front z=0.80 halfWidth=0.5679 tol=0.04
LEG_STATIONS = [
    (1.550, 0.205, 1.10, PANTS, "UpLeg"),
    (1.380, 0.200, 1.07, PANTS, "UpLeg"),
    (1.180, 0.195, 1.05, PANTS, "UpLeg"),
    (1.000, 0.190, 1.03, PANTS, "Leg"),
    (0.860, 0.186, 1.02, PANTS, "Leg"),
    (0.720, 0.184, 1.01, PANTS, "Leg"),
    (0.560, 0.182, 1.00, PANTS, "Leg"),
    # ⚠️ The runtime TEAM-TINTS everything on M_Accessory — a full accent
    # cuff renders in team colour, not denim (round-2 blocker). Only the
    # thin top roll is the accent (Grizz's sock-roll convention); the cuff
    # body stays its own grey-blue.
    # ★ TWO stations, not one. The leg builder sends a row PAIR to
    # M_Accessory only when BOTH its rows are team-mask coloured, so a lone
    # accent ring makes no accessory geometry at all — the exporter dropped
    # the material and the finished-work gate refused "no deliberate
    # team-accent surface" the moment Mimi claimed candidate. The band is
    # 0.520-0.490: the roll's top edge and its fattest ring, as Grizz's.
    (0.520, 0.198, 1.00, TEAM_MASK, "Leg"),        # roll top — THE accent
    (0.490, 0.196, 1.00, TEAM_MASK, "Leg"),        # the roll's fattest ring
    (0.440, 0.194, 1.00, CUFF, "Leg"),
    (0.415, 0.176, 1.00, PANTS_DARK, "Leg"),       # cuff underside lip
    (0.390, 0.110, 1.00, SOCK, "Foot"),            # sock sliver
    (0.340, 0.102, 0.99, SOCK, "Foot"),
    (0.240, 0.094, 0.97, SOCK, "Foot"),
    (0.150, 0.088, 0.95, SOCK, "Foot"),
]

# The yoke that closes the crotch (Zippy's lesson).
# not-traceable: interior geometry no view can show; sized to bridge the
# authored leg tubes at their own stations.
CROTCH_LEVELS = [
    (1.520, 0.165, 0.195, "Hips"),
    (1.620, 0.185, 0.225, "Hips"),
    (1.730, 0.205, 0.255, "Hips"),
]

MIMI_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# Rust canvas high-top over a cream cupsole with toe bumper and laces — the
# family last, tall.
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


SHOE_LENGTH_SCALE = 1.02
SHOE_WIDTH_SCALE = 0.98
SHOE_HEIGHT_SCALE = 1.30

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole and toe bumper below, rust canvas above. The sheet's band
# keeps the cream low and the rust tall (a high-top quarter).
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.320, "quarter"),
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


MIMI_SHOE = ShoeSpec(
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

    build_curls(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    if detail >= 1:
        builder.loft(CROTCH_LEVELS, 1, PANTS, 8 if detail >= 2 else 6)
    builder.loft(TORSO_LEVELS if detail >= 2 else thin_for_lod(TORSO_LEVELS, detail),
                 1, SHIRT, 17 if detail >= 2 else segments)
    build_hoodie_details(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=MIMI_ARM)
        build_leg(builder, side, detail, spec=MIMI_LEG)
        build_shoe(builder, side, detail, spec=MIMI_SHOE,
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
    obj["recessReference"] = "mimi-mash-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # ⚠️ The pre-convention proxy build left extra meshes in this blend
    # (*_CurlHalo shells, an Icosphere) that export alongside the LODs and
    # blew the 400KB budget — remove EVERY mesh, not just the LOD roots.
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    settings = {
        "kid_mimi_mash_LOD0": (20, 12, 2),
        "kid_mimi_mash_LOD1": (8, 4, 1),
        "kid_mimi_mash_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "mimi_mash")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Mimi Mash reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against mimi-mash-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the cuff-roll accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- mimi_mash\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_mimi_mash_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
