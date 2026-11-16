"""`fuse_into`: many overlapping pieces become ONE smooth skin.

★ WHY THIS EXISTS (2026-11-15). Every hair mass on the roster is assembled
from separate primitives: a scalp loft plus tubes, lobes or blobs standing on
it. Each primitive keeps its own flat facets, its own end caps and its own
intersection seam with its neighbours, and about ten critic rounds across
Gizmo, Yui, Kwame and Lu said the same thing whatever the primitives' size,
count or length: "faceted plates", "balls on a cap", "each with its own
contour". Raising the triangle cap did not change that, and neither did
removing the per-lock outline. The defect is the construction.

This helper keeps the authored pieces as the DESIGN (where each lock is, how
long, how fat) and replaces what ships: the pieces are voxel-remeshed into a
single closed surface, relaxed so facets and seams melt into grooves, mirrored
so the result is exactly symmetric, and reduced to a triangle target. What
comes out is one organic mesh with the locks as forms on it.

It is deliberately a post-process on a `MeshBuilder`, so a kid's script still
authors its hair with the same builders and the same tables, and can choose
per LOD whether to fuse.
"""

from __future__ import annotations

import bpy

from .mesh import MeshBuilder


def fuse_into(
    builder: MeshBuilder,
    source: MeshBuilder,
    *,
    material: int,
    color: tuple[float, float, float, float],
    groove_color: tuple[float, float, float, float],
    bone: str,
    voxel_ft: float,
    relax_iterations: int,
    target_tris: int,
    groove_depth_ft: float,
    mirror: bool,
) -> int:
    """Fuse `source`'s closed pieces into one skin and append it to `builder`.

    `color` paints the skin and `groove_color` the vertices that sit in a
    hollow at least `groove_depth_ft` below their neighbours' mean (the
    valleys between locks), so the forms read without a texture. Both must be
    declared palette swatches: the palette lint allows no blends, so this is a
    two-tone threshold and not a gradient.

    `mirror` cuts the skin on x = 0 and reflects the +x half, which makes the
    result exactly symmetric (a voxel remesh on its own is not, and the face
    symmetry measure would see it).

    Source pieces only need to be closed surfaces; `MeshBuilder.tube`'s
    `flip` (which exists so a mirrored limb's vertices match its twin's) is
    not needed here and makes no difference to the result.

    Returns the number of triangles appended.
    """
    mesh = bpy.data.meshes.new("fuse_source")
    mesh.from_pydata(source.vertices, [], source.faces)
    mesh.update()
    obj = bpy.data.objects.new("fuse_source", mesh)
    bpy.context.scene.collection.objects.link(obj)
    try:
        remesh = obj.modifiers.new("fuse", "REMESH")
        remesh.mode = "VOXEL"
        remesh.voxel_size = voxel_ft
        remesh.use_smooth_shade = True
        relax = obj.modifiers.new("relax", "SMOOTH")
        relax.factor = 0.5
        relax.iterations = relax_iterations
        if mirror:
            reflect = obj.modifiers.new("mirror", "MIRROR")
            reflect.use_axis = (True, False, False)
            reflect.use_bisect_axis = (True, False, False)
            reflect.use_clip = True
            reflect.merge_threshold = voxel_ft * 0.5

        def evaluated():
            depsgraph = bpy.context.evaluated_depsgraph_get()
            depsgraph.update()
            return bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))

        dense = evaluated()
        dense_tris = sum(len(p.vertices) - 2 for p in dense.polygons)
        bpy.data.meshes.remove(dense)
        if dense_tris == 0:
            raise ValueError("fuse_into: the remesh produced nothing; are the source pieces closed?")
        if dense_tris > target_tris:
            reduce = obj.modifiers.new("reduce", "DECIMATE")
            reduce.ratio = target_tris / dense_tris
            if mirror:
                reduce.use_symmetry = True
                reduce.symmetry_axis = "X"
        skin = evaluated()
    finally:
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(mesh)

    # Hollows: a vertex below the mean of its neighbours, along its own normal.
    neighbours: dict[int, set[int]] = {v.index: set() for v in skin.vertices}
    for edge in skin.edges:
        a, b = edge.vertices
        neighbours[a].add(b)
        neighbours[b].add(a)
    base = len(builder.vertices)
    for vertex in skin.vertices:
        tone = color
        around = neighbours[vertex.index]
        if around:
            mean = sum((skin.vertices[i].co for i in around), vertex.co * 0.0) / len(around)
            if (mean - vertex.co).dot(vertex.normal) > groove_depth_ft:
                tone = groove_color
        builder.vertex(tuple(vertex.co), tone, bone)
    appended = 0
    for polygon in skin.polygons:
        builder.face(tuple(base + i for i in polygon.vertices), material)
        appended += len(polygon.vertices) - 2
    bpy.data.meshes.remove(skin)
    return appended
