"""Original anime detective and seamless articulated hands. Blender MCP authoring source.
Runtime axes x right, y up, z front; converted to Blender Z-up at export.
No external models, textures or paid providers. All dimensions in actor-local units.
"""
import bpy, math, json, os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene=bpy.data.scenes.get('Anime Detective V4')
if scene:
 for o in list(scene.objects):bpy.data.objects.remove(o,do_unlink=True)
else:scene=bpy.data.scenes.new('Anime Detective V4')
bpy.context.window.scene=scene

def xyz(p):return (p[0],-p[2],p[1])
def material(name,color,rough=.65,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal;return m
skin=material('Peach porcelain',(.91,.64,.46));hair=material('Midnight ink',(.025,.038,.07));blue=material('Oxford blue wool',(.035,.095,.23));cream=material('Warm ivory',(.95,.90,.78));red=material('Garnet silk',(.54,.045,.055));ink=material('Lash ink',(.012,.018,.033));iris=material('Petrol blue iris',(.025,.25,.34));glint=material('Eye light',(1,.98,.90));gold=material('Champagne metal',(.63,.44,.19),.3,.65)

def finish(o,name,ma):
 o.name=name;o.data.materials.append(ma)
 for p in o.data.polygons:p.use_smooth=True
 return o

def sphere(name,p,scale,ma):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=xyz(p));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);return finish(o,name,ma)

def sweep(name,points,radii,ma,sides=16):
 if ma==hair and len(points)>2:
  original=points;original_r=radii;points=[];radii=[]
  for i in range(len(original)-1):
   a,b,c,d=[Vector(original[max(0,min(len(original)-1,k))]) for k in [i-1,i,i+1,i+2]]
   ra=original_r[i] if isinstance(original_r[i],tuple) else (original_r[i],original_r[i]);rb=original_r[i+1] if isinstance(original_r[i+1],tuple) else (original_r[i+1],original_r[i+1])
   for step in range(8):
    t=step/8;points.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)));radii.append(tuple(ra[j]+(rb[j]-ra[j])*t for j in range(2)))
  points.append(original[-1]);radii.append(original_r[-1])
 vs=[];fs=[]
 for i,p in enumerate(points):
  d=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)]);d.normalize();a=d.cross(Vector((0,0,1)))
  if a.length<.1:a=d.cross(Vector((1,0,0)))
  a.normalize();b=d.cross(a).normalized();rx,rz=radii[i] if isinstance(radii[i],tuple) else (radii[i],radii[i])
  for j in range(sides):vs.append(xyz(Vector(p)+a*(rx*math.cos(j*2*math.pi/sides))+b*(rz*math.sin(j*2*math.pi/sides))))
 for i in range(len(points)-1):
  for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
 fs.append(tuple(reversed(range(sides))));fs.append(tuple((len(points)-1)*sides+j for j in range(sides)))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);return finish(o,name,ma)

# The silhouette is a soft jaw with broad cheeks, rather than a stack of spheres.
head=sphere('Head', (0,0,0),(.52,.58,.46),skin)
for v in head.data.vertices:
 # normalized mesh coordinates; taper jaw and flatten the facial surface slightly
 z=v.co.z
 if z<0:v.co.x*=1+.24*z
 if v.co.y<-.45:v.co.y=-.45+(v.co.y+.45)*.65
