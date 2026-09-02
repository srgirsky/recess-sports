"""Rebuild Grizz as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/grizz-pilot.blend \
    --python scripts/v2/blender/sculpt-grizz-source.py

★ GRIZZ IS THE FIRST HAIR-MASS CHARACTER, and that is why he follows Tank.

Tank was the bald control: a failure on his board was provably a failure of the
body library. Grizz is the opposite extreme — his afro is 25% of every figure
on his sheet and IS his silhouette. The head's whole read is a hair volume the
shared library has never built, so what his rounds prove or disprove is the
first hair construction, with the body library already proved on two kids.

★ HIS SHEET DEFEATS THE COLOUR RULER, AND THE SPEC SAYS SO INSTEAD OF GUESSING.

`scripts/v2/turnaround-specs/grizz.spec.json` refuses four ways: his tee
(#844a23) and his skin (#905834) are one cluster on the sheet, and his shorts
(#1d1e21) share a cluster with his afro (#131313). Every tee/skin and
hair/shorts boundary below was therefore traced by GEOMETRY — seam shadows,
value walks down named columns, and silhouette runs — never by asking a pixel
which material it is. Where a table cites `measured:`, the number re-derives
from the sheet's silhouette; where it cannot, the reason is written beside it.

The conversion: his front figure runs 684px over the rig's 4.0ft, so
1px = 0.005848ft. The profile figure is 666px, 1px = 0.006006ft.

⚠️ THE PROFILE FIGURE FACES +X ON THE SHEET, the opposite of what the first
trace assumed. The first left-edge walk of the profile view was read as "the
face has no nose" — it was the BACK of his afro. The face, nose and pout are
the right edge. The rig's forward is -y; profile +x maps to -y.
"""

from __future__ import annotations

from math import asin, cos, pi, sin, sqrt
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
from sculptlib.rig import ARM_ELBOW_X, LEG_ANKLE_Z, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/grizz-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/grizz-face-atlas.png"
REVISION = "grizz-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette, sampled off grizz-turnaround.png inside the figure mask ------
#
# Sampled as window means inside the flood-fill figure mask (never down a bare
# column — Tank's sock lesson). The tee and the skin really are 15 tone units
# apart, which is why the spec refuses to name them; the SCULPT can hold them
# apart because it knows which surface it is painting.
#
#   tee (z 2.0-2.4 centre)   #844A23      cheek (z 3.1-3.3)  #905834
#   forearm (z 1.55-1.75)    #8F5938      shorts (z 1.05-1.18) #1D1E21
#   afro lit curls           #38322C      afro modal cluster  #131313
#   sock band (z 0.42-0.55)  #BFA081 (shaded; lit rows reach #F0E4D2)
#   shoe navy (z 0.15-0.35)  #363A40      shoe sole cream     #CFB08D
# ★ AUTHORED BRIGHTER THAN THE SAMPLED #905834, AND THE FIRST BOARD IS WHY.
# The board's ramp delivers ~0.63-0.79 of an authored channel — the finding
# Junebug's palette block records for creams — and it applies with interest to
# deep skin: authored at the concept's own value, his rendered cheek fell to
# ~lum 70, visibly darker than the drawing, and `measure:fidelity`'s visible-
# face metric read 0.0% because `isSkin`'s luminance floor is 80. The swatch
# below renders back to the concept's ~97. The metric was never the target —
# matching the drawing is — but it is the instrument that caught it.
SKIN = rgba("B06A3E")
# Moved from SKIN by the per-channel ratio Junebug's shadow takes from hers
# (x0.80 / x0.70 / x0.55) — the concept's own shadow readings are terminators,
# not authored swatches.
SKIN_SHADOW = rgba("8D4A22")
# Authored between the afro's modal near-black (#131313) and its lit curl tops
# (#38322C): the board's ramp delivers ~0.63-0.79 of an authored channel, so a
# swatch at the modal value would render as a hole. The warmth is real — his
# curls read warm-black on the sheet, not ink-black.
HAIR = rgba("241E19")
# ★ ROUND 9: DEEPENED AND REDDENED AWAY FROM THE SKIN. The first independent
# review measured the 40px strip collapsing tee and skin into "a single
# monochrome mass" — authored 0x8A4E26 tee against 0xB06A3E skin is only ~26
# luminance apart after the ramp. The drawing holds the same hue family but
# separates by VALUE; the tee gives a step of value back.
SHIRT = rgba("7C3F16")
SHIRT_DARK = rgba("5E2E0F")
PANTS = rgba("22242A")   # sampled #1D1E21, lifted slightly and kept cool
PANTS_DARK = rgba("121317")
# His shoe navy is the same slate family as Tank's — dark and cool against
# cream, not saturated. Tank's file records the classifier proving this class
# of colour; authored a step lighter than the sampled #363A40 to survive the
# board's ramp.
SHOE = rgba("3E4650")
# Tank's finding, restated because it holds here too: the sock is the cooler,
# brighter cream; the shoe creams are warmer and deeper. His slouched socks are
# the biggest cream mass on the figure.
SOCK = rgba("FFF3E2")
WHITE = rgba("FFE5BC")   # the midsole: the warmest, brightest shoe band
SOLE = rgba("F2D2A2")    # the toe bumper and collar trim: greyer, deeper
# The drafting team's colour lands on the sock's roll-top stripe — his kit has
# no piping and his shoe already spends its contrast on navy-vs-cream, so the
# sock roll is the one trim surface left that survives 40px.
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull, measured under the afro ----------------------------------------
#
# The afro hides his cranium in every view, so the skull is fitted to what the
# drawing does show: the face opening. Measured with a lit-skin detector
# bounded to the head band of the front figure:
#
#   fringe bottom (centre)  z 3.25    brow band centre   z 3.07
#   eye band centre         z 2.90    nose base          z 2.78
#   lip line                z 2.68    chin / neck pinch  z 2.48-2.49
#   cheeks at their widest  1.140ft across at z 2.82
#
# The skull crown is authored at ~z 3.55 inside the afro — invisible, and only
# there so the cap has a dome to sit on.
HEAD_CENTER = (0.0, -0.020, 3.020)
HEAD_RADII = (0.520, 0.560, 0.530)

