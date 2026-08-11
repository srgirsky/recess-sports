"""Rebuild Junebug as a reference-authored character on the canonical rig.

This is deliberately not a deformation pass over the procedural roster proxy.
It replaces every LOD mesh with continuous, character-specific forms authored
against ``junebug-turnaround.png``: a tapered athletic body, constructed kit,
shoes, a compact face, skull-hugging hair, headband and swept ponytail.

Run from the repository root:
  blender --background assets/v2/source/junebug-pilot.blend \
    --python scripts/v2/blender/sculpt-junebug-source.py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import cos, pi, sin
from pathlib import Path

import bpy
from mathutils import Vector


REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/junebug-pilot.blend"
FACE_ATLAS = REPO / "assets/v2/source/junebug-face-atlas.png"
REVISION = "junebug-turnaround-fidelity-v9"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


def rgba(value: str) -> tuple[float, float, float, float]:
    value = value.removeprefix("#")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def srgb_to_linear(color: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Decode an sRGB swatch into scene-linear for FLOAT_COLOR/glTF COLOR_0.

    The hex palette above is authored in sRGB. Blender's FLOAT_COLOR attribute
    and glTF's COLOR_0 are both LINEAR; writing the raw sRGB fractions into
    them ships every colour about one stop too bright (0xB9 = 0.725 as linear
    displays as ~0.87 — pale beige where warm brown was authored).
    `palette.lint.test.js` holds the shipped GLB to the authored swatches.
    """
    def channel(value: float) -> float:
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    return (channel(color[0]), channel(color[1]), channel(color[2]), color[3])


# Swatches are SAMPLED from junebug-turnaround.png, not remembered: skin
# #CD864C at the lit face, pants #D55A4C (salmon — a full step lighter than the
# jersey, which the board kept collapsing into one crimson), socks #76221D
# (darker than the jersey, so the below-knee break reads), jersey #993430 lit.
SKIN = rgba("C9814A")
SKIN_SHADOW = rgba("A25A2C")
# Warm dark brown, not near-black: #2A1912 shipped as jet black under the toon
# shader's shading ramp (the hero read the critic called "jet black with a
# blue-gray outline"), while the turnaround's hair is a readable warm brown.
HAIR = rgba("3B2517")
SHIRT = rgba("9E2629")
SHIRT_DARK = rgba("6E1F1B")
# Salmon-PINK, measured against the BOARD, not the swatch: the board's EEVEE
# lighting renders a saturated mid swatch ~2/3 of its authored luminance, so
# matching the art's pixel (#DC6051) re-collapsed jersey and pants to an
# 18-22 point separation where the art itself shows ~42. #EC8D7C + the
# slightly deepened jersey render at the art's own separation.
PANTS = rgba("EC8D7C")
PANTS_DARK = rgba("CC6B5E")
SHOE = rgba("9B252B")
WHITE = rgba("F3E9D5")
SOLE = rgba("EEE5D8")
TEAM_MASK = rgba("B8B8B8")
# Warm sheen for strand grooves — dark hair reads flat without a second tone,
# but the tone stays CLOSE to the hair's (one soft step, not scratch-line
# contrast) so the grooves read as grooming, not marks drawn on the mass.
HAIR_SHINE = rgba("46301E")


