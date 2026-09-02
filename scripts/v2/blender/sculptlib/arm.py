"""`build_arm`: one stitched arm along the rig's own axis — sleeve, forearm, hand.

★ WHY THIS IS SHARED. Every finding in this file is about how an arm is BUILT,
and each cost review rounds that a second character must not pay again: the
sleeve and the limb are one surface that changes vertex colour at the hem rather
than a garment shell butted against a tube; the shoulder is a deltoid ring proud
of both the torso and the sleeve below it, not a rod leaving a wide body; the
inboard rings blend onto the torso bone so the joint does not tear; and the hand
is a mitten with separate digits, because at 40px a hand without a thumb reads
as a paddle.

★ WHAT STAYS WITH THE CHARACTER. `ArmSpec.stations` is the arm's own profile —
(x, radius, colour, bone) traced off that kid's turnaround — and it stays in the
sculpt script beside its `# measured:` citation, where
`sculpt-provenance.lint.test.js` governs it. So does the hand, because a hand is
sized to its owner. This module reads them and knows nothing else about the kid.

★ THE RIG CONSTANTS IT READS ARE NOT MEASUREMENTS AND DO NOT BELONG IN A SPEC.
`LeftArm` at x -0.400, `LeftForeArm` at -0.918, `LeftHand` at -1.365, all at
z 2.471 — that is the canonical skeleton every character shares, gated by
`src/v2/render/skeleton.test.ts`. Putting them in `ArmSpec` would invite thirty
copies of one rig and let a character disagree with the bones it is bound to.

⚠️ THE RIG IS A T-POSE AND FOUR ROUNDS BUILT THE ARMS HANGING DOWN, with every
forearm vertex about two feet from the bone driving it — and LEFT IS NEGATIVE X,
so a `side` of +1 is the RIGHT side. Neither showed up in a single measured
metric: all eight of `measure:fidelity`'s numbers were inside tolerance with the
arms on the wrong side of the body, because the board renders one posed view and
the metrics read that render. The package doc records the cheap check.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import cos, pi, sin

from .mesh import MeshBuilder, part, thin_for_lod
from .rig import ARM_Z, limb_bone




@dataclass(frozen=True)
class HandSpec:
    """One character's hand. Every field is required — see `sculptspec.lint`."""

    tip_x: float                                    # the mitten's end cap
    finger_root: float                              # where the digits leave the mass
    # (three-finger, two-finger) z offsets and lengths, by detail level.
    finger_offsets: tuple[tuple[float, ...], tuple[float, ...]]
    finger_lengths: tuple[tuple[float, ...], tuple[float, ...]]
    finger_widths: tuple[float, ...]
    # (x, y, dz-from-ARM_Z) control points. ⚠️ FORWARD IS -y: the first cut of
    # this authored the thumb BEHIND the hand, where no hand has one and the
    # front board cannot see it.
    thumb_spine: tuple[tuple[float, float, float], ...]
    thumb_widths: tuple[float, ...]


