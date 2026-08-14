"""`build_ear`: an ear is a helix, a concha, a tragus and a lobe.

★ WHY THIS IS SHARED AND NOT PER-CHARACTER. Rubric 3.10 is binary — "ears are
constructed, never a bare ellipsoid bump" — and it is binary for all thirty
kids. The construction that satisfies it took three of Junebug's seven review
rounds to find, and the findings are anatomy rather than identity: the concha
must not run all the way round, the dish's visible depth is a front-camera
question, the rim flares, and the whole thing is offset from the SKULL at its
own (y, z) rather than placed at an absolute point.

Every one of those is true of a child's ear in general, so a second character
that re-derived them would be paying for the same rounds twice.

★ IT TAKES THE SKULL AS A CALLABLE, which is the only thing that made it
liftable. `skull_at(y, z)` returns the head's surface half-width there, so the
ear mounts against whatever head it is given — Junebug's ellipsoid with a traced
jaw curve, or a rounder, wider one — without this module knowing the shape.
Every row is an offset from that surface, never an absolute coordinate.
"""

from __future__ import annotations

from collections.abc import Callable
from math import cos, pi, sin

from dataclasses import dataclass

from .mesh import MeshBuilder
from .palette import Palette


@dataclass(frozen=True)
class EarSpec:
    """Where one character's ear sits and how big it is.

    ★ THE FIRST LIFT OF THIS MODULE SHARED THE CONSTRUCTION AND KEPT JUNEBUG'S
    PLACEMENT, and Tank is what found it. His board came back with a head
    aspect of 0.97 against the concept's 1.12 — too narrow — and the cause was
    not his skull, which measures right. It was that the concept's head aspect
    is measured across the EARS, they are the widest point of a child's head,
    and his were still sitting at her centre (0.045, 3.128) at her size.

    That is the exact failure the package doc warns about: lifting a function
    with one character's constants baked in produces a library that sculpts one
    kid thirty times. It survived review because the geometry was byte-identical
    for the character it was extracted from, which proves the lift was faithful
    and says nothing about whether it was general.
    """

    # (y, z) of the ear's centre on the head, in feet.
    center: tuple[float, float]
    # (fore-aft, vertical) radii of the ear's outline, in feet.
    radii: tuple[float, float]