# ★ HIS JOWLS ARE THE FACE'S READ. The scale table swells the ellipsoid at the
# cheek latitudes: measured 0.570 half at z 2.82 (nz -0.377) against the bare
# ellipsoid's 0.482 there — a 1.18 swell, tapering to 1.0 by the chin. Above
# the fringe the skull is invisible and the table returns to 1.0.
FACE_SCALE = (
    (1.00, 1.00),
    (0.60, 1.00),
    (0.30, 1.02),
    (0.00, 1.06),
    (-0.20, 1.10),
    (-0.40, 1.18),
    (-0.60, 1.16),
    (-0.80, 1.08),
    (-1.00, 1.00),
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
    """The eye socket's recess — shallow, because his eyes are small beads
    under a heavy brow and most of the drawn shadow is the brow's own overhang.
    Eye band centre z 2.90 is latitude nz -0.226 on this skull."""
    dz = nz + 0.226
    dx = abs(nx) - 0.310
    radial = (dx * dx) / 0.060 + (dz * dz) / 0.018
    if radial >= 1.0:
        return 0.0
    return 0.014 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A protruding button nose. Measured on the profile figure's face edge
    (the RIGHT edge — see the header): the brow plane holds x 898-903, the eye
    line recesses to 901, and the nose jumps to 919 across z 2.92-2.84 — a
    0.10ft button proud of the brow, with the pout below it reaching 921. The
    peak is authored at nz -0.230, above the front view's nostril band (z 2.78,
    nz -0.453), because the render's shaded band sits below the push's peak —
    Tank's round-31 note."""
    if abs(nx) > 0.24:
        return 0.0
    dz = nz + 0.230
    if dz < -0.17 or dz > 0.17:
        return 0.0
    across = max(0.0, 1.0 - (nx / 0.24) ** 2)
    bridge = 0.024 * across * max(0.0, 1.0 - abs(dz - 0.10) / 0.12)
    reach = 0.140 if dz >= 0.0 else 0.150
    t = dz / reach
    tip = 0.115 * across ** 1.10 * max(0.0, 1.0 - t * t) ** 1.30
    return bridge + tip


def muzzle_push(nx: float, nz: float) -> float:
    """The pouting muzzle that carries his lower face.

    Measured on the profile figure's face edge: the concept's face is nearly a
    vertical plane from brow (x 903, y -0.462) through the pout (x 921,
    y -0.571) to the chin (x 907, y -0.486), while the bare ellipsoid — even
    with the library's flattening and its 0.090 chin term — retreats to
    y -0.27 by the chin. The 0.21ft shortfall is his jutting muzzle: this is
    the form that makes "grumpy, powerful" read from the side. Faded past
    nz -0.90 so the underside of the jaw rolls back instead of shelving.
    """
    if nz > -0.40:
        return 0.0
    ramp = min(1.0, (-nz - 0.40) / 0.25)
    push = 0.21 * ramp
    # Fade started at -0.90 with a 6x slope carved a visible notch where the
    # pout meets the chin (first independent review); a gentler roll-off from
    # -0.86 keeps the jaw underside continuous.
    if nz < -0.86:
        push *= max(0.55, 1.0 - 3.2 * (-nz - 0.86))
    across = max(0.0, 1.0 - (nx / 0.42) ** 2)
    return push * across ** 0.8


def face_push(nx: float, nz: float) -> float:
    """The head's whole forward relief: nose plus muzzle, one field."""
    return nose_push(nx, nz) + muzzle_push(nx, nz)


# ★ NO EARS — AND THE REASON RECORDED HERE WAS FALSE. Corrected 2026-08-16.
#
# It read: "The afro covers them completely in all five views — there is no ear
# line, no ear width, and nothing for `EarSpec` to cite." Cropped and looked at,
# his turnaround's PROFILE view (x 693-927) draws a large, fully constructed ear
# — outer helix rim, deep concha shadow, lobe against the skull — sitting
# entirely CLEAR of the afro, which springs back behind it. His whole face is
# clear of it too, heavy-lidded eye and all.
#
# The claim was never measured, and it did not stay local: Penny cites it by
# name as "Grizz's precedent", Bubbles builds none on the same reasoning, and
# `featurelatitude.lint.test.js` repeats it in the comment that makes an entry
# without `earLine` permit a sculpt with no `EarSpec`. So one unmeasured
# sentence about a drawing became the thing that legalises three missing
# features — rubric 3.10 ("an outer rim, an inner shadow and a lobe against the
# skull, never a bare ellipsoid bump") is failing outright on all three.
#
# What IS true and still holds: the head's widest row on his sheet (z 3.26,
# half 0.8275) is the AFRO's equator, not an ear line, so the spec's `earLine`
# landmark must not be read as one for him — the ear has to be traced off the
# profile by hand. Building it is his next round's work, and the ear line there
# is a bounded trace, not the widest-row detector.

