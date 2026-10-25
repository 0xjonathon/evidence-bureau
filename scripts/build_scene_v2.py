"""Original procedural set for The Evidence Bureau. Run through Blender MCP.
Coordinates: Z up; visitor stands at negative Y. No external assets.
"""
import bpy, math, random, os, json
from mathutils import Vector
ROOT='/Users/ren/Desktop/Projects/THE EVIDENCE BUREAU'
random.seed(24)
for prior in bpy.data.scenes:
 if prior.name.startswith('Evidence Bureau'):
  for obj in prior.objects:obj.name='Previous_'+obj.name
scene=bpy.data.scenes.new('Evidence Bureau V2')
bpy.context.window.scene=scene

def mat(name,color,metal=0,rough=.65,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 if emission:
  n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emission
 return m
M={
'wall':mat('Malachite painted plaster',(.085,.16,.135)),
'panel':mat('Deep forest panelling',(.045,.095,.081)),
'wood':mat('Walnut',(.23,.115,.065)),
'edge':mat('Warm wood edge',(.36,.20,.105)),
'brass':mat('Aged brass',(.57,.39,.16),.7,.32),
'paper':mat('Ivory paper',(.84,.76,.58)),
'ink':mat('Ink',(.028,.035,.03)),
'green':mat('Banker green glass',(.07,.29,.19),.15,.25),
'coat':mat('Caramel wool',(.43,.27,.135)),
'lapel':mat('Sandstone wool',(.65,.45,.23)),
'skin':mat('Warm peach skin',(.79,.48,.29)),
'hair':mat('Espresso hair',(.075,.042,.027)),
'white':mat('Eye ivory',(.94,.88,.73)),
'iris':mat('Hazel',(.19,.25,.14)),
'red':mat('Vermilion thread',(.55,.13,.065)),
'computer':mat('Vintage computer cream',(.63,.61,.44)),
'screen':mat('Terminal glow',(.18,.48,.32),.1,.5,1.1),
'light':mat('Warm bulbs',(.98,.67,.28),0,.4,3),
'night':mat('Blue evening',(.055,.16,.21),0,.6,.35),
'leaf':mat('Fern',(.15,.28,.135)),
}
def apply(o,name,ma,parent=None):
 o.name=name;o.data.materials.append(M[ma]);
 if parent:o.parent=parent
 return o

def box(name,loc,size,ma,bevel=.03,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 apply(o,name,ma,parent)
 if bevel:
  mod=o.modifiers.new('Soft crafted edges','BEVEL');mod.width=bevel;mod.segments=3
  o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o

def sphere(name,loc,scale,ma,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc);o=bpy.context.object;o.scale=scale;apply(o,name,ma,parent)
 for p in o.data.polygons:p.use_smooth=True
 return o

def cyl(name,loc,r,depth,ma,parent=None,vertices=32):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);o=bpy.context.object;apply(o,name,ma,parent)
 be=o.modifiers.new('Rounded edge','BEVEL');be.width=.018;be.segments=3;o.modifiers.new('Normals','WEIGHTED_NORMAL');return o

def rod(name,a,b,r,ma,parent=None):
 mid=(Vector(a)+Vector(b))/2;o=cyl(name,mid,r,(Vector(b)-Vector(a)).length,ma,parent);o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler();return o

def empty(name):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);return o

def text(name,body,loc,size,ma,rot=(math.pi/2,0,0)):
 c=bpy.data.curves.new(name,'FONT');c.body=body;c.align_x='CENTER';c.size=size;c.extrude=.001
 o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=rot;c.materials.append(M[ma]);return o

