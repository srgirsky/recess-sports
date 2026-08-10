"""Apply Mimi Mash's first concept-fidelity sculpt pass to her source .blend.

The pass keeps the canonical skin and face UV island, but changes the authored
geometry that the runtime export consumes: a larger dark curl halo, a slimmer
constructed hoodie torso, fuller jeans, stronger forearms, and organically
smoothed topology at each useful LOD.

Run once from the repository root:
  blender --background assets/v2/source/mimi-mash-pilot.blend \
    --python scripts/v2/blender/sculpt-mimi-source.py
"""

from __future__ import annotations

from math import cos, pi, sin
from pathlib import Path

import bpy


REPO = Path.cwd()
OUTPUT = REPO / "assets/v2/source/mimi-mash-pilot.blend"
REVISION = "mimi-concept-fidelity-v7"
LODS = ("LOD0", "LOD1", "LOD2")


def material_vertices(obj: bpy.types.Object) -> dict[str, set[int]]:
    groups: dict[str, set[int]] = {}
    for polygon in obj.data.polygons:
        if polygon.material_index >= len(obj.material_slots):
            continue
        material = obj.material_slots[polygon.material_index].material
        if not material:
            continue
        groups.setdefault(material.name, set()).update(polygon.vertices)
    return groups


def reshape(obj: bpy.types.Object) -> None:
    groups = material_vertices(obj)
    hair = groups.get("M_Hair", set())
    uniform = groups.get("M_Uniform", set())
    body = groups.get("M_Body", set())

    # Blender imported glTF's +Y-up source as +Z-up. The head/hair centre is
    # therefore around z=3.24ft, with -Y facing the camera.
    for index in hair:
        point = obj.data.vertices[index].co
        point.x *= 1.16
        point.y *= 1.10
        point.z = 3.24 + (point.z - 3.24) * 1.10
        point.z = min(point.z, 4.15)

    for index in uniform:
        point = obj.data.vertices[index].co
        # The concept's hoodie is broad but not the round barrel in the proxy.
        if 1.65 < point.z < 2.58 and abs(point.x) < 0.82:
            point.x *= 0.92
            point.y *= 0.90
            point.z = 2.10 + (point.z - 2.10) * 1.08
        # Baggy jeans taper toward the cuff instead of reading as two pipes.
        if 0.30 < point.z <= 1.65 and abs(point.x) < 0.62:
            leg_center = -0.20 if point.x < 0 else 0.20
            point.x = leg_center + (point.x - leg_center) * 1.28
            point.y *= 1.20

    for index in body:
        point = obj.data.vertices[index].co
        # Taper the lower face and let the chin project instead of leaving the
        # proxy's uniformly round ball. The atlas UVs stay on the same skull.
        if 2.72 < point.z < 3.20 and abs(point.x) < 0.86:
            point.x *= 0.94
            if point.y < 0:
                point.y *= 1.07
        # Keep the face/head untouched; only strengthen the exposed forearms.
        if 1.95 < point.z < 2.68 and abs(point.x) > 0.88:
            point.y *= 1.13
            point.z = 2.34 + (point.z - 2.34) * 1.08

    obj.data.update()


def smooth_topology(obj: bpy.types.Object) -> None:
    # Preserve every disconnected hair, pocket and facial island. A global
    # subdivide+decimate pass preferentially deleted those small identity forms.
    # Smooth normals give the authored curved pieces their organic read without
    # changing UVs, weights, material boundaries or the proven triangle count.
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()