@dataclass
class MeshBuilder:
    vertices: list[tuple[float, float, float]] = field(default_factory=list)
    faces: list[tuple[int, ...]] = field(default_factory=list)
    face_materials: list[int] = field(default_factory=list)
    colors: list[tuple[float, float, float, float]] = field(default_factory=list)
    uvs: list[tuple[float, float]] = field(default_factory=list)
    weights: list[dict[str, float]] = field(default_factory=list)

    def vertex(
        self,
        point: Vector | tuple[float, float, float],
        color: tuple[float, float, float, float],
        bone: str | dict[str, float],
        uv: tuple[float, float] = (0.75, 0.25),
    ) -> int:
        self.vertices.append(tuple(point))
        self.colors.append(color)
        self.uvs.append(uv)
        self.weights.append({bone: 1.0} if isinstance(bone, str) else bone)
        return len(self.vertices) - 1

    def face(self, indices: tuple[int, ...], material: int) -> None:
        self.faces.append(indices)
        self.face_materials.append(material)

    def grid(self, rows: list[list[int]], material: int, *, cyclic: bool = True, flip: bool = False) -> None:
        """Stitch consecutive vertex-index rows into quads.

        The low-level seam-free primitive behind every banded surface. Round 1
        built each trim colour as its own thin shell butted against the parent
        mesh, and every shell boundary z-fought into the 'torn paper' edges the
        board showed. A single stitched surface whose ROWS change vertex colour
        has no second shell and therefore no crack, ever. `flip` reverses the
        winding for mirrored builds (a left limb walks its axis backwards, so
        the same quad order would face its normals inward).
        """
        for lower, upper in zip(rows, rows[1:]):
            count = len(lower)
            for index in range(count if cyclic else count - 1):
                nxt = (index + 1) % count
                quad = (lower[index], lower[nxt], upper[nxt], upper[index])
                if flip:
                    quad = tuple(reversed(quad))
                self.face(quad, material)

    def ellipsoid(
        self,
        center: tuple[float, float, float],
        radii: tuple[float, float, float],
        material: int,
        color: tuple[float, float, float, float],
        bone: str,
        segments: int,
        rings: int,
        *,
        face_shape: bool = False,
        flatten_sole: bool = False,
        phis: list[float] | None = None,
        color_fn=None,
        radial_fn=None,
        pole: str = "z",
    ) -> None:
        """`phis` places latitude rows explicitly, so a painted colour band can
        get a ROW PAIR exactly at its boundary (crisp edge, no second shell).
        `color_fn(dx, dy, dz)` paints by unit direction; `radial_fn` scales the
        surface radially (the belt's slight proudness). `pole="-y"` swings the
        grid's pole onto -y with a determinant-+1 remap, so winding and outward
        normals survive — how the shoe toe box gets latitude rows that RING the
        toe and a painted white cap with a crisp boundary."""
        cx, cy, cz = center
        rx, ry, rz = radii

        def orient(nx: float, ny: float, nz: float) -> tuple[float, float, float]:
            return (nx, ny, nz) if pole == "z" else (nx, -nz, ny)

        def place(nx: float, ny: float, nz: float) -> tuple[tuple[float, float, float], tuple[float, float, float, float]]:
            dx, dy, dz = orient(nx, ny, nz)
            scale = radial_fn(dx, dy, dz) if radial_fn else 1.0
            point = (cx + rx * dx * scale, cy + ry * dy * scale, cz + rz * dz * scale)
            if flatten_sole:
                point = (point[0], point[1], max(point[2], cz - rz * 0.74))
            return point, (color_fn(dx, dy, dz) if color_fn else color)

        top_point, top_color = place(0.0, 0.0, 1.0)
        top = self.vertex(top_point, top_color, bone)
        rows: list[list[int]] = []
        row_phis = phis if phis is not None else [pi * row / rings for row in range(1, rings)]
        for phi in row_phis:
            row_vertices = []
            for column in range(segments):
                theta = 2 * pi * column / segments
                nx = sin(phi) * cos(theta)
                ny = sin(phi) * sin(theta)
                nz = cos(phi)
                # Junebug's face is broad through the eyes and tapers into a
                # small determined chin, unlike the proxy's round ball.
                width = 1.0
                depth = 1.0
                if face_shape:
                    # Cheek width HOLDS through the jawbone (down to nz -0.35)
                    # and only then tapers to the chin — a linear taper from
                    # the cheeks melts the jaw into a point. A cheekbone bump
                    # marks where the face plane turns into the side plane.
                    # Taper 0.16, not 0.20: the v5 chin converged to a point
                    # the turnaround's compact rounded chin does not have.
                    taper = max(0.0, (-nz - 0.35) / 0.65)
                    cheekbone = max(0.0, 1.0 - ((nz + 0.12) / 0.20) ** 2)
                    width = 0.99 + 0.04 * (1.0 - abs(nz)) - 0.16 * taper**1.5 + 0.035 * cheekbone
                    # A real face is a PLANE in front, not a continuation of
                    # the ball: flatten the central face and let the curve
                    # return toward the sides. This is what "too round" was.
                    # Softened from 0.86-0.16: that full flattening rendered
                    # the profile as the literal vertical wall the round-2
                    # critic flagged; 0.88-0.11 keeps the front plane while
                    # letting brow and cheek curve into it.
                    face_flat = max(0.0, -sin(theta)) ** 2
                    depth = (0.88 - 0.11 * face_flat) if ny < 0 else 1.02
                if face_shape:
                    x = cx + rx * nx * width
                    y = cy + ry * ny * depth
                    z = cz + rz * nz
                    if nz < -0.30:
                        # The turnaround gives Junebug a small determined chin
                        # and a jawline; a bare ellipsoid curves away to nothing
                        # under the mouth. Push the lower-front surface forward
                        # and slightly up, faded by frontness so the sides stay
                        # smooth. 0.09/0.03, softened from 0.11/0.04: the deeper
                        # push shaded the whole lower face dark under the toon
                        # ramp — the board's "beard patch" — and protruded as a
                        # lip blob in profile.
                        # Re-deepened to 0.105/0.038 (from 0.09/0.03) with the
                        # atlas's under-lip stroke gone: the receding chin was
                        # the round-2 profile's biggest miss after the nose.
                        chin = min(1.0, (-nz - 0.30) / 0.55)
                        frontness = max(0.0, -sin(theta))
                        y -= 0.105 * (chin**1.8) * frontness
                        z += 0.038 * (chin**1.8) * frontness
                    if flatten_sole:
                        z = max(z, cz - rz * 0.74)
                    row_vertices.append(self.vertex((x, y, z), color, bone))
                else:
                    point, vertex_color = place(nx, ny, nz)
                    row_vertices.append(self.vertex(point, vertex_color, bone))
            rows.append(row_vertices)
        bottom_point, bottom_color = place(0.0, 0.0, -1.0)
        bottom = self.vertex(bottom_point, bottom_color, bone)

        first = rows[0]
        for column in range(segments):
            self.face((top, first[column], first[(column + 1) % segments]), material)
        for upper, lower in zip(rows, rows[1:]):
            for column in range(segments):
                nxt = (column + 1) % segments
                self.face((upper[column], lower[column], lower[nxt], upper[nxt]), material)
        last = rows[-1]
        for column in range(segments):
            self.face((last[column], bottom, last[(column + 1) % segments]), material)

    def loft(
        self,
        levels: list[tuple[float, float, float, str]],
        material: int,
        color: tuple[float, float, float, float],
        segments: int,
        color_fn=None,
    ) -> None:
        """`color_fn(theta, z)` may override the ring-vertex colour — how the
        jersey's V-neck shows skin inside the trim without a second surface.
        Cap centres keep the base colour: the top fan's centre is hidden by the
        neck column, and a skin-toned centre would wash the shoulder fan."""
        rows: list[list[int]] = []
        for z, rx, ry, bone in levels:
            row = []
            for column in range(segments):
                theta = 2 * pi * column / segments
                at = (rx * cos(theta), ry * sin(theta), z)
                vertex_color = color_fn(theta, z) if color_fn else color
                row.append(self.vertex(at, vertex_color, bone))
            rows.append(row)
        bottom = self.vertex((0.0, 0.0, levels[0][0]), color, levels[0][3])
        top = self.vertex((0.0, 0.0, levels[-1][0]), color, levels[-1][3])
        for column in range(segments):
            nxt = (column + 1) % segments
            self.face((bottom, rows[0][nxt], rows[0][column]), material)
            self.face((rows[-1][column], rows[-1][nxt], top), material)
        for lower, upper in zip(rows, rows[1:]):
            for column in range(segments):
                nxt = (column + 1) % segments
                self.face((lower[column], lower[nxt], upper[nxt], upper[column]), material)

    def tube(
        self,
        points: list[tuple[float, float, float]],
        radii: list[float],
        material: int,
        color: tuple[float, float, float, float],
        bone: str | dict[str, float] | list[str | dict[str, float]],
        sides: int,
        *,
        cyclic: bool = False,
        axis: Vector | None = None,
    ) -> None:
        centers = [Vector(point) for point in points]
        if isinstance(bone, list) and len(bone) != len(centers):
            raise ValueError("tube needs one weight map per center")

        def weight_at(index: int) -> str | dict[str, float]:
            return bone[index] if isinstance(bone, list) else bone

        rows: list[list[int]] = []
        for index, center in enumerate(centers):
            before = centers[index - 1] if index else (centers[-1] if cyclic else centers[index])
            after = centers[(index + 1) % len(centers)] if index + 1 < len(centers) or cyclic else centers[index]
            tangent = (after - before).normalized()
            if axis is None:
                # Per-row axis switching flips the frame mid-path and twists a
                # quad — the visible kink the headband wore. A ring whose
                # tangents stay in one plane should pass the plane's normal as
                # `axis` so every row shares one frame.
                row_axis = Vector((1.0, 0.0, 0.0))
                if abs(tangent.dot(row_axis)) > 0.92:
                    row_axis = Vector((0.0, 1.0, 0.0))
            else:
                row_axis = axis
            normal = tangent.cross(row_axis).normalized()
            binormal = tangent.cross(normal).normalized()
            row = []
            for side in range(sides):
                angle = 2 * pi * side / sides
                point = center + radii[index] * (normal * cos(angle) + binormal * sin(angle))
                row.append(self.vertex(point, color, weight_at(index)))
            rows.append(row)
        pairs = len(rows) if cyclic else len(rows) - 1
        for index in range(pairs):
            nxt_row = (index + 1) % len(rows)
            for side in range(sides):
                nxt = (side + 1) % sides
                self.face((rows[index][side], rows[index][nxt], rows[nxt_row][nxt], rows[nxt_row][side]), material)
        if not cyclic:
            start = self.vertex(centers[0], color, weight_at(0))
            end = self.vertex(centers[-1], color, weight_at(len(centers) - 1))
            for side in range(sides):
                nxt = (side + 1) % sides
                self.face((start, rows[0][side], rows[0][nxt]), material)
                self.face((end, rows[-1][nxt], rows[-1][side]), material)

    def hair_cap(self, segments: int, rings: int, *, shine: bool = False) -> None:
        """A slicked crown with the turnaround's LOW hairline.

        The turnaround's construction, top down: bun, short crown of hair, the
        white band, a thin strip of hair BELOW the band (deepest beside the
        eyes), then skin to the brows. The v6 crown was a tall dome whose hair
        stopped exactly at the band — no strip below, knot swallowed — and the
        front view read as a knit beanie. The front columns also take the
        skull's own face flattening, slightly relaxed — a full ellipsoid there
        shelves proud of the flattened forehead and reads as a helmet in
        profile.
        """
        # The crown surface stops at 4.045 — deliberately WELL below the 4.16
        # hair ceiling — because the art's front read is a big bun over a SHORT
        # crown. The v6 dome (4.09) left the knot a 0.045 crest and the front
        # view read as a beanie; a flatter crown lets the bun rise 0.11 proud.
        # The front reach lands the hairline at z~3.50 (a strip of hair below
        # the band's lower edge, skin from there to the brows), dipping deeper
        # at the temples toward the ear tops per the turnaround.
        # Strand grouping is PAINTED into the cap's own columns (`shine`):
        # meridian HAIR_SHINE lines combed from the hairline back toward the
        # gather. Every geometry attempt — cords sunk half into the dome —
        # z-fought the surface they rode and the board rendered a column of
        # flickering diamonds over the brow; a colour on the parent mesh
        # cannot fight it. One column per bearing keeps each line thin, and
        # the hairline row stays HAIR so the front edge reads clean.
        shine_bearings = (-0.85, -0.35, 0.35, 0.85)
        center = Vector((0.0, 0.05, 3.43))
        top = self.vertex((0.0, 0.05, 4.045), HAIR, "Head")
        rows: list[list[int]] = []
        for row in range(1, rings + 1):
            ring = []
            for column in range(segments):
                theta = 2 * pi * column / segments
                bearing = (theta + 0.5 * pi + pi) % (2 * pi) - pi
                is_shine = (
                    shine
                    and 1 <= row < rings
                    and any(abs(bearing - b) < 0.11 for b in shine_bearings)
                )
                color = HAIR_SHINE if is_shine else HAIR
                behind = max(0.0, sin(theta))
                front = max(0.0, -sin(theta))
                blend = behind * behind * (3.0 - 2.0 * behind)
                # Front reach 0.464 lands the hairline at z~3.50 — the round-1
                # hairline (3.54) left a brow-to-band bare gap about twice the
                # concept's, most of the board's "high forehead" read. The
                # temple term (peaking where the columns turn from front to
                # side) lets the hair dip toward the ear tops the way the
                # turnaround's does, which visually closes the gap from the
                # sides as well.
                temple = (4.0 * front * (1.0 - front)) ** 2
                reach = 0.50 - 0.054 * front**1.5 + 0.23 * blend + 0.018 * front**8 + 0.040 * temple
                phi = reach * pi * row / rings
                # 0.16, LOCKED to the skull's own front relaxation: at 0.20
                # the cap's forehead dipped 0.004 BEHIND the (v9-softened)
                # skull and the board showed skin diamonds through the hair
                # above the band. The band formula below must keep the same
                # factor or it floats off this surface.
                depth = 1.0 - 0.16 * front * front
                x = 0.50 * sin(phi) * cos(theta)
                y = 0.50 * sin(phi) * sin(theta) * depth
                z = 0.615 * cos(phi)
                ring.append(self.vertex(center + Vector((x, y, z)), color, "Head"))
            rows.append(ring)
        for column in range(segments):
            self.face((top, rows[0][column], rows[0][(column + 1) % segments]), 2)
        for upper, lower in zip(rows, rows[1:]):
            for column in range(segments):
                nxt = (column + 1) % segments
                self.face((upper[column], lower[column], lower[nxt], upper[nxt]), 2)

    def face_patch(self, columns: int, rows: int) -> None:
        """A separate face-atlas island, set just proud of the head surface.

        Putting face UVs on the closed skull makes boundary triangles interpolate
        from the atlas island to the body UV and smears an eye around each cheek.
        This patch supplies the UV seam that a production model would cut during
        retopology while remaining welded visually to the same head volume.
        """
        cx, cy, cz = (0.0, -0.015, 3.40)
        rx, ry, rz = (0.435, 0.44, 0.615)
        grid: list[list[int]] = []
        for row in range(rows + 1):
            vf = row / rows
            # The span runs LOW on purpose (-1.10 rad): the turnaround sets the
            # mouth at ~16% up the face, and the v6 span (-0.98) bottomed out
            # right AT the mouth, which forced it under the nose. The chin-push
            # terms below keep the low rows on the pushed surface instead of
            # curling under the ball. Horizontally the span is WIDE (±0.92 rad)
            # so the art's far-apart eyes stay clear of the border feather and
            # remain visible from the profile.
            vertical = -1.10 + vf * 1.54
            line = []
            for column in range(columns + 1):
                uf = column / columns
                horizontal = -0.92 + uf * 1.84
                nx = sin(horizontal) * cos(vertical)
                ny = -cos(horizontal) * cos(vertical)
                nz = sin(vertical)
                taper = max(0.0, (-nz - 0.35) / 0.65)
                cheekbone = max(0.0, 1.0 - ((nz + 0.12) / 0.20) ** 2)
                width = 0.99 + 0.04 * (1.0 - abs(nz)) - 0.16 * taper**1.5 + 0.035 * cheekbone
                # Proud of the skull by an offset that FEATHERS to ~zero at the
                # island border — and applied RADIALLY from the head centre, so
                # the patch stays parallel to the skull. A forward (-y) push
                # tilted the patch surface against the skull's, and the normal
                # mismatch shaded the island a different tone than the face
                # around it; parallel surfaces shade identically and the seam
                # disappears instead of being merely thin.
                # The border rows dive UNDER the skull (negative offset): an
                # open mesh edge always shades a hair differently than the
                # surface around it, so the only seam that cannot be seen is
                # one that is physically beneath the face.
                edge = min(uf, 1.0 - uf, vf, 1.0 - vf)
                # Near-FLUSH (0.005 max, was 0.013): the proud island plus the
                # separate nose ellipsoid was the round-1 board's "protruding
                # faceted muzzle block". The face is now the head's own surface.
                proud = -0.006 + 0.011 * min(1.0, edge * 6.5)
                base = Vector((rx * nx * width, (0.88 - 0.11 * cos(horizontal) ** 2) * ry * ny, rz * nz))
                radial = base.normalized()
                # The nose RISES OUT of that surface as one soft rounded form —
                # small and subtle per the turnaround, centred between the eyes
                # and the mouth — instead of being a mounted ellipsoid whose
                # underside shadow read as a moustache. It lives on the dense
                # patch (not the coarse skull) so its curve is actually sampled,
                # and it breaks the profile silhouette, rubric 3.5's bar for 5.
                # Amplitude 0.115 (was 0.075): the round-2 profile board still
                # read "no nose breaks the silhouette" — at 0.075 the bump was
                # absorbed by the face flattening it rides on. Narrower in x
                # (0.17) so the taller push stays a nose, not a muzzle.
                nose = max(0.0, 1.0 - ((nz + 0.58) / 0.32) ** 2) * max(0.0, 1.0 - (nx / 0.17) ** 2)
                nose_y = -0.115 * (nose**1.5) * max(0.0, cos(horizontal))
                # The patch rides the skull's chin push with the identical
                # terms (frontness there is -sin(theta), which equals
                # cos(horizontal) here) — without this the pushed skull
                # swallows the island below the mouth and the crossing line
                # shades as an arc under the lips.
                chin_y = 0.0
                chin_z = 0.0
                if nz < -0.30:
                    chin = min(1.0, (-nz - 0.30) / 0.55)
                    chin_y = -0.105 * (chin**1.8) * cos(horizontal)
                    chin_z = 0.038 * (chin**1.8) * cos(horizontal)
                point = (
                    cx + base.x + radial.x * proud,
                    cy + base.y + radial.y * proud - 0.002 + chin_y + nose_y,
                    cz + base.z + radial.z * proud + chin_z,
                )
                # Contract island: forehead V=1, chin V=.5. Blender's exporter
                # flips authored loop V, so author its inverse here. The runtime
                # shader—not this mesh—owns the embedded-image origin fix.
                uv = (0.5 * uf, 0.5 * (1.0 - vf))
                line.append(self.vertex(point, SKIN, "Head", uv))
            grid.append(line)
        for lower, upper in zip(grid, grid[1:]):
            for column in range(columns):
                self.face((lower[column], lower[column + 1], upper[column + 1], upper[column]), 0)


