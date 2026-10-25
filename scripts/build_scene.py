"""Original procedural set for The Evidence Bureau. Run through Blender MCP.
Coordinates: Z up; visitor stands at negative Y. No external assets.
"""
import bpy, math, random, os, json
from mathutils import Vector
ROOT='/Users/ren/Desktop/Projects/THE EVIDENCE BUREAU'
random.seed(24)
scene=bpy.data.scenes.new('Evidence Bureau')
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
# Detective, all under semantic groups for browser animation.
detective=empty('Detective');head=empty('DetectiveHead');head.parent=detective
sphere('Trench coat torso',(0,1.08,2.03),(.69,.39,.71),'coat',detective)
sphere('Shirt front',(0,.72,2.22),(.27,.07,.4),'paper',detective)
for x in [-.28,.28]:
 o=box('Broad lapel',(x,.67,2.30),(.29,.07,.57),'lapel',.03,detective);o.rotation_euler.y=(-.35 if x<0 else .35)
for z in [1.80,2.04]:sphere('Coat button',(.13,.663,z),(.048,.025,.048),'brass',detective)
for x in [-.12,.12]:
 o=sphere('Bow tie',(x,.59,2.49),(.14,.06,.09),'red',detective);o.rotation_euler.y=x*2
sphere('Bow tie knot',(0,.56,2.49),(.055,.045,.055),'red',detective)
# Face: oversized rounded silhouette, expressive eyes, tiny mustache.
sphere('Head',(0,.97,3.08),(.53,.44,.59),'skin',head)
for x in [-.53,.53]:sphere('Ear',(x,.98,3.1),(.12,.09,.17),'skin',head)
sphere('Hair cap',(0,1.05,3.44),(.51,.4,.31),'hair',head)
for x in [-.52,.52]:sphere('Sideburn',(x,.9,3.26),(.055,.13,.22),'hair',head)
for x in [-.205,.205]:
 sphere('Eye white',(x,.573,3.15),(.161,.066,.18),'white',head)
 sphere('Iris',(x,.507,3.13),(.078,.025,.097),'iris',head)
 sphere('Pupil',(x,.481,3.13),(.038,.012,.061),'ink',head)
 sphere('Eye glint',(x-.017,.466,3.17),(.019,.008,.023),'white',head)
 brow=box('Eyebrow',(x,.53,3.39),(.27,.07,.055),'hair',.025,head);brow.rotation_euler.y=(-.12 if x<0 else .12)
 # spectacle rims are tori oriented toward visitor
 bpy.ops.mesh.primitive_torus_add(major_radius=.182,minor_radius=.018,major_segments=32,minor_segments=8,location=(x,.478,3.15),rotation=(math.pi/2,0,0));apply(bpy.context.object,'Round spectacles','brass',head)
rod('Spectacle bridge',(-.04,.469,3.17),(.04,.469,3.17),.017,'brass',head)
sphere('Nose',(0,.47,2.99),(.108,.13,.13),'skin',head)
for x in [-.095,.095]:
 o=sphere('Mustache',(x,.51,2.88),(.13,.045,.053),'hair',head);o.rotation_euler.y=x*2
sphere('Smile',(0,.582,2.78),(.11,.018,.028),'hair',head)
# Signature fedora.
hat=cyl('Fedora brim',(0,.96,3.63),.72,.08,'coat',head);hat.scale.y=.78
crown=cyl('Fedora crown',(0,1.0,3.87),.43,.43,'coat',head);crown.scale.y=.85
band=cyl('Fedora band',(0,1.0,3.72),.441,.105,'hair',head);band.scale.y=.85
box('Hat notch',(0,.98,4.085),(.09,.48,.025),'lapel',.015,head)
# Arms at rest, fingers around receipt area.
for side in [-1,1]:
 arm=empty('DetectiveArmL' if side<0 else 'DetectiveArmR');arm.parent=detective
 rod('Upper sleeve',(side*.56,1.0,2.28),(side*.91,.55,1.88),.19,'coat',arm)
 rod('Fore sleeve',(side*.91,.55,1.88),(side*.58,-.05,1.7),.16,'coat',arm)
 sphere('Cuff',(side*.57,-.05,1.7),(.19,.12,.11),'paper',arm)
 sphere('Hand',(side*.55,-.22,1.68),(.18,.22,.09),'skin',arm)
 for f in range(4):sphere('Finger',(side*.43+side*f*.074,-.38,1.67),(.044,.13,.047),'skin',arm)
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
text('Screen greeting','SEARCHING\nFOR THE TRUTH',(1.9,-.088,2.47),.08,'paper')
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
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/assets-source.blend')
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type in {'MESH','EMPTY'}:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=ROOT+'/public/assets/bureau.glb',export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False,export_extras=True)
print(json.dumps({'scene':scene.name,'objects':len(scene.objects),'glb_bytes':os.path.getsize(ROOT+'/public/assets/bureau.glb'),'source':ROOT+'/assets-source.blend'}))