head_parts=[head]
for s in [-1,1]:
 head_parts.append(sphere('Ear', (s*.49,-.03,0),(.078,.12,.06),skin))
 head_parts.append(sphere('Inner ear',(s*.514,-.035,.048),(.032,.065,.013),material('Ear blush',(.77,.38,.29))))
 # Stylized eyes with upper lash contours and nested iris/pupil layers, gently curved to the face.
 head_parts.append(sphere('Eye white',(s*.205,.025,.378),(.155,.167,.061),cream))
 head_parts.append(sphere('Iris',(s*.19,.015,.431),(.081,.119,.024),iris))
 head_parts.append(sphere('Pupil',(s*.19,.024,.452),(.044,.078,.012),ink))
 head_parts.append(sphere('Catchlight',(s*.19-.023,.071,.463),(.023,.032,.009),glint))
 head_parts.append(sphere('Catchlight small',(s*.19+.023,-.028,.463),(.010,.013,.006),glint))
 head_parts.append(sweep('Upper lashes',[(s*.065,.081,.426),(s*.12,.178,.428),(s*.24,.194,.405),(s*.35,.119,.367)],[.014,.017,.019,.009],ink))
 head_parts.append(sweep('Eyebrow',[(s*.085,.262,.387),(s*.205,.296,.387),(s*.335,.263,.351)],[.012,.018,.008],hair))
 # Round square glasses: not opaque lenses, so the expression remains clear.
 pts=[]
 for j in range(65):
  a=j*2*math.pi/64;pts.append((s*.204+.178*math.copysign(abs(math.cos(a))**.65,math.cos(a)),.025+.158*math.copysign(abs(math.sin(a))**.72,math.sin(a)),.46))
 head_parts.append(sweep('Spectacle frame',pts,[.013]*len(pts),ink,10))
 head_parts.append(sweep('Spectacle temple',[(s*.38,.03,.45),(s*.49,.025,.23),(s*.50,0,-.005)],[.012]*3,ink,10))
head_parts.append(sweep('Glasses bridge',[(-.031,.04,.46),(0,.065,.47),(.031,.04,.46)],[.012]*3,ink,10))
head_parts.append(sphere('Nose',(0,-.105,.383),(.035,.043,.029),skin))
head_parts.append(sweep('Smile',[(-.065,-.245,.337),(-.02,-.259,.35),(.029,-.256,.35),(.067,-.235,.339)],[.006,.008,.008,.004],material('Smile warm',(.39,.15,.13)),10))
# Cap follows scalp, excludes the face. Locks are swept, tapered volumes with an intentional asymmetrical silhouette.
cap=sphere('Hair cap',(0,.10,-.055),(.555,.535,.445),hair)
# remove front lower half of cap, retaining temples and crown
import bmesh
bm=bmesh.new();bm.from_mesh(cap.data)
kill=[v for v in bm.verts if v.co.y<-.12 and v.co.z<.28]
bmesh.ops.delete(bm,geom=kill,context='VERTS');bm.to_mesh(cap.data);bm.free()
head_parts.append(cap)
locks=[([(-.42,.31,.18),(-.32,.48,.36),(-.17,.43,.43),(-.055,.175,.432)],[(.16,.08),(.19,.10),(.13,.065),(.003,.003)]),
 ([(0,.50,.18),(.16,.52,.32),(.29,.35,.413),(.30,.17,.404)],[(.19,.10),(.17,.085),(.10,.06),(.002,.002)]),
 ([(-.12,.52,.13),(-.02,.59,.32),(.14,.43,.43),(.185,.24,.431)],[(.18,.085),(.16,.08),(.10,.05),(.002,.002)]),
 ([(-.47,.20,.09),(-.52,.12,.15),(-.45,-.12,.18)],[.10,.09,.003]),
 ([(.47,.24,.02),(.53,.09,.12),(.47,-.12,.18)],[.10,.09,.003]),
 ([(.28,.48,-.03),(.46,.54,-.12),(.63,.45,-.16)],[.15,.115,.003]),
 ([(-.35,.44,-.12),(-.52,.37,-.21),(-.63,.23,-.22)],[.13,.09,.003])]
for pts,rs in locks:head_parts.append(sweep('Sculpted hair lock',pts,rs,hair,24))
# Head stays a separate animated group; source origin at head centre.
head_root=bpy.data.objects.new('AnimeHead',None);scene.collection.objects.link(head_root)
for o in head_parts:o.parent=head_root
# Tailored one-piece torso: elliptic loft, pointed lapels and bow tie.
torso=sweep('SuitTorso',[(0,-.30,0),(0,-.1,0),(0,.45,0),(0,.91,0),(0,1.03,0)],[(.40,.29),(.51,.33),(.59,.37),(.53,.31),(.29,.19)],blue,40)
shirt=sweep('Shirt',[(0,.25,.343),(0,.7,.356),(0,1.05,.19)],[(.12,.024),(.18,.025),(.20,.02)],cream,20)
neck=sphere('Neck',(0,1.19,0),(.16,.24,.16),skin)
# wedge lapels in actor local axes
for s in [-1,1]:
 me=bpy.data.meshes.new('Lapel');me.from_pydata([xyz((s*.12,1.06,.25)),xyz((s*.46,.86,.30)),xyz((s*.23,.48,.40)),xyz((s*.18,.8,.38))],[],[(0,1,2,3)]);ob=bpy.data.objects.new('Lapel',me);scene.collection.objects.link(ob);ob.data.materials.append(material('Lapel blue',(.065,.16,.32)));sol=ob.modifiers.new('Stitched thickness','SOLIDIFY');sol.thickness=.018
 sphere('Bow wing',(s*.115,.94,.305),(.125,.071,.06),red)