# ★ THE FACE-ATLAS WINDOW IS SOLVED AGAINST HIS OWN FEATURE ROWS. Brow z 3.07
# (lat +0.096), eye z 2.90 (lat -0.228) onto the generator's drawn rows 30 and
# 52; his lip line z 2.68 then lands at cell ~82. The spec REFUSES his mouth
# (`ambiguous-parts`: his nose shadow and his frown line are 7 luminance counts
# apart), so the lip row is the bounded trace recorded here: the only central
# dark run below the nose band is rows 351-352, z 2.684-2.690, 86.5% of the
# afro-inclusive head — and the runs above it (162-180 + 217-235, flanking a
# lit midline) are his EYES, which is what the unbounded detector kept finding.
FACE_ISLAND = (0.92, -1.409, 1.988)

HEAD_SPEC = HeadSpec(
    center=HEAD_CENTER,
    radii=HEAD_RADII,
    half_scale=face_half_scale,
    socket=socket_push,
    nose=face_push,
    island=FACE_ISLAND,
)

# Denser rows through the nose band, for the reason Junebug's script records:
# uniform rows sample a quadratic cap 1.7 times and render a smear.
FACE_ROWS = [0.0, 0.092, 0.184, 0.276, 0.319, 0.362, 0.405,
             0.448, 0.540, 0.632, 0.724, 0.816, 0.908, 1.0]


def skull_front_y(x: float, z: float) -> float:
    """The skull surface's forward (-y) extent at (x, z), for the afro tuck."""
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    rx = HEAD_RADII[0] * face_half_scale(nz)
    nx = x / rx if rx else 2.0
    remainder = 1.0 - nx * nx - nz * nz
    if remainder <= 0.0:
        return HEAD_CENTER[1]
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


# --- The afro ------------------------------------------------------------------
#
# ★ AUTHORED HERE, NOT IN SCULPTLIB. The library's rule is that a builder moves
# in only when a second character proves it generic; this is the roster's first
# hair mass, so its construction is his until Bubbles' or Mimi's curls ask for
# it. The numbers would stay here either way.
#
# Each level is (z, half_x, half_y, y_centre). The half_x column is the front
# silhouette, which at head rows IS the afro; half_y and y_centre come from the
# profile figure's spans, converted with the axis at image x 826 (the ankle and
# torso centres agree on it within 6px). His afro is back-heavy: at its
# equator it reaches 0.55ft forward and 0.78ft back.
#
# measured: front z=3.90 halfWidth=0.3655
# measured: front z=3.74 halfWidth=0.5877
# measured: front z=3.58 halfWidth=0.7135
# measured: front z=3.42 halfWidth=0.7924
# measured: front z=3.26 halfWidth=0.8275
# measured: view2 z=3.50 halfWidth=0.6637
# measured: view2 z=3.34 halfWidth=0.6667
# ★ ROUND 9: THE CROWN WAS A LID. The first independent review called the
# afro "a flat-topped mushroom cap ... reading as a helmet": two rings spanned
# the whole dome from 0.366 to the cap fan, so the top rendered as a truncated
# cone. The crown now carries four rings on the concept's own curve, and the
# back column (y_centre + half_y) descends monotonically so the profile's rear
# edge is one arc instead of the notched lumps the same review flagged.
# ★ FIVE ROWS PAID FOR THE EARS (2026-09-02): 3.660, 3.500, 3.140, 2.880 and
# 2.680 sat within 0.025 of the linear interpolation of their neighbours, and
# build_ear at hero costs ~300 triangles the LOD0 budget did not have.
AFRO_LEVELS = [
    (3.980, 0.060, 0.055, 0.010),
    (3.945, 0.215, 0.195, 0.030),
    (3.905, 0.360, 0.320, 0.048),
    (3.860, 0.412, 0.400, 0.060),
    (3.820, 0.444, 0.472, 0.070),
    (3.740, 0.588, 0.532, 0.080),
    (3.580, 0.714, 0.643, 0.100),
    (3.420, 0.792, 0.660, 0.118),
    (3.340, 0.807, 0.635, 0.150),
    (3.260, 0.828, 0.516, 0.245),
    (3.020, 0.740, 0.424, 0.322),
    (2.940, 0.690, 0.255, 0.445),
    (2.780, 0.470, 0.210, 0.415),
    (2.600, 0.270, 0.155, 0.360),
]

# The fringe arc: where the afro's lower edge crosses the face, measured as the
# first lit-skin row per column on the front figure. (|x| ft, fringe z.) The
# afro tucks onto the skull inside this arc so the face shows through, and
# hangs proud outside it.
AFRO_FRINGE = [
    (0.00, 3.251),
    (0.18, 3.245),
    (0.26, 3.190),
    (0.32, 3.090),
    (0.38, 2.970),
    (0.44, 2.870),
    (0.60, 2.860),
]