@dataclass(frozen=True)
class ArmSpec:
    """One character's arm, as traced off their turnaround."""

    # (x, radius, colour, bone) from the shoulder outward. Strictly ascending in
    # x — `build_arm` asserts it, because a ring out of order folds the strip
    # back on itself and renders as a bored socket.
    stations: tuple[tuple[float, float, tuple, str], ...]
    # x -> share of that ring belonging to the TORSO bone. Falls to zero by the
    # time the sleeve clears the body, so the hand is untouched.
    shoulder_blend: dict[float, float]
    cap_x: float          # the shoulder cap vertex, inboard of the first ring
    ring_squash: float    # z scale on each ring — an arm is not circular
    hand: HandSpec

    garment: tuple        # the sleeve
    skin: tuple           # forearm, hand and digits
    # ★ THE A-POSE COVERAGE GAP HAS A MECHANISM, AND THIS IS THE REPAIR. The
    # cap is one vertex that follows the body while the first ring follows
    # the arm, so when the arm rotates down the ring's upper half swings away
    # from the torso's shoulder slope and the fan between them opens into a
    # backdrop pocket (Turbo's A-pose board tripped the silhouette gate on
    # it; Bendy, Flash, Noodle, Penny and Peaches carry it as dark wedges).
    # Burying the cap (`cap_x` 0.060) narrows the pocket but cannot close it,
    # because a point cannot stretch. A ROOT RING at `cap_x`, this fraction
    # of the first ring's radius and weighted like the cap, turns the fan
    # into a strip that stretches with the rotation instead of opening.
    # 0.0 keeps the single cap vertex (a frozen kid's geometry stays put);
    # stated by every script, never defaulted — sculpt-sharing.lint says why.
    root_ring: float
    # ★ AN ELBOW IS A CREASE AND A BULGE, NOT A TAPER. Eight critics read the
    # arm as "a smooth tapered cone" or "a hard kink where the forearm exits
    # the sleeve": every table runs straight through `ARM_ELBOW_X` with radii
    # that only shrink. This is the joint's form as a fraction of the local
    # radius: a ring 0.055 inboard of the elbow pinched by half of it, a ring
    # at the elbow swollen by all of it and a shoulder ring 0.040 outboard at
    # half — the crease and the knob a bent arm
    # shows in swing and run. Interpolated off the table, so the tables stay
    # the trace. 0.0 keeps the taper; stated by every script.
    # ★ THE AMOUNT IS A FRACTION OF A SMALL RADIUS. 0.06 on a bare arm at
    # r 0.063 is 0.5 board px per side — built, measurable, invisible (three
    # critics, 2026-09-02); the knee's 0.14 on a 0.112 half-width is 2.2 px.
    # A bare arm needs ~0.14-0.25; a sleeved arm whose hem sits at the elbow
    # takes 0.03 or the knob reads as a second cuff (Calls Shot).
    elbow: float


def shoulder_blend_at(table: dict[float, float], x: float) -> float | None:
    """The torso share for a ring at `x`, INTERPOLATED between the table's stops.

    ★ THIS WAS AN EXACT DICT LOOKUP, AND A STATION THAT MISSED A KEY BY 0.010
    SILENTLY WEIGHTED 100% TO THE ARM BONE.

    Peaches' lesson says every arm station inboard of the deltoid needs a blend
    entry, or that fully-rotating ring sits next to an 88%-pinned one and shears
    the skin web into a triangular fin when the arm drops. The lesson was
    written; the ENFORCEMENT was `table.get(round(x, 3))`, which returns None for
    any station whose x is not a literal key — so obeying the lesson meant
    hand-matching two tables float for float, forever, in thirty files.

    Six kids did not: boomer, clover, cricket, gizmo, rocket and smokey each
    carry a station at x 0.335 while their table stops at 0.300 and 0.345 —
    missing by a hundredth of a foot. Smokey's independent critic found the fin
    in four clips ("unblended shoulder rings shear a triangular fin, tearing the
    sleeve in A-pose, idle, run and swing"); cropping Gizmo's A-pose showed the
    same wedge at the sleeve/torso junction.

    Interpolating removes the whole class. At an exact key it returns that key's
    value unchanged, so every character whose tables already lined up is
    byte-identical. Outside the table's span it still returns None — past the
    last stop the sleeve has cleared the body and the ring belongs wholly to the
    arm, which is what keeps the hand untouched.
    """
    if not table:
        return None
    stops = sorted(table)
    if x < stops[0] or x > stops[-1]:
        return None
    for lo, hi in zip(stops, stops[1:]):
        if lo <= x <= hi:
            if hi == lo:
                return table[lo]
            t = (x - lo) / (hi - lo)
            return table[lo] + t * (table[hi] - table[lo])
    return table[stops[-1]]


