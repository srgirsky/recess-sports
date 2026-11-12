"""Rebuild Greta as a reference-authored character on the canonical rig.

Run from the repository root:
  blender --background assets/v2/source/greta-pilot.blend \
    --python scripts/v2/blender/sculpt-greta-source.py

★ GRETA TOOK THE `grizz` SLOT IN THE WORLD 1 RE-CAST (November 2026), and
this is the first sculpt made against a re-cast kid's own sheet. The id is the
slot — model filename, registry key, pick-tally key — so everything here still
answers to `grizz`; the character is Greta Lindqvist, "built like a door".

Her read is three stacked blocks: a blonde side-swept bob with both ears
standing clear of it, a wide acorn-brown tee over a low round belly, and short
navy shorts with cream piping over thick bare legs into chunky cream
sneakers. No socks show; the team accent is the shorts' hem piping.

The conversion: her front figure runs 674px over the rig's 4.0ft (rows
180-854), so 1px = 0.005926ft about a centre column of x 175. The profile
figure is 671px (rows 183-854), 1px = 0.005952ft.

⚠️ THE PROFILE FIGURE FACES +X ON THE SHEET (Grizz's lesson, checked again
here: the nose is the RIGHT edge, x 802 at z 3.30). The rig's forward is -y,
so profile +x maps to -y. The depth axis is taken at image x 716 — the skull's
own midpoint (face plane 787, cranium 640 under the hair) and within 10px of
the leg centres (706 at z 0.90).

★ HER SHEET HOLDS HAIR AND SKIN IN ONE TONE, AND THE SPEC SAYS SO.
`scripts/v2/turnaround-specs/greta.spec.json` refuses `skin` and `hair`
together (the blonde and the fair skin share the #faa364 cluster — blonde
legally passes the skin test, Clover's lesson) and refuses the mouth. Every
hair/skin boundary below is a GEOMETRY trace off an enlarged crop, and the
feature rows are bounded traces, recorded where they are used.
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
from sculptlib.leg import LegSpec, build_leg, leg_x
from sculptlib.mesh import MeshBuilder, thin_for_lod
from sculptlib.palette import Palette
from sculptlib.rig import ARM_ELBOW_X, LEG_ANKLE_Z, hem_follows_thighs, limb_bone
from sculptlib.shoe import ShoeSpec, build_shoe

REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/greta-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/greta-face-atlas.png"
REVISION = "greta-turnaround-fidelity-v1"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The palette, sampled off greta-turnaround.png as window means -------------
#
#   cheek (x125-140, y300-312)    #FD9C61     forehead (y228-240)   #FDBC89
#   leg (y690-720)                #F79F60     forearm (y500-520)    #FCA96D
#   hair lit (y205-215)           #E6A562     hair shade (y320-332) #844C1F
#   tee (y430-470 centre)         #974923     tee fold shade        #7E3A19
#   shorts (y580-600)             #2A2A35     sneaker (y820-835)    #F9E0C3
#
# Creams and navy are authored ≈ delivered·1.2 (the board's ramp). The TEE is
# not: the first build authored it at ·1.2 (#B5582A) and the board delivered a
# terracotta orange a full step lighter than the drawing's acorn brown —
# Grizz's round-9 finding again, a mid-value warm colour beside skin needs its
# value held DOWN to stay a different thing from the arm next to it. Two more
# exceptions the roster already paid for:
#   * SKIN is chroma-authored (Noodle): r is at the FF ceiling already, so the
#     lift goes into keeping g-b spread, and saturation stays well above the
#     0.24 the toon highlight needs to keep passing the skin test (Clover).
#   * HAIR is authored YELLOW, r close to g (Lefty): her sheet's lit blonde
#     (#E6A562) is an orange a toon ramp folds straight into the skin family,
#     and with ears and cheeks beside it the bob would read as a bald dome.
SKIN = rgba("FFAE72")
SKIN_SHADOW = rgba("CC7A3F")
HAIR = rgba("E2B24E")
HAIR_DARK = rgba("B4862E")   # the combed creases and the underside of the bob
SHIRT = rgba("8C4520")       # acorn brown, held at the sampled #974923's value
SHIRT_DARK = rgba("6C3315")  # the collar rib and the sleeve hem
PANTS = rgba("32323F")       # navy, ·1.2 of #2A2A35
PANTS_DARK = rgba("22222C")
SOCK = rgba("FFF3E2")        # never visible: the ankle inside the shoe collar
# ★ THE SHOE BAND IS TWO TONES ON THE SHEET, AND THE SECOND IS A TAN.
# `measure:fidelity` reads the bottom 9% of her figure as cream #FAE2C4 (69%)
# and tan #C49A6D (30%) at a mean saturation of 30 — the tan is the gum
# cupsole and the shadow under the vamp. The first build's three near-equal
# creams delivered 100% / 0% at saturation 13. The cupsole is authored as that
# tan and the upper as a warmer cream (Dazzle's two-tone sole).
SHOE = rgba("FFDFB2")        # the cream upper
WHITE = rgba("D29A5E")       # the gum cupsole — the band's second tone
SOLE = rgba("F4DAB2")        # toe bumper, collar and laces: a step deeper
# The drafting team's colour lands on the shorts' hem piping — one thin proud
# ring per leg, the smallest trim surface on her kit (batch 6: the runtime
# tints the whole slot). Cream-adjacent so the untinted board reads as the
# sheet's own cream piping.
TEAM_MASK = rgba("D8D2C6")

PALETTE = Palette(
    skin=SKIN, skin_shadow=SKIN_SHADOW, hair=HAIR,
    shirt=SHIRT, shirt_dark=SHIRT_DARK,
    pants=PANTS, pants_dark=PANTS_DARK,
    shoe=SHOE, sock=SOCK, white=WHITE, sole=SOLE, team_mask=TEAM_MASK,
)


# --- The skull -----------------------------------------------------------------
#
# Bounded traces on an enlarged crop of the front view (x 30-320, y 170-430):
#
#   hair crown           row 181  z 3.985     hairline at the part  row 218  z 3.770
#   brow arcs, centre    row 251  z 3.572     eyes, centre          row 281  z 3.395
#   nose button, centre  row 301  z 3.276     the closed smile      row 321  z 3.160
#   chin                 row 356  z 2.954     collar top (centre)   row 370  z 2.868
#   face at the eye row  0.354 half           cheeks, widest        0.371 half at z 3.20
#   jaw at z 3.05        0.284 half           ear outer span        0.988ft (0.494 half)
#
# The skull is fitted to that face: centre z 3.38 puts the eye row at the
# equator, rz 0.44 puts the chin at 2.94, and the cranium tops out at 3.82
# under 0.16ft of bob — the hair has real volume at the crown, which is what
# the profile shows. Depth from the profile: the face plane at x 787
# (y -0.42) and the cranium's back at about y +0.46.
HEAD_CENTER = (0.0, -0.020, 3.380)
HEAD_RADII = (0.360, 0.480, 0.440)

# ★ A SQUARE JAW IS THE FACE'S READ. The bare ellipsoid sheds width as soon as
# it passes the eyes; she holds 0.371 at the cheeks (nz -0.41, where the
# ellipsoid gives 0.328) and still 0.284 at z 3.05 (nz -0.75, ellipsoid 0.238).
FACE_SCALE = (
    (1.00, 1.00),
    (0.30, 1.00),
    (0.00, 1.00),
    (-0.20, 1.05),
    (-0.41, 1.13),
    (-0.60, 1.18),
    (-0.75, 1.19),
    (-0.90, 1.10),
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
    """Big round eyes in a flat calm face — a shallow dish at the eye row
    (z 3.395, nz +0.034); the atlas carries the rest."""
    dz = nz - 0.034
    dx = abs(nx) - 0.500
    radial = (dx * dx) / 0.075 + (dz * dz) / 0.040
    if radial >= 1.0:
        return 0.0
    return 0.012 * (1.0 - radial) ** 1.3


def nose_push(nx: float, nz: float) -> float:
    """A round button at row 301 (z 3.276, nz -0.236). On the profile the tip
    stands 15px (0.09ft) proud of the cheek plane."""
    if abs(nx) > 0.20:
        return 0.0
    dz = nz + 0.236
    if dz < -0.13 or dz > 0.14:
        return 0.0
    # ★ A BUTTON, NOT A CONE. The first build's 0.090 tip on a narrow 1.35
    # falloff came to a point the critic read as "a sharp cone angled down".
    # Lower, and with a flat-topped falloff (exponent under 1) so the tip is a
    # dome.
    across = max(0.0, 1.0 - (nx / 0.20) ** 2)
    bridge = 0.008 * across * max(0.0, 1.0 - abs(dz - 0.07) / 0.10)
    reach = 0.115 if dz >= 0.0 else 0.120
    t = dz / reach
    tip = 0.064 * across ** 0.80 * max(0.0, 1.0 - t * t) ** 0.75
    return bridge + tip


# Both ears stand clear of the bob in every view that shows them — the hair
# is tucked BEHIND them. Front view: ears rows 277-324 (z 3.42-3.14, centre
# 3.28), outer span 167px = 0.988ft against the 0.708ft face at the eye row,
# so each stands ~0.12 proud. Profile: the ear spans x 687-718 about x 702,
# i.e. 0.08ft BEHIND the depth axis. The ear centre is 70.1% down her
# crown-to-neck span. ⚠️ The spec's `earLine` (65.7%) is NOT this: the bob is
# wider than the ears at every row they occupy, so the widest-row detector
# reads the hair's equator. The trace above is bounded by hand on the crop.
EAR_SPEC = EarSpec(center=(0.080, 3.280), radii=(0.105, 0.145))

# ★ THE FACE-ATLAS WINDOW, SOLVED AGAINST HER OWN ROWS. Latitude is asin(nz)
# on this skull: eye z 3.395 → +0.034, mouth z 3.160 → -0.524, brow z 3.572 →
# +0.452. A cell row r samples latitude low + span·(1 - r/128); pinning the eye
# to row 50 and the mouth to row 85 gives span 2.039 and low -1.2085, and the
# brow then lands at row 23.8 (the face spec draws it at 24).
FACE_ISLAND = (0.92, -1.2085, 2.039)

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


# --- The bob -------------------------------------------------------------------
#
# One closed ring loft over the cranium: a full smooth crown, widest at the
# ear rows, undercut to the nape at z 3.05. Each level is (z, half_x, half_y,
# y_centre). half_x is the front silhouette, which at these rows IS the hair;
# half_y and y_centre come from the profile's spans about the x 716 axis
# (back edge y +0.52 at z 3.30-3.50, crown front y -0.40 at z 3.90).
# ⚠️ Depth reach stays under 0.55 at every level: the review render frames the
# model's bounding box, and hair deeper than that backs the camera up and
# rescales every measured ratio (batch 4's ponytail lesson).
# measured: front z=3.95 halfWidth=0.1719 tol=0.04
# measured: front z=3.85 halfWidth=0.3407 tol=0.04
# measured: front z=3.75 halfWidth=0.4178 tol=0.04
# measured: front z=3.65 halfWidth=0.4681 tol=0.04
# measured: front z=3.55 halfWidth=0.5096 tol=0.04
# measured: front z=3.45 halfWidth=0.5363 tol=0.04
# measured: front z=3.35 halfWidth=0.5570 tol=0.04
# measured: front z=3.25 halfWidth=0.5570 tol=0.04
# measured: front z=3.15 halfWidth=0.5007 tol=0.04
CAP_LEVELS = [
    (3.970, 0.120, 0.130, -0.040),
    (3.930, 0.215, 0.270, -0.047),
    (3.850, 0.341, 0.400, -0.035),
    (3.750, 0.418, 0.455, -0.005),
    (3.650, 0.468, 0.480, 0.010),
    (3.550, 0.510, 0.495, 0.025),
    (3.450, 0.536, 0.500, 0.030),
    (3.350, 0.557, 0.495, 0.035),
    (3.250, 0.557, 0.470, 0.050),
    (3.140, 0.505, 0.400, 0.085),
    # The under-curl: three rows turning in to the nape, so the bob's back is
    # a rounded tuck and not a slab with a square bottom (second review).
    # ★ The tuck HUGS the neck. Centred at y 0.13-0.15 its last two rings
    # stopped just short of the nape and enclosed a 12px window of backdrop
    # between jaw, neck and hair in profile (silhouette.lint, budget 8). A
    # pocket is closed by hugging, not shrinking (Lefty): the rings now reach
    # forward into the back of the neck.
    (3.060, 0.452, 0.325, 0.108),
    (3.000, 0.372, 0.262, 0.110),
    (2.965, 0.262, 0.185, 0.095),
]

# The hairline over the face, |x| → the hair's lower edge. Centre part at
# z 3.770; the sweep drops past the temples to the ear tops (z 3.45). The
# sheet sweeps the fringe to her left; the table is MIRRORED on purpose — an
# authored one-sided lock is the exact lean that blew faceAsymmetry on Flash
# and Penny, so the asymmetry is recorded against the fidelity note instead.
# not-traceable: hair and skin are one colour cluster on this sheet (the spec
# refuses both), so the hairline is a by-eye geometry trace off the crop.
FRINGE_TABLE = [
    (0.00, 3.770),
    (0.14, 3.745),
    (0.24, 3.680),
    (0.31, 3.600),
    # ★ ONE DIAGONAL ACROSS THE TEMPLE. Build 2's table fell to the ear top at
    # |x| 0.36 and then ran level, which drew "a level edge, a vertical step
    # and a forward bill" from three-quarter. The sheet's fringe keeps falling
    # across the temple and drapes onto the top of the ear.
    (0.38, 3.530),
    (0.46, 3.470),
    (0.60, 3.420),
]

BOB_BOTTOM = 2.965
# The side part's lateral offset where it meets the hairline ring (crop: the
# part sits 22px left of the face centre on the sheet's front view).
PART_X = 0.130
# The ring whose forward half is bent onto the hairline — a CAP_LEVELS row.
HAIRLINE_RING_Z = 3.650
# Below the hairline the bob lives BEHIND the ears. The ear's back edge on the
# profile is x 687, y +0.17; the hair wall starts just behind it.
BEHIND_EAR_Y = 0.200


def fringe_z_at(x_abs: float) -> float:
    """The hairline's lower edge over the face at lateral offset |x|."""
    table = FRINGE_TABLE
    if x_abs <= table[0][0]:
        return table[0][1]
    for (x0, z0), (x1, z1) in zip(table, table[1:]):
        if x_abs <= x1:
            return z0 + (z1 - z0) * (x_abs - x0) / (x1 - x0)
    return table[-1][1]


