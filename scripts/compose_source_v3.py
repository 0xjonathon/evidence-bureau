"""Editable game scene: two continuous human meshes, deform skeletons and hand IK.
Runtime assets keep their neutral bind poses; this file supplies a seated review scene.
"""
import bpy,math,os
from mathutils import Vector,Matrix
ROOT='/Users/ren/Desktop/Projects/THE EVIDENCE BUREAU'
room=next(s for s in bpy.data.scenes if s.name=='Bureau Room V3')
actors=next(s for s in bpy.data.scenes if any(o.type=='ARMATURE' and o.name.startswith('VisitorSkeleton') for o in s.objects))
scene=bpy.data.scenes.new('Evidence Bureau V3')
for o in room.objects:scene.collection.objects.link(o)
scene.world=room.world;bpy.context.window.scene=scene

def copy_actor(prefix):
 original=next(o for o in actors.objects if o.type=='ARMATURE' and o.name.startswith(prefix+'Skeleton'))
 rig=original.copy();rig.data=original.data.copy();rig.name=prefix+' Game Rig';scene.collection.objects.link(rig)
 for child in original.children_recursive:
  clone=child.copy();clone.name=prefix+' Game '+child.name;clone.parent=rig;scene.collection.objects.link(clone)
  for m in clone.modifiers:
   if m.type=='ARMATURE':m.object=rig
 return rig

def target(name,point):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=point;o.empty_display_size=.07;return o

def configure_ik(rig,side):
 p=rig.pose.bones;sign=1 if side=='l' else -1
 wrist=target('V3 Hand IK '+side,(sign*.50,-.11,1.69));pole=target('V3 Elbow Pole '+side,(sign*1.1,.25,1.9))
 ik=p['lowerarm_'+side].constraints.new('IK');ik.target=wrist;ik.pole_target=pole;ik.chain_count=2
 hand=p['hand_'+side];rest=rig.data.bones['hand_'+side].matrix_local
 mid=rig.data.bones['middle_01_'+side].head_local;idx=rig.data.bones['index_01_'+side].head_local;pink=rig.data.bones['pinky_01_'+side].head_local
 f=(rest.inverted()@mid).normalized();l=(rest.inverted().to_3x3()@(idx-pink));l=(l-f*l.dot(f)).normalized();n=l.cross(f).normalized();local=Matrix((l,f,n)).transposed().to_quaternion().inverted()
 forward=Vector((0,-1,0));normal=Vector((0,0,1));lateral=forward.cross(normal)*sign;z=lateral.cross(forward);wrist.rotation_mode='QUATERNION';wrist.rotation_quaternion=Matrix((lateral,forward,z)).transposed().to_quaternion()@local
 rot=hand.constraints.new('COPY_ROTATION');rot.target=wrist;rot.owner_space='WORLD';rot.target_space='WORLD'
 foot=target('V3 Foot IK '+side,(sign*.28,-.4,.22));kp=target('V3 Knee Pole '+side,(sign*.28,-1.15,1.0));ik=p['calf_'+side].constraints.new('IK');ik.target=foot;ik.pole_target=kp;ik.chain_count=2

detective=copy_actor('Detective');detective.location=(0,.65,-.65);detective.scale=(2.4,)*3
for side in ['l','r']:configure_ik(detective,side)
visitor=copy_actor('Visitor');visitor.location=(0,-6.22,-.16);visitor.rotation_euler.z=math.pi;visitor.scale=(2.4,)*3
visitor['role']='Full first-person character source; runtime extracts continuous weighted arm regions.'
visitor.hide_render=True;visitor.hide_set(True)
for child in visitor.children_recursive:child.hide_render=True;child.hide_set(True)
camdata=bpy.data.cameras.new('Game Visitor Camera');cam=bpy.data.objects.new('Game Visitor Camera',camdata);scene.collection.objects.link(cam);cam.location=(0,-6.5,3.1);cam.rotation_euler=(Vector((0,.25,2.25))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=43;scene.camera=cam
scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=ROOT+'/public/assets/bureau-preview.png'
try:scene.render.engine='CYCLES'
except TypeError:pass
scene.cycles.samples=24;scene.cycles.use_denoising=True
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets-source-v3.blend')
print('V3 editable scene saved with two complete 53-joint characters')
