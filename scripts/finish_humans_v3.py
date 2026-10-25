import bpy,os,io,contextlib
ROOT='/Users/ren/Desktop/Projects/THE EVIDENCE BUREAU'
scene=next(s for s in bpy.data.scenes if any(o.type=='ARMATURE' and o.name.startswith('DetectiveSkeleton') for o in s.objects) and any(o.type=='ARMATURE' and o.name.startswith('VisitorSkeleton') for o in s.objects))
bpy.context.window.scene=scene
for o in scene.objects:
 if o.type!='MESH':continue
 if 'high-poly' in o.name:
  for m in o.data.materials:
   nodes=m.node_tree.nodes;bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');alpha=next(n for n in nodes if n.type=='TEX_IMAGE' and n.label=='Alpha map texture');m.node_tree.links.new(alpha.outputs['Alpha'],bsdf.inputs['Alpha'])
 if 'toigo_male_suit_tie_and_jacket' in o.name:
  parent=list(range(len(o.data.vertices)))
  def find(x):
   while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
   return x
  for edge in o.data.edges:parent[find(edge.vertices[1])]=find(edge.vertices[0])
  groups={}
  for v in o.data.vertices:groups.setdefault(find(v.index),[]).append(v)
  ties=set()
  for vs in groups.values():
   if max(abs(v.co.x) for v in vs)<.04 and min(v.co.z for v in vs)>1.0:ties.update(v.index for v in vs)
  mat=bpy.data.materials.new('Burgundy silk tie');mat.use_nodes=True;bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Base Color'].default_value=(.085,.024,.026,1);bsdf.inputs['Roughness'].default_value=.48;o.data.materials.append(mat);mi=len(o.data.materials)-1
  for p in o.data.polygons:
   if all(v in ties for v in p.vertices):p.material_index=mi
for label in ['Detective','Visitor']:
 rig=next(o for o in scene.objects if o.type=='ARMATURE' and o.name.startswith(label+'Skeleton'))
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
 for o in rig.children_recursive:o.select_set(True)
 with contextlib.redirect_stdout(io.StringIO()):bpy.ops.export_scene.gltf(filepath=ROOT+'/public/assets/'+label.lower()+'-v3.glb',export_format='GLB',use_active_scene=True,use_selection=True,export_apply=False,export_skins=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/actors-source-v3.blend')
print('Eyes and plain silk ties exported')