def build_bob(builder: MeshBuilder, detail: int) -> None:
    """The ring loft, with the face and both ears folded out of it.

    A forward-half vertex ABOVE the hairline lies on the forehead. One BELOW
    it is pulled back to the plane behind the ears: over the skull that buries
    it, and outboard of the skull it becomes the bob's own front edge — the
    wall of hair the sheet shows standing behind each ear.

    ★ THE HAIRLINE IS ONE RING, BENT ONTO THE LINE. Build 1 decided
    proud-or-buried per vertex, so the visible edge was whichever ring sat
    above the line at each column — rectangular stair-steps, "a helmet with a
    stepped visor" (first independent review). Build 2 slid the first vertex
    below the line up onto it, and columns that disagreed about WHICH ring
    that was drew a sawtooth. Now it is always the same ring: on the forward
    half the HAIRLINE_RING's own z is bent to FRINGE_TABLE, the rings above it
    are re-spaced between the line and the crown, and the rings below are
    re-spaced beneath it and buried. One ring, one smooth edge.
    """
    levels = CAP_LEVELS
    # An ascending table silently builds the loft top-down and inverts every
    # quad's winding — the runtime lights the mass as a slate-grey void.
    assert all(a[0] > b[0] for a, b in zip(levels, levels[1:])), \
        "CAP_LEVELS must be strictly descending in z"
    # 32 columns for 8 combed strand groups — four samples per lobe, the floor
    # at which a crease reads (the Nyquist lesson). EVEN, so every column has
    # a mirror partner and the two fringe edges quantize alike (Dex).
    segments = 32 if detail >= 2 else (12 if detail == 1 else 8)
    use = levels if detail >= 2 else thin_for_lod([(z, hx, hy, yc) for z, hx, hy, yc in levels], detail)
    ascending = list(reversed(use))
    rows = []
    crown_z = ascending[-1][0]
    floor_z = ascending[0][0]
    for z, half_x, half_y, y_centre in ascending:
        # The comb fades out toward the crown: carried to the top ring, eight
        # grooves meeting at one vertex read as a melon.
        comb = 0.020 * min(1.0, max(0.0, (3.86 - z) / 0.22)) if detail >= 2 else 0.0
        ring = []
        for column in range(segments):
            theta = 2 * pi * column / segments
            # Straight combed hair IS vertical strands, so a fixed-theta groove
            # is the right texture here (it is the wrong one for curls). Even
            # about the front (theta = -pi/2), so the mirror holds.
            groove = cos(8.0 * (theta + pi / 2))
            clump = 1.0 + comb * groove
            x = half_x * clump * cos(theta)
            y = y_centre + half_y * clump * sin(theta)
            vz = z
            # The grooves are PAINTED as well as cut: at 0.013 and unpainted
            # they "did not survive runtime shading" (second review) — the toon
            # ramp quantises the relief away, so the crease carries its own
            # darker swatch (the albedo half of the curl lesson; on straight
            # hair a fixed-theta stripe is the right read).
            colour = HAIR_DARK if (comb > 0.006 and groove < -0.55) or z < BOB_BOTTOM + 0.02 else HAIR
            # The side part: one dark line from the crown to the hairline, on
            # her left as drawn. Colour only — the geometry and the hairline
            # stay mirrored, so the face metrics cannot see it.
            if z > 3.70 and y < 0.10 and abs(x - PART_X * (half_x / 0.468)) < 0.5 * (2 * pi * half_x / segments):
                colour = HAIR_DARK
            if y < BEHIND_EAR_Y:
                line = fringe_z_at(abs(x))
                if z >= HAIRLINE_RING_Z - 1e-6:
                    # at or above the hairline ring: re-spaced line → crown
                    t = (z - HAIRLINE_RING_Z) / (crown_z - HAIRLINE_RING_Z)
                    vz = line + t * (crown_z - line)
                    sf = skull_front_y(x, vz)
                    if sf > -9.0:
                        y = max(y, sf - 0.022)   # a thin shell on the forehead, not a visor
                    else:
                        # ★ OUTBOARD OF THE SKULL THERE IS NO FOREHEAD TO LIE
                        # ON, and build 3 left those columns at the ring's own
                        # depth — 0.08ft forward of the brow at each temple,
                        # the "forward bill" three reviews kept describing.
                        # They are held back to the skull's flank instead.
                        y = max(y, HEAD_CENTER[1] - 0.120)
                    if z <= HAIRLINE_RING_Z + 1e-6:
                        colour = HAIR_DARK       # the edge reads as the fringe's shadow
                else:
                    # below it: re-spaced under the line and pulled behind the ears
                    t = (HAIRLINE_RING_Z - z) / (HAIRLINE_RING_Z - floor_z)
                    vz = (line - 0.030) - t * (line - 0.030 - floor_z)
                    y = BEHIND_EAR_Y
                    if abs(x) < skull_surface_x(y, vz):
                        x *= 0.90   # buried: keep it well under the skin
            ring.append(builder.vertex((x, y, vz), colour, "Head"))
        rows.append(ring)
    bottom = builder.vertex((0.0, ascending[0][3], ascending[0][0] - 0.02), HAIR_DARK, "Head")
    top = builder.vertex((0.0, ascending[-1][3], ascending[-1][0] + 0.012), HAIR, "Head")
    for column in range(segments):
        nxt = (column + 1) % segments
        builder.face((bottom, rows[0][nxt], rows[0][column]), 2)
        builder.face((rows[-1][column], rows[-1][nxt], top), 2)
    for lower, upper in zip(rows, rows[1:]):
        for column in range(segments):
            nxt = (column + 1) % segments
            builder.face((lower[column], lower[nxt], upper[nxt], upper[column]), 2)


