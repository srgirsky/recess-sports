"""Build an editable Blender review scene for a signature character.

Run from the repository root:
  blender --background --factory-startup --python scripts/v2/blender/build-signature-source.py -- calls_shot

The .blend is a review/authoring source. The deterministic Node exporter still
owns the contract-legal runtime GLB because a raw Blender round-trip reorders
canonical joints.
"""

from pathlib import Path
import sys

import bpy


REPO = Path.cwd()
CHARACTERS = {
    "nostrike": ("Junebug", "junebug-turnaround.png", "junebug-pilot.blend"),
    "calls_shot": ("Big Talk Theo", "theo-turnaround.png", "theo-pilot.blend"),
    "wheelchair_ace": ("Zoom Ramirez", "zoom-turnaround.png", "zoom-pilot.blend"),
}


def requested_id() -> str:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 1 or args[0] not in CHARACTERS:
        raise RuntimeError("pass one signature id: nostrike, calls_shot or wheelchair_ace")
    return args[0]


def main() -> None:
    character_id = requested_id()
    name, turnaround_name, output_name = CHARACTERS[character_id]
    model = REPO / "public/v2/models" / f"kid_{character_id}.glb"
    turnaround = REPO / "docs/v2/concepts" / turnaround_name
    output = REPO / "assets/v2/source" / output_name
    if not model.exists() or not turnaround.exists():
        raise RuntimeError(f"export {name} and generate {turnaround_name} before building the Blender source")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.name = f"{name.replace(' ', '_')}_Pilot"
    bpy.context.scene.unit_settings.system = "IMPERIAL"
    bpy.context.scene.unit_settings.length_unit = "FEET"
    bpy.ops.import_scene.gltf(filepath=str(model))

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.select_set(False)
        if obj.name.endswith("LOD0"):
            obj.display_type = "SOLID"
            obj.hide_render = False
        elif "LOD" in obj.name:
            obj.display_type = "WIRE"
            obj.hide_render = True
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    image = bpy.data.images.load(str(turnaround), check_existing=True)
    image.pack()
    bpy.ops.object.empty_add(type="IMAGE", location=(4.6, 2.2, -1.5))
    reference = bpy.context.object
    reference.name = f"ART_DIRECTION_{name.replace(' ', '_')}_Turnaround"
    reference.data = image
    reference.empty_display_size = 4.2
    reference.color[3] = 0.72
    reference.show_in_front = False
    reference.rotation_euler[0] = 1.57079632679

    notes = bpy.data.texts.new("READ_ME_FIRST")
    notes.write(
        f"{name} signature-character pass\n\n"
        "1 unit = 1 foot; +Y up; +Z forward.\n"
        "Do not rename, reorder or move canonical bones.\n"
        "LOD0/1/2 must remain under 7000/3000/1200 triangles.\n"
        "The packed turnaround is the visual target.\n"
        f"Use npm run export:roster-kid -- {character_id} for the shipping GLB; "
        "raw Blender export is not contract-safe.\n"
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