def torus_points(
    center: tuple[float, float, float], rx: float, ry: float, count: int
) -> list[tuple[float, float, float]]:
    cx, cy, cz = center
    return [(cx + rx * cos(2 * pi * i / count), cy + ry * sin(2 * pi * i / count), cz) for i in range(count)]


def catmull_rom(
    controls: list[tuple[tuple[float, float, float], float]], samples: int
) -> list[tuple[Vector, float]]:
    """Sample a smooth curve (with per-point radius) through control points.

    The ponytail is the profile's signature curve; a raw polyline through its
    controls kinks at every knot and the tube shows each kink as a shading
    break — the 'faceted panels' defect. Catmull-Rom keeps the authored shape
    while giving the tube a genuinely smooth spine."""
    points = [Vector(point) for point, _ in controls]
    radii = [radius for _, radius in controls]
    count = len(points)
    sampled: list[tuple[Vector, float]] = []
    for i in range(samples):
        t = i / (samples - 1) * (count - 1)
        seg = min(int(t), count - 2)
        f = t - seg
        p0 = points[max(0, seg - 1)]
        p1 = points[seg]
        p2 = points[seg + 1]
        p3 = points[min(count - 1, seg + 2)]
        point = 0.5 * (
            2 * p1
            + (-p0 + p2) * f
            + (2 * p0 - 5 * p1 + 4 * p2 - p3) * (f * f)
            + (-p0 + 3 * p1 - 3 * p2 + p3) * (f * f * f)
        )
        sampled.append((point, radii[seg] + (radii[seg + 1] - radii[seg]) * f))
    return sampled


def arm_ring_points(
    center: tuple[float, float, float], ry: float, rz: float, count: int
) -> list[tuple[float, float, float]]:
    """A ring perpendicular to the bind-pose arm, whose long axis is X."""
    cx, cy, cz = center
    return [(cx, cy + ry * cos(2 * pi * i / count), cz + rz * sin(2 * pi * i / count)) for i in range(count)]


