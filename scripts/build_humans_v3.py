"""Continuous anatomical meshes and game-engine skeletons from MakeHuman CC0 assets.
MPFB is loaded from a project-local checkout; no global add-on installation or preferences.
"""
import bpy,os,json,math,contextlib,io
from mathutils import Vector
ROOT='/Users/ren/Desktop/Projects/THE EVIDENCE BUREAU'
exec(compile(open(ROOT+'/scripts/setup_humans.py').read(),'setup_humans.py','exec'))
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
ASSETS=ROOT+'/.tools/human-assets'
exec(compile(open(ROOT+'/scripts/human_materials_v3.py').read(),'human_materials_v3.py','exec'))
scene=bpy.data.scenes.new('Anatomical Actors V3');bpy.context.window.scene=scene

def character(label,gender=1,age=.40,asian=.45):
 macro=TargetService.get_default_macro_info_dict();macro.update({'gender':gender,'age':age,'muscle':.62,'weight':.43,'proportions':.58});macro['race']={'asian':asian,'caucasian':1-asian,'african':0}
 body=HumanService.create_human(scale=.1,macro_detail_dict=macro);body.name=label+'Skin'
 rig=HumanService.add_builtin_rig(body,'game_engine');rig.name=label+'Skeleton'
 HumanService.set_character_skin(ASSETS+'/skins/young_asian_male/young_asian_male.mhmat',body,skin_type='GAMEENGINE')
 additions=[('eyes/high-poly/high-poly.mhclo','Eyes'),('eyebrows/eyebrow002/eyebrow002.mhclo','Eyebrows'),('hair/short04/short04.mhclo','Hair'),('clothes/toigo_male_suit_tie_and_jacket/toigo_male_suit_tie_and_jacket.mhclo','Clothes'),('clothes/shoes01/shoes01.mhclo','Clothes')]
 if label=='Detective':additions.append(('clothes/fedora01/fedora01.mhclo','Clothes'))
 for path,kind in additions:
  asset=HumanService.add_mhclo_asset(ASSETS+'/'+path,body,asset_type=kind,subdiv_levels=0,material_type='GAMEENGINE');asset.name=label+'_'+os.path.basename(path).split('.')[0]
 # Only evaluate helper masks, retaining the armature and its skin weights.
 bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
 if body.data.shape_keys:bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
 for modifier in list(body.modifiers):
  if modifier.type=='MASK':bpy.ops.object.modifier_apply(modifier=modifier.name)
 for o in [body]+list(rig.children):
  if o.type=='MESH':
   for p in o.data.polygons:p.use_smooth=True
   for m in o.data.materials:
    if not m or not m.use_nodes:continue
    for node in m.node_tree.nodes:
     if node.type=='BSDF_PRINCIPLED':
      node.inputs['Roughness'].default_value=.64
      if 'Subsurface Weight' in node.inputs:node.inputs['Subsurface Weight'].default_value=.055 if o==body else 0
 # Small enough for a browser; retain the source UV skin and clothing details.
 for img in bpy.data.images:
  if img.source=='FILE' and max(img.size)>2048:
   ratio=2048/max(img.size);img.scale(int(img.size[0]*ratio),int(img.size[1]*ratio))
 prepare_materials([body]+list(rig.children_recursive),ROOT)
 for bone in rig.data.bones:bone['anatomicalJoint']=bone.name
 bpy.ops.object.select_all(action='DESELECT')
 rig.select_set(True)
 for o in rig.children_recursive:o.select_set(True)
 out=ROOT+'/public/assets/'+label.lower()+'-v3.glb'
 bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_active_scene=True,use_selection=True,export_apply=False,export_skins=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
 return rig,body,out

with contextlib.redirect_stdout(io.StringIO()):
 detective,body,path=character('Detective')
 visitor,vbody,vpath=character('Visitor',age=.32,asian=.7)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/actors-source-v3.blend')
print(json.dumps({'detective':os.path.getsize(path),'visitor':os.path.getsize(vpath),'skin_vertices':len(body.data.vertices),'bones':len(detective.data.bones),'actor_source':'actors-source-v3.blend'}))