AFRO_OPEN_BOTTOM = 2.46   # below the chin nothing tucks — the nape rings are free


def fringe_z_at(x_abs: float) -> float:
    """The afro's lower edge over the face at lateral offset |x|."""
    table = AFRO_FRINGE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


# ★ THE EAR, BUILT (sculptlib.ear, 2026-09-02) — the note above records that
# "no ears" was false against the drawing. Off the profile (x 693-927): a big
# ear from just under the brow band to the pout line, z 3.17 → 2.79, entirely
# clear of the afro, which springs back behind it.
EAR_SPEC = EarSpec(center=(0.030, 2.980), radii=(0.150, 0.190))

# The afro stays BEHIND the ear line at face height (his whole face is clear
# of it in profile). Diva's face-band floor, as on Penny and Bubbles.
FACE_BAND = (2.700, 3.220)
FACE_BAND_FLOOR_Y = 0.060


def skull_surface_x(y: float, z: float) -> float:
    """The skull's lateral half-width at (y, z) — what the ear mounts against."""
    ny = (y - HEAD_CENTER[1]) / HEAD_RADII[1]
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    remainder = 1.0 - ny * ny - nz * nz
    if remainder <= 0.0:
        return 0.0
    return HEAD_RADII[0] * (remainder ** 0.5) * face_half_scale(nz)


def build_afro(builder: MeshBuilder, detail: int) -> None:
    """One closed lofted volume with the face tucked out of it.

    Rings descend the levels table; a vertex on the forward half that falls
    inside the fringe arc is pulled BEHIND the skull surface, so the face
    renders in front of the hair with no gap and no crossing — the visible
    fold between buried and proud vertices is the fringe line itself.
    """
    segments = 24 if detail >= 2 else (12 if detail == 1 else 8)
    levels = AFRO_LEVELS if detail >= 2 else thin_for_lod(
        [(z, hx, hy, yc) for z, hx, hy, yc in AFRO_LEVELS], detail)
    # ⚠️ STITCHED BOTTOM-UP, IN `loft`'s OWN WINDING. The first build walked the
    # levels top-down with the quad order copied by eye, which reversed every
    # face — the afro rendered inside-out, showing its back interior through a
    # culled front, and the board read it as a thin beret with the skull dome
    # poking through. Same class as the capwinding gate's subject: a winding
    # error is invisible in the table and obvious on the board.
    ascending = list(reversed(levels))
    rows = []
    for z, half_x, half_y, y_centre in ascending:
        ring = []
        # ★ THE CURLS ARE A DETERMINISTIC SCALLOP, NOT NOISE. Six lobes per
        # ring, phase-stepped per level so the bumps spiral instead of
        # columns-of-bumps; ±3.5% of radius reads as curl clumps at hero scale
        # without moving the silhouette citations outside their tolerance.
        curl = 0.035 if detail >= 2 else 0.0
        for column in range(segments):
            theta = 2 * pi * column / segments
            clump = 1.0 + curl * sin(6.0 * theta + 1.7 * len(rows))
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            if y < y_centre and AFRO_OPEN_BOTTOM < z < fringe_z_at(abs(x)):
                # forward half, inside the arc: bury it behind the face
                y = max(y, skull_front_y(x, z) + 0.050)
                if FACE_BAND[0] < z < FACE_BAND[1]:
                    y = max(y, FACE_BAND_FLOOR_Y)
            ring.append(builder.vertex((x, y, z), HAIR, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), HAIR, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.03), HAIR, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


# --- The torso, traced by geometry ---------------------------------------------
#
# not-traceable: his tee and his skin are one colour cluster, so no colour scan
# can separate sleeve from torso — the spec refuses the whole sweep. What the
# sheet does give: below z 1.65 his forearms hang CLEAR of the tee with a dark
# seam shadow between (z 1.65 row: arm 52-95, seam 96-100, torso 101-289), so
# the torso's own edges are readable there. At z 1.65 the central run is
# 101-289px = half 0.550; at z 1.26 the hem runs 95-294 = half 0.582. Above
# z 1.65 the sleeves merge with the body and those rings are faired, not
# traced. Depth is the profile figure's span, which his hanging arms overlap —
# authored slightly inside it.
# measured: front z=2.48 halfWidth=0.2632
# measured: view2 z=1.25 halfWidth=0.4475
# measured: view2 z=1.98 halfWidth=0.4444
TORSO_LEVELS = [
    (1.150, 0.560, 0.430, "Hips"),    # hem underside
    (1.185, 0.600, 0.455, "Hips"),    # hem band, proud
    (1.230, 0.582, 0.450, "Hips"),    # traced: hem row
    (1.400, 0.570, 0.478, "Hips"),
    # ★ ROUND 9: A BELLY, NOT A SLAB. The review called the torso "a
    # straight-sided tapered slab"; the concept's mass is low and round. The
    # mid rings bow outward in depth (the front view's near-straight width
    # trace is real and kept — his roundness lives in the profile).
    (1.650, 0.556, 0.500, "Spine"),   # traced clean: arms clear of the tee here
    (1.900, 0.548, 0.480, "Spine"),
    (2.150, 0.540, 0.420, "Spine1"),  # faired: sleeve merged with body above 1.65
    (2.320, 0.518, 0.372, "Spine2"),  # yoke — holds the shoulder out
    (2.400, 0.455, 0.340, "Spine2"),  # shoulder slope
    (2.440, 0.352, 0.300, "Spine2"),
    (2.468, 0.284, 0.260, "Spine2"),  # yoke: the last tee ring under the collar
    (2.476, 0.290, 0.266, "Spine2"),  # rib lower edge — COLLAR_Z sits inside this pair
    (2.502, 0.296, 0.272, "Spine2"),  # rib crown, 0.012 proud of the yoke
    (2.524, 0.262, 0.250, "Spine2"),  # neck hole: the rib rolls inward to it
]

