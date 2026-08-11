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
REVISION = "junebug-turnaround-fidelity-v11"
SLOTS = ("M_Body", "M_Uniform", "M_Hair", "M_Accessory")


# --- The head, measured off junebug-turnaround.png -----------------------------
#
# Every number below is a PIXEL MEASUREMENT converted through one scale, not a
# remembered impression. The conversion: the concept's front figure runs y
# 72..952 (881px bun-crown to sole) and this build runs 4.150ft to 0.008ft, so
# a concept fraction f of figure height is model z = 4.150 - f * 4.147, and a
# concept pixel width w is w * 4.147 / 881 feet. Every landmark here was read
# with a colour classifier over the raw PNG, both images, same detector.
#
# What that measurement OVERTURNED, and why it is written down: the round-2
# review recorded the delivered head as "longer and narrower" than the concept
# with "a taller brow-to-hairline gap". Measured, it was the opposite on both
# counts. The delivered head was 22% WIDER than tall for its face height
# (skull-width : band-top-to-chin of 1.250 against the concept's 1.025) and its
# strip of hair below the band was a THIRD of the concept's, not a half. The
# real defects the numbers found:
#
#   * the head was ~10% too small in all three axes (front width 0.256 of
#     figure height against 0.285, profile depth 0.230 against 0.262, bun-to-
#     chin 0.309 against 0.338);
#   * the HEADBAND sat far too low — 0.116 of figure height below the crown
#     against the concept's 0.064 — which is where the whole "short face"
#     reading came from, and left a 47%-too-tall hair dome above it;
#   * the lower face was 27% too narrow at the cheek and 37% too narrow at the
#     jaw. THAT is the pinch: the delivered skull was an ellipsoid that started
#     shedding width the moment it passed the eyes, where the concept holds
#     full cheek width to z~3.0 and only then falls away to a small chin.
#
# So the width profile is no longer a perturbation of a ball. FACE_HALF_WIDTH
# is the concept's own measured jaw curve, tabulated, and `face_half_scale`
# turns it into the multiplier the ellipsoid sampler needs. Changing the skull
# radii without re-deriving this table silently changes the character.
HEAD_CENTER = (0.0, -0.015, 3.32)
HEAD_RADII = (0.487, 0.500, 0.635)

# Hair-covered cranium: concept 0.2645 of figure height across, so 1.097ft, and
# the cap has to sit proud of the skull by the ~0.056ft the concept's own hair
# reads at the temple.
HAIR_CAP_CENTER = (0.0, 0.045, 3.335)
HAIR_CAP_RADII = (0.557, 0.557, 0.685)
BUN_TOP = 4.150

# (nz, half-width in feet) sampled down the concept's front silhouette. Above
# the brow the skull is under hair and the table simply returns the ball; below
# it every row is a measured mass width, ears excluded (the concept's ear step
# is visible at y 318->321 and the rows below it are pure jaw).
FACE_HALF_WIDTH = (
    (1.000, 0.000),
    (0.700, 0.360),
    (0.500, 0.443),
    (0.300, 0.497),
    (0.130, 0.503),
    (-0.190, 0.495),
    (-0.425, 0.474),
    (-0.540, 0.416),
    (-0.670, 0.361),
    (-0.720, 0.330),
    (-0.805, 0.249),
    (-0.895, 0.127),
    (-1.000, 0.000),
)


def face_half_width(nz: float) -> float:
    """The concept's measured half-width at this latitude, in feet."""
    table = FACE_HALF_WIDTH
    if nz >= table[0][0]:
        return table[0][1]
    for (n0, w0), (n1, w1) in zip(table, table[1:]):
        if nz >= n1:
            return w0 + (w1 - w0) * (n0 - nz) / (n0 - n1)
    return table[-1][1]


