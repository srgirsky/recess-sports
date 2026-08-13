"""Render deterministic front and profile silhouette evidence from a runtime GLB.

Usage:
  blender --background --factory-startup \
    --python scripts/v2/blender/render-fidelity-views.py -- mimi_mash mimi-mash
"""

from pathlib import Path
import math
import sys

import bpy
from mathutils import Vector


REPO = Path.cwd()


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def rebuild_body_material() -> None:
    """Mirror the runtime's face-atlas decal (src/v2/render/materials/toon.ts).

    The atlas travels in the GLB as M_Body's emissive texture because glTF has
    no second albedo slot. The runtime toon shader REPLACES albedo with the
    atlas texel inside the face UV island; EEVEE instead renders emission
    additively, so dark ink adds ~nothing and every face renders blank — which
    made the board understate the face read. Rebuild the material to do what
    the game does: vertex colour everywhere, the resting (top-left) cell
    alpha-decaled inside the island, no emission.
    """
    material = bpy.data.materials.get("M_Body")
    if material is None or not material.use_nodes:
        return
    # M_Body carries two images: the 1px `albedo` placeholder and the atlas.
    # `face_atlas` is the contract name (normalizeFaceAtlasName stamps it);
    # picking any-image-on-the-material decals opaque white over the island.
    atlas_image = None
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image is not None and node.image.name.startswith("face_atlas"):
            atlas_image = node.image
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.82
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    base = nodes.new("ShaderNodeVertexColor")
    base.layer_name = "Color"
    if atlas_image is None:
        links.new(base.outputs["Color"], shader.inputs["Base Color"])
        return

    uv = nodes.new("ShaderNodeUVMap")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], separate.inputs["Vector"])
    # Blender flips glTF V, so the contract island lands on UV [0..0.5]x[0..0.5]
    # with the forehead at v=0. The resting cell is the atlas's top-left quarter
    # sampled forehead-up: faceUv = (0.5u, 1 - 0.5v).
    scale_u = nodes.new("ShaderNodeMath")
    scale_u.operation = "MULTIPLY"
    scale_u.inputs[1].default_value = 0.5
    links.new(separate.outputs["X"], scale_u.inputs[0])
    scale_v = nodes.new("ShaderNodeMath")
    scale_v.operation = "MULTIPLY_ADD"
    scale_v.inputs[1].default_value = -0.5
    scale_v.inputs[2].default_value = 1.0
    links.new(separate.outputs["Y"], scale_v.inputs[0])
    combine = nodes.new("ShaderNodeCombineXYZ")
    links.new(scale_u.outputs[0], combine.inputs["X"])
    links.new(scale_v.outputs[0], combine.inputs["Y"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = atlas_image
    tex.extension = "CLIP"
    links.new(combine.outputs["Vector"], tex.inputs["Vector"])

    in_u = nodes.new("ShaderNodeMath")
    in_u.operation = "LESS_THAN"
    in_u.inputs[1].default_value = 0.5001
    links.new(separate.outputs["X"], in_u.inputs[0])
    in_v = nodes.new("ShaderNodeMath")
    in_v.operation = "LESS_THAN"
    in_v.inputs[1].default_value = 0.5001
    links.new(separate.outputs["Y"], in_v.inputs[0])
    mask = nodes.new("ShaderNodeMath")
    mask.operation = "MULTIPLY"
    links.new(in_u.outputs[0], mask.inputs[0])
    links.new(in_v.outputs[0], mask.inputs[1])
    factor = nodes.new("ShaderNodeMath")
    factor.operation = "MULTIPLY"
    links.new(tex.outputs["Alpha"], factor.inputs[0])
    links.new(mask.outputs[0], factor.inputs[1])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    links.new(factor.outputs[0], mix.inputs["Factor"])
    links.new(base.outputs["Color"], mix.inputs[6])
    links.new(tex.outputs["Color"], mix.inputs[7])
    links.new(mix.outputs[2], shader.inputs["Base Color"])


def render_view(scene: bpy.types.Scene, camera: bpy.types.Object, location: tuple[float, float, float], output: Path) -> None:
    camera.location = location
    point_at(camera, Vector((0, 0, 2.05)))
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


# How far the arms come down from the T-pose for the A-pose renders, in degrees.
# Not a style choice: it is the roster's own resting abduction, the same angle
# `proceduralClips.ts` hangs an idle arm at, so the A-pose board shows the kid
# in the pose the game actually draws him in most of the time.
A_POSE_DEG = 72.0
# ⚠️ AND IT IS PER CHARACTER WHERE THE CHARACTER SAYS SO. The board exists to be
# compared against a drawing, so it has to hold the pose the character actually
# rests in — and a wide-bodied kid does not rest at the roster's angle. Tank's
# idle carries 40 degrees of abduction (a 50-degree rotation) because anything
# less buries his sleeve inside his own tee; a board still rendering him at 72
# would be scoring a pose the game never shows. Keep this in step with
# `proceduralClips.ts`.
A_POSE_BY_ID = {"tank": 50.0}


def pose_arms_down(degrees: float) -> None:
    """Rotate both arm chains down about the forward axis.

    ⚠️ POSE THE BONES, NEVER THE MESH. The mesh is skinned, so rotating the
    object would move the geometry off the armature it is bound to and every
    later measurement would be of something the runtime never draws.
    """
    armature = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if armature is None:
        return
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    for side, sign in (("Left", 1.0), ("Right", -1.0)):
        bone = armature.pose.bones.get(f"{side}Arm")
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        # Local Y runs along the limb, so the swing is about local Z. The sign
        # flips per side because the left chain points down -x and the right +x.
        bone.rotation_euler[2] = sign * math.radians(degrees)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 2:
        raise RuntimeError("pass a roster id and output slug")
    character_id, slug = args
    model = REPO / "public/v2/models" / f"kid_{character_id}.glb"
    output_dir = REPO / "docs/v2/concepts"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    rebuild_body_material()
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

    # ★ THE FILL IS A MIRROR OF THE KEY, AND IT HAS TO BE, because this board's
    # ONLY job is comparison against the concept sheet. The old rig keyed from
    # +x at 950 and filled from BEHIND on -x at 550, which sank the left of
    # every face: measured left-vs-right luminance split across the delivered
    # front render was 27.9 counts at the forehead and 29.6 at the cheek, where
    # the same measurement on junebug-turnaround.png reads 3.2 and 3.6. The
    # concept is lit almost flat and frontal; the board was not.
    #
    # That cost a whole review round. Round 6 measured the split, correctly
    # ruled it larger than the concept's, and concluded the FACE PLANES were
    # carved asymmetrically — a reasonable inference that happened to be wrong,
    # and one no sculpting could ever have satisfied. (There WAS a real
    # asymmetry underneath it, an unmirrored face column, and it is fixed in
    # sculpt-junebug-source.py's head_surface; it accounted for about a third
    # of the split. The rest was this.)
    #
    # So the fill mirrors the key's position and carries 78% of its energy:
    # enough imbalance to keep the form reading, little enough that a reviewer
    # comparing the two sheets is comparing SCULPT rather than lighting. Any
    # future change here changes every character's board — re-measure the split
    # against the concept's before landing one.
    bpy.ops.object.light_add(type="AREA", location=(4.0, -5.5, 7.0))
    key = bpy.context.object
    key.data.energy = 950
    key.data.size = 5.0
    point_at(key, Vector((0, 0, 2.1)))
    bpy.ops.object.light_add(type="AREA", location=(-4.0, -5.5, 7.0))
    fill = bpy.context.object
    fill.data.energy = 740
    fill.data.size = 5.0
    point_at(fill, Vector((0, 0, 2.1)))

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

    # ★ AND A THIRD PAIR WITH THE ARMS DOWN, BECAUSE THE CONCEPT IS NOT T-POSED.
    #
    # Rubric 3.1 scores the delivered silhouette against the turnaround's. The
    # board renders the BIND pose, and every turnaround on this roster draws the
    # kid standing with his arms at his sides. For most characters the
    # difference is cosmetic. For a wide-bodied one it decides the score, in
    # both directions, and Tank produced one of each:
    #
    #   - the bind pose HID a real defect. Widening his tee to the traced
    #     concept width buried his arms inside it in every arms-down pose, and
    #     nine rounds of measured metrics stayed green because the board's arms
    #     are horizontal and clear the torso by construction.
    #   - the bind pose INVENTED one. Seen end-on down its own axis, his sleeve
    #     reads as a bored socket on his chest; three separate reviews called it
    #     a bullseye, a doorknob and an "open interior", and one scored 3.7 a
    #     FAIL on it. Alpha-sampled, there is no hole: 0 pixels under alpha 250
    #     across the whole shoulder window. It is a shadowed concavity that only
    #     exists because the camera is looking along the arm.
    #
    # The concept cannot adjudicate either, because it never shows an arm from
    # that angle. An A-pose render can. This is the same class as the two other
    # instrument gaps this character exposed — a landmark that silently could
    # not be traced, and a face camera that could not see a face.
    pose_arms_down(A_POSE_BY_ID.get(character_id, A_POSE_DEG))
    render_view(scene, camera, (0, -12, 2.2), output_dir / f"{slug}-front-apose-review.png")
    render_view(scene, camera, (12, 0, 2.2), output_dir / f"{slug}-profile-apose-review.png")
    print(f"wrote {slug} front/profile fidelity views, bind and A-pose")


if __name__ == "__main__":
    main()
