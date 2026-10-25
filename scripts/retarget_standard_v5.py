"""Retarget the existing Quaternius motion library onto both original VRoid rigs."""
import bpy,math,os,json,struct,contextlib,io
from mathutils import Quaternion,Vector,Matrix
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene=bpy.data.scenes['Standard Humanoids V5'];lib=bpy.data.scenes['Standard Motion Library V5'];source=next(o for o in lib.objects if o.type=='ARMATURE')
base={'hips':'pelvis','spine':'spine_01','chest':'spine_02','upperChest':'spine_03','neck':'neck_01','head':'Head'}
for side in ['left','right']:
 suf='l'if side=='left'else'r'
 for h,q in [('Shoulder','clavicle'),('UpperArm','upperarm'),('LowerArm','lowerarm'),('Hand','hand'),('UpperLeg','thigh'),('LowerLeg','calf'),('Foot','foot'),('Toes','ball')]:base[side+h]=q+'_'+suf
 for finger in ['Thumb','Index','Middle','Ring','Little']:
  for segment,n in [('Proximal',1),('Intermediate',2),('Distal',3)]:base[side+finger+segment]=('pinky'if finger=='Little'else finger.lower())+'_%02d_'%n+suf
A=Quaternion((0,0,1),math.pi)
clips=['Sitting_Idle_Loop','Sitting_Talking_Loop','Driving_Loop','PickUp_Table','Interact','Idle_Loop']
source_actions={n:bpy.data.actions[n]for n in clips}
samples={}
bpy.context.window.scene=lib
source.animation_data_create()
for name,action in source_actions.items():
 source.animation_data.action=action;start,end=action.frame_range;frames=[]
 for f in range(round(start),round(end)+1):
  lib.frame_set(f);q={}
  for n in set(base.values()):
   if n in source.pose.bones:
    rest=source.data.bones[n].matrix_local.to_quaternion();pose=source.pose.bones[n].matrix.to_quaternion();delta=pose@rest.inverted();q[n]=A@delta@A.inverted()
  frames.append(q)
 samples[name]=frames
bpy.context.window.scene=scene
for role in ['detective','visitor']:
 arm=bpy.data.objects[role.title()+' Standard Rig'];arm.rotation_euler.z=0
 raw=open(ROOT+'/.tools/standard-rigs/'+arm['source_model']+'.vrm','rb').read();j=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]]);vrm=j['extensions']['VRM'];human={x['bone']:j['nodes'][x['node']]['name']for x in vrm['humanoid']['humanBones']}
 pairs={human[h]:q for h,q in base.items()if h in human};rest={b.name:b.matrix_local.to_quaternion()for b in arm.data.bones};bones=list(arm.data.bones)
 def depth(b):return 0 if b.parent is None else 1+depth(b.parent)
 bones.sort(key=depth)
 arm.animation_data_create();arm.animation_data.action=None
 for t in list(arm.animation_data.nla_tracks):arm.animation_data.nla_tracks.remove(t)
 actions={}
 for name,frames in samples.items():
  action=bpy.data.actions.new(role+'.'+name);arm.animation_data.action=action;action.use_fake_user=True
  for fi,frame in enumerate(frames):
   desired={}
   for b in bones:
    parent=b.parent;parent_rest=rest[parent.name]if parent else Quaternion();parent_pose=desired[parent.name]if parent else Quaternion();local_rest=parent_rest.inverted()@rest[b.name]
    if b.name in pairs:
     want=frame[pairs[b.name]]@rest[b.name];basis=local_rest.inverted()@parent_pose.inverted()@want
    else:want=parent_pose@local_rest;basis=Quaternion()
    desired[b.name]=want;pb=arm.pose.bones[b.name];pb.rotation_mode='QUATERNION';pb.rotation_quaternion=basis
    if b.name in pairs:pb.keyframe_insert(data_path='rotation_quaternion',frame=fi+1,group=b.name)
    if role=='detective'and b.name=='J_Bip_C_Head':pb.scale=(1.35,1.35,1.35);pb.keyframe_insert(data_path='scale',frame=fi+1,group=b.name)
   # The rest of the body retains the standard source bind scales, including the head adaptation.
  actions[name]=action
 arm.animation_data.action=None
 for name,action in actions.items():
  track=arm.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,action)
 # Child meshes retain their original standard skin bind; export only this model.
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
 objects=[arm]+list(arm.children_recursive)
 for o in objects:o.select_set(True)
 oldpos=arm.location.copy();arm.location=(0,0,0)
 with contextlib.redirect_stdout(io.StringIO()):bpy.ops.export_scene.gltf(filepath=ROOT+'/public/assets/'+role+'-standard-v5.glb',export_format='GLB',use_selection=True,use_active_scene=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True)
 arm.location=oldpos
 manifest={'sourceModel':arm['source_model'],'license':'CC0-1.0','humanoid':human,'boneCount':len(arm.data.bones),'clips':clips,'blink':vrm['blendShapeMaster']['blendShapeGroups'],'sourceMotion':'Quaternius Universal Animation Library Standard'}
 json.dump(manifest,open(ROOT+'/public/assets/'+role+'-standard-v5.json','w'),indent=2)
 for track in arm.animation_data.nla_tracks:track.mute=track.name!='Sitting_Idle_Loop'
 print(role,os.path.getsize(ROOT+'/public/assets/'+role+'-standard-v5.glb'),len(arm.data.bones),[a.name for a in actions.values()])
scene.frame_set(1);bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets-source-v5.blend')
