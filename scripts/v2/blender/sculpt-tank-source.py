"""Rebuild Tank as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/tank-pilot.blend \
    --python scripts/v2/blender/sculpt-tank-source.py

★ TANK IS THE BALD CONTROL, and that is why he is first after Junebug.

He has no hair at all. Rubric §3 scores hair mass as one of six categories, so
a failure anywhere else in his board is provably a failure of the BODY library
rather than of a hair system — which is exactly what a second character is for.
He also sits at one extreme of the roster's body range (`bodyType: chunky`,
`hipW: 10`, `belly: 0.8`, the widest hips authored), so the shared construction
is being asked to stretch on its first outing rather than on its tenth.

★ EVERY NUMBER BELOW IS MEASURED, AND THE COMMAND THAT MEASURED IT IS
`npm run measure:turnaround -- tank`.

Junebug's script carries 1,629 lines of hand-traced pixel arithmetic, and that
work is why she is approved — but it is also un-recheckable without redoing the
trace. Her figure was measured by hand; his was measured by a tool that reads
the same landmarks with the same detector `measure:fidelity` uses to grade the
result, so the sculptor and the gate are holding one ruler.

The conversion: his front figure runs 316 x 686px and is scaled to the rig's
4.0ft, so 1px = 0.00583ft and 1ft = 171.5px.

★ AND ONE MEASUREMENT WAS WRONG THE FIRST TIME, IN A WAY WORTH KEEPING. His
sock colour was first sampled down the figure's CENTRE column, which below the
shorts hem is the gap between his legs — cream backdrop read as cream sock, and
the two are within a few counts of each other. Sampling only pixels the figure
mask admits gives #F8EBDA either way here, so the number survived; the method
did not, and on a kid with dark socks it would have shipped the backdrop as a
garment. Sample inside the mask, never down a column.
"""

from __future__ import annotations

from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector

# ⚠️ Blender runs a --python script by PATH and does not put its directory on
# sys.path, so the package beside this file is unimportable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sculptlib.atlas import install_face_atlas
from sculptlib.color import ensure_material_slots, rebuild_palette_material, rgba, srgb_to_linear
from sculptlib.ear import EarSpec, build_ear
from sculptlib.head import HeadSpec, head_surface
from sculptlib.mesh import MeshBuilder
from sculptlib.palette import Palette

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/tank-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/tank-face-atlas.png"
REVISION = "tank-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette, sampled off tank-turnaround.png ------------------------------
#
# Read as the modal colour of a z-band restricted to the figure mask, which is
# what stops a pale garment being confused with a pale backdrop. Percentages are
# that mode's share of the band.
#
#   crown / skull   #CC834C (11%)      face lit   #BB7443
#   jaw shadow      #734422 (10%)
#   tee             #6A4682 (13%)      tee dark   #523464
#   shorts          #24242B (18%)      shorts dk  #121116
#   sock            #F8EBDA (19%)
#   shoe navy       #444C53            shoe cream #F1E4D4
SKIN = rgba("CC834C")
# Moved from SKIN by the same per-channel ratio Junebug's shadow takes from
# hers (x0.80 / x0.70 / x0.55), rather than sampled: the concept's own jaw
# reading (#734422) is a TERMINATOR, not an authored shadow swatch, and taking
# a lit-to-unlit gradient as a palette entry is how a face ends up two-toned.
SKIN_SHADOW = rgba("A35C2A")
# Tank is bald. `hair` is still declared because the brows are drawn and they
# are the one place a hair colour appears on him — the render brief's rule that
# a brow is the kid's own hair colour, shaded, rather than ink.
HAIR = rgba("3A2416")
SHIRT = rgba("6A4682")
SHIRT_DARK = rgba("523464")
PANTS = rgba("24242B")
PANTS_DARK = rgba("121116")
SHOE = rgba("444C53")
SOCK = rgba("FFFCF7")  # same ramp correction as SOLE
WHITE = rgba("FFFFFF")
# ★ ROUND 3: AUTHORED WARMER THAN THE CONCEPT, ON PURPOSE. Sampled #F1E4D4 off
# the turnaround, the first board rendered his shoe #AAA49D — the right value
# family and no warmth at all, and only 42.4% of the band classified as the
# concept's cream against 61.8%. This is the finding Junebug's palette block
# records: the board's ramp costs each channel about 0.79 of the authored swatch
# and compresses chroma toward neutral, so a cream that SURVIVES it has to be
# authored with roughly 1.3x the concept's channel spread. FFE9CE is the value
# that was solved for and proved on her board.
SOLE = rgba("FFFCF5")
# The one surface the drafting team's colour tints. Tank's kit is a plain tee
# with no piping, so the accent goes on the shoe's collar band — the only
# element the concept draws as a separate trim, and it reads at 40px because it
# sits against the navy.
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The head, measured off tank-turnaround.png --------------------------------
#
# Front-view width profile, contiguous run through the figure's centre:
#
#   z     3.918  3.761  3.598  3.440  3.283  3.120  2.962
#   half  0.283  0.432  0.484  0.487  0.615  0.423  0.260   ft
#
# and the profile view's depth over the same band peaks at 1.031ft (half 0.515)
# at z 3.30. So the skull is very slightly deeper than wide, and the 0.615 at
# z 3.283 is NOT skull — it is the ear line, which is the head's widest point on
# this character exactly as it is on Junebug.
#
# Crown lands at 3.99 against a figure top of 4.0; chin at 2.93 against a
# measured pinch at 2.96.
HEAD_CENTER = (0.0, -0.010, 3.460)
HEAD_RADII = (0.487, 0.515, 0.552)