def build_ear(
    builder: MeshBuilder,
    side: int,
    detail: int,
    *,
    palette: Palette,
    skull_at: Callable[[float, float], float],
    spec: EarSpec,
) -> None:
    """One continuous ear with a helix, a concha, a tragus and a real LOBE.

    ★ THE CONCHA MUST NOT RUN ALL THE WAY ROUND, and that is what v11 got
    wrong. Its rows were concentric scalings of one outline, so the inward
    turn into the shadow floor happened at EVERY bearing — the board's 12x crop
    read "a closed torus: a uniform-width rim running all the way round a dark
    slot ... no lobe, no tragus, no helix taper", a doughnut traded for the
    round-1 bump. On a real ear the concha is a hollow over roughly the upper
    two thirds and the lower FRONT is solid flesh; that solid pad IS the lobe.
    So the inward rows are interpolated between a CONCHA target and a LOBE
    target by `well(t)`, and where `well` is zero the surface simply keeps
    rolling over at rim radius into a filled pad.

    Sizes are read off the concept's PROFILE ear, not its front view: the front
    view loses the lobe into the jaw shading (it measures 54px tall), while the
    profile crop gives the ear 70px tall and 49px front-to-back — 0.329ft by
    0.231ft at 212.46 px/ft. The rim peak goes to x 0.589 because the concept's
    ear tips are the head's widest point, 251px against the hair's 233px: at
    v11's 0.556 the rim stood exactly level with the 0.557 hair cap and the ear
    had no silhouette of its own.
    """
    # ★ RE-MEASURED IN ROUND 3, AND IT IS THE HEAD-WIDTH BLOCKER. Both boards
    # were scanned with one silhouette detector at their own figure heights
    # (concept 882px, delivered 578px):
    #
    #   the HAIR is already right — concept 234px wide (0.2653 of figure
    #   height), delivered 154px (0.2664), a 0.4% miss;
    #   the EARS are not — concept 251px (0.2846), delivered 172px (0.2976),
    #   4.6% proud, and that whole 4.6% IS the "+4.3% too wide" that round 3
    #   scored headBodyProportions down for. The skull never needed narrowing.
    #   the ears are also 26% too TALL and 0.028ft too low: concept ear top
    #   z 3.248, bottom 2.981 (0.267ft); delivered top 3.254, bottom 2.917
    #   (0.337ft). Ears that hang to 79% of the way down the face instead of
    #   the concept's 71% are also what put the round-3 40px sprite's "two
    #   pale ear blocks jutting out at eye level".
    #
    # rz 0.1206 with cz 3.128 reproduces the concept's top and bottom exactly
    # (3.128 + 0.150*0.804*1.06*0.938 = 3.248; 3.128 - 0.150*0.804*1.06*1.151
    # = 2.981), and the rim offsets below drop by the measured 0.027ft.
    # 16 outline points at hero, not 12: from the front an ear this size is a
    # 5px sliver, and 30-degree steps in the outline are the "straight-edged
    # slabs" the round-3 board read.
    # ★ AND IT IS 0.028ft TOO LOW, re-measured in MODEL FEET on both boards.
    # The concept's silhouette waists to 0.508 half-width at z 3.250, steps to
    # 0.568 by 3.225 and PEAKS at 0.586-0.588 over z 3.150-3.175. The round-3
    # build peaks at 0.595 — the width is right, round 3's narrowing landed —
    # but it peaks at z 3.125, a quarter of the ear's own height low, which is
    # what stretched the step over 23 rows where the concept takes 16. 3.156
    # puts the peak at 3.153 and the top at 3.276.
    # 16 outline points at hero, not 14: with the temple wedge gone (see
    # the kid's own hairline table) the ear is no longer half-buried in hair, and
    # now shows against sky is the one the round-3 board called a straight
    # faceted edge at 14.
    points = 16 if detail >= 2 else 8
    # ★ THE EAR WAS ROUND AND AN EAR IS NOT. Round 5 read it as "a raised
    # ellipsoid pad with one shallow crescent groove" — the helix, concha and
    # lobe below are all really there, and the reason they did not read is one
    # number: aspect. Measuring both crops with the same detector, the concept's
    # profile ear is 1.42 tall to wide and this one was 1.03. A circle with a
    # groove in it is a doughnut whatever the groove is doing, which is also
    # what killed v11.
    #
    # ⚠️ THE HEIGHT WAS BOUGHT DOWNWARD, ON PURPOSE. Growing the ear UP pushes
    # its upper-back bearings straight into the hair cap, which is the
    # "black hole punched in the side of her head" documented at length below —
    # a collision, not a shading bug, and it cost three rounds. The top ring
    # therefore does not move at all (3.2763 before and after); the bottom drops
    # from 3.0354 to 2.9797, into jaw the hair never reaches, and `lobe` swells
    # harder to spend that reach on the thing 3.10 actually asks for.
    cy, cz = spec.center
    ry, rz = spec.radii

    def outline(t: float, scale: float) -> tuple[float, float]:
        # t = 0 back, pi/2 up, pi front, 3pi/2 down.
        # LOBE: a tight cubic swell centred on the lower-front arc.
        lobe = 1.0 + 0.34 * max(0.0, cos(t - 4.13)) ** 3
        # HELIX ROOT: at the upper front the rim dives into the face rather
        # than standing off it, which is the taper 3.10 asked for by name.
        root = 1.0 - 0.20 * max(0.0, cos(t - 2.55)) ** 2
        return (
            cy + ry * scale * lobe * root * cos(t),
            cz + rz * scale * lobe * root * sin(t),
        )

    def well(t: float) -> float:
        """1 where the concha hollows, 0 across the lobe's solid pad."""
        delta = (t - 0.85 + pi) % (2 * pi) - pi
        if abs(delta) >= 2.55:
            return 0.0
        return cos(delta / 2.55 * (pi / 2)) ** 1.4

    def front_deep(t: float) -> float:
        """★ HOW MUCH OF THE DISH THE FRONT CAMERA IS ALLOWED TO SEE.

        The round-4 board scored the ear "a flat faceted skin nub ... no outer
        rim, no inner concha shadow, no lobe" — rubric 3.10's forbidden bare
        bump, verbatim, and it is not a paint problem. Measured off the rows
        below, the dish was 0.073 - 0.056 = 0.017ft deep, which is 2.4px on the
        front board. Smooth shading has nothing to darken at 2.4px, so the ear
        renders as one lit plane however many rings it carries. The concept's
        own front-view ear (junebug-turnaround.png, x 390-440) shows the
        opposite: a lit helix rim with a clearly shadowed groove running inside
        it, and that groove is what makes it read as an ear at 6x rather than a
        pad.

        The dish could not simply be deepened, and `build_ear`'s header says
        why: at the ear's upper-BACK bearings the concha is inside the hair cap
        by 0.021-0.030ft, which is the black hole round 3 found. But that is a
        statement about ONE arc. Walking both surfaces at the upper-FRONT
        bearing the front camera actually sees (t 2.4, model y 0.035, z 3.207),
        the ear stands 0.0426ft clear of the cap, and at t 1.6 it stands 0.0241
        — so the depth is available exactly where it is needed and absent
        exactly where it is not. This window is centred on t 2.4 with a
        half-width of 1.6rad, which is zero by t 0.8 and therefore zero across
        the whole 15-30 degree arc the collision lives on.
        """
        delta = (t - 2.4 + pi) % (2 * pi) - pi
        if abs(delta) >= 1.35:
            return 0.0
        return cos(delta / 1.35 * (pi / 2)) ** 2

    # ★ EVERY ROW IS AN OFFSET FROM THE SKULL AT ITS OWN (y, z), never an
    # absolute x. The head narrows 0.10ft between the ear's top and its bottom,
    # so one absolute base ring cannot be buried at both ends — the first v12
    # board buried it beside the eye and left it standing 0.05ft proud beside
    # the jaw, which drew a shelf under each ear.
    # (offset from skull, outline scale, y shift back).
    # Offsets pulled in 0.027ft (the measured 4.6% of head width above) and a
    # FOURTH rim row added at hero: the round-3 board read the front-view ear
    # as "flat, uniformly shaded", which is what three rows spanning 0.13ft of
    # depth give — one lit plane. Four rows put a shading break on the rim's
    # outer roll where the front camera can see it.
    # ★ THE "BLACK HOLE PUNCHED IN THE SIDE OF HER HEAD" WAS THE HAIR, SEEN
    # THROUGH HER OWN EAR. It is worth the paragraph, because three rounds read
    # it as a shading problem and it is a collision.
    #
    # Round 3 scored the ear a cavity at the gameplay camera and the obvious
    # suspects were the toon ramp (a pocket the key light cannot reach) and the
    # inverted-hull outline (2.5 SCREEN pixels of expansion closing over a
    # narrow concavity). Both were wrong. Walking the ear's own rows against the
    # hair cap's surface at 0.5-degree steps: every concha row sat INSIDE the
    # cap by 0.021 to 0.030ft, worst at outline bearings 15-30 degrees — the
    # ear's upper back, which is exactly where the black ellipse sits in
    # junebug-runtime-hero.png. The concha was rendering the hair mass behind
    # it, and the hair is near-black on that side of the head. The front board
    # never showed it because the ear is edge-on there, and the profile board
    # never showed it because the camera is outboard of both surfaces.
    #
    # It takes BOTH halves of the fix and neither alone is enough (measured:
    # raising the rows alone leaves -0.004, tapering alone leaves -0.010):
    #   * the concha rows come out to 0.056-0.066 off the skull, so the dish is
    #     0.017ft deep instead of 0.043 and lives outside the hair;
    #   * `hair_cap` thins its shell toward the hairline (see its `hug` block),
    #     which is what a hairline does anyway.
    # Together the whole ear clears the hair by 0.0154ft at its tightest point.
    #
    # The paint stays honest either way. The floor is plain SKIN — the concept's
    # own ear (junebug-turnaround.png, profile figure) samples (176,116,74) in
    # the concha against (203,145,101) on the helix, a 24-unit dip and not a
    # hole — and SKIN_SHADOW survives only on the deepest inner ring, where the
    # concept's own dip is.
    # ★ AND THE WHOLE DISC IS FLARED, WHICH IS THE OTHER HALF OF 3.10's FRONT
    # VIEW. Deepening the dish (see `front_deep`) buys nothing if the dish faces
    # sideways, because the front camera then sees the disc EDGE-ON and a
    # 0.047ft hollow projects to nothing. Measured off the concept's own front
    # figure, its ear occupies x 390..417 — 27px of visible ear surface inboard
    # of a silhouette edge the skull alone would put at 417 — because the disc
    # is rotated so its opening faces forward-and-out. The delivered ear showed
    # ~12px and read, correctly, as a pad.
    #
    # `back` is what rotates it: the outer rim rides 0.072ft further back than
    # the base ring across 0.103ft of standoff, which is 35 degrees off the
    # head's side, so the dish's normal is (0.82, -0.57, 0) and 57% of it faces
    # the front camera. The MEAN of the four rim rows moves by 0.003 only, so
    # the ear does not migrate backward on the profile board — it pivots.
    # ⚠️ AND THE FLARE HAS TO BE PAID FOR IN STANDOFF, which the first flared
    # board proved by measuring it. `skull_at` FALLS as a row moves back
    # (that is the whole reason ear rows are offsets from the skull rather than
    # absolute x), so rotating the disc 35 degrees pulled the rim's projected
    # half-width in with it: head max width fell 166px -> 162 and the ear's
    # silhouette step 12.0% -> 9.9% of head width, against a concept step of
    # 13.6%. Offsets are therefore re-solved at the flared geometry — 0.090 at
    # the rim rather than 0.073 — which buys the step back without touching the
    # skull. Note what that trade cannot do: the concept's waist is 0.245 of its
    # figure height against this build's 0.253, so a 13.6% step and a 0.284
    # head width are not simultaneously reachable here. Head width is the
    # measured category and keeps its 166px.
    if detail >= 2:
        rim_rows = ((-0.030, 0.90, -0.012), (0.022, 1.04, 0.008), (0.058, 1.06, 0.028), (0.090, 0.98, 0.046))
        concha_rows = ((0.066, 0.78, 0.044), (0.056, 0.44, 0.038))
        lobe_rows = ((0.072, 0.90, 0.042), (0.058, 0.64, 0.034))
    else:
        rim_rows = ((-0.026, 0.96, -0.010), (0.080, 1.00, 0.036))
        concha_rows = ((0.058, 0.50, 0.026),)
        lobe_rows = ((0.062, 0.70, 0.024),)

    rows: list[list[int]] = []

    def emit(spec_fn) -> None:
        row = []
        for index in range(points):
            t = 2 * pi * index / points
            offset, scale, back, colour = spec_fn(t)
            ear_y, ear_z = outline(t, scale)
            ear_y += back
            x_abs = skull_at(ear_y, ear_z) + offset
            row.append(builder.vertex((x_abs * side, ear_y, ear_z), colour, "Head"))
        rows.append(row)

    def helix_root(t: float) -> float:
        """The helix ROOTS into the skull at the ear's crown and only stands
        clear lower down: the positive standoff tapers by 38% at t = pi/2, and
        not at all at the front and back bearings (t = 0, pi) where the ear
        reaches its widest, nor at the lobe. Negative offsets — the buried base
        ring — are left alone, because scaling one pushes the base OUT of the
        skull.

        ⚠️ WHAT THIS DOES AND DOES NOT DO, MEASURED, so it is not re-attempted
        as a silhouette fix. It softens the squared corner at the top of the
        ear's own surface, which is real and visible at 8x. It changes the
        front-view SILHOUETTE by zero pixels, and the reason is worth keeping:
        the front outline at the ear's latitudes is set by the ear's WIDEST
        bearings, where this taper is 1.0 by construction, while at the ear's
        crown the outline belongs to the hair cap. Walking both boards with one
        alpha/background silhouette detector over rows 0.50-0.75 of head height:
        the delivered ear step runs 146 -> 152px of a 164px head (89.0% -> 92.7%
        of head max) and the concept's runs 225 -> 235 of 250 (90.0% -> 94.0%),
        with a largest single-row jump of 2px on BOTH. The front step is within
        1.3% of the concept and is not what still holds 3.10; the ear is 20px
        tall on this board and what is missing at that size is rim, concha and
        lobe DEPTH, which is a separate pass.
        """
        return 1.0 - 0.38 * max(0.0, sin(t)) ** 1.2

    for offset, scale, back in rim_rows:
        # ANTIHELIX: a low ridge inside the rim on the upper-back arc, so the
        # rim is not one uniform-width band the whole way round.
        emit(lambda t, o=offset, s=scale, b=back: (
            (o * helix_root(t) + 0.016 * max(0.0, cos(t - 0.55)) ** 4) if o > 0 else o,
            s, b, palette.skin
        ))
    for (co, cs, cb), (lo, ls, lb) in zip(concha_rows, lobe_rows):
        def spec(t: float, co=co, cs=cs, cb=cb, lo=lo, ls=ls, lb=lb):
            w = well(t)
            # TRAGUS: the small flap in front of the canal, a local outward
            # push on the front bearing of the inner rows.
            tragus = 0.038 * max(0.0, cos(t - pi)) ** 6
            # ★ THE SINK IS NOT GATED ON `well`, and the first round-4 rebuild is
            # why. Gated, it delivered 0.026 * w * front_deep = 0.012 at the
            # window's centre, because `well` is only 0.46 there — the concha's
            # own centre is at t 0.85 (the upper BACK) and the front is nearly
            # all lobe. The board then measured what a 0.012ft dip in a form that
            # spans 11px from the front is: nothing. The groove the front camera
            # needs runs just inside the helix, so it is authored against the
            # camera's own window and nothing else.
            #
            # 0.032 is a CLEARANCE. Walking the ear's rows against the cap's
            # surface: 0.0426ft of room at t 2.4 (sink 0.0136 there, 0.029 left)
            # and 0.0241 at t 1.6 (sink 0.0114, 0.0127 left). The 15-30 degree
            # arc that carries the round-3 collision is outside the window
            # entirely and takes no sink at all.
            sink = 0.032 * front_deep(t)
            colour = palette.skin_shadow if (cs < 0.85 and front_deep(t) > 0.30) else palette.skin
            return (
                lo + (co - lo) * w + tragus - sink,
                ls + (cs - ls) * w,
                lb + (cb - lb) * w,
                colour,
            )
        emit(spec)
    builder.grid(rows, 0, flip=side < 0)
    # The floor of the dish. SKIN, not SKIN_SHADOW, and 0.033ft under the rim
    # peak rather than 0.069 — see the rim/concha block above for why the deep
    # painted version rendered as a hole at the gameplay camera.
    # 0.042, was 0.060: the dish floor drops with the front rows above it (see
    # `front_deep`). Solved for hair, not guessed — at (y 0.083, z 3.152) the
    # cap's rim has already ended (its colatitude there is 1.792 against the
    # 1.839 this point needs), so there is no hair over this vertex at all.
    center = builder.vertex(
        ((skull_at(cy + 0.038, cz - 0.004) + 0.042) * side, cy + 0.038, cz - 0.004),
        palette.skin, "Head",
    )
    for index in range(points):
        nxt = (index + 1) % points
        face = (center, rows[-1][index], rows[-1][nxt]) if side > 0 else (center, rows[-1][nxt], rows[-1][index])
        builder.face(face, 0)
