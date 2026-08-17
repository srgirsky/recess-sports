"""Render deterministic front and profile silhouette evidence from a runtime GLB.

Usage:
  blender --background --factory-startup \
    --python scripts/v2/blender/render-fidelity-views.py -- mimi_mash mimi-mash
"""

from pathlib import Path
import math
import os
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


# The stance: many turnarounds on this roster draw the feet together, and the
# rig's bind pose splays the legs — the "ankle daylight" metric read that splay
# as a delivered defect (rubric 6b.4 deferred it as a STANCE fix, never a
# tolerance widening). The idle clips already plant the feet close; the board
# must hold the stance the drawing and the game share, exactly the argument
# that put the arms down. Applied to ALL views (bind and A-pose): the
# measurement reads the bind front, and a stance is not an arm experiment.
#
# ★ THERE IS NO DEFAULT ANGLE, AND REMOVING IT IS THE POINT OF THIS BLOCK.
#
# There used to be: `LEGS_IN_DEG = 10.0`, taken by every character with no
# entry below. It closed their legs so far that the two legs met and rendered
# as ONE MASS, and the board is what rubric 3.12 ("the legs are two legs") is
# scored from. Seven characters inherited it — big_lou, dex, grizz, lefty,
# mimi_mash, moose, sniffles — and NINE independent critics duly filed 3.12
# against the sculpt, one of them as a BLOCKER, while a tenth got the cause
# exactly right and was not acted on: "undo the 10deg hip adduction."
#
# The sculpts were never at fault. Re-rendering dex at the median calibrated
# angle takes his inter-leg daylight from 0.0% of figure width to 31.3%,
# against his own drawing's 29.5% — the legs he ships were correct all along,
# and only the pose the board photographed them in was not.
#
# ⚠️ AND NOTE WHY THE DEFAULT WAS SO FAR OFF: every angle below was calibrated
# per kid and they land at 0.0-7.0, so 10.0 was not a middle value, it was
# nearly double the median of every measurement anyone had actually taken. A
# default is not a neutral choice — this is `sculptspec.lint.test.js`'s rule
# ("a default on a spec field is one kid's body silently worn by twenty-nine")
# reappearing in a renderer, where that lint cannot see it.
#
# So a character with no entry now RAISES. Adding a kid costs one measurement;
# it must never again cost nine misdirected reviews.
#
# ★ HOW TO PICK AN ANGLE. Match the kid's OWN drawing, measured over the whole
# lower body rather than at one row. The original calibration maximised
# adduction subject to the silhouette gate not seeing a puncture, which asks
# "how closed can this get" instead of "what does the sheet show" — and the
# ankle row it optimised for is exactly the row that says nothing about the
# thighs. Sweep with FIDELITY_LEGS_DEG and take the angle whose inter-leg
# daylight profile sits closest to the concept front figure's.
LEGS_IN_BY_ID = {
    # Drawn-open stances hold their sheets (Junebug 46.9, Theo 56.9 drawn).
    "nostrike": 0.0, "calls_shot": 0.0,
    # Per-kid ceilings from the stance calibration: the largest angle whose
    # silhouettes do NOT touch - contact encloses the between-legs window
    # and the silhouette gate reads it as a puncture. Rocket touches at any
    # angle (the ponytail bounce meets the shoulder line), so she keeps
    # bind and her ankle metric keeps its long-recorded cause.
    "rocket": 0.0, "tank": 4.0, "bend_it": 4.0,
    "ace_kid": 5.5, "boomer": 5.5, "chip": 5.5, "clover": 5.5,
    "cricket": 5.5, "diva": 5.5, "flash": 5.5, "gizmo": 5.5,
    "noodle": 5.5, "peaches": 5.5, "penny": 5.5, "smokey": 5.5,
    "the_prof": 5.5, "bubbles": 7.0, "zippy": 7.0, "sprout": 4.0,
    # ★ Turbo was calibrated, and calibrated wrong, which is why the entry
    # moved: 13.0 was the highest angle in this table and it left him with a
    # gap on 3% of his sampled rows — fused everywhere but one. A critic filed
    # "FUSED LEGS AND MERGED SHOES IN BIND AND A-POSE" against the sculpt. He
    # measures concept 45.8; the sweep gives 49.1 at 2deg and 42.9 at 4deg.
    # A per-kid number is not automatically a measured number — 13.0 came from
    # the "largest angle that does not puncture" rule, which is a ceiling, and
    # a ceiling was being used as a target.
    "turbo": 4.0,
    # ★ The seven that used to inherit the 10.0 default, each measured against
    # its own concept front figure (delivered max inter-leg daylight as a % of
    # row span, swept 0/2/4/5.5/7 deg, versus the drawing's own):
    #   big_lou   concept 36.4 -> 0.0deg gives 36.3   (10.0deg gave 0.0)
    #   grizz     concept 37.5 -> 0.0deg gives 38.2   (10.0deg gave 0.0)
    #   lefty     concept 60.1 -> 0.0deg gives 54.8   (10.0deg gave 0.0)
    #   mimi_mash concept 55.6 -> 0.0deg gives 45.9   (10.0deg gave 18.2)
    #   moose     concept 35.2 -> 2.0deg gives 36.8   (10.0deg gave 0.0)
    #   sniffles  concept 31.9 -> 5.5deg gives 31.3   (10.0deg gave 2.9)
    #   dex       concept 29.5 -> 5.5deg gives 31.3   (10.0deg gave 0.0)
    # Five of the seven want NO adduction at all, which is the tell that the
    # "every turnaround draws the feet together" premise above was read off the
    # ankle row and does not hold for the kids drawn with an open stance.
    "big_lou": 0.0, "grizz": 0.0, "lefty": 0.0, "mimi_mash": 0.0,
    "moose": 2.0, "sniffles": 5.5, "dex": 5.5,
    # Zoom's tucked legs are Root-weighted furniture the leg bones never move,
    # so any angle is a no-op for him. Recorded explicitly rather than left to
    # fall through, because there is nothing to fall through to any more.
    "wheelchair_ace": 0.0,
}