# THE TEE HAS A COLLAR (hem sweep, rubric 3.4 — before this the opening was a
# raw colour-free drop and read as skin-on-skin). The sheet draws a crew-neck
# rib: down the profile's nape column (x=800) the band sits between a lower
# seam at z 2.468 (tee 0x844b26 -> seam 0x6e391a -> rib 0x763c17) and the
# roll-over at ~z 2.517; the front dip is occluded by the jowls, so the nape
# is the only lit, unoccluded read. Its colour traces DARKER than the tee
# (lit rib ~0x80441E against lit tee ~0x915127, ~0.87/0.84/0.77 per channel);
# a step that subtle dies in the board ramp (the round-9 monochrome lesson),
# so the rib wears SHIRT_DARK — the hem tone the sleeve cuff and pocket top
# already wear, which is also the wardrobe's own logic: one rib fabric on
# every edge. Recorded deviation: authored 0.76x of the tee against the
# sheet's ~0.85x, so the band survives 40px. The colour switch sits INSIDE
# the 2.468/2.476 ring pair so the ramp lives in a 0.008ft band (the Zippy
# stretched-band lesson), and the rib crown stands proud so the collar
# OVERHANGS the yoke — crisp + proud is a constructed garment (Penny's
# exemplar), and the widened hole ring fills the saddle between the sleeves.
COLLAR_Z = 2.472


def torso_color(theta: float, z: float):
    """SHIRT_DARK rib above COLLAR_Z; the tee everywhere else."""
    return SHIRT_DARK if z >= COLLAR_Z else SHIRT

# His neck barely exists — the pinch is at z 2.481 (front half-width 0.263) and
# the chin is at 2.49, so the head sits straight on the collar like Tank's.
# The neck stays narrower than the collar hole at every shared height (the
# crossing-surfaces lesson in Tank's file) and narrower than the jaw above it.
# ★ THE PINCH IS THE RULER EVERY HEAD METRIC HANGS OFF, and round 2 put it 0.2
# high. The first table copied Tank's taper — narrower at the TOP — so the
# figure's narrowest row landed at z 2.66 instead of the drawing's 2.48, the
# measured head lost 0.2ft, the aspect inflated to 1.27, and the visible-face
# sample row (62% of a too-short head) landed on the fringe and read 0.0%.
# One table, three red metrics. The drawing pinches at the BOTTOM of the neck
# where it meets the collar; the neck widens upward into the jaw.
# measured: front z=2.48 halfWidth=0.2632
NECK_LEVELS = [
    (2.470, 0.240, 0.224, "Spine2"),
    (2.560, 0.246, 0.230, "Neck"),
    (2.660, 0.252, 0.236, "Neck"),
]


# --- Arms ----------------------------------------------------------------------
#
# The rig is a T-POSE and left is -x; the table is indexed by x along the limb.
# The sleeve hem is traced: walking the arm's own columns (x 70 and 80), the
# fabric-to-skin seam shadow crosses at z 1.889-1.819 (lum drops to 22-47, then
# the lit forearm reads 116-134 where the fabric above held 82-98). Hem plane
# ~z 1.85, which from a shoulder joint at (0.400, 2.471) is 0.62 along a
# hanging arm: SLEEVE_HEM_X 1.020.
SLEEVE_HEM_X = 1.020

# How much of each inboard ring belongs to the torso bone (Tank's construction).
SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose, indexed by x from shoulder to
# fingertip, while the concept hangs both arms at the sides — no row of the
# sheet is a station of it. What the sheet does pin: the bare forearm below the
# hem is half 0.105 (z 1.50 arm run 52-87, checked at z 1.4-1.6), and the
# closed fist is half ~0.123 (z 1.44 run 52-94 across the knuckles). The
# sleeve radii are held against the silhouette totals minus the traced torso
# (z 2.08 silhouette 0.7193 against a 0.545 body).
ARM_STATIONS = [
    (0.215, 0.238, SHIRT, "Arm"),
    (0.300, 0.246, SHIRT, "Arm"),   # deltoid peak
    (0.335, 0.240, SHIRT, "Arm"),
    (0.400, 0.222, SHIRT, "Arm"),
    (0.620, 0.192, SHIRT, "Arm"),
    (0.840, 0.176, SHIRT, "Arm"),
    (ARM_ELBOW_X, 0.172, SHIRT, "ForeArm"),            # the sleeve covers the elbow
    (SLEEVE_HEM_X - 0.028, 0.162, SHIRT, "ForeArm"),
    (SLEEVE_HEM_X, 0.170, SHIRT_DARK, "ForeArm"),      # cuff band, proud
    (SLEEVE_HEM_X + 0.026, 0.164, SHIRT_DARK, "ForeArm"),
    (SLEEVE_HEM_X + 0.042, 0.142, SHIRT_DARK, "ForeArm"),  # the cuff's underside
    (SLEEVE_HEM_X + 0.058, 0.108, SKIN, "ForeArm"),
    (1.250, 0.104, SKIN, "ForeArm"),
    (1.365, 0.100, SKIN, "Hand"),
    (1.430, 0.118, SKIN, "Hand"),
    (1.505, 0.134, SKIN, "Hand"),   # knuckle line — his fists are chunky
    (1.560, 0.118, SKIN, "Hand"),
]