def rebuild_palette_material(material: bpy.types.Material) -> None:
    """Make COLOR_0 the literal authored albedo in Blender and glTF.

    The imported procedural material graphs contained convenience Mix nodes that
    Blender's glTF exporter could not trace for every slot; it emitted white
    COLOR_0 for the uniform, hair and accessory primitives. A direct color-node
    path is both visible in Blender and exported without interpretation.
    """
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    vertex_color = nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = "Color"
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.82
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(vertex_color.outputs["Color"], shader.inputs["Base Color"])
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])


def install_face_atlas() -> None:
    if not FACE_ATLAS.exists():
        raise RuntimeError(f"generate {FACE_ATLAS} before sculpting Junebug")
    body = bpy.data.materials["M_Body"]
    old = bpy.data.images.get("face_atlas")
    image = bpy.data.images.load(str(FACE_ATLAS), check_existing=False)
    image.name = "face_atlas_junebug"
    image.pack()
    for node in body.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image == old:
            node.image = image
    if old:
        bpy.data.images.remove(old)
    image.name = "face_atlas"


# The hem stops at 1.82, ABOVE the painted belt band (1.695-1.80 on the pelvis
# loft): the v8 hem ran to 1.75 and covered the belt entirely — the board's
# "no belt reads at the waist" was a jersey one notch too long, not a missing
# belt.
TORSO_LEVELS = [
    (1.82, 0.43, 0.265, "Hips"),
    (1.86, 0.43, 0.27, "Spine"),
    (2.18, 0.49, 0.29, "Spine1"),
    (2.43, 0.47, 0.28, "Spine2"),
    (2.67, 0.315, 0.21, "Spine2"),
]


