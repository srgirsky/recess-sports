"""Rebuild Bendy Bao as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/bendy-bao-pilot.blend \
    --python scripts/v2/blender/sculpt-bendy-bao-source.py

★ BENDY BAO IS THE FIRST GLASSES — two cyclic tubes riding proud of the face,
open in the middle so the atlas eyes read through them (the construction that
will serve Noodle, The Professor and Gizmo). Also the first STRIPED garment
(the tee's teal bands are the torso loft's own `color_fn`, no second surface)
and the first swept top-bun.

The conversion: front figure 650px over 4.0ft → 1px = 0.006154ft. The profile
faces +x. Head band: bun top row 110 (z 3.99) to neck pinch row 354 (z 2.49)
— 37.5% of the figure.
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
OUTPUT = REPO / "assets/v2/source/bendy-bao-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/bendy-bao-face-atlas.png"
REVISION = "bendy-bao-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette ---------------------------------------------------------------
#
# Sheet clusters: skin #EB9553 (shadow #AB5C24), hair #33251A (bun darks near
# black), teal stripe #8CAC9A, cream stripe ~#F2E6D2 (the backdrop cluster
# holds the tee's cream too), navy shorts #2A2E3B. Ramp-authored per the
# calibrated boards.
SKIN = rgba("FFAC60")
SKIN_SHADOW = rgba("C87A34")
HAIR = rgba("2E2014")        # near-black brown, ramp-authored over the sheet's #33251a
SHIRT = rgba("FFF2DC")       # the tee's cream ground
SHIRT_DARK = rgba("79C296")  # the teal stripes and collar — chroma ~1.3x the
                             # sheet's #8cac9a so the board ramp's compression
                             # lands it back on the drawn stripe
PANTS = rgba("363B4C")       # navy cargo shorts
PANTS_DARK = rgba("232734")
SOCK = rgba("FFF6E6")
# The fidelity classifier reads the concept's shoe band as #faecdb / #735534 —
# cream WITH a dark-brown upper (the z 0.20 trace holds a 29px brown run). The
# first cut authored an all-cream taupe and the whole band collapsed into one
# tone; the upper is authored at ~1.2x the classifier's brown.
SHOE = rgba("9A6838")        # dark-brown canvas upper
WHITE = rgba("FFF6E2")       # cream cupsole
SOLE = rgba("EFD9B8")        # toe bumper and trim
# The team accent is the sock's roll-top (Grizz's convention): two stations
# coloured TEAM_MASK put that band on M_Accessory via the shared leg builder.
# The tee's teal collar and stripes are his identity and stay authored.
TEAM_MASK = rgba("D8D2C6")
GLASSES = rgba("241A12")     # the wire frames

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Features, bounded traces: thick brows rows 227-237 (50% of head, z 3.24),
# eye centres behind the glasses at rows ~262 (62.3%, z 3.06), glasses frames
# circling z 2.93-3.19 with lens centres ±0.135 and radius ~0.13, mouth ~80%
# (z 2.79), chin/neck z 2.49-2.55. Ear line z ~2.91 (71.3% of head).
HEAD_CENTER = (0.0, -0.020, 3.060)
HEAD_RADII = (0.440, 0.460, 0.500)

FACE_SCALE = (
    (1.00, 1.00),
    (0.40, 1.00),
    (0.05, 1.04),
    (-0.30, 1.07),
    (-0.60, 1.04),
    (-1.00, 0.96),
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
    """Gentle — the glasses carry the eye read. Eye centre z 3.06 is nz 0.0."""
    dz = nz - 0.000
    dx = abs(nx) - 0.290
    radial = (dx * dx) / 0.055 + (dz * dz) / 0.022
    if radial >= 1.0:
        return 0.0
    return 0.010 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A soft button between the glasses and the smile (nz -0.30)."""
    if abs(nx) > 0.20:
        return 0.0
    dz = nz + 0.300
    if dz < -0.13 or dz > 0.14:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.20) ** 2)
    bridge = 0.010 * across * max(0.0, 1.0 - abs(dz - 0.08) / 0.10)
    reach = 0.110 if dz >= 0.0 else 0.120
    t = dz / reach
    tip = 0.095 * across ** 1.25 * max(0.0, 1.0 - t * t) ** 1.40
    return bridge + tip


