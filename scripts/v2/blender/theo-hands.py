"""Theo's approved reference proportions, using the shared migration."""
from pathlib import Path
import sys
import bpy
sys.path.insert(0, str(Path(__file__).parent))
from sculptlib.reference_hands import migrate as migrate_hands

# not-traceable: authored cartoon grip proportions, reviewed on Theo in motion.
THEO_HAND_SHAPE = {
    'finger_offsets': (-.024,.026,.076),
    'finger_lengths': (.16,.17,.15),
    'finger_widths': (.027,.026,.024,.016),
    'thumb_widths': (.032,.035,.028,.016),
}

def migrate(*, fresh_meshes=False):
    assert Path(bpy.data.filepath).name == 'theo-pilot.blend'
    migrate_hands(shape=THEO_HAND_SHAPE, underlayer_clearance=True, fresh_meshes=fresh_meshes)
    arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    arm['recessTheoHandReference']='palms-down-independent-digits-v1'
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)

if __name__ == '__main__': migrate()
