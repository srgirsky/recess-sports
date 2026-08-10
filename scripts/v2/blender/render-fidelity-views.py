"""Render deterministic front and profile silhouette evidence from a runtime GLB.

Usage:
  blender --background --factory-startup \
    --python scripts/v2/blender/render-fidelity-views.py -- mimi_mash mimi-mash
"""

from pathlib import Path
import sys

import bpy
from mathutils import Vector


REPO = Path.cwd()


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_view(scene: bpy.types.Scene, camera: bpy.types.Object, location: tuple[float, float, float], output: Path) -> None:
    camera.location = location
    point_at(camera, Vector((0, 0, 2.05)))
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 2:
        raise RuntimeError("pass a roster id and output slug")
    character_id, slug = args
    model = REPO / "public/v2/models" / f"kid_{character_id}.glb"
    output_dir = REPO / "docs/v2/concepts"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.hide_render = "LOD0" not in obj.name
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    bpy.ops.object.camera_add(location=(0, -12, 2.2))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.15
    bpy.context.scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(4.0, -5.5, 7.0))
    key = bpy.context.object
    key.data.energy = 950
    key.data.size = 5.0
    point_at(key, Vector((0, 0, 2.1)))
    bpy.ops.object.light_add(type="AREA", location=(-4.0, 2.0, 4.0))
    fill = bpy.context.object
    fill.data.energy = 550
    fill.data.size = 4.0
    point_at(fill, Vector((0, 0, 2.0)))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 540
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("FidelityWorld")
    scene.world.color = (0.025, 0.035, 0.05)
    output_dir.mkdir(parents=True, exist_ok=True)

    render_view(scene, camera, (0, -12, 2.2), output_dir / f"{slug}-front-review.png")
    render_view(scene, camera, (12, 0, 2.2), output_dir / f"{slug}-profile-review.png")
    print(f"wrote {slug} front/profile fidelity views")


if __name__ == "__main__":
    main()