def _with_elbow(stations, amount: float):
    """The table with an elbow crease and knob folded in at `ARM_ELBOW_X`."""
    from .rig import ARM_ELBOW_X

    def at(x):
        # radius, colour and bone interpolated/held from the table at x.
        prev = None
        for st in stations:
            if st[0] >= x:
                if prev is None:
                    return st
                t = (x - prev[0]) / (st[0] - prev[0])
                return (x, prev[1] + (st[1] - prev[1]) * t, prev[2], prev[3] if x < ARM_ELBOW_X else st[3])
            prev = st
        return stations[-1]

    out = []
    # The crease sits 0.055 inboard of the knob: at 0.030 the two rings were
    # five board px apart at −7.5% and +15%, a built-in step that two critics
    # measured as "28 → 27 → 24 → 23 across six px" on the shoulder side.
    crease_x, knob_x = ARM_ELBOW_X - 0.055, ARM_ELBOW_X + 0.005
    # ★ A FORM NEEDS THREE RINGS TO ROUND IT (the knee's lesson, the same
    # day): a lone knob ring read as "a bead on a rod" on three kids at 8x.
    # A shoulder ring 0.040 outboard at half the swell makes it a bulge that
    # fades into the forearm.
    wanted = [(crease_x, 1.0 - amount * 0.5), (knob_x, 1.0 + amount), (knob_x + 0.040, 1.0 + amount * 0.5)]
    for x, r, colour, bone in stations:
        for wx, f in list(wanted):
            if abs(x - wx) < 0.012:
                # A station already sits here: reshape it instead of doubling.
                r = r * f
                colour = _crease_colour(colour) if f < 1.0 else colour
                wanted.remove((wx, f))
        out.append((x, r, colour, bone))
    for wx, f in wanted:
        _, r, colour, bone = at(wx)
        out.append((wx, r * f, _crease_colour(colour) if f < 1.0 else colour, bone))
    return sorted(out, key=lambda st: st[0])


def _crease_colour(colour):
    """The crease ring's colour with the OUTLINE HULL TAPERED.

    ★ THE RUNTIME OUTLINE IS AN INVERTED HULL, and a hull protrudes at a
    concavity: offset outward along the normals, the two flanks of a crease
    ring cross in front of the surface and draw a dark line down the pinch.
    Four critics read it — "a dark outline chevron at the crook", "a thin
    drawn fold stroke inside the bend", "the toon outliner traces the
    ribbing" (2026-09-02). The shader scales the hull's width by the vertex
    colour's ALPHA (asset contract mask.G; `materials/outline.ts`), so the
    ring that makes the concavity carries 0.5 and the hull stays inside it —
    0.35 thinned a 2.5 px line to nothing for two rows (darkest px 48 → 100,
    a critic's reading on Peaches); 0.5 keeps the stroke dark.
    The boards render no hull, so this is a runtime-still repair only.
    """
    return (colour[0], colour[1], colour[2], 0.5)