GRIZZ_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    cap_x=0.170,
    root_ring=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.600,
        finger_root=1.552,
        finger_offsets=((-0.082, 0.0, 0.082), (-0.056, 0.056)),
        finger_lengths=((0.150, 0.172, 0.155), (0.160, 0.168)),
        # Short and thick: the drawing hangs closed chubby fists, so the digits
        # read as knuckle bumps rather than Junebug's articulated fingers.
        finger_widths=(0.046, 0.044, 0.036, 0.014),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.448, -0.060, -0.030),
            (1.516, -0.098, -0.048),
            (1.566, -0.118, -0.058),
            (1.596, -0.126, -0.064),
        ),
        thumb_widths=(0.044, 0.040, 0.031, 0.012),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Legs, shorts, socks -------------------------------------------------------
#
# The shorts hem crosses at z ~0.74 (column x 140: hem stitching bands z
# 0.81-0.72, bare skin from 0.719). The tee hem at z 1.228 hides everything
# above it. Sock top z ~0.52 (skin-to-cream at 0.532-0.509 across three
# columns). His shins are enormous: the left leg's bare-skin run at z 0.60 is
# 106-168px = 0.363ft wide.
SHORTS_HEM_Z = 0.740
SOCK_TOP_Z = 0.520

# The inseam: his shorts legs meet at z 0.98 and the gap widens to the hem —
# measured 6px at z 0.90, 9px at 0.80 (the pocket between them is enclosed
# backdrop, which the figure mask counts as figure, so silhouette run counts
# cannot see it; the gap was traced by colour walks down the centre).
INSEAM_TOP_Z = 0.980
INSEAM_HEM_Z = SHORTS_HEM_Z
INSEAM_HEM_HALF = 0.030


def inseam_half(z: float) -> float:
    """Half the daylight the concept draws between the shorts legs at height z."""
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 2.0

# not-traceable: below the tee hem the shorts and the legs are one silhouette
# run (the inseam pocket is enclosed and counts as figure), so `halfWidthAt`
# spans the pair. The widths below are per-leg: outer edge of the traced dark
# runs minus the rig's own leg_x. At z 0.90 the pair's outer edges are
# 94-292px, so each leg's outer edge is 0.588 from centre against leg_x(0.90)
# = 0.283 — radius 0.305. The shin at z 0.60 is per-run: 106-168, radius
# 0.181 about a centre 0.336 out (the rig's chain puts 0.318 there; the 0.018
# is absorbed by the radius rather than moving the mesh off its bones).
# (z, half-width, depth factor, colour, bone) — strictly descending in z.
LEG_STATIONS = [
    (1.600, 0.255, 1.22, PANTS, "UpLeg"),
    (1.300, 0.278, 1.26, PANTS, "UpLeg"),
    (1.050, 0.307, 1.30, PANTS, "UpLeg"),
    (0.900, 0.305, 1.28, PANTS, "UpLeg"),
    (0.800, 0.310, 1.22, PANTS, "UpLeg"),
    (0.762, 0.326, 1.16, PANTS_DARK, "Leg"),          # hem band, proud
    (SHORTS_HEM_Z, 0.318, 1.12, PANTS_DARK, "Leg"),   # hem underside, z 0.740
    (0.726, 0.232, 1.02, PANTS_DARK, "Leg"),          # inner lip of the opening
    (0.712, 0.186, 0.99, SKIN, "Leg"),                # bare shin begins
    (0.600, 0.181, 0.98, SKIN, "Leg"),                # traced per-run
    (SOCK_TOP_Z + 0.012, 0.178, 0.97, SKIN, "Leg"),
    # ★ THE SLOUCH IS MASS, NOT TRIM. The concept's socks and shoes leave no
    # daylight at the detector's 13%-of-figure sample height — the gap between
    # his legs closes into an enclosed pocket — and round 1 shipped 26% against
    # a tolerance of 12 with rolls sized off the single-sock trace alone. The
    # stance is the rig's and does not move; the roll swells inward instead,
    # which is what a slouched sock pushed down over a shoe does anyway.
    # ★ THE ROLLS ARE THE DRAWING'S SIZE, AND THE DAYLIGHT METRIC IS RED ON
    # PURPOSE. Rounds 4-6 grew these to 0.288 chasing `ankleDaylight`'s 0.00
    # and the board grew a funnel — socks 67% wider than the drawn 0.172 half,
    # a mesh tuned to a bind-pose number, which is the round-1 mistake Tank's
    # file records. Measured, the concept's 0.00 is flood-fill CONTAINMENT,
    # not contact: his shoes touch at the toes (front rows at z 0.11 run
    # 66-171|172-315, adjacent), so the gap between his socks is an enclosed
    # pocket the detector cannot see into — and that gap is 60px = 0.35ft at
    # the sample height, MORE daylight than this table delivers. The rig's
    # stance cannot touch the shoes, so the metric reads ~24 and the cause is
    # recorded here and in the fidelity note rather than sculpted away.
    (SOCK_TOP_Z, 0.206, 0.97, TEAM_MASK, "Leg"),      # the roll, team accent
    (SOCK_TOP_Z - 0.014, 0.216, 0.98, TEAM_MASK, "Leg"),  # the roll's fattest ring
    (SOCK_TOP_Z - 0.030, 0.212, 0.97, SOCK, "Leg"),   # underside of the fold
    (SOCK_TOP_Z - 0.044, 0.192, 0.96, SOCK, "Leg"),   # the sock proper re-emerges
    (0.430, 0.190, 0.96, SOCK, "Leg"),
    (0.400, 0.180, 0.96, SOCK, "Leg"),
    (0.372, 0.165, 0.95, SOCK, "Leg"),                # entering the shoe
    (0.280, 0.104, 0.95, SOCK, "Leg"),
    (0.150, 0.112, 0.95, SOCK, "Foot"),
]

