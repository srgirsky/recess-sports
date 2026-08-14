"""`build_leg`: shorts, bare shin and sock as one stitched surface.

★ WHY THIS IS SHARED. Like the arm, every finding here is about how a leg is
BUILT rather than whose leg it is: the garment and the limb are one surface that
changes vertex colour at the hem, the section carries its own DEPTH factor
because a leg is round below the hem and a short is baggy above it, and the
stations must descend strictly in z — a table that turns back up the leg is
stitched faithfully in the order given and renders a sock floating over a strip
of bare shin, which is what shipped once.

★ THE SIX RIG CONSTANTS ARE NOT MEASUREMENTS. `leg_x` interpolates the lateral
centre of the leg along the canonical bone chain, and the chain is the same for
all thirty characters: `LeftUpLeg` at x -0.200, `LeftLeg` at -0.292 and
`LeftFoot` at -0.378, at z 1.600, 0.824 and 0.095. Those are the cumulative bone
positions `src/v2/render/skeleton.ts` declares — `1.600 - 0.776 = 0.824` and
`0.824 - 0.729 = 0.095` are its own offsets — so `leg_x` reads no character's
table and is a plain function rather than a spec callable.

★ WHAT STAYS WITH THE CHARACTER. The station table, and `inseam_half` — the
daylight the concept draws between the shorts legs, which is that kid's crotch
height and hem gap and nothing general. It is a callable for the same reason
`ShoeSpec.sole_profile` is: the shape of the curve is construction, the numbers
in it are a measurement.

⚠️ AND THE STATION TABLE'S WIDTHS CANNOT BE RE-CHECKED WITH `halfWidthAt`. On a
standing figure the legs touch, so the silhouette spans both — 0.6589 where one
leg is 0.3178 on Tank's sheet. Use `regionRunsAt` and read the runs by name.
`runidentity.lint.test.js` is the gate for that whole class of error.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from math import cos, pi, sin

from .mesh import MeshBuilder
from .rig import (
    LEG_ANKLE_X, LEG_ANKLE_Z, LEG_HIP_X, LEG_HIP_Z, LEG_KNEE_X, LEG_KNEE_Z,
    limb_bone,
)




@dataclass(frozen=True)
class LegSpec:
    """One character's leg, as traced off their turnaround."""

    # (z, half-width, depth factor, colour, bone) — STRICTLY DESCENDING in z.
    stations: tuple[tuple[float, float, float, tuple, str], ...]
    # z -> half the daylight between the shorts legs. Zero at and above the
    # crotch, opening toward the hem.
    inseam_half: Callable[[float], float]

    garment: tuple     # the shorts
    sock: tuple
    team_mask: tuple   # the sock's roll-top, the one team-accent surface here


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


def build_leg(
    builder: MeshBuilder,
    side: int,
    detail: int,
    *,
    spec: LegSpec,
) -> None:
    """Shorts, bare shin and sock as one stitched surface."""
    sides = 14 if detail >= 2 else 6
    stations = list(spec.stations)
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
        materials.append(3 if colour == spec.team_mask else 1)
        # The inward reach that leaves the concept's inseam. `min` so a ring
        # already clear of the centreline — every bare-shin and sock ring — is
        # left exactly as it was; only the garment is ever clamped.
        inner_radius = min(radius, leg_x(z) - spec.inseam_half(z))
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
    top = builder.vertex((leg_x(1.600) * side, 0.0, 1.600), spec.garment, limb_bone("UpLeg", side))
    ankle_cap = builder.vertex((leg_x(0.150) * side, 0.0, 0.150), spec.sock, limb_bone("Foot", side))
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (ankle_cap, rows[-1][index], rows[-1][nxt]) if side > 0 else (ankle_cap, rows[-1][nxt], rows[-1][index])
        builder.face(face, 1)
    for index in range(sides):
        nxt = (index + 1) % sides
        face = (top, rows[0][index], rows[0][nxt]) if side > 0 else (top, rows[0][nxt], rows[0][index])
        builder.face(face, 1)