# His ears are drawn and stand proud at z ~2.91.
EAR_SPEC = EarSpec(center=(0.020, 2.910), radii=(0.1450, 0.1750))

# Island solved for his span: brow anchor 26 lands z 3.243 (49.8% of the
# 3.99→2.49 head against the traced 50.0), eye anchor 50 lands z 3.06 (62.0
# vs 62.3), mouth anchor 81 lands z 2.793 (79.8). The spec REFUSES his eye
# band (the frames merge with the sideburns), so these are bounded probes:
# brows rows 227-237, lens rings 249-287 centred row 262, smile rows 302-304
# (corners 172-187/247-261); the chin-crease singles at rows 315-320 are what
# the analyser misread as a paired brow at 84.9%.
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
    """The RENDERED face's forward extent at (x, z) — Chip's flattened-face
    clamp (models head_surface's 0.88-0.11·frontness² depth scale) with the
    no-skull sentinel from Bubbles."""
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


# --- The hair: swept crown into the top bun ------------------------------------
#
# The mass sweeps up and back off an open forehead into a knotted bun at the
# crown; sideburn locks frame the ears.
#
# measured: front z=3.90 halfWidth=0.2338
# measured: front z=3.58 halfWidth=0.4123
# measured: front z=3.26 halfWidth=0.5877
# measured: view2 z=3.26 halfWidth=0.5754 tol=0.06
# ★ ROWS 3.480 AND 3.140 PAID TO THE SHOULDER (redundant-rows-scan.mjs: within
# 0.010 of their neighbours' interpolation); their 80 triangles bought
# ArmSpec.root_ring. cap_x stays at 0.100 — its comment records why.
HAIR_LEVELS = [
    (3.560, 0.430, 0.430, 0.010),
    (3.380, 0.530, 0.520, 0.040),
    (3.260, 0.585, 0.560, 0.060),
    (3.020, 0.540, 0.510, 0.110),
    (2.900, 0.470, 0.430, 0.160),
    (2.800, 0.360, 0.310, 0.220),
    (2.720, 0.230, 0.180, 0.270),
]

# The base rings sit BELOW the crown loft's top (z 3.56) on purpose: the first
# build started the bun at 3.59 and it floated — a visible backdrop wedge
# between its underside and the crown dome in profile.
# measured: front z=3.82 halfWidth=0.3231
# ⚠️ DESCENDING, like every table the ring loft eats. The first cut listed
# these ascending; `ring_loft_hair` reverses its input, so the rows built
# top-down and every quad's winding inverted — the offline board (double-sided)
# looked fine while the runtime lit the bun as a slate-grey void.
BUN_LEVELS = [
    (3.985, 0.060, 0.058, -0.015),
    (3.860, 0.270, 0.260, 0.000),
    (3.660, 0.315, 0.305, 0.020),
    (3.560, 0.265, 0.255, 0.020),
    (3.500, 0.190, 0.185, 0.015),
]

# The hairline: an open forehead — the sweep starts high and the sides come
# down over the temples to the ears.
HAIR_FRINGE = [
    (0.00, 3.460),
    (0.14, 3.450),
    (0.24, 3.420),
    (0.34, 3.300),
    (0.42, 3.050),
    (0.60, 2.900),
]

HAIR_OPEN_BOTTOM = 2.60


