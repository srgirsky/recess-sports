"""Move an authored .blend onto a changed canonical rig, mesh and all.

The canonical skeleton in ``src/v2/render/skeleton.ts`` is the single spec every
delivered model is hashed against, so changing it makes every authored .blend
stale at once — its armature still sits at the old rest pose, and
``npm run validate:models`` fails ``bones.bindPose`` on the export.

Moving the bones alone is NOT the fix, and it is the version of this script an
afternoon of hurry would produce. A mesh is bound to the rest pose it was
skinned against; move the bones out from under it and the bind-pose RENDER is
unchanged (the modifier is identity at rest) while every clip afterwards rotates
those vertices about a pivot that is no longer inside them. Nothing goes red.
So this script moves each vertex by the weighted sum of its own bones'
displacement — the same blend the skin would apply — which is what makes the
retarget invisible at rest and correct in motion.

Only run it against a rig change you are landing; it edits the .blend in place.
Characters whose meshes are rebuilt from primitives afterwards (Junebug, via
``sculpt-junebug-source.py``) still need the ARMATURE moved by it first.

  blender --background <source.blend> --python scripts/v2/blender/retarget-rig.py \
    -- --bones '<json>' [--dry-run]

``--bones`` is ``{"BoneName": [x, y, z], ...}`` in glTF axes and feet, exactly
as ``skeleton.ts`` reports world bind positions; the wrapper
``retarget-rig.mjs`` reads them from the spec so the two cannot disagree.
"""

from __future__ import annotations

import argparse
import json
import sys

import bpy
from mathutils import Matrix, Vector


def arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--bones", required=True, help="JSON of bone -> world [x, y, z] in glTF axes")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(raw)


def to_blender(p: list[float]) -> Vector:
    """glTF is Y-up and faces +Z; this .blend is Blender's Z-up with -Y forward,
    which is the mapping ``export_yup`` undoes on the way out."""
    return Vector((p[0], -p[2], p[1]))


def main() -> None:
    args = arguments()
    target = {name: to_blender(pos) for name, pos in json.loads(args.bones).items()}

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected exactly one canonical armature, found {len(armatures)}")
    armature = armatures[0]
    if armature.matrix_world != Matrix.Identity(4):
        # Every delivered .blend imports the rig at the origin. A transformed
        # armature would make the deltas below wrong in a way nothing catches.
        raise RuntimeError("the armature is not at the identity; refusing to guess its space")

    # The displacement each bone contributes, measured from where it is NOW.
    # Bones absent from --bones do not move, and contribute zero.
    #
    # The floor is 0.0001ft (0.03mm), not zero: a .blend stores bone heads at
    # float32, so every unmoved bone reports a residual of its own and a
    # zero test would "move" all 33. It is well under the validator's own
    # 0.004ft bind tolerance, so a real nudge still gets caught.
    floor = 1e-4
    delta: dict[str, Vector] = {}
    for bone in armature.data.bones:
        want = target.get(bone.name)
        if want is None:
            continue
        move = want - bone.head_local
        if move.length > floor:
            delta[bone.name] = move

    if not delta:
        print("rig already matches the spec; nothing to move")
        return
    for name, move in sorted(delta.items()):
        print(f"  {name:16s} {move.length * 304.8:7.1f}mm  ({move.x:+.4f}, {move.y:+.4f}, {move.z:+.4f})")

    if args.dry_run:
        return

    # 1. The meshes, FIRST — while the bones still describe the pose they were
    #    skinned against, so `delta` and the weights refer to the same rig.
    moved = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        groups = {group.index: group.name for group in obj.vertex_groups}
        if not groups:
            continue
        for vertex in obj.data.vertices:
            total = 0.0
            shift = Vector((0.0, 0.0, 0.0))
            for element in vertex.groups:
                name = groups.get(element.group)
                if name is None:
                    continue
                total += element.weight
                move = delta.get(name)
                if move is not None:
                    shift += move * element.weight
            if total > 1e-6 and shift.length > 1e-9:
                # Normalised: an unnormalised skin would otherwise scale the
                # displacement by however much its weights happen to sum to.
                vertex.co += shift / total
                moved += 1
    print(f"moved {moved} vertices with their bones")

    # 2. The bones. Head and tail take the SAME delta on purpose: the exported
    #    joint rotation comes from the head->tail direction, and the contract
    #    requires a translation-only bind pose (`bones.bindRotation`). Tilting a
    #    bone here would fail the export rather than drift quietly.
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for name, move in delta.items():
        bone = armature.data.edit_bones[name]
        bone.head = bone.head + move
        bone.tail = bone.tail + move
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.wm.save_mainfile()
    print(f"saved {bpy.data.filepath}")


if __name__ == "__main__":
    main()