# Deep, open-front diorama; floor and joinery.
box('Floor',(0,1,-.1),(11,9,.2),'wood')
box('Back wall',(0,3.35,2.8),(11,.18,5.6),'wall')
for x in [-5.4,5.4]:box('Side wall',(x,.3,2.8),(.16,6.3,5.6),'wall')
box('Wainscot',(0,3.22,.8),(10.9,.12,1.6),'panel')
for z in [.12,1.55,5.25]:box('Wall molding',(0,3.08,z),(10.8,.15,.09),'edge',.01)
for x in range(-5,6):box('Panel batten',(x,3.12,.8),(.045,.12,1.45),'wood',.01)
for i in range(13):box('Floor seam',(-5+i*.83,0,.005),(.012,8,.012),'ink',0)
# Tall window at left, Venetian blinds.
box('Window frame',(-3.5,3.05,3.35),(2.65,.22,3.1),'wood')
box('Evening outside',(-3.5,2.90,3.35),(2.44,.04,2.9),'night',0)
for x in [-4.65,-3.5,-2.35]:box('Window mullion',(x,2.8,3.35),(.06,.08,2.9),'brass',.01)
for z in [2.0+i*.19 for i in range(16)]:
 o=box('Venetian blind',(-3.5,2.72,z),(2.55,.13,.065),'edge',.01);o.rotation_euler.x=.22
rod('Blind cord',(-2.25,2.63,4.8),(-2.25,2.63,1.8),.012,'paper')
box('Window sill',(-3.5,2.65,1.82),(2.95,.5,.13),'wood')
# Evidence pinboard with original abstract photos and red string.
box('Evidence board frame',(3.15,3.0,3.4),(2.55,.18,2.1),'wood')
box('Cork',(3.15,2.88,3.4),(2.37,.07,1.94),'coat',.01)
for i,(x,z) in enumerate([(2.4,3.8),(3.6,3.95),(2.8,3.05),(3.8,3.1)]):
 p=box('Pinned evidence '+str(i),(x,2.79,z),(.62,.025,.55),'paper',.005);p.rotation_euler.y=(i-1.5)*.08
 box('Photo image '+str(i),(x,2.765,z+.035),(.50,.012,.32),'night' if i%2 else 'green',.001)
 sphere('Red pin',(x,2.71,z+.23),(.035,.03,.035),'red')
for a,b in [((2.4,2.72,4.03),(3.8,2.72,3.33)),((3.6,2.72,4.18),(2.8,2.72,3.28)),((2.8,2.72,3.28),(2.4,2.72,4.03))]:rod('Investigation string',a,b,.009,'red')
# Sign behind detective.
box('Bureau sign',(0,3.02,4.5),(2.4,.12,.68),'panel')
text('Bureau lettering','EVIDENCE BUREAU',(0,2.93,4.49),.17,'paper')
text('Motto lettering','EST. 2026  /  SEEK THE TRUTH',(0,2.92,4.31),.075,'brass')
# Shelves and archival books.
for z in [1.55,2.45,3.35]:
 box('Shelf',(-4.65,1.0,z),(1.25,.65,.11),'wood')
 for i in range(5):
  x=-5.1+i*.21;book=box('Archive volume',(x,1.02,z+.33),(.16,.38,.53+random.random()*.1),['coat','green','red','paper','panel'][i],.01)
  box('Book spine label',(x,.816,z+.32),(.09,.013,.13),'paper',.001)
# Desk, leather blotter, drawer pull.
box('Desk top',(0,-.05,1.45),(6.55,2.5,.20),'wood',.09)
box('Desk front edge',(0,-1.25,1.38),(6.55,.10,.15),'edge',.025)
for x in [-2.75,2.75]:
 box('Desk pedestal',(x,.05,.65),(.8,1.9,1.35),'wood',.06)
 for z in [.4,.85,1.2]:
  box('Drawer face',(x,-.93,z),(.7,.08,.28),'edge',.02);rod('Drawer brass handle',(x-.13,-1.0,z),(x+.13,-1.0,z),.022,'brass')