@part("arm")
def build_arm(
    builder: MeshBuilder,
    side: int,
    detail: int,
    *,
    spec: ArmSpec,
) -> None:
    """One stitched arm along the rig's own axis: sleeve, bare forearm, mitten.

    ★ ONE SURFACE, NOT THREE. The sleeve does not end and the arm begin — the
    same tube changes vertex colour at the hem. `sculptlib.mesh`'s `grid`
    docstring records why: a garment built as its own shell butted against the
    limb z-fights into the torn-paper edges Junebug's round-1 board showed.
    """
    sides = 12 if detail >= 2 else 6
    stations = list(spec.stations)
    stations = thin_for_lod(stations, detail)
    rows: list[list[int]] = []
    # ★ THE STATION TABLE MUST ASCEND, AND NOTHING USED TO CHECK. `grid` stitches
    # rows in the order it is handed them and cannot know one belongs earlier, so
    # a station out of order makes the strip travel outward, fold back, and
    # travel out again. That surface renders as a hard annulus with a dark centre
    # — the "bored socket" three independent reviews argued about, and the same
    # class as the leg table's non-monotonic z further down this file. Raising
    # SLEEVE_HEM_X past the elbow re-created it instantly, because the cuff
    # stations are written off SLEEVE_HEM_X and the elbow rings were literals.
    if spec.elbow > 0.0 and detail >= 2:
        stations = _with_elbow(stations, spec.elbow)
    for lower, upper in zip(stations, stations[1:]):
        assert upper[0] > lower[0], (
            f"arm stations must ascend in x: {lower[0]:.3f} is followed by {upper[0]:.3f}. "
            "A ring out of order folds the strip back on itself and renders as a "
            "bored socket — resort the table, do not nudge the value."
        )
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
        blend = shoulder_blend_at(spec.shoulder_blend, x)
        weight = bone_name if blend is None else {"Spine2": blend, bone_name: 1.0 - blend}
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            # Rings in the YZ plane, because the limb's axis is X.
            row.append(
                builder.vertex(
                    (x * side, radius * sin(theta), ARM_Z + radius * cos(theta) * spec.ring_squash),
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
    body_weight = {"Spine2": 0.94, shoulder_bone: 0.06}   # buried in the chest: it follows the body
    first = rows[0]
    if spec.root_ring > 0.0 and detail >= 1:
        # The root ring: body-weighted, at the cap's x, a little inside the
        # first ring — a strip from it to the first ring spans the rotation.
        r0 = stations[0][1] * spec.root_ring
        root = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            root.append(builder.vertex(
                (spec.cap_x * side, r0 * sin(theta), ARM_Z + r0 * cos(theta) * spec.ring_squash),
                spec.garment, body_weight, (0.75, 0.25),
            ))
        builder.grid([root, first], 1, flip=side > 0)
        first = root
        cap_x = spec.cap_x - 0.03
    else:
        cap_x = spec.cap_x
    cap = builder.vertex((cap_x * side, 0.0, ARM_Z), spec.garment, body_weight, (0.75, 0.25))
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (cap, first[nxt], first[index]) if side > 0 else (cap, first[index], first[nxt])
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
    tip = builder.vertex((spec.hand.tip_x * side, 0.0, ARM_Z), spec.skin, limb_bone("Hand", side), (0.75, 0.25))
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
        builder.part = "arm.fingers"      # a sub-part of the tally: MeshBuilder.part_report
        count = 3 if detail >= 2 else 2
        # ⚠️ SIZED AGAINST HIS PALM, NOT COPIED FROM HERS. The first cut used
        # Junebug's 0.026 radii on 0.050 centres and rendered three needles
        # sticking out of a mitt: her palm is a 0.166 x 0.096 ellipsoid and his
        # is a 0.134-radius tube, so the same digit is half the relative width
        # on him. His fingers span the palm — three across 0.27ft of hand — and
        # touch at their centres so the groove comes from the curvature, which
        # is the arrangement her note actually describes.
        offsets = spec.hand.finger_offsets[0] if count == 3 else spec.hand.finger_offsets[1]
        lengths = spec.hand.finger_lengths[0] if count == 3 else spec.hand.finger_lengths[1]
        for z_offset, length in zip(offsets, lengths):
            root = spec.hand.finger_root
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
            widths = list(spec.hand.finger_widths)
            # flip on the mirrored side: see `tube`'s own docstring — the
            # frame follows the tangent, and only a flipped traversal gives
            # the left hand the exact mirror of the right, normals included.
            builder.tube(spine, widths, 0, spec.skin, limb_bone("HandIndex1", side), 5,
                         flip=side < 0)
        # The thumb is the one digit that leaves the mass, and at 40px it is
        # most of what makes a hand read as a hand. Its spine is authored in
        # the character's spec because a hand is sized to its owner; the
        # convention it must obey — FORWARD IS -y — is the package doc's.
        builder.tube(
            [(x * side, y, ARM_Z + dz) for x, y, dz in spec.hand.thumb_spine],
            list(spec.hand.thumb_widths),
            0, spec.skin, limb_bone("HandThumb1", side), 5,
            flip=side < 0,
        )
