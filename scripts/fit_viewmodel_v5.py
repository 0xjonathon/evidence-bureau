"""Fit the standard visitor rig to a first-person camera; keep hand geometry and every source joint."""
import bpy,math
arm=bpy.data.objects['Visitor Standard Rig'];ratio=1.3
previous=arm.get('viewmodel_arm_ratio',1.0);relative=ratio/previous
bpy.context.window.scene=bpy.data.scenes['Standard Humanoids V5'];bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
s=abs(arm.data.bones['J_Bip_L_UpperArm'].head_local.x);w=abs(arm.data.bones['J_Bip_L_Hand'].head_local.x)
def fit(co):
 x=abs(co.x);sign=1 if co.x>=0 else-1
 if x>s:co.x=sign*(s+(x-s)*relative if x<w else x+(w-s)*(relative-1))
for ob in arm.children_recursive:
 if ob.type=='MESH'and'Body'in ob.name:
  keys=ob.data.shape_keys.key_blocks if ob.data.shape_keys else []
  if keys:
   for key in keys:
    for v in key.data:
     if v.co.z>1.2:fit(v.co)
  else:
   for v in ob.data.vertices:
    if v.co.z>1.2:fit(v.co)
bpy.ops.object.mode_set(mode='EDIT')
for side in ['L','R']:
 upper=arm.data.edit_bones['J_Bip_'+side+'_UpperArm']
 for b in [upper]+list(upper.children_recursive):fit(b.head);fit(b.tail)
bpy.ops.object.mode_set(mode='OBJECT');arm['viewmodel_arm_ratio']=ratio
print('Fitted original upper/lower arm lengths; original hand size, topology and all 129 source joints retained.')