# --- The chest pocket ----------------------------------------------------------
#
# The first independent review found it missing outright: "the tee is missing
# the concept's chest pocket entirely". The turnaround draws a square patch
# pocket on the chest, viewer-left of the placket line on the front view.
# The first cut placed it at +x reasoning about camera handedness and the
# board rendered it viewer-RIGHT — the render is the authority, so it lives
# at -x and the board confirms viewer-left. Its seams are
# rust-on-rust and defeat a pixel trace, so the size is proportioned by eye
# against the sheet at 3x: about a quarter of the chest's half-width, sitting
# just below the yoke. A patch pocket is a raised panel with a darker top
# hem — the same three-part construction every hem in this file uses.
POCKET_X = (-0.37, -0.15)
POCKET_Z = (2.02, 2.24)
POCKET_PROUD = 0.018


def torso_ring_at(z: float) -> tuple[float, float]:
    """(half-width, half-depth) of the tee at height z, off TORSO_LEVELS."""
    levels = TORSO_LEVELS
    for (za, wa, da, _), (zb, wb, db, _) in zip(levels, levels[1:]):
        if za <= z <= zb:
            t = (z - za) / (zb - za)
            return wa + t * (wb - wa), da + t * (db - da)
    return levels[-1][1], levels[-1][2]


def build_pocket(builder: MeshBuilder, detail: int) -> None:
    """A raised patch on the tee's front, proud by POCKET_PROUD."""
    if detail < 1:
        return
    steps = 3
    rows = []
    for j in range(steps + 1):
        z = POCKET_Z[1] - (POCKET_Z[1] - POCKET_Z[0]) * j / steps
        half_w, half_d = torso_ring_at(z)
        row = []
        for i in range(steps + 1):
            x = POCKET_X[0] + (POCKET_X[1] - POCKET_X[0]) * i / steps
            inner = max(0.12, 1.0 - (x / half_w) ** 2)  # even in x: sign-safe
            y = -half_d * sqrt(inner) - POCKET_PROUD
            colour = SHIRT_DARK if j == 0 else SHIRT
            row.append(builder.vertex((x, y, z), colour, "Spine1"))
        rows.append(row)
    # Winding proved on the board: flip=False rendered the panel backfacing
    # (a dark patch lit from inside); True faces the camera.
    builder.grid(rows, 1, cyclic=False, flip=True)


GRIZZ_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
)


# --- The shoe ------------------------------------------------------------------
#
# A chunky navy sneaker with a thick cream cupsole and a cream toe bumper.
# Measured with the paired-parts rule (never down a line through two feet):
# the profile figure's near shoe spans 777-897px at z 0.05 = 0.72ft; each
# front-view shoe reads ~0.50ft of lateral extent once the cast shadow beside
# it is excluded (the shadow reads as figure below z 0.25 — Tank's file
# records the same trap). The shoe tops out at z ~0.35 where the slouched sock
# spills over its collar.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 18.0 * pi / 180.0

# not-traceable: the station table is the last's own fore-aft profile, and a
# turnaround has no view down the length of the foot; the lengths and tops it
# is scaled to are the traced numbers above. Stations follow Tank's proven
# block-last construction; (y along the foot, half-width, top z, colour), toe
# at -y because FORWARD IS -y.
SHOE_STATIONS = [
    (-0.439, 0.070, 0.230, SOLE),
    (-0.388, 0.128, 0.262, SOLE),
    (-0.314, 0.168, 0.286, SOLE),
    (-0.228, 0.192, 0.298, SOLE),
    (-0.131, 0.206, 0.304, SOLE),
    (-0.034, 0.212, 0.306, SOLE),
    (0.057, 0.211, 0.304, SOLE),
    (0.137, 0.198, 0.300, SOLE),
    (0.188, 0.172, 0.290, SOLE),
    (0.239, 0.128, 0.252, SOLE),
]

