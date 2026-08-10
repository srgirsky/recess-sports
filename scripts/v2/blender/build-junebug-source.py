"""Build Junebug's editable Blender review/source scene from validated assets.

Run from the repository root:
  blender --background --factory-startup --python scripts/v2/blender/build-junebug-source.py

Bootstrap/migration utility only. The finished .blend is authoritative and
ships through ``npm run export:authored-character -- nostrike``; this script
refuses to replace an existing source.
"""

from pathlib import Path

import bpy


REPO = Path.cwd()
MODEL = REPO / "public/v2/models/kid_nostrike.glb"
TURNAROUND = REPO / "docs/v2/concepts/junebug-turnaround.png"
OUTPUT = REPO / "assets/v2/source/junebug-pilot.blend"


def main() -> None:
    if not MODEL.exists() or not TURNAROUND.exists():
        raise RuntimeError("export Junebug and generate her turnaround before building the Blender source")
    if OUTPUT.exists():
        raise RuntimeError(f"refusing to overwrite authoritative Blender source {OUTPUT}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.name = "Junebug_Pilot"
    bpy.context.scene.unit_settings.system = "IMPERIAL"
    bpy.context.scene.unit_settings.length_unit = "FEET"

    bpy.ops.import_scene.gltf(filepath=str(MODEL))

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

    image = bpy.data.images.load(str(TURNAROUND), check_existing=True)
    image.pack()
    bpy.ops.object.empty_add(type="IMAGE", location=(4.6, 2.2, -1.5))
    reference = bpy.context.object
    reference.name = "ART_DIRECTION_Junebug_Turnaround"
    reference.data = image
    reference.empty_display_size = 4.2
    reference.color[3] = 0.72
    reference.show_in_front = False
    reference.rotation_euler[0] = 1.57079632679

    notes = bpy.data.texts.new("READ_ME_FIRST")
    notes.write(
        "Junebug vertical slice\n\n"
        "1 unit = 1 foot; +Y up; +Z forward.\n"
        "Do not rename, reorder or move canonical bones.\n"
        "LOD0/1/2 must remain under 7000/3000/1200 triangles.\n"
        "The packed turnaround is the visual target.\n"
        "Use npm run export:authored-character -- nostrike for the shipping GLB; "
        "raw Blender export is not contract-safe.\n"
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