def fringe_z_at(x_abs: float) -> float:
    """The hair's lower edge over the face at lateral offset |x|."""
    table = HAIR_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def ring_loft_hair(builder: MeshBuilder, levels, detail: int, curl_amp: float, lobes: int) -> None:
    """Grizz's ring-loft-with-tuck, with the flattened-face clamp."""
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the offline board renders double-sided and hides it,
    # while the runtime lights the whole mass as a slate-grey void (the bun,
    # first build). Refuse the table instead of trusting the author.
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "ring_loft_hair levels must be strictly descending in z"
    segments = 20 if detail >= 2 else (10 if detail == 1 else 8)
    use = levels if detail >= 2 else thin_for_lod([(z, hx, hy, yc) for z, hx, hy, yc in levels], detail)
    ascending = list(reversed(use))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        curl = curl_amp if detail >= 2 else 0.0
        for column in range(segments):
            theta = 2 * pi * column / segments
            clump = 1.0 + curl * sin(lobes * theta + 2.2 * len(rows))
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre:
                sf = skull_front_y(x, z)
                if HAIR_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                    y = max(y, (sf + 0.050) if sf > -9.0 else -0.160)
                else:
                    y = max(y, (sf - 0.070) if sf > -9.0 else -0.300)
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


def build_hair(builder: MeshBuilder, detail: int) -> None:
    ring_loft_hair(builder, HAIR_LEVELS, detail, 0.045, 6)
    if detail >= 1:
        ring_loft_hair(builder, BUN_LEVELS, detail, 0.075, 7)


# --- The glasses ---------------------------------------------------------------
#
# Round wire frames: lens centres ±0.135 at z 3.06, radius ~0.13, sitting
# ~0.05 proud of the face plane, joined by a short bridge; thin temple arms
# run back to the ears. Open rings — the atlas eyes read through them.
GLASSES_Z = 3.060
GLASSES_LENS_X = 0.138
GLASSES_RADIUS = 0.128
GLASSES_WIRE = 0.020


def build_glasses(builder: MeshBuilder, detail: int) -> None:
    if detail < 1:
        return
    face_y = skull_front_y(GLASSES_LENS_X, GLASSES_Z)
    # 0.030 proud, not more: at 0.050 the profile view held an ENCLOSED
    # background pocket between the lens rim, the cheek and the temple arm —
    # the silhouette gate counted 38 see-through pixels.
    plane_y = (face_y if face_y > -9.0 else -0.36) - 0.030
    sides = 12 if detail >= 2 else 8
    for side in (1, -1):
        spine = []
        for i in range(sides):
            a = 2 * pi * i / sides
            spine.append((side * GLASSES_LENS_X + GLASSES_RADIUS * cos(a),
                          plane_y,
                          GLASSES_Z + GLASSES_RADIUS * sin(a)))
        # ⚠️ Material 2 (the hair slot), NEVER 3: M_Accessory is team-tinted
        # at runtime, and the first cut put the frames there — every capture
        # rendered them in the team's navy and the temple arms read as
        # backpack straps.
        builder.tube(spine, [GLASSES_WIRE] * sides, 2, GLASSES, "Head", 5,
                     cyclic=True, axis=Vector((0.0, 1.0, 0.0)), flip=side < 0)
        # The temple arm: from the frame's outer edge back to the ear root,
        # bowed OUTBOARD so it rides the skull's surface — the first build ran
        # it straight back at the lens's own x and the whole arm was inside
        # the head, invisible from every view.
        outer_x = side * (GLASSES_LENS_X + GLASSES_RADIUS)
        builder.tube(
            [(outer_x, plane_y + 0.028, GLASSES_Z + 0.02),
             (side * 0.435, plane_y + 0.19, GLASSES_Z - 0.025),
             (side * 0.470, plane_y + 0.38, GLASSES_Z - 0.115)],
            [GLASSES_WIRE, GLASSES_WIRE * 0.9, GLASSES_WIRE * 0.7],
            2, GLASSES, "Head", 4, flip=side < 0)
    # The bridge.
    builder.tube(
        [(-GLASSES_LENS_X + GLASSES_RADIUS - 0.01, plane_y, GLASSES_Z + 0.02),
         (0.0, plane_y - 0.006, GLASSES_Z + 0.032),
         (GLASSES_LENS_X - GLASSES_RADIUS + 0.01, plane_y, GLASSES_Z + 0.02)],
        [GLASSES_WIRE, GLASSES_WIRE, GLASSES_WIRE],
        2, GLASSES, "Head", 4)


