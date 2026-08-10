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
REVISION = "junebug-palette-crown-v3"
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


SKIN = rgba("B96835")
SKIN_SHADOW = rgba("9F4E27")
HAIR = rgba("24140F")
SHIRT = rgba("A9282C")
SHIRT_DARK = rgba("7F1C20")
PANTS = rgba("D44F55")
PANTS_DARK = rgba("A9343C")
SHOE = rgba("9B252B")
WHITE = rgba("F3E9D5")
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
    ) -> None:
        cx, cy, cz = center
        rx, ry, rz = radii
        top = self.vertex((cx, cy, cz + rz), color, bone)
        rows: list[list[int]] = []
        for row in range(1, rings):
            phi = pi * row / rings
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
                    width = 1.03 + 0.04 * (1.0 - abs(nz)) - 0.12 * max(-nz, 0.0)
                    depth = 0.86 if ny < 0 else 1.02
                x = cx + rx * nx * width
                y = cy + ry * ny * depth
                z = cz + rz * nz
                if flatten_sole:
                    z = max(z, cz - rz * 0.74)
                uv = (0.75, 0.25)
                row_vertices.append(self.vertex((x, y, z), color, bone, uv))
            rows.append(row_vertices)
        bottom_z = cz - rz * (0.74 if flatten_sole else 1.0)
        bottom = self.vertex((cx, cy, bottom_z), color, bone)

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
    ) -> None:
        rows: list[list[int]] = []
        for z, rx, ry, bone in levels:
            row = []
            for column in range(segments):
                theta = 2 * pi * column / segments
                row.append(self.vertex((rx * cos(theta), ry * sin(theta), z), color, bone))
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

    def hair_cap(self, segments: int, rings: int) -> None:
        """A full crown of hair, not a back-half shell.

        The first pass swept theta over only the back half of the skull, so
        from the front the crown above the headband read as bare skin — the
        'cap brim' defect on the fidelity board. The crown now covers the full
        circumference; each column's reach is solved so hair ends just under
        the headband in front (a natural hairline) and flows to the nape
        behind the ponytail.
        """
        center = Vector((0.0, 0.08, 3.48))
        top = self.vertex((0.0, 0.08, 4.14), HAIR, "Head")
        rows: list[list[int]] = []
        for row in range(1, rings + 1):
            ring = []
            for column in range(segments):
                theta = 2 * pi * column / segments
                behind = max(0.0, sin(theta))
                blend = behind * behind * (3.0 - 2.0 * behind)
                phi = (0.37 + 0.35 * blend) * pi * row / rings
                x = 0.60 * sin(phi) * cos(theta)
                y = 0.52 * sin(phi) * sin(theta)
                z = 0.66 * cos(phi)
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
        cx, cy, cz = (0.0, -0.015, 3.45)
        rx, ry, rz = (0.56, 0.47, 0.61)
        grid: list[list[int]] = []
        for row in range(rows + 1):
            vf = row / rows
            vertical = -0.46 + vf * 0.92
            line = []
            for column in range(columns + 1):
                uf = column / columns
                horizontal = -0.60 + uf * 1.20
                nx = sin(horizontal) * cos(vertical)
                ny = -cos(horizontal) * cos(vertical)
                nz = sin(vertical)
                width = 1.03 + 0.04 * (1.0 - abs(nz)) - 0.12 * max(-nz, 0.0)
                # Just proud of the skull — 0.014 read as a shadowed step at the
                # island edge on the fidelity board; 0.006 still clears z-fight.
                point = (
                    cx + rx * nx * width,
                    cy + 0.86 * ry * ny - 0.006,
                    cz + rz * nz,
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


def add_character(builder: MeshBuilder, segments: int, rings: int, detail: int) -> None:
    # Constructed torso: wider shoulders, real waist and a visible tucked hem.
    builder.loft(
        [
            (1.72, 0.39, 0.25, "Hips"),
            (1.86, 0.43, 0.27, "Spine"),
            (2.18, 0.49, 0.29, "Spine1"),
            (2.43, 0.47, 0.28, "Spine2"),
            (2.58, 0.36, 0.23, "Spine2"),
        ],
        1,
        SHIRT,
        segments,
    )
    if detail >= 1:
        builder.tube(torus_points((0, 0, 1.76), 0.40, 0.26, segments), [0.035] * segments, 1, SHIRT_DARK, "Hips", max(5, segments // 2), cyclic=True, axis=Vector((0.0, 0.0, 1.0)))
        builder.tube(torus_points((0, 0, 2.57), 0.25, 0.18, segments), [0.030] * segments, 1, WHITE, "Spine2", max(5, segments // 2), cyclic=True, axis=Vector((0.0, 0.0, 1.0)))

    # Sleeves, tapered arms and articulated hand silhouettes. The exposed limb
    # is one weighted surface across the elbow instead of three overlapping
    # ellipsoids; that keeps the arm human when a clip bends it.
    for side, prefix in ((-1, "Left"), (1, "Right")):
        sleeve_points = [
            (0.40 * side, 0.0, 2.43),
            (0.56 * side, 0.0, 2.43),
            (0.72 * side, 0.0, 2.43),
        ]
        builder.tube(
            sleeve_points,
            [0.235, 0.215, 0.175],
            1,
            SHIRT,
            f"{prefix}Arm",
            max(7, segments // 2),
        )
        if detail >= 1:
            builder.tube(
                arm_ring_points((0.72 * side, 0.0, 2.43), 0.178, 0.178, max(10, segments)),
                [0.022] * max(10, segments),
                1,
                WHITE,
                f"{prefix}Arm",
                max(5, segments // 3),
                cyclic=True,
            )
        arm_points = [
            (0.68 * side, 0.0, 2.43),
            (0.82 * side, 0.0, 2.43),
            (0.98 * side, 0.0, 2.43),
            (1.10 * side, 0.0, 2.43),
            (1.24 * side, -0.005, 2.43),
            (1.37 * side, -0.012, 2.425),
        ]
        arm_weights: list[str | dict[str, float]] = [
            f"{prefix}Arm",
            f"{prefix}Arm",
            {f"{prefix}Arm": 0.72, f"{prefix}ForeArm": 0.28},
            {f"{prefix}Arm": 0.30, f"{prefix}ForeArm": 0.70},
            f"{prefix}ForeArm",
            {f"{prefix}ForeArm": 0.65, f"{prefix}Hand": 0.35},
        ]
        builder.tube(
            arm_points,
            [0.145, 0.15, 0.132, 0.118, 0.112, 0.105],
            0,
            SKIN,
            arm_weights,
            max(7, segments // 2),
        )

        # Palm, four readable finger volumes and a separately rooted thumb.
        # LOD2 keeps a mitten; the closer levels get silhouette definition.
        builder.ellipsoid((1.43 * side, -0.015, 2.425), (0.16, 0.125, 0.145), 0, SKIN, f"{prefix}Hand", segments, rings)
        if detail >= 1:
            finger_count = 4 if detail >= 2 else 3
            finger_offsets = (-0.075, -0.025, 0.025, 0.075) if finger_count == 4 else (-0.060, 0.0, 0.060)
            finger_lengths = (0.115, 0.14, 0.135, 0.105) if finger_count == 4 else (0.115, 0.14, 0.11)
            for z_offset, length in zip(finger_offsets, finger_lengths):
                start_x = 1.50 * side
                builder.tube(
                    [
                        (start_x, -0.025, 2.425 + z_offset),
                        ((1.50 + length * 0.62) * side, -0.030, 2.425 + z_offset),
                        ((1.50 + length) * side, -0.025, 2.425 + z_offset),
                    ],
                    [0.042, 0.040, 0.028],
                    0,
                    SKIN,
                    f"{prefix}HandIndex1",
                    6,
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
                6,
            )

    # A small drafting-team wrist band provides team identity without repainting
    # Junebug's signature red kit.
    if detail >= 1:
        builder.tube(
            arm_ring_points((-1.31, -0.005, 2.43), 0.115, 0.115, max(10, segments)),
            [0.023] * max(10, segments),
            3,
            TEAM_MASK,
            "LeftForeArm",
            max(5, segments // 3),
            cyclic=True,
        )

    # Pants are fuller through the thigh and taper into deliberate cuffs.
    builder.ellipsoid((0.0, 0.0, 1.66), (0.43, 0.27, 0.25), 1, PANTS_DARK, "Hips", segments, rings)
    for side, prefix in ((-1, "Left"), (1, "Right")):
        builder.ellipsoid((0.21 * side, 0.0, 1.30), (0.23, 0.23, 0.43), 1, PANTS, f"{prefix}UpLeg", segments, rings)
        builder.ellipsoid((0.21 * side, 0.0, 0.72), (0.19, 0.20, 0.39), 1, PANTS, f"{prefix}Leg", segments, rings)
        if detail >= 1:
            builder.tube(
                torus_points((0.21 * side, 0.0, 0.38), 0.18, 0.18, max(8, segments // 2)),
                [0.026] * max(8, segments // 2),
                1,
                PANTS_DARK,
                f"{prefix}Leg",
                max(5, segments // 3),
                cyclic=True,
                axis=Vector((0.0, 0.0, 1.0)),
            )
        if detail == 0:
            # At LOD2 the shoe is six pixels tall: preserve the toe/sole read,
            # not invisible panel topology.
            builder.ellipsoid((0.21 * side, -0.16, 0.20), (0.25, 0.38, 0.17), 1, SHOE, f"{prefix}Foot", segments, rings, flatten_sole=True)
            builder.ellipsoid((0.21 * side, -0.17, 0.075), (0.265, 0.40, 0.065), 1, SOLE, f"{prefix}Foot", segments, rings, flatten_sole=True)
        else:
            # Layered sneaker: ankle collar, heel counter, long toe box, toe
            # cap and separate outsole. These overlap as manufactured panels.
            builder.ellipsoid((0.21 * side, 0.015, 0.27), (0.205, 0.21, 0.18), 1, SHOE, f"{prefix}Foot", segments, rings, flatten_sole=True)
            builder.ellipsoid((0.21 * side, 0.10, 0.255), (0.20, 0.16, 0.155), 1, SHIRT_DARK, f"{prefix}Foot", segments, rings, flatten_sole=True)
            builder.ellipsoid((0.21 * side, -0.17, 0.19), (0.24, 0.32, 0.145), 1, SHOE, f"{prefix}Foot", segments, rings, flatten_sole=True)
            builder.ellipsoid((0.21 * side, -0.405, 0.16), (0.215, 0.085, 0.078), 1, WHITE, f"{prefix}Foot", segments, max(4, rings // 2), flatten_sole=True)
            builder.ellipsoid((0.21 * side, -0.14, 0.075), (0.255, 0.36, 0.065), 1, SOLE, f"{prefix}Foot", segments, max(4, rings // 2), flatten_sole=True)
            lace_rows = (-0.12, -0.21, -0.30) if detail >= 2 else (-0.22,)
            for lace_y in lace_rows:
                lace_z = 0.315 - 0.22 * max(0.0, -lace_y - 0.12)
                builder.tube(
                    [(-0.12 + 0.21 * side, lace_y, lace_z), (0.12 + 0.21 * side, lace_y, lace_z)],
                    [0.014, 0.014],
                    1,
                    WHITE,
                    f"{prefix}Foot",
                    5,
                )
            if detail >= 2:
                # A sidewall stripe survives at hero scale; LOD1 keeps the
                # panel/toe/sole silhouette without this small tube.
                outer_x = 0.21 * side + 0.235 * side
                builder.tube(
                    [(outer_x, -0.02, 0.18), (outer_x, -0.24, 0.15), (outer_x, -0.42, 0.135)],
                    [0.014, 0.014, 0.012],
                    1,
                    WHITE,
                    f"{prefix}Foot",
                    5,
                )

    # Neck, ears and a face whose cheek-to-chin taper follows the turnaround.
    builder.ellipsoid((0.0, 0.0, 2.69), (0.18, 0.16, 0.20), 0, SKIN_SHADOW, "Neck", segments, rings)
    builder.ellipsoid((0.0, -0.015, 3.45), (0.56, 0.47, 0.61), 0, SKIN, "Head", segments + 4, rings + 2, face_shape=True)
    builder.face_patch(max(6, segments // 2), max(5, rings // 2))
    if detail >= 1:
        builder.ellipsoid((-0.55, 0.0, 3.43), (0.105, 0.07, 0.13), 0, SKIN, "Head", max(10, segments // 2), max(6, rings // 2))
        builder.ellipsoid((0.55, 0.0, 3.43), (0.105, 0.07, 0.13), 0, SKIN, "Head", max(10, segments // 2), max(6, rings // 2))

    # Hair is one designed mass: full slicked-back crown + high swept ponytail.
    # The headband sits across the hairline, so the crown's front edge tucks
    # just beneath it; there is deliberately no fringe — the turnaround pulls
    # everything back into the ponytail.
    builder.hair_cap(max(12, segments + 4), max(6, rings // 2 + 2))
    headband_points = torus_points((0.0, 0.0, 3.80), 0.545, 0.42, max(12, segments))
    builder.tube(headband_points, [0.035] * len(headband_points), 1, WHITE, "Head", max(5, segments // 3), cyclic=True, axis=Vector((0.0, 0.0, 1.0)))
    ponytail_points = [
        (0.0, 0.39, 3.72),
        (0.0, 0.54, 3.84),
        (0.0, 0.78, 3.88),
        (0.0, 1.00, 3.72),
        (0.0, 1.12, 3.42),
        (0.0, 1.17, 3.13),
    ]
    builder.tube(
        ponytail_points,
        [0.18, 0.23, 0.27, 0.26, 0.22, 0.12],
        2,
        HAIR,
        "Head",
        max(8, segments // 2),
    )
    builder.ellipsoid((0.0, 1.18, 2.97), (0.27, 0.16, 0.31), 2, HAIR, "Head", max(10, segments // 2), max(6, rings // 2))

    if detail >= 2:
        # White athletic piping is geometry, not a texture that disappears at
        # 40 pixels. It traces the shirt's shoulder line from either side.
        for side in (-1, 1):
            builder.tube(
                [(0.14 * side, -0.275, 2.54), (0.38 * side, -0.255, 2.48), (0.58 * side, -0.20, 2.41)],
                [0.022, 0.022, 0.020],
                1,
                WHITE,
                "Spine2",
                6,
            )


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
