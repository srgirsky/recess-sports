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
# ★ HIS NAVY IS A SLATE, NOT A BRIGHT BLUE, AND THE CLASSIFIER SAID SO FIRST.
#
# `measure:fidelity` reads the concept's own two shoe tones at run time and gets
# #e3d4c3 and #353c42 — a dark desaturated blue-grey. This was authored #2E4E86,
# a saturated navy, and in chromaticity the two sit 50 apart: past the
# membership threshold, so the delivered shoe's blue was being counted as
# NEITHER tone. Widening the navy band made the measured second tone go DOWN,
# which is the tell — more of a colour the classifier refuses to recognise.
#
# The concept's shoe reads navy to the eye because it is dark and cool against a
# cream midsole, not because it is saturated. Authored a little lighter than the
# target to survive the board's ramp, as the cream above is.
SHOE = rgba("3F5068")  # the slate the concept actually holds
# ★ THE SOCK IS COOLER AND BRIGHTER THAN THE SHOE, AND THIS WAS THE OPPOSITE.
#
# An independent review found "sock and shoe are the same cream, so they merge —
# one continuous cream tube from mid-calf to the ground", against a concept that
# separates them into three parts. Measured on the concept's own rows: its sock
# at 12-13% of figure height runs rgb(233,216,192) and rgb(216,194,169), r-b of
# 41 and 47, while its shoe cream at 3% and 7% runs r-b 52 and 57. The sock is
# the cooler, brighter of the two.
#
# This shipped r-b 75 against a midsole of 45 — the sock WARMER than the shoe,
# which is the separation backwards, and at board scale two warm creams of
# similar value read as one surface.
SOCK = rgba("FFF2E0")  # cooler and brighter than either shoe cream
# ★ THE MIDSOLE IS LIGHTER BY VALUE, NOT BY BEING WHITE. A near-white band
# counts as "cream" for the tone split while contributing nothing to the band's
# chroma, which is how the two metrics ended up anti-correlated: every step that
# made the sole read as a separate band also drained the shoe's colour. It is a
# warm cream a little lighter than the upper.
# ★ ROUND 17: AND THE TWO CREAMS WERE THE SAME CREAM. FFE4B8 against FFDCA8 is
# a difference of 8 in one channel — invisible at any scale, so the midsole, the
# collar and the toe mudguard rendered as one undifferentiated cream lump no
# matter which rows carried which swatch. An independent review named it: the
# distinction has to be by VALUE, not by hue.
#
# Measured off the concept's own front figure, row by row, the two bands really
# do differ: the midsole runs rgb(196,172,142) — the warmer, brighter band that
# catches the ground bounce — and the collar/upper runs rgb(190,176,157), which
# is greyer and a little deeper. Authored with the ~1.3x channel spread this
# board's ramp costs (see the note below), that is FFEDD2 against F2D3A4.
WHITE = rgba("FFEDD2")  # the midsole: the lightest, warmest band
# ★ ROUND 3: AUTHORED WARMER THAN THE CONCEPT, ON PURPOSE. Sampled #F1E4D4 off
# the turnaround, the first board rendered his shoe #AAA49D — the right value
# family and no warmth at all, and only 42.4% of the band classified as the
# concept's cream against 61.8%. This is the finding Junebug's palette block
# records: the board's ramp costs each channel about 0.79 of the authored swatch
# and compresses chroma toward neutral, so a cream that SURVIVES it has to be
# authored with roughly 1.3x the concept's channel spread. FFE9CE is the value
# that was solved for and proved on her board.
# ★ ROUND 14: BRIGHTENED ALL THE WAY TO GREY, CHASING A METRIC THAT COULD NOT
# SEE IT. Rounds 5-8 lifted this swatch step by step because each step moved the
# shoe band's tone SPLIT toward the concept — and a split is a ratio between two
# centroids, which near-white satisfies as happily as cream. The delivered band
# measured 1.36% saturation against the concept's 21.5%, i.e. no cream and no
# navy at all, while both split metrics read "ok". `measure:fidelity` now
# reports chroma as its own number so that cannot happen again.
#
# Back to a cream with chroma in it. FFE9CE is the value solved on Junebug's
# board for exactly this ramp.
SOLE = rgba("F3CE96")  # the collar and the toe mudguard: greyer, deeper
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
    across = max(0.0, 1.0 - (nx / 0.26) ** 2)
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
    # ★ ROUND 20: IT WAS A BEAK, AND THE EXPONENTS SAY WHY.
    #
    # Two independent reviews called the profile nose "a sharp triangular point
    # with a straight underside" against a concept that draws a soft round
    # button with a nostril. Held side by side at 3x, the drawing is right.
    #
    # The cause is in the falloff, not the height. `(1 - t^2) ** 0.55` with an
    # exponent BELOW ONE has an infinite slope at its edges: it is a tent with a
    # rounded cap, not a dome, and it comes to a cusp in profile. And the
    # nostril shelf was a SEPARATE linear tent centred at dz -0.13, where the
    # tip's own falloff has already reached zero — so the nose was two lumps
    # with a notch between them, which is exactly the straight underside the
    # reviews described.
    #
    # One bulb now, with an exponent above one so the surface is a dome, and the
    # underside carried by an ASYMMETRIC vertical falloff rather than a second
    # form: a nose reaches further below its own centre than above it. The peak
    # comes down a little because the concept's is a small button and the old
    # height was solved against a shape that was throwing most of it into a
    # point.
    reach = 0.150 if dz >= 0.0 else 0.156
    t = dz / reach
    tip = 0.084 * across ** 1.10 * max(0.0, 1.0 - t * t) ** 1.30
    return bridge + tip


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