# --- The striped tee -----------------------------------------------------------
#
# Teal bands on a cream ground, painted by the loft's own colour hook. Traced
# widths: tee hem z ~1.25 (navy shorts take over below), torso half ~0.365 at
# z 1.6, shoulders sloping from 2.38. Depth from the profile (arms overlap;
# authored slightly inside).
# measured: front z=2.46 halfWidth=0.1385
# measured: view2 z=1.94 halfWidth=0.2738 tol=0.06
TORSO_LEVELS = [
    (1.245, 0.355, 0.300, "Hips"),    # hem underside — z 1.25 is shorts on the sheet
    (1.278, 0.380, 0.320, "Hips"),    # hem band, proud
    (1.320, 0.372, 0.316, "Hips"),
    (1.450, 0.368, 0.322, "Spine"),
    (1.650, 0.363, 0.330, "Spine"),
    (1.900, 0.352, 0.310, "Spine1"),
    (2.120, 0.330, 0.280, "Spine1"),
    (2.280, 0.305, 0.250, "Spine2"),
    (2.380, 0.262, 0.220, "Spine2"),  # shoulder slope
    (2.450, 0.200, 0.180, "Spine2"),
    (2.505, 0.150, 0.140, "Spine2"),
    # ★ The neckline-clearance fix. The hole ring shipped at 0.128 while the
    # neck loft is ~0.149 at z 2.55, so the tee's top band dove INSIDE the
    # neck (−0.021) — the turbo/ace interpenetration class, and the board
    # showed it: see-through backdrop notches flanking the neck at the
    # collar line, the rib reading as a 2px sliver. The hole ring now stands
    # OUTSIDE the neck loft (0.158/0.148 vs the neck's 0.1489/0.1389 at
    # z 2.55, ≥0.008 clear on both axes) with the rib overhanging it — the
    # neck emerges from an open collar instead of piercing the band.
    (2.528, 0.164, 0.152, "Spine2"),  # collar rib, proud
    (2.550, 0.158, 0.148, "Spine2"),  # neck hole — OUTSIDE the neck loft
]

# The pinch at the bottom of the neck, widening into the jaw.
# measured: front z=2.49 halfWidth=0.1502 tol=0.04
NECK_LEVELS = [
    (2.540, 0.148, 0.138, "Spine2"),
    (2.610, 0.154, 0.144, "Neck"),
    (2.680, 0.160, 0.150, "Neck"),
]

# The stripe chart, traced off the teal runs: bands at 2.30-2.44 (the yoke
# stripe under the collar), 1.72-1.94, and 1.28-1.48.
STRIPES = ((2.300, 2.440), (1.720, 1.940), (1.245, 1.490))


def stripe_color(theta: float, z: float):
    if z > 2.517:
        return SHIRT_DARK  # the concept's teal ringer neckband
    for lo, hi in STRIPES:
        if lo <= z <= hi:
            return SHIRT_DARK
    return SHIRT


