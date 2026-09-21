"""Apply the shared arm-weight correction to an existing authored .blend.

Run with Blender --background <source.blend> --python <this file>.
Only vertex groups change. Rebuilding an older sculpt from today's entire
sculptlib can also pick up unrelated geometry changes (Theo exceeded his LOD0
budget on that path). This migration edits the actual upstream mesh, preserves
its shape/materials/LODs and is exported through export:authored-character.
Junebug has separately authored joint weights and must not use this migration.
"""
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sculptlib.arm import arm_weights_at

path = Path(bpy.data.filepath)
assert path.name != "junebug-pilot.blend", "Junebug already has authored joint blends"
assert path.suffix == ".blend" and path.is_file(), "Open the authored source first"
changed = 0
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    names = {g.index: g.name for g in obj.vertex_groups}
    for vertex in obj.data.vertices:
        old = {names[g.group]: g.weight for g in vertex.groups if g.weight > 0}
        side = next((s for s in ("Left", "Right")
                     if any(s + part in old for part in ("Arm", "ForeArm", "Hand"))), None)
        if side is None:
            continue
        affected = {side + part for part in ("Arm", "ForeArm", "Hand")} | {"Spine2"}
        assert set(old) <= affected, f"Unexpected arm influences on {obj.name}: {old}"
        x = abs(vertex.co.x)
        # Preserve the artist's shoulder-to-torso falloff exactly. The cap and
        # buried shoulder rings must not acquire a new shape in an arms-down pose.
        torso = old.get("Spine2")
        table = {} if torso is None else {x: torso}
        new = arm_weights_at(x, -1 if side == "Left" else 1, table)
        for name in old:
            obj.vertex_groups[name].remove([vertex.index])
        for name, weight in new.items():
            obj.vertex_groups[name].add([vertex.index], weight, "REPLACE")
        changed += 1
assert changed, "No authored arm vertices found; do not export an unchanged source"
bpy.ops.wm.save_as_mainfile(filepath=str(path))
print(f"Reweighted {changed} arm vertices in {path.name}; geometry unchanged")
