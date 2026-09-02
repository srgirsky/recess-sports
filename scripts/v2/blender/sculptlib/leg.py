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
from math import cos, exp, pi, sin

from .mesh import MeshBuilder, part, thin_for_lod
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
    # ★ A KNEE IS A CAP AND A HOLLOW, NOT A TAPER — the leg's twin of
    # `ArmSpec.elbow`. Eight critics read the shin as "a straight untapered
    # pipe" or "a dowel from knee to ankle": every table runs through the
    # rig's `LEG_KNEE_Z` with widths that only shrink. This is the joint's
    # form as a fraction of the local width: a ring 0.035 above the knee
    # swollen by all of it (the kneecap) and a ring 0.030 below pinched by
    # half (the hollow the shin leaves under it), interpolated off the table
    # so the tables stay the trace. 0.0 keeps the taper; stated by every
    # script, never defaulted (sculpt-sharing.lint).
    knee: float
    # ★ THE CALF IS A PROFILE SHAPE, NOT A WIDER RING. Every sheet draws the
    # calf as the leg's biggest form BEHIND the shin, and a wider station
    # cannot draw it: the front board sees the width, the profile sees front
    # and back extents, and a symmetric ring (or a deeper one — Clover's
    # depth 1.08 gave +5.6% against the sheet's +21%, a critic's measurement,
    # 2026-09-02) fattens both. This is (z, rear factor): the BACK half of
    # every ring near `z` is deepened by `rear` × a Gaussian (σ 0.07 ft) of
    # its distance, so the belly sits behind the calf and fades into the knee
    # and the ankle. (0.0, 0.0) keeps the ring; stated by every script.
    calf: tuple[float, float]


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


def _with_knee(stations, amount: float):
    """The table with a kneecap and the hollow under it folded in at `LEG_KNEE_Z`."""
    from .rig import LEG_KNEE_Z

    def at(z):
        # width and depth interpolated, colour and bone held from the station above.
        prev = None
        for st in stations:  # descending in z
            if st[0] <= z:
                if prev is None:
                    return st
                t = (prev[0] - z) / (prev[0] - st[0])
                return (z, prev[1] + (st[1] - prev[1]) * t, prev[2] + (st[2] - prev[2]) * t, prev[3], prev[4])
            prev = st
        return stations[-1]

    cap_z, hollow_z = LEG_KNEE_Z + 0.035, LEG_KNEE_Z - 0.030
    # ★ A FORM NEEDS THREE RINGS TO ROUND IT. One cap ring between stations
    # 0.12 ft apart read as "a collar with hard corners" on Boomer's chunky
    # leg (a critic, 2026-09-02): the loft ramps straight up to the cap and
    # straight down to the hollow. A shoulder ring 0.040 above the cap at half
    # the swell turns the ridge into a bump that softens into the thigh.
    wanted = [(cap_z + 0.040, 1.0 + amount * 0.5), (cap_z, 1.0 + amount), (hollow_z, 1.0 - amount * 0.5)]
    # The hollow ring tapers the runtime outline hull (alpha 0.5), for the
    # reason `arm._crease_colour` records: an inverted hull draws a dark line
    # down every concave ring it is not tapered at ("the toon outliner traces
    # the ribbing" — Peaches' critic, 2026-09-02).
    from .arm import _crease_colour

    out = []
    for z, half, depth, colour, bone in stations:
        for wz, f in list(wanted):
            if abs(z - wz) < 0.012:
                half = half * f
                colour = _crease_colour(colour) if f < 1.0 else colour
                wanted.remove((wz, f))
        out.append((z, half, depth, colour, bone))
    for wz, f in wanted:
        _, half, depth, colour, bone = at(wz)
        out.append((wz, half * f, depth, _crease_colour(colour) if f < 1.0 else colour, bone))
    return sorted(out, key=lambda st: -st[0])


@part("leg")
def build_leg(
    builder: MeshBuilder,
    side: int,
    detail: int,
    *,
    spec: LegSpec,
) -> None:
    """Shorts, bare shin and sock as one stitched surface."""
    sides = 12 if detail >= 2 else 6
    stations = list(spec.stations)
    if spec.knee > 0.0 and detail >= 2:
        stations = _with_knee(stations, spec.knee)
    stations = thin_for_lod(stations, detail)
    rows: list[list[int]] = []
    materials: list[int] = []
    for z, radius, depth, colour, bone in stations:
        bone_name = limb_bone(bone, side)
        # ★ THE ACCENT RIDES THE SAME SURFACE. Its rows change MATERIAL, not
        # mesh: a separate band welded on is the detached shell 3.7 just caught
        # on the shoe. `grid` is emitted per row-pair, and a pair goes to
        # M_Accessory only when BOTH its rows are accent-coloured — so an
        # accent needs two adjacent stations (Grizz's roll: top edge plus the
        # fattest ring). A lone accent station makes no accessory geometry,
        # the exporter drops the unused material, and the finished-work gate
        # refuses the character (Mimi, 2026-09-01).
        materials.append(3 if colour == spec.team_mask else 1)
        # The inward reach that leaves the concept's inseam. `min` so a ring
        # already clear of the centreline — every bare-shin and sock ring — is
        # left exactly as it was; only the garment is ever clamped.
        inner_radius = min(radius, leg_x(z) - spec.inseam_half(z))
        # The calf belly: the rear half only (forward is -y, so sin > 0 is
        # the back), at LOD0/1 where the ring has a back to deepen.
        calf_z, calf_rear = spec.calf
        rear = 1.0 + calf_rear * exp(-((z - calf_z) / 0.07) ** 2 / 2) if calf_rear > 0.0 and detail >= 1 else 1.0
        # The kneecap is a FRONT form: `_with_knee` swells its ring all round
        # (the front board wants the width), so the back half gives the
        # swell back here — a knee that bulges behind as much as in front
        # read as "a turned baluster" in profile (a critic, 2026-09-02).
        if spec.knee > 0.0 and abs(z - (LEG_KNEE_Z + 0.035)) < 1e-6:
            rear = rear / (1.0 + spec.knee)
        # ...and the shoulder ring above it gives back its half-swell the same
        # way, or the forward-only rule leaves a bump behind the knee (a
        # critic's latent note on Clover, +1 px; a chunky knee would show it).
        if spec.knee > 0.0 and abs(z - (LEG_KNEE_Z + 0.075)) < 1e-6:
            rear = rear / (1.0 + spec.knee * 0.5)
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            # cos > 0 is the OUTER half for both sides, because the ring is
            # reflected whole (see below), so one predicate serves both legs.
            radius_x = radius if cos(theta) >= 0.0 else inner_radius
            depth_y = depth * (rear if sin(theta) > 0.0 else 1.0)
            row.append(
                builder.vertex(
                    # ★ THE WHOLE RING IS REFLECTED, not just its centre. Writing
                    # `cx + r*cos(theta)` with `cx = leg_x*side` mirrors where the
                    # leg IS and not which way round it is built, so the far leg
                    # is the near leg translated — the same defect `shoe_place`
                    # had. The board showed it as one shin lit and the other in
                    # shadow at the same height, which three reviews read as a
                    # colour difference between the socks.
                    ((leg_x(z) + radius_x * cos(theta)) * side, radius * sin(theta) * depth_y, z),
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