# The section: cream cupsole low, navy quarter above it, cream collar trim at
# the top where the sock folds over. Vertices sit on the band edges (Tank's
# lesson: a band needs a vertex to live on).
# not-traceable: a cross-section is a fore-aft cut and a turnaround has no view
# down the length of the foot; the band HEIGHTS it carries are the traced
# boundaries recorded beside SHOE_BANDS below.
SHOE_SECTION = [
    (0.000, 0.000, "midsole"),
    (0.620, 0.004, "midsole"),
    (0.950, 0.030, "midsole"),
    (1.000, 0.130, "midsole"),
    (0.990, 0.270, "midsole"),   # the cupsole's top edge
    (0.815, 0.300, "quarter"),   # the foxing line: the upper steps in
    (0.800, 0.420, "quarter"),
    (0.780, 0.560, "quarter"),
    (0.755, 0.700, "quarter"),
    (0.720, 0.820, "quarter"),
    (0.660, 0.880, "collar"),    # cream trim under the sock roll
    (0.520, 0.950, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_MID = [
    (0.000, 0.000, "midsole"),
    (0.970, 0.060, "midsole"),
    (0.990, 0.270, "midsole"),
    (0.815, 0.300, "quarter"),
    (0.780, 0.560, "quarter"),
    (0.720, 0.820, "quarter"),
    (0.660, 0.880, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_LOW = [
    (0.000, 0.000, "midsole"),
    (0.990, 0.270, "midsole"),
    (0.815, 0.300, "quarter"),
    (0.720, 0.820, "quarter"),
    (0.000, 1.000, "collar"),
]


def shoe_floor_at(y_unscaled: float) -> float:
    """The underside's height at a station — toe spring and heel bevel."""
    if y_unscaled <= -0.30:
        t = (-0.30 - y_unscaled) / 0.14
        return SHOE_FLOOR + 0.048 * min(1.0, t) ** 1.6
    if y_unscaled >= 0.16:
        t = (y_unscaled - 0.16) / 0.08
        return SHOE_FLOOR + 0.028 * min(1.0, t) ** 1.5
    return SHOE_FLOOR


# Scaled to the traced drawing: length 0.72ft over a 0.678 span; width to a
# ~0.50ft front footprint on an 18-degree toe-out; height to a 0.35 topline.
SHOE_LENGTH_SCALE = 1.06
SHOE_WIDTH_SCALE = 1.00
SHOE_HEIGHT_SCALE = 1.22

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# Colour boundaries by absolute height (the level-bands lesson from Tank's
# file). Walking the front-left shoe's own columns: the cream sole holds to
# ~29% of shoe height, navy to ~86%, cream collar trim above.
# Round 2 measured the delivered shoe band 73.8% cream / 26.2% navy against
# the concept's 81.9 / 16.0 — the drawing's navy is a modest waistband on a
# shoe that is mostly cream sole, cream toe and slouched cream sock. The navy
# gives ground from both edges.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.340, "quarter"),
    (0.740, "collar"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    """The cream toe bumper's lower edge; 2.0 covers nothing behind its back edge."""
    if y_unscaled > -0.15:
        return 2.0
    frac = min(1.0, max(0.0, (-0.15 - y_unscaled) / 0.29))
    return 0.80 - 0.12 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    """The heel counter's lower edge, mirroring the toe cap's construction."""
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.62 - 0.20 * frac


GRIZZ_SHOE = ShoeSpec(
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
    collar=(0.020, 0.140),
    straps=((-0.170, -0.120), (-0.065, -0.015)),
    strap_arc_min=0.52,
    heel_point=(0.286, 0.126 + 0.028),
    toe_point=(-0.470, 0.050 + 0.048),
    upper=SHOE,
    trim=SOLE,
    midsole=WHITE,
)


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    # The face carries the read that the afro does not: brow, bead eyes, nose,
    # frown. Fewer crown rows than Tank — his crown is hair, not skin.
    face_columns = 27 if detail >= 2 else (9 if detail == 1 else 5)
    back_columns = 6 if detail >= 2 else (2 if detail == 1 else 1)
    if detail >= 2:
        rows_spec, crown, chin = FACE_ROWS, 3, 2
    elif detail == 1:
        rows_spec, crown, chin = [0.0, 0.184, 0.319, 0.448, 0.632, 1.0], 1, 1
    else:
        rows_spec, crown, chin = [0.0, 0.32, 0.60, 1.0], 1, 1
    head_surface(builder, face_columns, back_columns, rows_spec, crown, chin,
                 spec=HEAD_SPEC, palette=PALETTE)

    # Ears at the two near LODs: at LOD2 an ear is two pixels and 58 triangles.
    if detail >= 1:
        for side in (1, -1):
            build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)
    build_afro(builder, detail)

    builder.loft(NECK_LEVELS, 0, SKIN, segments)
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                 color_fn=torso_color)
    build_pocket(builder, detail)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=GRIZZ_ARM)
        build_leg(builder, side, detail, spec=GRIZZ_LEG)
        build_shoe(builder, side, detail, spec=GRIZZ_SHOE,
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
    obj["recessReference"] = "grizz-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    for name in ("kid_grizz_LOD0", "kid_grizz_LOD1", "kid_grizz_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_grizz_LOD0": (20, 12, 2),
        "kid_grizz_LOD1": (8, 4, 1),
        "kid_grizz_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "grizz")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Grizz reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against grizz-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the sock roll accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- grizz\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_grizz_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