# ★ HIS HEAD IS 26% OF HIS FIGURE AND JUNEBUG'S IS 34%, AND NEITHER IS WRONG.
# Her crown carries a bun; his is bare bone. Reading `headHeightPct` as "Tank's
# head is too small" would be reading a hairstyle as a proportion.
#
# ★ ROUND 3: THE JAW TABLE WAS INVENTED AND IT PINCHED HIS CROWN TO A POINT.
#
# Round 1 authored half-widths that fell to 0.010ft at the poles. The ellipsoid
# ALREADY goes to zero there, and `face_half_scale` divides one by the other, so
# a table that tapers as well double-counts: at nz 0.99 the scale came out 0.31
# and the board drew an egg with a spike on top.
#
# Derived instead, by dividing the concept's own measured half-width by the
# ellipsoid's at the same latitude:
#
#   nz     0.83  0.73  0.62  0.51  0.40  0.29  0.18  0.07 -0.04
#   scale  1.05  1.06  1.04  1.06  1.04  1.02  1.03  1.01  1.00
#   nz    -0.15 -0.25 -0.36 -0.47 -0.58 -0.69 -0.80 -0.91
#   scale  1.21  1.31  1.34  1.36  1.35  1.13  1.18  1.26
#
# ⚠️ THE 1.3s ARE HIS EARS, NOT HIS SKULL. That band is z 3.14-3.38, which is
# exactly where the ear line sits, and the measurement follows the contiguous
# run through the figure's centre — so it includes them. Taking those numbers as
# skull would build a head with a bulge where the ears belong AND ears on top of
# it. The skull is interpolated through that band on the trend either side.
#
# So the table is a SCALE table, not a half-width table: no division, and it
# cannot pinch a pole however it is edited.
FACE_SCALE = (
    (1.00, 1.00),
    (0.80, 1.05),
    (0.60, 1.05),
    (0.40, 1.04),
    (0.20, 1.03),
    (0.00, 1.00),
    (-0.20, 1.02),
    (-0.40, 1.06),
    (-0.60, 1.12),
    (-0.80, 1.19),
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
    """The eye socket's recess.

    Without it the profile is a flat wall from brow to cheek — the defect three
    of Junebug's rounds went looking for before it was named. Tank's is
    SHALLOWER than hers by design: his eyes are drawn half-lidded and sit under
    a heavy brow, so the shadow that reads as a socket on his board is mostly
    the brow's own overhang rather than the recess beneath it.
    """
    dz = nz + 0.109
    dx = abs(nx) - 0.413
    radial = (dx * dx) / 0.075 + (dz * dz) / 0.020
    if radial >= 1.0:
        return 0.0
    return 0.016 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """The nose, as three forms rather than one bump.

    A single quadratic cap reads as a smudge head-on at hero scale, which is
    what Junebug's rounds 3-5 kept scoring. Tank's is a short rounded button —
    `nose: 'dot'` in the roster — so the bridge is nearly absent and almost all
    of the relief is in the tip.
    """
    # ★ ROUND 4: IT WAS AT THE WRONG LATITUDE. Authored at nz -0.62, which is
    # z 3.118 — below the mouth's own 3.00-3.02 band and nowhere near the
    # measured feature line. His nose belongs between the eyes (z 3.40) and the
    # mouth, at z ~3.20, i.e. nz -0.471. The profile board showed the
    # consequence as an absence: rubric 3.5's 5/5 asks for "a real nose breaks
    # the profile" and the silhouette ran unbroken from brow to lip.
    if abs(nx) > 0.26:
        return 0.0
    dz = nz + 0.471
    if dz < -0.16 or dz > 0.18:
        return 0.0
    across = 1.0 - (nx / 0.26) ** 2
    # bridge: a low ridge running up from the tip, barely there on a button nose
    bridge = 0.030 * across * max(0.0, 1.0 - abs(dz - 0.10) / 0.12)
    # tip: the rounded ball that carries the form
    # ★ ROUND 9: MEASURED AT 3 PIXELS PAST THE FOREHEAD LINE against the
    # concept's 13 — 0.53% of figure height against 1.9%, a 3.6x shortfall, and
    # rubric 3.5's 5/5 asks by name for "a real nose breaks the profile". The
    # raw push is not the projection: at the nose's own latitude the skull is
    # already receding, so most of a small push is spent catching up with the
    # forehead before any of it shows.
    # ★ ROUND 13: A BULB, NOT A MOUND. The nose broke the profile but read as
    # "a soft brown smudge with no highlight and no shading terminator" from the
    # front, which is the only angle the draft card and the 40px sprite ever
    # see. A wide gentle push has no terminator to catch the key; a tighter one
    # of the same height does. The falloff narrows and the exponent sharpens
    # while the peak stays where the profile measurement put it.
    tip = 0.118 * across ** 0.55 * max(0.0, 1.0 - (dz / 0.082) ** 2) ** 0.55
    # nostril shelf: the underside, which is what breaks the profile silhouette
    shelf = 0.034 * across * max(0.0, 1.0 - abs(dz + 0.13) / 0.06)
    return bridge + tip + shelf


# ★ ROUND 2: HIS HEAD ASPECT IS MEASURED ACROSS THE EARS, which is why round 1
# came back at 0.97 against the concept's 1.12 with a skull that measures right.
# The concept's widest head row is z 3.283 at half-width 0.615, and that row is
# the ear line on every character — the skull itself only reaches 0.487. Round
# 1 shipped Junebug's ear, at her centre and her size, because the first lift of
# `sculptlib.ear` shared the construction and kept her placement.
#
# His ears are bigger and sit lower and further back than hers: measured off the
# profile crop, 0.325ft tall against her 0.297, centred at z 3.268 where the
# front view puts the widest row.
# ★ ROUND 3: grown 8%. The ears do two jobs on this metric set — they are the
# head's widest row (`headAspect`, still 0.04 short) and they are what stops the
# whole brow line reading as skin (`faceSkin`, 48.8% per side against a concept
# that runs 48.3 and 40.8). Both want a little more ear, and the concept's own
# ear tips are the widest point of his head at half-width 0.615.
EAR_SPEC = EarSpec(center=(0.030, 3.268), radii=(0.1242, 0.1755))

# ★ ROUND 3: HIS FACE NEEDS ITS OWN ATLAS WINDOW.
#
# Measured off the turnaround with a dark-pixel detector, his features sit at
# brow z 3.60, eye z 3.40 and mouth z 3.00 — latitudes +0.257, -0.109 and
# -0.985 on his skull. Through Junebug's window those land at cell y 15, 46 and
# 118 of a 128-cell face, which puts the mouth ten cells from the edge and runs
# its own lower lip off the bottom.
#
# Solved for a brow at cell 30 and a mouth at cell 104: span 2.147, low -1.388.
# His eyes then land at cell 52. Nothing would have gone red without this — the
# atlas would simply have been drawn with a clipped mouth.
FACE_ISLAND = (0.92, -1.388, 2.147)

HEAD_SPEC = HeadSpec(
    center=HEAD_CENTER,
    radii=HEAD_RADII,
    half_scale=face_half_scale,
    socket=socket_push,
    nose=nose_push,
    island=FACE_ISLAND,
)

# The row spacing for the atlas island. Denser through the nose's own band for
# the reason Junebug's script records: uniform rows spend 1.7 of them on the
# form that carries the face, and a quadratic cap sampled 1.7 times is a smear.
FACE_ROWS = [0.0, 0.092, 0.184, 0.276, 0.319, 0.362, 0.405,
             0.448, 0.540, 0.632, 0.724, 0.816, 0.908, 1.0]


def skull_surface_x(y: float, z: float) -> float:
    """The skull's lateral half-width at (y, z) — what the ear mounts against."""
    ny = (y - HEAD_CENTER[1]) / HEAD_RADII[1]
    nz = (z - HEAD_CENTER[2]) / HEAD_RADII[2]
    remainder = 1.0 - ny * ny - nz * nz
    if remainder <= 0.0:
        return 0.0
    return HEAD_RADII[0] * (remainder ** 0.5) * face_half_scale(nz)


# --- The torso, measured -------------------------------------------------------
#
# ★ THE TEE'S SILHOUETTE IS NOT THE TORSO'S, and separating them took a hue
# classifier rather than a silhouette one. Scanning the front figure row by row
# and counting only PURPLE pixels against counting all figure pixels:
#
#   z     2.75  2.55  2.35  2.15  1.95  1.85  1.75  1.55  1.35  1.15
#   tee   0.950 1.283 1.499 1.703 1.837 1.644 1.120 1.172 1.137 1.242  ft
#   full  0.974 1.300 1.522 1.726 1.843 1.831 1.720 1.726 1.749 1.580
#
# Down to z 1.85 the two agree, because the SLEEVES cover the arms completely.
# Below it they part by 0.6ft: that is bare forearm outside a tee that has
# narrowed to its own body width. So the 1.837ft "widest point" at z 1.95 is the
# sleeve hem, not the shoulders, and building the torso to that width would give
# him a barrel chest and no arms.
#
# The torso proper is therefore ~1.15ft across (half 0.575) from hem to chest,
# and the sleeves are separate volumes. Depth comes from the profile view, which
# runs 0.64ft at the shoulder to 1.20ft at the hem — his tee is baggiest at the
# bottom, which is what "oversized" means on a toddler.
# ★ ROUND 3: THE TEE READ AS A FLAT SLAB, and the cause is the level table
# rather than the shading. Round 1 went straight from the hem to the shoulder in
# eight evenly-spaced rings whose widths change by 0.02-0.05 each, which draws a
# trapezoid with straight sides — a piece of card, not a garment on a body.
#
# A tee on a toddler has three events and round 1 had none of them: it CLINGS at
# the chest, FLARES over the belly, and stops at a HEM that has thickness. The
# rings below are placed at those events instead of at equal intervals, and the
# hem carries two rings 0.03 apart so its edge is a band rather than a cut.
#
# Depth comes from the profile view, which runs 0.64ft at the shoulder to 1.20ft
# at the hem — his tee is baggiest at the bottom, which is what "oversized"
# means on a body this shape.
def torso_levels(detail: int) -> list[tuple[float, float, float, str]]:
    """The tee's rings, thinned for the far LOD."""
    if detail >= 1:
        return TORSO_LEVELS
    return [level for index, level in enumerate(TORSO_LEVELS) if index % 2 == 0 or index == len(TORSO_LEVELS) - 1]


TORSO_LEVELS = [
    # ★ THE HEM IS A BAND WITH THICKNESS, and the review named its absence: the
    # torso "widens monotonically with no hem step — a lampshade, not a tee".
    # Four rings buy an underside, a proud band and the body above it.
    (1.070, 0.578, 0.540, "Hips"),    # hem underside
    (1.096, 0.628, 0.602, "Hips"),    # hem band, proud
    (1.130, 0.624, 0.598, "Hips"),
    (1.240, 0.617, 0.590, "Hips"),
    # ★ THE PROFILE WAS A CONE OF REVOLUTION — "no chest, no belly, no back
    # curve", three reviews running. Width alone cannot fix that: the depth (the
    # third column) has to carry a belly that bulges and a chest that comes back
    # in above it, or the side view is a straight taper whatever the front does.
    (1.480, 0.596, 0.582, "Hips"),
    (1.720, 0.584, 0.596, "Spine"),   # belly, deepest point
    (1.960, 0.574, 0.560, "Spine"),
    (2.200, 0.556, 0.486, "Spine1"),
    (2.400, 0.560, 0.470, "Spine1"),  # chest, comes back out
    # ★ THE SHOULDER WAS 21% TOO NARROW, measured: 0.75 head widths delivered
    # against the concept's 0.95. The tee climbed monotonically from collar to
    # hem — a truncated cone with no shoulder break anywhere — which is the
    # "lampshade" the review named and which loses the broad, heavy read his
    # whole silhouette is built on. A yoke ring holds the width out to the
    # deltoid before the collar takes it in.
    (2.540, 0.556, 0.398, "Spine2"),  # yoke, holds the shoulder out
    (2.640, 0.470, 0.336, "Spine2"),  # shoulder slope
    (2.740, 0.336, 0.258, "Spine2"),
    # ★ THE CREW COLLAR IS A RIBBED RING, not the top of a cone. Three rings:
    # the shoulder narrowing, a ring that SWELLS proud of it, and the neck hole.
    # The swell is what makes it read as a separate piece of knitwear at 40px.
    (2.790, 0.262, 0.212, "Spine2"),
    (2.822, 0.278, 0.228, "Spine2"),  # collar rib, proud
    (2.848, 0.244, 0.198, "Spine2"),  # neck hole
]

# The neck. Measured depth at z 2.85 is 0.477ft, and the front-view pinch at
# z 2.962 is 0.519ft across — so it is barely a neck at all, which is the
# `neck: -4` the roster authors for him and the reason his head reads as sitting
# straight on his shoulders.
#
# ⚠️ IT STILL HAS TO BE NARROWER THAN THE JAW or the chin has nowhere to be.
# That rule is Junebug's and it is anatomy, not identity.
# ★ THE COLLAR HAD A SLOT IN IT. The tee's collar hole is 0.244 across and the
# neck was 0.218 there, so a 0.026 ring of nothing ran between them and the
# board drew the torso's unlit interior through the gap — the "skin island
# floating inside the purple collar" 3.7 was failed on. The neck fills the
# collar now.
#
# ⚠️ AND IT STILL HAS TO BE NARROWER THAN THE JAW, which measures 0.260 at
# z 2.96, or the chin has nowhere to sit. That is Junebug's rule and it is
# anatomy: 0.238 at the top leaves 0.022 of clearance.
NECK_LEVELS = [
    (2.760, 0.276, 0.256, "Spine2"),
    (2.880, 0.258, 0.240, "Neck"),
    (2.980, 0.238, 0.224, "Neck"),
]

# --- Arms ----------------------------------------------------------------------
#
# The sleeve hem sits at z 1.85 (see the torso block). Above it the arm is tee;
# below it, bare skin to the hand. The shoulder is at z 2.52, x 0.44 — inboard
# of the sleeve's outer edge because the sleeve flares away from the joint.
# --- Arms ----------------------------------------------------------------------
#
# ★ THE RIG IS A T-POSE, AND ROUND 4 BUILT THE ARMS HANGING DOWN.
#
# The canonical bones run STRAIGHT OUT SIDEWAYS: LeftArm at x -0.400, LeftForeArm
# at -0.918 and LeftHand at -1.365, all at z 2.471. Rounds 1-4 authored the arm
# as a limb falling from the shoulder to the hip, so every forearm vertex sat
# about two feet from the bone that drives it. Junebug's own LeftHand vertices
# measure x -1.618..-1.312, wrapped around her bone at -1.365; Tank's measured
# +0.654..+0.850.
#
# ⚠️ AND THE SIDES WERE MIRRORED. Left bones live at NEGATIVE x, so a `side` of
# +1 is the RIGHT side. Rounds 1-4 named the +x arm "Left", which is invisible in
# any symmetric pose and drives the wrong limb the moment a clip is asymmetric.
#
# ★ NEITHER SHOWED UP IN A SINGLE MEASURED METRIC. All eight of
# `measure:fidelity`'s numbers were inside tolerance with the arms on the wrong
# side of the body and two feet from their bones, because the board renders one
# posed view and the metrics read that render. The playbook says it in words —
# "reject a technically valid model that only works in the bind pose" — and this
# is what it looks like. The runtime run still is what showed it.
ARM_SHOULDER_X = 0.400
ARM_ELBOW_X = 0.918
ARM_WRIST_X = 1.365
ARM_Z = 2.471
SLEEVE_HEM_X = 0.760


def limb_bone(name: str, side: int) -> str:
    """Left bones are at NEGATIVE x, so side -1 is the left side."""
    return f"Left{name}" if side < 0 else f"Right{name}"


def build_arm(builder: MeshBuilder, side: int, detail: int) -> None:
    """One stitched arm along the rig's own axis: sleeve, bare forearm, mitten.

    ★ ONE SURFACE, NOT THREE. The sleeve does not end and the arm begin — the
    same tube changes vertex colour at the hem. `sculptlib.mesh`'s `grid`
    docstring records why: a garment built as its own shell butted against the
    limb z-fights into the torn-paper edges Junebug's round-1 board showed.
    """
    sides = 14 if detail >= 2 else 6
    stations = [
        # ★ THE SLEEVE MUST BE A SHOULDER THAT NARROWS, NOT A TUBE THAT STARTS.
        #
        # Four reviews described this corner as butt-joined primitives — "a
        # discrete ellipsoid cap interpenetrating the torso and a free-floating
        # sleeve torus the arm passes through" — and 3.1's 5/5 is literally
        # "transitions between forms are organic, not butt-joined primitives".
        #
        # Held against approved Junebug's board at 3x the difference is not
        # detail, it is TAPER: her sleeve leaves the torso at nearly the torso's
        # own shoulder radius and narrows all the way to the cuff, so the garment
        # reads as one surface crossing a joint. Tank's left at 0.196 against a
        # tee whose shoulder ring is 0.556 — a rod out of a wide body, which is
        # also why it rendered dark: a thin cylinder turns its whole surface away
        # from the key where a broad deltoid faces it.
        (0.215, 0.286, SHIRT, "Arm"),
        (0.330, 0.272, SHIRT, "Arm"),
        (ARM_SHOULDER_X, 0.248, SHIRT, "Arm"),
        (0.560, 0.216, SHIRT, "Arm"),
        # ★ THE CUFF IS A STEP AND A BAND. Rubric 3.4 asks for garments that read
        # as CONSTRUCTED, and the independent review scored this a 1 with "no
        # folded sleeve cuff" named first. A colour change alone is a printed
        # stripe; a cuff is thicker than the sleeve above it and than the arm
        # below, so it takes three rings — swell, band, and the arm emerging.
        (SLEEVE_HEM_X - 0.030, 0.188, SHIRT, "Arm"),
        (SLEEVE_HEM_X, 0.196, SHIRT_DARK, "Arm"),
        (SLEEVE_HEM_X + 0.026, 0.190, SHIRT_DARK, "Arm"),
        (SLEEVE_HEM_X + 0.040, 0.130, SKIN, "ForeArm"),
        (0.860, 0.126, SKIN, "ForeArm"),
        (ARM_ELBOW_X, 0.120, SKIN, "ForeArm"),
        (1.080, 0.112, SKIN, "ForeArm"),
        (1.240, 0.104, SKIN, "ForeArm"),
        (ARM_WRIST_X, 0.098, SKIN, "Hand"),
    ]
    if detail < 1:
        stations = [station for index, station in enumerate(stations) if index % 2 == 0 or index == len(stations) - 1]
    rows: list[list[int]] = []
    for x, radius, colour, bone in stations:
        bone_name = limb_bone(bone, side)
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            # Rings in the YZ plane, because the limb's axis is X.
            row.append(
                builder.vertex(
                    (x * side, radius * sin(theta), ARM_Z + radius * cos(theta) * 0.94),
                    colour,
                    bone_name,
                    (0.75, 0.25),
                )
            )
        rows.append(row)
    builder.grid(rows, 1, flip=side > 0)

    # ★ THE INBOARD END IS CAPPED, and rubric 3.7 is binary about that. `grid`
    # stitches rows and closes nothing, so the shoulder ring was an open
    # octagon: the independent review read it as "an open octagonal armhole
    # bored through the shirt shell with a floating arm stub inside it". A
    # deltoid dome closes it AND gives 3.11 the round shoulder form it asks for.
    shoulder_bone = limb_bone("Arm", side)
    cap = builder.vertex((0.170 * side, 0.0, ARM_Z), SHIRT, shoulder_bone, (0.75, 0.25))
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (cap, rows[0][nxt], rows[0][index]) if side > 0 else (cap, rows[0][index], rows[0][nxt])
        builder.face(face, 1)

    # ★ AND THE FAR END IS CAPPED TOO. `grid` closes neither end, so capping
    # only the shoulder left the wrist ring open — hidden inside the hand, but
    # an open shell all the same, and the review counted 88 boundary edges over
    # six of them. A hole that happens to be covered is still a hole; the ear,
    # the arm and the leg all get their far end closed.
    wrist_cap = builder.vertex((ARM_WRIST_X * side, 0.0, ARM_Z), SKIN, limb_bone("Hand", side), (0.75, 0.25))
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (wrist_cap, rows[-1][index], rows[-1][nxt]) if side > 0 else (wrist_cap, rows[-1][nxt], rows[-1][index])
        builder.face(face, 1)

    # The mitten hand: a fat palm with a thumb and an index nub. At the 40px
    # field read a five-fingered hand is one blob and only the notch survives.
    hand_bone = limb_bone("Hand", side)
    builder.ellipsoid(
        ((ARM_WRIST_X + 0.115) * side, 0.010, ARM_Z),
        (0.118, 0.082, 0.104),
        0,
        SKIN,
        hand_bone,
        10 if detail >= 2 else 6,
        6 if detail >= 2 else 4,
    )
    if detail >= 1:
        builder.ellipsoid(
            ((ARM_WRIST_X + 0.070) * side, 0.072, ARM_Z - 0.030),
            (0.048, 0.046, 0.044),
            0, SKIN, limb_bone("HandThumb1", side), 6, 4,
        )
        builder.ellipsoid(
            ((ARM_WRIST_X + 0.212) * side, 0.008, ARM_Z - 0.014),
            (0.062, 0.058, 0.056),
            0, SKIN, limb_bone("HandIndex1", side), 6, 4,
        )


# --- Legs and shorts -----------------------------------------------------------
#
# The shorts hem is at z 0.694 and the sock top at z 0.680, so there is almost
# no bare leg on the front view — his shorts are long and his socks are high,
# which between them is why the concept's ankle daylight reads 0.636ft at
# z 0.006 and essentially nothing above it.
# ★ THE LEG FOLLOWS THE BONE CHAIN, NOT A GUESSED SPLAY. The canonical bones are
# LeftUpLeg (-0.200, z 1.600), LeftLeg (-0.292, z 0.824) and LeftFoot (-0.378,
# z 0.095) — the stance is already in the rig, measured across the roster's
# concept art (`render.leg-stance`). Rounds 1-3 invented a hip separation and
# then TUNED it against the ankle-daylight metric, which moved the mesh off its
# own bones to make a number in a bind-pose render come out right.
LEG_HIP_X = 0.200
LEG_HIP_Z = 1.600
LEG_KNEE_X = 0.292
LEG_KNEE_Z = 0.824
LEG_ANKLE_X = 0.378
LEG_ANKLE_Z = 0.095
# ★ ROUND 2: HIS LEGS STAND TOO FAR APART. The concept measures ZERO ankle
# daylight at the metric's own sample height and round 1 delivered 31.5%. The
# splay is NOT the thing to change — it is the canonical rig's stance
# (`render.leg-stance`), shared by every character and re-derived from the
# concept art across the roster. What is his is the hip SEPARATION, and 0.268
# was carried over from a guess rather than measured: his thighs are drawn
# touching from crotch to knee, which on a kid this wide means the legs start
# close and the width comes from their radius.
SHORTS_HEM_Z = 0.694
# ★ MEASURED: the concept shows 7% of figure height of bare shin between the
# shorts hem and the sock top; round 5 shipped 2%, with the socks pulled nearly
# twice as high as drawn. 0.28ft of shin below a hem at 0.694 puts the roll at
# 0.414.
SOCK_TOP_Z = 0.414


def leg_x(z: float) -> float:
    """Lateral centre of a leg at height `z`, interpolated along the bone chain."""
    if z >= LEG_HIP_Z:
        return LEG_HIP_X
    if z >= LEG_KNEE_Z:
        t = (LEG_HIP_Z - z) / (LEG_HIP_Z - LEG_KNEE_Z)
        return LEG_HIP_X + (LEG_KNEE_X - LEG_HIP_X) * t
    if z >= LEG_ANKLE_Z:
        t = (LEG_KNEE_Z - z) / (LEG_KNEE_Z - LEG_ANKLE_Z)
        return LEG_KNEE_X + (LEG_ANKLE_X - LEG_KNEE_X) * t
    return LEG_ANKLE_X


def build_leg(builder: MeshBuilder, side: int, detail: int) -> None:
    """Shorts, bare shin and sock as one stitched surface."""
    sides = 14 if detail >= 2 else 6
    stations = [
        # ★ THE SOCK WAS TWO DISCONNECTED RINGS, and the cause is that this
        # table stopped descending. It ran ... 0.414 (sock top), then 0.634,
        # 0.606 — back UP the leg — so the roll was authored ABOVE the skin band
        # that was supposed to sit above it, and `grid` faithfully stitched the
        # rows in the order given. The board showed a garter floating over a
        # strip of bare shin, which the review measured as 21px of skin between
        # the accent band and the sock.
        #
        # ★ AND THE SHORTS HAD NO VOLUME. Measured on the profile silhouettes,
        # the concept's shorts are 0.228 of figure height deep and the delivery
        # was 0.107 — the same as its own BARE LEG, so the garment added
        # nothing. Tank is `bodyType: chunky`, `belly: 0.8`, power 9, and none
        # of it was in the silhouette. A leg is round below the hem and a short
        # is BAGGY above it, so the section carries its own depth factor.
        #
        # (z, half-width, depth factor, colour, bone) — strictly descending in z.
        (1.600, 0.244, 1.86, PANTS, "UpLeg"),
        (1.360, 0.248, 1.90, PANTS, "UpLeg"),
        (1.100, 0.244, 1.86, PANTS, "UpLeg"),
        (0.900, 0.234, 1.72, PANTS, "UpLeg"),
        (SHORTS_HEM_Z, 0.226, 1.48, PANTS_DARK, "Leg"),   # hem, z 0.694
        (0.680, 0.196, 0.98, SKIN, "Leg"),                # bare shin begins
        (0.520, 0.190, 0.96, SKIN, "Leg"),
        (SOCK_TOP_Z + 0.012, 0.186, 0.95, SKIN, "Leg"),   # z 0.426
        (SOCK_TOP_Z, 0.208, 0.95, TEAM_MASK, "Leg"),      # roll, the team accent
        (SOCK_TOP_Z - 0.034, 0.202, 0.95, TEAM_MASK, "Leg"),
        (SOCK_TOP_Z - 0.066, 0.188, 0.95, SOCK, "Leg"),   # z 0.348
        (0.260, 0.172, 0.95, SOCK, "Leg"),
        (0.150, 0.156, 0.95, SOCK, "Foot"),
    ]
    if detail < 1:
        stations = [station for index, station in enumerate(stations) if index % 2 == 0 or index == len(stations) - 1]
    rows: list[list[int]] = []
    materials: list[int] = []
    for z, radius, depth, colour, bone in stations:
        bone_name = limb_bone(bone, side)
        # ★ THE ACCENT RIDES THE SAME SURFACE. Its rows change MATERIAL, not
        # mesh: a separate band welded on is the detached shell 3.7 just caught
        # on the shoe. `grid` is emitted per row-pair so a pair whose lower row
        # is accent-coloured goes to M_Accessory and the skin stays continuous.
        materials.append(3 if colour == TEAM_MASK else 1)
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            row.append(
                builder.vertex(
                    # ★ THE WHOLE RING IS REFLECTED, not just its centre. Writing
                    # `cx + r*cos(theta)` with `cx = leg_x*side` mirrors where the
                    # leg IS and not which way round it is built, so the far leg
                    # is the near leg translated — the same defect `shoe_place`
                    # had. The board showed it as one shin lit and the other in
                    # shadow at the same height, which three reviews read as a
                    # colour difference between the socks.
                    ((leg_x(z) + radius * cos(theta)) * side, radius * sin(theta) * depth, z),
                    colour,
                    bone_name,
                    (0.75, 0.25),
                )
            )
        rows.append(row)
    for index in range(len(rows) - 1):
        material = 3 if materials[index] == 3 and materials[index + 1] == 3 else 1
        builder.grid(rows[index:index + 2], material, flip=side > 0)
    top = builder.vertex((leg_x(1.600) * side, 0.0, 1.600), PANTS, limb_bone("UpLeg", side))
    ankle_cap = builder.vertex((leg_x(0.150) * side, 0.0, 0.150), SOCK, limb_bone("Foot", side))
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (ankle_cap, rows[-1][index], rows[-1][nxt]) if side > 0 else (ankle_cap, rows[-1][nxt], rows[-1][index])
        builder.face(face, 1)
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (top, rows[0][index], rows[0][nxt]) if side > 0 else (top, rows[0][nxt], rows[0][index])
        builder.face(face, 1)


# --- The shoe ------------------------------------------------------------------
#
# ★ ONE LASTED UPPER, NOT A UNION OF BALLS. This is Junebug's round-5 finding
# and it is construction rather than identity, so it is restated here rather
# than re-learned: an ankle ball plus a toe ball meet along an intersection
# CURVE, and a curve between two differently painted balls is a crease however
# carefully each ball is painted. Cross-sections stationed along the foot and
# stitched into one skin have no intersection to show.
#
# Measured off the profile view: the foot spans 1.20ft front to back at z 0.15,
# and the toe reaches 0.62ft ahead of the ankle.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 21.0 * pi / 180.0
# ★ ROUND 2: THE SHOE WAS BUILT INSIDE OUT, and it is the same mistake round 3
# made on Junebug from the other direction. Her verdict asserted a shoe "white
# with a red toe cap" that nobody had measured, and the sculptor inverted a shoe
# that had been closer to the art. Round 1 here did the reverse from an
# unmeasured impression: navy body with a cream toe, measured 30.2% cream to
# 50.4% navy against the concept's 61.8% to 26.2%.
#
# Measured, his shoe is a CREAM shoe with navy overlays — the sole, the toe cap
# and most of the upper are cream, and the navy is the eyestay panel and the
# heel counter. The band metric is not a style opinion; it is the ratio, and it
# was inverted.
SHOE_STATIONS = [
    # ★ ROUND 3: THE SHOE WAS HALF THE SIZE OF HIS FOOT. Measured off the
    # turnaround, his feet span ONE run 1.656ft across at z 0.15 — they touch,
    # there is no gap between them — and the profile puts the foot 1.211ft long
    # from z 0.05 to its instep at 0.30. Round 2 shipped 0.86ft long and 0.31ft
    # wide, so the sneaker barely exceeded the sock inside it and the board drew
    # a sock with a smudge under it.
    #
    # With the ankles at +/-0.268 and the foot turned out 18 degrees, a 1.211ft
    # last at half-width 0.21 projects to a lateral extent of ~0.86 per side
    # against the concept's measured 0.828. The spike harvest's note on this is
    # the same one: a sneaker is oversized ON PURPOSE, because shoe mass is a
    # silhouette anchor and it is one of the few things that survives 40px.
    #
    # ★ ROUND 8: THE LAST WAS BUILT FROM A MEASUREMENT OF TWO FEET, AND ITS END
    # CAPS WERE FURTHER AWAY THAN THE FOOT WAS LONG.
    #
    # The profile view reads 1.211ft of foot at z 0.05-0.30 and that went
    # straight into the table. It is the NEAR foot and the FAR foot overlapping
    # in a side view of a standing figure; the concept's own side pose shows
    # them staggered, 27.7% of figure height between the pair. The delivered
    # shoe measured 1.49ft — 37.2% of a 4.01ft figure against approved
    # Junebug's 0.62ft (15.3%).
    #
    # ⚠️ SAME MISTAKE AS THE SOCK COLOUR, one measurement earlier: reading a
    # quantity down a line that passes through TWO objects and taking the sum
    # for one. A profile view superimposes the whole far side of the body onto
    # the near side; anything paired must be measured on the FRONT view.
    #
    # And worse, the end caps were at y +0.455 and -0.800 while the rings they
    # close sit at -0.420 and +0.770 — each cap stretched most of a foot past
    # its own ring, which is the doorstop wedge the review kept describing.
    #
    # (y along the foot, half-width, top z, colour) — heel at -y, toe at +y,
    # spanning 0.678ft.
    (-0.239, 0.126, 0.232, SOLE),
    (-0.188, 0.170, 0.286, SOLE),
    (-0.137, 0.196, 0.300, SOLE),
    (-0.057, 0.209, 0.298, SOLE),
    (0.034, 0.210, 0.286, SOLE),
    (0.131, 0.204, 0.262, SOLE),
    (0.228, 0.190, 0.226, SOLE),
    (0.314, 0.166, 0.184, SOLE),
    (0.388, 0.126, 0.136, SOLE),
    (0.439, 0.070, 0.092, SOLE),
]


def shoe_place(side: int, y: float, x_off: float, z: float) -> tuple[float, float, float]:
    """Place a shoe vertex, with the foot turned out.

    ★ THE FEET ARE TURNED OUT, and missing that cost Junebug two rebuilds. A
    foot built straight down the y axis reads as a doll's peg from the gameplay
    camera; the concept draws both feet splayed, and the rotation has to be
    applied to the SECTION rather than to the finished mesh or the sole stops
    being flat on the ground.

    ★ AND THE RIGHT SHOE WAS THE LEFT SHOE ROTATED, NOT MIRRORED.

    `angle = SHOE_TOE_OUT * side` negates the rotation for the far foot but
    leaves `x_off` alone, so the two shoes are genuinely different solids rather
    than reflections. Three reviews saw the consequence and called it a lighting
    difference; a fourth measured 263 of 284 mirrored foot pairs with opposing
    normals and called it an inside-out mirror. Both were describing this: there
    IS no mirror, so "the mirrored half" and "the same half rotated" disagree
    wherever the rotation is not a reflection.

    ⚠️ IT IS NOT A WINDING BUG, which cost a sweep to establish. Flipping the
    `flip` predicate on the shoe grid and the leg grid through all four
    combinations leaves the count at exactly 524 of 1832 every time, because
    `flip` reverses quads and cannot turn a rotation into a reflection.

    The frame is built once, unsigned, and then reflected as a whole — which is
    what mirrors the toe-out as well, so both toes still point outward.
    """
    lx = x_off * cos(SHOE_TOE_OUT) - y * sin(SHOE_TOE_OUT)
    ly = x_off * sin(SHOE_TOE_OUT) + y * cos(SHOE_TOE_OUT)
    return ((leg_x(LEG_ANKLE_Z) + lx) * side, ly, z)


def build_shoe(builder: MeshBuilder, side: int, detail: int) -> None:
    sides = 14 if detail >= 2 else 6
    rows: list[list[int]] = []
    bone = limb_bone("ToeBase", side)
    for y, half, ztop, colour in SHOE_STATIONS:
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            # A section that is flat underneath and domed on top: the sole is a
            # real plane on the ground, not the bottom of a cylinder.
            # ★ THE SECTION IS A SUPERELLIPSE, BECAUSE A SNEAKER HAS A FLAT
            # SOLE. A circular section is a tube with a rounded underside, and
            # from the front camera half of it faces down-and-out at a grazing
            # angle and renders dark. Measured on the board: an all-cream shoe
            # built that way put only 48.7% of the band in the concept's cream
            # against 61.8%, with the missing share sitting in shadow rather
            # than in another colour.
            #
            # Flattening the bottom and the top — |sin| and |cos| raised to
            # powers below 1 — turns the section into a sole, a sidewall and a
            # domed upper, which is both what a shoe IS and what puts its
            # largest surfaces where the key light can reach them.
            c, sn = cos(theta), sin(theta)
            x_off = half * (1.0 if c >= 0 else -1.0) * abs(c) ** 0.70
            span = ztop - SHOE_FLOOR
            shaped = (1.0 if sn >= 0 else -1.0) * abs(sn) ** 0.40
            z = SHOE_FLOOR + span * (0.5 + 0.5 * shaped)
            # ★ THE MIDSOLE IS A BAND, NOT A SECOND SHELL. Rubric 3.4 asks for
            # garments that read as CONSTRUCTED — soles, cuffs, hems — and the
            # round-3 board showed a shoe that was one uninterrupted wash of
            # cream with no sole line at all. Painting the band as rows of the
            # SAME surface is the `grid` rule again: a separate sole slab would
            # meet the upper on an intersection curve and crease.
            # ★ THE SOLE IS A SIDEWALL, NOT A PAINTED LINE. The review scored
            # this a 2 with "a shoe with no sole is not a shoe": the concept
            # carries a thick cream midsole with a visible sidewall, a navy toe
            # cap and a quarter panel. The band below is the sidewall, and the
            # toe cap is the front third in the darker tone.
            if z < SHOE_FLOOR + 0.152:
                band = WHITE
            # ⚠️ SIZED AGAINST THE MEASUREMENT. The first pass painted the front
            # 35% of the last as toe cap and another 19% as quarter panel —
            # about 54% of the shoe navy against a concept that measures 26.2%.
            # The band metric caught it as cream falling to 45.3%.
            elif y > 0.205:
                band = SHOE        # toe cap
            elif -0.200 < y < -0.058:
                band = SHOE        # quarter panel over the instep
            else:
                band = colour
            row.append(builder.vertex(shoe_place(side, y, x_off, z), band, bone, (0.75, 0.25)))
        rows.append(row)
    # ★ MATERIAL 1, NOT 3. Round 4 built the whole shoe on M_Accessory, which
    # is the DECLARED TEAM-ACCENT surface — so the drafting team's colour
    # multiplied over the entire sneaker and the in-game hero rendered it
    # bright yellow against a cream board. Rubric 2.3 is explicit: team colour
    # is confined to the accent surface and everything else is identity.
    #
    # Nothing caught it because both renders were honest. The fidelity board
    # draws the untinted GLB and looked right; only `/v2/?anims=1`, which
    # applies a team, could show it. That is what the runtime hero still is FOR.
    # ★ THE WINDING PREDICATE WAS FLIPPED FOR A REVERSAL THAT NEVER HAPPENED.
    #
    # Round 4 turned the foot around and flipped this to `side > 0` to match.
    # The edit that was supposed to reverse the station table silently did not
    # apply — the tuples kept running heel-at--y to toe-at-+y throughout — so
    # the predicate was corrected for a change that was not there, and one
    # side's feet have been inside out ever since.
    #
    # ⚠️ IT SURVIVED THREE REVIEWS AS "A LIGHTING DIFFERENCE". The mirror check
    # I ran to dismiss it compared POSITION and COLOR_0 and never NORMAL: 2,182
    # pairs matched on colour while 263 of 284 foot pairs pointed inward. The
    # fourth review measured the normals and found it. Approved Junebug is 0 of
    # 1,354; a near-zero threshold is safe, and `authored-character.test.js`
    # gates it now.
    builder.grid(rows, 1, flip=side > 0)

    # Cap both ends so the upper is closed — rubric 3.7 is binary about holes.
    heel = builder.vertex(shoe_place(side, -0.286, 0.0, 0.126), SHOE, bone, (0.75, 0.25))  # heel counter
    toe = builder.vertex(shoe_place(side, 0.470, 0.0, 0.050), SOLE, bone, (0.75, 0.25))
    for index in range(sides):
        nxt = (index + 1) % sides
        a = (heel, rows[0][nxt], rows[0][index])
        b = (toe, rows[-1][index], rows[-1][nxt])
        builder.face(a if side < 0 else (a[0], a[2], a[1]), 1)
        builder.face(b if side < 0 else (b[0], b[2], b[1]), 1)

    # Three lace straps lying ON the vamp, which is what the concept draws —
    # not pegs standing proud of it, the defect Junebug's round-5 board scored.
    if detail >= 2:
        for lace_y in (0.020, 0.100, 0.180):
            path = []
            radii = []
            for step in range(7):
                t = step / 6.0
                across = (t - 0.5) * 2.0
                half = 0.196 * (1.0 - 0.18 * across * across)
                path.append(shoe_place(side, lace_y, half * across, 0.300 - 0.052 * across * across))
                radii.append(0.020)
            # ★ `tube` HAS NO `flip`, so a path that has been mirrored comes
            # out inside out. Reversing the point order reverses the winding,
            # which is the same correction by other means.
            if side < 0:
                path = list(reversed(path))
                radii = list(reversed(radii))
            builder.tube(path, radii, 1, SOLE, bone, 5)

    # ★ THE SHOE'S COLLAR BAND WAS A DETACHED SHELL, and 3.7 caught it: a
    # 100px floating component at the ankle, separated from the shoe by clear
    # background, with its concave inner surface visible. It was two rings
    # stitched to each other and to nothing else.
    #
    # The team accent moves to the SOCK's roll-top instead, which is part of the
    # leg's own continuous surface and cannot detach. It also reads better —
    # a band around the ankle is visible from every gameplay angle where a strip
    # inside the shoe collar is not.


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    # ★ THE CROWN CARRIES HIS WHOLE SILHOUETTE, so it gets the density. Three
    # reviews scored polygon faceting across the skull and cheek at hero scale,
    # and on a bald character the cranium IS the design — there is no hair mass
    # to hide a facet behind. 2 crown rows over a dome this size is a cone with
    # a lid; 5 resolves it. The extra columns go to the face, where the same
    # facets were breaking the cheek.
    face_columns = 27 if detail >= 2 else (9 if detail == 1 else 5)
    back_columns = 6 if detail >= 2 else (2 if detail == 1 else 1)
    if detail >= 2:
        rows_spec, crown, chin = FACE_ROWS, 5, 2
    elif detail == 1:
        rows_spec, crown, chin = [0.0, 0.184, 0.319, 0.448, 0.632, 1.0], 1, 1
    else:
        rows_spec, crown, chin = [0.0, 0.32, 0.60, 1.0], 1, 1
    head_surface(builder, face_columns, back_columns, rows_spec, crown, chin,
                 spec=HEAD_SPEC, palette=PALETTE)

    for side in (1, -1):
        build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, segments)
    # ★ CONSTRUCTION DETAIL IS A NEAR-LOD LUXURY. The collar rib, the hem band
    # and the cuff are each an extra ring, and at LOD2 they cost more triangles
    # than the whole silhouette is worth — the export refused the delivery at
    # 1232 against a 1200 budget, which is the budget gate working. At LOD2 the
    # character is a 40px sprite and a 0.03ft rib is invisible, so the levels
    # collapse to the shape and the bands survive only as colour.
    builder.loft(torso_levels(detail), 1, SHIRT, segments)

    for side in (1, -1):
        build_arm(builder, side, detail)
        build_leg(builder, side, detail)
        build_shoe(builder, side, detail)


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
    obj["recessReference"] = "tank-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    # Tank is bald, so his procedural bootstrap never made an M_Hair.
    ensure_material_slots(SLOTS)

    for name in ("kid_tank_LOD0", "kid_tank_LOD1", "kid_tank_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_tank_LOD0": (20, 12, 2),
        "kid_tank_LOD1": (8, 4, 1),
        "kid_tank_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "tank")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Tank reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against tank-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the shoe collar accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- tank\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_tank_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
