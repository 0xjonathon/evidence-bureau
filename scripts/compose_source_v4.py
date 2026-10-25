"""Assemble the exact exported runtime rig and the editable bureau for Blender review."""
import bpy,math,os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene=bpy.data.scenes.get('Game Runtime V4')
if scene:
 for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
else:scene=bpy.data.scenes.new('Game Runtime V4')
bpy.context.window.scene=scene
room=bpy.data.scenes.get('Bureau Room V3');copies={}
for old in room.objects:
 new=old.copy();new.data=old.data.copy() if old.data else None;scene.collection.objects.link(new);copies[old]=new
for old,new in copies.items():
 new.parent=copies.get(old.parent)
 new.matrix_world=old.matrix_world.copy()
for old,new in copies.items():
 if old.name.startswith('PrinterReceipt'):new.hide_render=True
 if old.name.startswith('Rubber stamp'):new.location+=Vector((-.12,.52,.04))
 if old.name.startswith('Keyboard'):
  p=old.matrix_world.translation;new.location=(.67-(p.x-1.88),.28+(-p.y-.44),p.z+.015);new.rotation_euler.z+=math.pi
before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=ROOT+'/public/assets/character-rig-v4.glb')
for o in set(scene.objects)-before:
 if o.parent is None:o.location=(0,.75,1.56);o.scale=(.8,.8,.8)
def ma(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=.6;return m
cream=ma('Equipment ivory V4',(.59,.60,.43));dark=ma('Equipment ink V4',(.025,.05,.055));glass=ma('Scanner glass V4',(.035,.13,.12))
def box(name,p,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(p[0],-p[2],p[1]));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);b=o.modifiers.new('Crafted edge','BEVEL');b.width=.025;b.segments=3;o.modifiers.new('Corner normals','WEIGHTED_NORMAL');return o
box('Detective computer back',(1.03,1.96,.03),(.85,.60,.065),dark)
box('Detective computer screen',(1.03,1.97,-.008),(.76,.49,.006),glass)
box('Computer hinge',(1.03,1.68,.03),(.89,.07,.095),dark)
box('Scanner chassis',(-.76,1.688,-.06),(1.02,.15,.83),cream)
box('Scanner glass bed',(-.76,1.772,-.06),(.91,.018,.73),glass)
box('Scanner lid',(-.76,1.805,-.06),(1.02,.065,.82),cream)
bpy.ops.object.camera_add(location=(0,-6.5,3.10));cam=bpy.context.object;cam.name='V4 first-person review camera';cam.rotation_euler=(Vector((0,.25,2.25))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=43;scene.camera=cam
for name,p,power,size in [('V4 soft key',(-3,-5,6),800,5),('V4 rim',(3,3,5),600,3)]:
 bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
scene.world=room.world;scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
try:scene.render.engine='CYCLES'
except TypeError:pass
scene.cycles.samples=24;scene.cycles.use_denoising=True
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets-source-v4.blend')
print('V4 source assembled:',len(scene.objects),'objects; actual runtime rig imported with four skin systems.')