box('Leather writing mat',(0,-.35,1.56),(2.4,1.22,.024),'panel',.09)
# Chair.
box('Chair back',(0,1.55,2.1),(1.4,.35,1.7),'panel',.2)
for x in [-.8,.8]:box('Chair arms',(x,1.0,1.76),(.16,1.1,.16),'wood')
# Original sculpted noir character, authored in Blender. Coordinates: Z up.
# Profile lofts supply an adult jaw, cheekbones and tailored silhouette.
M['coat']=mat('Midnight tailored wool',(.065,.095,.102),0,.8)
M['lapel']=mat('Camel gabardine',(.34,.255,.17),0,.78)
M['skin']=mat('Portrait skin',(.48,.285,.205),0,.57)
M['lip']=mat('Muted lips',(.34,.16,.125),0,.65)
M['shadow']=mat('Beard shadow',(.24,.17,.137),0,.85)
M['nail']=mat('Natural nails',(.66,.43,.325),0,.46)
M['iris']=mat('Grey green iris',(.12,.20,.18),0,.35)
def loft(name,rings,ma,parent=None,sides=40):
 verts=[]
 for z,rx,ry,cy in rings:
  for j in range(sides):
   a=2*math.pi*j/sides;verts.append((rx*math.cos(a),cy+ry*math.sin(a),z))
 faces=[]
 for k in range(len(rings)-1):
  for j in range(sides):faces.append((k*sides+j,k*sides+(j+1)%sides,(k+1)*sides+(j+1)%sides,(k+1)*sides+j))
 faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(rings)-1)*sides+j for j in range(sides))])
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);apply(o,name,ma,parent)
 for p in me.polygons:p.use_smooth=True
 mod=o.modifiers.new('Portrait surface','SUBSURF');mod.levels=2
 return o

def capsule(name,a,b,r1,r2,ma,parent):
 d=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2
 bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=r1,radius2=r2,depth=d.length,location=mid)
 o=bpy.context.object;apply(o,name,ma,parent);o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
 be=o.modifiers.new('Organic edge','BEVEL');be.width=min(r1,r2)*.65;be.segments=3
 for p in o.data.polygons:p.use_smooth=True
 return o

def hand(name,c,side,parent,visitor=False):
 g=empty(name);g.parent=parent
 x,y,z=c
 sphere('Thenar palm',(x,y,z),(.135,.19,.052),'skin',g)
 # Four independent fingers; tapered phalanges, knuckles and inset nails.
 for i in range(4):
  joint=empty('GripFinger'+str(i));joint.parent=g;joint['fingerIndex']=i
  xx=x+side*(-.096+i*.063);length=[.235,.28,.258,.20][i];rad=[.030,.033,.030,.026][i]
  a=(xx,y-.10,z);b=(xx+side*.008,y-.10-length*.48,z-.007);d=(xx+side*.014,y-.10-length,z-.025)
  capsule('Proximal phalanx',a,b,rad,rad*.94,'skin',joint);sphere('Knuckle',b,(rad*.98,rad,rad*.83),'skin',joint)
  capsule('Distal phalanx',b,d,rad*.94,rad*.72,'skin',joint)
  sphere('Fingertip',d,(rad*.73,rad*.9,rad*.7),'skin',joint)
  sphere('Fingernail',(d[0],d[1]+.017,d[2]+rad*.61),(rad*.58,.035,.006),'nail',joint)
  for segment in joint.children:segment.location-=Vector(a)
  joint.location=a
 a=(x-side*.11,y+.04,z);b=(x-side*.20,y-.025,z+.025);d=(x-side*.22,y-.13,z+.025)
 capsule('Thumb metacarpal',a,b,.052,.041,'skin',g);capsule('Thumb distal',b,d,.041,.03,'skin',g)
 sphere('Thumbnail',(d[0],d[1]+.018,d[2]+.028),(.022,.037,.006),'nail',g)
 box('Shirt wrist',(x,y+.19,z-.004),(.24,.13,.09),'paper',.025,g)
 box('Tailored cuff',(x,y+.29,z-.008),(.27,.15,.13),'coat',.025,g)
 return g

