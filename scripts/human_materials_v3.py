"""Browser export materials for the CC0 MakeHuman meshes. Geometry is unchanged."""
import bpy,os

def prepare_materials(objects,root):
 os.makedirs(root+'/.tools/runtime-textures',exist_ok=True)
 for o in objects:
  if o.type!='MESH':continue
  transparent=any(s in o.name for s in ['short04','eyebrow','high-poly'])
  for mat in o.data.materials:
   if not mat or not mat.use_nodes:continue
   bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if not bsdf:continue
   if not transparent:
    for link in list(bsdf.inputs['Alpha'].links):mat.node_tree.links.remove(link)
    bsdf.inputs['Alpha'].default_value=1
   if 'fedora' in o.name:
    for link in list(bsdf.inputs['Base Color'].links):mat.node_tree.links.remove(link)
    bsdf.inputs['Base Color'].default_value=(.045,.037,.029,1);bsdf.inputs['Roughness'].default_value=.85
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
    if max(abs(v.co.x) for v in vs)<.04 and min(v.co.z for v in vs)>1:ties.update(v.index for v in vs)
   mat=bpy.data.materials.new('Burgundy silk tie');mat.use_nodes=True;bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Base Color'].default_value=(.085,.024,.026,1);bsdf.inputs['Roughness'].default_value=.48;o.data.materials.append(mat);mi=len(o.data.materials)-1
   for p in o.data.polygons:
    if all(v in ties for v in p.vertices):p.material_index=mi
 for image in bpy.data.images:
  if image.source=='FILE' and any(s in image.name.lower() for s in ['fedora_diffuse','shoes01_diffuse','suit-tie-jacket-diff','lightskinned_male_diffuse']):
   image.filepath_raw=root+'/.tools/runtime-textures/'+image.name.replace('.','_')+'.jpg';image.file_format='JPEG';image.save()