def add_curl_halo(root: bpy.types.Object, armature: bpy.types.Object, lod: str, count: int, points: int) -> None:
    if count == 0:
        return
    curve_data = bpy.data.curves.new(f"Mimi_Curl_Halo_{lod}", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 1
    curve_data.bevel_depth = 0.022 if lod == "LOD0" else 0.028
    curve_data.bevel_resolution = 0
    curve_data.resolution_u = 1

    for curl in range(count):
        angle = (2 * pi * curl / count) + (0.08 if curl % 2 else -0.05)
        centre_x = 0.84 * cos(angle)
        centre_z = 3.30 + 0.75 * sin(angle)
        centre_y = -0.50 + 0.06 * cos(angle)
        radius = 0.085 + 0.012 * (curl % 3)
        spline = curve_data.splines.new("POLY")
        spline.points.add(points - 1)
        for point_index, point in enumerate(spline.points):
            turn = 2 * pi * point_index / points
            point.co = (
                centre_x + radius * cos(turn),
                centre_y + 0.018 * sin(2 * turn),
                centre_z + radius * sin(turn),
                1.0,
            )
        spline.use_cyclic_u = True

    curve = bpy.data.objects.new(f"kid_mimi_mash_{lod}_CurlHalo", curve_data)
    bpy.context.collection.objects.link(curve)
    hair = next(slot.material for slot in root.material_slots if slot.material and slot.material.name == "M_Hair")
    curve.data.materials.append(hair)

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    curve.select_set(True)
    bpy.context.view_layer.objects.active = curve
    bpy.ops.object.convert(target="MESH")
    halo = bpy.context.object
    halo.parent = root
    halo.matrix_parent_inverse = root.matrix_world.inverted()

    group = halo.vertex_groups.new(name="Head")
    group.add(range(len(halo.data.vertices)), 1.0, "REPLACE")
    modifier = halo.modifiers.new("Canonical rig", "ARMATURE")
    modifier.object = armature
    for polygon in halo.data.polygons:
        polygon.use_smooth = True
    halo["recessAuthoredDetail"] = "dense-curly-halo"


def main() -> None:
    current_revision = bpy.context.scene.get("recessFidelityRevision")
    if current_revision and current_revision not in {
        "mimi-concept-fidelity-v4",
        "mimi-concept-fidelity-v5",
        "mimi-concept-fidelity-v6",
    }:
        raise RuntimeError(f"{REVISION} is already applied")
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"expected one canonical armature, found {len(armatures)}")
    armature = armatures[0]

    roots = {}
    for lod in LODS:
        name = f"kid_mimi_mash_{lod}"
        root = bpy.data.objects.get(name)
        if not root or root.type != "MESH":
            raise RuntimeError(f"missing {name}")
        roots[lod] = root

    if current_revision in {
        "mimi-concept-fidelity-v4",
        "mimi-concept-fidelity-v5",
        "mimi-concept-fidelity-v6",
    }:
        for obj in list(bpy.context.scene.objects):
            if "CurlHalo" in obj.name or "Curl_Halo" in obj.name:
                bpy.data.objects.remove(obj, do_unlink=True)
        for root in roots.values():
            hair = material_vertices(root).get("M_Hair", set())
            for index in hair:
                root.data.vertices[index].co.z = min(root.data.vertices[index].co.z, 4.15)
            if current_revision in {"mimi-concept-fidelity-v4", "mimi-concept-fidelity-v5"}:
                uniform = material_vertices(root).get("M_Uniform", set())
                for index in uniform:
                    point = root.data.vertices[index].co
                    if 1.65 < point.z < 2.58 and abs(point.x) < 0.82:
                        point.x *= 0.92 / 0.86
                        point.z = 2.10 + (point.z - 2.10) * 1.08
                    if 0.30 < point.z <= 1.65 and abs(point.x) < 0.66:
                        leg_center = -0.20 if point.x < 0 else 0.20
                        point.x = leg_center + (point.x - leg_center) * (1.28 / 1.18)
                        point.y *= 1.20 / 1.14
            root.data.update()
        add_curl_halo(roots["LOD0"], armature, "LOD0", 18, 6)
        add_curl_halo(roots["LOD1"], armature, "LOD1", 10, 5)
        bpy.context.scene["recessFidelityRevision"] = REVISION
        bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
        print(f"wrote {OUTPUT} ({REVISION})")
        return

    for lod in LODS:
        root = roots[lod]
        reshape(root)
        smooth_topology(root)
        root["recessAuthoring"] = REVISION

    add_curl_halo(roots["LOD0"], armature, "LOD0", 18, 6)
    add_curl_halo(roots["LOD1"], armature, "LOD1", 10, 5)

    bpy.context.scene["recessFidelityRevision"] = REVISION
    notes = bpy.data.texts.get("READ_ME_FIRST") or bpy.data.texts.new("READ_ME_FIRST")
    notes.clear()
    notes.write(
        "Mimi Mash authored production source\n\n"
        "This .blend is upstream of kid_mimi_mash.glb.\n"
        "The packed turnaround is the approved visual target.\n"
        "Do not rename canonical bones, LOD roots or material slots.\n"
        "Ship with: npm run export:authored-character -- mimi_mash\n"
        "Review front/profile silhouette, proportions, hair, clothing, face, hero scale and 40px scale.\n"
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
    print(f"wrote {OUTPUT} ({REVISION})")


if __name__ == "__main__":
    main()