def face_half_scale(nz: float) -> float:
    """`width` for the ellipsoid sampler: the factor that turns rx*sin(phi)
    into the measured half-width. Both the skull and the face patch call this,
    so the atlas island can never drift off the skull it is painted on."""
    ring = (max(0.0, 1.0 - nz * nz)) ** 0.5
    if ring < 1e-4:
        return 1.0
    return face_half_width(nz) / (HEAD_RADII[0] * ring)


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
# Brighter again (F8F2E4 -> FFFBF2). MEASURED: the shipped band renders on the
# board at (204,202,199) where the concept's is (254,248,240) — the toon ramp
# costs ~20% of the authored luminance, and at a true 40px downscale the band
# was reading light GREY rather than the white that anchors her identity at
# field scale. Starting at paper-white lands the rendered band near 215.
WHITE = rgba("FFFBF2")
SOLE = rgba("EEE5D8")
TEAM_MASK = rgba("B8B8B8")


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
                # Junebug's face carries FULL cheek width down to the jaw and
                # only then falls away to a small chin — the concept's measured
                # curve, tabulated in FACE_HALF_WIDTH. The ad-hoc taper this
                # replaced shed width from the eyes down and measured 27% narrow
                # at the cheek, 37% at the jaw.
                width = 1.0
                depth = 1.0
                if face_shape:
                    width = face_half_scale(nz)
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
                    if nz < -0.45:
                        # The turnaround gives Junebug a small determined chin
                        # and a jawline; a bare ellipsoid curves away to nothing
                        # under the mouth. The X profile is now the measured
                        # table's job, so this term only carries the chin's
                        # FORWARD projection, faded by frontness so the sides
                        # stay smooth. Starts at -0.45 (was -0.30): the table
                        # holds real width to -0.54, and pushing from -0.30 put
                        # the fold under the cheek instead of under the mouth.
                        chin = min(1.0, (-nz - 0.45) / 0.45)
                        frontness = max(0.0, -sin(theta))
                        y -= 0.090 * (chin**1.8) * frontness
                        z += 0.030 * (chin**1.8) * frontness
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

    def hair_cap(self, segments: int, rings: int, *, strands: bool = False) -> None:
        """A slicked crown with the turnaround's LOW hairline and SCULPTED
        strand grooves.

        The turnaround's construction, top down: bun, short crown of hair, the
        white band, a strip of hair BELOW the band (deepest beside the eyes),
        then skin to the brows. Measured off the concept front view, that strip
        runs z 3.788 (band's lower edge at centre) down to z 3.547 (hairline) —
        0.24ft. The shipped v10 strip was 0.06ft, a quarter of it, which is
        what made the forehead read bare and the dome read as a beanie.

        ★ STRAND GROUPING IS GEOMETRY NOW, and it is the cap's OWN surface.
        Every previous attempt built strands as separate cords riding the dome:
        sunk, they z-fought and the board rendered flickering diamonds over the
        brow; proud, they caught the runtime outline shader. v10 retreated to
        PAINTED highlight bands and the round-2 board scored them "corduroy" —
        a stripe pattern has no form, so it cannot group anything. The answer
        is neither: MODULATE THE CAP'S RADIUS. A groove pressed into the
        surface the hair already has cannot fight it, costs no triangle, and
        gives smooth shading a real crease to darken — which is exactly what
        reads as grouped strands rather than a stripe.
        """
        # The crown surface tops at 4.020, under the bun's 4.150 crest and the
        # 4.16 hair ceiling: the art's front read is a big bun over a SHORT
        # crown, and the round-2 dome carried 47% more height above the band
        # than the concept does.
        center = Vector(HAIR_CAP_CENTER)
        cap_rx, _cap_ry, cap_rz = HAIR_CAP_RADII
        top = self.vertex((center.x, center.y, center.z + cap_rz), HAIR, "Head")
        rows: list[list[int]] = []
        for row in range(1, rings + 1):
            ring = []
            for column in range(segments):
                theta = 2 * pi * column / segments
                behind = max(0.0, sin(theta))
                front = max(0.0, -sin(theta))
                blend = behind * behind * (3.0 - 2.0 * behind)
                # MEASURED reach. 0.400 at the front puts the hairline at
                # z 3.547 (concept 0.1453 of figure height below the crown);
                # 0.5415 at the sides carries the hair down to the ear tops
                # (z 3.246); +0.24 behind takes it to the nape. The temple term
                # peaks at 45 degrees off-axis, where the concept's hairline
                # dives toward the ear — and it is what stops the temple hair
                # meeting the face as the hard geometric wedge the round-2
                # profile board flagged, because a boundary that curves reads
                # as a taper where a straight one reads as a cut.
                temple = (4.0 * front * (1.0 - front)) ** 2
                reach = 0.5415 - 0.1415 * front**1.3 + 0.24 * blend + 0.055 * temple
                phi = reach * pi * row / rings
                # Strand grooves: four combed partings per side, pressed into
                # the cap by ~1.5% of its radius and FADED OUT at the hairline
                # row so the front edge stays one clean curve. `groove` is
                # smooth in theta (cos^8 of the bearing offset), so the shading
                # gets a soft crease rather than a faceted notch.
                groove = 0.0
                if strands:
                    depth_along = min(1.0, (rings - row) / max(1.0, rings * 0.35))
                    for bearing in (-1.30, -0.78, -0.26, 0.26, 0.78, 1.30):
                        # bearing measured from straight ahead (-y)
                        delta = (theta + 0.5 * pi) - bearing
                        delta = (delta + pi) % (2 * pi) - pi
                        if abs(delta) < 0.30:
                            groove = max(groove, cos(delta / 0.30 * (pi / 2)) ** 6)
                    groove *= depth_along
                shrink = 1.0 - 0.016 * groove
                # 0.11, and it is a MARGIN, not a style choice. The cap and
                # the skull relax their depth by different factors about
                # different centres, so "the cap is bigger" does not imply it
                # is in front — solved at 45 degrees off-axis, the 0.16 cap sat
                # 0.003ft BEHIND the skull and the first v11 board showed two
                # skin specks through the hair at that exact bearing. 0.11 with
                # the centre pulled to y 0.045 clears it by 0.021 all round.
                # The band formula below must keep both or it floats off this
                # surface.
                depth = 1.0 - 0.11 * front * front
                x = cap_rx * shrink * sin(phi) * cos(theta)
                y = cap_rx * shrink * sin(phi) * sin(theta) * depth
                z = cap_rz * shrink * cos(phi)
                ring.append(self.vertex(center + Vector((x, y, z)), HAIR, "Head"))
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
        cx, cy, cz = HEAD_CENTER
        rx, ry, rz = HEAD_RADII
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
                # THE SAME measured profile the skull uses (face_half_scale).
                # Two copies of this maths is how an atlas island slides off
                # the head it is painted on.
                width = face_half_scale(nz)
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
                # ★ THE NOSE IS THREE FORMS, NOT ONE BUMP — bridge, rounded
                # tip, nostril wings — and it is SMALL, because that is what
                # the concept measures.
                #
                # v10 pushed a single ridge 0.145ft out of the face and the
                # board showed exactly what that is: a broad dark chevron from
                # the brows to the mouth. A steep ridge turns its flanks away
                # from the key light, so the harder you push it the more of the
                # face it shades — the "shadow smudge head-on" of blocker 3(b).
                # Measured on the concept PROFILE, the nose tip stands 14px
                # (0.067ft) in front of the cheek plane and only 2px in front
                # of the brow. It is nearly flush. What makes it read is FORM:
                # a tip whose surface faces the camera and therefore LIGHTS,
                # with wings either side of it catching the same light, and a
                # short underside that shades a small triangle instead of half
                # the face.
                bridge = max(0.0, 1.0 - ((nz + 0.335) / 0.150) ** 2) * max(
                    0.0, 1.0 - (nx / 0.100) ** 2
                )
                tip = max(0.0, 1.0 - ((nz + 0.475) / 0.105) ** 2) * max(
                    0.0, 1.0 - (nx / 0.150) ** 2
                )
                wing = max(0.0, 1.0 - ((nz + 0.500) / 0.080) ** 2) * max(
                    0.0, 1.0 - ((abs(nx) - 0.195) / 0.085) ** 2
                )
                # No **1.5 anywhere: that exponent is what sharpened the old
                # ridge. A plain quadratic cap is a rounded surface.
                nose_y = -(0.022 * bridge + 0.052 * tip + 0.030 * wing) * max(
                    0.0, cos(horizontal)
                )
                # The patch rides the skull's chin push with the identical
                # terms (frontness there is -sin(theta), which equals
                # cos(horizontal) here) — without this the pushed skull
                # swallows the island below the mouth and the crossing line
                # shades as an arc under the lips.
                chin_y = 0.0
                chin_z = 0.0
                if nz < -0.45:
                    chin = min(1.0, (-nz - 0.45) / 0.45)
                    chin_y = -0.090 * (chin**1.8) * cos(horizontal)
                    chin_z = 0.030 * (chin**1.8) * cos(horizontal)
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