detective=empty('Detective');head=empty('DetectiveHead');head.parent=detective
loft('Tailored jacket',[(1.50,.42,.26,1.05),(1.72,.48,.29,1.05),(2.12,.53,.30,1.02),(2.43,.63,.25,1.04),(2.51,.52,.20,1.05),(2.58,.24,.16,1.02)],'coat',detective)
box('Crisp shirt',(0,.744,2.31),(.29,.06,.46),'paper',.03,detective)
capsule('Neck',(0,1,2.46),(0,.98,2.83),.145,.15,'skin',detective)
for side in [-1,1]:
 o=box('Sculpted lapel',(side*.235,.738,2.32),(.19,.055,.53),'lapel',.018,detective);o.rotation_euler.y=side*.39
 o=box('Shirt collar',(side*.10,.695,2.56),(.14,.05,.20),'paper',.012,detective);o.rotation_euler.y=side*.48
 sphere('Jacket button',(side*.16,.728,1.96),(.025,.018,.025),'brass',detective)
box('Silk necktie',(0,.687,2.29),(.075,.026,.35),'hair',.012,detective)
o=box('Tie knot',(0,.673,2.49),(.086,.04,.09),'hair',.018,detective);o.rotation_euler.y=.15
box('Tie bar',(0,.664,2.26),(.10,.015,.018),'brass',.004,detective)
box('Breast pocket',(-.36,.722,2.27),(.18,.018,.025),'lapel',.005,detective)
# Adult face: narrow chin, defined jaw, high cheeks and smaller eyes.
loft('Sculpted face',[(2.74,.11,.13,.94),(2.78,.21,.20,.94),(2.88,.285,.25,.95),(3.02,.32,.27,.96),(3.19,.345,.29,.985),(3.37,.33,.29,1.0),(3.53,.29,.265,1.03),(3.63,.12,.14,1.04)],'skin',head)
for side in [-1,1]:
 sphere('Ear',(side*.342,1.015,3.19),(.062,.055,.12),'skin',head)
 sphere('Inner ear',(side*.355,.967,3.20),(.026,.012,.068),'lip',head)
 # Cheek planes belong to the continuous face, without separate cheek discs.
 # Restrained eye proportions.
 sphere('Almond eye',(side*.145,.704,3.295),(.080,.018,.028),'white',head)
 sphere('Iris',(side*.139,.678,3.295),(.024,.007,.026),'iris',head)
 sphere('Pupil',(side*.139,.669,3.295),(.012,.005,.019),'ink',head)
 sphere('Catchlight',(side*.139-.008,.662,3.307),(.008,.004,.008),'white',head)
 o=sphere('Upper eyelid',(side*.145,.701,3.325),(.083,.013,.010),'skin',head);o.rotation_euler.y=side*.09
 brow=sphere('Defined eyebrow',(side*.146,.711,3.405),(.110,.018,.017),'hair',head);brow.rotation_euler.y=-side*.16
 sphere('Nostril wing',(side*.048,.66,3.105),(.035,.033,.027),'skin',head)
 sphere('Nostril',(side*.041,.637,3.09),(.014,.008,.009),'shadow',head)
# A continuous bridge rather than a spherical toy nose.
loft('Nose bridge',[(3.075,.038,.030,.658),(3.105,.063,.062,.662),(3.16,.047,.067,.690),(3.30,.036,.037,.720),(3.40,.022,.017,.735)],'skin',head,24)
sphere('Lower lip',(0,.704,2.97),(.087,.014,.017),'lip',head)
sphere('Mouth line',(0,.688,2.99),(.102,.008,.008),'shadow',head)
# Chin is sculpted into the continuous jaw profile.
# Swept hair with restrained sculpted locks.
sphere('Hair crown',(0,1.06,3.54),(.333,.28,.19),'hair',head)
for side in [-1,1]:sphere('Tapered sideburn',(side*.307,.968,3.37),(.031,.092,.15),'hair',head)
o=sphere('Swept quiff',(-.025,.845,3.555),(.29,.115,.075),'hair',head);o.rotation_euler.y=-.12
for i in range(2):
 o=sphere('Hair sweep',(-.055+i*.11,.80,3.565+i*.018),(.19,.07,.028),'hair',head);o.rotation_euler.y=-.15
