"""Build an editable Blender review scene for a produced character.

Run from the repository root:
  blender --background --factory-startup --python scripts/v2/blender/build-signature-source.py -- calls_shot

Bootstrap/migration utility only. Finished .blend files are authoritative and
must ship through ``npm run export:authored-character -- <id>``; this script
refuses to replace an existing source.
"""

from pathlib import Path
import json
import sys

import bpy


REPO = Path.cwd()
# One place for the id -> name/slug/.blend mapping: scripts/v2/character-registry.json.
# Python cannot import the TypeScript roster, so the registry is JSON precisely so
# this script and the .mjs tooling read the same bytes instead of each keeping a
# copy that drifts. See that file's .mjs sibling for what the three copies cost.
CHARACTERS = json.loads((REPO / "scripts/v2/character-registry.json").read_text())["characters"]


def requested_id() -> str:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 1 or args[0] not in CHARACTERS:
        raise RuntimeError(f"pass one roster character id, one of: {', '.join(sorted(CHARACTERS))}")
    return args[0]


def main() -> None:
    character_id = requested_id()
    record = CHARACTERS[character_id]
    name = record["name"]
    turnaround_name = f"{record['slug']}-turnaround.png"
    # A kid nobody has sculpted has no .blend name yet; derive the conventional one.
    output_name = record.get("source") or f"{record['slug']}-pilot.blend"
    model = REPO / "public/v2/models" / f"kid_{character_id}.glb"
    turnaround = REPO / "docs/v2/concepts" / turnaround_name
    output = REPO / "assets/v2/source" / output_name
    if not model.exists() or not turnaround.exists():
        raise RuntimeError(f"export {name} and generate {turnaround_name} before building the Blender source")
    if output.exists():
        raise RuntimeError(f"refusing to overwrite authoritative Blender source {output}")

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
        f"{name} produced-character pass\n\n"
        "1 unit = 1 foot; +Y up; +Z forward.\n"
        "Do not rename, reorder or move canonical bones.\n"
        "LOD0/1/2 must remain under 7000/3000/1200 triangles.\n"
        "The packed turnaround is the visual target.\n"
        f"Use npm run export:authored-character -- {character_id} for the shipping GLB; "
        "raw Blender export is not contract-safe.\n"
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