# --- The acorn-brown tee -------------------------------------------------------
#
# A wide boxy tee from a crew collar (top z 2.868 at the centre, rib to
# z 2.79) to a hem at z 1.80 that stands proud over the shorts.
#
# What the front view gives cleanly is the LOWER tee, below her hands' reach:
# the silhouette at z 1.85-2.05 is forearm | tee | forearm and the tee's own
# run is read off the cluster rows (z 1.85: x 92-260, 0.498 half; z 1.95:
# 97-256, 0.471; z 2.05: 102-250, 0.439). Above z 2.10 her hanging arms cover
# the tee's edges, so the chest is faired from the hem trace up to the
# armhole seams, which ARE visible: at z 2.55 the tee splits sleeve | body |
# sleeve at x 113 and 241 — 0.379 half between the seams.
# Depth is the profile's span about the x 716 axis: 0.44 half at the hem's
# belly (z 1.80), 0.41 at 2.00, 0.38 at 2.20-2.40, 0.24 at the collar.
# measured: front z=1.85 halfWidth=0.7852 tol=0.03
# measured: front z=2.65 halfWidth=0.5511 tol=0.03
# measured: front z=2.75 halfWidth=0.4711 tol=0.03
# not-traceable: the tee's own half-width at the cited rows is NOT the
# silhouette (which runs forearm to forearm, or sleeve to sleeve) — the
# citations above are the rows the cluster runs in the header were read on.
TORSO_LEVELS = [
    (1.775, 0.488, 0.420, "Hips"),    # hem underside, tucks back to the shorts
    (1.800, 0.506, 0.438, "Hips"),    # hem lip — proud, overhangs the shorts
    (1.840, 0.498, 0.434, "Hips"),
    (1.950, 0.471, 0.418, "Spine"),
    (2.050, 0.447, 0.404, "Spine"),
    (2.250, 0.432, 0.384, "Spine1"),
    (2.420, 0.426, 0.370, "Spine1"),
    (2.550, 0.462, 0.348, "Spine2"),  # yoke: holds the shoulder out to the seam
    # ★ SQUARE SHOULDERS ARE "BUILT LIKE A DOOR". The sheet's shoulder line is
    # nearly level — 0.471 half at z 2.75 against a collar of 0.26 at 2.80.
    # Build 1 tapered evenly from 2.55 to the collar (a bottle); build 2
    # squared it but still measured 5 points of figure height narrow at the
    # yoke rows. The yoke now carries the sheet's own width to z 2.725.
    (2.660, 0.476, 0.322, "Spine2"),
    (2.725, 0.458, 0.300, "Spine2"),  # the shoulder's top edge
    (2.775, 0.360, 0.272, "Spine2"),
    # ★ THE CREW RIB LIES IN THE TEE'S SURFACE. Builds 1-2 stood a 0.05ft
    # wall of rib proud of the shoulders — "a turtleneck roll with a bare
    # neck stalk above it". The rib is now the last 0.04ft of the same slope,
    # told apart by colour and a 0.004 lip, and the hole is wider than the
    # neck by a visible margin.
    (2.806, 0.296, 0.262, "Spine2"),  # the last tee ring under the rib
    (2.828, 0.272, 0.250, "Spine2"),  # rib lower edge — COLLAR_Z sits inside this pair
    (2.842, 0.256, 0.240, "Spine2"),  # rib crown: a THIN band (0.02ft), not a ring
    (2.856, 0.236, 0.222, "Spine2"),  # neck hole: the rib rolls inward to it
]

