"""Adapt CC0 external animal surfaces into a bounded, articulated teaching asset.
Run in isolated Blender 5.2: blender -b --factory-startup -P this.py -- --source-dir DIR
No clinical ranges or internal tissues are inferred from the generated source meshes.
"""
import bpy, bmesh, math, json, sys, argparse
from collections import deque
from pathlib import Path
from mathutils import Vector, Matrix

BASE = Path(__file__).resolve().parent.parent
args = argparse.ArgumentParser()
args.add_argument('--source-dir', type=Path, default=BASE/'assets'/'downloads')
args.add_argument('--qa-scripts', type=Path)
args.add_argument('--animal', choices=['horse','cow'])
options = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
if options.qa_scripts:
    sys.path.insert(0, str(options.qa_scripts))
    import qa_check
else:
    qa_check = None
OUT = BASE/'docs'/'models'
REVIEW = BASE/'assets'/'review'
OUT.mkdir(parents=True, exist_ok=True)
REVIEW.mkdir(parents=True, exist_ok=True)
REGIONS = ['head','neck','shoulder','thorax','pelvis','fore_left','fore_right','hind_left','hind_right','tail']
reports = []

def smoothstep(a, b, x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

def close_boundary_cycles(bm):
    remaining={edge for edge in bm.edges if edge.is_boundary}
    caps=[]
    while remaining:
        edge=next(iter(remaining));remaining.remove(edge)
        route=[edge.verts[0],edge.verts[1]]
        while route:
            current=route[-1]
            options=[candidate for candidate in current.link_edges if candidate in remaining]
            if not options:break
            edge=options[0];remaining.remove(edge);other=edge.other_vert(current)
            if other in route:
                index=route.index(other);cycle=route[index:]
                if len(cycle)>=3:
                    try:caps.append(bm.faces.new(cycle))
                    except ValueError:pass
                route=route[:index+1]
            else:route.append(other)
    return caps

def build(animal, target):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC'
    source=options.source_dir/f'{animal}-grab.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    ob=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    ob.data.transform(ob.matrix_world)
    ob.matrix_world=Matrix.Identity(4)
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.000001)
    bm.to_mesh(ob.data);bm.free()
    ob.data.calc_loop_triangles()
    ratio=min(1,target/len(ob.data.loop_triangles))
    dec=ob.modifiers.new('Mobile silhouette budget','DECIMATE');dec.ratio=ratio
    bpy.context.view_layer.objects.active=ob
    with bpy.context.temp_override(object=ob,active_object=ob,selected_objects=[ob],selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=dec.name)
    lo=Vector(tuple(min(v.co[i] for v in ob.data.vertices) for i in range(3)))
    hi=Vector(tuple(max(v.co[i] for v in ob.data.vertices) for i in range(3)))
    center=(lo+hi)/2
    for v in ob.data.vertices:
        v.co-=Vector((center.x,center.y,lo.z))
    width,length,height=hi-lo
    limb_cut=.30 if animal=='cow' else .45
    def normalized(co):
        return co.x,(length/2-co.y)/length,co.z/height
    def is_udder(co):
        x,f,h=normalized(co)
        # Measured on this asymmetric CC0 source; separate the ventral udder
        # from the laterally placed hind limbs, rather than bisecting its teats.
        return animal=='cow' and .16<f<.48 and .26<h<.53 and -width*.225<x<width*.07
    def region(co):
        x,f,h=normalized(co)
        # The tail is posterior to the hind limbs, rather than a tube through them.
        if .10<h<.86 and abs(x)<width*.25 and f<(.13+.015*smoothstep(.4,.7,h) if animal=='horse' else .17-.08*h):return 'tail'
        if f>0.77 and h>0.48:return 'head'
        if f>0.61 and h>0.61:return 'neck'
        # Keep the udder with the ventral trunk. The generated source has a
        # connected underside, so spatial limb cuts must not take its teats.
        if is_udder(co):return 'thorax'
        if h<limb_cut and (f>.56 or f<.32):
            return ('fore_' if f>.56 else 'hind_')+('left' if x>=0 else 'right')
        if f>0.57:return 'shoulder'
        if f<0.34:return 'pelvis'
        return 'thorax'
    def weights(co,part_region):
        x,f,h=normalized(co)
        side='L' if x>=0 else 'R'
        if is_udder(co):return {'Pelvis':1-smoothstep(.27,.57,f),'Spine':smoothstep(.27,.57,f)}
        if part_region=='tail':
            tail=1-smoothstep(.14,.21,f);return {'Tail':tail,'Pelvis':1-tail}
        is_limb=part_region.startswith(('fore_','hind_'))
        if (h<.42 and is_limb) or (h<.51 and (animal=='cow' or abs(x)>width*.14) and (f>.56 or f<.32)):
            if h<.42 and is_limb:side='L' if part_region.endswith('left') else 'R'
            upper,lower=('UpperArm','Forearm') if f>.5 else ('Thigh','Calf')
            w=smoothstep(.20,.31,h)
            strength=1-smoothstep(.43,.51,h)
            return {f'{side} {upper}':w*strength,f'{side} {lower}':(1-w)*strength,'Spine' if f>.5 else 'Pelvis':1-strength}
        if f>.60 and h>.44:
            head=smoothstep(.74,.83,f)
            neck=smoothstep(.59,.68,f)
            if head>0:return {'Head':head,'Neck':1-head}
            return {'Neck':neck,'Spine':1-neck}
        spine=smoothstep(.27,.57,f)
        return {'Spine':spine,'Pelvis':1-spine}
    # Preserve physically based source textures, with a bounded mobile texture size.
    for image in bpy.data.images:
        if image.source=='FILE' and max(image.size)>2048:
            scale=2048/max(image.size);image.scale(round(image.size[0]*scale),round(image.size[1]*scale));image.pack()
    surface=ob.data.materials[0]
    surface.name=f'{animal}_PBR_external'
    surface.use_backface_culling=True
    cut=bpy.data.materials.new(f'{animal}_didactic_cut')
    cut.use_nodes=True
    bsdf=next(n for n in cut.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value=(.52,.36,.29,1)
    bsdf.inputs['Roughness'].default_value=.88
    cut.diffuse_color=(.52,.36,.29,1)
    cut.use_backface_culling=False
    # A simple, explicitly illustrative shared skeleton. Left/right are the animal's sides.
    armdata=bpy.data.armatures.new(f'{animal}_didactic_rig')
    arm=bpy.data.objects.new(f'{animal}_rig',armdata);bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm;arm.select_set(True);ob.select_set(False)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(suffix,head,tail,parent=None):
        b=armdata.edit_bones.new(f'{animal} {suffix}');b.head=head;b.tail=tail
        if parent:b.parent=armdata.edit_bones[f'{animal} {parent}']
    bone('Pelvis',(0,.20*length,.51*height),(0,.20*length,.67*height))
    bone('Spine',(0,.18*length,.59*height),(0,-.24*length,.61*height),'Pelvis')
    bone('Neck',(0,-.25*length,.60*height),(0,-.36*length,.79*height),'Spine')
    bone('Head',(0,-.36*length,.79*height),(0,-.47*length,.69*height),'Neck')
    bone('Tail',(0,.41*length,.65*height),(0,.44*length,.30*height),'Pelvis')
    for side,sign in [('L',1),('R',-1)]:
        x=sign*width*.21
        bone(f'{side} UpperArm',(x,-.23*length,.51*height),(x,-.23*length,.27*height),'Spine')
        bone(f'{side} Forearm',(x,-.23*length,.27*height),(x,-.24*length,.045*height),f'{side} UpperArm')
        bone(f'{side} Thigh',(x,.26*length,.51*height),(x,.25*length,.27*height),'Pelvis')
        bone(f'{side} Calf',(x,.25*length,.27*height),(x,.26*length,.045*height),f'{side} Thigh')
    bpy.ops.object.mode_set(mode='OBJECT')
    source_mesh=ob.data
    source_mesh.calc_loop_triangles()
    # Each original surface triangle belongs to one region; new closure faces are marked.
    face_regions=[region(p.center) for p in source_mesh.polygons]
    # Reassign small disconnected scraps to the nearest coherent region. This keeps
    # tail strands and a hoof crossing the midline with their own anatomical region.
    bm=bmesh.new();bm.from_mesh(source_mesh);bm.faces.ensure_lookup_table()
    visited=set();components={name:[] for name in REGIONS}
    for first in bm.faces:
        if first.index in visited:continue
        label=face_regions[first.index];stack=[first];visited.add(first.index);faces=[];verts=set()
        while stack:
            face=stack.pop();faces.append(face.index);verts.update(face.verts)
            for edge in face.edges:
                for other in edge.link_faces:
                    if other.index not in visited and face_regions[other.index]==label:visited.add(other.index);stack.append(other)
        components[label].append((faces,verts))
    from mathutils.kdtree import KDTree
    def extent(component):
        coords=[vertex.co for vertex in component[1]]
        return sum((max(co[i] for co in coords)-min(co[i] for co in coords))**2 for i in range(3))
    major={name:max(values,key=extent) for name,values in components.items() if values}
    cloud=[(vertex.co.copy(),name) for name,(_,vertices) in major.items() for vertex in vertices]
    tree=KDTree(len(cloud))
    for index,(co,name) in enumerate(cloud):tree.insert(co,index)
    tree.balance()
    # Grow only the ten coherent seeds across shared edges. This makes an entire
    # misplaced hoof or tail strand join a connected region, irrespective of size.
    assigned={index:name for name,(faces,_) in major.items() for index in faces}
    queue=deque(assigned)
    while queue:
        index=queue.popleft()
        for edge in bm.faces[index].edges:
            for neighbor in edge.link_faces:
                if neighbor.index not in assigned:
                    assigned[neighbor.index]=assigned[index];queue.append(neighbor.index)
    for face in bm.faces:
        if face.index not in assigned:
            _,index,_=tree.find(face.calc_center_median());assigned[face.index]=cloud[index][1]
    face_regions=[assigned[index] for index in range(len(face_regions))]
    # Smooth shared cut contours on the original surface, so a coarse triangle
    # does not become a long tooth on a detachable piece. All neighbors retain
    # identical boundary coordinates and the original UV layout.
    from mathutils.bvhtree import BVHTree
    surface_bvh=BVHTree.FromPolygons([v.co.copy() for v in bm.verts],[[v.index for v in face.verts] for face in bm.faces],all_triangles=True)
    boundary_graph={}
    for edge in bm.edges:
        if len({face_regions[face.index] for face in edge.link_faces})>1:
            a,b=edge.verts;boundary_graph.setdefault(a,set()).add(b);boundary_graph.setdefault(b,set()).add(a)
    for iteration in range(4):
        updated={}
        for vertex,neighbors in boundary_graph.items():
            if len(neighbors)!=2:continue
            wanted=vertex.co*.5+sum((v.co for v in neighbors),Vector())*.25
            point,normal,index,distance=surface_bvh.find_nearest(wanted)
            if point is not None:updated[vertex]=point
        for vertex,point in updated.items():vertex.co=point
    # Limb puzzles use an explicit transverse didactic cut. Flatten both sides
    # of the shared contour, avoiding folded, stacked-looking caps at the root.
    for vertex in boundary_graph:
        labels={face_regions[face.index] for face in vertex.link_faces}
        limbs={label for label in labels if label.startswith(('fore_','hind_'))}
        body=labels-set(limbs)-{'tail'}
        if limbs and body:vertex.co.z=limb_cut*height
    for vertex in bm.verts:source_mesh.vertices[vertex.index].co=vertex.co
    source_mesh.update()
    bm.free()
    boundary_neighbors={}
    for polygon in source_mesh.polygons:
        for edge in polygon.edge_keys:
            boundary_neighbors.setdefault(tuple(sorted(edge)),set()).add(face_regions[polygon.index])
    closure_materials={}
    parts=[];stats=[]
    for name in REGIONS:
        mesh=source_mesh.copy();part=bpy.data.objects.new('part_'+name,mesh);bpy.context.collection.objects.link(part)
        if len(mesh.materials)>1:mesh.materials.clear();mesh.materials.append(surface)
        bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
        original_face=bm.faces.layers.int.new('original_face')
        expected_normals=[polygon.normal.copy() for polygon in source_mesh.polygons]
        for face in bm.faces:face[original_face]=face.index
        original=bm.verts.layers.int.new('original_vertex')
        for vertex in bm.verts:vertex[original]=vertex.index
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if face_regions[f.index]!=name],context='FACES')
        # The cow's merged inner-thigh junction can fold a tiny skin triangle
        # onto the transverse cut. Remove that interior sliver before capping.
        if animal=='cow':
            bmesh.ops.delete(bm,geom=[face for face in bm.faces if all(abs(vertex.co.z-limb_cut*height)<1e-6 for vertex in face.verts)],context='FACES')
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bmesh.ops.dissolve_degenerate(bm,dist=1e-7,edges=list(bm.edges))
        cap_faces=close_boundary_cycles(bm)
        # A projected udder/inner-thigh junction can make a folded planar loop.
        # Use one convex neutral closure for each transverse cut instead of
        # overlapping triangle fans. The external surface remains the lesson.
        if animal=='cow':
            flat=[face for face in cap_faces if all(abs(v.co.z-limb_cut*height)<1e-6 for v in face.verts)]
            if flat:
                from mathutils.geometry import convex_hull_2d
                vertices=list({vertex for face in flat for vertex in face.verts})
                hull=convex_hull_2d([Vector((v.co.x,v.co.y)) for v in vertices])
                cap_faces=[face for face in cap_faces if face not in flat]
                bmesh.ops.delete(bm,geom=flat,context='FACES_ONLY')
                if len(hull)>=3:cap_faces.append(bm.faces.new([vertices[index] for index in hull]))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
        if cap_faces:
            for face in cap_faces:
                votes={label:0 for label in REGIONS if label!=name}
                for edge in face.edges:
                    key=tuple(sorted(vertex[original] for vertex in edge.verts))
                    for label in boundary_neighbors.get(key,[]):
                        if label in votes:votes[label]+=1
                neighbor=max(votes,key=votes.get) if any(votes.values()) else 'source'
                if neighbor not in closure_materials:
                    material=cut.copy();material.name=f'{animal}_didactic_cut__{neighbor}';material['closureNeighbor']=neighbor;closure_materials[neighbor]=material
                material=closure_materials[neighbor]
                slot=next((i for i,m in enumerate(mesh.materials) if m==material),None)
                if slot is None:slot=len(mesh.materials);mesh.materials.append(material)
                face.material_index=slot
            recessed=bmesh.ops.extrude_discrete_faces(bm,faces=cap_faces).get('faces',[])
            for face in recessed:
                normal=face.normal.copy()
                for vertex in face.verts:vertex.co-=normal*.003
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        if animal=='cow':
            # A larger non-planar closure may contain a planar folded subsection.
            # Unite those coplanar triangles after triangulation as well.
            planes={}
            for face in list(bm.faces):
                if face.material_index==0:continue
                zs=[vertex.co.z for vertex in face.verts]
                if max(zs)-min(zs)<1e-6 and abs(sum(zs)/len(zs)-limb_cut*height)<.012:
                    planes.setdefault(round(sum(zs)/len(zs)/.00001),[]).append(face)
            for faces in planes.values():
                if len(faces)<2:continue
                vertices=list({vertex for face in faces for vertex in face.verts})
                from mathutils.geometry import convex_hull_2d
                hull=convex_hull_2d([Vector((v.co.x,v.co.y)) for v in vertices])
                material_index=faces[0].material_index
                bmesh.ops.delete(bm,geom=faces,context='FACES_ONLY')
                if len(hull)>=3:
                    face=bm.faces.new([vertices[index] for index in hull]);face.material_index=material_index
                    bmesh.ops.triangulate(bm,faces=[face])
        # A single boundary loop can border several regions. Assign each closure
        # triangle to its nearest neighboring surface, rather than revealing the
        # entire loop when just one of those neighbors is removed.
        other_faces=[p for p in source_mesh.polygons if face_regions[p.index]!=name]
        neighbor_tree=KDTree(len(other_faces))
        for index,polygon in enumerate(other_faces):neighbor_tree.insert(polygon.center,index)
        neighbor_tree.balance()
        for face in bm.faces:
            if face.material_index==0:continue
            _,index,_=neighbor_tree.find(face.calc_center_median());neighbor=face_regions[other_faces[index].index]
            if neighbor not in closure_materials:
                material=cut.copy();material.name=f'{animal}_didactic_cut__{neighbor}';material['closureNeighbor']=neighbor;closure_materials[neighbor]=material
            material=closure_materials[neighbor]
            slot=next((i for i,m in enumerate(mesh.materials) if m==material),None)
            if slot is None:slot=len(mesh.materials);mesh.materials.append(material)
            face.material_index=slot
        # Remove redundant closure faces at a non-manifold branch in the source.
        for edge in list(bm.edges):
            while edge.is_valid and len(edge.link_faces)>2:
                candidates=[face for face in edge.link_faces if face.material_index>0]
                victim=min(candidates or list(edge.link_faces),key=lambda face:face.calc_area())
                bmesh.ops.delete(bm,geom=[victim],context='FACES_ONLY')
        bmesh.ops.dissolve_degenerate(bm,dist=1e-7,edges=list(bm.edges))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
        # Orient adjacent triangles explicitly. A non-orientable source junction
        # is split into a coincident seam, preserving the visible surface instead
        # of exporting inverted triangles. Record this repair in the manifest.
        flips={};conflicts=set()
        for first in list(bm.faces):
            if first in flips:continue
            flips[first]=False;queue=deque([first])
            while queue:
                face=queue.popleft()
                for edge in face.edges:
                    if len(edge.link_faces)!=2:continue
                    other=next(f for f in edge.link_faces if f!=face)
                    a=next(loop for loop in face.loops if loop.edge==edge)
                    b=next(loop for loop in other.loops if loop.edge==edge)
                    wanted=flips[face] ^ (a.vert==b.vert)
                    if other not in flips:flips[other]=wanted;queue.append(other)
                    elif flips[other]!=wanted:conflicts.add(edge)
        for face,flip in flips.items():
            if flip:face.normal_flip()
        seam_repairs=len(conflicts)
        if conflicts:bmesh.ops.split_edges(bm,edges=list(conflicts))
        # Orient every closed connected component, including small source islands.
        seen=set()
        for first in list(bm.faces):
            if first in seen:continue
            stack=[first];component=[];seen.add(first)
            while stack:
                face=stack.pop();component.append(face)
                for edge in face.edges:
                    for other in edge.link_faces:
                        if other not in seen:seen.add(other);stack.append(other)
            if all(len(edge.link_faces)==2 for face in component for edge in face.edges):
                volume=sum(face.verts[0].co.dot(face.verts[1].co.cross(face.verts[2].co)) for face in component if len(face.verts)==3)/6
                if volume<0:
                    for face in component:face.normal_flip()
            # Open convex closures do not provide a reliable signed volume.
            # Preserve the outward winding of the licensed external skin.
            orientation=sum(face.calc_area()*face.normal.dot(expected_normals[face[original_face]]) for face in component if face.material_index==0)
            if orientation<0:
                for face in component:face.normal_flip()
        bm.normal_update()
        bmesh.ops.delete(bm,geom=[edge for edge in bm.edges if not edge.link_faces],context='EDGES')
        bmesh.ops.delete(bm,geom=[vertex for vertex in bm.verts if not vertex.link_faces],context='VERTS')
        uv=bm.loops.layers.uv.active
        for face in bm.faces:
            if face.material_index>0:
                face.smooth=False
                axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
                for loop in face.loops:
                    if uv:loop[uv].uv=(loop.vert.co[axes[0]]/max(width,length,height)+.5,loop.vert.co[axes[1]]/max(width,length,height)+.5)
            if uv and len(face.loops)==3:
                a,b,c=[loop[uv].uv.copy() for loop in face.loops]
                area=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))
                if area<1e-12:
                    center_uv=(a+b+c)/3
                    for loop,delta in zip(face.loops,[(0,0),(.0001,0),(0,.0001)]):loop[uv].uv=center_uv+Vector(delta)
        bm.to_mesh(mesh);bm.free();mesh.validate(clean_customdata=True);mesh.update()
        for p in mesh.polygons:
            if p.material_index==0:p.use_smooth=True
        if not mesh.polygons:raise RuntimeError('Missing region '+animal+' '+name)
        for b in armdata.bones:part.vertex_groups.new(name=b.name)
        for vertex in mesh.vertices:
            ws=weights(vertex.co,name)
            total=sum(ws.values())
            for suffix,w in ws.items():
                if w>1e-6:part.vertex_groups[f'{animal} {suffix}'].add([vertex.index],w/total,'REPLACE')
        modifier=part.modifiers.new('Illustrative articulation','ARMATURE');modifier.object=arm
        part.parent=arm
        part.shape_key_add(name='Basis')
        breath=part.shape_key_add(name='Breath')
        for vertex in breath.data:
            x,f,h=normalized(vertex.co)
            mask=smoothstep(.25,.35,f)*(1-smoothstep(.55,.65,f))*smoothstep(.35,.45,h)*(1-smoothstep(.72,.82,h))
            vertex.co.x*=1+.012*mask;vertex.co.z+=.002*mask
        part['region']=name;part['representation']='closed_external_didactic_segment';part['anatomy_review']='pending'
        mesh.calc_loop_triangles()
        stats.append({'region':name,'triangles':len(mesh.loop_triangles),'vertices':len(mesh.vertices),'closure_faces':len(cap_faces),'orientation_seam_repairs':seam_repairs})
        parts.append(part)
    bpy.data.objects.remove(ob,do_unlink=True)
    root=bpy.data.objects.new('animal_root',None);bpy.context.collection.objects.link(root);arm.parent=root
    root['tailRestReady']=True;root['closedSegments']=True;root['sourceLicense']='CC0-1.0';root['anatomyReview']='pending'
    bpy.context.view_layer.update()
    if qa_check:
        # A removed neck intentionally leaves a stationary head disconnected.
        # Isolated-piece QA still treats every detached island as an error.
        qa_check.PROFILES['partial_assembly']={**qa_check.PROFILES['game'],'fl':'w'}
        # Validate the displayed assembled skin and each displayed isolated piece.
        isolated={part.name:qa_check.run(objects=[part.name],profile='game',eps=0.00001) for part in parts}
        skin=[]
        for part in parts:
            copy=part.copy();copy.data=part.data.copy();copy.name='assembled_'+part.name;bpy.context.collection.objects.link(copy)
            bm=bmesh.new();bm.from_mesh(copy.data)
            bmesh.ops.delete(bm,geom=[face for face in bm.faces if face.material_index>0],context='FACES')
            bmesh.ops.delete(bm,geom=[vertex for vertex in bm.verts if not vertex.link_faces],context='VERTS')
            bm.to_mesh(copy.data);bm.free();skin.append(copy)
        assembled=qa_check.run(objects=[p.name for p in skin],profile='game',eps=0.00001)
        for part in skin:bpy.data.objects.remove(part,do_unlink=True)
        exposed_checks={}
        for missing in [set(['head','fore_left','hind_right'])]+[{name} for name in REGIONS]:
            displayed=[]
            for part in parts:
                if part['region'] in missing:continue
                copy=part.copy();copy.data=part.data.copy();copy.name='exposed_'+part.name;bpy.context.collection.objects.link(copy)
                bm=bmesh.new();bm.from_mesh(copy.data)
                hidden=[face for face in bm.faces if face.material_index>0 and copy.data.materials[face.material_index].get('closureNeighbor') not in missing]
                bmesh.ops.delete(bm,geom=hidden,context='FACES')
                bmesh.ops.delete(bm,geom=[vertex for vertex in bm.verts if not vertex.link_faces],context='VERTS')
                bm.to_mesh(copy.data);bm.free();displayed.append(copy)
            key=','.join(sorted(missing));exposed_checks[key]=qa_check.run(objects=[p.name for p in displayed],profile='partial_assembly',eps=0.00001)
            for part in displayed:bpy.data.objects.remove(part,do_unlink=True)
        errors=['assembled: '+e for e in assembled['errors']]
        for name,check in isolated.items():errors.extend(name+': '+e for e in check['errors'])
        for name,check in exposed_checks.items():errors.extend('exposed '+name+': '+e for e in check['errors'])
        qa={'pass':not errors,'errors':errors,'assembled_skin':assembled,'separated_pieces':isolated,'exposed_cuts':exposed_checks,'contract':'Closures hidden between assembled neighbors; shown on detached pieces and on the body only where a neighbor is removed.','eps_m':0.00001}
        (REVIEW/f'{animal}-v2-qa.json').write_text(json.dumps(qa,indent=2,default=str))
    else:qa={'pass':None,'note':'Run qa_check with --qa-scripts before release.'}
    blend=BASE/'assets'/'src'/f'{animal}-v2.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{animal}-v2.glb'),export_format='GLB',export_extras=True,export_animations=False,export_yup=True,export_tangents=True,export_image_format='JPEG',export_image_quality=95)
    report={'animal':animal,'source':str(source.name),'license':'CC0-1.0','source_origin':'Grab3D; AI-assisted source, adapted in Blender',
            'dimensions_m':{'width':width,'length':length,'height':height},'triangles':sum(s['triangles'] for s in stats),'bones':len(armdata.bones),'parts':stats,'qa':qa}
    print('ASSET_RESULT',json.dumps({k:v for k,v in report.items() if k!='qa'}),flush=True)
    return report

if options.animal and (REVIEW/'animals-v2-report.json').exists():
    reports=[report for report in json.loads((REVIEW/'animals-v2-report.json').read_text()) if report['animal']!=options.animal]
for animal,target in [('horse',56000),('cow',44000)]:
    if options.animal and animal!=options.animal:continue
    reports.append(build(animal,target))
(REVIEW/'animals-v2-report.json').write_text(json.dumps(reports,indent=2,default=str))
print('BUILD_COMPLETE',flush=True)
if any(report['qa']['pass'] is False for report in reports):raise RuntimeError('Asset QA failed; inspect assets/review before publishing.')