sphere('Bow knot',(0,.94,.37),(.053,.055,.035),red)
for y in [.29,.06]:sphere('Jacket button',(.04,y,.36),(.025,.025,.015),gold)
sphere('Lapel pin',(-.32,.80,.345),(.033,.047,.018),gold)
head_root.location=xyz((0,1.64,.02))
# Export only torso/head; runtime shoulders have continuous, articulated sleeves and hands.
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=ROOT+'/public/assets/anime-detective-v4.glb',export_format='GLB',use_selection=True,use_active_scene=True)
# Seamless hand, voxel-unified before deformation. One surface, 5 fingers, no nested translated meshes.
parts=[sphere('Palm',(0,.135,0),(.144,.16,.069),skin),sphere('Wrist',(0,.018,0),(.081,.065,.059),skin)]
fingers=[]
for i,(x,y,L) in enumerate([(-.105,.233,.192),(-.035,.25,.222),(.039,.239,.205),(.105,.211,.158)]):
 pts=[(x,y,0),(x,y+L*.36,0),(x,y+L*.72,-.003),(x,y+L-.02,-.007)]
 parts.append(sweep('Finger',pts,[.034-i*.002,.031-i*.002,.026-i*.002,.019-i*.001],skin,16));parts.append(sphere('Tip',pts[-1],(.020-i*.001,.024,.022-i*.001),skin));fingers.append({'base':[x,y,0],'length':L})
parts.append(sweep('Thumb',[(-.105,.09,-.002),(-.173,.14,-.01),(-.205,.204,-.022)],[.046,.036,.025],skin));parts.append(sphere('Thumb tip',(-.205,.204,-.022),(.026,.03,.026),skin))
fingers.append({'base':[-.105,.09,-.002],'length':.15,'direction':[-.6,.8,-.1]})
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join();hand=bpy.context.object;hand.name='SeamlessHand'
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
rem=hand.modifiers.new('Connected skin surface','REMESH');rem.mode='VOXEL';rem.voxel_size=.006;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
sm=hand.modifiers.new('Organic surface relaxation','SMOOTH');sm.factor=.8;sm.iterations=5;bpy.ops.object.modifier_apply(modifier=sm.name)
dec=hand.modifiers.new('Game surface budget','DECIMATE');dec.ratio=.55;bpy.ops.object.modifier_apply(modifier=dec.name)
tri=hand.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
# Export geometry in runtime axes, ready for Skeleton skinning. Bone positions are a stable authored contract.
hand.data.update();positions=[];normals=[];indices=[]
for v in hand.data.vertices:
 w=hand.matrix_world@v.co;positions.extend([round(w.x,6),round(w.z,6),round(-w.y,6)]);n=v.normal;normals.extend([round(n.x,6),round(n.z,6),round(-n.y,6)])
for p in hand.data.polygons:indices.extend(list(p.vertices))
with open(ROOT+'/public/assets/seamless-hand-v4.json','w') as f:json.dump({'positions':positions,'normals':normals,'indices':indices,'fingers':fingers,'provenance':'Original Blender voxel-unified surface, no external assets'},f,separators=(',',':'))
# Preserve editable canonical source in its own file; never overwrite prior source work.
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets-source-v4.blend')
print(json.dumps({'head_glb':os.path.getsize(ROOT+'/public/assets/anime-detective-v4.glb'),'hand_vertices':len(positions)//3,'hand_triangles':len(indices)//3,'source':bpy.data.filepath}))