# The tee's hem hangs 0.18ft above the hip joint, so nothing here needs the
# thigh-follow weighting; the SHORTS' waist loft below does (see PELVIS_LEVELS).
COLLAR_Z = 2.824


def torso_color(theta: float, z: float):
    """SHIRT_DARK rib above COLLAR_Z; the tee everywhere else."""
    return SHIRT_DARK if z >= COLLAR_Z else SHIRT


# The neck: a short thick column. Front view, neck pinch row 356 (z 2.95):
# 0.184 half; profile at the same row x 697-752, 0.164 half.
# ★ It stays INSIDE the collar all the way up (Tank's crossing-surface
# lesson): 0.205/0.203 at the hole's own z against the hole's 0.236/0.222.
# The bottom ring is a genuine 2px narrower than the ring above so the
# head-box detector's pinch lands at the collar, not the chin.
# measured: front z=2.95 halfWidth=0.1837 tol=0.03
# ★ AND THE PINCH IS AUTHORED AT THE SHEET'S OWN ROW, z 2.975. When the collar
# was flattened the narrowest row slid down to it (z 2.87) and the head box
# grew to 28.1% of the figure against the sheet's 25.6, dragging the face
# sample row with it. The neck is now widest in the collar and 2px narrower
# just under the chin (Clover's notch).
# Thick enough to fill the collar: at 0.19 inside a 0.226 hole the second
# review read "a narrow peg".
# ★ AND DEEP ENOUGH TO MEET THE BOB. The hair's forward wall stands at the
# ear plane (y 0.200); a neck 0.178 deep left a 0.02ft sliver of backdrop
# between nape and hair in profile, closed underneath by the loft's bottom
# cap — a 10-12px pocket silhouette.lint refused. Stepping the WALL forward to
# close it folded a quad behind the ear that rendered as a navy diamond at
# runtime (fifth independent review), so the neck goes to the wall instead:
# 0.206 deep, still inside the collar hole's 0.222.
NECK_LEVELS = [
    (2.800, 0.205, 0.200, "Spine2"),
    (2.900, 0.206, 0.206, "Neck"),
    (2.960, 0.198, 0.206, "Neck"),
    (2.990, 0.186, 0.202, "Neck"),
]