# Pinched felt fedora, thinner brim, asymmetrical profile.
hat=cyl('Fedora brim',(0,1.025,3.68),.53,.035,'lapel',head);hat.scale.y=.79;hat.rotation_euler.y=-.07
loft('Pinched fedora',[(3.68,.34,.27,1.03),(3.73,.34,.27,1.03),(3.96,.29,.235,1.07),(4.02,.23,.19,1.07)],'coat',head)
band=cyl('Grosgrain hat band',(0,1.03,3.735),.346,.09,'hair',head);band.scale.y=.79
box('Hat ribbon buckle',(.28,.84,3.73),(.08,.015,.06),'brass',.01,head)
for side in [-1,1]:
 arm=empty('DetectiveArmL' if side<0 else 'DetectiveArmR');arm.parent=detective
 capsule('Tailored upper sleeve',(side*.56,1.,2.40),(side*.83,.49,1.96),.16,.135,'coat',arm)
 sphere('Elbow seam',(side*.83,.49,1.96),(.14,.145,.15),'coat',arm)
 capsule('Tapered forearm',(side*.83,.49,1.96),(side*.56,-.035,1.70),.134,.10,'coat',arm)
 hand('Articulated hand',(side*.55,-.20,1.69),side,arm)
# Viewer hands are independent nodes, positioned against the interactive paper at runtime.
for side in [-1,1]:
 g=hand('VisitorHandL' if side<0 else 'VisitorHandR',(0,0,0),side,None,True)
 # Local geometry designed to be viewed from above; runtime camera projection aligns the grip.
 g.hide_render=False

# Desk lamp at visitor left.
cyl('Lamp base',(-2.27,-.45,1.6),.38,.07,'brass')
rod('Lamp stem',(-2.27,-.45,1.64),(-2.27,-.45,2.5),.045,'brass')
rod('Lamp elbow',(-2.27,-.45,2.5),(-2.05,-.45,2.65),.045,'brass')
shade=sphere('LampShade',(-2.05,-.45,2.62),(.56,.29,.22),'green')
box('Lamp bulb',(-2.05,-.45,2.49),(.65,.24,.02),'light')
# CRT terminal on right. Face towards visitor, slight nostalgic geometry.
monitor=empty('Monitor')
box('Monitor foot',(1.9,.23,1.64),(.68,.54,.12),'computer',.04,monitor)
box('Monitor neck',(1.9,.38,1.91),(.15,.18,.5),'computer',.025,monitor)
box('CRT casing',(1.9,.38,2.35),(1.22,.77,1.03),'computer',.09,monitor)
box('CRT bezel',(1.9,-.023,2.38),(1.08,.065,.85),'ink',.05,monitor)
box('MonitorScreen',(1.9,-.062,2.40),(.92,.035,.66),'screen',.045,monitor)
# Screen content is drawn by the runtime Agent canvas.
sphere('Power LED',(2.34,-.07,1.97),(.027,.015,.018),'light',monitor)
box('Keyboard',(1.88,-.44,1.62),(1.2,.4,.09),'computer',.04)
for row in range(3):
 for col in range(12):box('Keyboard key',(1.36+col*.092,-.57+row*.1,1.68),(.068,.066,.02),'paper',.008)
