"""Export one Blender-authored character through the Recess asset contract.

This script is invoked by ``scripts/v2/export-authored-character.mjs``.  The
Node wrapper supplies the canonical bone order from ``skeleton.ts``; rebuilding
the transient export armature in that order is the normalization Blender's glTF
exporter needs to preserve JOINTS_0 meaning while satisfying the runtime rig.
The source .blend is never saved by this script.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import bpy


def arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--contract", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(raw)


def source_meshes(character_id: str) -> list[bpy.types.Object]:
    prefix = f"kid_{character_id}_LOD"
    roots = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name.startswith(prefix)]
    if not roots:
        raise RuntimeError(f"the .blend has no authored mesh named {prefix}0/1/2")

    selected: set[bpy.types.Object] = set()

    def visit(obj: bpy.types.Object) -> None:
        if obj in selected:
            return
        selected.add(obj)
        for child in obj.children:
            if child.type == "MESH":
                visit(child)

    for root in roots:
        visit(root)
    return sorted(selected, key=lambda obj: obj.name)


def rebuild_armature(bone_names: list[str], meshes: list[bpy.types.Object]) -> bpy.types.Object:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected exactly one armature, found {len(armatures)}")
    old = armatures[0]
    found = {bone.name for bone in old.data.bones}
    missing = [name for name in bone_names if name not in found]
    extra = sorted(found.difference(bone_names))
    if missing or extra:
        raise RuntimeError(f"armature differs from the contract; missing={missing}, extra={extra}")

    bpy.context.view_layer.objects.active = old
    old.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    captured = {
        bone.name: {
            "head": bone.head.copy(),
            "tail": bone.tail.copy(),
            "roll": bone.roll,
            "parent": bone.parent.name if bone.parent else None,
            "use_connect": bone.use_connect,
            "use_deform": bone.use_deform,
        }
        for bone in old.data.edit_bones
    }
    bpy.ops.object.mode_set(mode="OBJECT")
    old.select_set(False)

    old_name = old.name
    old.name = f"{old_name}_SOURCE"
    data = bpy.data.armatures.new(f"{old.data.name}_contract")
    normalized = bpy.data.objects.new(old_name, data)
    bpy.context.collection.objects.link(normalized)
    normalized.matrix_world = old.matrix_world.copy()

    bpy.context.view_layer.objects.active = normalized
    normalized.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name in bone_names:
        spec = captured[name]
        bone = data.edit_bones.new(name)
        bone.head = spec["head"]
        bone.tail = spec["tail"]
        bone.roll = spec["roll"]
        bone.use_deform = spec["use_deform"]
    for name in bone_names:
        spec = captured[name]
        bone = data.edit_bones[name]
        if spec["parent"]:
            bone.parent = data.edit_bones[spec["parent"]]
            bone.use_connect = spec["use_connect"]
    bpy.ops.object.mode_set(mode="OBJECT")
    normalized.select_set(False)

    for mesh in meshes:
        world = mesh.matrix_world.copy()
        for modifier in mesh.modifiers:
            if modifier.type == "ARMATURE" and modifier.object == old:
                modifier.object = normalized
        if mesh.parent == old:
            mesh.parent = normalized
            mesh.matrix_parent_inverse = normalized.matrix_world.inverted()
            mesh.matrix_world = world

    bpy.data.objects.remove(old, do_unlink=True)
    return normalized


def main() -> None:
    args = arguments()
    contract = json.loads(args.contract.read_text())
    bone_names = contract["boneNames"]
    meshes = source_meshes(args.id)
    armature = rebuild_armature(bone_names, meshes)

    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    armature.select_set(True)
    for mesh in meshes:
        mesh.hide_set(False)
        mesh.hide_viewport = False
        mesh.hide_render = False
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature

    args.output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(args.output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_attributes=True,
        export_skins=True,
        export_def_bones=True,
        # JOINTS_0 stays uncompressed so the Node promotion step can remap
        # Blender's hierarchy order to the game's canonical skin order without
        # changing which bone deforms any vertex.
        export_draco_mesh_compression_enable=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender glTF export failed: {result}")
    print(f"wrote authored intermediate {args.output}")


if __name__ == "__main__":
    main()