# ★ THE WIDTH COLUMN IS TRACED OFF THE CONCEPT NOW, AND FOR SEVENTEEN ROUNDS IT
# WAS NOT. This is the table the whole provenance gate was built around; the
# story is in scripts/v2/sculpt-provenance.lint.test.js and it is short: eight
# independent reviews called this silhouette "a cone of revolution", "a
# lampshade", "the bulk is gone" and "stick limbs", every round converted that
# prose into a nudge, and nobody ever took the measurement those four phrases
# were all describing.
#
# not-traceable: his torso width cannot be read from the front silhouette. The
# concept draws his arms resting against his body in all five views, so every
# row of every view has a run count of 1 from crown to ankle and a centre run
# is arm-plus-torso. Junebug's table cites "once the arms have separated from
# the torso at y=520", which is a trace her sheet allows and his does not.
#
# So the width is traced by GARMENT COLOUR instead. Between z 1.87 and z 2.11
# his sleeves have ended and his arms are bare skin lying ON the tee, which
# splits the purple into three runs and leaves the tee's own outer edge
# readable. Scanning for the tee's purple (sampled rgb(103,68,127)) across the
# front figure:
#
#   z 2.67  0.551      z 2.19  0.822
#   z 2.51  0.656      z 2.03  0.892
#   z 2.35  0.743      z 1.95  0.910   <- widest
#   z 1.87  0.869
#
# ⚠️ AND ONLY THE 1.87-2.11 BAND IS THE TORSO ALONE. Above it the short sleeve
# is inside the same silhouette, so a reading there is body-plus-sleeve and must
# not be authored as a torso ring; below it his hands hide the tee's edges. The
# shoulder rings are therefore left where they were — measured against the
# silhouette they were already right, and it is the BELLY that was wrong.
#
# The old table ran 0.556 at the yoke to 0.574 at the belly: a garment that
# barely flares at all, against a concept that goes 0.55 to 0.91. That is the
# entire missing read.
#
# ★ AND THE HEM TUCK BELOW z 1.87 IS TRACED TOO — I WAS WRONG THAT IT COULD NOT
# BE. The first cut called this region untraceable because his hands hide the
# tee's edges, extrapolated it flat, and shipped a keg. The second cut guessed a
# taper. Both were unnecessary: his forearms are BARE SKIN below the sleeve, and
# skin against purple is a colour boundary like any other, so the tee's own edge
# is readable right up to where the arm crosses it.
#
# Scanning the front figure for the tee's purple and his bare arm's skin
# separately, the concept holds (all in ft from the centreline):
#
#   z 1.82   tee 0.781   arm inner 0.822   arm centre 0.854
#   z 1.70   tee 0.612   arm inner 0.665   arm centre 0.784
#   z 1.58   tee 0.624   arm inner 0.682   arm centre 0.793
#   z 1.46   tee 0.618   arm inner 0.641   arm centre 0.778
#
# So the tee narrows HARD below the belly — 0.869 at z 1.87 to about 0.62 by
# z 1.70 — and the arm hangs immediately outboard of it with barely any gap.
# The second cut had 0.780 at z 1.480 against a traced 0.62: a quarter of a foot
# too wide on each side, which is what buried the arms inside the garment in
# every arms-down clip while the bind-pose board stayed green.
# measured: front z=1.480 runs=1
#
# The depth column was already close and is now cited rather than guessed.
# measured: view2 z=1.240 halfWidth=0.5910
# measured: view2 z=1.720 halfWidth=0.5473
# measured: view2 z=1.960 halfWidth=0.5153
# measured: view2 z=2.400 halfWidth=0.4250
# measured: front z=1.960 runs=1
TORSO_LEVELS = [
    # ★ THE HEM IS A BAND WITH THICKNESS, and the review named its absence: the
    # torso "widens monotonically with no hem step — a lampshade, not a tee".
    # Four rings buy an underside, a proud band and the body above it.
    # The hem sits at z 1.108, which is where the centre column changes from
    # the tee's purple to the shorts' near-black.
    (1.070, 0.610, 0.470, "Hips"),    # hem underside
    (1.096, 0.660, 0.500, "Hips"),    # hem band, proud
    (1.130, 0.640, 0.560, "Hips"),
    (1.240, 0.650, 0.591, "Hips"),    # deepest point, traced
    # ★ THE PROFILE IS A TAPER, AND THAT ONE IS CORRECT. Three reviews called
    # the side view a cone and asked for a belly that bulges. Traced, the
    # concept's own profile runs 0.591 at z 1.24 down to 0.425 at z 2.40 — it
    # narrows upward monotonically, because his mass is low and his tee is
    # oversized. The side view was never the defect; the FRONT was.
    (1.480, 0.660, 0.576, "Hips"),
    (1.720, 0.680, 0.547, "Spine"),
    (1.960, 0.880, 0.515, "Spine"),   # widest: traced 0.910, shipped a touch under
    # ⚠️ AND THE CHEST HAS TO LEAVE ROOM FOR THE SLEEVE, which round 15 took
    # back without noticing. Narrowing the lower torso to the trace was right,
    # but these two rings stayed where they were, and the sleeve descends
    # THROUGH them when the arm drops. Worked out against the arm at its 40
    # degrees of abduction, the sleeve's outer surface cleared the tee by 0.003
    # to 0.041ft — technically outside it, and one to five pixels of purple at
    # render scale. A review read the result as "no sleeve at all, a purple
    # spur at the shoulder", which is exactly what a grazing surface looks like.
    #
    # The traced 0.822 at z 2.19 is the tee's OUTER silhouette and it includes
    # the sleeve, so the BODY has to sit inside it by the sleeve's own
    # thickness. At 0.720 the sleeve stands 0.06-0.10ft proud and reads as a
    # sleeve.
    (2.200, 0.720, 0.475, "Spine1"),
    (2.400, 0.615, 0.425, "Spine1"),
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
    # ★ AND THE COLLAR HAS TO WRAP THE NECK IN BOTH AXES, WHICH IS WHY THIS
    # FAILED TWICE.
    #
    # The first repair narrowed the neck in X and declared the crossing solved.
    # It was solved in X. These rings are ELLIPSES, and in Y the neck ran
    # 0.226 -> 0.223 against a collar of 0.258, 0.212, 0.228, 0.198 — inside,
    # outside, inside, outside across four heights. Four sign changes are four
    # intersection curves, and a front-facing camera sees them as a skin-coloured
    # island fully enclosed by purple on the chest. An independent review found
    # exactly that, measured it at rows 249-258 of the bind front, and named the
    # axis.
    #
    # ⚠️ The neck's own depth is NOT the thing to shrink: the concept's profile
    # gives a neck half-depth of ~0.227 at this height, which is what it already
    # has. The collar is what was too shallow, so the collar is what moves.
    (2.790, 0.262, 0.252, "Spine2"),
    (2.822, 0.278, 0.262, "Spine2"),  # collar rib, proud
    (2.848, 0.244, 0.242, "Spine2"),  # neck hole
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
# The neck's own ring, above the collar. The concept's silhouette at z 2.880 is
# the neck plus the jaw behind it, so this table ships narrower than the trace
# on purpose — a neck as wide as the reading would leave the chin nowhere to sit,
# which is the rule Junebug's script records at her own neck.
# measured: front z=2.880 halfWidth=0.2711
# ★ THE NECK MUST STAY INSIDE THE COLLAR ALL THE WAY UP, OR THE TWO CROSS.
#
# An independent review found "purple collar shards poking through the neck skin
# on both sides", and the tables say why. The collar rib is 0.278 at z 2.822 and
# its neck hole 0.244 at z 2.848; the neck was 0.267 and 0.263 across the same
# span. So the collar starts OUTSIDE the neck and ends INSIDE it, and two
# surfaces that swap sides have to intersect somewhere between — the shards are
# that intersection curve, seen edge-on.
#
# It is not a hole and no amount of smoothing fixes it. The neck is now narrower
# than the collar's hole at every height they share, so they never cross, and it
# also takes the neck's own thickness down toward the concept's — the same
# review measured this one 18% thicker than the drawing.
NECK_LEVELS = [
    # Snug inside the hole rather than merely clear of it: at 0.236 the neck sat
    # 0.010 inside a 0.244 collar hole and the daylight between them read as a
    # slot. 0.004 closes it visually and still never crosses.
    (2.760, 0.242, 0.226, "Spine2"),
    (2.880, 0.238, 0.222, "Neck"),
    (2.980, 0.228, 0.212, "Neck"),
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


# How much of each inboard arm ring belongs to the TORSO bone. Falls to zero by
# the time the sleeve clears the body, so nothing outboard of the joint is
# affected and the hand is untouched.
SHOULDER_BLEND = {
    0.215: 0.86,
    0.298: 0.58,
    0.330: 0.34,
    0.400: 0.12,
}


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
        # ★ THE DELTOID. Seven reviews called this corner butt-joined: the
        # sleeve met the torso at a hard crease and the arm stepped out of it
        # NARROWER with a dark ring, so there was never a shoulder mass at all.
        # A ring that swells proud of both the torso and the sleeve below it is
        # what rubric 3.11 means by "the shoulder stays a round deltoid form".
        #
        # ⚠️ AND WHEN IT WAS ADDED IT WENT IN OUT OF ORDER, WHICH IS WHY THE
        # SHOULDER READ AS A SOCKET. The table ran x = 0.215, 0.330, 0.298,
        # 0.400: the deltoid ring sat AFTER a station further out, so the quad
        # strip travelled outward, folded back 0.032ft, and travelled out again.
        # A surface that doubles over itself renders as a hard annulus with a
        # dark centre — which three independent reviews then described as a
        # bored socket, a bullseye and a doorknob on his chest, and which one
        # measured as an "open interior" at 47% of the profile torso depth.
        #
        # It is the same class as the leg table's non-monotonic z, recorded
        # further down this file: `grid` stitches rows in the order it is given
        # them and cannot know that one of them belongs earlier.
        (0.298, 0.292, SHIRT, "Arm"),   # deltoid peak
        (0.330, 0.288, SHIRT, "Arm"),
        (ARM_SHOULDER_X, 0.262, SHIRT, "Arm"),
        (0.560, 0.216, SHIRT, "Arm"),
        # ★ THE CUFF IS A STEP AND A BAND. Rubric 3.4 asks for garments that read
        # as CONSTRUCTED, and the independent review scored this a 1 with "no
        # folded sleeve cuff" named first. A colour change alone is a printed
        # stripe; a cuff is thicker than the sleeve above it and than the arm
        # below, so it takes three rings — swell, band, and the arm emerging.
        # ⚠️ THE CUFF ENDED IN A SPIKE, and an independent review found it on
        # both sides at once — the tell that it is a table, not a stray vertex.
        # The garment dropped 0.190 to 0.130 across 0.014ft of limb, a 4:1
        # slope, so the sleeve's edge rendered as a hard point rather than a
        # hem with an underside. A cuff needs the same three rings the tee hem
        # and the shorts hem already have: the band, its underside, and the arm
        # emerging from it.
        (SLEEVE_HEM_X - 0.030, 0.188, SHIRT, "Arm"),
        (SLEEVE_HEM_X, 0.198, SHIRT_DARK, "Arm"),          # cuff band, proud
        (SLEEVE_HEM_X + 0.026, 0.192, SHIRT_DARK, "Arm"),
        (SLEEVE_HEM_X + 0.042, 0.170, SHIRT_DARK, "Arm"),  # the cuff's underside
        (SLEEVE_HEM_X + 0.058, 0.132, SKIN, "ForeArm"),
        # ★ AND AN ELBOW, so the limb is two tapers with a break rather than
        # one dead-straight cone from sleeve to fist — which is what every run
        # and swing still has shown for seven rounds.
        (0.868, 0.124, SKIN, "ForeArm"),
        (ARM_ELBOW_X - 0.028, 0.134, SKIN, "ForeArm"),
        (ARM_ELBOW_X, 0.140, SKIN, "ForeArm"),
        (ARM_ELBOW_X + 0.030, 0.130, SKIN, "ForeArm"),
        (1.080, 0.114, SKIN, "ForeArm"),
        (1.240, 0.104, SKIN, "ForeArm"),
        (ARM_WRIST_X, 0.098, SKIN, "Hand"),
        # ★ THE HAND IS PART OF THE ARM, NOT A BALL RESTING ON IT.
        #
        # It was a separate ellipsoid centred past the wrist, and it TOUCHED the
        # forearm over eight scanlines of a thirty-pixel wrist — a tangency, not
        # a weld. Rotate forty degrees and the studio background shows straight
        # through the join (#595959 against a #575757 backdrop, both arms), which
        # fails 3.7 outright and is the defect most visible at hero scale. It
        # also fails 3.11: a flat-capped cylinder with a ball beside it is the
        # "stiff hinged cylinder" that item names.
        #
        # Continuing the same station list through the wrist into a mitten makes
        # it one surface, so there is no join to open. The palm swells, the
        # knuckle line is the widest ring, and the tip closes.
        # ★ AND IT WAS HALF ITS OWN LENGTH, THE SAME MEASUREMENT JUNEBUG RECORDS.
        # Her script solves it from the concept AND from anatomy: a child's hand
        # runs about 10.6% of standing height from the wrist. On a 4ft rig with
        # the wrist at 1.365 that puts the fingertip at 1.789, and this ended at
        # 1.664 — 30% short, which is why three reviews read "undifferentiated
        # mitten" where hers reads as a hand.
        #
        # The palm carries the first third and the FINGERS carry the rest. Three
        # rings instead of five, because the digits below now do the work the
        # extra rings were failing to do, and they pay for them.
        (1.430, 0.116, SKIN, "Hand"),
        (1.500, 0.134, SKIN, "Hand"),   # knuckle line, the widest ring
        (1.556, 0.118, SKIN, "Hand"),
    ]
    if detail < 1:
        stations = [station for index, station in enumerate(stations) if index % 2 == 0 or index == len(stations) - 1]
    rows: list[list[int]] = []
    for x, radius, colour, bone in stations:
        bone_name = limb_bone(bone, side)
        # ★ THE SHOULDER RINGS ARE SHARED WITH THE TORSO, AND THAT IS THE WHOLE
        # FIX FOR THE CRUMPLE.
        #
        # Eleven reviews described this corner as butt-joined, bored, bullseyed,
        # gashed and — once the A-pose board existed to show it under rotation —
        # "a crumpled accordion of hard-creased shards". Rings, deltoid balls and
        # station reordering all failed on it, because none of them touched the
        # cause: every ring of this arm was weighted 100% to the Arm bone,
        # INCLUDING the ones buried inside the torso. Rotate the arm and those
        # rings rotate with it, out of a shell that does not follow. There is no
        # geometry spanning the joint, so the deltoid cannot round — it can only
        # tear.
        #
        # Weight is the thing that spans a joint, not more polygons. The rings
        # inboard of the shoulder now blend from mostly-Spine2 to all-Arm across
        # the joint, which is ordinary skinning falloff and what makes a shoulder
        # deform as one surface.
        blend = SHOULDER_BLEND.get(round(x, 3))
        weight = bone_name if blend is None else {"Spine2": blend, bone_name: 1.0 - blend}
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            # Rings in the YZ plane, because the limb's axis is X.
            row.append(
                builder.vertex(
                    (x * side, radius * sin(theta), ARM_Z + radius * cos(theta) * 0.94),
                    colour,
                    weight,
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
    cap = builder.vertex(
        (0.170 * side, 0.0, ARM_Z), SHIRT,
        {"Spine2": 0.94, shoulder_bone: 0.06},   # buried in the chest: it follows the body
        (0.75, 0.25),
    )
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (cap, rows[0][nxt], rows[0][index]) if side > 0 else (cap, rows[0][index], rows[0][nxt])
        builder.face(face, 1)

    # ★ A BALL AT THE JOINT WAS THE WRONG FIX, AND THE RIGHT ONE COST NOTHING.
    #
    # A sphere centred on the joint and weighted to the arm bone does fill the
    # notch that opens when the arm rotates — it was here for two rounds and it
    # worked. But it is a second surface laid over a bad join, and it showed:
    # the next review read it in profile as "a sunken oval plate pressed into
    # the shirt — a badge or a dent", and it cost 380 triangles out of a 7000
    # budget that the hand needed.
    #
    # The notch was never a geometry shortage. It was a WEIGHT problem, fixed
    # above in SHOULDER_BLEND: the rings inboard of the joint belonged entirely
    # to the arm, so they rotated out of a torso that stayed put. Once they share
    # the torso bone there is nothing to fill, and both A-pose views came out
    # smoother WITHOUT the ball than with it.
    #
    # The tip closes the mitten. The wrist no longer needs a cap because the
    # tube never ends there any more.
    # ★ THIS FAN WAS WOUND INWARD, AND IT IS THE HOLE THREE REVIEWS ARGUED ABOUT.
    #
    # The predicate was the SHOULDER cap's, copied to the hand. The two caps
    # close opposite ends of the same tube, so they cannot share a rule: the
    # shoulder cap's outward direction is -x on the right arm and the hand
    # cap's is +x. Measured on the shipped GLB, every one of the 14 fan
    # triangles at the +x apex had a geometric normal of (-1, 0, 0) and the
    # authored NORMAL agreed, on all three LODs and both arms.
    #
    # glTF materials are single-sided, so those triangles are discarded and a
    # ray down the arm's axis passes through the hand and lands on the tee. The
    # bind profile shows it as a skin annulus round a cloth centre, and both
    # `swing_contact` and `run` show the arm ending in an open cavity with a lit
    # inner wall, at hero scale, in the clips the game plays most.
    #
    # ⚠️ AND I ARGUED IT WAS NOT A HOLE, WITH THE WRONG INSTRUMENT. I sampled
    # ALPHA across the shoulder window, got 0 pixels under 250, and concluded
    # the dark disc was shadow. Alpha can only ever find a hole in the OUTER
    # silhouette; the torso sits behind the arm at every one of those pixels, so
    # an interior hole is invisible to that test by construction. The reviewer
    # who reproduced my numbers exactly and then showed they proved nothing was
    # right, and `scripts/v2/capwinding.lint.test.js` now checks the geometry
    # rather than the picture.
    tip = builder.vertex((1.588 * side, 0.0, ARM_Z), SKIN, limb_bone("Hand", side), (0.75, 0.25))
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (tip, rows[-1][nxt], rows[-1][index]) if side > 0 else (tip, rows[-1][index], rows[-1][nxt])
        builder.face(face, 1)

    # ★ FINGERS, NOT TWO BEADS ON A MITTEN. The pair of ellipsoids these replace
    # were a thumb and one knuckle sitting ON the mass rather than leaving it,
    # and every review from the second onward called the result a mitten.
    #
    # Junebug's hand records what makes the difference and it is SPACING, not
    # count: fingers on 0.050 centres under 0.026 radii leave a 0.024ft groove,
    # where her shipped 0.032 centres under 0.029 radii overlapped and fused
    # into one silhouette. Three digits on Tank rather than her four — he is the
    # chunky kid and his hand is shorter and broader — but the groove is hers.
    #
    # ⚠️ THE TRIANGLES ARE BOUGHT, NOT BORROWED. LOD0 had 194 spare against its
    # 7000 and this costs about 320, so it is paid for by the two ellipsoids it
    # replaces and by the two palm rings above.
    if detail >= 1:
        count = 3 if detail >= 2 else 2
        # ⚠️ SIZED AGAINST HIS PALM, NOT COPIED FROM HERS. The first cut used
        # Junebug's 0.026 radii on 0.050 centres and rendered three needles
        # sticking out of a mitt: her palm is a 0.166 x 0.096 ellipsoid and his
        # is a 0.134-radius tube, so the same digit is half the relative width
        # on him. His fingers span the palm — three across 0.27ft of hand — and
        # touch at their centres so the groove comes from the curvature, which
        # is the arrangement her note actually describes.
        offsets = (-0.080, 0.0, 0.080) if count == 3 else (-0.055, 0.055)
        lengths = (0.170, 0.200, 0.178) if count == 3 else (0.186, 0.194)
        for z_offset, length in zip(offsets, lengths):
            root = 1.545
            # The tips settle just forward and below, as a relaxed hand does.
            # A deeper curl folds them inside the palm's own outline, which is
            # how a hand becomes a fist — the trap Junebug's finger note records.
            # ★ FOUR POINTS, BECAUSE THREE ENDS THE FINGER SQUARE. A tube's last
            # width IS its end cap, so a spine that stops at 0.021 renders a
            # blunt slab — which is what the second cut of this shipped. The
            # extra control point near the tip is what rounds it, and it is why
            # Junebug's fingers carry one.
            spine = [
                (root * side, -0.012, ARM_Z + z_offset),
                ((root + length * 0.45) * side, -0.024, ARM_Z + z_offset - 0.006),
                ((root + length * 0.82) * side, -0.035, ARM_Z + z_offset - 0.017),
                ((root + length) * side, -0.041, ARM_Z + z_offset - 0.024),
            ]
            widths = [0.041, 0.039, 0.032, 0.012]
            builder.tube(spine, widths, 0, SKIN, limb_bone("HandIndex1", side), 5)
        # The thumb is the one digit that leaves the mass, and at 40px it is
        # most of what makes a hand read as a hand.
        builder.tube(
            [
                # ⚠️ FORWARD IS -y, AND THE FIRST CUT SENT THE THUMB BACKWARD.
                # It was authored at +0.062 to +0.132 — behind the hand, where
                # the front board cannot see it and no hand has one. Junebug's
                # runs -0.056 to -0.100 for the same digit.
                (1.452 * side, -0.058, ARM_Z - 0.030),
                (1.524 * side, -0.096, ARM_Z - 0.048),
                (1.578 * side, -0.118, ARM_Z - 0.059),
                (1.610 * side, -0.128, ARM_Z - 0.065),
            ],
            [0.042, 0.038, 0.030, 0.012],
            0, SKIN, limb_bone("HandThumb1", side), 5,
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
# ★ MEASURED, AND IT WAS A THIRD OF A FOOT TOO LOW. An independent review found
# "the concept's tall slouched ribbed crew sock reduced to a short grey ankle
# cuff", and the drawing agrees: scanning his front figure row by row, bare skin
# runs z 0.68 down to 0.56 and the cream sock holds z 0.53 to 0.44. His sock top
# is 0.55, not 0.414.
SOCK_TOP_Z = 0.550


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


# ★ HE HAD NO INSEAM, AND THE TWO SHORTS LEGS WERE ONE SOLID MASS.
#
# Each leg is a tube of half-width `radius` centred on `leg_x(z)`, and at EVERY
# garment station the tube crossed the centreline: inner edge -0.043 at the hem,
# -0.069 at z 0.900, -0.050 at the waist. The two legs did not nearly touch —
# they interpenetrated by up to 0.138ft, so the front view showed one black
# block. Measured on the delivered board, the shorts split into two runs on 1.4%
# of their height; the concept splits on 74% of its.
#
# The overlap is the round-13 width fix landing on a circular section. That fix
# was right — the shorts measured 22.5%H against the concept's 30.4-32.6% and
# `bodyType: chunky` has to be IN the silhouette — but a circle wide enough to
# be chunky on the outside is also wide enough to reach past the centreline on
# the inside, and there is nowhere for an inseam to be.
#
# So the section is asymmetric: full `radius` outward, clamped inward. The outer
# extreme stays exactly `leg_x(z) + radius`, so the front-view width round 13
# measured is preserved to the float, and the profile depth is untouched because
# depth rides `sin(theta)`. Baggy shorts pressed together really are D-shaped.
#
# Measured off the concept's front column at 250px/ft (686px over his 2.742ft):
# solid to row 648, a 1-4px slit opening at row 654, 7-10px by rows 684-696, and
# 23px at the hem. Those rows map to z 0.97 down to 0.694, and the slit widens
# faster than linearly, hence the power curve.
INSEAM_TOP_Z = 0.970          # the crotch — above this the legs meet, as drawn
INSEAM_HEM_Z = SHORTS_HEM_Z   # z 0.694
INSEAM_HEM_HALF = 0.046       # half of the concept's 23px hem gap


def inseam_half(z: float) -> float:
    """Half the daylight the concept draws between the shorts legs at height z."""
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 2.2


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
        # ★ THE DEPTH FIX LANDED AND THE WIDTH DID NOT. Round 13 gave the shorts
        # a depth factor and the profile came right (23.5%H against the
        # concept's 22.8%), but the front view still measured 22.5-24.3%H across
        # the pair where the concept runs 30.4-32.6% — about eight points of
        # figure height missing, which is most of what "chunky" looks like from
        # the front. The half-widths grow and the depth factor drops to keep the
        # absolute depth the profile already agreed with.
        # ⚠️ AND THE WIDTH ONLY BELONGS WHERE THE SHORTS ARE SEEN. Widening the
        # whole leg pushed the upper rings THROUGH the tee — the board drew
        # jagged dark spikes along the hem where the two surfaces intersect,
        # which is worse than the narrow shorts were. Above the tee's hem
        # (z 1.07) the shorts are hidden, so they stay inside it there and take
        # their width in the band the concept actually measures.
        (1.600, 0.250, 1.20, PANTS, "UpLeg"),
        (1.360, 0.264, 1.26, PANTS, "UpLeg"),
        (1.100, 0.298, 1.32, PANTS, "UpLeg"),
        (0.900, 0.352, 1.24, PANTS, "UpLeg"),
        # ★ THE SHORTS HEM WAS A CUT EDGE, and the tee already records the fix.
        # One ring stepping 0.332 straight to bare leg at 0.196 is a garment
        # sliced off, not one that ends — an independent review scored 3.4 with
        # "shorts as a featureless black slab with no hem, side seam or leg
        # opening". The tee's own hem note says it in four rings: an underside,
        # a band proud of what is above it, and the body above that. The same
        # three rings buy a leg opening you can see into.
        (0.760, 0.342, 1.16, PANTS, "UpLeg"),
        (0.716, 0.358, 1.13, PANTS_DARK, "Leg"),          # hem band, proud
        (SHORTS_HEM_Z, 0.350, 1.10, PANTS_DARK, "Leg"),   # hem underside, z 0.694
        (0.686, 0.252, 1.02, PANTS_DARK, "Leg"),          # inner lip of the opening
        # The calf carries his weight-read below the hem and measured 0.38ft
        # against the concept's 0.50 — see SHOE_LENGTH_SCALE's note. Grown to
        # the drawing, which also leaves the 0.16ft calf gap 3.12 asks for.
        (0.680, 0.246, 0.98, SKIN, "Leg"),                # bare shin begins
        (0.610, 0.247, 0.96, SKIN, "Leg"),
        (SOCK_TOP_Z + 0.014, 0.244, 0.95, SKIN, "Leg"),   # z 0.564
        (SOCK_TOP_Z, 0.272, 0.95, TEAM_MASK, "Leg"),      # the roll, team accent
        (SOCK_TOP_Z - 0.036, 0.264, 0.95, TEAM_MASK, "Leg"),
        # ★ THE SOCK MUST FIT INSIDE THE SHOE, AND IT NEVER DID.
        #
        # Three rounds went into a topline, a heel counter and a collar rim and
        # none of them read, and the nineteenth review found why in one
        # comparison: the shoe's widest half-section is 0.214 and these rings
        # were 0.248, 0.238 and 0.206. The sock was wider than the shoe at every
        # height they share, so a wedge of it split the upper down the instep in
        # both views — and the collar rim, at 0.138, was buried inside the sock
        # with only its fore and aft lobes escaping as the tan cliff in profile.
        #
        # Not a depth-sort or a surface-height problem, which is how the two
        # previous attempts framed it. A real sock COMPRESSES inside a shoe.
        # The shoe's top is z 0.441, so only the first ring below is still
        # outside it; everything under that is sized against the section at its
        # own height (v 0.90 gives ~0.16, v 0.62 gives ~0.19).
        (SOCK_TOP_Z - 0.070, 0.222, 0.95, SOCK, "Leg"),   # z 0.480, just clear
        (0.400, 0.148, 0.95, SOCK, "Leg"),
        (0.280, 0.138, 0.95, SOCK, "Leg"),
        (0.150, 0.126, 0.95, SOCK, "Foot"),
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
        # The inward reach that leaves the concept's inseam. `min` so a ring
        # already clear of the centreline — every bare-shin and sock ring — is
        # left exactly as it was; only the garment is ever clamped.
        inner_radius = min(radius, leg_x(z) - inseam_half(z))
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            # cos > 0 is the OUTER half for both sides, because the ring is
            # reflected whole (see below), so one predicate serves both legs.
            radius_x = radius if cos(theta) >= 0.0 else inner_radius
            row.append(
                builder.vertex(
                    # ★ THE WHOLE RING IS REFLECTED, not just its centre. Writing
                    # `cx + r*cos(theta)` with `cx = leg_x*side` mirrors where the
                    # leg IS and not which way round it is built, so the far leg
                    # is the near leg translated — the same defect `shoe_place`
                    # had. The board showed it as one shin lit and the other in
                    # shadow at the same height, which three reviews read as a
                    # colour difference between the socks.
                    ((leg_x(z) + radius_x * cos(theta)) * side, radius * sin(theta) * depth, z),
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
# measured: front z=0.150 halfWidth=0.8251
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
    # ★ THE TOPLINE IS NEARLY FLAT, BECAUSE THE SHOE IS A BLOCK. Measured on the
    # concept's profile view, its fore-aft length is the FULL 1.205ft at every
    # row from z 0.26 down to the ground — vertical sides, a tall toe box and a
    # tall heel counter. This table's topline fell away to 0.092 at the toe, so
    # the delivery ramped 0.877 -> 0.984 -> 1.062 -> 1.134 -> 1.205 instead: a
    # tapered wedge, which is why it rendered as a flat cream pancake with a
    # stripe round it however the colour bands were set.
    #
    # ⚠️ Three rounds of moving the navy band could not have fixed that, and two
    # of them made the art worse while chasing the tone split. The band was never
    # the problem; the last's silhouette was.
    # ★ THE TOE IS AT -y, BECAUSE FORWARD IS -y AND THE REST OF HIM KNOWS THAT.
    #
    # This table ran heel-at--y to toe-at-+y for twenty reviews, under a comment
    # asserting exactly that. It is backwards: `sculptlib/head.py` builds the
    # nose at -y and the hands settle forward at -y, and Junebug's own shoe
    # table runs -0.375 to +0.225 — long end at -y. Probed in the shipped GLBs,
    # every character on the roster has the foot's long end on the same side as
    # the nose except this one, which had it 180 degrees opposite, and opposite
    # the ToeBase bone that skins it.
    #
    # It is most of what nineteen reviews described as "a loaf", "a chevron", "a
    # pennant", "converging arrows": the front camera was looking at the HEEL
    # COUNTER, and the toe cap was hidden round the back competing with the
    # collar rim. Nothing gated it — `measure:fidelity` reads widths and tone
    # ratios on the front view, and every one of those is invariant under a yaw
    # flip.
    #
    # ⚠️ It also un-splays him. `shoe_place` rotates by `lx = x_off·cos21 -
    # y·sin21`, so with the toe at +y the rotation carried it toward the
    # centreline — pigeon-toed, not the toe-out the concept draws and this
    # file's own comment claims. Negating y fixes the stance in the same edit.
    (-0.439, 0.070, 0.214, SOLE),
    (-0.388, 0.126, 0.252, SOLE),
    (-0.314, 0.166, 0.276, SOLE),
    (-0.228, 0.190, 0.290, SOLE),
    (-0.131, 0.204, 0.298, SOLE),
    (-0.034, 0.210, 0.302, SOLE),
    (0.057, 0.209, 0.304, SOLE),
    (0.137, 0.196, 0.302, SOLE),
    (0.188, 0.170, 0.292, SOLE),
    (0.239, 0.126, 0.250, SOLE),
]


# ★ THE SECTION IS AUTHORED AS A PROFILE, BECAUSE A BAND NEEDS A VERTEX TO LIVE
# ON — and for six rounds there was no vertex anywhere near where the navy goes.
#
# The section used to be swept by a uniform angle with the sole and the instep
# flattened by |sin|^0.40. That flattening is what a sneaker's cross-section
# wants geometrically, but it does something fatal to the colour: raising a
# sine to a low power pushes samples AWAY from the middle. Enumerated at the
# 14 sides the near LODs used, the vertex heights come out as
#
#   .005 .005 .047 .047 .142 .142 .500 .500 .858 .858 .953 .953 .995 .995
#
# — eight of fourteen above 0.85 or below 0.15, and the whole sidewall between
# them spanned by a single pair. The concept puts the navy quarter at 0.35-0.55
# of shoe height (measured: cool pixels run 42%, 42%, 36% across those rows and
# 0% below 0.33). There is no vertex within 0.20 of that band.
#
# So every round that moved the `sn` window was tuning a threshold against a
# section with nothing in it to select, and the navy could only ever come out as
# whatever slivers happened to touch the boundary — a 14x7px ribbon at 79-85%
# height on the rear half of the last, which is what round 16 shipped and what
# the eighth review measured at 1.14% of the band against the concept's 17.30%.
#
# Authoring the section as an explicit (lateral, height) profile puts vertices
# exactly where the bands change. The rows still carry the colour, so this is
# one stitched surface and not a stack of shells; the band edges are tight pairs
# ~0.028 apart in height rather than coincident rows, because coincident rows
# would be degenerate quads and `validate:models` is right to reject those.
#
# not-traceable: a cross-section is a fore-aft cut and a turnaround has no view
# down the length of the foot. The BAND HEIGHTS in it are traced, off the
# concept's own front figure row by row — cool pixels run 0% below 0.33 of shoe
# height, 42/42/36% across 0.37-0.52, and under 11% above 0.56 — but the lateral
# profile has no view that can give it.
#
# (u across the half-width, v up the shoe, band) for the RIGHT half, bottom to
# top. The left half is this list reflected, so the section is symmetric by
# construction — the same reflect-don't-rotate rule `shoe_place` records.
SHOE_SECTION = [
    # ⚠️ THE BAND WAS TOO NARROW — THE AREA LANDED AND THE PLACEMENT DID NOT.
    # A later review measured cool pixels by height inside the shoe zone: the
    # concept's navy spans 0.25 to 0.72 of shoe height, a quarter panel over the
    # whole upper, against a delivered 0.17 to 0.24 — a stripe just above the
    # sole. The tone-split metric passed the whole time, because it counts how
    # MUCH of each tone is in the band and never where it sits. Boundaries now
    # run 0.225 and 0.690.
    # ★ AND THE STACK WAS INVERTED. Held against the concept's own feet at 8x,
    # his shoe is a thick CREAM MIDSOLE at the bottom and a NAVY UPPER over all
    # the rest of its height, with a cream velcro strap and a cream toe overlay
    # laid on top of the navy. This shipped cream-navy-cream, which makes the
    # navy a stripe between two creams instead of the upper it is.
    #
    # Two earlier attempts missed it from opposite directions: the first put a
    # narrow band at 0.35-0.54 (right area, wrong place) and the second widened
    # it to 0.25-0.69 (right place, twice the area). Neither was the structure.
    # ★ THE NAVY RUNS TO THE TOP OF THE SHOE, AND IT IS TWO BANDS, NOT ONE.
    #
    # Re-measured on the concept's front figure as cool% by row, normalised to
    # figure height: 15 / 42 / 7 / 14 / 10 / 8 / 34 / 36 / 0 across 3-10%. Two
    # navy zones — a quarter panel low and an ANKLE COLLAR high — with the cream
    # toe overlay and strap between them. The delivery ran 17 / 25 / 25 and then
    # 0 at every row above 6%, because this section put a single navy band low
    # and a CREAM collar on top of it.
    #
    # ⚠️ The header above this one asserted the concept was "back under 11% above
    # 0.56 of shoe height". That was mis-measured, and it is what produced the
    # stripe: the navy does not stop, it resumes at the collar. An independent
    # review caught it and the re-measurement agrees.
    #
    # The upper zone sits at 9-10% of figure height, which the shoe could not
    # reach at all — it topped out at 8% — so SHOE_HEIGHT_SCALE goes up with it.
    (0.000, 0.000, "midsole"),   # flat on the ground: a sole, not a tube bottom
    (0.620, 0.004, "midsole"),
    (0.950, 0.050, "midsole"),   # the welt
    (1.000, 0.230, "midsole"),   # the midsole at its widest — the flare
    (0.995, 0.455, "midsole"),   # last cream row — a tall midsole, as drawn
    (0.905, 0.486, "quarter"),   # THE FOXING LINE: the upper steps in 0.090
    (0.890, 0.545, "quarter"),
    (0.878, 0.598, "quarter"),   # the quarter panel ends
    (0.868, 0.632, "collar"),    # cream vamp — the toe overlay and strap sit here
    (0.828, 0.790, "collar"),
    (0.790, 0.850, "collar"),
    (0.746, 0.906, "quarter"),   # the navy ankle collar begins
    (0.600, 0.962, "quarter"),
    (0.000, 1.000, "quarter"),   # instep centre, still the navy collar
]
# ★ THE FAR LODS KEEP BOTH BAND EDGES AND DROP THE SHAPING ROWS BETWEEN THEM.
# The navy is the one change on this shoe that resolves at 40px — the eighth
# review's note is explicit that it is "the one change that WOULD have shown as
# a colour block at field scale" — so decimating it away costs exactly the read
# it exists for. Every entry dropped below is a shaping row; the four rows that
# define where the navy starts and stops are in all three tiers.
SHOE_SECTION_MID = [
    (0.000, 0.000, "midsole"),
    (0.970, 0.070, "midsole"),
    (0.995, 0.455, "midsole"),
    (0.905, 0.486, "quarter"),
    (0.878, 0.598, "quarter"),
    (0.868, 0.632, "collar"),
    (0.792, 0.876, "collar"),
    (0.746, 0.906, "quarter"),
    (0.000, 1.000, "quarter"),
]
# ⚠️ LOD2 IS 1200 TRIANGLES AND THE SHOE PAYS 40 PER RING VERTEX (18 grid quads
# plus 2 end caps, doubled for two feet). The first cut of this section carried
# the 8-entry list at every LOD below 0 and came out at 1290 — the export
# refused it, which is the budget working. Five entries is a ring of eight.
SHOE_SECTION_LOW = [
    (0.000, 0.000, "midsole"),
    (0.995, 0.455, "midsole"),
    (0.905, 0.486, "quarter"),
    (0.878, 0.598, "quarter"),
    (0.000, 1.000, "quarter"),
]


def shoe_ring(detail: int) -> list[tuple[float, float, str]]:
    """The closed section, right half then left half reflected."""
    half = SHOE_SECTION if detail >= 2 else SHOE_SECTION_MID if detail >= 1 else SHOE_SECTION_LOW
    # The two centre entries (u = 0, at the sole and the instep) are shared by
    # both halves, so the reflection skips them and the ring closes cleanly.
    return half + [(-u, v, band) for u, v, band in reversed(half[1:-1])]



# ★ THE SOLE CURVES, WHICH IS WHAT MAKES A PROFILE READ AS A SHOE.
#
# `SHOE_FLOOR` was a single constant, so every station's underside sat on the
# same plane and the side view showed "one smooth khaki loaf" — a slab, in three
# consecutive reviews. A real last lifts at both ends: the toe springs off the
# ground so the shoe can roll, and the heel bevels up behind the strike point.
# Those two curves are most of a shoe's profile silhouette.
#
# Measured off the concept's third view: its sole meets the ground over the
# middle of the last and lifts visibly at the toe. These are fractions of the
# shoe's own height added to the floor, in the last's own (unscaled) y.
def shoe_floor_at(y_unscaled: float) -> float:
    """The underside's height at a station — the toe spring and heel bevel."""
    if y_unscaled <= -0.30:         # the toe springs
        t = (-0.30 - y_unscaled) / 0.14
        return SHOE_FLOOR + 0.052 * min(1.0, t) ** 1.6
    if y_unscaled >= 0.16:          # the heel bevels
        t = (y_unscaled - 0.16) / 0.08
        return SHOE_FLOOR + 0.030 * min(1.0, t) ** 1.5
    return SHOE_FLOOR

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


# ★ THE SHOE AND THE CALF CARRY TANK'S READ, AND THEY WERE HALF SIZE.
#
# Twelve reviews scored his upper body and it is now on-concept; the one metric
# that has stayed red the whole time — ankle daylight — is about his LOWER body,
# and nothing had ever been aimed at it. Measured on his own turnaround with the
# same detector that grades the delivery:
#
#                       concept    shipped
#   calf width (each)    0.50ft     0.38ft
#   shoe width (each)    0.80ft     0.42ft
#   shoe length          1.21ft     0.76ft
#
# ⚠️ AND THE FIX IS MASS, NOT STANCE, WHICH IS THE WHOLE POINT. §6b.4 wants the
# ankles closed (the concept draws them touching — a single silhouette run at
# every row below z 0.66) and rubric 3.12 wants daylight between the calves.
# Narrowing the stance trades one failure for the other, and it is also the
# round-1 mistake this file already records: moving the mesh off its bones to
# make a bind-pose number come out right.
#
# Growing the limbs satisfies both at once, and the arithmetic says so before
# the render does. At the ankle the legs sit at x 0.378, so a 0.80ft shoe
# reaches x -0.022 and the pair closes at the centreline. At the calf (z 0.50)
# the legs are at x 0.330, so a 0.50ft calf leaves a 0.16ft gap. Closed feet,
# open calves, and neither number was tuned to get there.
# ⚠️ AND I DOUBLED THE WIDTH OFF A PROJECTION, WHICH IS THE MISTAKE TO AVOID
# REPEATING. The concept's front view measures 1.60ft across both shoes, and
# halving that to 0.80 per shoe gave a scale of 1.84 and a pair of cream slabs
# the width of his hips. The feet are TURNED OUT 21 degrees, so that lateral
# extent is not the shoe's width — it is `width·cos21 + length·sin21`. With a
# 1.29ft last that solves to a true width of 0.40ft, which is what the shoe
# already had. Only the LENGTH was short, and only the profile view (where the
# same correction gives 1.29 against a shipped 0.76) could say so.
SHOE_LENGTH_SCALE = 1.72
SHOE_WIDTH_SCALE = 1.02
# ⚠️ AND HEIGHT IS THE THIRD ONE, WHICH THE FIRST PASS FORGOT. Scaling a shoe
# in two dimensions and not the third makes it a flat slab, and it also puts the
# navy in the wrong place by construction: the concept's navy reaches z 0.106 of
# figure height (0.424ft) and a shoe topping out at 0.300ft cannot put anything
# there at all, whatever its section says.
SHOE_HEIGHT_SCALE = 1.45



# ★ THE BANDS ARE HORIZONTAL PLANES, NOT SECTION FRACTIONS.
#
# `build_shoe` places a vertex at `z = SHOE_FLOOR + (ztop - SHOE_FLOOR) * v`,
# where `v` is the section parameter and `ztop` is EACH STATION'S OWN height.
# The stations run 0.250 at the heel, 0.304 mid-foot and 0.214 at the toe, so a
# boundary at v 0.906 lands at z 0.276 mid-foot and z 0.194 at the toe — the
# band drops 27% of the shoe's height across the front of the last.
#
# That is why three rounds of moving the bands produced a converging fan rather
# than a panel: an independent review measured the delivered navy against the
# concept row by row and got a Pearson r of 0.11 — the right AREA in no
# relationship to the right PLACE — and read the result as "a pennant, a paper
# fold, a decal".
#
# The section still decides the ring's SHAPE, which is what keeps the band from
# zigzagging around the circumference — the failure the note above records. But
# which band a vertex belongs to is now decided by its absolute height, so the
# boundaries are level along the last, as the concept draws them.
SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

# ⚠️ AND THE BANDS ARE THEIR OWN TABLE NOW, NOT THE SECTION'S `v`. The section
# shapes the RING; these set the colour boundaries. Sharing one set of numbers
# for both meant a band could not be widened without deforming the last, and
# levelling the boundaries then collapsed the navy's area — the toe and heel
# stations are shorter than the mid-foot, so a boundary quoted as a fraction of
# the TALLEST station cuts much lower through them.
#
# Boundaries as a fraction of the shoe's maximum height, bottom-up. Measured
# against the concept's own cool% by row (front 15/42/7/14/10/8/34/36 across
# 3-10% of figure height): a cream midsole, the navy quarter panel, the cream
# vamp where the toe overlay and strap sit, and the navy ankle collar.
# ⚠️ AND THE CREAM VAMP IS A LENGTH FEATURE, NOT A HEIGHT ONE — which the two
# views prove between them. Measured on the concept, the PROFILE holds one tall
# navy band (32/44/42/32/16 across 4-8% of figure height) while the FRONT shows
# two with a gap (42/7/14/10/8 then 34/36). A band cut by height would dip in
# both. The gap is the cream toe overlay and strap, which sit on the FRONT of the
# last and interrupt the quarter panel only where the front camera looks through
# them.
#
# ⚠️ BOTH MECHANISMS WERE TRIED AND NEITHER ALONE SATISFIES BOTH VIEWS, which is
# worth recording so the next attempt starts past it. Height bands alone give
# front r = 0.84 and profile r = -0.20; dropping the vamp band and letting the
# `y` rule carry all the cream gives front 0.23 and profile 0.63; a narrow vamp
# plus the y rule gives 0.48 and 0.01. The height table is kept because it is
# the configuration that satisfies the FRONT — which is the view
# `measure:fidelity` samples and the view the draft card shows — and all nine
# metrics with it.
#
# Matching both views needs the vamp to be a real surface patch keyed on length
# AND height together rather than either separately: a toe overlay and a strap
# that are their own geometry, laid over an unbroken quarter panel. That is the
# next change here, and it is a bigger one than a band table.
SHOE_BANDS = [
    (0.000, "midsole"),
    (0.270, "quarter"),
    (0.640, "collar"),
    (0.800, "quarter"),
]


def shoe_band_at(height_fraction: float) -> str:
    """The band a vertex belongs to, by absolute height up the shoe."""
    name = SHOE_BANDS[0][1]
    for v, band in SHOE_BANDS:
        if height_fraction >= v:
            name = band
        else:
            break
    return name


def shoe_u_at_v(v: float) -> float:
    """The section's lateral offset at a given height, on the right half.

    `SHOE_SECTION`'s `v` rises monotonically from the sole to the instep, so a
    height picks exactly one point on the upper — which is what lets an overlay
    be parameterised in the SHOE's frame rather than borrowed from the ring's
    index order. Three earlier overlay attempts took a slice of the ring and got
    an arc whose extent drifted between stations; this returns a point.
    """
    pts = SHOE_SECTION
    if v <= pts[0][1]:
        return pts[0][0]
    for (u0, v0, _a), (u1, v1, _b) in zip(pts, pts[1:]):
        if v0 <= v <= v1:
            t = 0.0 if v1 == v0 else (v - v0) / (v1 - v0)
            return u0 + (u1 - u0) * t
    return pts[-1][0]


def toe_cap_v_low(y_unscaled: float) -> float:
    """The toe cap's lower edge at a station, in section height.

    Returns 2.0 — covering nothing — behind the cap's back edge. The edge DIPS
    toward the sole as it nears the tip, which is what makes a mudguard wrap the
    toe rather than sit on top of it.
    """
    if y_unscaled > -0.13:
        return 2.0
    frac = min(1.0, max(0.0, (-0.13 - y_unscaled) / 0.31))
    return 0.82 - 0.10 * frac


def heel_counter_v_low(y_unscaled: float) -> float:
    """The heel counter's lower edge, mirroring the toe cap's construction.

    A sneaker's heel counter is a stiffened panel wrapping the back of the last,
    and it is the other half of what makes a profile read as a shoe rather than
    a loaf. Its edge rises toward the back the way the toe cap's dips toward the
    front. Returns 2.0 — covering nothing — ahead of the counter's front edge.
    """
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.60 - 0.22 * frac


def shoe_station_at(y_unscaled: float) -> tuple[float, float]:
    """(half-width, topline height) interpolated between stations."""
    rows = SHOE_STATIONS
    if y_unscaled <= rows[0][0]:
        return rows[0][1], rows[0][2]
    for (y0, h0, z0, _a), (y1, h1, z1, _b) in zip(rows, rows[1:]):
        if y0 <= y_unscaled <= y1:
            t = 0.0 if y1 == y0 else (y_unscaled - y0) / (y1 - y0)
            return h0 + (h1 - h0) * t, z0 + (z1 - z0) * t
    return rows[-1][1], rows[-1][2]

def build_shoe(builder: MeshBuilder, side: int, detail: int) -> None:
    ring = shoe_ring(detail)
    rows: list[list[int]] = []
    bone = limb_bone("ToeBase", side)
    for y, half, ztop, colour in SHOE_STATIONS:
        floor = shoe_floor_at(y)
        y_unscaled = y
        y *= SHOE_LENGTH_SCALE
        half *= SHOE_WIDTH_SCALE
        ztop = SHOE_FLOOR + (ztop - SHOE_FLOOR) * SHOE_HEIGHT_SCALE
        row = []
        for u, v, band_name in ring:
            # The section is authored, not swept — see SHOE_SECTION. It is still
            # flat underneath and domed on top, which is what a sneaker IS and
            # what keeps its largest surfaces facing the key light: an earlier
            # circular section put half the shoe at a grazing angle and only
            # 48.7% of the band in the concept's cream against 61.8%, with the
            # missing share sitting in shadow rather than in another colour.
            # The difference now is that the profile says so directly instead of
            # being coaxed out of an exponent.
            x_off = half * u
            z = floor + (ztop - floor) * v
            # The colour band follows the vertex's real height, not the
            # section's own fraction — see `shoe_band_at`.
            height = (z - SHOE_FLOOR) / (SHOE_TOP_MAX * SHOE_HEIGHT_SCALE - SHOE_FLOOR)
            band_name = shoe_band_at(height)
            # ★ THE SHOE IS HORIZONTAL BANDS, and keying its colour on
            # position ALONG the foot was why it read as a cream lump with blue
            # smears. Held against the concept's own feet at 4x, the structure
            # is a stack seen from any angle: a thick cream midsole, a navy
            # quarter above it, a cream collar above that, and a cream mudguard
            # wrapping the toe. A toe cap keyed on `y` is invisible from the
            # front, which is the angle that matters.
            #
            # Bands are rows of the SAME surface — a separate sole slab would
            # meet the upper on an intersection curve and crease, which is the
            # `grid` rule the whole sculpt is built on.
            # ★ AND THE BAND FOLLOWS THE SECTION, NOT AN ABSOLUTE HEIGHT. A
            # fixed `z` threshold cuts diagonally across a ring whose own z
            # varies with angle, so the navy came out as a thin zigzag chevron
            # instead of a panel. Keyed on the section parameter it lies where
            # the concept draws it: sole underneath, quarter on the flanks,
            # collar over the top, mudguard round the toe.
            #
            # ⚠️ I CLAIMED THIS METRIC PREFERRED A FEATURELESS LUMP. IT DID NOT.
            #
            # After six rounds of the split oscillating between 27% and 62%
            # cream I concluded the metric was blind to construction and wrote
            # that down. The seventh review checked it and disagreed with a
            # better reading: the navy was sitting exactly where the concept
            # puts the CREAM MIDSOLE, so "too much dark" and "the dark is in the
            # wrong place" were the same finding arriving from two directions.
            # The metric was corroborating the eye, not fighting it.
            #
            # The concept's stack, read off its own front figure row by row:
            # cool pixels are 0% below 0.33 of shoe height, 42/42/36% across
            # 0.37-0.52, and back under 11% above 0.56. So a thick cream midsole
            # in the bottom third, the navy quarter directly above it, and a
            # cream collar over the instep — which is what SHOE_SECTION encodes.
            #
            # The band is now chosen by the section entry rather than by a
            # threshold, so the only rule left here is the toe: the concept
            # wraps the front of the last in a cream mudguard, and it interrupts
            # the navy where it does. The stations run heel at -y to toe at +y.
            # The cream toe overlay, and only the front of the last: the
            # threshold is in SCALED feet, so it moves with SHOE_LENGTH_SCALE.
            # ⚠️ AND THE TOE OVERLAY IS BIG. In the concept the navy upper is
            # TALL and then largely covered — a cream toe cap over the whole
            # front half of the last, plus the cream strap. That is why its
            # visible navy measures only ~21% of the band while looking like the
            # main colour of the shoe. Shrinking the panel to hit the number
            # instead would put the navy back in the wrong place, which is the
            # mistake two rounds either side of this one already made.
            # ★ THE TOE OVERLAY AND THE STRAP NEED TO BE GEOMETRY, NOT A COLOUR
            # TEST, AND SIX MEASURED CONFIGURATIONS SAY SO.
            #
            # The two views disagree, and the disagreement IS the structure: the
            # concept's PROFILE holds one tall navy band (32/44/42/32/16 across
            # 4-8% of figure height) while its FRONT shows two with a gap
            # (42/7/14/10/8 then 34/36). The gap is the cream toe cap and strap,
            # which sit on the FRONT of the last. A band cut by HEIGHT dips in
            # both views; a band cut by LENGTH dips in neither; a rule cut by
            # both still cannot, because the flanks and the instep share every
            # (length, height) pair on a closed ring.
            #
            # Row-wise correlation against the concept, front / profile:
            #
            #   height bands 0.27/0.45/0.77      0.84 / -0.20   metrics GREEN
            #   unbroken panel + y > 0.10        0.23 /  0.63   metrics off
            #   bands 0.27/0.48/0.62             0.48 /  0.01   metrics off
            #   unbroken + toe cap + strap       0.33 /  0.27   metrics off
            #   ... with the cap back to y > 0.05  0.33 /  0.41   metrics off
            #   ... with the cap back to y > -0.12 0.31 /  0.58   metrics off
            #
            # The first is kept: it is the only one that satisfies the FRONT —
            # the view measure:fidelity samples and the draft card shows — and
            # the only one holding all nine metrics.
            #
            # What actually closes the profile is a cream toe overlay and a
            # cream strap built as their own PROUD SURFACES over an unbroken
            # navy quarter, so they occlude the panel where they lie and nowhere
            # else. That is the next change here and it is geometry, not a band.
            # ★ THE OVERLAY CUTS THE PANEL, IT DOES NOT SIT BESIDE IT.
            #
            # A band table can only cut the quarter along a horizontal line,
            # and the sweep above traced a frontier of those that never
            # satisfies both views. The concept resolves it differently: its
            # toe cap has a lower edge that DIPS toward the sole as it runs
            # forward, so the panel it interrupts shows a different extent from
            # the front than from the side. That dip is the part every earlier
            # attempt left out.
            #
            # `toe_cap_v_low` IS the cap geometry's own edge, so the paint and
            # the surface agree by construction rather than by two numbers
            # being kept in step by hand.
            if band_name == "quarter" and v >= toe_cap_v_low(y_unscaled):
                band = SOLE                # under the cream toe cap
            elif band_name == "quarter" and -0.30 < y < 0.15 and 0.44 <= height <= 0.54:
                band = SOLE                # under the cream strap
            elif band_name == "quarter":
                band = SHOE                # the navy quarter, unbroken on the flanks
            elif band_name == "midsole":
                band = WHITE
            else:
                band = SOLE                # collar and tongue over the instep
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


    # ★ THE TOE CAP, PARAMETERISED IN THE SHOE'S OWN FRAME.
    #
    # Three earlier attempts built this from a slice of the section's RING, and
    # the arc they got drifted between stations because the ring is an index
    # order, not a coordinate. This walks the cap's own two parameters instead:
    # `p` runs from one flank over the toe to the other, and the cap's LOWER EDGE
    # dips toward the sole as it nears the tip, which is what makes a mudguard
    # wrap rather than sit on top.
    #
    # Every row has the same point count by construction, so the grid cannot
    # stitch across a gap — the failure that made the earlier versions land
    # unevenly under the 21-degree toe-out.
    # ★ AND THE OVERLAY ASKS ITS OWN EDGE FUNCTION WHICH END IT IS ON.
    #
    # This loop used to select stations with `if y_s < 0.13: continue`, a literal
    # that encoded "the toe is at +y". Reversing `SHOE_STATIONS` to put the toe
    # at -y — the fix that finally turned Tank's feet the right way round — moved
    # the toe and left the literal, so the TOE cap was built on the HEEL, on top
    # of the heel counter, and the toe got no cap at all.
    #
    # It did not fail quietly. `toe_cap_v_low` returns a 2.0 sentinel meaning
    # "no cap at this station", so `v = 1 - (1 - v_low) * |p|` ran 1.0 -> 2.0;
    # `shoe_u_at_v` clamps anything past the section's top to the INSTEP CENTRE,
    # where u = 0, so all eleven points collapsed onto one vertical line, and the
    # height reached 0.006 + 0.429 * 2.0 = 0.864 — twice the shoe's own topline.
    # The board showed it as a tan card standing up the shin, and the background
    # visible between that card and the shoe was the 45-pixel hole 3.7 caught.
    #
    # The repair is not a corrected literal — that is the same bug waiting for
    # the next table edit. The edge function already knows which end it serves;
    # both overlays ask it, and the assert makes a sentinel that reaches the loop
    # a build failure instead of a fin.
    if detail >= 1:
        CAP_POINTS = 11
        cap_rows: list[list[int]] = []
        for y_s, half_s, ztop_s, _c in SHOE_STATIONS:
            v_low = toe_cap_v_low(y_s)          # the shared edge — see above
            if v_low > 1.0:                     # this station is behind the cap
                continue
            floor_s = shoe_floor_at(y_s)
            ys = y_s * SHOE_LENGTH_SCALE
            hs = half_s * SHOE_WIDTH_SCALE * 1.028
            zt = SHOE_FLOOR + (ztop_s - SHOE_FLOOR) * SHOE_HEIGHT_SCALE
            row = []
            for j in range(CAP_POINTS):
                pp = -1.0 + 2.0 * j / (CAP_POINTS - 1)
                v = 1.0 - (1.0 - v_low) * abs(pp)
                assert 0.0 <= v <= 1.0, f"toe cap v={v:.3f} off-section at y={y_s}"
                u = shoe_u_at_v(v) * (1.0 if pp >= 0 else -1.0)
                row.append(builder.vertex(
                    shoe_place(side, ys, hs * u, floor_s + (zt - floor_s) * v),
                    SOLE, bone, (0.75, 0.25),
                ))
            cap_rows.append(row)
        if len(cap_rows) >= 2:
            builder.grid(cap_rows, 1, cyclic=False, flip=side > 0)


    # ★ THE HEEL COUNTER, built the same way as the toe cap and for the same
    # reason: the eighteenth review found the sole curved but the UPPER still a
    # slab — "no topline, no collar and no heel counter". A counter is the panel
    # that stiffens the back of a shoe, and in profile it is most of what
    # separates a sneaker from a slipper.
    #
    # It is NAVY rather than cream, which is also the colour the profile is short
    # of: that view measured 11.6% slate against the concept's 24.5%, and the
    # counter puts slate exactly where the concept holds it — on the back of the
    # last, at mid-height.
    if detail >= 1:
        COUNTER_POINTS = 9
        counter_rows: list[list[int]] = []
        for y_s, half_s, ztop_s, _c in SHOE_STATIONS:
            v_low = heel_counter_v_low(y_s)     # asks its edge, not a literal
            if v_low > 1.0:                     # this station is ahead of it
                continue
            floor_s = shoe_floor_at(y_s)
            ys = y_s * SHOE_LENGTH_SCALE
            hs = half_s * SHOE_WIDTH_SCALE * 1.026
            zt = SHOE_FLOOR + (ztop_s - SHOE_FLOOR) * SHOE_HEIGHT_SCALE
            row = []
            for j in range(COUNTER_POINTS):
                pp = -1.0 + 2.0 * j / (COUNTER_POINTS - 1)
                v = 1.0 - (1.0 - v_low) * abs(pp)
                assert 0.0 <= v <= 1.0, f"heel counter v={v:.3f} off-section at y={y_s}"
                u = shoe_u_at_v(v) * (1.0 if pp >= 0 else -1.0)
                row.append(builder.vertex(
                    shoe_place(side, ys, hs * u, floor_s + (zt - floor_s) * v),
                    SHOE, bone, (0.75, 0.25),
                ))
            counter_rows.append(row)
        if len(counter_rows) >= 2:
            builder.grid(counter_rows, 1, cyclic=False, flip=side > 0)


    # ★ THE COLLAR RIM. Three reviews have asked for a topline and none of the
    # proud panels answered it, because the section CLOSES at the instep centre
    # — the shoe has no ankle opening for a collar to rim, and the sock simply
    # passes through a closed dome.
    #
    # Opening the section is a topology change to a grid that the whole shoe is
    # built on. A rim is not: it is its own closed loop around where the sock
    # enters, an ellipse in the last's own (length, width) plane sitting proud of
    # the dome, with an inner and an outer ring stitched into a band. That is
    # what a collar IS on a real shoe — a bound edge standing off the upper —
    # and it reads as one without disturbing anything under it.
    if detail >= 2:
        RIM_POINTS = 14
        inner_row: list[int] = []
        outer_row: list[int] = []
        for j in range(RIM_POINTS):
            phi = 2.0 * pi * j / RIM_POINTS
            for radial, target in ((0.86, inner_row), (1.04, outer_row)):
                y_r = 0.020 - 0.150 * radial * cos(phi)
                half_r, ztop_r = shoe_station_at(y_r)
                floor_r = shoe_floor_at(y_r)
                zt = SHOE_FLOOR + (ztop_r - SHOE_FLOOR) * SHOE_HEIGHT_SCALE
                x_r = half_r * SHOE_WIDTH_SCALE * 0.62 * radial * sin(phi)
                z_r = floor_r + (zt - floor_r) * 0.965
                target.append(builder.vertex(
                    shoe_place(side, y_r * SHOE_LENGTH_SCALE, x_r, z_r),
                    SOLE, bone, (0.75, 0.25),
                ))
        builder.grid([inner_row, outer_row], 1, flip=side > 0)

    # Cap both ends so the upper is closed — rubric 3.7 is binary about holes.
    heel = builder.vertex(shoe_place(side, 0.286 * SHOE_LENGTH_SCALE, 0.0, 0.126 + 0.030), SHOE, bone, (0.75, 0.25))
    toe = builder.vertex(shoe_place(side, -0.470 * SHOE_LENGTH_SCALE, 0.0, 0.050 + 0.052), SOLE, bone, (0.75, 0.25))
    for index in range(len(ring)):
        nxt = (index + 1) % len(ring)
        a = (heel, rows[0][nxt], rows[0][index])
        b = (toe, rows[-1][index], rows[-1][nxt])
        builder.face(a if side < 0 else (a[0], a[2], a[1]), 1)
        builder.face(b if side < 0 else (b[0], b[2], b[1]), 1)

    # Three lace straps lying ON the vamp, which is what the concept draws —
    # not pegs standing proud of it, the defect Junebug's round-5 board scored.
    if detail >= 2:
        # ★ THE STRAP IS A SURFACE, NOT TUBES. Two reviews running described it
        # as "converging chevrons over the slate — a paper fold, not a
        # fastening", and a tube laid along the vamp's curve is exactly that
        # seen head-on: two lines that meet, with no width between them.
        #
        # A velcro strap is a flat band lying ACROSS the instep. Built as two
        # rows on the shoe's own upper arc, 3% proud so it occludes the panel
        # under it, it has an area rather than an outline — which is the whole
        # difference at board resolution.
        arc = [(u, v) for u, v, _b in ring if v >= 0.52]
        if len(arc) >= 3:
            strap: list[list[int]] = []
            for y_s, half_s, ztop_s, _c in SHOE_STATIONS:
                if not (-0.20 < y_s < 0.02):
                    continue
                floor_s = shoe_floor_at(y_s)
                ys = y_s * SHOE_LENGTH_SCALE
                hs = half_s * SHOE_WIDTH_SCALE * 1.030
                zt = SHOE_FLOOR + (ztop_s - SHOE_FLOOR) * SHOE_HEIGHT_SCALE
                row = [
                    builder.vertex(
                        shoe_place(side, ys, hs * u, floor_s + (zt - floor_s) * v),
                        SOLE, bone, (0.75, 0.25),
                    )
                    for u, v in arc
                ]
                strap.append(row)
            if len(strap) >= 2:
                builder.grid(strap, 1, cyclic=False, flip=side > 0)

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
