"""Adapt two licensed, complete VRoid humanoids. Preserve source bones and skin weights."""
import bpy, os, math, json, contextlib, io, glob
from mathutils import Vector,Matrix
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene=bpy.data.scenes.get('Standard Humanoids V5')
if scene:
 for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
else:scene=bpy.data.scenes.new('Standard Humanoids V5')
bpy.context.window.scene=scene;scene.render.fps=30
actors={}
for role,filename in [('detective','Sakurada_Fumiriya'),('visitor','Sendagaya_Shibu')]:
 before=set(scene.objects)
 with contextlib.redirect_stdout(io.StringIO()):bpy.ops.import_scene.gltf(filepath=ROOT+'/.tools/standard-rigs/'+filename+'.vrm')
 objs=set(scene.objects)-before;arm=next(o for o in objs if o.type=='ARMATURE');arm.name=role.title()+' Standard Rig';arm.rotation_euler.z=0
 for o in objs:
  if o.type=='MESH':o.name=role.title()+' '+o.name.split('.')[0]
 actors[role]={'arm':arm,'objects':list(objs),'source':filename}
# Texture budgets: preserve the professionally authored facial/cloth maps, no texture generator.
seen=set()
for actor in actors.values():
 for ob in actor['objects']:
  if ob.type!='MESH':continue
  for mat in ob.data.materials:
   for node in mat.node_tree.nodes:
    if node.type=='TEX_IMAGE' and node.image and node.image not in seen:
     im=node.image;seen.add(im);limit=1024 if 'Face' in im.name or 'Tops' in im.name else 512
     if max(im.size)>limit:im.scale(limit,limit)
     im.pack()
def plain(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=.8;return m
blue=plain('Detective blazer blue',(.025,.09,.26));white=plain('Detective collar white',(.94,.94,.91));red=plain('Detective bow red',(.61,.018,.026));ink=plain('Detective glasses ink',(.008,.012,.021));button=plain('Detective buttons',(.32,.25,.1))
arm=actors['detective']['arm'];body=next(o for o in actors['detective']['objects']if o.name.startswith('Detective Body'));face=next(o for o in actors['detective']['objects']if o.name.startswith('Detective Face'));hair=next(o for o in actors['detective']['objects']if o.name.startswith('Detective Hair'))
for i,m in enumerate(body.data.materials):
 if 'Tops_' in m.name:body.data.materials[i]=blue
# Keep a recognizable young male face and the existing facial morph topology.
arm.pose.bones['J_Bip_C_Head'].scale=(1.3,1.3,1.3)
for m in list(hair.data.materials)+[m for m in body.data.materials if 'HairBack' in m.name]:
 image=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE').image
 # Recolor the existing strand texture while retaining alpha and fine highlights.
 import numpy as np
 px=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4);lum=px[:,:3]@np.array([.21,.72,.07]);shade=.018+lum*.14;px[:,0]=shade*.60;px[:,1]=shade*.76;px[:,2]=shade
 image.pixels[:]=px.ravel();image.pack()
# One garment surface uses the original body's coordinates and deform weights, rather than disconnected arm pieces.
keep=[]
for p in body.data.polygons:
 if p.material_index!=0:continue
 c=sum((body.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
 torso=abs(c.x)<.19 and 1.05<c.z<1.53
 sleeve=.15<abs(c.x)<.598 and 1.47<c.z<1.61
 opening=c.y>.035 and abs(c.x)<.054 and c.z>1.14
 if sleeve:keep.append(p)
ids=sorted({i for p in keep for i in p.vertices});remap={v:i for i,v in enumerate(ids)};vs=[]
for i in ids:
 v=body.data.vertices[i].co.copy()
 if abs(v.x)<.19:v.x*=1.055;v.y*=1.13
 else:v.y*=1.12;v.z=1.535+(v.z-1.535)*1.10
 vs.append(v)
mesh=bpy.data.meshes.new('Standard weighted blazer surface');mesh.from_pydata(vs,[],[tuple(remap[i]for i in p.vertices)for p in keep]);mesh.update();coat=bpy.data.objects.new('Detective Blazer',mesh);scene.collection.objects.link(coat);coat.data.materials.append(blue);coat.parent=arm
for g in body.vertex_groups:coat.vertex_groups.new(name=g.name)
for old,new in remap.items():
 for g in body.data.vertices[old].groups:coat.vertex_groups[g.group].add([new],g.weight,'REPLACE')
mod=coat.modifiers.new('Source standard humanoid skin','ARMATURE');mod.object=arm
for p in coat.data.polygons:p.use_smooth=True
actors['detective']['objects'].append(coat)
def weighted_object(o,bone):
 o.parent=arm;g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');md=o.modifiers.new('Standard humanoid attachment','ARMATURE');md.object=arm;actors['detective']['objects'].append(o);return o
def panel(name,verts,mat,bone='J_Bip_C_UpperChest'):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],[tuple(range(len(verts)))]);me.materials.append(mat);ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);return weighted_object(ob,bone)
# Collar, lapels and bow are small fitted accessories on the existing chest joint.
panel('Detective shirt front',[(-.06,.108,1.53),(.06,.108,1.53),(.044,.133,1.26),(-.044,.133,1.26)],white)
for s in [-1,1]:
 panel('Detective lapel',[(s*.055,.12,1.53),(s*.15,.10,1.48),(s*.105,.145,1.30),(s*.05,.145,1.40)],blue)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=(s*.039,.145,1.49));o=bpy.context.object;o.name='Detective bow wing';o.scale=(.042,.017,.025);bpy.ops.object.transform_apply(location=True,rotation=False,scale=True);o.data.materials.append(red);weighted_object(o,'J_Bip_C_UpperChest')
bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=(0,.162,1.49));o=bpy.context.object;o.name='Detective bow knot';o.scale=(.018,.015,.02);bpy.ops.object.transform_apply(location=True,rotation=False,scale=True);o.data.materials.append(red);weighted_object(o,'J_Bip_C_UpperChest')
# Round rectangular glasses fit the original iris positions. Their vertices keep the standard head weight.
verts=[];faces=[]
for side in [-1,1]:
 for i in range(65):
  a=i*math.tau/64;cx=side*.039+.039*math.copysign(abs(math.cos(a))**.70,math.cos(a));cz=1.742+.031*math.copysign(abs(math.sin(a))**.76,math.sin(a))
  for j in range(8):
   t=j*math.tau/8;verts.append((cx+math.cos(a)*math.cos(t)*.0019,.113+math.sin(t)*.0019,cz+math.sin(a)*math.cos(t)*.0019))
 base=(0 if side==-1 else 65*8)
 for i in range(64):
  for j in range(8):a=base+i*8+j;b=base+i*8+(j+1)%8;faces.append((a,b,b+8,a+8))
me=bpy.data.meshes.new('Fitted glasses');me.from_pydata(verts,[],faces);me.materials.append(ink);ob=bpy.data.objects.new('Detective glasses',me);scene.collection.objects.link(ob);weighted_object(ob,'J_Bip_C_Head')
panel('Detective glasses bridge',[(-.008,.115,1.747),(.008,.115,1.747),(.008,.115,1.743),(-.008,.115,1.743)],ink,'J_Bip_C_Head')
# Remove the source tie covered by the fitted bow and keep fabric folds compact.
import bmesh
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index==2],context='FACES');bm.to_mesh(body.data);bm.free()
for ob in actors['detective']['objects']:
 if ob.name.startswith('Detective bow wing'):
  for v in ob.data.vertices:
   sign=1 if v.co.x>0 else -1;v.co.x=sign*(.012+abs(v.co.x)*.72);v.co.z=1.49+(v.co.z-1.49)*1.12;v.co.y=.148+(v.co.y-.145)*.5
# Standard source motion library, kept separate from both renderable actors.
libscene=bpy.data.scenes.get('Standard Motion Library V5') or bpy.data.scenes.new('Standard Motion Library V5');bpy.context.window.scene=libscene;libscene.render.fps=30
if not any(o.type=='ARMATURE'for o in libscene.objects):
 p=glob.glob(ROOT+'/.tools/standard-rigs/UAL1/**/*.glb',recursive=True)[0]
 with contextlib.redirect_stdout(io.StringIO()):bpy.ops.import_scene.gltf(filepath=p)
bpy.context.window.scene=scene
for a in actors.values():
 a['arm']['source_model']=a['source'];a['arm']['license']='CC0-1.0';a['arm']['role']='detective' if a['source']=='Sakurada_Fumiriya'else'visitor'
scene['standard_rigs']='VRoid CC0 Sakurada Fumiriya / Sendagaya Shibu'
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets-source-v5.blend')
print('Prepared',[(k,a['arm'].name,len(a['arm'].data.bones))for k,a in actors.items()]);print('Library',[(o.name,o.type)for o in libscene.objects]);print('Actions',[a.name for a in bpy.data.actions if any(s in a.name for s in ['Sitting','PickUp','Interact','Driving','Idle_Loop'])][-20:])
