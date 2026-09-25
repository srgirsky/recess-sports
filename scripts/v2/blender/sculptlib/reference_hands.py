"""Shared reference hand migration, upstream Blender geometry and skinning.

Keeps topology/triangle count and canonical joints. The finger tubes
formerly shared a pivot and stood in the wrong plane. Put them into the rig's
palms-down frame with separate knuckles, a broad palm and a lateral thumb.
Run on a legacy source; the revision guard prevents double edits.
Shape widths and lengths are supplied by the character. Joint anchors follow
the common skeleton. This function does not save the source; its caller does.
"""
import bpy
from mathutils import Vector
from .rig import ARM_Z, ARM_WRIST_X
from .mesh import MeshBuilder

def _orient_tube(obj, component, centers):
    """Retain source topology while orienting both caps and wall outward.

    Junebug's mirrored tubes predate the explicit flip convention. Inspect
    geometry instead of assuming that every source used the same winding.
    """
    member=set(component)
    centers=[Vector(c) for c in centers]
    for polygon in obj.data.polygons:
        if not set(polygon.vertices)<=member: continue
        points=[obj.data.vertices[i].co for i in polygon.vertices]
        normal=(points[1]-points[0]).cross(points[2]-points[0])
        if component[-2] in polygon.vertices:
            outward=centers[0]-centers[1]
        elif component[-1] in polygon.vertices:
            outward=centers[-1]-centers[-2]
        else:
            middle=sum(points,Vector())/len(points)
            candidates=[]
            for a,b in zip(centers,centers[1:]):
                segment=b-a
                t=min(1.,max(0.,(middle-a).dot(segment)/segment.length_squared))
                candidates.append(a+t*segment)
            closest=min(candidates,key=lambda c:(middle-c).length_squared)
            outward=middle-closest
        if normal.dot(outward)<0: polygon.flip()

