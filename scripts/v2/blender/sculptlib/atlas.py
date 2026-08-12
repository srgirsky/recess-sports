"""Installing a character's face atlas onto the shared body material.

Lifted from Junebug's sculpt script, where the atlas path was a module
constant. It is an argument here, because every character has their own atlas
and the swap is otherwise identical.

The atlas rides the body material's image node and is PACKED into the .blend,
so the delivery does not depend on a file beside it. `src/v2/render/faceAtlas.ts`
owns the cell order, and the asset contract is parsed against it — cell 0 is
TOP-left, so the row index is V-flipped. Getting that backwards is not a crash,
it is a roster wearing the wrong expression.
"""

from __future__ import annotations

from pathlib import Path

import bpy


def install_face_atlas(atlas_path: Path, character_id: str) -> None:
    """Swap `atlas_path` in as the body material's `face_atlas`, packed.

    `character_id` only names the intermediate image so two atlases loaded in one
    session cannot collide; the final name is always `face_atlas`, because that is
    what the runtime looks for.
    """
    if not atlas_path.exists():
        raise RuntimeError(f"generate {atlas_path} before sculpting {character_id}")
    body = bpy.data.materials["M_Body"]
    old = bpy.data.images.get("face_atlas")
    image = bpy.data.images.load(str(atlas_path), check_existing=False)
    image.name = f"face_atlas_{character_id}"
    image.pack()
    for node in body.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image == old:
            node.image = image
    if old:
        bpy.data.images.remove(old)
    image.name = "face_atlas"