# Compact printer on left, with receipt emerging toward user.
box('Printer',(-1.52,.6,1.88),(.95,.72,.57),'computer',.06)
box('Printer feed',(-1.52,.63,2.17),(.7,.48,.035),'ink',.01)
box('Printer output slot',(-1.52,.22,1.90),(.72,.02,.07),'ink',.008)
box('PrinterReceipt',(-1.52,-.02,1.87),(.57,.49,.012),'paper',.005)
for i in range(4):box('Receipt text',(-1.52,-.16+i*.07,1.879),(.38,.008,.004),'ink',0)
# Prop details.
cyl('Tea mug',(2.93,-.65,1.73),.16,.31,'paper')
cyl('Tea surface',(2.93,-.65,1.89),.13,.008,'hair')
bpy.ops.mesh.primitive_torus_add(major_radius=.11,minor_radius=.025,location=(3.10,-.65,1.75),rotation=(math.pi/2,0,0));apply(bpy.context.object,'Mug handle','paper')
for i in range(3):box('Case folder',(-2.65,.72,1.59+i*.055),(.65,.64,.04),['coat','paper','green'][i],.01)
cyl('Rubber stamp base',(.92,-.77,1.62),.13,.08,'hair')
sphere('Rubber stamp handle',(.92,-.77,1.79),(.08,.08,.16),'wood')
# Magnifying glass flat on desk.
bpy.ops.mesh.primitive_torus_add(major_radius=.16,minor_radius=.022,location=(-.97,-.78,1.60));apply(bpy.context.object,'Magnifier','brass')
rod('Magnifier handle',(-1.10,-.89,1.6),(-1.36,-1.12,1.6),.041,'hair')
# Plant at right and wall clock.
cyl('Plant pot',(4.12,1.8,.49),.4,.7,'coat')
for i in range(12):
 a=i*2.4;end=(4.12+math.cos(a)*.58,1.8+math.sin(a)*.43,1.3+random.random()*.65)
 rod('Plant stem',(4.12,1.8,.8),end,.015,'leaf');o=sphere('Plant leaf',end,(.16,.07,.42),'leaf');o.rotation_euler=(.4*math.cos(a),.5*math.sin(a),a)
c=cyl('Clock rim',(1.85,3.00,4.7),.33,.10,'brass');c.rotation_euler.x=math.pi/2
c=cyl('Clock face',(1.85,2.93,4.7),.29,.015,'paper');c.rotation_euler.x=math.pi/2
rod('Clock hour',(1.85,2.90,4.7),(1.70,2.90,4.82),.016,'ink')
rod('Clock minute',(1.85,2.89,4.7),(1.96,2.89,4.91),.011,'ink')
# Warm practical lighting and blue window fill.
def area(name,loc,target,color,power,size):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm key',(-3,-3,6),(0,1,2), (1,.78,.53),700,5)
area('Window blue',(-3,2.2,3.8),(0,0,1),( .44,.66,.78),450,3)
area('Portrait fill',(2,-4,4),(0,1,2.8),(1,.87,.68),350,3)
data=bpy.data.lights.new('Lamp practical','POINT');data.energy=55;data.color=(1,.65,.3);data.shadow_soft_size=.45;o=bpy.data.objects.new('Lamp practical',data);scene.collection.objects.link(o);o.location=(-2.05,-.45,2.42)
world=bpy.data.worlds.new('Bureau evening');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.12,.16,.13,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35;scene.world=world
camdata=bpy.data.cameras.new('Visitor camera');cam=bpy.data.objects.new('Visitor camera',camdata);scene.collection.objects.link(cam);cam.location=(0,-8.7,4.15);cam.rotation_euler=(Vector((0,.6,2.25))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=39;scene.camera=cam
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=ROOT+'/public/assets/bureau-preview.png'
# Convert typefaces to meshes in GLB for portability.
for o in list(scene.objects):
 if o.type=='FONT':
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets-source-v2.blend')
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type in {'MESH','EMPTY'}:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=ROOT+'/public/assets/bureau.glb',export_format='GLB',use_active_scene=True,use_selection=True,export_apply=True,export_cameras=False,export_lights=False,export_extras=True)
print(json.dumps({'scene':scene.name,'objects':len(scene.objects),'glb_bytes':os.path.getsize(ROOT+'/public/assets/bureau.glb'),'source':ROOT+'/assets-source-v2.blend'}))