def torso_ring_at(z: float) -> tuple[float, float]:
    """(half-width, half-depth) of the tee at height z, off TORSO_LEVELS."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return wa + t * (wb - wa), da + t * (db - da)
    return levels[-1][1], levels[-1][2]


# --- Arms: striped short sleeves, bare forearms --------------------------------
#
# Short sleeves end mid-biceps (the Sprout lesson applied from round 1); the
# sleeve carries the yoke stripe's teal at its hem.
SLEEVE_HEM_X = 0.700

SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the
# arms; the bare forearm traces ~0.06 half and the fists ~0.075.
#
# ★ The sleeve carries the tee's STRIPES, not plain cream (the sheet
# continues them across the shoulder and down the sleeve). Traced on the
# front view (mid-sleeve columns x 152/278/286, seam row ~385 → hem row
# ~461): the yoke teal crosses the shoulder crown to rows ~381-385, the
# sleeve's own teal band runs rows 393-417, cream resumes to the cuff at
# rows 441-461 — as fractions of the drawn sleeve: teal 0.11-0.42, cuff
# from 0.74. Mapped onto the authored visible sleeve (torso exit ~0.310 →
# hem 0.736): band 0.361-0.489, with crisp station pairs AT each boundary
# (Flash's rule: a colour edge between distant rings smears across the
# whole gap). The root run is teal so the torso's yoke stripe (2.300-2.440)
# continues over the shoulder with no cream flash when the arm hangs.
# Budget: +2 net stations paid for by the LOD0 torso 24→20 trade below and
# dropping the interpolable 1.240 forearm ring (linear radius error
# 0.0016ft) — trim tessellation before geometry, never a drawn feature.
ARM_STATIONS = [
    (0.215, 0.140, SHIRT_DARK, "Arm"),   # root run — the yoke stripe's teal
    (0.300, 0.145, SHIRT_DARK, "Arm"),
    (0.312, 0.143, SHIRT, "Arm"),        # crisp pair — yoke stripe's outboard edge
    (0.355, 0.135, SHIRT, "Arm"),        # cream-side guard, band top
    (0.367, 0.133, SHIRT_DARK, "Arm"),   # the sleeve's teal band begins
    (ARM_SHOULDER_X, 0.126, SHIRT_DARK, "Arm"),
    (0.483, 0.119, SHIRT_DARK, "Arm"),   # the band's traced lower edge
    (0.495, 0.118, SHIRT, "Arm"),        # cream-side guard, band bottom
    (SLEEVE_HEM_X - 0.026, 0.104, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.110, SHIRT_DARK, "Arm"),          # teal hem band, proud
    (SLEEVE_HEM_X + 0.022, 0.104, SHIRT_DARK, "Arm"),
    (SLEEVE_HEM_X + 0.036, 0.086, SHIRT_DARK, "Arm"),
    (SLEEVE_HEM_X + 0.052, 0.062, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.058, SKIN, "ForeArm"),
    (1.365, 0.054, SKIN, "Hand"),
    (1.412, 0.062, SKIN, "Hand"),
    (1.465, 0.071, SKIN, "Hand"),   # knuckle line
    (1.512, 0.060, SKIN, "Hand"),
]

BENDY_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.100,   # the fuller cap that closes the thin-neck puncture
    root_ring=0.92,  # the A-pose coverage gap: see ArmSpec.root_ring (#208)
    elbow=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.552,
        finger_root=1.504,
        finger_offsets=((-0.047, 0.0, 0.047), (-0.032, 0.032)),
        finger_lengths=((0.105, 0.119, 0.107), (0.111, 0.116)),
        finger_widths=(0.026, 0.025, 0.020, 0.014),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.391, -0.035, -0.018),
            (1.439, -0.058, -0.030),
            (1.475, -0.071, -0.038),
            (1.496, -0.077, -0.042),
        ),
        thumb_widths=(0.025, 0.023, 0.018, 0.013),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Cargo shorts, bare legs, socks --------------------------------------------
#
# Navy shorts from the tee hem to z ~0.93 with cargo pockets on the sides;
# bare legs to the sock tops at ~0.62; cream socks fold into the shoes at
# ~0.42. Per-leg traces: shorts half 0.203 at z 0.95, shin ~0.115.
SHORTS_HEM_Z = 0.930
INSEAM_TOP_Z = 1.050
INSEAM_HEM_Z = 0.620
INSEAM_HEM_HALF = 0.100


def inseam_half(z: float) -> float:
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 1.3

# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# measured: front z=2.49 runs=1
LEG_STATIONS = [
    (1.400, 0.185, 1.16, PANTS, "UpLeg"),
    (1.200, 0.198, 1.18, PANTS, "UpLeg"),
    (1.050, 0.205, 1.16, PANTS, "UpLeg"),
    (0.965, 0.212, 1.10, PANTS_DARK, "UpLeg"),        # hem band, proud
    (SHORTS_HEM_Z, 0.204, 1.06, PANTS_DARK, "UpLeg"), # hem underside
    (0.910, 0.150, 1.02, PANTS_DARK, "UpLeg"),        # inner lip
    (0.890, 0.122, 1.00, SKIN, "UpLeg"),              # bare leg begins
    (0.780, 0.116, 1.01, SKIN, "Leg"),
    (0.700, 0.120, 1.01, SKIN, "Leg"),                # the calf
    (0.640, 0.112, 1.00, SKIN, "Leg"),
    (0.622, 0.128, 1.01, TEAM_MASK, "Leg"),           # sock roll-top — the
    (0.592, 0.126, 1.00, TEAM_MASK, "Leg"),           # team-accent band
    (0.500, 0.118, 1.00, SOCK, "Leg"),
    (0.440, 0.112, 0.99, SOCK, "Leg"),
    (0.400, 0.098, 0.98, SOCK, "Foot"),               # into the shoe
    (0.280, 0.088, 0.97, SOCK, "Foot"),
    (0.150, 0.084, 0.95, SOCK, "Foot"),
]

BENDY_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


def build_cargo_pockets(builder: MeshBuilder, detail: int) -> None:
    """The cargo flaps on the shorts' outer thighs — the patch construction."""
    if detail < 1:
        return
    for side in (1, -1):
        rows = []
        for j in range(3):
            z = 1.16 - 0.10 * j
            half = 0.205
            row = []
            for i in range(3):
                t = i / 2 - 0.5
                # 1.03x the shorts' own half plus a proud offset: at 0.92x
                # the whole panel sat INSIDE the garment and the profile view
                # showed a plain block where the sheet draws a flap.
                x = side * (leg_x(z) + half * 1.03)
                y = t * 0.16
                row.append(builder.vertex((x + side * 0.018, y, z),
                                          PANTS_DARK if j == 0 else PANTS,
                                          limb_bone("UpLeg", side)))
            rows.append(row)
        builder.grid(rows, 1, cyclic=False, flip=side < 0)