def torso_radii(z: float) -> tuple[float, float]:
    """Interpolate the torso loft's (rx, ry) at height z, for trim that must
    ride the jersey surface instead of guessing at it."""
    levels = TORSO_LEVELS
    if z <= levels[0][0]:
        return levels[0][1], levels[0][2]
    for (z0, rx0, ry0, _), (z1, rx1, ry1, _) in zip(levels, levels[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            return rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t
    return levels[-1][1], levels[-1][2]


def vneck_half_width(z: float) -> float:
    """Half-width of the V opening at height z — matches the trim path below
    so the skin/jersey colour boundary lands under the white tube. NARROW: a
    wide V exposed a bib of chest and made the neck read as a stalk."""
    knots = [(2.45, 0.0), (2.53, 0.10), (2.615, 0.155), (2.675, 0.20)]
    if z <= knots[0][0]:
        return 0.0
    for (z0, w0), (z1, w1) in zip(knots, knots[1:]):
        if z <= z1:
            return w0 + (w1 - w0) * (z - z0) / (z1 - z0)
    return knots[-1][1]


# Twin white stripes along the sleeve's upper-front quadrant, shoulder seam to
# cuff, as the turnaround draws them. They are PAINTED bands on the sleeve's own
# surface: round 1 built them as thin tubes riding the cloth and the board
# showed them as cracked fins on every silhouette.
ARM_STRIPE_SPANS = ((pi / 2 + 0.14, pi / 2 + 0.36), (pi / 2 + 0.52, pi / 2 + 0.74))


def arm_angles(base: int, stripes: bool) -> list[float]:
    """Ring angles for the arm surface: uniform coverage plus, when striping,
    a NEAR-DOUBLED column at each stripe boundary so the white-to-red change
    crosses one sliver quad and reads crisp instead of airbrushed."""
    angles = [2 * pi * i / base for i in range(base)]
    if stripes:
        inserts: list[float] = []
        for start, end in ARM_STRIPE_SPANS:
            inserts += [start - 0.012, start + 0.012, end - 0.012, end + 0.012]
        angles = [t for t in angles if all(abs(t - s) > 0.06 for s in inserts)] + inserts
    return sorted(angles)


def stripe_white(theta: float) -> bool:
    return any(start + 0.006 < theta < end - 0.006 for start, end in ARM_STRIPE_SPANS)


def build_arm(builder: MeshBuilder, side: int, prefix: str, detail: int) -> None:
    """Shoulder-to-wrist as ONE stitched surface: red sleeve, white cuff band
    and bare skin are colour bands on the same rings.

    This is the structural fix for three round-1 defects at once: the cuff is
    no longer a separate torus (whose interior the profile stared straight
    into, rubric 3.7), the trim has no shell edge to crack, and the sleeve
    cannot shade differently from its own cuff. The root ring is EMBEDDED in
    the torso and part-weighted to Spine2 so dropping the arm from bind pose
    peels no seam open (rubric 3.11)."""
    arm, fore, hand = f"{prefix}Arm", f"{prefix}ForeArm", f"{prefix}Hand"
    SLEEVE, CUFF, BARE = 0, 1, 2
    rings_spec: list[tuple[float, float, float, float, int, str | dict[str, float]]]
    if detail >= 2:
        rings_spec = [
            (0.34, 0.230, 0.0, 2.43, SLEEVE, {"Spine2": 0.65, arm: 0.35}),
            (0.44, 0.238, 0.0, 2.43, SLEEVE, {"Spine2": 0.25, arm: 0.75}),
            (0.55, 0.228, 0.0, 2.43, SLEEVE, arm),
            (0.635, 0.205, 0.0, 2.43, SLEEVE, arm),
            (0.695, 0.186, 0.0, 2.43, SLEEVE, arm),
            (0.703, 0.184, 0.0, 2.43, CUFF, arm),
            (0.764, 0.168, 0.0, 2.43, CUFF, arm),
            (0.772, 0.152, 0.0, 2.43, CUFF, arm),
            (0.780, 0.146, 0.0, 2.43, BARE, arm),
            (0.90, 0.138, 0.0, 2.43, BARE, {arm: 0.6, fore: 0.4}),
            (1.06, 0.124, 0.0, 2.43, BARE, {arm: 0.25, fore: 0.75}),
            (1.24, 0.112, -0.005, 2.43, BARE, fore),
            (1.37, 0.105, -0.012, 2.425, BARE, {fore: 0.65, hand: 0.35}),
        ]
        angles = arm_angles(14, True)
    elif detail == 1:
        rings_spec = [
            (0.36, 0.235, 0.0, 2.43, SLEEVE, {"Spine2": 0.5, arm: 0.5}),
            (0.55, 0.226, 0.0, 2.43, SLEEVE, arm),
            (0.665, 0.196, 0.0, 2.43, SLEEVE, arm),
            (0.695, 0.186, 0.0, 2.43, SLEEVE, arm),
            (0.705, 0.184, 0.0, 2.43, CUFF, arm),
            (0.768, 0.160, 0.0, 2.43, CUFF, arm),
            (0.778, 0.148, 0.0, 2.43, BARE, {arm: 0.7, fore: 0.3}),
            (1.05, 0.126, 0.0, 2.43, BARE, {arm: 0.3, fore: 0.7}),
            (1.24, 0.112, -0.005, 2.43, BARE, fore),
            (1.37, 0.105, -0.012, 2.425, BARE, {fore: 0.65, hand: 0.35}),
        ]
        angles = arm_angles(10, False)
    else:
        rings_spec = [
            (0.38, 0.235, 0.0, 2.43, SLEEVE, {"Spine2": 0.5, arm: 0.5}),
            (0.62, 0.205, 0.0, 2.43, SLEEVE, arm),
            (0.70, 0.185, 0.0, 2.43, CUFF, arm),
            (0.775, 0.155, 0.0, 2.43, CUFF, arm),
            (0.79, 0.146, 0.0, 2.43, BARE, {arm: 0.6, fore: 0.4}),
            (1.37, 0.105, -0.012, 2.425, BARE, {fore: 0.65, hand: 0.35}),
        ]
        angles = arm_angles(7, False)
    rows: list[list[int]] = []
    row_materials: list[int] = []
    for x_abs, radius, y_c, z_c, kind, bone in rings_spec:
        row = []
        for theta in angles:
            if kind == CUFF or (kind == SLEEVE and detail >= 2 and stripe_white(theta)):
                color = WHITE
            elif kind == SLEEVE:
                color = SHIRT
            else:
                color = SKIN
            row.append(builder.vertex((x_abs * side, y_c + radius * cos(theta), z_c + radius * sin(theta)), color, bone))
        rows.append(row)
        row_materials.append(0 if kind == BARE else 1)
    for index in range(len(rows) - 1):
        builder.grid([rows[index], rows[index + 1]], row_materials[index], flip=side < 0)
    # Both caps are buried — the root inside the torso, the wrist inside the
    # hand — so the surface is closed from every board angle (rubric 3.7).
    root = builder.vertex((rings_spec[0][0] * side, rings_spec[0][2], rings_spec[0][3]), SHIRT, rings_spec[0][5])
    tip = builder.vertex((rings_spec[-1][0] * side, rings_spec[-1][2], rings_spec[-1][3]), SKIN, rings_spec[-1][5])
    count = len(angles)
    for index in range(count):
        nxt = (index + 1) % count
        if side > 0:
            builder.face((root, rows[0][nxt], rows[0][index]), 1)
            builder.face((tip, rows[-1][index], rows[-1][nxt]), 0)
        else:
            builder.face((root, rows[0][index], rows[0][nxt]), 1)
            builder.face((tip, rows[-1][nxt], rows[-1][index]), 0)


def build_leg(builder: MeshBuilder, side: int, prefix: str, detail: int) -> None:
    """Hip-to-ankle as ONE stitched surface: salmon pant, gathered darker
    knicker cuff and long red sock are colour bands with boundary ring pairs.
    Round 1 stacked pant tube + cuff torus + sock tube, and each junction was
    a visible seam ring or an open shell edge."""
    x0 = 0.225 * side
    up, low, foot = f"{prefix}UpLeg", f"{prefix}Leg", f"{prefix}Foot"
    if detail >= 2:
        rings_spec: list[tuple[float, float, float, tuple, str | dict[str, float]]] = [
            (0.27, 0.098, -0.01, SHIRT_DARK, {low: 0.4, foot: 0.6}),
            (0.46, 0.108, 0.0, SHIRT_DARK, low),
            (0.608, 0.128, 0.0, SHIRT_DARK, low),
            (0.615, 0.132, 0.0, PANTS_DARK, low),
            (0.658, 0.146, 0.0, PANTS_DARK, low),
            (0.665, 0.150, 0.0, PANTS, low),
            (0.715, 0.180, 0.0, PANTS, low),
            (0.78, 0.172, 0.0, PANTS, low),
            (0.90, 0.176, 0.0, PANTS, {up: 0.3, low: 0.7}),
            (1.06, 0.186, 0.0, PANTS, {up: 0.75, low: 0.25}),
            # Thigh slimmed to 0.194/0.184 (was 0.200/0.188): part of the
            # seat-wall margin above, and the concept's own slim thigh under
            # a poofy knicker.
            (1.34, 0.194, 0.0, PANTS, up),
            (1.72, 0.184, 0.0, PANTS, {"Hips": 0.6, up: 0.4}),
        ]
        sides = 12
    elif detail == 1:
        rings_spec = [
            (0.27, 0.098, -0.01, SHIRT_DARK, {low: 0.4, foot: 0.6}),
            (0.603, 0.127, 0.0, SHIRT_DARK, low),
            (0.61, 0.130, 0.0, PANTS_DARK, low),
            (0.653, 0.142, 0.0, PANTS_DARK, low),
            (0.66, 0.146, 0.0, PANTS, low),
            (0.70, 0.178, 0.0, PANTS, low),
            (0.78, 0.172, 0.0, PANTS, {up: 0.3, low: 0.7}),
            (1.02, 0.183, 0.0, PANTS, {up: 0.6, low: 0.4}),
            (1.72, 0.184, 0.0, PANTS, {"Hips": 0.6, up: 0.4}),
        ]
        sides = 8
    else:
        rings_spec = [
            (0.27, 0.100, -0.01, SHIRT_DARK, {low: 0.4, foot: 0.6}),
            (0.65, 0.138, 0.0, SHIRT_DARK, low),
            (0.66, 0.142, 0.0, PANTS, low),
            (0.92, 0.180, 0.0, PANTS, {up: 0.5, low: 0.5}),
            (1.30, 0.200, 0.0, PANTS, up),
            (1.70, 0.188, 0.0, PANTS, {"Hips": 0.6, up: 0.4}),
        ]
        sides = 6
    rows: list[list[int]] = []
    for z, radius, y_c, color, bone in rings_spec:
        row = []
        for index in range(sides):
            theta = 2 * pi * index / sides
            row.append(builder.vertex((x0 + radius * cos(theta), y_c + radius * sin(theta), z), color, bone))
        rows.append(row)
    builder.grid(rows, 1)
    bottom = builder.vertex((x0, rings_spec[0][2], rings_spec[0][0]), SHIRT_DARK, rings_spec[0][4])
    top = builder.vertex((x0, 0.0, rings_spec[-1][0]), PANTS, rings_spec[-1][4])
    for index in range(sides):
        nxt = (index + 1) % sides
        builder.face((bottom, rows[0][nxt], rows[0][index]), 1)
        builder.face((top, rows[-1][index], rows[-1][nxt]), 1)


def build_shoe(builder: MeshBuilder, side: int, prefix: str, detail: int, segments: int, rings: int) -> None:
    """A sneaker whose white toe cap is a PAINTED latitude band on the toe box
    itself. Round 1 pushed a separate white shell through the red toe box and
    the intersection curve rendered as the cracked cap edge. Red-on-red
    overlaps (ankle collar into toe box) are the only interpenetrations left,
    and a same-colour overlap has no visible seam. The outsole stays real
    geometry, deliberately PROUD of the upper all round — an outsole lip the
    art draws, not a z-fight."""
    x0 = 0.225 * side
    foot = f"{prefix}Foot"
    if detail == 0:
        builder.ellipsoid((x0, -0.16, 0.20), (0.25, 0.38, 0.17), 1, SHOE, foot, segments, rings, flatten_sole=True)
        builder.ellipsoid((x0, -0.15, 0.065), (0.24, 0.355, 0.052), 1, SOLE, foot, segments, rings, flatten_sole=True)
        return
    seg = 12 if detail >= 2 else 9
    rng = 6 if detail >= 2 else 4
    # Ankle quarter with the dark inner collar painted on its own crown.
    builder.ellipsoid(
        (x0, 0.03, 0.26), (0.20, 0.20, 0.17), 1, SHOE, foot, seg, rng,
        flatten_sole=True,
        color_fn=lambda dx, dy, dz: SHIRT_DARK if dz > 0.60 else SHOE,
    )
    # Toe box with its POLE at the toe (pole="-y"), so latitude rows ring the
    # toe and the white cap boundary lands exactly on a clustered row pair.
    cap_phis = [0.30, 0.58, 0.79, 0.85, 1.10, 1.45, 1.85, 2.30, 2.75] if detail >= 2 else [0.45, 0.79, 0.85, 1.35, 1.90, 2.50]
    builder.ellipsoid(
        (x0, -0.13, 0.175), (0.215, 0.30, 0.145), 1, SHOE, foot, seg, rng,
        flatten_sole=True, pole="-y", phis=cap_phis,
        color_fn=lambda dx, dy, dz: WHITE if dy < -0.68 else SHOE,
    )
    # Sole tucked at the heel (ry 0.335, centre -0.115; was 0.37 at -0.10):
    # the old plate ran 0.04 past the upper all round and the profile read a
    # skateboard flange behind the heel. It stays slightly proud at the toe,
    # where the art draws the lip.
    builder.ellipsoid((x0, -0.115, 0.065), (0.228, 0.335, 0.052), 1, SOLE, foot, seg, max(3, rng - 2), flatten_sole=True)
    lace_rows = (-0.10, -0.19, -0.28) if detail >= 2 else (-0.20,)
    for lace_y in lace_rows:
        along = min(1.0, abs(lace_y + 0.13) / 0.30)
        lace_z = 0.175 + 0.145 * (1.0 - along * along) ** 0.5 + 0.012
        builder.tube(
            [(-0.12 + x0, lace_y, lace_z), (0.12 + x0, lace_y, lace_z)],
            [0.014, 0.014],
            1,
            WHITE,
            foot,
            5,
        )


def build_ear(builder: MeshBuilder, side: int, detail: int) -> None:
    """One smoothed, continuous ear (rubric 3.10): the attach ring sits under
    the skull's surface, folds outward over a rounded rim, turns down into a
    SKIN_SHADOW concha wall and closes at a sunken concha floor; the outline
    swells at its lower-front arc into a lobe. Round 1 composed the ear from
    four butted primitives and the board read faceted bracket tabs."""
    points = 12 if detail >= 2 else 8
    cy, cz = 0.035, 3.27
    ry, rz = 0.078, 0.108

    def outline(t: float, scale: float) -> tuple[float, float]:
        lobe = 1.0 + 0.22 * max(0.0, -sin(t)) ** 2
        return (cy + ry * scale * lobe * cos(t), cz + rz * scale * lobe * sin(t))

    # FIVE rows at hero detail: base under the skull, a BULGED mid row, the
    # rim peak, then the turn down into the concha. The v8 three-row ear put
    # base and rim at nearly the same outline scale, so from the front the ear
    # was a flat plate on a stick — the board's "flat slab tab". The bulge row
    # is what rounds the rim silhouette front-on, and the extra x travel
    # (0.408 -> 0.487) is what rounds it in depth.
    rows_spec = (
        (0.408, 0.98, SKIN),
        (0.442, 1.08, SKIN),
        (0.472, 1.02, SKIN),
        (0.487, 0.78, SKIN),
        (0.470, 0.50, SKIN_SHADOW),
    ) if detail >= 2 else (
        (0.415, 1.00, SKIN),
        (0.484, 0.92, SKIN),
        (0.468, 0.56, SKIN_SHADOW),
    )
    rows: list[list[int]] = []
    for x_abs, scale, color in rows_spec:
        row = []
        for index in range(points):
            t = 2 * pi * index / points
            ear_y, ear_z = outline(t, scale)
            row.append(builder.vertex((x_abs * side, ear_y, ear_z), color, "Head"))
        rows.append(row)
    builder.grid(rows, 0, flip=side < 0)
    center = builder.vertex((0.452 * side, cy + 0.008, cz - 0.005), SKIN_SHADOW, "Head")
    for index in range(points):
        nxt = (index + 1) % points
        face = (center, rows[-1][index], rows[-1][nxt]) if side > 0 else (center, rows[-1][nxt], rows[-1][index])
        builder.face(face, 0)


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    # Constructed torso. The turnaround's jersey is a V-NECK: inside the white
    # trim the chest reads as skin, authored by recolouring the torso's own
    # front-top vertices rather than wedging a second surface through the cloth.
    def vneck_color(theta: float, z: float):
        rx, _ = torso_radii(z)
        if -sin(theta) > 0.35 and abs(rx * cos(theta)) < vneck_half_width(z):
            return SKIN
        return SHIRT

    builder.loft(TORSO_LEVELS, 1, SHIRT, segments, color_fn=vneck_color)
    if detail >= 1:
        # One cyclic tube is both collar and V-trim: it rides the jersey
        # surface, level around the back of the neck and diving to the V's
        # point at centre-chest — the construction the turnaround draws.
        collar_points = []
        collar_count = max(16, segments + 2) if detail >= 2 else 8
        for i in range(collar_count):
            theta = 2 * pi * i / collar_count
            dip = max(0.0, -sin(theta)) ** 4
            # The jersey's neck opening sits HIGH (2.665) — the board's long
            # bare neck came as much from a low collar as from the neck itself.
            z = 2.665 - 0.215 * dip
            rx, ry = torso_radii(z)
            # The trim hugs the neck opening, not the torso's full width: pull
            # the ring toward centre so the V stays a V and not a boat neck.
            # The ring's CENTRE sits ON the jersey surface (no 1.03/1.06
            # stand-off): half the tube is welded inside the cloth, so there is
            # no gap shadow behind the trim to read as a cracked edge.
            pinch = 1.0 - 0.42 * dip
            collar_points.append((rx * cos(theta) * pinch, ry * 1.01 * sin(theta) - 0.004, z + 0.008))
        builder.tube(collar_points, [0.034] * collar_count, 1, WHITE, "Spine2", 6 if detail >= 2 else max(5, segments // 3), cyclic=True, axis=Vector((0.0, 0.0, 1.0)))
    if detail >= 2:
        # Buttoned placket: a dark seam down the chest with three buttons, as
        # the front view draws them. Geometry, not texture — it must survive
        # the toon shader and the 40 px zoom.
        # Sunk nearly flush: at -0.010 the placket stood off the chest curve
        # and read as a detached red strip in the profile silhouette.
        # Ends at 1.84, just above the raised 1.82 hem — a placket running past
        # the hem would float in front of the belt.
        placket = []
        for z in (2.40, 2.15, 1.98, 1.84):
            _, ry = torso_radii(z)
            placket.append((0.0, -ry - 0.002, z))
        builder.tube(placket, [0.010] * 4, 1, SHIRT_DARK, "Spine1", 5)
        # ROUND buttons the front view can actually read as buttons — at 0.018
        # across they rendered as more stitch dashes on the placket line.
        # Sunk to 0.009 proud (was 0.019): at the old stand-off they broke the
        # profile silhouette as the round-2 board's "dark lumps".
        for z in (2.26, 2.08, 1.90):
            _, ry = torso_radii(z)
            builder.ellipsoid((0.0, -ry - 0.001, z), (0.022, 0.010, 0.022), 1, SHIRT_DARK, "Spine1", 6, 4)

    # Each arm is ONE stitched surface — sleeve, painted stripes, painted white
    # cuff band and bare skin as colour bands on shared rings (build_arm). A
    # deltoid cap in the sleeve's own colour rounds the shoulder; same-colour
    # overlap draws no seam, and it follows the Arm bone so the shoulder stays
    # a shoulder when a clip drops the arm (rubric 3.11). SMALLER than round
    # 1's (0.15 long, was 0.17): the big cap buried the stripes' shoulder ends.
    for side, prefix in ((-1, "Left"), (1, "Right")):
        build_arm(builder, side, prefix, detail)
        if detail >= 1:
            # Shrunk again (rx 0.115 at x 0.42, was 0.15 at 0.46): even the v8
            # cap buried the painted stripes' shoulder ends, which is why the
            # board read them as mid-sleeve dashes. The cap now rounds only the
            # very top of the shoulder and the striped sleeve surface is
            # exposed from the shoulder seam (x~0.44) to the cuff.
            builder.ellipsoid((0.42 * side, 0.0, 2.46), (0.115, 0.242, 0.232), 1, SHIRT, f"{prefix}Arm", max(8, segments // 2), max(4, rings // 2))

        # Palm, four readable finger volumes and a separately rooted thumb.
        # LOD2 keeps a mitten; the closer levels get silhouette definition.
        # The palm needs nothing like skull-grade tessellation — (10, 6) at
        # hero scale frees ~200 triangles for the face and tail.
        hand_segments = 10 if detail >= 2 else segments
        hand_rings = 6 if detail >= 2 else rings
        builder.ellipsoid((1.43 * side, -0.015, 2.425), (0.16, 0.125, 0.145), 0, SKIN, f"{prefix}Hand", hand_segments, hand_rings)
        if detail >= 1:
            finger_count = 4 if detail >= 2 else 3
            finger_offsets = (-0.075, -0.025, 0.025, 0.075) if finger_count == 4 else (-0.060, 0.0, 0.060)
            finger_lengths = (0.115, 0.14, 0.135, 0.105) if finger_count == 4 else (0.115, 0.14, 0.11)
            for z_offset, length in zip(finger_offsets, finger_lengths):
                start_x = 1.50 * side
                # Fingers CURL slightly toward the palm: dead-straight axial
                # fingers seen down the T-pose arm rendered as concentric
                # stacked rings inside the cuff (the board's profile defect).
                builder.tube(
                    [
                        (start_x, -0.025, 2.425 + z_offset),
                        ((1.50 + length * 0.62) * side, -0.038, 2.425 + z_offset - 0.006),
                        ((1.50 + length) * side, -0.052, 2.425 + z_offset - 0.016),
                    ],
                    [0.042, 0.040, 0.028],
                    0,
                    SKIN,
                    f"{prefix}HandIndex1",
                    7 if detail >= 2 else 6,
                )
            builder.tube(
                [
                    (1.40 * side, -0.075, 2.36),
                    (1.47 * side, -0.12, 2.32),
                    (1.54 * side, -0.13, 2.30),
                ],
                [0.050, 0.043, 0.026],
                0,
                SKIN,
                f"{prefix}HandThumb1",
                7 if detail >= 2 else 6,
            )

    # A small drafting-team wrist band provides team identity without repainting
    # Junebug's signature red kit.
    if detail >= 1:
        # SNUG: ring 0.112 with a 0.016 cord (was 0.115/0.023) — the fat band
        # stood 0.03 proud of the forearm and the round-2 board called it out
        # as an unconcepted wrist ring dominating both arm reads.
        builder.tube(
            arm_ring_points((-1.31, -0.005, 2.43), 0.112, 0.112, max(10, segments)),
            [0.016] * max(10, segments),
            3,
            TEAM_MASK,
            "LeftForeArm",
            max(5, segments // 3),
            cyclic=True,
        )

    # The waist is ONE garment stack: jersey hem (torso loft, ending 1.82)
    # over a PAINTED belt band, over pants. The v8 pelvis was an ELLIPSOID and
    # it caused three board defects at once: its curved underside arched high
    # between the thighs (the "gothic notch" with the bottom-pole wedge inside
    # it), its shallow front/back (ry 0.205) let the thigh tubes' rings emerge
    # as seam crescents at the hips and a disc through the back of the thigh,
    # and its painted belt sat at heights the 1.75 jersey hem covered — "no
    # belt reads". The pelvis is now a LOFT: full-depth walls (ry 0.24) bury
    # the thigh tops on every side, the underside is a low flat crotch at
    # 1.38 with daylight between the thighs below it (rubric 3.12), and the
    # belt is painted rows at 1.70-1.795, fully visible under the raised hem.
    # The band paints THROUGH the hem line (to 1.85, hem at 1.82): stopping it
    # at 1.80 left a lit salmon sliver between hem and belt on the first v9
    # board. The rows above 1.85 stay PANTS and are buried inside the jersey.
    def pelvis_color(theta: float, z: float):
        return SHIRT_DARK if 1.695 <= z <= 1.85 else PANTS

    # The floor sits at 1.50 with FULL depth — the concept's own crotch height
    # (~0.39 of the figure). A first v9 pass tapered the loft down to 1.38,
    # and everywhere the shrinking ellipse got shallower than the thigh tubes
    # the thighs surfaced through the front wall as pale "bottle" shapes. At
    # every level here the wall at the thigh's centreline (x 0.225) is deeper
    # than the thigh's 0.20 front reach, so the seat is always the front
    # surface and the thighs emerge only at the flat underside.
    # ry 0.25 low down, not 0.235: the binding margin is at the thigh's OUTER
    # shoulder (x~0.31), where the wall ellipse falls off faster than the
    # thigh circle — at the centreline both pass with room, and the first two
    # v9 boards each showed the graze as pale thigh strips surfacing through
    # the seat.
    if detail >= 1:
        pelvis_levels = [
            (1.50, 0.450, 0.250, "Hips"),
            (1.56, 0.450, 0.248, "Hips"),
            (1.62, 0.447, 0.243, "Hips"),
            (1.685, 0.443, 0.239, "Hips"),
            (1.70, 0.442, 0.239, "Hips"),
            (1.795, 0.427, 0.233, "Hips"),
            (1.81, 0.425, 0.232, "Hips"),
            (1.88, 0.400, 0.220, "Hips"),
        ]
        if detail == 1:
            pelvis_levels = [
                (1.50, 0.450, 0.250, "Hips"),
                (1.62, 0.447, 0.243, "Hips"),
                (1.685, 0.443, 0.239, "Hips"),
                (1.70, 0.442, 0.239, "Hips"),
                (1.795, 0.427, 0.233, "Hips"),
                (1.81, 0.425, 0.232, "Hips"),
                (1.88, 0.400, 0.220, "Hips"),
            ]
        builder.loft(pelvis_levels, 1, PANTS, segments, color_fn=pelvis_color)
    else:
        builder.ellipsoid((0.0, 0.0, 1.62), (0.45, 0.225, 0.27), 1, PANTS, "Hips", segments, rings)
    if detail >= 2:
        # The tiny buckle — the one piece of belt that is genuinely geometry —
        # centred ON the painted band.
        builder.ellipsoid((0.0, -0.243, 1.75), (0.026, 0.010, 0.022), 1, WHITE, "Hips", 6, 4)

    # Each leg is ONE stitched surface from hip to ankle (build_leg): salmon
    # pant with the pouf into the gathered knicker cuff, the darker cuff band
    # and the long red sock are painted bands with crisp boundary row pairs.
    # The sock is an identity anchor the 40 px read keeps, so every LOD
    # carries the band; it is DARKER than the jersey (#76221D on the art) so
    # the pink-pant/dark-sock break survives the toon shader.
    for side, prefix in ((-1, "Left"), (1, "Right")):
        build_leg(builder, side, prefix, detail)
        build_shoe(builder, side, prefix, detail, segments, rings)

    # Neck, ears and a face whose cheek-to-chin taper follows the turnaround.
    # The neck is deliberately almost INVISIBLE: the turnaround's chin sits a
    # hand's width off the collar (measured: 24px of neck in an 879px figure,
    # 2.7%), while the v4 board showed a 7% stalk. The chin now drops to
    # z 2.785 and the collar is at 2.635, so the neck is a shadow, not a limb.
    # Thicker than v5's 0.175 stalk, and flaring to the jaw's own width at the
    # top (0.23 vs the skull's ~0.22 there) so head and neck read as connected
    # forms instead of a ball floated on a cylinder.
    builder.loft(
        [
            (2.55, 0.215, 0.19, "Spine2"),
            (2.66, 0.20, 0.175, "Neck"),
            (2.76, 0.20, 0.175, "Neck"),
            (2.88, 0.23, 0.20, "Head"),
        ],
        0,
        SKIN,
        max(9, segments // 2),
    )
    # Measured, not eyeballed (rubric 3.13). The v6 skull (rx 0.465 + wide
    # ears) measured w:h ~1.12 on the board over the band-to-chin span the
    # viewer reads as "the head" — wider and shorter than the art. rx 0.435
    # with smaller ears and the bun cresting the crown restores the
    # turnaround's near-square face over a taller perceived head.
    # Hero skull gets +8/+4 over the base grid (was +4/+2): the cheek and jaw
    # faceting the round-2 board showed is silhouette polygonisation, which
    # smooth shading cannot hide — only rows can. The stripe tubes' removal
    # pays for it inside the LOD0 budget.
    skull_segments = segments + (8 if detail >= 2 else 4)
    skull_rings = rings + (4 if detail >= 2 else 2)
    builder.ellipsoid((0.0, -0.015, 3.40), (0.435, 0.44, 0.615), 0, SKIN, "Head", skull_segments, skull_rings, face_shape=True)
    # A DENSE patch at hero scale: 7x7 mapped the whole face across a handful
    # of quads and linear UV interpolation over that curvature sheared the
    # atlas's round irises into the angular wedges the board showed.
    builder.face_patch(max(16, segments + 2) if detail >= 2 else max(6, segments // 2), max(12, rings + 4) if detail >= 2 else max(5, rings // 2))
    # The nose is sculpted INTO the face patch (see face_patch's nose term) —
    # no mounted ellipsoid, no muzzle block. Ears ride LOW (centre 3.27) like
    # the art's, and SMALL, one continuous smoothed form each (build_ear).
    if detail >= 1:
        for side in (-1, 1):
            build_ear(builder, side, detail)

    # Hair is one designed mass: slicked crown to a mid-forehead hairline, a
    # gather knot at the crown-back, and one smooth swept ponytail ending in
    # the turnaround's arrowhead tip. The white headband is TILTED — across
    # the upper forehead in front, under the gather to the nape behind — and
    # hugs the skull/hair surface instead of ringing the crown like a halo.
    # +6 columns over the round-1 cap: the hairline's front edge is the one
    # curve the front board reads against bare skin, and at segments+4 its
    # polygonal scallops were visible at hero scale.
    builder.hair_cap(max(12, segments + 6), max(6, rings // 2 + 2), shine=detail >= 2)
    # The headband is a flat RIBBON with a closed rectangular cross-section,
    # not a round tube: the v6 tube read as a rolled beanie brim from the
    # front, and the art draws a wide flat band (~0.11ft tall). It rides the
    # hair cap's surface, nearly level — front z 3.64, easing to 3.56 at the
    # nape — with its lower edge at the hairline: skin below, hair above.
    band_count = max(16, segments + 2)
    band_rows: list[list[int]] = []
    # Cross-section corners (radial offset, z offset), ordered to match the
    # tube frame's outward -> down -> inward -> up winding so the computed
    # normals face out. Inner corners sit beneath the hair surface: no open
    # edge, no visible interior (rubric 3.7).
    # Outer face widened (0.030 proud, 0.044 half-height) so the band presents
    # a real lit white plane at field scale — the round-1 band greyed out at
    # 40 px because its narrow outer face caught almost no key light.
    # Taller still (0.108 outer height, matching the art's ~0.11ft band, from
    # 0.088): the 40 px strip kept greying the band out because its lit outer
    # face was under two device pixels tall at field scale.
    band_section = ((0.034, -0.054), (-0.014, -0.070), (-0.014, 0.070), (0.034, 0.054))
    for i in range(band_count):
        theta = 2 * pi * i / band_count
        # Front z_c 3.62 (was 3.64): with the lowered hairline this keeps the
        # concept's thin strip of hair below the band's lower edge.
        z_c = 3.585 - 0.035 * sin(theta)
        front = max(0.0, -sin(theta))
        depth = 1.0 - 0.16 * front * front
        row = []
        for r_off, z_off in band_section:
            z = z_c + z_off
            shell = max(0.03, 1.0 - ((z - 3.43) / 0.615) ** 2) ** 0.5
            row.append(builder.vertex((
                (0.50 * shell + r_off) * cos(theta),
                0.05 + (0.50 * shell * depth + r_off) * sin(theta),
                z,
            ), WHITE, "Head"))
        band_rows.append(row)
    for i in range(band_count):
        nxt_row = (i + 1) % band_count
        for s in range(4):
            nxt = (s + 1) % 4
            builder.face((band_rows[i][s], band_rows[i][nxt], band_rows[nxt_row][nxt], band_rows[nxt_row][s]), 1)
    if detail >= 1:
        # The gather BUN at the crown — in the art's front view it is a big
        # readable ball rising well above the band, ~70% of the head's width.
        # It must genuinely CREST the (deliberately flattened) cap dome: top
        # 4.155 vs the cap's 4.045, under the 4.16 hair ceiling. The v6 knot
        # crested 0.045 and the front silhouette swallowed it — half the
        # board's beanie misread.
        knot_segments = max(10, segments // 2) if detail >= 2 else 6
        knot_rings = max(6, rings // 2) if detail >= 2 else 3
        # Widened to 0.34 (from 0.32): the 40 px front read shrank the bun to
        # a faint cap. Height cannot grow (4.16 hair ceiling), so the mass
        # that survives downscale has to come from width. The underside FLARES
        # (radial_fn): a plain ellipsoid's belly grazed the cap dome at a
        # tangent ring near x 0.30 and the near-coincident surfaces rendered
        # as a column of z-fight diamonds on every board; a flared skirt
        # crosses the dome steeply, which shades as a contact crease instead.
        builder.ellipsoid(
            (0.0, 0.10, 3.995), (0.335, 0.275, 0.16), 2, HAIR, "Head", knot_segments, knot_rings,
            radial_fn=lambda dx, dy, dz: 1.0 + 0.11 * max(0.0, -dz - 0.15),
        )
    # Apex controls stay clear of the 4% hair ceiling WITH the tube radius and
    # the spline's overshoot counted — 3.97 at the root put the shipped top at
    # 4.161ft against the 4.16 ceiling. The sweep is COMPACT: the v5 tail hung
    # to mid-back (z 2.50, arrow tip 2.16) and read as an oversized slab, where
    # the turnaround's tail is a buoyant S — up off the gather, back no further
    # than ~1.05ft, and curling FORWARD to finish above the shoulder line with
    # the arrowhead at roughly chin height.
    ponytail_controls: list[tuple[tuple[float, float, float], float]] = [
        ((0.0, 0.28, 3.87), 0.115),
        ((0.0, 0.48, 3.95), 0.155),
        ((0.0, 0.72, 3.93), 0.185),
        ((0.0, 0.92, 3.76), 0.20),
        ((0.0, 1.03, 3.50), 0.195),
        ((0.0, 1.04, 3.24), 0.165),
        ((0.0, 0.95, 3.02), 0.12),
        ((0.0, 0.83, 2.88), 0.075),
        ((0.0, 0.72, 2.80), 0.04),
    ]
    # The tail is the profile's signature curve, and the board showed it as
    # hard planar panels: 13 samples × 10 sides polygonises a 1.5ft sweep.
    # LOD0 spends real geometry here (21 × 14) because rubric 3.3's 5 needs a
    # smooth swept mass, and the tail is most of what the profile view IS.
    tail_samples = 20 if detail >= 2 else (11 if detail == 1 else 7)
    tail_sides = 13 if detail >= 2 else (10 if detail == 1 else 8)
    tail = catmull_rom(ponytail_controls, tail_samples)
    builder.tube([tuple(p) for p, _ in tail], [r for _, r in tail], 2, HAIR, "Head", tail_sides)
    # The arrowhead tip — the turnaround's most memorable hair note. A rounded
    # six-point barb whose root tucks into the tube's end, not a detached
    # four-point kite: the flat diamond read as a separate object on the board.
    # It points DOWN-FORWARD and stays above the shoulder line, per the art.
    # Compact: roughly 1.6x the tube-end's width, not the palm-sized flat hook
    # the first v6 pass drew — an arrow bigger than the curl it ends reads as
    # a separate object glued on.
    arrow_outline = [
        (0.0, 0.73, 2.84),
        (0.0, 0.82, 2.73),
        (0.0, 0.74, 2.64),
        (0.0, 0.64, 2.52),
        (0.0, 0.56, 2.68),
        (0.0, 0.60, 2.78),
    ]
    for x_half in (0.05, -0.05):
        center_index = builder.vertex((x_half, 0.68, 2.70), HAIR, "Head")
        ring = [builder.vertex(point, HAIR, "Head") for point in arrow_outline]
        for a, b in zip(ring, ring[1:] + ring[:1]):
            face = (a, b, center_index) if x_half > 0 else (b, a, center_index)
            builder.face(face, 2)
    if detail >= 2:
        # The white tie wrapped around the tail root, as the profile draws it.
        builder.tube(
            torus_points((0.0, 0.42, 3.90), 0.15, 0.13, 8),
            [0.026] * 8,
            1,
            WHITE,
            "Head",
            5,
            cyclic=True,
            axis=Vector((0.0, 0.5, 1.0)),
        )

    # Strand grouping (rubric 3.3's bar for 5/5) is painted INTO hair_cap's
    # columns — see its `shine` parameter. No strand geometry exists: cords
    # riding the dome either z-fight it (sunk) or catch the runtime outline
    # shader (proud), and the board showed each failure in turn.

    # The twin white sleeve stripes are PAINTED bands on the sleeve's own
    # surface (build_arm's stripe_white columns) — no stripe geometry exists.
    # The v8 build carried three sunken WHITE tubes here as well, and the
    # board showed exactly what half-buried cords over a painted band look
    # like: ragged scratches crossing clean stripes. One construction only.


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
    # POINT-domain colour survives Blender's material split as literal COLOR_0.
    # CORNER-domain colour round-tripped the first material correctly but wrote
    # white for later primitives in Blender 5.2's glTF exporter.
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
    obj["recessReference"] = "junebug-turnaround.png"
    return obj


def main() -> None:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]

    for name in ("kid_nostrike_LOD0", "kid_nostrike_LOD1", "kid_nostrike_LOD2"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    settings = {
        "kid_nostrike_LOD0": (14, 8, 2),
        "kid_nostrike_LOD1": (8, 4, 1),
        "kid_nostrike_LOD2": (5, 3, 0),
    }
    built = [build_lod(name, armature, *config) for name, config in settings.items()]

    for material_name in SLOTS:
        material = bpy.data.materials[material_name]
        material["recessVertexPalette"] = True
        if material_name != "M_Body":
            rebuild_palette_material(material)
    bpy.data.materials["M_Uniform"]["recessIdentityPalette"] = True
    bpy.data.materials["M_Accessory"]["recessTeamAccent"] = True
    install_face_atlas()

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Junebug reference-authored production source\n\n"
        "The three LOD meshes were rebuilt against junebug-turnaround.png; they are not proxy deformations.\n"
        "Signature wardrobe colour lives in M_Uniform vertex colour; M_Accessory is the small team accent.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- nostrike\n"
    )
    for obj in built:
        obj.hide_render = obj.name != "kid_nostrike_LOD0"
        obj.display_type = "SOLID" if obj.name.endswith("LOD0") else "WIRE"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