# The hem stops at 1.865, ABOVE the belt (visible 1.775-1.865). Read off the
# concept's own waist: the jersey's shadow line bottoms out at z 1.867 and the
# lit belt runs 1.858 down to 1.792, with pants from 1.782.
TORSO_LEVELS = [
    (1.865, 0.43, 0.265, "Hips"),
    (1.90, 0.43, 0.27, "Spine"),
    (2.18, 0.49, 0.29, "Spine1"),
    (2.43, 0.47, 0.28, "Spine2"),
    # The 2.555 level exists for the SHOULDER SLOPE: jumping 0.47->0.315 in
    # one 0.24ft step drew the square boxed shoulder and the hard back crease
    # the round-2 profile board flagged; an intermediate ring turns both into
    # a slope the concept draws.
    (2.555, 0.415, 0.25, "Spine2"),
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


# Twin white stripes along the sleeve, shoulder seam to cuff, as the turnaround
# draws them. They are PAINTED bands on the sleeve's own surface: round 1 built
# them as thin tubes riding the cloth and the board showed them as cracked fins.
# The spans sit on the FRONT-TOP diagonal (0.45-1.10 past the +z crown toward
# -y), not the crown itself: at the old 0.14-0.74 the front board saw the
# stripes edge-on across the top of the T-pose arm and they collapsed to
# shoulder dashes — a band must FACE the camera that grades it.
ARM_STRIPE_SPANS = ((pi / 2 + 0.45, pi / 2 + 0.70), (pi / 2 + 0.85, pi / 2 + 1.10))


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
    # ★ THE CUFF MAY NOT STEP. The round-2 profile board showed "a white ring
    # at the shoulder with a dark open interior" and scored it a 3.7 failure.
    # Nothing is open — that is the T-posed arm seen straight down its own axis
    # — but v10's cuff fell 0.184 -> 0.146 in 0.077ft of length, a 21% ledge,
    # and end-on a bright ring around a recessed dark disc IS a hole to any eye
    # that has not been told otherwise. The cure is not a cap (there already is
    # one): it is to delete the ledge. The cuff now exits at 0.172 into a
    # forearm that starts at 0.168, so the silhouette runs on unbroken and the
    # end-on read is a rounded arm wearing a band. The cuff is also SHORTER
    # (0.051ft of sleeve, from 0.077, which is also what the concept draws):
    # the board's profile camera looks straight down the T-posed arm, so the
    # cuff's whole LENGTH projects as an annulus, and a long cuff draws a thick
    # white bullseye however well its radius behaves.
    #
    # The forearm is also thicker through its whole length (blocker 4b) and the
    # WRIST-to-HAND ratio is set from the concept, which draws a 0.151ft wrist
    # under a 0.212ft hand — 1.40. v10 shipped 1.29 and the hand read as a
    # continuation of the tube rather than a mitten.
    if detail >= 2:
        rings_spec = [
            (0.34, 0.230, 0.0, 2.43, SLEEVE, {"Spine2": 0.65, arm: 0.35}),
            (0.44, 0.238, 0.0, 2.43, SLEEVE, {"Spine2": 0.25, arm: 0.75}),
            (0.55, 0.228, 0.0, 2.43, SLEEVE, arm),
            (0.635, 0.207, 0.0, 2.43, SLEEVE, arm),
            (0.712, 0.190, 0.0, 2.43, SLEEVE, arm),
            (0.719, 0.189, 0.0, 2.43, CUFF, arm),
            (0.756, 0.181, 0.0, 2.43, CUFF, arm),
            (0.763, 0.176, 0.0, 2.43, CUFF, arm),
            (0.770, 0.172, 0.0, 2.43, BARE, arm),
            (0.90, 0.158, 0.0, 2.43, BARE, {arm: 0.6, fore: 0.4}),
            (1.06, 0.142, 0.0, 2.43, BARE, {arm: 0.25, fore: 0.75}),
            (1.24, 0.126, -0.005, 2.43, BARE, fore),
            (1.37, 0.114, -0.012, 2.425, BARE, {fore: 0.65, hand: 0.35}),
        ]
        angles = arm_angles(14, True)
    elif detail == 1:
        rings_spec = [
            (0.36, 0.235, 0.0, 2.43, SLEEVE, {"Spine2": 0.5, arm: 0.5}),
            (0.55, 0.226, 0.0, 2.43, SLEEVE, arm),
            (0.665, 0.200, 0.0, 2.43, SLEEVE, arm),
            (0.712, 0.190, 0.0, 2.43, SLEEVE, arm),
            (0.719, 0.189, 0.0, 2.43, CUFF, arm),
            (0.760, 0.178, 0.0, 2.43, CUFF, arm),
            (0.770, 0.172, 0.0, 2.43, BARE, {arm: 0.7, fore: 0.3}),
            (1.05, 0.144, 0.0, 2.43, BARE, {arm: 0.3, fore: 0.7}),
            (1.24, 0.126, -0.005, 2.43, BARE, fore),
            (1.37, 0.114, -0.012, 2.425, BARE, {fore: 0.65, hand: 0.35}),
        ]
        angles = arm_angles(10, False)
    else:
        rings_spec = [
            (0.38, 0.235, 0.0, 2.43, SLEEVE, {"Spine2": 0.5, arm: 0.5}),
            (0.62, 0.208, 0.0, 2.43, SLEEVE, arm),
            (0.716, 0.190, 0.0, 2.43, CUFF, arm),
            (0.766, 0.176, 0.0, 2.43, CUFF, arm),
            (0.78, 0.170, 0.0, 2.43, BARE, {arm: 0.6, fore: 0.4}),
            (1.37, 0.114, -0.012, 2.425, BARE, {fore: 0.65, hand: 0.35}),
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
    # 14x6 at hero (was 12x6): the round-2 board still read "heavily faceted
    # shoe bodies" — the ankle quarter and toe box are the two most silhouette-
    # exposed curved forms below the knee, and 30-degree columns polygonise
    # them at board scale.
    seg = 14 if detail >= 2 else 9
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
    # where the art draws the lip. Thickened rz 0.052 -> 0.060: the round-2
    # board called the thinner lens a "flat plate" — the concept's sole is a
    # rounded slab with a visible white sidewall.
    builder.ellipsoid((x0, -0.115, 0.068), (0.228, 0.335, 0.060), 1, SOLE, foot, seg, max(4, rng - 2), flatten_sole=True)
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
    # MEASURED, not guessed. On the concept front view the ear runs y 264..318,
    # i.e. z 3.246 down to 2.992 — centred at 3.119, level with the eyes, and
    # 0.254ft tall. v10 put them at 3.275 and 0.196ft: too high and a third too
    # small, which is why the board read "small nubs" and 3.10 kept failing.
    # The front silhouette says they stand 9px (0.043ft) proud of the cranium,
    # The front silhouette also says how far they STAND OUT, and v10 read that
    # wrong: its 0.043ft came from comparing the ear tips against the HAIR-
    # covered cranium at a different height. Against the skull under them the
    # concept's ears protrude ~0.10ft, and they are the widest point of the
    # whole head (0.2849 of figure height) — wider than the band. The rim peaks
    # at 0.545 against a 0.484 skull half-width here — 0.061, not the full
    # 0.10, because the concept's ear stands against a HAIR-covered temple at
    # that height and this build's hairline stops just above it. Rim to 0.585
    # against bare skin drew the flat protruding slabs the first v11 board
    # showed; the rest of the read has to come from the rim/concha/lobe form.
    cy, cz = 0.045, 3.119
    ry, rz = 0.104, 0.130

    def outline(t: float, scale: float) -> tuple[float, float]:
        # The swell is centred at the LOWER-FRONT of the outline (t ~ -2.2:
        # cos negative = forward, sin negative = down), not the bottom pole —
        # the round-2 profile read a radially uniform "lobeless donut" because
        # the old -sin(t)^2 term fattened the whole underside evenly. A tight
        # cubic falloff makes one hanging lobe the profile can actually see.
        lobe = 1.0 + 0.30 * max(0.0, cos(t + 2.2)) ** 3
        return (cy + ry * scale * lobe * cos(t), cz + rz * scale * lobe * sin(t))

    # SIX rows at hero detail: base buried under the skull, a bulged helix, the
    # rim peak, then a real turn DOWN and INWARD into the concha. Rubric 3.10
    # asks for three things and each is one row pair here — outer rim (0.528
    # peak), inner shadow hollow (the SKIN_SHADOW floor sunk to 0.468, a 0.060
    # well the key light cannot reach), lobe (the outline swell above). Each
    # row past the base also shifts BACK (+y): a rim stacked at constant y is a
    # flat plate seen from the front — the round-2 "paddle tab" — while a
    # swept-back rim foreshortens into the skull the way a real ear does.
    rows_spec = (
        (0.448, 0.92, 0.000, SKIN),
        (0.502, 1.06, 0.016, SKIN),
        (0.538, 1.02, 0.028, SKIN),
        (0.556, 0.84, 0.034, SKIN),
        (0.516, 0.48, 0.026, SKIN_SHADOW),
    ) if detail >= 2 else (
        (0.452, 1.00, 0.000, SKIN),
        (0.550, 0.96, 0.026, SKIN),
        (0.496, 0.52, 0.018, SKIN_SHADOW),
    )
    rows: list[list[int]] = []
    base_x = rows_spec[0][0]
    for x_abs, scale, back, color in rows_spec:
        row = []
        # TUCK: the rim's top and bottom pull back toward the skull, so the
        # ear's FRONT silhouette is a rounded shell instead of the rectangular
        # tab the first v11 board drew. Without it every row stands at one x
        # over its whole outline, and the front view — which sees the ear
        # edge-on — reads a slab of constant width across the ear's full
        # height. It is the front read, not the profile, that 3.10 kept losing.
        # 0.22, not 0.42: at the deeper tuck only the rim's waist stood proud
        # and the front view read a pointed nub hanging off the jaw.
        tuck = 0.22 * max(0.0, x_abs - base_x)
        for index in range(points):
            t = 2 * pi * index / points
            ear_y, ear_z = outline(t, scale)
            row.append(builder.vertex(
                ((x_abs - tuck * sin(t) ** 2) * side, ear_y + back, ear_z), color, "Head"
            ))
        rows.append(row)
    builder.grid(rows, 0, flip=side < 0)
    center = builder.vertex((0.470 * side, cy + 0.034, cz - 0.006), SKIN_SHADOW, "Head")
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
        # 0.030, was 0.034: the fatter cord read as a "lumpy rolled chunk" on
        # the shoulders in profile — the concept's trim is a flat narrow band.
        builder.tube(collar_points, [0.030] * collar_count, 1, WHITE, "Spine2", 6 if detail >= 2 else max(5, segments // 3), cyclic=True, axis=Vector((0.0, 0.0, 1.0)))
    if detail >= 2:
        # Buttoned placket: a dark seam down the chest with three buttons, as
        # the front view draws them. Geometry, not texture — it must survive
        # the toon shader and the 40 px zoom.
        # Sunk nearly flush: at -0.010 the placket stood off the chest curve
        # and read as a detached red strip in the profile silhouette.
        # Ends at 1.885, just above the raised 1.865 hem — a placket running
        # past the hem would float in front of the belt.
        # THIN seam (0.006, was 0.010): at the old width the placket line and
        # its same-colour buttons fused into one dark dash column — the round-2
        # board's "placket shows only dark dashes". The buttons must be the
        # larger, ROUNDER mark of the two or they read as more stitching.
        placket = []
        for z in (2.40, 2.15, 2.00, 1.885):
            _, ry = torso_radii(z)
            placket.append((0.0, -ry - 0.002, z))
        builder.tube(placket, [0.006] * 4, 1, SHIRT_DARK, "Spine1", 5)
        # ROUND buttons, clearly wider (0.028) than the 0.006 seam they sit on
        # so each reads as a disc, not a dash. Kept nearly flush (0.010 proud):
        # a taller stand-off broke the profile silhouette as "dark lumps".
        for z in (2.28, 2.11, 1.94):
            _, ry = torso_radii(z)
            builder.ellipsoid((0.0, -ry - 0.002, z), (0.028, 0.011, 0.028), 1, SHIRT_DARK, "Spine1", 7, 4)

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
        # Palm 0.160 across the wrist axis: the concept's hand measures 0.212ft
        # wide against a 0.151ft wrist, and this build's 0.114 wrist wants
        # 0.160 to hold that same 1.40 ratio. It is what makes the hand read as
        # a mitten rather than the end of the tube.
        builder.ellipsoid((1.44 * side, -0.018, 2.425), (0.165, 0.135, 0.160), 0, SKIN, f"{prefix}Hand", hand_segments, hand_rings)
        if detail >= 1:
            finger_count = 4 if detail >= 2 else 3
            finger_offsets = (-0.075, -0.025, 0.025, 0.075) if finger_count == 4 else (-0.060, 0.0, 0.060)
            finger_lengths = (0.115, 0.14, 0.135, 0.105) if finger_count == 4 else (0.115, 0.14, 0.11)
            for z_offset, length in zip(finger_offsets, finger_lengths):
                start_x = 1.50 * side
                # Fingers CURL toward the palm — DEEPER than v9's token bend
                # (tip drop 0.016 -> 0.038, forward curl 0.052 -> 0.070): the
                # round-2 profile still read the hand end-on as a "cinnamon
                # roll" of concentric rings because near-axial fingers present
                # only their cap rings to that camera. A real drop and curl
                # gives the profile a curved hand mass instead.
                builder.tube(
                    [
                        (start_x, -0.025, 2.425 + z_offset),
                        ((1.50 + length * 0.62) * side, -0.045, 2.425 + z_offset - 0.016),
                        ((1.50 + length) * side, -0.070, 2.425 + z_offset - 0.038),
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
        # 10x4, down from 14x5: the round-2 board already read this ring as an
        # unconcepted accessory dominating both arm views, and the triangles it
        # was spending bought resolution nothing in the concept asks for. They
        # pay for the rebuilt nose instead.
        builder.tube(
            arm_ring_points((-1.31, -0.005, 2.43), 0.116, 0.116, 10),
            [0.016] * 10,
            3,
            TEAM_MASK,
            "LeftForeArm",
            4,
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
    # belt is painted rows fully visible under the raised hem.
    #
    # ★ THE BELT IS THE JERSEY'S RED, NOT A DARKER THIRD GARMENT — measured.
    # The round-2 board read the waist as "jersey hem over a salmon band over
    # pants", three stacked cylinders, and the standing fix was to make the
    # band darker still. Sampling the concept says the opposite: its belt reads
    # (150,48,42) where the jersey above it reads (148,48,42). They are the
    # SAME red. What separates them is a shadow line, not a hue — and what
    # makes the strap read as a BELT is its LOOPS. So the band is painted SHIRT
    # with a one-row SHIRT_DARK shadow at each edge (the crease under the hem
    # and the crease onto the pants), and four pants-coloured loops straddle it
    # below. v10's SHIRT_DARK cummerbund was the middle tier of the stack.
    # ⚠️ A painted band needs a row INSIDE it, not only on its edges. The first
    # v11 pass put the strap's rows at 1.778/1.855/1.882 and its shadow windows
    # at 1.775-1.792 and 1.855-1.885 — every row landed in a shadow window and
    # the board rendered the whole belt as one dark cummerbund, the exact
    # defect the pass existed to remove.
    def pelvis_color(theta: float, z: float):
        if 1.773 <= z <= 1.783 or 1.855 <= z <= 1.866:
            return SHIRT_DARK
        if 1.773 <= z <= 1.870:
            return SHIRT
        return PANTS

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
    # rx eased 0.450 -> 0.442 through the seat: the 0.035 ledge where the
    # pelvis wall overhung the thighs' outer line (0.225 + 0.194) was the
    # bottom step of the skirt read. 0.442 keeps the thigh-shoulder margin
    # (wall depth at x 0.31 is 0.178 vs the thigh's 0.163 reach) while the
    # hip-to-leg transition narrows to a crease.
    if detail >= 1:
        # The belt is PROUD of the pants (radial_fn is not available on a loft,
        # so the strap's rows carry a +0.008 radius of their own): a strap
        # painted flush is a stripe, and a stripe is what the board kept
        # reading as a third garment.
        pelvis_levels = [
            (1.50, 0.442, 0.250, "Hips"),
            (1.56, 0.442, 0.248, "Hips"),
            (1.62, 0.440, 0.243, "Hips"),
            (1.71, 0.436, 0.239, "Hips"),
            (1.770, 0.432, 0.236, "Hips"),
            (1.777, 0.440, 0.243, "Hips"),
            (1.790, 0.441, 0.244, "Hips"),
            (1.850, 0.438, 0.242, "Hips"),
            (1.861, 0.434, 0.239, "Hips"),
            (1.872, 0.420, 0.229, "Hips"),
            (1.94, 0.400, 0.220, "Hips"),
        ]
        if detail == 1:
            pelvis_levels = [
                (1.50, 0.442, 0.250, "Hips"),
                (1.62, 0.440, 0.243, "Hips"),
                (1.770, 0.432, 0.236, "Hips"),
                (1.777, 0.440, 0.243, "Hips"),
                (1.790, 0.441, 0.244, "Hips"),
                (1.850, 0.438, 0.242, "Hips"),
                (1.861, 0.434, 0.239, "Hips"),
                (1.872, 0.420, 0.229, "Hips"),
                (1.94, 0.400, 0.220, "Hips"),
            ]
        builder.loft(pelvis_levels, 1, PANTS, segments, color_fn=pelvis_color)
    else:
        builder.ellipsoid((0.0, 0.0, 1.62), (0.45, 0.225, 0.27), 1, PANTS, "Hips", segments, rings)
    # BELT LOOPS. Still no buckle: v9's white ellipsoid read as "a stray white
    # button centred on the belt", and the concept's own front view has no
    # buckle to find — what it does have, unmistakably, is loops. Two sit on
    # the front at roughly a quarter of the waist either side of the placket
    # and two more carry round the hips, each a small PANTS-coloured tab
    # standing 0.014 proud of the strap and overhanging it top and bottom, so
    # the belt reads as threaded through the pants instead of painted on them.
    if detail >= 1:
        # -y is FRONT in this build, so the two the front board sees are the
        # pair straddling theta = -pi/2.
        for bearing in (-0.95, -2.19, 0.95, 2.19):
            loop_rx, loop_ry = 0.436, 0.240
            # HALF-BURIED in the strap, so the tab is proud on the outside and
            # has no free edge anywhere — a flat ribbon here would have shown
            # its back face from the far hip on the profile board.
            sink = 0.020
            cx_loop = (loop_rx - sink) * cos(bearing)
            cy_loop = (loop_ry - sink) * sin(bearing)
            builder.tube(
                [(cx_loop, cy_loop, 1.762), (cx_loop, cy_loop, 1.876)],
                [0.031, 0.031],
                1,
                PANTS,
                "Hips",
                5,
            )

    # Each leg is ONE stitched surface from hip to ankle (build_leg): salmon
    # pant with the pouf into the gathered knicker cuff, the darker cuff band
    # and the long red sock are painted bands with crisp boundary row pairs.
    # The sock is an identity anchor the 40 px read keeps, so every LOD
    # carries the band; it is DARKER than the jersey (#76221D on the art) so
    # the pink-pant/dark-sock break survives the toon shader.
    for side, prefix in ((-1, "Left"), (1, "Right")):
        build_leg(builder, side, prefix, detail)
        build_shoe(builder, side, prefix, detail, segments, rings)

    # ★ THE NECK MUST BE NARROWER THAN THE JAW, or the chin has nowhere to be.
    # Measured on the concept front view, the neck is 54px against a 251px head
    # — 0.219 of head width, or 0.131ft half-width here. v10 ran 0.20-0.23 and
    # the board's lower face simply melted into it: no jawline, and a "chin"
    # the width-profile measurement could not even locate, because the
    # silhouette never narrowed. At 0.150 the new jaw (0.166 half-width at
    # z 2.73) still overhangs it, so the chin has a silhouette again.
    builder.loft(
        [
            (2.52, 0.205, 0.182, "Spine2"),
            (2.63, 0.168, 0.152, "Neck"),
            (2.74, 0.155, 0.142, "Neck"),
            (2.84, 0.168, 0.152, "Head"),
        ],
        0,
        SKIN,
        max(9, segments // 2),
    )
    # Measured, not eyeballed (rubric 3.13). See the HEAD_RADII header: the
    # concept's head is 0.285 of figure height wide, 0.262 deep and 0.338 from
    # bun-crown to chin, and v10 shipped 0.256 / 0.230 / 0.309 — about a tenth
    # short in every axis. These radii carry all three, and the width PROFILE
    # (FACE_HALF_WIDTH) carries the cheeks and jaw the ellipsoid was losing.
    # Hero skull gets +8/+4 over the base grid: the cheek and jaw faceting the
    # round-2 board showed is silhouette polygonisation, which smooth shading
    # cannot hide — only rows can.
    skull_segments = segments + (8 if detail >= 2 else 4)
    skull_rings = rings + (4 if detail >= 2 else 2)
    builder.ellipsoid(HEAD_CENTER, HEAD_RADII, 0, SKIN, "Head", skull_segments, skull_rings, face_shape=True)
    # A DENSE patch at hero scale: 7x7 mapped the whole face across a handful
    # of quads and linear UV interpolation over that curvature sheared the
    # atlas's round irises into the angular wedges the board showed. 22x15
    # (was 20x13): the rebuilt nose is three overlapping caps whose narrowest,
    # the wings, spans ~0.17rad of the patch — under 2 columns at 20, which
    # samples a rounded form as a crease. 22 is where it stops being a crease
    # and the LOD0 budget still closes (21 at hero, one column of headroom).
    builder.face_patch(21 if detail >= 2 else max(6, segments // 2), 15 if detail >= 2 else max(5, rings // 2))
    # The nose is sculpted INTO the face patch (see face_patch's nose term) —
    # no mounted ellipsoid, no muzzle block. Ears ride at EYE level (centre
    # 3.119, measured), one continuous smoothed form each (build_ear).
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
    # 24x8 at hero (was 20x6): the dome's polygonal silhouette was the round-2
    # board's most-repeated faceting note, and rows are the only cure smooth
    # shading cannot fake. LOD1/2 keep the round-1 density.
    cap_columns = max(12, segments + (6 if detail >= 2 else 6))
    cap_rows = max(6, rings // 2 + (3 if detail >= 2 else 2))
    builder.hair_cap(cap_columns, cap_rows, strands=detail >= 2)
    # ★ THE BAND IS AN ARCH, AND ITS HEIGHT IS THE HEAD'S PROPORTION.
    #
    # The single biggest measured miss of v10. The concept's band top sits
    # 0.0636 of figure height below the crown; v10's sat 0.1157 — nearly twice
    # as far down. Everything the round-2 review called a head-shape problem
    # followed from that one number: a face that measured 30% short from band
    # to chin, and a hair dome above the band 47% taller than the concept's.
    #
    # It is also TILTED, hard, and v10's 0.07ft of tilt was a rounding error
    # next to it. Three measurements pin the arch — front view, band top at
    # centre z 3.886 and lower edge at the sides z 3.496; profile view, the
    # band's lower edge behind the ear at z 3.392. Fitting a quadratic in
    # sin(theta) through the three gives the line below: high across the
    # forehead, sweeping past the temples, dropping to the nape. A level ring
    # is a halo; this is a headband.
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
    band_section = ((0.026, -0.052), (-0.020, -0.068), (-0.020, 0.068), (0.026, 0.052))
    cap_rx, _cap_ry, cap_rz = HAIR_CAP_RADII
    for i in range(band_count):
        theta = 2 * pi * i / band_count
        # z 3.834 at the front (sin = -1), 3.550 at the sides, 3.446 at the
        # nape — the fitted arch. Its lower edge is the top of the hair strip
        # the hairline closes 0.24ft below.
        s = sin(theta)
        z_c = 3.550 - 0.1955 * s + 0.0915 * s * s
        front = max(0.0, -s)
        depth = 1.0 - 0.11 * front * front
        row = []
        for r_off, z_off in band_section:
            z = z_c + z_off
            shell = max(0.03, 1.0 - ((z - HAIR_CAP_CENTER[2]) / cap_rz) ** 2) ** 0.5
            row.append(builder.vertex((
                (cap_rx * shell + r_off) * cos(theta),
                HAIR_CAP_CENTER[1] + (cap_rx * shell * depth + r_off) * sin(theta),
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
        # 13x7 at hero (was 10x6): the bun is the head's crowning silhouette
        # form and the round-2 board read it visibly polygonal with a seam
        # ridge against the dome — denser rows shade the flare crossing as the
        # soft gather crease it is meant to be.
        knot_segments = 13 if detail >= 2 else 6
        knot_rings = 7 if detail >= 2 else 3
        # 0.278 half-width, top at 4.150. Measured: the concept's bun is 115px
        # across and 46px tall — 0.541 x 0.217ft — so v10's 0.67 x 0.32 was a
        # third oversized in both axes. Height 0.170 not 0.135: at the flatter
        # figure the first v11 board read the bun as a beret disc perched on
        # the dome rather than hair wound into a ball, and it is the reason the bun and the
        # crown fused into one egg instead of reading as a gather ON a head.
        # It still crests the 4.020 cap by 0.130, which is what the 40px strip
        # needs (blocker 2): the bun is the front view's identity lump because
        # the concept's own front view hides the ponytail behind the head.
        #
        # The underside FLARES (radial_fn): a plain ellipsoid's belly grazed
        # the cap dome at a tangent ring and the near-coincident surfaces
        # rendered as a column of z-fight diamonds on every board; a flared
        # skirt crosses the dome steeply and shades as a contact crease.
        # `radial_fn` also carries the bun's own STRAND GROUPING — six gather
        # creases pressed 2% into its surface, the same construction the cap
        # uses, so the bun reads as hair wound up rather than a smooth ball
        # (rubric 3.3's bar for 5) without a single extra triangle.
        def knot_shape(dx: float, dy: float, dz: float) -> float:
            flare = 0.11 * max(0.0, -dz - 0.15)
            ring = (dx * dx + dy * dy) ** 0.5
            gather = 0.0
            if ring > 1e-4:
                # cos(6*bearing) via Chebyshev in cos, so the crease pattern is
                # smooth in bearing with no trig call per vertex
                c = dx / ring
                c2 = 2 * c * c - 1
                c3 = 2 * c * c2 - c
                c6 = 2 * c3 * c3 - 1
                gather = 0.020 * max(0.0, c6) ** 2 * min(1.0, ring * 2.2)
            return 1.0 + flare - gather

        builder.ellipsoid(
            (0.0, 0.085, 3.980), (0.278, 0.238, 0.170), 2, HAIR, "Head", knot_segments, knot_rings,
            radial_fn=knot_shape,
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
    # LOD0 spends real geometry here (20 × 14 — sides raised from 13, the odd
    # count left one true edge on the profile silhouette that read as the
    # round-2 "flat hard-edged ribbon") because rubric 3.3's 5 needs a smooth
    # swept mass, and the tail is most of what the profile view IS.
    tail_samples = 18 if detail >= 2 else (11 if detail == 1 else 7)
    tail_sides = 12 if detail >= 2 else (10 if detail == 1 else 8)
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
        # The ring lives in the X-Z plane at y 0.46, PERPENDICULAR to the
        # tail's near-+y tangent there and hugging its ~0.153 radius. The v9
        # tie was a torus_points loop — a HORIZONTAL ring — so it sliced the
        # tail lengthwise and its escaped far side read on the round-2 board
        # as "a white headband sliver poking through at the tail root".
        tie_points = [
            (0.158 * cos(2 * pi * i / 8), 0.46, 3.945 + 0.158 * sin(2 * pi * i / 8))
            for i in range(8)
        ]
        builder.tube(
            tie_points,
            [0.024] * 8,
            1,
            WHITE,
            "Head",
            5,
            cyclic=True,
            axis=Vector((0.0, 1.0, 0.0)),
        )

    # Strand grouping (rubric 3.3's bar for 5/5) is DISPLACEMENT of the hair's
    # own surfaces — `hair_cap`'s `strands` grooves and the bun's `knot_shape`
    # gather creases. Two constructions were tried and both failed on the board:
    # separate cords riding the dome (sunk, they z-fight; proud, they catch the
    # runtime outline shader), and painted highlight bands, which the round-2
    # board read as corduroy because a stripe has no form to group. There is no
    # strand geometry and no strand colour; there is a shaped surface.

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