# --- Arms: short brown sleeves, thick bare forearms ----------------------------
SLEEVE_HEM_X = 0.780

# Every station inboard of the deltoid carries a blend entry (the Peaches
# lesson: one without it weights 100% to the arm and shears a shoulder fin).
SHOULDER_BLEND = {
    0.215: 0.86,
    0.300: 0.58,
    0.335: 0.34,
    0.400: 0.12,
}

# not-traceable: authored in the rig's T-pose while the concept hangs the arms
# against the tee at every row. Radii are bounded by the hanging-arm runs in
# the front view — sleeve x 69-108 at z 2.45 (0.116 half), bare upper arm
# x 63-102 at z 2.25 (0.116), forearm x 46-88 at z 1.95 (0.124), wrist
# x 44-78 at z 1.85 (0.101) — and the sleeve hem sits 0.45ft down the arm from
# the shoulder seam (z 2.72 to z 2.27).
ARM_STATIONS = [
    # The root is as tall as the yoke it leaves (top z 2.69 under a shoulder
    # edge at 2.725): at build 2's 0.18 the sleeve met the square shoulder as
    # "a tube plugged into the torso" with a step above it.
    (0.215, 0.214, SHIRT, "Arm"),
    (0.300, 0.218, SHIRT, "Arm"),   # deltoid peak
    (0.335, 0.210, SHIRT, "Arm"),
    (0.400, 0.190, SHIRT, "Arm"),
    (0.560, 0.152, SHIRT, "Arm"),
    (0.700, 0.138, SHIRT, "Arm"),
    (SLEEVE_HEM_X - 0.028, 0.136, SHIRT, "Arm"),
    (SLEEVE_HEM_X, 0.143, SHIRT_DARK, "Arm"),          # hem band, proud
    (SLEEVE_HEM_X + 0.022, 0.139, SHIRT_DARK, "Arm"),
    (SLEEVE_HEM_X + 0.036, 0.124, SHIRT_DARK, "Arm"),  # the hem's underside
    (SLEEVE_HEM_X + 0.050, 0.116, SKIN, "Arm"),
    (ARM_ELBOW_X, 0.118, SKIN, "ForeArm"),
    (1.100, 0.122, SKIN, "ForeArm"),
    (1.250, 0.108, SKIN, "ForeArm"),
    (1.365, 0.098, SKIN, "Hand"),
    (1.430, 0.104, SKIN, "Hand"),
    (1.500, 0.112, SKIN, "Hand"),   # knuckle line
    (1.552, 0.100, SKIN, "Hand"),
]

