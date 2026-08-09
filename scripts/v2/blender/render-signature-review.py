"""Render a deterministic sculpt-review still from a shipped character GLB.

Usage:
  blender --background --factory-startup --python scripts/v2/blender/render-signature-review.py -- calls_shot
"""

from pathlib import Path
import sys

import bpy
from mathutils import Vector


REPO = Path.cwd()
NAMES = {
    "nostrike": "junebug",
    "calls_shot": "theo",
    "wheelchair_ace": "zoom",
    "big_lou": "big-lou",
}


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 1 or args[0] not in NAMES:
        raise RuntimeError("pass one produced character id: nostrike, calls_shot, wheelchair_ace or big_lou")
    character_id = args[0]
    model = REPO / "public/v2/models" / f"kid_{character_id}.glb"
    output = REPO / "docs/v2/concepts" / f"{NAMES[character_id]}-in-game-review.png"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.hide_render = not obj.name.endswith("LOD0")
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    # Blender imports glTF's +Y-up as +Z-up; original +Z-forward becomes -Y.
    bpy.ops.object.camera_add(location=(6.8, -9.4, 4.8))
    camera = bpy.context.object
    camera.data.lens = 58
    point_at(camera, Vector((0, 0, 2.05)))
    bpy.context.scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(4.0, -6.0, 7.0))
    key = bpy.context.object
    key.data.energy = 900
    key.data.shape = "DISK"
    key.data.size = 5.0
    point_at(key, Vector((0, 0, 2.0)))
    bpy.ops.object.light_add(type="AREA", location=(-4.0, -2.0, 4.0))
    fill = bpy.context.object
    fill.data.energy = 500
    fill.data.size = 4.0
    point_at(fill, Vector((0, 0, 2.0)))

    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "ReviewFloor"
    material = bpy.data.materials.new("ReviewFloor")
    material.diffuse_color = (0.055, 0.075, 0.09, 1)
    floor.data.materials.append(material)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output)
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("ReviewWorld")
    scene.world.color = (0.018, 0.025, 0.04)
    scene.render.image_settings.color_mode = "RGBA"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"wrote {output}")


if __name__ == "__main__":
    main()