# --- The shoe ------------------------------------------------------------------
#
# Taupe canvas with cream cupsole and toe bumper — Sprout's family at Bendy's
# scale: per-shoe front extent ~0.42ft, topline ~0.40.
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
SHOE_WIDTH_SCALE = 0.96
SHOE_HEIGHT_SCALE = 1.30

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Cream cupsole below, dark-brown canvas everywhere above it — the concept's
# 67.6/31.6 cream/brown split, with the toe bumper, straps and collar roll
# carrying the cream accents on top of the brown.
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


BENDY_SHOE = ShoeSpec(
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
    build_glasses(builder, detail)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, segments)
    # 20, not 24: Flash's rows-for-columns trade pays for the sleeve's stripe
    # station pairs — the stripes are horizontal, so the torso's colour edges
    # keep their crispness at any column count, and 20 stays even (mirror-
    # symmetric columns). Invisible at game scale; a lost stripe is not.
    torso_segments = 20 if detail >= 2 else segments
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, torso_segments,
                 color_fn=stripe_color)
    build_cargo_pockets(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=BENDY_ARM)
        build_leg(builder, side, detail, spec=BENDY_LEG)
        build_shoe(builder, side, detail, spec=BENDY_SHOE,
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
    obj["recessReference"] = "bendy-bao-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_bend_it_LOD0", "kid_bend_it_LOD1", "kid_bend_it_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_bend_it_LOD0": (20, 12, 2),
        "kid_bend_it_LOD1": (8, 4, 1),
        "kid_bend_it_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "bend_it")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Bendy Bao reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against bendy-bao-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the collar ring accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- bend_it\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_bend_it_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