GRETA_ARM = ArmSpec(
    stations=tuple(ARM_STATIONS),
    shoulder_blend=SHOULDER_BLEND,
    # Buried well inside the yoke (Turbo's A-pose wedge: a shallow cap pulls
    # away from the sloped shoulder rows when the arm drops).
    cap_x=0.100,
    root_ring=0.0,
    elbow=0.0,
    underarm_shade=0.0,
    ring_squash=0.95,
    hand=HandSpec(
        tip_x=1.590,
        finger_root=1.545,
        finger_offsets=((-0.062, 0.0, 0.062), (-0.042, 0.042)),
        finger_lengths=((0.120, 0.138, 0.124), (0.128, 0.134)),
        finger_widths=(0.036, 0.034, 0.028, 0.015),
        # ⚠️ FORWARD IS -y.
        thumb_spine=(
            (1.420, -0.046, -0.023),
            (1.480, -0.076, -0.038),
            (1.522, -0.092, -0.046),
            (1.548, -0.099, -0.051),
        ),
        thumb_widths=(0.036, 0.033, 0.025, 0.013),
    ),
    garment=SHIRT,
    skin=SKIN,
)


# --- Navy shorts with cream piping, thick bare legs ----------------------------
#
# Short shorts: the waist rides under the tee's hem (z 1.80) and the legs end
# at z 1.30, where the piped hems split (front rows: one joined run to row
# 626, two legs from row 643). Below them the legs are bare all the way into
# the sneakers — no sock shows at any row.
SHORTS_HEM_Z = 1.298

INSEAM_TOP_Z = 1.400
INSEAM_HEM_Z = SHORTS_HEM_Z
INSEAM_HEM_HALF = 0.014


def inseam_half(z: float) -> float:
    """Half the daylight between the shorts legs: none until just above the
    hem, then the 3px slit the sheet draws at row 643 (x 174-178)."""
    if z >= INSEAM_TOP_Z:
        return 0.0
    t = min(1.0, (INSEAM_TOP_Z - z) / (INSEAM_TOP_Z - INSEAM_HEM_Z))
    return INSEAM_HEM_HALF * t ** 2.0


# (z, half-width, depth factor, colour, bone) — strictly descending in z.
# Per-leg halves are the front view's own two-run rows: z 1.25 x 87-174
# (0.258 half), z 1.15 x 88-167 (0.234), z 1.05 x 89-162 (0.216), z 0.95
# x 87-157 (0.207), z 0.85 x 81-153 (0.213), z 0.75 x 79-152 (0.216), z 0.65
# x 79-147 (0.201), z 0.55 x 81-141 (0.178), z 0.45 x 84-136 (0.154).
# The citations are the rows' silhouette reads (halfWidthAt reports the
# figure's first run on a two-run row).
# measured: front z=1.25 halfWidth=0.2607 tol=0.02
# measured: front z=1.15 halfWidth=0.2341 tol=0.02
# measured: front z=1.05 halfWidth=0.2193 tol=0.02
# measured: front z=0.95 halfWidth=0.2074 tol=0.02
# measured: front z=0.85 halfWidth=0.2163 tol=0.02
# measured: front z=0.75 halfWidth=0.2193 tol=0.02
# measured: front z=0.65 halfWidth=0.2015 tol=0.02
# measured: front z=0.55 halfWidth=0.1807 tol=0.02
# measured: front z=0.45 halfWidth=0.1541 tol=0.02
LEG_STATIONS = [
    # ★ A BOX FOR THE SEAT, TWO LEGS BELOW IT. Build 2 ran a wide waist over
    # narrower tubes and they crossed in a sawtooth; build 3 made the whole
    # garment one box down to the hem, which cured the crossing and read as a
    # SKIRT — one level hem, no leg split (third independent review). The
    # box now stops at z 1.400, where the tubes are exactly as wide as it is
    # (tube centre + 0.290 = the box's 0.519), and the last 0.11ft of each
    # leg is the tube itself: two piped leg openings with the inseam's
    # daylight between them, as the sheet draws from row 626 down.
    (1.600, 0.250, 1.10, PANTS, "UpLeg"),
    (1.470, 0.258, 1.10, PANTS, "UpLeg"),
    (1.410, 0.290, 1.38, PANTS, "UpLeg"),              # emerges flush with the box
    (1.356, 0.294, 1.37, PANTS, "UpLeg"),
    # The piping: a bold 0.05ft band ON THE LEG IT TRIMS — one thin proud
    # ring pair per leg, the whole of M_Accessory.
    (1.348, 0.300, 1.36, TEAM_MASK, "UpLeg"),
    (SHORTS_HEM_Z, 0.298, 1.35, TEAM_MASK, "UpLeg"),
    (1.290, 0.272, 1.20, PANTS_DARK, "UpLeg"),         # the hem's inner lip
    (1.286, 0.252, 1.08, SKIN, "UpLeg"),               # bare thigh begins
    (1.150, 0.234, 1.06, SKIN, "UpLeg"),
    (1.050, 0.218, 1.04, SKIN, "UpLeg"),
    (0.950, 0.207, 1.03, SKIN, "UpLeg"),
    (0.850, 0.213, 1.02, SKIN, "Leg"),                 # the calf
    (0.750, 0.216, 1.02, SKIN, "Leg"),
    (0.650, 0.201, 1.00, SKIN, "Leg"),
    (0.550, 0.180, 0.99, SKIN, "Leg"),
    (0.470, 0.158, 0.98, SKIN, "Leg"),                 # the ankle, at the shoe collar
    # Skin all the way into the collar: the first build coloured the 0.44
    # station SOCK and it stood above the shoe as a white band the sheet does
    # not draw.
    (0.400, 0.140, 0.97, SKIN, "Leg"),
    (0.280, 0.112, 0.95, SOCK, "Foot"),                # inside the shoe from here
    (0.150, 0.106, 0.95, SOCK, "Foot"),
]

