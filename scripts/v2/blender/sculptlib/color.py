"""Colour: authored sRGB swatches in, scene-linear and Blender materials out.

Lifted verbatim from Junebug's sculpt script, which is the only place any of it
had ever run. Nothing here knows a character — `rgba` parses a hex string,
`srgb_to_linear` decodes one, and `rebuild_palette_material` makes COLOR_0 the
literal authored albedo. The reasoning in each docstring is the reasoning that
earned it, and it moved with the code.
"""

from __future__ import annotations

import bpy


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




def ensure_material_slots(names: tuple[str, ...]) -> None:
    """Create any of the contract's four material slots the .blend is missing.

    ★ A BALD CHARACTER'S BOOTSTRAP HAS NO `M_Hair`, and nothing said so until a
    sculpt script tried to use one. `export-roster-kid` builds the procedural
    stand-in from the parts a kid actually has, so Tank — `hair: 'bald'` — came
    out with three materials where the asset contract names four. The failure is
    a KeyError deep inside the LOD builder, at the point of assigning slots,
    which reads as a bug in the sculpt rather than a gap in its input.

    `validate:models` would have caught the delivery, but only after a full
    Blender run and an export, and its message is about the GLB rather than
    about the source scene. Creating the slot here fixes it where it is missing.

    The new material is deliberately bare: `rebuild_palette_material` is what
    gives a slot its authored-albedo node graph, and it runs over every slot
    afterwards anyway. Noodle is the other bald kid on the roster and will land
    here too.
    """
    for name in names:
        if name not in bpy.data.materials:
            bpy.data.materials.new(name)