def migrate(*, shape, underlayer_clearance, fresh_meshes=False):
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    assert fresh_meshes or not arm.get('recessReferenceHands') and not arm.get('recessTheoHandReference'), 'Already migrated; rebuild from the baseline first'
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for side, sign in [('Left', -1), ('Right', 1)]:
        template = arm.data.edit_bones[side+'HandIndex1']
        for name, y in [('Middle', shape['finger_offsets'][1]), ('Ring', shape['finger_offsets'][2])]:
            bone_name = side+'Hand'+name+'1'
            bone = arm.data.edit_bones.get(bone_name) or arm.data.edit_bones.new(bone_name)
            delta = Vector((0, y-template.head.y, 0))
            bone.head, bone.tail = template.head+delta, template.tail+delta
            bone.roll = template.roll
            bone.parent = arm.data.edit_bones[side+'Hand']
        for name, parent in [('Index2','Index1'),('Curl2','Middle1')]:
            template = arm.data.edit_bones[side+'Hand'+parent]
            bone_name = side+'Hand'+name
            bone = arm.data.edit_bones.get(bone_name) or arm.data.edit_bones.new(bone_name)
            delta = Vector((sign*.06, 0, 0))
            bone.head, bone.tail = template.head+delta, template.tail+delta
            bone.roll = template.roll
            bone.parent = template
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in [o for o in bpy.data.objects if o.type == 'MESH']:
        if not obj.vertex_groups: continue
        # The closed inner tee has axial cap centres; the open jacket does
        # not. Give the hidden underlayer clearance where differently spaced
        # torso rings cut across one another during a large spine twist.
        links={v.index:set() for v in obj.data.vertices}
        for edge in obj.data.edges:
            a,b=edge.vertices;links[a].add(b);links[b].add(a)
        unseen=set(links)
        while unseen:
            todo=[unseen.pop()];part=[]
            while todo:
                i=todo.pop();part.append(i)
                for j in links[i]&unseen:unseen.remove(j);todo.append(j)
            verts=[obj.data.vertices[i] for i in part]
            if (underlayer_clearance and min(v.co.z for v in verts)<arm.data.bones['Hips'].head_local.z
                and max(v.co.z for v in verts)>arm.data.bones['Spine2'].head_local.z
                and any(abs(v.co.x)+abs(v.co.y)<1e-5 for v in verts)
                and 'LOD2' not in obj.name):
                for v in verts:
                    v.co.x*=.90;v.co.y*=.90
        for side, sign in [('Left', -1), ('Right', 1)]:
            hand, index, thumb = [side+'Hand'+p for p in ['', 'Index1', 'Thumb1']]
            for digit in ['Middle1','Ring1','Index2','Curl2']:
                if not obj.vertex_groups.get(side+'Hand'+digit): obj.vertex_groups.new(name=side+'Hand'+digit)
            group = obj.vertex_groups.get(index)
            if not group: continue
            ids = {v.index for v in obj.data.vertices if any(g.group==group.index and g.weight>.5 for g in v.groups)}
            links = {i:set() for i in ids}
            for e in obj.data.edges:
                a,b=e.vertices
                if a in ids and b in ids: links[a].add(b);links[b].add(a)
            components=[]
            while ids:
                stack=[ids.pop()]; component=[]
                while stack:
                    i=stack.pop();component.append(i)
                    for j in links[i]&ids:ids.remove(j);stack.append(j)
                components.append(component)
            components.sort(key=lambda c:sum(obj.data.vertices[i].co.z for i in c)/len(c),reverse=True)
            for n, component in enumerate(components):
                digits = ['Index1','Ring1'] if len(components)==2 else ['Index1','Middle1','Ring1','Ring1']
                digit = digits[n]
                # A four-finger source retains all four volumes. Its little
                # finger shares the ring hinge within the rig's bone budget.
                shape_index = n if len(components)>2 else (0 if n==0 else 2)
                centre_y=shape['finger_offsets'][shape_index]
                component.sort()
                # The builder emits four five-vertex rings, then two caps.
                # Preserve each ring and its winding with a proper rotation;
                # grouping by X would collapse tilted rings into single points.
                assert len(component) in (17,22), f"Unexpected finger topology: {len(component)}"
                tip = 'Index2' if digit=='Index1' else 'Curl2'
                root=side+'Hand'+digit; distal=side+'Hand'+tip
                # Four rings articulate two knuckles; the small terminal ring
                # rounds the pad without adding triangles to a full-budget kid.
                length=shape['finger_lengths'][shape_index]
                centers=[(sign*x,centre_y,ARM_Z) for x in [1.49,1.535,1.587,1.49+length]]
                widths=shape['finger_widths']
                if len(component)==17:
                    centers=[centers[i] for i in (0,1,3)]
                    widths=[widths[i] for i in (0,1,3)]
                builder=MeshBuilder()
                builder.tube(centers,widths,0,(1,1,1,1),hand,5,flip=sign<0)
                builder.vertices[-1]=(sign*(1.50+length),centre_y,ARM_Z)
                ring_weights=[{hand:.65,root:.35},{root:1},{root:.45,distal:.55},{distal:1}]
                if len(component)==17: ring_weights=[ring_weights[i] for i in (0,1,3)]
                cap_start=len(component)-2
                for k,i in enumerate(component):
                    obj.data.vertices[i].co=builder.vertices[k]
                    # Pixel-width hulls swallow tiny end caps at hero scale.
                    # Taper their authored outline mask; keep the skin opaque.
                    for attr in obj.data.color_attributes:
                        if attr.domain=='POINT':
                            color=list(attr.data[i].color);color[3]=.25
                            attr.data[i].color=color
                    for group in list(obj.data.vertices[i].groups):obj.vertex_groups[group.group].remove([i])
                    row=k//5 if k<cap_start else (0 if k==cap_start else len(ring_weights)-1)
                    for bone,w in ring_weights[row].items():obj.vertex_groups[bone].add([i],w,'REPLACE')
                _orient_tube(obj, component, centers)
            thumb_ids=[v.index for v in obj.data.vertices if any(g.group==obj.vertex_groups[thumb].index and g.weight>.5 for g in v.groups)]
            if thumb_ids:
                assert len(thumb_ids) in (17,20,22), f'Unexpected thumb topology: {len(thumb_ids)}'
                builder=MeshBuilder()
                centers=[(sign*x,y,ARM_Z+z) for x,y,z in [
                    (1.407,-.020,0),(1.442,-.085,-.010),
                    (1.477,-.132,-.018),(1.508,-.155,-.025),
                ]]
                widths=shape['thumb_widths']
                blends=[0,.45,1,1]
                if len(thumb_ids)!=22:
                    centers=[centers[i] for i in (0,1,3)]
                    widths=[widths[i] for i in (0,1,3)]
                    blends=[blends[i] for i in (0,1,3)]
                sides=6 if len(thumb_ids)==20 else 5
                cap_start=len(thumb_ids)-2
                builder.tube(centers,widths,0,(1,1,1,1),hand,sides,flip=sign<0)
                builder.vertices[-1]=(sign*1.516,-.161,ARM_Z-.027)
                for k,i in enumerate(sorted(thumb_ids)):
                    obj.data.vertices[i].co=builder.vertices[k]
                    for attr in obj.data.color_attributes:
                        if attr.domain=='POINT':
                            color=list(attr.data[i].color);color[3]=.25
                            attr.data[i].color=color
                    row=k//sides if k<cap_start else (0 if k==cap_start else len(blends)-1)
                    blend=blends[row]
                    obj.vertex_groups[thumb].add([i],blend,'REPLACE')
                    obj.vertex_groups[hand].add([i],1-blend,'REPLACE')
                _orient_tube(obj, sorted(thumb_ids), centers)
            for v in obj.data.vertices:
                weights={obj.vertex_groups[g.group].name:g.weight for g in v.groups}
                if weights.get(hand,0)>.5 and v.index not in thumb_ids and not any(v.index in c for c in components):
                    t=min(1.,max(0.,(abs(v.co.x)-ARM_WRIST_X)/.10))
                    v.co.y*=1+.35*t
                    v.co.z=ARM_Z+(v.co.z-ARM_Z)*(1-.5*t)
        # The jacket and tee used different rigid spine bands. At the same
        # height all garment layers must share a continuous deformation field.
        spine_names = {'Spine','Spine1','Spine2'}
        for v in obj.data.vertices:
            old={obj.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>0}
            if old and set(old)<=spine_names:
                z=v.co.z
                low,mid,high=[arm.data.bones[n].head_local.z for n in ['Spine','Spine1','Spine2']]
                if z<=mid:
                    t=min(1.,max(0.,(z-low)/(mid-low)));weights={'Spine':1-t,'Spine1':t}
                else:
                    t=min(1.,max(0.,(z-mid)/(high-mid)));weights={'Spine1':1-t,'Spine2':t}
                for name in old:obj.vertex_groups[name].remove([v.index])
                for name,w in weights.items():
                    if not obj.vertex_groups.get(name):obj.vertex_groups.new(name=name)
                    if w:obj.vertex_groups[name].add([v.index],w,'REPLACE')
        obj.data.update()
    arm['recessReferenceHands']='palms-down-independent-digits-v1'