# The shorts' waist and seat: one loft that joins the two leg tubes into a
# garment and fills the kid between the tee's hem and the hip joint — a hem is
# where cloth ends, not where the kid ends (Zippy's pelvis). It tops out
# INSIDE the tee (0.46 half under the hem lip's 0.506) so the two overlap in
# every view, and bottoms out above the leg split.
# Front view, navy runs: z 1.65 x 92-261 (0.501 half), z 1.55 x 89-264
# (0.519), z 1.45 x 89-264 (0.519). Depth from the profile's z 1.60 row
# (x 648-784, 0.405 half).
# measured: front z=1.55 halfWidth=0.7941 tol=0.03
# not-traceable: the shorts' own half-width is read off the navy cluster runs
# in the header, not the silhouette (which runs hand to hand at these rows);
# the top ring is hidden under the tee and no view can give it.
PELVIS_LEVELS = [
    (1.400, 0.519, 0.410, "Hips"),
    (1.550, 0.519, 0.414, "Hips"),
    (1.660, 0.500, 0.416, "Hips"),
    (1.840, 0.460, 0.408, "Hips"),
]

# The seat is carried partly by the thighs so a squat folds it instead of
# leaving a rigid box between two rotating legs (the catcher-squat lesson).
SEAT_THIGH_SHARE = 0.85

GRETA_LEG = LegSpec(
    stations=tuple(LEG_STATIONS),
    inseam_half=inseam_half,
    garment=PANTS,
    sock=SOCK,
    team_mask=TEAM_MASK,
    calf=(0.0, 0.0),
    knee=0.0,
)


# --- The shoe: a chunky cream sneaker ------------------------------------------
#
# All cream, low-cut, thick-soled. Front view: one shoe is x 64-139 at z 0.15
# (0.222 half) and x 59-140 at z 0.05 (0.240); the collar meets the bare ankle
# at z 0.47. Profile: 144px toe to heel at z 0.10, 0.857ft.
SHOE_FLOOR = 0.006
SHOE_TOE_OUT = 14.0 * pi / 180.0

# not-traceable: the last's fore-aft profile has no sheet view; it is the
# family last at her traced width (0.222 half) and collar height (0.47).
SHOE_STATIONS = [
    (-0.439, 0.074, 0.262, SOLE),
    (-0.388, 0.134, 0.300, SOLE),
    (-0.314, 0.176, 0.328, SOLE),
    (-0.228, 0.202, 0.342, SOLE),
    (-0.131, 0.216, 0.350, SOLE),
    (-0.034, 0.222, 0.352, SOLE),
    (0.057, 0.221, 0.350, SOLE),
    (0.137, 0.208, 0.344, SOLE),
    (0.188, 0.180, 0.332, SOLE),
    (0.239, 0.134, 0.290, SOLE),
]