def pose_legs_in(degrees: float) -> None:
    """Rotate both leg chains inward about the forward axis (adduction)."""
    armature = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if armature is None:
        return
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    for side, sign in (("Left", 1.0), ("Right", -1.0)):
        bone = armature.pose.bones.get(f"{side}UpLeg")
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        # Same frame as the arms: local Y runs along the limb, the swing is
        # about local Z, and the sign flips per side to bring the ankles IN.
        bone.rotation_euler[2] = sign * math.radians(degrees)
        # Feet stay FLAT: counter-rotate the foot so the shoes stand upright
        # side by side. Tilted shoes leaned into each other and shifted the
        # shoe-band split ~2 points on a 50/50 kid - the stance must close
        # the ankles without changing what the band window sees.
        foot = armature.pose.bones.get(f"{side}Foot")
        if foot is not None:
            foot.rotation_mode = "XYZ"
            foot.rotation_euler[2] = -sign * math.radians(degrees)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()


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

    # FIDELITY_LEGS_DEG is the calibration override: the stance must close the
    # legs as far as the silhouettes allow WITHOUT touching - contact encloses
    # the between-legs window and the silhouette gate reads it as a puncture.
    env_deg = os.environ.get("FIDELITY_LEGS_DEG")
    if env_deg:
        pose_legs_in(float(env_deg))
    else:
        if character_id not in LEGS_IN_BY_ID:
            raise SystemExit(
                f"no stance angle for '{character_id}'. Sweep it against the kid's own "
                "concept front figure and add an entry to LEGS_IN_BY_ID:\n"
                f"  for d in 0 2 4 5.5 7; do FIDELITY_LEGS_DEG=$d npm run "
                f"review:character-fidelity -- {character_id}; done\n"
                "Take the angle whose inter-leg daylight profile is closest to the "
                "drawing's. There is deliberately no default: the one that used to be "
                "here fused seven characters' legs and cost nine reviews."
            )
        pose_legs_in(LEGS_IN_BY_ID[character_id])
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