# ★ THE FOXING STEP IS A SLOPE, NOT A LEDGE. The family section steps in from
# the cupsole to the upper almost horizontally (u 0.99 → 0.83 over 0.03 of v).
# The toe's end cap fans every ring edge to one point, and the fan triangle on
# that ledge is edge-on to the apex: it shades black. On the family's navy
# shoes nobody sees it; on a cream shoe it was "a dark sliver at each toe"
# (first independent review). The step here climbs 0.10 of v as it comes in.
# not-traceable: a cross-section is a fore-aft cut no view can give.
SHOE_SECTION = [
    (0.000, 0.000, "midsole"),
    (0.620, 0.004, "midsole"),
    (0.950, 0.030, "midsole"),
    (1.000, 0.140, "midsole"),
    (0.990, 0.270, "midsole"),   # a thick cupsole
    (0.880, 0.370, "quarter"),
    (0.812, 0.440, "quarter"),
    (0.790, 0.570, "quarter"),
    (0.762, 0.700, "quarter"),
    (0.725, 0.820, "quarter"),
    (0.664, 0.885, "collar"),
    (0.520, 0.950, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_MID = [
    (0.000, 0.000, "midsole"),
    (0.970, 0.060, "midsole"),
    (0.990, 0.270, "midsole"),
    (0.880, 0.370, "quarter"),
    (0.790, 0.570, "quarter"),
    (0.725, 0.820, "quarter"),
    (0.664, 0.885, "collar"),
    (0.000, 1.000, "collar"),
]
SHOE_SECTION_LOW = [
    (0.000, 0.000, "midsole"),
    (0.990, 0.270, "midsole"),
    (0.880, 0.370, "quarter"),
    (0.725, 0.820, "quarter"),
    (0.000, 1.000, "collar"),
]


def shoe_floor_at(y_unscaled: float) -> float:
    """The underside's height at a station — toe spring and heel bevel."""
    if y_unscaled <= -0.30:
        t = (-0.30 - y_unscaled) / 0.14
        return SHOE_FLOOR + 0.046 * min(1.0, t) ** 1.6
    if y_unscaled >= 0.16:
        t = (y_unscaled - 0.16) / 0.08
        return SHOE_FLOOR + 0.026 * min(1.0, t) ** 1.5
    return SHOE_FLOOR


SHOE_LENGTH_SCALE = 1.12
SHOE_WIDTH_SCALE = 1.00
SHOE_HEIGHT_SCALE = 1.22

SHOE_TOP_MAX = max(ztop for _, _, ztop, _ in SHOE_STATIONS)

SHOE_BANDS = [
    (0.000, "midsole"),
    (0.270, "quarter"),
    (0.800, "collar"),
]


def toe_cap_v_low(y_unscaled: float) -> float:
    """No separate toe bumper: 2.0 at every station builds no cap.

    Her sneaker's toe is tone-on-tone with the upper, and at this shoe's
    height scale the family cap's proud panel folded over its own lower edge —
    an arched plate with a black slit at each toe on the board and a navy
    wedge at runtime (first independent review, finding 2).
    """
    return 2.0


def heel_counter_v_low(y_unscaled: float) -> float:
    """The heel counter's lower edge, mirroring the toe cap's construction."""
    if y_unscaled < 0.08:
        return 2.0
    frac = min(1.0, max(0.0, (y_unscaled - 0.08) / 0.16))
    return 0.62 - 0.20 * frac


GRETA_SHOE = ShoeSpec(
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
    collar=(0.022, 0.130),
    straps=((-0.170, -0.120), (-0.065, -0.015)),
    strap_arc_min=0.52,
    heel_point=(0.286, 0.134 + 0.026),
    toe_point=(-0.447, 0.190),
    upper=SHOE,
    trim=SOLE,
    midsole=WHITE,
)


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    face_columns = 27 if detail >= 2 else (9 if detail == 1 else 5)
    back_columns = 4 if detail >= 2 else (2 if detail == 1 else 1)
    if detail >= 2:
        rows_spec, crown, chin = FACE_ROWS, 3, 2
    elif detail == 1:
        rows_spec, crown, chin = [0.0, 0.184, 0.340, 0.468, 0.660, 1.0], 1, 1
    else:
        rows_spec, crown, chin = [0.0, 0.32, 0.60, 1.0], 1, 1
    head_surface(builder, face_columns, back_columns, rows_spec, crown, chin,
                 spec=HEAD_SPEC, palette=PALETTE)

    build_bob(builder, detail)

    # No ears at LOD2: at 80 triangles the pair is what the far LOD's 1200
    # budget has least use for (it is drawn at a few pixels tall).
    if detail >= 1:
        for side in (1, -1):
            build_ear(builder, side, detail, palette=PALETTE, skull_at=skull_surface_x, spec=EAR_SPEC)

    builder.loft(NECK_LEVELS, 0, SKIN, 14 if detail >= 2 else segments)
    seat = lambda at, bone: hem_follows_thighs(at, bone, PELVIS_LEVELS[0][0], SEAT_THIGH_SHARE)
    builder.loft(thin_for_lod(PELVIS_LEVELS, detail), 1, PANTS, segments, weight_fn=seat)
    builder.loft(thin_for_lod(TORSO_LEVELS, detail), 1, SHIRT, segments,
                 color_fn=torso_color)

    for side in (1, -1):
        build_arm(builder, side, detail, spec=GRETA_ARM)
        build_leg(builder, side, detail, spec=GRETA_LEG)
        build_shoe(builder, side, detail, spec=GRETA_SHOE,
                   ankle_x=leg_x(LEG_ANKLE_Z), bone=limb_bone("ToeBase", side))


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
    obj["recessReference"] = "greta-turnaround.png"
    return obj


# not-traceable: authored canonical grip reach, retaining this character's
# finger-pad girth; separate knuckles put the digits in the palm plane.
REFERENCE_HAND_SHAPE = dict(
    finger_offsets=(-0.024, 0.044, 0.112),
    finger_lengths=(0.16, 0.171, 0.152),
    finger_widths=(0.036, 0.034, 0.030, 0.016),
    thumb_widths=(0.040, 0.040, 0.032, 0.016),
)


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    ensure_material_slots(SLOTS)

    # ★ PURGE EVERY MESH, not just the LOD roots. This source was bootstrapped
    # from the slot's previous sculpt (Grizz), so the scene opens holding HIS
    # three LODs under these same names plus whatever strays rode along; any
    # mesh left behind exports beside hers and eats the size budget unseen
    # (batch 6's stray-mesh lesson).
    for old in [obj for obj in bpy.data.objects if obj.type == "MESH"]:
        bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_grizz_LOD0": (20, 12, 2),
        "kid_grizz_LOD1": (8, 4, 1),
        "kid_grizz_LOD2": (5, 3, 0),
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
        install_face_atlas(FACE_ATLAS, "grizz")

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Greta reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against greta-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the shorts' hem piping accent.\n"
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
